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

Track elapsed time for each phase. At the start of each step, run `date +%s` (Bash tool) to capture the Unix timestamp. Store these timestamps so you can compute durations at the end.

## Step 1: SETUP + PRE-READ

Record the pipeline start time: run `date +%s` and store it as `t_start`.

### 1a. Build file tree and categorize

1. Use the Glob tool to list all source files (exclude node_modules, target, dist, build, .git, vendor, __pycache__)
2. Categorize every source file into tags based on file path and name:
   - **auth**: authentication, authorization, login, session, token, JWT, OAuth
   - **api**: route definitions, controllers, handlers, REST/GraphQL endpoints
   - **db**: database models, queries, migrations, ORM, repositories
   - **io**: file I/O, network calls, HTTP clients, external service calls, cache clients
   - **state**: shared state, global variables, singletons, concurrent data structures
   - **config**: configuration files, env vars, feature flags, deployment configs
   - **logic**: business logic, algorithms, state machines, data transformations
   - **frontend**: UI components, templates, client-side code
   - **test**: test files (note but do not assign to agents)
   - **entry**: entry points, main files, startup/shutdown code

   A file can have multiple tags. When in doubt, include the tag.

3. Store the full file tree (paths only).

### 1b. Auto-detect project type

Detect from file extensions, names, and directory structure:
- Primary language(s), framework(s), project type (library, CLI, web service, etc.)
- Notable characteristics: has CI, has Docker, has API spec, etc.

### 1c. Select optional agents

Based on detected project type:
- **qa-config-env**: projects with environment-dependent deployment (Docker, k8s, .env files)
- **qa-type-safety**: dynamically typed languages or projects without strict type checking
- **qa-logging**: services that run in production (web services, daemons)
- **qa-backwards-compat**: libraries, public APIs, or projects with external consumers
- **qa-supply-chain**: projects with third-party dependencies (package.json, Cargo.toml, go.mod, etc.)
- **qa-state-mgmt**: frontend apps or stateful services

### 1d. Pre-read all source files

**This is the key performance optimization.** Read ALL non-test source files and store their contents grouped by tag. This eliminates agent file-reading overhead -- agents receive code inline and analyze immediately with zero tool calls.

1. For each non-test source file, read it using the Read tool (cap at 500 lines per file -- if longer, read first 300 + last 100 lines with a `[... {N} lines omitted ...]` marker)
2. Group the file contents by tag. A file with multiple tags appears in multiple groups.
3. Format each file as:
   ```
   === {file_path} ===
   {file contents}
   ```

Launch multiple Read calls in parallel to speed up this phase.

### 1e. Print summary and confirm

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

Wait for user confirmation. If "n", stop. Parse any agent adjustments.

Record timestamp: `t_setup_done`.

## Step 2: SWARM

Print:
```
[Phase 1/3] Deploying {N} QA agents in parallel...
  Core: Security & Error, Performance & Resources, Correctness, Architecture
  Optional: {list or "none"}
```

Launch ALL agents (core + optional) IN PARALLEL in a single message. Each agent gets its scoped file CONTENTS embedded directly -- no file paths to read.

For each agent, use this prompt template:

```
You are being deployed as part of a QA swarm analysis.

MISSION: {user's original prompt}

IMPORTANT: All source code is provided inline below. Do NOT use the Read tool -- analyze the code directly from this prompt. This is a performance optimization to eliminate file-reading overhead.

FULL FILE TREE (for reference -- paths only):
{the file tree from Step 1}

YOUR SCOPED SOURCE CODE:
{the actual file contents for this agent's tagged files, formatted as === path === \n content}

{Read the agent definition file from agents/qa-{name}.md and include its full content here as the agent's instructions}

Analyze the code provided above according to your specialty. Return your findings as structured JSON.
```

**Core agents and their scoped file contents:**

