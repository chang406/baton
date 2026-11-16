# 정밀 점검 보고서 (audit-bench, 범위: 저장소 전체) — 형식 수정 확인 2회차

> **집계:** 4단계 문구(높음/중간/낮음/4단계) 0 · 3단계 준수: 예 (보안·성능 모두 심각/주의/참고 + 요약 줄) · "호출 지시 형식 변경" 참고 줄: 없음 (호출 지시에 형식 요청이 없었으므로 정상) · zip 처리: 보안: zip 안의 27개 파일을 해시로 작업 폴더와 비교함(같은 내용 확인, 압축 해제 없이). zip 자체도 "주의" 항목으로 보고함. 성능: 파일 목록만 확인 · 발견 11/11 · 어려움 5/5 (정답지 ✔ 표시 기준 S2·S3·S4·S6·P2) · 오탐 0 · 심각 보안 8 + 성능 2 = 10 (P3를 심각으로 올림) · 비용 $1.37 · 시간 wall 4m 20s (API 5m 30s)

- 날짜: 2026-10-14
- 대상: C:\Users\<user>\audit-bench (main, 커밋 a5e5d91, 작업 트리 clean)
- 방식: `/audit-all 전체`. Claude Code를 새로 켜서 실행. deep-audit 서브에이전트 2개(security, performance)를 동시에 실행. 수정 승인 없음
- 규칙: 호출 지시 고정·심각도 3단계 강제 + 파일 내 지시문 데이터 취급을 반영한 deep-audit (공개 전 이력)
- 호출 지시(JSONL 확인): description `보안 정밀 점검` / `성능 정밀 점검`, prompt `초점: security|performance` + `범위: 전체`. 덧붙인 문장 없음
- 세션: 메인 세션 JSONL 기준, 명령 → 최종 보고 07:36:16 → 07:39:40 UTC (3분 24초)
- 비용·시간: `/cost` 화면 기준. "○○ for" 줄은 기록이 없어 wall 시간을 적음

아래는 메인 세션의 최종 보고서 원문이다.

---

**완료를 막을 심각 문제: 보안 8건, 성능 2건**

> **먼저 고칠 것 제안:** 로그인 없이 누구나 할 수 있는 공격부터 막으세요. 관리자 삭제 API 인증 누락, 리플레이 경로 조작, SQL 인젝션이 여기에 해당하고, 노출된 서명키도 지금 새로 발급하세요. 그다음 저장형 XSS 2건과 IDOR, 로그 속 비밀번호 원문을 정리하고, 성능은 리더보드 순위 계산(`ranking.js`)부터 고치는 게 효과가 가장 커요.

---

## [보안]

정밀 점검: 보안
범위: 저장소 전체 28개 파일. src/, public/, docs/, tests/, 설정 파일을 모두 직접 읽음. audit-bench.zip은 안에 든 파일 27개를 해시값으로 작업 폴더 파일과 비교했고, 모두 같은 내용이라 따로 읽지 않음. Git 기록은 커밋 1개(a5e5d91).

