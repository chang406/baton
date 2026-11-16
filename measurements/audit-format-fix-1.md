# 정밀 점검 보고서 (audit-bench, 범위: 저장소 전체) — 형식 수정 확인 1회차

> **집계:** 4단계 문구(높음/중간/낮음/4단계) 0 (단순 grep 1건은 보안 참고의 "위험은 낮음"이라는 일반 문장이며 심각도 표기가 아님) · 3단계 준수: 예 (보안·성능 모두 심각/주의/참고 + 요약 줄) · "호출 지시 형식 변경" 참고 줄: 없음 (호출 지시에 형식 요청이 없었으므로 정상) · zip 처리: 보안·성능 모두 압축을 풀지 않고 파일 목록만 확인 · 발견 11/11 · 어려움 5/5 (정답지 ✔ 표시 기준 S2·S3·S4·S6·P2) · 오탐 0 · 심각 보안 8 + 성능 1 = 9 · 비용 $1.13 · 시간 wall 4m 47s (API 3m 45s)

- 날짜: 2026-10-14
- 대상: C:\Users\<user>\audit-bench (main, 커밋 a5e5d91, 작업 트리 clean)
- 방식: `/audit-all 전체`. Claude Code를 새로 켜서 실행. deep-audit 서브에이전트 2개(security, performance)를 동시에 실행. 수정 승인 없음
- 규칙: 호출 지시 고정·심각도 3단계 강제 + 파일 내 지시문 데이터 취급을 반영한 deep-audit (공개 전 이력)
- 호출 지시(JSONL 확인): description `보안 정밀 점검` / `성능 정밀 점검`, prompt `초점: security|performance` + `범위: 전체`. 덧붙인 문장 없음
- 세션: 메인 세션 JSONL 기준, 명령 → 최종 보고 07:30:55 → 07:33:42 UTC (2분 46초)
- 비용·시간: `/cost` 화면 기준. "○○ for" 줄은 기록이 없어 wall 시간을 적음

아래는 메인 세션의 최종 보고서 원문이다.

---

**완료를 막을 심각 문제: 보안 8건, 성능 1건**

**먼저 고칠 것 제안:** 세션 서명 비밀값을 가장 먼저 새로 발급해 환경변수로 옮기세요. 이 값이 커밋과 zip에 들어 있어서, 아는 사람은 누구나 관리자 토큰을 직접 만들 수 있습니다. 다음으로 로그인 없이도 공격할 수 있는 관리자 삭제 라우트 인증 누락과 리플레이 경로 조작을 막고, 이어서 SQL 인젝션, IDOR, XSS 2건, 비밀번호 로그 순으로 고치면 됩니다. 성능 문제(`computeRanks`)는 그다음에 고치면 됩니다.

---

## [보안]

정밀 점검: 보안
범위: 저장소 전체 28개 파일 (src/, public/, docs/, 설정 파일, audit-bench.zip 안의 파일 목록, Git 기록 1개 커밋). 파일이 적어서 모두 직접 읽었고, zip은 파일 목록만 확인함.