1. **qa-security-error** (model: haiku) -- receives contents of: auth + api + db + config + io + entry files
2. **qa-performance-resources** (model: haiku) -- receives contents of: db + io + api + logic + state + entry files
3. **qa-correctness** (model: haiku) -- receives contents of: db + api + logic files
4. **qa-architecture** (model: haiku) -- receives contents of: entry + api + logic + config files

**Optional agents and their scoped file contents (if selected):**

- **qa-config-env** (model: haiku): config + entry + io files
- **qa-type-safety** (model: haiku): logic + api + db files
- **qa-logging** (model: haiku): io + api + entry files
- **qa-backwards-compat** (model: haiku): api + db + config files
- **qa-supply-chain** (model: haiku): config files + dependency/package files
- **qa-state-mgmt** (model: haiku): state + frontend + logic files

Launch ALL in parallel (all in one message with multiple Agent tool calls).

**Wait for ALL agents to complete.** If any agent fails, log it and continue:
```
Agent {name} failed: {error}
Continuing with {N}/{total} agent results.
```

Record timestamp: `t_swarm_done`.

## Step 3: INLINE AGGREGATION

Print:
```
[Phase 2/3] Aggregating and ranking findings...
```

**Do NOT launch an agent for this step.** Perform aggregation inline to save time.

### 3a. Merge and deduplicate

Combine all agent findings. Identify duplicates:
- Same file + same line range (within 5 lines) = duplicate
- Same file + same function + similar title = duplicate

For duplicates, keep the one with higher confidence and build a `flagged_by` array. Print:
```
Dedup: {original_count} findings -> {deduped_count} ({removed} duplicates merged)
```

### 3b. Validate severity

Review each finding's severity:
- **P0 Critical** must be actively exploitable, cause data loss, or crash production. If it's really a code smell, downgrade.
- **P1 High** must cause real problems under normal usage. Not theoretical.
- **P2 Medium** is for latent risks and code smells that will compound.
- **P3 Low** is for improvement opportunities.

Confidence gates:
- P0 requires confidence >= "likely" OR corroboration by 3+ agents
- P1 requires confidence >= "likely" OR corroboration by 2+ agents
- P2-P3 can have "suspected" confidence if evidence is quoted

If P0 but only "suspected" with no corroboration, downgrade to P1 or P2.

### 3c. Validate confidence

- **"confirmed"** requires a traceable path and quotable code snippet that is unambiguously wrong
- **"likely"** requires strong evidence with acknowledged runtime uncertainty
- **"suspected"** is for patterns that look wrong but could be intentional

Downgrade if evidence doesn't support the tag. No specific file path + code snippet = cannot be "confirmed."

### 3d. Apply corroboration scoring

- Normalize file paths before matching
- Match by: same file + same function, OR same file + line numbers within 5 lines
- Count distinct agents per issue
- 3+ agents: boost confidence one level if evidence supports it
- 2 agents: note corroboration, no auto-boost
- 1 agent: stands on its own

### 3e. Format the report

Compile the final report in this format:

```markdown
# QA Swarm Report
**Date:** {DATE}
**Prompt:** "{ORIGINAL_PROMPT}"
**Agents deployed:** {COUNT} ({CORE_COUNT} core + {OPTIONAL_COUNT} optional)

## Summary
- P0 Critical: {N} findings
- P1 High: {N} findings
- P2 Medium: {N} findings
- P3 Low: {N} findings
- Total: {N} findings ({N} confirmed, {N} likely, {N} suspected)

## P0 - Critical

### [P0-001] {title}
**Confidence:** {confidence} | **Corroborated by:** {N} agents ({agent_list})
**Location:** {file}:{line} in `{function}`
**Description:** {description}
**Evidence:**
\`\`\`
{evidence}
\`\`\`
**Suggested fix:** {suggested_fix}
**Related files:** {related_files}

## P1 - High
(same format)

## P2 - Medium
(same format)

## P3 - Low
(same format)
```

