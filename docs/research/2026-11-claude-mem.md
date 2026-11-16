# claude-mem 비교 읽기 (2026-11-05)

> [참고 자료 조사](2026-11-references.md) 표에서 "제외"로 둔 claude-mem을, 이번엔 코드까지 읽고 다시 확인한 상세판이다. 결론은 같다. 구조는 가져오지 않고, 작은 요령 몇 개만 후보로 남긴다(아직 채택 안 함).

## 참고한 레포
- **레포:** https://github.com/thedotmack/claude-mem (main 브랜치, 2026-11-05 확인, Apache-2.0)
- **읽은 파일 (레포 기준 경로):**
  - [README.md](https://github.com/thedotmack/claude-mem/blob/main/README.md), [package.json](https://github.com/thedotmack/claude-mem/blob/main/package.json)
  - [plugin/hooks/hooks.json](https://github.com/thedotmack/claude-mem/blob/main/plugin/hooks/hooks.json): 훅 목록
  - [src/sdk/prompts.ts](https://github.com/thedotmack/claude-mem/blob/main/src/sdk/prompts.ts): 관찰·요약을 만드는 AI 지시문
  - [src/services/context/ContextBuilder.ts](https://github.com/thedotmack/claude-mem/blob/main/src/services/context/ContextBuilder.ts), [src/shared/SettingsDefaultsManager.ts](https://github.com/thedotmack/claude-mem/blob/main/src/shared/SettingsDefaultsManager.ts): 세션 시작 때 넣는 내용과 기본값
  - [src/cli/handlers/file-context.ts](https://github.com/thedotmack/claude-mem/blob/main/src/cli/handlers/file-context.ts): 파일을 읽기 전에 그 파일의 지난 기록을 넣는 부분
  - [src/utils/tag-stripping.ts](https://github.com/thedotmack/claude-mem/blob/main/src/utils/tag-stripping.ts), [src/utils/redaction.ts](https://github.com/thedotmack/claude-mem/blob/main/src/utils/redaction.ts): `<private>` 태그와 비밀값 가리기
  - [docs/remote-worker-capture.md](https://github.com/thedotmack/claude-mem/blob/main/docs/remote-worker-capture.md): 원격 서버 모드
  - [docs/ip-boundary.md](https://github.com/thedotmack/claude-mem/blob/main/docs/ip-boundary.md): 공개 범위
- **못 읽은 곳:** 공식 문서 docs.claude-mem.ai(이 세션의 네트워크 정책으로 차단). 아래 "확인 못 함"은 추측하지 않았다.

## 1. 무엇이 있나
- **형태:** Claude Code 플러그인이다. `npx claude-mem install`로 설치하고 브라우저 로그인을 거친다. Codex·Cursor·Gemini 등 다른 도구용 플러그인 폴더도 있다.
- **훅 (hooks.json):**

  | 이벤트 | 하는 일 |
  | --- | --- |
  | SessionStart | 상주 프로그램(worker) 실행 + 지난 기록 넣기(시작·/clear·compact 때) |
  | UserPromptSubmit | 세션 초기화 |
  | PreToolUse (Read 등) | 그 파일의 지난 관찰을 함께 넣음. 32KB 넘는 파일을 통째로 읽으려 하면 막고 개요 도구를 쓰게 함(기본 켜짐) |
  | PostToolUse / PostToolUseFailure (모든 도구) | 도구 입력·결과를 worker로 보냄 → AI가 관찰 1건으로 압축 |
  | Stop | 세션 요약 |
  | SubagentStop, SessionEnd | 마무리 |

- **관찰 1건의 칸:** 유형(bugfix·feature·decision·discovery·refactor·change 등), 제목, 부제, 사실 목록, 설명, 개념, 읽은 파일, 고친 파일. 도구 입력·결과는 칸마다 1만6천 자에서 자른다. 별것 없으면 AI가 "noise"로 건너뛸 수 있다.
- **세션 요약의 칸:** 요청, 조사한 것, 알게 된 것, 끝낸 것, 다음 할 일, 메모. 남길 게 없으면 `skip_summary reason="nothing durable"`로 건너뛴다.
- **저장:** 자기 컴퓨터의 `~/.claude-mem`. SQLite에 세션·관찰·요약을 저장한다. 의미 검색용 Chroma도 쓴다(설치는 uv로 하는 것으로 보이나 확인 못 함).
- **세션 시작 때 넣는 것:** 기본으로 관찰 50건, 세션 10개, 마지막 요약을 넣는다. 예산에 맞게 자른다. 코드 주석에 "훅이 넘길 수 있는 건 1만 글자까지(이슈 #3802)"라고 적혀 있다.
  - Claude와 Codex 기록을 섞어 넣는 설정(`CLAUDE_MEM_SESSION_START_INCLUDE_ALL_SOURCES`)은 **기본이 꺼짐**이다.
- **3단계 검색 (MCP):** 목록 `search`(건당 약 50~100토큰) → 앞뒤 흐름 `timeline` → 상세 `get_observations`(건당 약 500~1000토큰). README는 이걸로 토큰을 약 10배 아낀다고 주장한다(확인 안 함).
- **개인정보:**
  - `<private>…</private>`로 감싼 내용은 저장하지 않는다.
  - 비밀값 가리기(약 30개 패턴)는 **기본이 꺼짐**이다(`CLAUDE_MEM_REDACT_ENABLED=false`).
  - 로그인하면 기본 요약 담당이 그들의 서버(관찰자)다. 무료 체험 30일 뒤에는 내 Anthropic 요금제나 내 키(OpenRouter·Gemini)로 바꿀 수 있다.
- **설치에 필요한 것:** Node, Bun, uv. 웹 화면(`/viewer`)도 있다.
- **라이선스·공개 범위:** Apache-2.0이다. 팀 동기화·관리 기능은 공개 레포 밖의 유료 영역이다(open-core). README에는 관련 코인 홍보 문단도 있다.

## 2. 같은 불편을 어떻게 해석했나

| 불편 | claude-mem | baton |
| --- | --- | --- |
| 새 세션이 앞 일을 모름 | 사람 손 없이 전부 자동으로 모으고 AI가 요약 | 에이전트가 정해진 순간에 인계 문서(ACTIVE.md)를 쓰고, 문서와 코드가 다르면 Git이 맞다(Git Wins) |
| 한도로 갑자기 끊김 | 원래 매 동작을 모으니 따로 대비 없음 | 평소엔 안 모으고, 끊긴 뒤 다음 실행 때 이미 있는 세션 기록으로 초안(rescue) |
| Claude↔Codex 전환 | 플러그인은 따로 있지만 기록을 섞는 건 기본 꺼짐 | 핵심 목적. 같은 파일을 둘 다 읽음 |
| 다른 컴퓨터 | 클라우드 동기화(선택·유료 영역)나 원격 서버 | Git push |
| 토큰이 부족함 | 도구 호출마다 AI 요약이 1번씩 붙음 | 추가 AI 호출 없음. 고정 규칙만 들어감 |
| 비밀값 | 가리기 기본 꺼짐, 기본 요약 담당이 외부 서버 | 가리기 항상 켜짐, 밖으로 안 보냄 |

정리하면 이렇다.
- **claude-mem:** "기억은 모든 걸 모아서 AI가 정리하는 것"이다. 손은 안 가지만 토큰과 개인정보가 계속 든다.
- **baton:** "기억은 사람이 확인할 수 있는 계약서"다. 손은 조금 가지만 추가 비용이 없고, 어떤 도구·컴퓨터로든 들고 간다.
- **판단:** 20달러 요금제 여러 개로 토큰을 아끼려는 사용자에게는 baton 쪽이 맞다.

## 3. baton 쪽 설명
### ACTIVE.md를 쓰는 다섯 순간 (작은 작업 S는 이 문서를 안 만듦)
1. **시작(M/L):** 요청 원문, 목표, 완료 기준을 쓴다.
2. **의미 있는 단계를 끝낼 때마다:** 지금 상태와 다음 할 일을 1~2줄로 고친다(micro update). 관련 코드와 함께 커밋한다.
3. **방법을 포기할 때:** 실패한 시도에 "해 본 것 → 버린 이유"를 한 줄 쓴다.
4. **"넘길게":** 짧게 정리하고 `wip(<id>): checkpoint before handoff` 커밋 하나로 남긴다.
5. **"끝":** 오래 남길 결정만 STATUS.md로 옮기고, 문서는 보관함(archive)으로 옮긴다.

### Git이 최종 판단하는 것 (Git Wins)
문서와 실제 코드가 다르면 코드가 맞다. 세션 시작 때 `status.mjs`가 아래 네 가지 중 하나라도 걸리면 `! Git Wins`를 띄운다. 그러면 에이전트가 `git log`/`git diff`를 먼저 읽고 문서를 고친다.
- ACTIVE.md의 브랜치와 지금 브랜치가 다름
- ACTIVE.md가 한 번도 커밋되지 않음
- ACTIVE.md를 마지막으로 고친 뒤 코드 커밋이 더 있음
- 커밋 안 된 변경이 있음

### 토큰이 드는 곳
- **Git 판단:** AI가 아니라 프로그램이 한다. AI에게는 결과 몇 줄만 넘어간다.
- **문서 고치기:** 쓰는 글은 1~2줄이다. 하지만 고칠 때마다 도구 호출이 1번 늘고, 그때마다 대화 전체가 다시 들어간다(대부분 캐시). 비용은 줄 수가 아니라 고친 횟수에 비례한다. **실측 안 함.** 토큰 점검 때 볼 항목이다.
- **이어받기:** STATUS.md와 ACTIVE.md를 한 번 읽는다. 보통 몇 천 토큰이다.

### rescue (비상 인계)
- 끊긴 순간에는 아무것도 안 한다. 한도에 걸린 AI는 움직일 수 없다.
- **다음 세션 시작 때(어느 도구든):**
  1. `status.mjs`가 지난 세션 기록을 보고 `! 비상 인계` 한 줄을 띄운다.
  2. 에이전트가 `rescue.mjs`를 실행한다. 이 프로그램이 첫·마지막 요청, 마지막 답변, 고친 파일, 커밋 안 된 변경을 1.5KB 이하로 보여 준다. 비밀값은 가린다.
  3. AI가 그걸 읽고(약 1~2천 토큰) ACTIVE.md를 채운 뒤 사용자에게 확인받는다.
- **"평소엔 안 모은다":** 세션 기록은 Claude Code·Codex가 원래 저장한다(`~/.claude/projects`, `~/.codex/sessions`). baton은 일하는 도중 기록 단계를 하나도 붙이지 않는다. 평소 추가 비용은 0이다.
- **한계:** 세션 기록은 그 컴퓨터에만 있다. 다른 컴퓨터에서는 rescue가 지난 대화를 못 보고 Git 상태만 쓴다.

## 4. 가져올 후보 (아직 채택 안 함)
| 후보 | 내용 | 메모 |
| --- | --- | --- |
| 훅 출력 1만 자 한도 | status.mjs 출력이 한도를 넘지 않는지 시험 추가 | Codex에도 같은 한도가 있는지 확인 필요 |
| 남길 게 없으면 건너뛰기 | HANDOFF 때 바뀐 게 없으면 빈 칸을 억지로 채우지 않기 | 규칙 한 줄 |
| "알게 된 것" 칸 | 조사해서 알게 된 사실 칸(실패한 시도와 별도) | 반대로 그쪽엔 "실패한 시도"가 없음. baton이 나은 점 |
| 비밀값 패턴 보강 | hf_, glpat-, npm 토큰, SendGrid, Slack·Discord 웹훅, URL 속 아이디·비밀번호, Bearer | `secrets.mjs`에 추가 + 시험 |
| `<private>` 태그 | 사용자가 감싼 말은 rescue 초안에서 가림 | `sessions.mjs`의 cleanPrompt에 한 줄 |
| 큰 파일 통째 읽기 막기 | 32KB 넘는 파일은 개요 먼저 | 토큰 점검 때 같이 검토. 도구를 막는 훅이라 성가실 수 있음 |
| 점진적 공개 | 목록 먼저, 자세한 건 필요할 때 | baton도 이미 이 방식. 설계 근거로 쓸 만함 |

**가져오지 않을 것:** 매 동작 AI 요약, 상주 프로그램과 벡터 DB, 클라우드 동기화. 토큰을 쓰고, 설치가 복잡해지고, 데이터가 밖으로 나간다.

## 5. 확인 못 함
- 관찰 유형 전체 목록(모드 설정 파일을 못 읽음)
- 세션 시작 때 넣는 글자 수 상한의 정확한 값(`CONTEXT_OUTPUT_LIMIT`)
- 관찰·요약 한 번에 드는 토큰, 관찰자 기본 모델
- README의 "약 10배 절약" 주장
