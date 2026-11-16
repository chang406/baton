#!/usr/bin/env node
// 비상 인계 초안. 지난 세션이 "넘길게"(HANDOFF) 없이 끝났을 때(대개 사용량 한도),
// 그 세션 기록과 Git 상태로 이어받는 데 필요한 것만 짧게 보여준다.
// 읽기 전용: 파일이나 Git 상태를 바꾸지 않고, 네트워크를 쓰지 않는다.
// 기록 원문은 이 컴퓨터의 사용자에게만, 잘라서·비밀값을 가려서 보여준다. 커밋이나 문서에 원문을 옮기지 않는다.
//
// 사용법: node scripts/baton/rescue.mjs [--pick N]   (N: 1 = 지난 세션(기본), 2 = 그 앞 세션)
import { relative, resolve, isAbsolute } from "node:path";
import { git, findBatonRoot } from "./lib.mjs";
import { previousSession } from "./sessions.mjs";
import { redact } from "./secrets.mjs";

const args = process.argv.slice(2);
const pick = Math.max(1, Number(args[args.indexOf("--pick") + 1]) || 1);
if (!git("rev-parse", "--show-toplevel")) { console.log("[baton] Git 저장소가 아닙니다."); process.exit(0); }
const root = findBatonRoot();

const cut = (t, n) => { const s = redact(String(t || "").replace(/\s+/g, " ").trim()); return s.length > n ? s.slice(0, n) + "…" : s; };
const when = (d) => d ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "?";
const rel = (p) => { const a = isAbsolute(p) ? relative(root, p) : p; return a && !a.startsWith("..") ? a.split("\\").join("/") : p; };

const s = previousSession(root, { pick });
const out = ["=== 비상 인계 초안 ==="];
if (!s) out.push("지난 세션 기록을 찾지 못했습니다 (다른 컴퓨터에서 작업했으면 Git 상태만 보고 이어가세요).");
else {
  out.push(`지난 세션: ${s.agent}, ${when(s.start)}~${when(s.end)}, 요청 ${s.requests}개${s.limitHit ? ", 사용량 한도로 끝남" : ""}`);
}
const branch = git("branch", "--show-current") || "(브랜치 아님)";
out.push(`지금 브랜치: ${branch} · 마지막 커밋: ${cut(git("log", "-1", "--format=%h %s (%cr)"), 80)}`);
const stat = git("diff", "HEAD", "--numstat").split("\n").filter(Boolean).map((l) => l.split("\t"));
const untracked = git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean);
if (stat.length || untracked.length) {
  const add = stat.reduce((t, [a]) => t + (Number(a) || 0), 0), del = stat.reduce((t, [, d]) => t + (Number(d) || 0), 0);
  const names = [...stat.map(([, , f]) => f), ...untracked.map((f) => `${f}(새 파일)`)];
  out.push(`커밋 안 된 변경: ${names.length}개 파일 (+${add}/-${del}): ${names.slice(0, 10).join(", ")}${names.length > 10 ? " 외" : ""}`);
} else out.push("커밋 안 된 변경: 없음");
if (s) {
  if (s.prompts.length) {
    out.push(`첫 요청: "${cut(s.prompts[0], 200)}"`);
    const last = s.prompts.slice(1).slice(-3);
    if (last.length) out.push("마지막 요청:", ...last.map((p) => `  - "${cut(p, 150)}"`));
  }
  if (s.lastReply) out.push(`마지막 답변: "${cut(s.lastReply, 300)}"`);
  if (s.edited.length) out.push(`그 세션에서 고친 파일: ${s.edited.slice(0, 10).map(rel).join(", ")}${s.edited.length > 10 ? " 외" : ""}`);
}
out.push("→ 이 초안으로 tasks/ACTIVE.md의 Current State와 Next Exact Step을 채우고 \"비상 인계 초안(확인 필요)\"이라고 표시한 뒤, 사용자에게 확인받고 이어서 진행.");
console.log(out.join("\n"));
