# plan-runner TDD red→green Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the `plan-runner` plugin so testable tasks are executed test-first — a failing test (red) is written and run before implementation, implementation makes it pass (green), and the orchestrator records proven red→green evidence in the manifest.

**Architecture:** plan-runner is a metadata-driven Claude Code plugin: Markdown agent/skill prompt files plus JSON Schemas, with no runtime code of its own. We add (a) schema fields describing TDD roles and evidence, (b) a new `plan-test-author` agent, (c) gate-aware `plan-verifier` modes, and (d) orchestrator (`SKILL.md`) steps that resolve a test command, capture a green baseline, and run per-agent red/green gates via Bash. Gate failures become bugs that flow through the existing aggregate → fix-plan → re-run loop (no inline retries). TDD is opt-in per run via a prompt; `--no-tdd` skips the prompt and runs the classic pipeline.

**Tech Stack:** Markdown + YAML frontmatter (agents/skills), JSON Schema (draft 2020-12). Tests follow existing repo conventions: **Python `jsonschema`** for schema validation (mirroring `plugins/jupiter/tests/validate_schemas.py`) and **`node --test`** (`node:test` + `node:assert/strict`, mirroring `plugins/migration-runner/tests/`) for contract-presence tests over the prompt files. No new third-party dependencies, no `package.json` (node auto-discovers `*.test.js`).

**A note on "testing" prompt files:** The agent/skill files are prose prompts — the design spec itself classifies prose as non-testable. The honest TDD artifact for them is a *contract-presence test*: an assertion that the file contains each required instruction marker. These tests fail before the edit (marker absent = red) and pass after (green), and they lock the contract so future edits cannot silently drop a required rule. The schema files are genuinely behaviorally testable via valid/invalid example fixtures.

**Spec:** `docs/superpowers/specs/2026-06-02-plan-runner-tdd-design.md`

---

## File Structure

**Schemas (behaviorally testable):**
- Modify `plugins/plan-runner/schemas/wave-plan.schema.json` — add optional `role`, `testable`, `non_testable_reason`, `tests_to_satisfy` to each agent.
- Modify `plugins/plan-runner/schemas/dev-return.schema.json` — add optional `test_files`, `test_ids` (used by the test-author role).
- Modify `plugins/plan-runner/schemas/manifest.schema.json` — add optional top-level `tdd` block (resolved command, baseline, per-task red/green evidence).

**Test harnesses (new):**
- Create `plugins/plan-runner/tests/validate_schemas.py` — schema validator (mirrors jupiter).
- Create `plugins/plan-runner/schemas/examples/*.json` — valid + invalid fixtures per schema.
- Create `plugins/plan-runner/tests/contract.test.js` — contract-presence tests over prompt files.

**Prompt files:**
- Create `plugins/plan-runner/agents/plan-test-author.md` — new agent (writes failing tests only).
- Modify `plugins/plan-runner/agents/plan-analyzer.md` — classify testable, split testable tasks into test-author + impl nodes, detect pre-existing tests on re-run.
- Modify `plugins/plan-runner/agents/plan-verifier.md` — red-gate / green-gate modes.
- Modify `plugins/plan-runner/agents/plan-dev.md` — consume `tests_to_satisfy`.
- Modify `plugins/plan-runner/skills/run/SKILL.md` — pre-flight enablement + `--no-tdd`, test-command resolution + baseline, analyzer dispatch flags + display, per-agent gates + bug routing + evidence.

**Docs / metadata:**
- Modify `plugins/plan-runner/README.md`, `plugins/plan-runner/.claude-plugin/plugin.json` (0.4.1 → 0.5.0), `.claude-plugin/marketplace.json`, root `README.md`, `CLAUDE.md`.

---

## Task 1: Schema — wave-plan TDD fields + Python test harness

**Files:**
- Create: `plugins/plan-runner/tests/validate_schemas.py`
- Create: `plugins/plan-runner/schemas/examples/wave-plan-valid.json`
- Create: `plugins/plan-runner/schemas/examples/wave-plan-invalid.json`
- Modify: `plugins/plan-runner/schemas/wave-plan.schema.json`

- [ ] **Step 1: Create the schema-validation harness**

Create `plugins/plan-runner/tests/validate_schemas.py`:

```python
"""Validate every plan-runner schema against its valid and invalid example fixtures.

Exit 0 on success. Exit 1 if any valid example fails or any invalid example passes.
"""

import json
import sys
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS_DIR = ROOT / "schemas"
EXAMPLES_DIR = SCHEMAS_DIR / "examples"

CASES = [
    ("wave-plan.schema.json", "wave-plan-valid.json", "wave-plan-invalid.json"),
]


def load(p: Path):
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    failures = []
    for schema_name, valid_name, invalid_name in CASES:
        schema = load(SCHEMAS_DIR / schema_name)
        try:
            jsonschema.validate(load(EXAMPLES_DIR / valid_name), schema)
            print(f"PASS: {valid_name} validates against {schema_name}")
        except jsonschema.ValidationError as e:
            failures.append(f"FAIL: {valid_name} should validate: {e.message}")
        try:
            jsonschema.validate(load(EXAMPLES_DIR / invalid_name), schema)
            failures.append(f"FAIL: {invalid_name} should NOT validate")
        except jsonschema.ValidationError:
            print(f"PASS: {invalid_name} correctly rejected by {schema_name}")
    if failures:
        for f in failures:
            print(f)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Write the valid + invalid fixtures (the failing test)**

Create `plugins/plan-runner/schemas/examples/wave-plan-valid.json`:

```json
{
  "source_plan": "docs/foo/plan.md",
  "context7_available": false,
  "waves": [
    {
      "wave_id": 1,
      "agents": [
        {
          "agent_id": "wave-1-agent-1",
          "task_title": "write tests for adder",
          "task_excerpt_lines": "10-20",
          "owned_files": ["tests/adder.test.js"],
          "acceptance_criteria": ["covers add(2,3) == 5"],
          "recommended_model": "sonnet",
          "role": "test-author",
          "testable": true
        }
      ]
    },
    {
      "wave_id": 2,
      "agents": [
        {
          "agent_id": "wave-2-agent-1",
          "task_title": "implement adder",
          "task_excerpt_lines": "10-20",
          "owned_files": ["src/adder.js"],
          "acceptance_criteria": ["add returns the sum"],
          "recommended_model": "sonnet",
          "role": "impl",
          "testable": true,
          "tests_to_satisfy": ["tests/adder.test.js"]
        }
      ]
    }
  ],
  "uncovered_plan_sections": []
}
```

Create `plugins/plan-runner/schemas/examples/wave-plan-invalid.json` (otherwise valid, but `role` is not in the enum — this is what the new constraint must catch):

```json
{
  "source_plan": "docs/foo/plan.md",
  "context7_available": false,
  "waves": [
    {
      "wave_id": 1,
      "agents": [
        {
          "agent_id": "wave-1-agent-1",
          "task_title": "write tests for adder",
          "task_excerpt_lines": "10-20",
          "owned_files": ["tests/adder.test.js"],
          "acceptance_criteria": ["covers add(2,3) == 5"],
          "recommended_model": "sonnet",
          "role": "implementer"
        }
      ]
    }
  ],
  "uncovered_plan_sections": []
}
```

- [ ] **Step 3: Run the test to verify it fails (red)**

Run: `python plugins/plan-runner/tests/validate_schemas.py`
Expected: exit 1, with the line `FAIL: wave-plan-invalid.json should NOT validate` (the bogus `role` value is currently accepted because `role` is not yet a constrained property).

- [ ] **Step 4: Add the TDD fields to the schema**

In `plugins/plan-runner/schemas/wave-plan.schema.json`, inside the agent item `properties` object (currently lines 27-35, after the `complexity_signals` property), add:

```json
                "role": {"type": "string", "enum": ["test-author", "impl", "standalone"], "description": "TDD role. Omitted on classic (non-TDD) runs."},
                "testable": {"type": "boolean", "description": "TDD mode only. True for test-author/impl agents, false for non-testable standalone tasks."},
                "non_testable_reason": {"type": "string", "description": "TDD mode only. One-line reason a standalone task was classified non-testable."},
                "tests_to_satisfy": {"type": "array", "items": {"type": "string"}, "description": "impl role only. Test files (from the paired test-author) the implementation must make pass."}
