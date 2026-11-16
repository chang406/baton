# 정밀 점검 보고서 (audit-bench, 범위: 저장소 전체)

- 날짜: 2026-10-14
- 대상: C:\Users\<user>\audit-bench (main, 커밋 a5e5d91, 작업 트리 clean)
- 방식: `/audit-all 전체`. deep-audit 서브에이전트 2개(security, performance)를 동시에 실행

**완료를 막을 심각 문제: 보안 8건, 성능 1건**

**어디부터 고칠까요?** 먼저 `src/config.js:8` 서명 비밀키와 `src/routes/auth.js:9` 비밀번호 로그를 정리하세요. 이 둘은 이미 Git과 로그에 남아 있어서 비밀키 재발급과 로그 삭제도 필요해요. 이어서 외부에서 바로 노릴 수 있는 `admin.js:17` 인증 누락, `sql.js:5` SQL 인젝션, `replay.js:6` 경로 조작을 고치세요. 나머지 보안 심각 문제(프로필 수정 권한, XSS 두 곳)를 정리한 뒤 성능 쪽 `ranking.js`를 고치면 돼요.

아래 두 칸은 점검 결과를 바꾸지 않고 그대로 옮겼어요. 1만 명에 몇 초 같은 성능 수치는 점검 담당이 밝힌 대로 코드를 보고 추정한 값이에요. 실제로 측정한 값은 아니에요.

---

## [보안]

정밀 점검: 보안
범위: 저장소 C:\Users\<user>\audit-bench 전체 (src 19개, public 2개, tests 1개, docs/api.md, package.json, .gitignore, README.md). Git 커밋은 1개(a5e5d91)뿐이라 변경분 비교 대신 전체를 읽었습니다. (전체 28개 중 27개를 직접 읽음. audit-bench.zip(15KB)은 지시대로 압축을 풀지 않았고, 커밋에 들어 있다는 것만 확인함. 안의 내용은 점검하지 않았음)

