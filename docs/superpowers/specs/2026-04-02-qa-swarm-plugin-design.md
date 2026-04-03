# QA Swarm Plugin -- Design Specification

**Date:** 2026-04-02
**Status:** Approved

---

## Overview

A distributable Claude Code plugin that deploys a swarm of specialized QA agents onto a codebase, aggregates their findings into a prioritized report, generates an implementation spec, and then optionally implements fixes via a TDD loop.

Two commands:
- `/qa-swarm <prompt>` -- Analysis pipeline
- `/qa-swarm:implement <report> <spec> <tests>` -- Implementation pipeline

Distributed as a GitHub repository. Users install by adding the repo URL to their Claude Code plugin sources.

---

## Plugin Structure

```
qa-swarm-plugin/
├── .claude-plugin/
│   └── plugin.json
├── commands/
│   ├── qa-swarm.md
│   └── qa-swarm:implement.md
├── agents/
│   ├── qa-security-auditor.md
│   ├── qa-error-handling.md
│   ├── qa-performance.md
│   ├── qa-concurrency.md
│   ├── qa-api-contract.md
│   ├── qa-edge-case.md
│   ├── qa-logic-correctness.md
│   ├── qa-data-integrity.md
│   ├── qa-architecture.md
│   ├── qa-resilience.md
│   ├── qa-resource-mgmt.md
│   ├── qa-config-env.md            (optional)
│   ├── qa-type-safety.md           (optional)
│   ├── qa-logging.md               (optional)
│   ├── qa-backwards-compat.md      (optional)
│   ├── qa-supply-chain.md          (optional)
│   ├── qa-state-mgmt.md            (optional)
│   ├── qa-pre-aggregator.md
│   ├── qa-aggregator.md
│   ├── qa-solutions-architect.md
│   └── qa-tdd.md
├── skills/
│   └── qa-swarm/
│       └── SKILL.md
├── README.md
└── LICENSE
```

---

## Agent Roster

### Core Agents (always active) -- 11 agents

| # | Agent | File | Focus |
|---|-------|------|-------|
| 1 | Security Auditor | qa-security-auditor.md | Injection, auth flaws, secrets exposure, OWASP top 10 |
| 2 | Error Handling Analyst | qa-error-handling.md | Silent failures, missing catches, panic paths |
| 3 | Performance Analyst | qa-performance.md | N+1 queries, unnecessary allocations, bottlenecks |
| 4 | Concurrency Reviewer | qa-concurrency.md | Race conditions, deadlocks, unsafe shared state |
| 5 | API Contract Validator | qa-api-contract.md | Input validation, response consistency |
| 6 | Edge Case Hunter | qa-edge-case.md | Boundary conditions, empty inputs, overflow |
| 7 | Logic & Correctness Reviewer | qa-logic-correctness.md | Off-by-one, wrong operators, flawed conditionals |
| 8 | Data Integrity Analyst | qa-data-integrity.md | Schema mismatches, data loss paths |
| 9 | Architecture & Design Reviewer | qa-architecture.md | SOLID violations, coupling, god classes, wrong abstractions |
| 10 | Resilience & Failure Mode Analyst | qa-resilience.md | Timeouts, retries, graceful degradation |
| 11 | Resource & Memory Management Auditor | qa-resource-mgmt.md | Leaks, unclosed handles, unbounded growth |

### Optional Agents (activated by project type) -- up to 6 agents

| # | Agent | File | Focus |
|---|-------|------|-------|
| 12 | Configuration & Env Reviewer | qa-config-env.md | Hardcoded values, missing env vars, config drift |
| 13 | Type & Null Safety Auditor | qa-type-safety.md | Null derefs, unsafe casts, type coercion traps |
| 14 | Logging & Observability Auditor | qa-logging.md | Missing logs, sensitive data in logs, trace gaps |
| 15 | Backwards Compatibility Analyst | qa-backwards-compat.md | Breaking public APIs, serialization format changes |
| 16 | Dependency & Supply Chain Auditor | qa-supply-chain.md | Known CVEs, unpinned versions, license conflicts |
| 17 | State Management Reviewer | qa-state-mgmt.md | Invalid state transitions, global state abuse |