```

(Insert as new keys in the same `properties` object; keep all four optional — do NOT add them to the agent `required` array, so existing/classic wave plans still validate.)

- [ ] **Step 5: Run the test to verify it passes (green)**

Run: `python plugins/plan-runner/tests/validate_schemas.py`
Expected: exit 0, with `PASS: wave-plan-valid.json validates against wave-plan.schema.json` and `PASS: wave-plan-invalid.json correctly rejected by wave-plan.schema.json`.

- [ ] **Step 6: Commit**

```bash
git add plugins/plan-runner/tests/validate_schemas.py plugins/plan-runner/schemas/examples/wave-plan-valid.json plugins/plan-runner/schemas/examples/wave-plan-invalid.json plugins/plan-runner/schemas/wave-plan.schema.json
git commit -m "feat(plan-runner): add TDD role fields to wave-plan schema"
```

---

## Task 2: Schema — dev-return test-author fields

**Files:**
- Create: `plugins/plan-runner/schemas/examples/dev-return-valid.json`
- Create: `plugins/plan-runner/schemas/examples/dev-return-invalid.json`
- Modify: `plugins/plan-runner/tests/validate_schemas.py:16-18` (the `CASES` list)
- Modify: `plugins/plan-runner/schemas/dev-return.schema.json`

- [ ] **Step 1: Write the valid + invalid fixtures**

Create `plugins/plan-runner/schemas/examples/dev-return-valid.json`:

```json
{
  "agent_id": "wave-1-agent-1",
  "status": "DONE",
  "files_written": ["tests/adder.test.js"],
  "files_unexpectedly_modified": [],
  "context7_queries": [],
  "summary": "Wrote failing tests for the adder.",
  "concerns": [],
  "test_files": ["tests/adder.test.js"],
  "test_ids": ["adds two numbers"]
}
```

Create `plugins/plan-runner/schemas/examples/dev-return-invalid.json` (`test_files` must be an array, here it is a string):

```json
{
  "agent_id": "wave-1-agent-1",
  "status": "DONE",
  "files_written": ["tests/adder.test.js"],
  "files_unexpectedly_modified": [],
  "context7_queries": [],
  "summary": "Wrote failing tests for the adder.",
  "concerns": [],
  "test_files": "tests/adder.test.js"
}
```

- [ ] **Step 2: Register the new case in the harness**

In `plugins/plan-runner/tests/validate_schemas.py`, change the `CASES` list to:

```python
CASES = [
    ("wave-plan.schema.json", "wave-plan-valid.json", "wave-plan-invalid.json"),
    ("dev-return.schema.json", "dev-return-valid.json", "dev-return-invalid.json"),
]
```

- [ ] **Step 3: Run the test to verify it fails (red)**

Run: `python plugins/plan-runner/tests/validate_schemas.py`
Expected: exit 1, with `FAIL: dev-return-invalid.json should NOT validate` (`test_files` is not yet a constrained property, so the string value is currently accepted).

- [ ] **Step 4: Add the fields to the schema**

In `plugins/plan-runner/schemas/dev-return.schema.json`, inside `properties` (after the `concerns` property, currently line 21), add:

```json
    "test_files": {"type": "array", "items": {"type": "string"}, "description": "test-author role: test files written, for orchestrator-scoped gate runs."},
    "test_ids": {"type": "array", "items": {"type": "string"}, "description": "test-author role: individual test names/IDs added."}