**심각 (8건. 모두 완료를 막는 문제)**
- C:\Users\<user>\audit-bench\src\routes\admin.js:17. 선수 삭제 API(`DELETE /api/admin/players/:id`)에 로그인 확인(`requireAuth`)과 관리자 확인(`requireAdmin`)이 없습니다. 위의 다른 두 관리자 API에는 있습니다. 로그인하지 않은 사람도 아무 선수나 지울 수 있습니다. / 다른 관리자 API처럼 `requireAuth, requireAdmin`을 붙이세요. 완료 차단: 예
- C:\Users\<user>\audit-bench\src\utils\sql.js:5 (이 함수를 부르는 곳: src\routes\players.js:10-12). 선수 검색어 `q`와 `region`을 SQL 문장에 그대로 끼워 넣습니다. 이것을 SQL 인젝션(입력값으로 DB 명령을 조작하는 공격)이라고 합니다. 예를 들어 `q=' UNION SELECT id,email,password_hash,0 FROM users--`를 넣으면 users 테이블의 이메일과 비밀번호 해시를 꺼낼 수 있습니다. / teams.js처럼 `?` 자리표시자에 값을 따로 넘기는 방식으로 바꾸세요. 완료 차단: 예
- C:\Users\<user>\audit-bench\src\services\replay.js:6 (이 함수를 부르는 곳: src\routes\replays.js:12-15). 다운로드할 파일 이름(`file`)을 검사하지 않고 경로에 붙입니다. 이것을 경로 조작(path traversal)이라고 합니다. 로그인한 사람은 누구나 `file=../arena.db`(DB 전체와 비밀번호 해시)나 `file=../../src/config.js`(서명 비밀키) 같은 파일을 내려받을 수 있습니다. / `path.basename`으로 폴더 부분을 떼고, 최종 경로가 replayDir 안에 있는지, `.rpl`로 끝나는지 확인하세요. 완료 차단: 예
- C:\Users\<user>\audit-bench\src\routes\profile.js:14-18. 프로필을 수정할 때 주소의 `:id`가 로그인한 본인(`req.user.id`)인지 확인하지 않습니다. 그래서 다른 사람의 닉네임과 자기소개를 마음대로 바꿀 수 있습니다. / 본인인지 확인하거나 `req.user.id`만 쓰세요. 완료 차단: 예
- C:\Users\<user>\audit-bench\src\config.js:8. 로그인 토큰을 서명하는 비밀키(값 `***`)가 코드에 직접 적혀 있고 이미 Git에 기록됐습니다. 이 값을 아는 사람은 `role: "admin"` 토큰을 직접 만들어 관리자 권한을 얻을 수 있습니다. / 환경변수로 옮기세요. 값이 없으면 서버가 시작되지 않게 하세요. 키 재발급 필요. 완료 차단: 예
- C:\Users\<user>\audit-bench\src\routes\auth.js:9. 로그인을 시도할 때마다 이메일과 **비밀번호 원문**을 로그에 남깁니다. 로그를 볼 수 있는 사람이나 로그 수집 도구가 모든 사용자의 비밀번호를 알게 됩니다. / 이 줄을 지우세요. 남겨야 한다면 이메일 정도만 남기세요. 이미 쌓인 로그도 지워야 합니다. 완료 차단: 예
- C:\Users\<user>\audit-bench\src\utils\html.js:15 (이 함수를 부르는 곳: src\routes\profile.js:22-26). 선수 카드 HTML에서 `bio`(자기소개)만 이스케이프(특수문자를 안전한 글자로 바꾸는 처리)를 하지 않습니다. 이것을 저장형 XSS(남이 넣어둔 스크립트가 다른 사람 브라우저에서 실행되는 공격)라고 합니다. 이 카드 주소는 로그인 없이 열리고 사이트와 같은 출처라서, 열어본 사람의 localStorage 토큰을 훔칠 수 있습니다. 위의 프로필 수정 문제와 합치면 남의 카드에도 심을 수 있습니다. / `escapeHtml(p.bio)`로 바꾸세요. 완료 차단: 예
- C:\Users\<user>\audit-bench\public\app.js:23. 경기 댓글의 `c.text`와 `c.author`를 `innerHTML`로 그대로 화면에 넣습니다. 서버(matches.js:26)는 길이만 자르고 내용은 거르지 않습니다. 그래서 댓글에 스크립트를 넣으면 보는 사람 모두의 토큰을 훔칠 수 있습니다(저장형 XSS). / leaderboard처럼 `textContent`로 요소를 만드세요. 완료 차단: 예

**높음 (완료 차단: 아니오, 공개 전에 고치기)**
- C:\Users\<user>\audit-bench\src\routes\auth.js:7. 로그인 시도 횟수에 제한(rate limit)이 없습니다. 비밀번호를 계속 바꿔 넣어보는 무차별 대입 공격이 가능합니다. scrypt는 계산이 무거워서, 요청이 몰리면 서버가 느려지는 공격(DoS)에도 쓰일 수 있습니다. / IP나 계정별로 시도 횟수를 제한하세요.
- C:\Users\<user>\audit-bench\src\server.js:9-11. 보안 헤더가 없습니다. 특히 CSP(허용된 스크립트만 실행하게 하는 브라우저 설정)가 없어서 위의 XSS를 막아줄 보호막이 없습니다. / helmet 같은 미들웨어로 CSP 등을 설정하세요.

**중간 (완료 차단: 아니오)**
- C:\Users\<user>\audit-bench\public\app.js:2. 토큰을 localStorage에 저장합니다. XSS가 하나라도 생기면 바로 털립니다. / HttpOnly 쿠키(스크립트가 읽을 수 없는 쿠키)를 검토하세요.
- C:\Users\<user>\audit-bench\src\middleware\auth.js:31-32. 서명 길이를 '글자 수'로 비교한 뒤 `timingSafeEqual`에 '바이트' 버퍼를 넘깁니다. 한글 같은 비ASCII 문자가 섞인 토큰이 오면 예외가 나서 500 오류가 됩니다. 개발 모드에서는 오류 상세(stack trace)까지 노출될 수 있습니다. / Buffer로 바꾼 뒤 바이트 길이를 비교하세요.
- C:\Users\<user>\audit-bench\src\middleware\auth.js:23. 역할(role)이 토큰 안에 24시간 동안 고정됩니다. 관리자 권한을 회수하거나 계정을 지워도 토큰이 만료될 때까지 계속 쓸 수 있고, 로그아웃이나 토큰 폐기 기능도 없습니다. / 요청마다 DB에서 역할을 다시 확인하세요. 유효기간을 줄이는 것도 방법입니다.

