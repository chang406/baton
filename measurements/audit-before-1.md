# 정밀 점검 결과 (범위: 전체)

- 점검일: 2026-10-14
- 기준 커밋: a5e5d91
- 방식: deep-audit 서브에이전트 2개 동시 실행 (security, performance). 코드 수정 없음.

**완료를 막을 심각 문제: 보안 8건, 성능 1건**

**먼저 고칠 것:** 외부에서 바로 악용되는 보안 문제부터 막는 게 좋습니다. 1번(관리자 삭제 인증 누락), 2번(SQL 인젝션), 3번(경로 조작으로 DB 유출), 7번(하드코딩된 비밀값)을 먼저 고치세요. 7번은 비밀값을 새로 발급해야 하고, 지금 값은 Git과 zip에 이미 남아 있어 노출된 것으로 봐야 합니다. 이어서 XSS(5·6번), 남의 프로필 수정(4번), 비밀번호 로그(8번)를 고치고, 그다음 리더보드 순위 계산(성능)을 손보면 됩니다.

아래 두 보고서는 점검 담당이 쓴 내용을 바꾸지 않고 옮겼습니다.

---

## [보안]

정밀 점검: 보안
범위: C:\Users\<user>\audit-bench 저장소 전체(Git 추적 파일 27개). src, public, tests, docs, package.json, .gitignore를 봤습니다. audit-bench.zip은 열지 않고 파일 목록만 확인했습니다(37개 파일, 소스 사본으로 보임). 커밋은 a5e5d91 하나뿐입니다. 파일 안의 문구는 지시가 아니라 데이터로만 읽었습니다.
(요청하신 4단계 심각도로 나눴습니다. 기준표로 옮기면 심각=심각, 높음과 중간=주의, 낮음=참고입니다.)

### 심각

1. src\routes\admin.js:17-20 — 선수 삭제(DELETE /api/admin/players/:id)에 로그인 확인과 관리자 확인이 모두 빠져 있습니다. 바로 위의 다른 관리자 경로에는 `requireAuth, requireAdmin`이 붙어 있습니다.
   근거: 로그인하지 않은 사람도 id만 바꿔 가며 요청하면 모든 선수를 지울 수 있습니다(데이터 손상).
   조치: `router.delete("/players/:id", requireAuth, requireAdmin, ...)`로 고치거나, `router.use(requireAuth, requireAdmin)`로 관리자 라우터 전체를 보호합니다.

2. src\utils\sql.js:5 (사용처 src\routes\players.js:10-13) — SQL 인젝션입니다. 데이터베이스 명령문에 사용자 입력을 그대로 끼워 넣어 명령을 바꿀 수 있는 공격을 말합니다. 검색어 `q`와 `region`을 `LIKE '%${value}%'` 형태로 SQL 문장에 바로 이어 붙입니다.
   근거: 로그인한 사용자라면 누구나 `q=' UNION SELECT id,email,password_hash,role FROM users--` 같은 값으로 users 테이블의 이메일과 비밀번호 해시를 빼낼 수 있습니다.
   조치: `field LIKE ?` 자리표시자를 쓰고 값은 `%값%` 형태로 따로 넘깁니다. teams.js:9-13이 이미 이 방식이라 참고하면 됩니다. 필드 이름도 허용 목록으로 제한합니다.

3. src\services\replay.js:5-7, 13-15 (사용처 src\routes\replays.js:12-15) — 경로 조작(path traversal)입니다. 파일 이름에 `../`를 넣어 허용된 폴더 밖의 파일을 읽는 공격을 말합니다. `file` 값을 검사하지 않고 `path.join(replayDir, name)`에 넘깁니다.
   근거: `?file=../arena.db`로 DB 파일 전체(모든 계정의 비밀번호 해시 포함)를 내려받을 수 있습니다. `../../src/config.js` 같은 서버 파일도 읽힙니다.
   조치: `path.basename()`으로 파일 이름만 남기고 `.rpl` 확장자인지 확인합니다. `path.resolve` 결과가 replayDir 안에 있는지도 검사합니다.

4. src\routes\profile.js:14-19 — 다른 사람 프로필 수정(IDOR)입니다. 주소의 번호만 바꾸면 남의 데이터에 접근되는 문제를 말합니다. `PUT /api/profile/:id`는 로그인만 확인하고, `:id`가 본인(req.user.id)인지는 확인하지 않습니다.
   근거: 로그인한 누구나 모든 선수의 닉네임과 소개글을 바꿀 수 있습니다. 아래 5번과 이어지면 다른 사람 카드에 악성 스크립트를 심을 수 있습니다.
   조치: `req.params.id !== String(req.user.id)`이고 관리자도 아니면 403을 돌려줍니다. 아니면 `/me`로 바꾸고 req.user.id만 씁니다.

