#!/usr/bin/env node
// baton 일괄 점검·업데이트. ~/harness에서만 실행한다 (프로젝트에 복사하지 않음).
//
//   node baton/sync.mjs                 점검만: baton이 설치된 프로젝트와 최신 여부를 보여준다
//   node baton/sync.mjs --apply 1,3     고른 번호의 프로젝트를 업데이트 (--apply all 은 전부)
//   node baton/sync.mjs --apply <폴더 이름이나 경로>,...   번호 대신 이름으로 (에이전트는 이쪽을 쓴다)
//   node baton/sync.mjs <폴더> ...       세션 기록에 없는 폴더를 후보에 더한다
//   node baton/sync.mjs --scan <폴더>     그 폴더 아래에서 baton 프로젝트를 찾는다 (찾은 건 목록에 기억)
//   node baton/sync.mjs --apply <경로> --decide AGENTS.md=keep,scripts/baton/check-active.mjs=replace
//                                         확인이 필요한 파일의 처리를 정해 같은 baton-update 브랜치에 이어서 커밋
//   node baton/sync.mjs --merge <경로|번호|all> [--accept-dropped]
//                                         보존 확인 후 baton-update를 기본 브랜치에 합침 (사용자 승인 후에만). push는 안 함
//
// 프로젝트 찾기: Claude Code·Codex 세션 기록에 남은 작업 폴더 + baton/projects.local.txt(한 줄에 폴더 하나) + 인자.
//   디스크 전체를 뒤지지 않는다. 세션 기록에서는 폴더 경로만 읽는다.
//   작업 폴더의 AGENTS.md에 baton 표시가 없어도 로컬 브랜치(기본 브랜치, baton-update, task/*)에 있으면 찾는다
//   (baton 이전 브랜치에 체크아웃돼 있거나 설치 브랜치를 아직 안 합친 경우). 경로로 직접 준 폴더를 못 찾으면 이유를 알린다.
//   기록 속 폴더가 없어졌으면(옮겼거나 지움) [멈춤]으로 묻는다. 옮긴 곳 후보로 같은 위치·한 단계 위·아래의 같은 이름 baton 프로젝트를
//   보여 줄 뿐 스스로 넣지 않는다. 답은 새 경로를 인자로 주고, 옛 경로는 --forget <경로|all>로 목록에 "!경로"로 기록(다시 안 물음).
// 업데이트 방식: 각 프로젝트의 기본 브랜치(main 등)를 바탕으로 `baton-update` 브랜치에 커밋 하나를 만든다.
//   Git 내부 명령으로 커밋을 직접 만들기 때문에 작업 폴더, 현재 브랜치, 커밋 안 된 변경은 전혀 건드리지 않는다.
//   main에 합치는 건 사용자가 한다. 네트워크(push 포함)를 쓰지 않는다.
// 바꾸는 파일: scripts/baton/, task-* 명령, baton-verifier, docs/baton/, tasks/_TEMPLATE.md, .codex/hooks.json(없을 때만), .gitignore(빠진 개인 설정 줄만 끝에 추가, 예전에 baton이 중복으로 붙인 블록은 하나로).
//   AGENTS.md·CLAUDE.md는 <!-- baton:start --> ~ <!-- baton:end --> 블록 안만 바꾼다(blocks.mjs). 블록 밖은 그대로.
//   옛 형식(블록 이전) 설치는 블록 방식으로 전환하고, 루트 STATUS.md(baton 양식)는 내용 그대로 tasks/STATUS.md로 옮긴다.
// 건너뛰는 경우: 기본 브랜치에 baton이 아직 안 합쳐짐, baton-update 브랜치가 이미 있음, Git 없음.
//   파일 단위로는: 사용자가 직접 쓴 줄(baton 원본의 어느 과거·현재 버전에도 없는 줄, known.mjs)이 하나라도 있으면
//   그 파일은 덮어쓰지 않고 건너뛴다. 블록 표시가 깨졌거나 블록 안에 직접 쓴 줄이 있어도 건너뛴다.
//   Node 없이 설치된 곳엔 스크립트를 넣지 않는다. tasks/STATUS.md 내용, tasks/ACTIVE.md, archive, settings.json은 쓰지 않는다.
//   예외: .claude/settings.json에 예전 baton의 상대 경로 훅 명령과 글자까지 같은 값이 있으면 그 값만 지금 명령으로 바꾼다.
//   Codex 훅(.codex/hooks.json)은 없을 때만 새로 넣는다(스크립트가 있는 설치). 있으면 내용이 달라도 쓰지 않고 알리기만 한다.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, openSync, readSync, closeSync, rmSync, mkdtempSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { HARNESS, KIT, userLines } from "./known.mjs";
import { planBlock, isBatonStatus, hasOriginalStatusSection, splitStatus } from "./blocks.mjs";

const MARK = /<!--\s*baton\s+v\d+\s*-->/;
// 실제 경로로 맞춘다: Windows의 짧은 이름(C:\\Users\\RUNNER~1)과 Git이 돌려주는 긴 이름을 같게 비교하기 위해
const real = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };
const BRANCH = "baton-update";
const PERSONAL = [".claude/settings.local.json", "CLAUDE.local.md", ".claude/worktrees/"];
const GI_HEAD = "# 개인 설정 (Git에 올리지 않음)";
const normIg = (l) => l.trim().replace(/^\//, "").replace(/\/$/, "");
const PERSONAL_NORM = new Set(PERSONAL.map(normIg));
// baton이 붙인 개인 설정 블록(머리줄 + 개인 설정 줄)이 두 번째부터 앞에 이미 있는 줄만 담고 있으면 지운다(바로 앞 빈 줄 포함).
function dedupeGitignore(text) {
  const src = text.split("\n");
  const out = [];
  let headers = 0;
  let removed = 0;
  for (let i = 0; i < src.length;) {
    if (src[i].trim() === GI_HEAD) {
      let j = i + 1;
      while (j < src.length && PERSONAL_NORM.has(normIg(src[j]))) j++;
      const block = src.slice(i + 1, j);
      const before = new Set(out.map(normIg));
      if (headers++ > 0 && block.length && block.every((l) => before.has(normIg(l)))) {
        if (out.length && out[out.length - 1].trim() === "") out.pop();
        removed++;
        i = j;
        continue;
      }
    }
    out.push(src[i]);
    i++;
  }
  return { text: out.join("\n"), removed };
}

// raw: 출력을 그대로 돌려준다 (파일 내용 비교용). 아니면 끝 줄바꿈 하나를 뗀다.
function git(cwd, args, opts = {}, raw = false) {
  try {
    const o = execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts });
    return raw ? o : o.replace(/\n$/, "");
  } catch {
    return null;
  }
}
const lf = (s) => s.replace(/\r\n/g, "\n");
const isWin = process.platform === "win32";
const key = (p) => (isWin ? resolve(p).toLowerCase() : resolve(p));
// 같은 폴더인지 (Windows 짧은 이름·링크 경로가 달라도)
const rkey = (p) => key(real(p));
const samePath = (a, b) => key(a) === key(b) || rkey(a) === rkey(b);

