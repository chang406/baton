#!/usr/bin/env node
// audit 전역 설치·업데이트. harness에서만 실행한다.
//
//   node ~/harness/audit/install.mjs                    점검만: 무엇을 설치·교체·건너뛸지 보여준다 (아무것도 안 바꿈)
//   node ~/harness/audit/install.mjs --apply            안전한 것만 설치·교체 (새로 설치, 옛 audit 버전 교체)
//   node ~/harness/audit/install.mjs --apply --replace <파일들, 쉼표 | all>
//                                                       건너뛴 파일도 교체 (사용자가 내용을 보고 승인한 뒤에만)
//
// 설치 위치: ~/.claude/agents/deep-audit.md, ~/.claude/commands/audit-{all,security,perf}.md (CLAUDE_CONFIG_DIR가 있으면 그 아래)
// 상태 판정 (설치본을 harness 원본의 현재본·Git 이력 속 모든 버전과 비교, ../baton/known.mjs):
//   없음 → 설치 / 같음 → 최신 / 원본 이력에 있는 줄로만 됨 → 옛 버전, 교체
//   원본 이력에 없는 줄이 있음 → 직접 고쳤거나 이력 이전 버전 → 건너뜀 (--replace로만)
//   deep-audit 표시가 없음 → 같은 이름의 다른 도구 파일 → 건너뜀 (--replace로만)
// 교체·삭제 전 기존 파일은 ~/harness/audit/.backup/<시각>/ 에 복사한다 (~/.claude 안에 백업을 두지 않는다).
// 이름 겹침([멈춤], 있으면 --apply도 아무것도 안 바꿈): ~/.claude/skills/ 의 같은 이름 스킬,
//   다른 파일 이름으로 된 deep-audit 에이전트, 플러그인(~/.claude/plugins/)의 같은 이름 명령·에이전트.
// 지금 폴더(프로젝트) 안의 같은 이름 파일은 [알림] (그 프로젝트에서는 그쪽이 우선).
// exit: 멈춤 항목이 남아 있으면 1.
// 네트워크를 쓰지 않는다.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { HARNESS, knownLinesAt, norm } from "../baton/known.mjs";

const CLAUDE = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
const FILES = [
  { src: "audit/agents/deep-audit.md", dest: join(CLAUDE, "agents", "deep-audit.md") },
  { src: "audit/commands/audit-all.md", dest: join(CLAUDE, "commands", "audit-all.md") },
  { src: "audit/commands/audit-security.md", dest: join(CLAUDE, "commands", "audit-security.md") },
  { src: "audit/commands/audit-perf.md", dest: join(CLAUDE, "commands", "audit-perf.md") },
];
const name = (f) => f.src.split("/").pop();
const lf = (s) => s.replace(/\r\n/g, "\n");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const ri = args.indexOf("--replace");
const replace = new Set(ri >= 0 ? (args[ri + 1] || "").split(",").map((s) => s.trim()).filter(Boolean) : []);
const replaceAll = replace.has("all");

// ---------- 판정 ----------
const rows = FILES.map((f) => {
  const src = lf(readFileSync(join(HARNESS, f.src), "utf8"));
  if (!existsSync(f.dest)) return { ...f, state: "new", label: "없음 → 설치" };
  const cur = lf(readFileSync(f.dest, "utf8"));
  if (cur === src) return { ...f, state: "same", label: "최신" };
  if (!/deep-audit/.test(cur)) return { ...f, state: "foreign", label: "건너뜀: 이름만 같은 다른 도구 파일 (deep-audit 표시 없음)" };
  const known = knownLinesAt(f.src);
  const mine = cur.split("\n").map(norm).filter((l) => l.trim() && !known.has(l));
  if (mine.length) {
    return { ...f, state: "mine", mine, label: `건너뜀: 원본 이력에 없는 줄 ${mine.length}개 (직접 고쳤거나 이력 이전의 옛 버전)` };
  }
  return { ...f, state: "old", label: "옛 버전 → 교체" };
});

