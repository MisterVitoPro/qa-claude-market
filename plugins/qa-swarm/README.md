# QA Swarm

AI-powered code quality analyzer that finds security, performance, architecture, and correctness issues across your codebase using specialized agents -- then fixes them via TDD.

Part of the [MisterVitoPro Plugin Marketplace](../../README.md).

- **6 core Sonnet agents** scan in parallel (security & error handling, performance & resources, correctness, architecture, data flow & taint analysis, async & concurrency patterns)
- **Up to 6 optional Haiku agents** activate based on your project type (config review, type safety, supply chain, etc.)
- Source files are **pre-read and embedded** in agent prompts for zero-overhead analysis
- Findings are **deduplicated, ranked P0-P3**, tagged with confidence levels, and **corroborated** across agents
- Fixes are implemented **test-first** -- failing tests are written before code is changed

## Quick Start

```bash
# Install
claude plugin marketplace add MisterVitoPro/qa-swarm --plugin qa-swarm

# Analyze your codebase
/qa-swarm:attack "find bugs in the authentication and authorization flow"

# After the swarm completes, implement fixes using the generated file paths
/qa-swarm:implement docs/qa-swarm/2026-04-02-report.md docs/qa-swarm/2026-04-02-spec.md docs/qa-swarm/2026-04-02-tests.md
```

## Why QA Swarm?

Most code review approaches give you one lens at a time. QA Swarm runs 6-12 specialized agents **in parallel**, each with a distinct expertise. When 3+ agents independently flag the same issue, you know it's real.

| | QA Swarm | Manual Review | Linters (ESLint, etc.) | GitHub Code Scanning |
|---|----------|---------------|------------------------|----------------------|
| **Parallel analysis** | 6-12 agents | 1 reviewer | 1-2 tools | 1 tool |
| **Cross-specialty** | Security + perf + architecture + more, simultaneously | Depends on reviewer | Single lens per rule | Single lens |
| **Implements fixes** | Yes, TDD-driven | Reviewer suggests, you implement | No | No |
| **Corroboration** | Flags issues found by multiple agents | No | No | No |
| **Confidence scoring** | Confirmed / Likely / Suspected | Informal | Binary (pass/fail) | Binary |
| **Time** | ~2-5 minutes | Hours to days | Seconds | Minutes |

**Best for:** Pre-release audits, onboarding to unfamiliar codebases, quarterly deep dives, and catching issues that slip past linters and CI.

**Complements (not replaces):** Pre-commit hooks, unit tests, and domain-expert code review.

## Sample Output

After running `/qa-swarm:attack`, you get a ranked report like this:

```markdown
# QA Swarm Report
**Date:** 2026-04-02
**Prompt:** "find bugs in the authentication and authorization flow"
**Agents deployed:** 9 (6 core + 3 optional)

## Summary
- P0 Critical: 2 findings
- P1 High: 5 findings
- P2 Medium: 8 findings
- P3 Low: 3 findings
- Total: 18 findings (6 confirmed, 8 likely, 4 suspected)

## P0 - Critical

### [P0-001] SQL injection in user lookup query
**Confidence:** Confirmed | **Corroborated by:** 3 agents (Security & Error, Correctness, Architecture)
**Location:** src/auth/users.ts:47 in `findUserByEmail`
**Description:** User-supplied email is interpolated directly into a SQL query
without parameterization. An attacker can inject arbitrary SQL via the login form.
**Evidence:**
  const user = await db.query(`SELECT * FROM users WHERE email = '${email}'`);
**Suggested fix:** Use parameterized queries: `db.query('SELECT * FROM users WHERE email = $1', [email])`
**Related files:** src/auth/login.ts, src/middleware/validate.ts

### [P0-002] JWT secret hardcoded in source
**Confidence:** Confirmed | **Corroborated by:** 2 agents (Security & Error, Configuration & Env)
**Location:** src/auth/jwt.ts:12 in `signToken`
**Description:** JWT signing secret is a hardcoded string literal. Anyone with
source access can forge valid tokens.
**Evidence:**
  const SECRET = "super-secret-key-do-not-share";
**Suggested fix:** Move to environment variable: `process.env.JWT_SECRET`
**Related files:** src/auth/verify.ts, .env.example

## P1 - High
...
```

