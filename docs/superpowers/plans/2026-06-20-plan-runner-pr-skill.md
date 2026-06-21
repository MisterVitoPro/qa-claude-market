# plan-runner PR Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract plan-runner's push + PR logic out of the `run` skill into a dedicated, auto-invoked `plan-runner:pr` skill that opens or updates a proper pull request (conventional title, rich body, whole-branch diff, smart draft default).

**Architecture:** Add one new Markdown skill `plugins/plan-runner/skills/pr/SKILL.md` that takes a single argument (the absolute path to a completed cycle directory) and reads `manifest.json` / `wave-plan.json` / bug JSONs / git to build and create-or-update the PR. Reduce `run` Step 8 to a one-line Skill-tool handoff to it. Bump the plugin to 1.2.0 and sync docs.

**Tech Stack:** Markdown (skill definitions with YAML frontmatter), JSON (plugin manifest, marketplace registry), `git` + `gh` CLI invoked from skill prose, `node` for JSON-validity checks during verification.

## Global Constraints

- No emojis in code or skill content.
- Author/handle in any metadata: `MisterVitoPro`.
- Skill naming: kebab-case, namespaced as `plugin:name` (here `plan-runner:pr`).
- Skill files live at `plugins/<plugin>/skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`).
- License: MIT.
- The new skill is auto-only: invoked by `/plan-runner:run` Step 8 via the Skill tool, not a user-facing command. No `argument-hint`/triggers needed.
- PR body MUST NOT contain a "Test plan" section (explicitly excluded in the spec).
- Configuration is smart-defaults only: no new flags, no config file. Draft when `total_bugs > 0`, else ready. No labels/reviewers.
- Working branch for this work: `plan-runner/agent-teams-backend` (already checked out; not main).

---

### Task 1: Create the `plan-runner:pr` skill

**Files:**
- Create: `plugins/plan-runner/skills/pr/SKILL.md`

