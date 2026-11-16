// baton 블록 다루기 (harness 전용 공용 함수). place.mjs(설치)와 sync.mjs(업데이트)가 함께 쓴다.
// AGENTS.md·CLAUDE.md에서 baton은 <!-- baton:start --> ~ <!-- baton:end --> 블록 안만 관리한다.
// 블록 밖(사용자 내용)은 한 글자도 바꾸지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KIT, OWN_SECTION, knownLinesAt, norm } from "./known.mjs";

const START_RE = /^<!--\s*baton:start\s*-->[ \t]*$/gm;
const END_RE = /^<!--\s*baton:end\s*-->[ \t]*$/gm;
const OLD_MARK = /<!--\s*baton\s+v\d+\s*-->/;
const lf = (s) => s.replace(/\r\n/g, "\n");

export const kitBlock = (file) => lf(readFileSync(join(KIT, file), "utf8")).replace(/\n*$/, "\n");

// 블록 위치. 없으면 null, 표시가 깨졌으면 { broken: 이유 }
export function findBlock(text) {
  const starts = [...text.matchAll(START_RE)];
  const ends = [...text.matchAll(END_RE)];
  if (!starts.length && !ends.length) return null;
  if (starts.length !== 1 || ends.length !== 1) return { broken: `블록 표시가 ${starts.length}개/${ends.length}개 (시작/끝)` };
  const s = starts[0].index;
  const e = ends[0].index + ends[0][0].length;
  if (e <= s) return { broken: "블록 끝 표시가 시작보다 앞에 있음" };
  return { start: s, end: e };
}

// 블록 안에서 baton 원본 어느 버전에도 없는 줄(= 사용자가 블록 안에 직접 쓴 줄)
function userLinesIn(file, blockText) {
  const known = knownLinesAt(`baton/files/${file}`);
  return blockText.split("\n").map(norm).filter((l) => l.trim() && !known.has(l));
}

// 옛 CLAUDE.md(블록 이전): 맨 앞이 baton 원본 줄(과 빈 줄)로만 이뤄지고 그 안에 @AGENTS.md가 있으면 그 부분이 baton 몫
function oldClaudeHeader(text) {
  const known = knownLinesAt("baton/files/CLAUDE.md");
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length && (!lines[i].trim() || known.has(norm(lines[i])))) i++;
  const head = lines.slice(0, i).join("\n");
  return /^@AGENTS\.md\s*$/m.test(head) ? { head, rest: lines.slice(i).join("\n") } : null;
}

