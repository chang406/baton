// harness 전용 공용 함수 (프로젝트에 복사하지 않음). baton/sync.mjs, baton/preserve-check.mjs, audit/install.mjs가 쓴다.
// "사용자가 직접 쓴 줄" 판정: baton 원본(baton/files/)의 현재본과 harness Git 이력 속 모든 과거본에
// 한 번도 나온 적 없는 줄이면 사용자가 쓴 줄로 본다. 추측(특정 단어가 있나)이 아니라 이력으로 판정한다.
// 과거본은 known-history.json(지금까지의 스냅숏, tools/snapshot-known.mjs)과 Git 이력 두 곳에서 읽는다.
// 둘 다 없으면 현재본만 알고, 옛 문구도 사용자 줄로 보아 더 조심하게 동작한다.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HARNESS = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const KIT = join(HARNESS, "baton", "files");
// AGENTS.md 끝의 프로젝트 고유 규칙 섹션. 번호가 없거나 달라도 찾는다.
export const HISTORY_FILE = join(HARNESS, "baton", "known-history.json");
export const OWN_SECTION = /^##\s*(?:\d+\.\s*)?프로젝트 고유 규칙/m;

export const norm = (l) => l.replace(/\r$/, "").trimEnd();
const lf = (s) => s.replace(/\r\n/g, "\n");

function hgit(args) {
  try {
    return execFileSync("git", ["-C", HARNESS, ...args], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

const cache = new Map();
let snapshot;
function snapshotLines(hpath) {
  if (snapshot === undefined) {
    try { snapshot = JSON.parse(readFileSync(HISTORY_FILE, "utf8")).files || {}; } catch { snapshot = {}; }
  }
  return snapshot[hpath] || [];
}
// hpath: harness 안의 원본 경로(예: "audit/agents/deep-audit.md"). 현재본 + 스냅숏 + Git 이력 속 모든 버전의 줄
export function knownLinesAt(hpath) {
  if (cache.has(hpath)) return cache.get(hpath);
  const set = new Set();
  const add = (text) => { for (const l of lf(text).split("\n")) set.add(norm(l)); };
  const cur = join(HARNESS, hpath);
  if (existsSync(cur)) add(readFileSync(cur, "utf8"));
  for (const l of snapshotLines(hpath)) set.add(l);
  const shas = (hgit(["log", "--format=%H", "--", hpath]) || "").split("\n").filter(Boolean);
  for (const s of shas) {
    const t = hgit(["show", `${s}:${hpath}`]);
    if (t !== null) add(t);
  }
  cache.set(hpath, set);
  return set;
}
// rel: 프로젝트 루트 기준 baton 파일 경로(예: "AGENTS.md", "scripts/baton/lib.mjs")
export const knownLines = (rel) => knownLinesAt(`baton/files/${rel}`);

export const isKitFile = (rel) => existsSync(join(KIT, rel)) || knownLines(rel).size > 1;

// text 안에서 baton 원본 어느 버전에도 없는 줄(= 사용자가 쓴 줄). AGENTS.md는 고유 규칙 섹션 앞부분만 본다.
export function userLines(rel, text) {
  let t = lf(text);
  if (rel === "AGENTS.md") {
    const m = t.match(OWN_SECTION);
    if (m) t = t.slice(0, m.index);
  }
  const known = knownLines(rel);
  return t.split("\n").map(norm).filter((l) => l.trim() && !known.has(l));
}
