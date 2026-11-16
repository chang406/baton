# CLAUDE.md

공통 작업 규약은 AGENTS.md에 있다. 반드시 따른다.

@AGENTS.md

## Claude Code 전용

- 세션이 시작되면 hook이 `scripts/baton/status.mjs` 결과를 보여준다. 결과에 `! Git Wins` 줄이 있으면 무엇을 하든 먼저 RESUME 절차의 Git Wins 단계부터 한다. main 브랜치 경고만 있으면 작업 시작 시 task 브랜치를 만들면 된다.
- 슬래시 명령: `/task-start`, `/task-resume`, `/task-handoff`, `/task-finish`. 모두 AGENTS.md의 해당 절차를 수행한다.
- 서브에이전트: `baton-verifier`(이 프로젝트, FINISH 검증), `deep-audit`(별도 도구, 보안·성능 정밀 점검. 설치돼 있을 때만).
- M/L 작업의 계획은 plan mode에서 제시하는 것이 가장 좋다. 사용자가 plan mode가 아니면 계획을 텍스트로 보여주고, 승인 전에는 파일을 수정하지 않는다.
- 사용자가 plan mode 사용법을 모르면 한 줄로 알려준다: "Shift+Tab을 눌러 plan mode로 바꾸거나, 메시지 앞에 /plan을 붙이면 됩니다."
