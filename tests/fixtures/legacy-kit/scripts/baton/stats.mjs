#!/usr/bin/env node
// baton 사용 기록 집계. 인계·이어받기가 실제로 얼마나, 어떻게 일어났는지 숫자로 보여준다.
// 읽기 전용: 파일이나 Git 상태를 바꾸지 않고, 네트워크를 쓰지 않는다.
// 세션 기록(대화 원문이 들어 있음)은 숫자만 세고 내용은 출력하지 않는다.
//
// 사용법: node scripts/baton/stats.mjs [--days N | --all] [--json]
//   --days N  최근 N일 (기본 30)
//   --all     기간 제한 없음
//   --json    표 대신 JSON으로 출력 (나중에 다른 도구로 가공할 때)
//
// 읽는 곳
//   Git: 모든 브랜치의 커밋 제목, tasks/ACTIVE.md의 Last Writer 변화
//   Claude Code: ~/.claude/projects/<프로젝트>/*.jsonl  (CLAUDE_CONFIG_DIR가 있으면 그 아래)
//   Codex: ~/.codex/sessions/**/rollout-*.jsonl        (CODEX_HOME이 있으면 그 아래)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { git, findBatonRoot } from "./lib.mjs";

// ---------- 옵션 ----------
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const all = args.includes("--all");
const daysArg = args.indexOf("--days");
const days = all ? null : Number(daysArg >= 0 ? args[daysArg + 1] : 30) || 30;
const since = days ? new Date(Date.now() - days * 86400000) : null;
const inPeriod = (d) => !since || (d && d >= since);

const top = git("rev-parse", "--show-toplevel");
if (!top) {
  console.log("[baton] Git 저장소가 아닙니다.");
  process.exit(0);
}
const root = findBatonRoot();
const isWin = process.platform === "win32";
const norm = (p) => {
  const r = resolve(p).replace(/[\\/]+$/, "");
  return isWin ? r.toLowerCase() : r;
};
const rootN = norm(root);
const inProject = (cwd) => !!cwd && (norm(cwd) === rootN || norm(cwd).startsWith(rootN + (isWin ? "\\" : sep)));

const USAGE_LIMIT_RE = /usage limit|hit your limit|limit reached|limit will reset|resets? (at|in)|사용량 한도/i;
const NOT_USAGE_RE = /context|prompt is too long|max_tokens|output token/i;
const isUsageLimit = (t) => USAGE_LIMIT_RE.test(t) && !NOT_USAGE_RE.test(t);
const RESUME_RE = /이어서|이어\s*하자|계속\s*하자|계속하자|task-resume/i;
const kindOf = (writer) => (/codex/i.test(writer) ? "Codex" : /claude/i.test(writer) ? "Claude" : null);

// ---------- 1. Git ----------
const sinceArg = since ? [`--since=${since.toISOString()}`] : [];
const commits = git("log", "--all", ...sinceArg, "--format=%H%x1f%aI%x1f%s")
  .split("\n").filter(Boolean).map((l) => {
    const [sha, date, subject] = l.split("\x1f");
    return { sha, date: new Date(date), subject };
  });
const started = commits.filter((c) => /^chore\(.+\):\s*start task/.test(c.subject)).length;
const finished = commits.filter((c) => /^chore\(.+\):\s*finish task/.test(c.subject)).length;
const isCheckpoint = (s) => /^wip\(.+\):\s*checkpoint before handoff/.test(s);
const checkpoints = commits.filter((c) => isCheckpoint(c.subject)).length;

