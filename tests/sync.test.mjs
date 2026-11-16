// sync: 프로젝트 찾기, 건너뛰기 조건, 확인 필요 파일 결정(--decide), 이어서 커밋, 합치기(--merge)
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  KIT, S, claudeSession, codexSession, commitAll, copyKit, git, initRepo, installedProject, isolatedEnv, read, run, show, tmp, tryGit, write,
} from "./helpers.mjs";

test("찾기: 첫 줄이 아주 긴 Claude·Codex 기록도 찾고, 찾은 건 목록에 기억", () => {
  const base = tmp("find");
  const env = isolatedEnv(base);
  const p1 = installedProject(join(base, "desk", "p1"));
  const p2 = installedProject(join(base, "desk", "p2"));
  // 이미지 붙여넣기처럼 첫 줄이 90KB, Codex session_meta에 20KB 지시문
  claudeSession(env, p1, [{ parentUuid: null, cwd: p1, type: "user", message: { content: [{ type: "image", data: "A".repeat(90000) }] } }]);
  codexSession(env, [{ type: "session_meta", payload: { cwd: p2, instructions: "B".repeat(20000) } }]);
  const r = run(S.sync, [], { env });
  assert.match(r.out, /p1/);
  assert.match(r.out, /p2/);
  assert.match(r.out, /새로 찾은 2개를 목록/);
  // 세션 기록이 지워져도(30일 흉내) 목록으로 찾고, 중복 추가 없음, 사용자 메모 보존
  rmSync(env.CLAUDE_CONFIG_DIR, { recursive: true, force: true });
  rmSync(env.CODEX_HOME, { recursive: true, force: true });
  writeFileSync(env.BATON_PROJECTS_FILE, read(base, "projects.txt") + "# 내 메모\n");
  const again = run(S.sync, [], { env });
  assert.match(again.out, /p1/);
  assert.doesNotMatch(again.out, /새로 찾은/);
  const list = read(base, "projects.txt");
  assert.equal((list.match(/p1/g) || []).length, 1);
  assert.match(list, /# 내 메모/);
  // 사라진 폴더는 멈추고 묻기 (목록 줄은 지우지 않음)
  rmSync(p1, { recursive: true, force: true });
  const gone = run(S.sync, [], { env });
  assert.equal(gone.code, 1);
  assert.match(gone.out, /\[멈춤\] 세션 기록·목록에 있지만 지금은 없는 폴더 1개/);
  assert.match(read(base, "projects.txt"), /p1/);
});

test("--scan: 지정한 폴더 아래에서 찾고 node_modules·baton 없는 폴더는 제외", () => {
  const base = tmp("scan");
  const env = isolatedEnv(base);
  installedProject(join(base, "desk", "ing", "deep", "p3"));
  mkdirSync(join(base, "desk", "web", "node_modules", "pkg"), { recursive: true });
  write(join(base, "desk", "web", "node_modules", "pkg"), "AGENTS.md", read(KIT, "AGENTS.md"));
  write(join(base, "desk", "plain"), "AGENTS.md", "# 그냥 규칙\n");
  const r = run(S.sync, ["--scan", join(base, "desk")], { env });
  assert.match(r.out, /폴더 찾기\(--scan\)로 1개 찾음/);
  assert.match(r.out, /deep[\\/]p3/);
  assert.doesNotMatch(r.out, /node_modules/);
});

test("건너뛰기: main에 baton 미병합, Node 없이 설치, 직접 고친 명령 파일", () => {
  const base = tmp("skip");
  const env = isolatedEnv(base);
  const unmerged = initRepo(join(base, "unmerged"));
  write(unmerged, "AGENTS.md", "# 우리 팀 규칙\n");
  commitAll(unmerged, "i");
  git(unmerged, "switch", "-q", "-c", "task/baton-setup");
  write(unmerged, "AGENTS.md", read(KIT, "AGENTS.md") + "\n# 우리 팀 규칙\n");
  commitAll(unmerged, "install");
  const nonode = installedProject(join(base, "nonode"), { edit: (d) => { rmSync(join(d, "scripts"), { recursive: true }); rmSync(join(d, ".claude/settings.json")); } });
  const own = installedProject(join(base, "own"), { edit: (d) => write(d, ".claude/commands/task-start.md", read(d, ".claude/commands/task-start.md") + "\n시작 전에 Jira 번호를 묻는다. (AGENTS.md)\n") });
  const r = run(S.sync, [unmerged, nonode, own], { env });
  assert.match(r.out, /unmerged\s+건너뜀: main에 baton이 아직 합쳐지지 않음/);
  assert.match(r.out, /nonode\s+최신.*Node 없이 설치됨/);
  assert.match(r.out, /own\s+최신.*확인 필요: \.claude\/commands\/task-start\.md/);
  assert.match(r.out, /\| 시작 전에 Jira 번호를 묻는다/);
  assert.equal(show(unmerged, "main", "AGENTS.md"), "# 우리 팀 규칙\n", "원래 AGENTS.md 그대로");
});

test("원격 처리(게임 프로젝트 사례): 반쪽 브랜치 위에 이어서 결정 → 보존 확인 → 합치기", () => {
  const base = tmp("vs");
  const env = isolatedEnv(base);
  const p = installedProject(join(base, "vs"), {
    legacy: true,
    edit: (d) => {
      write(d, "AGENTS.md", read(d, "AGENTS.md").replace("~/harness/baton/INSTALL_FOR_AGENT.md", "~/baton/INSTALL_FOR_AGENT.md") + "\n## 10. 프로젝트 고유 규칙\n\n- 유니티 빌드는 금요일 금지\n");
      write(d, "scripts/baton/check-active.mjs", read(d, "scripts/baton/check-active.mjs").replace("\n", "\n// 옛 버전 한 줄\n"));
    },
  });
  // 고치기 전 sync가 만든 반쪽 브랜치: CLAUDE 전환 + STATUS 이동만
  git(p, "switch", "-q", "-c", "baton-update");
  git(p, "mv", "STATUS.md", "tasks/STATUS.md");
  write(p, "CLAUDE.md", read(KIT, "CLAUDE.md"));
  commitAll(p, "half");
  git(p, "switch", "-q", "main");
  git(p, "switch", "-q", "-c", "task/play");
  write(p, "play.txt", "wip\n"); // 작업 중, 커밋 안 된 변경

  const dry = run(S.sync, [p], { env });
  assert.match(dry.out, /check-active\.mjs: 원본 이력에 없는 줄 1개/);
  assert.match(dry.out, /--decide /);
  const ap = run(S.sync, ["--apply", p, "--decide", "AGENTS.md=replace,scripts/baton/check-active.mjs=replace"], { env });
  assert.match(ap.out, /이어서 커밋함/);
  const agents = show(p, "baton-update", "AGENTS.md");
  assert.ok(agents.startsWith("<!-- baton:start -->"));
  assert.match(agents, /유니티 빌드는 금요일 금지/);
  assert.doesNotMatch(agents, /~\/baton\/INSTALL/);

  const refused = run(S.sync, ["--merge", p], { env });
  assert.match(refused.out, /보존 확인에서 사라지는 줄이 있어 합치지 않음/);
  assert.ok(show(p, "main", "AGENTS.md").startsWith("<!-- baton v1 -->"), "아직 안 합침");
  const merged = run(S.sync, ["--merge", p, "--accept-dropped"], { env });
  assert.match(merged.out, /main에 합치고 브랜치를 정리/);
  assert.ok(show(p, "main", "AGENTS.md").startsWith("<!-- baton:start -->"));
  assert.equal(git(p, "branch", "--show-current").trim(), "task/play", "작업 중인 브랜치 그대로");
  assert.ok(existsSync(join(p, "play.txt")), "커밋 안 된 변경 그대로");
  assert.equal(tryGit(p, "rev-parse", "--verify", "-q", "refs/heads/baton-update"), null, "합친 브랜치 정리");
});

test("원격 처리(웹 프로젝트 사례): keep·split으로 사용자 내용을 모두 지키고 합치기", () => {
  const base = tmp("sal");
  const env = isolatedEnv(base);
  const p = installedProject(join(base, "sal"), {
    legacy: true,
    edit: (d) => {
      write(d, "AGENTS.md", read(d, "AGENTS.md").replace("- 비밀값(.env 등)은 커밋하지 않는다.\n", "- 비밀값(.env 등)은 커밋하지 않는다.\n- 급여 데이터는 샘플만 쓴다.\n"));
      write(d, "CLAUDE.md", "# Ledgerapp 메모\n- 테스트는 pytest\n");
      write(d, "STATUS.md", read(d, "STATUS.md") + "\n## 기존 STATUS.md (원문)\n\n# 진행 현황\n- 급여 계산 완료\n");
    },
  });
  const dry = run(S.sync, [p], { env });
  for (const f of ["AGENTS.md", "CLAUDE.md", "STATUS.md"]) assert.match(dry.out, new RegExp(`- ${f.replace(".", "\\.")}:`));
  const bad = run(S.sync, ["--apply", p, "--decide", "CLAUDE.md=replace"], { env });
  assert.notEqual(bad.code, 0);
  assert.match(bad.out, /replace를 고를 수 없어요/);
  const ap = run(S.sync, ["--apply", p, "--decide", "AGENTS.md=keep,CLAUDE.md=keep,STATUS.md=split"], { env });
  assert.equal(ap.code, 0, ap.out);
  const agents = show(p, "baton-update", "AGENTS.md");
  assert.match(agents.slice(agents.indexOf("<!-- baton:end -->")), /급여 데이터는 샘플만 쓴다/);
  assert.match(show(p, "baton-update", "CLAUDE.md"), /<!-- baton:end -->\n\n# Ledgerapp 메모\n- 테스트는 pytest/);
  assert.equal(show(p, "baton-update", "STATUS.md"), "# 진행 현황\n- 급여 계산 완료\n");
  assert.match(show(p, "baton-update", "tasks/STATUS.md"), /## Run \/ Development/);
  const m = run(S.sync, ["--merge", p], { env });
  assert.match(m.out, /main에 합치고/);
  assert.equal(git(p, "branch", "--show-current").trim(), "main");
  assert.ok(read(p, "AGENTS.md").startsWith("<!-- baton:start -->"), "main에 있었으니 작업 폴더도 갱신");
});

test("--decide 오류: 확인 대상이 아닌 파일, 여러 프로젝트", () => {
  const base = tmp("dec");
  const env = isolatedEnv(base);
  const p = installedProject(join(base, "p"));
  const q = installedProject(join(base, "q"));
  assert.match(run(S.sync, ["--apply", p, "--decide", "README.md=keep"], { env }).out, /확인이 필요한 파일이 아니에요/);
  assert.match(run(S.sync, ["--apply", "all", "--decide", "AGENTS.md=keep", p, q], { env }).out, /프로젝트 하나를 고를 때만/);
  assert.match(run(S.sync, ["--apply", p, "--decide", "AGENTS.md=maybe"], { env }).out, /형식 오류/);
});

test("경로 이름이 달라도(링크 경로, Windows 짧은 이름 같은 경우) 같은 프로젝트로 봄", { skip: process.platform === "win32" && "Windows는 링크 만들기에 권한이 필요(대신 CI의 짧은 임시 경로가 같은 경우를 시험)" }, () => {
  const base = tmp("alias");
  const env = isolatedEnv(base);
  const real = installedProject(join(base, "real"), { edit: (d) => write(d, "AGENTS.md", read(d, "AGENTS.md").replace(/^- \*\*Usage stats:\*\*.*\n/m, "")) });
  symlinkSync(real, join(base, "alias"), "dir");
  const r = run(S.sync, [join(base, "alias")], { env });
  assert.doesNotMatch(r.out, /main에 baton이 아직 합쳐지지 않음/);
  assert.match(r.out, /업데이트 필요: 파일 1개 — AGENTS\.md/);
  // 링크 경로로 찾고 실제 경로로 골라도(또는 그 반대) 같은 프로젝트 하나
  const both = run(S.sync, [join(base, "alias"), real], { env });
  assert.match(both.out, /baton이 설치된 프로젝트 1개/);
  const ap = run(S.sync, ["--apply", real, join(base, "alias")], { env });
  assert.equal(ap.code, 0, ap.out);
  assert.match(show(real, "baton-update", "AGENTS.md"), /Usage stats:/);
});

test("Codex 훅: 없는 설치엔 추가, 사용자가 만든 .codex/hooks.json은 그대로 두고 알림, Node 없는 설치엔 안 넣음", () => {
  const base = tmp("codexhook");
  const env = isolatedEnv(base);
  const old = installedProject(join(base, "old"), { edit: (d) => rmSync(join(d, ".codex"), { recursive: true }) });
  const mine = installedProject(join(base, "mine"), { edit: (d) => write(d, ".codex/hooks.json", '{ "hooks": { "Stop": [] } }\n') });
  const nonode = installedProject(join(base, "nonode"), { edit: (d) => { rmSync(join(d, "scripts"), { recursive: true }); rmSync(join(d, ".codex"), { recursive: true }); } });
  const r = run(S.sync, ["--apply", "all", old, mine, nonode], { env });
  assert.equal(r.code, 0, r.out);
  assert.equal(show(old, "baton-update", ".codex/hooks.json"), read(KIT, ".codex/hooks.json").replace(/\r\n/g, "\n"));
  assert.match(r.out, /mine.*\.codex\/hooks\.json 있음\(baton 훅 없음\) → 그대로 둠/);
  assert.equal(tryGit(mine, "rev-parse", "--verify", "-q", "refs/heads/baton-update"), null, "바꿀 게 없으면 브랜치도 없음");
  assert.equal(show(nonode, "baton-update", ".codex/hooks.json"), null);
  assert.equal(run(S.preserve, ["main", "--to", "baton-update"], { cwd: old }).code, 0);
});

test("작업 폴더에 baton이 안 보여도 로컬 브랜치에 있으면 찾음, 직접 준 폴더를 못 찾으면 이유", () => {
  const base = tmp("branchfind");
  const env = isolatedEnv(base);
  // main엔 baton이 있는데 작업 폴더는 baton 이전에 갈라진 옛 브랜치 (웹 프로젝트 사례)
  const old = initRepo(join(base, "desk", "old"));
  write(old, "app.py", "print(1)\n");
  commitAll(old, "app");
  git(old, "branch", "task/old-feature");
  copyKit(old);
  write(old, "AGENTS.md", read(old, "AGENTS.md").replace(/^- \*\*Usage stats:\*\*.*\n/m, "")); // 업데이트할 게 있게
  commitAll(old, "baton");
  git(old, "switch", "-q", "task/old-feature");
  write(old, "wip.txt", "작업 중\n");
  // 설치 브랜치에만 있고 작업 폴더는 main
  const pending = initRepo(join(base, "desk", "pending"));
  write(pending, "AGENTS.md", "# 우리 규칙\n");
  commitAll(pending, "i");
  git(pending, "switch", "-q", "-c", "task/baton-setup");
  copyKit(pending);
  commitAll(pending, "install");
  git(pending, "switch", "-q", "main");
  const plain = initRepo(join(base, "desk", "plain"));
  write(plain, "README.md", "# x\n");
  commitAll(plain, "i");

  const r = run(S.sync, [old, pending, plain], { env });
  assert.match(r.out, /old\s+업데이트 필요: .*AGENTS\.md.*작업 폴더는 task\/old-feature 브랜치\(baton 이전\)라 안 보였음/);
  assert.match(r.out, /pending\s+건너뜀: main에 baton이 아직 합쳐지지 않음.*baton은 task\/baton-setup 브랜치에 있음/);
  assert.match(r.out, /plain: baton 표시가 있는 AGENTS\.md가 없음/);
  assert.match(read(base, "projects.txt"), /old/, "브랜치로 찾은 것도 목록에 기억");

  const ap = run(S.sync, ["--apply", old], { env });
  assert.equal(ap.code, 0, ap.out);
  assert.match(show(old, "baton-update", "AGENTS.md"), /Usage stats:/);
  assert.equal(git(old, "branch", "--show-current").trim(), "task/old-feature", "현재 브랜치 그대로");
  assert.equal(read(old, "wip.txt"), "작업 중\n", "커밋 안 된 파일 그대로");
  assert.ok(!existsSync(join(old, "scripts")), "작업 폴더에 baton 파일이 생기지 않음");

  // --scan도 브랜치에만 있는 프로젝트를 찾음
  const sc = run(S.sync, ["--scan", join(base, "desk")], { env: { ...env, BATON_PROJECTS_FILE: join(base, "p2.txt") } });
  assert.match(sc.out, /폴더 찾기\(--scan\)로 2개 찾음/);
});

test(".gitignore: 안 합친 baton-update에 같은 줄을 다시 붙이지 않음, 예전 중복 블록은 하나로, 다른 곳에서 제외된 줄은 안 넣음", () => {
  const base = tmp("gi");
  const env = isolatedEnv(base);
  const HEAD = "# 개인 설정 (Git에 올리지 않음)";
  // 작업 폴더(main)의 .gitignore엔 개인 설정 줄이 없음 (게임 프로젝트 사례)
  const p = installedProject(join(base, "p"), {
    edit: (d) => {
      write(d, ".gitignore", "Library/\n");
      write(d, "AGENTS.md", read(d, "AGENTS.md").replace(/^- \*\*Usage stats:\*\*.*\n/m, "")); // 업데이트할 게 있게
    },
  });
  const count = (t) => t.split("\n").filter((l) => l === HEAD).length;

  assert.equal(run(S.sync, ["--apply", p], { env }).code, 0);
  const once = show(p, "baton-update", ".gitignore");
  assert.equal(count(once), 1);
  // 같은 baton-update 위에 다시 적용해도(작업 폴더는 여전히 main) 또 붙이지 않음
  const again = run(S.sync, [p], { env });
  assert.doesNotMatch(again.out, /\.gitignore/, "더 바꿀 .gitignore 없음");

  // 예전 버그로 baton-update에 같은 블록이 3번 쌓인 경우 → 하나만 남기고, 사용자 줄과 main 줄은 그대로
  git(p, "switch", "-q", "baton-update");
  const block = `\n${HEAD}\n.claude/worktrees/\n`;
  write(p, ".gitignore", once + block + block + "# 내 줄\n.claude/worktrees/\n");
  commitAll(p, "예전 중복");
  git(p, "switch", "-q", "main");
  const fix = run(S.sync, ["--apply", p], { env });
  assert.match(fix.out, /\.gitignore\(중복 정리\)/);
  const fixed = show(p, "baton-update", ".gitignore");
  assert.equal(count(fixed), 1);
  assert.equal(fixed, once + "# 내 줄\n.claude/worktrees/\n", "baton이 붙인 중복 블록만 빠지고 사용자 줄은 그대로");
  assert.equal(run(S.preserve, ["main", "--to", "baton-update"], { cwd: p }).code, 0);

  // .git/info/exclude 같은 다른 곳에서 이미 제외된 줄은 넣지 않음
  const q = installedProject(join(base, "q"), { edit: (d) => write(d, ".gitignore", "Library/\n.claude/settings.local.json\nCLAUDE.local.md\n") });
  write(q, ".git/info/exclude", ".claude/worktrees/\n");
  write(q, "AGENTS.md", read(q, "AGENTS.md").replace(/^- \*\*Usage stats:\*\*.*\n/m, ""));
  commitAll(q, "x");
  assert.equal(run(S.sync, ["--apply", q], { env }).code, 0);
  assert.equal(show(q, "baton-update", ".gitignore"), "Library/\n.claude/settings.local.json\nCLAUDE.local.md\n");
  // 넓은 줄(.claude/)로 이미 제외되면 추가하지 않음 (작업 폴더와 브랜치 내용이 같을 때)
  const r = installedProject(join(base, "r"), { edit: (d) => write(d, ".gitignore", ".claude/\nCLAUDE.local.md\n") });
  assert.doesNotMatch(run(S.sync, [r], { env }).out, /\.gitignore/);
});

test("settings.json: 예전 baton의 상대 경로 훅만 지금 명령으로 바꿈, 다른 설정·직접 바꾼 명령은 그대로", () => {
  const base = tmp("hookfix");
  const env = isolatedEnv(base);
  const KIT_CMD = JSON.parse(read(KIT, ".claude/settings.json")).hooks.SessionStart[0].hooks[0].command;
  const mine = { type: "command", command: "echo 내 훅" };
  const settings = (cmd) => JSON.stringify({
    permissions: { allow: ["Bash(node scripts/baton/status.mjs)"] },
    hooks: { SessionStart: [{ hooks: [mine] }, { hooks: [{ type: "command", command: cmd }] }], Stop: [{ hooks: [mine] }] },
  }, null, 4).replace(/\n/g, "\r\n") + "\r\n";
  const old = installedProject(join(base, "old"), { edit: (d) => write(d, ".claude/settings.json", settings("node scripts/baton/status.mjs")) });
  const abs = installedProject(join(base, "abs"), { edit: (d) => write(d, ".claude/settings.json", settings("node \"C:/Users/me/abs/scripts/baton/status.mjs\"")) });

  const r = run(S.sync, ["--apply", "all", old, abs], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /old\s+업데이트 필요: 파일 1개 — \.claude\/settings\.json\(훅 경로\)/);
  const next = show(old, "baton-update", ".claude/settings.json");
  assert.equal(next, settings(KIT_CMD), "그 명령 값만 바뀌고 들여쓰기·CRLF·다른 항목 그대로");
  assert.equal(run(S.preserve, ["main", "--to", "baton-update"], { cwd: old }).code, 0);
  assert.equal(tryGit(abs, "rev-parse", "--verify", "-q", "refs/heads/baton-update"), null, "직접 바꾼(절대 경로) 명령은 그대로");

  // 바뀐 settings.json으로 doctor가 하위 폴더 실행까지 통과
  git(old, "merge", "-q", "--ff-only", "baton-update");
  assert.match(run(join(old, "scripts/baton/doctor.mjs"), [], { cwd: old, env }).out, /\[x\] Claude 훅 명령을 하위 폴더에서 실행해 봄/);
});

test("없어진 폴더: 점검·전체 업데이트를 멈추고 물음, 가까운 곳(같은 위치·한 단계 위·아래)의 같은 이름 프로젝트는 후보로만, --forget으로 정리", () => {
  const base = tmp("moved");
  const env = isolatedEnv(base);
  const desk = join(base, "desk");
  // 기록엔 desk/ledgerapp(와 그 하위 폴더), 지금은 desk/ing/Ledgerapp (웹 프로젝트 사례: 한 단계 아래로 옮김)
  const now = installedProject(join(desk, "ing", "Ledgerapp"));
  claudeSession(env, join(desk, "ledgerapp"), [{ cwd: join(desk, "ledgerapp"), type: "user" }]);
  claudeSession(env, join(desk, "ledgerapp", "src-tauri"), [{ cwd: join(desk, "ledgerapp", "src-tauri"), type: "user" }], "s2");
  // 두 단계 아래로 옮긴 건 후보로 안 봄
  installedProject(join(desk, "a", "b", "deep"));
  claudeSession(env, join(desk, "deep"), [{ cwd: join(desk, "deep"), type: "user" }]);
  // 업데이트할 게 있는 다른 프로젝트
  const other = installedProject(join(desk, "other"), { edit: (d) => write(d, "AGENTS.md", read(d, "AGENTS.md").replace(/^- \*\*Usage stats:\*\*.*\n/m, "")) });
  claudeSession(env, other, [{ cwd: other, type: "user" }]);

  const r = run(S.sync, [], { env });
  assert.equal(r.code, 1, "점검도 멈춤");
  assert.match(r.out, /\[멈춤\] 세션 기록·목록에 있지만 지금은 없는 폴더 2개/, "하위 폴더 기록은 위 폴더 하나로 묶음");
  assert.match(r.out, /ledgerapp\n\s+근처에 같은 이름의 baton 프로젝트: .*ing[\\/]Ledgerapp/);
  assert.match(r.out, /deep\n\s+근처\(같은 위치·한 단계 위·아래\)에 같은 이름의 baton 프로젝트 없음/);
  assert.doesNotMatch(r.out, /\d\. .*ing[\\/]Ledgerapp/, "후보를 스스로 넣지 않음");
  assert.doesNotMatch(read(base, "projects.txt"), /Ledgerapp/);

  const all = run(S.sync, ["--apply", "all"], { env });
  assert.equal(all.code, 1);
  assert.match(all.out, /전체 업데이트·합치기를 하지 않았어요/);
  assert.equal(tryGit(other, "rev-parse", "--verify", "-q", "refs/heads/baton-update"), null);
  assert.equal(run(S.sync, ["--apply", other], { env }).code, 0, "골라서 하는 건 진행");

  // 답: 옮긴 곳을 알려 주고 옛 경로는 다시 안 묻게, 나머지는 --forget all
  const ans = run(S.sync, [now, "--forget", join(desk, "ledgerapp")], { env });
  assert.match(ans.out, /다시 묻지 않도록 목록에 기록/);
  assert.match(ans.out, /ing[\\/]Ledgerapp\s+최신/);
  assert.match(ans.out, /지금은 없는 폴더 1개/);
  const done = run(S.sync, ["--forget", "all"], { env });
  assert.doesNotMatch(done.out, /\[멈춤\]/);
  assert.equal(run(S.sync, [], { env }).code, 0);
  const list = read(base, "projects.txt");
  assert.match(list, /Ledgerapp/);
  assert.match(list, /^!.*ledgerapp/m);
  assert.match(list, /^!.*deep/m);
});
