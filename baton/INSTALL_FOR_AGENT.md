# 프로젝트 설치 지침 (에이전트용) — 프로젝트마다 한 번

> 사용자가 설치 제안에 "응"이라고 하거나 "baton 설치해줘"라고 하면 이 문서를 수행한다.
> KIT = 이 문서가 있는 폴더(`~/harness/baton`). 설치 대상 = 현재 열려 있는 프로젝트.
> 사용자는 비전공자다. 각 단계는 쉬운 한국어로 한두 줄씩만 알린다. 질문은 한 번에 하나씩.

## 원칙

- 기존 파일을 **덮어쓰지 않는다.** 같은 이름의 파일이 있으면 아래 4단계 표대로 병합하고 무엇을 병합했는지 보고한다.
- 기존 파일의 내용은 바꾸지 않는다. AGENTS.md·CLAUDE.md에는 baton 블록만 끼우고(4단계 `place.mjs`), 설치 뒤 `preserve-check`(6단계)로 기계적으로 확인한다.
- baton 파일은 **프로젝트 루트**에 둔다. 엔진·프레임워크가 관리하는 폴더(Unity `Assets/`, Unreal `Content/` 등) 안에는 넣지 않는다.
- 이 문서에서 "main"은 저장소의 기본 브랜치(main, master 등)를 뜻한다.
- main 병합은 사용자 승인 후에만 한다.

## 0. 사전 검사 (어떤 파일도 만들기 전에)

`node ~/harness/baton/preflight.mjs install`을 프로젝트 폴더에서 실행한다. 이미 설치됐는지, 같은 이름 파일(AGENTS.md·CLAUDE.md·tasks/STATUS.md·tasks/ 등), 링크·Git 밖 파일, 깨진 JSON, package.json 스크립트 이름, 설치용 브랜치, 진행 중인 병합, 커밋 안 된 변경을 한 번에 검사한다.
**[멈춤]이 하나라도 나오면(exit 1) 그 자리에서 멈추고, 모든 항목을 한 메시지로 보여주고 묻는다. 답을 받기 전에는 어떤 파일도 만들거나 바꾸지 않는다.** 사용자가 답한 내용대로만 진행하고, 아래 단계에서 같은 항목을 다시 묻지 않는다. Node가 없으면 같은 항목을 직접 확인한다.

## 1. 프로젝트 종류 파악

### 1-1. 판단 순서

1. 아래 표의 표시 파일로 판단한다.
2. 표시가 여러 종류면 **복합**으로 본다 (예: 웹 프론트 + Python 서버). 각 부분의 위치를 기록한다.
3. 표에 없으면 README, 파일 확장자, 폴더 구조로 추정한다.
4. 판단 결과를 한 줄로 확인한다: "Unity 프로젝트로 보여요. 맞죠?" / "어떤 종류인지 확실하지 않아요. ○○ 같은데 맞나요?"

| 종류 | 표시 | Verify 후보 | 사람이 직접 확인할 것 | 큰 파일 많음 |
| --- | --- | --- | --- | --- |
| Node / 웹 (Next.js 등) | `package.json` | 존재하는 lint, typecheck(`tsc --noEmit`), test, build를 이은 `npm run verify` | 브라우저 화면 | 보통 아님 |
| 정적 웹 | `index.html`만 있고 `package.json` 없음 | 없음 | 브라우저로 열어보기 | 아님 |
| Python | `pyproject.toml`, `requirements.txt`, `setup.py` | `pytest` (+ 있으면 `ruff`, `mypy`) | 실행 결과 | 아님 |
| Jupyter | `*.ipynb` 위주 | 노트북 처음부터 다시 실행해 에러 없음 | 결과 그래프·숫자 | 데이터 파일 주의 |
| Unity | `Assets/` + `ProjectSettings/` | 이미 있는 검사(EditMode/PlayMode 테스트, 커스텀 검사)를 우선. 없으면 "에디터 컴파일 에러 없음". 명령줄 테스트는 에디터가 열려 있으면 실패하므로 먼저 묻는다 | 에디터에서 플레이 | **예** |
| Unreal | `*.uproject` | 이미 있는 빌드·테스트 방법 | 에디터에서 플레이 | **예** |
| Godot | `project.godot` | 이미 있는 테스트(예: GUT) | 에디터에서 플레이 | 예 |
| .NET / C# | `*.sln`, `*.csproj` (Unity 아님) | `dotnet build`, `dotnet test` | 실행 | 아님 |
| Flutter | `pubspec.yaml` | `flutter analyze`, `flutter test` | 기기·에뮬레이터 | 아님 |
| Java / Kotlin / Android | `build.gradle*`, `pom.xml` | `gradlew test` / `mvn test` | 실행·기기 | 아님 |
| Go / Rust / C·C++ | `go.mod` / `Cargo.toml` / `CMakeLists.txt` | `go test ./...` / `cargo test` / 기존 빌드 | 실행 | 아님 |
| Arduino·임베디드 | `*.ino`, `platformio.ini` | 컴파일 성공 | 실제 기기 동작 | 아님 |
| **미정** | 빈 폴더, 또는 기획 문서뿐 | 없음 | 없음 | — |
| **알 수 없음** | 위 어디에도 해당 안 되고 추정도 어려움 | 사용자에게 묻는다 | 사용자에게 묻는다 | 사용자에게 묻는다 |

