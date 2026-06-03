---
name: plan-runner:run
description: >
  Run a free-form Markdown implementation plan through a parallel agent swarm with
  per-wave verification. Each cycle: analyze the plan into file-disjoint waves of <=6
  agents, dispatch dev + verifier agents per wave, commit per wave, aggregate bugs at
  the end, and prompt to re-run with the generated fix-plan. Use when the user has a
  Markdown plan they want executed with built-in verification and bug-driven re-planning.
argument-hint: "<path-to-plan.md> [--verbose] [--no-tdd] [--test-cmd \"<cmd>\"]"
---

You are orchestrating a plan-runner pipeline cycle. The user's arguments are:

**"{$ARGUMENTS}"**

Follow this pipeline exactly. Do not skip steps.

## Argument parsing

Tokenize `{$ARGUMENTS}` on whitespace. The first non-flag token is the plan path. Flags:
- `--verbose` -- if present, the analyzer emits per-wave `rationale` and per-agent `complexity_signals`. If absent, those fields are omitted (default; smaller analyzer output).
- `--no-tdd` -- if present, skip the TDD enablement prompt entirely and run the classic (non-TDD) pipeline. Set `tdd_enabled = false`.
- `--test-cmd "<cmd>"` -- optional explicit test command. May include a `{file}` placeholder for single-file runs (e.g. `pytest {file}`). When provided, it is used verbatim and detection is skipped.

Set `verbose = true | false` based on the flag. Capture any `--test-cmd` value as `test_cmd_flag`. If `--no-tdd` is present, set `tdd_enabled = false` now; otherwise leave `tdd_enabled` unset here -- step 1a-bis assigns it. Strip all flags before using the plan path.

## Timing

Track elapsed time for each phase. At the start of each step run `date +%s` and store the timestamp. Compute durations at the end and write to `manifest.json`.

## Step 1: PRE-FLIGHT

Record the pipeline start time: `t_start = $(date +%s)`.

### 1a. Validate plan file

Parse the argument as a file path. If the path is empty or the file does not exist:

```
Error: plan file not found: <path>

Usage: /plan-runner:run <path-to-plan.md>
Example: /plan-runner:run docs/foo/feature.md
```

Then STOP.

Read the plan file. Store its contents in memory. If the file is empty, print:

```
Error: plan file is empty: <path>
```

Then STOP.

### 1a-bis. TDD enablement

- If `--no-tdd` was passed: set `tdd_enabled = false` and print `TDD disabled (--no-tdd). Running classic pipeline.` Skip the rest of this step.
- Otherwise prompt:

```
Enable TDD red-green approach for this run?
Testable tasks get a failing test written first (red), then implementation makes it pass (green).
[Y] = TDD on   [n] = classic pipeline

(Y/n)
```

If `Y` or empty: set `tdd_enabled = true`. If `n`: set `tdd_enabled = false`.

### 1b. Compute cycle directory

1. Compute `DATE=$(date +%Y-%m-%d)`.
2. Set `cycle_root = "docs/plan-runner/$DATE/"`.
3. If `cycle_root` does not exist, set `cycle_n = 1`.
4. Otherwise, list existing `cycle-*` directories under `cycle_root` and set `cycle_n = max(N) + 1`. Use Glob to find them.
5. Set `cycle_dir = "$cycle_root/cycle-$cycle_n/"`.
6. Create `cycle_dir/bugs/`:

```bash
mkdir -p "$cycle_dir/bugs"
```

### 1c. Pre-flight clean tree check

Run `git status --porcelain`. If output is non-empty:

```
Warning: working tree has uncommitted changes:
<git status output>

plan-runner commits per wave. If a wave fails mid-pipeline, recovery is easier
from a clean tree. Recommend: commit or stash first.

Continue anyway? (Y/n)
```

Wait for user input. If `n` (or empty default), STOP. If `Y`, continue.

### 1c-bis. Pick analyzer model (structure heuristic)

Before dispatching the analyzer, compute a cheap structure score on the plan contents:

- `task_boundary_count` = number of lines matching `^## ` OR `^### Task` OR `^Task \d+:` (case-sensitive).
- `path_token_count` = number of tokens matching `(?:[\w.-]+/)+[\w.-]+\.[A-Za-z0-9]{1,5}` (path segments with a file extension).

