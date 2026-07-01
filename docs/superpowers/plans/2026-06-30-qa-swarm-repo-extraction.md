# qa-swarm Repo Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the `qa-swarm` plugin out of the `qa-claude-market` monorepo into its own standalone public GitHub repo (`MisterVitoPro/qa-swarm`), and repoint the marketplace at it, as cycle 1 of turning `qa-claude-market` into a thin marketplace registry.

**Architecture:** Stage a fresh, history-free copy of `plugins/qa-swarm/` as a new local repo, push it to a new GitHub repo, then update `qa-claude-market`'s `marketplace.json` to source qa-swarm via the official `{"source": "url", ...}` git-source form instead of a local path, deleting the old in-repo copy and updating docs to match.

**Tech Stack:** git, GitHub CLI (`gh`), Claude Code plugin CLI (`claude plugin ...`), Markdown, JSON.

## Global Constraints

- No git history is imported into the new repo — single fresh initial commit (per design decision).
- New repo tags use plain `v<version>` (no `qa-swarm/` prefix — that prefix only disambiguates plugins sharing one repo).
- New GitHub repo is **public**.
- `plugins/qa-swarm/` and its stale references are deleted from `qa-claude-market` only after the new repo is live and `marketplace.json` points at it — no transition period.
- Task 2 (repo creation + push) is a checkpoint: confirm with the user before running it. Everything before it is local-only and fully reversible; everything from Task 2 onward is not.
- Design reference: `docs/superpowers/specs/2026-06-30-qa-swarm-repo-extraction-design.md`.

---

### Task 1: Stage the new qa-swarm repo locally

**Files:**
- Create: `D:\claude_plugins\qa-swarm\.claude-plugin\plugin.json` (copy)
- Create: `D:\claude_plugins\qa-swarm\agents\*` (copy)
- Create: `D:\claude_plugins\qa-swarm\skills\*` (copy)
- Create: `D:\claude_plugins\qa-swarm\LICENSE` (copy)
- Create: `D:\claude_plugins\qa-swarm\README.md` (copy, then edited)
- Create: `D:\claude_plugins\qa-swarm\docs\MASTER-SPEC.md` (copy of `docs/master-spec/CONSOLIDATED-qa-swarm.md`)