### Pipeline Agents

| Agent | File | Model | Role |
|-------|------|-------|------|
| Pre-Aggregator | qa-pre-aggregator.md | Haiku | Deduplicate core findings, detect project type, recommend optional agents |
| Final Aggregator | qa-aggregator.md | Opus | Merge all findings, rank P0-P3, apply confidence + corroboration |
| Solutions Architect | qa-solutions-architect.md | Opus | Write layered implementation spec from ranked findings |
| TDD Agent | qa-tdd.md | Sonnet | Write test plan and test files from ranked findings |

---

## Model Assignment

| Role | Model | Rationale |
|------|-------|-----------|
| 11 Core QA agents | Sonnet | Focused single-specialty analysis. Saves tokens at scale. |
| 6 Optional QA agents | Sonnet | Same -- focused scope, single lens. |
| Pre-Aggregator | Haiku | Simple task: dedupe, detect project type. |
| Final Aggregator | Opus | Hardest job: synthesize 11-17 reports, corroboration, ranking. |
| Solutions Architect | Opus | Implementation-ready specs for P0s need deep reasoning. |
| TDD Agent | Sonnet | Writing test code from known issues. Well-scoped. |
| Implementation Agent (in /qa-swarm:implement) | Opus | Actually modifying production code to fix bugs. |

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

When multiple agents independently flag the same issue (matched by file + function), the aggregator marks it with a corroboration count (e.g., "3/17 agents"). Higher corroboration = higher effective confidence regardless of individual agent confidence tags.

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

Constraints:
- Max 10 findings per agent
- Every finding must include `location` with file + line
- `evidence` quotes the actual problematic code
- `confidence` is one of: confirmed, likely, suspected
- ID prefix matches agent specialty: SEC, ERR, PERF, CONC, API, EDGE, LOGIC, DATA, ARCH, RES, MEM, CFG, TYPE, LOG, COMPAT, SUPPLY, STATE

---

## `/qa-swarm` Orchestration Flow

**Input:** User prompt (e.g., "check all API endpoints for security issues")
**Output:** 3 files in `docs/qa-swarm/`

```
Step 1: SETUP
  - Parse user prompt
  - Generate codebase map (file tree, key exports/signatures)

Step 2: CORE SWARM (parallel, Sonnet)
  - Launch 11 core QA agents simultaneously
  - Each receives: user prompt + codebase map + specialty instructions
  - Each explores relevant files, returns max 10 findings in structured format

Step 3: PRE-AGGREGATION (Haiku)
  - Collect all core agent findings
  - Deduplicate overlapping findings
  - Reason about project type from codebase files
  - Present user with optional agent confirmation:
    "Detected: [project type]
     Core agents (11): complete
     Optional agents activating:
       + [Agent name] ([reason])
       + [Agent name] ([reason])
     Skipping: [Agent names]
     Proceed? [Y/n]"

Step 4: OPTIONAL SWARM (parallel, Sonnet)
  - Launch approved optional agents
  - These receive: user prompt + codebase map + core findings summary
  - Return max 10 findings each

Step 5: FINAL AGGREGATION (Opus)
  - Merge all findings from core + optional agents
  - Apply P0-P3 severity ranking
  - Apply confirmed/likely/suspected confidence tags
  - Detect corroboration (multiple agents flagging same location)
  - Produce ranked report

Step 6: PARALLEL OUTPUT
  - Solutions Architect (Opus): Writes layered spec
    - P0: implementation-ready detail (files, patterns, ordered steps)
    - P1: strategic detail (approach, grouping, dependencies)
    - P2-P3: brief descriptions
  - TDD Agent (Sonnet): Writes test plan
    - Test cases for each finding, grouped by priority

Step 7: SAVE
  - docs/qa-swarm/YYYY-MM-DD-report.md
  - docs/qa-swarm/YYYY-MM-DD-spec.md
  - docs/qa-swarm/YYYY-MM-DD-tests.md

Step 8: HANDOFF
  - Print summary: "X findings (N P0, N P1, N P2, N P3)"
  - Print file paths for all 3 output files
  - Recommend:
    "Ready to implement fixes. Recommended:
     1. Run /clear to free up context (the swarm used a lot of tokens)
     2. Then run:
        /qa-swarm:implement docs/qa-swarm/YYYY-MM-DD-report.md docs/qa-swarm/YYYY-MM-DD-spec.md docs/qa-swarm/YYYY-MM-DD-tests.md"
```

