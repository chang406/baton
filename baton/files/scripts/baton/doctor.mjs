#!/usr/bin/env node
// baton 설치 상태 진단. 항목마다 [x](정상) / [ ](문제) / [!](경고)로 보여준다.
// 읽기 전용: 파일이나 Git 상태를 바꾸지 않는다. 하위 폴더에서 실행해도 결과가 같다.
// 하나라도 [ ]가 있으면 exit 1. [!]는 알리기만 하고 판정에 넣지 않는다. check-active 결과는 참고로만 보여주고 판정에 넣지 않는다.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
const realOf = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };
import { git, findBatonRoot } from "./lib.mjs";

const MIN_NODE = 18;
const REQUIRED = [
  "AGENTS.md", "CLAUDE.md", "tasks/STATUS.md",
  "tasks/ACTIVE.md", "tasks/_TEMPLATE.md", "tasks/archive",
  ".claude/commands/task-start.md", ".claude/commands/task-resume.md",
  ".claude/commands/task-handoff.md", ".claude/commands/task-finish.md",
  ".claude/agents/baton-verifier.md",
  "scripts/baton/lib.mjs", "scripts/baton/status.mjs",
  "scripts/baton/check-active.mjs", "scripts/baton/scan-secrets.mjs", "scripts/baton/preflight.mjs",
  "docs/baton/README.md",
];

const root = findBatonRoot();
const cwd = resolve(process.cwd());
const lines = [];
let failures = 0;
let warnings = 0;
function check(ok, label, detail = "") {
  if (!ok) failures++;
  lines.push(`[${ok ? "x" : " "}] ${label}${detail ? ` — ${detail}` : ""}`);
}
function warn(label, detail) {
  warnings++;
  lines.push(`[!] ${label} — ${detail}`);
}
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

// 버전 표시 (AGENTS.md 첫머리의 <!-- baton vN -->)
const agents = read(join(root, "AGENTS.md")) || "";
const version = (agents.match(/<!--\s*baton\s+(v\d+)\s*-->/) || [])[1];
check(!!version, `baton 버전 ${version || "(표시 없음)"}`, version ? "" : "AGENTS.md에 <!-- baton vN --> 없음");

// Node
const major = Number(process.versions.node.split(".")[0]);
check(major >= MIN_NODE, `Node v${process.versions.node}`, major >= MIN_NODE ? "" : `${MIN_NODE} 이상 필요`);

// Git
const gitVersion = git("--version");
const top = git("rev-parse", "--show-toplevel");
check(!!gitVersion && !!top, gitVersion || "Git",
  !gitVersion ? "git 명령 없음" : !top ? "Git 저장소 밖에서 실행 중" : "");

// 필수 파일
const missing = REQUIRED.filter((f) => !existsSync(join(root, f)));
const claude = read(join(root, "CLAUDE.md"));
if (claude !== null && !/^@AGENTS\.md\s*$/m.test(claude)) missing.push("CLAUDE.md의 @AGENTS.md 줄");
check(!missing.length, `필수 파일 ${REQUIRED.length}개`, missing.length ? `빠짐: ${missing.join(", ")}` : "");

// AGENTS.md·CLAUDE.md의 baton 블록(<!-- baton:start --> ~ <!-- baton:end -->): 정확히 한 쌍, 시작이 끝보다 앞
// (/init 같은 도구가 파일을 다시 쓰면서 블록을 깨뜨렸는지, 옛 형식 설치인지 잡는다)
for (const f of ["AGENTS.md", "CLAUDE.md"]) {
  const t = read(join(root, f));
  if (t === null) continue; // 필수 파일 검사에서 잡힘
  const s = [...t.matchAll(/^<!--\s*baton:start\s*-->/gm)];
  const e = [...t.matchAll(/^<!--\s*baton:end\s*-->/gm)];
  const ok = s.length === 1 && e.length === 1 && s[0].index < e[0].index;
  check(ok, `${f}의 baton 블록`,
    ok ? "" : !s.length && !e.length ? "블록 없음 (옛 형식 설치면 \"baton 업데이트해줘\"로 블록 방식 전환)"
      : `블록 표시가 깨짐 (시작 ${s.length}개, 끝 ${e.length}개) → 블록 밖 내용은 두고 블록만 복구`);
}

