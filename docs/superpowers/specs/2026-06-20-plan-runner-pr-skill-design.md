# plan-runner: dedicated PR skill (`plan-runner:pr`)

**Date:** 2026-06-20
**Plugin:** `plugins/plan-runner` (1.1.0 -> 1.2.0)
**Author:** MisterVitoPro

## Goal

Extract plan-runner's branch-push and PR-creation logic out of the `run` skill
(Step 8) into a dedicated, auto-invoked skill `plan-runner:pr` that opens a
"proper" pull request: conventional title, rich structured body, whole-branch
diff summary, and smart draft/ready defaults. Single source of truth for PR
creation.

## Motivation

Today `run` Step 8 pushes the branch and opens a minimal PR inline: title
`plan-runner: <plan> (cycle N)`, body = task bullets + cycle/wave/agent/bug
counts. It is not idempotent (a second run on the same branch hits
`gh pr create` failure when a PR already exists), uses a non-conventional
title, omits any diff summary, and never opens as draft when bugs remain.
Pulling this into a focused skill makes the PR step richer, reusable, and
independently testable, and keeps `run` Step 8 to a one-line handoff.

## Scope

In scope:
- New skill `plugins/plan-runner/skills/pr/SKILL.md`.
- Replace `run` Step 8 with a Skill-tool invocation of `plan-runner:pr`.
- Version bump + doc/metadata updates.

Out of scope:
- Standalone user-facing invocation (skill is auto-only; invoked by `run`).
- Configurable labels/reviewers/draft via flags or config file (smart defaults
  only).
- A "Test plan" section in the PR body (explicitly excluded).
- Aggregating every cycle's manifest into the body (the whole-branch diff
  already captures multi-cycle changes; the body summarizes the final cycle's
  manifest + the branch diff).

## Design

### Invocation contract

`plan-runner:pr` is auto-only. `run` Step 8 invokes it via the Skill tool:

```
Invoke the Skill tool with:
  skill: "plan-runner:pr"
  args: "<absolute path to cycle_dir>"
```

The single argument is the absolute path to the completed cycle directory
(`docs/plan-runner/<DATE>/cycle-<N>/`). The skill is self-sufficient from that
directory -- it does not depend on in-memory orchestrator state.

Only the final cycle reaches Step 8 (clean run, or the user declined the re-run
prompt), so the skill is invoked exactly once per branch per `run` chain. The
idempotency rule (below) covers the case where a PR already exists from a prior
separate invocation on the same branch.

### Inputs (all read from `cycle_dir`)

| Source | Fields used |
|--------|-------------|
| `manifest.json` | `cycle`, `backend`, `total_bugs`, `input_plan`, `waves` |
| `wave-plan.json` | per-agent `task_title` values (Summary bullets) |
| `bugs/*.json` or `bugs.md` | bug counts by severity (P0-P3) |
| git | current branch, base branch, branch-vs-base diff stats |

If `manifest.json` is missing or unparseable, STOP with a clear error pointing
at the expected path -- the skill cannot build a meaningful PR without it.

### Behavior

1. **Resolve branches + guard.**
   - Current branch: `git branch --show-current`.
   - Base branch: `git rev-parse --abbrev-ref origin/HEAD` (strip `origin/`);
     fallback to `main` if that fails.
   - If current branch is empty (detached HEAD) or equals the base /
     `main` / `master`: print a warning and STOP. plan-runner must not open a
     PR targeting the base branch from the base branch itself.

2. **Push.** `git push -u origin <branch>`. If push fails, print the git error
   and STOP (no point building a PR with no remote branch).

3. **Build conventional title.**
   - Type: `fix:` if the plan basename or H1 contains `fix` or `bug`
     (case-insensitive) -- e.g. a generated `fix-plan.md`; otherwise `feat:`.
   - Subject: the plan's first H1 heading text, else the first task title from
     `wave-plan.json`. Lowercase the first letter, strip a trailing period,
     trim to <= 60 characters (append nothing -- hard truncate at a word
     boundary when possible).
   - Result: `<type>: <subject>` (e.g. `feat: add agent teams backend`).