Use the Bash tool with `awk` / `grep -c` to count -- do NOT read the plan into your own context twice.

Decision:
- If `task_boundary_count >= 2` AND `path_token_count >= 2` AND `path_token_count >= task_boundary_count`: set `analyzer_model = "haiku"`. The plan is well-structured; DAG inference is mostly mechanical.
- Otherwise: set `analyzer_model = "sonnet"`.

Print one of:
```
Plan structure detected (N task markers, M explicit paths) -- using haiku for analyzer.
Plan is free-form -- using sonnet for analyzer.
```

### 1d. Detect Context7 MCP

Check whether the tools `mcp__context7__resolve-library-id` and `mcp__context7__query-docs` are available in this session. Set `context7_available = true | false`.

If true: print `Context7 MCP detected -- dev agents will use it for current framework docs.`
If false: print `Context7 MCP not detected -- dev agents will rely on training data only.`

### 1d-bis. Resolve test command + green baseline (only if tdd_enabled)

If `tdd_enabled` is false, skip this step entirely.

**Resolve the command** in priority order:
1. If `test_cmd_flag` is set, use it. If it contains `{file}`, that is the single-file form; derive the full form by removing the `{file}` token AND any now-dangling argument separator or trailing whitespace (e.g. `npm test -- {file}` -> `npm test`, `pytest {file}` -> `pytest`). Otherwise treat it as the full form and derive a single-file form if the runner supports it.
2. Otherwise detect from repo markers (use Glob/Read, do not guess blindly):
   - `package.json` with `scripts.test` -> full: `npm test`, single-file: `npm test -- {file}`
   - `pytest.ini` / `pyproject.toml` / `setup.cfg` with pytest -> full: `pytest`, single-file: `pytest {file}`
   - `go.mod` -> full: `go test ./...`, single-file: `go test ./{dir}`
   - `Cargo.toml` -> full: `cargo test`, single-file: `cargo test {mod}`
   - `*.csproj` / `*.sln` -> full: `dotnet test`, single-file: `dotnet test --filter {file}`
3. If detection is ambiguous or finds nothing, prompt the user once:

```
No test command detected. Enter the test command (use {file} for single-file runs),
or press Enter to STOP (re-run with --no-tdd for the classic pipeline):
```

   If the user supplies a command, use it. **If the user enters nothing, STOP** with:

```
No test command available -- cannot run TDD gates.
Re-run with --no-tdd to use the classic pipeline.
```

   Do NOT silently downgrade to classic.

**Capture the green baseline.** Run the full test command via Bash. Record the set of currently-failing test identifiers as `baseline_failing` (empty if the suite is green). If the suite is already red, print a warning that the baseline is not clean and that the listed failures will be subtracted when attributing new failures.

Store the resolved command (both forms) and `baseline_failing` for the manifest `tdd` block.

### 1e. Initialize manifest

Write a starter `manifest.json` to `$cycle_dir/manifest.json`:

```json
{
  "cycle": <cycle_n>,
  "input_plan": "<plan path>",
  "started_at": "<ISO 8601 from `date -Iseconds`>",
  "completed_at": null,
  "context7_available": <bool>,
  "waves": [],
  "total_bugs": 0,
  "next_cycle_plan": null,
  "tdd": {
    "enabled": <tdd_enabled>,
    "test_command": {"full": "<resolved full or null>", "single_file": "<resolved single-file or null>"},
    "baseline_failing": [<baseline ids>],
    "tasks": []
  }
}
```

(When `tdd_enabled` is false, write `"tdd": {"enabled": false}` and omit the other keys.)

Record `t_preflight_done = $(date +%s)`.

## Step 2: ANALYZE PLAN

Print:
```
[Phase 1/4] Analyzing plan and computing wave plan...
```

Prepare the plan contents with 1-indexed line-number prefixes. Using Bash:

```bash
awk '{printf "%4d\t%s\n", NR, $0}' "<plan path>"
```

Capture the result as `PLAN_WITH_LINES`.

Dispatch ONE plan-analyzer agent with the prefixed plan inlined:

