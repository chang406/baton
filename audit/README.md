# audit — 보안·성능 정밀 점검

baton과 별개인 도구예요. 어떤 프로젝트에서나 쓸 수 있고, baton이 있으면 그 기록을 참고해서 더 정확하게 봐요.
코드를 고치지 않고 **심각 / 주의 / 참고**로 보고만 해요. 고치는 건 승인한 뒤에 해요.

## 설치 (컴퓨터에서 한 번)

1. 저장소를 `~/harness`에 받는다 (Windows: `C:\Users\<이름>\harness`). audit은 `~/harness/audit`에 있어야 한다(읽기 전용 훅이 이 경로를 쓴다)
2. 그 폴더에서 Claude Code를 켜고:
   > SETUP_FOR_AGENT.md 읽고 설치해줘
3. 막히면 직접 복사:
   - 파일 탐색기 주소창에 `%USERPROFILE%\.claude` → 이동 (`agents`, `commands` 폴더가 없으면 새로 만들기)
   - `audit\agents\deep-audit.md` → `.claude\agents\` 에 복사
   - `audit\commands\` 안의 파일 세 개 → `.claude\commands\` 에 복사
4. Claude Code를 다시 켜고 `/audit`을 쳤을 때 명령 세 개가 보이면 끝

`~/harness/audit`은 원본이라 지우지 마세요. 새 버전을 받은 뒤(`~/harness`에서 pull)에는 어디서든 **"audit 업데이트해줘"**라고 하면 돼요.

**기존 파일을 함부로 덮어쓰지 않아요.** 겹치는 게 있으면 먼저 멈추고 물어봐요. audit은 컴퓨터 전체(모든 프로젝트)에 적용되는 전역 설치라서, 설치·업데이트 스크립트(`install.mjs`)가 먼저 판단해요.
- 없으면 설치, harness에 기록된 옛 버전이면 교체해요. 교체 전 파일은 `~/harness/audit/.backup/`에 남아요.
- 직접 고친 줄이 있거나, 이름만 같은 다른 도구의 파일이면 **건너뛰고** 내용을 보여 준 뒤 물어봐요. 쓸 만한 내용은 설치본이 아니라 harness 원본에 반영해요.
- 같은 이름의 스킬(`~/.claude/skills/`)이나 deep-audit 사본이 있으면 알려 줘요.
- 프로젝트 안에 같은 이름 파일(`.claude/agents/deep-audit.md` 등)이 있으면 그 프로젝트에서는 그쪽이 우선해요.

## 읽기 전용은 훅이 지켜요

점검 담당(deep-audit)이 도는 동안만 켜지는 훅이 `deep-audit.md` 안에 들어 있어요(`audit/hooks/readonly-guard.mjs`).
- **막기:** 점검 담당은 Read·Grep·Glob·Bash만 쓸 수 있어요. Bash는 읽기 명령 허용 목록만 통과해요(git 읽기 명령, grep, find, wc, `sed -n '10,20p'`, 쓰기 함수가 없는 `node -e`·`node - <<'EOF'` 등). 파일로 쓰는 리다이렉트(`>`)나 `rm`·`sed -i`, 프로젝트 코드 실행은 막혀요.
- **잡아내기:** 점검을 시작할 때 작업 폴더 상태를 기록해 두고, 끝날 때 비교해요. 바뀐 파일이 있으면 보고서 맨 위에 경고가 붙어요.
- **한계:** 글자로 판단하는 장치라 작정하고 돌아가면 못 막을 수 있어요(실수 방지용). 프로젝트 밖에 쓴 것은 비교에 안 잡혀요. 훅은 지금 `~/harness` 폴더에 있는 가드를 실행해요. 그 폴더가 없거나, `audit/hooks/`가 없는 옛 커밋·브랜치로 바꿔 두었거나, node가 없으면 훅이 그냥 통과돼요. /audit-* 명령을 실행한 대화(메인)는 훅이 아니라 글 규칙("고치는 건 승인 뒤")을 따라요.

## 쓰는 법

| 명령 | 말로 | 하는 일 |
| --- | --- | --- |
| `/audit-all` | "정밀 점검해줘" | 보안 담당과 성능 담당을 동시에 따로 돌리고, 결과를 한 보고서로 합쳐요 |
| `/audit-security` | "보안 점검해줘" | 보안만 |
| `/audit-perf` | "성능 점검해줘" | 성능만. 뒤에 증상을 쓰면 그 부분부터 봐요 (예: `/audit-perf 보스전에서 끊김`) |

범위를 안 쓰면 현재 작업 중인 변경분을 봐요. "전체"라고 쓰면 프로젝트 전체를 훑어요.

## 지우기

`%USERPROFILE%\.claude\agents\deep-audit.md`와 `%USERPROFILE%\.claude\commands\audit-*.md` 세 개를 지우면 끝.