// ---------- 1. 후보 폴더 모으기 ----------
function head(file, bytes = 65536) {
  try {
    const fd = openSync(file, "r");
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, 0);
    closeSync(fd);
    return buf.subarray(0, n).toString("utf8");
  } catch {
    return "";
  }
}
// 앞부분 원문에서 "cwd" 값을 정규식으로 꺼낸다. 줄 단위 JSON.parse는 첫 줄이 길면(이미지 붙여넣기,
// Codex session_meta에 통째로 들어간 AGENTS.md 등) 잘린 줄이라 실패하므로 쓰지 않는다. cwd는 줄 앞쪽에 있다.
function cwdIn(text) {
  const m = text.match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  try { return JSON.parse(`"${m[1]}"`) || null; } catch { return null; }
}
function* walk(dir, depth = 0) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory() && depth < 4) yield* walk(p, depth + 1);
    else if (e.isFile()) yield p;
  }
}
const candidates = new Set();
const claudeBase = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");
if (existsSync(claudeBase)) {
  for (const d of readdirSync(claudeBase)) {
    let files = [];
    try { files = readdirSync(join(claudeBase, d)).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
    for (const f of files) { // 폴더 하나는 작업 폴더 하나. 경로가 나오면 그만 읽는다
      const c = cwdIn(head(join(claudeBase, d, f)));
      if (c) { candidates.add(c); break; }
    }
  }
}
const codexBase = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "sessions");
for (const f of walk(codexBase)) {
  if (/rollout-.*\.jsonl$/.test(f)) {
    const c = cwdIn(head(f));
    if (c) candidates.add(c);
  }
}
// 한 번 찾은 프로젝트 목록 (컴퓨터마다 다름, gitignore). 세션 기록은 오래되면 지워지므로(Claude 기본 30일) 여기에 기억한다.
const listFile = process.env.BATON_PROJECTS_FILE || join(HARNESS, "baton", "projects.local.txt"); // 시험 때 격리용
const expand = (p) => p.replace(/^~(?=$|[\\/])/, homedir());
const listed = [];
const forgotten = []; // "!경로" 줄: 없어진 걸 확인했으니 다시 묻지 않을 폴더 (--forget으로 기록)
if (existsSync(listFile)) {
  for (const l of readFileSync(listFile, "utf8").split(/\r?\n/)) {
    const p = l.replace(/#.*/, "").trim();
    if (p.startsWith("!")) { if (p.slice(1).trim()) forgotten.push(resolve(expand(p.slice(1).trim()))); }
    else if (p) { listed.push(expand(p)); candidates.add(expand(p)); }
  }
}
const args = process.argv.slice(2);
// --scan <폴더>: 사용자가 정한 폴더 아래에서 baton 표시가 있는 AGENTS.md를 찾는다 (디스크 전체는 안 뒤짐)
const SKIP_DIRS = new Set(["node_modules", ".git", "Library", "Temp", "Logs", "obj", "bin", "build", "Build", "Builds", "dist", "out",
  ".venv", "venv", "env", "__pycache__", ".next", ".nuxt", "target", "Packages", ".gradle", ".idea", ".vs", "vendor"]);
const scanned = [];
function scanDir(dir, depth = 0) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  if (entries.some((e) => e.isFile() && e.name === "AGENTS.md") && MARK.test(head(join(dir, "AGENTS.md"), 4096))) {
    scanned.push(dir);
    return; // baton 프로젝트 안쪽은 더 내려가지 않는다
  }
  // 작업 폴더엔 baton이 안 보여도 로컬 브랜치(main, task/*)에 있으면 찾는다
  if (entries.some((e) => e.name === ".git")) {
    const b = branchProject(dir);
    if (b) { scanned.push(b.root); return; }
  }
  if (depth >= 6) return;
  for (const e of entries) if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) scanDir(join(dir, e.name), depth + 1);
}
const scanIdx = args.indexOf("--scan");
if (scanIdx >= 0) {
  const target = args[scanIdx + 1] ? resolve(expand(args[scanIdx + 1])) : null;
  if (!target || !existsSync(target)) { console.log("사용법: node baton/sync.mjs --scan <찾을 폴더>  (예: --scan ~/Desktop)"); process.exit(2); }
  scanDir(target);
  scanned.forEach((d) => candidates.add(d));
}
const applyIdx = args.indexOf("--apply");
const applyArg = applyIdx >= 0 ? (args[applyIdx + 1] || "") : null;
const valueOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? i + 1 : -1; };
args.forEach((a, i) => {
  if (a.startsWith("--") || [applyIdx >= 0 ? applyIdx + 1 : -1, scanIdx >= 0 ? scanIdx + 1 : -1, valueOf("--decide"), valueOf("--merge"), valueOf("--forget")].includes(i)) return;
  candidates.add(resolve(a));
});
// --apply·--merge에 경로로 준 폴더도 후보에 넣는다 (세션 기록에 없는 폴더를 경로로 바로 고를 수 있게)
const mergeIdx = args.indexOf("--merge");
const mergeArg = mergeIdx >= 0 ? (args[mergeIdx + 1] || "") : null;
for (const v of [applyArg, mergeArg]) {
  if (!v) continue;
  for (const t of v.split(",").map((x) => x.trim())) {
    if (t && /[\\/]|^~/.test(t)) candidates.add(resolve(t.replace(/^~(?=$|[\\/])/, homedir())));
  }
}