**낮음 (완료 차단: 아니오)**
- C:\Users\<user>\audit-bench\src\routes\teams.js:9. 검색어 안의 `%`, `_`가 LIKE 와일드카드로 처리됩니다. 인젝션은 아니고, 원치 않는 검색 결과가 나오는 정도입니다.
- C:\Users\<user>\audit-bench\src\routes\matches.js:25-34. 댓글을 쓸 때 해당 경기가 실제로 있는지 확인하지 않습니다. 있지도 않은 match_id에 쓰레기 데이터가 쌓일 수 있습니다.
- C:\Users\<user>\audit-bench\package.json. 버전을 고정하는 lock 파일(package-lock.json)이 없습니다. 설치할 때마다 의존성 버전이 달라질 수 있습니다.
- C:\Users\<user>\audit-bench\audit-bench.zip. 압축 파일이 Git에 들어 있습니다. 압축을 풀지 않아 내용은 모릅니다. 비밀값이 들어 있을 수 있으니 직접 확인하거나 저장소에서 빼는 것을 권합니다.
- 참고: 프로젝트에 scripts/baton/scan-secrets.mjs가 없어서(.baton-skip 프로젝트) 비밀값 자동 스캔은 하지 못했습니다. 파일이 적어 전부 눈으로 확인했습니다.

실행 권장 명령: npm install --package-lock-only && npm audit (네트워크가 필요해서 실행하지 않았습니다)

요약: 완료를 막을 심각 문제 8건

---

## [성능]

정밀 점검: 성능
범위: 저장소 C:\Users\<user>\audit-bench 전체 (src 19개, public 2개, tests 1개, docs/api.md, package.json, .gitignore, README.md). audit-bench.zip(약 15KB)은 있다는 것만 확인했고 압축은 풀지 않았습니다. 변경분이 없어(main, clean) 전체를 점검했습니다. (명령으로 걸러 전체 28개 중 26개를 읽음. zip과 빈 .baton-skip은 제외)

심각도 표기: 정해진 형식의 "심각 / 주의 / 참고" 칸 안에 요청하신 4단계(심각/높음/중간/낮음)를 함께 적었습니다. 심각 = 완료를 막음, 높음·중간 = 주의, 낮음 = 참고입니다.
참고로 이 서버는 Node.js라서 요청 처리 줄이 사실상 하나입니다(이벤트 루프). 그래서 동기 작업(끝날 때까지 다른 일을 못 하는 작업) 하나가 오래 걸리면 그동안 모든 사용자의 요청이 멈춥니다.

**심각**
- C:\Users\<user>\audit-bench\src\services\ranking.js:2-5 (+ 10행) [심각 / 완료를 막음: 예] computeRanks가 선수 한 명마다 전체 선수 목록을 복사해서 다시 정렬하고(3행), 이어서 findIndex로 처음부터 찾습니다(4행). 계산량이 대략 "선수 수² × log(선수 수)"로 늘어납니다. 그런데 leaderboard()는 10행에서 개수 제한 없이 모든 선수를 불러오고, 결과를 캐시하지 않은 채 /api/leaderboard 요청마다(server.js:21-23) 동기로 실행합니다. 선수가 1만 명이면 비교가 10억 번 넘게 일어나 요청 한 번에 몇 초씩 서버 전체가 멈출 수 있습니다. 화면에서는 이 API를 페이지를 열 때마다 부릅니다(public/app.js:7).
  제안: 한 번만 정렬해서 순서대로 순위를 매기거나(O(n log n)), DB에서 `ORDER BY rating DESC LIMIT 20` 또는 `RANK() OVER (ORDER BY rating DESC)`로 계산합니다. 짧게 캐시(cache.remember)하는 것도 좋습니다.
  측정 방법: 테스트 DB에 선수 1천·1만 명을 넣고 `console.time`으로 leaderboard() 시간을 재거나, `node --cpu-prof src/server.js`를 켠 채 /api/leaderboard를 호출해 프로파일을 봅니다. `autocannon`으로 부하를 주며 다른 API의 응답 시간이 함께 늘어나는지도 확인합니다.

