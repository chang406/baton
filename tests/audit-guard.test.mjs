// deep-audit 읽기 전용 가드(audit/hooks/readonly-guard.mjs): 훅 입력 JSON을 stdin으로 넣어 실제 판정을 확인한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { HARNESS, IS_WIN, commitAll, initRepo, tmp, write } from "./helpers.mjs";

const GUARD = join(HARNESS, "audit", "hooks", "readonly-guard.mjs");
const SNAP = tmp("guard-snap"); // 실제 OS 임시 폴더의 스냅샷과 섞이지 않게

function hook(mode, input, { raw } = {}) {
  const out = execFileSync(process.execPath, [GUARD, mode], {
    input: raw ?? JSON.stringify(input), encoding: "utf8",
    env: { ...process.env, DEEP_AUDIT_GUARD_DIR: SNAP }, stdio: ["pipe", "pipe", "pipe"],
  });
  return out.trim() ? JSON.parse(out) : null;
}
const CWD = initRepo(tmp("guard-cwd"));
let n = 0;
const pre = (tool, tool_input, extra = {}) =>
  hook("pre", { hook_event_name: "PreToolUse", agent_id: `a${n++}`, agent_type: "deep-audit", cwd: CWD, tool_name: tool, tool_input, ...extra });
const bash = (command) => pre("Bash", { command });
const denied = (r) => r?.hookSpecificOutput?.permissionDecision === "deny";

const SCAN = join(HARNESS, "baton", "files", "scripts", "baton", "scan-secrets.mjs");
const scanForms = [SCAN.replace(/\\/g, "/")]; // 역슬래시 경로는 bash에서도 깨지므로 슬래시 형태만
if (IS_WIN) scanForms.push(SCAN.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`));
if (SCAN.startsWith(homedir())) {
  const rel = SCAN.slice(homedir().length).replace(/\\/g, "/");
  scanForms.push(`~${rel}`, `$HOME${rel}`, `"$HOME${rel}"`);
}

const ALLOWED = [
  // deep-audit.md의 Think in Code 예시
  "git ls-files -co --exclude-standard | wc -l",
  "git grep -n -E 'GetComponent|Camera\\.main|Find\\(' -- '*.cs'",
  "git grep -c -E 'dangerouslySetInnerHTML|service_role|NEXT_PUBLIC_' -- '*.ts' '*.tsx'",
  "grep -rnE --include='*.cs' 'Update\\(' .",
  `node -e "console.log(require('fs').readdirSync('.').length)"`,
  "node - <<'EOF'\nconst fs = require('fs');\nconst t = fs.readFileSync('package.json', 'utf8');\nconsole.log(JSON.parse(t).name);\nEOF",
  "git symbolic-ref --short refs/remotes/origin/HEAD",
  "git diff main...HEAD --stat",
  "git ls-files | node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(s.split('\\n').length))\"",
  ...scanForms.map((p) => `node ${p.includes(" ") && !p.startsWith('"') ? `"${p}"` : p}`),
  // 리다이렉트·입력
  "git log --oneline -5 2>/dev/null",
  "git status --porcelain 2>&1",
  "grep -c x <<< 'abc'",
  "ls -la > /dev/null",
  "wc -l < package.json",
  "find . -name '*.cs' -not -path './Library/*' | head -50",
  "git branch -a",
  "git config --get user.name",
  "cd src && grep -rn TODO . | sort | uniq -c",
  "for f in a b; do wc -l \"$f\"; done",
  "echo $(git rev-parse HEAD)",
  "sed -n 33,48p STATUS.md", "sed -n '/start/,/end/p' f.md",
  // 흔한 문자열('module'·'https')과 한 줄씩 읽는 반복문은 막지 않음
  `node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).type === 'module')"`,
  `git grep -h -o -E 'https?://[^ ]+' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(s.split('\\n').filter(u=>u.startsWith('https')).length))"`,
  "git ls-files '*.cs' | while IFS= read -r f; do wc -l \"$f\"; done",
  "git ls-files | while read -r f; do head -1 \"$f\"; done",
];
const DENIED = [
  "echo x > out.txt", "echo x >> out.txt", "ls &> out.txt", "ls 2> err.txt", "ls >| f", "cat <> f",
  "git status | tee out.txt", "sed -i 's/a/b/' f.js", "sed -n 'w out' f", "sed -n '1p;w x' f", "sed -n -f s.sed f", "awk '{print > \"o\"}' f",
  "rm -rf src", "mv a b", "cp a b", "touch x", "mkdir d", "chmod +x a",
  "git commit -m x", "git add -A", "git checkout -- .", "git reset --hard", "git stash", "git push",
  "git -c core.pager=sh log", "git diff --output=out.patch", "git log --output out.txt", "git branch new-one", "git branch -D x",
  "git config user.name x", "git grep -Ovim foo",
  "find . -name '*.tmp' -delete", "find . -exec rm {} \\;", "find . -fprint list.txt",
  "git ls-files | xargs rm", "echo $(rm -rf x)", "echo `rm x`", "echo \"$(touch y)\"", "diff <(ls) >(cat)",
  "bash -c 'rm x'", "sh -c ls", "eval rm x", "$CMD x", "X=1 ls", "GIT_DIR=/tmp git log",
  `node -e "require('fs').writeFileSync('x','1')"`,
  `node -e "const {appendFileSync:a}=require('node:fs');a('x','1')"`,
  "node - <<'EOF'\nimport('fs/promises').then(m=>m.writeFile('x','1'))\nEOF",
  "node - <<'EOF'\nconst fs = require('fs');\nfs.promises.writeFile('x', '1');\nEOF",
  `node -e "require('child_process').execSync('git add -A')"`,
  `node -e "fs.openSync('x','w')"`, `node -e "require('https').get('x')"`,
  "node --input-type=module - <<'EOF'\nimport { exec } from 'child_process';\nEOF", "node --input-type=module - <<'EOF'\nimport net from 'node:net';\nEOF",
  "while read -r f; do rm \"$f\"; done", "IFS= rm x", `node -e "eval('1')"`, `node -e "require(name)"`,
  "node src/server.js", "node scripts/baton/scan-secrets.mjs", "node", "echo code | node -",
  "node - <<'EOF'\nconsole.log(1)\n", // 끝 표시 없음
  "npm install", "npx something", "python -c 'print(1)'", "perl -pi -e 's/a/b/' f", "curl -o x http://e", "dd if=a of=b",
  "echo 'unclosed",
];

