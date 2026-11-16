// 사전 검사: 문제가 있으면 [멈춤] + exit 1, 없으면 exit 0
import { test } from "node:test";
import assert from "node:assert/strict";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { IS_WIN, KIT, S, commitAll, git, initRepo, installedProject, read, run, tmp, tryGit, write } from "./helpers.mjs";

function project(name, setup) {
  const p = initRepo(join(tmp("pre"), name));
  write(p, "package.json", '{"name":"x"}\n');
  if (setup) setup(p);
  commitAll(p, "i");
  return p;
}
const install = (p) => run(S.preflight, ["install"], { cwd: p });

test("install: 깨끗한 프로젝트와 기존 AGENTS.md는 통과(알림만)", () => {
  assert.equal(install(project("clean")).code, 0);
  const r = install(project("agents", (p) => write(p, "AGENTS.md", "# 팀 규칙\n")));
  assert.equal(r.code, 0);
  assert.match(r.out, /\[알림\] AGENTS\.md.*블록만 추가/);
});

const stops = [
  ["Git 밖(ignored) CLAUDE.md", (p) => { write(p, ".gitignore", "CLAUDE.md\n"); write(p, "CLAUDE.md", "# 내 메모\n"); }, /Git에 기록돼 있지 않음/],
  ["tasks/ 다른 용도", (p) => write(p, "tasks/jobs.py", "def job(): pass\n"), /tasks\/ 폴더를 이미 다른 용도로/],
  ["package.json baton:status 다른 값", (p) => write(p, "package.json", '{"scripts":{"baton:status":"echo hi"}}'), /"baton:status" 스크립트가 다른 내용/],
  ["깨진 settings.json", (p) => write(p, ".claude/settings.json", '{"hooks": '), /깨진 JSON/],
  ["이미 설치됨", (p) => { for (const f of ["AGENTS.md", "CLAUDE.md"]) write(p, f, read(KIT, f)); }, /이미 baton이 설치돼 있음/],
];
for (const [name, setup, re] of stops) {
  test(`install 멈춤: ${name}`, () => {
    const r = install(project(name.replace(/\W+/g, "-"), setup));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, re);
  });
}

test("install 멈춤: 원격에만 있는 설치용 브랜치, 커밋 안 된 변경, 리베이스 진행 중", () => {
  const a = project("remote");
  git(a, "update-ref", "refs/remotes/origin/task/baton-setup", "HEAD");
  assert.match(install(a).out, /설치용 브랜치가 이미 있음: origin\/task\/baton-setup/);

  const b = project("dirty");
  write(b, "new.txt", "x\n");
  assert.match(install(b).out, /커밋 안 된 변경 1개/);

  const c = project("rebase");
  git(c, "switch", "-q", "-c", "b"); write(c, "f", "1\n"); commitAll(c, "b1");
  git(c, "switch", "-q", "main"); write(c, "f", "2\n"); commitAll(c, "m1");
  git(c, "switch", "-q", "b"); tryGit(c, "rebase", "main");
  const r = install(c);
  assert.equal(r.code, 1);
  assert.match(r.out, /리베이스\(rebase\)가 진행 중/);
  assert.doesNotMatch(r.out, /detached HEAD/, "진행 중인 작업 때문에 생긴 항목은 늘어놓지 않음");
});

test("install 멈춤: AGENTS.md가 다른 파일을 가리키는 링크", { skip: IS_WIN && "Windows는 링크 만들기에 권한이 필요" }, () => {
  const p = project("link", (d) => { write(d, "CLAUDE.md", "# 규칙\n"); symlinkSync("CLAUDE.md", join(d, "AGENTS.md")); });
  assert.match(install(p).out, /AGENTS\.md이\(가\) 다른 파일을 가리키는 링크/);
});

test("start/finish 사전 검사", () => {
  const p = installedProject(join(tmp("sf"), "w"));
  const pf = join(p, "scripts/baton/preflight.mjs");
  assert.equal(run(pf, ["start", "login-fix"], { cwd: p }).code, 0);
  const bad = run(pf, ["start", "Login_Fix"], { cwd: p });
  assert.match(bad.out, /형식.*에 안 맞음/);
  git(p, "update-ref", "refs/remotes/origin/task/login", "HEAD");
  assert.match(run(pf, ["start", "login"], { cwd: p }).out, /같은 이름의 브랜치가 이미 있음: origin\/task\/login/);
  // 진행 중 작업 + 안 합친 task 브랜치 위, 하위 폴더에서 실행
  git(p, "switch", "-q", "-c", "task/a");
  write(p, "tasks/ACTIVE.md", "# ACTIVE: 결제\n\nID: a   Branch: task/a   Size: M\n");
  commitAll(p, "chore(a): start task");
  const r = run(pf, ["start", "b"], { cwd: join(p, "tasks") });
  assert.match(r.out, /진행 중인 작업이 있음: 결제/);
  assert.match(r.out, /아직 main에 안 합친 task\/a/);
  // finish: 다른 id는 멈춤, 같은 이름 archive는 번호 붙인 이름 제안
  assert.match(run(pf, ["finish", "b"], { cwd: p }).out, /ACTIVE\.md의 작업\(a\)과 끝내려는 작업\(b\)이 다름/);
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  write(p, `tasks/archive/${date}-a.md`, "x\n");
  const f = run(pf, ["finish", "a"], { cwd: p });
  assert.equal(f.code, 0);
  assert.match(f.out, new RegExp(`${date}-a-2\\.md로 옮겨요`));
});

test("global: 블록 중복·블록 밖 옛 줄은 멈춤, 백업 위치 알림", () => {
  const base = tmp("glob");
  write(base, "g1/CLAUDE.md", "# 내 설정\n<!-- baton:global start -->\n@~/harness/baton/GLOBAL_RULES.md\n<!-- baton:global end -->\n<!-- baton:global start -->\n@~/baton/GLOBAL_RULES.md\n<!-- baton:global end -->\n");
  const r1 = run(S.preflight, ["global"], { env: { CLAUDE_CONFIG_DIR: join(base, "g1") } });
  assert.equal(r1.code, 1);
  assert.match(r1.out, /baton:global 블록이 2개/);
  assert.match(r1.out, /고치기 전에 백업/);
  write(base, "g2/CLAUDE.md", "# 내 설정\n@~/baton/GLOBAL_RULES.md\n");
  assert.match(run(S.preflight, ["global"], { env: { CLAUDE_CONFIG_DIR: join(base, "g2") } }).out, /블록 밖에 baton 불러오기 줄/);
});