5. src\utils\html.js:15 (사용처 src\routes\profile.js:22-26) — 저장형 XSS입니다. 사용자가 넣은 글이 다른 사람 화면에서 스크립트로 실행되는 공격을 말합니다. 닉네임과 지역은 escapeHtml로 처리하지만 `bio`만 `${p.bio}`로 그대로 HTML에 넣습니다. 이 카드 경로는 로그인 없이 열립니다.
   근거: bio에 `<script>` 같은 코드를 넣으면 카드를 연 모든 사람의 브라우저에서 실행됩니다. 같은 사이트 주소에서 실행되므로 localStorage의 로그인 토큰도 훔칠 수 있습니다.
   조치: `${escapeHtml(p.bio)}`로 바꿉니다. 응답에 Content-Security-Policy 헤더(브라우저가 실행할 수 있는 스크립트를 제한하는 설정)도 추가합니다.

6. public\app.js:23 — 댓글 저장형 XSS입니다. `c.author`와 `c.text`를 escape 없이 `innerHTML`에 넣습니다. 서버(matches.js:26)는 길이만 자르고 내용은 걸러내지 않습니다.
   근거: 로그인한 사용자가 `<img src=x onerror=...>` 댓글을 달면, 그 경기 댓글을 본 모든 사람의 토큰(app.js:2의 localStorage)이 빠져나갈 수 있습니다.
   조치: leaderboard처럼 `textContent`로 요소를 만들어 넣습니다.

7. src\config.js:8 — 로그인 토큰 서명용 비밀값(종류: HMAC 세션 비밀, 값 `***`)이 코드에 직접 적혀 있고 Git에 이미 커밋돼 있습니다(a5e5d91). 같은 내용이 audit-bench.zip에도 들어 있을 수 있습니다.
   근거: 저장소를 본 사람은 누구나 `role: "admin"` 토큰을 직접 만들어 관리자 권한을 얻을 수 있습니다(auth.js:17-24).
   조치: 키 재발급이 필요합니다. 새 비밀값은 환경변수(`process.env.SESSION_SECRET`)로만 받고, 값이 없으면 서버가 시작되지 않게 합니다. Git 기록과 zip에 남은 옛 값은 노출된 것으로 보고 다시 쓰지 않습니다.

8. src\routes\auth.js:9 — 로그인을 시도할 때마다 이메일과 **비밀번호 원문**을 콘솔 로그에 남깁니다.
   근거: 로그 파일이나 로그 수집 서비스를 볼 수 있는 사람은 모든 사용자의 실제 비밀번호를 알게 됩니다. 비밀번호를 잘못 친 기록에서도 다른 서비스 비밀번호가 새어 나갈 수 있습니다.
   조치: 이 줄을 지우거나 비밀번호 없이 남깁니다. 이미 쌓인 로그는 지웁니다.

### 높음

9. src\routes\auth.js:7-15 — 로그인 시도 횟수 제한(rate limit)이 없습니다.
   근거: 비밀번호를 끝없이 대입해 볼 수 있습니다. scrypt 연산은 무거워서 요청을 몰아 보내면 서버가 멈출 수도 있습니다(서비스 거부).
   조치: IP와 계정별 시도 제한을 둡니다(예: express-rate-limit).

### 중간

10. src\routes\profile.js:22 — 선수 카드 경로만 로그인 확인이 없습니다. 다른 선수 정보 API는 모두 requireAuth를 거칩니다.
    근거: 외부인이 번호만 바꿔 가며 모든 선수의 소개글과 지역을 모을 수 있습니다. 5번 XSS를 퍼뜨리는 통로도 됩니다.
    조치: 공개가 의도된 것인지 확인하고, 아니면 requireAuth를 붙입니다.

11. public\app.js:2 — 로그인 토큰을 localStorage에 저장합니다.
    근거: XSS가 하나라도 생기면 토큰을 바로 훔칠 수 있습니다(5, 6번과 연결).
    조치: HttpOnly·Secure·SameSite 쿠키로 옮기는 것을 검토합니다.