// baton 파일은 커밋돼야 한다 (인계 기록·작업 방식 설정). 개인 설정은 반대로 제외돼야 한다.
const PERSONAL = [".claude/settings.local.json", "CLAUDE.local.md", ".claude/worktrees/"];
if (top) {
  const present = [...REQUIRED, ".claude/settings.json", ".codex/hooks.json"].filter((f) => existsSync(join(root, f)));
  const ignored = git("-C", root, "check-ignore", "--no-index", ...present).split("\n").filter(Boolean);
  check(!ignored.length, "baton 파일이 Git 제외 목록에 없음",
    ignored.length ? `제외됨: ${ignored.join(", ")} — 작업 방식 설정이라 커밋해야 함 (git check-ignore -v로 원인 확인)` : "");
  // 개인 설정은 프로젝트 .gitignore(커밋돼 다른 컴퓨터에도 가는 규칙)로 제외돼야 한다.
  // 전역 제외 목록이나 .git/info/exclude로만 제외되면 이 컴퓨터에서만 통하므로 경고한다.
  const probe = (p) => (p.endsWith("/") ? `${p}x` : p);
  const rule = new Map(); // 검사한 경로 → 그 경로를 제외한 규칙 파일
  for (const l of git("-C", root, "check-ignore", "-v", "--no-index", ...PERSONAL.map(probe)).split("\n")) {
    const m = l.match(/^(.+?):\d+:([^\t]*)\t(.+)$/);
    if (m && !m[2].startsWith("!")) rule.set(m[3], m[1]); // "!규칙"은 제외를 푸는 줄
  }
  const inProject = (src) => !isAbsolute(src) && !src.startsWith("~") && !src.startsWith(".git/") && /(^|\/)\.gitignore$/.test(src);
  const notIgnored = PERSONAL.filter((p) => !rule.has(probe(p)));
  const localOnly = PERSONAL.filter((p) => rule.has(probe(p)) && !inProject(rule.get(probe(p))));
  const tracked = git("-C", root, "ls-files", "--", ...PERSONAL).split("\n").filter(Boolean);
  if (!tracked.length && !notIgnored.length && localOnly.length)
    warn("개인 설정이 프로젝트 .gitignore에서 제외됨",
      `이 컴퓨터 설정으로만 제외됨: ${localOnly.map((p) => `${p} (${rule.get(probe(p))})`).join(", ")} → 프로젝트 .gitignore에 추가 (다른 컴퓨터에서는 커밋될 수 있음)`);
  else
    check(!notIgnored.length && !tracked.length, "개인 설정이 Git에서 제외됨",
      tracked.length ? `이미 Git에 올라감: ${tracked.join(", ")} (git rm --cached로 빼기)`
        : notIgnored.length ? `.gitignore에 추가 필요: ${notIgnored.join(", ")}` : "");
}

// settings.json 훅
const settingsText = read(join(root, ".claude", "settings.json"));
let hookCmd = null;
let settingsErr = "";
if (settingsText === null) settingsErr = ".claude/settings.json 없음";
else {
  try {
    const groups = JSON.parse(settingsText).hooks?.SessionStart || [];
    hookCmd = groups.flatMap((g) => g.hooks || []).map((h) => h.command || "").find((c) => c.includes("status.mjs")) || null;
    if (!hookCmd) settingsErr = "SessionStart에 status.mjs 훅 없음";
  } catch (e) {
    settingsErr = `JSON 오류: ${e.message}`;
  }
}
check(!!hookCmd, "Claude SessionStart 훅 등록 (settings.json 기준)", hookCmd || settingsErr);

