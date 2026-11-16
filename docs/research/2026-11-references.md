> 2026-11-04 백그라운드 조사 에이전트가 작성. 별 수는 그날 각 레포 페이지 기준, "(2차 자료)"는 원문을 못 열고 검색 요약으로 확인한 내용. 반영 결과는 맨 아래 "반영 기록".

# 참고 자료 조사: baton / audit (2026-11-04)

조사 방법: GitHub 저장소 페이지와 README를 직접 열어 확인했다. 공식 문서는 code.claude.com과 openai/codex 저장소를 읽었다.
조사 한계:
- 이 세션에서는 GitHub API를 쓸 수 없었다. 그래서 별 수는 2026-11-04 기준 저장소 페이지에 표시된 값이다.
- 대부분 페이지에 최근 커밋 날짜가 보이지 않았다. 그래서 "활동"은 커밋 수 같은 간접 정보로만 적었다.
- 아래 사이트는 네트워크 정책 때문에 열리지 않았다: developers.openai.com, agents.md, docs.cline.bot, pchalasani.github.io, kiro.dev. 이 사이트의 내용은 검색 결과 요약이나 2차 자료로만 확인했다. 해당 항목에는 "(2차 자료)"라고 표시했다.

---

## 1. 한 줄 요약

큰 도구들은 대부분 "더 많은 기능"(DB, 많은 훅, 클라우드 메모리) 쪽으로 간다. 우리에게 쓸모 있는 것은 작은 것들이다. **CLAUDE.md의 `@AGENTS.md` import, Codex의 SessionStart 훅, Codex의 32KiB 잘림 검사, Juice Shop 정답 주석을 이용한 audit 외부 채점, verifier 3단계 판정**이 바로 붙일 만한 개선이다.

---

## 2. 비교 표

판단 기준: 채택 = 지금 작게 붙인다 / 검토 = 나중에 본다 / 제외 = 우리 원칙과 맞지 않는다.