// 후보 폴더에서 위로 올라가며 baton 표시가 있는 AGENTS.md를 찾는다 (하위 폴더에서 작업했어도 찾도록)
function batonRootOf(dir) {
  let d = resolve(dir);
  while (true) {
    const a = join(d, "AGENTS.md");
    if (existsSync(a) && MARK.test(head(a, 4096))) return d;
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}
// 작업 폴더에는 baton이 안 보이지만(baton 이전 브랜치에 체크아웃, 또는 설치 브랜치를 아직 안 합침) 로컬 브랜치에는 있는 경우.
// 기본 브랜치·baton-update·task/* 브랜치의 AGENTS.md를 지금 폴더부터 저장소 최상위까지 올라가며 본다. 파일은 읽기만 한다.
function branchProject(dir) {
  const top = git(dir, ["rev-parse", "--show-toplevel"]);
  if (!top) return null;
  const topReal = real(top);
  const rel = relative(topReal, real(dir));
  if (rel.startsWith("..")) return null;
  const parts = rel ? rel.split(sep) : [];
  const base = defaultBranch(top);
  const heads = (git(top, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]) || "").split("\n").filter(Boolean)
    .filter((b) => b === base || b === BRANCH || b.startsWith("task/"))
    .sort((a, b) => (a === base ? -1 : b === base ? 1 : 0));
  for (let n = parts.length; n >= 0; n--) {
    const pre = parts.slice(0, n).join("/");
    const hits = heads.filter((b) => {
      const t = git(top, ["show", `${b}:${pre ? pre + "/" : ""}AGENTS.md`], {}, true);
      return t !== null && MARK.test(t.slice(0, 4096));
    });
    if (hits.length) {
      return { root: resolve(dir, ...Array(parts.length - n).fill("..")), branches: hits, onBase: hits.includes(base), current: git(top, ["branch", "--show-current"]) || "(브랜치 아님)" };
    }
  }
  return null;
}
const findProject = (dir) => { const r = batonRootOf(dir); return r ? { root: r } : branchProject(dir); };
const roots = new Map();
const viaBranch = new Map(); // key(root) → 브랜치에서 찾은 정보
const explicit = new Set(); // 사용자가 경로로 직접 준 폴더 (못 찾으면 이유를 알린다)
args.forEach((a, i) => {
  if (a.startsWith("--") || [applyIdx >= 0 ? applyIdx + 1 : -1, scanIdx >= 0 ? scanIdx + 1 : -1, valueOf("--decide"), valueOf("--merge"), valueOf("--forget")].includes(i)) return;
  explicit.add(resolve(a));
});
for (const v of [applyArg, mergeArg]) {
  if (!v) continue;
  for (const t of v.split(",").map((x) => x.trim())) if (t && /[\\/]|^~/.test(t)) explicit.add(resolve(t.replace(/^~(?=$|[\\/])/, homedir())));
}
const notFound = [];
const vanished = []; // 세션 기록·목록에 있지만 지금은 없는 폴더 (위로 올라가도 baton 프로젝트가 아님)
function addRoot(f) {
  const r = f.root;
  if (key(r) === key(HARNESS) || key(r).startsWith(key(HARNESS) + (isWin ? "\\" : sep))) return;
  const k = rkey(r); // 같은 프로젝트를 다른 경로 이름(링크, Windows 짧은 이름)으로 두 번 넣지 않게
  if (f.branches && !roots.has(k)) viaBranch.set(k, f);
  if (!f.branches) viaBranch.delete(k);
  if (!roots.has(k) || !f.branches) roots.set(k, r);
}
for (const orig of candidates) {
  let c = orig;
  while (!existsSync(c) && dirname(c) !== c) c = dirname(c); // 세션 뒤에 지워진 하위 폴더면 위로
  const f = findProject(c);
  if (f) { addRoot(f); continue; }
  if (explicit.has(orig)) notFound.push(orig);
  else if (c !== orig) vanished.push({ orig, near: c });
}
// 없어진 폴더: 옮겼는지 지웠는지 사용자에게 묻는다(점검·전체 업데이트·전체 합치기를 멈춤). 스스로 고르지 않는다.
// 하위 폴더 기록(src-tauri 등)은 위 폴더 하나로 묶고, --forget으로 기록한 폴더(와 그 아래)는 다시 묻지 않는다.
// 옮긴 곳 후보는 형식상 가까운 곳만 본다: 같은 위치(이름 대소문자만 바뀜), 한 단계 아래(옆 폴더 안으로), 한 단계 위.
const under = (p, top) => key(p) === key(top) || key(p).startsWith(key(top).replace(/[\\/]$/, "") + (isWin ? "\\" : sep));
const askGone = [];
for (const v of [...vanished].sort((x, y) => x.orig.length - y.orig.length)) {
  if (forgotten.some((f) => under(v.orig, f))) continue;
  if (askGone.some((g) => under(v.orig, g.orig))) continue;
  const name = basename(v.orig).toLowerCase();
  const parent = dirname(v.orig);
  const kids = (d) => { try { return readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(d, e.name)); } catch { return []; } };
  const places = [...kids(parent), ...kids(parent).flatMap(kids), ...(dirname(parent) !== parent ? kids(dirname(parent)) : [])];
  const near = [...new Map(places.filter((d) => basename(d).toLowerCase() === name)
    .map((d) => findProject(d)).filter((f) => f && basename(f.root).toLowerCase() === name)
    .map((f) => [rkey(f.root), f.root])).values()];
  askGone.push({ orig: v.orig, near });
}
const projects = [...roots.values()].sort((a, b) => a.localeCompare(b));

