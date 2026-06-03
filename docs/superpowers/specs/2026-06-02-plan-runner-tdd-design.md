# plan-runner TDD red→green design

**Date:** 2026-06-02
**Plugin:** `plan-runner` (currently v0.4.1)
**Status:** Approved design, pending implementation plan

## Goal

Upgrade `plan-runner` so that plans are executed with a genuine Test-Driven
Development discipline: for every testable task, a failing test is written
first (red), implementation makes it pass (green), and the pipeline records
**proven** red→green evidence by actually running the test command at two
checkpoints. The point is that people running a plan through plan-runner end
up with good tests that demonstrably exercise the code, not self-asserted
"tests exist" claims.

## Success bar

The run is successful when, per testable task, the manifest records:

- a `red_run`: the new test(s) were executed and **failed** before
  implementation, and the failure was a genuine one (valid red);
- a `green_run`: after implementation the same test(s) were executed and
  **passed**.

A testable task with no green proof is flagged as a bug. Evidence is captured
by the orchestrator running the test command itself, not self-reported by the
implementing agent.

## Core decisions (locked during brainstorming)

1. **Deliverable:** proven red→green evidence, recorded per task.
2. **Structure:** split **test-author wave → impl wave**, with gates between.
3. **Test command:** auto-detect → `--test-cmd` flag → prompt; stored in manifest.
4. **Non-testable tasks:** analyzer classifies; non-testable tasks run today's path.
5. **Red gate:** new tests must fail, pre-existing must stay green;
   import / not-implemented failure = valid red; syntax / collection error =
   invalid red.
6. **Opt-in:** TDD is enabled per run via a prompt; `--no-tdd` skips the prompt
   and runs the classic pipeline.

## Opt-in / enablement

A new pre-flight step runs right after plan validation:

- If `--no-tdd` is present → `tdd_enabled = false`, **no prompt**, classic
  pipeline unchanged.
- Otherwise → prompt once: `Enable TDD red-green approach for this run? (Y/n)`.
  `Y`/empty → `tdd_enabled = true`; `n` → classic pipeline.
- Only when `tdd_enabled` do we resolve the test command + baseline. If the
  command can't be resolved (no flag, detection fails) and the user does not
  supply one at the prompt, **STOP** the run with a message pointing to
  `--no-tdd` for the classic pipeline. The run never silently downgrades to
  non-TDD.

`--no-tdd` is the "never ask, never do it" escape hatch; everything else is
opt-in per run.

## Components

### New: `plan-test-author` agent (sonnet)

Writes **only** failing test files for one testable task. Never writes
implementation. Returns the exact test files and test IDs it added so the gates
can attribute pass/fail results.

### Gates run by the orchestrator (not agents)

The orchestrator executes the resolved test command via Bash and captures real
stdout / exit code. This is what makes the red→green evidence *proven* rather
than self-reported.

### `plan-verifier` becomes gate-aware (two modes)

- **red-gate mode** (after a test wave): consumes captured test output; judges
  per test-author whether new tests genuinely fail (valid red) and pre-existing
  tests still pass. Emits bugs for invalid reds (syntax/collection errors, tests
  that pass without impl, broken pre-existing tests). Red *validity* is judged by
  this agent reading the captured output + the test file — not by brittle
  cross-ecosystem regex.
- **green-gate mode** (after an impl wave): confirms the previously-red tests now
  pass, **plus** the existing static acceptance-criteria checks it already does.

Gates are applied **per agent within a wave**, not per wave (see Wave model).

### New pre-flight: test-command resolution + green baseline

Resolve the command (`--test-cmd` flag → repo-marker detection → one-time
prompt), then run the full suite once to establish a baseline of passing tests.
If the baseline is already red, record the pre-existing failing set and warn;
gates subtract it when attributing new failures.

Detection markers (non-exhaustive): `package.json` `scripts.test`,
`pytest.ini` / `pyproject.toml`, `go.mod`, `Cargo.toml`, `*.csproj`, etc.

The resolved command stores two forms:

- a **full-suite** invocation, and
- a **single-file** pattern with a `{file}` placeholder
  (e.g. `pytest {file}`, `npm test -- {file}`, `go test ./{dir}`).

## Analyzer & schema changes (only when `tdd_enabled`)

- Tag each task `testable: true | false`.
- For each **testable** task emit *two* nodes:
  - a `test-author` node (owns the test files), and
  - an `impl` node (owns the impl files). The impl node depends on its own
    test-author node **plus** the impl nodes of any task-level dependencies.
- Test-author nodes depend only on what their interface needs (usually nothing),
  so they pack into early waves — tests get front-loaded by the existing
  topological sort.
- **Non-testable** tasks emit a single node, exactly as today.
- The 6-agents-per-wave and file-disjoint rules are unchanged — test files and
  impl files are different paths, so nothing new conflicts.