```
You are being deployed as the plan-analyzer for plan-runner cycle <cycle_n>.

Source plan path: <plan path>
Context7 available: <bool>
Verbose: <verbose>
TDD enabled: <tdd_enabled>
Test command: <resolved single-file form, or "n/a"> (full: <resolved full form, or "n/a">)

PLAN CONTENTS (1-indexed line-number prefixes):
<<<
<PLAN_WITH_LINES inlined here>
>>>

<inline the full content of plugins/plan-runner/agents/plan-analyzer.md here as your instructions>

Return only the JSON wave plan, nothing else.
```

Run the agent in foreground (you need its output to proceed). Use `model: <analyzer_model>` from step 1c-bis (that field applies to the analyzer itself; per-task `recommended_model` applies to dev agents downstream).

When the agent returns, parse the JSON. If parsing fails:
- Retry ONCE with: "Your previous response could not be parsed as JSON. Return ONLY a single JSON object matching wave-plan.schema.json, with no prose before or after."
- If second attempt also fails, print the agent's raw output and STOP.

Validate the wave plan:
1. Conforms to `plugins/plan-runner/schemas/wave-plan.schema.json` (use Python+jsonschema if available; otherwise structural check: required fields present, agent counts <=6, file paths unique within each wave). Note that `rationale` and `complexity_signals` are optional -- do NOT fail validation if they are absent.
2. Within each wave, the union of `owned_files` across all agents has no duplicates.
3. Every agent has a `task_excerpt_lines` matching `^[0-9]+-[0-9]+$` where START <= END and END <= total lines in the plan file.

If validation fails, print the failure reason and STOP. Do NOT auto-retry beyond what is specified above (avoid infinite loops).

If `waves` is empty:
```
Plan analysis returned 0 waves. Reason: <uncovered_plan_sections joined>
No tasks to execute. STOP.
```
Then STOP.

Write the wave plan to `$cycle_dir/wave-plan.json`.

Record `t_analyze_done = $(date +%s)`.

## Step 3: DISPLAY WAVE PLAN

Print the wave plan in human-readable form:

```
Wave Plan (<W> waves, <total_agents> dev agents total)
========================================================
Wave 1 (<N> agents, parallel):
  agent-1 [test]        : <task_title>   -> <owned_files joined with comma>
  agent-2 [impl]        : <task_title>   -> <owned_files joined with comma>
  agent-3 [standalone]  : <task_title>   -> <owned_files joined with comma>
  ...

Non-testable tasks (will run without a test gate):
  - <task_title>: <non_testable_reason>     (one line per standalone task with a reason)

Uncovered plan sections: <sections or "none">
Estimated total agents: <total_dev + <W> verifiers + 2 (analyzer + aggregator)>
```

If `uncovered_plan_sections` is non-empty, print a warning that those sections will not be executed and the user can re-run with a revised plan after this cycle completes.

The bracketed tag is the agent `role` (`test`, `impl`, or `standalone`). In classic (non-TDD) runs, agents have no role and the tag is omitted. The "Non-testable tasks" block lists standalone agents that carry a `non_testable_reason`, so the user can challenge a mis-classification before execution.

Proceed automatically without waiting for user input.

Record `t_confirmed = $(date +%s)`.

(Continued in Step 4: WAVE EXECUTION)

## Step 4: WAVE EXECUTION

For each wave in `wave_plan.waves` (sequentially):

Print:
```
[Phase 2/4] Wave <W>/<total_W>: dispatching <N> dev agents in parallel...
```

Record `t_wave_<W>_start = $(date +%s)`.

### 4a. Dispatch dev agents (parallel, background)

Create one Claude Task per dev agent for live UI progress. Use TaskCreate.

In a SINGLE message, dispatch all dev agents in this wave with `run_in_background: true`. For each dev agent, the prompt template:

```
You are being deployed as a dev agent for plan-runner cycle <cycle_n>, wave <W>.

agent_id: <agent_id>
task_title: <task_title>
plan_path: <absolute path to the source plan>
task_excerpt_lines: <task_excerpt_lines>
context7_available: <bool>

OWNED FILES (you may write only these):
<owned_files joined with newlines>

ACCEPTANCE CRITERIA:
<acceptance_criteria joined with newlines, prefixed with "- ">

<inline the full content of plugins/plan-runner/agents/plan-dev.md here as your instructions>

Return only the JSON status, nothing else.
```

The dev agent reads the task prose from `plan_path` using the line range -- the orchestrator does not inline the task text. This keeps dev prompts small and lets multiple agents in a wave share one cached plan read.

Use the `recommended_model` from the wave-plan for each agent.

