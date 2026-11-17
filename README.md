# baton

[한국어](README.ko.md)

**A handoff kit for working across Claude Code and Codex: when one session stops, the next one picks up exactly where it left off.**

> **Status: on hold (November 2026).** Built by the author for their own work. No new features are planned; only bugs found in use get fixed. Issues and PRs are read, but replies and merges aren't promised.

If you code on two $20 plans (Claude Pro and ChatGPT Plus), you hit the 5-hour limits often. Each time you switch tools, the new session knows nothing about the last one. If you don't read code yourself, you also can't easily reconstruct what was done. baton bridges that gap.

- Audience: people who build apps with AI but don't read the code. **The agent replies in Korean.**
- Also included: **audit**, a security and performance review tool. It works without baton.

## How it works

| Piece | What it does |
| --- | --- |
| `tasks/ACTIVE.md` | Handoff contract for the current task: the request verbatim, done criteria, current state, failed attempts, the exact next step |
| `tasks/STATUS.md` | Long-term project memory and guardrails |
| Git Wins | When the notes and the code disagree, Git wins. Four checks (branch mismatch, code commits after the last note, uncommitted changes, …) run at session start |
| Emergency handoff | Detects, at the next session start, a session that was cut off by a usage limit before it could hand off. Builds a ≤1.5 KB draft from the session logs Claude and Codex already keep, with secrets masked. Zero overhead while you work |
| Stop and ask | Preflight checks stop before hard-to-undo actions (install, update, deploy, merging to main, secrets) and ask once |
| Preserving your lines | Updates only touch the `<!-- baton:start -->` block. Any line that never appeared in any past version of baton is treated as yours and left alone |

Claude Code and Codex CLI read the same files. A session-start hook is installed for both.

## Install

One time only:

```bash
git clone https://github.com/chang406/baton ~/harness
```

On Windows, clone to `C:\Users\<name>\harness`. Then open Claude Code in `~/harness/baton` and say:

> GLOBAL_SETUP_FOR_AGENT.md 읽고 설정해줘 ("read GLOBAL_SETUP_FOR_AGENT.md and set it up")

From then on, when you open Claude Code in a project without baton, it asks whether to install it. An empty `.baton-skip` file at the project root stops the question.

For audit, open Claude Code in `~/harness/audit` and say "SETUP_FOR_AGENT.md 읽고 설치해줘".

## Everyday phrases

| Say | What happens |
| --- | --- |
| "새 작업: …" (new task) | Sizes the task (S/M/L), creates a task branch and the handoff file |
| "이어서 하자" (let's continue) | Reconciles the handoff file with Git and continues from the next step, also after switching tools |
| "넘길게" (handing off) | Updates the handoff file and commits |
| "끝" (done) | Finishes after a separate verifier checks the work |
| "사용법" (help) | Shows the phrases again |

More in [baton/README.md](baton/README.md) and [audit/README.md](audit/README.md) (Korean).

## Design principles

- Default to one agent with good context. Split only for a reason: independent research, more than fits in one context, or separating the builder from the checker.
- One writer. Splitting sequential work makes it worse.
- Rules that must hold go in hooks; procedures go in instruction files. Prose-only rules drift in long sessions.
- Don't put AI on problems that rules solve. baton's judgments (Git Wins, user lines, the emergency draft) are plain scripts, no AI.
- Nothing is adopted without a measurement.

## Tests

```bash
node --test "tests/*.test.mjs"
```

Node 22, no dependencies. Fake projects in temp folders cover install, update, legacy migration, preflight, emergency handoff, audit install and the read-only guard (48 tests). GitHub Actions runs them on Linux and Windows.

## Limitations

Stated plainly: this is a tool one person shaped over about a month of their own work, not a validated product.

**What has been validated**
- **One real user: the author**, on a few of their own projects (a Unity game, web apps). Nobody else has installed it from scratch.
- **Handoff quality is not measured.** There are no numbers on how many turns a resumed session needs to get back on track, or how accurate the emergency drafts are. `stats.mjs` can count some of this, but the data hasn't been collected.
- **baton's per-session token cost is only estimated.** `cost.mjs` can measure it; that hasn't been done.
- **audit's accuracy was measured only on a small self-made benchmark** (a 27-file Node/Express API with 11 planted issues and 5 decoys): 11/11 found with 0 false positives in each of 4 runs ([scoring, Korean](measurements/audit-bench-answer-key.md)). No external benchmark (OWASP etc.).
- **Tests run on Linux and Windows only.** macOS is untested. The author uses Windows.

**Behaviour**
- **Replies to the user in Korean only.** The agent instructions are English, but they tell the agent to answer in Korean.
- **The install path is fixed at `~/harness`.** Elsewhere, the paths in the instructions won't match.
- **Claude Code and Codex only.** No Cursor, Gemini CLI, etc.
- **No advance warning of usage limits.** The next session notices after a cut-off. Session logs stay on the machine that wrote them, so the emergency draft can't be built on another computer.
- **"Done" is not independently verified in Codex.** Claude Code hands verification to a separate subagent; there is no Codex verifier, so the same session follows the checklist and marks the result as not independent.
- **Most rules are prose instructions.** Only the session-start status and audit's read-only guard are enforced by hooks. Agents can drift from prose rules in long sessions.
- **audit's read-only hooks are not yet confirmed to run inside real Claude Code.** The tests cover the guard script itself.
- **Git is required.** Handoff and the checks sit on branches and commits; a user who doesn't know Git can't untangle things alone.

**Similar tools**
- Several skills do session handoff with a single `HANDOFF.md`, and at least one rebuilds a handoff from saved logs after a cut-off ([claude-handoff](https://github.com/Vasilispapg/claude-handoff)). What baton adds is noticing on its own at session start, flagging when the notes and Git disagree, and keeping the user's own lines intact on update. Comparisons (Korean) are in [docs/research](docs/research).

This repository's history starts at the public release. Lines from earlier versions are kept in `baton/known-history.json` so older installs are still recognised.

## Earlier experiments

baton is the third attempt. Two earlier projects tried to connect live sessions with a local server: a persona-driven multi-pane workspace, then a slimmed request relay. Both stopped, and their lessons led to baton's server-free, file-and-Git design. Code and retrospectives (Korean): [chang406/myade-relay](https://github.com/chang406/myade-relay).

## License

[MIT](LICENSE)