// 새 내용을 계산한다. mode: "install"(블록이 없으면 맨 위에 끼움) | "update"(블록만 교체, 옛 형식은 전환)
// 돌려주는 값: { next } 또는 { hold: 이유, lines: 걸린 줄, choices: 고를 수 있는 처리 }. 블록 밖 사용자 내용은 그대로 둔다.
// choice(사용자가 고른 처리, 업데이트 때만):
//   "keep"    걸린 줄(사용자가 쓴 줄)을 블록 밖으로 옮겨 지킨다
//   "replace" 걸린 줄은 버리고 새 버전으로 (옛 baton 문구일 때)
const MOVED = (file) => (file === "AGENTS.md" ? "## 프로젝트 고유 규칙 (baton 부분에 있던 줄을 옮김)" : "## 직접 추가한 규칙 (baton 부분에 있던 줄을 옮김)");
export function planBlock(file, cur, mode, choice) {
  const block = kitBlock(file);
  if (cur === null) return { next: block, how: "새로 만듦" };
  const crlf = cur.includes("\r\n");
  const c = lf(cur);
  const out = (t) => (crlf ? t.replace(/\n/g, "\r\n") : t);
  const b = findBlock(c);
  if (b?.broken) return { hold: `${file}의 baton ${b.broken} → 사람이 확인해야 함` };
  if (b) {
    if (mode === "install") return { hold: `${file}에 이미 baton 블록이 있음 → 설치 대신 업데이트` };
    const mine = userLinesIn(file, c.slice(b.start, b.end));
    if (mine.length && !choice) return { hold: `${file}의 baton 블록 안에 직접 쓴 줄 ${mine.length}개 → 블록 밖으로 옮길지 확인 필요`, lines: mine, choices: ["keep", "replace"] };
    const moved = mine.length && choice === "keep" ? `\n\n${MOVED(file)}\n\n${mine.join("\n")}` : "";
    const next = c.slice(0, b.start) + block.replace(/\n$/, "") + moved + c.slice(b.end);
    return { next: out(next), how: next === c ? "같음" : mine.length ? `블록 교체 (직접 쓴 줄 ${mine.length}개: ${choice === "keep" ? "블록 밖으로 옮김" : "버림"})` : "블록 교체" };
  }
  // 블록이 없는 경우
  if (mode === "install") {
    if (file === "AGENTS.md" && OLD_MARK.test(c)) return { hold: "AGENTS.md가 옛 형식 baton → 설치 대신 업데이트" };
    return { next: out(block + "\n" + c), how: "맨 위에 블록 추가" };
  }
  // update: 옛 형식(블록 이전) 전환
  if (file === "AGENTS.md") {
    if (!OLD_MARK.test(c)) return { hold: "AGENTS.md에 baton 블록도 옛 표시도 없음 → 사람이 확인해야 함", legacy: true };
    const m = c.match(OWN_SECTION);
    const pre = m ? c.slice(0, m.index) : c;
    const known = knownLinesAt("baton/files/AGENTS.md");
    const mine = pre.split("\n").map(norm).filter((l) => l.trim() && !known.has(l));
    if (mine.length && !choice) return { hold: `옛 형식 AGENTS.md의 baton 부분에 직접 쓴 줄 ${mine.length}개 → 프로젝트 고유 규칙으로 옮길지 확인 필요`, legacy: true, lines: mine, choices: ["keep", "replace"] };
    const moved = mine.length && choice === "keep" ? `\n${MOVED(file)}\n\n${mine.join("\n")}\n` : "";
    return { next: out(block + moved + (m ? "\n" + c.slice(m.index) : "")), how: `옛 형식 → 블록 방식 전환${mine.length ? ` (직접 쓴 줄 ${mine.length}개: ${choice === "keep" ? "블록 밖으로 옮김" : "버림"})` : ""}`, legacy: true };
  }
  const old = oldClaudeHeader(c);
  if (!old) {
    // 어느 줄이 옛 baton 문구인지 알 수 없으므로 "keep"(기존 내용 그대로 두고 맨 위에 블록만 추가)만 고를 수 있다
    if (choice === "keep") return { next: out(block + "\n" + c), how: "맨 위에 블록 추가 (기존 내용은 그대로)", legacy: true };
    return { hold: "CLAUDE.md에 baton 블록이 없고 옛 baton 머리말도 못 찾음 → 기존 내용은 두고 맨 위에 블록만 추가할지 확인 필요", legacy: true, lines: c.split("\n").filter((l) => l.trim()).slice(0, 5), choices: ["keep"] };
  }
  const rest = old.rest.replace(/^\n+/, "");
  return { next: out(block + (rest ? "\n" + rest : "")), how: "옛 형식 → 블록 방식 전환", legacy: true };
}

// 옛 형식 STATUS.md(루트, baton 양식)인지
const STATUS_HEADINGS = ["## Overview", "## Run / Development", "## Constraints & Anti-patterns", "## Important Decisions"];
export function isBatonStatus(text) {
  const c = lf(text);
  return STATUS_HEADINGS.filter((h) => c.includes(h)).length >= 3;
}
const ORIGINAL_STATUS = /^##\s*기존 STATUS\.md \(원문\)[^\n]*\n/m;
export const hasOriginalStatusSection = (text) => ORIGINAL_STATUS.test(lf(text));
// 옛 설치가 섞어 둔 STATUS.md를 나눈다: baton 부분 → tasks/STATUS.md, 원문 섹션 내용 → 루트 STATUS.md (원문 그대로)
export function splitStatus(text) {
  const c = lf(text);
  const m = c.match(ORIGINAL_STATUS);
  return { baton: c.slice(0, m.index).replace(/\n*$/, "\n"), original: c.slice(m.index + m[0].length).replace(/^\n+/, "") };
}
