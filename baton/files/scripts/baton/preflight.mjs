#!/usr/bin/env node
// 작업 시작·끝내기 전 사전 검사. 읽기 전용, 네트워크 없음 (원격 브랜치는 마지막으로 받아온 기준).
//
//   node scripts/baton/preflight.mjs start <id>    START에서 브랜치·ACTIVE.md를 만들기 전
//   node scripts/baton/preflight.mjs finish <id>   FINISH에서 archive로 옮기기 전
//
// [멈춤]이 하나라도 있으면 exit 1 → 그 자리에서 멈추고, 모든 항목을 한 번에 보여주고 사용자에게 묻는다.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { git, isIdle, findBatonRoot } from "./lib.mjs";

const [mode, id] = process.argv.slice(2);
const stops = [];
const notes = [];
const stop = (what, then) => stops.push(then ? `${what} → ${then}` : what);
const note = (what) => notes.push(what);

if (!["start", "finish"].includes(mode) || !id) {
  console.log("사용법: node scripts/baton/preflight.mjs <start | finish> <작업 id>");
  process.exit(2);
}
const root = findBatonRoot();
const activePath = join(root, "tasks", "ACTIVE.md");
const active = existsSync(activePath) ? readFileSync(activePath, "utf8") : null;

if (!git("rev-parse", "--show-toplevel")) {
  stop("Git 저장소가 아님", "baton은 Git으로 기록하므로 먼저 Git을 만들지 물어봐야 함");
} else if (mode === "start") {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) stop(`작업 id "${id}"가 형식(영어 소문자-하이픈, 예: login-redirect)에 안 맞음`, "다른 id를 정해야 함");
  if (active !== null && !isIdle(active)) {
    const title = (active.match(/^#\s*ACTIVE:\s*(.+)$/m) || [])[1]?.trim() || "(제목 없음)";
    stop(`진행 중인 작업이 있음: ${title}`, "이어서 할지, 보관하고 새로 시작할지 정해야 함");
  }
  const name = `task/${id}`;
  const local = git("rev-parse", "--verify", "-q", `refs/heads/${name}`) ? [name] : [];
  const remote = git("for-each-ref", "--format=%(refname:short)", "refs/remotes").split("\n").filter((r) => r.endsWith(`/${name}`));
  if (local.length || remote.length) stop(`같은 이름의 브랜치가 이미 있음: ${[...local, ...remote].join(", ")}`, "그 작업을 이어갈지, 다른 id를 쓸지 정해야 함");
  const gp = (n) => { const p = git("rev-parse", "--git-path", n); return p && existsSync(resolve(p)); };
  if (gp("MERGE_HEAD") || gp("rebase-merge") || gp("rebase-apply") || gp("CHERRY_PICK_HEAD")) stop("병합·리베이스 등이 진행 중", "먼저 끝내거나 취소해야 함");
  const dirty = git("status", "--porcelain").split("\n").filter(Boolean);
  if (dirty.length) stop(`커밋 안 된 변경 ${dirty.length}개`, "새 작업에 포함할지, 먼저 정리할지 정해야 함");
  const branch = git("branch", "--show-current");
  const def = (git("symbolic-ref", "--short", "refs/remotes/origin/HEAD") || "").replace(/^origin\//, "")
    || ["main", "master"].find((b) => git("rev-parse", "--verify", "-q", `refs/heads/${b}`)) || "";
  if (/^task\//.test(branch) && def && git("rev-list", "--count", `${def}..HEAD`) !== "0") {
    stop(`아직 ${def}에 안 합친 ${branch} 위에 있음`, "먼저 합칠지, 이 위에서 이어 만들지 정해야 함");
  }
} else {
  const activeId = active && (active.match(/^ID:\s*([^\s<]+)/m) || [])[1];
  if (!activeId) stop("tasks/ACTIVE.md에서 진행 중인 작업 ID를 찾지 못함", "어느 작업을 끝내는지 확인해야 함");
  else if (activeId !== id) stop(`ACTIVE.md의 작업(${activeId})과 끝내려는 작업(${id})이 다름`, "어느 작업을 끝내는지 확인해야 함");
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  let file = `${date}-${id}.md`;
  for (let n = 2; existsSync(join(root, "tasks", "archive", file)); n++) file = `${date}-${id}-${n}.md`;
  if (file !== `${date}-${id}.md`) note(`tasks/archive/${date}-${id}.md가 이미 있어요 → 덮어쓰지 않고 tasks/archive/${file}로 옮겨요`);
  else note(`보관할 이름: tasks/archive/${file}`);
}

console.log(`[preflight] ${mode === "start" ? "작업 시작" : "작업 끝내기"} 전 사전 검사 (${id})`);
for (const s of stops) console.log(`[멈춤] ${s}`);
for (const n of notes) console.log(`[알림] ${n}`);
if (stops.length) {
  console.log(`결과: 멈춤 ${stops.length}개 → 아무것도 바꾸지 말고, 위 항목을 한 번에 보여주고 사용자에게 물어보세요.`);
  process.exit(1);
}
console.log("결과: 멈출 항목 없음 → 진행해도 됩니다.");
