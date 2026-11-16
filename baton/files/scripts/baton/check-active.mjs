#!/usr/bin/env node
// ACTIVE.md 필수 항목 검사 (Handoff Linter).
// 기본은 경고만 하고 항상 성공(exit 0)한다. 급할 때 checkpoint를 막지 않기 위해서다.
// --strict 를 붙이면 빠진 항목이 있을 때 실패(exit 1)한다.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { section, isIdle, findBatonRoot } from "./lib.mjs";

const strict = process.argv.includes("--strict");
const path = join(findBatonRoot(), "tasks", "ACTIVE.md");

if (!existsSync(path)) {
  console.log("[check-active] tasks/ACTIVE.md 없음");
  process.exit(0);
}
const text = readFileSync(path, "utf8");
if (isIdle(text)) {
  console.log("[check-active] 진행 중인 작업 없음 — 검사 생략");
  process.exit(0);
}

const problems = [];
const required = ["Goal / Done Criteria", "Current State", "Failed Attempts", "Next Exact Step"];
for (const name of required) {
  const body = section(text, name);
  if (body === null) problems.push(`'## ${name}' 섹션이 없습니다.`);
  else if (!body.replace(/^[-*]\s*(\[ \])?\s*$/gm, "").trim()) problems.push(`'${name}'이(가) 비어 있습니다.`);
}
const next = section(text, "Next Exact Step") || "";
if (!/Why:\s*\S/.test(next)) problems.push("Next Exact Step에 'Why:' 이유가 없습니다.");
if (/<[^>]+>/.test((text.match(/^#\s*ACTIVE:.*$/m) || [""])[0])) problems.push("작업 제목이 아직 템플릿 그대로입니다.");
if (!/Last Writer:\s*[^<\s]/.test(text)) problems.push("Last Writer가 비어 있습니다.");

if (!problems.length) {
  console.log("[check-active] OK — 필수 항목이 모두 채워져 있습니다.");
  process.exit(0);
}
console.log("[check-active] 확인 필요:");
for (const p of problems) console.log(`  - ${p}`);
process.exit(strict ? 1 : 0);
