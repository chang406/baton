// Baton 공용 함수. 읽기 전용: 파일이나 Git 상태를 바꾸지 않는다.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// git을 셸 없이 직접 실행한다 (Windows cmd의 % 해석 문제를 피하기 위해).
export function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

// "## <name>" 섹션 본문을 돌려준다. HTML 주석은 제거한다.
export function section(text, name) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => /^##\s/.test(l) && l.includes(name));
  if (start === -1) return null;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join("\n").replace(/<!--[\s\S]*?-->/g, "").trim();
}

export function isIdle(text) {
  return /^상태:\s*없음/m.test(text);
}

// baton이 설치된 폴더를 찾는다: 현재 폴더에서 위로 올라가며 tasks/ACTIVE.md를 찾는다.
// (큰 저장소 안의 하위 폴더에 설치된 경우도 처리)
export function findBatonRoot() {
  let dir = resolve(process.cwd());
  const stop = git("rev-parse", "--show-toplevel");
  while (true) {
    if (existsSync(join(dir, "tasks", "ACTIVE.md"))) return dir;
    if (stop && resolve(dir) === resolve(stop)) break;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return stop ? resolve(stop) : resolve(process.cwd());
}
