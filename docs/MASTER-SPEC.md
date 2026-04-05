# QA Swarm Plugin -- Master Specification

**Date:** 2026-04-03
**Version:** 1.2.0
**Status:** Current
**Repository:** https://github.com/MisterVitoPro/qa-swarm-plugin
**License:** MIT

---

## Table of Contents

1. [Overview](#overview)
2. [Plugin Structure](#plugin-structure)
3. [Distribution & Installation](#distribution--installation)
4. [Agent Roster](#agent-roster)
5. [Model Assignment](#model-assignment)
6. [Token Management](#token-management)
7. [Priority System](#priority-system)
8. [Agent Output Schema](#agent-output-schema)
9. [/qa-swarm:attack Orchestration](#qa-swarmattack-orchestration)
10. [/qa-swarm:implement Orchestration](#qa-swarmimplement-orchestration)
11. [Progress Tracking (Claude Tasks)](#progress-tracking-claude-tasks)
12. [Project Type Detection](#project-type-detection)
13. [Output File Formats](#output-file-formats)
14. [Agent Definitions](#agent-definitions)

---

## Overview

A distributable Claude Code plugin that deploys a swarm of specialized QA agents onto a codebase, aggregates their findings into a prioritized report, generates an implementation spec, and then optionally implements fixes via a TDD loop.

Two commands:
- `/qa-swarm:attack <prompt>` -- Analysis pipeline (scan, aggregate, report)
- `/qa-swarm:implement <report> <spec> <tests>` -- Implementation pipeline (phased TDD fix loop)

The user stays in the loop at key decision points: confirming agent selection before the swarm, selecting implementation phases, and choosing whether to continue after each phase completes.

---

## Plugin Structure

```
qa-swarm-plugin/
├── .claude-plugin/
│   ├── plugin.json                  # Plugin manifest
│   └── marketplace.json             # Marketplace metadata
├── agents/
│   ├── qa-security-error.md         # Core: security + error handling
│   ├── qa-performance-resources.md  # Core: performance + concurrency + resources
│   ├── qa-correctness.md            # Core: data integrity + API contracts + logic + edge cases
│   ├── qa-architecture.md           # Core: architecture & design
│   ├── qa-config-env.md             # Optional: configuration & environment
│   ├── qa-type-safety.md            # Optional: type & null safety
│   ├── qa-logging.md                # Optional: logging & observability
│   ├── qa-backwards-compat.md       # Optional: backwards compatibility
│   ├── qa-supply-chain.md           # Optional: dependency & supply chain
│   ├── qa-state-mgmt.md             # Optional: state management
│   ├── qa-fix-planner.md             # Pipeline: spec + test plan (attack)
│   ├── qa-aggregator.md             # Legacy (inlined into orchestrator)
│   ├── qa-solutions-architect.md    # Legacy (merged into fix-planner)
│   └── qa-tdd.md                    # Pipeline: test writer (implement only)
├── skills/
│   ├── attack/
│   │   └── SKILL.md                 # /qa-swarm:attack orchestrator
│   └── implement/
│       └── SKILL.md                 # /qa-swarm:implement orchestrator
├── README.md
├── LICENSE
└── docs/
    ├── MASTER-SPEC.md               # This file
    └── superpowers/
        ├── specs/                   # Design specification
        └── plans/                   # Implementation plan
```

---

## Distribution & Installation

### plugin.json

```json
{
  "name": "qa-swarm",
  "description": "AI-powered code quality analyzer: specialized agents find security, performance, architecture, and correctness issues, then fix them via TDD",
  "version": "1.2.0",
  "license": "MIT",
  "keywords": ["qa", "testing", "code-review", "tdd", "multi-agent", "security-audit", "bug-detection", "code-quality", "static-analysis", "code-scanner", "ai-code-review", "performance-analysis", "architecture-review"],
  "repository": "https://github.com/MisterVitoPro/qa-swarm-plugin"
}
```

### Installation

```bash
# Marketplace install
claude plugin marketplace add MisterVitoPro/qa-swarm
claude plugin install qa-swarm

# Or load directly for a single session
claude --plugin-dir /path/to/qa-swarm
```

---

## Agent Roster

### Core Agents (always active) -- 4 agents

| # | Agent | File | ID Prefixes | Focus |
|---|-------|------|-------------|-------|
| 1 | Security & Error | qa-security-error.md | SEC, ERR | Injection, auth flaws, secrets, silent failures, missing catches, timeouts, cascade failures |
| 2 | Performance & Resources | qa-performance-resources.md | PERF, CONC, MEM | N+1 queries, bottlenecks, race conditions, deadlocks, memory leaks, resource exhaustion |
| 3 | Correctness | qa-correctness.md | DATA, API, LOGIC, EDGE | Schema mismatches, data loss, contract violations, off-by-one, boundary failures |
| 4 | Architecture & Design | qa-architecture.md | ARCH | SOLID violations, coupling, god classes, wrong abstractions, circular deps |

### Optional Agents (activated by project type) -- up to 6 agents

| # | Agent | File | ID Prefix | Focus | Activates When |
|---|-------|------|-----------|-------|----------------|
| 5 | Configuration & Env Reviewer | qa-config-env.md | CFG | Hardcoded values, missing env vars, config drift | Environment-dependent deployment detected |
| 6 | Type & Null Safety Auditor | qa-type-safety.md | TYPE | Null derefs, unsafe casts, type coercion traps | Dynamic typing or weak type checking detected |
| 7 | Logging & Observability Auditor | qa-logging.md | LOG | Missing logs, sensitive data in logs, trace gaps | Production service detected |
| 8 | Backwards Compatibility Analyst | qa-backwards-compat.md | COMPAT | Breaking public APIs, serialization format changes | Library or public API detected |
| 9 | Dependency & Supply Chain Auditor | qa-supply-chain.md | SUPPLY | Known CVEs, unpinned versions, license conflicts | Third-party dependencies present |
| 10 | State Management Reviewer | qa-state-mgmt.md | STATE | Invalid state transitions, global state abuse | Frontend app or stateful service detected |

### Pipeline Agents

| Agent | File | Model | Role | Used In |
|-------|------|-------|------|---------|
| Fix Planner | qa-fix-planner.md | Sonnet | Write implementation spec + TDD test plan in one pass | attack |
| TDD Agent | qa-tdd.md | Sonnet | Write test files to disk (Mode 2 only) | implement |

**Note:** Aggregation is performed inline by the orchestrator (no separate agent). The aggregator and solutions-architect agent files are retained for reference but are no longer spawned during the attack pipeline.

---

## Model Assignment

| Role | Model | Count | Rationale |
|------|-------|-------|-----------|
| Core QA agents | Haiku | 4 | Merged specialties reduce agent count while maintaining coverage. Haiku is fast and cheap for focused analysis. |
| Optional QA agents | Haiku | 0-6 | Focused scope, single lens. Haiku with pre-read code is sufficient. |
| Aggregation | (inline) | 0 | Orchestrator performs dedup, severity validation, and ranking inline. No agent spawn needed. |
| Fix Planner | Sonnet | 1 | Writes both implementation spec and TDD test plan in one pass. |
| P0 Implementation Agent | Opus | 1 | Critical fixes need deep reasoning. One at a time. (implement only) |
| P1-P3 Implementation Agent | Sonnet | 1 | Batched fixes from spec. Follows prescribed steps. (implement only) |
| TDD Writer | Sonnet | 1 | Writes test files to disk. Mode 2 only. (implement only) |

**Total agents per attack run:** 5-11 (depending on optional agent count)

### Estimated Cost

| Project Size | Estimated Cost |
|-------------|----------------|
| Small (< 50 files) | ~$0.10-0.30 |
| Medium (50-200 files) | ~$0.30-1.00 |
| Large (200+ files) | ~$1.00-3.00 |

---

## Token Management

1. **Structured output format** -- every QA agent returns findings in a strict JSON schema. No prose.
2. **Pre-read & embed** -- all source files are read once in setup and embedded directly in agent prompts. Agents analyze inline code with zero Read tool calls, eliminating the biggest time bottleneck.
3. **Scoped file contents** -- each agent gets only the file contents tagged relevant to its specialty, not the full codebase.
4. **Findings cap** -- max 10-15 findings per agent, ranked by severity. Forces prioritization.
5. **Inline aggregation** -- orchestrator performs dedup, severity validation, and ranking directly. No aggregator agent spawn.
6. **Merged fix planner** -- single Sonnet agent produces both implementation spec and test plan, eliminating one agent spawn.
7. **All-Haiku swarm** -- core and optional agents all use Haiku. Pre-read code compensates for smaller model by providing full context upfront.
8. **Single swarm** -- core + optional agents launch in one parallel batch, eliminating sequential overhead.

---

## Priority System

### Severity Levels

| Priority | Definition | Examples |
|----------|-----------|----------|
| P0 - Critical | Actively exploitable, causes data loss, or crashes in production. Fix before shipping. | SQL injection, unhandled null in hot path, race condition causing data corruption |
| P1 - High | Will cause real problems under normal usage but not immediately catastrophic. Fix this sprint. | Missing auth check on non-critical endpoint, memory leak under sustained load |
| P2 - Medium | Code smell or latent risk that will bite you eventually. Plan to fix. | Tight coupling, hardcoded config values, missing retry logic |
| P3 - Low | Improvement opportunity. Nice to have. | Suboptimal algorithm for current scale, logging gaps |

### Confidence Tags

| Confidence | Meaning |
|-----------|---------|
| Confirmed | Agent traced a concrete path to the bug. Could write a failing test now. |
| Likely | Strong evidence but needs verification. Pattern matches a known vulnerability class. |
| Suspected | Smells wrong but could be intentional. Needs human eyes. |

### Corroboration

When multiple agents independently flag the same issue (matched by file + function, or file + line within 5 lines), the aggregator marks it with a corroboration count (e.g., "3 agents").

Corroboration effects on confidence:
- **3+ agents**: boost confidence one level (suspected -> likely, likely -> confirmed) if evidence supports it
- **2 agents**: note the corroboration but do not auto-boost
- **1 agent**: finding stands on its own evidence

### Severity Confidence Gates

- P0 requires confidence >= "likely" OR corroboration by 3+ agents
- P1 requires confidence >= "likely" OR corroboration by 2+ agents
- P2-P3 can have "suspected" confidence if evidence is quoted

If a finding is labeled P0 but only "suspected" with no corroboration, the aggregator downgrades to P1 or P2.

---

## Agent Output Schema

Every QA agent returns findings in this format:

```json
{
  "agent": "security-auditor",
  "findings_count": 3,
  "findings": [
    {
      "id": "SEC-001",
      "title": "SQL injection via unsanitized user input",
      "severity": "P0",
      "confidence": "confirmed",
      "location": {
        "file": "src/controllers/user.rs",
        "line": 47,
        "function": "get_user_by_id"
      },
      "description": "User input passed directly to raw SQL query without parameterization.",
      "evidence": "Line 47: query(format!(\"SELECT * FROM users WHERE id = {}\", input))",
      "suggested_fix": "Use parameterized query: query(\"SELECT * FROM users WHERE id = $1\", &[&input])",
      "related_files": ["src/db/queries.rs", "src/middleware/auth.rs"]
    }
  ]
}
```

### Constraints

- Max 10-15 findings per agent
- Every finding must include `location` with file + line
- `evidence` quotes the actual problematic code
- `confidence` is one of: confirmed, likely, suspected
- ID prefix matches agent specialty: SEC, ERR, PERF, CONC, MEM, DATA, API, LOGIC, EDGE, ARCH, CFG, TYPE, LOG, COMPAT, SUPPLY, STATE

---

## /qa-swarm:attack Orchestration

**Input:** User prompt (e.g., "check all API endpoints for security issues")
**Output:** 3 files in `docs/qa-swarm/`
**Skill file:** `skills/attack/SKILL.md`

### Pipeline Steps (optimized -- 5 steps, 3 key optimizations)

**Optimizations applied:**
1. **Pre-read & embed**: All source files are read in setup and embedded directly in agent prompts, eliminating agent file-reading overhead (40-60% swarm time saved)
2. **Inline aggregation**: Orchestrator performs dedup, severity validation, and ranking directly -- no aggregator agent spawn (30-60s saved)
3. **Merged fix planner**: Single Sonnet agent produces both implementation spec and test plan (15-30s saved)

```
Step 1: SETUP + PRE-READ
  - Parse user prompt
  - Build file tree, tag files by category (auth, api, db, io, state, config, logic, frontend, test, entry)
  - Auto-detect project type from file extensions and directory structure
  - Select optional agents based on project type
  - PRE-READ all non-test source files (cap at 500 lines per file)
  - Group file contents by tag for scoped embedding
  - Print cost estimate, codebase summary, and agent selection
  - Wait for user confirmation (Y/n, or adjust agents: "+logging -supply-chain")

Step 2: SWARM (parallel, 4-10 Haiku agents)
  - Launch ALL agents simultaneously via Agent tool
  - Each receives: user prompt + scoped file CONTENTS embedded in prompt + agent instructions
  - Agents analyze code directly from prompt -- NO Read tool calls needed
  - Each returns max 10-15 findings in structured JSON
  - If any agent fails, log it and continue

Step 3: INLINE AGGREGATION (no agent -- orchestrator does it)
  - Merge all agent findings
  - Dedup: same file + line within 5, or same file + function + similar title
  - Validate severity against confidence gates
  - Validate confidence tags against evidence quality
  - Apply corroboration scoring (3+ agents = boost, 2 = note, 1 = standalone)
  - Format ranked report in markdown
  - Print findings summary table

Step 4: FIX PLANNER (1 Sonnet agent)
  - Single agent produces BOTH implementation spec AND test plan
  - Reads actual source files for P0 verification only
  - Audits existing tests for duplication
  - Output uses delimiters for orchestrator to split into 2 files

Step 5: SAVE + HANDOFF
  - docs/qa-swarm/YYYY-MM-DD-report.md
  - docs/qa-swarm/YYYY-MM-DD-spec.md
  - docs/qa-swarm/YYYY-MM-DD-tests.md
  - Print per-phase timing breakdown
  - Print agent usage summary (Haiku/Sonnet counts)
  - Recommend: /clear then /qa-swarm:implement with the 3 file paths
```

---

## /qa-swarm:implement Orchestration

**Input:** 3 file paths (report, spec, test plan)
**Output:** Fixed code + incremental results report
**Skill file:** `skills/implement/SKILL.md`

### Design Principles

- **Phased execution**: Work is broken into priority phases. The user chooses which phases to tackle.
- **Incremental**: Results file is updated after each phase. Supports resume across sessions.
- **User stays in the loop**: Phase selection before starting, continue prompt after each phase, halt-and-ask on P0 failures.
- **Task tracking**: Claude Tasks provide real-time visibility into what's done, in progress, and remaining.

### Pipeline Steps

```
Step 1: VALIDATE AND INGEST
  - Validate all 3 input files exist (error if missing with guidance)
  - Read all three files
  - Parse findings grouped by priority (P0, P1, P2, P3)
  - Count totals; stop if 0 findings
  - Check for existing results file (docs/qa-swarm/YYYY-MM-DD-results.md)
    - If found, load it and mark already-fixed issues as complete
    - This enables incremental runs across sessions
  - Verify clean working tree; warn if uncommitted changes

Step 2: PHASE SELECTION
  - Present summary table:

    Phase | Priority    | Issues | Status
    ------|-------------|--------|------------
      1   | P0 Critical |   {N}  | Not started
      2   | P1 High     |   {N}  | Not started
      3   | P2 Medium   |   {N}  | Not started
      4   | P3 Low      |   {N}  | Not started

    Status shows: Not started | Partial (N/M) | Done (N/N)

  - Options: [A] all, [1] single, [1-2] range, [1,3] pick
  - Wait for user selection
  - Create Claude Tasks for all selected work (see Progress Tracking section)

Step 3: TDD SETUP (Sonnet, Mode 2)
  - TDD Agent writes test files for SELECTED PHASES ONLY
  - Detects project test conventions from existing tests
  - Writes test files to disk
  - Runs test suite -- confirms they fail (red phase)
  - Tests that already pass: remove from queue, mark sub-tasks completed

Step 4: PHASE EXECUTION
  - Execute in priority order (P0 first, always)

  P0 Phase (strict one-at-a-time, Opus):
    For each P0 finding:
    a. Launch implementation agent with finding + spec fix steps + test files
    b. Run FULL test suite after each fix
    c. If tests pass: mark fixed, move on
    d. If new failures: retry (up to 4 attempts total)
    e. After 4 failures: HALT
       - Surface what was tried, what failed
       - Options: user guidance, skip, or abort

  P1-P3 Phases (batched by priority, Sonnet):
    For each priority level:
    a. Launch implementation agent with all findings for this level
    b. Run FULL test suite
    c. If tests pass: all fixed
    d. If failures: retry (up to 2 attempts)
    e. After 2 failures: skip failing fixes, continue

Step 5: PHASE COMPLETE + CONTINUE PROMPT
  - Run full test suite for verification
  - Update results file incrementally
  - Print phase summary (fixed, unresolved, halted, test counts)
  - If phases remain, present continue prompt:

    Remaining phases:
    Phase | Priority  | Issues | Status
    ------|-----------|--------|-------
      3   | P2 Medium |   {N}  | Not started
      4   | P3 Low    |   {N}  | Not started
    Continue? [3/4/3-4/A/done]

  - If user selects more: create new tasks, loop to Step 3
  - If "done" or none remain: proceed to final report

Step 6: FINAL REPORT
  - Save/update docs/qa-swarm/YYYY-MM-DD-results.md
  - Print summary: fixed, unresolved, halted, skipped (phases not selected), already passing
  - Print next steps: git diff, test, lint, commit, PR
```

### Retry Limits

| Priority | Max Retries | On Failure |
|----------|-------------|------------|
| P0 | 4 | Halt, surface to user with full context |
| P1-P3 | 2 | Skip, log as unresolved, continue |

---

## Progress Tracking (Claude Tasks)

The `/qa-swarm:implement` command uses Claude Tasks (TaskCreate, TaskUpdate) to give the user real-time visibility.

### Task Structure

After phase selection, create:

1. **Pipeline task**: `"TDD Setup: Write test files for selected phases"`
2. **Phase tasks** (one per selected phase):
   - `"Phase 1: P0 Critical ({N} issues)"`
   - Description references the spec file and execution strategy
3. **Finding sub-tasks** (one per finding within each phase):
   - `"Fix P0-001: SQL injection in get_user_by_id"`
   - Description includes: location, spec section reference, test file path, confidence, corroboration
4. **Wrap-up pipeline tasks**:
   - `"Final test suite verification"`
   - `"Write results report to docs/qa-swarm/{DATE}-results.md"`

### Status Conventions

- Mark `in_progress` when starting work on a task
- Mark `completed` immediately when done -- never batch completions
- Failed tasks: update with reason before marking completed
- Skipped tasks: update with "Skipped by user" or "Unresolved after N attempts: {error}"
- Halted tasks: update with "HALTED after 4 attempts. Last error: {error}. Awaiting user guidance."

### Traceability

All task descriptions reference:
- Finding ID (e.g., P0-001)
- Spec file and section (e.g., "See {spec_path} > P0 Fixes > Fix P0-001")
- Test file path (added after TDD setup completes)
- Attempt number and prior errors (for retries)

### Continue Prompt Tasks

When the user selects additional phases via the continue prompt, new phase tasks, finding sub-tasks, and pipeline tasks are created for the new round.

---

## Project Type Detection

The orchestrator auto-detects project type during Step 1 (Setup) by examining file extensions, names, and key signatures. This determines which optional agents to recommend:

- **qa-config-env**: Docker, k8s, .env files detected
- **qa-type-safety**: dynamically typed language or weak type checking
- **qa-logging**: production service (web service, daemon)
- **qa-backwards-compat**: library or public API
- **qa-supply-chain**: third-party dependencies (package.json, Cargo.toml, go.mod, etc.)
- **qa-state-mgmt**: frontend app or stateful service

The user sees the recommendations in the initial confirmation prompt and can adjust before the single parallel swarm launches (e.g., `+logging -supply-chain`).

---

## Output File Formats

All output is saved to `docs/qa-swarm/` in the target project.

### Report (YYYY-MM-DD-report.md)

```markdown
# QA Swarm Report
**Date:** YYYY-MM-DD
**Prompt:** "user's original prompt"
**Agents deployed:** N (4 core + N optional)

## Summary
- P0 Critical: N findings
- P1 High: N findings
- P2 Medium: N findings
- P3 Low: N findings
- Total: N findings (N confirmed, N likely, N suspected)

## P0 - Critical

### [P0-001] Title
**Confidence:** Confirmed | **Corroborated by:** 3 agents (Security, API Contract, Edge Case)
**Location:** file:line in `function`
**Description:** ...
**Evidence:**
```
{code}
```
**Suggested fix:** ...
**Related files:** ...

(repeat for each finding, grouped by priority)
```

### Spec (YYYY-MM-DD-spec.md)

```markdown
# QA Swarm Implementation Spec
**Date:** YYYY-MM-DD
**Source report:** YYYY-MM-DD-report.md
**Total fixes:** N (N P0, N P1, N P2, N P3)

## Fix Order
Brief dependency graph for P0 fixes.

## P0 Fixes (Implementation-Ready)

### Fix P0-001: Title
**Source finding:** [P0-001]
**Files to modify:**
- `file:line_range` - what changes
**Dependencies:** other fix IDs or "none"
**Steps:**
1. specific step
2. specific step
**Code pattern:**
```lang
// Before
{current code}

// After
{fixed code}
```
**Verification:** how to verify
**Risk:** what could go wrong

## P1 Fixes (Strategic)

### Fix P1-001: Title
**Source finding:** [P1-001]
**Approach:** strategy
**Files involved:** file list
**Related fixes:** other fix IDs
**Considerations:** trade-offs

## P2-P3 Fixes (Brief)

| Fix | Source | Description | Approach |
|-----|--------|-------------|----------|
| P2-001 | [P2-001] | description | approach |
```

### Test Plan (YYYY-MM-DD-tests.md)

```markdown
# QA Swarm Test Plan
**Date:** YYYY-MM-DD
**Source report:** YYYY-MM-DD-report.md
**Total test cases:** N

## Deduplication Summary
- **Existing tests audited:** N files
- **Findings already covered:** list or "none"
- **Findings partially covered:** list or "none"
- **New tests to write:** N

## Test Cases

### P0-001: Title
**Status:** NEW | ALREADY COVERED | PARTIAL (gap: description)
**Test file:** tests/qa-swarm/test_p0_001.ext
**Setup required:** fixtures, mocks needed
**Cases:**
- `test_descriptive_name`: what it tests and why it should fail now

**Test code:**
```lang
{complete test code ready to write to disk}
```

(repeat for each finding)
```

### Results (YYYY-MM-DD-results.md)

```markdown
# QA Swarm Implementation Results
**Date:** YYYY-MM-DD
**Source spec:** YYYY-MM-DD-spec.md
**Duration:** elapsed time

## Summary
- Fixed: N/total issues
- Unresolved: N issues
- Halted: N P0s (required human intervention)
- Skipped (phases not selected): N issues
- Already passing: N issues

## Test Results
- Total tests: N
- Passing: N
- Failing: N

## Fixed Issues
### [P0-001] Title
**Priority:** P0
**Phase:** 1
**Attempts:** N
**Fix applied:** brief description
**Files modified:** list

## Unresolved Issues
### [P1-003] Title
**Priority:** P1
**Attempts:** 2
**Last error:** error message
**What was tried:** brief summary
**Recommendation:** what a human should look at

## Halted Issues
### [P0-002] Title
**Attempts:** 4
**What was tried:** summary of all 4 attempts
**Why it failed:** analysis
**Recommendation:** what needs human attention

## Phases Not Selected
List of phases the user chose not to run, with issue counts.

## Already Passing (Skipped)
- [P2-004] Title -- likely already fixed / false positive
```

---

## Agent Definitions

### Agent File Format

All agents follow a consistent markdown structure with YAML frontmatter:

```markdown
---
name: qa-{specialty}
description: >
  One-line description of what the agent does.
model: sonnet|haiku|opus
color: {color}
---

Role description and mission.

## What You Look For
- Specific checklist items for this specialty

## Process
1. Read codebase map
2. Identify relevant files
3. Read and analyze
4. Assign confidence

## Output Format
Structured JSON matching the Agent Output Schema.

## Rules
Agent-specific constraints.
```

### Core Agent Specialties

| Agent | What It Looks For |
|-------|------------------|
| **Security & Error** | SQL/command/path injection, SSRF, auth flaws, hardcoded secrets, XSS, CSRF, insecure crypto, PII exposure, IDOR, silent failures, missing catches, panic paths, timeouts, retries, cascade failures |
| **Performance & Resources** | N+1 queries, unnecessary allocations, missing pagination, bottlenecks, race conditions, deadlocks, unsafe shared state, memory leaks, unclosed handles, unbounded growth |
| **Correctness** | Schema mismatches, data loss, contract violations, missing validation, off-by-one, wrong operators, flawed conditionals, boundary failures, empty/null inputs, overflow |
| **Architecture** | SOLID violations, tight coupling, god classes, wrong abstractions, circular dependencies, inconsistent patterns |

### Pipeline Agent Roles

| Agent | Input | Output | Key Rules | Used In |
|-------|-------|--------|-----------|---------|
| **Aggregation** (inline) | All agent findings | Ranked report in markdown | Validate severity against confidence gates; conservative ranking; no new findings | attack (inline) |
| **Fix Planner** | Ranked report + codebase access | Implementation spec + TDD test plan | Read actual code for P0 only; audit existing tests for duplication; output uses delimiters | attack |
| **TDD Writer** | Test plan (Mode 2 only) | Test files on disk | Detect conventions from existing tests; every test must be runnable; no scope creep | implement |
