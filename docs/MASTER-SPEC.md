# QA Swarm Plugin -- Master Specification

**Date:** 2026-04-03
**Version:** 1.0.0
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

The user stays in the loop at every decision point: confirming optional agents, selecting implementation phases, and choosing whether to continue after each phase completes.

---

## Plugin Structure

```
qa-swarm-plugin/
├── .claude-plugin/
│   ├── plugin.json                  # Plugin manifest
│   └── marketplace.json             # Marketplace metadata
├── agents/
│   ├── qa-security-auditor.md       # Core agent 1
│   ├── qa-error-handling.md         # Core agent 2
│   ├── qa-performance.md            # Core agent 3
│   ├── qa-concurrency.md            # Core agent 4
│   ├── qa-api-contract.md           # Core agent 5
│   ├── qa-edge-case.md              # Core agent 6
│   ├── qa-logic-correctness.md      # Core agent 7
│   ├── qa-data-integrity.md         # Core agent 8
│   ├── qa-architecture.md           # Core agent 9
│   ├── qa-resilience.md             # Core agent 10
│   ├── qa-resource-mgmt.md          # Core agent 11
│   ├── qa-config-env.md             # Optional agent 12
│   ├── qa-type-safety.md            # Optional agent 13
│   ├── qa-logging.md                # Optional agent 14
│   ├── qa-backwards-compat.md       # Optional agent 15
│   ├── qa-supply-chain.md           # Optional agent 16
│   ├── qa-state-mgmt.md             # Optional agent 17
│   ├── qa-pre-aggregator.md         # Pipeline: dedup + project detection
│   ├── qa-aggregator.md             # Pipeline: final ranking
│   ├── qa-solutions-architect.md    # Pipeline: spec writer
│   └── qa-tdd.md                    # Pipeline: test plan + test writer
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
  "description": "AI-powered code quality analyzer: 17 specialized agents find security, performance, architecture, and correctness issues, then fix them via TDD",
  "version": "1.0.0",
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

### Core Agents (always active) -- 11 agents

| # | Agent | File | ID Prefix | Focus |
|---|-------|------|-----------|-------|
| 1 | Security Auditor | qa-security-auditor.md | SEC | Injection, auth flaws, secrets exposure, OWASP top 10 |
| 2 | Error Handling Analyst | qa-error-handling.md | ERR | Silent failures, missing catches, panic paths |
| 3 | Performance Analyst | qa-performance.md | PERF | N+1 queries, unnecessary allocations, bottlenecks |
| 4 | Concurrency Reviewer | qa-concurrency.md | CONC | Race conditions, deadlocks, unsafe shared state |
| 5 | API Contract Validator | qa-api-contract.md | API | Input validation, response consistency |
| 6 | Edge Case Hunter | qa-edge-case.md | EDGE | Boundary conditions, empty inputs, overflow |
| 7 | Logic & Correctness Reviewer | qa-logic-correctness.md | LOGIC | Off-by-one, wrong operators, flawed conditionals |
| 8 | Data Integrity Analyst | qa-data-integrity.md | DATA | Schema mismatches, data loss paths |
| 9 | Architecture & Design Reviewer | qa-architecture.md | ARCH | SOLID violations, coupling, god classes, wrong abstractions |
| 10 | Resilience & Failure Mode Analyst | qa-resilience.md | RES | Timeouts, retries, graceful degradation |
| 11 | Resource & Memory Management Auditor | qa-resource-mgmt.md | MEM | Leaks, unclosed handles, unbounded growth |

### Optional Agents (activated by project type) -- up to 6 agents

| # | Agent | File | ID Prefix | Focus | Activates When |
|---|-------|------|-----------|-------|----------------|
| 12 | Configuration & Env Reviewer | qa-config-env.md | CFG | Hardcoded values, missing env vars, config drift | Environment-dependent deployment detected |
| 13 | Type & Null Safety Auditor | qa-type-safety.md | TYPE | Null derefs, unsafe casts, type coercion traps | Dynamic typing or weak type checking detected |
| 14 | Logging & Observability Auditor | qa-logging.md | LOG | Missing logs, sensitive data in logs, trace gaps | Production service detected |
| 15 | Backwards Compatibility Analyst | qa-backwards-compat.md | COMPAT | Breaking public APIs, serialization format changes | Library or public API detected |
| 16 | Dependency & Supply Chain Auditor | qa-supply-chain.md | SUPPLY | Known CVEs, unpinned versions, license conflicts | Third-party dependencies present |
| 17 | State Management Reviewer | qa-state-mgmt.md | STATE | Invalid state transitions, global state abuse | Frontend app or stateful service detected |

### Pipeline Agents

| Agent | File | Model | Role |
|-------|------|-------|------|
| Pre-Aggregator | qa-pre-aggregator.md | Haiku | Deduplicate core findings, detect project type, recommend optional agents |
| Final Aggregator | qa-aggregator.md | Opus | Merge all findings, rank P0-P3, apply confidence + corroboration |
| Solutions Architect | qa-solutions-architect.md | Opus | Write layered implementation spec from ranked findings |
| TDD Agent | qa-tdd.md | Sonnet | Write test plan (Mode 1) and test files (Mode 2) |

---

## Model Assignment

| Role | Model | Count | Rationale |
|------|-------|-------|-----------|
| Core QA agents | Sonnet | 11 | Focused single-specialty analysis. Saves tokens at scale. |
| Optional QA agents | Sonnet | 0-6 | Same -- focused scope, single lens. |
| Pre-Aggregator | Haiku | 1 | Simple task: dedupe, detect project type. |
| Final Aggregator | Opus | 1 | Hardest job: synthesize 11-17 reports, corroboration, ranking. |
| Solutions Architect | Opus | 1 | Implementation-ready specs for P0s need deep reasoning. |
| TDD Agent | Sonnet | 1 | Writing test code from known issues. Well-scoped. |
| Implementation Agent | Opus | 1 | Actually modifying production code to fix bugs. |

**Total agents per run:** 15-21 (depending on optional agent count)

### Estimated Cost

| Project Size | Estimated Cost |
|-------------|----------------|
| Small (< 50 files) | ~$0.50-1 |
| Medium (50-200 files) | ~$1-3 |
| Large (200+ files) | ~$3-10 |

---

## Token Management

1. **Structured output format** -- every QA agent returns findings in a strict JSON schema. No prose.
2. **File budget** -- each agent gets user prompt + codebase map (file tree + key signatures), then reads files relevant to its specialty. Not the full codebase.
3. **Findings cap** -- max 10 findings per agent, ranked by severity. Forces prioritization.
4. **Pre-aggregation compression** -- Haiku deduplicates before Opus gets the combined input.
5. **Layered spec detail** -- Solutions Architect writes full detail for P0, strategic for P1, brief for P2-P3.

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

When multiple agents independently flag the same issue (matched by file + function, or file + line within 5 lines), the aggregator marks it with a corroboration count (e.g., "3/17 agents").

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

- Max 10 findings per agent
- Every finding must include `location` with file + line
- `evidence` quotes the actual problematic code
- `confidence` is one of: confirmed, likely, suspected
- ID prefix matches agent specialty: SEC, ERR, PERF, CONC, API, EDGE, LOGIC, DATA, ARCH, RES, MEM, CFG, TYPE, LOG, COMPAT, SUPPLY, STATE

---

## /qa-swarm:attack Orchestration

**Input:** User prompt (e.g., "check all API endpoints for security issues")
**Output:** 3 files in `docs/qa-swarm/`
**Skill file:** `skills/attack/SKILL.md`

### Pipeline Steps

```
Step 1: SETUP
  - Parse user prompt
  - Generate codebase map (file tree, key exports/signatures via first 50 lines of key files)
  - Print cost estimate and codebase summary
  - Wait for user confirmation (Y/n)
  - Track timestamps for per-phase timing

