// Claude Code·Codex 세션 기록 읽기 (stats.mjs, rescue.mjs, status.mjs가 같이 쓴다).
// 읽기 전용: 기록 파일을 읽기만 하고 바꾸지 않는다. 네트워크를 쓰지 않는다.
//   Claude Code: ~/.claude/projects/<프로젝트>/*.jsonl  (CLAUDE_CONFIG_DIR가 있으면 그 아래)
//   Codex: ~/.codex/sessions/**/rollout-*.jsonl        (CODEX_HOME이 있으면 그 아래)
// 기록 형식은 공개 CLI 기준이며 버전에 따라 다를 수 있다. 모르는 줄은 건너뛴다.
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

const isWin = process.platform === "win32";
const norm = (p) => { const r = resolve(p).replace(/[\\/]+$/, ""); return isWin ? r.toLowerCase() : r; };
export const inProjectOf = (root) => {
  const rootN = norm(root);
  return (cwd) => !!cwd && (norm(cwd) === rootN || norm(cwd).startsWith(rootN + (isWin ? "\\" : sep)));
};

const USAGE_LIMIT_RE = /usage limit|hit your limit|limit reached|limit will reset|resets? (at|in)|사용량 한도/i;
const NOT_USAGE_RE = /context|prompt is too long|max_tokens|output token/i;
export const isUsageLimit = (t) => USAGE_LIMIT_RE.test(t) && !NOT_USAGE_RE.test(t);

function* walk(dir, depth = 0) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory() && depth < 4) yield* walk(p, depth + 1);
    else if (e.isFile()) yield p;
  }
}
function readPart(file, start, bytes) {
  try {
    const fd = openSync(file, "r");
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, start);
    closeSync(fd);
    return buf.subarray(0, n).toString("utf8");
  } catch { return ""; }
}
const parseLines = (text) => {
  const out = [];
  for (const l of text.split("\n")) {
    if (!l.trim()) continue;
    try { out.push(JSON.parse(l)); } catch { /* 깨진 줄·잘린 줄은 건너뜀 */ }
  }
  return out;
};
// 큰 기록은 앞부분과 끝부분만 읽는다 (tail 바이트). 0이면 전부.
function readLines(file, tail = 0) {
  let size = 0;
  try { size = statSync(file).size; } catch { return []; }
  if (!tail || size <= tail + 65536) { try { return parseLines(readFileSync(file, "utf8")); } catch { return []; } }
  return [...parseLines(readPart(file, 0, 65536)), ...parseLines(readPart(file, size - tail, tail))];
}
const cwdHead = (file) => { const m = readPart(file, 0, 65536).match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/); try { return m ? JSON.parse(`"${m[1]}"`) : null; } catch { return null; } };

// 이 프로젝트(root)의 기록 파일 목록 [{ agent, file, mtime }]. since(Date)보다 오래된 파일은 뺀다.
export function sessionFiles(root, { since = null } = {}) {
  const inProject = inProjectOf(root);
  const files = [];
  const cbase = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");
  if (existsSync(cbase)) {
    const enc = (p) => resolve(p).replace(/[^A-Za-z0-9]/g, "-");
    const want = isWin ? enc(root).toLowerCase() : enc(root);
    for (const d of readdirSync(cbase)) {
      const dn = isWin ? d.toLowerCase() : d;
      const dir = join(cbase, d);
      // 보통은 폴더 이름으로 고른다. 경로가 아주 길면 Claude Code가 이름을 줄여 저장하므로, 그때만 기록 앞부분의 cwd로 확인
      if (dn !== want && !dn.startsWith(want + "-")) {
        if (d.length < 180) continue;
        const first = (() => { try { return readdirSync(dir).find((f) => f.endsWith(".jsonl")); } catch { return null; } })();
        if (!first || !inProject(cwdHead(join(dir, first)))) continue;
      }
      let names = [];
      try { names = readdirSync(dir).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
      for (const f of names) {
        const file = join(dir, f);
        const mtime = statSync(file).mtime;
        if (since && mtime < since) continue;
        if (!inProject(cwdHead(file))) continue;
        files.push({ agent: "Claude", file, mtime });
      }
    }
  }
  const xbase = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "sessions");
  for (const file of walk(xbase)) {
    if (!/rollout-.*\.jsonl$/.test(file)) continue;
    const mtime = statSync(file).mtime;
    if (since && mtime < since) continue;
    if (!inProject(cwdHead(file))) continue;
    files.push({ agent: "Codex", file, mtime });
  }
  return files;
}

const textOf = (content) => typeof content === "string" ? content
  : Array.isArray(content) ? content.filter((c) => c && (c.type === "text" || c.type === "input_text" || c.type === "output_text")).map((c) => c.text || "").join("\n") : "";
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
// 사람이 쓴 요청만 (명령 태그·시스템 알림 제거)
const cleanPrompt = (t) => t.replace(/<(system-reminder|local-command-[a-z]+)>[\s\S]*?<\/\1>/g, "").replace(/<\/?command-[a-z]+>/g, " ").replace(/\s+/g, " ").trim();