Rules:
- Number findings sequentially: P0-001, P0-002, P1-001, etc.
- Every finding MUST have file path, line number, and evidence
- Remove findings that lack concrete evidence
- Merge findings that describe the same issue, crediting all agents
- The report must be self-contained
- Do NOT add your own findings -- only organize what agents found
- Be conservative. A report full of P0s loses credibility.

Record timestamp: `t_agg_done`.

Print a table of ALL findings sorted by severity then confidence:

```
Findings Summary
==================

| ID     | Severity | Confidence | Title                          | Location                        | Corroborated By   |
|--------|----------|------------|--------------------------------|---------------------------------|--------------------|
| P0-001 | P0       | confirmed  | SQL injection in login handler | src/auth.ts:42 `handleLogin()`  | 3 agents (SEC,ERR) |
| ...    | ...      | ...        | ...                            | ...                             | ...                |
```

Print every finding -- do not truncate.

## Step 4: FIX PLANNER

Print:
```
[Phase 3/3] Generating implementation spec and test plan...
```

Launch ONE agent:

**qa-fix-planner** (model: sonnet):
- Receives the final ranked report (full markdown from Step 3)
- Has access to the codebase (to read existing test patterns and verify P0 evidence)
- Produces BOTH the implementation spec AND the test plan

Read the agent definition from `agents/qa-fix-planner.md` and include its full content in the prompt.

Record timestamp: `t_output_done`.

When the agent returns, split its output on the `===SPEC_START===` / `===SPEC_END===` / `===TESTS_START===` / `===TESTS_END===` delimiters to extract the two documents.

## Step 5: SAVE + HANDOFF

Print:
```
Saving reports...
```

Get today's date and save the three output files:
1. Write the report (from Step 3) to `docs/qa-swarm/{DATE}-report.md`
2. Write the spec (from Step 4) to `docs/qa-swarm/{DATE}-spec.md`
3. Write the test plan (from Step 4) to `docs/qa-swarm/{DATE}-tests.md`

Create the `docs/qa-swarm/` directory if it does not exist.

Record timestamp: `t_save_done`.

Compute phase durations (format as Xm Ys):
- Setup + Pre-read: `t_setup_done - t_start`
- User Confirm: (skip from total)
- Agent Swarm: `t_swarm_done - t_setup_done`
- Aggregation: `t_agg_done - t_swarm_done`
- Fix Planner: `t_output_done - t_agg_done`
- Save Files: `t_save_done - t_output_done`
- Total: `t_save_done - t_start` minus user confirm wait

Count agents dispatched:
- Core agents: always 4 (Haiku)
- Optional agents: count selected (Haiku)
- Fix Planner: always 1 (Sonnet)

```
QA Swarm Analysis Complete
============================
Findings: {total} ({P0} P0, {P1} P1, {P2} P2, {P3} P3)
Confidence: {confirmed} confirmed, {likely} likely, {suspected} suspected

Phase Timing:
  Setup + Pre-read  {Xm Ys}
  Agent Swarm       {Xm Ys}   ({N} Haiku agents in parallel)
  Aggregation       {Xm Ys}   (inline -- no agent)
  Fix Planner       {Xm Ys}   (1 Sonnet agent)
  Save Files        {Xm Ys}
  ────────────────────────
  Total             {Xm Ys}   (excludes user confirmation wait)

Agent Usage:
  Haiku  : {4 + optional_count} agents  (4 core + {optional_count} optional)
  Sonnet : 1 agent   (fix planner)
  Opus   : 0 agents
  Total  : {5 + optional_count} agents dispatched

Report:    docs/qa-swarm/{DATE}-report.md
Spec:      docs/qa-swarm/{DATE}-spec.md
Test Plan: docs/qa-swarm/{DATE}-tests.md

Ready to implement fixes. Recommended:
  1. Run /clear to free up context (the swarm used a lot of tokens)
  2. Then run:
     /qa-swarm:implement docs/qa-swarm/{DATE}-report.md docs/qa-swarm/{DATE}-spec.md docs/qa-swarm/{DATE}-tests.md
```