// 훅 command에서 스크립트 경로를 꺼내 $CLAUDE_PROJECT_DIR을 프로젝트 루트로 바꾼다
function hookTarget(cmd) {
  const m = cmd.match(/node(?:\.exe)?\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (!m) return null;
  return (m[1] || m[2] || m[3])
    .replace(/\$\{CLAUDE_PROJECT_DIR\}|\$CLAUDE_PROJECT_DIR|%CLAUDE_PROJECT_DIR%/g, root);
}
const target = hookCmd ? hookTarget(hookCmd) : null;
const fromRoot = target && resolve(root, target);
check(!!fromRoot && existsSync(fromRoot), "Claude 훅 경로 (프로젝트 루트 기준)",
  !hookCmd ? "훅 없음" : !target ? `command에서 경로를 찾지 못함: ${hookCmd}` :
  existsSync(fromRoot) ? relative(root, fromRoot) : `파일 없음: ${fromRoot}`);

// 하위 폴더에서 세션을 열어도 훅이 같은 파일을 찾고 정상 실행되는가
const sub = cwd !== root && cwd.startsWith(root) ? cwd : join(root, "tasks");
let subDetail = "";
let subOk = false;
if (!target) subDetail = "훅 없음";
else {
  const fromSub = resolve(sub, target);
  if (!existsSync(fromSub)) {
    subDetail = isAbsolute(target) ? `파일 없음: ${fromSub}`
      : `상대 경로라 ${relative(root, sub) || "."}에서 못 찾음: ${target}`;
  }
  else {
    try {
      const out = execFileSync(process.execPath, [fromSub], {
        cwd: sub, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      });
      subOk = !out.includes("ACTIVE.md: 파일 없음");
      subDetail = subOk ? `${relative(root, sub)}에서 실행 확인` : "실행됐지만 ACTIVE.md를 못 찾음";
    } catch (e) {
      subDetail = `실행 실패: ${(e.stderr || e.message).toString().split("\n")[0]}`;
    }
  }
}
check(subOk, "Claude 훅 명령을 하위 폴더에서 실행해 봄", subDetail);

// Codex가 자동으로 불러오는 AGENTS 계열 문서의 크기 (Codex 공식 docs/agents_md.md 기준, 사용자의 Codex가 0.166.0에서 확인)
// - 전역(~/.codex)과, 저장소 루트부터 지금 폴더까지 폴더마다 파일 하나: AGENTS.override.md → AGENTS.md
//   → config.toml의 project_doc_fallback_filenames 순서로 **있는** 첫 파일이 선택된다.
// - 선택된 파일이 비었으면(0바이트 또는 공백·탭·줄바꿈만) 문맥에 넣지 않는다. 빈 AGENTS.override.md도 선택되므로
//   같은 폴더의 AGENTS.md는 읽지 않는다(확인됨). 빈 AGENTS.md가 대체 이름을 막는지는 확인하지 않았고, 같은 규칙으로 본다.
// - 합이 project_doc_max_bytes(기본 32KiB)에 도달하면 Codex는 그 뒤 문서를 더 불러오지 않는다.
// config.toml만 간단히 읽는다. 한도·대체 이름은 프로필·명령줄 옵션으로도 바뀌므로 실제 적용 설정과 다를 수 있다(그렇다고 표시).
const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
{
  const cfg = read(join(codexHome, "config.toml")) || "";
  const cfgLimit = Number((cfg.match(/^\s*project_doc_max_bytes\s*=\s*(\d+)/m) || [])[1]);
  const limit = cfgLimit || 32 * 1024;
  const fbRaw = (cfg.match(/^\s*project_doc_fallback_filenames\s*=\s*\[([\s\S]*?)\]/m) || [])[1] || "";
  const fallbacks = [...fbRaw.matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] || m[2]);
  const pick = (dir, names) => names.map((n) => join(dir, n)).find((p) => existsSync(p)) || null;
  const size = (p) => { const t = readFileSync(p, "utf8"); return t.trim().length ? Buffer.byteLength(t) : 0; };
  const projectNames = ["AGENTS.override.md", "AGENTS.md", ...fallbacks];
  const chain = [pick(codexHome, ["AGENTS.override.md", "AGENTS.md"])];
  const topDir = top ? resolve(top) : root;
  // 루트부터 baton 루트를 거쳐, doctor를 실행한 지금 폴더까지 (하위 폴더에서 Codex를 켜는 경우)
  const here = realOf(cwd).startsWith(realOf(root)) ? cwd : root;
  const rel = relative(realOf(topDir), realOf(here));
  let dir = topDir;
  chain.push(pick(dir, projectNames));
  for (const part of rel && !rel.startsWith("..") ? rel.split(sep) : []) { dir = join(dir, part); chain.push(pick(dir, projectNames)); }
  const total = chain.filter(Boolean).reduce((t, p) => t + size(p), 0);
  const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
  const src = cfgLimit || fallbacks.length ? " (config.toml 기준, 실제 적용 설정과 다를 수 있음)" : "";
  const overridePath = join(root, "AGENTS.override.md");
  const hidden = existsSync(overridePath);
  const hiddenWhy = hidden && !readFileSync(overridePath, "utf8").trim() ? "(비어 있어도 선택됨)" : "";
  check(total <= limit && !hidden, "Codex 자동 로드 AGENTS 문서 크기",
    hidden ? `같은 폴더의 AGENTS.override.md${hiddenWhy}가 선택되어 baton 규약이 든 AGENTS.md는 불러오지 않음`
      : total > limit ? `${kb(total)} / 한도 ${kb(limit)}${src} — 한도에 도달하면 Codex가 그 뒤 문서를 더 불러오지 않음. 블록 밖 규칙을 줄이거나 project_doc_max_bytes를 늘리기`
        : `${kb(total)} / 한도 ${kb(limit)}${src}${total > limit * 0.85 ? " (한도에 가까움)" : ""}`);
}