---

## `/qa-swarm:implement` Orchestration Flow

**Input:** 3 file paths (report, spec, test plan)
**Output:** Fixed code + completion report

```
Step 1: INGEST
  - Validate all 3 input files exist. If any are missing, error with:
    "Missing file: [path]. Run /qa-swarm first to generate the analysis files."
  - Read the 3 input files
  - Parse findings grouped by priority
  - Check for existing results file (docs/qa-swarm/YYYY-MM-DD-results.md)
    - If found, load it and mark already-fixed issues as complete
    - This enables incremental runs across sessions

Step 2: PHASE SELECTION
  - Present a summary table of all phases:

    "QA Swarm Implementation Phases:

     Phase | Priority | Issues | Status
     ------|----------|--------|-------
       1   | P0 Crit  |   3    | Not started
       2   | P1 High  |   5    | Not started
       3   | P2 Med   |   8    | Not started
       4   | P3 Low   |   4    | Not started

     Options:
       [A]   All phases (P0 -> P1 -> P2 -> P3)
       [1]   Phase 1 only
       [2]   Phase 2 only
       [3]   Phase 3 only
       [4]   Phase 4 only
       [1-2] Phases 1 through 2
       [1,3] Phases 1 and 3

     Select phases:"

  - If resuming a previous run, Status column shows "Done (3/3)", "Partial (2/5)", etc.
  - Wait for user selection before proceeding

Step 3: TDD SETUP (Sonnet)
  - TDD Agent reads the test plan for SELECTED PHASES ONLY
  - Writes actual test files into the project's test directory
  - Runs the test suite -- confirms they fail (red phase)
  - Tests that already pass are removed from queue (already fixed or false positive)

Step 4: PHASE EXECUTION
  - Execute selected phases in priority order (P0 first even if user selected [2,1])
  - P0 phase uses strict ordering:
    - For each P0 issue, one at a time:
      a. Implementation Agent reads the spec (implementation-ready detail)
      b. Writes the fix
      c. Runs ALL tests
      d. If new failures appear, fix them before moving on
      e. If fix fails after 4 attempts, HALT
         - Surface to user: what was tried, what failed, why
         - Ask user to intervene or skip
      f. Move to next P0
  - P1-P3 phases use batched execution:
    - For each priority level in selection:
      a. Implementation Agent reads spec for the batch
      b. Writes fixes for the batch
      c. Runs ALL tests
      d. If failures, attempt to fix
      e. If fix fails after 2 attempts, skip, log as unresolved
      f. Move to next issue

Step 5: PHASE COMPLETE
  - Run full test suite for verification
  - Update results file incrementally (docs/qa-swarm/YYYY-MM-DD-results.md)
  - Print phase summary:
    "Phase N complete.
     Fixed:      N/N issues
     Unresolved: N issues
     Halted:     N (required intervention)
     Tests:      N passing, N failing"

Step 6: CONTINUE PROMPT
  - If more phases remain (not selected or not yet run):
    "Remaining phases:

     Phase | Priority | Issues | Status
     ------|----------|--------|-------
       3   | P2 Med   |   8    | Not started
       4   | P3 Low   |   4    | Not started

     Continue with another phase? [3/4/3-4/A/done]"
  - If user selects more phases, loop back to Step 3
  - If user selects "done" or no phases remain, proceed to Step 7

Step 7: FINAL REPORT
  - Save/update docs/qa-swarm/YYYY-MM-DD-results.md
  - Print overall summary:
    "Implementation complete.
     Fixed:      N/N issues
     Unresolved: N issues (see report)
     Halted:     N P0s (required human intervention)
     Skipped:    N issues (phases not selected)

     Tests: N passing, N failing

     Results: docs/qa-swarm/YYYY-MM-DD-results.md"
```

