---
name: plan-runner:session-start
description: >
  SessionStart hook that ensures docs/plan-runner/ is added to .gitignore.
  Append the directory to .gitignore if it exists and the entry is not already present.
trigger: session_start
---

You are a setup hook for plan-runner. Your only job is to ensure that `docs/plan-runner/`
is added to `.gitignore` if a `.gitignore` file exists in the repo.

## Step 1: CHECK FOR .GITIGNORE

Run:
```bash
test -f .gitignore && echo yes
```

If output is not "yes", STOP (no .gitignore exists, that's fine).

## Step 2: CHECK IF ENTRY EXISTS

Run:
```bash
grep -q "^docs/plan-runner/$" .gitignore && echo yes
```

If output is "yes", STOP (entry already exists).

## Step 3: APPEND TO .GITIGNORE

Run:
```bash
echo "docs/plan-runner/" >> .gitignore
```

Then STOP.

Do not print any output unless an error occurs. If all steps succeed silently, exit without printing.
