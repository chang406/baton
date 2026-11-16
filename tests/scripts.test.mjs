// 프로젝트 안 스크립트(status·doctor·stats)와 audit 전역 설치
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  HARNESS, KIT, PERSONAL_GITIGNORE, S, claudeSession, codexSession, commitAll, copyKit, git, initRepo, installedProject, isolatedEnv, read, run, tmp, write,
} from "./helpers.mjs";

const pushV0 = (dir, ...a) => git(dir, "-c", "protocol.version=0", ...a);

test("status: 다른 컴퓨터의 task 브랜치와 원격보다 뒤처짐을 알림", () => {
  const base = tmp("st");
  const a = installedProject(join(base, "a"));
  git(base, "init", "-q", "--bare", "-b", "main", join(base, "remote.git"));
  git(a, "remote", "add", "origin", join(base, "remote.git"));
  pushV0(a, "push", "-q", "-u", "origin", "main");
  git(a, "switch", "-q", "-c", "task/login");
  write(a, "tasks/ACTIVE.md", "# ACTIVE: 로그인\n\nID: login   Branch: task/login   Size: M\nLast Writer: Claude Code   Updated: x\n");
  commitAll(a, "wip(login): checkpoint before handoff");
  pushV0(a, "push", "-q", "origin", "task/login");
  pushV0(base, "clone", "-q", join(base, "remote.git"), join(base, "b"));
  const b = join(base, "b");
  const r1 = run(join(b, "scripts/baton/status.mjs"), [], { cwd: b });
  assert.match(r1.out, /진행 중인 작업 없음/);
  assert.match(r1.out, /다른 task 브랜치 \(아직 main에 안 합침\): origin\/task\/login/);
  git(a, "switch", "-q", "main"); write(a, "x.txt", "x\n"); commitAll(a, "feat: x"); pushV0(a, "push", "-q", "origin", "main");
  pushV0(b, "fetch", "-q");
  assert.match(run(join(b, "scripts/baton/status.mjs"), [], { cwd: b }).out, /원격\(origin\/main\)에 아직 안 받은 커밋이 1개/);
  // 같은 컴퓨터 자기 task 브랜치는 '다른 task'로 나오지 않음
  git(a, "switch", "-q", "task/login");
  git(a, "branch", "-q", "-u", "origin/task/login");
  assert.doesNotMatch(run(join(a, "scripts/baton/status.mjs"), [], { cwd: a }).out, /다른 task 브랜치/);
});

test("doctor: baton 파일이 Git 제외 목록에 걸리거나 개인 설정이 커밋되면 [ ]", () => {
  const p = installedProject(join(tmp("doc"), "p"), {
    edit: (d) => { write(d, ".gitignore", "docs/\n"); write(d, ".claude/settings.local.json", "{}\n"); },
  });
  // 사용자 PC의 전역 제외 목록(~/.config/git/ignore 등)에 settings.local.json이 있어도 커밋되게 -f
  git(p, "add", "-f", "docs", ".claude/settings.local.json");
  commitAll(p, "force");
  const r = run(join(p, "scripts/baton/doctor.mjs"), [], { cwd: p });
  assert.match(r.out, /\[ \] baton 파일이 Git 제외 목록에 없음 — 제외됨: docs\/baton\/README\.md/);
  assert.match(r.out, /\[ \] 개인 설정이 Git에서 제외됨 — 이미 Git에 올라감: \.claude\/settings\.local\.json/);
});

