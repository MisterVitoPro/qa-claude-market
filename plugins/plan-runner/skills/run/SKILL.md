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

## Step 3: USER CONFIRMATION

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
Estimated total agents: <total_dev + total_verifier + 2 (analyzer + aggregator)>

Proceed? (Y/n)
```

Wait for user input. If `n`, STOP (the wave-plan.json is preserved on disk for inspection). If `Y`, continue.

If `uncovered_plan_sections` is non-empty, the prompt should make that visible -- the user may want to abort and revise the plan rather than execute a partial pipeline.

Record `t_confirmed = $(date +%s)`.

(Continued in Step 4: WAVE EXECUTION)