**Interfaces:**
- Consumes: `D:\claude_plugins\qa-claude-market\plugins\qa-swarm\` (existing plugin content), `D:\claude_plugins\qa-claude-market\docs\master-spec\CONSOLIDATED-qa-swarm.md` (existing consolidated spec)
- Produces: a local git repo at `D:\claude_plugins\qa-swarm` with one commit, tagged `v1.4.1` — consumed by Task 2 (push) and Task 3 (marketplace.json `url`/`ref`)

- [ ] **Step 1: Copy plugin content into the new repo directory**

```bash
mkdir -p /d/claude_plugins/qa-swarm/docs
cp -r /d/claude_plugins/qa-claude-market/plugins/qa-swarm/.claude-plugin /d/claude_plugins/qa-swarm/
cp -r /d/claude_plugins/qa-claude-market/plugins/qa-swarm/agents /d/claude_plugins/qa-swarm/
cp -r /d/claude_plugins/qa-claude-market/plugins/qa-swarm/skills /d/claude_plugins/qa-swarm/
cp /d/claude_plugins/qa-claude-market/plugins/qa-swarm/LICENSE /d/claude_plugins/qa-swarm/
cp /d/claude_plugins/qa-claude-market/plugins/qa-swarm/README.md /d/claude_plugins/qa-swarm/
cp /d/claude_plugins/qa-claude-market/docs/master-spec/CONSOLIDATED-qa-swarm.md /d/claude_plugins/qa-swarm/docs/MASTER-SPEC.md
```

Expected: `ls /d/claude_plugins/qa-swarm` shows `.claude-plugin`, `agents`, `skills`, `docs`, `LICENSE`, `README.md`.

- [ ] **Step 2: Fix the copied README's monorepo-relative references**

Edit `D:\claude_plugins\qa-swarm\README.md`:

Replace:
```
![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-claude-market%2Fmain%2Fplugins%2Fqa-swarm%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)
```
With:
```
![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-swarm%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)
```

Replace:
```
Part of the [MisterVitoPro Plugin Marketplace](../../README.md).
```
With:
```
Part of the [MisterVitoPro Plugin Marketplace](https://github.com/MisterVitoPro/qa-claude-market).
```

Replace:
```bash
# Install
claude plugin marketplace add MisterVitoPro/qa-swarm --plugin qa-swarm

# Analyze your codebase
/qa-swarm:attack "find bugs in the authentication and authorization flow"

# After the swarm completes, implement fixes using the generated file paths
/qa-swarm:implement docs/qa-swarm/2026-04-02-report.md docs/qa-swarm/2026-04-02-spec.md docs/qa-swarm/2026-04-02-tests.md
```
With:
```bash
# Install
claude plugin marketplace add MisterVitoPro/qa-claude-market
claude plugin install qa-swarm@mistervitopro-plugin-marketplace

# Analyze your codebase
/qa-swarm:attack "find bugs in the authentication and authorization flow"

# After the swarm completes, implement fixes using the generated file paths
/qa-swarm:implement docs/qa-swarm/2026-04-02-report.md docs/qa-swarm/2026-04-02-spec.md docs/qa-swarm/2026-04-02-tests.md
```

Replace:
```
## Installation

```bash
claude plugin marketplace add MisterVitoPro/qa-swarm --plugin qa-swarm
```

Or load directly for a single session:

```bash
claude --plugin-dir /path/to/plugins/qa-swarm
```
```
With:
```
## Installation

```bash
claude plugin marketplace add MisterVitoPro/qa-claude-market
claude plugin install qa-swarm@mistervitopro-plugin-marketplace
```

Or load directly for a single session:

```bash
claude --plugin-dir /path/to/qa-swarm
```
```

- [ ] **Step 3: Validate the staged plugin manifest**

```bash
claude plugin validate /d/claude_plugins/qa-swarm
```

Expected: `Validating plugin manifest: ...\qa-swarm\.claude-plugin\plugin.json` followed by `Validation passed` (warnings about missing `author` are pre-existing and fine — every plugin in this marketplace has them).

- [ ] **Step 4: Init git, commit, and tag**

```bash
cd /d/claude_plugins/qa-swarm
git init
git add .
git commit -m "$(cat <<'EOF'
Initial commit: extract qa-swarm from qa-claude-market

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git tag v1.4.1
```

Expected: `git log --oneline` shows exactly one commit; `git tag` shows `v1.4.1`; `git symbolic-ref --short HEAD` shows `main`.

---

### Task 2: Create the GitHub repo and push — CONFIRM WITH USER FIRST

**This step is a checkpoint.** Everything in Task 1 is local and reversible (just delete `D:\claude_plugins\qa-swarm`). This task creates a public GitHub repo and pushes to it — get explicit go-ahead before running it.

**Files:** None (no local file changes — remote-only).

**Interfaces:**
- Consumes: the local repo + `v1.4.1` tag from Task 1
- Produces: `https://github.com/MisterVitoPro/qa-swarm` (public, `main` branch + `v1.4.1` tag pushed) and the commit SHA — both consumed by Task 3

- [ ] **Step 1: Confirm with the user, then create and push**

```bash
cd /d/claude_plugins/qa-swarm
gh repo create MisterVitoPro/qa-swarm --public --source=. --remote=origin \
  --description "AI-powered code quality analyzer: specialized agents find security, performance, architecture, and correctness issues, then fix them via TDD"
git push -u origin main
git push origin v1.4.1
```

- [ ] **Step 2: Verify and capture the commit SHA**

```bash
gh repo view MisterVitoPro/qa-swarm --json url,visibility
git ls-remote --tags origin
git rev-parse v1.4.1
```

Expected: `visibility` is `PUBLIC`; `git ls-remote --tags origin` lists `refs/tags/v1.4.1`; `git rev-parse v1.4.1` prints a 40-char SHA — record it, it's needed verbatim in Task 3.

---

### Task 3: Point `marketplace.json` at the new repo

**Files:**
- Modify: `D:\claude_plugins\qa-claude-market\.claude-plugin\marketplace.json`

**Interfaces:**
- Consumes: the GitHub URL, `v1.4.1` tag, and commit SHA from Task 2
- Produces: a `marketplace.json` where qa-swarm's `source` is an external git source — consumed by Task 6 (install verification)

- [ ] **Step 1: Edit the qa-swarm entry**

In `D:\claude_plugins\qa-claude-market\.claude-plugin\marketplace.json`, replace:
```json
    {
      "name": "qa-swarm",
      "description": "AI-powered code quality analyzer: specialized agents find security, performance, architecture, and correctness issues, then fix them via TDD",
      "source": "./plugins/qa-swarm",
      "category": "development"
    },
```
With (substitute `<SHA>` with the value captured in Task 2, Step 2):
```json
    {
      "name": "qa-swarm",
      "description": "AI-powered code quality analyzer: specialized agents find security, performance, architecture, and correctness issues, then fix them via TDD",
      "source": {
        "source": "url",
        "url": "https://github.com/MisterVitoPro/qa-swarm.git",
        "ref": "v1.4.1",
        "sha": "<SHA>"
      },
      "category": "development"
    },
```

- [ ] **Step 2: Validate**

```bash
cd /d/claude_plugins/qa-claude-market
claude plugin validate .
```

Expected: `Validating marketplace manifest: ...\marketplace.json`, `Validation passed with warnings` (the same pre-existing `author`/`metadata` warnings as before — no new errors).

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/marketplace.json
git commit -m "$(cat <<'EOF'
feat: source qa-swarm from its own repo

qa-swarm now lives at github.com/MisterVitoPro/qa-swarm; marketplace.json
points there instead of the local plugins/qa-swarm/ path.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Remove qa-swarm's local copy from qa-claude-market

**Files:**
- Delete: `D:\claude_plugins\qa-claude-market\plugins\qa-swarm\` (entire directory)
- Delete: `D:\claude_plugins\qa-claude-market\docs\master-spec\CONSOLIDATED-qa-swarm.md`
- Modify: `D:\claude_plugins\qa-claude-market\docs\master-spec\consolidated-index.json`
- Modify: `D:\claude_plugins\qa-claude-market\.github\CODEOWNERS`

**Interfaces:**
- Consumes: Task 3's committed `marketplace.json` (must already point externally before deleting local code)
- Produces: a `qa-claude-market` repo with no local qa-swarm files — consumed by Task 6 (confirms installs no longer resolve locally)

- [ ] **Step 1: Delete the old plugin directory and consolidated spec**

```bash
cd /d/claude_plugins/qa-claude-market
git rm -r plugins/qa-swarm
git rm docs/master-spec/CONSOLIDATED-qa-swarm.md
```

- [ ] **Step 2: Remove qa-swarm from jupiter's consolidated-index.json**

`docs/master-spec/consolidated-index.json` still lists `docs/master-spec/CONSOLIDATED-qa-swarm.md` (being deleted in Step 1) both in `consolidated_files` and as its own `buckets.qa-swarm` entry — leaving them would dangle-reference a file that no longer exists.

In `D:\claude_plugins\qa-claude-market\docs\master-spec\consolidated-index.json`, replace:
```json
  "consolidated_files": [
    "docs/master-spec/CONSOLIDATED-code-atlas.md",
    "docs/master-spec/CONSOLIDATED-jupiter.md",
    "docs/master-spec/CONSOLIDATED-plan-runner.md",
    "docs/master-spec/CONSOLIDATED-qa-swarm.md",
    "docs/master-spec/CONSOLIDATED-shared.md"
  ],
```
With:
```json
  "consolidated_files": [
    "docs/master-spec/CONSOLIDATED-code-atlas.md",
    "docs/master-spec/CONSOLIDATED-jupiter.md",
    "docs/master-spec/CONSOLIDATED-plan-runner.md",
    "docs/master-spec/CONSOLIDATED-shared.md"
  ],
```

Replace the entire `qa-swarm` bucket (it sits between the `plan-runner` bucket's closing `},` and the `shared` bucket):
```json
    "qa-swarm": {
      "summary": "agents / tdd / orchestration",
      "source_file": "docs/master-spec/CONSOLIDATED-qa-swarm.md",
      "sections": [
        {
          "anchor": "#2026-04-02-qa-swarm-plugin-design",
          "original_path": "plugins/qa-swarm/docs/superpowers/specs/2026-04-02-qa-swarm-plugin-design.md",
          "heading": "## 2026-04-02-qa-swarm-plugin-design",
          "line": 7,
          "loc": 518,
          "topics": [
            "qa",
            "agents",
            "orchestration",
            "security",
            "priority",
            "tdd",
            "multi-agent"
          ]
        },
        {
          "anchor": "#master-spec",
          "original_path": "plugins/qa-swarm/docs/MASTER-SPEC.md",
          "heading": "## MASTER-SPEC",
          "line": 525,
          "loc": 694,
          "topics": [
            "qa",
            "agents",
            "tdd",
            "priority",
            "aggregation",
            "security",
            "orchestration"
          ]
        },
        {
          "anchor": "#readme",
          "original_path": "plugins/qa-swarm/README.md",
          "heading": "## README",
          "line": 1219,
          "loc": 260,
          "topics": [
            "qa",
            "agents",
            "security",
            "tdd",
            "parallel",
            "installation"
          ]
        },
        {
          "anchor": "#2026-04-02-qa-swarm-plugin",
          "original_path": "plugins/qa-swarm/docs/superpowers/plans/2026-04-02-qa-swarm-plugin.md",
          "heading": "## 2026-04-02-qa-swarm-plugin",
          "line": 1479,
          "loc": 2711,
          "topics": [
            "implementation-plan",
            "agents",
            "tdd",
            "orchestration",
            "plugin-scaffold"
          ]
        }
      ],
      "gaps_count": 22
    },