// 찾은 프로젝트를 목록에 기억 (없는 것만 끝에 추가, 사용자가 쓴 줄·주석은 그대로)
const known = new Set(listed.filter(existsSync).map((p) => findProject(p)?.root).filter(Boolean).map(rkey));
const toAdd = projects.filter((p) => !known.has(rkey(p)));
if (toAdd.length) {
  const home0 = homedir();
  const tilde = (p) => (p.startsWith(home0) ? "~" + p.slice(home0.length).split(sep).join("/") : p);
  const prev = existsSync(listFile) ? readFileSync(listFile, "utf8") : "# baton이 설치된 프로젝트 (sync.mjs·place.mjs가 자동으로 추가. 한 줄에 폴더 하나, # 뒤는 메모)\n";
  writeFileSync(listFile, prev.replace(/\n*$/, "\n") + toAdd.map(tilde).join("\n") + "\n");
}
// --forget <경로,...|all>: 없어진 폴더를 확인했으니 다시 묻지 않게 목록 파일에 "!경로"로 기록 (기존 줄은 그대로)
const forgetIdx = args.indexOf("--forget");
const forgetArg = forgetIdx >= 0 ? (args[forgetIdx + 1] || "") : null;
let forgotNow = [];
if (forgetArg !== null) {
  if (!forgetArg) { console.log('사용법: --forget <없어진 폴더 경로,...> 또는 --forget all (점검에서 [멈춤]으로 보여준 폴더 전부)'); process.exit(2); }
  forgotNow = forgetArg === "all" ? askGone.map((g) => g.orig)
    : forgetArg.split(",").map((t) => t.trim()).filter(Boolean).map((t) => resolve(expand(t)));
  if (forgotNow.length) {
    const home0 = homedir();
    const tilde = (p) => (p.startsWith(home0) ? "~" + p.slice(home0.length).split(sep).join("/") : p);
    const prev = existsSync(listFile) ? readFileSync(listFile, "utf8") : "# baton이 설치된 프로젝트 (sync.mjs·place.mjs가 자동으로 추가. 한 줄에 폴더 하나, # 뒤는 메모)\n";
    writeFileSync(listFile, prev.replace(/\n*$/, "\n") + forgotNow.map((p) => `!${tilde(p)}  # 없어진 폴더, 다시 묻지 않음`).join("\n") + "\n");
    for (let i = askGone.length - 1; i >= 0; i--) if (forgotNow.some((f) => under(askGone[i].orig, f))) askGone.splice(i, 1);
  }
}
// 목록에 있지만 폴더가 없거나 baton이 없어진 경로 (지우지 않고 알리기만)
const gone = listed.filter((p) => existsSync(p) && !findProject(p));

// ---------- 2. 원본(KIT)과 비교 ----------
const kitFiles = [];
for (const f of walk(KIT)) {
  const rel = relative(KIT, f).split(sep).join("/");
  if (/^scripts\/baton\//.test(rel) || /^docs\/baton\//.test(rel) || /^\.claude\/commands\/task-.*\.md$/.test(rel)
    || rel === ".claude/agents/baton-verifier.md" || rel === "tasks/_TEMPLATE.md") kitFiles.push(rel);
}
kitFiles.sort();

