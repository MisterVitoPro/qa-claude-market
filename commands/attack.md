---
description: "Deploy a QA agent swarm to analyze the codebase and produce a prioritized findings report, implementation spec, and test plan"
argument-hint: "<prompt describing what to analyze>"
---

You are orchestrating a QA Swarm analysis. The user's analysis prompt is:

**"{$ARGUMENTS}"**

Follow this pipeline exactly. Do not skip steps.

## Timing

Track elapsed time for each phase. At the start of each step, run `date +%s` (Bash tool) to capture the Unix timestamp. Store these timestamps so you can compute durations at the end. You will report per-phase durations in the handoff summary.

## Step 1: SETUP

Record the pipeline start time: run `date +%s` and store it as `t_start`.

Generate a codebase map:
1. Use the Glob tool to list all source files (exclude node_modules, target, dist, build, .git, vendor, __pycache__)
2. For the key files (entry points, main modules, config files), read the first 50 lines to capture exports/signatures
3. Compile this into a codebase map string: file tree + key signatures

Store the codebase map -- you will pass it to every agent.

Count the total source files and estimate total lines of code from the map. Print a cost estimate and codebase summary:

```
QA Swarm -- Codebase Summary
==============================
Source files: {file_count}
Estimated lines: ~{line_count}

Estimated cost (API tokens):
  Core swarm    (11 Sonnet agents):  ~60% of total
  Pre-aggregator (1 Haiku agent):   ~5% of total
  Aggregator     (1 Opus agent):    ~15% of total
  Architect      (1 Opus agent):    ~10% of total
  TDD            (1 Sonnet agent):  ~10% of total

  Small project  (< 50 files):   ~$0.50-1
  Medium project (50-200 files): ~$1-3
  Large project  (200+ files):   ~$3-10

Proceed? (Y/n)
```

Wait for user confirmation. If "n", stop and print "Aborted."

Record timestamp: run `date +%s` and store as `t_setup_done`.

## Step 2: CORE SWARM

Print:
```
[Phase 1/6] Deploying 11 core QA agents in parallel...
  Security Auditor, Error Handling, Performance, Concurrency,
  API Contract, Edge Case, Logic, Data Integrity,
  Architecture, Resilience, Resource Management
```

Launch all 11 core QA agents IN PARALLEL using the Agent tool. Each agent gets the same prompt structure:

For each agent, use this prompt template (fill in the agent-specific parts):

```
You are being deployed as part of a QA swarm analysis.

MISSION: {user's original prompt}

CODEBASE MAP:
{the codebase map from Step 1}

{Read the agent definition file from agents/qa-{name}.md and include its full content here as the agent's instructions}

Analyze the codebase according to your specialty. Return your findings as structured JSON.
```

Launch these agents in parallel (all in one message with multiple Agent tool calls):
1. qa-security-auditor (model: sonnet)
2. qa-error-handling (model: sonnet)
3. qa-performance (model: sonnet)
4. qa-concurrency (model: sonnet)
5. qa-api-contract (model: sonnet)
6. qa-edge-case (model: sonnet)
7. qa-logic-correctness (model: sonnet)
8. qa-data-integrity (model: sonnet)
9. qa-architecture (model: sonnet)
10. qa-resilience (model: sonnet)
11. qa-resource-mgmt (model: sonnet)

**Wait for ALL 11 agents to complete before proceeding.** Do not start Step 3 until every agent has returned its results. If any agent fails or returns an error instead of findings, log it and continue with the remaining agents' results:
```
Agent {name} failed: {error}
Continuing with {N}/11 agent results.
```

Record timestamp: run `date +%s` and store as `t_core_done`.

## Step 3: PRE-AGGREGATION

Print:
```
[Phase 2/6] Core swarm complete. Deduplicating and detecting project type...
```

Launch the qa-pre-aggregator agent (model: haiku) with:
- All 11 core agent findings combined
- Access to the project file tree

The pre-aggregator will return:
- Deduplicated findings with corroboration map
- Project type detection
- Optional agent recommendations

Record timestamp: run `date +%s` and store as `t_preagg_done`.

## Step 4: USER CONFIRMATION

Present the pre-aggregator's optional agent recommendations to the user:

```
QA Swarm -- Core Analysis Complete
===================================
Core agents (11) found {N} findings ({N} after dedup).

Detected: {project type}

Optional agents recommended:
  + {agent name} -- {reason}
  + {agent name} -- {reason}

Skipping:
  - {agent name} -- {reason}
  - {agent name} -- {reason}

Proceed with these optional agents? (Y/n, or adjust: "+logging -supply-chain")
```

Wait for user response. Parse any adjustments.

Record timestamp: run `date +%s` and store as `t_confirm_done`.

## Step 5: OPTIONAL SWARM

If any optional agents are approved, print:
```
[Phase 3/6] Deploying {N} optional agents in parallel...
  {agent names, comma-separated}
```