```

(Optional — do NOT add to `required`; impl/standalone agents omit them.)

- [ ] **Step 5: Run the test to verify it passes (green)**

Run: `python plugins/plan-runner/tests/validate_schemas.py`
Expected: exit 0; both dev-return lines report PASS, and the wave-plan case still passes.

- [ ] **Step 6: Commit**

```bash
git add plugins/plan-runner/tests/validate_schemas.py plugins/plan-runner/schemas/examples/dev-return-valid.json plugins/plan-runner/schemas/examples/dev-return-invalid.json plugins/plan-runner/schemas/dev-return.schema.json
git commit -m "feat(plan-runner): add test-author fields to dev-return schema"
```

---

## Task 3: Schema — manifest TDD evidence block

**Files:**
- Create: `plugins/plan-runner/schemas/examples/manifest-valid.json`
- Create: `plugins/plan-runner/schemas/examples/manifest-invalid.json`
- Modify: `plugins/plan-runner/tests/validate_schemas.py` (the `CASES` list)
- Modify: `plugins/plan-runner/schemas/manifest.schema.json`

- [ ] **Step 1: Write the valid + invalid fixtures**

Create `plugins/plan-runner/schemas/examples/manifest-valid.json`:

```json
{
  "cycle": 1,
  "input_plan": "docs/foo/plan.md",
  "started_at": "2026-06-02T00:00:00Z",
  "completed_at": null,
  "context7_available": false,
  "waves": [],
  "total_bugs": 0,
  "next_cycle_plan": null,
  "tdd": {
    "enabled": true,
    "test_command": {"full": "npm test", "single_file": "npm test -- {file}"},
    "baseline_failing": [],
    "tasks": [
      {
        "task": "implement adder",
        "test_files": ["tests/adder.test.js"],
        "red_run": {"cmd": "npm test -- tests/adder.test.js", "exit": 1, "result": "FAILED", "valid_red": true},
        "green_run": {"cmd": "npm test -- tests/adder.test.js", "exit": 0, "result": "PASSED"}
      }
    ]
  }
}
```

Create `plugins/plan-runner/schemas/examples/manifest-invalid.json` (`tdd.enabled` must be boolean, here it is a string):

```json
{
  "cycle": 1,
  "input_plan": "docs/foo/plan.md",
  "started_at": "2026-06-02T00:00:00Z",
  "context7_available": false,
  "waves": [],
  "total_bugs": 0,
  "tdd": {"enabled": "yes"}
}
```

- [ ] **Step 2: Register the new case in the harness**

In `plugins/plan-runner/tests/validate_schemas.py`, append to the `CASES` list so it reads:

```python
CASES = [
    ("wave-plan.schema.json", "wave-plan-valid.json", "wave-plan-invalid.json"),
    ("dev-return.schema.json", "dev-return-valid.json", "dev-return-invalid.json"),
    ("manifest.schema.json", "manifest-valid.json", "manifest-invalid.json"),
]
```

- [ ] **Step 3: Run the test to verify it fails (red)**

Run: `python plugins/plan-runner/tests/validate_schemas.py`
Expected: exit 1, with `FAIL: manifest-invalid.json should NOT validate` (`tdd` is not yet a constrained property).

- [ ] **Step 4: Add the `tdd` block to the schema**

In `plugins/plan-runner/schemas/manifest.schema.json`, inside the top-level `properties` (after the `next_cycle_plan` property, currently line 40), add:

```json
    "tdd": {
      "type": "object",
      "required": ["enabled"],
      "properties": {
        "enabled": {"type": "boolean"},
        "test_command": {
          "type": "object",
          "properties": {
            "full": {"type": "string"},
            "single_file": {"type": "string", "description": "Single-file invocation with a {file} placeholder, e.g. 'pytest {file}'."}
          }
        },
        "baseline_failing": {"type": "array", "items": {"type": "string"}, "description": "Pre-existing failing tests at pre-flight; subtracted when attributing new failures."},
        "tasks": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["task", "test_files"],
            "properties": {
              "task": {"type": "string"},
              "test_files": {"type": "array", "items": {"type": "string"}},
              "red_run": {
                "type": "object",
                "properties": {
                  "cmd": {"type": "string"},
                  "exit": {"type": "integer"},
                  "result": {"type": "string"},
                  "valid_red": {"type": "boolean"}
                }
              },
              "green_run": {
                "type": "object",
                "properties": {
                  "cmd": {"type": "string"},
                  "exit": {"type": "integer"},
                  "result": {"type": "string"}
                }
              }
            }
          }
        }
      }
    }
```

(Optional — do NOT add `tdd` to the top-level `required`; classic runs omit it.)

- [ ] **Step 5: Run the test to verify it passes (green)**

Run: `python plugins/plan-runner/tests/validate_schemas.py`
Expected: exit 0; all three schema cases PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/plan-runner/tests/validate_schemas.py plugins/plan-runner/schemas/examples/manifest-valid.json plugins/plan-runner/schemas/examples/manifest-invalid.json plugins/plan-runner/schemas/manifest.schema.json
git commit -m "feat(plan-runner): add TDD evidence block to manifest schema"
```

---

## Task 4: New agent — plan-test-author + contract test harness

**Files:**
- Create: `plugins/plan-runner/tests/contract.test.js`
- Create: `plugins/plan-runner/agents/plan-test-author.md`

- [ ] **Step 1: Create the contract-test harness with the first failing test**

Create `plugins/plan-runner/tests/contract.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

test("plan-test-author agent exists and only writes failing tests", () => {
  assert.ok(exists("agents/plan-test-author.md"), "agents/plan-test-author.md must exist");
  const f = read("agents/plan-test-author.md");
  assert.match(f, /name:\s*plan-test-author/, "frontmatter name");
  assert.match(f, /failing test/i, "must describe writing a failing test");
  assert.match(f, /not (write|implement).{0,40}implementation|never.{0,20}implement/i, "must forbid writing implementation");
  assert.match(f, /test_files/, "must return test_files");
});
```

- [ ] **Step 2: Run the test to verify it fails (red)**

Run: `node --test --test-name-pattern="plan-test-author agent exists" plugins/plan-runner/tests/contract.test.js`
Expected: FAIL — the test throws on the `exists(...)` assertion because `agents/plan-test-author.md` does not exist yet.

- [ ] **Step 3: Write the agent**

Create `plugins/plan-runner/agents/plan-test-author.md`:

```markdown
---
name: plan-test-author
description: >
  plan-runner pipeline agent that writes ONLY the failing tests for one testable
  task from a wave plan. It never writes implementation -- a downstream impl agent
  makes the tests pass. Returns the test files and test IDs it added.
model: sonnet
color: red
---

You are a Test-Author Agent in the plan-runner pipeline. You write the failing tests for ONE testable task and return a structured JSON status report. You do NOT write the implementation.

## Input (provided by orchestrator at dispatch)

- `agent_id`: e.g. `wave-1-agent-2`
- `task_title`: short task title
- `plan_path`: absolute path to the source plan file
- `task_excerpt_lines`: line range in `plan_path` describing the task, format `"START-END"` (1-indexed, inclusive)
- `owned_files`: the test file paths you are allowed to write
- `acceptance_criteria`: the behavior your tests must pin down
- `test_command`: how the suite is run (full form + single-file `{file}` form), for matching framework + style
- `context7_available`: boolean flag for Context7 MCP availability

## Output

You MUST return a single JSON object matching `dev-return.schema.json`. No prose, no Markdown fences:

```json
{
  "agent_id": "<your agent_id>",
  "status": "DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT",
  "files_written": ["<test path>", "..."],
  "files_unexpectedly_modified": [],
  "context7_queries": [],
  "summary": "<two-sentence what-I-did>",
  "concerns": ["<optional notes for the verifier>"],
  "test_files": ["<test path>", "..."],
  "test_ids": ["<test name/id>", "..."]
}
```

`test_files` are the files you wrote; `test_ids` are the individual test names so the orchestrator can run them in isolation for the red gate.

## Process

1. **Read the task.** Parse `task_excerpt_lines` as `START-END`. Read `plan_path` with `offset: START` and `limit: END - START + 1`. Read it alongside `acceptance_criteria` -- together they are the behavior to pin down. Do NOT read the rest of the plan.

2. **Match the test framework + style.** Inspect 1-2 existing test files (use the `test_command` to locate the framework) so your tests use the same runner, imports, and conventions. If Context7 is available and the framework is a library, query it for current testing APIs and record the queries.

3. **Write failing tests, one per acceptance criterion.** Each test must assert the SPECIFIED behavior against the implementation interface as described in the task -- importing/calling the not-yet-written code. The tests are EXPECTED to fail now (the code does not exist or is incomplete). That is the point.

4. **Do NOT stub or write the implementation.** Stay within `owned_files` (test files only). If a test needs a fixture file that is also a test asset and is in `owned_files`, that is fine; production code is never yours to write.

5. **Make the failure meaningful.** Avoid tests that fail only because of a typo or syntax error in the test itself. A test that fails on a missing import / not-implemented function is a valid first red; a test that cannot even be collected because of a syntax error is NOT.

6. **Self-check.** Confirm every acceptance criterion has at least one test, all writes are within `owned_files`, and the JSON is valid.

## Rules

- Write ONLY tests. Never write or modify implementation/production files.
- Do NOT commit. The orchestrator commits per wave.
- Do NOT run the tests yourself -- the orchestrator runs the red gate and captures the evidence. (You may read existing tests for style.)
- Return valid JSON ONLY. No prose before or after.
```

- [ ] **Step 4: Run the test to verify it passes (green)**

Run: `node --test --test-name-pattern="plan-test-author agent exists" plugins/plan-runner/tests/contract.test.js`
Expected: PASS (1 test passed).

- [ ] **Step 5: Commit**

```bash
git add plugins/plan-runner/tests/contract.test.js plugins/plan-runner/agents/plan-test-author.md
git commit -m "feat(plan-runner): add plan-test-author agent (writes failing tests only)"
```

---

## Task 5: plan-analyzer — classification, node splitting, re-run detection

**Files:**
- Modify: `plugins/plan-runner/tests/contract.test.js` (append a test)
- Modify: `plugins/plan-runner/agents/plan-analyzer.md`

- [ ] **Step 1: Add the failing contract test**

Append to `plugins/plan-runner/tests/contract.test.js`:

```js
test("plan-analyzer classifies testable tasks and splits them in TDD mode", () => {
  const f = read("agents/plan-analyzer.md");
  assert.match(f, /tdd_enabled/, "must read a tdd_enabled flag");
  assert.match(f, /testable/i, "must classify tasks testable vs non-testable");
  assert.match(f, /non_testable_reason/, "must record a reason for non-testable tasks");
  assert.match(f, /test-author/i, "must emit a test-author node");
  assert.match(f, /tests_to_satisfy/, "impl node must point at the paired tests");
  assert.match(f, /already exist|existing test/i, "re-run: detect pre-existing tests -> impl-only");
});
```

- [ ] **Step 2: Run the test to verify it fails (red)**

Run: `node --test --test-name-pattern="plan-analyzer classifies" plugins/plan-runner/tests/contract.test.js`
Expected: FAIL — `agents/plan-analyzer.md` does not yet mention `tdd_enabled`, `testable`, etc.

- [ ] **Step 3: Update the analyzer**

In `plugins/plan-runner/agents/plan-analyzer.md`:

(a) In the `## Input` section (currently lines 14-19), add a fifth input after the `verbose` bullet:

```markdown
5. A `tdd_enabled` boolean. When `true`, classify each task as testable or not and split testable tasks into a test-author node and an impl node (see "TDD mode" below). When `false`, behave exactly as the classic analyzer (one node per task, no `role`/`testable` fields).
```

(b) Add a new top-level section immediately before `## Validation before returning` (currently line 96):

```markdown
## TDD mode (only when tdd_enabled is true)

For each task you identify:

1. **Classify testability.** A task is `testable` if it produces behavior that a unit/integration test can exercise (functions, endpoints, parsers, CLI logic, data transforms). It is non-testable if it is pure docs, prose, configuration, or a static manifest/schema with no behavior.

2. **Non-testable tasks** become a single agent with `role: "standalone"`, `testable: false`, and a one-line `non_testable_reason` (e.g. "pure JSON manifest, no behavior"). They have no test-author/impl split. This is the same as the classic single-node path, just labelled.

3. **Testable tasks** become TWO nodes:
   - a **test-author** node: `role: "test-author"`, `testable: true`, `owned_files` = the test files only. It depends only on what its interface needs (usually nothing), so it lands as early as possible.
   - an **impl** node: `role: "impl"`, `testable: true`, `owned_files` = the implementation files, plus `tests_to_satisfy` listing the test-author's test files. The impl node depends on (a) its own test-author node and (b) the impl nodes of any task-level dependencies. It therefore always lands in a LATER wave than its test-author.

4. **Pre-existing tests (re-run / fix cycles).** If the test files a testable task would need ALREADY EXIST in the repo (typical on a fix-plan re-run), do NOT emit a test-author node. Emit only the impl node (`role: "impl"`, `tests_to_satisfy` pointing at the existing test files). The green gate still applies, so the fix is still proven against the tests.

5. **Constraints are unchanged.** Max 6 agents per wave, file-disjoint within a wave (test files and impl files are different paths, so no new conflicts), topological ordering by dependency.

6. **agent_id numbering** still follows `wave-{wave_id}-agent-{n}`; a test-author and its impl get IDs in their respective waves.
```

(c) In `## Bucketing rules` add a note that test-author and impl of the same task can never share a wave (impl depends on its test-author). Append to rule 3 (currently line 56):

```markdown
   In TDD mode, an impl node always depends on its paired test-author node, so the two are never in the same wave.
```

- [ ] **Step 4: Run the test to verify it passes (green)**

Run: `node --test --test-name-pattern="plan-analyzer classifies" plugins/plan-runner/tests/contract.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/plan-runner/tests/contract.test.js plugins/plan-runner/agents/plan-analyzer.md
git commit -m "feat(plan-runner): analyzer classifies + splits testable tasks for TDD"
```

---

## Task 6: plan-verifier — red-gate / green-gate modes

**Files:**
- Modify: `plugins/plan-runner/tests/contract.test.js` (append a test)
- Modify: `plugins/plan-runner/agents/plan-verifier.md`

