#!/usr/bin/env node
// baton 사전 검사 (harness 전용, 프로젝트에 복사하지 않음). 읽기 전용, 네트워크 없음.
// 설치·업데이트·전역 설정 전에, 겹치는 이름이나 문제될 상태를 한 번에 모아 보여준다.
//
//   node ~/harness/baton/preflight.mjs install   프로젝트 폴더에서. baton 설치 전 (어떤 파일도 만들기 전)
//   node ~/harness/baton/preflight.mjs update    (선택) 업데이트 전 Git 상태 점검. sync.mjs가 같은 검사를 하므로 지침에선 쓰지 않음
//   node ~/harness/baton/preflight.mjs global    아무 곳에서. 전역 ~/.claude/CLAUDE.md를 고치기 전
//
// 출력: [멈춤] 항목이 하나라도 있으면 exit 1 → 에이전트는 그 자리에서 멈추고, 모든 항목을 한 번에 보여주고 묻는다.
//       [알림] 항목은 알리기만 한다. 원격 브랜치는 마지막으로 받아온(fetch) 기준이다.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { KIT } from "./known.mjs";

const MARK = /<!--\s*baton\s+v\d+\s*-->/;
// 실제 경로로 맞춘다: Windows의 짧은 이름(C:\\Users\\RUNNER~1)과 Git이 돌려주는 긴 이름을 같게 비교하기 위해
const real = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };
const mode = process.argv[2];
const cwd = resolve(process.cwd());
const stops = [];
const notes = [];
const stop = (what, then) => stops.push(then ? `${what} → 진행하면: ${then}` : what);
const note = (what) => notes.push(what);

function git(args, at = cwd) {
  try {
    return execFileSync("git", args, { cwd: at, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/\n$/, "");
  } catch {
    return null;
  }
}
const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
const isLink = (p) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };
function* walk(dir, depth = 0) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory() && depth < 6) yield* walk(p, depth + 1);
    else if (e.isFile()) yield p;
  }
}

// Git 상태: 진행 중인 병합·리베이스, 커밋 안 된 변경, 분리된 HEAD
function gitState(at) {
  const gp = (n) => { const p = git(["rev-parse", "--git-path", n], at); return p && existsSync(resolve(at, p)); };
  if (gp("MERGE_HEAD")) stop("병합(merge)이 진행 중", "먼저 끝내거나 취소해야 함");
  if (gp("rebase-merge") || gp("rebase-apply")) stop("리베이스(rebase)가 진행 중", "먼저 끝내거나 취소해야 함");
  if (gp("CHERRY_PICK_HEAD")) stop("체리픽(cherry-pick)이 진행 중", "먼저 끝내거나 취소해야 함");
  if (stops.length) return; // 진행 중인 작업 때문에 생긴 변경·detached HEAD는 따로 늘어놓지 않는다
  const dirty = (git(["status", "--porcelain"], at) || "").split("\n").filter(Boolean);
  if (dirty.length) stop(`커밋 안 된 변경 ${dirty.length}개 (예: ${dirty.slice(0, 3).map((l) => l.slice(3)).join(", ")})`, "먼저 커밋하거나 정리할지 정해야 함");
  if (git(["symbolic-ref", "-q", "HEAD"], at) === null) stop("특정 브랜치가 아닌 커밋 위에 있음(detached HEAD)", "브랜치로 옮겨야 함");
}
function branchExists(name, at) {
  const local = git(["rev-parse", "--verify", "-q", `refs/heads/${name}`], at) !== null;
  const remote = (git(["for-each-ref", "--format=%(refname:short)", "refs/remotes"], at) || "")
    .split("\n").filter((r) => r.endsWith(`/${name}`));
  return [...(local ? [name] : []), ...remote];
}
function defaultBranch(at) {
  const o = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], at);
  if (o) return o.replace(/^origin\//, "");
  for (const b of ["main", "master"]) if (git(["rev-parse", "--verify", "-q", `refs/heads/${b}`], at) !== null) return b;
  return git(["branch", "--show-current"], at) || null;
}