If no optional agents are approved, print:
```
[Phase 3/6] No optional agents selected. Skipping.
```

If any optional agents are approved, launch them IN PARALLEL using the Agent tool.

Each optional agent gets:
- The user's original prompt
- The codebase map
- A summary of core findings (so they don't duplicate work)
- Their agent-specific instructions

**Wait for ALL optional agents to complete before proceeding.** If any optional agent fails, log it and continue with available results:
```
Optional agent {name} failed: {error}
Continuing with {N}/{total} optional agent results.
```

Record timestamp: run `date +%s` and store as `t_optional_done`. If no optional agents were run, set `t_optional_done = t_confirm_done`.

## Step 6: FINAL AGGREGATION

Print:
```
[Phase 4/6] Ranking and corroborating all findings...
```

Launch the qa-aggregator agent (model: opus) with:
- All deduplicated findings (core + optional)
- The corroboration map
- Project type info

The aggregator produces the final ranked report in markdown format.

Record timestamp: run `date +%s` and store as `t_agg_done`.

## Step 7: PARALLEL OUTPUT

Print:
```
[Phase 5/6] Generating implementation spec and test plan...
```

Launch TWO agents IN PARALLEL:

1. **qa-solutions-architect** (model: opus):
   - Receives the final ranked report
   - Has access to the codebase
   - Produces the implementation spec

2. **qa-tdd** (model: sonnet):
   - Receives the final ranked report
   - Has access to the codebase (to read existing test patterns)
   - Produces the test plan (Mode 1)

Record timestamp: run `date +%s` and store as `t_output_done`.

## Step 8: SAVE FILES

Print:
```
[Phase 6/6] Saving reports...
```

Get today's date and save the three output files:
1. Write the aggregator's report to `docs/qa-swarm/{DATE}-report.md`
2. Write the solutions architect's spec to `docs/qa-swarm/{DATE}-spec.md`
3. Write the TDD agent's test plan to `docs/qa-swarm/{DATE}-tests.md`

Create the `docs/qa-swarm/` directory if it does not exist.

Record timestamp: run `date +%s` and store as `t_save_done`.

## Step 9: HANDOFF

Compute phase durations from stored timestamps (format as Xm Ys):
- Setup:          `t_setup_done - t_start`
- Core Swarm:     `t_core_done - t_setup_done`
- Pre-aggregation:`t_preagg_done - t_core_done`
- User Confirm:   `t_confirm_done - t_preagg_done`  (skip this from the total -- it's wait time)
- Optional Swarm: `t_optional_done - t_confirm_done` (show "skipped" if none were run)
- Aggregation:    `t_agg_done - t_optional_done`
- Spec + Tests:   `t_output_done - t_agg_done`
- Save Files:     `t_save_done - t_output_done`
- Total:          `t_save_done - t_start` minus user confirm wait time

Print the summary and next steps. Count the actual agents dispatched during this run:
- Core agents: always 11 (Sonnet)
- Pre-aggregator: always 1 (Haiku)
- Optional agents: count how many were approved in Step 5 (Sonnet)
- Aggregator: always 1 (Opus)
- Solutions Architect: always 1 (Opus)
- TDD Agent: always 1 (Sonnet)

```
QA Swarm Analysis Complete
============================
Findings: {total} ({P0} P0, {P1} P1, {P2} P2, {P3} P3)
Confidence: {confirmed} confirmed, {likely} likely, {suspected} suspected

Phase Timing:
  Setup           {Xm Ys}
  Core Swarm      {Xm Ys}   (11 Sonnet agents)
  Pre-aggregation {Xm Ys}   (1 Haiku agent)
  Optional Swarm  {Xm Ys}   ({N} Sonnet agents) or "skipped"
  Aggregation     {Xm Ys}   (1 Opus agent)
  Spec + Tests    {Xm Ys}   (1 Opus + 1 Sonnet agent)
  Save Files      {Xm Ys}
  ────────────────────────
  Total           {Xm Ys}   (excludes user confirmation wait)

Agent Usage:
  Sonnet : {11 + optional_count + 1} agents  (11 core + {optional_count} optional + 1 TDD)
  Haiku  : 1 agent   (pre-aggregator)
  Opus   : 2 agents  (aggregator + solutions architect)
  Total  : {15 + optional_count} agents dispatched

Report:    docs/qa-swarm/{DATE}-report.md
Spec:      docs/qa-swarm/{DATE}-spec.md
Test Plan: docs/qa-swarm/{DATE}-tests.md

Ready to implement fixes. Recommended:
  1. Run /clear to free up context (the swarm used a lot of tokens)
  2. Then run:
     /qa-swarm:implement docs/qa-swarm/{DATE}-report.md docs/qa-swarm/{DATE}-spec.md docs/qa-swarm/{DATE}-tests.md
```
