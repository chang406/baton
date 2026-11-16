// 시험 공용 도우미. 모든 시험은 임시 폴더의 가짜 프로젝트에서만 돌고, 실제 ~/.claude·~/.codex·목록 파일을 건드리지 않는다.
// 실행: node --test tests/   (Node 22 이상, 추가 설치 없음)
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HARNESS = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const KIT = join(HARNESS, "baton", "files");
// 블록 방식 이전(옛 형식) 키트. harness 커밋 6d99843의 baton/files를 그대로 옮긴 사본(Git 이력 없이도 시험이 돌도록)
export const LEGACY_KIT = join(HARNESS, "tests", "fixtures", "legacy-kit");
export const PERSONAL_GITIGNORE = ".claude/settings.local.json\nCLAUDE.local.md\n.claude/worktrees/\n";
export const IS_WIN = process.platform === "win32";

export const tmp = (name = "t") => mkdtempSync(join(tmpdir(), `baton-${name}-`));

export function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
export function tryGit(cwd, ...args) {
  try { return git(cwd, ...args); } catch { return null; }
}

export function initRepo(dir, branch = "main") {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", branch);
  git(dir, "config", "user.email", "t@t");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "core.autocrlf", "false");
  return dir;
}
export function commitAll(dir, msg = "c") {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", msg);
}
export function write(dir, rel, text) {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}
export const read = (dir, rel) => readFileSync(join(dir, rel), "utf8");
export const show = (dir, ref, rel) => tryGit(dir, "show", `${ref}:${rel}`);

// 현재 키트를 그대로 복사한 프로젝트
// (Windows 체크아웃은 키트 파일이 CRLF일 수 있어, 시험에서 줄을 고칠 때 맞도록 LF로 맞춘다.
//  사용자 파일의 CRLF 보존은 시험에서 따로 CRLF 파일을 만들어 확인한다)
export function copyKit(dir) {
  cpSync(KIT, dir, { recursive: true });
  const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else { const t = readFileSync(p, "utf8"); if (t.includes("\r\n")) writeFileSync(p, t.replace(/\r\n/g, "\n")); }
  });
  walk(dir);
}
// 옛 형식(블록 이전) 키트를 복사한 프로젝트 (줄바꿈은 LF로: Windows에서 받은 사본이 CRLF여도 같게)
export function copyLegacyKit(dir) {
  const walk = (src, rel = "") => readdirSync(src, { withFileTypes: true }).forEach((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(join(src, e.name), r);
    else write(dir, r, readFileSync(join(src, e.name), "utf8").replace(/\r\n/g, "\n"));
  });
  walk(LEGACY_KIT);
}

// 새 프로젝트: 키트 복사 + 개인 설정 .gitignore + 첫 커밋
export function installedProject(dir, { legacy = false, edit } = {}) {
  initRepo(dir);
  legacy ? copyLegacyKit(dir) : copyKit(dir);
  write(dir, ".gitignore", PERSONAL_GITIGNORE);
  if (edit) edit(dir);
  commitAll(dir, "install");
  return dir;
}

// 격리된 환경변수: 가짜 Claude·Codex 설정 폴더, 시험 전용 프로젝트 목록 파일
export function isolatedEnv(base) {
  return {
    CLAUDE_CONFIG_DIR: join(base, "claude"),
    CODEX_HOME: join(base, "codex"),
    BATON_PROJECTS_FILE: join(base, "projects.txt"),
  };
}

// 스크립트 실행. 실패(exit≠0)해도 출력과 코드를 돌려준다.
export function run(script, args = [], { cwd = HARNESS, env = {} } = {}) {
  try {
    const out = execFileSync(process.execPath, [script, ...args], {
      cwd, encoding: "utf8", env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout || "") + String(e.stderr || "") };
  }
}
export const S = {
  sync: join(HARNESS, "baton", "sync.mjs"),
  place: join(HARNESS, "baton", "place.mjs"),
  preflight: join(HARNESS, "baton", "preflight.mjs"),
  preserve: join(HARNESS, "baton", "preserve-check.mjs"),
  auditInstall: join(HARNESS, "audit", "install.mjs"),
  cost: join(HARNESS, "baton", "cost.mjs"),
  kit: (name) => join(KIT, "scripts", "baton", name),
};

// Claude Code 세션 기록 흉내: ~/.claude/projects/<인코딩된 경로>/<id>.jsonl
export function claudeSession(env, cwd, lines, id = "s") {
  const enc = resolve(cwd).replace(/[^A-Za-z0-9]/g, "-");
  const dir = join(env.CLAUDE_CONFIG_DIR, "projects", enc);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.jsonl`), lines.map((o) => JSON.stringify(o)).join("\n") + "\n");
}
// Codex 세션 기록 흉내: ~/.codex/sessions/YYYY/MM/DD/rollout-<id>.jsonl
export function codexSession(env, lines, id = "a") {
  const d = new Date();
  const dir = join(env.CODEX_HOME, "sessions", String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `rollout-${id}.jsonl`), lines.map((o) => JSON.stringify(o)).join("\n") + "\n");
}