### Schema additions (`wave-plan.schema.json`)

- Per agent: `role: "test-author" | "impl" | "standalone"`.
- Per task: `testable` (bool) + optional `non_testable_reason`.
- Each `impl` node carries `tests_to_satisfy` (the test files from its paired
  test-author).

The testable / non-testable split is surfaced in the wave-plan display so the
user can eyeball mis-classifications (nearly free).

## Wave model & gate mechanics

Because the topological sort interleaves nodes, one wave can hold test-author
nodes (for task X), impl nodes (for task Y whose tests were authored earlier),
and standalone non-testable nodes — all file-disjoint. Therefore:

- The orchestrator runs the appropriate test command for each agent in the wave.
- The wave verifier applies **red-gate** logic to test-author agents,
  **green-gate** logic to impl agents, and **static-only** checks to standalone
  agents.

### Red gate

- Run each new test file via the single-file pattern → must exit non-zero
  (the new tests fail).
- Run the full suite → compare the failing set against the baseline; any *new*
  failure outside the expected new test files = a broken pre-existing test (bug).
- The red-gate verifier judges validity: genuine failure (incl. import /
  not-implemented) = valid red; syntax / collection error or a test that passes
  without impl = invalid red.

### Green gate

- Re-run the new test files → must pass.
- Run the full suite → no new failures vs baseline.

Because every impl wave ends on a green full-suite check, **commits stay green**:
the suite is passing at every committed wave.

## Evidence in `manifest.json`

Per testable task:

```json
{
  "task": "...",
  "test_files": ["..."],
  "red_run":   { "cmd": "...", "exit": 1, "result": "FAILED", "valid_red": true },
  "green_run": { "cmd": "...", "exit": 0, "result": "PASSED" }
}
```

The resolved test command (both forms) and the baseline failing set are also
stored at the top level of the manifest.

## Failure handling

There are **no inline retries**. Every gate failure is recorded as a bug and
handled by the **existing** bug → aggregate → fix-plan → re-run loop. This keeps
the control flow identical to today's pipeline; gates only add new *bug sources*,
not new retry logic.

### Red-gate failure (per task)

Invalid red = the new test passes without impl, or it errors on syntax /
collection.

- Emit a **P1** bug and mark the paired impl node **BLOCKED/skipped**
  (implementing against a broken test is pointless). Other tasks in the wave are
  unaffected. The bug flows into aggregation → fix-plan → re-run.

### Broken pre-existing test caused by a test-author

→ **P0** `broken_existing` bug; paired impl node **BLOCKED/skipped**, same path.

### Green-gate failure (per task)

Impl didn't make the red test pass → **P0/P1** bug via the green-gate verifier.
The wave still commits partial progress (unchanged per-wave commit), and the bug
flows into aggregation → fix-plan → re-run.

## Edge cases

- **Baseline already red:** record the pre-existing failing set at pre-flight;
  gates subtract it when attributing new failures; warn the user.
- **No test command resolvable:** prompt for one; if the user does not supply a
  command, **STOP** the run (message points to `--no-tdd` for classic). Never a
  silent downgrade.
- **Re-run fix cycles:** on a fix-plan re-run, tests usually already exist. The
  analyzer detects existing test files for a task and emits an **impl-only**
  node (no test-author); the green gate still applies, so fixes are still proven
  against the tests. No redundant test re-authoring.

## Out of scope (YAGNI)

- Mutation testing or coverage-percentage thresholds.
- Assertion-level red enforcement (we accept import / not-implemented as valid
  first red).
- Per-test parallel sharding beyond the existing wave model.
- Auto-generating tests for non-testable (docs/config) tasks.

## Affected files (anticipated)

- `plugins/plan-runner/skills/run/SKILL.md` — pre-flight TDD enablement, test-cmd
  resolution + baseline, per-agent gate execution, manifest evidence.
- `plugins/plan-runner/agents/plan-analyzer.md` — classification + node splitting.
- `plugins/plan-runner/agents/plan-test-author.md` — **new** agent.
- `plugins/plan-runner/agents/plan-verifier.md` — red/green gate modes.
- `plugins/plan-runner/agents/plan-dev.md` — consume `tests_to_satisfy` (impl
  must satisfy the paired tests).
- `plugins/plan-runner/schemas/wave-plan.schema.json` — `role`, `testable`,
  `non_testable_reason`, `tests_to_satisfy`.
- `plugins/plan-runner/schemas/manifest.schema.json` — red/green evidence,
  resolved test command, baseline.
- `plugins/plan-runner/schemas/dev-return.schema.json` — test run reporting fields.
- `plugins/plan-runner/README.md` — document the TDD flow and `--no-tdd` flag.
- `plugins/plan-runner/.claude-plugin/plugin.json` — version bump.
- `.claude-plugin/marketplace.json` + root `README.md` + `CLAUDE.md` — version /
  description updates.
