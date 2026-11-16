#!/usr/bin/env node
// baton 파일 배치 (설치 4단계). harness 전용, 프로젝트 루트에서 실행한다.
//   node ~/harness/baton/place.mjs            배치할 내용만 보여준다 (아무것도 안 바꿈)
//   node ~/harness/baton/place.mjs --apply    배치한다
//
// 원칙: 이미 있는 파일은 덮어쓰지 않는다.
//   - AGENTS.md, CLAUDE.md: 없으면 만들고, 있으면 맨 위에 baton 블록(<!-- baton:start --> ~ end)만 끼운다. 기존 내용은 그대로.
//   - .claude/settings.json(Claude)·.codex/hooks.json(Codex): 없으면 만들고, 있으면 SessionStart에 baton 훅 하나만 더한다. 기존 항목은 그대로.
//   - 그 밖의 키트 파일(tasks/, scripts/baton/, docs/baton/, task 명령, verifier): 없을 때만 복사. 있으면 건너뛰고 알린다.
// 안전: 사전 검사(preflight.mjs install)를 먼저 통과해야 하고, main/master 브랜치에서는 실행하지 않는다(설치 브랜치에서).
// 네트워크를 쓰지 않는다. 기존 사용자 파일의 내용은 바꾸지 않는다(블록·훅 추가만).
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { KIT } from "./known.mjs";
import { planBlock } from "./blocks.mjs";

const apply = process.argv.includes("--apply");
const root = resolve(process.cwd());
const git = (args) => { try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };

const branch = git(["branch", "--show-current"]);
if (branch && ["main", "master"].includes(branch)) {
  console.log(`[place] ${branch} 브랜치에서는 배치하지 않습니다. 설치 브랜치(task/baton-setup)에서 실행하세요.`);
  process.exit(1);
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}
const files = [...walk(KIT)].map((f) => relative(KIT, f).split(sep).join("/")).sort();
// 훅 파일: 키트의 SessionStart 항목(첫 그룹)을 그대로 덧붙인다
const HOOK_FILES = [".claude/settings.json", ".codex/hooks.json"];
const plan = []; // { rel, how, write?: string, copy?: bool }
const held = [];

for (const rel of files) {
  const dest = join(root, rel);
  const cur = existsSync(dest) ? readFileSync(dest, "utf8") : null;
  if (rel === "AGENTS.md" || rel === "CLAUDE.md") {
    const r = planBlock(rel, cur, "install");
    if (r.hold) held.push(r.hold);
    else plan.push({ rel, how: r.how, write: r.next });
    continue;
  }
  if (HOOK_FILES.includes(rel) && cur !== null) {
    let s;
    try { s = JSON.parse(cur); } catch { held.push(`${rel}이 깨진 JSON → 먼저 고쳐야 함`); continue; }
    const groups = s.hooks?.SessionStart || [];
    if (groups.flatMap((g) => g.hooks || []).some((h) => String(h.command || "").includes("scripts/baton/status.mjs"))) {
      plan.push({ rel, how: "baton 훅이 이미 있음 (그대로)" });
      continue;
    }
    const kitGroup = JSON.parse(readFileSync(join(KIT, rel), "utf8")).hooks.SessionStart[0];
    s.hooks = s.hooks || {};
    s.hooks.SessionStart = [...groups, kitGroup];
    const indent = (cur.match(/^[ \t]+(?=")/m) || ["  "])[0];
    plan.push({ rel, how: "SessionStart에 baton 훅만 추가 (기존 항목 그대로)", write: JSON.stringify(s, null, indent) + "\n" });
    continue;
  }
  if (cur !== null) { plan.push({ rel, how: "이미 있음 → 건드리지 않음" }); continue; }
  plan.push({ rel, how: "복사", copy: true });
}

const out = [`[place] baton 파일 배치 ${apply ? "" : "(미리보기, 아무것도 안 바꿈)"}`];
for (const p of plan) if (p.how !== "복사") out.push(`- ${p.rel}: ${p.how}`);
const copies = plan.filter((p) => p.copy).map((p) => p.rel);
if (copies.length) out.push(`- 새로 복사: ${copies.length}개 (${copies.slice(0, 4).join(", ")}${copies.length > 4 ? " 외" : ""})`);
for (const h of held) out.push(`[멈춤] ${h}`);
if (held.length) {
  out.push("결과: 멈춤 항목이 있어 아무것도 바꾸지 않았습니다. 사용자에게 물어보세요.");
  console.log(out.join("\n"));
  process.exit(1);
}
if (!apply) {
  out.push("적용하려면: node ~/harness/baton/place.mjs --apply");
  console.log(out.join("\n"));
  process.exit(0);
}
for (const p of plan) {
  const dest = join(root, p.rel);
  if (p.copy) { mkdirSync(dirname(dest), { recursive: true }); copyFileSync(join(KIT, p.rel), dest); }
  else if (p.write !== undefined) { mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, p.write); }
}
// 설치한 프로젝트를 baton/projects.local.txt에 기억 (sync.mjs가 세션 기록 없이도 찾도록)
{
  const listFile = process.env.BATON_PROJECTS_FILE || join(dirname(KIT), "projects.local.txt"); // 시험 때 격리용
  const prev = existsSync(listFile) ? readFileSync(listFile, "utf8") : "# baton이 설치된 프로젝트 (sync.mjs·place.mjs가 자동으로 추가. 한 줄에 폴더 하나, # 뒤는 메모)\n";
  const norm = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
  const has = prev.split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim()).filter(Boolean)
    .some((l) => norm(resolve(l.replace(/^~(?=$|[\\/])/, homedir()))) === norm(root));
  if (!has) writeFileSync(listFile, prev.replace(/\n*$/, "\n") + root + "\n");
}
out.push("결과: 배치했습니다. 기존 파일은 블록·훅 추가 말고는 바꾸지 않았습니다. 다음: tasks/STATUS.md 채우기(설치 지침 5단계).");
console.log(out.join("\n"));
