#!/usr/bin/env node
// deep-audit 읽기 전용 가드. deep-audit.md frontmatter의 hooks가 부른다 (그 에이전트가 도는 동안만).
//
//   node readonly-guard.mjs pre    PreToolUse: 도구·Bash 명령을 검사해 쓰기로 보이면 거부. 첫 호출 때 작업 폴더 스냅샷 저장.
//   node readonly-guard.mjs stop   Stop(=SubagentStop): 스냅샷과 비교해 바뀐 파일이 있으면 한 번 붙잡고 사용자에게 알림.
//
// - Bash는 허용 목록 방식: 아는 읽기 명령만 통과. 리다이렉트는 /dev/null·>&N만. node는 -e/-p 코드나 heredoc만, 쓰기 API가 없을 때.
// - 판단이 안 서거나 가드 안에서 오류가 나면 거부한다 (훅 오류는 Claude Code가 통과시키므로 여기서 막는다).
// - 문자열 검사라 작정하면 돌아갈 수 있다. 실수를 막는 장치이고, 놓친 것은 stop의 사후 확인이 잡는다.
// - 결정을 바꾸는 환경변수는 없다. DEEP_AUDIT_GUARD_DIR는 스냅샷 저장 위치만 바꾼다 (시험용).
// - 네트워크를 쓰지 않는다.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCAN_SECRETS = join(HARNESS, "baton", "files", "scripts", "baton", "scan-secrets.mjs");
const SNAP_DIR = process.env.DEEP_AUDIT_GUARD_DIR || join(tmpdir(), "deep-audit-guard");
const READ_TOOLS = new Set(["Read", "Grep", "Glob", "Bash"]);
const TAIL = " 읽기 전용 규칙(훅)으로 막았습니다. 쓰기나 실행으로 돌아가려 하지 말고 Read·Grep·git grep 같은 읽기 방법으로 바꾸세요. 그래도 안 되면 보고서 '참고'에 적으세요.";

