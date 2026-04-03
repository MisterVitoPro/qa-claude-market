---
name: qa-swarm
description: >
  Use when the user wants to run QA analysis on a codebase, find bugs across multiple
  dimensions (security, performance, correctness, architecture, etc.), or deploy a swarm
  of specialized QA agents. Triggers on: code review, QA audit, bug sweep, quality analysis,
  find issues, check for bugs, swarm analysis. Also use when user mentions /qa-swarm:attack.
---

# QA Swarm

A multi-agent QA analysis and fix pipeline. Deploys up to 17 specialized QA agents
to analyze a codebase, aggregates findings with priority ranking and confidence scoring,
then optionally implements fixes via TDD.

## Commands

- `/qa-swarm:attack <prompt>` -- Run QA analysis. The prompt describes what to focus on.
  Example: `/qa-swarm:attack "check all API endpoints for security and input validation issues"`

- `/qa-swarm:implement <report> <spec> <tests>` -- Implement fixes from an attack run.
  Takes the 3 output file paths from a `/qa-swarm:attack` run.

## How It Works

### /qa-swarm:attack
1. 11 core QA specialist agents analyze the codebase in parallel (Sonnet)
2. Pre-aggregation deduplicates findings and detects project type (Haiku)
3. User confirms which optional specialist agents (up to 6) to activate
4. Optional agents run in parallel with awareness of core findings (Sonnet)
5. Aggregator merges, ranks P0-P3, applies confidence + corroboration (Opus)
6. Solutions Architect writes implementation spec + TDD agent writes test plan (parallel)
7. Three files saved to docs/qa-swarm/

### /qa-swarm:implement
1. TDD agent writes actual test files, confirms they fail
2. P0 fixes: one at a time, full test run after each, 4 retry max, halt on failure
3. P1-P3 fixes: batched by priority, 2 retry max, skip on failure
4. Final test run and completion report
