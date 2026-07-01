# code-atlas Repo Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the `code-atlas` plugin out of the `qa-claude-market` monorepo into its own standalone public GitHub repo (`MisterVitoPro/code-atlas`), and repoint the marketplace at it, as cycle 2 of turning `qa-claude-market` into a thin marketplace registry (qa-swarm was cycle 1).

**Architecture:** Stage a fresh, history-free copy of `plugins/code-atlas/` as a new local repo, push it to a new GitHub repo, then update `qa-claude-market`'s `marketplace.json` to source code-atlas via the official `{"source": "url", ...}` git-source form instead of a local path, deleting the old in-repo copy and updating docs to match.

**Tech Stack:** git, GitHub CLI (`gh`), Claude Code plugin CLI (`claude plugin ...`), Node.js >= 18, Markdown, JSON.

## Global Constraints

- No git history is imported into the new repo — single fresh initial commit (per design decision).
- New repo tags use plain `v<version>` (no `code-atlas/` prefix — that prefix only disambiguates plugins sharing one repo).
- New GitHub repo is **public**.
- `plugins/code-atlas/` and its stale references are deleted from `qa-claude-market` only after the new repo is live and `marketplace.json` points at it — no transition period.
- Task 2 (repo creation + push) is a checkpoint: confirm with the user before running it. Everything before it is local-only and fully reversible; everything from Task 2 onward is not.
- Design reference: `docs/superpowers/specs/2026-07-01-code-atlas-repo-extraction-design.md`.

---

### Task 1: Stage the new code-atlas repo locally

**Files:**
- Create: `D:\claude_plugins\code-atlas\.claude-plugin\plugin.json` (copy, then edited)
- Create: `D:\claude_plugins\code-atlas\agents\*` (copy)
- Create: `D:\claude_plugins\code-atlas\skills\*` (copy)
- Create: `D:\claude_plugins\code-atlas\hooks\*` (copy)
- Create: `D:\claude_plugins\code-atlas\scripts\*` (copy)
- Create: `D:\claude_plugins\code-atlas\docs\*` (copy)
- Create: `D:\claude_plugins\code-atlas\test-fixtures\*` (copy)
- Create: `D:\claude_plugins\code-atlas\tests\*` (copy)
- Create: `D:\claude_plugins\code-atlas\LICENSE` (copy)
- Create: `D:\claude_plugins\code-atlas\README.md` (copy, then edited)

**Interfaces:**
- Consumes: `D:\claude_plugins\qa-claude-market\plugins\code-atlas\` (existing plugin content)
- Produces: a local git repo at `D:\claude_plugins\code-atlas` with one commit, tagged `v2.1.0` — consumed by Task 2 (push) and Task 3 (marketplace.json `url`/`ref`)

- [ ] **Step 1: Copy plugin content into the new repo directory**

```bash
mkdir -p /d/claude_plugins/code-atlas
cp -r /d/claude_plugins/qa-claude-market/plugins/code-atlas/.claude-plugin /d/claude_plugins/code-atlas/
cp -r /d/claude_plugins/qa-claude-market/plugins/code-atlas/agents /d/claude_plugins/code-atlas/
cp -r /d/claude_plugins/qa-claude-market/plugins/code-atlas/skills /d/claude_plugins/code-atlas/
cp -r /d/claude_plugins/qa-claude-market/plugins/code-atlas/hooks /d/claude_plugins/code-atlas/
cp -r /d/claude_plugins/qa-claude-market/plugins/code-atlas/scripts /d/claude_plugins/code-atlas/
cp -r /d/claude_plugins/qa-claude-market/plugins/code-atlas/docs /d/claude_plugins/code-atlas/
cp -r /d/claude_plugins/qa-claude-market/plugins/code-atlas/test-fixtures /d/claude_plugins/code-atlas/
cp -r /d/claude_plugins/qa-claude-market/plugins/code-atlas/tests /d/claude_plugins/code-atlas/
cp /d/claude_plugins/qa-claude-market/plugins/code-atlas/LICENSE /d/claude_plugins/code-atlas/
cp /d/claude_plugins/qa-claude-market/plugins/code-atlas/README.md /d/claude_plugins/code-atlas/
```

Expected: `ls /d/claude_plugins/code-atlas` shows `.claude-plugin`, `agents`, `skills`, `hooks`, `scripts`, `docs`, `test-fixtures`, `tests`, `LICENSE`, `README.md`.

- [ ] **Step 2: Update the copied `plugin.json`'s `repository` field**

Edit `D:\claude_plugins\code-atlas\.claude-plugin\plugin.json`:

Replace:
```json
  "repository": "https://github.com/MisterVitoPro/qa-claude-market"