**Interfaces:**
- Consumes: a single argument `{$ARGUMENTS}` = absolute path to a completed cycle directory `docs/plan-runner/<DATE>/cycle-<N>/` containing `manifest.json`, `wave-plan.json`, and `bugs/*.json`.
- Produces: the registered skill name `plan-runner:pr` (referenced by Task 2's `run` Step 8). Behavior contract: pushes the current branch, then creates or updates a PR; prints the PR URL (or manual instructions when `gh` is absent).

- [ ] **Step 1: Write the failing check**

Create the verification command that asserts the skill exists with correct frontmatter and the key behaviors. Run it first (it must fail because the file does not exist yet):

```bash
F=plugins/plan-runner/skills/pr/SKILL.md
test -f "$F" \
  && grep -q '^name: plan-runner:pr$' "$F" \
  && grep -q 'git push -u origin' "$F" \
  && grep -q 'gh pr create' "$F" \
  && grep -q 'gh pr edit' "$F" \
  && grep -q 'origin/HEAD' "$F" \
  && grep -qi 'draft' "$F" \
  && echo CHECK_PASS || echo CHECK_FAIL
```

- [ ] **Step 2: Run the check to verify it fails**

Run the command from Step 1.
Expected: prints `CHECK_FAIL` (the file does not exist yet).

- [ ] **Step 3: Create the skill file**

Create `plugins/plan-runner/skills/pr/SKILL.md` with exactly this content:

````markdown
---
name: plan-runner:pr
description: >
  Internal plan-runner step (invoked by /plan-runner:run at pipeline end, not run
  directly): push the current branch and open or update a proper pull request --
  conventional title, rich structured body (summary, whole-branch diff, bug counts,
  stats), and a smart draft/ready default based on remaining bugs. Reads everything
  from the completed cycle directory passed as the argument.
---

You are opening (or updating) the pull request for a completed plan-runner run.

The single argument is the absolute path to the completed cycle directory:

**"{$ARGUMENTS}"**

Set `cycle_dir = {$ARGUMENTS}` (strip surrounding whitespace/quotes). Follow these
steps in order. Do not skip steps.

## Step 1: Load cycle state

Read `$cycle_dir/manifest.json`. If it is missing or not valid JSON:

```
Error: cannot read manifest at <cycle_dir>/manifest.json -- cannot build a PR.
```

Then STOP.

From the manifest capture: `cycle`, `backend`, `total_bugs`, `input_plan`, and the
`waves` array (length = wave count; sum of each wave's `agents` length = dev agent
count).

Read `$cycle_dir/wave-plan.json` for the per-agent `task_title` values (used for the
Summary section). If it is missing, fall back to an empty task list.

## Step 2: Resolve branches and guard

Run:

```bash
git branch --show-current
```

Capture as `branch`. Then resolve the base branch:

```bash
git rev-parse --abbrev-ref origin/HEAD 2>/dev/null | sed 's#^origin/##'
```

Capture as `base`. If the command produces no output, set `base = "main"`.

Guard: if `branch` is empty (detached HEAD) OR `branch` equals `base`, `main`, or
`master`, print and STOP:

```
plan-runner:pr: current branch is "<branch>" -- refusing to open a PR from the base
branch. Check out a feature branch and re-run.
```

## Step 3: Push the branch

```bash
git push -u origin "<branch>"
```

If the push fails, print the git error and STOP (a PR needs a remote branch).

## Step 4: Build the conventional title

1. Determine the subject source, in priority order:
   - The plan's first H1 line. Read `input_plan` and take the first line matching
     `^#\s+(.+)$`; use the captured text.
   - Otherwise the first `task_title` from `wave-plan.json`.
   - Otherwise the literal `plan-runner run`.
2. Determine the type: if the basename of `input_plan` OR the subject text contains
   `fix` or `bug` (case-insensitive), use `fix`; otherwise use `feat`.
3. Normalize the subject: strip a leading `Implementation Plan`/trailing
   `Implementation Plan` boilerplate if present, lowercase the first character, strip
   a trailing period, and hard-truncate to 60 characters at a word boundary.
4. Final `title = "<type>: <subject>"`. Example: `feat: add agent teams backend`.

## Step 5: Build the PR body

Read every `$cycle_dir/bugs/*.json` (if the directory exists). Each file has a `bugs`
array whose entries carry a `severity` of `P0`..`P3`. Tally counts per severity.

Compute the whole-branch diff summary:

```bash
git diff --numstat "<base>...HEAD"
```

Sum column 1 (insertions) and column 2 (deletions) across all rows for totals; count
the rows for files-changed; keep the up-to-10 rows with the largest (ins+del) as the
"most-changed files" list (path with `+ins/-del`).

Assemble the body as Markdown (no "Test plan" section):

```
## Summary
<one "- <task_title>" bullet per agent task from wave-plan.json; "- (no tasks recorded)" if empty>

## Changes
<files-changed> files changed, +<total insertions> / -<total deletions>

Most-changed files:
<one "- <path>  +<ins>/-<del>" line per top file, up to 10>

## Bugs
P0: <n>   P1: <n>   P2: <n>   P3: <n>   (total: <total_bugs>)
<if total_bugs == 0, print "None flagged." instead of the counts line>

## plan-runner stats
- Cycles: <cycle>
- Waves: <wave count>
- Dev agents: <dev agent count>
- Backend: <backend>

Generated with plan-runner
```

## Step 6: Decide draft state

If `total_bugs > 0`, the PR should be a **draft** (unresolved bugs remain).
Otherwise it is **ready for review**. Set `want_draft = (total_bugs > 0)`.

## Step 7: Create or update the PR

Check whether `gh` is available:

```bash
gh --version
```

**If `gh` is NOT available**, print and STOP:

```
Branch pushed to origin/<branch>.

Open a PR manually with these details:

Title: <title>
Base:  <base>
Draft: <want_draft>

Body:
<body>
```

**If `gh` IS available**, check for an existing PR on this branch:

```bash
gh pr view --json number,isDraft 2>/dev/null
```

- **No existing PR** (command fails / empty): create it. Write the body to a temp
  file to avoid quoting issues, then:

  ```bash
  gh pr create --base "<base>" --title "<title>" --body-file <tmp> <--draft if want_draft>
  ```

- **PR already exists** (parse `number` and `isDraft` from the JSON): update it.

  ```bash
  gh pr edit "<number>" --title "<title>" --body-file <tmp>
  ```

  Then reconcile draft state:
  - If `want_draft` is false and the existing PR `isDraft` is true: `gh pr ready "<number>"`.
  - If `want_draft` is true and the existing PR is already ready: leave it as-is and
    print a note (`gh` cannot re-mark a PR as draft).

Print the PR URL that `gh` returns (for an update, run `gh pr view --json url -q .url`
and print it).

## Step 8: Done

Print a one-line confirmation:

```
plan-runner:pr: <created|updated> <draft|ready> PR for <branch> -> <base>: <url>
```

STOP.
````

- [ ] **Step 4: Run the check to verify it passes**

Run the command from Step 1 again.
Expected: prints `CHECK_PASS`.

- [ ] **Step 5: Commit**

```bash
git add plugins/plan-runner/skills/pr/SKILL.md
git commit -m "feat(plan-runner): add plan-runner:pr skill (push + proper PR)"
```

---

### Task 2: Replace `run` Step 8 with the PR-skill handoff

**Files:**
- Modify: `plugins/plan-runner/skills/run/SKILL.md` (the `## Step 8: OPEN PR` section, currently lines ~626-688)

**Interfaces:**
- Consumes: the `plan-runner:pr` skill name created in Task 1, and the in-pipeline values `cycle_dir` (computed in Step 1b) and `cycle_n`.
- Produces: a Step 8 that invokes `plan-runner:pr` and contains no inline `gh pr create` / `git push` logic.

- [ ] **Step 1: Write the failing check**

This check asserts Step 8 now hands off to the skill and the old inline PR logic is gone:

```bash
F=plugins/plan-runner/skills/run/SKILL.md
grep -q 'skill: "plan-runner:pr"' "$F" \
  && ! grep -q 'gh pr create --title' "$F" \
  && echo CHECK_PASS || echo CHECK_FAIL
```

- [ ] **Step 2: Run the check to verify it fails**

Run the command from Step 1.
Expected: prints `CHECK_FAIL` (Step 8 still has inline `gh pr create --title` and no skill handoff).

- [ ] **Step 3: Replace the Step 8 section**

In `plugins/plan-runner/skills/run/SKILL.md`, replace the entire `## Step 8: OPEN PR` section (from the `## Step 8: OPEN PR` heading through the end of that section, i.e. up to but not including `## Phase Timing Summary`) with exactly this:

````markdown
## Step 8: OPEN PR

Delegate push + PR creation to the dedicated PR skill. Compute the absolute path to
the cycle directory (the `$cycle_dir` from Step 1b resolved to an absolute path):

```bash
realpath "$cycle_dir"
```

Capture as `cycle_dir_abs`. Then invoke the Skill tool:

```
Invoke the Skill tool with:
  skill: "plan-runner:pr"
  args: "<cycle_dir_abs>"
```

The `plan-runner:pr` skill reads `manifest.json`, `wave-plan.json`, and the bug JSONs
from that directory, pushes the current branch, and creates or updates the pull
request (conventional title, rich body, draft when bugs remain). When it returns,
print its confirmation line verbatim and STOP.

````

- [ ] **Step 4: Run the check to verify it passes**

Run the command from Step 1 again.
Expected: prints `CHECK_PASS`.

- [ ] **Step 5: Commit**

```bash
git add plugins/plan-runner/skills/run/SKILL.md
git commit -m "feat(plan-runner): delegate run Step 8 to plan-runner:pr skill"
```

---

### Task 3: Version bump and documentation sync

**Files:**
- Modify: `plugins/plan-runner/.claude-plugin/plugin.json` (version + description)
- Modify: `.claude-plugin/marketplace.json` (plan-runner description)
- Modify: `plugins/plan-runner/README.md` (document the PR step)
- Modify: `README.md` (plan-runner blurb)
- Modify: `CLAUDE.md` (version refs + skills line)

**Interfaces:**
- Consumes: the `plan-runner:pr` skill from Task 1 (named in docs).
- Produces: plugin version `1.2.0` consistently across all metadata; no downstream code consumers.

- [ ] **Step 1: Write the failing check**

```bash
node -e '
const fs=require("fs");
const p=JSON.parse(fs.readFileSync("./plugins/plan-runner/.claude-plugin/plugin.json","utf8"));
const m=JSON.parse(fs.readFileSync("./.claude-plugin/marketplace.json","utf8"));
const claude=fs.readFileSync("./CLAUDE.md","utf8");
const okVer = p.version==="1.2.0";
const okDesc = /plan-runner:pr/.test(p.description);
const okMkt = /plan-runner:pr/.test(JSON.stringify(m));
const okClaude = /\| `plan-runner` \| 1\.2\.0/.test(claude);
console.log(okVer&&okDesc&&okMkt&&okClaude ? "CHECK_PASS" : "CHECK_FAIL");
'
```

(Prints `CHECK_PASS` only when both JSON files parse, plugin.json version is `1.2.0`, plugin.json and marketplace.json descriptions mention `plan-runner:pr`, and the CLAUDE.md plugin-table row shows `1.2.0`.)

- [ ] **Step 2: Run the check to verify it fails**

Run the command from Step 1.
Expected: prints `CHECK_FAIL` (version is still `1.1.0` and no PR mention).

- [ ] **Step 3: Apply the edits**

In `plugins/plan-runner/.claude-plugin/plugin.json`, set the version and extend the description:

- Change `"version": "1.1.0"` to `"version": "1.2.0"`.
- Append to the end of the `description` string (before the closing quote): ` Final step opens or updates a proper PR via the plan-runner:pr skill (conventional title, rich body, draft when bugs remain).`

In `.claude-plugin/marketplace.json`, append the same sentence to the end of the plan-runner `description` string: ` Final step opens or updates a proper PR via the plan-runner:pr skill (conventional title, rich body, draft when bugs remain).`

In `plugins/plan-runner/README.md`, add a new section immediately before the `## Output` section:

```markdown
## Pull request

At the end of a run, plan-runner pushes the branch and opens (or updates) a pull
request via the internal `plan-runner:pr` skill. The PR uses a conventional title
(`feat:`/`fix:`), a structured body (Summary, Changes with a whole-branch diff
summary, Bug counts by severity, and plan-runner stats), and a smart default: it
opens as a **draft** when unresolved bugs remain and ready-for-review otherwise. If a
PR already exists for the branch it is updated in place. When `gh` is not installed,
the title and body are printed for manual creation.

```

In `README.md`, replace the plan-runner paragraph's final sentence (the one beginning `Auto-detects Claude Code Agent Teams`) by appending after it: ` At the end it pushes the branch and opens/updates a proper PR (conventional title, structured body, draft when bugs remain) via the bundled \`plan-runner:pr\` skill.`

In `CLAUDE.md`:
- In the plugin table row for `plan-runner`, change the version cell `1.1.0` to `1.2.0` and append to the description cell: ` Final step opens/updates a proper PR via the plan-runner:pr skill.`
- In the "Directory Layout" block, change `# manifest (v1.1.0)` to `# manifest (v1.2.0)`.
- In the "Directory Map" block, change `Plan-driven parallel agent orchestrator (v1.1.0)` to `(v1.2.0)`, and update the plan-runner `skills/` annotation `# User-facing command: run` to `# Commands: run (user-facing); pr (internal, opens the PR)`.

- [ ] **Step 4: Run the check to verify it passes**

Run the command from Step 1 again.
Expected: prints `CHECK_PASS`.

Also confirm both JSON files still parse:

```bash
node -e "JSON.parse(require('fs').readFileSync('./plugins/plan-runner/.claude-plugin/plugin.json')); JSON.parse(require('fs').readFileSync('./.claude-plugin/marketplace.json')); console.log('JSON_OK')"
```

Expected: prints `JSON_OK`.

- [ ] **Step 5: Commit**

```bash
git add plugins/plan-runner/.claude-plugin/plugin.json .claude-plugin/marketplace.json plugins/plan-runner/README.md README.md CLAUDE.md
git commit -m "docs(plan-runner): document plan-runner:pr skill, bump to 1.2.0"
```

---

## Notes for the implementer

- This is a metadata/prose plugin; there is no unit-test runner. The per-task "checks" are the verification gates -- run them exactly and confirm the expected `CHECK_PASS`/`CHECK_FAIL` output before moving on.
- Tasks are ordered: Task 2 references the skill name from Task 1; Task 3 documents both. Do them in order.
- When editing `run` Step 8, preserve the surrounding sections (`## Step 7` before it, `## Phase Timing Summary` after it) untouched.
- Do not add new flags or config -- smart defaults only, per the spec.
