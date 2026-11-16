#!/usr/bin/env node
// baton 토큰 사용량 점검. harness 전용, 읽기 전용(파일·Git을 바꾸지 않고 네트워크를 쓰지 않는다).
//   node ~/harness/baton/cost.mjs [프로젝트 폴더]     (기본: 지금 폴더)
//
// 1) 세션마다 고정으로 들어가는 것: 요청마다 다시 보내진다(캐시로 비용은 줄어도 문맥 자리는 계속 차지).
// 2) 필요할 때만 들어가는 것: 그 절차·명령을 쓸 때만.
// 3) 실측: Claude Code·Codex 세션 기록의 "첫 요청 입력 토큰"(시스템 지시·도구 설명·규칙 파일이 다 들어간 크기)을
//    baton 프로젝트와 그 밖의 폴더로 나눠 중앙값을 비교한다. 대화 내용은 읽어서 보여주지 않는다.
// 토큰 수는 추정이다(영어·기호 약 4글자에 1토큰, 한국어 등은 1글자에 약 1토큰). 정확한 값은 3)의 실측을 본다.
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

const root = resolve(process.argv[2] || process.cwd());
const claudeHome = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
const MARK = /<!--\s*baton\s+v\d+\s*-->/;

const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
const tok = (t) => {
  if (!t) return 0;
  let ascii = 0, other = 0;
  for (const ch of t) (ch.charCodeAt(0) < 128 ? ascii++ : other++);
  return Math.round(ascii / 4 + other);
};
const kb = (t) => `${(Buffer.byteLength(t || "") / 1024).toFixed(1)}KB`;
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const expand = (p, base) => {
  const q = p.replace(/^~(?=$|[\\/])/, homedir());
  return isAbsolute(q) || /^[A-Za-z]:[\\/]/.test(q) ? q : join(base, q);
};
// CLAUDE.md의 "@경로" 줄을 따라간다 (Claude Code는 최대 4단계까지 불러온다)
function withImports(file, depth = 0, seen = new Set()) {
  const text = read(file);
  if (text === null || seen.has(resolve(file))) return [];
  seen.add(resolve(file));
  const parts = [{ file, text }];
  if (depth >= 4) return parts;
  for (const m of text.matchAll(/^@(\S+)\s*$/gm)) parts.push(...withImports(expand(m[1], dirname(file)), depth + 1, seen));
  return parts;
}
const blockOf = (t) => {
  const s = t.indexOf("<!-- baton:start -->"), e = t.indexOf("<!-- baton:end -->");
  return s >= 0 && e > s ? t.slice(s, e + "<!-- baton:end -->".length) : MARK.test(t) ? t : "";
};
const short = (p) => (p.startsWith(homedir()) ? "~" + p.slice(homedir().length) : p).split("\\").join("/");
const run = (script) => {
  if (!existsSync(script)) return "";
  try { return execFileSync(process.execPath, [script], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch (e) { return String(e.stdout || ""); }
};

const rows = []; // [구분, 항목, 텍스트, baton인가]
const add = (group, name, text, baton) => { if (text) rows.push({ group, name, text, baton }); };

// ---------- 1. 세션마다 고정 ----------
for (const part of withImports(join(claudeHome, "CLAUDE.md"))) {
  const isRules = /GLOBAL_RULES\.md$/.test(part.file);
  add("Claude 고정(모든 폴더)", short(part.file), part.text, isRules);
}
const projParts = withImports(join(root, "CLAUDE.md"));
for (const part of projParts) {
  const b = blockOf(part.text);
  add("Claude 고정(이 프로젝트)", `${short(part.file).split("/").pop()} — baton 블록`, b, true);
  add("Claude 고정(이 프로젝트)", `${short(part.file).split("/").pop()} — 블록 밖(프로젝트 규칙)`, b ? part.text.replace(b, "") : part.text, false);
}
const hook = run(join(root, "scripts", "baton", "status.mjs"));
add("Claude 고정(이 프로젝트)", "세션 시작 훅 출력(status.mjs)", hook, true);
const desc = (f) => ((read(f) || "").match(/^description:\s*(.*)$/m) || [])[1] || "";
const descs = [
  ...["task-start", "task-resume", "task-handoff", "task-finish"].map((n) => desc(join(root, ".claude", "commands", `${n}.md`))),
  desc(join(root, ".claude", "agents", "baton-verifier.md")),
].join("\n");
add("Claude 고정(이 프로젝트)", "명령·서브에이전트 목록 설명", descs, true);
for (const name of ["AGENTS.override.md", "AGENTS.md"]) {
  const t = read(join(codexHome, name));
  if (t) { add("Codex 고정(모든 폴더)", short(join(codexHome, name)), t, false); break; }
}
const agents = read(join(root, "AGENTS.md"));
if (agents) {
  const b = blockOf(agents);
  add("Codex 고정(이 프로젝트)", "AGENTS.md — baton 블록", b, true);
  add("Codex 고정(이 프로젝트)", "AGENTS.md — 블록 밖(프로젝트 규칙)", b ? agents.replace(b, "") : agents, false);
  add("Codex 고정(이 프로젝트)", "세션 시작 훅 출력(status.mjs)", hook, true);
}

// ---------- 2. 필요할 때만 ----------
const lazy = [
  ["tasks/STATUS.md (START·RESUME)", join(root, "tasks", "STATUS.md")],
  ["tasks/ACTIVE.md (START·RESUME·HANDOFF)", join(root, "tasks", "ACTIVE.md")],
  ["tasks/_TEMPLATE.md (M/L START)", join(root, "tasks", "_TEMPLATE.md")],
  ["/task-* 명령 본문 (쓸 때)", null],
  ["검증 담당 정의 (M/L FINISH, 서브에이전트가 따로 읽음)", join(root, ".claude", "agents", "baton-verifier.md")],
  ["docs/baton/README.md (사용법 질문)", join(root, "docs", "baton", "README.md")],
];
for (const [name, f] of lazy) {
  const text = f ? read(f) : ["task-start", "task-resume", "task-handoff", "task-finish"].map((n) => read(join(root, ".claude", "commands", `${n}.md`)) || "").join("\n");
  add("필요할 때만", name, text, true);
}
add("필요할 때만", "doctor 출력 (baton 진단해줘)", run(join(root, "scripts", "baton", "doctor.mjs")), true);
add("필요할 때만", "rescue 출력 (비상 인계)", run(join(root, "scripts", "baton", "rescue.mjs")), true);

// ---------- 출력 ----------
const out = [`=== baton 토큰 점검 === (${short(root)})`, "토큰은 추정(영어 약 4글자=1, 한국어 1글자=1). [b] = baton이 넣은 것"];
for (const group of [...new Set(rows.map((r) => r.group))]) {
  const list = rows.filter((r) => r.group === group);
  const sum = list.reduce((t, r) => t + tok(r.text), 0);
  const bsum = list.filter((r) => r.baton).reduce((t, r) => t + tok(r.text), 0);
  out.push("", `[${group}] 약 ${fmt(sum)} 토큰${group.includes("고정") ? ` (그중 baton ${fmt(bsum)})` : ""}`);
  for (const r of list) out.push(`  ${r.baton ? "[b]" : "   "} ${r.name}: ${kb(r.text)}, 약 ${fmt(tok(r.text))}`);
}

// ---------- 3. 실측: 세션 기록의 첫 요청 입력 토큰 ----------
function head(file, bytes = 262144) {
  try { const fd = openSync(file, "r"); const buf = Buffer.alloc(bytes); const n = readSync(fd, buf, 0, bytes, 0); closeSync(fd); return buf.subarray(0, n).toString("utf8"); } catch { return ""; }
}
const lines = (t) => t.split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const batonRootOf = (dir) => { let d = resolve(dir); while (true) { const a = read(join(d, "AGENTS.md")); if (a && MARK.test(a.slice(0, 4096))) return d; const up = dirname(d); if (up === d) return null; d = up; } };
const since = Date.now() - 30 * 86400000;
const samples = { Claude: { baton: [], other: [] }, Codex: { baton: [], other: [] } };
const cbase = join(claudeHome, "projects");
if (existsSync(cbase)) for (const d of readdirSync(cbase)) {
  let files = [];
  try { files = readdirSync(join(cbase, d)).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
  for (const f of files) {
    const file = join(cbase, d, f);
    if (statSync(file).mtime < since) continue;
    const ls = lines(head(file));
    const cwd = ls.find((o) => o.cwd)?.cwd;
    const u = ls.find((o) => o.type === "assistant" && !o.isSidechain && o.message?.usage)?.message.usage;
    if (!cwd || !u) continue;
    const n = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    if (n) samples.Claude[existsSync(cwd) && batonRootOf(cwd) ? "baton" : "other"].push(n);
  }
}
function* walk(dir, depth = 0) {
  let es = [];
  try { es = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of es) { const p = join(dir, e.name); if (e.isDirectory() && depth < 4) yield* walk(p, depth + 1); else if (e.isFile()) yield p; }
}
for (const file of walk(join(codexHome, "sessions"))) {
  if (!/rollout-.*\.jsonl$/.test(file) || statSync(file).mtime < since) continue;
  const ls = lines(head(file, 1048576));
  const cwd = ls.find((o) => o.type === "session_meta")?.payload?.cwd;
  const info = ls.find((o) => o.type === "event_msg" && o.payload?.type === "token_count" && o.payload.info)?.payload.info;
  const n = (info?.last_token_usage || info?.total_token_usage)?.input_tokens;
  if (cwd && n) samples.Codex[existsSync(cwd) && batonRootOf(cwd) ? "baton" : "other"].push(n);
}
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
out.push("", "[실측: 최근 30일 세션의 첫 요청 입력 토큰 중앙값] (시스템 지시·도구 설명 포함 전체)");
for (const a of ["Claude", "Codex"]) {
  const b = median(samples[a].baton), o = median(samples[a].other);
  if (b === null && o === null) { out.push(`  ${a}: 세션 기록 없음`); continue; }
  out.push(`  ${a}: baton 프로젝트 ${b === null ? "-" : fmt(b)} (${samples[a].baton.length}개) · 그 밖의 폴더 ${o === null ? "-" : fmt(o)} (${samples[a].other.length}개)${b !== null && o !== null ? ` → 차이 ${b - o >= 0 ? "+" : ""}${fmt(b - o)}` : ""}`);
}
out.push("  참고: 전역 규칙(GLOBAL_RULES 등)은 양쪽에 다 들어가서 차이에 안 나타나요. 차이는 프로젝트 규칙 파일 크기 차이도 섞여 있어요.");
console.log(out.join("\n"));