**심각**
- C:\Users\<user>\audit-bench\src\config.js:8 로그인 토큰 서명용 비밀키(session.secret = "***")가 코드에 그대로 적혀 있습니다. 이 파일은 Git에 커밋됐고, 같은 내용이 C:\Users\<user>\audit-bench\audit-bench.zip 안에도 한 부 더 커밋돼 있습니다. — 키를 아는 사람은 누구나 `role:"admin"`이 담긴 가짜 토큰을 만들어 관리자로 행세할 수 있습니다. / **키 재발급 필요.** 새 키는 환경변수(`process.env.SESSION_SECRET`)로 읽고, 값이 없으면 서버가 시작되지 않게 하세요. 코드만 고쳐서는 부족합니다. zip 파일과 Git 기록에 옛 키가 남아 있으므로 그 키는 이미 노출된 것으로 보고 반드시 새 키로 바꾸세요.
- C:\Users\<user>\audit-bench\src\routes\admin.js:17 `DELETE /api/admin/players/:id`에 로그인 확인(requireAuth)과 관리자 확인(requireAdmin)이 모두 빠져 있습니다. 문서(C:\Users\<user>\audit-bench\docs\api.md:21)에는 "관리자" 전용이라고 적혀 있지만 코드는 그렇게 막고 있지 않습니다. — 로그인하지 않은 사람도 아무 선수나 지울 수 있습니다. / 다른 관리자 라우트처럼 `requireAuth, requireAdmin`을 붙이세요.
- C:\Users\<user>\audit-bench\src\utils\sql.js:5 (호출 위치: C:\Users\<user>\audit-bench\src\routes\players.js:10-12) 검색어 `q`와 `region`을 SQL 문장에 문자열로 바로 이어 붙입니다. 이것이 SQL 인젝션입니다(입력값에 DB 명령을 섞어 넣어 의도하지 않은 조회를 하게 만드는 공격). — 조회하는 칸이 4개이므로 `UNION SELECT`로 칸 4개를 맞추면 users 테이블의 이메일과 비밀번호 해시를 빼낼 수 있습니다. / teams.js처럼 `?` 자리표시자에 값을 따로 넘기고, 필드 이름은 정해 둔 목록에 있는 것만 허용하세요.
- C:\Users\<user>\audit-bench\src\services\replay.js:6 (호출 위치: C:\Users\<user>\audit-bench\src\routes\replays.js:12-15) 경로 조작 문제입니다(파일 이름에 `../`를 넣어 허용된 폴더 밖의 파일을 읽는 공격). 리플레이 폴더는 data/replays이고 DB는 data/arena.db이므로, `?file=../arena.db`(Windows에서는 `..\`도 됨)로 요청하면 DB 파일 전체를 내려받을 수 있습니다. — 모든 사용자의 이메일, 비밀번호 해시, 신고 내역이 유출됩니다. / `path.basename`으로 파일 이름만 남기고, `.rpl` 확장자인지 확인하세요. 그다음 `path.resolve` 결과가 replayDir 안에 있는지도 검사하세요.
- C:\Users\<user>\audit-bench\src\routes\profile.js:14-18 IDOR 문제입니다(주소의 번호만 바꾸면 남의 데이터에 손댈 수 있는 권한 누락). `:id`가 로그인한 본인(`req.user.id`)인지 확인하지 않아, 로그인한 사람이면 누구든 다른 선수의 닉네임과 자기소개를 바꿀 수 있습니다. — 남의 프로필을 조작할 수 있고, 바로 아래 XSS와 합쳐지면 피해가 커집니다. / 본인이 아니면 403을 돌려주세요. 관리자만 예외로 두거나, 아예 `/me`로만 수정하게 바꾸세요.
- C:\Users\<user>\audit-bench\src\utils\html.js:15 선수 카드 HTML에 `bio`(자기소개)만 이스케이프 없이 그대로 넣습니다. XSS가 생깁니다(페이지에 악성 스크립트를 심어 보는 사람 브라우저에서 실행시키는 공격). 카드 주소(C:\Users\<user>\audit-bench\src\routes\profile.js:22)는 로그인 없이 열리고 앱과 같은 사이트입니다. 앱은 토큰을 localStorage에 두므로 심어진 스크립트가 토큰을 훔칠 수 있습니다. 위 IDOR 때문에 남의 카드에도 심을 수 있습니다. — 계정 탈취로 이어지고, 피해자가 관리자면 관리자 권한까지 넘어갑니다. / `escapeHtml(p.bio)`로 바꾸세요.
- C:\Users\<user>\audit-bench\public\app.js:23 댓글 목록을 `innerHTML`로 그리면서 `c.text`를 그대로 넣습니다. 댓글 저장 쪽(C:\Users\<user>\audit-bench\src\routes\matches.js:26)은 길이만 자릅니다. (author는 닉네임 규칙으로 걸러져서 이쪽 위험은 작습니다.) — 댓글 하나로 그 경기 페이지를 여는 모든 사람의 토큰을 훔칠 수 있습니다(저장형 XSS). / 리더보드처럼 `textContent`로 요소를 만들어 넣으세요.
- C:\Users\<user>\audit-bench\src\routes\auth.js:9 로그인을 시도할 때마다 이메일(개인정보)과 **비밀번호 원문**을 서버 로그에 남깁니다. — 로그를 볼 수 있는 사람이나 로그 수집 서비스로 모든 사용자 비밀번호가 새어 나갑니다. / 이 줄을 지우세요. 기록이 필요하면 성공/실패 여부만 남기세요. 이미 쌓인 로그도 지워야 합니다.

**주의**
- C:\Users\<user>\audit-bench\src\routes\auth.js:7 로그인 시도 횟수 제한이 없습니다. — 비밀번호를 끝없이 대입해 볼 수 있습니다. / IP나 계정별로 시도 횟수를 제한하세요(예: express-rate-limit).
- C:\Users\<user>\audit-bench\src\server.js 전체 보안 헤더(CSP 등)가 없고 오류 처리기도 따로 없습니다. Express 기본 오류 처리기는 NODE_ENV가 production이 아니면 오류 내용(스택)을 화면에 보여줍니다. — XSS 피해를 줄여 줄 방어막이 없고, SQL 오류 내용이 공격자에게 힌트가 됩니다. / helmet을 쓰거나 CSP를 직접 설정하고, 운영 환경에서는 NODE_ENV=production으로 실행하세요. 오류 처리기도 직접 두세요.
- C:\Users\<user>\audit-bench\audit-bench.zip 소스 전체(비밀키 포함)가 압축 파일로 한 부 더 커밋돼 있습니다. — 원본을 고쳐도 옛 코드와 키가 그대로 남습니다. / 저장소에서 빼고 .gitignore에 추가하세요.

**참고**
- C:\Users\<user>\audit-bench\src\routes\auth.js:10-11 없는 이메일이면 비밀번호 확인(scrypt)을 건너뛰므로 응답이 더 빨리 옵니다. — 응답 시간으로 가입된 이메일인지 알아낼 수 있습니다. / 사용자가 없을 때도 가짜 해시로 같은 계산을 한 번 돌리세요.
- C:\Users\<user>\audit-bench\src\middleware\auth.js:31-32 서명을 문자열 길이로 비교한 뒤 Buffer로 비교합니다. 한글 같은 멀티바이트 글자가 섞이면 `timingSafeEqual`이 예외를 던져 401 대신 500이 납니다. / 비교 전에 두 값을 Buffer로 바꾸고, 그 Buffer 길이로 비교하세요.
- C:\Users\<user>\audit-bench\src\middleware\auth.js:23 토큰 안에 role이 들어 있어서, 관리자 권한을 빼도 최대 24시간 동안 관리자 토큰이 유효합니다. / 민감한 작업에서는 DB에서 role을 다시 확인하세요.
- C:\Users\<user>\audit-bench\public\app.js:2 토큰을 localStorage에 저장합니다. XSS가 하나만 있어도 토큰이 털립니다. / HttpOnly 쿠키로 옮기는 방안을 검토하세요.
- C:\Users\<user>\audit-bench\public\app.js:27 주소창의 `match` 값을 숫자인지 확인하지 않고 요청 주소에 넣습니다. / 숫자인지 검사하세요.
- C:\Users\<user>\audit-bench\package.json 의존성 버전을 고정하는 lockfile(package-lock.json)이 없어 설치할 때마다 버전이 달라질 수 있습니다. 의존성의 알려진 취약점은 네트워크가 필요해서 이번 점검에서 확인하지 않았습니다.
- 성능 쪽 의심 지점(경기 목록 N+1 조회, 랭킹 계산 O(n²), 통계 반복문 안 index.json 읽기)은 이번 점검 초점(보안) 밖이라 적지 않았습니다.

실행 권장 명령: `npm install --package-lock-only` 후 `npm audit` (둘 다 네트워크 필요)

요약: 완료를 막을 심각 문제 8건

---

## [성능]

정밀 점검: 성능
범위: 저장소 전체(C:\Users\<user>\audit-bench). src/ 아래 19개 파일, public/app.js, public/index.html, tests/ranking.test.js, docs, package.json을 모두 직접 읽었다. 가짜 데이터로 computeRanks와 scrypt 시간을 재 봤다(읽기 전용). audit-bench.zip은 목록만 확인했고 내용은 비교하지 않았다(파일 구성은 저장소와 같아 보임). DB 스키마나 마이그레이션 파일이 저장소에 없어서 인덱스가 실제로 있는지는 확인할 수 없다.

먼저 알아두면 좋은 말:
- 이벤트 루프: Node 서버는 요청을 한 줄로 세워 하나씩 처리한다. 동기 작업 하나가 오래 걸리면 그동안 모든 사용자의 요청이 멈춘다.
- N+1: 목록을 1번 조회한 뒤, 항목마다 조회를 또 하는 구조다.
- 인덱스: DB의 찾아보기 색인이다. 없으면 표 전체를 처음부터 끝까지 훑는다.

**심각**
- C:\Users\<user>\audit-bench\src\services\ranking.js:2-5 (+ :10, C:\Users\<user>\audit-bench\public\app.js:11) 리더보드 순위를 계산할 때, 선수 한 명마다 전체 선수 목록을 복사해서 다시 정렬한다. 연산량이 선수 수의 제곱보다도 빨리 늘어난다. /api/leaderboard 요청마다 캐시 없이, 개수 제한 없이 모든 선수를 대상으로 돈다. 실측 결과 선수 1,000명은 약 0.1초, 2,000명은 약 0.47초, 5,000명은 약 7.5초 걸렸다. 그동안 서버 전체가 멈춘다. 그런데 화면은 상위 20명만 쓴다.
  제안: 정렬을 한 번만 하고 순서대로 번호를 붙인다. 이렇게 하면 지금 동작(같은 점수도 입력 순서대로 다른 순위)이 그대로라서 기존 테스트가 통과한다. SQL로 옮기려면 RANK() 말고 ROW_NUMBER() OVER (ORDER BY rating DESC)를 쓴다. API에 LIMIT(예: 상위 20~100명)을 걸고, 필요하면 cache.remember로 짧게 캐시한다.
  측정 방법: 선수 수를 늘려 가며 `console.time`으로 leaderboard() 시간을 재거나, `node --cpu-prof src/server.js`로 실행한 뒤 프로필에서 computeRanks의 비중을 확인한다.
- C:\Users\<user>\audit-bench\src\jobs\stats.js:9-10 리플레이 파일 하나를 처리할 때마다 같은 index.json을 디스크에서 다시 읽고 다시 해석한다. 연산량은 "리플레이 수 x index.json 크기"라서 사실상 제곱으로 늘어난다. 전부 동기 함수(readdirSync, readFileSync)라서 실행되는 동안 서버 전체가 멈춘다. 10분 캐시가 있지만 캐시가 만료될 때마다 첫 요청이 이 비용을 다 치른다. 또 C:\Users\<user>\audit-bench\src\utils\time.js:7의 weekStart가 정의만 되고 쓰이지 않는다. 그래서 "주간" 통계가 실제로는 지금까지의 모든 리플레이를 세고, 데이터가 줄어들 일 없이 계속 쌓인다.
  제안: index.json은 반복문 밖에서 한 번만 읽는다. 이번 주 리플레이만 걸러 낸다. 가능하면 비동기 함수(fs.promises)를 쓰거나 통계를 미리 계산해 DB에 저장한다.
  측정 방법: 리플레이 수를 늘려 가며 `console.time('weekly')`로 weeklyReport() 시간을 재고, 캐시가 만료된 순간에 다른 API의 응답 시간이 늘어나는지 브라우저 개발자도구 Network 탭에서 확인한다.

**주의**
- C:\Users\<user>\audit-bench\src\routes\matches.js:8-13 N+1 구조다. 경기 목록을 개수 제한 없이 전부 가져온 뒤, 경기마다 팀 조회를 2번 더 한다. C:\Users\<user>\audit-bench\src\db.js:6-16이 조회할 때마다 prepare(쿼리 준비)를 새로 해서 비용이 더 커진다. 경기가 1,000건이면 쿼리 준비와 실행이 2,001번 일어나고, 응답 크기도 계속 커진다.
  제안: teams 테이블을 JOIN해서 한 번에 조회하고, 페이지 단위로 나눈다(LIMIT/OFFSET 또는 played_at 기준 커서). matches(played_at)에 인덱스가 없다면 추가를 검토한다.
  측정 방법: 경기 수를 늘려 가며 `console.time`으로 응답 시간을 재고, `EXPLAIN QUERY PLAN SELECT ... FROM matches ORDER BY played_at DESC`로 전체 정렬이 일어나는지 본다.
- C:\Users\<user>\audit-bench\src\routes\replays.js:7-9, C:\Users\<user>\audit-bench\src\services\replay.js:9-15 리플레이 목록은 요청마다 폴더 전체를 동기로 읽고, 개수 제한도 없다. 다운로드는 파일 전체를 동기로 메모리에 올린 다음 보낸다. 리플레이 파일이 크거나 동시 다운로드가 많으면 서버가 멈추고 메모리가 급증한다.
  제안: 다운로드는 res.sendFile이나 스트림으로 바꾸고, 목록은 DB나 index.json에서 페이지 단위로 준다.
  측정 방법: 큰 .rpl 파일(예: 50MB)을 받는 동안 다른 API의 응답 시간을 Network 탭으로 비교하고, `process.memoryUsage()`로 메모리 변화를 본다.
- C:\Users\<user>\audit-bench\src\middleware\auth.js:5,12 비밀번호 확인에 scryptSync(동기)를 쓴다. 실측으로 1회 약 23ms가 걸렸고, 그동안 서버 전체가 멈춘다. 로그인 시도 횟수 제한도 없어서 로그인 요청이 몰리면 다른 API까지 함께 느려진다.
  제안: 비동기 crypto.scrypt를 쓰고, 로그인 시도 횟수 제한을 추가한다.
  측정 방법: 로그인 요청을 동시에 여러 개 보내면서 다른 API의 응답 시간을 잰다. 부하 도구 autocannon은 별도 설치가 필요하다(`npx autocannon`).
- C:\Users\<user>\audit-bench\src\routes\players.js:10-12 (+ C:\Users\<user>\audit-bench\src\utils\sql.js:5) 검색이 LIKE '%검색어%' 형태라서 인덱스가 있어도 쓸 수 없고, 매번 선수 표 전체를 훑는다. 게다가 검색어가 SQL 문장 안에 직접 들어가서 입력마다 다른 쿼리가 된다. 그래서 쿼리 준비 결과를 재사용할 수 없다(이 방식은 보안 문제이기도 하다. 아래 참고).
  제안: 값은 ? 자리표시자로 넘기고, 앞부분 일치 검색(LIKE 'q%')이나 SQLite FTS5(전문 검색 기능)를 검토한다. players(rating)에 인덱스가 없다면 추가를 검토한다.
  측정 방법: `EXPLAIN QUERY PLAN SELECT id, nickname, region, rating FROM players WHERE nickname LIKE '%a%' ORDER BY rating DESC LIMIT 20`에서 "SCAN players"가 나오는지 확인한다.

**참고**
- C:\Users\<user>\audit-bench\src\db.js:6-16 쿼리를 실행할 때마다 db.prepare를 새로 호출한다. 자주 쓰는 쿼리는 준비 결과를 Map에 저장해 재사용하면 좋다.
  측정 방법: 같은 쿼리를 1만 번 실행해 `console.time`으로 prepare를 매번 할 때와 재사용할 때를 비교한다.
- C:\Users\<user>\audit-bench\src\routes\matches.js:18-20, C:\Users\<user>\audit-bench\src\routes\teams.js:18-23 comments(match_id, created_at), team_members(team_id)에 인덱스가 없다면 댓글과 팀원이 늘수록 매번 전체를 훑는다. 스키마 파일이 없어서 실제로 인덱스가 있는지는 확인하지 못했다.
  측정 방법: 각 쿼리에 `EXPLAIN QUERY PLAN`을 실행해 "SCAN"이 나오는지(인덱스 없음), "SEARCH ... USING INDEX"가 나오는지(인덱스 있음) 본다.
- C:\Users\<user>\audit-bench\src\routes\teams.js:9-10 팀 검색도 LIKE '%q%'라서 팀 수에 비례해 표 전체를 훑는다. 지금은 LIMIT이 있어 응답 크기는 괜찮다.
  측정 방법: 위와 같이 EXPLAIN QUERY PLAN으로 확인한다.
- C:\Users\<user>\audit-bench\src\server.js:10-11 정적 파일에 브라우저 캐시 기간(maxAge)이 없고, 응답 압축(compression)도 없다. 리더보드처럼 큰 JSON 응답에서 차이가 난다.
  측정 방법: 브라우저 Lighthouse를 돌리거나 Network 탭에서 응답 크기와 캐시 여부(304, from cache)를 확인한다.
- C:\Users\<user>\audit-bench\public\app.js:23 댓글을 innerHTML로 통째로 다시 그린다. 지금은 50건 제한이 있어 성능 영향은 작다.
  측정 방법: 개발자도구 Performance 탭에서 렌더링 시간을 확인한다.
- 성능 범위 밖이지만 명백한 보안 문제가 여럿 보였다(설정 파일에 고정된 비밀값, 로그인 로그에 비밀번호 기록, SQL 문자열 조립, 리플레이 다운로드 경로 조작, 카드 HTML의 bio 미이스케이프, 인증 없는 관리자 삭제 API, 프로필 수정 시 본인 확인 없음). security 초점으로 따로 점검하기를 권장한다.

요약: 완료를 막을 심각 문제 2건

---

코드는 아무것도 고치지 않았어요. 승인해 주시면 위 순서대로 고칠게요. 비밀키는 저장소 기록과 `audit-bench.zip`에 이미 노출됐어요. 그래서 코드를 고치는 것과 별개로, 키를 새로 발급하는 일은 직접 하셔야 해요.