```
With nothing (delete it — leave the `plan-runner` bucket's closing `},` immediately followed by the `"shared": {` bucket).

Then update the total line count, which included qa-swarm's 4 sections (518+694+260+2711=4183 loc):
```json
  "total_loc": 9498,
```
With:
```json
  "total_loc": 5315,
```

Verify the result is still valid JSON:
```bash
node -e "JSON.parse(require('fs').readFileSync('docs/master-spec/consolidated-index.json','utf8')); console.log('valid JSON')"
```
Expected: `valid JSON`.

- [ ] **Step 3: Remove the stale CODEOWNERS line**

Edit `D:\claude_plugins\qa-claude-market\.github\CODEOWNERS`, replace:
```
# Plugin-specific owners
/plugins/qa-swarm/ @MisterVitoPro
/plugins/code-atlas/ @MisterVitoPro
/plugins/plan-runner/ @MisterVitoPro
```
With:
```
# Plugin-specific owners
/plugins/code-atlas/ @MisterVitoPro
/plugins/plan-runner/ @MisterVitoPro
```

- [ ] **Step 4: Verify nothing local still references qa-swarm's old path**

```bash
grep -rn "plugins/qa-swarm" --include="*.md" --include="*.json" --include="*.yml" . || echo "no matches"
ls plugins/ | grep -x qa-swarm || echo "qa-swarm directory gone"
```

Expected: `no matches` (or only matches inside `docs/superpowers/` planning/spec files, which are historical records and fine to leave as-is) and `qa-swarm directory gone`.

- [ ] **Step 5: Commit**

```bash
git add .github/CODEOWNERS docs/master-spec/consolidated-index.json
git commit -m "$(cat <<'EOF'
chore: remove qa-swarm's local copy

qa-swarm now lives at github.com/MisterVitoPro/qa-swarm (see previous
commit); the local plugins/qa-swarm/ copy, its consolidated spec, and
jupiter's index entry for it are no longer needed here.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Update qa-claude-market documentation

**Files:**
- Modify: `D:\claude_plugins\qa-claude-market\README.md`
- Modify: `D:\claude_plugins\qa-claude-market\CLAUDE.md`

**Interfaces:**
- Consumes: nothing new (pure documentation update reflecting Tasks 3-4)
- Produces: docs that describe the local-vs-external plugin split accurately — consumed by nothing downstream (terminal task for the repo's docs)

- [ ] **Step 1: Update `README.md`**

Replace:
```
### qa-swarm  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-claude-market%2Fmain%2Fplugins%2Fqa-swarm%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)
```
With:
```
### qa-swarm  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-swarm%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)
```

Replace:
```
→ [Plugin docs](plugins/qa-swarm/README.md)
```
With:
```
→ [Plugin docs](https://github.com/MisterVitoPro/qa-swarm)
```

Replace:
```
3. Tag releases as `<plugin-name>/v<version>` (e.g. `qa-swarm/v1.4.1`) and push the tag — Claude Code uses tags as the version cache key.
```
With:
```
3. Tag releases as `<plugin-name>/v<version>` (e.g. `code-atlas/v2.1.0`) and push the tag — Claude Code uses tags as the version cache key. Plugins sourced from their own repo (e.g. `qa-swarm`) instead tag plain `v<version>` in that repo, then bump `ref`/`sha` on the plugin's `source` entry in this repo's `marketplace.json`.
```

- [ ] **Step 2: Update `CLAUDE.md`**

Replace:
```
Multi-plugin marketplace repository. Each plugin lives under `plugins/` with its own `.claude-plugin/plugin.json`, agents, skills, and docs. See Architecture section for tech stack, directory map, key files, and conventions.
```
With:
```
Multi-plugin marketplace repository. Most plugins live under `plugins/` with their own `.claude-plugin/plugin.json`, agents, skills, and docs; some plugins (e.g. `qa-swarm`) are sourced from their own dedicated repo instead (see `.claude-plugin/marketplace.json`). See Architecture section for tech stack, directory map, key files, and conventions.
```

Replace:
```
| `qa-swarm` | 1.4.1 | AI-powered code quality analyzer: 6 Sonnet core agents + optional Haiku, 3-agent parallel TDD, fresh-context subagent handoff, Context7 MCP baseline across all agents |
```
With:
```
| `qa-swarm` | 1.4.1 | AI-powered code quality analyzer: 6 Sonnet core agents + optional Haiku, 3-agent parallel TDD, fresh-context subagent handoff, Context7 MCP baseline across all agents. Sourced externally from [github.com/MisterVitoPro/qa-swarm](https://github.com/MisterVitoPro/qa-swarm). |
```

Replace:
```
.claude-plugin/marketplace.json              # central registry
plugins/
  qa-swarm/.claude-plugin/plugin.json        # manifest (v1.4.1)
  code-atlas/.claude-plugin/plugin.json      # manifest (v2.1.0)
  plan-runner/.claude-plugin/plugin.json     # manifest (v1.5.0)
  jupiter/.claude-plugin/plugin.json         # manifest (v0.1.1)
  migration-runner/.claude-plugin/plugin.json # manifest (v0.1.0)
  llm-wiki/.claude-plugin/plugin.json         # manifest (v0.1.0)
```
With:
```
.claude-plugin/marketplace.json              # central registry -- qa-swarm sourced externally (github.com/MisterVitoPro/qa-swarm)
plugins/
  code-atlas/.claude-plugin/plugin.json      # manifest (v2.1.0)
  plan-runner/.claude-plugin/plugin.json     # manifest (v1.5.0)
  jupiter/.claude-plugin/plugin.json         # manifest (v0.1.1)
  migration-runner/.claude-plugin/plugin.json # manifest (v0.1.0)
  llm-wiki/.claude-plugin/plugin.json         # manifest (v0.1.0)
```

Replace:
```
plugins/                    # Root directory containing all plugins
  qa-swarm/                 # AI-powered code quality analyzer (v1.4.1)
    .claude-plugin/         # Plugin manifest and metadata
    agents/                 # 16 QA agent definitions (security, perf, correctness, architecture, data flow, async, etc.)
    skills/                 # User-facing commands: attack (analyze), implement (fix)
    docs/                   # Master spec, design plans, implementation plans
  code-atlas/               # Architecture index generator with semantic graph (v2.1.0)
```
With:
```
plugins/                    # Root directory containing local plugins (qa-swarm lives externally -- github.com/MisterVitoPro/qa-swarm)
  code-atlas/               # Architecture index generator with semantic graph (v2.1.0)
```

Replace:
```
| `plugins/qa-swarm/docs/MASTER-SPEC.md` | QA Swarm spec |
```
With:
```
| [`docs/MASTER-SPEC.md`](https://github.com/MisterVitoPro/qa-swarm/blob/main/docs/MASTER-SPEC.md) (external qa-swarm repo) | QA Swarm spec |
```

Replace:
```
Bump `plugins/<name>/.claude-plugin/plugin.json` before pushing. Tag as `<plugin-name>/v<version>` and push with `git push origin --tags`.
```
With:
```
Bump `plugins/<name>/.claude-plugin/plugin.json` before pushing. Tag as `<plugin-name>/v<version>` and push with `git push origin --tags`. Plugins sourced from their own repo (e.g. `qa-swarm`) are versioned and tagged plain `v<version>` in that repo instead; after tagging there, bump `ref`/`sha` on the plugin's `source` entry in `.claude-plugin/marketplace.json` here.
```

- [ ] **Step 3: Validate and commit**

```bash
cd /d/claude_plugins/qa-claude-market
claude plugin validate .
git add README.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: document qa-swarm's external-repo sourcing

Update README and CLAUDE.md to reflect qa-swarm living at its own repo:
badge URL, plugin docs link, directory map, key files, and the
local-vs-external versioning convention.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Verify the marketplace installs qa-swarm from the new repo

**Files:** None (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1-5
- Produces: confirmation the migration works end-to-end — terminal task

- [ ] **Step 1: Refresh the local marketplace and update the plugin**

```bash
claude plugin marketplace update mistervitopro-plugin-marketplace
claude plugin update qa-swarm
```

Expected: no errors; the marketplace re-reads the edited `marketplace.json`.

- [ ] **Step 2: Confirm the installed plugin now resolves to the new source**

```bash
claude plugin list --json
```

Expected: the `qa-swarm@mistervitopro-plugin-marketplace` entry shows `"version": "1.4.1"` and an `installPath` that is a fresh cache directory (not referencing `D:\claude_plugins\qa-claude-market`).

- [ ] **Step 3: Confirm the skills still resolve**

Restart Claude Code (or start a fresh session) so the plugin cache reload takes effect, then run:
```
/qa-swarm:attack --help
```
(or equivalent no-op/help invocation)

Expected: the command is recognized and does not error with "unknown command" or "plugin not found".

- [ ] **Step 4: Final marketplace-wide validation**

```bash
cd /d/claude_plugins/qa-claude-market
claude plugin validate . --strict
```

Expected: same pre-existing warnings as Task 3/5 (missing `author` fields, unknown `metadata.repository`/`metadata.tags`), no new errors introduced by the qa-swarm change. `--strict` treats warnings as errors, so if this exits non-zero, confirm every failure is one of the pre-existing warnings already present before this migration (re-run without `--strict` to compare) rather than something the migration introduced.

- [ ] **Step 5: Report completion**

No commit — this task only verifies Tasks 1-5. If any step fails, stop and diagnose before considering the migration complete (do not paper over a failed install or validation error).