You also get an **implementation spec** (step-by-step fix plan, scaled by priority) and a **TDD test plan** (failing tests written before any code changes).

All files are saved to `docs/qa-swarm/{date}-report.md`, `{date}-spec.md`, and `{date}-tests.md`.

## Installation

```bash
claude plugin marketplace add MisterVitoPro/qa-swarm --plugin qa-swarm
```

Or load directly for a single session:

```bash
claude --plugin-dir /path/to/plugins/qa-swarm
```

## Usage

### Run QA Analysis

```
/qa-swarm:attack "check all API endpoints for security and input validation issues"
```

```
/qa-swarm:attack "review the database layer for data integrity and performance problems"
```

```
/qa-swarm:attack "find bugs in the authentication and authorization flow"
```

After the swarm completes, `/qa-swarm:attack` asks once whether to proceed to implementation. Selecting `Y` auto-hands off to `/qa-swarm:implement` in a **fresh-context subagent** (functionally equivalent to `/clear` + manual invocation, without the keystrokes). Selecting `n` stops so you can resume later with:

```
/qa-swarm:implement docs/qa-swarm/{DATE}-report.md docs/qa-swarm/{DATE}-spec.md docs/qa-swarm/{DATE}-tests.md
```

### Implement Fixes

```
/qa-swarm:implement docs/qa-swarm/2026-04-02-report.md docs/qa-swarm/2026-04-02-spec.md docs/qa-swarm/2026-04-02-tests.md
```

The implementation pipeline:
1. Presents phases (P0-P3) -- you choose which to tackle
2. Writes TDD tests in parallel across **3 test-writer agents** (files partitioned so no two agents write the same file); uses the Context7 MCP for current framework docs when available
3. Runs the suite once to confirm the red phase
4. Implements fixes one at a time (P0) or batched (P1-P3)
5. Loops until tests pass (green phase)
6. Offers to continue with remaining phases

## Priority and Confidence

Findings are ranked by priority and tagged with confidence:

| Priority | Meaning | Action |
|----------|---------|--------|
| **P0 Critical** | Actively exploitable, data loss, or production crash | Fix immediately -- do not deploy without addressing |
| **P1 High** | Real problems under normal usage | Fix in this sprint |
| **P2 Medium** | Latent risk, code smell that compounds over time | Fix when convenient |
| **P3 Low** | Improvement opportunity | Consider during refactoring |

| Confidence | Meaning |
|------------|---------|
| **Confirmed** | Traceable path or quotable code snippet that is unambiguously wrong |
| **Likely** | Strong evidence, but runtime behavior may differ |
| **Suspected** | Pattern looks wrong but could be intentional or mitigated elsewhere |

**Corroboration** counts how many independent agents flagged the same issue. If 3+ agents flag it, the finding is more likely real, even if any single agent's confidence is low.

## Output Files

All output is saved to `docs/qa-swarm/` in your project:
- `{date}-report.md` -- Ranked findings with evidence
- `{date}-spec.md` -- Implementation spec (layered detail by priority)
- `{date}-tests.md` -- TDD test plan
- `{date}-results.md` -- Implementation results (after `/qa-swarm:implement`)

<details>
<summary><h2>Agent Roster</h2></summary>

### Core Agents (always active -- Sonnet)