// ---------- install ----------
function install() {
  const root = cwd;
  const top = git(["rev-parse", "--show-toplevel"]);
  const agents = read(join(root, "AGENTS.md"));
  if (agents && MARK.test(agents)) { stop("이미 baton이 설치돼 있음", "설치 대신 \"baton 업데이트해줘\"를 써야 함"); return; }
  if (existsSync(join(root, ".baton-skip"))) stop("이 폴더는 baton을 설치하지 않기로 표시돼 있음(.baton-skip)", "표시를 지우고 설치");
  if (/onedrive/i.test(root)) note("OneDrive 동기화 폴더 안이에요. Git이 가끔 충돌할 수 있어요");

  if (!top) {
    note("Git 저장소가 아니에요 → 설치 지침 2-3대로 Git부터 만들어요 (승인 후)");
  } else {
    if (resolve(top) !== root) note(`더 큰 저장소(${relative(root, top) || "."})의 하위 폴더예요 → 이 폴더에만 설치할지 묻게 돼요`);
    gitState(root);
    const b = branchExists("task/baton-setup", root);
    if (b.length) stop(`설치용 브랜치가 이미 있음: ${b.join(", ")}`, "예전 설치 시도를 이어갈지, 지우고 새로 할지 정해야 함");
  }

  // 루트의 AGENTS.md·CLAUDE.md: baton은 맨 위에 자기 블록(<!-- baton:start --> ~ end)만 끼우고 기존 내용은 그대로 둔다
  for (const f of ["AGENTS.md", "CLAUDE.md"]) {
    const p = join(root, f);
    if (!existsSync(p) && !isLink(p)) continue;
    if (isLink(p)) { stop(`${f}이(가) 다른 파일을 가리키는 링크임`, "링크 대상 파일에 블록이 들어가므로 어떻게 할지 정해야 함"); continue; }
    if (top && git(["ls-files", "--error-unmatch", f], root) === null) {
      stop(`${f}이(가) Git에 기록돼 있지 않음 (되돌릴 수 없음)`, `고치기 전에 ${f}.before-baton 사본을 만들고 블록 추가`);
      continue;
    }
    if (/<!--\s*baton:(start|end)\s*-->/.test(read(p) || "")) { stop(`${f}에 예전 설치가 남긴 baton 블록 표시가 있음`, "이어서 할지, 정리하고 새로 할지 정해야 함"); continue; }
    note(`${f}이(가) 이미 있어요 → 맨 위에 baton 블록만 추가하고 기존 내용은 한 글자도 바꾸지 않아요`);
  }
  if (existsSync(join(root, "STATUS.md"))) note("STATUS.md가 이미 있어요 → baton은 tasks/STATUS.md를 따로 써서 겹치지 않아요 (그대로 둠)");
  const claude = read(join(root, "CLAUDE.md"));
  if (claude && /^@AGENTS\.md\s*$/m.test(claude)) note("CLAUDE.md에 이미 @AGENTS.md 줄이 있어요 → baton 블록에도 들어가요 (둘 다 있어도 동작)");

  // 키트의 나머지 파일과 같은 이름
  const kitFiles = [...walk(KIT)].map((f) => relative(KIT, f).split(sep).join("/"))
    .filter((r) => !["AGENTS.md", "CLAUDE.md", ".claude/settings.json", ".codex/hooks.json"].includes(r));
  const clash = kitFiles.filter((r) => existsSync(join(root, r)));
  if (clash.length) stop(`baton이 만들 파일과 같은 이름이 있음: ${clash.slice(0, 5).join(", ")}${clash.length > 5 ? ` 외 ${clash.length - 5}개` : ""}`, "파일마다 덮어쓰지 않고 어떻게 할지 물어봄");
  if (existsSync(join(root, "tasks"))) {
    const others = [...walk(join(root, "tasks"))].map((f) => relative(root, f).split(sep).join("/"))
      .filter((r) => !kitFiles.includes(r));
    if (others.length) stop(`tasks/ 폴더를 이미 다른 용도로 쓰고 있음 (예: ${others.slice(0, 3).join(", ")})`, "baton 기록 파일이 그 폴더에 섞이게 됨");
  }
  if (top) {
    const ignored = (git(["check-ignore", "--no-index", ...["AGENTS.md", "CLAUDE.md", ...kitFiles]], root) || "")
      .split("\n").filter(Boolean);
    if (ignored.length) stop(`baton 파일 경로가 Git 제외 목록에 걸림: ${ignored.slice(0, 3).join(", ")}`, "Git에 안 올라가 인계가 안 됨");
  }

  // JSON 설정 파일 (Claude·Codex 훅): 기존 항목은 그대로, baton 훅만 추가
  for (const rel of [".claude/settings.json", ".codex/hooks.json"]) {
    const text = read(join(root, rel));
    if (text === null) continue;
    let s = null;
    try { s = JSON.parse(text); } catch { stop(`${rel}이 깨진 JSON임`, "병합할 수 없어 먼저 고쳐야 함"); }
    if (s) {
      const n = (s.hooks?.SessionStart || []).length;
      note(`${rel}이 있어요 → 기존 항목은 그대로 두고 baton 훅만 추가해요${n ? ` (기존 SessionStart 훅 ${n}개 유지)` : ""}`);
    }
  }
  const pkgText = read(join(root, "package.json"));
  if (pkgText !== null) {
    let pkg = null;
    try { pkg = JSON.parse(pkgText); } catch { stop("package.json이 깨진 JSON임", "스크립트를 추가할 수 없어 먼저 고쳐야 함"); }
    const sc = pkg?.scripts || {};
    for (const k of ["baton:status", "baton:check"]) {
      if (sc[k] && !String(sc[k]).includes("scripts/baton/")) stop(`package.json에 "${k}" 스크립트가 다른 내용으로 있음`, "덮어쓰지 않고 이름을 어떻게 할지 물어봄");
    }
    if (sc.verify) note(`package.json에 "verify"가 이미 있어요 → 덮어쓰지 않고 그대로 써요`);
  }

  // 하위 폴더 규칙 파일, 전역 audit을 가리는 프로젝트 파일
  const list = top
    ? (git(["ls-files", "-co", "--exclude-standard"], root) || "").split("\n")
    : [...walk(root)].map((f) => relative(root, f).split(sep).join("/")).filter((r) => !/(^|\/)(node_modules|\.git|Library)\//.test(r));
  const nested = list.filter((r) => /\/(AGENTS|CLAUDE)\.md$/.test(r));
  if (nested.length) note(`하위 폴더에 규칙 파일이 있어요 (건드리지 않음): ${nested.slice(0, 3).join(", ")}`);
  const shadow = [".claude/agents/deep-audit.md", ".claude/commands/audit-all.md", ".claude/commands/audit-security.md", ".claude/commands/audit-perf.md"]
    .filter((r) => existsSync(join(root, r)));
  if (shadow.length) note(`프로젝트 안의 ${shadow.join(", ")}이(가) 전역 audit보다 우선해요`);
}

// ---------- update ----------
function update() {
  let root = cwd;
  while (!MARK.test(read(join(root, "AGENTS.md")) || "")) {
    const up = dirname(root);
    if (up === root) { stop("baton이 설치된 프로젝트가 아님", "설치 지침으로 설치해야 함"); return; }
    root = up;
  }
  const top = git(["rev-parse", "--show-toplevel"], root);
  if (!top) { note("Git 저장소가 아니에요 → 파일마다 차이를 보여주고 승인받아 고치고, 고치기 전 사본(.before-baton)을 남겨요"); return; }
  gitState(root);
  if (branchExists("baton-update", root).includes("baton-update")) stop("baton-update 브랜치가 이미 있음", "먼저 합치거나 지워야 함");
  const base = defaultBranch(root);
  const prefix = relative(real(top), real(root)).split(sep).join("/");
  const at = (r) => (prefix ? `${prefix}/${r}` : r);
  if (!base) stop("기본 브랜치를 찾지 못함", "어느 브랜치를 기준으로 할지 정해야 함");
  else if (!MARK.test(git(["show", `${base}:${at("AGENTS.md")}`], root) || "")) {
    stop(`${base}에 baton이 아직 합쳐지지 않음`, "설치 브랜치를 먼저 합쳐야 함");
  }
}

// ---------- global ----------
function global() {
  const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const p = join(dir, "CLAUDE.md");
  if (isLink(p)) { stop("전역 CLAUDE.md가 다른 파일을 가리키는 링크임", "링크 대상이 바뀌므로 어떻게 할지 정해야 함"); return; }
  const text = read(p);
  if (text === null) { note("전역 CLAUDE.md가 없어요 → 새로 만들어요"); return; }
  const starts = (text.match(/<!--\s*baton:global start\s*-->/g) || []).length;
  const ends = (text.match(/<!--\s*baton:global end\s*-->/g) || []).length;
  if (starts > 1) stop(`baton:global 블록이 ${starts}개 있음`, "하나만 남기고 나머지는 어떻게 할지 물어봄");
  if (starts !== ends) stop("baton:global 블록의 시작·끝 표시 짝이 안 맞음", "블록 범위를 사람이 확인해야 함");
  const outside = text.replace(/<!--\s*baton:global start\s*-->[\s\S]*?<!--\s*baton:global end\s*-->/g, "");
  const stray = outside.split(/\r?\n/).filter((l) => /^@\S*baton[\\/]GLOBAL_RULES\.md\s*$/.test(l.trim()));
  if (stray.length) stop(`블록 밖에 baton 불러오기 줄이 있음: ${stray.join(", ")}`, "중복으로 불러오게 되므로 지울지 물어봄");
  const home = homedir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  note(`고치기 전에 백업: ${p.replace(home, "~")} → ~/harness/baton/.backup/${stamp}/CLAUDE.md`);
}

if (mode === "install") install();
else if (mode === "update") update();
else if (mode === "global") global();
else {
  console.log("사용법: node ~/harness/baton/preflight.mjs <install | update | global>");
  process.exit(2);
}

const label = { install: "설치 전", update: "업데이트 전", global: "전역 설정 전" }[mode];
console.log(`[preflight] baton ${label} 사전 검사`);
for (const s of stops) console.log(`[멈춤] ${s}`);
for (const n of notes) console.log(`[알림] ${n}`);
if (stops.length) {
  console.log(`결과: 멈춤 ${stops.length}개 → 아무것도 바꾸지 말고, 위 항목을 한 번에 보여주고 사용자에게 물어보세요.`);
  process.exit(1);
}
console.log("결과: 멈출 항목 없음 → 진행해도 됩니다.");