// Codex 세션 시작 훅 (.codex/hooks.json, Codex CLI 0.166.0에서 동작 확인)
// 파일에 등록된 것만 본다. 신뢰(Trust) 여부와 실제 실행은 Codex의 /hooks에서 확인한다.
// 훅은 Git 저장소 최상위에서 scripts/baton/status.mjs를 찾으므로, baton이 저장소의 하위 폴더에 설치됐으면 못 찾는다.
{
  const text = read(join(root, ".codex", "hooks.json"));
  let cmd = null;
  let err = "";
  if (text === null) err = ".codex/hooks.json 없음 → baton 업데이트로 추가 (그동안 Codex는 AGENTS.md의 '상태 확인' 절차로 대신)";
  else {
    try {
      cmd = (JSON.parse(text).hooks?.SessionStart || []).flatMap((g) => g.hooks || [])
        .map((h) => String(h.command || "")).find((c) => c.includes("scripts/baton/status.mjs")) || null;
      if (!cmd) err = "SessionStart에 status.mjs 훅 없음";
    } catch (e) { err = `JSON 오류: ${e.message}`; }
  }
  const nested = cmd && cmd.includes("--show-toplevel") && top && realOf(top) !== realOf(root);
  check(!!cmd && !nested, "Codex SessionStart 훅 등록 (.codex/hooks.json 기준)",
    !cmd ? err
      : nested ? "baton이 Git 저장소의 하위 폴더에 있어 훅이 저장소 최상위에서 status.mjs를 못 찾음"
        : "등록됨. 처음 열 때 Codex가 묻는 신뢰(/hooks)가 필요하고, 결과는 화면이 아니라 모델 문맥에 들어감");
}

// Codex 전역 지침이 baton 경로를 적어 뒀다면, 그 경로가 실제로 있는지 (옛 ~/baton을 가리키는 경우)
{
  for (const name of ["AGENTS.override.md", "AGENTS.md"]) {
    const text = read(join(codexHome, name));
    if (!text) continue;
    const refs = [...new Set([...text.matchAll(/(?:~|[A-Za-z]:[\\/]|\/)[^\s`'"()<>\]]*baton[^\s`'"()<>\]]*/g)].map((m) => m[0].replace(/[.,;:]+$/, "")))];
    const missing = refs.filter((r) => !existsSync(r.replace(/^~(?=$|[\\/])/, homedir())));
    if (refs.length) {
      check(!missing.length, `Codex 전역 지침(${name})의 baton 경로`,
        missing.length ? `없는 경로를 가리킴: ${missing.slice(0, 2).join(", ")} → ~/harness/baton 아래 경로인지 확인 (고치기 전 사본 보관)` : refs.slice(0, 2).join(", "));
    }
  }
}

// 전역 CLAUDE.md의 GLOBAL_RULES 로드 줄
const globalPath = join(homedir(), ".claude", "CLAUDE.md");
const globalText = read(globalPath);
const ruleLine = globalText && (globalText.match(/^@(\S*GLOBAL_RULES\.md)\s*$/m) || [])[1];
const rulePath = ruleLine && resolve(ruleLine.replace(/^~(?=[\\/])/, homedir()));
check(!!rulePath && existsSync(rulePath), "전역 CLAUDE.md의 GLOBAL_RULES 로드 줄",
  globalText === null ? `${globalPath} 없음` : !ruleLine ? "@…GLOBAL_RULES.md 줄 없음" :
  existsSync(rulePath) ? `@${ruleLine}` : `대상 파일 없음: ${rulePath}`);

// check-active (참고만)
let active;
try {
  active = execFileSync(process.execPath, [join(root, "scripts", "baton", "check-active.mjs")], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
} catch (e) {
  active = (e.stdout || "") + (e.stderr || e.message);
}

console.log(`=== Baton doctor === (${root})`);
console.log(lines.join("\n"));
console.log("\n참고 — check-active (판정에 넣지 않음):");
console.log(active.trim().split("\n").map((l) => `  ${l}`).join("\n"));
console.log(`\n결과: ${failures ? `문제 ${failures}개` : "모두 정상"}${warnings ? `, 경고 ${warnings}개` : ""}`);
process.exit(failures ? 1 : 0);