| Agent | Specialty |
|-------|-----------|
| Security & Error Handling | Injection, auth flaws, secrets, OWASP top 10, silent failures, missing catches, panic paths, timeouts, cascade failures |
| Performance & Resources | N+1 queries, bottlenecks, race conditions, deadlocks, memory leaks, unclosed handles, unbounded growth |
| Correctness | Schema mismatches, data loss, contract violations, off-by-one, wrong operators, boundary failures |
| Architecture & Design | SOLID violations, coupling, god classes, wrong abstractions, circular dependencies |
| Data Flow & Taint Analysis | Source-to-sink tracing, unsanitized input, trust boundary crossings, encoding mismatches, data lifecycle issues |
| Async & Concurrency Patterns | Unhandled rejections, fire-and-forget, async race conditions, event listener leaks, deadlocks, missing cancellation |

### Optional Agents (activated by project type -- Haiku)

| Agent | Activates When |
|-------|----------------|
| Configuration & Env Reviewer | Environment-dependent deployment detected |
| Type & Null Safety Auditor | Dynamic typing or weak type checking detected |
| Logging & Observability Auditor | Production service detected |
| Backwards Compatibility Analyst | Library or public API detected |
| Dependency & Supply Chain Auditor | Third-party dependencies present |
| State Management Reviewer | Frontend app or stateful service detected |

You are asked to confirm which optional agents to activate before the swarm launches. Customize with `+agent-name` to add or `-agent-name` to remove.

</details>

<details>
<summary><h2>Pipeline Architecture</h2></summary>

### Attack Pipeline (`/qa-swarm:attack`)

```
Step 1: Setup + Pre-read
  - Build file tree, tag files by category
  - Auto-detect project type, select optional agents
  - Pre-read ALL source files (embedded in agent prompts)

Step 2: Swarm (parallel)
  - Launch 6-12 agents (6 Sonnet core + Haiku optional) with code embedded inline
  - Zero Read tool calls -- agents analyze immediately

Step 3: Inline Aggregation (no agent spawn)
  - Orchestrator deduplicates, validates severity/confidence
  - Applies corroboration scoring, formats ranked report

Step 4: Fix Planner (1 Sonnet agent)
  - Produces both implementation spec AND test plan

Step 5: Save + Handoff
  - Writes report, spec, and test plan to docs/qa-swarm/
```

### Model Usage

| Role | Model | Count |
|------|-------|-------|
| Core QA agents | Sonnet | 6 |
| Optional QA agents | Haiku | 0-6 |
| Fix Planner | Sonnet | 1 |
| Aggregation | (inline) | 0 |
| **Total (attack)** | | **7-13** |

| Role | Model | Count |
|------|-------|-------|
| TDD Writer | Sonnet | 3 (parallel, file-partitioned) |
| P0 Implementation | Opus | per finding |
| P1-P3 Implementation | Sonnet | per priority |

### Key Optimizations (v1.3.0)

1. **Pre-read & embed** -- source files read once in setup, embedded directly in agent prompts. Eliminates ~40-60 Read tool call round-trips across agents.
2. **Inline aggregation** -- orchestrator performs dedup and ranking directly instead of spawning an aggregator agent.
3. **Merged fix planner** -- single agent produces both spec and test plan, eliminating a pipeline stage.
4. **Sonnet core swarm** -- 6 Sonnet core agents provide deep analysis; Haiku optional agents keep costs lower for supplementary checks.
5. **Expanded file visibility** -- agents receive broader cross-cutting file context (750-line cap with middle-section reads) for better detection of issues spanning multiple concerns.

### Key Optimizations (v1.4.0)

1. **Fresh-context subagent handoff** -- `attack` auto-invokes `implement` in a subagent with zero context from the attack session. No manual `/clear` + re-invoke required.
2. **3 parallel TDD writers** -- test files are partitioned so up to 3 `qa-tdd` agents write concurrently without conflicts. Suite runs once after all three finish.
3. **Optional Context7 MCP** -- test-writer agents consult Context7 for current framework API docs when the MCP server is available; skip silently otherwise.

</details>

## License

MIT