### 1-2. Verify 정하기

- 프로젝트에 이미 검사 체계가 있으면(커스텀 테스트, 회귀 검사 등) **그것을 우선**한다.
- 없으면 표의 후보 중 **실제로 동작하는 것만** 쓴다. 한 번 실행해보고 안 되면 빼고 보고한다.
- 표로 정할 수 없으면 묻는다: "평소에 잘 됐는지 어떻게 확인하세요?"
- 사용자도 모르면: Verify는 `없음`, Manual check는 "사용자가 실행해보고 확인"으로 쓰고, tasks/STATUS.md Known Issues에 "검증 방법 정하기"를 남긴다. **검증이 없어도 baton의 기록·이어하기 기능은 그대로 동작한다**고 알려준다.

### 1-3. 미정 / 알 수 없음 프로젝트

- **미정**(빈 폴더, 아직 기술을 안 정함): baton을 **기록 전용**으로 설치한다. Type `미정`, Verify `없음`. 기획 내용이 있으면 tasks/STATUS.md Overview에 요약한다. "기술이 정해지면 제가 알아서 검증 방법을 맞출게요"라고 알린다.
- **알 수 없음**: Type을 `알 수 없음 (<추정>)`으로 쓰고, 확실하지 않은 칸은 `TODO(확인 필요)`로 둔다.
- 두 경우 모두 나중에 종류가 정해지면 AGENTS.md의 "프로필 재확인" 규칙으로 다시 맞춘다.

## 2. Git