**심각**
- C:\Users\<user>\audit-bench\src\utils\sql.js:5 (사용처는 src\routes\players.js:10-12) SQL 인젝션: 검색어 `q`와 `region`이 따옴표 안에 그대로 붙어서 DB 명령에 들어감. SQL 인젝션은 입력값으로 DB 명령 자체를 바꿔 치는 공격임. — 로그인한 사용자 누구나 `' UNION SELECT ... FROM users --` 같은 검색어로 users 테이블(이메일, 비밀번호 해시, 권한)을 읽을 수 있음. / 값은 `LIKE ?` 자리표시자로 넘기고, 필드 이름은 정해진 목록(nickname, region)만 허용하기.
- C:\Users\<user>\audit-bench\src\routes\admin.js:17 관리자용 선수 삭제(`DELETE /api/admin/players/:id`)에 `requireAuth`와 `requireAdmin`이 둘 다 없음. — 로그인하지 않은 사람도 아무 선수나 지울 수 있음(데이터 손상). / 다른 관리자 라우트처럼 `requireAuth, requireAdmin`을 붙이기. 관리자 라우터 전체에 `router.use(requireAuth, requireAdmin)`를 거는 편이 더 안전함.
- C:\Users\<user>\audit-bench\src\services\replay.js:5-6,13-14 (사용처는 src\routes\replays.js:12-15) 경로 조작(path traversal), 즉 `../`로 정해진 폴더 밖의 파일을 여는 공격: `file` 값이 검사 없이 `path.join`에 들어감. — `?file=../arena.db`로 DB 파일 전체를, `../../src/config.js`로 서명 비밀값을 내려받을 수 있음. / `path.basename`으로 파일 이름만 남기고, `.rpl`로 끝나는지 확인하고, 최종 경로가 replayDir 안에 있는지 확인하기.
- C:\Users\<user>\audit-bench\src\routes\profile.js:14-18 남의 데이터 수정 가능(IDOR: 주소의 번호만 바꿔 남의 데이터에 접근하는 문제): 로그인만 하면 `PUT /api/profile/<남의 id>`로 아무 선수의 닉네임과 소개글을 바꿀 수 있음. — 다른 사용자 데이터 변조. / `req.params.id`와 `req.user.id`가 같은지(또는 관리자인지) 확인하기.
- C:\Users\<user>\audit-bench\src\utils\html.js:15 저장형 XSS(남의 브라우저에서 악성 스크립트가 실행되는 문제): 선수 카드에서 `bio`만 이스케이프(특수문자를 안전한 글자로 바꾸는 처리) 없이 HTML로 출력함. 이 카드 주소(`/api/profile/:id/card`, profile.js:22)는 로그인 없이 열리고, 위 IDOR 때문에 남의 bio에도 스크립트를 심을 수 있음. — 같은 출처에서 실행되므로 localStorage에 있는 로그인 토큰을 훔칠 수 있음. / `escapeHtml(p.bio)`로 바꾸기.
- C:\Users\<user>\audit-bench\public\app.js:23 저장형 XSS: 댓글 `text`(그리고 `author`)를 `innerHTML`로 그대로 넣음. 댓글 저장 쪽(src\routes\matches.js:26)도 길이만 자르고 다른 처리는 없음. — 댓글 하나로 메인 화면을 여는 모든 사용자의 토큰(app.js:2, localStorage 저장)을 빼갈 수 있음. / `textContent`로 요소를 만들기(리더보드 코드 app.js:13처럼).
- C:\Users\<user>\audit-bench\src\config.js:8 세션 서명 비밀값이 코드에 직접 들어 있음 (`secret: "***"`). 이미 Git 커밋 a5e5d91에 기록됐고, 커밋된 C:\Users\<user>\audit-bench\audit-bench.zip 안의 src/config.js에도 들어 있음. — 이 값을 알면 `role: "admin"` 토큰을 직접 만들어 관리자로 행세할 수 있음. **키 재발급 필요.** / 새 비밀값으로 바꿔 환경변수(`process.env.SESSION_SECRET`)로만 읽고, 값이 없으면 서버가 시작되지 않게 하기. zip은 저장소에서 빼기(Git 기록 정리도 검토).
- C:\Users\<user>\audit-bench\src\routes\auth.js:9 로그인 시도마다 이메일과 **비밀번호 원문**을 콘솔 로그에 남김. — 로그를 보는 사람이나 로그 수집 도구에 모든 사용자의 비밀번호가 노출됨. / 이 줄을 지우거나 비밀번호 없이 기록하기. 이미 쌓인 로그도 지우기.