```
With:
```json
  "repository": "https://github.com/MisterVitoPro/code-atlas"
```

- [ ] **Step 3: Fix the copied README's monorepo-relative test path**

Edit `D:\claude_plugins\code-atlas\README.md`:

Replace:
```
node --test plugins/code-atlas/tests/query.test.js
```
With:
```
node --test tests/query.test.js
```

- [ ] **Step 4: Validate the staged plugin manifest**

```bash
claude plugin validate /d/claude_plugins/code-atlas
```

Expected: `Validating plugin manifest: ...\code-atlas\.claude-plugin\plugin.json` followed by `Validation passed` (warnings about missing `author` are pre-existing and fine — every plugin in this marketplace has them).

- [ ] **Step 5: Run the plugin's own test suite in its new location**

```bash
cd /d/claude_plugins/code-atlas
node --test tests/query.test.js
```

Expected: all tests pass (same result as running it inside the monorepo before the copy).

- [ ] **Step 6: Init git, commit, and tag**

```bash
cd /d/claude_plugins/code-atlas
git init
git add .
git commit -m "$(cat <<'EOF'
Initial commit: extract code-atlas from qa-claude-market

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git tag v2.1.0
```

Expected: `git log --oneline` shows exactly one commit; `git tag` shows `v2.1.0`; `git symbolic-ref --short HEAD` shows `main`.

---

### Task 2: Create the GitHub repo and push — CONFIRM WITH USER FIRST

**This step is a checkpoint.** Everything in Task 1 is local and reversible (just delete `D:\claude_plugins\code-atlas`). This task creates a public GitHub repo and pushes to it — get explicit go-ahead before running it.

**Files:** None (no local file changes — remote-only).

**Interfaces:**
- Consumes: the local repo + `v2.1.0` tag from Task 1
- Produces: `https://github.com/MisterVitoPro/code-atlas` (public, `main` branch + `v2.1.0` tag pushed) and the commit SHA — both consumed by Task 3

- [ ] **Step 1: Confirm with the user, then create and push**

```bash
cd /d/claude_plugins/code-atlas
gh repo create MisterVitoPro/code-atlas --public --source=. --remote=origin \
  --description "Scan a codebase and generate a comprehensive architecture index with graph-schema and query capability — directory map, key files, tech stack, patterns, dependencies, build commands, and queryable knowledge graph"
git push -u origin main
git push origin v2.1.0
```

- [ ] **Step 2: Verify and capture the commit SHA**

```bash
gh repo view MisterVitoPro/code-atlas --json url,visibility
git ls-remote --tags origin
git rev-parse v2.1.0
```

Expected: `visibility` is `PUBLIC`; `git ls-remote --tags origin` lists `refs/tags/v2.1.0`; `git rev-parse v2.1.0` prints a 40-char SHA — record it, it's needed verbatim in Task 3.

---

### Task 3: Point `marketplace.json` at the new repo

**Files:**
- Modify: `D:\claude_plugins\qa-claude-market\.claude-plugin\marketplace.json`

**Interfaces:**
- Consumes: the GitHub URL, `v2.1.0` tag, and commit SHA from Task 2
- Produces: a `marketplace.json` where code-atlas's `source` is an external git source — consumed by Task 6 (install verification)

- [ ] **Step 1: Edit the code-atlas entry**