| 저장소 | 분야 | 별 · 활동 | 핵심 아이디어 | 판단 |
|---|---|---|---|---|
| [steveyegge/beads](https://github.com/steveyegge/beads) | A | 28.5k · 커밋 1.1만+ · MIT | 작업을 의존성 그래프로 관리한다(Dolt DB). `bd ready`는 막힌 것 없는 작업을 보여 주고, `--claim`은 작업을 원자적으로 가져온다. `bd prime`은 세션 시작 때 맥락을 넣는다. 오래된 작업은 요약해서 줄인다. `bd setup codex`는 Codex용 훅도 설치한다. | 검토. 아이디어는 좋다. 하지만 DB와 CLI가 새로 생기면 "단일 에이전트 + 문서" 원칙보다 무겁다. |
| [eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master) | A | 28.3k · 커밋 1.2k · MIT + Commons Clause | PRD로 작업 목록을 만든다. MCP 도구 수를 core 7개, standard 15개, all 36개 단계로 줄여 컨텍스트를 아낀다. | 제외. MCP와 외부 API 키가 필요하다. 라이선스에도 상업적 제약이 있다. |
| Cline Memory Bank ([cline/cline](https://github.com/cline/cline)) | A | cline 71.3k · Apache-2.0 | `memory-bank/` 폴더에 projectbrief, activeContext, progress 같은 파일을 둔다. activeContext는 로그가 아니라 "현재 상태"만 담으라고 권한다. (문서는 2차 자료) | 제외. 우리 ACTIVE.md/STATUS.md가 이미 같은 역할을 더 엄격하게 한다. "현재 상태만 유지" 원칙만 참고한다. |
| [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) | A | 112.4k · Apache-2.0 | 훅 6개로 도구 사용을 기록하고 SQLite와 벡터 DB에 저장한다. 다음 세션에 자동으로 주입한다. `<private>` 태그로 저장을 막을 수 있다. | 제외. 훅이 많고 자동 기록이다. "훅은 적게", "측정 없이 채택 안 함"과 맞지 않는다. 상세: [2026-11-claude-mem.md](2026-11-claude-mem.md) (11-05 코드까지 읽고 재확인) |
| [pchalasani/claude-code-tools](https://github.com/pchalasani/claude-code-tools) | A | 2.0k · MIT | `aichat`으로 Claude와 Codex 세션을 함께 검색한다. rollover는 새 세션을 열면서 이전 세션과 연결(lineage)한다. Claude와 Codex 사이에 세션을 옮기는 기능도 있다. (세부 문서는 2차 자료) | 검토. 한도에 걸려 HANDOFF를 못 쓰고 끊겼을 때 비상용 초안을 만드는 데 참고할 만하다. |
| [huggingface/funes](https://github.com/huggingface/funes) | A | 585 · Apache-2.0 | Claude와 Codex 기록을 하나의 로컬 색인으로 모은다. HF dataset으로 기기 간 동기화한다. 공개 전에 비밀값을 검사한다. | 제외. 임베딩 모델, 외부 저장소, 매 턴 훅이 필요하다. |
| [SuperClaude-Org/SuperClaude_Framework](https://github.com/SuperClaude-Org/SuperClaude_Framework) | A, C | 23.9k · MIT · v4.3.0 | pipx로 설치하고 명령 30개를 제공한다. `/save`와 `/load`로 세션 상태를 저장한다. | 제외. 범위가 넓다. 사용자의 CLAUDE.md를 어떻게 보존하는지 README에 설명이 없다. |
| [agentsmd/agents.md](https://github.com/agentsmd/agents.md) | B | 25.3k · MIT | AGENTS.md를 "에이전트를 위한 README"로 표준화한다. | 이미 반영됨. 우리는 AGENTS.md를 기준 파일로 쓰고 있다. |
| Codex AGENTS.md 규칙 (공식, [openai/codex docs](https://github.com/openai/codex/blob/main/docs/agents_md.md)) | B | 공식 문서 | 전역 `~/.codex/AGENTS.override.md`를 먼저, 없으면 `AGENTS.md`를 본다. 그다음 루트부터 현재 폴더까지 폴더마다 최대 1개를 본다(override → AGENTS.md → fallback 이름 순서). 합친 크기가 `project_doc_max_bytes`(기본 32KiB)를 넘으면 경고 없이 잘린다. (상세는 2차 자료) | 채택(Top5 #2). 잘림 검사를 doctor에 넣는다. |
| Claude Code memory (공식, [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)) | B | 공식 문서 | CLAUDE.md에서 `@path`로 다른 파일을 불러온다(최대 4단계). v2.1.277부터는 AGENTS.md를 직접 읽는다. 단, CLAUDE.md가 있으면 기본 설정에서는 AGENTS.md를 읽지 않는다. `@AGENTS.md`로 불러오면 두 번 읽히지 않는다. HTML 블록 주석은 컨텍스트에 넣기 전에 지운다. `/doctor prompt-audit`로 서로 충돌하는 지시를 찾는다. | 채택(Top5 #1). |
| [intellectronica/ruler](https://github.com/intellectronica/ruler) | B | 3.0k · MIT | `.ruler/`를 원본으로 두고 30여 개 도구의 파일을 생성한다. 원래 있던 파일은 `.bak`로 백업하고 `ruler revert`로 되돌린다. `.gitignore`도 START/END 블록으로 관리한다. | 제외. 생성 방식이라 결과 파일을 덮어쓴다. 우리 블록 방식이 사용자 내용 보존에 더 안전하다. revert 아이디어만 참고한다. |
| [dyoshikawa/rulesync](https://github.com/dyoshikawa/rulesync) | B | 1.6k · MIT | `.rulesync/`를 원본으로 rules, commands, subagents, skills, hooks, MCP를 도구별로 생성한다. `import`와 `convert`로 기존 설정을 가져온다. | 제외. 도구가 두 개뿐이라 이득이 작다. 오히려 층이 하나 더 생긴다. |
| [agent-sh/agnix](https://github.com/agent-sh/agnix) | B | 467 · MIT 또는 Apache-2.0 | CLAUDE.md, AGENTS.md, SKILL.md, 훅 설정을 검사하는 린터다. Codex `.codex/hooks.json`도 검사한다. GitHub Action으로 CI에서 돌릴 수 있다. | 검토. doctor의 선택 검사로 쓸 수 있다. 규칙이 많아서 잡음이 생길 수 있다. |
| [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | C | 57.2k · 라이선스는 페이지에서 확인 못 함 | 엄선한 목록이다. 이 목록에서 claude-code-tools, agnix, trailofbits/skills, Safety Net을 찾았다. | 참고용. |
| [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | C | 46.1k · Apache-2.0 · 커밋 4.6k+ | 공식 마켓플레이스다. 플러그인 이름은 바꾸지 않는다. 이름을 바꿔야 하면 `renames` 맵으로 기존 설치를 옮긴다. `source.sha`로 버전을 고정한다. | 검토(큰 아이디어 1). |
| Claude Code 플러그인 마켓플레이스 (공식, [host-marketplace](https://code.claude.com/docs/en/plugins/host-marketplace.md)) | C | 공식 문서 | `version`을 올려야 업데이트가 간다. `version`을 빼면 커밋을 따라간다. 자동 업데이트는 기본으로 꺼져 있다. `--scope project`로 저장소의 `.claude/settings.json`에 등록할 수 있다. `forceRemoveDeletedPlugins` 설정이 있다. | 검토. audit 배포 방식으로 유력하다. |
| [davila7/claude-code-templates](https://github.com/davila7/claude-code-templates) | C | 33.1k · MIT | `npx`로 부품을 골라 설치한다. `--health-check`로 진단한다. 로컬 분석 대시보드가 있다. | 제외. 한 번 설치하고 끝나는 방식이다. 이미 설치한 프로젝트를 갱신하는 방법이 README에 없다. |
| [wshobson/agents](https://github.com/wshobson/agents) | C | 42.2k · MIT | 플러그인 94개를 잘게 나눠 필요한 것만 설치하게 한다. Codex용 사본은 8KB 예산에 맞춰 큰 스킬을 나눈다. | 검토. "Codex에는 크기 예산이 있다"는 점만 참고한다. |
| [obra/superpowers](https://github.com/obra/superpowers) | C, D | 페이지 표시 약 312k · MIT | 스킬 기반 흐름이다(브레인스토밍 → 계획 → 실행). 완료 전에 증거를 요구한다(verification-before-completion). Claude와 Codex 공식 마켓플레이스에 모두 배포한다. | 채택(Top5 #5에 "증거 필수"만 반영). |
| [trailofbits/skills](https://github.com/trailofbits/skills) | C, E | 8.0k · CC-BY-SA-4.0 | 보안 감사 스킬 모음이다. `fp-check`는 오탐을 검증하는 관문이다. `insecure-defaults`는 후보 파일마다 반박하는 검증자를 붙인다. 하나의 `.claude-plugin/marketplace.json`을 Claude와 Codex가 함께 쓴다. | 검토. "반박 검증자" 패턴이 audit 오탐을 낮추는 데 참고가 된다. CC-BY-SA라서 내용을 복사하면 같은 라이선스가 따라온다. |
| [github/spec-kit](https://github.com/github/spec-kit) | D | 146.9k · MIT | constitution → specify → plan → tasks → implement → converge 순서다. "Converged"가 나올 때까지 반복한다. 버그 수정 확장의 최종 판정은 `verified`, `partial`, `failed` 셋 중 하나다. `verified`만 성공이다. | 채택(Top5 #5의 3단계 판정). 전체 흐름은 제외한다. |
| [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | D | 55.0k · MIT | 역할별 에이전트(제품, 설계, 개발, 테스트)가 결정을 다음 단계로 넘긴다. v7은 알파이고 큰 변경이 잦다. | 제외. 다중 역할 구조라 "단일 에이전트" 원칙과 맞지 않는다. |
| [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) | D | 73.9k · MIT | 변경마다 `openspec/changes/<id>/`에 proposal, design, tasks, 스펙 변경분을 둔다. 끝나면 archive로 옮긴다. `openspec update`는 지침을 다시 만든다. 다른 저장소의 사례를 보면 AGENTS.md에 `<!-- OPENSPEC:START -->` 블록을 쓴다. 블록은 짧고 상세 파일을 가리키기만 한다. | 검토. 우리 baton 블록과 거의 같은 패턴이다. 우리가 맞는 길이라는 근거가 된다. |
| [buildermethods/agent-os](https://github.com/buildermethods/agent-os) | D | 5.6k · MIT | 코드베이스에서 표준을 찾아 필요한 것만 넣는다. 전역 프로필과 프로젝트 표준을 나눈다. | 제외. 핸드오프나 검증과 직접 관련이 적다. |
| Kiro specs | D | 확인 못 함 (kiro.dev 접속 불가) | requirements, design, tasks 3단 스펙으로 알려져 있다. | 판단 보류. 확인하지 못했다. |
| [anthropics/claude-code-security-review](https://github.com/anthropics/claude-code-security-review) | E | 6.7k · MIT | 찾은 뒤 오탐을 거르는 단계를 따로 둔다. 기본 제외 목록은 DoS, rate limit, 자원 고갈, 영향이 입증되지 않은 입력 검증, open redirect다. 사용자가 거르기 지침 파일을 추가할 수 있다. `evals/`는 PR에 돌려 보는 도구일 뿐 정답지는 없다. | 검토. 제외 목록을 명시하는 방식이 참고가 된다. 평가 방식은 우리가 더 엄격하다. |
| [juice-shop/juice-shop](https://github.com/juice-shop/juice-shop) | E | 14.4k · MIT | 소스에 `// vuln-code-snippet vuln-line <챌린지>` 주석으로 취약한 줄이 표시돼 있다. `data/static/codefixes/*.info.yml`에는 수정안별 정답과 설명이 있다. `challenges.yml`도 있다. | 채택(Top5 #4). |
| [OWASP/NodeGoat](https://github.com/OWASP/NodeGoat) | E | 2.1k · Apache-2.0 | OWASP Top 10 튜토리얼이 있다. 줄 단위 정답지는 없다. | 제외. 채점용으로는 Juice Shop이 낫다. |
| [OWASP-Benchmark/BenchmarkJava](https://github.com/OWASP-Benchmark/BenchmarkJava) | E | 839 · GPL-2.0 · v1.2 | `expectedresults-1.2.csv`에 진짜 취약점과 가짜(미끼) 케이스 정답이 있다. 점수는 Youden 지수(TPR − FPR, 0~100)다. | 채택(Top5 #4의 점수식만). Java 전용이라 데이터는 쓰지 않는다. |
| [withmartian/code-review-benchmark](https://github.com/withmartian/code-review-benchmark) | E | 299 · MIT | 실제 PR 50개에 사람이 쓴 정답 코멘트 173개가 있다. LLM 판정기 3종이 "같은 문제인가"를 판단한다. 정밀도와 재현율을 계산하고, 카테고리 프로필과 F-beta로 가중치를 준다. | 검토. PR 리뷰용이라 우리 전체 감사와는 형식이 다르다. 판정 방법은 참고한다. |
| CASTLE ([arXiv 2503.09433](https://arxiv.org/abs/2503.09433)) | E | 논문. 저장소 별 수 확인 못 함 | C 프로그램 250개에 프로그램마다 CWE가 1개씩 있다. 진짜와 거짓 양성, 심각도를 함께 반영하는 CASTLE Score를 쓴다. 코드가 길어질수록 LLM의 정확도가 떨어지고 환각이 늘어난다. | 검토. "파일이 커지면 성능이 떨어진다"는 점을 벤치마크 설계에 반영한다. |

---

## 3. 바로 채택할 만한 작은 개선 Top 5

### #1. CLAUDE.md의 baton 블록을 `@AGENTS.md` import로 줄이기 (baton)
- **무엇을:** 지금은 AGENTS.md와 CLAUDE.md 블록에 같은 규칙이 두 번 적혀 있다. CLAUDE.md 블록에는 `@AGENTS.md` 한 줄과 Claude 전용 내용만 남긴다. Claude 전용 내용은 슬래시 명령, verifier, 훅 안내다.
- **어디를:** `place.mjs`의 CLAUDE.md 블록 템플릿과 `sync.mjs`의 replace 경로를 바꾼다. 블록 마커는 그대로 둔다.
- **왜:**
  - 공식 문서에 따르면 CLAUDE.md가 있으면 Claude는 기본 설정에서 AGENTS.md를 읽지 않는다. 대신 `@AGENTS.md`로 불러오면 한 번만 읽힌다.
  - 규칙 원본이 하나가 되므로 두 블록이 서로 어긋날 일이 없다.
  - 덤으로, 프로젝트가 AGENTS.md 블록 밖에 쓴 자체 규칙도 Claude에게 전달된다.
- **주의:** import 파일도 컨텍스트 비용은 같다. 절약되는 것은 중복분뿐이다.
- **검증:**
  1. 시험 프로젝트에서 Claude 세션을 열고 `/memory`나 InstructionsLoaded 훅으로 AGENTS.md가 로드됐는지 확인한다.
  2. 같은 규칙이 두 번 들어가지 않는지 확인한다.
  3. preserve-check가 통과하는지 확인한다.
  4. 블록 줄 수가 이전보다 줄었는지 숫자로 기록한다.

### #2. doctor에 "Codex 지침 잘림" 검사 넣기 (baton)
- **무엇을:** Codex가 실제로 읽는 체인의 크기를 더한다. 체인은 `~/.codex/AGENTS.override.md` 또는 `AGENTS.md`, 그리고 루트부터 현재 폴더까지의 AGENTS.override.md, AGENTS.md다. 합이 32KiB(또는 config.toml의 `project_doc_max_bytes`)에 가까우면 경고한다.
- **함께 검사할 것:**
  - `AGENTS.override.md`가 있으면 우리 AGENTS.md가 무시된다. 이것도 알린다.
  - Claude 쪽은 공식 권장치인 CLAUDE.md 200줄 이하를 넘는지 본다.
- **어디를:** doctor 스크립트에 읽기 전용 검사로 추가한다.
- **왜:** 잘림은 경고 없이 일어난다고 한다(2차 자료). baton 규칙은 AGENTS.md에 직접 적혀 있으므로, 잘리면 뒤쪽 규칙이 조용히 사라진다.
- **검증:**
  1. 40KB짜리 AGENTS.md를 둔 예시 프로젝트에서 doctor가 경고하는지 본다.
  2. 정상 프로젝트에서는 경고가 0개인지 본다.
  3. 설치된 실제 프로젝트들에 돌려 경고 수를 기록한다.

### #3. Codex에도 같은 읽기 전용 SessionStart 훅 달기 (baton)
- **무엇을:** `.codex/hooks.json`에 SessionStart 훅을 하나 추가한다. matcher는 `startup|resume`이고, Claude 쪽과 같은 status 스크립트를 실행한다.
- **어디를:** `place.mjs`는 파일이 없을 때만 복사한다. 파일이 있으면 JSON 키 병합 후 preserve-check를 한다. doctor는 Codex 버전과 훅 인식 여부를 보고한다.
- **왜:**
  - 배경 설명의 전제는 "Codex에는 훅이 없다"였다. 하지만 2026년에 Codex CLI에 라이프사이클 훅이 생겼다. openai/codex 저장소의 `docs/config.md`에 "Lifecycle hooks" 항목이 있다. beads도 `bd setup codex`로 Codex 훅을 설치한다.
  - 지금은 Codex 쪽에서만 Git Wins 상태 확인이 "규칙(문서)"에 의존한다. 이렇게 하면 두 도구가 같아진다.
  - 훅 수는 늘지 않는다. 같은 훅 하나를 두 도구에 다는 것이다.
- **주의:**
  - 이벤트 이름, matcher, 신뢰(trust) 절차는 버전마다 다르다고 한다(2차 자료).
  - 설치 전에 사용 중인 Codex에서 `/hooks`로 직접 확인한다.
  - 지원하지 않는 버전에서는 설치하지 않는다.
- **검증:**
  1. Codex 세션을 시작하고 상태 출력이 첫 컨텍스트에 보이는지 확인한다.
  2. stats로 다음 숫자를 도입 전후로 비교한다: "RESUME에서 status를 먼저 확인했는가" 비율, Codex 세션의 첫 git 확인 명령 수.

### #4. audit 외부 채점: Juice Shop 정답 주석 + Youden 점수 (audit)
- **무엇을:**
  1. juice-shop을 특정 커밋으로 고정한다.
  2. `vuln-code-snippet vuln-line` 주석으로 "파일:줄 → 챌린지" 정답표를 자동으로 만든다.
  3. 감사 대상 사본에서는 그 주석을 모두 지운다. 그대로 두면 답이 보인다.
  4. 그 사본에 `/audit-security`를 돌린다.
  5. 줄 범위(±N줄)로 맞춘 결과를 TP, FP, FN으로 센다.
  6. 점수는 재현율, 정밀도, 그리고 OWASP Benchmark식 Youden 값을 함께 보고한다. Youden 값은 미끼가 있는 우리 자체 벤치에서는 TPR − FPR로 계산한다.
- **어디를:** audit 벤치마크 스크립트 옆에 외부 벤치 하나를 추가한다. 우리 자체 벤치 27파일은 그대로 둔다.
- **왜:**
  - 지금의 11/11, 오탐 0은 우리가 만든 문제에서 나온 숫자라 과적합 의심을 받을 수 있다.
  - 공개 앱에 공개 정답이 있으면 남이 재현할 수 있다. 공개 비교에 특히 좋다.
  - CASTLE 논문은 코드가 커질수록 LLM 정확도가 떨어진다고 했다. 큰 실제 코드베이스로 이 점을 확인할 수 있다.
- **주의:**
  - Juice Shop은 유명해서 모델이 학습 중에 봤을 수 있다. 결과는 "상한선"으로 해석한다.
  - 주석은 일부 챌린지에만 있다. 그래서 주석이 있는 범위만 정답으로 쓴다. 정답 밖에서 나온 지적은 FP가 아니라 "미판정"으로 따로 센다.
- **검증:**
  - 같은 커밋에서 3회 돌려 평균과 편차를 기록한다.
  - 다음 버전의 audit와 비교한다.

### #5. verifier 판정을 3단계로 하고, 증거를 필수로 하기 (baton)
- **무엇을:** FINISH 때 verifier가 `verified`, `partial`, `failed` 중 하나만 반환하게 한다(Spec Kit 버그 수정 확장과 같은 단어).
  - 판정마다 실제로 실행한 명령과 결과 요약을 반드시 붙인다(superpowers의 verification-before-completion).
  - `verified`일 때만 archive로 이동한다.
  - `partial`이면 ACTIVE.md의 Next Exact Step에 부족한 점을 적고 RESUME으로 돌아간다.
- **어디를:** verifier 서브에이전트 프롬프트, /task-finish 절차, Codex용 AGENTS.md FINISH 절차를 바꾼다.
- **왜:** 판정이 기계로 읽을 수 있는 단어가 된다. 그러면 stats가 판정별 횟수를 셀 수 있다. "측정 없이 채택 안 함" 원칙에 맞는다.
- **검증:**
  1. 일부러 테스트 하나를 깨 둔 작업에서 `failed`가 나오는지 본다.
  2. 일부 단계만 끝낸 작업에서 `partial`이 나오는지 본다.
  3. stats에 "FINISH 판정 분포"와 "verified 후 다시 열린 작업 수"를 추가한다.

---

## 4. 나중에 검토할 큰 아이디어

1. **audit(과 baton의 공용 부분)를 플러그인 마켓플레이스로 배포하기**
   - 장점: Claude 공식 문서상 `version`을 올리면 업데이트가 간다. `renames`로 이름을 바꿔도 기존 설치가 옮겨진다. trailofbits/skills 사례를 보면 Codex도 `.claude-plugin/marketplace.json`을 읽을 수 있다(Codex 쪽은 2차 자료이고 일부만 호환). 전역 설치 스크립트를 직접 관리할 필요가 줄어든다.
   - 단점: 자동 업데이트가 기본으로 꺼져 있다. 명령 이름이 `/audit:audit-all`처럼 바뀐다. baton의 프로젝트별 파일(ACTIVE.md, 블록)은 플러그인으로 보낼 수 없다. 그래서 sync.mjs는 여전히 필요하다. 현재 설치 스크립트를 쓰는 사람의 이전 경로도 만들어야 한다.
2. **/task-* 절차를 Agent Skills 표준(SKILL.md)으로 옮기기**
   - 장점: Claude는 commands를 skills로 합쳤다. 표준 frontmatter(name, description 등 6개)만 쓰면 Codex도 같은 절차를 스킬로 쓸 수 있다. 지금처럼 AGENTS.md에 절차를 직접 적을 필요가 줄어든다. 그러면 #2의 32KiB 압박도 준다.
   - 단점: 두 도구의 스킬 폴더 위치가 다르다(Codex 위치는 2차 자료). 그래서 사본이나 링크가 필요하다. Codex에서 스킬이 확실히 호출되는지 측정해야 한다.
3. **한도에 걸려 끊겼을 때 대화 기록(JSONL)으로 비상 핸드오프 초안 만들기** (claude-code-tools의 rollover/lineage, PyPI session-handover 참고)
   - 장점: HANDOFF를 쓰기 전에 끊기는 경우를 줄일 수 있다. stats가 이미 JSONL을 읽으므로 기반이 있다.
   - 단점: JSONL 형식은 공식 문서가 없고 자주 바뀐다. 초안은 "Git Wins" 원칙에 따라 참고용으로만 표시해야 한다.
4. **audit 오탐 줄이기: 명시적 제외 목록 + 반박 검증 단계**
   - claude-code-security-review의 제외 목록과 사용자 지침 파일, trailofbits의 fp-check / 반박 검증자 패턴을 참고한다.
   - 장점: 실제 큰 코드에서 오탐이 늘 때 쓸 수 있는 수단이다.
   - 단점: 단계가 늘면 비용과 시간이 든다. 현재 오탐 0인 자체 벤치에서는 효과를 측정할 수 없다. 그래서 #4를 먼저 해야 한다.
5. **beads식 작업 큐(ready/claim, 해시 ID)**
   - 장점: 기기와 에이전트가 늘어도 ID가 충돌하지 않는다.
   - 단점: DB와 CLI가 새로 생긴다. 지금은 한 사람이 도구 두 개를 번갈아 쓰므로 "작성자는 하나" 원칙으로 충분하다.
6. **agnix나 Claude `/doctor prompt-audit`로 지침 파일 점검하기**
   - 장점: 모순되거나 낡은 지시를 찾아준다.
   - 단점: 규칙 수가 많아 잡음이 생긴다. prompt-audit는 Claude v2.1.283 이상에서만 된다. doctor의 선택 항목으로만 두는 것이 맞다.

---

## 5. 우리가 이미 더 잘하고 있는 점 (솔직한 비교)

- **사용자 내용 보존이 가장 엄격하다.**
  - ruler는 덮어쓰고 `.bak`로 백업한다. rulesync와 OpenSpec은 다시 생성한다. 사용자 내용을 어떻게 지키는지 README에 자세한 설명이 없는 도구가 많았다.
  - baton은 다르게 한다. 작업 트리를 건드리지 않고 `baton-update` 브랜치를 만든다. "과거 어느 키트 버전에도 없는 줄"을 사용자 줄로 판정한다. 병합 전에 preserve-check를 한다.
  - 이 셋을 모두 하는 도구는 이번 조사에서 찾지 못했다.
- **Git Wins.** Cline Memory Bank와 claude-mem은 자기 메모를 믿는다. baton은 메모와 git이 다르면 git을 믿는다. 기기를 넘나드는 핸드오프에서 이 차이가 크다.
- **외부 의존이 없다.** beads는 Dolt, funes는 HF dataset, claude-mem은 SQLite와 벡터 DB(클라우드는 선택)를 쓴다. baton은 git과 마크다운만 쓴다. Claude 공식 auto memory는 기기 안에만 저장된다. 그래서 기기 간 인계에는 git에 들어가는 STATUS.md/ACTIVE.md가 필요하다.
- **핸드오프 계약이 구체적이다.** Failed Attempts, Next Exact Step + Why, Expected Build State 같은 칸은 다른 메모리 도구 README에서 보지 못했다. 이 칸들은 "같은 실패를 반복하지 않게" 만든다.
- **측정한다.**
  - claude-code-security-review의 `evals/`에는 정답지가 없다. 많은 리뷰 벤치마크는 업체가 직접 만들었다.
  - audit는 미끼(decoy) 5개를 포함한 정답지로 재현율과 오탐을 함께 냈다. 미끼를 쓰는 방식은 OWASP Benchmark와 같은 생각이다.
  - baton의 stats도 핸드오프와 한도 도달 횟수를 숫자로 낸다.
- **원칙이 문서화돼 있다.** "꼭 지킬 것은 훅, 절차는 명령, 경향은 CLAUDE.md"로 나눈다. 공식 문서도 같은 구분을 권한다. CLAUDE.md는 강제가 아니므로 꼭 막아야 할 것은 PreToolUse 훅을 쓰라고 한다.
- **솔직한 약점:**
  - Codex 쪽 자동 확인(훅)이 아직 없다(#3).
  - 배포가 자체 스크립트다(큰 아이디어 1).
  - audit 벤치마크가 작고 우리가 직접 만들었다(#4).
  - 실제 사용자가 한 명이라 일반화한 근거가 약하다.

---

## 6. 출처 링크 목록

공식 문서
- Claude Code memory (CLAUDE.md, imports, AGENTS.md): https://code.claude.com/docs/en/memory
- Claude Code skills: https://code.claude.com/docs/en/skills
- Claude Code 마켓플레이스 만들기: https://code.claude.com/docs/en/plugin-marketplaces
- Claude Code 마켓플레이스 운영/업데이트: https://code.claude.com/docs/en/plugins/host-marketplace.md
- Codex AGENTS.md (저장소 안내 → 외부 문서): https://github.com/openai/codex/blob/main/docs/agents_md.md
- Codex config(Lifecycle hooks 항목): https://github.com/openai/codex/blob/main/docs/config.md
- Codex AGENTS.md 가이드 (접속 불가, 검색 요약으로만 확인): https://developers.openai.com/codex/guides/agents-md
- Codex hooks (접속 불가, 검색 요약으로만 확인): https://developers.openai.com/codex/hooks

2차 자료 (Codex 세부)
- AGENTS.md 고급 패턴: https://codex.danielvaughan.com/2026/03/26/agents-md-advanced-patterns/
- Codex hooks: https://codex.danielvaughan.com/2026/03/26/codex-cli-hooks-deep-dive
- Codex hooks GA 이후: https://codex.danielvaughan.com/2026/05/25/codex-cli-hooks-after-ga-event-model-trust-verification-production-patterns/
- Codex 플러그인/마켓플레이스: https://codex.danielvaughan.com/2026/06/04/codex-cli-plugin-management-terminal-commands-marketplace-json-output-v0137/
- Cline Memory Bank 블로그: https://cline.bot/blog/memory-bank-how-to-make-cline-an-ai-agent-that-never-forgets
- claude-code-tools aichat 문서 (접속 불가): https://pchalasani.github.io/claude-code-tools/tools/aichat
- session-handover (PyPI): https://pypi.org/project/session-handover/0.3.1/
- OpenSpec 블록 사용 예: https://glama.ai/mcp/servers/@SAK1337/dune-mcp/blob/c091ed1ed06977a854b648f382cf716b495cb324/AGENTS.md

저장소
- https://github.com/steveyegge/beads
- https://github.com/eyaltoledano/claude-task-master
- https://github.com/cline/cline
- https://github.com/thedotmack/claude-mem
- https://github.com/pchalasani/claude-code-tools
- https://github.com/huggingface/funes
- https://github.com/SuperClaude-Org/SuperClaude_Framework
- https://github.com/agentsmd/agents.md
- https://github.com/intellectronica/ruler
- https://github.com/dyoshikawa/rulesync
- https://github.com/agent-sh/agnix
- https://github.com/hesreallyhim/awesome-claude-code
- https://github.com/anthropics/claude-plugins-official
- https://github.com/davila7/claude-code-templates
- https://github.com/wshobson/agents
- https://github.com/obra/superpowers
- https://github.com/trailofbits/skills
- https://github.com/github/spec-kit
- https://github.com/bmad-code-org/BMAD-METHOD
- https://github.com/Fission-AI/OpenSpec
- https://github.com/buildermethods/agent-os
- https://github.com/anthropics/claude-code-security-review (evals: https://github.com/anthropics/claude-code-security-review/blob/main/claudecode/evals/README.md)
- https://github.com/juice-shop/juice-shop (정답 주석 예: routes/login.ts, data/static/codefixes/loginAdminChallenge.info.yml)
- https://github.com/OWASP/NodeGoat
- https://github.com/OWASP-Benchmark/BenchmarkJava
- https://github.com/withmartian/code-review-benchmark

평가 관련
- OWASP Benchmark (Youden 점수): https://owasp.org/index.php/Benchmark
- CASTLE 논문: https://arxiv.org/abs/2503.09433
- AI 코드 리뷰 벤치마크 현황 정리(2026): https://laoujin.github.io/Atlas/research/2026-06-09-ai-assisted-code-review-in-2026-landscape-tools-evidence-and-limits/evaluation-rubrics-and-benchmarks/

## 반영 기록 (2026-11-04)

| 제안 | 결과 | 이유 |
| --- | --- | --- |
| #1 CLAUDE.md 블록을 `@AGENTS.md` 불러오기로 | 이미 그렇게 돼 있음 | 블록 방식으로 바꿀 때 CLAUDE.md 블록은 `@AGENTS.md` + Claude 전용 몇 줄만 두었다 |
| #2 doctor에 Codex 지시문 크기 검사 | **채택·보완** | "Codex 자동 로드 AGENTS 문서 크기": 전역 + 루트~doctor를 실행한 폴더까지, 폴더마다 AGENTS.override.md → AGENTS.md → `project_doc_fallback_filenames` 순서(**있는** 첫 파일 선택, 빈 파일은 0으로 셈)로 합산해 `project_doc_max_bytes`(기본 32KiB)와 비교. config.toml에서 읽은 값은 "실제 적용 설정과 다를 수 있음"으로 표시. 같은 폴더에 override가 있으면(비어 있어도) baton 규약을 가리므로 [ ]. 사용자의 Codex 검토·실제 확인(0.166.0)으로 보완 |
| #3 Codex SessionStart 훅 | **채택** | 사용자의 Codex가 실제 프로젝트에서 확인(Codex CLI 0.166.0): `.codex/hooks.json`의 SessionStart가 Git 최상위를 구해 `scripts/baton/status.mjs`를 실행하고, `/hooks` 신뢰 뒤 새 세션에서 결과가 모델 문맥에 들어감(화면엔 "Loading Baton status"만). 그 파일을 그대로 키트에 넣고 place(없으면 복사, 있으면 덧붙임)·sync(없을 때만 추가)·doctor(등록 검사)·시험을 맞춤. 처음 "2차 자료뿐"이라 쓴 것은 틀렸음 |
| #4 Juice Shop 정답 표시로 audit 재측정 | 제외 | 사용자 판단: audit은 데이터셋 없이 짧게 만든 실험이라 재측정하지 않고 실험으로 남긴다 |
| #5 검증 담당 3단계 판정 + 근거 | 대부분 이미 있음 | 완료 조건별 근거·검사 명령·결과를 이미 요구. "부분 통과" 단계 추가는 측정 없이 판정 단계만 늘려 보류 |

**정정 (2026-11-04, 사용자의 Codex 검토):** 본문의 "잘림은 경고 없이 일어난다"는 단정은 빼야 정확하다. 공식 문서는 한도에 도달하면 파일을 더 추가하지 않는다고 설명한다. 범위도 "Codex가 읽는 지시문 전체"가 아니라 "자동 로드되는 AGENTS 계열 문서"다.

**정정 2 (2026-11-04, Codex 0.166.0 실제 확인):** 0바이트와 공백만 있는 파일은 문맥에서 빠진다. 하지만 빈 AGENTS.override.md도 선택되므로 같은 폴더의 AGENTS.md는 읽지 않는다. "빈 override는 건너뛰고 AGENTS.md를 읽는다"고 본 진단을 고쳤다. 한도·대체 이름은 프로필·명령줄로도 바뀐다.
