# plan-runner: Agent Teams backend + token reduction (v1.0.0)

Date: 2026-06-19
Status: Approved (brainstorm), pending spec review
Plugin: `plugins/plan-runner` (0.5.0 -> 1.0.0)

## Goal

Make plan-runner use Claude Code's experimental Agent Teams orchestration when
available, and cut token usage on every run. The dominant token sink today is
that the orchestrator inlines the full body of each agent definition
(`plan-dev.md`, `plan-test-author.md`, `plan-verifier.md`, `plan-analyzer.md`,
`plan-aggregator.md`) into every dispatched prompt -- repeated per agent, per
wave. We remove that, and add a leaner team-based execution path.

## Decisions (from brainstorm)

1. **Detect and fall back.** If `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (and the
   running Claude Code build exposes team tooling), use the teams backend;
   otherwise run the existing subagent backend. Never break for users without the
   flag.
2. **Keep the per-wave barrier.** Both backends preserve plan-runner's current
   safety contract: dispatch a wave -> wait for all -> run TDD gates -> verify ->
   commit -> next wave. Agent teams self-claiming is used only *within* a wave.
3. **Version 1.0.0** (backward compatible; the subagent path remains the default
   for anyone without the flag).

## Background: what Agent Teams changes

- Env var: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. Requires Claude Code
  v2.1.178+ (older builds needed manual TeamCreate/TeamDelete; 2.1.178+ handles
  team setup automatically). Opt-in; a plugin cannot force it on.
- The session running the skill is the **team lead**. The lead spawns
  **teammates**, each in its own context window, that share a task list (with
  dependency resolution) and coordinate via a mailbox instead of only reporting
  back.
- Teammates are spawned by *referencing a subagent type*: the runtime appends the
  subagent definition body to the teammate's system prompt and honors its `tools`
  allowlist and `model`. The lead does not paste the agent file into the prompt.
- Constraints we must respect:
  - No nested teams (a teammate cannot spawn teammates).
  - File conflicts: two teammates editing one file overwrite each other -- work
    must be file-disjoint. plan-runner already produces file-disjoint waves.
  - Display: split panes need tmux/iTerm2; in-process (default) works on Windows
    Terminal. No special handling needed -- we rely on the default.
  - Known reliability gaps (task-status lag, no in-process resume) are mitigated
    by keeping the per-wave barrier and the lead-owned gate/commit logic.

## Architecture

`run/SKILL.md` is restructured into a shared core plus two interchangeable
wave-execution backends. Only Step 4 (wave execution) forks; every other step is
backend-agnostic.

### Shared core (unchanged in intent)

- Step 1 PRE-FLIGHT (validate plan, TDD enablement, cycle dir, clean-tree check,
  analyzer model heuristic, Context7 detection, test-command + green baseline,
  manifest init) -- plus one new sub-step (1f below).
- Step 2 ANALYZE PLAN, Step 3 DISPLAY WAVE PLAN.
- Step 5 AGGREGATE, Step 6 RE-RUN PROMPT, Step 7 FINAL SUMMARY, Step 8 OPEN PR.

### Token optimization applied to BOTH backends

The orchestrator (or lead) stops inlining agent definition bodies. Every
dispatch -- analyzer, dev, test-author, verifier, aggregator -- is made by
**registered `subagent_type`**:

| Role        | subagent_type                    |
|-------------|----------------------------------|
| analyzer    | `plan-runner:plan-analyzer`      |
| dev / standalone | `plan-runner:plan-dev`      |
| test-author | `plan-runner:plan-test-author`   |
| verifier    | `plan-runner:plan-verifier`      |
| aggregator  | `plan-runner:plan-aggregator`    |

The prompt now carries **only per-invocation parameters** (agent_id,
task_title, plan_path, task_excerpt_lines, context7_available, owned files,
acceptance criteria, and role-specific blocks such as `TESTS TO SATISFY` or
`test_command`). The static instruction body comes from the registered agent
definition. This removes the repeated full-file inlining that dominated token
cost, and it benefits users on the subagent backend too.

This requires the agent `.md` files to be self-contained as system prompts
(they already are -- they were written to be inlined verbatim). No change to the
agent files' content is expected; if any relies on an orchestrator-only framing
line, that line moves into the per-invocation prompt.

### New Step 1f: BACKEND SELECTION (preflight)

After Context7 detection, determine the backend:

1. Read the env var: `printenv CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` (Bash).
2. If the value is `1` AND team tooling is available in this session, set
   `backend = "teams"`. Otherwise `backend = "subagent"`.
3. Print one of:
   - `Agent Teams enabled -- using team backend (lean orchestration).`
   - `Agent Teams not enabled -- using subagent backend. Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 (Claude Code v2.1.178+) for lower token usage.`
4. Record `backend` in `manifest.json` (`"backend": "teams" | "subagent"`).

### Step 4 backend A: SUBAGENT (fallback, default)

Today's flow exactly -- 4a dispatch dev agents (background Tasks), 4a-bis TDD
gates, 4b verifier, 4c bug JSON, 4d dashboard, 4e commit, 4f manifest -- with the
single change that dispatches use `subagent_type` + parameter-only prompts
instead of inlined agent bodies. Re-run handoff (Step 6) keeps the existing
fresh-context general-purpose subagent that re-invokes `/plan-runner:run`.

### Step 4 backend B: TEAMS (when enabled)

Per wave, the lead:

1. **Create wave tasks.** Add one task per wave-plan agent to the shared task
   list, including owned-files and acceptance-criteria detail in each task, and
   dependency edges so the wave's tasks are all currently unblocked (cross-wave
   ordering is enforced by the lead opening one wave at a time, not by global DAG
   edges).
2. **Spawn teammates** for the wave, each referencing the role-selected
   `subagent_type`, with the per-invocation parameter prompt. Teammates
   self-claim the wave's tasks. Team size honors the existing <=6-agents-per-wave
   cap.
3. **Barrier.** Wait until all wave tasks are marked complete (or a teammate
   reports BLOCKED). Lead reads concise status from the task list / mailbox, not
   full JSON dumps.
4. **TDD gates** (4a-bis logic) -- run by the lead via Bash, unchanged.
5. **Verifier** -- lead dispatches `plan-runner:plan-verifier` (one per wave)
   with the wave's agent data. May be a teammate or a plain subagent; either way
   it is referenced by type, not inlined.
6. **Bug JSON, dashboard, commit, manifest** (4c-4f) -- lead-owned, unchanged.
7. Next wave.

Re-run handoff (Step 6) on the teams backend loops **in-place in the lead
session** (re-enter the pipeline with the fix-plan path) rather than spawning a
fresh subagent, because a teammate cannot spawn a nested team and the lead is
fixed for the session.

## Manifest changes

- Add top-level `"backend": "teams" | "subagent"`.
- No other schema changes. `manifest.schema.json` gains an optional `backend`
  enum field (additive, non-breaking).

## Error handling

- Env var set but team tooling absent (older build): fall back to subagent
  backend and print the version hint. Do not error.
- Teams backend, a wave task stuck (known status-lag bug): the lead's barrier
  has a bounded wait; on timeout it reads file state directly, treats unreported
  teammates as BLOCKED, and proceeds to gates/verify so the bug flows through the
  normal aggregate -> fix-plan loop. Surface a warning.
- All existing STOP conditions (missing/empty plan, validation failure, no test
  command under TDD, pre-commit hook failure) are unchanged and live in the
  shared core.

## Testing

- `tests/contract.test.js` and `validate_schemas.py`: extend manifest fixtures
  to include the optional `backend` field and assert the schema accepts both
  values and accepts manifests without it (back-compat).
- Backend selection is environment-driven and orchestrator-level; it is verified
  by inspection of the SKILL.md branch plus a manifest fixture per backend value.
  No runtime harness change beyond schema coverage.
- Existing test-fixtures (`tiny.md`, `medium.md`, `pathological.md`) remain valid
  inputs for both backends.

## Out of scope

- Changing wave-analysis logic, TDD gate semantics, aggregation, or PR steps.
- Rewriting agent `.md` bodies (only relocate any orchestrator-only framing line
  if found).
- Split-pane / tmux display configuration -- rely on the in-process default.
- Forcing or auto-setting the env var.

## Files touched

- `plugins/plan-runner/skills/run/SKILL.md` -- restructure: add Step 1f, replace
  inlining with `subagent_type` dispatch across all steps, add Step 4 teams
  backend, branch Step 6 re-run by backend.
- `plugins/plan-runner/.claude-plugin/plugin.json` -- version 0.5.0 -> 1.0.0,
  description note.
- `plugins/plan-runner/schemas/manifest.schema.json` -- add optional `backend`.
- `plugins/plan-runner/README.md` -- new "Token-efficient mode (Agent Teams,
  experimental)" section: env var, v2.1.178+, in-process default, Windows note.
- `plugins/plan-runner/tests/contract.test.js`, `tests/validate_schemas.py` --
  `backend` field coverage.
- Root `CLAUDE.md` and `.claude-plugin/marketplace.json` / root `README.md` --
  version + description bump per repo conventions.