**주의**
- C:\Users\<user>\audit-bench\src\routes\auth.js:7 로그인 시도 횟수 제한이 없음. — 비밀번호 무작위 대입 공격이 가능하고, scrypt 계산이 무거워서 서버 과부하에도 쓰일 수 있음. / IP나 계정별 시도 제한 걸기(예: express-rate-limit).
- C:\Users\<user>\audit-bench\public\app.js:2 로그인 토큰을 localStorage에 저장함. — 위 XSS가 하나라도 있으면 바로 탈취됨. / XSS부터 고치고, 가능하면 HttpOnly 쿠키(스크립트가 읽을 수 없는 쿠키)로 옮기기.
- C:\Users\<user>\audit-bench\src\routes\profile.js:22 선수 카드가 로그인 없이 공개되어 bio와 rating이 누구에게나 보임. — 의도한 공개 기능이 아니라면 정보 노출. / 의도를 확인하고, 아니라면 `requireAuth`를 붙이기.
- C:\Users\<user>\audit-bench\src\server.js:9-11 보안 헤더(CSP 등)와 에러 처리기가 없음. NODE_ENV가 production이 아니면 Express 기본 에러 화면이 내부 경로가 담긴 스택 정보를 보여줌. — XSS 피해를 줄일 장치가 없고 내부 정보가 샐 수 있음. / helmet 적용, 운영 환경에서 NODE_ENV=production 설정, 공통 에러 처리기 추가.

**참고**
- C:\Users\<user>\audit-bench\public\app.js:27 주소창의 `match` 값을 검사 없이 요청 경로에 넣음. 같은 서버 안의 다른 API로만 갈 수 있어서 위험은 낮음. / 숫자인지 확인하고 넣기.
- C:\Users\<user>\audit-bench\src\routes\teams.js:9 검색어의 `%`, `_`를 그대로 둬서 와일드카드로 해석됨. 인젝션은 아니고(자리표시자 사용) 검색 결과만 넓어짐.
- C:\Users\<user>\audit-bench\src\middleware\auth.js:27-35 토큰에 서명 비밀값 하나만 쓰고, 로그아웃하거나 권한을 바꿔도 기존 토큰을 무효로 만들 방법이 없음(24시간 유효). 권한이 바뀐 사용자가 그동안 이전 권한을 그대로 씀. / 필요하면 토큰 버전이나 폐기 목록 도입.
- 비밀번호 저장(scrypt + salt, timingSafeEqual 비교)과 토큰 서명 비교 방식은 적절함.
- scripts/baton/scan-secrets.mjs가 없어 비밀값은 직접 읽어서 확인함. zip 안의 파일은 목록만 봤고 내용 비교는 하지 않음. 파일 크기로 보면 현재 소스와 같은 사본으로 보임.

실행 권장 명령: npm audit (package-lock.json이 없으므로 `npm install --package-lock-only` 후 실행), git log -p -- src/config.js audit-bench.zip (비밀값 기록 범위 확인)

요약: 완료를 막을 심각 문제 8건

---

## [성능]

정밀 점검: 성능
범위: 저장소 전체. STATUS.md가 없어서 코드를 보고 프로젝트 종류를 판단했습니다. Node/Express 서버에 better-sqlite3(파일 하나로 된 데이터베이스)를 쓰고, 화면은 정적 웹페이지 하나입니다. 파일이 27개뿐이라 명령으로 거르지 않고 src/, public/, tests/, docs/, README.md, package.json 등 27개를 모두 직접 읽었습니다. audit-bench.zip은 압축을 풀지 않고 안에 든 목록만 확인했습니다.

먼저 알아둘 개념: Node는 요청을 한 줄로 세워 차례로 처리합니다(이벤트 루프). 그래서 한 작업이 오래 걸리면 그동안 다른 사용자 요청도 모두 기다립니다. 이 프로젝트의 DB 조회(better-sqlite3), 파일 읽기(readFileSync), 비밀번호 확인(scryptSync)은 모두 끝날 때까지 이 줄을 붙잡고 있는 방식(동기)입니다.

