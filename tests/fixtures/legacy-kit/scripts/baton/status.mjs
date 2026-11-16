#!/usr/bin/env node
// 현재 작업 상태를 짧게 요약한다. (SessionStart hook, RESUME 절차에서 사용)
// 읽기 전용. 아무것도 바꾸지 않는다.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { git, section, isIdle, findBatonRoot } from "./lib.mjs";

const out = [];
const warn = [];
let gitWins = false; // 문서와 Git이 어긋났을 가능성
const root = git("rev-parse", "--show-toplevel");
if (!root) {
  console.log("[baton] Git 저장소가 아닙니다.");
  process.exit(0);
}

const branch = git("branch", "--show-current") || "(detached HEAD)";
const head = git("log", "-1", "--format=%h %s") || "(커밋 없음)";
const porcelain = git("status", "--porcelain");
const dirtyFiles = porcelain ? porcelain.split("\n") : [];

out.push("=== Baton 상태 ===");
out.push(`브랜치: ${branch}`);
out.push(`최근 커밋: ${head}`);
out.push(`작업 트리: ${dirtyFiles.length ? `커밋 안 된 변경 ${dirtyFiles.length}개` : "깨끗함"}`);
if (branch === "main" || branch === "master") {
  warn.push("main 브랜치입니다. 작업 전에 task/<id> 브랜치로 옮기세요.");
}

const batonRoot = findBatonRoot();
const activePath = join(batonRoot, "tasks", "ACTIVE.md");
if (!existsSync(activePath)) {
  out.push("ACTIVE.md: 파일 없음");
} else {
  const text = readFileSync(activePath, "utf8");
  if (isIdle(text)) {
    out.push("ACTIVE.md: 진행 중인 작업 없음");
  } else {
    const title = (text.match(/^#\s*ACTIVE:\s*(.+)$/m) || [])[1]?.trim() || "(제목 없음)";
    const taskBranch = (text.match(/Branch:\s*(\S+)/) || [])[1];
    out.push(`진행 중인 작업: ${title}`);

    if (taskBranch && !taskBranch.includes("<") && taskBranch !== branch) {
      warn.push(`ACTIVE의 브랜치(${taskBranch})와 현재 브랜치(${branch})가 다릅니다.`);
      gitWins = true;
    }

    // 신선도: ACTIVE.md를 마지막으로 바꾼 커밋 이후 다른 커밋이 있는가
    const lastActive = git("log", "-1", "--format=%h", "--", activePath);
    if (!lastActive) {
      warn.push("ACTIVE.md가 아직 한 번도 커밋되지 않았습니다.");
      gitWins = true;
    } else {
      const behind = Number(git(
        "rev-list", "--count", `${lastActive}..HEAD`, "--", batonRoot,
        // baton 자체 파일만 바꾼 커밋(업데이트 등)은 작업 진행으로 세지 않는다
        ...["AGENTS.md", "CLAUDE.md", "STATUS.md", ".claude", "scripts/baton", "docs/baton", "tasks"]
          .map((f) => `:(exclude)${join(batonRoot, f)}`),
      ) || 0);
      if (behind > 0) {
        warn.push(`ACTIVE.md 갱신 이후 커밋이 ${behind}개 더 있습니다. 문서가 낡았을 수 있습니다.`);
        gitWins = true;
      }
    }
    if (dirtyFiles.length) {
      warn.push("커밋 안 된 변경이 있습니다. 이전 세션이 정리 없이 끝났을 수 있습니다.");
      gitWins = true;
    }

    const next = section(text, "Next Exact Step");
    if (next && !/^Why:\s*$/.test(next)) out.push(`다음 단계: ${next.split("\n").filter((l) => l.trim() && !/^Why:\s*$/.test(l.trim())).slice(0, 3).join(" / ")}`);
    const build = (text.match(/Expected Build State:\s*(.+)/) || [])[1];
    if (build) out.push(`예상 빌드 상태: ${build.trim()}`);
  }
}

// 다른 브랜치·다른 컴퓨터의 진행 중 작업 (네트워크를 쓰지 않음: 원격은 마지막으로 받아온(fetch) 기준)
// 진행 중 작업의 ACTIVE.md는 task 브랜치에만 있어서, main에서 보면 "작업 없음"으로 보일 수 있다.
const def = (git("symbolic-ref", "--short", "refs/remotes/origin/HEAD") || "").replace(/^origin\//, "")
  || ["main", "master"].find((b) => git("rev-parse", "--verify", "-q", `refs/heads/${b}`)) || "";
if (def && git("rev-parse", "--verify", "-q", def)) {
  const upstream = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}");
  const others = git("for-each-ref", "--format=%(refname:short)", `--no-merged=${def}`, "refs/heads/task", "refs/remotes")
    .split("\n").filter((r) => r && /(^|\/)task\//.test(r) && r !== branch && r !== upstream && !r.endsWith(`/${branch}`));
  if (others.length) {
    out.push(`다른 task 브랜치 (아직 ${def}에 안 합침): ${others.slice(0, 3).join(", ")}${others.length > 3 ? ` 외 ${others.length - 3}개` : ""}`);
  }
  if (upstream) {
    const behind = Number(git("rev-list", "--count", "HEAD..@{u}") || 0);
    if (behind > 0) warn.push(`원격(${upstream})에 아직 안 받은 커밋이 ${behind}개 있습니다 (마지막으로 받아온 기준). 이어서 하기 전에 pull하세요.`);
  }
}

for (const w of warn) out.push(`! ${w}`);
if (gitWins) out.push("! Git Wins: git log / git diff로 실제 상태를 먼저 확인하고 ACTIVE.md를 고칠 것");
console.log(out.join("\n"));