test("가드: Think in Code 읽기 명령은 통과", () => {
  for (const c of ALLOWED) assert.equal(bash(c), null, `허용돼야 함: ${c}`);
});

test("가드: 파일을 쓰거나 다른 프로그램을 실행하는 Bash 명령은 거부", () => {
  for (const c of DENIED) {
    const r = bash(c);
    assert.ok(denied(r), `거부돼야 함: ${c}`);
    assert.match(r.hookSpecificOutput.permissionDecisionReason, /읽기 전용 규칙\(훅\)으로 막았습니다/);
  }
});

test("가드: Write·Edit 등 읽기 도구가 아닌 도구는 거부, Read·Grep·Glob은 통과", () => {
  for (const t of ["Write", "Edit", "NotebookEdit", "WebFetch", "Agent"]) assert.ok(denied(pre(t, { file_path: "x" })), t);
  for (const t of ["Read", "Grep", "Glob"]) assert.equal(pre(t, { pattern: "x" }), null, t);
});

test("가드: 입력이 깨지면 거부 (오류 시 통과하지 않음)", () => {
  assert.ok(denied(hook("pre", null, { raw: "{not json" })));
  assert.ok(denied(hook("pre", null, { raw: "" })));
  assert.ok(denied(bash(undefined)));
});

function auditRun(dir, id) {
  const ev = (mode, extra = {}) => hook(mode, { agent_id: id, cwd: dir, ...extra });
  return {
    start: () => ev("pre", { hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "a.txt" } }),
    stop: () => ev("stop", { hook_event_name: "SubagentStop", agent_type: "deep-audit" }),
  };
}

test("사후 확인: 점검 중 파일이 바뀌면 한 번 붙잡고 사용자에게 알림, 변화가 없으면 조용히 통과", () => {
  const dir = initRepo(tmp("guard-git"));
  write(dir, "a.txt", "1\n");
  write(dir, "dirty.txt", "1\n");
  commitAll(dir);
  write(dir, "dirty.txt", "점검 전부터 고치던 중\n");

  const quiet = auditRun(dir, "quiet");
  quiet.start();
  assert.equal(quiet.stop(), null, "아무것도 안 바뀜");
  assert.equal(existsSync(join(SNAP, "quiet.json")), false, "스냅샷 정리");

  const cases = {
    edit: (d) => write(d, "a.txt", "2\n"),
    redirty: (d) => write(d, "dirty.txt", "또 바뀜\n"),
    create: (d) => write(d, "new.txt", "x\n"),
    commit: (d) => { write(d, "a.txt", "3\n"); commitAll(d, "x"); },
  };
  for (const [id, change] of Object.entries(cases)) {
    const run = auditRun(dir, id);
    run.start();
    change(dir);
    const r = run.stop();
    assert.equal(r?.decision, "block", id);
    assert.match(r.systemMessage, /작업 폴더가 바뀌었습니다/, id);
    assert.match(r.reason, /\[경고\] 점검 중 작업 폴더가 바뀜/, id);
    assert.equal(run.stop(), null, `${id}: 두 번째 Stop은 붙잡지 않음`);
  }

  const plain = tmp("guard-plain"); // Git 없는 폴더
  write(plain, "a.txt", "1\n");
  const p = auditRun(plain, "plain");
  p.start();
  write(plain, "a.txt", "22\n");
  assert.equal(p.stop()?.decision, "block");
});

test("연결: deep-audit.md frontmatter가 이 가드를 PreToolUse(모든 도구)와 Stop에 건다", () => {
  const md = readFileSync(join(HARNESS, "audit", "agents", "deep-audit.md"), "utf8").replace(/\r\n/g, "\n");
  const fm = md.split("\n---\n")[0];
  assert.match(fm, /^tools: Read, Grep, Glob, Bash$/m);
  assert.match(fm, /hooks:\n {2}PreToolUse:\n {4}- matcher: "\*"\n {6}hooks:\n {8}- type: command\n {10}command: node "\$HOME\/harness\/audit\/hooks\/readonly-guard\.mjs" pre\n/);
  assert.match(fm, /\n {2}Stop:\n {4}- hooks:\n {8}- type: command\n {10}command: node "\$HOME\/harness\/audit\/hooks\/readonly-guard\.mjs" stop$/);
});