**주의**
- C:\Users\<user>\audit-bench\src\jobs\stats.js:9-10 [높음 / 완료를 막음: 아니오] 반복문 안에서 리플레이 파일 하나마다 같은 index.json을 디스크에서 다시 읽고 JSON.parse합니다. 리플레이 수 × index 크기만큼 일이 늘어나고(사실상 제곱), 모두 동기 I/O(readdirSync, readFileSync)입니다. 10분 캐시(server.js:26) 덕분에 실행 빈도는 낮지만, 캐시가 만료된 뒤 첫 요청에서는 리플레이가 수천 개면 그동안 서버 전체가 멈춥니다. 데이터가 커지면 '심각'으로 올려야 합니다.
  제안: index.json은 반복문 밖에서 한 번만 읽고, 비동기 fs.promises를 쓰거나 이 작업을 미리 계산(백그라운드 작업)해 둡니다.
  측정 방법: 테스트 폴더에 가짜 .rpl 파일 1천·5천 개와 그에 맞는 index.json을 두고 `console.time('weekly')`로 weeklyReport() 시간을 잽니다.
- C:\Users\<user>\audit-bench\src\routes\matches.js:8-13 [높음 / 완료를 막음: 아니오] N+1 조회(목록 1번 + 항목마다 추가 조회)입니다. 경기 하나마다 팀 조회를 2번씩 더 하므로(11-12행) 경기 N개면 쿼리가 2N+1번입니다. 게다가 8행 목록 조회에 LIMIT이 없어 경기가 쌓일수록 응답 크기와 시간이 끝없이 늘어납니다. db.js가 매번 prepare를 새로 하는 문제(아래)와 겹쳐 더 느려집니다.
  제안: `JOIN teams ta ON ta.id = m.team_a JOIN teams tb ON tb.id = m.team_b`로 한 번에 가져오고, LIMIT/OFFSET(config.pageSize)으로 페이지를 나눕니다.
  측정 방법: 경기 1만 건을 넣은 DB로 /api/matches 응답 시간과 크기를 재고(브라우저 개발자도구 Network 탭 또는 `curl -w "%{time_total}"`), 실행되는 쿼리 수를 셉니다.
- C:\Users\<user>\audit-bench\src\middleware\auth.js:5, 12 (src/routes/auth.js:11에서 호출) [중간 / 완료를 막음: 아니오] 비밀번호 확인에 scryptSync(일부러 느리게 만든 동기 해시 함수)를 써서, 로그인 한 번마다 수십 ms 동안 이벤트 루프가 멈춥니다. 로그인이 몰리면 다른 모든 요청이 그만큼 줄을 서게 됩니다.
  제안: 비동기 `crypto.scrypt`(콜백 또는 util.promisify)로 바꿉니다. 이 작업은 별도 스레드에서 돌아갑니다.
  측정 방법: `autocannon -m POST`로 /api/login에 동시 요청을 보내면서 /api/players/1의 응답 시간이 함께 늘어나는지 봅니다.
- C:\Users\<user>\audit-bench\src\services\replay.js:10, 14 (src/routes/replays.js:8, 15) [중간 / 완료를 막음: 아니오] 목록 요청마다 readdirSync로 폴더 전체를 동기로 읽고 개수 제한도 없습니다. 다운로드는 readFileSync로 파일 전체를 메모리에 올린 다음 보냅니다. 리플레이가 크거나 동시 다운로드가 많으면 메모리가 급증하고 그동안 서버가 멈춥니다.
  제안: 다운로드는 `res.sendFile` 또는 `fs.createReadStream().pipe(res)`로 조금씩 흘려보내고(스트리밍), 목록은 비동기로 읽어 캐시하거나 페이지를 나눕니다.
  측정 방법: 수십 MB짜리 .rpl 파일을 동시에 10개 내려받으며 `process.memoryUsage()`와 다른 API의 응답 시간을 관찰합니다.
