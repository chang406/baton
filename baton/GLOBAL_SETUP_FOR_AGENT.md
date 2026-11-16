# 전역 설정 지침 (에이전트용) — 컴퓨터에서 딱 한 번

> 사용자는 이 폴더에서 Claude Code를 켜고 "GLOBAL_SETUP_FOR_AGENT.md 읽고 설정해줘"라고만 말한다.
> 사용자는 비전공자다. 진행 상황은 쉬운 한국어로 짧게 알린다.

## 1. 위치 확인

- 이 지침은 여러 번 실행해도 안전하다. 이미 된 단계는 확인만 하고 넘어간다.
- 이 폴더가 `~/harness/baton` (Windows: `C:\Users\<이름>\harness\baton`)인지 확인한다. 아니면 사용자에게 그 위치로 옮기기를 권한다. 전역 규칙이 이 경로를 가리키기 때문이다.

## 2. 전역 CLAUDE.md에 한 줄 블록 추가

**먼저 사전 검사:** `node ~/harness/baton/preflight.mjs global`. **[멈춤]이 하나라도 나오면(exit 1) 그 자리에서 멈추고, 모든 항목을 한 메시지로 보여주고 묻는다. 답을 받기 전에는 어떤 파일도 만들거나 바꾸지 않는다.**
**고치기 전에 백업:** 사전 검사가 알려준 위치(`~/harness/baton/.backup/<시각>/CLAUDE.md`)로 지금 파일을 복사한다. 이 파일은 Git 밖이라 백업이 없으면 되돌릴 수 없다.

`~/.claude/CLAUDE.md` (Windows: `%USERPROFILE%\.claude\CLAUDE.md`)의 맨 끝에 아래 블록을 추가한다. 기존 내용은 건드리지 않는다.
이미 `baton:global` 블록이 있으면(예전 버전) 그 블록 전체를 아래 블록으로 **교체**한다.

```markdown
<!-- baton:global start -->
@~/harness/baton/GLOBAL_RULES.md
<!-- baton:global end -->
```

실제 규칙은 `GLOBAL_RULES.md`에 있고, 이 줄은 그 파일을 불러오기만 한다. 그래서 나중에 규칙을 바꿔도 전역 파일은 다시 고칠 필요가 없다.

**이 파일 수정이 안전장치에 막히면** 우회하지 말고, 사용자에게 아래처럼 안내한다.

1. `Win + R` → `notepad %USERPROFILE%\.claude\CLAUDE.md` 입력 → 확인
2. 예전 `<!-- baton:global start -->` ~ `<!-- baton:global end -->` 블록이 있으면 지운다.
3. 맨 끝에 위의 세 줄을 붙여넣고 저장한다.

## 3. 확인

사용자에게 Claude Code를 다시 켜고 `/memory`로 `GLOBAL_RULES.md`가 불러와졌는지 확인하도록 안내한다. 외부 파일 불러오기를 허용할지 물어보면 허용하라고 안내한다.
불러와지지 않으면(Windows에서 `~` 경로가 안 먹는 경우) 가운데 줄을 절대 경로로 바꾸도록 안내한다. 예: `@C:/Users/<이름>/harness/baton/GLOBAL_RULES.md`

## 3-1. 안전 안내 (한 줄)

사용자에게 알린다: "`baton` 폴더 안 파일은 모든 프로젝트의 Claude에게 영향을 주니, 직접 받은 파일만 넣어두세요."

## 4. Codex (선택)

Codex는 프로젝트에 baton이 설치되면 프로젝트의 AGENTS.md와 세션 시작 훅(`.codex/hooks.json`, 프로젝트마다 설치됨)을 쓰므로 전역 설정은 따로 하지 않아도 된다. 훅은 프로젝트를 처음 열 때 Codex가 묻는 신뢰(Trust)만 하면 된다. 설치 제안은 Claude Code가 맡는다. 다만 Codex 전역 지침(`~/.codex/AGENTS.md`)에 baton 경로를 적어 뒀다면 `~/harness/baton` 아래를 가리키는지 확인한다(옛 `~/baton`은 없음). 프로젝트의 "baton 진단해줘"가 이 경로도 확인한다.

## 5. 보고 (3줄 이내)

1. 전역 설정을 어디에 넣었는지 (또는 사용자가 붙여넣을 내용)
2. "이제 코드 프로젝트 폴더에서 아무 말이나 걸면, baton이 없을 때 제가 먼저 설치할지 물어볼게요."
3. "Claude는 먼저 말을 걸 수 없어서, 처음에 '하이'처럼 뭐든 입력해야 물어볼 수 있어요."