### Retry Limits

| Priority | Max Retries | On Failure |
|----------|-------------|------------|
| P0 | 4 | Halt, surface to user with full context |
| P1-P3 | 2 | Skip, log as unresolved, continue |

---

## Project Type Detection

The pre-aggregation agent (Haiku) examines the project's files and reasons about which optional agents are relevant. No hardcoded detection rules -- the agent uses its understanding of:

- What files exist (Cargo.toml, package.json, go.mod, etc.)
- What dependencies are present
- What the project structure suggests (library vs binary, frontend vs backend, etc.)

The user always gets a confirmation prompt showing which optional agents will activate and why, with the ability to add or remove agents before proceeding.

---

## Output File Formats

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

## P0 - Critical

### [P0-001] Title
**Confidence:** Confirmed | **Corroborated by:** 3 agents (Security, API Contract, Edge Case)
**Location:** file:line
**Description:** ...
**Evidence:** ...
**Suggested fix:** ...

(repeat for each finding, grouped by priority)
```

### Spec (YYYY-MM-DD-spec.md)

```markdown
# QA Swarm Implementation Spec
**Date:** YYYY-MM-DD
**Source report:** YYYY-MM-DD-report.md

## P0 Fixes (Implementation-Ready)

### Fix P0-001: Title
**Files to modify:** ...
**Dependencies:** ...
**Steps:**
1. ...
2. ...
**Code pattern:** ...
**Verification:** ...

## P1 Fixes (Strategic)

### Fix P1-001: Title
**Approach:** ...
**Related fixes:** ...
**Considerations:** ...

## P2-P3 Fixes (Brief)

### Fix P2-001: Title
**Description:** ...
```

### Test Plan (YYYY-MM-DD-tests.md)

```markdown
# QA Swarm Test Plan
**Date:** YYYY-MM-DD
**Source report:** YYYY-MM-DD-report.md

## Test Cases

### P0-001: Title
**Test file:** tests/qa-swarm/test_p0_001.ext
**Cases:**
- Test that [specific condition] is handled
- Test that [attack vector] is rejected
- Test that [edge case] returns expected result

(repeat for each finding)
```

### Results (YYYY-MM-DD-results.md)

```markdown
# QA Swarm Implementation Results
**Date:** YYYY-MM-DD
**Source spec:** YYYY-MM-DD-spec.md

## Summary
- Fixed: N/N issues
- Unresolved: N issues
- Halted: N P0s

## Fixed Issues
### P0-001: Title
**Fix applied:** ...
**Tests passing:** ...

## Unresolved Issues
### P1-003: Title
**Attempts:** 2
**Last error:** ...
**Recommendation:** ...

## Halted Issues
### P0-002: Title
**Attempts:** 4
**What was tried:** ...
**Why it failed:** ...
**Recommendation:** ...
```

---

## Distribution

### plugin.json

```json
{
  "name": "qa-swarm",
  "description": "Deploy a swarm of specialized QA agents to analyze, report, and fix issues in any codebase",
  "version": "1.0.0",
  "repository": "https://github.com/USER/qa-swarm-plugin",
  "license": "MIT",
  "keywords": ["qa", "testing", "code-review", "tdd", "multi-agent"]
}
```

### Installation

Users add the GitHub repo URL to their Claude Code plugin sources. The plugin auto-discovers commands, agents, and the skill definition.