- [ ] **Step 1: Add the failing contract test**

Append to `plugins/plan-runner/tests/contract.test.js`:

```js
test("plan-verifier supports red-gate and green-gate modes", () => {
  const f = read("agents/plan-verifier.md");
  assert.match(f, /red-gate/i, "must define red-gate behavior");
  assert.match(f, /green-gate/i, "must define green-gate behavior");
  assert.match(f, /valid_red|valid red/i, "must judge whether red is valid");
  assert.match(f, /syntax|collection/i, "syntax/collection error = invalid red");
  assert.match(f, /broken_existing/, "must flag broken pre-existing tests");
  assert.match(f, /captured_test_output|test-run output/i, "consumes orchestrator-captured test output");
});
```

- [ ] **Step 2: Run the test to verify it fails (red)**

Run: `node --test --test-name-pattern="plan-verifier supports" plugins/plan-runner/tests/contract.test.js`
Expected: FAIL — verifier doc has no red-gate/green-gate language yet.

- [ ] **Step 3: Update the verifier**

In `plugins/plan-runner/agents/plan-verifier.md`:

(a) In `## Input` (after the per-agent bullets, currently around line 24), add:

```markdown
- For each dev agent, the orchestrator also provides:
  - `role`: `test-author`, `impl`, or `standalone`
  - `tests_to_satisfy`: (impl only) the test files the implementation must make pass
  - `captured_test_output`: the orchestrator's verbatim test-run output for this agent (red run for test-author agents, green run for impl agents). Standalone agents have none.
```

(b) Add a new section before `## Severity guidance` (currently line 92):

```markdown
## Gate modes (TDD runs)

Apply the gate that matches each agent's `role`. Classic runs have no `role` -- treat every agent as `standalone` (static verification only, exactly as below).

### Red-gate mode (role: test-author)

You receive `captured_test_output` from the orchestrator running the agent's new test files.

1. **New tests must FAIL.** If the captured output shows the new tests passing, that is an invalid red -- flag a P1 `incorrect_implementation` bug: a test that passes before any implementation is not testing the new behavior.
2. **Failure must be valid.** An import error / "not implemented" / assertion failure is a VALID red (the behavior genuinely is not built yet). A syntax error or a collection/parse error that prevents the test from running is an INVALID red -- flag a P1 `incorrect_implementation` bug citing the error.
3. **Pre-existing tests must stay green.** If the captured output shows a previously-passing test now failing (outside the new test files), flag a P0 `broken_existing` bug.
4. Set this agent's status accordingly. If the red is valid and pre-existing tests are intact, the agent is `CLEAN`.

### Green-gate mode (role: impl)

You receive `captured_test_output` from the orchestrator re-running `tests_to_satisfy` plus the full suite.

1. **Target tests must PASS.** If any test in `tests_to_satisfy` still fails, flag a P0 `missing_requirement` bug (implementation does not satisfy its tests) with the failing test names in `evidence`.
2. **No new suite failures.** If the full-suite output shows a newly failing pre-existing test, flag a P0 `broken_existing` bug.
3. **Then run the normal static checks below** against the impl's `owned_files` and `acceptance_criteria`.
```

(c) In `## Rules`, change the line `- Do NOT run tests. You inspect code statically.` (currently line 108) to:

```markdown
- Do NOT run tests yourself. The orchestrator runs them and gives you `captured_test_output`; you judge that output plus the code statically.
```

- [ ] **Step 4: Run the test to verify it passes (green)**

Run: `node --test --test-name-pattern="plan-verifier supports" plugins/plan-runner/tests/contract.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/plan-runner/tests/contract.test.js plugins/plan-runner/agents/plan-verifier.md
git commit -m "feat(plan-runner): add red-gate/green-gate modes to verifier"
```

---

## Task 7: plan-dev — consume tests_to_satisfy

**Files:**
- Modify: `plugins/plan-runner/tests/contract.test.js` (append a test)
- Modify: `plugins/plan-runner/agents/plan-dev.md`

- [ ] **Step 1: Add the failing contract test**

Append to `plugins/plan-runner/tests/contract.test.js`:

```js
test("plan-dev consumes tests_to_satisfy and is gated on green", () => {
  const f = read("agents/plan-dev.md");
  assert.match(f, /tests_to_satisfy/, "impl must be told which tests to satisfy");
  assert.match(f, /green gate|make.{0,30}tests pass/i, "impl must aim to make the tests pass");
});
```

- [ ] **Step 2: Run the test to verify it fails (red)**

Run: `node --test --test-name-pattern="plan-dev consumes" plugins/plan-runner/tests/contract.test.js`
Expected: FAIL — dev doc does not mention `tests_to_satisfy`.

- [ ] **Step 3: Update the dev agent**

In `plugins/plan-runner/agents/plan-dev.md`:

(a) In `## Input` (after the `context7_available` bullet, currently line 21), add:

```markdown
- `tests_to_satisfy`: (TDD impl role only; absent otherwise) test files written by a test-author that your implementation MUST make pass.
```

(b) In `## Process`, after step 1 (currently line 41), add a new step:

```markdown
1b. **If `tests_to_satisfy` is provided (TDD impl role), read those test files first.** They are the executable spec: your implementation must make every one of them pass. Treat the assertions as binding requirements alongside `acceptance_criteria`. Do not edit the test files (they are not in your `owned_files`).
```

(c) In `## Rules`, change `- Do NOT run tests. The orchestrator and verifier handle that.` (currently line 64) to:

```markdown
- Do NOT run tests. The orchestrator runs the green gate against `tests_to_satisfy` after this wave and captures the evidence; if your implementation does not make those tests pass, the green-gate verifier will flag it as a bug for the next cycle.
```

- [ ] **Step 4: Run the test to verify it passes (green)**

Run: `node --test --test-name-pattern="plan-dev consumes" plugins/plan-runner/tests/contract.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/plan-runner/tests/contract.test.js plugins/plan-runner/agents/plan-dev.md
git commit -m "feat(plan-runner): impl agent consumes tests_to_satisfy"
```

---

## Task 8: SKILL — pre-flight TDD enablement, --no-tdd, test-command resolution + baseline

**Files:**
- Modify: `plugins/plan-runner/tests/contract.test.js` (append a test)
- Modify: `plugins/plan-runner/skills/run/SKILL.md`

- [ ] **Step 1: Add the failing contract test**

Append to `plugins/plan-runner/tests/contract.test.js`:

