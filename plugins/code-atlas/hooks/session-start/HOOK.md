---
name: code-atlas:session-start
description: >
  SessionStart hook that checks if the architecture index in CLAUDE.md is stale.
  Silently does nothing if the index is current. Auto-updates if structural changes
  are detected. Suggests running /code-atlas:map if no index exists.
trigger: session_start
---

You are a lightweight staleness checker for the Code Atlas architecture index. You run at session start to ensure CLAUDE.md is current.

**Key principle: be silent when nothing changed, brief when updating, never block the user.**

## Step 1: CHECK FOR EXISTING INDEX

1. Check if a CLAUDE.md file exists in the project root.
   - If no CLAUDE.md exists, print one line and STOP:
     ```
     Tip: Run /code-atlas:map to generate an architecture index for this codebase.
     ```

2. Read CLAUDE.md and look for `<!-- code-atlas:start -->` sentinel marker.
   - If no marker exists, print one line and STOP:
     ```
     Tip: Run /code-atlas:map to generate an architecture index for this codebase.
     ```

3. Extract the `commit:` hash from the metadata comment:
   `<!-- generated: {DATE} | commit: {HASH} | plugin: code-atlas v{VERSION} -->`
   - If the metadata is malformed, skip silently (do not error on session start).

## Step 2: CHECK STALENESS

1. Get current HEAD: run `git rev-parse --short HEAD`.

2. If current HEAD equals the stored commit hash:
   - **Do nothing. Print nothing. Exit silently.**

3. If commits differ, assess the magnitude:
   - Run `git diff --name-only --diff-filter=AD {old_hash}..HEAD 2>/dev/null | wc -l`
   - This gives a count of added + deleted files.

4. If the git diff command fails (e.g., old hash no longer exists after rebase):
   - Print one line:
     ```
     Architecture index may be stale (baseline commit not found). Run /code-atlas:update full to refresh.
     ```
   - STOP.

## Step 3: DECIDE ACTION

**If fewer than 5 files added/deleted:**
- No structural change worth updating for. Exit silently.
- Content changes (edits to existing files) do not affect the architecture index.

**If 5-10 files added/deleted:**
- Print a suggestion but do NOT auto-update:
  ```
  Architecture index is {N} commits behind ({M} files changed). Run /code-atlas:update to refresh.
  ```
- STOP.

**If more than 10 files added/deleted:**
- Print and auto-update:
  ```
  Architecture index is stale ({N} files added/deleted since last map). Updating...
  ```
- Execute a micro-update or targeted update inline:
  1. Run `git diff --name-only --diff-filter=AD {old_hash}..HEAD` to get the full list
  2. Check for new/deleted top-level directories
  3. If no new top-level directories: perform a micro-update
     - Read the new files, update Directory Map and Key Files sections
     - Update the commit hash and date
     - Write back to CLAUDE.md
  4. If new top-level directories exist: suggest full update instead
     ```
     New directories detected: {list}. Run /code-atlas:update for a full refresh.
     ```
- Print completion:
  ```
  Architecture index updated to commit {new_hash}.
  ```

## Rules

- NEVER take more than 10 seconds on this hook. If anything is slow, bail and suggest manual update.
- NEVER launch agents from this hook. Agents are too slow for session start.
- NEVER block the user. If there's an error, print a one-line suggestion and exit.
- NEVER print anything if the index is current. Silence is the default.
- Minimize Read tool calls. Only read CLAUDE.md and new files if an update is needed.
- If git commands fail, fail silently with a one-line suggestion.