Step 2: CORE SWARM (parallel, 11 Sonnet agents)
  - Launch all 11 core QA agents simultaneously via Agent tool
  - Each receives: user prompt + codebase map + agent-specific instructions from agents/*.md
  - Each explores relevant files, returns max 10 findings in structured JSON
  - If any agent fails, log it and continue with remaining agents

Step 3: PRE-AGGREGATION (1 Haiku agent)
  - Collect all core agent findings
  - Deduplicate overlapping findings (same file + line range within 5 lines, or same file + function + similar description)
  - Build corroboration map (flagged_by array per finding)
  - Detect project type from codebase files
  - Recommend which optional agents to activate with reasons

Step 4: USER CONFIRMATION
  - Present optional agent recommendations:
    "Detected: [project type]
     Core agents (11): complete, {N} findings ({N} after dedup)
     Optional agents recommended:
       + [Agent name] -- [reason]
     Skipping:
       - [Agent name] -- [reason]
     Proceed? (Y/n, or adjust: "+logging -supply-chain")"
  - Wait for user response; parse adjustments

Step 5: OPTIONAL SWARM (parallel, 0-6 Sonnet agents)
  - Launch approved optional agents in parallel
  - Each receives: user prompt + codebase map + core findings summary (so they don't duplicate)
  - Return max 10 findings each

Step 6: FINAL AGGREGATION (1 Opus agent)
  - Merge all findings from core + optional agents
  - Run second dedup pass for core-optional overlaps
  - Validate and adjust severity using confidence gates
  - Validate confidence tags against evidence
  - Apply corroboration scoring
  - Produce ranked report in markdown
  - Print findings summary table (all findings, sorted by severity then confidence)

Step 7: PARALLEL OUTPUT (1 Opus + 1 Sonnet agent)
  - Solutions Architect (Opus): Writes layered implementation spec
    - P0: implementation-ready detail (files, steps, code patterns, risk)
    - P1: strategic detail (approach, grouping, dependencies)
    - P2-P3: brief descriptions in table format
  - TDD Agent (Sonnet, Mode 1): Writes test plan
    - Audits existing tests for duplication before writing new ones
    - Test cases for each finding, grouped by priority
    - Complete test code ready to write to disk

Step 8: SAVE
  - docs/qa-swarm/YYYY-MM-DD-report.md
  - docs/qa-swarm/YYYY-MM-DD-spec.md
  - docs/qa-swarm/YYYY-MM-DD-tests.md

Step 9: HANDOFF
  - Print per-phase timing breakdown
  - Print agent usage summary (Sonnet/Haiku/Opus counts)
  - Print file paths for all 3 output files
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

  P1-P3 Phases (batched by priority, Opus):
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

The pre-aggregation agent (Haiku) examines the project's files and reasons about which optional agents are relevant. No hardcoded detection rules -- the agent uses its understanding of:

- What files exist (Cargo.toml, package.json, go.mod, etc.)
- What dependencies are present
- What the project structure suggests (library vs binary, frontend vs backend, etc.)

The user always gets a confirmation prompt showing which optional agents will activate and why, with the ability to add or remove agents before proceeding (e.g., `+logging -supply-chain`).

---

## Output File Formats

All output is saved to `docs/qa-swarm/` in the target project.

### Report (YYYY-MM-DD-report.md)

```markdown
# QA Swarm Report
**Date:** YYYY-MM-DD
**Prompt:** "user's original prompt"
**Agents deployed:** N (11 core + N optional)

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
| **Security Auditor** | SQL/command/path injection, SSRF, auth flaws, privilege escalation, hardcoded secrets, XSS, CSRF, insecure crypto, PII exposure, missing rate limiting, IDOR |
| **Error Handling** | Silent failures, missing catches, panic paths, swallowed errors, unchecked return values |
| **Performance** | N+1 queries, unnecessary allocations, missing pagination, synchronous bottlenecks, unbatched operations |
| **Concurrency** | Race conditions, deadlocks, unsafe shared state, missing locks, non-atomic operations |
| **API Contract** | Missing input validation, inconsistent response shapes, undocumented error codes, missing content-type checks |
| **Edge Case** | Boundary conditions, empty/null inputs, integer overflow, Unicode edge cases, max-length violations |
| **Logic & Correctness** | Off-by-one errors, wrong comparison operators, flawed conditional logic, inverted boolean expressions |
| **Data Integrity** | Schema mismatches, data loss paths, inconsistent transformations, missing foreign key constraints |
| **Architecture** | SOLID violations, tight coupling, god classes, wrong abstractions, circular dependencies |
| **Resilience** | Missing timeouts, no retry logic, no circuit breakers, ungraceful degradation, cascade failure paths |
| **Resource Management** | Memory leaks, unclosed file handles/connections, unbounded growth, missing cleanup |

### Pipeline Agent Roles

| Agent | Input | Output | Key Rules |
|-------|-------|--------|-----------|
| **Pre-Aggregator** | 11 core agent findings + file tree | Deduplicated findings + project type + optional agent recommendations | Match duplicates by file+line (within 5) or file+function+description |
| **Aggregator** | Deduplicated findings + optional findings + project type | Final ranked report in markdown | Must validate severity against confidence gates; cannot add new findings; conservative ranking |
| **Solutions Architect** | Ranked report + codebase access | Layered implementation spec | Must read actual code before writing steps; simplest correct fix; cross-reference related findings |
| **TDD Agent** | Ranked report + codebase access (Mode 1); test plan (Mode 2) | Test plan document (Mode 1); test files on disk (Mode 2) | Must audit existing tests for duplication first; every test must be runnable; no scope creep beyond findings |
