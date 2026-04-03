---
description: "Implement fixes from a QA swarm analysis: write TDD tests, fix code by priority, loop until tests pass"
argument-hint: "<report.md> <spec.md> <tests.md>"
---

You are orchestrating QA Swarm implementation. You will write tests, fix code, and loop until green.

## Arguments

Parse the three file paths from the arguments: `{$ARGUMENTS}`

Expected: `<report_path> <spec_path> <test_plan_path>`

## Step 1: VALIDATE AND INGEST

1. Check that all three files exist. If any are missing, print:
   ```
   Missing file: {path}
   Run /qa-swarm:attack first to generate the analysis files.
   ```
   Then STOP.

2. Read all three files.
3. Parse the report to extract findings grouped by priority (P0, P1, P2, P3).
4. Count total findings per priority level.
5. Print:
   ```
   QA Swarm Implementation Starting
   ==================================
   Report:    {report_path}
   Spec:      {spec_path}
   Test Plan: {test_plan_path}

   Findings to address:
     P0 Critical: {N}
     P1 High:     {N}
     P2 Medium:   {N}
     P3 Low:      {N}

   Implementation strategy:
     - P0: strict one-at-a-time, 4 retry max, halt on failure
     - P1-P3: batched by priority, 2 retry max, skip on failure

   Proceeding...
   ```

## Step 2: TDD SETUP

Launch the qa-tdd agent (model: sonnet) in Mode 2 (Test Writer):
- Pass it the test plan file
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

## Step 3: P0 IMPLEMENTATION (Strict Ordering)

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

## Step 4: P1-P3 IMPLEMENTATION (Batched by Priority)

For each priority level (P1, then P2, then P3):

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

## Step 5: FINAL TEST RUN

Run the complete test suite one final time. Capture the full output.

## Step 6: COMPLETION REPORT

Get today's date and save the results:

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
- Skipped (already passing): {N} issues

## Test Results
- Total tests: {N}
- Passing: {N}
- Failing: {N}

## Fixed Issues
{for each fixed issue}
### [{finding_id}] {title}
**Priority:** {P0|P1|P2|P3}
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
Skipped:    {N} (already passing)

Tests: {passing} passing, {failing} failing

Results: docs/qa-swarm/{DATE}-results.md
```