// ACTIVE.md의 버전마다 작업 ID와 Last Writer를 꺼내, 같은 작업 안에서 작성자가 바뀐 지점을 센다.
const activeRel = relative(top, join(root, "tasks", "ACTIVE.md")).split(sep).join("/");
const versions = git("log", "--all", "--date-order", "--reverse", ...sinceArg, "--format=%H%x1f%aI%x1f%s", "--", `:(top)${activeRel}`)
  .split("\n").filter(Boolean).map((l) => {
    const [sha, date, subject] = l.split("\x1f");
    const text = git("show", `${sha}:${activeRel}`);
    const id = (text.match(/^ID:\s*([^\s<]+)/m) || [])[1];
    const raw = ((text.match(/Last Writer:\s*([^\n]*)/) || [])[1] || "").split(/Updated:/)[0];
    const writer = raw.includes("<") ? null : kindOf(raw); // 템플릿 그대로(<Claude Code | Codex>)면 제외
    return { date: new Date(date), subject, id, writer };
  })
  .filter((v) => v.id && v.writer && !/[<|]/.test(v.id));

const byTask = new Map();
for (const v of versions) {
  if (!byTask.has(v.id)) byTask.set(v.id, []);
  byTask.get(v.id).push(v);
}
const switches = [];
for (const [id, list] of byTask) {
  list.sort((a, b) => a.date - b.date);
  for (let i = 1; i < list.length; i++) {
    if (list[i].writer !== list[i - 1].writer) {
      switches.push({ task: id, from: list[i - 1].writer, to: list[i].writer, date: list[i].date, clean: isCheckpoint(list[i - 1].subject) });
    }
  }
}

// ---------- 2. 세션 기록 ----------
function* walk(dir, depth = 0) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory() && depth < 4) yield* walk(p, depth + 1);
    else if (e.isFile()) yield p;
  }
}
function jsonLines(file) {
  let text = "";
  try { text = readFileSync(file, "utf8"); } catch { return []; }
  const out = [];
  for (const l of text.split("\n")) {
    if (!l.trim()) continue;
    try { out.push(JSON.parse(l)); } catch { /* 깨진 줄은 건너뜀 */ }
  }
  return out;
}
const textOf = (content) => typeof content === "string" ? content
  : Array.isArray(content) ? content.filter((c) => c && (c.type === "text" || c.type === "input_text")).map((c) => c.text || "").join("\n") : "";

// Claude Code: 프로젝트 폴더 이름은 경로의 영문·숫자 외 글자를 '-'로 바꾼 것
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
function claudeSessions() {
  const base = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");
  if (!existsSync(base)) return [];
  const enc = (p) => resolve(p).replace(/[^A-Za-z0-9]/g, "-");
  const want = isWin ? enc(root).toLowerCase() : enc(root);
  const sessions = [];
  for (const d of readdirSync(base)) {
    const dn = isWin ? d.toLowerCase() : d;
    const dir = join(base, d);
    // 보통은 폴더 이름으로 고른다. 경로가 아주 길면 Claude Code가 이름을 줄여 저장하므로, 그때만 기록 앞부분의 cwd로 확인
    if (dn !== want && !dn.startsWith(want + "-")) {
      if (d.length < 180) continue;
      const first = (() => { try { return readdirSync(dir).find((f) => f.endsWith(".jsonl")); } catch { return null; } })();
      if (!first || !inProject(jsonLines(join(dir, first)).find((o) => o.cwd)?.cwd)) continue;
    }
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      const file = join(dir, f);
      if (since && statSync(file).mtime < since) continue;
      const lines = jsonLines(file);
      const cwd = lines.find((o) => o.cwd)?.cwd;
      if (!inProject(cwd)) continue;
      const times = lines.map((o) => o.timestamp && new Date(o.timestamp)).filter((t) => t && !isNaN(t));
      if (!times.length) continue;
      const usage = new Map(); // 같은 요청이 여러 줄로 찍히므로 message.id로 중복 제거
      let firstPrompt = null, firstEditAt = null, limitHit = false;
      for (const o of lines) {
        if (o.isSidechain) continue;
        if (o.type === "user" && firstPrompt === null && !o.isMeta) {
          const c = o.message?.content;
          const isToolResult = Array.isArray(c) && c.some((x) => x?.type === "tool_result");
          const t = textOf(c);
          if (!isToolResult && t.trim()) firstPrompt = t;
        }
        if (o.type !== "assistant") continue;
        const m = o.message || {};
        const t = textOf(m.content);
        if ((o.isApiErrorMessage || m.model === "<synthetic>") && isUsageLimit(t)) limitHit = true;
        if (m.id && m.usage) usage.set(m.id, m.usage);
        if (firstEditAt === null && Array.isArray(m.content) && m.content.some((x) => x?.type === "tool_use" && EDIT_TOOLS.has(x.name))) {
          firstEditAt = usage.size;
        }
      }
      let tokens = 0;
      for (const u of usage.values()) tokens += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0);
      sessions.push({
        agent: "Claude", start: times[0], end: times[times.length - 1],
        requests: usage.size, tokens, limitHit,
        resume: firstPrompt !== null && RESUME_RE.test(firstPrompt), firstEditAt,
      });
    }
  }
  return sessions;
}

