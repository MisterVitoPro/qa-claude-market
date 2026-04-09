---
name: code-atlas:update
description: >
  Incrementally update the architecture index in CLAUDE.md. Detects structural changes
  since the last map (new directories, moved files, changed dependencies) and updates
  only what changed. Pass "full" to force a complete re-scan. Triggers on: update
  architecture, refresh code map, sync architecture index.
argument-hint: "<optional: 'full' to force complete re-scan>"
---

You are performing an incremental update of the Code Atlas architecture index in CLAUDE.md.

Arguments: **"{$ARGUMENTS}"**

## Step 1: READ EXISTING INDEX

1. Read the project's CLAUDE.md file.

2. Look for the `<!-- code-atlas:start -->` and `<!-- code-atlas:end -->` sentinel markers.

3. If no markers are found:
   ```
   No existing architecture index found in CLAUDE.md.
   Run /code-atlas:map first to generate one.
   ```
   Then STOP.

4. Extract the metadata comment: `<!-- generated: {DATE} | commit: {HASH} | plugin: code-atlas v{VERSION} -->`
   - Parse the `commit:` hash value. This is the baseline for detecting changes.
   - If the metadata comment is missing or malformed, treat as a full re-scan.

5. Extract any user-notes section (`<!-- user-notes:start -->` to `<!-- user-notes:end -->`) for preservation.

6. Store the existing architecture section content for comparison.

## Step 2: ASSESS CHANGES

1. Get the current HEAD commit: run `git rev-parse --short HEAD`.

2. If current HEAD equals the stored commit hash:
   ```
   Architecture index is up to date (commit {HASH}).
   No changes needed.
   ```
   Then STOP.

3. Run `git diff --stat {old_hash}..HEAD` to see the overall magnitude of changes.

4. Run `git diff --name-only --diff-filter=A {old_hash}..HEAD` to list added files.

5. Run `git diff --name-only --diff-filter=D {old_hash}..HEAD` to list deleted files.

6. Run `git diff --name-only --diff-filter=R {old_hash}..HEAD` to list renamed files.

7. Determine which directories are affected:
   - New top-level directories (directories under the project root that didn't exist before)
   - Deleted directories (all files in a directory were removed)
   - New files in existing directories

8. Print the change summary:
   ```
   Code Atlas -- Change Detection
   ================================
   Baseline commit: {old_hash} ({old_date})
   Current commit:  {new_hash}
   
   Changes since last map:
     Files added:    {N}
     Files deleted:  {N}
     Files renamed:  {N}
     New directories: {list or "none"}
     Removed directories: {list or "none"}
   ```

## Step 3: DECIDE UPDATE STRATEGY

Based on the changes detected, choose one of three strategies:

### Strategy A: Micro-Update (no agents)

**Conditions:** ALL of these must be true:
- Fewer than 5 files added or deleted
- No new top-level source directories
- No deleted top-level source directories
- The `full` argument was NOT passed

**Action:**
1. Read the new/changed files to understand what they contain
2. Update the Directory Map section: add new directories, remove deleted ones
3. Update the Key Files table: add new key files, remove deleted ones
4. Update the commit hash and date in the metadata comment
5. Write the updated section back to CLAUDE.md
6. Print:
   ```
   Micro-update complete. Updated directory map and key files.
   {N} directories added, {N} removed, {N} files re-indexed.
   ```

### Strategy B: Targeted Update (1 agent)

**Conditions:** ANY of these:
- 5-30 files added or deleted
- 1-2 new top-level directories
- The change is localized to a specific area

**Action:**
1. Read the new/changed files and directories
2. Launch the `atlas-structure` agent (model: haiku) scoped to only the changed areas
   - Provide the full file tree for context
   - Embed only the new/changed file contents
   - Read agent definition from `agents/atlas-structure.md`
3. Merge the agent's output with the existing architecture section:
   - Add new directory annotations
   - Remove deleted directory annotations
   - Update key files if new entry points or config files were added
4. Update the commit hash and date
5. Write back to CLAUDE.md
6. Print:
   ```
   Targeted update complete. Re-analyzed {N} changed areas.
   ```

### Strategy C: Full Re-scan (3 agents)

**Conditions:** ANY of these:
- More than 30 files added or deleted
- New top-level source directories that represent major structural changes
- The `full` argument was passed
- The metadata comment was malformed (can't determine baseline)

**Action:**
1. Print:
   ```
   Significant structural changes detected. Running full re-scan...
   ```
2. Execute the full `/code-atlas:map` pipeline (Step 1 through Step 5 from the map skill).
   - Follow the exact same steps as the map skill
   - This replaces the entire architecture section

## Step 4: PRESERVE USER NOTES

Regardless of which strategy was used:
1. If user-notes were extracted in Step 1, insert them back just before `<!-- code-atlas:end -->`
2. If the user manually added content between the markers that is NOT inside user-notes tags, warn:
   ```
   Note: Manual edits outside <!-- user-notes --> markers were overwritten.
   To preserve manual notes across updates, wrap them in:
     <!-- user-notes:start -->
     Your notes here
     <!-- user-notes:end -->
   ```

## Step 5: SUMMARY

```
Code Atlas -- Update Complete
================================
Strategy:    {Micro-update | Targeted update | Full re-scan}
Baseline:    {old_hash} -> {new_hash}
Changes:     {N} files added, {N} deleted, {N} renamed

{If agents were used:}
Agents:      {N} Haiku agents
Time:        {Xm Ys}

Architecture index in CLAUDE.md is now current.
```