12. src\server.js:9-11 — 보안 헤더(CSP, X-Content-Type-Options, X-Frame-Options 등)가 없고 `x-powered-by`도 켜져 있습니다.
    조치: helmet 미들웨어를 도입하고 `app.disable("x-powered-by")`를 설정합니다.

13. src\middleware\auth.js:33 — 세션을 읽을 때 `JSON.parse`를 try로 감싸지 않았습니다. 서명이 통과한 뒤에만 실행되므로 외부에서 노리기는 어렵습니다. 다만 비밀값이 새면(7번) 잘못된 토큰으로 500 에러를 낼 수 있습니다. 세션 무효화(로그아웃이나 권한 변경 시 기존 토큰 폐기) 기능도 없어서, 강등된 관리자의 토큰이 24시간 동안 유효합니다.
    조치: try/catch를 추가하고, 요청할 때 DB에서 role을 다시 확인합니다.

### 낮음

14. audit-bench.zip — 저장소 사본으로 보이는 압축 파일이 Git에 커밋돼 있습니다. 7번 비밀값을 포함한 옛 코드가 함께 퍼질 수 있습니다. 필요 없으면 저장소에서 빼고 .gitignore에 추가하기를 권합니다.

15. src\routes\matches.js:17-36, src\routes\teams.js:17, src\routes\players.js:17 — `:id`가 숫자인지 확인하지 않습니다. 쿼리는 자리표시자를 써서 인젝션 위험은 없지만, 없는 경기에도 댓글을 달 수 있습니다. 숫자 검증을 권합니다.

16. src\routes\auth.js:10-11 — 계정이 없을 때는 scrypt 연산을 건너뛰어서, 응답 시간 차이로 가입된 이메일인지 추측할 수 있습니다. 계정이 없을 때도 가짜 해시로 검증을 한 번 돌리면 막을 수 있습니다.

17. package.json:11-12 — 의존성은 2개이고 버전 범위(^)로만 지정돼 있으며 lock 파일이 없습니다. 설치할 때마다 버전이 달라질 수 있으니 package-lock.json을 커밋하기를 권합니다.

발견 없음(괜찮은 부분): 비밀번호 저장(scrypt + 사용자별 salt + timingSafeEqual), teams 검색과 상세 조회 쿼리의 자리표시자 사용, 요청 본문 크기 제한(100kb), .gitignore의 .env와 data/ 제외.

실행 권장 명령: `npm install --package-lock-only` 후 `npm audit` (네트워크가 필요해서 실행하지 않았습니다)

요약: 완료를 막을 심각 문제 8건 (1. 관리자 삭제 인증 누락, 2. SQL 인젝션, 3. 경로 조작으로 DB 유출, 4. 남의 프로필 수정, 5. 카드 bio XSS, 6. 댓글 XSS, 7. 하드코딩된 세션 비밀값(재발급 필요), 8. 비밀번호 원문 로그)

---

## [성능]

정밀 점검: 성능
범위: C:\Users\<user>\audit-bench 저장소 전체(src 21개 파일, public/app.js, public/index.html, tests, docs/api.md, package.json). audit-bench.zip은 열지 않음. 저장소에 DB 스키마(테이블·인덱스 정의) 파일이 없어서 인덱스 관련 항목은 추정입니다. 코드를 읽어서 찾은 "의심 지점"이고, 실제로 얼마나 느린지는 측정해야 확실히 알 수 있습니다.
심각도 표기: 요청하신 4단계(심각/높음/중간/낮음)를 썼습니다. 점검 기준의 3단계로 바꾸면 높음·중간은 "주의", 낮음은 "참고"입니다.

### 심각