// Codex: 세션 첫 줄(session_meta)에 cwd가 있다. 형식은 공개 CLI 기준이며 버전에 따라 다를 수 있다.
function codexSessions() {
  const base = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "sessions");
  if (!existsSync(base)) return [];
  const sessions = [];
  for (const file of walk(base)) {
    if (!/rollout-.*\.jsonl$/.test(file)) continue;
    if (since && statSync(file).mtime < since) continue;
    const lines = jsonLines(file);
    const meta = lines.find((o) => o.type === "session_meta")?.payload;
    const cwd = meta?.cwd || lines.find((o) => o.type === "turn_context")?.payload?.cwd;
    if (!inProject(cwd)) continue;
    const times = lines.map((o) => o.timestamp && new Date(o.timestamp)).filter((t) => t && !isNaN(t));
    if (!times.length) continue;
    let requests = 0, tokens = 0, firstPrompt = null, firstEditAt = null, limitHit = false;
    for (const o of lines) {
      const p = o.payload || {};
      if (o.type === "event_msg" && p.type === "user_message" && firstPrompt === null) firstPrompt = p.message || "";
      if (o.type === "event_msg" && p.type === "token_count") {
        if (p.info) {
          requests++;
          const u = p.info.total_token_usage || {};
          tokens = u.total_tokens || (u.input_tokens || 0) + (u.output_tokens || 0);
        }
        const rl = p.rate_limits || {};
        if ((rl.primary?.used_percent ?? 0) >= 100 || (rl.secondary?.used_percent ?? 0) >= 100) limitHit = true;
      }
      if (o.type === "event_msg" && p.type === "error" && isUsageLimit(p.message || "")) limitHit = true;
      if (o.type === "response_item" && firstEditAt === null && (p.type === "function_call" || p.type === "custom_tool_call")) {
        if (p.name === "apply_patch" || /apply_patch/.test(String(p.arguments || p.input || ""))) firstEditAt = requests;
      }
    }
    sessions.push({
      agent: "Codex", start: times[0], end: times[times.length - 1],
      requests, tokens, limitHit,
      resume: firstPrompt !== null && RESUME_RE.test(firstPrompt), firstEditAt,
    });
  }
  return sessions;
}

const sessions = [...claudeSessions(), ...codexSessions()]
  .filter((s) => inPeriod(s.end))
  .sort((a, b) => a.start - b.start);

// 이어받기: "이어서 하자" 류로 시작한 세션과, 그 직전에 시작한 세션을 짝짓는다.
const resumes = [];
for (let i = 0; i < sessions.length; i++) {
  const s = sessions[i];
  if (!s.resume) continue;
  const prev = sessions.slice(0, i).reverse().find((p) => p.start < s.start);
  resumes.push({
    to: s.agent, from: prev?.agent || null, prevLimitHit: !!prev?.limitHit,
    requestsToFirstEdit: s.firstEditAt === null ? null : Math.max(1, s.firstEditAt),
  });
}

