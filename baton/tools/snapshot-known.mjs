#!/usr/bin/env node
// 옛 버전 줄 스냅숏 만들기 (harness 전용, 프로젝트에 복사하지 않음). 읽기 전용 + baton/known-history.json 한 파일만 쓴다.
//   node ~/harness/baton/tools/snapshot-known.mjs
//
// 왜: known.mjs는 "baton·audit 원본의 어느 버전에도 없던 줄 = 사용자가 쓴 줄"로 판정한다.
// 원본의 과거 버전은 Git 이력에서 읽는데, 이력이 없는 사본(압축 파일, 새로 시작한 저장소)에서는 과거 버전을 모른다.
// 그래서 지금까지의 모든 과거 버전 줄을 이 파일에 모아 둔다. 이후 버전은 Git 이력에서 그대로 읽는다.
// 같은 경로 기준이다(이름이 바뀐 파일은 옛 이름 그대로 기록). 이미 있는 스냅숏의 줄은 지우지 않고 합친다.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HARNESS, HISTORY_FILE, norm } from "../known.mjs";

const PREFIXES = ["baton/files", "audit/agents", "audit/commands"];
const git = (...a) => execFileSync("git", ["-C", HARNESS, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });

const out = {};
if (existsSync(HISTORY_FILE)) {
  for (const [p, lines] of Object.entries(JSON.parse(readFileSync(HISTORY_FILE, "utf8")).files || {})) out[p] = new Set(lines);
}
const paths = new Set(git("log", "--format=", "--name-only", "--", ...PREFIXES).split("\n").filter(Boolean));
for (const p of paths) {
  const set = out[p] || (out[p] = new Set());
  for (const sha of git("log", "--format=%H", "--", p).split("\n").filter(Boolean)) {
    let text;
    try { text = git("show", `${sha}:${p}`); } catch { continue; } // 그 커밋에서 지워진 경우
    for (const l of text.replace(/\r\n/g, "\n").split("\n")) if (norm(l).trim()) set.add(norm(l));
  }
}
const files = Object.fromEntries(Object.keys(out).sort().map((p) => [p, [...out[p]].sort()]));
const doc = {
  note: "baton/tools/snapshot-known.mjs가 만든 파일. 원본의 과거 버전에 있던 줄 목록(사용자 줄 판정용). 손으로 고치지 않는다.",
  files,
};
writeFileSync(HISTORY_FILE, JSON.stringify(doc, null, 1) + "\n");
const n = Object.values(files).reduce((a, l) => a + l.length, 0);
console.log(`${join("baton", "known-history.json")}: 파일 ${Object.keys(files).length}개, 줄 ${n}개`);
