# audit-bench 정답지

> 이 파일은 **audit-bench 폴더 안에 두지 않는다.** deep-audit이 읽으면 시험이 무의미해진다.
> 보관 위치: `~/harness/measurements/audit-bench-answer-key.md`

대상: audit-bench (Node/Express 웹 API, 27개 파일). 심어둔 문제 11개 + 미끼 5개.

## 심어둔 문제

"찾기 어려움"은 패턴 검색만으로는 드러나지 않는 것. Think in Code 규칙이 놓치기 쉬운 지점이라 전후 비교의 핵심이다.

| ID | 위치 | 문제 | 기대 심각도 | 찾기 어려움 |
| --- | --- | --- | --- | --- |
| S1 | src/config.js | 세션 서명 비밀값이 코드에 하드코딩 | 심각 | |
| S2 | src/utils/sql.js → routes/players.js | 검색 필터를 문자열로 이어 붙여 SQL 주입 가능 | 심각 | ✔ 라우트에는 결합이 안 보임 |
| S3 | src/routes/admin.js | 선수 삭제(DELETE)에만 인증·관리자 확인이 없음 | 심각 | ✔ "없는 것"은 검색으로 안 잡힘 |
| S4 | src/routes/profile.js | PUT /:id가 본인인지 확인 안 함 (남의 프로필 수정) | 심각 | ✔ |
| S5 | services/replay.js ← routes/replays.js | 파일 이름을 그대로 경로에 붙여 경로 조작(../) 가능 | 심각 | |
| S6 | src/utils/html.js | 선수 카드에서 bio만 이스케이프 안 함 (저장형 XSS) | 심각 또는 주의 | ✔ escapeHtml이 있어 안심하기 쉬움 |
| S7 | public/app.js | 댓글을 innerHTML로 출력 (XSS) | 심각 또는 주의 | |
| S8 | src/routes/auth.js | 로그인 시도 로그에 비밀번호가 찍힘 | 주의 이상 | |
| P1 | src/routes/matches.js | 경기마다 팀 조회 2번 (N+1) + 개수 제한 없음 | 주의 이상 | |
| P2 | src/services/ranking.js | 선수마다 전체 정렬 (데이터가 늘면 급격히 느려짐) + 제한 없는 조회 | 주의 이상 | ✔ |
| P3 | src/jobs/stats.js | 반복문 안에서 같은 index.json을 매번 다시 읽음 | 주의 이상 | |

## 미끼 (문제로 지적하면 오탐)

| 위치 | 왜 안전한가 |
| --- | --- |
| src/routes/teams.js 검색 | `%${q}%`처럼 보이지만 `?` 파라미터로 넘김 |
| src/middleware/auth.js | scrypt 해시, timingSafeEqual 비교, 서명 확인 후 파싱 |
| src/utils/html.js nickname·region | 이스케이프됨 |
| public/app.js 리더보드 | textContent 사용 |
| src/services/cache.js | 단순 TTL 캐시 |

참고로 지적해도 감점 아닌 것: 토큰을 localStorage에 저장, 로그인 횟수 제한 없음, 의존성 점검 권장(npm audit).

오탐 = 미끼를 심각 또는 주의로 지적한 경우. '참고'에서 현재는 문제가 없다고 밝히고 조건부로 언급한 것은 오탐 아님.

## 채점 기록

| 회차 | 규칙 | 찾음 /11 | 어려움 5개 중 | 오탐 | 심각 개수 | 범위 줄의 N/M | 시간 (명령 → 최종 보고) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| before-1 | 기존 | 11 | 5 | 0 | 9 (보안 8, 성능 1) | (없음) | 2m 06s |
| before-2 | 기존 | | | | | (없음) | |
| after-1 | Think in Code | 11 | 5 | 0 | 9 (보안 8, 성능 1) | 보안 27/28, 성능 26/28 | 2m 10s |
| after-2 | Think in Code | | | | | | |
| format-fix-1 | Think in Code + 호출 지시 고정 | 11 | 5 | 0 | 9 (보안 8, 성능 1) | (없음, 전부 직접 읽음) | 2m 46s |
| format-fix-2 | Think in Code + 호출 지시 고정 | 11 | 5 | 0 | 10 (보안 8, 성능 2) | (없음, 전부 직접 읽음) | 3m 24s |

시간은 세션 JSONL에서 `/audit-all` 입력 시각부터 메인 세션의 최종 보고서 메시지 시각까지다.

관찰: format-fix 회차 시간이 before-1·after-1보다 30~60% 늘었음. 후보 원인은 범위 풀어쓰기 주체 변경(메인 → deep-audit), 2회차 코드 실행, 1회 측정의 흔들림. 큰 프로젝트에서 재확인.

판정 기준: after가 비용·시간은 줄고, "찾음"과 "어려움 5개 중"이 before보다 떨어지지 않으면 통과.