test("doctor: 개인 설정이 전역 제외 목록·info/exclude로만 제외되면 [!] 경고, 프로젝트 .gitignore에 있으면 [x]", () => {
  const base = tmp("doc-ign");
  const globalIgnore = join(base, "global-ignore");
  write(base, "global-ignore", PERSONAL_GITIGNORE);
  // 사용자 PC의 전역 제외 목록이 끼어들지 않게, 저장소마다 core.excludesFile을 직접 지정한다
  const project = (name, gitignore, excludes) => {
    const p = installedProject(join(base, name), { edit: (d) => write(d, ".gitignore", gitignore) });
    git(p, "config", "core.excludesFile", excludes.replace(/\\/g, "/"));
    return p;
  };
  const doctor = (p) => run(join(p, "scripts/baton/doctor.mjs"), [], { cwd: p }).out;

  // 프로젝트 .gitignore에 있으면 전역에도 있어도 정상
  const ok = doctor(project("ok", PERSONAL_GITIGNORE, globalIgnore));
  assert.match(ok, /\[x\] 개인 설정이 Git에서 제외됨/);
  assert.doesNotMatch(ok, /\[!\]/);

  // 전역 제외 목록에만 있으면 경고 (판정에는 안 넣음)
  const glob = doctor(project("global", "node_modules/\n", globalIgnore));
  assert.match(glob, /\[!\] 개인 설정이 프로젝트 \.gitignore에서 제외됨 — 이 컴퓨터 설정으로만 제외됨: \.claude\/settings\.local\.json \(.*global-ignore\), CLAUDE\.local\.md .*\.claude\/worktrees\/ /);
  assert.doesNotMatch(glob, /\[ \] 개인 설정/);
  assert.match(glob, /, 경고 1개/);

  // .git/info/exclude도 이 컴퓨터에만 있으므로 경고
  const p = project("info", "node_modules/\n", join(base, "none"));
  write(p, ".git/info/exclude", PERSONAL_GITIGNORE);
  assert.match(doctor(p), /\[!\] 개인 설정이 프로젝트 \.gitignore에서 제외됨 — .*\.claude\/settings\.local\.json \(\.git\/info\/exclude\)/);

  // 어디에도 없으면 지금처럼 [ ]
  const none = doctor(project("none", "node_modules/\n", join(base, "none")));
  assert.match(none, /\[ \] 개인 설정이 Git에서 제외됨 — \.gitignore에 추가 필요: \.claude\/settings\.local\.json, CLAUDE\.local\.md, \.claude\/worktrees\//);
  assert.doesNotMatch(none, /\[!\]/);
});

test("stats: 에이전트 교대(정리하고 넘김/정리 없이), 사용량 한도만 셈, 이어받기", () => {
  const base = tmp("stats");
  const env = isolatedEnv(base);
  const p = installedProject(join(base, "p"));
  let n = 0;
  const w = (writer, msg) => { write(p, "tasks/ACTIVE.md", `# ACTIVE: x\n\nID: login   Branch: task/login   Size: M\nLast Writer: ${writer}   Updated: x\nstep ${n++}\n`); commitAll(p, msg); };
  w("Claude Code", "chore(login): start task");
  w("Codex", "wip(login): fix");                       // 정리 없이 교대
  w("Codex", "wip(login): checkpoint before handoff");
  w("Claude Code", "wip(login): tests");               // 정리하고 교대
  const t = (s) => new Date(Date.now() - (100 - s) * 1000).toISOString();
  claudeSession(env, p, [
    { type: "user", cwd: p, timestamp: t(1), message: { role: "user", content: "로그인 만들어줘" } },
    { type: "assistant", cwd: p, timestamp: t(2), message: { id: "m1", content: [{ type: "tool_use", name: "Edit" }], usage: { input_tokens: 10, output_tokens: 5 } } },
    { type: "assistant", cwd: p, timestamp: t(3), isApiErrorMessage: true, message: { id: "e1", model: "<synthetic>", content: [{ type: "text", text: "Context limit reached" }] } },
  ], "s1");
  claudeSession(env, p, [
    { type: "user", cwd: p, timestamp: t(4), message: { role: "user", content: "더 해줘" } },
    { type: "assistant", cwd: p, timestamp: t(5), isApiErrorMessage: true, message: { id: "e2", model: "<synthetic>", content: [{ type: "text", text: "5-hour limit reached ∙ resets 3pm" }] } },
  ], "s2");
  codexSession(env, [
    { timestamp: t(6), type: "session_meta", payload: { cwd: p, instructions: "x".repeat(20000) } },
    { timestamp: t(7), type: "event_msg", payload: { type: "user_message", message: "이어서 하자" } },
    { timestamp: t(8), type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { total_tokens: 900 } } } },
    { timestamp: t(9), type: "response_item", payload: { type: "custom_tool_call", name: "apply_patch" } },
  ]);
  const r = run(join(p, "scripts/baton/stats.mjs"), ["--json"], { cwd: p, env });
  const j = JSON.parse(r.out);
  assert.deepEqual(j.writerSwitches.byPair, { "Claude→Codex": 1, "Codex→Claude": 1 });
  assert.equal(j.writerSwitches.clean, 1);
  assert.equal(j.writerSwitches.unclean, 1);
  assert.equal(j.sessions.Claude.count, 2);
  assert.equal(j.sessions.Claude.limitHit, 1, "대화 길이 한도는 빼고 사용량 한도만");
  assert.equal(j.sessions.Codex.count, 1);
  assert.equal(j.resumes.total, 1);
  assert.equal(j.resumes.afterLimitHit, 1);
  assert.deepEqual(j.resumes.byPair, { "Claude→Codex": 1 });
  assert.equal(j.project, "p", "개인 경로 없이 폴더 이름만");
});