4. **Build rich body** (Markdown), in this order:
   - `## Summary` -- bulleted task titles from `wave-plan.json`, one per line.
   - `## Changes` -- whole-branch diff summary vs base:
     `git diff --stat <base>...HEAD` distilled to total files changed and
     +/- line counts, plus the most-changed files (top ~10). Use
     `git diff --numstat <base>...HEAD` for machine-readable counts.
   - `## Bugs` -- counts by severity (`P0: n  P1: n  P2: n  P3: n`,
     total) read from the cycle's bug JSONs / `bugs.md`; "None flagged." when
     `total_bugs == 0`.
   - `## plan-runner stats` -- cycles (`manifest.cycle`), waves
     (`manifest.waves` length), dev agents (sum of agents across waves),
     backend (`manifest.backend`).
   - Footer: `Generated with plan-runner`.
   - No "Test plan" section.

5. **Draft decision (smart default).** Open as **draft** when
   `manifest.total_bugs > 0` (unresolved bugs remain after the final cycle);
   otherwise ready-for-review. No labels, no reviewers.

6. **Create or update (idempotent).**
   - Check for an existing PR on the branch: `gh pr view --json number,isDraft`.
   - If none: `gh pr create` with the title, body, `--base <base>`, and
     `--draft` when the draft rule applies.
   - If one exists: `gh pr edit` to update title + body; toggle draft state with
     `gh pr ready` / `gh pr edit --add-label`-style commands as needed
     (`gh pr ready <n>` to undraft; re-mark draft is not supported by `gh`, so
     if it already exists and bugs remain, leave its draft state as-is and note
     it in output).
   - Print the PR URL.

7. **No-`gh` fallback.** If `gh --version` fails, print the resolved title and
   body and confirm the branch was pushed, so the user can open the PR manually
   (preserves current Step 8 behavior).

### `run` Step 8 replacement

Step 8 ("OPEN PR") collapses to: compute the absolute `cycle_dir`, then invoke
`plan-runner:pr` via the Skill tool with that path as `args`. The Phase Timing
"Open PR" bucket still wraps the invocation. All push/title/body/gh logic moves
into the new skill.

### File structure

| File | Responsibility |
|------|----------------|
| `plugins/plan-runner/skills/pr/SKILL.md` | New skill: push + conventional PR, idempotent, smart draft default |
| `plugins/plan-runner/skills/run/SKILL.md` | Step 8 reduced to a one-line Skill-tool handoff |
| `plugins/plan-runner/.claude-plugin/plugin.json` | Version 1.1.0 -> 1.2.0; description mentions PR skill |
| `.claude-plugin/marketplace.json` | Description sync |
| `README.md`, `plugins/plan-runner/README.md` | Document the PR step |
| `CLAUDE.md` | Version + skill-count refs |

## Testing

This plugin is metadata-driven (Markdown skills), so testing is structural and
manual:
- Validate `plugins/plan-runner/skills/pr/SKILL.md` frontmatter parses
  (`name`, `description`) and the body has no placeholder/TODO content.
- Confirm `run` Step 8 references `plan-runner:pr` and no longer contains inline
  `gh pr create` logic.
- Manual smoke: on a feature branch with a completed cycle dir, the skill
  pushes, builds a conventional title + structured body, opens a draft PR when
  bugs remain and a ready PR when clean, and updates rather than fails when a PR
  already exists. Branch-equals-base guard stops cleanly.

## Risks / Edge Cases

- **Detached HEAD / on base branch:** guarded in step 1 (warn + STOP).
- **`origin/HEAD` not set:** fallback to `main`.
- **Existing draft PR with bugs still present:** `gh` cannot re-mark a PR as
  draft; leave state unchanged and note it.
- **Missing `bugs.md`/bug JSONs on a clean run:** Bugs section prints
  "None flagged."
- **`gh` absent:** fallback to printed instructions.
- **Empty/garbled manifest:** STOP with a path-specific error.
