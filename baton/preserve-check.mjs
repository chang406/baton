#!/usr/bin/env node
// 보존 확인: baton 설치·업데이트 뒤, 원래 있던 문서의 줄이 사라지지 않았는지 기계적으로 확인한다.
// 읽기 전용. harness에만 두고 프로젝트에 복사하지 않는다.
//
// 사용법 (프로젝트 루트에서): node ~/harness/baton/preserve-check.mjs <기준>
//   기준 = 설치·업데이트 직전 상태의 커밋이나 브랜치 (예: main, 설치 전 커밋). 비우면 HEAD.
// 비교 대상: 기준에 있던 .md 파일, .gitignore, .json 파일 중, 지금(작업 폴더) 내용이 바뀌었거나 없어진 것.
// JSON(.claude/settings.json, package.json 등)은 줄이 아니라 키·값으로 본다: 원래 있던 키 경로와 값이 모두 남아 있어야 하고,
//   배열은 원래 원소가 모두 남아 있으면 된다(뒤에 추가는 정상). baton 자신의 항목("scripts/baton/"을 담은 값)은 바뀌어도 된다.
// 사라진 줄: 기준에 있던 줄 중 지금 같은 파일에 글자 그대로 없는 줄.
//   baton 원본의 옛 문구(known.mjs: harness 이력 속 모든 버전)는 업데이트로 바뀌는 게 정상이라 제외한다.
// 사라진 줄이 하나라도 있으면 exit 1 → 커밋하지 말고 사용자에게 보여준다.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { knownLines, norm } from "./known.mjs";

const git = (args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
};
// --to <브랜치>: 작업 폴더 대신 그 브랜치의 내용과 비교 (예: main --to baton-update)
const toIdx = process.argv.indexOf("--to");
const to = toIdx >= 0 ? process.argv[toIdx + 1] : null;
const base = (process.argv[2] && process.argv[2] !== "--to" ? process.argv[2] : null) || "HEAD";
if (!git(["rev-parse", "--show-toplevel"])) {
  console.log("[preserve-check] Git 저장소가 아닙니다. 바꾸기 전 내용을 따로 보관해 직접 비교하세요.");
  process.exit(2);
}
if (to && git(["rev-parse", "--verify", "-q", `${to}^{commit}`]) === null) {
  console.log(`[preserve-check] 비교할 "${to}"를 찾지 못했습니다.`);
  process.exit(2);
}
if (git(["rev-parse", "--verify", "-q", `${base}^{commit}`]) === null) {
  console.log(`[preserve-check] 기준 "${base}"을 찾지 못했습니다.`);
  process.exit(2);
}

const root = resolve(process.cwd());
const changed = (git(["diff", "--name-only", "--relative", base, ...(to ? [to] : []), "--", "."]) || "")
  .split("\n").filter(Boolean)
  .filter((p) => /\.(md|json)$/i.test(p) || p.split("/").pop() === ".gitignore");

// a(원래)의 내용이 b(지금)에 모두 들어 있는지. 빠진 키 경로 목록을 돌려준다.
const isBaton = (v) => JSON.stringify(v).includes("scripts/baton/");
function missing(a, b, path = "") {
  if (isBaton(a)) return [];
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return [path || "(최상위)"];
    return a.flatMap((el, i) => (b.some((x) => missing(el, x).length === 0) ? [] : [`${path}[${i}]`]));
  }
  if (a && typeof a === "object") {
    if (!b || typeof b !== "object" || Array.isArray(b)) return [path || "(최상위)"];
    return Object.keys(a).flatMap((k) => (k in b ? missing(a[k], b[k], path ? `${path}.${k}` : k) : [path ? `${path}.${k}` : k]));
  }
  return a === b ? [] : [path || "(최상위)"];
}

// 옛 설치 때 baton이 만든 제목 줄 (STATUS 나누기에서 빠지는 게 정상)
const BATON_MADE = /^##\s*기존 STATUS\.md \(원문\)/;
// 지금 내용: --to가 있으면 그 브랜치에서, 없으면 작업 폴더에서
const readNow = (p) => (to ? git(["show", `${to}:./${p}`]) : existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null);
// 옮겨진 파일(예: STATUS.md → tasks/STATUS.md)을 위해: 없어진 파일의 줄은 바뀐 파일 전체에서 찾는다
const union = new Set();
for (const q of changed) {
  const t = readNow(q) || "";
  for (const l of t.replace(/\r\n/g, "\n").split("\n")) union.add(norm(l));
}
const report = [];
let total = 0;
for (const p of changed) {
  const orig = git(["show", `${base}:./${p}`]);
  if (orig === null) continue; // 기준에 없던 새 파일
  const now = readNow(p);
  if (/\.json$/i.test(p)) {
    let a, b;
    try { a = JSON.parse(orig); } catch { continue; } // 원래부터 깨진 JSON은 비교하지 않음
    let lostKeys;
    if (now === null) lostKeys = ["(파일이 없어짐)"];
    else {
      try { b = JSON.parse(now); lostKeys = missing(a, b); } catch { lostKeys = ["(JSON이 깨짐)"]; }
    }
    if (!lostKeys.length) continue;
    total += lostKeys.length;
    report.push(`- ${p}: 사라지거나 바뀐 항목 ${lostKeys.length}개`);
    for (const k of lostKeys.slice(0, 5)) report.push(`    | ${k}`);
    if (lostKeys.length > 5) report.push(`    | … 외 ${lostKeys.length - 5}개`);
    continue;
  }
  const nowSet = now === null ? union : new Set(now.replace(/\r\n/g, "\n").split("\n").map(norm));
  const known = knownLines(p);
  const lost = orig.replace(/\r\n/g, "\n").split("\n").map(norm)
    .filter((l) => l.trim() && !nowSet.has(l) && !known.has(l) && !BATON_MADE.test(l));
  if (!lost.length) continue;
  total += lost.length;
  report.push(`- ${p}: ${now === null ? "파일이 없어지고 다른 곳에도 없는 " : "사라진 "}줄 ${lost.length}개`);
  for (const l of lost.slice(0, 5)) report.push(`    | ${l.length > 80 ? l.slice(0, 80) + "…" : l}`);
  if (lost.length > 5) report.push(`    | … 외 ${lost.length - 5}줄`);
}

if (!total) {
  console.log(`[preserve-check] OK — ${base} 대비 원래 있던 줄이 모두 남아 있습니다 (확인한 파일 ${changed.length}개).`);
  process.exit(0);
}
console.log(`[preserve-check] ${base} 대비 사라진 줄이 있습니다. 커밋하지 말고 사용자에게 보여주세요.`);
console.log(report.join("\n"));
console.log(`합계: ${total}개. 원래 내용은 원문 그대로 남겨야 합니다 (AGENTS.md·CLAUDE.md는 baton 블록 밖에 그대로, JSON은 기존 키·값 유지).`);
process.exit(1);