- src/services/ranking.js:2-4 (computeRanks). 선수마다 전체 선수 목록을 복사해서 다시 정렬하고(`[...players].sort`), findIndex로 처음부터 다시 찾습니다. 선수 수를 n이라고 하면 계산량이 n² log n에 비례합니다. 선수 1만 명이면 1만 명짜리 정렬을 1만 번 하는 셈이라 비교가 약 13억 번 일어납니다.
  근거: 이 서버는 Node 단일 스레드(한 번에 한 가지 일만 처리하는 구조)라서, 이 계산을 하는 동안 다른 모든 요청이 멈춥니다. 여기에 아래 두 가지가 겹칩니다.
  - src/services/ranking.js:10 선수 전체를 개수 제한 없이 조회합니다.
  - src/server.js:21-23 /api/leaderboard 요청마다 캐시 없이 다시 계산하고, public/app.js:7-11 화면이 페이지를 열 때마다 호출합니다. 그런데 화면은 전체 목록을 받은 뒤 상위 20명만 씁니다(slice(0, 20)).

  권장: 한 번만 정렬하고 정렬된 위치를 순위로 씁니다(n log n). 더 나은 방법은 DB에서 `ORDER BY rating DESC LIMIT 20` 또는 SQLite의 `RANK() OVER (ORDER BY rating DESC)`로 필요한 만큼만 가져오는 것입니다. 이미 있는 cache.remember로 짧게(예: 30~60초) 캐시하는 것도 방법입니다. 동점자 순위 규칙은 테스트(tests/ranking.test.js)로 먼저 고정해 두세요.
  측정 방법: 선수 1천/1만 명짜리 가짜 배열로 computeRanks에 console.time을 걸어 보세요. `node --cpu-prof`로 프로필을 뜨거나, autocannon 같은 부하 도구로 /api/leaderboard를 호출하면서 다른 API의 응답 시간이 얼마나 늘어나는지 보면 됩니다.

### 높음

- src/jobs/stats.js:9-10. 리플레이 파일 개수만큼 반복하면서, 매번 같은 index.json을 디스크에서 다시 읽고 다시 파싱합니다. 동기 방식(Sync, 끝날 때까지 서버가 기다리는 방식)이라 그동안 서버 전체가 멈춥니다. 파일 수 × index.json 크기만큼 일이 늘어납니다.
  근거: src/server.js:26의 10분 캐시가 있어도, 캐시가 만료된 뒤 처음 들어온 요청이 이 전체 작업을 떠안습니다. 그리고 "주간" 통계인데 기간 필터가 없어서 리플레이가 쌓일수록 계속 느려집니다.
  권장: index.json은 반복문 밖에서 한 번만 읽습니다. 가능하면 비동기 방식(fs.promises)이나 미리 집계해 둔 값을 쓰고, utils/time.js의 weekStart로 이번 주 데이터만 셉니다.
  측정 방법: 리플레이 파일 수를 100개, 1000개로 늘려 가며 weeklyReport 실행 시간을 console.time으로 재 보세요.

- src/routes/matches.js:8-13. 경기 목록을 개수 제한 없이 가져온 뒤, 경기 하나마다 팀 조회를 2번씩 따로 합니다. 이런 패턴을 N+1(목록 1번 + 항목마다 추가 조회) 문제라고 부르고, 여기서는 쿼리가 2N+1번 실행됩니다.
  근거: better-sqlite3는 동기 방식이라 쿼리 하나하나가 서버를 잠깐씩 멈춥니다. 경기가 쌓일수록 응답 크기와 시간이 함께 늘어납니다.
  권장: teams 테이블을 JOIN으로 두 번 붙여 한 번에 가져오고, LIMIT/OFFSET이나 커서 방식으로 페이지를 나눕니다(config.pageSize 활용). matches.played_at에 인덱스가 필요해 보입니다.
  측정 방법: 경기 수천 건을 넣은 DB에서 응답 시간을 재 보세요. sqlite3 CLI에서 `EXPLAIN QUERY PLAN SELECT ... ORDER BY played_at DESC`를 실행해 결과에 "SCAN"이 나오고 "USE TEMP B-TREE"(정렬용 임시 공간)가 나오는지 확인하면 됩니다.

### 중간

- src/routes/replays.js:15 + src/services/replay.js:14. 리플레이 파일 전체를 readFileSync로 메모리에 한 번에 올린 뒤 보냅니다.
  근거: 큰 파일이면 읽는 동안 서버가 멈추고, 여러 명이 동시에 받으면 메모리 사용량이 그만큼 커집니다.
  권장: res.sendFile이나 fs.createReadStream으로 조금씩 흘려보내는 방식(스트리밍)을 쓰세요. 경로 검증도 같이 해야 하는데, 이건 보안 점검 항목입니다.
  측정 방법: 수십 MB짜리 파일을 동시에 10번 내려받으면서 process.memoryUsage()와 다른 API의 응답 시간을 확인해 보세요.

- src/services/replay.js:10 (src/routes/replays.js:8). 요청마다 폴더 전체를 동기 방식으로 읽고(readdirSync), 목록을 개수 제한 없이 반환합니다.
  권장: 비동기 방식으로 바꾸고, 페이지를 나누거나 짧게 캐시하세요.
  측정 방법: 파일 1만 개 폴더에서 응답 시간을 재 보세요.