// 기록 하나를 읽어 요약한다. tail>0이면 큰 파일은 앞·끝만 읽는다(세션 시작 알림용, 빠르게).
export function parseSession(agent, file, { tail = 0 } = {}) {
  const lines = readLines(file, tail);
  const times = lines.map((o) => o.timestamp && new Date(o.timestamp)).filter((t) => t && !isNaN(t));
  const s = { agent, file, start: times[0] || null, end: times[times.length - 1] || null, requests: 0, tokens: 0, firstContext: null,
    limitHit: false, prompts: [], lastReply: "", edited: [], firstEditAt: null };
  const addEdit = (p) => { if (p && !s.edited.includes(p)) s.edited.push(p); };
  if (agent === "Claude") {
    const usage = new Map(); // 같은 요청이 여러 줄로 찍히므로 message.id로 중복 제거
    for (const o of lines) {
      if (o.isSidechain) continue;
      if (o.type === "user" && !o.isMeta) {
        const c = o.message?.content;
        if (!(Array.isArray(c) && c.some((x) => x?.type === "tool_result"))) { const t = cleanPrompt(textOf(c)); if (t) s.prompts.push(t); }
      }
      if (o.type !== "assistant") continue;
      const m = o.message || {};
      const t = textOf(m.content);
      if ((o.isApiErrorMessage || m.model === "<synthetic>") && isUsageLimit(t)) s.limitHit = true;
      if (t.trim()) s.lastReply = t.trim();
      if (m.id && m.usage) {
        if (!usage.size) s.firstContext = (m.usage.input_tokens || 0) + (m.usage.cache_creation_input_tokens || 0) + (m.usage.cache_read_input_tokens || 0);
        usage.set(m.id, m.usage);
      }
      for (const x of Array.isArray(m.content) ? m.content : []) {
        if (x?.type !== "tool_use" || !EDIT_TOOLS.has(x.name)) continue;
        if (s.firstEditAt === null) s.firstEditAt = usage.size;
        addEdit(x.input?.file_path || x.input?.notebook_path);
      }
    }
    s.requests = usage.size;
    for (const u of usage.values()) s.tokens += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0);
  } else {
    for (const o of lines) {
      const p = o.payload || {};
      if (o.type === "event_msg" && p.type === "user_message") { const t = cleanPrompt(p.message || ""); if (t) s.prompts.push(t); }
      if (o.type === "event_msg" && p.type === "agent_message" && String(p.message || "").trim()) s.lastReply = String(p.message).trim();
      if (o.type === "event_msg" && p.type === "token_count") {
        if (p.info) {
          s.requests++;
          const u = p.info.total_token_usage || {};
          s.tokens = u.total_tokens || (u.input_tokens || 0) + (u.output_tokens || 0);
          if (s.firstContext === null) s.firstContext = (p.info.last_token_usage || u).input_tokens || null;
        }
        const rl = p.rate_limits || {};
        if ((rl.primary?.used_percent ?? 0) >= 100 || (rl.secondary?.used_percent ?? 0) >= 100) s.limitHit = true;
      }
      if (o.type === "event_msg" && p.type === "error" && isUsageLimit(p.message || "")) s.limitHit = true;
      if (o.type === "response_item" && (p.type === "function_call" || p.type === "custom_tool_call")) {
        const body = String(p.arguments || p.input || "");
        if (p.name === "apply_patch" || /apply_patch/.test(body)) {
          if (s.firstEditAt === null) s.firstEditAt = s.requests;
          for (const m of body.matchAll(/\*\*\* (?:Update|Add|Delete) File: ([^\n"\\]+)/g)) addEdit(m[1].trim());
        }
      }
    }
  }
  return s;
}

// 이 프로젝트의 세션 전부 (시작 순). stats.mjs용
export function projectSessions(root, { since = null } = {}) {
  return sessionFiles(root, { since }).map((f) => parseSession(f.agent, f.file)).filter((s) => s.start).sort((a, b) => a.start - b.start);
}

// 지금 세션으로 보이는 것(최근 15분 안에 시작, 요청 5개 이하)을 뺀 가장 최근 세션
export function previousSession(root, { pick = 1, tail = 0, since = null } = {}) {
  const files = sessionFiles(root, { since }).sort((a, b) => b.mtime - a.mtime).slice(0, pick + 2);
  const list = files.map((f) => parseSession(f.agent, f.file, { tail })).filter((s) => s.start).sort((a, b) => b.start - a.start);
  const now = Date.now();
  if (list.length && now - list[0].start < 15 * 60000 && list[0].requests <= 5) list.shift();
  return list[pick - 1] || null;
}