// ---------- 셸 명령 해석 ----------
// 결과: cmds = [{ words, redirs: [{op, target}], stdin: [heredoc·here-string 본문] }], subs = [$( )·`` ·<( ) 안의 명령], errors
const OPS = new Set([";", "&", "|", "(", ")"]);
export function parseShell(src) {
  const cmds = [], subs = [], errors = [];
  let cur = newCmd(), pending = [], i = 0;
  function newCmd() { return { words: [], redirs: [], stdin: [] }; }
  function endCmd() { if (cur.words.length || cur.redirs.length) cmds.push(cur); cur = newCmd(); }
  const n = src.length;
  // 괄호 짝 맞춰 읽기 ($( ), <( )) — 따옴표 안의 괄호는 세지 않는다
  function readBalanced(j) {
    let depth = 1, q = null, s = "";
    for (; j < n; j++) {
      const c = src[j];
      if (q) { if (c === "\\" && q === '"') { s += c + (src[j + 1] ?? ""); j++; continue; } if (c === q) q = null; s += c; continue; }
      if (c === "'" || c === '"') { q = c; s += c; continue; }
      if (c === "\\") { s += c + (src[j + 1] ?? ""); j++; continue; }
      if (c === "(") depth++;
      if (c === ")" && --depth === 0) return [s, j + 1];
      s += c;
    }
    errors.push("괄호가 닫히지 않음");
    return [s, n];
  }
  function readBacktick(j) {
    let s = "";
    for (; j < n; j++) {
      if (src[j] === "\\") { s += src[j + 1] ?? ""; j++; continue; }
      if (src[j] === "`") return [s, j + 1];
      s += src[j];
    }
    errors.push("` 가 닫히지 않음");
    return [s, n];
  }
  // 단어 하나 읽기. 치환($( ), ``)은 subs로 빼고 단어에는 표시(\0)만 남긴다.
  function readWord(j) {
    let w = "", any = false;
    while (j < n) {
      const c = src[j];
      if (c === " " || c === "\t" || c === "\n" || OPS.has(c) || c === "<" || c === ">") break;
      any = true;
      if (c === "'") {
        const k = src.indexOf("'", j + 1);
        if (k < 0) { errors.push("' 가 닫히지 않음"); w += src.slice(j + 1); j = n; break; }
        w += src.slice(j + 1, k); j = k + 1; continue;
      }
      if (c === '"') {
        j++;
        while (j < n && src[j] !== '"') {
          if (src[j] === "\\") { w += src[j + 1] ?? ""; j += 2; continue; }
          if (src[j] === "$" && src[j + 1] === "(" && src[j + 2] !== "(") { const [s, k] = readBalanced(j + 2); subs.push(s); w += "\0"; j = k; continue; }
          if (src[j] === "`") { const [s, k] = readBacktick(j + 1); subs.push(s); w += "\0"; j = k; continue; }
          w += src[j++];
        }
        if (j >= n) errors.push('" 가 닫히지 않음');
        j++; continue;
      }
      if (c === "\\") { if (src[j + 1] !== "\n") w += src[j + 1] ?? ""; j += 2; continue; }
      if (c === "$" && src[j + 1] === "(" && src[j + 2] === "(") { // $(( 산술 ))
        const k = src.indexOf("))", j + 3); w += src.slice(j, k < 0 ? n : k + 2); j = k < 0 ? n : k + 2; continue;
      }
      if (c === "$" && src[j + 1] === "(") { const [s, k] = readBalanced(j + 2); subs.push(s); w += "\0"; j = k; continue; }
      if (c === "`") { const [s, k] = readBacktick(j + 1); subs.push(s); w += "\0"; j = k; continue; }
      w += c; j++;
    }
    return [any ? w : null, j];
  }
  function skipBlanks(j) { while (j < n && (src[j] === " " || src[j] === "\t")) j++; return j; }

  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (c === "\n") {
      endCmd(); i++;
      // 이 줄에서 시작한 heredoc 본문 읽기
      for (const h of pending) {
        const lines = [];
        let found = false;
        while (i < n) {
          let e = src.indexOf("\n", i); if (e < 0) e = n;
          let line = src.slice(i, e).replace(/\r$/, "");
          i = e + 1;
          if ((h.strip ? line.replace(/^\t+/, "") : line) === h.delim) { found = true; break; }
          lines.push(line);
        }
        if (!found) errors.push(`heredoc ${h.delim} 끝 표시를 못 찾음`);
        h.cmd.stdin.push(lines.join("\n"));
      }
      pending = [];
      continue;
    }
    if (c === "#" ) { const e = src.indexOf("\n", i); i = e < 0 ? n : e; continue; }
    if (c === ";" || c === "(" || c === ")") { endCmd(); i++; continue; }
    if (c === "&" && src[i + 1] !== ">") { endCmd(); i += src[i + 1] === "&" ? 2 : 1; continue; }
    if (c === "|") { endCmd(); i += src[i + 1] === "|" || src[i + 1] === "&" ? 2 : 1; continue; }
    if (c === "<" && src[i + 1] === "(") { const [s, k] = readBalanced(i + 2); subs.push(s); cur.words.push("\0"); i = k; continue; }
    if (c === ">" && src[i + 1] === "(") { errors.push(">( ) 프로세스 치환"); const [, k] = readBalanced(i + 2); i = k; continue; }
    if (c === "<" || c === ">" || (c === "&" && src[i + 1] === ">")) {
      let op = "";
      for (const o of ["&>>", "&>", "<<<", "<<-", "<<", "<>", ">>", ">&", ">|", "<&", ">", "<"]) {
        if (src.startsWith(o, i)) { op = o; break; }
      }
      i = skipBlanks(i + op.length);
      const [t, k] = readWord(i); i = k;
      if (t === null) { errors.push(`${op} 뒤 대상이 없음`); continue; }
      if (op === "<<" || op === "<<-") { pending.push({ delim: t, strip: op === "<<-", cmd: cur }); continue; }
      if (op === "<<<") { cur.stdin.push(t); continue; }
      cur.redirs.push({ op, target: t });
      continue;
    }
    const [w, k] = readWord(i);
    i = k;
    if (w === null) { i++; continue; }
    // 2>/dev/null 같은 fd 번호: 단어가 숫자뿐이고 바로 뒤가 < > 이면 리다이렉트의 일부
    if (/^\d+$/.test(w) && (src[i] === ">" || src[i] === "<")) continue;
    cur.words.push(w);
  }
  endCmd();
  for (const h of pending) { errors.push(`heredoc ${h.delim} 본문이 없음`); }
  return { cmds, subs, errors };
}

// ---------- 명령 판정 ----------
const PLAIN = new Set(["grep", "egrep", "fgrep", "ls", "wc", "head", "tail", "cat", "cut", "tr", "diff", "stat", "du",
  "pwd", "basename", "dirname", "realpath", "echo", "printf", "test", "[", "true", "false", "cd", "which", "nl", "read"]);
