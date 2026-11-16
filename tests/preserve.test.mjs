// 보존 확인: 원래 있던 줄·JSON 키가 사라지면 exit 1
import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { S, commitAll, git, initRepo, run, tmp, write } from "./helpers.mjs";

function repo() {
  const p = initRepo(join(tmp("pc"), "p"));
  write(p, "STATUS.md", "# 진행 현황\n\n- 로그인 완료\n- 결제 미완\n");
  write(p, ".claude/settings.json", JSON.stringify({ permissions: { allow: ["Bash(npm test)"] }, hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }] } }));
  write(p, "package.json", JSON.stringify({ scripts: { test: "jest" } }));
  commitAll(p, "before");
  return p;
}
const check = (p, ...a) => run(S.preserve, a.length ? a : ["HEAD"], { cwd: p });

test("문서: 원문을 섹션에 그대로 두면 통과, 고쳐 쓰면 사라진 줄을 짚음", () => {
  const p = repo();
  write(p, "STATUS.md", "# STATUS\n\n## 기존 STATUS.md (원문)\n\n# 진행 현황\n\n- 로그인 완료\n- 결제 미완\n");
  assert.equal(check(p).code, 0);
  write(p, "STATUS.md", "# STATUS\n\n## Completed\n- 로그인 기능 완료\n");
  const r = check(p);
  assert.equal(r.code, 1);
  assert.match(r.out, /STATUS\.md: 사라진 줄 3개/);
});

test("JSON: 항목 추가만이면 통과, 기존 키 삭제·값 변경은 실패", () => {
  const p = repo();
  write(p, ".claude/settings.json", JSON.stringify({ permissions: { allow: ["Bash(npm test)"] }, hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }, { hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/scripts/baton/status.mjs"' }] }] } }));
  write(p, "package.json", JSON.stringify({ scripts: { test: "jest", "baton:status": "node scripts/baton/status.mjs" } }));
  assert.equal(check(p).code, 0);
  write(p, ".claude/settings.json", JSON.stringify({ hooks: { SessionStart: [] } }));
  write(p, "package.json", JSON.stringify({ scripts: { test: "vitest" } }));
  const r = check(p);
  assert.equal(r.code, 1);
  assert.match(r.out, /permissions/);
  assert.match(r.out, /hooks\.SessionStart\[0\]/);
  assert.match(r.out, /scripts\.test/);
});

test("옮긴 파일과 --to 브랜치 비교", () => {
  const p = repo();
  git(p, "switch", "-q", "-c", "moved");
  git(p, "mv", "STATUS.md", "tasks-STATUS.md");
  commitAll(p, "move");
  assert.equal(check(p, "main", "--to", "moved").code, 0, "옮긴 파일의 줄은 다른 곳에서 찾음");
  git(p, "switch", "-q", "-c", "lost", "main");
  rmSync(join(p, "STATUS.md"));
  commitAll(p, "rm");
  const r = check(p, "main", "--to", "lost");
  assert.equal(r.code, 1);
  assert.match(r.out, /파일이 없어지고 다른 곳에도 없는 줄/);
});