As each background agent completes, the orchestrator receives a notification. Collect all dev agent return JSONs.

For each dev agent return:
1. Parse the JSON. If parse fails, treat as `{"agent_id": "<id>", "status": "BLOCKED", "files_written": [], "files_unexpectedly_modified": [], "context7_queries": [], "summary": "agent returned non-JSON output", "concerns": ["unparseable response"]}` and continue.
2. Update the corresponding Task to `completed`.
3. Record the dev_status in a wave-state map.

Wait for ALL dev agents in this wave to complete before proceeding.

### 4a-bis. Run gates (only if tdd_enabled)

If `tdd_enabled` is false, skip this step (classic pipeline).

Gates are applied **per agent**, by `role`, because a single wave may mix test-author, impl, and standalone agents. For each agent in the wave, run the matching gate via Bash and capture verbatim output. There are **No inline retries** -- every gate failure is recorded as captured output for the verifier and surfaces as a bug routed through the normal aggregate -> fix-plan -> re-run loop.

**Test-author agent (role: test-author) -> RED gate:**
1. For each file in the agent's reported `test_files`, run the single-file test command (substitute `{file}`). Capture exit code + output.
2. Run the full suite; diff the failing-test set against `tdd.baseline_failing`.
3. Record `red_run` = `{cmd, exit, result: exit != 0 ? "FAILED" : "PASSED", valid_red: null}`. Leave `valid_red` null here -- the orchestrator cannot tell a genuine failure (import / not-implemented / assertion) from an invalid one (syntax / collection error) without analysis. The red-gate verifier (Step 4b) makes that call; backfill `valid_red` in the manifest from the verifier's verdict after 4b.
4. This agent's `captured_test_output` (for the verifier) = the per-file run output (all `test_files`) + any new pre-existing failures from the suite diff.

**Impl agent (role: impl) -> GREEN gate:**
1. For each file in the agent's `tests_to_satisfy`, run the single-file test command (substitute `{file}`). Capture exit + output per file.
2. Run the full suite; diff against `tdd.baseline_failing` to detect newly-broken pre-existing tests.
3. Record `green_run` = `{cmd, exit, result: all target files passed ? "PASSED" : "FAILED"}`.
4. `captured_test_output` = the per-file `tests_to_satisfy` run output + any new suite failures.

**Standalone agent (role: standalone or classic):** no gate; `captured_test_output` is empty.

**Append evidence to the manifest `tdd.tasks` array** (one entry per testable task, keyed by `task_title`): `{task, test_files, red_run, green_run}`. The red_run is filled when the test-author wave runs; green_run when the paired impl wave runs (match by task_title / tests_to_satisfy).

**Invalid red (paired impl skipped):** if the red gate shows the new tests PASSED (exit 0 -- the orchestrator detects this directly) OR the red-gate verifier judged the red invalid (syntax / collection error), do NOT dispatch the paired impl agent -- mark it BLOCKED with reason "paired test red gate invalid" and set `valid_red: false` for that task in the manifest. The verifier still emits the P1 bug from the captured output, which flows to the next cycle.

### 4b. Dispatch wave verifier (single agent, background)

Print:
```
[Wave <W>] All dev agents complete. Dispatching wave verifier...
```

Dispatch ONE verifier for the entire wave. Include all dev agents' data in the prompt:

```
You are being deployed as the wave verifier for plan-runner cycle <cycle_n>, wave <W>.

wave_id: <W>

AGENTS IN THIS WAVE:
<for each dev agent, repeat this block:>
---
agent_id: <agent_id>
task_title: <task_title>
acceptance_criteria:
<acceptance_criteria as bulleted list>

OWNED FILES (the dev agent was allowed to write these):
<owned_files joined with newlines>

DEV AGENT REPORTED:
- status: <dev_status>
- files_written: <dev's files_written joined with newlines>
- files_unexpectedly_modified: <dev's files_unexpectedly_modified joined with newlines>
- concerns: <dev's concerns joined with newlines>
- role: <agent role or "standalone">
- tests_to_satisfy: <impl only: tests_to_satisfy joined with newlines, else "n/a">
- captured_test_output: |
  <verbatim gate output captured in 4a-bis, or "n/a" for standalone/classic>
---
<end repeat>

<inline the full content of plugins/plan-runner/agents/plan-verifier.md here as your instructions>

Return only the JSON bug report, nothing else.
```