const SKIP_HEAD = new Set(["!", "then", "else", "elif", "do", "if", "while", "until", "{", "time"]);
const END_WORDS = new Set(["fi", "done", "}"]);
const GIT_SUB = new Set(["diff", "grep", "ls-files", "log", "show", "status", "symbolic-ref", "rev-parse", "blame", "ls-tree",
  "cat-file", "rev-list", "merge-base", "describe", "shortlog", "branch", "config"]);
const GIT_BRANCH_WRITE = /^(-d|-D|-m|-M|-c|-C|-f|-u|--delete|--move|--copy|--force|--set-upstream-to.*|--unset-upstream|--edit-description|--track.*|--no-track)$/;
const FIND_WRITE = new Set(["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"]);

const base = (w) => w.replace(/\\/g, "/").split("/").pop().replace(/\.exe$/i, "").toLowerCase();

// 경로 비교용: ~, $HOME, /c/..., 역슬래시를 맞춘다
function normPath(p) {
  let s = p.replace(/\\/g, "/");
  const home = homedir().replace(/\\/g, "/");
  s = s.replace(/^~(?=\/)/, home).replace(/^\$\{?HOME\}?(?=\/)/, home);
  if (process.platform === "win32") s = s.replace(/^\/([a-zA-Z])\//, (_, d) => `${d}:/`);
  s = resolve(s).replace(/\\/g, "/");
  return process.platform === "win32" ? s.toLowerCase() : s;
}

// 이름이 흔치 않은 모듈은 문자열만 있어도, 흔한 낱말('module', 'https' 등)인 모듈은 require·import·from 뒤나 node: 이름일 때만 막는다
const RARE_MODULES = "child_process|worker_threads|http2|dgram|inspector|fs/promises";
const COMMON_MODULES = "vm|net|http|https|tls|cluster|module|repl";
const NODE_DENY = [
  [/\b(writeFile|appendFile|createWriteStream|mkdir|mkdtemp|rmdir|unlink|rename|copyFile|symlink|truncate|ftruncate|chmod|chown|lchown|lchmod|utimes|lutimes|futimes)(Sync)?\b/, "파일 쓰기 함수"],
  [/\b(cp|rm|link)Sync\b|\.\s*(rm|cp|link)\s*\(/, "파일 쓰기 함수"],
  [/\bopen(Sync)?\s*\([^)]*['"`]\s*[wa]/, "쓰기 모드로 파일 열기"],
  [/\bO_(WRONLY|RDWR|CREAT|APPEND|TRUNC)\b/, "쓰기 모드로 파일 열기"],
  [new RegExp(`['"\`](node:)?(${RARE_MODULES})['"\`]|['"\`]node:(${COMMON_MODULES})['"\`]`), "명령 실행·네트워크·쓰기 모듈"],
  [new RegExp(`(\\brequire\\s*\\(\\s*|\\bfrom\\s*|\\bimport\\s*)['"\`](${COMMON_MODULES})['"\`]`), "명령 실행·네트워크 모듈"],
  [/\b(eval|Function)\s*\(/, "문자열을 코드로 실행"],
  [/\bimport\s*\(/, "동적 import"],
  [/\brequire\s*\(\s*[^'"\s]/, "이름이 정해지지 않은 require"],
  [/\bprocess\s*\.\s*(binding|dlopen|kill|chdir|_linkedBinding)\b/, "process 내부 기능"],
  [/\bfetch\s*\(/, "네트워크"],
  [/\bglobalThis\s*\[/, "이름을 숨긴 접근"],
];
function checkNodeCode(code) {
  for (const [re, why] of NODE_DENY) if (re.test(code)) return `node 코드에 ${why}가 있음 (${(code.match(re) || [""])[0].trim()})`;
  return null;
}

function checkNode(args, stdin) {
  let code = null, fromStdin = false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === "-e" || a === "--eval" || a === "-p" || a === "--print") {
      if (k + 1 >= args.length) return "node -e 뒤 코드가 없음";
      code = args[k + 1]; break;
    }
    if (/^--(eval|print)=/.test(a)) { code = a.replace(/^--\w+=/, ""); break; }
    if (a === "-v" || a === "--version") return null;
    if (a === "-") { fromStdin = true; break; }
    if (/^--(input-type=\w+|no-warnings|max-old-space-size=\d+)$/.test(a)) continue;
    if (a.startsWith("-")) return `node 옵션 ${a}는 허용 목록에 없음`;
    // 스크립트 파일: harness 원본 scan-secrets만
    if (!a.includes("\0") && normPath(a) === normPath(SCAN_SECRETS) && args.slice(k + 1).every((x) => x === "--strict")) return null;
    return `node로 파일(${a})을 실행하는 것은 harness의 scan-secrets.mjs만 허용 (대상 코드 실행 금지)`;
  }
  if (code !== null) return code.includes("\0") ? "node 코드 안에 명령 치환이 있음" : checkNodeCode(code);
  // node - 또는 인자 없는 node: 코드는 heredoc·here-string으로만
  if (!stdin.length) return fromStdin ? "node - 는 heredoc(<<'EOF')으로만 허용 (파이프로 코드를 넘기지 않음)" : "인자 없는 node";
  for (const s of stdin) { const r = checkNodeCode(s); if (r) return r; }
  return null;
}

function checkGit(args) {
  let k = 0;
  while (k < args.length && args[k].startsWith("-")) {
    const a = args[k];
    if (a === "-C") { k += 2; continue; }
    if (a === "--no-pager" || a === "-P" || a === "--literal-pathspecs" || a === "--no-optional-locks") { k++; continue; }
    return `git 옵션 ${a}는 허용 목록에 없음`;
  }
  const sub = args[k], rest = args.slice(k + 1);
  if (!sub) return null;
  if (!GIT_SUB.has(sub)) return `git ${sub}는 읽기 명령 목록에 없음`;
  for (const a of rest) {
    if (/^--output(=|$)/.test(a)) return `git ${sub} --output은 파일을 씀`;
    if (/^--(ext-diff|open-files-in-pager)/.test(a) || (sub === "grep" && /^-O/.test(a))) return `git ${sub} ${a}는 다른 프로그램을 실행함`;
  }
  if (sub === "branch") {
    const listing = rest.some((a) => /^(-l|--list|-a|--all|-r|--remotes|--contains|--no-contains|--merged|--no-merged|--points-at|--show-current)$/.test(a));
    for (const a of rest) {
      if (GIT_BRANCH_WRITE.test(a)) return `git branch ${a}는 브랜치를 바꿈`;
      if (!a.startsWith("-") && !listing) return "git branch <이름>은 브랜치를 만듦";
    }
  }
  if (sub === "config" && !rest.some((a) => /^(--get|--get-all|--get-regexp|--list|-l)$/.test(a))) return "git config는 --get·--list로 읽기만";
  if (sub === "symbolic-ref" && rest.filter((a) => !a.startsWith("-")).length > 1) return "git symbolic-ref <이름> <대상>은 값을 바꿈";
  return null;
}

function checkCmd(words, redirs, stdin) {
  for (const r of redirs) {
    if (r.op === ">&" || r.op === "<&") { if (/^(\d+|-)$/.test(r.target)) continue; return `리다이렉트 ${r.op}${r.target}`; }
    if (r.op === "<") continue;
    if ((r.op === ">" || r.op === ">>" || r.op === ">|" || r.op === "&>" || r.op === "&>>") && r.target === "/dev/null") continue;
    return `파일로 쓰는 리다이렉트 (${r.op} ${r.target})`;
  }
  let w = words.slice();
  // 앞의 키워드(while, do …)와 환경변수 지정(LC_ALL=C, IFS=)을 번갈아 걷어낸다
  for (;;) {
    if (w.length && SKIP_HEAD.has(w[0])) { w.shift(); continue; }
    if (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) {
      if (!/^(LC_[A-Z]+|LANG|IFS)=/.test(w[0])) return `환경변수 지정(${w[0].split("=")[0]})은 허용 목록에 없음`;
      w.shift(); continue;
    }
    break;
  }
  if (!w.length || (w.length === 1 && END_WORDS.has(w[0]))) return null;
  if (w[0] === "for") return null; // for x in ...; 본문은 다음 명령으로 따로 검사됨
  if (w[0].includes("\0") || w[0].includes("$")) return "변수나 명령 치환을 명령 이름으로 쓸 수 없음";
  const name = base(w[0]), args = w.slice(1);
  if (PLAIN.has(name)) {
    if (name === "file" && args.some((a) => a === "-C" || a === "--compile")) return "file -C는 파일을 만듦";
    return null;
  }
  if (name === "rg") return args.some((a) => /^--pre(=|$)/.test(a)) ? "rg --pre는 다른 프로그램을 실행함" : null;
  if (name === "find") {
    const bad = args.find((a) => FIND_WRITE.has(a));
    return bad ? `find ${bad}는 파일을 지우거나 쓰거나 명령을 실행함` : null;
  }
  if (name === "sed") { // 줄 범위·패턴 출력(sed -n 10,20p)만. w·e 명령이나 -i는 파일을 쓰거나 명령을 실행함
    const scripts = [];
    let quiet = false;
    for (let k = 0; k < args.length; k++) {
      if (args[k] === "-n" || args[k] === "--quiet" || args[k] === "--silent") quiet = true;
      else if (args[k] === "-e" || args[k] === "--expression") scripts.push(args[++k] ?? "");
      else if (args[k].startsWith("-")) return `sed ${args[k]}는 허용 목록에 없음 (sed -n '10,20p'만)`;
      else if (!scripts.length) scripts.push(args[k]);
    }
    const PRINT = /^((\d+|\$|\/[^/\\]*\/)(,(\d+|\$|\/[^/\\]*\/))?p)(;\s*(\d+|\$|\/[^/\\]*\/)(,(\d+|\$|\/[^/\\]*\/))?p)*$/;
    return quiet && scripts.length && scripts.every((s) => PRINT.test(s.trim())) ? null : "sed는 줄 범위 출력(sed -n '10,20p')만 허용";
  }
  if (name === "sort") return args.some((a) => /^(-o|--output)/.test(a)) ? "sort -o는 파일을 씀" : null;
  if (name === "uniq") return args.filter((a) => !a.startsWith("-")).length > 1 ? "uniq <입력> <출력>은 파일을 씀" : null;
  if (name === "git") return checkGit(args);
  if (name === "node") return checkNode(args, stdin);
  if (name === "xargs") {
    let k = 0;
    while (k < args.length && args[k].startsWith("-")) k += /^-[nIdPLEsa]$/.test(args[k]) ? 2 : 1;
    return k < args.length ? checkCmd(args.slice(k), [], []) : null;
  }
  return `${name}는 읽기 명령 허용 목록에 없음`;
}

export function checkBash(command, depth = 0) {
  if (typeof command !== "string" || !command.trim()) return "빈 명령";
  if (depth > 8) return "치환이 너무 깊음";
  const { cmds, subs, errors } = parseShell(command);
  if (errors.length) return `명령을 해석할 수 없음: ${errors[0]}`;
  for (const c of cmds) { const r = checkCmd(c.words, c.redirs, c.stdin); if (r) return r; }
  for (const s of subs) { const r = checkBash(s, depth + 1); if (r) return `치환 안: ${r}`; }
  return null;
}

// ---------- 스냅샷 ----------
const SKIP_DIRS = new Set([".git", "node_modules", "Library", "Temp", "obj", ".next", ".venv", "venv", "__pycache__"]);
const MAX_FILES = 20000, MAX_HASH = 5 * 1024 * 1024;

function gitOut(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
}
function tryGitOut(cwd, ...args) { try { return gitOut(cwd, ...args); } catch { return null; } }
function fileSig(p) {
  try {
    const st = statSync(p);
    if (!st.isFile()) return "dir";
    if (st.size > MAX_HASH) return `size:${st.size}:${st.mtimeMs}`;
    return createHash("sha1").update(readFileSync(p)).digest("hex");
  } catch { return "missing"; }
}

export function snapshot(cwd) {
  const root = tryGitOut(cwd, "rev-parse", "--show-toplevel");
  if (root !== null) {
    const top = root.trim();
    const status = gitOut(top, "status", "--porcelain=v1", "-z", "--untracked-files=all");
    const parts = status.split("\0").filter(Boolean);
    const files = {};
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k].slice(3);
      if (parts[k][0] === "R" || parts[k][0] === "C") k++; // 이름 바꿈: 다음 칸은 옛 이름
      if (Object.keys(files).length < MAX_FILES) files[p] = fileSig(join(top, p));
    }
    return {
      kind: "git", root: top,
      head: (tryGitOut(top, "rev-parse", "HEAD") || "").trim(),
      branch: (tryGitOut(top, "symbolic-ref", "--short", "-q", "HEAD") || "").trim(),
      files,
    };
  }
  const files = {};
  let count = 0;
  const walk = (d, rel) => {
    let es = [];
    try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (count >= MAX_FILES) return;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(d, e.name), r); continue; }
      try { const st = statSync(join(d, e.name)); files[r] = `${st.size}:${st.mtimeMs}`; count++; } catch { /* 사라짐 */ }
    }
  };
  walk(cwd, "");
  return { kind: "dir", root: cwd, files, capped: count >= MAX_FILES };
}

export function compare(a, b) {
  const out = [];
  if (a.kind === "git" && b.kind === "git") {
    if (a.head !== b.head) out.push(`HEAD 커밋 바뀜 (${a.head.slice(0, 7) || "없음"} → ${b.head.slice(0, 7) || "없음"})`);
    if (a.branch !== b.branch) out.push(`브랜치 바뀜 (${a.branch || "없음"} → ${b.branch || "없음"})`);
  } else if (a.kind !== b.kind) out.push("Git 저장소 여부가 바뀜");
  const keys = new Set([...Object.keys(a.files), ...Object.keys(b.files)]);
  for (const k of [...keys].sort()) {
    if (!(k in a.files)) out.push(`${k} (새로 생김/바뀜)`);
    else if (!(k in b.files)) out.push(`${k} (원래대로 돌아감/지워짐)`);
    else if (a.files[k] !== b.files[k]) out.push(`${k} (내용 바뀜)`);
  }
  return out;
}

const snapPath = (id) => join(SNAP_DIR, `${String(id).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "unknown"}.json`);

// ---------- 훅 입출력 ----------
function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `${reason}.${TAIL}` },
  }) + "\n");
}