// 이름 겹침: 같은 이름 스킬, 다른 파일 이름의 deep-audit 에이전트
const warns = [];
const skillsDir = join(CLAUDE, "skills");
for (const n of ["deep-audit", "audit-all", "audit-security", "audit-perf"]) {
  if (existsSync(join(skillsDir, n))) warns.push(`~/.claude/skills/${n} 스킬이 같은 이름을 씁니다 → 어느 쪽을 쓸지 정하고 하나는 치우세요`);
}
try {
  for (const f of readdirSync(join(CLAUDE, "agents"))) {
    if (!f.endsWith(".md") || f === "deep-audit.md") continue;
    if (/^name:\s*deep-audit\s*$/m.test(readFileSync(join(CLAUDE, "agents", f), "utf8"))) {
      warns.push(`~/.claude/agents/${f}도 이름이 deep-audit입니다 → 하나만 남기세요`);
    }
  }
} catch { /* agents 폴더 없음 */ }
// 플러그인이 같은 이름의 명령·에이전트를 갖고 있으면 어느 쪽이 실행될지 모호해진다
function* walkFiles(dir, depth = 0) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory() && depth < 8 && e.name !== "node_modules" && e.name !== ".git") yield* walkFiles(p, depth + 1);
    else if (e.isFile()) yield p;
  }
}
for (const f of walkFiles(join(CLAUDE, "plugins"))) {
  const n = f.split(/[\\/]/).slice(-2).join("/");
  if (/^commands\/audit-(all|security|perf)\.md$/.test(n) || n === "agents/deep-audit.md") {
    warns.push(`플러그인에 같은 이름이 있음: ${f.replace(CLAUDE, "~/.claude")} → 어느 쪽을 쓸지 정해야 함`);
  }
}
// 지금 폴더(프로젝트) 안의 같은 이름 파일은 그 프로젝트에서 전역보다 우선한다
const local = [".claude/agents/deep-audit.md", ".claude/commands/audit-all.md", ".claude/commands/audit-security.md", ".claude/commands/audit-perf.md"]
  .filter((r) => existsSync(join(process.cwd(), r)) && join(process.cwd(), r) !== join(CLAUDE, r.replace(/^\.claude\//, "")));

const home = homedir();
const short = (p) => (p.startsWith(home) ? "~" + p.slice(home.length) : p);
const out = ["[preflight] audit 전역 설치 점검 (원본: ~/harness/audit)"];
const held = rows.filter((r) => (r.state === "mine" || r.state === "foreign") && !(replaceAll || replace.has(name(r))));
for (const r of rows) {
  const tag = r.state === "mine" || r.state === "foreign" ? "[멈춤]" : "[알림]";
  out.push(`${tag} ${short(r.dest)}: ${r.label}`);
  if (r.mine) for (const l of r.mine.slice(0, 3)) out.push(`    | ${l.length > 70 ? l.slice(0, 70) + "…" : l}`);
  if (r.mine && r.mine.length > 3) out.push(`    | … 외 ${r.mine.length - 3}줄`);
}
for (const w of warns) out.push(`[멈춤] ${w}`);
if (local.length) out.push(`[알림] 이 프로젝트 안의 ${local.join(", ")}이(가) 이 프로젝트에서는 전역 audit보다 우선해요`);

// 이름 겹침(스킬·플러그인·사본)이 있으면 설치 자체를 하지 않는다: 어느 쪽이 실행될지 모호해지므로
if (warns.length && apply) {
  out.push("");
  out.push("결과: 이름이 겹치는 곳이 있어 아무것도 바꾸지 않았습니다. 어느 쪽을 쓸지 정하고 겹치는 쪽을 치운 뒤 다시 실행하세요.");
  console.log(out.join("\n"));
  process.exit(1);
}
if (!apply) {
  const todo = rows.filter((r) => r.state === "new" || r.state === "old").length;
  out.push("");
  out.push(`점검만 했습니다 (아무것도 바꾸지 않음). 설치·교체할 것 ${todo}개, 멈춤 ${held.length + warns.length}개.`);
  if (todo && !warns.length) out.push("  적용: node ~/harness/audit/install.mjs --apply");
  if (held.length) out.push(`  [멈춤] 파일은 사용자가 내용을 보고 승인한 뒤에만: --apply --replace ${held.map(name).join(",")}`);
  if (held.length || warns.length) out.push("결과: 멈춤 항목이 있습니다 → 한 번에 보여주고 사용자에게 물어보세요.");
  console.log(out.join("\n"));
  process.exit(held.length || warns.length ? 1 : 0);
}

// ---------- 적용 ----------
const stamp = new Date().toISOString().replace(/[:.]/g, "-"); // 밀리초까지: 연달아 실행해도 백업이 덮이지 않게
const backupDir = join(process.env.AUDIT_BACKUP_DIR || join(HARNESS, "audit", ".backup"), stamp); // 시험 때 격리용
const done = [];
for (const r of rows) {
  const forced = replaceAll || replace.has(name(r));
  const go = r.state === "new" || r.state === "old" || ((r.state === "mine" || r.state === "foreign") && forced);
  if (!go) continue;
  if (existsSync(r.dest)) {
    mkdirSync(backupDir, { recursive: true });
    copyFileSync(r.dest, join(backupDir, name(r)));
  }
  mkdirSync(join(r.dest, ".."), { recursive: true });
  copyFileSync(join(HARNESS, r.src), r.dest);
  done.push(`${name(r)} ${r.state === "new" ? "설치" : "교체"}`);
}
out.push("");
out.push(done.length ? `적용: ${done.join(", ")}` : "적용할 것이 없습니다.");
if (existsSync(backupDir)) out.push(`이전 파일 백업: ${short(backupDir)}`);
if (done.length) out.push("Claude Code를 다시 켜고 /audit 을 쳐서 명령 세 개가 보이면 끝이에요.");
if (held.length) out.push(`건너뛴 파일(멈춤): ${held.map(name).join(", ")} → 사용자에게 내용을 보여주고 물어보세요.`);
console.log(out.join("\n"));
process.exit(held.length ? 1 : 0);