```js
test("SKILL pre-flight handles --no-tdd, prompts, resolves test cmd, stops if none", () => {
  const f = read("skills/run/SKILL.md");
  assert.match(f, /--no-tdd/, "must document the --no-tdd flag");
  assert.match(f, /Enable TDD/i, "must prompt to enable TDD");
  assert.match(f, /--test-cmd/, "must support a --test-cmd flag");
  assert.match(f, /package\.json|pytest|go\.mod|Cargo\.toml|csproj/i, "must list detection markers");
  assert.match(f, /baseline/i, "must capture a green baseline");
  assert.match(f, /\{file\}/, "must store a single-file invocation pattern");
  assert.match(f, /STOP[\s\S]{0,200}--no-tdd/, "must STOP (not downgrade) when no test cmd is resolved");
});
```

- [ ] **Step 2: Run the test to verify it fails (red)**

Run: `node --test --test-name-pattern="SKILL pre-flight handles" plugins/plan-runner/tests/contract.test.js`
Expected: FAIL — SKILL.md has none of this yet.

- [ ] **Step 3: Update SKILL.md argument parsing**

In `plugins/plan-runner/skills/run/SKILL.md`, in `## Argument parsing` (currently lines 18-23), add two flags. After the `--verbose` bullet add:

```markdown
- `--no-tdd` -- if present, skip the TDD enablement prompt entirely and run the classic (non-TDD) pipeline. Set `tdd_enabled = false`.
- `--test-cmd "<cmd>"` -- optional explicit test command. May include a `{file}` placeholder for single-file runs (e.g. `pytest {file}`). When provided, it is used verbatim and detection is skipped.
```

And add after the "Set `verbose`" paragraph:

```markdown
Set `tdd_requested = true` unless `--no-tdd` is present. Capture any `--test-cmd` value as `test_cmd_flag`. Strip all flags before using the plan path.
```

- [ ] **Step 4: Add the TDD enablement step**

In `SKILL.md`, immediately after `### 1a. Validate plan file` (before `### 1b. Compute cycle directory`, currently line 54), insert:

```markdown
### 1a-bis. TDD enablement

- If `--no-tdd` was passed: set `tdd_enabled = false` and print `TDD disabled (--no-tdd). Running classic pipeline.` Skip the rest of this step.
- Otherwise prompt:

```
Enable TDD red-green approach for this run?
Testable tasks get a failing test written first (red), then implementation makes it pass (green).
[Y] = TDD on   [n] = classic pipeline

(Y/n)
```

If `Y` or empty: set `tdd_enabled = true`. If `n`: set `tdd_enabled = false`.
```

- [ ] **Step 5: Add the test-command resolution + baseline step**

In `SKILL.md`, immediately after `### 1d. Detect Context7 MCP` (before `### 1e. Initialize manifest`, currently line 109), insert:

```markdown
### 1d-bis. Resolve test command + green baseline (only if tdd_enabled)

If `tdd_enabled` is false, skip this step entirely.

**Resolve the command** in priority order:
1. If `test_cmd_flag` is set, use it. If it contains `{file}`, that is the single-file form and the full form is the same string with `{file}` removed/empty; otherwise treat it as the full form and derive a single-file form if the runner supports it.
2. Otherwise detect from repo markers (use Glob/Read, do not guess blindly):
   - `package.json` with `scripts.test` -> full: `npm test`, single-file: `npm test -- {file}`
   - `pytest.ini` / `pyproject.toml` / `setup.cfg` with pytest -> full: `pytest`, single-file: `pytest {file}`
   - `go.mod` -> full: `go test ./...`, single-file: `go test ./{dir}`
   - `Cargo.toml` -> full: `cargo test`, single-file: `cargo test {mod}`
   - `*.csproj` / `*.sln` -> full: `dotnet test`, single-file: `dotnet test --filter {file}`
3. If detection is ambiguous or finds nothing, prompt the user once:

```
No test command detected. Enter the test command (use {file} for single-file runs),
or press Enter to STOP (re-run with --no-tdd for the classic pipeline):
```

   If the user supplies a command, use it. **If the user enters nothing, STOP** with:

```
No test command available -- cannot run TDD gates.
Re-run with --no-tdd to use the classic pipeline.
```

   Do NOT silently downgrade to classic.

**Capture the green baseline.** Run the full test command via Bash. Record the set of currently-failing test identifiers as `baseline_failing` (empty if the suite is green). If the suite is already red, print a warning that the baseline is not clean and that the listed failures will be subtracted when attributing new failures.

Store the resolved command (both forms) and `baseline_failing` for the manifest `tdd` block.
```

- [ ] **Step 6: Initialize the manifest tdd block**

In `SKILL.md` `### 1e. Initialize manifest`, change the starter JSON (currently lines 113-124) to include a `tdd` field. Add after `"next_cycle_plan": null`:

```json
  "next_cycle_plan": null,
  "tdd": {
    "enabled": <tdd_enabled>,
    "test_command": {"full": "<resolved full or null>", "single_file": "<resolved single-file or null>"},
    "baseline_failing": [<baseline ids>],
    "tasks": []
  }
```

(When `tdd_enabled` is false, write `"tdd": {"enabled": false}` and omit the other keys.)

- [ ] **Step 7: Run the test to verify it passes (green)**

Run: `node --test --test-name-pattern="SKILL pre-flight handles" plugins/plan-runner/tests/contract.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add plugins/plan-runner/tests/contract.test.js plugins/plan-runner/skills/run/SKILL.md
git commit -m "feat(plan-runner): TDD enablement prompt, --no-tdd, test-cmd resolution + baseline"
```

---

## Task 9: SKILL — pass TDD flags to analyzer + show roles in wave-plan display

**Files:**
- Modify: `plugins/plan-runner/tests/contract.test.js` (append a test)
- Modify: `plugins/plan-runner/skills/run/SKILL.md`

- [ ] **Step 1: Add the failing contract test**

Append to `plugins/plan-runner/tests/contract.test.js`:

```js
test("SKILL passes tdd flags to analyzer and shows roles in the wave plan", () => {
  const f = read("skills/run/SKILL.md");
  // analyzer dispatch block must forward the tdd flag + test command
  assert.match(f, /TDD enabled:\s*<tdd_enabled>|tdd_enabled:\s*<tdd_enabled>/, "analyzer prompt forwards tdd_enabled");
  assert.match(f, /Test command:\s*<.*single.*>|test_command/i, "analyzer prompt forwards the test command");
  // display must surface role / testability
  assert.match(f, /\[test\]|\[impl\]|role|testable|non-testable/i, "wave-plan display must surface roles/testability");
});
```

