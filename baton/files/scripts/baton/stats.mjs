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
import { realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { git, findBatonRoot } from "./lib.mjs";
import { projectSessions } from "./sessions.mjs";

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
const real = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } }; // Windows 짧은 이름·긴 이름 맞추기
const activeRel = relative(real(top), join(real(root), "tasks", "ACTIVE.md")).split(sep).join("/");
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

// ---------- 2. 세션 기록 (sessions.mjs) ----------
const sessions = projectSessions(root, { since })
  .filter((s) => inPeriod(s.end))
  .map((s) => ({ ...s, resume: s.prompts.length > 0 && RESUME_RE.test(s.prompts[0]) }));

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