Use `model: sonnet`.

Wait for the verifier to complete.

### 4c. Write bug JSON

Parse the verifier's return. If parse fails, synthesize:
```json
{"wave_id": <W>, "verifier_status": "UNVERIFIABLE", "agent_statuses": {}, "bugs": [{"bug_id": "wave-<W>-bug-1", "severity": "P2", "category": "incorrect_implementation", "title": "Wave verifier returned non-JSON output", "file": "n/a", "line": null, "evidence": "<truncated raw output>", "expected": "Valid JSON bug report", "suggested_fix": "Re-run verification manually"}]}
```

Write the JSON to `$cycle_dir/bugs/wave-<W>.json`.

### 4d. Render wave dashboard

Print a wave summary table. The "Verify" and "Bugs" columns reflect the single wave verifier result (the verifier_status and total bugs across all agents):

```
Wave <W>/<total_W> complete (<duration>s)
============================================================
 Agent | Task                       | Dev          | Status per agent
-------|----------------------------|--------------|------------------
   1   | <task_title>               | DONE         | <agent_statuses[agent_id]>
   2   | <task_title>               | DONE         | <agent_statuses[agent_id]>
   3   | <task_title>               | BLOCKED      | <agent_statuses[agent_id] or N/A>
-------|----------------------------|--------------|-----------------
Wave verifier: <verifier_status>   Total bugs: <bugs array length>
============================================================
```

### 4e. Commit the wave

Compute verifier-status summary for the commit message:
- If all verifiers returned CLEAN: `"verified clean"`
- If any verifier returned BUGS_FOUND: `"<total_bugs> bugs flagged"`
- If any verifier returned UNVERIFIABLE: append `"<N> unverifiable"`

Run:
```bash
git add -A
git status --porcelain | head -1   # check if there's anything to commit
```

If nothing to commit (all dev agents BLOCKED, no files changed):
- Set `commit_sha = null`, `skipped_reason = "no changes"` in manifest entry.
- Print `Wave <W>: nothing to commit.`
- Continue to next wave.

Otherwise:
```bash
git commit -m "plan-runner cycle <cycle_n> wave <W>/<total_W>: <task_titles_summary> (<verifier_summary>)"
```

The `<task_titles_summary>` is a comma-joined list of agent task titles, truncated if >80 chars. Example: `"add User model, add Session model, define auth types"`.

Capture the commit SHA: `commit_sha=$(git rev-parse HEAD)`.

If the commit fails (pre-commit hook):
```
Pre-commit hook failed for wave <W>:
<hook output>

Continue without committing this wave? (Y/n)
```
If Y: leave wave uncommitted, continue (subsequent wave commits via `git add -A` will include it).
If n: STOP.

### 4f. Update manifest

Append a wave entry to `$cycle_dir/manifest.json`:

```json
{
  "wave_id": <W>,
  "duration_seconds": <wave duration>,
  "agents": [
    {"agent_id": "<id>", "dev_status": "<status>"}
  ],
  "wave_verifier_status": "<verifier_status>",
  "wave_bug_count": <total bugs in wave>,
  "commit_sha": "<sha or null>",
  "skipped_reason": "<reason or null>"
}
```

Use Read+Write or jq to update the manifest in place. If jq is unavailable, read the JSON, mutate it in memory, write it back.

Record `t_wave_<W>_end = $(date +%s)`.

Move to the next wave. After the last wave completes, proceed to Step 5.

## Step 5: AGGREGATE

Count total bugs across all bug JSONs. If total bugs == 0:

```
[Phase 3/4] All waves complete. Zero bugs flagged -- skipping aggregation.
```

Update manifest: `total_bugs: 0`, `completed_at: <ISO timestamp>`. Skip to Step 7 (final summary).

If total bugs > 0:

```
[Phase 3/4] Aggregating <N> bugs across <W> waves...
```

Dispatch ONE plan-aggregator agent (foreground, model: sonnet):

```
You are being deployed as the plan-aggregator for plan-runner cycle <cycle_n>.

cycle_dir: <absolute path to $cycle_dir>
input_plan: <absolute path to the original plan>

Read all bug JSONs under <cycle_dir>/bugs/*.json.
Read the wave plan at <cycle_dir>/wave-plan.json for task context.

<inline the full content of plugins/plan-runner/agents/plan-aggregator.md here as your instructions>

Write bugs.md and fix-plan.md to <cycle_dir> as instructed. Return the status JSON.
```