- src/middleware/auth.js:5,12 (src/routes/auth.js:11). 로그인할 때 쓰는 비밀번호 확인 함수 scryptSync는 일부러 무겁게 만든 동기 계산입니다. 한 번에 수십 ms 동안 서버를 멈추게 하는데, 로그인 시도 횟수 제한이 없습니다.
  근거: 로그인 요청을 한꺼번에 보내면 다른 사용자 요청이 전부 늦어집니다(CPU를 고갈시키는 공격 경로).
  권장: 비동기 버전인 crypto.scrypt를 쓰고, 로그인 시도 횟수 제한(rate limit)을 추가하세요.
  측정 방법: autocannon으로 /api/auth/login을 초당 50번 호출하면서 다른 API의 응답 시간을 비교해 보세요.

- src/routes/players.js:10-12 + src/utils/sql.js:5, src/routes/teams.js:9-10. `LIKE '%검색어%'`처럼 앞에 %가 붙은 검색은 인덱스를 못 쓰고 테이블 전체를 훑습니다. 선수 검색은 rating 정렬까지 겹칩니다. 그리고 페이지 이동(offset)이 없어서 항상 첫 20건만 나옵니다.
  권장: 데이터가 많아지면 앞부분 일치 검색(`LIKE 'abc%'`)이나 SQLite FTS5(전문 검색 기능)를 검토하고, players.rating에 인덱스를 두세요. 참고로 sql.js의 문자열 이어붙이기 방식 자체는 SQL 인젝션이라는 보안 문제이므로 별도 보안 점검이 필요합니다.
  측정 방법: `EXPLAIN QUERY PLAN`으로 SCAN 여부를 보고, 선수 10만 명 데이터로 응답 시간을 재 보세요.

### 낮음

- src/db.js:7,11,15. 호출할 때마다 db.prepare로 SQL을 새로 준비(컴파일)합니다. 위 N+1 루프에서는 이 비용이 반복됩니다.
  권장: SQL 문장별로 준비된 결과를 Map에 저장해 다시 쓰세요.
  측정 방법: 같은 쿼리 1만 번을 prepare 재사용 전후로 비교해 보세요.

- 인덱스 추정(스키마 파일이 없어 확인 불가): comments(match_id, created_at) — src/routes/matches.js:18-19, team_members(team_id) — src/routes/teams.js:18-23, users(email) — src/routes/auth.js:10.
  측정 방법: 각 쿼리를 `EXPLAIN QUERY PLAN`으로 확인하세요.

- src/server.js:10-11. 응답 압축(compression)이 없고, 정적 파일 캐시 기간(maxAge)도 설정되어 있지 않습니다. 목록 API 응답이 커질수록 전송량이 늘어납니다.
  측정 방법: 브라우저 Lighthouse 또는 개발자도구 Network 탭에서 전송 크기를 확인하세요.

- src/services/cache.js:1-9. 크기 상한이 없고, 만료된 항목도 지우지 않습니다. 지금은 키가 "weekly" 하나뿐이라 문제가 없지만, 사용자별 키 같은 것을 넣기 시작하면 메모리가 계속 늘어납니다.
  측정 방법: 해당 없음(구조 참고 사항).

범위 밖 참고(보안): 점검 중에 성능과 무관한 보안 의심 지점도 눈에 띄었습니다. 비밀값 하드코딩(src/config.js:8, 값은 *** 처리), 로그에 비밀번호 출력(src/routes/auth.js:9), SQL 인젝션(src/utils/sql.js:5), 경로 조작(src/services/replay.js:6), XSS(src/utils/html.js:15, public/app.js:23), 인증·권한 누락(src/routes/admin.js:17, src/routes/profile.js:14), 인증 없는 카드 조회(src/routes/profile.js:22). 초점이 성능이라 자세히 보지 않았고, security 초점으로 따로 점검하시길 권합니다.

요약: 완료를 막을 심각 문제 1건 (src/services/ranking.js:2-4 리더보드 순위 계산. 개수 제한 없는 전체 조회와 캐시 없음이 겹쳐 있음)

---

참고: 보안 보고서에 이미 있는 항목이 성능 쪽에서도 다시 나온 게 있습니다(로그인 시도 횟수 제한, sql.js, replay.js). 각 담당이 보는 관점이 달라서 둘 다 그대로 두었습니다.