In `D:\claude_plugins\qa-claude-market\.claude-plugin\marketplace.json`, replace:
```json
    {
      "name": "code-atlas",
      "description": "Scan a codebase and generate an architecture index loaded at session start — directory map, key files, tech stack, patterns, build commands — plus a semantic dependency graph queryable deterministically via /code-atlas:query (impact analysis, blast radius, risk filters)",
      "source": "./plugins/code-atlas",
      "category": "development"
    },
```
With (substitute `<SHA>` with the value captured in Task 2, Step 2):
```json
    {
      "name": "code-atlas",
      "description": "Scan a codebase and generate an architecture index loaded at session start — directory map, key files, tech stack, patterns, build commands — plus a semantic dependency graph queryable deterministically via /code-atlas:query (impact analysis, blast radius, risk filters)",
      "source": {
        "source": "url",
        "url": "https://github.com/MisterVitoPro/code-atlas.git",
        "ref": "v2.1.0",
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
feat: source code-atlas from its own repo

code-atlas now lives at github.com/MisterVitoPro/code-atlas; marketplace.json
points there instead of the local plugins/code-atlas/ path.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Remove code-atlas's local copy from qa-claude-market

**Files:**
- Delete: `D:\claude_plugins\qa-claude-market\plugins\code-atlas\` (entire directory)
- Delete: `D:\claude_plugins\qa-claude-market\docs\master-spec\CONSOLIDATED-code-atlas.md`
- Modify: `D:\claude_plugins\qa-claude-market\docs\master-spec\consolidated-index.json`
- Modify: `D:\claude_plugins\qa-claude-market\.github\CODEOWNERS`

**Interfaces:**
- Consumes: Task 3's committed `marketplace.json` (must already point externally before deleting local code)
- Produces: a `qa-claude-market` repo with no local code-atlas files — consumed by Task 6 (confirms installs no longer resolve locally)

- [ ] **Step 1: Delete the old plugin directory and consolidated spec**

```bash
cd /d/claude_plugins/qa-claude-market
git rm -r plugins/code-atlas
git rm docs/master-spec/CONSOLIDATED-code-atlas.md
```

- [ ] **Step 2: Remove code-atlas from jupiter's consolidated-index.json**

`docs/master-spec/consolidated-index.json` still lists `docs/master-spec/CONSOLIDATED-code-atlas.md` (being deleted in Step 1) both in `consolidated_files` and as its own `buckets.code-atlas` entry — leaving them would dangle-reference a file that no longer exists.

In `D:\claude_plugins\qa-claude-market\docs\master-spec\consolidated-index.json`, replace:
```json
  "consolidated_files": [
    "docs/master-spec/CONSOLIDATED-code-atlas.md",
    "docs/master-spec/CONSOLIDATED-jupiter.md",
    "docs/master-spec/CONSOLIDATED-llm-wiki.md",
    "docs/master-spec/CONSOLIDATED-migration-runner.md",
    "docs/master-spec/CONSOLIDATED-plan-runner.md",
    "docs/master-spec/CONSOLIDATED-shared.md"
  ],
```
With:
```json
  "consolidated_files": [
    "docs/master-spec/CONSOLIDATED-jupiter.md",
    "docs/master-spec/CONSOLIDATED-llm-wiki.md",
    "docs/master-spec/CONSOLIDATED-migration-runner.md",
    "docs/master-spec/CONSOLIDATED-plan-runner.md",
    "docs/master-spec/CONSOLIDATED-shared.md"
  ],
```

Replace the entire `code-atlas` bucket (it is the first entry under `buckets`, immediately followed by the `jupiter` bucket):
```json
    "code-atlas": {
      "summary": "code-atlas / architecture / code-indexing",
      "source_file": "docs/master-spec/CONSOLIDATED-code-atlas.md",
      "sections": [
        {
          "anchor": "#readme",
          "original_path": "plugins/code-atlas/README.md",
          "heading": "## README",
          "line": 7,
          "loc": 90,
          "topics": [
            "architecture",
            "code-indexing",
            "dependency-graph",
            "code-atlas",
            "semantic-analysis",
            "repository-scanning"
          ]
        },
        {
          "anchor": "#query-language-reference",
          "original_path": "plugins/code-atlas/docs/query-language-reference.md",
          "heading": "## query-language-reference",
          "line": 101,
          "loc": 151,
          "topics": [
            "query-language",
            "code-atlas",
            "dependencies",
            "graph-querying",
            "syntax-reference"
          ]
        },
        {
          "anchor": "#schema-reference",
          "original_path": "plugins/code-atlas/docs/schema-reference.md",
          "heading": "## schema-reference",
          "line": 256,
          "loc": 223,
          "topics": [
            "schema",
            "code-atlas",
            "artifact-specification",
            "json-schema",
            "metadata"
          ]
        }
      ],
      "gaps_count": 10
    },