The aggregator writes the two files itself. When it returns, parse its status JSON.

If the aggregator crashes or returns non-JSON:
```
Aggregator failed -- bug JSONs are intact at <cycle_dir>/bugs/.
You can run aggregation manually by re-invoking the agent.
```
Skip to Step 7 with `total_bugs = <count>`, `next_cycle_plan = null`.

Update manifest:
- `total_bugs: <from aggregator status>`
- `next_cycle_plan: <fix-plan path from aggregator>`
- `completed_at: <ISO timestamp>`

## Step 6: RE-RUN PROMPT (only if total_bugs > 0)

Print the bug summary:

```
[Phase 4/4] Bug Report
======================
P0: <N>   P1: <N>   P2: <N>   P3: <N>
Total: <N> bugs across <W> waves

Bug report:    <bugs.md path>
Fix plan:      <fix-plan.md path>
```

If cycle_n > 1, add a convergence hint:
```
(This was cycle <cycle_n>. Cycle <cycle_n - 1> had <prior_total> bugs, this cycle has <current_total>.)
```

Read `prior_total` from the previous cycle's manifest.json if it exists.

Then prompt:

```
Run plan-runner again with the generated fix-plan to address these bugs?
[Y] = auto-handoff to fresh-context subagent running /plan-runner:run <fix-plan.md>
[n] = stop here (you can resume later with the same command)

(Y/n)
```

If `n`: print `Stopping fix-plan re-run. Proceeding to PR step.` Proceed to Step 8.

If `Y` (or empty default): dispatch a `general-purpose` Agent with this self-contained prompt:

```
You are executing the plan-runner:run skill in a fresh session.

Invoke the Skill tool with:
  skill: "plan-runner:run"
  args: "<absolute path to fix-plan.md>"

The fix-plan file already exists on disk. Read it fresh. Follow the skill exactly.

When the skill completes, return a concise summary: cycle number, waves run, total bugs found, whether the user accepted another re-run, and the path to the cycle's bugs.md. Do not re-describe work the user already saw -- just the outcome.
```

Use absolute paths so the subagent's path resolution does not depend on shared working-directory state.

When the subagent returns, print its summary verbatim and STOP.

## Step 7: FINAL SUMMARY (clean run only)

Reach this step ONLY when total_bugs == 0 (no aggregator dispatched, no re-run prompt).

Print:

```
plan-runner cycle <cycle_n> complete -- no bugs found.
==========================================================
Waves: <W>
Dev agents: <total dev agents>
Wave verifiers: <W> (1 per wave)
Commits: <count of waves with non-null commit_sha>
Duration: <total elapsed in Xm Ys>

Manifest: <path to manifest.json>
```

Update manifest `completed_at` and write to disk. Proceed to Step 8.

## Step 8: OPEN PR

Determine the current branch:

```bash
git branch --show-current
```

Push the branch to origin:

```bash
git push -u origin <branch>
```

Build the PR title and body from pipeline state:

- **Title:** `plan-runner: <plan file basename> (cycle <cycle_n>)`
- **Body:**

```
## Summary
<bulleted list of task_title values from the wave plan, one per line>

## plan-runner stats
- Cycles: <cycle_n>
- Waves: <W>
- Dev agents: <total dev agents dispatched>
- Bugs found: <total_bugs>

Generated with plan-runner
```

Check whether `gh` is available:

```bash
gh --version
```

**If `gh` is available**, create the PR:

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
<body>
EOF
)"
```

Print the PR URL returned by `gh pr create`. STOP.

**If `gh` is not available**, print:

```
Branch pushed to origin/<branch>.

Open a PR with the following details:

Title: <title>

Body:
<body>
```

STOP.

## Phase Timing Summary (always print before STOP unless STOP was an early-exit error)

```
Phase Timing:
  Pre-flight       <Xm Ys>
  Analyze plan     <Xm Ys>
  User confirm     (excluded from total)
  Wave execution   <Xm Ys>   (<W> waves)
  Aggregation      <Xm Ys>   (skipped if 0 bugs)
  Open PR          <Xm Ys>
  --------------------------------
  Total            <Xm Ys>
```