### 2-1. 사전 점검
- `git --version` 실패 → 설치를 멈추고 "Git for Windows를 먼저 설치해야 해요"라고 안내한다 (https://git-scm.com).
- `git config user.name`이 비어 있음 → 커밋에 필요하다고 설명하고 설정을 돕는다. **이 이름과 이메일은 모든 커밋에 기록되고, 나중에 GitHub에 올리면 공개될 수 있다**고 먼저 알린다.
    - 이름: 실명 대신 닉네임도 된다.
    - 이메일: GitHub를 쓸 계획이면 GitHub 설정의 "Keep my email addresses private"를 켜고 나오는 noreply 주소(`숫자+아이디@users.noreply.github.com` 형태)를 쓰도록 권한다. 아직 모르겠으면 임시로 `<닉네임>@users.noreply.github.com`처럼 실제가 아닌 주소를 써도 된다. 개인 이메일을 그대로 쓰려 하면 공개될 수 있다고 한 번 더 확인한다.
    - 사용자가 직접 정한 값으로 `git config --global user.name`, `git config --global user.email`을 설정한다.
- 이미 설정돼 있으면 이메일이 개인 주소로 보이는지만 확인하고, 그렇다면 위 내용을 한 줄로 알려준다 (바꿀지는 사용자가 정한다).
- 프로젝트 경로에 `OneDrive`가 들어 있으면 "OneDrive 동기화 폴더 안의 Git은 가끔 충돌해요. 지금은 그대로 진행하고 tasks/STATUS.md에 기록해 둘게요"라고 알린다.

### 2-2. Git이 이미 있을 때
- 작업 트리·진행 중인 병합·설치용 브랜치는 0단계 사전 검사에서 확인했다. 그 답대로 진행한다.
- .gitignore에 개인 설정 줄(`.claude/settings.local.json`, `CLAUDE.local.md`, `.claude/worktrees/`)이 없으면 끝에 추가한다. 다른 줄은 건드리지 않는다.
- baton 파일(아래 4단계에서 복사하는 것 전부)이 .gitignore나 전역 제외 설정에 걸리는지 `git check-ignore -v --no-index <파일>`로 확인한다. 걸리면 고치지 말고 알린다: "baton 파일은 작업 방식 설정이라 Git에 올라가야 다른 컴퓨터·에이전트가 이어받을 수 있어요."
- 1단계 종류 기준으로 **기록하면 안 되는 폴더가 이미 기록돼 있는지** 확인한다 (예: Unity `Library/`, Node `node_modules/`). 있으면 고치지 말고 보고만 하고, tasks/STATUS.md Known Issues에 남긴다.
- **비밀값 검사:** `scan-secrets.mjs`를 실행한다(4단계에서 복사한 뒤, 또는 Node가 없으면 같은 기준으로 직접). 이미 커밋된 비밀값이 있으면 기록을 직접 고치지 말고 알린다: "가장 확실한 해결은 그 키를 서비스에서 **새로 발급(교체)**하는 거예요. Git 기록에서 지우는 작업은 따로 신중하게 해야 해요." 원격 저장소가 연결돼 있고 공개 저장소라면 더 급하다고 알린다.
- 원격 저장소가 연결돼 있으면(`git remote -v`) 주소만 확인한다. push는 하지 않는다.

### 2-3. Git이 없을 때
baton은 Git으로 기록과 복구를 하므로 필요하다고 쉽게 설명하고, 승인을 받은 뒤:
1. **.gitignore 만들기** (기존 파일이 있으면 병합)
    - 기준은 GitHub 공식 템플릿 저장소 `https://github.com/github/gitignore`의 해당 종류 템플릿이다. **이 저장소에서만** 받는다 (예: `Unity.gitignore`, `Node.gitignore`, `Python.gitignore`, `Godot.gitignore`, `UnrealEngine.gitignore`, `VisualStudio.gitignore`). 받을 수 있으면 받아서 쓴다.
    - 받을 수 없으면 해당 종류의 표준 항목을 직접 쓴다. Unity라면 최소 `/[Ll]ibrary/`, `/[Tt]emp/`, `/[Oo]bj/`, `/[Bb]uild/`, `/[Bb]uilds/`, `/[Ll]ogs/`, `/[Uu]ser[Ss]ettings/`, `/[Mm]emoryCaptures/`, `.vs/`, `*.csproj`, `*.sln`, `*.suo`, `*.user`.
    - **복합**이면 각 부분의 템플릿을 합친다. **미정 / 알 수 없음**이면 아래 공통 항목만 쓰고, 종류가 정해지면 보강한다.
    - 모든 종류 공통: `.env`, `.env.*`, `!.env.example`, `*.key`, `*.pem`, `*.p12`, `*.keystore`, `Thumbs.db`, `.DS_Store`, `CLAUDE.local.md`, `.claude/settings.local.json`, `.claude/worktrees/`
    - baton 파일은 .gitignore에 넣지 않는다. 작업 방식 설정이라 커밋해야 한다.
2. **비밀값 확인:** API 키, 비밀번호, 인증서, 서비스 계정 JSON 등으로 보이는 파일이 있으면 커밋에서 빼고 사용자에게 알린다.
3. **큰 파일 확인:** 50MB가 넘는 파일을 찾는다.
    - 100MB가 넘는 파일은 나중에 GitHub에 올릴 때 거부되므로 일반 커밋에 넣지 않는다.
    - 큰 파일이 있거나 1단계 표에서 "큰 파일 많음"인 종류면, Git LFS(큰 파일 전용 저장 방식)를 쓸지 묻는다. 쓰기로 하면 `git lfs version`으로 설치를 확인하고, `git lfs install` 후 해당 종류의 큰 파일 확장자를 `git lfs track`으로 등록한다. 잘 모르겠다고 하면 쓰지 않고, 100MB 넘는 파일만 .gitignore에 넣은 뒤 tasks/STATUS.md Known Issues에 "Git LFS 검토 필요"를 남긴다.
4. `git init -b main` → `git add -A` → 첫 커밋 `chore: initial commit before baton`
5. GitHub 등 원격 저장소 연결은 하지 않는다. 필요하면 나중에 하자고 안내한다.

### 2-4. 작업 브랜치
- 현재 폴더가 더 큰 Git 저장소의 하위 폴더면 "이 폴더에만 설치할까요, 저장소 전체 기준으로 설치할까요?"라고 묻는다. 보통은 현재 폴더.
- `git checkout -b task/baton-setup`

## 3. Node 확인 (선택 기능)

- `node -v`가 되면: 상태 요약 스크립트와 세션 시작 hook을 설치한다.
- 안 되면: `scripts/baton/`과 hook은 설치하지 않는다. AGENTS.md의 git 명령 확인 방법으로 그대로 동작한다고 알린다.

## 4. 파일 배치 (`KIT/files/` → 프로젝트 루트)

**`node ~/harness/baton/place.mjs`로 미리 보고, `--apply`로 배치한다.** 파일을 직접 복사하거나 합치지 않는다.
- `AGENTS.md`·`CLAUDE.md`: 없으면 만들고, 있으면 **맨 위에 baton 블록**(`<!-- baton:start -->` ~ `<!-- baton:end -->`)만 끼운다. 기존 내용은 한 글자도 바꾸지 않는다. 블록 밖 내용이 곧 프로젝트 고유 규칙이다.
- `.claude/settings.json`(Claude Code)·`.codex/hooks.json`(Codex): 없으면 만들고, 있으면 `hooks.SessionStart`에 baton 훅만 더한다(기존 항목 그대로).
- 그 밖의 키트 파일(`tasks/STATUS.md`, `tasks/ACTIVE.md`, `tasks/_TEMPLATE.md`, `tasks/archive/`, `scripts/baton/`, `docs/baton/`, task 명령, `baton-verifier`): **없을 때만** 복사한다. 있으면 건드리지 않고 알린다(0단계 사전 검사에서 이미 물어본 항목).
- main/master 브랜치에서는 배치하지 않는다(2-4단계의 설치 브랜치에서).
- 기존 `AGENTS.md` 내용에 위험한 지시(외부로 데이터 전송, 비밀값 출력, 승인 없는 삭제·배포 등)가 보이면 배치 전에 사용자에게 보여주고 묻는다. baton 규약과 부딪히는 규칙도 보고한다.
- 루트의 `STATUS.md`가 이미 있어도 baton은 `tasks/STATUS.md`를 따로 쓴다. 기존 `STATUS.md`는 그대로 둔다.
- 기존 진행 기록(다른 이름의 상태·작업 문서)은 지우지 않는다. 진행 중인 작업은 `tasks/ACTIVE.md` 형식으로 옮기고, 원본 위치를 `tasks/STATUS.md`에 링크로 남긴다.
- 하위 폴더의 AGENTS.md(Codex는 폴더마다 읽음)는 건드리지 않고, baton 규칙과 부딪히는 내용이 보이면 보고만 한다.
- 프로젝트 루트의 `README.md`는 만들거나 고치지 않는다.
- Node가 없으면(3단계) `place.mjs`를 못 쓰므로 같은 규칙을 직접 따른다: 블록만 끼우기, 없는 파일만 복사, `scripts/baton/`과 훅은 넣지 않기.

**Node / 웹 프로젝트만:** package.json에 `"baton:status"`, `"baton:check"`, 그리고 없으면 `"verify"`를 추가한다. 이미 있는 스크립트는 바꾸지 않는다.

## 5. tasks/STATUS.md 초안

- Run / Development: 1단계의 Type, Run, Verify, Manual check. 기본 브랜치 이름이 main이 아니면 함께 쓴다. 복합이면 부분별로 쓴다.
- Overview, Architecture: 코드에서 확인한 사실만. 추측은 `TODO(확인 필요):`
- Constraints: 기본 규칙 유지 + 코드에서 보이는 패턴을 `(후보)`로 추가. 종류별 위험 작업 추가 (예: 게임 "스토어 빌드 업로드는 승인 후", 웹 "Production DB write는 승인 후", 임베디드 "실기기 펌웨어 덮어쓰기는 승인 후").
- Known Issues: 설치 중 발견한 것 (기록되면 안 되는 폴더가 기록됨, LFS 검토, OneDrive, 검증 방법 미정 등).
- 기존 진행 기록이 있으면 Current Milestone, Completed, Remaining에 요약한다.

## 6. 동작 확인

- **보존 확인 (커밋 전, 필수):** `node ~/harness/baton/preserve-check.mjs <설치 전 커밋>`. 문서(.md)·.gitignore는 줄, JSON(settings.json·package.json)은 기존 키·값이 모두 남았는지 본다. 설치 전 커밋은 2-2의 현재 커밋 또는 2-3의 "initial commit before baton". 사라진 줄이 나오면 커밋하지 말고 그 줄을 원문 그대로 되살린 뒤 다시 확인한다. 되살리기 어려우면 사용자에게 보여주고 묻는다. (Node가 없으면 `git diff <설치 전 커밋>`으로 지워진 줄(`-`)이 baton 문구가 아닌지 직접 확인한다.)

- 상태 확인 실행 → 결과를 보여준다.
- 비밀값 검사 실행 → 결과를 보여준다 (값은 가려져 나온다).
- Verify 실행 (없음이면 건너뜀). 실패하면 baton 문제인지 기존 프로젝트 문제인지 구분해 보고한다. 기존 문제는 고치지 않는다.
- 자동으로 못 돌리는 검사는 실행하지 말고 "직접 확인 필요"로 보고한다.

## 7. 커밋과 보고

- 커밋: `chore(baton-setup): install baton v1`
- 보고 (짧게):
    1. 프로젝트 종류와 설치된 것 (3줄 이내)
    2. 새로 만든 것 (Git, .gitignore, LFS 등) / 병합한 것
    3. 보안 점검 결과 한 줄 (비밀값 검사, 커밋 이메일)
    4. **확인할 것 (나중에 해도 됨):** tasks/STATUS.md의 `TODO(확인 필요)`, `(후보)`, Known Issues
    5. **할 일:** Claude Code 껐다 켜기 (Node 있을 때만). Codex는 이 프로젝트를 처음 열 때 "Review hooks"가 뜨면 baton 상태 훅(`scripts/baton/status.mjs`)인지 보고 신뢰(Trust)를 고른다. 훅이 새로 생기거나 바뀌면 다시 물을 수 있다.
    6. main에 합칠지 묻는다.

## 8. hook 문제 해결 (필요할 때만)

**Claude Code:** 훅 결과는 화면이 아니라 문맥에 들어간다. 재시작 후 "세션 시작 때 받은 baton 상태를 보여줘(명령은 실행하지 말고)"에 답하지 못하면 `/hooks`로 등록 상태를 확인한다. command는 `node "$CLAUDE_PROJECT_DIR/scripts/baton/status.mjs"`(프로젝트 루트 기준)가 기본이다. 그래도 안 되면 셸이 변수를 못 읽는 경우이니, command를 프로젝트 루트의 절대 경로(예: `node "C:/Users/<이름>/myapp/scripts/baton/status.mjs"`)로 바꾼다.

**Codex:** 상태 요약은 화면에 펼쳐지지 않고 "Loading Baton status"만 보인 뒤 대화 문맥에 들어간다(정상). 들어가지 않으면 Codex에서 `/hooks`를 열어 SessionStart의 baton 훅이 신뢰(Trusted)됐는지 본다. 훅은 Git 저장소 최상위에서 `scripts/baton/status.mjs`를 찾으므로, baton을 저장소의 하위 폴더에 설치했으면 동작하지 않는다(그때는 AGENTS.md의 '상태 확인' 절차로 대신). 확인한 버전: Codex CLI 0.166.0.
