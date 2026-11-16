#!/usr/bin/env node
// baton 설치 상태 진단. 항목마다 [x](정상) / [ ](문제)로 보여준다.
// 읽기 전용: 파일이나 Git 상태를 바꾸지 않는다. 하위 폴더에서 실행해도 결과가 같다.
// 하나라도 [ ]가 있으면 exit 1. check-active 결과는 참고로만 보여주고 판정에 넣지 않는다.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { git, findBatonRoot } from "./lib.mjs";

const MIN_NODE = 18;
const REQUIRED = [
  "AGENTS.md", "CLAUDE.md", "STATUS.md",
  "tasks/ACTIVE.md", "tasks/_TEMPLATE.md", "tasks/archive",
  ".claude/commands/task-start.md", ".claude/commands/task-resume.md",
  ".claude/commands/task-handoff.md", ".claude/commands/task-finish.md",
  ".claude/agents/baton-verifier.md",
  "scripts/baton/lib.mjs", "scripts/baton/status.mjs",
  "scripts/baton/check-active.mjs", "scripts/baton/scan-secrets.mjs",
  "docs/baton/README.md",
];

const root = findBatonRoot();
const cwd = resolve(process.cwd());
const lines = [];
let failures = 0;
function check(ok, label, detail = "") {
  if (!ok) failures++;
  lines.push(`[${ok ? "x" : " "}] ${label}${detail ? ` — ${detail}` : ""}`);
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

// baton 파일은 커밋돼야 한다 (인계 기록·작업 방식 설정). 개인 설정은 반대로 제외돼야 한다.
const PERSONAL = [".claude/settings.local.json", "CLAUDE.local.md", ".claude/worktrees/"];
if (top) {
  const present = REQUIRED.filter((f) => existsSync(join(root, f)));
  const ignored = git("-C", root, "check-ignore", "--no-index", ...present).split("\n").filter(Boolean);
  check(!ignored.length, "baton 파일이 Git 제외 목록에 없음",
    ignored.length ? `제외됨: ${ignored.join(", ")} — 작업 방식 설정이라 커밋해야 함 (git check-ignore -v로 원인 확인)` : "");
  const probe = (p) => (p.endsWith("/") ? `${p}x` : p);
  const notIgnored = PERSONAL.filter((p) => !git("-C", root, "check-ignore", "--no-index", probe(p)));
  const tracked = git("-C", root, "ls-files", "--", ...PERSONAL).split("\n").filter(Boolean);
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
check(!!hookCmd, "SessionStart 훅 등록", hookCmd || settingsErr);

// 훅 command에서 스크립트 경로를 꺼내 $CLAUDE_PROJECT_DIR을 프로젝트 루트로 바꾼다
function hookTarget(cmd) {
  const m = cmd.match(/node(?:\.exe)?\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (!m) return null;
  return (m[1] || m[2] || m[3])
    .replace(/\$\{CLAUDE_PROJECT_DIR\}|\$CLAUDE_PROJECT_DIR|%CLAUDE_PROJECT_DIR%/g, root);
}
const target = hookCmd ? hookTarget(hookCmd) : null;
const fromRoot = target && resolve(root, target);
check(!!fromRoot && existsSync(fromRoot), "훅 경로 (프로젝트 루트 기준)",
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
check(subOk, "하위 폴더에서 훅 실행", subDetail);

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
console.log(`\n결과: ${failures ? `문제 ${failures}개` : "모두 정상"}`);
process.exit(failures ? 1 : 0);