// ---------- 3. 출력 ----------
const count = (arr, f) => arr.filter(f).length;
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmtTok = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);
const pairs = (list) => {
  const m = {};
  for (const x of list) if (x.from) m[`${x.from}→${x.to}`] = (m[`${x.from}→${x.to}`] || 0) + 1;
  return m;
};
const editCounts = resumes.map((r) => r.requestsToFirstEdit).filter((n) => n !== null);

const summary = {
  period: days ? `최근 ${days}일` : "전체",
  project: root.split(/[\\/]/).pop(), // 개인 경로를 남기지 않도록 폴더 이름만
  git: { tasksStarted: started, tasksFinished: finished, handoffCheckpoints: checkpoints },
  writerSwitches: {
    total: switches.length, byPair: pairs(switches),
    clean: count(switches, (s) => s.clean), unclean: count(switches, (s) => !s.clean),
  },
  sessions: Object.fromEntries(["Claude", "Codex"].map((a) => {
    const list = sessions.filter((s) => s.agent === a);
    return [a, { count: list.length, tokens: list.reduce((t, s) => t + s.tokens, 0), limitHit: count(list, (s) => s.limitHit) }];
  })),
  resumes: {
    total: resumes.length, byPair: pairs(resumes),
    afterLimitHit: count(resumes, (r) => r.prevLimitHit),
    requestsToFirstEdit: editCounts.length ? { median: median(editCounts), min: Math.min(...editCounts), max: Math.max(...editCounts) } : null,
    noEdit: count(resumes, (r) => r.requestsToFirstEdit === null),
  },
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const pairText = (m) => Object.entries(m).map(([k, v]) => `${k} ${v}`).join(", ");
const out = [];
out.push(`=== baton 기록 (${summary.period}) ===`);
out.push(`[작업] 시작 ${started} · 완료 ${finished} · 인계 커밋 ${checkpoints}`);

const sw = summary.writerSwitches;
out.push(`[에이전트 교대] ${sw.total}번${sw.total ? ` (${pairText(sw.byPair)})` : ""}  ← ACTIVE.md의 Last Writer 기준`);
if (sw.total) out.push(`  - "넘길게"로 정리하고 넘김 ${sw.clean} · 정리 없이 넘어감 ${sw.unclean} (한도로 끊겼을 가능성)`);

const sc = summary.sessions;
out.push(`[세션] Claude ${sc.Claude.count}개 (${fmtTok(sc.Claude.tokens)} 토큰) · Codex ${sc.Codex.count}개 (${fmtTok(sc.Codex.tokens)} 토큰)`);
if (sc.Claude.limitHit || sc.Codex.limitHit) out.push(`  - 한도에 걸린 세션: Claude ${sc.Claude.limitHit} · Codex ${sc.Codex.limitHit}`);

const rs = summary.resumes;
out.push(`[이어받기] "이어서 하자"로 시작한 세션 ${rs.total}개${rs.total && Object.keys(rs.byPair).length ? ` (${pairText(rs.byPair)})` : ""}`);
if (rs.total) {
  out.push(`  - 직전 세션이 한도로 끊긴 경우 ${rs.afterLimitHit}`);
  if (rs.requestsToFirstEdit) {
    const r = rs.requestsToFirstEdit;
    out.push(`  - 첫 코드 수정까지 요청 수: 중앙값 ${r.median} (최소 ${r.min}, 최대 ${r.max})${rs.noEdit ? ` · 수정 없이 끝남 ${rs.noEdit}` : ""}`);
  } else if (rs.noEdit) {
    out.push(`  - 이어받은 세션 모두 코드 수정 없이 끝남 (${rs.noEdit})`);
  }
}
if (!sessions.length) out.push("  (이 프로젝트의 Claude Code·Codex 세션 기록을 찾지 못했습니다. 다른 컴퓨터에서 작업했으면 그 컴퓨터에서 실행하세요.)");
out.push("참고: 세션 기록은 내용 없이 숫자만 셉니다. 토큰은 캐시 포함 합계이고, 금액은 /cost나 사용량 화면에서 확인하세요.");
console.log(out.join("\n"));
