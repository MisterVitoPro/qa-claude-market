---
name: implement
description: >
  Implement fixes from a QA swarm analysis: write TDD tests, fix code by priority, loop
  until tests pass. Takes the 3 output file paths from a /qa-swarm:attack run.
argument-hint: "<report.md> <spec.md> <tests.md>"
---

You are orchestrating QA Swarm implementation. You will write tests, fix code, and loop until green.

**IMPORTANT:** Before modifying any code, verify that the current working tree is clean or committed. If there are uncommitted changes, warn the user:
```
Warning: You have uncommitted changes. If fixes go wrong, you may lose work.
Recommendation: Commit or stash your changes before proceeding.
Continue anyway? (Y/n)
```
Wait for confirmation before proceeding.

## Arguments

Parse the three file paths from the arguments: `{$ARGUMENTS}`

Expected: `<report_path> <spec_path> <test_plan_path>`

## Step 1: VALIDATE AND INGEST

1. Parse the three file paths from the arguments. If fewer than three paths are provided, print:
   ```
   Error: Expected 3 file paths, got {N}.

   Usage: /qa-swarm:implement <report.md> <spec.md> <test_plan.md>
   Example: /qa-swarm:implement docs/qa-swarm/2026-04-02-report.md docs/qa-swarm/2026-04-02-spec.md docs/qa-swarm/2026-04-02-tests.md

   Run /qa-swarm:attack first to generate these files.
   ```
   Then STOP.

2. Check that all three files exist. For EACH missing file, collect the error. If any are missing, print:
   ```
   Cannot start implementation -- missing files:
     {path_1}  <-- not found
     {path_2}  <-- not found

   Expected files in docs/qa-swarm/:
     {date}-report.md   (ranked findings)
     {date}-spec.md     (implementation spec)
     {date}-tests.md    (TDD test plan)

   Run /qa-swarm:attack first to generate these files.
   ```
   Then STOP.

3. Read all three files.
4. Parse the report to extract findings grouped by priority (P0, P1, P2, P3).
5. Count total findings per priority level. If total findings is 0, print:
   ```
   No findings to implement -- the report contains 0 actionable findings.
   ```
   Then STOP.
6. Check for an existing results file at `docs/qa-swarm/{DATE}-results.md`.
   - If found, read it and mark already-fixed issues as complete.
   - This enables incremental runs across sessions.

## Step 2: PHASE SELECTION

Present the user with a summary table and let them choose what to tackle:

```
QA Swarm Implementation
========================
Report:    {report_path}
Spec:      {spec_path}
Test Plan: {test_plan_path}

 Phase | Priority    | Issues | Status
-------|-------------|--------|------------
   1   | P0 Critical |   {N}  | {status}
   2   | P1 High     |   {N}  | {status}
   3   | P2 Medium   |   {N}  | {status}
   4   | P3 Low      |   {N}  | {status}

Status key: Not started | Partial (N/M) | Done (N/N)

Options:
  [A]   All phases (P0 -> P1 -> P2 -> P3)
  [1]   Phase 1 only
  [2]   Phase 2 only
  [3]   Phase 3 only
  [4]   Phase 4 only
  [1-2] Phases 1 through 2
  [1,3] Phases 1 and 3

Select phases:
```

Wait for user selection before proceeding. Parse their input to determine which phases to run.

## Step 3: TDD SETUP

Launch the qa-tdd agent (model: sonnet) in Mode 2 (Test Writer):
- Pass it the test plan file, filtered to SELECTED PHASES ONLY
- Instruct it to:
  1. Read existing tests in the project to detect conventions (test framework, file location, naming)
  2. Write the actual test files to disk following those conventions
  3. Run the full test suite
  4. Report which tests fail (expected) and which pass (unexpected)

After the TDD agent completes:
- Tests that FAIL: these are in the implementation queue (good -- red phase)
- Tests that PASS: remove the corresponding findings from the implementation queue and note them:
  ```
  Tests already passing (removed from queue):
    - {finding_id}: {title} -- likely already fixed or false positive
  ```

## Step 4: PHASE EXECUTION

Execute selected phases in priority order (P0 always runs first even if user selected [2,1]).

### P0 Phase (Strict Ordering)

For EACH P0 finding, one at a time:

1. Print: `Fixing P0: [{finding_id}] {title} (attempt 1/{max_retries})`

2. Launch an implementation agent (model: opus) with:
   - The specific P0 finding from the report
   - The implementation-ready fix steps from the spec
   - The relevant test file(s) for this finding
   - Instruction: "Read the spec's fix steps for this finding. Implement the fix exactly. Do not modify test files."

3. After the agent completes, run the FULL test suite (not just the new tests).