test("audit 설치: 새로 설치, 옛 버전 교체, 직접 고친 파일과 이름만 같은 파일은 멈춤, 플러그인 겹치면 아무것도 안 바꿈", () => {
  const base = tmp("audit");
  const fresh = { CLAUDE_CONFIG_DIR: join(base, "a"), AUDIT_BACKUP_DIR: join(base, "backup") };
  const a = run(S.auditInstall, ["--apply"], { env: fresh });
  assert.equal(a.code, 0, a.out);
  assert.match(a.out, /deep-audit\.md 설치/);
  assert.match(run(S.auditInstall, [], { env: fresh }).out, /deep-audit\.md: 최신/);

  const env = { CLAUDE_CONFIG_DIR: join(base, "b"), AUDIT_BACKUP_DIR: join(base, "backup") };
  write(join(base, "b"), "agents/deep-audit.md", readFileSync(join(HARNESS, "tests/fixtures/old-deep-audit.md"), "utf8").replace(/\r\n/g, "\n"));
  write(join(base, "b"), "commands/audit-all.md", readFileSync(join(HARNESS, "audit/commands/audit-all.md"), "utf8") + "- 결과는 한 번만 (deep-audit)\n");
  write(join(base, "b"), "commands/audit-security.md", "---\ndescription: 회계 감사\n---\n장부 확인\n");
  const r = run(S.auditInstall, ["--apply"], { env });
  assert.equal(r.code, 1, "멈춤 파일이 남아 있음");
  assert.match(r.out, /deep-audit\.md 교체/);
  assert.match(r.out, /audit-all\.md: 건너뜀: 원본 이력에 없는 줄 1개/);
  assert.match(r.out, /audit-security\.md: 건너뜀: 이름만 같은 다른 도구 파일/);
  assert.match(readFileSync(join(base, "b", "commands/audit-security.md"), "utf8"), /회계 감사/);

  const plug = { CLAUDE_CONFIG_DIR: join(base, "c"), AUDIT_BACKUP_DIR: join(base, "backup") };
  mkdirSync(join(base, "c", "plugins", "x", "commands"), { recursive: true });
  write(join(base, "c"), "plugins/x/commands/audit-all.md", "x\n");
  const pr = run(S.auditInstall, ["--apply"], { env: plug });
  assert.equal(pr.code, 1);
  assert.match(pr.out, /플러그인에 같은 이름이 있음/);
  assert.match(pr.out, /아무것도 바꾸지 않았습니다/);
});

