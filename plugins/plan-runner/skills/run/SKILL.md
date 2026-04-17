---
name: plan-runner:run
description: >
  Run a free-form Markdown implementation plan through a parallel agent swarm with
  per-wave verification. Each cycle: analyze the plan into file-disjoint waves of <=6
  agents, dispatch dev + verifier agents per wave, commit per wave, aggregate bugs at
  the end, and prompt to re-run with the generated fix-plan. Use when the user has a
  Markdown plan they want executed with built-in verification and bug-driven re-planning.
argument-hint: "<path-to-plan.md>"
---

You are orchestrating a plan-runner pipeline cycle. The user's plan path is:

**"{$ARGUMENTS}"**

Follow this pipeline exactly. Do not skip steps.

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

### 1d. Detect Context7 MCP

Check whether the tools `mcp__context7__resolve-library-id` and `mcp__context7__query-docs` are available in this session. Set `context7_available = true | false`.

If true: print `Context7 MCP detected -- dev agents will use it for current framework docs.`
If false: print `Context7 MCP not detected -- dev agents will rely on training data only.`

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
  "next_cycle_plan": null
}
```

Record `t_preflight_done = $(date +%s)`.

## Step 2: ANALYZE PLAN

Print:
```
[Phase 1/4] Analyzing plan and computing wave plan...
```

Dispatch ONE plan-analyzer agent with the full plan contents inlined:

```
You are being deployed as the plan-analyzer for plan-runner cycle <cycle_n>.

Source plan path: <plan path>
Context7 available: <bool>

PLAN CONTENTS:
<<<
<full plan file contents inlined here>
>>>

<inline the full content of plugins/plan-runner/agents/plan-analyzer.md here as your instructions>

Return only the JSON wave plan, nothing else.
```

Run the agent in foreground (you need its output to proceed). Use `model: sonnet` regardless of analyzer's recommended_model field (that field applies to dev agents).

When the agent returns, parse the JSON. If parsing fails:
- Retry ONCE with: "Your previous response could not be parsed as JSON. Return ONLY a single JSON object matching wave-plan.schema.json, with no prose before or after."
- If second attempt also fails, print the agent's raw output and STOP.

Validate the wave plan:
1. Conforms to `plugins/plan-runner/schemas/wave-plan.schema.json` (use Python+jsonschema if available; otherwise structural check: required fields present, agent counts <=6, file paths unique within each wave).
2. Within each wave, the union of `owned_files` across all agents has no duplicates.

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
  agent-1: <task_title>     -> <owned_files joined with comma>
  agent-2: <task_title>     -> <owned_files joined with comma>
  ...
Wave 2 (<N> agents, parallel):
  ...

Uncovered plan sections: <sections or "none">
Estimated total agents: <total_dev + <W> verifiers + 2 (analyzer + aggregator)>
```

If `uncovered_plan_sections` is non-empty, print a warning that those sections will not be executed and the user can re-run with a revised plan after this cycle completes.

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
context7_available: <bool>

TASK EXCERPT:
<<<
<task_excerpt>
>>>

OWNED FILES (you may write only these):
<owned_files joined with newlines>

ACCEPTANCE CRITERIA:
<acceptance_criteria joined with newlines, prefixed with "- ">

<inline the full content of plugins/plan-runner/agents/plan-dev.md here as your instructions>

Return only the JSON status, nothing else.
```

Use the `recommended_model` from the wave-plan for each agent.

As each background agent completes, the orchestrator receives a notification. Collect all dev agent return JSONs.

For each dev agent return:
1. Parse the JSON. If parse fails, treat as `{"agent_id": "<id>", "status": "BLOCKED", "files_written": [], "files_unexpectedly_modified": [], "context7_queries": [], "summary": "agent returned non-JSON output", "concerns": ["unparseable response"]}` and continue.
2. Update the corresponding Task to `completed`.
3. Record the dev_status in a wave-state map.

Wait for ALL dev agents in this wave to complete before proceeding.

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

If `n`: print `Stopping. Bugs and fix-plan saved at <cycle_dir>. Re-run later with /plan-runner:run <fix-plan path>.` STOP.

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

Update manifest `completed_at` and write to disk. STOP.

## Phase Timing Summary (always print before STOP unless STOP was an early-exit error)

```
Phase Timing:
  Pre-flight       <Xm Ys>
  Analyze plan     <Xm Ys>
  User confirm     (excluded from total)
  Wave execution   <Xm Ys>   (<W> waves)
  Aggregation      <Xm Ys>   (skipped if 0 bugs)
  --------------------------------
  Total            <Xm Ys>
```