4. Check results:
   - **All tests pass**: Print `P0 [{finding_id}] FIXED` and move to next P0.
   - **New test failures appeared**: The fix broke something.
     - Launch the implementation agent again with the error output.
     - Instruct: "Your fix for {finding_id} caused these test failures: {failures}. Fix the regression without reverting the original fix."
     - Retry up to 4 total attempts.
   - **After 4 failed attempts**: HALT.
     ```
     HALTED: P0 [{finding_id}] could not be fixed after 4 attempts.

     What was tried:
     {summary of each attempt}

     Last error:
     {test output}

     Options:
       1. Type your fix guidance and I will retry
       2. Type "skip" to move on
       3. Type "abort" to stop implementation entirely
     ```
     Wait for user input. If they provide guidance, retry with their instructions. If "skip", continue. If "abort", jump to Step 5.

### P1-P3 Phases (Batched by Priority)

For each selected priority level (P1, then P2, then P3):

1. Print:
   ```
   Implementing {N} P{level} fixes...
   ```

2. Launch an implementation agent (model: opus) with:
   - All findings for this priority level from the report
   - The corresponding fix details from the spec
   - The relevant test files
   - Instruction: "Implement all these fixes. Read the spec for approach details. Do not modify test files."

3. After the agent completes, run the FULL test suite.

4. Check results:
   - **All tests pass**: Print `P{level} fixes complete: {N}/{N} fixed` and move to next priority.
   - **Some tests fail**: Identify which findings' tests are still failing.
     - Launch the implementation agent again with the failures.
     - Retry up to 2 total attempts.
   - **After 2 failed attempts**: Skip the failing fixes.
     ```
     Skipped {N} P{level} fixes (unresolved after 2 attempts):
       - [{finding_id}] {title}: {error_summary}
     ```
     Continue to next priority level.

## Step 5: PHASE COMPLETE + CONTINUE PROMPT

After all selected phases finish:

1. Run the full test suite for verification.
2. Update the results file incrementally at `docs/qa-swarm/{DATE}-results.md`.
3. Print phase summary:
   ```
   Phase(s) complete.
   Fixed:      {N}/{N} issues
   Unresolved: {N} issues
   Halted:     {N} (required intervention)
   Tests:      {N} passing, {N} failing
   ```

4. If unselected phases remain, present the continue prompt:
   ```
   Remaining phases:

    Phase | Priority    | Issues | Status
   -------|-------------|--------|------------
      3   | P2 Medium   |   {N}  | Not started
      4   | P3 Low      |   {N}  | Not started

   Continue? [3/4/3-4/A/done]
   ```

5. If user selects more phases, loop back to Step 3 (TDD Setup for new phases).
6. If user selects "done" or no phases remain, proceed to Step 6.

## Step 6: FINAL REPORT

Get today's date and save/update the results:

Write to `docs/qa-swarm/{DATE}-results.md`:

```markdown
# QA Swarm Implementation Results
**Date:** {DATE}
**Source spec:** {spec_path}
**Duration:** {elapsed time if available}

## Summary
- Fixed: {N}/{total} issues
- Unresolved: {N} issues
- Halted: {N} P0s (required human intervention)
- Skipped (phases not selected): {N} issues
- Already passing: {N} issues

## Test Results
- Total tests: {N}
- Passing: {N}
- Failing: {N}

## Fixed Issues
{for each fixed issue}
### [{finding_id}] {title}
**Priority:** {P0|P1|P2|P3}
**Phase:** {N}
**Attempts:** {N}
**Fix applied:** {brief description of what was changed}
**Files modified:** {list}

## Unresolved Issues
{for each unresolved issue}
### [{finding_id}] {title}
**Priority:** {P0|P1|P2|P3}
**Attempts:** {max_retries}
**Last error:** {error message}
**What was tried:** {brief summary}
**Recommendation:** {what a human should look at}

## Halted Issues
{for each halted P0}
### [{finding_id}] {title}
**Attempts:** 4
**What was tried:** {summary of all 4 attempts}
**Why it failed:** {analysis}
**Recommendation:** {what needs human attention}

## Phases Not Selected
{list of phases the user chose not to run, with issue counts}

## Already Passing (Skipped)
{for each finding whose tests already passed}
- [{finding_id}] {title} -- {likely already fixed / false positive}
```

Print the summary:

```
QA Swarm Implementation Complete
===================================
Fixed:      {N}/{total} issues
Unresolved: {N} issues
Halted:     {N} P0s
Skipped:    {N} (phases not selected)
Already OK: {N} (tests already passing)

Tests: {passing} passing, {failing} failing

Results: docs/qa-swarm/{DATE}-results.md

Next steps:
  1. Review changes:  git diff
  2. Run your tests:  {detected test command, or "your test command"}
  3. Run linter:      {detected lint command, if any}
  4. Commit:          git add -A && git commit -m "fix: resolve QA swarm findings"
  5. Open a PR for review
```