test("doctor: Codex 자동 로드 AGENTS 문서 크기 — 한도·config·override·빈 파일·대체 이름·하위 폴더", () => {
  const base = tmp("codexsize");
  const env = { CODEX_HOME: join(base, "codex") };
  const doc = (p, cwd = p) => run(join(p, "scripts/baton/doctor.mjs"), [], { cwd, env }).out;
  const ok = installedProject(join(base, "ok"));
  assert.match(doc(ok), /\[x\] Codex 자동 로드 AGENTS 문서 크기 — \d+\.\dKB \/ 한도 32\.0KB$/m);
  const big = installedProject(join(base, "big"), { edit: (d) => write(d, "AGENTS.md", read(d, "AGENTS.md") + "\n## 프로젝트 고유 규칙\n" + "- 긴 규칙 문장입니다.\n".repeat(1200)) });
  assert.match(doc(big), /\[ \] Codex 자동 로드 AGENTS 문서 크기 — .*한도에 도달하면 Codex가 그 뒤 문서를 더 불러오지 않음/);
  write(join(base, "codex"), "config.toml", "project_doc_max_bytes = 131072\n");
  assert.match(doc(big), /\[x\] .*한도 128\.0KB \(config\.toml 기준, 실제 적용 설정과 다를 수 있음\)/);
  // override는 비어 있어도 선택되어 같은 폴더의 AGENTS.md(baton 규약)를 가림 (Codex 0.166.0 확인)
  const hid = installedProject(join(base, "hid"), { edit: (d) => write(d, "AGENTS.override.md", "# 임시 규칙\n") });
  assert.match(doc(hid), /\[ \] Codex 자동 로드 AGENTS 문서 크기 — 같은 폴더의 AGENTS\.override\.md가 선택되어/);
  const empty = installedProject(join(base, "empty"), { edit: (d) => write(d, "AGENTS.override.md", "  \n") });
  assert.match(doc(empty), /\[ \] Codex 자동 로드 AGENTS 문서 크기 — 같은 폴더의 AGENTS\.override\.md\(비어 있어도 선택됨\)가 선택되어/);
  // 빈 파일은 크기에 안 들어감: 전역 override가 비어 있으면 0으로 세고 전역 AGENTS.md는 안 읽음
  write(join(base, "codex"), "config.toml", "");
  write(join(base, "codex"), "AGENTS.md", "- 전역 규칙\n".repeat(4000));
  assert.match(doc(ok), /\[ \] Codex 자동 로드 AGENTS 문서 크기/, "큰 전역 AGENTS.md는 합산");
  write(join(base, "codex"), "AGENTS.override.md", "");
  assert.match(doc(ok), /\[x\] Codex 자동 로드 AGENTS 문서 크기/, "빈 전역 override가 선택되어 전역 AGENTS.md는 안 셈");
  rmSync(join(base, "codex", "AGENTS.override.md"));
  rmSync(join(base, "codex", "AGENTS.md"));
  // 하위 폴더에서 실행하면 그 폴더의 문서도 합산, 대체 이름(config)도 후보
  write(join(base, "codex"), "config.toml", 'project_doc_fallback_filenames = ["TEAM.md"]\n');
  const sub = installedProject(join(base, "sub"), { edit: (d) => write(d, "game/TEAM.md", "- 팀 규칙\n".repeat(3000)) });
  assert.match(doc(sub), /\[x\] Codex 자동 로드 AGENTS 문서 크기/, "루트에서는 하위 폴더 문서를 안 셈");
  assert.match(doc(sub, join(sub, "game")), /\[ \] Codex 자동 로드 AGENTS 문서 크기 — .*config\.toml 기준/, "game에서 켜면 TEAM.md까지 합산");
});

test("doctor: Codex 전역 지침이 없는 baton 경로를 가리키면 알림, Codex 훅 등록 검사", () => {
  const base = tmp("codexglobal");
  const env = { CODEX_HOME: join(base, "codex") };
  const p = installedProject(join(base, "p"));
  write(join(base, "codex"), "AGENTS.md", `# 전역\n- baton 규칙: ${join(base, "baton", "GLOBAL_RULES.md")} 를 따른다.\n`);
  const r = run(join(p, "scripts/baton/doctor.mjs"), [], { cwd: p, env });
  assert.match(r.out, /\[ \] Codex 전역 지침\(AGENTS\.md\)의 baton 경로 — 없는 경로를 가리킴/);
  write(join(base, "baton"), "GLOBAL_RULES.md", "# 규칙\n");
  assert.match(run(join(p, "scripts/baton/doctor.mjs"), [], { cwd: p, env }).out, /\[x\] Codex 전역 지침\(AGENTS\.md\)의 baton 경로/);
  const doc = (cwd = p) => run(join(p, "scripts/baton/doctor.mjs"), [], { cwd, env }).out;
  assert.match(doc(), /\[x\] Codex SessionStart 훅 등록 \(\.codex\/hooks\.json 기준\) — 등록됨\. 처음 열 때 Codex가 묻는 신뢰/);
  write(p, ".codex/hooks.json", JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }] } }));
  assert.match(doc(), /\[ \] Codex SessionStart 훅 등록 .* — SessionStart에 status\.mjs 훅 없음/);
  write(p, ".codex/hooks.json", "{ 깨짐");
  assert.match(doc(), /\[ \] Codex SessionStart 훅 등록 .* — JSON 오류/);
  rmSync(join(p, ".codex"), { recursive: true });
  assert.match(doc(), /\[ \] Codex SessionStart 훅 등록 .* — \.codex\/hooks\.json 없음 → baton 업데이트로 추가/);

  // 키트의 훅 명령을 하위 폴더에서 실제로 실행해 봄 (Git 최상위의 status.mjs를 찾는지)
  const cmd = JSON.parse(read(KIT, ".codex/hooks.json")).hooks.SessionStart[0].hooks[0].command;
  const js = cmd.match(/^node -e "(.*)"$/)[1].replace(/\\"/g, '"');
  const out = execFileSync(process.execPath, ["-e", js], { cwd: join(p, "tasks"), encoding: "utf8" });
  assert.match(out, /=== Baton 상태 ===/);
  assert.match(out, /ACTIVE\.md:/);
  assert.doesNotMatch(out, /파일 없음/);

  // baton이 저장소 하위 폴더에 있으면 Codex 훅이 못 찾는다고 알림
  const outer = initRepo(join(base, "outer"));
  const nested = join(outer, "app");
  copyKit(nested);
  commitAll(outer, "i");
  assert.match(run(join(nested, "scripts/baton/doctor.mjs"), [], { cwd: nested, env }).out, /\[ \] Codex SessionStart 훅 등록 .* — baton이 Git 저장소의 하위 폴더에 있어/);
});

