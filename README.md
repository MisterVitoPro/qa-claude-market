# QA Swarm Plugin

A Claude Code plugin that deploys a swarm of specialized QA agents to analyze your codebase, rank findings by priority and confidence, and optionally implement fixes via TDD.

## What It Does

**`/qa-swarm:attack <prompt>`** -- Runs 11-17 specialized QA agents in parallel against your codebase. Each agent has a distinct specialty (security, performance, concurrency, etc.). Findings are aggregated, deduplicated, ranked P0-P3, tagged with confidence levels, and cross-referenced for corroboration. Produces three files: a ranked report, an implementation spec, and a TDD test plan.

**`/qa-swarm:implement <report> <spec> <tests>`** -- Takes the output files from an attack and implements fixes. Writes failing tests first (TDD red phase), then fixes P0 issues one-at-a-time with strict retry limits, then batches P1-P3 fixes. Loops until tests pass.

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

After the swarm completes, it recommends:
1. Run `/clear` to free up context
2. Run `/qa-swarm:implement` with the generated file paths

### Implement Fixes

```
/qa-swarm:implement docs/qa-swarm/2026-04-02-report.md docs/qa-swarm/2026-04-02-spec.md docs/qa-swarm/2026-04-02-tests.md
```

## Agent Roster

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

After core analysis, you are asked to confirm which optional agents to activate.

## Priority System

| Priority | Meaning |
|----------|---------|
| P0 Critical | Actively exploitable, data loss, production crash |
| P1 High | Real problems under normal usage |
| P2 Medium | Latent risk, code smell that compounds |
| P3 Low | Improvement opportunity |

Each finding also gets:
- **Confidence:** Confirmed / Likely / Suspected
- **Corroboration:** How many agents independently flagged the same issue

## Model Usage

| Role | Model | Count |
|------|-------|-------|
| QA Agents | Sonnet | 11-17 |
| Pre-Aggregator | Haiku | 1 |
| Aggregator | Opus | 1 |
| Solutions Architect | Opus | 1 |
| TDD Agent | Sonnet | 1 |
| Implementation Agent | Opus | 1 |

## Output Files

All output is saved to `docs/qa-swarm/` in your project:
- `{date}-report.md` -- Ranked findings with evidence
- `{date}-spec.md` -- Implementation spec (layered detail by priority)
- `{date}-tests.md` -- TDD test plan
- `{date}-results.md` -- Implementation results (after /qa-swarm:implement)

## License

MIT