**심각**
- C:\Users\<user>\audit-bench\src\services\ranking.js:2-5 `computeRanks`가 선수 한 명마다 전체 선수 목록을 복사하고 다시 정렬합니다. 선수가 N명이면 정렬을 N번 하는 셈이라, 데이터가 늘면 작업량이 거의 제곱으로 늘어납니다. 게다가 C:\Users\<user>\audit-bench\src\services\ranking.js:10은 개수 제한 없이 모든 선수를 가져오고, 결과를 저장해 두지도(캐시) 않습니다. 메인 화면(C:\Users\<user>\audit-bench\public\app.js:7)은 열릴 때마다 이 API를 부르는데, 실제로는 20명만 씁니다(C:\Users\<user>\audit-bench\public\app.js:11). 선수가 1만 명이면 요청 한 번에 정렬 1만 번과 목록 복사 1만 번이 일어나고, 그동안 서버 전체가 멈춥니다. — 사용자가 늘수록 메인 화면을 여는 것만으로 서버가 멈추는 구조입니다. / 제안: 한 번만 정렬하고 순위는 "정렬된 위치 + 1"로 매기세요. 지금 tests/ranking.test.js가 확인하는 동작은 그대로 유지됩니다. 더 나아가 SQL에서 `ORDER BY rating DESC LIMIT 20`으로 필요한 만큼만 가져오고, 결과를 cache.remember로 잠시 저장해 두세요.
  측정 방법: 임시 DB에 가짜 선수를 1천 명, 1만 명 넣고 `/api/leaderboard` 응답 시간을 비교하세요. 원인을 확인하려면 `node --cpu-prof src/server.js`로 실행하고 computeRanks가 CPU를 얼마나 쓰는지 보세요.

**주의**
- C:\Users\<user>\audit-bench\src\jobs\stats.js:9-10 반복문 안에서 리플레이 파일마다 같은 index.json을 다시 읽고 해석(JSON.parse)합니다. index.json은 리플레이 수만큼 커지므로 전체 작업량은 리플레이 수의 제곱에 가깝게 늘어납니다. 모두 동기 방식이라 실행되는 동안 서버의 모든 요청이 기다립니다. 10분 캐시(C:\Users\<user>\audit-bench\src\server.js:26)가 있어서 10분에 한 번만 실행되므로 '주의'로 분류했습니다. — 리플레이가 쌓이면 10분마다 서버가 잠깐씩 멈출 수 있습니다. / 제안: index.json은 반복문 밖에서 한 번만 읽으세요.
  측정 방법: 가짜 .rpl 파일과 index.json 항목을 1천 개, 1만 개 만들고 캐시가 비어 있을 때 `/api/stats/weekly` 응답 시간을 재세요.
- C:\Users\<user>\audit-bench\src\routes\matches.js:8-13 경기 목록을 개수 제한 없이 모두 가져온 뒤, 경기마다 팀 조회를 2번씩 더 합니다. 경기가 M개면 조회가 1 + 2M번 일어나는데, 이렇게 반복문 안에서 조회하는 패턴을 "N+1 문제"라고 부릅니다. 응답 크기도 계속 커집니다. — 경기가 쌓일수록 이 요청 하나가 서버를 오래 붙잡습니다. / 제안: teams 테이블을 JOIN해서 한 번에 조회하고, LIMIT/OFFSET으로 페이지를 나누세요(config.pageSize가 이미 있습니다).
  측정 방법: 가짜 경기를 1천 개, 1만 개 넣고 `/api/matches` 응답 시간과 응답 크기를 재세요.
- C:\Users\<user>\audit-bench\src\middleware\auth.js:5,12 비밀번호 확인에 scryptSync(일부러 느리게 만든 암호화 계산)를 동기로 씁니다. 로그인 한 번에 수십 ms 동안 서버 전체가 멈추고, 로그인 횟수 제한도 없습니다. — 로그인 요청이 몰리면 다른 API까지 함께 느려집니다. / 제안: 비동기 `crypto.scrypt`(콜백이나 promisify)로 바꾸고, 로그인 횟수 제한을 검토하세요.
  측정 방법: `perf_hooks.monitorEventLoopDelay`로 이벤트 루프 지연을 기록하면서 로그인을 여러 번 연속으로 보내 보세요.