- C:\Users\<user>\audit-bench\src\db.js:6-16 [중간 / 완료를 막음: 아니오] 쿼리를 실행할 때마다 db.prepare로 SQL을 새로 해석합니다(statement 재사용 없음). 쿼리 하나는 영향이 작지만, 위의 N+1처럼 반복 호출과 겹치면 비용이 계속 쌓입니다.
  제안: SQL 문자열을 키로 하는 Map에 prepare 결과를 저장해 재사용합니다.
  측정 방법: 같은 쿼리를 1만 번 실행하는 짧은 벤치마크로 prepare 캐시가 있을 때와 없을 때를 비교합니다.
- 인덱스(DB에서 빨리 찾기 위한 목차) 확인 불가 [중간 / 완료를 막음: 아니오] 저장소에 DB 스키마나 마이그레이션 파일이 없어서 인덱스가 있는지 확인할 수 없습니다. 인덱스가 있어야 할 조건은 다음과 같습니다: matches.played_at (matches.js:8 정렬), comments(match_id, created_at) (matches.js:19), team_members.team_id (teams.js:22), players.rating (players.js:12, ranking), users.email (auth.js:10). 또 players.js:12와 teams.js:10의 `LIKE '%검색어%'`는 앞에 %가 붙어 있어 인덱스를 쓸 수 없고, 매번 테이블 전체를 훑습니다.
  제안: 스키마 파일을 저장소에 넣고 위 컬럼에 인덱스를 만듭니다. 검색은 접두어 검색(`'검색어%'`)이나 SQLite FTS5(전문 검색 기능)를 검토합니다.
  측정 방법: sqlite3에서 `EXPLAIN QUERY PLAN <쿼리>`를 실행해 "SCAN"(전체 탐색)이 나오는지, "SEARCH ... USING INDEX"가 나오는지 확인합니다.

**참고**
- C:\Users\<user>\audit-bench\public\app.js:11 [낮음 / 완료를 막음: 아니오] 화면에는 20명만 보여 주는데(slice(0,20)) 서버는 전체 선수 목록을 보냅니다. 받는 데이터와 서버 계산이 모두 낭비됩니다. ranking.js를 고칠 때 API에 LIMIT을 함께 넣으면 해결됩니다. 측정 방법: 개발자도구 Network 탭에서 /api/leaderboard 응답 크기를 확인합니다.
- C:\Users\<user>\audit-bench\src\routes\teams.js:18-24 [낮음 / 완료를 막음: 아니오] 팀원 목록에 LIMIT이 없습니다. 팀 크기가 작다면 문제없습니다. 측정 방법: 팀원 수가 가장 많은 팀으로 응답 시간을 봅니다.
- C:\Users\<user>\audit-bench\src\server.js:11 [낮음 / 완료를 막음: 아니오] express.static에 캐시 기간(maxAge)이 설정되어 있지 않아 브라우저가 app.js 등을 자주 다시 확인합니다. 측정 방법: Lighthouse의 "효율적인 캐시 정책" 항목을 봅니다.
- C:\Users\<user>\audit-bench\tests\ranking.test.js:5-13 [낮음 / 완료를 막음: 아니오] 테스트가 선수 3명만 사용해서 위의 제곱 수준 느려짐을 잡아내지 못합니다. 선수 1만 명 정도의 시간 제한 테스트를 추가하면 다시 느려지는 것을 막을 수 있습니다.
- 성능과 관계없어 깊게 보지 않았지만 눈에 띈 보안 문제가 있어 따로 security 점검을 권합니다: config.js:8 비밀키가 코드에 직접 들어 있음(값 ***), auth.js:9 로그인 로그에 비밀번호 출력, utils/sql.js:5 SQL 인젝션, admin.js:17 삭제 API에 인증 없음, profile.js:14 다른 사람 프로필 수정 가능, html.js:15·app.js:23 XSS, replay.js:6 경로 조작.
- 측정 도구(autocannon, 대량 테스트 데이터)는 설치나 데이터 생성이 필요해 실행하지 않았습니다. 위의 수치(1만 명에 몇 초 등)는 코드 구조를 보고 추정한 값이며, 실제로 측정한 값이 아닙니다.

요약: 완료를 막을 심각 문제 1건 (src/services/ranking.js 리더보드 순위 계산)

심각 문제 건수: 1
