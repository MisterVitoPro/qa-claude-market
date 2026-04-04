---
name: attack
description: >
  Deploy a QA agent swarm to analyze the codebase and produce a prioritized findings report,
  implementation spec, and test plan. Use when the user wants to run QA analysis, find bugs
  across multiple dimensions (security, performance, correctness, architecture, etc.), or
  deploy a swarm of specialized QA agents. Triggers on: code review, QA audit, bug sweep,
  quality analysis, find issues, check for bugs, swarm analysis.
argument-hint: "<prompt describing what to analyze>"
---

You are orchestrating a QA Swarm analysis. The user's analysis prompt is:

**"{$ARGUMENTS}"**

Follow this pipeline exactly. Do not skip steps.

## Timing

Track elapsed time for each phase. At the start of each step, run `date +%s` (Bash tool) to capture the Unix timestamp. Store these timestamps so you can compute durations at the end. You will report per-phase durations in the handoff summary.

## Step 1: SETUP

Record the pipeline start time: run `date +%s` and store it as `t_start`.

Generate a codebase map, tag files, and detect project type:

1. Use the Glob tool to list all source files (exclude node_modules, target, dist, build, .git, vendor, __pycache__)
2. For the key files (entry points, main modules, config files), read the first 50 lines to capture exports/signatures
3. Compile this into a codebase map string: file tree + key signatures
4. Categorize every source file into one or more of these tags based on file path, name, and signatures:
   - **auth**: authentication, authorization, login, session, token, JWT, OAuth, middleware with auth checks
   - **api**: route definitions, controllers, handlers, REST/GraphQL endpoints, request/response processing
   - **db**: database models, queries, migrations, ORM, repositories, data access layers
   - **io**: file I/O, network calls, HTTP clients, external service calls, message queues, cache clients
   - **state**: shared state, global variables, singletons, concurrent data structures, locks, channels
   - **config**: configuration files, env vars, feature flags, deployment configs
   - **logic**: business logic, algorithms, state machines, complex conditionals, data transformations
   - **frontend**: UI components, templates, client-side code, CSS/styling
   - **test**: test files (note these but do not assign to agents)
   - **entry**: entry points, main files, startup/shutdown code

   A file can have multiple tags. When in doubt, include the tag -- agents will ignore irrelevant files quickly.

5. Store the full file tree (paths only) as the **file tree**.
6. Store each tag's file list as a separate variable (e.g., `auth_files`, `api_files`, etc.).

**Auto-detect project type** from file extensions, names, and signatures:
- Primary language(s) (e.g., TypeScript, Python, Rust, Go, Java)
- Framework(s) in use (e.g., Express, Django, Actix-web, Spring)
- Project type: library, CLI, web service, frontend app, etc.
- Notable characteristics: has CI, has Docker, has API spec, etc.

**Select optional agents** based on detected project type:
- **qa-config-env**: activate for projects with environment-dependent deployment (Docker, k8s, .env files)
- **qa-type-safety**: activate for dynamically typed languages or projects without strict type checking
- **qa-logging**: activate for services that run in production (web services, daemons)
- **qa-backwards-compat**: activate for libraries, public APIs, or projects with external consumers
- **qa-supply-chain**: activate for projects with third-party dependencies (package.json, Cargo.toml, go.mod, etc.)
- **qa-state-mgmt**: activate for frontend apps or stateful services

Do NOT pass the full codebase map to downstream pipeline agents (aggregator, solutions-architect, TDD). Those agents work from findings, not raw code.

Count the total source files and estimate total lines of code from the map. Print a cost estimate and codebase summary:

```
QA Swarm -- Codebase Summary
==============================
Source files: {file_count}
Estimated lines: ~{line_count}

Detected: {language(s)} {framework(s)} {project_type}

Agents to deploy:
  Core (4):  Security & Error, Performance & Resources, Correctness, Architecture
  Optional:  {list of selected optional agents, or "none"}

Estimated cost (API tokens):
  Small project  (< 50 files):   ~$0.10-0.30
  Medium project (50-200 files): ~$0.30-1.00
  Large project  (200+ files):   ~$1.00-3.00

Proceed? (Y/n, or adjust optional agents: "+logging -supply-chain")
```

Wait for user confirmation. If "n", stop and print "Aborted." Parse any agent adjustments.

Record timestamp: run `date +%s` and store as `t_setup_done`.

## Step 2: FULL SWARM

Print:
```
[Phase 1/4] Deploying {N} QA agents in parallel...
  Core: Security & Error, Performance & Resources, Correctness, Architecture
  Optional: {list or "none"}
```

Launch ALL agents (core + optional) IN PARALLEL using the Agent tool in a single message. Each agent gets a **scoped** prompt with only the files relevant to its specialty.

For each agent, use this prompt template:

```
You are being deployed as part of a QA swarm analysis.

MISSION: {user's original prompt}

FULL FILE TREE:
{the file tree from Step 1 -- paths only, no signatures}

YOUR SCOPED FILES (read these first -- they are most relevant to your specialty):
{the tagged file list for this agent, with key signatures where available}

{Read the agent definition file from agents/qa-{name}.md and include its full content here as the agent's instructions}

Analyze the codebase according to your specialty. Start with the scoped files. You may read other files from the file tree if you find references that need tracing, but focus your effort on the scoped set. Return your findings as structured JSON.
```

**Core agents and their scoped files:**

1. **qa-security-error** (model: haiku) -- receives: auth + api + db + config + io + entry files
2. **qa-performance-resources** (model: haiku) -- receives: db + io + api + logic + state + entry files
3. **qa-correctness** (model: haiku) -- receives: db + api + logic files
4. **qa-architecture** (model: haiku) -- receives: entry + api + logic + config files