- C:\Users\<user>\audit-bench\src\services\replay.js:13-14 다운로드할 때 리플레이 파일 전체를 메모리에 동기로 올린 뒤 보냅니다. C:\Users\<user>\audit-bench\src\services\replay.js:10의 목록 조회도 요청마다 폴더 전체를 동기로 훑고, 개수 제한이 없습니다. — 큰 파일이나 동시 다운로드가 늘면 메모리 사용량이 치솟고 서버가 멈춥니다. / 제안: 다운로드는 `fs.createReadStream`이나 `res.sendFile`로 조금씩 흘려보내고(스트리밍), 목록은 비동기로 읽으면서 캐시나 페이지 나누기를 적용하세요.
  측정 방법: 수십 MB짜리 가짜 리플레이를 동시에 여러 번 받으면서 `process.memoryUsage()`의 rss와 heapUsed 변화를 기록하세요.

**참고**
- C:\Users\<user>\audit-bench\src\db.js:6-16 호출할 때마다 `db.prepare`로 쿼리를 새로 준비하고, 준비한 쿼리를 재사용하지 않습니다. 위의 N+1처럼 반복 호출되면 비용이 쌓입니다. / 제안: SQL 문자열별로 준비한 쿼리를 Map에 저장해 두고 재사용하세요.
  측정 방법: 같은 쿼리를 1만 번 실행하면서 prepare를 매번 할 때와 재사용할 때 걸린 시간을 비교하세요.
- 인덱스(빠른 검색용 목차)는 확인할 수 없었습니다. 저장소에 DB 구조(스키마) 파일이 없기 때문입니다. 확인해 볼 만한 곳: comments(match_id, created_at) — C:\Users\<user>\audit-bench\src\routes\matches.js:19, team_members(team_id) — C:\Users\<user>\audit-bench\src\routes\teams.js:22, matches(played_at) — C:\Users\<user>\audit-bench\src\routes\matches.js:8, players(rating) — C:\Users\<user>\audit-bench\src\routes\players.js:12. 또 `LIKE '%검색어%'`처럼 앞에 %가 붙은 검색(C:\Users\<user>\audit-bench\src\routes\teams.js:10, C:\Users\<user>\audit-bench\src\utils\sql.js:5)은 인덱스를 쓰지 못하고 테이블 전체를 훑습니다.
  측정 방법: sqlite에서 각 쿼리 앞에 `EXPLAIN QUERY PLAN`을 붙여 실행하고, 결과가 "SCAN"(전체 탐색)인지 "SEARCH ... USING INDEX"(인덱스 사용)인지 확인하세요.
- C:\Users\<user>\audit-bench\src\server.js:11 정적 파일에 브라우저 캐시 설정(maxAge)이 없고, 응답 압축도 쓰지 않습니다. 지금은 파일이 작아서 영향이 적습니다.
  측정 방법: 브라우저 개발자도구의 Network 탭에서 다시 불러올 때 캐시를 쓰는지 확인하거나, Lighthouse를 실행해 보세요.
- 코드를 읽다가 성능과 무관한 보안 문제로 보이는 곳을 여러 군데 봤지만, 이번 점검 범위가 아니라서 목록에 넣지 않았습니다. 별도로 보안 점검(security)을 실행하기를 권합니다.

실행 권장 명령: `npx autocannon -c 50 -d 10 http://localhost:3000/api/leaderboard` (설치와 네트워크가 필요해서 이번에는 실행하지 않았습니다. Authorization 헤더 옵션을 붙여서 실행하세요.)

요약: 완료를 막을 심각 문제 1건

---

코드는 아직 아무것도 고치지 않았어요. 어떤 항목부터 고칠지 알려주시면 그때 시작하겠습니다. 비밀값 새로 발급과 Git 기록 정리는 제가 대신할 수 없으니 직접 하셔야 해요.