function pre(input) {
  const id = input.agent_id || input.session_id || "unknown";
  const cwd = input.cwd || process.cwd();
  const sp = snapPath(id);
  if (!existsSync(sp)) {
    mkdirSync(SNAP_DIR, { recursive: true });
    writeFileSync(sp, JSON.stringify({ snap: snapshot(cwd), warned: false }));
  }
  const tool = input.tool_name;
  if (!READ_TOOLS.has(tool)) return deny(`${tool} 도구는 deep-audit에서 쓸 수 없음 (Read·Grep·Glob·Bash만)`);
  if (tool === "Bash") {
    const r = checkBash(input.tool_input?.command);
    if (r) return deny(r);
  }
}

function stop(input) {
  const id = input.agent_id || input.session_id || "unknown";
  const sp = snapPath(id);
  if (!existsSync(sp)) return;
  const saved = JSON.parse(readFileSync(sp, "utf8"));
  if (saved.warned) { rmSync(sp, { force: true }); return; }
  const diff = compare(saved.snap, snapshot(saved.snap.root));
  if (!diff.length) { rmSync(sp, { force: true }); return; }
  writeFileSync(sp, JSON.stringify({ ...saved, warned: true }));
  const list = diff.slice(0, 10).join(", ") + (diff.length > 10 ? ` 외 ${diff.length - 10}개` : "");
  const msg = `정밀 점검 중 작업 폴더가 바뀌었습니다: ${list}. 점검 담당이 쓴 것인지, 같은 시간에 다른 작업이 고친 것인지 확인하세요.`;
  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: `${msg} 되돌리려 하지 말고, 보고서 맨 위에 "[경고] 점검 중 작업 폴더가 바뀜: <파일 목록>" 한 줄을 넣고 끝내세요.`,
    systemMessage: `[deep-audit 사후 확인] ${msg}`,
  }) + "\n");
}

function main() {
  const mode = process.argv[2];
  let raw = "";
  try { raw = readFileSync(0, "utf8"); } catch { /* stdin 없음 */ }
  if (mode === "pre") {
    try { pre(JSON.parse(raw)); } catch (e) { deny(`읽기 전용 가드 오류로 막음 (${String(e?.message || e).slice(0, 120)})`); }
    return;
  }
  if (mode === "stop") {
    try { stop(JSON.parse(raw)); } catch (e) {
      process.stdout.write(JSON.stringify({ systemMessage: `[deep-audit 사후 확인] 확인 실패: ${String(e?.message || e).slice(0, 120)}. git status로 직접 확인하세요.` }) + "\n");
    }
    return;
  }
  process.stderr.write("사용법: readonly-guard.mjs pre|stop (훅 입력 JSON을 stdin으로)\n");
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