- [ ] **Step 2: Run the test to verify it fails (red)**

Run: `node --test --test-name-pattern="SKILL passes tdd flags" plugins/plan-runner/tests/contract.test.js`
Expected: FAIL.

- [ ] **Step 3: Forward the TDD flags to the analyzer**

In `SKILL.md` `## Step 2: ANALYZE PLAN`, in the analyzer dispatch prompt template (currently lines 145-160), add two lines after `Verbose: <verbose>`:

```markdown
TDD enabled: <tdd_enabled>
Test command: <resolved single-file form, or "n/a"> (full: <resolved full form, or "n/a">)
```

(The analyzer uses `tdd_enabled` to decide whether to classify + split, per its TDD-mode section.)

- [ ] **Step 4: Surface roles in the wave-plan display**

In `SKILL.md` `## Step 3: DISPLAY WAVE PLAN` (currently lines 186-208), replace the per-agent line format so each agent shows its role/testability. Change the example block to:

```markdown
Wave Plan (<W> waves, <total_agents> dev agents total)
========================================================
Wave 1 (<N> agents, parallel):
  agent-1 [test]        : <task_title>   -> <owned_files joined with comma>
  agent-2 [impl]        : <task_title>   -> <owned_files joined with comma>
  agent-3 [standalone]  : <task_title>   -> <owned_files joined with comma>
  ...

Non-testable tasks (will run without a test gate):
  - <task_title>: <non_testable_reason>     (one line per standalone task with a reason)

Uncovered plan sections: <sections or "none">
```

And add this sentence after the existing "If `uncovered_plan_sections` is non-empty..." paragraph:

```markdown
The bracketed tag is the agent `role` (`test`, `impl`, or `standalone`). In classic (non-TDD) runs, agents have no role and the tag is omitted. The "Non-testable tasks" block lists standalone agents that carry a `non_testable_reason`, so the user can challenge a mis-classification before execution.
```

- [ ] **Step 5: Run the test to verify it passes (green)**

Run: `node --test --test-name-pattern="SKILL passes tdd flags" plugins/plan-runner/tests/contract.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/plan-runner/tests/contract.test.js plugins/plan-runner/skills/run/SKILL.md
git commit -m "feat(plan-runner): forward TDD flags to analyzer + show roles in wave plan"
```

---

## Task 10: SKILL — wave-execution red/green gates, verifier modes, bug routing, evidence

**Files:**
- Modify: `plugins/plan-runner/tests/contract.test.js` (append a test)
- Modify: `plugins/plan-runner/skills/run/SKILL.md`

- [ ] **Step 1: Add the failing contract test**

Append to `plugins/plan-runner/tests/contract.test.js`:

```js
test("SKILL runs per-agent red/green gates, routes bugs, records evidence", () => {
  const f = read("skills/run/SKILL.md");
  assert.match(f, /Red gate/i, "red gate step");
  assert.match(f, /Green gate/i, "green gate step");
  assert.match(f, /per agent|per-agent/i, "gates applied per agent within a wave");
  assert.match(f, /invalid red[\s\S]{0,160}(BLOCKED|skip)/i, "invalid red blocks/skips the paired impl");
  assert.match(f, /No inline retries|no retries|without retr/i, "explicitly no inline retries");
  assert.match(f, /tdd\.tasks|red_run|green_run/i, "writes red/green evidence to the manifest");
});
```

- [ ] **Step 2: Run the test to verify it fails (red)**

Run: `node --test --test-name-pattern="SKILL runs per-agent" plugins/plan-runner/tests/contract.test.js`
Expected: FAIL.

- [ ] **Step 3: Insert the gate sub-steps into wave execution**

In `SKILL.md` `## Step 4: WAVE EXECUTION`, insert a new sub-step `### 4a-bis. Run gates (only if tdd_enabled)` immediately after `### 4a. Dispatch dev agents` completes (after the line "Wait for ALL dev agents in this wave to complete before proceeding.", currently line 260) and BEFORE `### 4b. Dispatch wave verifier`:

```markdown
### 4a-bis. Run gates (only if tdd_enabled)

If `tdd_enabled` is false, skip this step (classic pipeline).

Gates are applied **per agent**, by `role`, because a single wave may mix test-author, impl, and standalone agents. For each agent in the wave, run the matching gate via Bash and capture verbatim output. There are **No inline retries** -- every gate failure is recorded as captured output for the verifier and surfaces as a bug routed through the normal aggregate -> fix-plan -> re-run loop.

**Test-author agent (role: test-author) -> RED gate:**
1. For each file in the agent's reported `test_files`, run the single-file test command (substitute `{file}`). Capture exit code + output.
2. Run the full suite; diff the failing-test set against `tdd.baseline_failing`.
3. Record `red_run` = `{cmd, exit, result: exit != 0 ? "FAILED" : "PASSED", valid_red: <true if new tests fail for a genuine reason>}`. The verifier makes the final validity call from this output.
4. This agent's `captured_test_output` (for the verifier) = the single-file run output + any new pre-existing failures from the suite diff.

**Impl agent (role: impl) -> GREEN gate:**
1. Run the agent's `tests_to_satisfy` via the single-file command. Capture exit + output.
2. Run the full suite; diff against `tdd.baseline_failing` to detect newly-broken pre-existing tests.
3. Record `green_run` = `{cmd, exit, result: exit == 0 ? "PASSED" : "FAILED"}`.
4. `captured_test_output` = the `tests_to_satisfy` run output + any new suite failures.

**Standalone agent (role: standalone or classic):** no gate; `captured_test_output` is empty.

**Append evidence to the manifest `tdd.tasks` array** (one entry per testable task, keyed by `task_title`): `{task, test_files, red_run, green_run}`. The red_run is filled when the test-author wave runs; green_run when the paired impl wave runs (match by task_title / tests_to_satisfy).

**Invalid red (paired impl skipped):** if the red gate shows the new tests PASSED or a syntax/collection error, do NOT dispatch the paired impl agent -- mark it BLOCKED with reason "paired test red gate invalid". The verifier still emits the P1 bug from the captured output, which flows to the next cycle.
```

- [ ] **Step 4: Pass gate data to the verifier dispatch**

In `SKILL.md` `### 4b. Dispatch wave verifier`, in the per-agent block of the verifier prompt template (currently lines 277-292), add three lines inside the repeated `---` block after `concerns: <...>`:

```markdown
role: <agent role or "standalone">
tests_to_satisfy: <impl only: tests_to_satisfy joined with newlines, else "n/a">
captured_test_output: |
  <verbatim gate output captured in 4a-bis, or "n/a" for standalone/classic>
```

