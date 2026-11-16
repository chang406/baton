# STATUS

<!-- 이 파일은 프로젝트의 장기 기억이자 가드레일이다. 작업 일기장이 아니다.
     목표 크기: 150줄 안팎. Git에서 알 수 있는 세부 변경 내역은 쓰지 않는다.
     결정이 많아지면 decisions/ 폴더로 분리하고 여기에는 링크만 남긴다. -->

Updated: YYYY-MM-DD

## Overview
<!-- 무엇을 만드는 프로젝트인지 2~3줄 -->

## Run / Development
<!-- 프로젝트 종류, 실행 방법, 필요한 환경 -->
- Type: <Next.js | Python | Unity | 복합 | 미정 | 알 수 없음 (<추정>) ...>
- Default branch: main
- Run: <실행 방법>
- Verify: <자동 검증 명령 또는 방법. 예: npm run verify / pytest / Unity Test Runner / 없음>
- Manual check: <사람이 직접 확인해야 하는 것. 예: 에디터에서 플레이 확인>
- Status: `node scripts/baton/status.mjs` (Node 없으면 git 명령으로 확인)

## Architecture
<!-- 주요 폴더 구조와 레이어. 5~10줄 -->

## Current Milestone
<!-- 지금 향하고 있는 목표 1~2줄 -->

## Constraints & Anti-patterns
<!-- 짧은 명령형 규칙만. 이유는 Important Decisions에 쓴다. -->
- 운영 데이터·서버 변경, 배포·출시는 사용자 승인 없이 금지
- main 병합은 사용자 승인 없이 금지
- main 브랜치 직접 커밋 금지 (작업은 task/<id>)
- 기존 상태관리·데이터 접근 구조를 임의로 교체하지 말 것
- 기존 테스트를 수정하면 ACTIVE.md에 이유를 남길 것
<!-- 프로젝트 고유 규칙 추가: 예) "DB 접근은 lib/db/ 의 함수를 통해서만" -->

## Important Decisions
<!-- 형식: YYYY-MM-DD — 결정 — 이유 한 줄 -->

## Completed Major Features
-

## Remaining Major Features
-

## Known Issues
-

## Active Task
- `tasks/ACTIVE.md` 참고