test("비상 인계: 한도로 끊긴 지난 세션을 세션 시작 때 알리고, rescue가 짧은 초안을 보여줌(비밀값 가림, 지금 세션은 건너뜀)", () => {
  const base = tmp("rescue");
  const env = isolatedEnv(base);
  const p = installedProject(join(base, "p"));
  git(p, "switch", "-q", "-c", "task/login");
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const status = () => run(join(p, "scripts/baton/status.mjs"), [], { cwd: p, env }).out;
  const rescue = (...a) => run(join(p, "scripts/baton/rescue.mjs"), a, { cwd: p, env }).out;

  // 깨끗하게 끝난 세션: 알림 없음
  claudeSession(env, p, [
    { type: "user", cwd: p, timestamp: ago(300), message: { role: "user", content: "README 오타 고쳐줘" } },
    { type: "assistant", cwd: p, timestamp: ago(299), message: { id: "a0", content: [{ type: "text", text: "고쳤어요" }], usage: { input_tokens: 9 } } },
  ], "s0");
  assert.doesNotMatch(status(), /비상 인계/);

  // Claude 세션이 한도로 끊김 + 고친 파일이 커밋 안 됨
  write(p, "src/login.js", "export const login = () => {};\n");
  const key = "sk-ant-" + "a".repeat(30);
  claudeSession(env, p, [
    { type: "user", cwd: p, timestamp: ago(120), message: { role: "user", content: `로그인 만들어줘. 키는 ${key}` } },
    { type: "assistant", cwd: p, timestamp: ago(119), message: { id: "m1", content: [{ type: "tool_use", name: "Write", input: { file_path: join(p, "src/login.js") } }], usage: { input_tokens: 10 } } },
    { type: "user", cwd: p, timestamp: ago(100), message: { role: "user", content: "리다이렉트도 붙여줘" } },
    { type: "assistant", cwd: p, timestamp: ago(99), message: { id: "m2", content: [{ type: "text", text: "리다이렉트는 router.js에 붙이는 중이에요" }], usage: { input_tokens: 10 } } },
    { type: "assistant", cwd: p, timestamp: ago(98), isApiErrorMessage: true, message: { id: "e1", model: "<synthetic>", content: [{ type: "text", text: "5-hour limit reached ∙ resets 3pm" }] } },
  ], "s1");
  assert.match(status(), /! 비상 인계: 지난 Claude 세션\(.+\)이 사용량 한도로 끝남 → node scripts\/baton\/rescue\.mjs/);

  // 지금 막 시작한 세션(요청 적음)은 건너뛰고 지난 세션을 고름
  claudeSession(env, p, [{ type: "user", cwd: p, timestamp: ago(1), message: { role: "user", content: "이어서 하자" } }], "s2");
  const r = rescue();
  assert.match(r, /지난 세션: Claude, .*요청 2개, 사용량 한도로 끝남/);
  assert.match(r, /지금 브랜치: task\/login/);
  assert.match(r, /커밋 안 된 변경: 1개 파일 .*src\/login\.js\(새 파일\)/);
  assert.match(r, /첫 요청: "로그인 만들어줘/);
  assert.match(r, /- "리다이렉트도 붙여줘"/);
  assert.match(r, /마지막 답변: "5-hour limit reached/);
  assert.match(r, /그 세션에서 고친 파일: src\/login\.js/);
  assert.ok(!r.includes(key), "비밀값은 가림");
  assert.match(r, /sk-a\*\*\*\*\(37자\)/);
  assert.ok(Buffer.byteLength(r) <= 1536, `초안이 ${Buffer.byteLength(r)}바이트 > 1.5KB`);

  // 넘길게(HANDOFF) 커밋을 하면 알림 없음
  git(p, "add", "-A");
  git(p, "commit", "-q", "-m", "wip(login): checkpoint before handoff", "--date", ago(90));
  assert.doesNotMatch(status(), /비상 인계/);

  // Codex 세션이 한도로 끊김: apply_patch로 고친 파일을 보여줌
  write(p, "src/router.js", "// wip\n");
  codexSession(env, [
    { timestamp: ago(60), type: "session_meta", payload: { cwd: p } },
    { timestamp: ago(59), type: "event_msg", payload: { type: "user_message", message: "라우터 고쳐줘" } },
    { timestamp: ago(58), type: "response_item", payload: { type: "custom_tool_call", name: "apply_patch", input: "*** Begin Patch\n*** Update File: src/router.js\n@@\n-a\n+b\n*** End Patch" } },
    { timestamp: ago(57), type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { total_tokens: 50 } } } },
    { timestamp: ago(56), type: "event_msg", payload: { type: "agent_message", message: "라우터 절반 고침" } },
    { timestamp: ago(55), type: "event_msg", payload: { type: "error", message: "You've hit your usage limit. Try again in 3 hours." } },
  ], "c1");
  assert.match(status(), /! 비상 인계: 지난 Codex 세션/);
  const rc = rescue();
  assert.match(rc, /지난 세션: Codex/);
  assert.match(rc, /그 세션에서 고친 파일: src\/router\.js/);
  assert.match(rc, /마지막 답변: "라우터 절반 고침"/);
  assert.match(rescue("--pick", "2"), /지난 세션: Claude/);
});