- [ ] **Step 5: Run the test to verify it passes (green)**

Run: `node --test --test-name-pattern="SKILL runs per-agent" plugins/plan-runner/tests/contract.test.js`
Expected: PASS.

- [ ] **Step 6: Run the full contract suite to confirm no regressions**

Run: `node --test plugins/plan-runner/tests/contract.test.js`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add plugins/plan-runner/tests/contract.test.js plugins/plan-runner/skills/run/SKILL.md
git commit -m "feat(plan-runner): per-agent red/green gates, bug routing, manifest evidence"
```

---

## Task 11: Docs + version bump

**Files:**
- Modify: `plugins/plan-runner/tests/contract.test.js` (append a test)
- Modify: `plugins/plan-runner/README.md`
- Modify: `plugins/plan-runner/.claude-plugin/plugin.json:4`
- Modify: `.claude-plugin/marketplace.json`
- Modify: root `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the failing contract test**

Append to `plugins/plan-runner/tests/contract.test.js`:

```js
test("docs + version reflect the TDD feature", () => {
  const pkg = JSON.parse(read(".claude-plugin/plugin.json"));
  assert.equal(pkg.version, "0.5.0", "plugin version bumped to 0.5.0");
  const readme = read("README.md");
  assert.match(readme, /--no-tdd/, "README documents the --no-tdd flag");
  assert.match(readme, /red.{0,5}green|red→green/i, "README describes the red-green flow");
});
```

- [ ] **Step 2: Run the test to verify it fails (red)**

Run: `node --test --test-name-pattern="docs \\+ version" plugins/plan-runner/tests/contract.test.js`
Expected: FAIL — version is still `0.4.1` and the README has no `--no-tdd`.

- [ ] **Step 3: Bump the plugin version**

In `plugins/plan-runner/.claude-plugin/plugin.json`, change line 4 from `"version": "0.4.1",` to `"version": "0.5.0",`.

- [ ] **Step 4: Document the TDD flow in the plugin README**

In `plugins/plan-runner/README.md`, add a section describing the TDD behavior. Insert this after the existing overview/usage section (place it before any "Architecture"/"Schemas" section if present; otherwise append):

```markdown
## TDD red-green mode

By default `/plan-runner:run` asks whether to enable a Test-Driven Development
red-green workflow for the run:

- **Testable tasks** are split into a *test-author* step (writes a failing test)
  and an *impl* step (makes it pass). The orchestrator runs the test command at
  two checkpoints and records proven evidence in `manifest.json` under `tdd`:
  a `red_run` (the new test failed before implementation) and a `green_run`
  (it passed after).
- **Non-testable tasks** (docs, config, schemas) run as before, with static
  verification only. The analyzer labels them and shows the reason in the wave
  plan.
- The **red gate** requires the new tests to fail for a genuine reason
  (import / not-implemented / assertion) while pre-existing tests stay green;
  a syntax/collection error is an invalid red and is flagged as a bug.
- Gate failures are not retried inline -- they become bugs that flow through the
  existing aggregate -> fix-plan -> re-run loop. Because every impl wave ends on
  a green full-suite check, **each committed wave is green**.

The test command is resolved as: `--test-cmd "<cmd>"` flag, else auto-detection
from repo markers (`package.json`, `pytest`, `go.mod`, `Cargo.toml`, `*.csproj`,
...), else a one-time prompt. If none can be resolved the run **stops** and
points you to `--no-tdd`.

**Flags:**
- `--no-tdd` -- skip the prompt and run the classic (non-TDD) pipeline.
- `--test-cmd "<cmd>"` -- supply the test command explicitly; use `{file}` for
  single-file runs (e.g. `pytest {file}`).
```

- [ ] **Step 5: Update the marketplace + root docs**

In `.claude-plugin/marketplace.json`, update the `plan-runner` entry's `version` to `0.5.0` and its description to mention TDD (find the plan-runner object and adjust the `description` to end with `; optional TDD red-green mode with per-task red/green gate evidence`).

In the root `README.md`, update the plan-runner row/version to `0.5.0` and append `Optional TDD red-green mode.` to its description.

In `CLAUDE.md`, in the "Current Plugins" table, bump `plan-runner` to `0.5.0` and append `Optional TDD red-green mode (--no-tdd to skip).` to its description cell. Also update the version references in the Directory Layout / Directory Map comments from `(v0.4.1)`/`(v0.4.0)` to `(v0.5.0)`.

- [ ] **Step 6: Run the test to verify it passes (green)**

Run: `node --test --test-name-pattern="docs \\+ version" plugins/plan-runner/tests/contract.test.js`
Expected: PASS.

- [ ] **Step 7: Run BOTH full suites to confirm everything is green**

Run: `node --test plugins/plan-runner/tests/contract.test.js`
Expected: all contract tests PASS.

Run: `python plugins/plan-runner/tests/validate_schemas.py`
Expected: exit 0; all three schema cases PASS.

- [ ] **Step 8: Commit**

```bash
git add plugins/plan-runner/tests/contract.test.js plugins/plan-runner/README.md plugins/plan-runner/.claude-plugin/plugin.json .claude-plugin/marketplace.json README.md CLAUDE.md
git commit -m "docs(plan-runner): document TDD red-green mode; bump to 0.5.0"
```

---

## Final verification

- [ ] Run the full schema suite: `python plugins/plan-runner/tests/validate_schemas.py` → exit 0.
- [ ] Run the full contract suite: `node --test plugins/plan-runner/tests/contract.test.js` → all pass.
- [ ] Confirm `git status` is clean and every task committed.
- [ ] Spot-check `manifest.schema.json`, `wave-plan.schema.json`, `dev-return.schema.json` each validate their examples and reject the invalid ones.

## Notes for the implementer

- All new schema fields are **optional** (never added to `required`) so classic runs and any existing wave plans/manifests keep validating. This is intentional back-compat.
- The contract tests assert the *presence of instructions* in prompt files, not runtime behavior — that is the appropriate test for prose prompts (see the architecture note at the top). Keep the assertions resilient (substring/regex), not brittle exact-string matches.
- SKILL.md line numbers in this plan refer to the file's state before any edits; after each edit the offsets shift, so anchor on the named section headings (`### 1a-bis`, `### 4a-bis`, etc.) rather than absolute lines.
- Do not push or tag — versioning/tagging (`plan-runner/v0.5.0`) is a separate release step the user runs explicitly per `CLAUDE.md`.
