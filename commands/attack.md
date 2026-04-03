---
description: "Deploy a QA agent swarm to analyze the codebase and produce a prioritized findings report, implementation spec, and test plan"
argument-hint: "<prompt describing what to analyze>"
---

You are orchestrating a QA Swarm analysis. The user's analysis prompt is:

**"{$ARGUMENTS}"**

Follow this pipeline exactly. Do not skip steps.

## Step 1: SETUP

Generate a codebase map:
1. Use the Glob tool to list all source files (exclude node_modules, target, dist, build, .git, vendor, __pycache__)
2. For the key files (entry points, main modules, config files), read the first 50 lines to capture exports/signatures
3. Compile this into a codebase map string: file tree + key signatures

Store the codebase map -- you will pass it to every agent.

## Step 2: CORE SWARM

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

Collect all 11 agent results.

## Step 3: PRE-AGGREGATION

Launch the qa-pre-aggregator agent (model: haiku) with:
- All 11 core agent findings combined
- Access to the project file tree

The pre-aggregator will return:
- Deduplicated findings with corroboration map
- Project type detection
- Optional agent recommendations

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

## Step 5: OPTIONAL SWARM

If any optional agents are approved, launch them IN PARALLEL using the Agent tool.

Each optional agent gets:
- The user's original prompt
- The codebase map
- A summary of core findings (so they don't duplicate work)
- Their agent-specific instructions

Collect all optional agent results.

## Step 6: FINAL AGGREGATION

Launch the qa-aggregator agent (model: opus) with:
- All deduplicated findings (core + optional)
- The corroboration map
- Project type info

The aggregator produces the final ranked report in markdown format.

## Step 7: PARALLEL OUTPUT

Launch TWO agents IN PARALLEL:

1. **qa-solutions-architect** (model: opus):
   - Receives the final ranked report
   - Has access to the codebase
   - Produces the implementation spec

2. **qa-tdd** (model: sonnet):
   - Receives the final ranked report
   - Has access to the codebase (to read existing test patterns)
   - Produces the test plan (Mode 1)

## Step 8: SAVE FILES

Get today's date and save the three output files:
1. Write the aggregator's report to `docs/qa-swarm/{DATE}-report.md`
2. Write the solutions architect's spec to `docs/qa-swarm/{DATE}-spec.md`
3. Write the TDD agent's test plan to `docs/qa-swarm/{DATE}-tests.md`

Create the `docs/qa-swarm/` directory if it does not exist.

## Step 9: HANDOFF

Print the summary and next steps:

```
QA Swarm Analysis Complete
============================
Findings: {total} ({P0} P0, {P1} P1, {P2} P2, {P3} P3)
Confidence: {confirmed} confirmed, {likely} likely, {suspected} suspected

Report:    docs/qa-swarm/{DATE}-report.md
Spec:      docs/qa-swarm/{DATE}-spec.md
Test Plan: docs/qa-swarm/{DATE}-tests.md

Ready to implement fixes. Recommended:
  1. Run /clear to free up context (the swarm used a lot of tokens)
  2. Then run:
     /qa-swarm:implement docs/qa-swarm/{DATE}-report.md docs/qa-swarm/{DATE}-spec.md docs/qa-swarm/{DATE}-tests.md
```
