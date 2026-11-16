# baton 실사용성 리서치 (2026-11-15)

> 질문은 세 가지다. ① 엔지니어들이 LLM 코딩 도구를 두 개 이상 번갈아 쓰는가 ② 쓴다면 어떻게 관리하는가 ③ baton의 대상을 엔지니어로 둘지, 20달러 플랜을 쓰는 입문 사용자로 둘지.
> 결론: **20달러 플랜 두 개를 쓰는 비개발자·입문 사용자에 집중한다.** 다만 근거의 절반은 원문을 확인하지 못했고, 처음 세운 "끊긴 뒤 복구는 baton만 한다"는 가정은 틀렸다(3절).

## 확인 수준

| 표시 | 뜻 |
| --- | --- |
| 확인 | 2026-11-15에 원문 페이지를 직접 읽음 |
| 미확인 | 검색 결과 요약으로만 봄. 원문 사이트는 이 세션의 네트워크 정책으로 열리지 않음 |

미확인 수치는 결정 근거로 쓰기 전에 원문을 다시 봐야 한다.

## 1. 두 개 이상 번갈아 쓰는가

쓴다. 다만 가장 강한 숫자는 미확인이다.

| 근거 | 내용 | 수준 |
| --- | --- | --- |
| [Stack Overflow 2026 설문](https://survey.stackoverflow.co/2026/ai/data) | 쓰는 AI 도구 수: 1개 19.7%, 2개 34.4%, 3~5개 40.5%, 6~10개 3.8%. 모수가 전체 응답자인지 AI 사용자인지 불명 | 미확인 |
| 같은 설문 | 에이전트 사용자 중 Claude Code 65.5%, GitHub Copilot 58.7%, Codex 29.5% | 미확인 |
| [Sonar State of Code 2026](https://www.sonarsource.com/state-of-code-developer-survey-report.pdf) | 개발팀 평균 AI 도구 4개 | 미확인 |
| 한도 때문에 Codex로 넘어간다는 글 여러 편 ([예](https://note.com/igs_ai/n/n44f02b179551?hl=en), [예](https://docs.bswen.com/blog/2026-10-19-claude-code-codex-together/)) | 두 도구는 한도와 초기화 시각이 따로라서 한쪽이 막히면 다른 쪽으로 간다 | 미확인. 개인 블로그·벤더 글 |

주의: "도구 여러 개"에는 채팅 앱과 자동완성이 섞여 있다. "CLI 에이전트 두 개를 한 작업에서 이어 쓴다"는 baton의 상황만 따로 센 숫자는 찾지 못했다.

## 2. 엔지니어는 어떻게 관리하는가

가벼운 관례 몇 개로 해결한다. 전용 인계 도구를 쓰는 사람은 적어 보인다. 모두 실무자 글 기준이고 미확인이다.

| 문제 | 흔한 방법 | baton의 대응 |
| --- | --- | --- |
| 규칙을 두 도구에 똑같이 주기 | `AGENTS.md` 하나에 쓰고 `CLAUDE.md`는 `@AGENTS.md` 한 줄. 두 파일에 복사하면 어긋난다는 경고 | 블록 방식(`<!-- baton:start -->`)으로 같은 문제를 푼다 |
| 누가 무엇을 하나 | 한쪽이 계획, 다른 쪽이 구현. 작성한 모델과 다른 모델이 새 세션에서 리뷰(가장 흔함) | 없음. baton은 "같은 일을 이어받기"이고 역할 분담이 아니다 |
| 한도 확인 | `/usage`, `/status`, 두 한도를 함께 보는 추적 도구 | 한도를 미리 보지 않는다. 끊긴 뒤에만 반응 |
| 인계 | `HANDOFF.md` 한 장을 쓰는 소형 스킬(3절) | `tasks/ACTIVE.md` + Git Wins |
| 한도 자체 | 많이 쓰는 사람은 100~200달러 요금제로 올린다 | 해당 없음 |

읽는 법: 엔지니어의 "두 모델 쓰기"는 주로 **교차 리뷰와 역할 분담**이다. 한도 때문에 이어받는 것은 그들에게 부차적이고, 돈으로 풀 수 있다.

## 3. 비슷한 도구

모두 2026-11-15에 저장소 첫 화면을 읽었다(확인). 마지막 커밋 날짜는 페이지에 없어 적지 않았다.

| 레포 | 별 | 대상 도구 | 인계 방식 | 한도로 끊긴 뒤 복구 |
| --- | --- | --- | --- | --- |
| [haydenschmitty/floorplan](https://github.com/haydenschmitty/floorplan) | 4.4k | Claude Code, Codex | 인계 도구 아님. 코드베이스를 쉬운 말 지도로 그림 | 해당 없음 |
| [pchalasani/claude-code-tools](https://github.com/pchalasani/claude-code-tools) | 2.0k | Claude Code, Codex 등 | 세션 복구·Claude↔Codex 세션 옮기기 카드가 있음(세부 문서는 못 읽음) | 가능해 보이나 미확인 |
| [yuzushi-dev/session-handoff](https://github.com/yuzushi-dev/session-handoff) | 67 | Claude Code, Codex | `/session-handoff` 수동 + 인계 뒤 새 세션 자동 열기 | 페이지에 없음(압축 전 체크포인트만) |
| [Vasilispapg/claude-handoff](https://github.com/Vasilispapg/claude-handoff) | 1 | Claude Code 기록 → 아무 모델 | 사후에 `chf` 명령. 훅 선택 | **됨.** "A session crashed, hit the usage limit, or you closed the terminal" |
| [Kayvan-Zahiri/claude-code-handoff](https://github.com/Kayvan-Zahiri/claude-code-handoff) | 0 | Claude Code → Codex·Cursor | 떠나기 전 `/handoff` | **안 됨.** "can't run after a usage limit has stopped the session" |
| [YourAKShaw/handoff](https://github.com/YourAKShaw/handoff) | 0 | 마크다운을 읽는 모든 에이전트 | 세션 끝에 `/handoff` | 페이지에 없음 |
| [realraelrr/handoff-skill](https://github.com/realraelrr/handoff-skill) | 0 | Codex, Claude Code | 스킬 | 페이지에 없음 |

여기서 읽히는 것:

- **인계 스킬은 많지만 아무도 안 쓴다.** 전용 인계 레포 다섯 개의 별이 0, 0, 0, 1, 67이다. 엔지니어에게 인계는 직접 한 장 쓰면 되는 일이다.
- **"끊긴 뒤 복구"는 baton만의 것이 아니다.** claude-handoff가 같은 방법(저장된 JSONL에서 사후 생성)을 쓰고, claude-code-tools도 비슷한 기능이 있어 보인다. baton의 차이는 세션 시작 때 **스스로 알아채 알려 준다**는 것과 Codex 기록도 읽는다는 것이다(`baton/files/scripts/baton/status.mjs`, `sessions.mjs`). claude-handoff는 사용자가 명령을 알고 실행해야 한다.
- **Floorplan이 보여 주는 것은 기능이 아니라 대상이다.** 문구가 "People who build with AI and don't read the code"이고, 설치는 플러그인 마켓 명령 두 줄 또는 Codex 앱 화면에서 클릭이다. 터미널이 필요 없는 경로가 있다. 같은 두 도구를 쓰는 같은 사람들에게서 4.4k를 받았다.

## 4. 입문 사용자 쪽 신호

- **[claude-code 이슈 13171](https://github.com/anthropics/claude-code/issues/13171)** (확인): 비개발자가 "For users who don't write code themselves, contextual memory IS the primary tool."이라고 썼다. 예고 없는 맥락 유실을 문제 삼았다. 다만 사람 댓글 2개뿐이고 "not planned"로 자동 종료됐다. 불편이 실재한다는 사례이지 수요가 크다는 증거는 아니다.
- **20달러 두 개 조합** (미확인): Claude Pro + ChatGPT Plus가 가벼운~중간 사용에는 Max의 대안이 된다는 비교 글이 여럿 있다. 매일 많이 쓰면 100달러 요금제가 필요하다는 결론도 같이 나온다.
- **baton은 이미 이 사람을 전제로 쓰여 있다**: "The user is not a developer: short, plain words" (`baton/files/AGENTS.md:19`), 절차를 외우지 않게 한다(`baton/files/AGENTS.md:6`).

## 5. 권고

**20달러 플랜 두 개를 쓰는 비개발자·입문 사용자에 집중한다.**

- 엔지니어는 인계를 문제로 느끼지 않는다. 한 장짜리 메모로 풀고, 한도는 요금제로 푼다. baton의 절차(S/M/L, 작업 브랜치, 검증 서브에이전트)는 그들에게 무겁다.
- 입문 사용자는 코드를 읽어 상태를 복원하지 못한다. 그래서 baton이 대신 해 주는 것들의 값이 크다.
  - 끊긴 세션을 스스로 알아채고 초안을 만든다.
  - 기록과 실제 코드가 어긋나면 알려 준다(Git Wins).
  - 위험한 행동 전에 멈추고 묻는다.
  - 쉬운 말로 답한다.
- 엔지니어 대상 근거(블록 방식, 보존 확인, Git Wins)는 설계 결정의 근거로 남긴다.

## 6. 이 결론의 위험

- **설치 장벽이 가장 크다.** baton은 폴더를 복사하고 에이전트에게 설치 문서를 읽힌다. Floorplan은 명령 두 줄이다. 입문 사용자를 대상으로 하면 이 차이가 먼저 걸린다. 플러그인 배포는 `2026-11-references.md`에서 이미 "검토"로 둔 항목이다.
- **한도 정책이 바뀐다.** 2026년 12월부터 ChatGPT와 Codex 한도가 합쳐진다는 보도가 있다(미확인, OpenAI 공지 못 찾음). 사실이면 Codex 쪽 여유가 줄어 "20달러 두 개"의 전제가 약해진다.
- **입문 사용자는 Git을 모른다.** baton은 브랜치와 커밋 위에 서 있다. 지금은 에이전트가 대신 하지만, 꼬였을 때 사용자가 풀 수 없다.
- **실사용자가 한 명이다**(`docs/research/2026-11-references.md:178`). 이 문서의 권고도 남의 글에서 추론한 것이지 사용자를 만나 확인한 것이 아니다.
- **한국어 전용이다.** 대상이 한국어 사용자로 좁혀진다. 장점일 수도 있다(경쟁 도구는 전부 영어).

## 7. 다음에 검증할 것

기능 동결은 유지한다. 아래는 결정 전에 확인할 것이지 만들 것이 아니다.

1. 미확인 수치의 원문 확인: Stack Overflow 설문의 모수, 12월 한도 통합의 OpenAI 공지.
2. claude-code-tools의 세션 복구·옮기기 문서 읽기. baton rescue와 실제로 얼마나 겹치는지.
3. 작성자 말고 한 명에게 설치부터 "이어서 하자"까지 시켜 보기. 어디서 막히는지가 이 문서의 어떤 숫자보다 강한 근거다.
4. 플러그인 배포로 바꿀 때 드는 일의 크기 가늠(Floorplan의 마켓 구성 참고).

## 출처

- https://github.com/haydenschmitty/floorplan
- https://github.com/pchalasani/claude-code-tools
- https://github.com/yuzushi-dev/session-handoff
- https://github.com/Vasilispapg/claude-handoff
- https://github.com/Kayvan-Zahiri/claude-code-handoff
- https://github.com/YourAKShaw/handoff
- https://github.com/realraelrr/handoff-skill
- https://github.com/anthropics/claude-code/issues/13171
- https://survey.stackoverflow.co/2026/ai/data (접속 불가)
- https://www.sonarsource.com/state-of-code-developer-survey-report.pdf (읽지 않음)
- https://tech.yahoo.com/ai/chatgpt/articles/compared-codex-claude-codes-usage-081500305.html (접속 불가)
- https://www.morphllm.com/comparisons/claude-code-vs-codex (접속 불가)
- https://note.com/igs_ai/n/n44f02b179551?hl=en (검색 요약만)
- https://docs.bswen.com/blog/2026-10-19-claude-code-codex-together/ (검색 요약만)
- https://codex.danielvaughan.com/2026/03/28/cross-model-adversarial-review/ (검색 요약만)
- https://webafterai.substack.com/p/claude-code-finally-reads-agentsmd (검색 요약만)