**Optional agents and their scoped files (if selected):**

- **qa-config-env** (model: sonnet): config + entry + io files
- **qa-type-safety** (model: sonnet): logic + api + db files
- **qa-logging** (model: sonnet): io + api + entry files
- **qa-backwards-compat** (model: sonnet): api + db + config files
- **qa-supply-chain** (model: sonnet): config files + dependency/package files
- **qa-state-mgmt** (model: sonnet): state + frontend + logic files

Launch ALL in parallel (all in one message with multiple Agent tool calls).

**Wait for ALL agents to complete before proceeding.** If any agent fails, log it and continue:
```
Agent {name} failed: {error}
Continuing with {N}/{total} agent results.
```

Record timestamp: run `date +%s` and store as `t_swarm_done`.

## Step 3: AGGREGATION

Print:
```
[Phase 2/4] Deduplicating and ranking findings...
```

**Inline dedup** -- before launching the aggregator, scan all agent findings and identify duplicates:
- Same file + same line range (within 5 lines) = duplicate
- Same file + same function + similar title = duplicate

For duplicates, keep the one with higher confidence and build a `flagged_by` array showing all agents that reported it. Remove the rest. Print:
```
Dedup: {original_count} findings -> {deduped_count} ({removed} duplicates merged)
```

Launch the qa-aggregator agent (model: sonnet) with:
- All deduplicated findings with corroboration info
- The detected project type
- Do NOT pass the codebase map -- the aggregator works from findings only

The aggregator produces the final ranked report in markdown format.

Record timestamp: run `date +%s` and store as `t_agg_done`.

Print a table of ALL findings from the aggregated report sorted by severity (P0 first), then by confidence (confirmed > likely > suspected):

```
Findings Summary
==================

| ID     | Severity | Confidence | Title                          | Location                        | Corroborated By   |
|--------|----------|------------|--------------------------------|---------------------------------|--------------------|
| P0-001 | P0       | confirmed  | SQL injection in login handler | src/auth.ts:42 `handleLogin()`  | 3 agents (SEC,ERR) |
| ...    | ...      | ...        | ...                            | ...                             | ...                |
```

Print every finding -- do not truncate or summarize. If there are zero findings, print "No findings detected." instead.

## Step 4: SPEC + TESTS

Print:
```
[Phase 3/4] Generating implementation spec and test plan...
```

Launch TWO agents IN PARALLEL:

1. **qa-solutions-architect** (model: sonnet):
   - Receives the final ranked report (with all evidence and file paths)
   - Do NOT pass the codebase map -- the architect reads source files only for P0 fixes to verify evidence
   - Produces the implementation spec

2. **qa-tdd** (model: sonnet):
   - Receives the final ranked report
   - Has access to the codebase (to read existing test patterns)
   - Produces the test plan (Mode 1)

Record timestamp: run `date +%s` and store as `t_output_done`.

## Step 5: SAVE + HANDOFF

Print:
```
[Phase 4/4] Saving reports...
```

Get today's date and save the three output files:
1. Write the aggregator's report to `docs/qa-swarm/{DATE}-report.md`
2. Write the solutions architect's spec to `docs/qa-swarm/{DATE}-spec.md`
3. Write the TDD agent's test plan to `docs/qa-swarm/{DATE}-tests.md`

Create the `docs/qa-swarm/` directory if it does not exist.

Record timestamp: run `date +%s` and store as `t_save_done`.

Compute phase durations from stored timestamps (format as Xm Ys):
- Setup:          `t_setup_done - t_start`
- User Confirm:   (skip from total -- it's wait time)
- Agent Swarm:    `t_swarm_done - t_setup_done`
- Aggregation:    `t_agg_done - t_swarm_done`
- Spec + Tests:   `t_output_done - t_agg_done`
- Save Files:     `t_save_done - t_output_done`
- Total:          `t_save_done - t_start` minus user confirm wait time

Count the actual agents dispatched during this run:
- Core agents: always 4 (Haiku)
- Optional agents: count how many were selected (Sonnet)
- Aggregator: always 1 (Sonnet)
- Solutions Architect: always 1 (Sonnet)
- TDD Agent: always 1 (Sonnet)

```
QA Swarm Analysis Complete
============================
Findings: {total} ({P0} P0, {P1} P1, {P2} P2, {P3} P3)
Confidence: {confirmed} confirmed, {likely} likely, {suspected} suspected

Phase Timing:
  Setup           {Xm Ys}
  Agent Swarm     {Xm Ys}   ({N} agents in parallel)
  Aggregation     {Xm Ys}   (1 Sonnet agent)
  Spec + Tests    {Xm Ys}   (2 Sonnet agents)
  Save Files      {Xm Ys}
  ────────────────────────
  Total           {Xm Ys}   (excludes user confirmation wait)

Agent Usage:
  Haiku  : 4 agents  (4 core)
  Sonnet : {optional_count + 3} agents  ({optional_count} optional + aggregator + architect + TDD)
  Opus   : 0 agents
  Total  : {7 + optional_count} agents dispatched

Report:    docs/qa-swarm/{DATE}-report.md
Spec:      docs/qa-swarm/{DATE}-spec.md
Test Plan: docs/qa-swarm/{DATE}-tests.md

Ready to implement fixes. Recommended:
  1. Run /clear to free up context (the swarm used a lot of tokens)
  2. Then run:
     /qa-swarm:implement docs/qa-swarm/{DATE}-report.md docs/qa-swarm/{DATE}-spec.md docs/qa-swarm/{DATE}-tests.md
```
