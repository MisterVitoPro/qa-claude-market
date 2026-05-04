---
name: migration-runner:run
description: >
  Execute the upgrade plan written by /migration-runner:detect, one package per wave,
  verifying build + typecheck + tests after each upgrade. On verifier failure: hard
  reset to pre-wave SHA, write fix-plan.md, halt. Resumable with --resume.
argument-hint: "[--package <name>] [--resume] [--ecosystem <name>]"
---

You are orchestrating a `migration-runner:run` execution. Follow these steps exactly.

## Step 0: Parse arguments

Parse `$ARGUMENTS` for:
- `--package <name>` — single-package mode
- `--resume` — continue from last non-completed wave
- `--ecosystem <name>` — restrict to one ecosystem

## Step 1: Preconditions

Run each check; abort with a clear error if any fails:
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/git-helpers.js" require-repo`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/git-helpers.js" require-clean`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/git-helpers.js" is-detached` — if it prints `true`, abort: "detached HEAD; check out a branch first."
- Verify `docs/migration-runner/plan.json` exists; otherwise: "no plan found; run `/migration-runner:detect` first."

## Step 2: Load plan and state

Run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/state.js" read docs/migration-runner/plan.json > /tmp/plan.json
node "${CLAUDE_PLUGIN_ROOT}/scripts/state.js" read .migration-runner/state.json > /tmp/state.json || true
```

Build the wave list:
- Default: all waves from plan.json in order.
- With `--ecosystem X`: only waves where `wave.ecosystem === X`.
- With `--package X`: a single wave matching `wave.package === X`. Abort if not present.
- With `--resume`: skip waves where state shows `status: "completed"`.

Initialize state.json if missing: every wave starts as `{ wave_index, package, status: "pending" }`.

## Step 3: Execute waves sequentially

For each wave in the wave list:

1. Capture pre-wave SHA: `node "${CLAUDE_PLUGIN_ROOT}/scripts/git-helpers.js" current-sha` → `PRE_SHA`.

2. Dispatch the `migration-applier` agent with this wave's `{ ecosystem, manifest_path, package, from_version, to_version }`. Capture its return JSON.

3. If applier returned `{ "status": "failed", ... }`:
   - Run `git reset --hard <PRE_SHA>`.
   - Write `docs/migration-runner/fix-plan.md` (see Step 4).
   - Mark wave `failed` in state.json.
   - Print summary and halt with exit 1.

4. If applier returned `{ "status": "applied" }`, dispatch the `migration-verifier` agent with `{ ecosystem, wave_index, timeout_seconds: <from config or 600> }`. Capture its return JSON.

5. If verifier returned `{ "status": "fail", ... }`:
   - Run `git reset --hard <PRE_SHA>`.
   - Write `docs/migration-runner/fix-plan.md` with the verifier output (failed_step, stdout_tail, full_output_path).
   - Mark wave `failed` in state.json.
   - Print summary and halt with exit 1.

6. If verifier returned `{ "status": "pass" }`:
   - Try to commit: `node "${CLAUDE_PLUGIN_ROOT}/scripts/git-helpers.js" commit-all "chore(deps): bump <package> from <from_version> to <to_version>"`.
   - **If the commit fails** (non-zero exit; capture stderr): treat as a wave failure — run `git reset --hard <PRE_SHA>`, write `fix-plan.md` (Step 4 template) substituting the failed step as `commit` and including the git stderr in the "Last 200 lines" block, mark wave `failed`, halt.
   - Otherwise, get the new SHA via `current-sha`, update state.json: `{ status: "completed", commit_sha: "<sha>" }`, and continue to the next wave.

## Step 4: fix-plan.md template (on failure)

Write to `docs/migration-runner/fix-plan.md`:

```markdown
# migration-runner fix plan

Halted on **wave <N>**: `<package>` (<ecosystem>) <from_version> -> <to_version>.

## What failed
**Step:** <build|typecheck|test|apply>

## Last 200 lines of output
\`\`\`
<stdout_tail from verifier or stderr from applier>
\`\`\`

Full log: `<full_output_path>`

## Suggested next steps
1. Manually investigate the failure in `<package>`. The pre-wave state is restored (the wave was reverted).
2. Optionally pin a different target version by adding `<package>` to `ignore` in `.migration-runner.json` and re-running `detect`, OR manually upgrading and committing yourself.
3. Once the underlying issue is fixed (or the package excluded), resume with:

   `/migration-runner:run --resume`
```

## Step 5: Final user message

If all waves passed:

> Migration complete. Upgraded N packages across <ecosystems> in <N> commits. Run `git log` to review.

If halted:

> Halted at wave <N> (`<package>`). Wrote fix-plan to `docs/migration-runner/fix-plan.md`.
> Resume with `/migration-runner:run --resume` after addressing the issue.

## Rules

- Always halt on the first failure. Never continue past a failed wave.
- Never bypass the verifier even with --package mode.
- Always commit after a clean wave; never leave applied-but-uncommitted state.
- Do not modify the plan.json during execution.
