---
name: code-atlas:session-start
description: >
  SessionStart hook that primes Claude with the code-atlas architecture index by
  loading .code-atlas/atlas.json into session context. Read-only -- never writes,
  never launches agents. If no index exists, prints a one-line suggestion to run
  /code-atlas:map.
trigger: session_start
---

You are a read-only context primer for the Code Atlas architecture index. You run at session start to load the curated architecture index (`.code-atlas/atlas.json`) into context so Claude can navigate the repo without exploring it from scratch.

**Key principles:**

- This hook NEVER writes to any file.
- This hook NEVER launches agents.
- This hook NEVER runs analysis or diffs.
- If anything fails, print one line and exit silently.
- Target runtime: under 500 ms.

## Step 1: CHECK FOR ATLAS.JSON

1. Check if `.code-atlas/atlas.json` exists: `test -f .code-atlas/atlas.json && echo yes`.
2. If it does not exist, print ONE line and STOP:
   ```
   Tip: Run /code-atlas:map to generate an architecture index and speed up Claude's navigation.
   ```

## Step 2: LOAD AND PRINT

1. Read `.code-atlas/atlas.json` using the Read tool.
2. Get the current HEAD short SHA: `git rev-parse --short HEAD 2>/dev/null`. If the command fails (not a git repo), use the literal string `n/a`.
3. Extract from the JSON:
   - `_header.baseline_commit` -> stored_commit
   - `_header.generated_at` -> generated_at

Print this block to the session (Claude will consume it as context):

```
## Code Atlas Architecture Index

Cached commit: <stored_commit>
Current HEAD:  <current_short_sha>
Generated at:  <generated_at>

Consult this index BEFORE using the Explore agent or running broad Grep/Glob searches. It contains the directory map, key files, tech stack, dependency graph, and build commands for this repository.

<insert the contents of atlas.json verbatim here>
```

If `stored_commit != current_short_sha` AND current_short_sha != "n/a":

Append ONE line at the end:
```
Note: Index is stale (cached commit does not match HEAD). Run /code-atlas:update to refresh.
```

## Rules

- NEVER take more than 10 seconds on this hook. If a read or git call hangs, bail and exit silently.
- NEVER launch agents. Agents are too slow for session start.
- NEVER block the user. On any error, exit silently.
- NEVER write to `.code-atlas/`, CLAUDE.md, or any other file.
- Minimize tool calls. You need exactly: one `test -f`, one `Read`, one `git rev-parse`. No Grep, no Glob, no Bash walking.
