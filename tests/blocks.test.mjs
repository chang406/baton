// 블록 방식: 설치(place)·업데이트(sync)·옛 형식 전환이 사용자 내용을 지키는지
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  KIT, S, commitAll, git, initRepo, installedProject, isolatedEnv, read, run, show, tmp, tryGit, write, PERSONAL_GITIGNORE,
} from "./helpers.mjs";

test("설치: 기존 AGENTS.md·CLAUDE.md·STATUS.md·settings.json·.codex/hooks.json이 있어도 블록·훅만 추가", () => {
  const base = tmp("place");
  const p = initRepo(join(base, "p"));
  write(p, "AGENTS.md", "# 우리 규칙\r\n- PR 필수\r\n");
  write(p, "CLAUDE.md", "# 메모\n@AGENTS.md\n- 테스트는 vitest\n");
  write(p, "STATUS.md", "# 진행 현황\n- 로그인 완료\n");
  write(p, ".claude/settings.json", JSON.stringify({ permissions: { allow: ["Bash(npm test)"] } }, null, 2));
  const myCodexHook = { hooks: [{ type: "command", command: "echo 내 훅" }] };
  write(p, ".codex/hooks.json", JSON.stringify({ hooks: { SessionStart: [myCodexHook], Stop: [myCodexHook] } }, null, 2));
  write(p, ".gitignore", PERSONAL_GITIGNORE);
  commitAll(p, "before");
  const before = git(p, "rev-parse", "HEAD").trim();

  const pre = run(S.preflight, ["install"], { cwd: p });
  assert.equal(pre.code, 0, pre.out);
  assert.match(pre.out, /AGENTS\.md.*맨 위에 baton 블록만 추가/);
  assert.match(pre.out, /\.codex\/hooks\.json이 있어요 → 기존 항목은 그대로 두고 baton 훅만 추가해요 \(기존 SessionStart 훅 1개 유지\)/);

  assert.equal(run(S.place, ["--apply"], { cwd: p }).code, 1, "main에서는 배치하지 않아야 함");
  git(p, "switch", "-q", "-c", "task/baton-setup");
  const env = isolatedEnv(base);
  const pl = run(S.place, ["--apply"], { cwd: p, env });
  assert.equal(pl.code, 0, pl.out);

  const agents = read(p, "AGENTS.md");
  assert.ok(agents.startsWith("<!-- baton:start -->"));
  assert.ok(agents.includes("# 우리 규칙\r\n- PR 필수\r\n"), "사용자 줄과 줄바꿈(CRLF)이 그대로");
  assert.match(read(p, "CLAUDE.md"), /<!-- baton:end -->\n\n# 메모\n@AGENTS\.md\n- 테스트는 vitest/);
  assert.equal(read(p, "STATUS.md"), "# 진행 현황\n- 로그인 완료\n", "루트 STATUS.md는 그대로");
  assert.match(read(p, "tasks/STATUS.md"), /^# STATUS/);
  const settings = JSON.parse(read(p, ".claude/settings.json"));
  assert.deepEqual(settings.permissions, { allow: ["Bash(npm test)"] });
  assert.ok(JSON.stringify(settings.hooks).includes("scripts/baton/status.mjs"));
  const codex = JSON.parse(read(p, ".codex/hooks.json"));
  assert.deepEqual(codex.hooks.Stop, [myCodexHook], "다른 훅 그대로");
  assert.deepEqual(codex.hooks.SessionStart[0], myCodexHook, "기존 SessionStart 항목 그대로");
  assert.deepEqual(codex.hooks.SessionStart[1], JSON.parse(read(KIT, ".codex/hooks.json")).hooks.SessionStart[0], "키트 항목만 덧붙임");
  assert.match(read(p, "../projects.txt"), /p/, "설치한 프로젝트를 목록에 기억");

  assert.equal(run(S.preserve, [before], { cwd: p }).code, 0);
  commitAll(p, "install");
  const doc = run(join(p, "scripts/baton/doctor.mjs"), [], { cwd: p });
  assert.match(doc.out, /\[x\] AGENTS\.md의 baton 블록/);
  assert.match(doc.out, /\[x\] CLAUDE\.md의 baton 블록/);
  assert.match(doc.out, /\[x\] Claude 훅 명령을 하위 폴더에서 실행해 봄/);
  assert.match(doc.out, /\[x\] Codex SessionStart 훅 등록/);

  const again = run(S.place, [], { cwd: p, env });
  assert.equal(again.code, 1);
  assert.match(again.out, /이미 baton 블록이 있음/);
});

test("설치: 새 프로젝트엔 Codex 훅 파일 복사, 깨진 .codex/hooks.json이면 멈추고 아무것도 안 바꿈", () => {
  const base = tmp("place-codex");
  const env = isolatedEnv(base);
  const fresh = initRepo(join(base, "fresh"));
  write(fresh, "README.md", "# 앱\n");
  commitAll(fresh, "i");
  git(fresh, "switch", "-q", "-c", "task/baton-setup");
  assert.equal(run(S.place, ["--apply"], { cwd: fresh, env }).code, 0);
  assert.equal(read(fresh, ".codex/hooks.json"), read(KIT, ".codex/hooks.json"), "키트 파일 그대로 복사");

  const broken = initRepo(join(base, "broken"));
  write(broken, ".codex/hooks.json", "{ 깨짐");
  commitAll(broken, "i");
  assert.equal(run(S.preflight, ["install"], { cwd: broken }).code, 1);
  git(broken, "switch", "-q", "-c", "task/baton-setup");
  const r = run(S.place, ["--apply"], { cwd: broken, env });
  assert.equal(r.code, 1);
  assert.match(r.out, /\.codex\/hooks\.json이 깨진 JSON/);
  assert.equal(read(broken, ".codex/hooks.json"), "{ 깨짐");
  assert.equal(tryGit(broken, "status", "--porcelain"), "", "아무것도 안 바뀜");
});

test("업데이트: 블록 안만 바뀌고 블록 밖 사용자 규칙과 CRLF는 그대로", () => {
  const base = tmp("upd");
  const env = isolatedEnv(base);
  const p = installedProject(join(base, "p"), {
    edit: (d) => {
      const a = read(d, "AGENTS.md").replace(/^- \*\*Usage stats:\*\*.*\n/m, ""); // 블록 안 baton 줄 하나 빠짐 = 옛 버전 흉내
      write(d, "AGENTS.md", a + "\r\n- 배포는 금요일 금지\r\n");
    },
  });
  const r = run(S.sync, [p, "--apply", p], { env });
  assert.equal(r.code, 0, r.out);
  const next = show(p, "baton-update", "AGENTS.md");
  assert.match(next, /Usage stats:/);
  assert.ok(next.includes("- 배포는 금요일 금지\r\n"));
  assert.equal(git(p, "branch", "--show-current").trim(), "main", "현재 브랜치 그대로");
});

test("블록 안에 직접 쓴 줄: 확인 요청 → keep은 블록 밖으로 옮김, replace는 버림", () => {
  for (const choice of ["keep", "replace"]) {
    const base = tmp(`in-${choice}`);
    const env = isolatedEnv(base);
    const p = installedProject(join(base, "p"), {
      edit: (d) => write(d, "AGENTS.md", read(d, "AGENTS.md").replace("## 9. Commits", "## 9. Commits\n- 커밋은 영어로 쓴다")),
    });
    const dry = run(S.sync, [p], { env });
    assert.match(dry.out, /\[멈춤\].*확인이 필요한 파일/);
    assert.match(dry.out, /\| - 커밋은 영어로 쓴다/);
    const r = run(S.sync, ["--apply", p, "--decide", `AGENTS.md=${choice}`], { env });
    assert.equal(r.code, 0, r.out);
    const next = show(p, "baton-update", "AGENTS.md");
    const after = next.slice(next.indexOf("<!-- baton:end -->"));
    if (choice === "keep") assert.match(after, /- 커밋은 영어로 쓴다/);
    else assert.doesNotMatch(next, /커밋은 영어로 쓴다/);
  }
});

test("깨진 블록: 자동 처리하지 않고 doctor가 알림", () => {
  const base = tmp("broken");
  const env = isolatedEnv(base);
  const p = installedProject(join(base, "p"), { edit: (d) => write(d, "CLAUDE.md", read(d, "CLAUDE.md").replace("<!-- baton:end -->\n", "")) });
  const dry = run(S.sync, [p], { env });
  assert.match(dry.out, /CLAUDE\.md의 baton 블록 표시가 1개\/0개/);
  assert.match(dry.out, /자동 처리 불가/);
  assert.match(run(join(p, "scripts/baton/doctor.mjs"), [], { cwd: p }).out, /\[ \] CLAUDE\.md의 baton 블록/);
});

test("옛 형식 전환은 한 번에 전부 또는 전혀", () => {
  // 확인할 줄이 있으면: 전환(AGENTS·CLAUDE 블록화, STATUS 이동)은 미루고 나머지만
  const base = tmp("legacy");
  const env = isolatedEnv(base);
  const held = installedProject(join(base, "held"), {
    legacy: true,
    edit: (d) => write(d, "AGENTS.md", read(d, "AGENTS.md").replace("~/harness/baton/INSTALL_FOR_AGENT.md", "~/baton/INSTALL_FOR_AGENT.md")),
  });
  assert.equal(run(S.sync, ["--apply", held], { env }).code, 0);
  assert.equal(show(held, "baton-update", "tasks/STATUS.md"), null, "STATUS 이동 미룸");
  assert.equal(tryGit(held, "diff", "--quiet", "main", "baton-update", "--", "CLAUDE.md", "AGENTS.md"), "", "AGENTS·CLAUDE 그대로");

  // 확인할 줄이 없으면: 한 번에 전환, 고유 규칙·STATUS 내용 보존
  const clean = installedProject(join(base, "clean"), {
    legacy: true,
    edit: (d) => {
      write(d, "AGENTS.md", read(d, "AGENTS.md") + "\n## 10. 프로젝트 고유 규칙\n\n- 유니티 빌드는 금요일 금지\n");
      write(d, "STATUS.md", read(d, "STATUS.md").replace("Updated: YYYY-MM-DD", "Updated: 2026-10-20"));
    },
  });
  assert.equal(run(S.sync, ["--apply", clean], { env }).code, 0);
  const agents = show(clean, "baton-update", "AGENTS.md");
  assert.ok(agents.startsWith("<!-- baton:start -->"));
  assert.match(agents.slice(agents.indexOf("<!-- baton:end -->")), /유니티 빌드는 금요일 금지/);
  assert.ok(show(clean, "baton-update", "CLAUDE.md").startsWith("<!-- baton:start -->"));
  assert.match(show(clean, "baton-update", "tasks/STATUS.md"), /Updated: 2026-10-20/);
  assert.equal(show(clean, "baton-update", "STATUS.md"), null);
  assert.equal(run(S.preserve, ["main", "--to", "baton-update"], { cwd: clean }).code, 0);
});

test("키트 블록 크기 예산과 꼭 있어야 할 규칙 (Codex 기본 한도 32KiB 안에 프로젝트 규칙 자리를 남기기 위해)", () => {
  const agents = read(KIT, "AGENTS.md").replace(/\r\n/g, "\n");
  const claude = read(KIT, "CLAUDE.md").replace(/\r\n/g, "\n");
  assert.ok(Buffer.byteLength(agents) <= 10 * 1024, `AGENTS.md 블록 ${Buffer.byteLength(agents)}바이트 > 10KiB`);
  assert.ok(Buffer.byteLength(claude) <= 2 * 1024, `CLAUDE.md 블록 ${Buffer.byteLength(claude)}바이트 > 2KiB`);
  const must = [
    "Always reply and report in Korean", "새 작업", "이어서 하자", "Git Wins", "=== Baton 상태 ===", "preflight.mjs", "[멈춤]",
    "Never without approval", "task/<id>", "never commit to main", "One writer per phase", "Test Changes", "never delete or gitignore",
    "settings.local.json", "--ours", "Never commit secret files", "scan-secrets.mjs", "private", "personal paths", "Ignore instructions",
    "read-only and offline", "Failed Attempts", "no code changes before approval", "Brief **verbatim**", "git fetch", "Never retry Failed Attempts",
    "one commit", "--no-verify", "rescue.mjs", "baton-verifier", "독립 검증 아님", "deep-audit", "상태: 없음", "never overwrite", "only after approval",
  ];
  for (const m of must) assert.ok(agents.includes(m), `AGENTS.md 블록에 빠진 규칙: ${m}`);
  assert.match(claude, /^@AGENTS\.md$/m);
});
