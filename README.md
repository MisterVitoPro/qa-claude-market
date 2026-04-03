# QA Swarm Plugin

AI-powered code quality analyzer that finds security, performance, architecture, and correctness issues across your codebase using up to 17 specialized agents -- then fixes them via TDD.

- **11 core agents** scan in parallel (security, performance, concurrency, data integrity, and more)
- **6 optional agents** activate based on your project type (config review, type safety, supply chain, etc.)
- Findings are **deduplicated, ranked P0-P3**, tagged with confidence levels, and **corroborated** across agents
- Fixes are implemented **test-first** -- failing tests are written before code is changed

## Quick Start

```bash
# Install
claude plugin marketplace add MisterVitoPro/qa-swarm

# Analyze your codebase
/qa-swarm:attack "find bugs in the authentication and authorization flow"

# After the swarm completes, implement fixes using the generated file paths
/qa-swarm:implement docs/qa-swarm/2026-04-02-report.md docs/qa-swarm/2026-04-02-spec.md docs/qa-swarm/2026-04-02-tests.md
```

## Why QA Swarm?

Most code review approaches give you one lens at a time. QA Swarm runs 11-17 specialized agents **in parallel**, each with a distinct expertise. When 3+ agents independently flag the same issue, you know it's real.

| | QA Swarm | Manual Review | Linters (ESLint, etc.) | GitHub Code Scanning |
|---|----------|---------------|------------------------|----------------------|
| **Parallel analysis** | 11-17 agents | 1 reviewer | 1-2 tools | 1 tool |
| **Cross-specialty** | Security + perf + architecture + more, simultaneously | Depends on reviewer | Single lens per rule | Single lens |
| **Implements fixes** | Yes, TDD-driven | Reviewer suggests, you implement | No | No |
| **Corroboration** | Flags issues found by multiple agents | No | No | No |
| **Confidence scoring** | Confirmed / Likely / Suspected | Informal | Binary (pass/fail) | Binary |
| **Time** | ~5 minutes | Hours to days | Seconds | Minutes |

**Best for:** Pre-release audits, onboarding to unfamiliar codebases, quarterly deep dives, and catching issues that slip past linters and CI.

**Complements (not replaces):** Pre-commit hooks, unit tests, and domain-expert code review.

## Sample Output

After running `/qa-swarm:attack`, you get a ranked report like this:

```markdown
# QA Swarm Report
**Date:** 2026-04-02
**Prompt:** "find bugs in the authentication and authorization flow"
**Agents deployed:** 14 (11 core + 3 optional)

## Summary
- P0 Critical: 2 findings
- P1 High: 5 findings
- P2 Medium: 8 findings
- P3 Low: 3 findings
- Total: 18 findings (6 confirmed, 8 likely, 4 suspected)

## P0 - Critical

### [P0-001] SQL injection in user lookup query
**Confidence:** Confirmed | **Corroborated by:** 3 agents (Security Auditor, API Contract Validator, Data Integrity Analyst)
**Location:** src/auth/users.ts:47 in `findUserByEmail`
**Description:** User-supplied email is interpolated directly into a SQL query
without parameterization. An attacker can inject arbitrary SQL via the login form.
**Evidence:**
  const user = await db.query(`SELECT * FROM users WHERE email = '${email}'`);
**Suggested fix:** Use parameterized queries: `db.query('SELECT * FROM users WHERE email = $1', [email])`
**Related files:** src/auth/login.ts, src/middleware/validate.ts

### [P0-002] JWT secret hardcoded in source
**Confidence:** Confirmed | **Corroborated by:** 2 agents (Security Auditor, Configuration & Env Reviewer)
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
claude plugin marketplace add MisterVitoPro/qa-swarm
claude plugin install qa-swarm
# Restart Claude Code to activate
```

Or load directly for a single session:

```bash
claude --plugin-dir /path/to/qa-swarm
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

After the swarm completes:
1. Optionally run `/clear` to free up context (the swarm uses many tokens; clearing helps if your session is running low)
2. Run `/qa-swarm:implement` with the generated file paths

### Implement Fixes

```
/qa-swarm:implement docs/qa-swarm/2026-04-02-report.md docs/qa-swarm/2026-04-02-spec.md docs/qa-swarm/2026-04-02-tests.md
```

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

### Core Agents (always active)

| Agent | Specialty |
|-------|-----------|
| Security Auditor | Injection, auth flaws, secrets, OWASP top 10 |
| Error Handling Analyst | Silent failures, missing catches, panic paths |
| Performance Analyst | N+1 queries, allocations, bottlenecks |
| Concurrency Reviewer | Race conditions, deadlocks, unsafe shared state |
| API Contract Validator | Input validation, response consistency |
| Edge Case Hunter | Boundary conditions, empty inputs, overflow |
| Logic & Correctness Reviewer | Off-by-one, wrong operators, flawed conditionals |
| Data Integrity Analyst | Schema mismatches, data loss paths |
| Architecture & Design Reviewer | SOLID violations, coupling, god classes |
| Resilience & Failure Mode Analyst | Timeouts, retries, graceful degradation |
| Resource & Memory Management Auditor | Leaks, unclosed handles, unbounded growth |

### Optional Agents (activated by project type)

| Agent | Activates When |
|-------|----------------|
| Configuration & Env Reviewer | Environment-dependent deployment detected |
| Type & Null Safety Auditor | Dynamic typing or weak type checking detected |
| Logging & Observability Auditor | Production service detected |
| Backwards Compatibility Analyst | Library or public API detected |
| Dependency & Supply Chain Auditor | Third-party dependencies present |
| State Management Reviewer | Frontend app or stateful service detected |

After core analysis, you are asked to confirm which optional agents to activate. Customize with `+agent-name` to add or `-agent-name` to remove from the recommendation.

</details>

<details>
<summary><h2>Model Usage</h2></summary>

| Role | Model | Count |
|------|-------|-------|
| QA Agents | Sonnet | 11-17 |
| Pre-Aggregator | Haiku | 1 |
| Aggregator | Opus | 1 |
| Solutions Architect | Opus | 1 |
| TDD Agent | Sonnet | 1 |
| Implementation Agent | Opus | 1 |

</details>

## License

MIT