test("cost: 세션마다 고정으로 들어가는 것과 필요할 때만 들어가는 것, 세션 기록 실측 비교", () => {
  const base = tmp("cost");
  const env = isolatedEnv(base);
  const p = installedProject(join(base, "p"));
  const plain = join(base, "plain");
  mkdirSync(plain, { recursive: true });
  write(join(base, "rules"), "GLOBAL_RULES.md", "# 규칙\n" + "가".repeat(300) + "\n");
  write(env.CLAUDE_CONFIG_DIR, "CLAUDE.md", `# 내 메모\n@${join(base, "rules", "GLOBAL_RULES.md")}\n`);
  const first = (cwd, n, id) => claudeSession(env, cwd, [
    { type: "user", cwd, timestamp: new Date().toISOString(), message: { role: "user", content: "안녕" } },
    { type: "assistant", cwd, timestamp: new Date().toISOString(), message: { id, usage: { input_tokens: 3, cache_creation_input_tokens: n, cache_read_input_tokens: 0 } } },
  ], id);
  first(p, 20000, "b1");
  first(plain, 17000, "o1");
  const r = run(S.cost, [p], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\[Claude 고정\(모든 폴더\)\] 약 .* 토큰 \(그중 baton /);
  assert.match(r.out, /\[b\] .*GLOBAL_RULES\.md: 0\.\dKB, 약 30\d/);
  assert.match(r.out, /\[b\] AGENTS\.md — baton 블록: 9\.\dKB/);
  assert.match(r.out, /\[b\] 세션 시작 훅 출력\(status\.mjs\)/);
  assert.match(r.out, /\[필요할 때만\]/);
  assert.match(r.out, /Claude: baton 프로젝트 20\.0k \(1개\) · 그 밖의 폴더 17\.0k \(1개\) → 차이 \+3\.0k/);
  assert.match(r.out, /Codex: 세션 기록 없음/);
  assert.doesNotMatch(r.out, /안녕/, "대화 내용은 보여주지 않음");
});
