<!-- baton:start -->
The shared working agreement is in AGENTS.md; always follow it. (baton manages this block; write project rules outside it)

@AGENTS.md

## Claude Code only (baton)

- At session start a hook puts the `scripts/baton/status.mjs` output into your context (the user may not see it). If it has a `! Git Wins` line, do RESUME's Git Wins step before anything else. A main-branch warning alone just means: create a task branch when work starts.
- Slash commands `/task-start`, `/task-resume`, `/task-handoff`, `/task-finish` run the matching AGENTS.md procedure.
- Subagents: `baton-verifier` (this project, FINISH verification); `deep-audit` (separate tool for security/performance audits, only if installed).
- Present M/L plans in plan mode when possible. If the user is not in plan mode, show the plan as text and change no files before approval.
- If the user doesn't know plan mode, tell them in one line: "Shift+Tab을 눌러 plan mode로 바꾸거나, 메시지 앞에 /plan을 붙이면 됩니다."
<!-- baton:end -->