```
With nothing (delete it — leave the opening `"buckets": {` immediately followed by the `"jupiter": {` bucket).

Then update the total line count, which included code-atlas's 496 LOC (`docs/master-spec/CONSOLIDATED-code-atlas.md`'s total line count, not just the sum of its sections' `loc`):
```json
  "total_loc": 7174,
```
With:
```json
  "total_loc": 6678,
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
/plugins/code-atlas/ @MisterVitoPro
/plugins/plan-runner/ @MisterVitoPro
```
With:
```
# Plugin-specific owners
/plugins/plan-runner/ @MisterVitoPro
```

- [ ] **Step 4: Verify nothing local still references code-atlas's old path**

```bash
grep -rn "plugins/code-atlas" --include="*.md" --include="*.json" --include="*.yml" . || echo "no matches"
ls plugins/ | grep -x code-atlas || echo "code-atlas directory gone"
```

Expected: matches only inside `docs/superpowers/` planning/spec files and `plugins/jupiter/schemas/examples/*.json` (illustrative fixture data, unrelated to the real repo state — same as the pre-existing `plugins/qa-swarm` mentions left in those same example files after qa-swarm's own extraction), and `code-atlas directory gone`.

- [ ] **Step 5: Commit**

```bash
git add .github/CODEOWNERS docs/master-spec/consolidated-index.json
git commit -m "$(cat <<'EOF'
chore: remove code-atlas's local copy

code-atlas now lives at github.com/MisterVitoPro/code-atlas (see previous
commit); the local plugins/code-atlas/ copy, its consolidated spec, and
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
### code-atlas  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-claude-market%2Fmain%2Fplugins%2Fcode-atlas%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)
```
With:
```
### code-atlas  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fcode-atlas%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)
```

Replace:
```
→ [Plugin docs](plugins/code-atlas/README.md)
```
With:
```
→ [Plugin docs](https://github.com/MisterVitoPro/code-atlas)
```

Replace:
```
3. Tag releases as `<plugin-name>/v<version>` (e.g. `code-atlas/v2.1.0`) and push the tag — Claude Code uses tags as the version cache key. Plugins sourced from their own repo (e.g. `qa-swarm`) instead tag plain `v<version>` in that repo, then bump `ref`/`sha` on the plugin's `source` entry in this repo's `marketplace.json`.
```
With:
```
3. Tag releases as `<plugin-name>/v<version>` (e.g. `plan-runner/v1.5.0`) and push the tag — Claude Code uses tags as the version cache key. Plugins sourced from their own repo (e.g. `qa-swarm`, `code-atlas`) instead tag plain `v<version>` in that repo, then bump `ref`/`sha` on the plugin's `source` entry in this repo's `marketplace.json`.
```

- [ ] **Step 2: Update `CLAUDE.md`**

Replace:
```
| `code-atlas` | 2.1.0 | Architecture index generator with semantic graph -- writes .code-atlas/atlas.json, state.json, and graph-schema.json, loaded by session-start hook. Deterministic graph queries + validation via bundled scripts/query.js (/code-atlas:query). Directory map, tech stack, patterns, dependencies. |
```
With:
```
| `code-atlas` | 2.1.0 | Architecture index generator with semantic graph -- writes .code-atlas/atlas.json, state.json, and graph-schema.json, loaded by session-start hook. Deterministic graph queries + validation via bundled scripts/query.js (/code-atlas:query). Directory map, tech stack, patterns, dependencies. Sourced externally from [github.com/MisterVitoPro/code-atlas](https://github.com/MisterVitoPro/code-atlas). |
```

Replace:
```
.claude-plugin/marketplace.json              # central registry -- qa-swarm sourced externally (github.com/MisterVitoPro/qa-swarm)
plugins/
  code-atlas/.claude-plugin/plugin.json      # manifest (v2.1.0)
  plan-runner/.claude-plugin/plugin.json     # manifest (v1.5.0)
  jupiter/.claude-plugin/plugin.json         # manifest (v0.1.1)
  migration-runner/.claude-plugin/plugin.json # manifest (v0.1.0)
  llm-wiki/.claude-plugin/plugin.json         # manifest (v0.1.0)
```
With:
```
.claude-plugin/marketplace.json              # central registry -- qa-swarm and code-atlas sourced externally (github.com/MisterVitoPro/qa-swarm, github.com/MisterVitoPro/code-atlas)
plugins/
  plan-runner/.claude-plugin/plugin.json     # manifest (v1.5.0)
  jupiter/.claude-plugin/plugin.json         # manifest (v0.1.1)
  migration-runner/.claude-plugin/plugin.json # manifest (v0.1.0)
  llm-wiki/.claude-plugin/plugin.json         # manifest (v0.1.0)
```

Replace:
```
plugins/                    # Root directory containing local plugins (qa-swarm lives externally -- github.com/MisterVitoPro/qa-swarm)
  code-atlas/               # Architecture index generator with semantic graph (v2.1.0)
    .claude-plugin/         # Plugin manifest and metadata
    agents/                 # 4 analysis agents (structure, patterns, dependencies, graph synthesizer)
    skills/                 # User-facing commands: map (full scan), update (incremental), query (graph interrogation)
    scripts/                # session-start.js (hook) + query.js (deterministic graph query/validation runtime)
    docs/                   # schema-reference.md, query-language-reference.md
    test-fixtures/          # Validated reference graph-schema example
    tests/                  # node --test suite for the query runtime
    hooks/                  # SessionStart hook for auto-staleness detection
  plan-runner/                # Plan-driven parallel agent orchestrator (v1.5.0)
```
With:
```
plugins/                    # Root directory containing local plugins (qa-swarm, code-atlas live externally -- github.com/MisterVitoPro/qa-swarm, github.com/MisterVitoPro/code-atlas)
  plan-runner/                # Plan-driven parallel agent orchestrator (v1.5.0)
```

- [ ] **Step 3: Validate and commit**

```bash
cd /d/claude_plugins/qa-claude-market
claude plugin validate .
git add README.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: document code-atlas's external-repo sourcing

Update README and CLAUDE.md to reflect code-atlas living at its own repo:
badge URL, plugin docs link, directory map, key files, and the
local-vs-external versioning convention (now with two examples).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Verify the marketplace installs code-atlas from the new repo

**Files:** None (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1-5
- Produces: confirmation the migration works end-to-end — terminal task

- [ ] **Step 1: Refresh the local marketplace and update the plugin**

```bash
claude plugin marketplace update mistervitopro-plugin-marketplace
claude plugin update code-atlas
```

Expected: no errors; the marketplace re-reads the edited `marketplace.json`.

- [ ] **Step 2: Confirm the installed plugin now resolves to the new source**

```bash
claude plugin list --json
```

Expected: the `code-atlas@mistervitopro-plugin-marketplace` entry shows `"version": "2.1.0"` and an `installPath` that is a fresh cache directory (not referencing `D:\claude_plugins\qa-claude-market`).

- [ ] **Step 3: Confirm the skills and hook still resolve**

Restart Claude Code (or start a fresh session) so the plugin cache reload takes effect, then run:
```
/code-atlas:query {"operation":"filter","conditions":{}}
```
(or equivalent no-op/help invocation for `/code-atlas:map` and `/code-atlas:update`)

Expected: the commands are recognized and do not error with "unknown command" or "plugin not found". The `SessionStart` hook (`node "${CLAUDE_PLUGIN_ROOT}/scripts/session-start.js"`) should also run silently without error on the next session start, since `${CLAUDE_PLUGIN_ROOT}` resolves correctly regardless of install location.

- [ ] **Step 4: Final marketplace-wide validation**

```bash
cd /d/claude_plugins/qa-claude-market
claude plugin validate . --strict
```

Expected: same pre-existing warnings as Task 3/5 (missing `author` fields, unknown `metadata.repository`/`metadata.tags`), no new errors introduced by the code-atlas change. `--strict` treats warnings as errors, so if this exits non-zero, confirm every failure is one of the pre-existing warnings already present before this migration (re-run without `--strict` to compare) rather than something the migration introduced.

- [ ] **Step 5: Report completion**

No commit — this task only verifies Tasks 1-5. If any step fails, stop and diagnose before considering the migration complete (do not paper over a failed install or validation error).