function defaultBranch(top) {
  const o = git(top, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (o) return o.replace(/^origin\//, "");
  for (const b of ["main", "master"]) if (git(top, ["rev-parse", "--verify", "-q", `refs/heads/${b}`]) !== null) return b;
  return git(top, ["branch", "--show-current"]) || null;
}

// 예전 baton(harness 이전)이 넣은 Claude 훅 명령. 지금 폴더 기준 상대 경로라 하위 폴더에서 세션을 열면 실패한다.
const OLD_CLAUDE_HOOKS = ["node scripts/baton/status.mjs", "node ./scripts/baton/status.mjs"];
const KIT_CLAUDE_HOOK = JSON.parse(readFileSync(join(KIT, ".claude/settings.json"), "utf8")).hooks.SessionStart[0].hooks[0].command;
// SessionStart 안의 옛 명령만 바꾼 settings.json 내용(줄바꿈 LF), 바꿀 게 없거나 확신할 수 없으면 null
function fixOldClaudeHook(text) {
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  const hooks = (j.hooks?.SessionStart || []).flatMap((g) => g.hooks || []);
  const old = OLD_CLAUDE_HOOKS.filter((c) => hooks.some((h) => h.command === c));
  if (!old.length) return null;
  let next = lf(text);
  for (const c of old) {
    const q = JSON.stringify(c);
    // 같은 글자가 SessionStart 밖에도 있으면(다른 이벤트 등) 어느 것을 바꿀지 확신할 수 없으니 건드리지 않는다
    if (next.split(q).length - 1 !== hooks.filter((h) => h.command === c).length) return null;
    next = next.split(q).join(JSON.stringify(KIT_CLAUDE_HOOK));
  }
  // 결과가 "그 명령만 바뀐 같은 JSON"인지 확인
  const want = JSON.parse(text);
  for (const g of want.hooks.SessionStart) for (const h of g.hooks || []) if (old.includes(h.command)) h.command = KIT_CLAUDE_HOOK;
  try { if (JSON.stringify(JSON.parse(next)) !== JSON.stringify(want)) return null; } catch { return null; }
  return next;
}

// decide: 사용자가 고른 처리 (Map 파일 → "keep" | "replace" | "split"). --apply로 프로젝트 하나를 고를 때만 넘긴다.
function inspect(root, decide = new Map()) {
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  if (!top) return { root, skip: "Git 저장소가 아님 (\"baton 업데이트해줘\"로 직접)" };
  const prefix = relative(real(top), real(root)).split(sep).join("/");
  const at = (rel) => (prefix ? `${prefix}/${rel}` : rel);
  const base = defaultBranch(top);
  if (!base || git(top, ["rev-parse", "--verify", "-q", base]) === null) return { root, skip: "기본 브랜치를 찾지 못함" };
  // baton-update가 이미 있으면: 아직 안 합쳤으면 그 위에 이어서 커밋, 이미 합쳐졌으면 기본 브랜치에서 새로 (잃는 커밋 없음)
  const existingTip = git(top, ["rev-parse", "--verify", "-q", `refs/heads/${BRANCH}`]);
  const merged = existingTip !== null && git(top, ["merge-base", "--is-ancestor", BRANCH, base]) !== null;
  const readFrom = existingTip !== null && !merged ? BRANCH : base;
  const show = (rel) => git(top, ["show", `${readFrom}:${at(rel)}`], {}, true);
  // 기본 브랜치에 baton이 아직 없으면(설치 브랜치를 안 합침) 건드리지 않는다. 원래 AGENTS.md를 덮어쓰게 되므로.
  const baseAgents = git(top, ["show", `${base}:${at("AGENTS.md")}`], {}, true);
  if (baseAgents === null || !MARK.test(baseAgents)) {
    return { root, top, base, skip: `${base}에 baton이 아직 합쳐지지 않음 (설치 브랜치를 먼저 합치기)` };
  }
  const changes = [];
  const notes = [];
  const held = []; // 확인이 필요해 건너뛴 파일 { rel, reason, lines, choices }
  if (readFrom === BRANCH) notes.push(`아직 안 합친 ${BRANCH} 브랜치 위에 이어서`);
  // Node 없이 설치한 프로젝트(scripts/baton 없음)에는 스크립트를 새로 넣지 않는다
  const hasScripts = show("scripts/baton/lib.mjs") !== null;
  if (!hasScripts) notes.push("Node 없이 설치됨 → 스크립트 건너뜀");
  for (const rel of kitFiles) {
    if (!hasScripts && rel.startsWith("scripts/baton/")) continue;
    const kit = lf(readFileSync(join(KIT, rel), "utf8"));
    const cur = show(rel);
    // 사용자가 직접 쓴 줄이 있는 파일은 덮어쓰지 않는다 (설치 때 지킨 자기 명령, 직접 고친 규칙 등)
    if (cur !== null) {
      const mine = userLines(rel, cur);
      if (mine.length) {
        const d = decide.get(rel);
        if (d === "keep") { notes.push(`${rel}: 그대로 둠(선택)`); continue; }
        if (d !== "replace") {
          held.push({ rel, reason: `원본 이력에 없는 줄 ${mine.length}개 (직접 고쳤거나 이력 이전의 옛 버전)`, lines: mine, choices: ["keep", "replace"] });
          continue;
        }
      }
    }
    const next = kit;
    if (cur === null) changes.push({ rel, path: at(rel), next, kind: "추가" });
    else if (lf(cur) !== next) changes.push({ rel, path: at(rel), next, kind: "변경", crlf: cur.includes("\r\n") });
  }
  // AGENTS.md·CLAUDE.md: baton 블록 안만 바꾼다. 옛 형식(블록 이전)은 블록 방식으로 전환한다. 블록 밖은 그대로.
  // 옛 형식 전환은 한 번에 전부 또는 전혀: AGENTS.md 전환이 막히면 CLAUDE.md 전환·STATUS 이동도 미룬다
  // (반쯤 전환되면 옛 AGENTS.md 규칙은 루트 STATUS.md를 가리키는데 파일은 tasks/로 옮겨져 어긋난다).
  const blockPlans = ["AGENTS.md", "CLAUDE.md"].map((rel) => { const cur = show(rel); return { rel, cur, r: planBlock(rel, cur, "update", decide.get(rel)) }; });
  const legacyHeld = blockPlans.some(({ r }) => r.hold && r.legacy);
  for (const { rel, cur, r } of blockPlans) {
    if (r.hold) { held.push({ rel, reason: r.hold, lines: r.lines || [], choices: r.choices || [] }); continue; }
    if (r.legacy && legacyHeld) continue;
    if (r.how === "같음") continue;
    changes.push({ rel, path: at(rel), next: r.next, kind: cur === null ? "추가" : r.how.startsWith("옛 형식") || r.how.startsWith("맨 위에") ? "전환" : "변경" });
  }
  // STATUS: 새 위치는 tasks/STATUS.md. 옛 설치의 루트 STATUS.md(baton 양식)는 내용 그대로 옮긴다.
  const rootStatus = show("STATUS.md");
  const tasksStatus = show("tasks/STATUS.md");
  const mixedStatus = tasksStatus === null && rootStatus !== null && isBatonStatus(rootStatus) && hasOriginalStatusSection(rootStatus);
  if (legacyHeld) {
    notes.push("옛 형식 전환(AGENTS.md·CLAUDE.md 블록화, STATUS.md → tasks/ 이동)은 확인할 파일을 정한 뒤 한 번에 해요");
    // 결정할 것은 처음부터 한 번에 보여준다
    if (mixedStatus && decide.get("STATUS.md") !== "split") {
      held.push({ rel: "STATUS.md", reason: "사용자의 원래 STATUS.md(원문 섹션)가 baton 부분과 섞여 있음 → baton 부분은 tasks/STATUS.md로, 원문은 루트 STATUS.md로 나눌지", lines: splitStatus(rootStatus).original.split("\n").filter((l) => l.trim()).slice(0, 5), choices: ["split"] });
    }
  } else if (tasksStatus === null) {
    if (rootStatus !== null && isBatonStatus(rootStatus)) {
      if (hasOriginalStatusSection(rootStatus) && decide.get("STATUS.md") === "split") {
        const { baton, original } = splitStatus(rootStatus);
        changes.push({ rel: "tasks/STATUS.md", path: at("tasks/STATUS.md"), next: baton, kind: "이동(baton 부분)" });
        changes.push({ rel: "STATUS.md", path: at("STATUS.md"), next: original, kind: "원래 STATUS.md로 되돌림", crlf: rootStatus.includes("\r\n") });
      } else if (hasOriginalStatusSection(rootStatus)) {
        held.push({ rel: "STATUS.md", reason: "사용자의 원래 STATUS.md(원문 섹션)가 baton 부분과 섞여 있음 → baton 부분은 tasks/STATUS.md로, 원문은 루트 STATUS.md로 나눌지", lines: splitStatus(rootStatus).original.split("\n").filter((l) => l.trim()).slice(0, 5), choices: ["split"] });
      } else {
        changes.push({ rel: "tasks/STATUS.md", path: at("tasks/STATUS.md"), next: rootStatus, kind: "이동", raw: true });
        changes.push({ rel: "STATUS.md", path: at("STATUS.md"), kind: "이동(옛 위치)", remove: true });
      }
    } else {
      changes.push({ rel: "tasks/STATUS.md", path: at("tasks/STATUS.md"), next: lf(readFileSync(join(KIT, "tasks/STATUS.md"), "utf8")), kind: "추가" });
      if (rootStatus !== null) notes.push("루트 STATUS.md는 baton 양식이 아니라 그대로 둠");
    }
  }
  // .gitignore: 개인 설정 줄 중 빠진 것만 끝에 추가 (다른 줄은 그대로).
  // 빠졌는지는 읽는 브랜치(readFrom)의 .gitignore 내용으로 판단한다. 작업 폴더의 .gitignore는 다른 브랜치일 수 있어서
  // (baton-update를 아직 안 합침 등) 그걸로 보면 실행할 때마다 같은 줄을 또 붙인다. 프로젝트 .gitignore 밖의 출처
  // (전역 제외 설정, .git/info/exclude, 하위 폴더 .gitignore)로 이미 제외되는 줄은 넣지 않는다.
  // 예전 버그로 baton이 같은 블록을 여러 번 붙였으면 뒤의 중복 블록만 지운다(사용자가 쓴 줄은 그대로).
  const curGi = show(".gitignore");
  const { text: giText, removed: giDup } = dedupeGitignore(curGi === null ? "" : lf(curGi));
  const giHave = new Set(giText.split("\n").map(normIg));
  const probe = (p) => (p.endsWith("/") ? `${p}x` : p);
  // 작업 폴더의 .gitignore가 읽는 브랜치와 내용이 같으면 그 판정(.claude/ 같은 넓은 줄 포함)을 그대로 믿는다
  const wtGi = existsSync(join(root, ".gitignore")) ? lf(readFileSync(join(root, ".gitignore"), "utf8")) : null;
  const sameGi = wtGi === (curGi === null ? null : lf(curGi));
  const ignoredElsewhere = (p) => {
    const o = git(root, ["check-ignore", "-v", "--no-index", probe(p)]);
    const m = o && o.match(/^(.*):\d+:(.*)\t/);
    return !!m && !m[2].startsWith("!") && (sameGi || m[1] !== at(".gitignore"));
  };
  const missingPersonal = PERSONAL.filter((p) => !giHave.has(normIg(p)) && !ignoredElsewhere(p));
  if (missingPersonal.length || giDup) {
    const body = !missingPersonal.length ? giText : giText ? giText.replace(/\n*$/, "\n\n") : "";
    changes.push({
      rel: ".gitignore", path: at(".gitignore"), crlf: !!curGi?.includes("\r\n"),
      kind: curGi === null ? "추가" : giDup ? `중복 정리${missingPersonal.length ? "·변경" : ""}` : "변경",
      next: missingPersonal.length ? `${body}${GI_HEAD}\n${missingPersonal.join("\n")}\n` : body,
    });
  }
  // .claude/settings.json은 사용자 설정이라 원칙적으로 쓰지 않는다. 예외 하나: 예전 baton이 넣은 상대 경로 훅 명령
  // (하위 폴더에서 열면 파일을 못 찾음)과 글자까지 같은 값만 지금 키트의 명령으로 바꾼다. 다른 줄·형식은 그대로.
  const settings = show(".claude/settings.json");
  if (hasScripts && (settings === null || !settings.includes("scripts/baton/status.mjs"))) notes.push("settings.json 훅 확인 필요");
  else if (hasScripts) {
    const fixed = fixOldClaudeHook(settings);
    if (fixed) changes.push({ rel: ".claude/settings.json", path: at(".claude/settings.json"), next: fixed, kind: "훅 경로", crlf: settings.includes("\r\n") });
  }
  // Codex 세션 시작 훅: 없으면 새 파일로 추가(덮어쓰기 없음). 사용자가 만든 파일이면 건드리지 않는다.
  const codexHooks = show(".codex/hooks.json");
  if (hasScripts && codexHooks === null) {
    changes.push({ rel: ".codex/hooks.json", path: at(".codex/hooks.json"), next: lf(readFileSync(join(KIT, ".codex/hooks.json"), "utf8")), kind: "추가" });
  } else if (hasScripts && !codexHooks.includes("scripts/baton/status.mjs")) notes.push(".codex/hooks.json 있음(baton 훅 없음) → 그대로 둠, Codex 훅 확인 필요");
  const active = show("tasks/ACTIVE.md");
  const busy = active !== null && !/^상태:\s*없음/m.test(active);
  if (held.length) notes.push(`확인 필요: ${held.map((h) => h.rel).join(", ")} (아래 [멈춤])`);
  return { root, top, base, changes, notes, busy, held, readFrom, existingTip, merged };
}

// --decide 파일=처리,...: --apply로 고른 프로젝트 하나에만 적용
const decideIdx = args.indexOf("--decide");
const decideArg = decideIdx >= 0 ? (args[decideIdx + 1] || "") : null;
const decide = new Map();
if (decideArg) {
  for (const t of decideArg.split(",").map((x) => x.trim()).filter(Boolean)) {
    const [f, c] = t.split("=");
    if (!f || !["keep", "replace", "split"].includes(c)) { console.log(`--decide 형식 오류: ${t} (예: AGENTS.md=keep,scripts/baton/check-active.mjs=replace)`); process.exit(2); }
    decide.set(f.trim(), c);
  }
}
// 브랜치에서 찾은 프로젝트: 이유를 덧붙인다 (점검·업데이트는 원래 기본 브랜치 기준이라 작업 폴더와 상관없이 동작)
function inspectAny(p, d) {
  const r = inspect(p, d);
  const v = viaBranch.get(rkey(p));
  if (!v) return r;
  if (r.skip) r.skip += ` — baton은 ${v.branches.join(", ")} 브랜치에 있음`;
  else (r.notes = r.notes || []).unshift(`작업 폴더는 ${v.current} 브랜치(baton 이전)라 안 보였음`);
  return r;
}
let results = projects.map((p) => inspectAny(p));

// ---------- 3. 보여주기 ----------
const home = homedir();
const short = (p) => (p.startsWith(home) ? "~" + p.slice(home.length) : p);
const out = [`baton이 설치된 프로젝트 ${results.length}개 (원본: ${short(KIT)})`];
results.forEach((r, i) => {
  let line;
  if (r.skip) line = `건너뜀: ${r.skip}`;
  else if (!r.changes.length) line = "최신";
  else {
    const names = r.changes.map((c) => (c.kind === "변경" ? c.rel.split("/").pop()
      : c.kind === "추가" ? `${c.rel.split("/").pop()}(새 파일)` : `${c.rel}(${c.kind})`));
    line = `업데이트 필요: 파일 ${r.changes.length}개 — ${names.slice(0, 5).join(", ")}${names.length > 5 ? " 외" : ""}`;
  }
  const extra = [];
  if (r.base && !r.skip) extra.push(`기준 ${r.base}`);
  if (r.busy) extra.push("main 쪽 ACTIVE.md에 진행 중 작업 표시");
  if (r.notes?.length) extra.push(...r.notes);
  out.push(`${String(i + 1).padStart(2)}. ${short(r.root)}  ${line}${extra.length ? `  (${extra.join(" · ")})` : ""}`);
});
const CHOICE = { keep: "keep = 내 줄 지키기(블록 밖으로 옮기거나 파일 그대로 둠)", replace: "replace = 새 버전으로(걸린 줄은 옛 baton 문구로 보고 버림)", split: "split = baton 부분은 tasks/STATUS.md로, 원문은 루트 STATUS.md로 나눔" };
results.forEach((r, i) => {
  if (!r.held?.length) return;
  out.push(`[멈춤] ${i + 1}. ${short(r.root)} — 확인이 필요한 파일`);
  for (const h of r.held) {
    out.push(`  - ${h.rel}: ${h.reason}`);
    for (const l of h.lines.slice(0, 5)) out.push(`      | ${l.length > 90 ? l.slice(0, 90) + "…" : l}`);
    if (h.lines.length > 5) out.push(`      | … 외 ${h.lines.length - 5}줄`);
    out.push(h.choices.length ? `      고를 수 있는 처리: ${h.choices.map((c) => CHOICE[c]).join(" / ")}` : "      자동 처리 불가 → 그 프로젝트에서 직접 확인");
  }
  const ex = r.held.filter((h) => h.choices.length).map((h) => `${h.rel}=${h.choices[0]}`).join(",");
  if (ex) out.push(`  → 정하면: node ~/harness/baton/sync.mjs --apply "${r.root}" --decide ${ex}  (값은 고른 대로)`);
});
if (!results.length) out.push("  찾지 못했습니다.");
if (scanIdx >= 0) out.push(`[알림] 폴더 찾기(--scan)로 ${scanned.length}개 찾음`);
if (toAdd.length) out.push(`[알림] 새로 찾은 ${toAdd.length}개를 목록(baton/projects.local.txt)에 기억했어요. 다음부터는 세션 기록이 없어도 찾아요`);
if (forgotNow.length) out.push(`[알림] 없어진 폴더 ${forgotNow.length}개를 다시 묻지 않도록 목록에 기록했어요`);
if (askGone.length) {
  out.push(`[멈춤] 세션 기록·목록에 있지만 지금은 없는 폴더 ${askGone.length}개 — 옮겼는지 지웠는지 알려 주세요`);
  for (const g of askGone.slice(0, 10)) {
    out.push(`  - ${short(g.orig)}`);
    if (g.near.length) {
      out.push(`      근처에 같은 이름의 baton 프로젝트: ${g.near.map(short).join(", ")}`);
      out.push(`      → 옮긴 게 맞으면: node ~/harness/baton/sync.mjs "${g.near[0]}" --forget "${g.orig}"`);
    } else out.push("      근처(같은 위치·한 단계 위·아래)에 같은 이름의 baton 프로젝트 없음 → 옮긴 곳을 알려 주거나, 지웠으면 --forget");
  }
  if (askGone.length > 10) out.push(`  … 외 ${askGone.length - 10}개`);
  out.push("  → 지웠거나 baton과 상관없는 폴더면: node ~/harness/baton/sync.mjs --forget all  (목록 파일에 기록, 다시 묻지 않음)");
}
for (const n of notFound) out.push(`[알림] ${short(n)}: baton 표시가 있는 AGENTS.md가 없음 (작업 폴더·로컬 브랜치 모두)`);
for (const g of gone) out.push(`[알림] 목록에 있지만 지금은 없거나 baton이 없는 경로: ${short(g)} (목록에서 지우려면 그 줄을 지우세요)`);
out.push("참고: 세션 기록은 오래되면 지워져요(Claude Code 기본 30일). 빠진 프로젝트가 있으면 --scan <폴더>로 찾아요 (예: --scan ~/Desktop).");

// ---------- --merge: baton-update를 기본 브랜치에 합치기 (사용자 승인 후에만 실행할 것) ----------
// 없어진 폴더가 있으면 점검·전체 업데이트·전체 합치기는 멈추고 묻는다 (고른 프로젝트만 하는 건 그대로 진행)
if (askGone.length && (applyArg === "all" || mergeArg === "all")) {
  console.log(out.join("\n") + "\n\n없어진 폴더를 확인하기 전에는 전체 업데이트·합치기를 하지 않았어요. 위 [멈춤]에 답한 뒤 다시 실행하세요. (프로젝트를 골라서 하는 건 가능)");
  process.exit(1);
}
if (mergeArg !== null) {
  const acceptDropped = args.includes("--accept-dropped");
  const unknownM = [];
  const targets = mergeArg === "all" ? results.map((_, i) => i) : [...new Set(mergeArg.split(",").map((t) => t.trim()).filter(Boolean).flatMap((t) => {
    const hits = results.map((r, i) => [r, i]).filter(([r]) => samePath(r.root, expand(t)) || r.root.split(/[\\/]/).pop() === t || String(results.indexOf(r) + 1) === t);
    if (hits.length !== 1) unknownM.push(t);
    return hits.length === 1 ? [hits[0][1]] : [];
  }))];
  const mo = [""];
  for (const u of unknownM) mo.push(`찾지 못해 건너뜀: ${u}`);
  for (const i of targets) {
    const r = results[i];
    const name = `${i + 1}. ${short(r.root)}`;
    if (!r.top) { mo.push(`${name}: Git 저장소가 아님`); continue; }
    if (git(r.top, ["rev-parse", "--verify", "-q", `refs/heads/${BRANCH}`]) === null) { mo.push(`${name}: 합칠 ${BRANCH} 브랜치가 없음`); continue; }
    if (git(r.top, ["merge-base", "--is-ancestor", r.base, BRANCH]) === null) { mo.push(`${name}: ${r.base}가 그사이 바뀌어 바로 합칠 수 없음 → 그 프로젝트에서 직접 합치기`); continue; }
    if (r.held?.length) { mo.push(`${name}: 아직 확인 필요한 파일이 있음 (${r.held.map((h) => h.rel).join(", ")}) → 먼저 --decide로 정하기`); continue; }
    // 보존 확인: 기본 브랜치에 있던 사용자 줄이 baton-update에서 사라졌는지
    let pc;
    try {
      pc = { code: 0, out: execFileSync(process.execPath, [join(HARNESS, "baton", "preserve-check.mjs"), r.base, "--to", BRANCH], { cwd: r.root, encoding: "utf8" }) };
    } catch (e) { pc = { code: e.status, out: String(e.stdout || e.message) }; }
    if (pc.code !== 0 && !acceptDropped) {
      mo.push(`${name}: 보존 확인에서 사라지는 줄이 있어 합치지 않음`);
      mo.push(...pc.out.trim().split("\n").map((l) => `    ${l}`));
      mo.push("    → replace로 버리기로 고른 줄뿐이면 --accept-dropped를 붙여 다시. 아니면 합치지 말고 확인");
      continue;
    }
    const cur = git(r.top, ["branch", "--show-current"]);
    let res;
    if (cur === r.base) {
      if (git(r.top, ["status", "--porcelain"])) { mo.push(`${name}: ${r.base}에 커밋 안 된 변경이 있어 합치지 않음`); continue; }
      res = git(r.top, ["merge", "--ff-only", BRANCH]);
    } else {
      res = git(r.top, ["fetch", ".", `refs/heads/${BRANCH}:refs/heads/${r.base}`]); // 작업 폴더를 건드리지 않고 기본 브랜치만 앞으로
    }
    if (res === null) { mo.push(`${name}: 합치기 실패 → 그 프로젝트에서 직접 확인`); continue; }
    // 기본 브랜치에 들어갔는지 직접 확인한 뒤에만 지운다 (branch -d는 지금 브랜치 기준이라 쓰지 않음)
    const tip = git(r.top, ["rev-parse", BRANCH]);
    if (git(r.top, ["merge-base", "--is-ancestor", BRANCH, r.base]) !== null) git(r.top, ["update-ref", "-d", `refs/heads/${BRANCH}`, tip]);
    mo.push(`${name}: ${BRANCH}를 ${r.base}에 합치고 브랜치를 정리했어요${cur === r.base ? "" : ` (지금 ${cur || "다른"} 브랜치에서 작업 중이라 작업 폴더는 그대로)`}. push는 하지 않았어요`);
  }
  console.log(out.concat(mo).join("\n"));
  process.exit(0);
}

if (applyArg === null) {
  out.push("");
  out.push("점검만 했습니다 (아무것도 바꾸지 않음). 업데이트하려면: node baton/sync.mjs --apply <번호들 | 폴더 이름들 | all>");
  console.log(out.join("\n"));
  process.exit(askGone.length ? 1 : 0);
}

// ---------- 4. 업데이트: baton-update 브랜치에 커밋 하나 ----------
const unknown = [];
const pickTargets = (arg) => (arg === "all"
  ? results.map((_, i) => i)
  : [...new Set(arg.split(",").map((t) => t.trim()).filter(Boolean).flatMap((t) => {
    if (/^\d+$/.test(t)) return Number(t) - 1 < results.length ? [Number(t) - 1] : [];
    const hits = results.map((r, i) => [r, i]).filter(([r]) => samePath(r.root, t.replace(/^~(?=$|[\\/])/, homedir()))
      || r.root.split(/[\\/]/).pop() === t);
    if (hits.length !== 1) unknown.push(`${t}${hits.length ? " (이름이 겹침, 경로로 지정)" : ""}`); // 겹치면 고르지 않는다
    return hits.length === 1 ? [hits[0][1]] : [];
  }))].filter((n) => n >= 0));
const pick = pickTargets(applyArg);
if (!pick.length) {
  console.log(out.join("\n") + "\n\n--apply 뒤에 번호(예: 1,3) 또는 all을 쓰세요.");
  process.exit(1);
}
if (decide.size) {
  if (pick.length !== 1) { console.log("--decide는 프로젝트 하나를 고를 때만 쓸 수 있어요 (--apply <경로> --decide ...)."); process.exit(2); }
  const r0 = results[pick[0]];
  const valid = new Map((r0.held || []).map((h) => [h.rel, h.choices]));
  for (const [f, c] of decide) {
    if (!valid.has(f)) { console.log(`--decide의 ${f}는 확인이 필요한 파일이 아니에요. 대상: ${[...valid.keys()].join(", ") || "(없음)"}`); process.exit(2); }
    if (!valid.get(f).includes(c)) { console.log(`${f}에는 ${c}를 고를 수 없어요. 가능: ${valid.get(f).join(", ")}`); process.exit(2); }
  }
  results[pick[0]] = inspectAny(r0.root, decide);
}

function commitUpdate(r) {
  const tmp = mkdtempSync(join(tmpdir(), "baton-sync-"));
  const env = { ...process.env, GIT_INDEX_FILE: join(tmp, "index") };
  try {
    const from = r.readFrom || r.base;
    if (git(r.top, ["read-tree", from], { env }) === null) return "임시 인덱스 만들기 실패";
    for (const c of r.changes) {
      if (c.remove) {
        if (git(r.top, ["update-index", "--force-remove", c.path], { env }) === null) return `${c.rel} 옮기기 실패`;
        continue;
      }
      const content = c.crlf ? c.next.replace(/\n/g, "\r\n") : c.next;
      const blob = git(r.top, ["hash-object", "-w", `--path=${c.path}`, "--stdin"], { input: content });
      if (!blob) return `${c.rel} 저장 실패`;
      const mode = (git(r.top, ["ls-tree", from, "--", c.path]) || "").split(" ")[0] || "100644";
      if (git(r.top, ["update-index", "--add", "--cacheinfo", `${mode},${blob},${c.path}`], { env }) === null) return `${c.rel} 반영 실패`;
    }
    const tree = git(r.top, ["write-tree"], { env });
    const parent = git(r.top, ["rev-parse", from]);
    const msg = `chore(baton): update baton files from harness\n\n${r.changes.map((c) => `- ${c.kind}: ${c.path}`).join("\n")}\n`;
    const commit = tree && parent && git(r.top, ["commit-tree", tree, "-p", parent], { input: msg });
    if (!commit) return "커밋 실패 (이 저장소의 Git 사용자 이름·이메일 설정 확인)";
    // 이미 있던 baton-update는 그 끝(tip)이 그대로일 때만 옮긴다 (그사이 누가 바꿨으면 실패)
    const ok = r.existingTip
      ? git(r.top, ["update-ref", `refs/heads/${BRANCH}`, commit, r.existingTip])
      : git(r.top, ["branch", BRANCH, commit]);
    if (ok === null) return "브랜치 만들기 실패";
    return null;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

out.push("");
for (const u of unknown) out.push(`찾지 못해 건너뜀: ${u}`);
for (const i of pick) {
  const r = results[i];
  const name = `${i + 1}. ${short(r.root)}`;
  if (r.skip) { out.push(`${name}: 건너뜀 — ${r.skip}`); continue; }
  if (!r.changes.length) { out.push(`${name}: 이미 최신`); continue; }
  const err = commitUpdate(r);
  out.push(err ? `${name}: 실패 — ${err}` : `${name}: ${BRANCH} 브랜치에 ${r.readFrom === BRANCH ? "이어서 " : ""}커밋함 (파일 ${r.changes.length}개, 기준 ${r.base})${r.held.length ? ` · 아직 확인 필요: ${r.held.map((h) => h.rel).join(", ")}` : ""}`);
}
out.push("");
out.push(`작업 폴더와 현재 브랜치는 그대로입니다. 확인이 끝난 프로젝트는 승인 후 합치기: node ~/harness/baton/sync.mjs --merge <경로|번호|all>`);
out.push(`  (합치기 전에 보존 확인을 하고, 작업 중인 브랜치·폴더는 건드리지 않아요. push는 안 해요)`);
console.log(out.join("\n"));
