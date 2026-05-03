# migration-runner v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `migration-runner` Claude Code plugin from scratch — vulnerability-aware dependency upgrade orchestrator across 7 ecosystems (npm, Python, Go, Rust, Java, Kotlin, C#), with `detect` and `run` skills, four agents, seven ecosystem adapters, four shared scripts, and a SessionStart hook.

**Architecture:** Markdown skills + agents drive control flow (matching plan-runner pattern). Agents invoke Node.js scripts via Bash for shelling out to native package-manager CLIs, querying OSV.dev, ranking versions, and managing git state. JSON contracts mediate every agent boundary.

**Tech Stack:**
- Plugin authoring: Markdown + JSON manifests
- Scripts: Node.js (Node 20+ for built-in fetch and `node:test`)
- Tests: `node --test` (built-in test runner, zero dependencies)
- Vuln source: OSV.dev `querybatch` HTTP API
- Registry queries: each ecosystem's native HTTP API (npm registry, PyPI, crates.io, Go proxy, Maven Central, NuGet)

---

## Ground rules

1. **Spec deviation — config format:** spec §10 calls for `.migration-runner.yml`. v0.1 uses **`.migration-runner.json`** instead, to avoid shipping a YAML-parser runtime dependency. Same fields, JSON syntax. Documented in the README. Revisit in v0.2.
2. **Test fixtures use captured CLI output.** Each adapter ships `test-fixtures/<ecosystem>/sample-outdated.json` (real `--json` output captured once from the live CLI). Tests mock `child_process.execSync` to return those fixtures. This means the test suite runs on any machine without requiring all 7 toolchains installed.
3. **Live integration tests are gated.** Tests that actually invoke the live native CLI are skipped unless `MIGRATION_RUNNER_LIVE=1` is set. Default test runs are pure-parser tests.
4. **Every script is a CLI tool** that takes subcommands. Agents invoke them via Bash. No long-running processes, no daemons.
5. **Frequent commits.** Every task ends with a git commit. The plan covers 23 tasks → 23 commits on the implementation branch.
6. **TDD where the unit is testable.** Pure-logic scripts (ranker, state, osv-client, adapters) are TDD'd. Markdown agents/skills are written, smoke-tested against a fixture, and committed (no unit tests apply to LLM prompts).

---

## File map

```
plugins/migration-runner/
  .claude-plugin/
    plugin.json                          # Task 1
  agents/
    migration-detector.md                # Task 14
    migration-planner.md                 # Task 15
    migration-applier.md                 # Task 16
    migration-verifier.md                # Task 17
  skills/
    detect/SKILL.md                      # Task 18
    run/SKILL.md                         # Task 19
  scripts/
    adapter.js                           # Task 7 (CLI dispatcher)
    adapters/
      npm.js                             # Task 7
      python.js                          # Task 8
      go.js                              # Task 9
      rust.js                            # Task 10
      java.js                            # Task 11
      kotlin.js                          # Task 12
      csharp.js                          # Task 13
    osv-client.js                        # Task 5
    version-ranker.js                    # Task 4
    state.js                             # Task 6
    git-helpers.js                       # Task 6
    session-start.js                     # Task 2
  schemas/
    plan.schema.json                     # Task 3
    state.schema.json                    # Task 3
    detector-output.schema.json          # Task 3
    applier-output.schema.json           # Task 3
    verifier-output.schema.json          # Task 3
  hooks/
    hooks.json                           # Task 2
  test-fixtures/
    npm/                                 # Task 7
    python/                              # Task 8
    go/                                  # Task 9
    rust/                                # Task 10
    java/                                # Task 11
    kotlin/                              # Task 12
    csharp/                              # Task 13
  tests/
    version-ranker.test.js               # Task 4
    osv-client.test.js                   # Task 5
    state.test.js                        # Task 6
    git-helpers.test.js                  # Task 6
    adapters/
      npm.test.js                        # Task 7
      python.test.js                     # Task 8
      go.test.js                         # Task 9
      rust.test.js                       # Task 10
      java.test.js                       # Task 11
      kotlin.test.js                     # Task 12
      csharp.test.js                     # Task 13
    e2e/
      happy-path.test.js                 # Task 20
      failure-path.test.js               # Task 21
  docs/
    2026-05-03-migration-runner-design.md         (existing)
    2026-05-03-migration-runner-implementation-plan.md  (this file)
  README.md                              # Task 22
  LICENSE                                # Task 1
```

Touched files outside the plugin:
- `.claude-plugin/marketplace.json`     # Task 23 (register the new plugin)
- `CLAUDE.md`                           # Task 23 (update plugin table + version row)
- `README.md` (root)                    # Task 23 (add migration-runner section)

---

## Task 1: Plugin scaffolding

**Files:**
- Create: `plugins/migration-runner/.claude-plugin/plugin.json`
- Create: `plugins/migration-runner/LICENSE`
- Create: `plugins/migration-runner/README.md` (stub; full content in Task 22)

- [ ] **Step 1: Create the plugin manifest**

Write `plugins/migration-runner/.claude-plugin/plugin.json`:

```json
{
  "name": "migration-runner",
  "description": "Vulnerability-aware dependency upgrade orchestrator. Detects outdated packages across npm, Python, Go, Rust, Java, Kotlin, and C# ecosystems; recommends the safest-yet-most-recent version per package using OSV.dev; executes upgrades wave-by-wave with build/typecheck/test verification and clean git rollback on failure.",
  "version": "0.1.0",
  "license": "MIT",
  "keywords": [
    "dependency-management",
    "vulnerability-scanning",
    "package-upgrade",
    "osv",
    "supply-chain-security",
    "multi-ecosystem",
    "npm",
    "python",
    "go",
    "rust",
    "maven",
    "gradle",
    "nuget",
    "developer-tools"
  ],
  "repository": "https://github.com/MisterVitoPro/qa-claude-market"
}
```

- [ ] **Step 2: Copy the LICENSE from another plugin**

Run:
```bash
cp plugins/qa-swarm/LICENSE plugins/migration-runner/LICENSE
```

- [ ] **Step 3: Create stub README**

Write `plugins/migration-runner/README.md`:

```markdown
# migration-runner

Vulnerability-aware dependency upgrade orchestrator across 7 ecosystems. See [docs/2026-05-03-migration-runner-design.md](docs/2026-05-03-migration-runner-design.md) for the design spec.

Full README populated in Task 22 of the implementation plan.
```

- [ ] **Step 4: Validate JSON manifest parses**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('plugins/migration-runner/.claude-plugin/plugin.json','utf8')); console.log('OK')"
```
Expected output: `OK`

- [ ] **Step 5: Commit**

```bash
git add plugins/migration-runner/.claude-plugin/plugin.json plugins/migration-runner/LICENSE plugins/migration-runner/README.md
git commit -m "feat(migration-runner): scaffold plugin manifest, LICENSE, README stub"
```

---

## Task 2: SessionStart hook (gitignore .migration-runner/)

**Files:**
- Create: `plugins/migration-runner/hooks/hooks.json`
- Create: `plugins/migration-runner/scripts/session-start.js`

- [ ] **Step 1: Write the hook configuration**

Write `plugins/migration-runner/hooks/hooks.json`:

```json
{
  "description": "migration-runner SessionStart hook: ensures .migration-runner/ is in .gitignore so cache, state, and logs are not committed.",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/session-start.js\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Write the session-start script**

Write `plugins/migration-runner/scripts/session-start.js`:

```js
#!/usr/bin/env node
// migration-runner SessionStart hook.
// If .gitignore exists in CWD and does not contain ".migration-runner/", append it.
// Exits silently on any failure.

const fs = require("fs");
const path = require("path");

const GITIGNORE = path.join(process.cwd(), ".gitignore");
const ENTRY = ".migration-runner/";

try {
  if (!fs.existsSync(GITIGNORE)) {
    process.exit(0);
  }
  const contents = fs.readFileSync(GITIGNORE, "utf8");
  if (contents.split(/\r?\n/).some((line) => line.trim() === ENTRY)) {
    process.exit(0);
  }
  const lead = contents.length > 0 && !contents.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(GITIGNORE, `${lead}${ENTRY}\n`);
  process.exit(0);
} catch {
  process.exit(0);
}
```

- [ ] **Step 3: Validate JS syntax**

Run:
```bash
node --check plugins/migration-runner/scripts/session-start.js
```
Expected output: (no output, exit code 0)

- [ ] **Step 4: Smoke-test in a temp dir**

Run:
```bash
mkdir -p /tmp/mr-test && cd /tmp/mr-test && printf 'node_modules\n' > .gitignore && node D:/claude_plugins/qa-claude-market/plugins/migration-runner/scripts/session-start.js && cat .gitignore
```
Expected output:
```
node_modules
.migration-runner/
```

Run again to verify idempotency:
```bash
cd /tmp/mr-test && node D:/claude_plugins/qa-claude-market/plugins/migration-runner/scripts/session-start.js && cat .gitignore
```
Expected output: same as above (no duplicate line).

- [ ] **Step 5: Commit**

```bash
git add plugins/migration-runner/hooks/hooks.json plugins/migration-runner/scripts/session-start.js
git commit -m "feat(migration-runner): add SessionStart hook to gitignore .migration-runner/"
```

---

## Task 3: JSON schemas

**Files:**
- Create: `plugins/migration-runner/schemas/plan.schema.json`
- Create: `plugins/migration-runner/schemas/state.schema.json`
- Create: `plugins/migration-runner/schemas/detector-output.schema.json`
- Create: `plugins/migration-runner/schemas/applier-output.schema.json`
- Create: `plugins/migration-runner/schemas/verifier-output.schema.json`

- [ ] **Step 1: Write `plan.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "migration-runner plan.json",
  "type": "object",
  "required": ["schema_version", "generated_at", "soak_days", "allow_major", "waves", "available_majors"],
  "properties": {
    "schema_version": { "const": "1.0" },
    "generated_at": { "type": "string", "format": "date-time" },
    "soak_days": { "type": "integer", "minimum": 0 },
    "allow_major": { "type": "boolean" },
    "waves": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["wave_index", "ecosystem", "manifest_path", "package", "from_version", "to_version", "risk", "rationale", "depends_on_waves"],
        "properties": {
          "wave_index": { "type": "integer", "minimum": 1 },
          "ecosystem": { "enum": ["npm", "python", "go", "rust", "java", "kotlin", "csharp"] },
          "manifest_path": { "type": "string" },
          "package": { "type": "string" },
          "from_version": { "type": "string" },
          "to_version": { "type": "string" },
          "risk": { "enum": ["normal", "elevated", "major-required"] },
          "rationale": { "type": "string" },
          "depends_on_waves": { "type": "array", "items": { "type": "integer" } }
        }
      }
    },
    "available_majors": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["ecosystem", "package", "from_version", "to_version", "rationale"],
        "properties": {
          "ecosystem": { "type": "string" },
          "package": { "type": "string" },
          "from_version": { "type": "string" },
          "to_version": { "type": "string" },
          "rationale": { "type": "string" }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Write `state.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "migration-runner state.json",
  "type": "object",
  "required": ["plan_generated_at", "waves"],
  "properties": {
    "plan_generated_at": { "type": "string", "format": "date-time" },
    "waves": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["wave_index", "package", "status"],
        "properties": {
          "wave_index": { "type": "integer", "minimum": 1 },
          "package": { "type": "string" },
          "status": { "enum": ["pending", "completed", "failed"] },
          "commit_sha": { "type": "string" },
          "verifier_log": { "type": "string" }
        }
      }
    }
  }
}
```

- [ ] **Step 3: Write `detector-output.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "migration-detector agent output",
  "type": "object",
  "required": ["ecosystem", "manifest_path", "outdated"],
  "properties": {
    "ecosystem": { "enum": ["npm", "python", "go", "rust", "java", "kotlin", "csharp"] },
    "manifest_path": { "type": "string" },
    "outdated": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "current"],
        "properties": {
          "name": { "type": "string" },
          "current": { "type": "string" },
          "latest_known": { "type": "string" }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Write `applier-output.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "migration-applier agent output",
  "type": "object",
  "required": ["status"],
  "properties": {
    "status": { "enum": ["applied", "failed"] },
    "stderr": { "type": "string" }
  }
}
```

- [ ] **Step 5: Write `verifier-output.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "migration-verifier agent output",
  "type": "object",
  "required": ["status"],
  "properties": {
    "status": { "enum": ["pass", "fail"] },
    "failed_step": { "enum": ["build", "typecheck", "test", null] },
    "stdout_tail": { "type": "string" },
    "full_output_path": { "type": "string" }
  }
}
```

- [ ] **Step 6: Validate all five schemas parse**

Run:
```bash
node -e "['plan','state','detector-output','applier-output','verifier-output'].forEach(n=>JSON.parse(require('fs').readFileSync('plugins/migration-runner/schemas/'+n+'.schema.json','utf8'))); console.log('OK')"
```
Expected output: `OK`

- [ ] **Step 7: Commit**

```bash
git add plugins/migration-runner/schemas/
git commit -m "feat(migration-runner): add JSON schemas for plan, state, and agent outputs"
```

---

## Task 4: version-ranker.js + tests

**Files:**
- Create: `plugins/migration-runner/scripts/version-ranker.js`
- Create: `plugins/migration-runner/tests/version-ranker.test.js`

- [ ] **Step 1: Write the failing tests**

Write `plugins/migration-runner/tests/version-ranker.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { recommend } = require("../scripts/version-ranker.js");

const NOW = new Date("2026-05-03T00:00:00Z");
const days = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

test("recommend: picks latest in same major with no HIGH/CRITICAL CVE and >=14d soak", () => {
  const out = recommend({
    currentVersion: "1.6.0",
    candidates: [
      { version: "1.7.4", released_at: days(3) },   // too fresh
      { version: "1.7.3", released_at: days(20) },  // has CVE
      { version: "1.7.2", released_at: days(40) },  // winner
      { version: "1.6.5", released_at: days(90) },
    ],
    vulnsByVersion: {
      "1.7.3": [{ id: "CVE-2026-5678", severity: "HIGH" }],
    },
    opts: { soak_days: 14, allow_major: false, now: NOW },
  });
  assert.equal(out.target, "1.7.2");
  assert.equal(out.risk, "normal");
  assert.match(out.rationale, /1\.7\.2/);
  assert.equal(out.skipped.find((s) => s.version === "1.7.4").reason.includes("soak"), true);
  assert.equal(out.skipped.find((s) => s.version === "1.7.3").reason.includes("HIGH"), true);
});

test("recommend: elevated risk when no clean version exists in major", () => {
  const out = recommend({
    currentVersion: "1.0.0",
    candidates: [
      { version: "1.2.0", released_at: days(30) },
      { version: "1.1.0", released_at: days(60) },
    ],
    vulnsByVersion: {
      "1.2.0": [{ id: "CVE-A", severity: "CRITICAL" }],
      "1.1.0": [{ id: "CVE-A", severity: "CRITICAL" }, { id: "CVE-B", severity: "HIGH" }],
    },
    opts: { soak_days: 14, allow_major: false, now: NOW },
  });
  assert.equal(out.target, "1.2.0");
  assert.equal(out.risk, "elevated");
  assert.match(out.rationale, /CVE-A/);
});

test("recommend: with allow_major, considers cross-major candidates", () => {
  const out = recommend({
    currentVersion: "1.5.0",
    candidates: [
      { version: "2.0.0", released_at: days(30) },
      { version: "1.6.0", released_at: days(60) },
    ],
    vulnsByVersion: {},
    opts: { soak_days: 14, allow_major: true, now: NOW },
  });
  assert.equal(out.target, "2.0.0");
  assert.equal(out.risk, "normal");
});

test("recommend: without allow_major, surfaces majors separately and picks within current major", () => {
  const out = recommend({
    currentVersion: "1.5.0",
    candidates: [
      { version: "2.0.0", released_at: days(30) },
      { version: "1.6.0", released_at: days(60) },
    ],
    vulnsByVersion: {},
    opts: { soak_days: 14, allow_major: false, now: NOW },
  });
  assert.equal(out.target, "1.6.0");
  assert.equal(out.risk, "normal");
});

test("recommend: returns null target when no candidates >= current", () => {
  const out = recommend({
    currentVersion: "1.7.0",
    candidates: [
      { version: "1.6.0", released_at: days(30) },
    ],
    vulnsByVersion: {},
    opts: { soak_days: 14, allow_major: false, now: NOW },
  });
  assert.equal(out.target, null);
  assert.equal(out.risk, "normal");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd plugins/migration-runner && node --test tests/version-ranker.test.js
```
Expected: failures with `Cannot find module '../scripts/version-ranker.js'`.

- [ ] **Step 3: Implement `version-ranker.js`**

Write `plugins/migration-runner/scripts/version-ranker.js`:

```js
"use strict";

// Compare two semver-ish strings: returns -1, 0, or 1.
// Tolerates non-semver tails (e.g., "1.2.3-rc.1" sorts before "1.2.3").
function cmp(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa.parts[i] !== pb.parts[i]) return pa.parts[i] < pb.parts[i] ? -1 : 1;
  }
  // pre-release: anything with a tail is "less than" the same version without one
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && pb.pre) return pa.pre < pb.pre ? -1 : pa.pre > pb.pre ? 1 : 0;
  return 0;
}

function parseSemver(v) {
  const s = String(v).replace(/^[v=]+/, "");
  const m = s.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+](.+))?$/);
  if (!m) return { parts: [0, 0, 0], pre: s };
  return {
    parts: [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)],
    pre: m[4] || null,
  };
}

function majorOf(v) {
  return parseSemver(v).parts[0];
}

function isHighOrCritical(severity) {
  const s = String(severity || "").toUpperCase();
  return s === "HIGH" || s === "CRITICAL";
}

function ageDays(releasedAt, now) {
  const t = new Date(releasedAt).getTime();
  if (Number.isNaN(t)) return Infinity; // unknown date treated as old
  return Math.floor((now.getTime() - t) / 86400000);
}

function recommend({ currentVersion, candidates, vulnsByVersion, opts }) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const soak = opts.soak_days ?? 14;
  const allowMajor = !!opts.allow_major;

  const eligible = candidates
    .filter((c) => cmp(c.version, currentVersion) > 0)
    .sort((a, b) => cmp(b.version, a.version)); // newest first

  const currentMajor = majorOf(currentVersion);
  const sameMajor = eligible.filter((c) => majorOf(c.version) === currentMajor);
  const crossMajor = eligible.filter((c) => majorOf(c.version) > currentMajor);

  const skipped = [];

  function findClean(list) {
    for (const cand of list) {
      const vulns = (vulnsByVersion[cand.version] || []).filter((v) => isHighOrCritical(v.severity));
      const age = ageDays(cand.released_at, now);
      if (vulns.length > 0) {
        skipped.push({ version: cand.version, reason: `unfixed ${vulns[0].severity} vuln ${vulns[0].id}` });
        continue;
      }
      if (age < soak) {
        skipped.push({ version: cand.version, reason: `released ${age}d ago, below ${soak}d soak floor` });
        continue;
      }
      return { cand, fixedAtLeastOne: true };
    }
    return null;
  }

  function pickFewestVulns(list) {
    let best = null;
    let bestCount = Infinity;
    let bestVulns = [];
    for (const cand of list) {
      const vulns = (vulnsByVersion[cand.version] || []).filter((v) => isHighOrCritical(v.severity));
      if (vulns.length < bestCount) {
        best = cand;
        bestCount = vulns.length;
        bestVulns = vulns;
      }
    }
    return { cand: best, vulns: bestVulns };
  }

  if (allowMajor) {
    const all = [...crossMajor, ...sameMajor].sort((a, b) => cmp(b.version, a.version));
    const clean = findClean(all);
    if (clean) {
      return {
        target: clean.cand.version,
        rationale: `latest with ${ageDays(clean.cand.released_at, now)}d soak; no unfixed HIGH/CRITICAL CVEs (allow_major)`,
        risk: "normal",
        skipped,
      };
    }
    const fallback = pickFewestVulns(all);
    if (fallback.cand) {
      const cves = fallback.vulns.map((v) => v.id).join(", ");
      return {
        target: fallback.cand.version,
        rationale: `fewest unfixed HIGH/CRITICAL vulns available: ${cves || "none specifically tagged"}`,
        risk: "elevated",
        skipped,
      };
    }
    return { target: null, rationale: "no candidates above current version", risk: "normal", skipped };
  }

  // allow_major === false
  const cleanSame = findClean(sameMajor);
  if (cleanSame) {
    return {
      target: cleanSame.cand.version,
      rationale: `latest in ${currentMajor}.x with ${ageDays(cleanSame.cand.released_at, now)}d soak; no unfixed HIGH/CRITICAL CVEs`,
      risk: "normal",
      skipped,
    };
  }
  if (sameMajor.length > 0) {
    const fallback = pickFewestVulns(sameMajor);
    const cves = fallback.vulns.map((v) => v.id).join(", ");
    return {
      target: fallback.cand.version,
      rationale: `no clean version in ${currentMajor}.x; picking fewest unfixed HIGH/CRITICAL: ${cves || "none specifically tagged"}`,
      risk: "elevated",
      skipped,
    };
  }
  // No same-major candidates at all
  return { target: null, rationale: "no in-major candidates; pass --allow-major to consider major bumps", risk: "normal", skipped };
}

module.exports = { recommend, cmp, parseSemver, majorOf };

// CLI: node version-ranker.js recommend <input.json>
if (require.main === module) {
  const sub = process.argv[2];
  const arg = process.argv[3];
  if (sub === "recommend" && arg) {
    const input = JSON.parse(require("fs").readFileSync(arg, "utf8"));
    process.stdout.write(JSON.stringify(recommend(input)));
  } else {
    process.stderr.write("usage: version-ranker.js recommend <input.json>\n");
    process.exit(2);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd plugins/migration-runner && node --test tests/version-ranker.test.js
```
Expected: all 5 tests pass; `tests 5`, `pass 5`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add plugins/migration-runner/scripts/version-ranker.js plugins/migration-runner/tests/version-ranker.test.js
git commit -m "feat(migration-runner): version-ranker with same-major preference and major opt-in"
```

---

## Task 5: osv-client.js + tests

**Files:**
- Create: `plugins/migration-runner/scripts/osv-client.js`
- Create: `plugins/migration-runner/tests/osv-client.test.js`

- [ ] **Step 1: Write the failing tests**

Write `plugins/migration-runner/tests/osv-client.test.js`:

```js
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ORIG_FETCH = global.fetch;
let TMPDIR;

before(() => {
  TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), "osv-test-"));
  process.env.MIGRATION_RUNNER_CACHE_DIR = TMPDIR;
});
after(() => {
  global.fetch = ORIG_FETCH;
  delete process.env.MIGRATION_RUNNER_CACHE_DIR;
  fs.rmSync(TMPDIR, { recursive: true, force: true });
});

test("queryBatch: posts a batch query and returns parsed results", async () => {
  let captured;
  global.fetch = async (url, init) => {
    captured = { url, body: JSON.parse(init.body) };
    return {
      ok: true,
      json: async () => ({
        results: [
          { vulns: [{ id: "GHSA-aaa", database_specific: { severity: "HIGH" }, summary: "test" }] },
          { vulns: [] },
        ],
      }),
    };
  };
  const { queryBatch } = require("../scripts/osv-client.js");
  const res = await queryBatch([
    { ecosystem: "npm", name: "lodash", version: "4.17.20" },
    { ecosystem: "npm", name: "axios", version: "1.7.2" },
  ]);
  assert.equal(captured.url, "https://api.osv.dev/v1/querybatch");
  assert.equal(captured.body.queries.length, 2);
  assert.equal(captured.body.queries[0].package.name, "lodash");
  assert.equal(captured.body.queries[0].package.ecosystem, "npm");
  assert.equal(res.length, 2);
  assert.equal(res[0].vulns[0].severity, "HIGH");
  assert.equal(res[1].vulns.length, 0);
});

test("queryBatch: maps PyPI/Go ecosystem names to OSV format", async () => {
  let captured;
  global.fetch = async (_, init) => {
    captured = JSON.parse(init.body);
    return { ok: true, json: async () => ({ results: [{ vulns: [] }, { vulns: [] }] }) };
  };
  const { queryBatch } = require("../scripts/osv-client.js");
  await queryBatch([
    { ecosystem: "python", name: "requests", version: "2.0.0" },
    { ecosystem: "go", name: "golang.org/x/text", version: "v0.3.0" },
  ]);
  assert.equal(captured.queries[0].package.ecosystem, "PyPI");
  assert.equal(captured.queries[1].package.ecosystem, "Go");
});

test("queryBatch: caches identical queries", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return { ok: true, json: async () => ({ results: [{ vulns: [] }] }) };
  };
  delete require.cache[require.resolve("../scripts/osv-client.js")];
  const { queryBatch } = require("../scripts/osv-client.js");
  const q = [{ ecosystem: "npm", name: "left-pad", version: "1.0.0" }];
  await queryBatch(q);
  await queryBatch(q);
  assert.equal(calls, 1, "second call should hit cache");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd plugins/migration-runner && node --test tests/osv-client.test.js
```
Expected: failures with `Cannot find module`.

- [ ] **Step 3: Implement `osv-client.js`**

Write `plugins/migration-runner/scripts/osv-client.js`:

```js
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const OSV_URL = "https://api.osv.dev/v1/querybatch";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Map our ecosystem identifiers to OSV.dev's expected names.
const ECO_MAP = {
  npm: "npm",
  python: "PyPI",
  go: "Go",
  rust: "crates.io",
  java: "Maven",
  kotlin: "Maven",
  csharp: "NuGet",
};

function cacheDir() {
  return process.env.MIGRATION_RUNNER_CACHE_DIR || path.join(process.cwd(), ".migration-runner", "cache");
}

function ensureCacheDir() {
  fs.mkdirSync(cacheDir(), { recursive: true });
}

function cacheKey(queries) {
  const norm = JSON.stringify(queries.map((q) => [q.package.ecosystem, q.package.name, q.version]).sort());
  return crypto.createHash("sha256").update(norm).digest("hex");
}

function cachePath(key) {
  return path.join(cacheDir(), `osv-${key}.json`);
}

function readCache(key) {
  const p = cachePath(key);
  if (!fs.existsSync(p)) return null;
  const stat = fs.statSync(p);
  if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  ensureCacheDir();
  const tmp = cachePath(key) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, cachePath(key));
}

function normalizeSeverity(vuln) {
  // Prefer database_specific.severity (GitHub-style HIGH/CRITICAL).
  if (vuln.database_specific && vuln.database_specific.severity) {
    return String(vuln.database_specific.severity).toUpperCase();
  }
  // Fall back to deriving from CVSS.
  const sev = (vuln.severity || []).find((s) => s.type && s.score);
  if (sev) {
    const score = parseFloat(String(sev.score).replace(/^CVSS:\d\.\d\//, "").replace(/.*\b(\d+(\.\d+)?)\b.*/, "$1"));
    if (Number.isFinite(score)) {
      if (score >= 9) return "CRITICAL";
      if (score >= 7) return "HIGH";
      if (score >= 4) return "MEDIUM";
      return "LOW";
    }
  }
  return "UNKNOWN";
}

async function queryBatch(items) {
  // items: [{ ecosystem, name, version }]
  const queries = items.map((it) => ({
    package: { name: it.name, ecosystem: ECO_MAP[it.ecosystem] || it.ecosystem },
    version: it.version,
  }));
  const key = cacheKey(queries);
  const cached = readCache(key);
  if (cached) return cached;

  const resp = await fetch(OSV_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ queries }),
  });
  if (!resp.ok) {
    throw new Error(`OSV.dev returned ${resp.status}`);
  }
  const data = await resp.json();
  const results = (data.results || []).map((r) => ({
    vulns: (r.vulns || []).map((v) => ({
      id: v.id,
      severity: normalizeSeverity(v),
      summary: v.summary || "",
    })),
  }));
  writeCache(key, results);
  return results;
}

module.exports = { queryBatch };

if (require.main === module) {
  (async () => {
    const sub = process.argv[2];
    if (sub === "query") {
      const stdin = fs.readFileSync(0, "utf8");
      const items = JSON.parse(stdin);
      try {
        const out = await queryBatch(items);
        process.stdout.write(JSON.stringify(out));
      } catch (e) {
        process.stderr.write(`error: ${e.message}\n`);
        process.exit(3);
      }
    } else {
      process.stderr.write("usage: osv-client.js query  (reads JSON array from stdin)\n");
      process.exit(2);
    }
  })();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd plugins/migration-runner && node --test tests/osv-client.test.js
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/migration-runner/scripts/osv-client.js plugins/migration-runner/tests/osv-client.test.js
git commit -m "feat(migration-runner): OSV.dev batch query client with 24h disk cache"
```

---

## Task 6: state.js + git-helpers.js + tests

**Files:**
- Create: `plugins/migration-runner/scripts/state.js`
- Create: `plugins/migration-runner/scripts/git-helpers.js`
- Create: `plugins/migration-runner/tests/state.test.js`
- Create: `plugins/migration-runner/tests/git-helpers.test.js`

- [ ] **Step 1: Write failing tests for `state.js`**

Write `plugins/migration-runner/tests/state.test.js`:

```js
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { read, write } = require("../scripts/state.js");

let TMP;
before(() => { TMP = fs.mkdtempSync(path.join(os.tmpdir(), "state-test-")); });
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

test("read: returns null when file does not exist", () => {
  assert.equal(read(path.join(TMP, "nope.json")), null);
});

test("write + read round-trips", () => {
  const p = path.join(TMP, "s.json");
  const data = { plan_generated_at: "2026-05-03T00:00:00Z", waves: [{ wave_index: 1, package: "x", status: "pending" }] };
  write(p, data);
  assert.deepEqual(read(p), data);
});

test("write: atomic via tmp-then-rename leaves no .tmp file", () => {
  const p = path.join(TMP, "atomic.json");
  write(p, { x: 1 });
  const files = fs.readdirSync(TMP);
  assert.ok(!files.some((f) => f.endsWith(".tmp")), "no .tmp leftover");
});
```

- [ ] **Step 2: Implement `state.js`**

Write `plugins/migration-runner/scripts/state.js`:

```js
"use strict";

const fs = require("fs");
const path = require("path");

function read(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function write(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}

module.exports = { read, write };

if (require.main === module) {
  const sub = process.argv[2];
  const file = process.argv[3];
  if (sub === "read" && file) {
    const out = read(file);
    process.stdout.write(out === null ? "" : JSON.stringify(out));
  } else if (sub === "write" && file) {
    const data = JSON.parse(fs.readFileSync(0, "utf8"));
    write(file, data);
  } else {
    process.stderr.write("usage: state.js read|write <file>\n");
    process.exit(2);
  }
}
```

- [ ] **Step 3: Run state tests to verify they pass**

Run:
```bash
cd plugins/migration-runner && node --test tests/state.test.js
```
Expected: 3 tests pass.

- [ ] **Step 4: Write failing tests for `git-helpers.js`**

Write `plugins/migration-runner/tests/git-helpers.test.js`:

```js
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const { currentSha, requireCleanTree, requireGitRepo, commitAll, resetHardTo, isDetachedHead } = require("../scripts/git-helpers.js");

let REPO;
function git(cmd) { return execSync(`git ${cmd}`, { cwd: REPO, encoding: "utf8" }).trim(); }

before(() => {
  REPO = fs.mkdtempSync(path.join(os.tmpdir(), "git-test-"));
  git("init -q");
  git('config user.email "test@example.com"');
  git('config user.name "Test"');
  fs.writeFileSync(path.join(REPO, "a.txt"), "hello\n");
  git("add a.txt");
  git('commit -q -m initial');
});
after(() => fs.rmSync(REPO, { recursive: true, force: true }));

test("currentSha: returns short SHA of HEAD", () => {
  const sha = currentSha(REPO);
  assert.match(sha, /^[0-9a-f]{7,40}$/);
});

test("requireGitRepo: passes inside a git repo, throws outside", () => {
  requireGitRepo(REPO); // no throw
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nogit-"));
  assert.throws(() => requireGitRepo(tmp), /not a git repo/i);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("requireCleanTree: passes when clean, throws when dirty", () => {
  requireCleanTree(REPO);
  fs.writeFileSync(path.join(REPO, "a.txt"), "modified\n");
  assert.throws(() => requireCleanTree(REPO), /dirty/i);
  git("checkout -- a.txt");
});

test("commitAll + resetHardTo: round-trips a wave", () => {
  const before = currentSha(REPO);
  fs.writeFileSync(path.join(REPO, "b.txt"), "wave\n");
  commitAll(REPO, "test wave");
  const after = currentSha(REPO);
  assert.notEqual(after, before);
  resetHardTo(REPO, before);
  assert.equal(currentSha(REPO), before);
  assert.ok(!fs.existsSync(path.join(REPO, "b.txt")));
});

test("isDetachedHead: false on a branch", () => {
  assert.equal(isDetachedHead(REPO), false);
});
```

- [ ] **Step 5: Implement `git-helpers.js`**

Write `plugins/migration-runner/scripts/git-helpers.js`:

```js
"use strict";

const { execSync } = require("child_process");

function git(cwd, args) {
  return execSync(`git ${args}`, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function currentSha(cwd) {
  return git(cwd, "rev-parse --short HEAD");
}

function requireGitRepo(cwd) {
  try {
    git(cwd, "rev-parse --git-dir");
  } catch {
    throw new Error("not a git repo: rollback would be impossible. Run inside a git repo.");
  }
}

function requireCleanTree(cwd) {
  const out = git(cwd, "status --porcelain");
  if (out.length > 0) {
    throw new Error("working tree is dirty: commit or stash before running migration-runner.");
  }
}

function isDetachedHead(cwd) {
  try {
    const out = git(cwd, "symbolic-ref -q HEAD");
    return out.length === 0;
  } catch {
    return true;
  }
}

function commitAll(cwd, message) {
  execSync(`git add -A`, { cwd });
  execSync(`git commit -m ${JSON.stringify(message)}`, { cwd });
}

function resetHardTo(cwd, sha) {
  execSync(`git reset --hard ${sha}`, { cwd });
}

module.exports = { currentSha, requireGitRepo, requireCleanTree, isDetachedHead, commitAll, resetHardTo };

if (require.main === module) {
  const sub = process.argv[2];
  const cwd = process.cwd();
  try {
    if (sub === "current-sha") process.stdout.write(currentSha(cwd));
    else if (sub === "require-clean") requireCleanTree(cwd);
    else if (sub === "require-repo") requireGitRepo(cwd);
    else if (sub === "is-detached") process.stdout.write(String(isDetachedHead(cwd)));
    else if (sub === "commit-all") commitAll(cwd, process.argv[3]);
    else if (sub === "reset-hard") resetHardTo(cwd, process.argv[3]);
    else { process.stderr.write("usage: git-helpers.js <subcommand> [args]\n"); process.exit(2); }
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    process.exit(3);
  }
}
```

- [ ] **Step 6: Run git-helpers tests**

Run:
```bash
cd plugins/migration-runner && node --test tests/git-helpers.test.js
```
Expected: 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add plugins/migration-runner/scripts/state.js plugins/migration-runner/scripts/git-helpers.js plugins/migration-runner/tests/state.test.js plugins/migration-runner/tests/git-helpers.test.js
git commit -m "feat(migration-runner): state I/O and git helpers with atomic writes and rollback"
```

---

## Task 7: npm adapter + CLI dispatcher + tests

**Files:**
- Create: `plugins/migration-runner/scripts/adapter.js` (CLI dispatcher)
- Create: `plugins/migration-runner/scripts/adapters/npm.js`
- Create: `plugins/migration-runner/test-fixtures/npm/sample-outdated.json`
- Create: `plugins/migration-runner/test-fixtures/npm/sample-versions-axios.json`
- Create: `plugins/migration-runner/tests/adapters/npm.test.js`

- [ ] **Step 1: Capture sample CLI output as fixtures**

Write `plugins/migration-runner/test-fixtures/npm/sample-outdated.json` (this mirrors `npm outdated --json`):

```json
{
  "axios": { "current": "1.6.7", "wanted": "1.7.4", "latest": "1.7.4", "location": "node_modules/axios" },
  "lodash": { "current": "4.17.20", "wanted": "4.17.21", "latest": "4.17.21", "location": "node_modules/lodash" }
}
```

Write `plugins/migration-runner/test-fixtures/npm/sample-versions-axios.json` (mirrors `https://registry.npmjs.org/axios` truncated):

```json
{
  "name": "axios",
  "versions": {
    "1.6.7": {},
    "1.7.0": {},
    "1.7.2": {},
    "1.7.3": {},
    "1.7.4": {}
  },
  "time": {
    "1.6.7": "2024-02-01T00:00:00.000Z",
    "1.7.0": "2024-05-01T00:00:00.000Z",
    "1.7.2": "2024-06-15T00:00:00.000Z",
    "1.7.3": "2024-07-01T00:00:00.000Z",
    "1.7.4": "2024-07-20T00:00:00.000Z"
  }
}
```

- [ ] **Step 2: Write failing tests**

Write `plugins/migration-runner/tests/adapters/npm.test.js`:

```js
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ORIG_FETCH = global.fetch;

let CWD;
before(() => {
  CWD = fs.mkdtempSync(path.join(os.tmpdir(), "npm-adapter-"));
  fs.writeFileSync(path.join(CWD, "package.json"), JSON.stringify({ name: "test", dependencies: { axios: "^1.6.7" } }));
});
after(() => {
  global.fetch = ORIG_FETCH;
  fs.rmSync(CWD, { recursive: true, force: true });
});

test("detect: returns manifest_path when package.json exists", () => {
  const { detect } = require("../../scripts/adapters/npm.js");
  assert.equal(detect(CWD).manifest_path, "package.json");
});

test("detect: returns null with no package.json", () => {
  const { detect } = require("../../scripts/adapters/npm.js");
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "npm-empty-"));
  assert.equal(detect(empty), null);
  fs.rmSync(empty, { recursive: true, force: true });
});

test("listOutdated: parses npm outdated --json output", () => {
  const npm = require("../../scripts/adapters/npm.js");
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/npm/sample-outdated.json"), "utf8"));
  const out = npm._parseOutdated(fixture);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { name: "axios", current: "1.6.7", latest_known: "1.7.4" });
  assert.deepEqual(out[1], { name: "lodash", current: "4.17.20", latest_known: "4.17.21" });
});

test("listAvailableVersions: queries npm registry and returns version+release-date", async () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/npm/sample-versions-axios.json"), "utf8"));
  global.fetch = async (url) => {
    assert.match(url, /registry\.npmjs\.org\/axios/);
    return { ok: true, json: async () => fixture };
  };
  const npm = require("../../scripts/adapters/npm.js");
  const versions = await npm.listAvailableVersions("axios");
  assert.equal(versions.length, 5);
  assert.equal(versions[0].version, "1.6.7");
  assert.equal(versions[0].released_at, "2024-02-01T00:00:00.000Z");
});

test("verifyCommands: returns build+test, plus typecheck if tsconfig.json exists", () => {
  const npm = require("../../scripts/adapters/npm.js");
  fs.writeFileSync(path.join(CWD, "tsconfig.json"), "{}");
  const cmds = npm.verifyCommands(CWD);
  assert.equal(cmds.build, "npm run build");
  assert.equal(cmds.test, "npm test");
  assert.equal(cmds.typecheck, "npx tsc --noEmit");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:
```bash
cd plugins/migration-runner && node --test tests/adapters/npm.test.js
```
Expected: failures with `Cannot find module '../../scripts/adapters/npm.js'`.

- [ ] **Step 4: Implement the npm adapter**

Write `plugins/migration-runner/scripts/adapters/npm.js`:

```js
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function detect(cwd) {
  const p = path.join(cwd, "package.json");
  return fs.existsSync(p) ? { manifest_path: "package.json" } : null;
}

function _parseOutdated(json) {
  return Object.entries(json || {}).map(([name, info]) => ({
    name,
    current: info.current,
    latest_known: info.latest,
  }));
}

function listOutdated(cwd) {
  // npm outdated exits with code 1 when outdated packages exist; capture stdout regardless.
  let stdout = "";
  try {
    stdout = execSync("npm outdated --json", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    stdout = e.stdout || "";
  }
  const json = stdout.trim() ? JSON.parse(stdout) : {};
  return _parseOutdated(json);
}

async function listAvailableVersions(name) {
  const resp = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
  if (!resp.ok) throw new Error(`npm registry returned ${resp.status} for ${name}`);
  const data = await resp.json();
  const versions = Object.keys(data.versions || {});
  return versions.map((v) => ({ version: v, released_at: (data.time || {})[v] }));
}

function applyUpgrade(cwd, name, version) {
  try {
    execSync(`npm install ${name}@${version}`, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    return { success: true };
  } catch (e) {
    return { success: false, stderr: String(e.stderr || e.message) };
  }
}

function verifyCommands(cwd) {
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
  const scripts = pkg.scripts || {};
  const cmds = {};
  cmds.build = scripts.build ? "npm run build" : null;
  cmds.test = scripts.test ? "npm test" : null;
  cmds.typecheck = fs.existsSync(path.join(cwd, "tsconfig.json")) ? "npx tsc --noEmit" : null;
  // Drop nulls to keep schema clean.
  for (const k of Object.keys(cmds)) if (cmds[k] === null) delete cmds[k];
  return cmds;
}

module.exports = { detect, listOutdated, listAvailableVersions, applyUpgrade, verifyCommands, _parseOutdated };
```

- [ ] **Step 5: Implement the CLI dispatcher**

Write `plugins/migration-runner/scripts/adapter.js`:

```js
#!/usr/bin/env node
"use strict";
const fs = require("fs");

const ECOSYSTEMS = ["npm", "python", "go", "rust", "java", "kotlin", "csharp"];

async function main() {
  const [, , eco, sub, ...rest] = process.argv;
  if (!ECOSYSTEMS.includes(eco)) {
    process.stderr.write(`error: unknown ecosystem: ${eco}\nvalid: ${ECOSYSTEMS.join(", ")}\n`);
    process.exit(2);
  }
  const adapter = require(`./adapters/${eco}.js`);
  const cwd = process.env.MIGRATION_RUNNER_CWD || process.cwd();

  try {
    if (sub === "detect") {
      const out = adapter.detect(cwd);
      process.stdout.write(out === null ? "" : JSON.stringify(out));
    } else if (sub === "list-outdated") {
      process.stdout.write(JSON.stringify(adapter.listOutdated(cwd)));
    } else if (sub === "list-versions") {
      const name = rest[0];
      const versions = await adapter.listAvailableVersions(name);
      process.stdout.write(JSON.stringify(versions));
    } else if (sub === "apply-upgrade") {
      const [name, version] = rest;
      const r = adapter.applyUpgrade(cwd, name, version);
      process.stdout.write(JSON.stringify(r));
      if (!r.success) process.exit(4);
    } else if (sub === "verify-commands") {
      process.stdout.write(JSON.stringify(adapter.verifyCommands(cwd)));
    } else {
      process.stderr.write("usage: adapter.js <ecosystem> <detect|list-outdated|list-versions|apply-upgrade|verify-commands> [args]\n");
      process.exit(2);
    }
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    process.exit(3);
  }
}

main();
```

- [ ] **Step 6: Run npm adapter tests to verify they pass**

Run:
```bash
cd plugins/migration-runner && node --test tests/adapters/npm.test.js
```
Expected: 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add plugins/migration-runner/scripts/adapter.js plugins/migration-runner/scripts/adapters/npm.js plugins/migration-runner/test-fixtures/npm/ plugins/migration-runner/tests/adapters/npm.test.js
git commit -m "feat(migration-runner): npm adapter + adapter CLI dispatcher with parser tests"
```

---

## Task 8: Python adapter + tests

**Files:**
- Create: `plugins/migration-runner/scripts/adapters/python.js`
- Create: `plugins/migration-runner/test-fixtures/python/sample-outdated.json`
- Create: `plugins/migration-runner/test-fixtures/python/sample-versions-requests.json`
- Create: `plugins/migration-runner/tests/adapters/python.test.js`

- [ ] **Step 1: Capture fixture for `pip list --outdated --format=json`**

Write `plugins/migration-runner/test-fixtures/python/sample-outdated.json`:

```json
[
  { "name": "requests", "version": "2.28.0", "latest_version": "2.32.3", "latest_filetype": "wheel" },
  { "name": "urllib3", "version": "1.26.0", "latest_version": "2.2.2", "latest_filetype": "wheel" }
]
```

Write `plugins/migration-runner/test-fixtures/python/sample-versions-requests.json` (mirrors `https://pypi.org/pypi/requests/json` truncated):

```json
{
  "info": { "name": "requests" },
  "releases": {
    "2.28.0": [{ "upload_time_iso_8601": "2022-06-29T00:00:00.000Z" }],
    "2.31.0": [{ "upload_time_iso_8601": "2023-05-22T00:00:00.000Z" }],
    "2.32.0": [{ "upload_time_iso_8601": "2024-05-20T00:00:00.000Z" }],
    "2.32.3": [{ "upload_time_iso_8601": "2024-05-29T00:00:00.000Z" }]
  }
}
```

- [ ] **Step 2: Write failing tests**

Write `plugins/migration-runner/tests/adapters/python.test.js`:

```js
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ORIG_FETCH = global.fetch;
let CWD;

before(() => {
  CWD = fs.mkdtempSync(path.join(os.tmpdir(), "py-adapter-"));
});
after(() => {
  global.fetch = ORIG_FETCH;
  fs.rmSync(CWD, { recursive: true, force: true });
});

test("detect: prefers pyproject.toml, then requirements.txt, else null", () => {
  const py = require("../../scripts/adapters/python.js");
  assert.equal(py.detect(CWD), null);
  fs.writeFileSync(path.join(CWD, "requirements.txt"), "requests==2.28.0\n");
  assert.equal(py.detect(CWD).manifest_path, "requirements.txt");
  fs.writeFileSync(path.join(CWD, "pyproject.toml"), "[project]\nname='x'\n");
  assert.equal(py.detect(CWD).manifest_path, "pyproject.toml");
});

test("listOutdated parser: handles pip list --outdated --format=json", () => {
  const py = require("../../scripts/adapters/python.js");
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/python/sample-outdated.json"), "utf8"));
  const out = py._parseOutdated(fixture);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { name: "requests", current: "2.28.0", latest_known: "2.32.3" });
});

test("listAvailableVersions: queries PyPI JSON and returns version+release-date", async () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/python/sample-versions-requests.json"), "utf8"));
  global.fetch = async (url) => {
    assert.match(url, /pypi\.org\/pypi\/requests\/json/);
    return { ok: true, json: async () => fixture };
  };
  const py = require("../../scripts/adapters/python.js");
  const versions = await py.listAvailableVersions("requests");
  assert.equal(versions.length, 4);
  assert.equal(versions.find((v) => v.version === "2.32.3").released_at, "2024-05-29T00:00:00.000Z");
});

test("verifyCommands: returns pytest if pytest installed, mypy if mypy.ini present", () => {
  const py = require("../../scripts/adapters/python.js");
  fs.writeFileSync(path.join(CWD, "mypy.ini"), "[mypy]\n");
  const cmds = py.verifyCommands(CWD);
  assert.equal(cmds.typecheck, "mypy .");
  assert.equal(cmds.test, "pytest");
});
```

- [ ] **Step 3: Implement the Python adapter**

Write `plugins/migration-runner/scripts/adapters/python.js`:

```js
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function detect(cwd) {
  if (fs.existsSync(path.join(cwd, "pyproject.toml"))) return { manifest_path: "pyproject.toml" };
  if (fs.existsSync(path.join(cwd, "requirements.txt"))) return { manifest_path: "requirements.txt" };
  if (fs.existsSync(path.join(cwd, "Pipfile"))) return { manifest_path: "Pipfile" };
  return null;
}

function _parseOutdated(arr) {
  return (arr || []).map((it) => ({
    name: it.name,
    current: it.version,
    latest_known: it.latest_version,
  }));
}

function listOutdated(cwd) {
  let stdout = "";
  try {
    stdout = execSync("pip list --outdated --format=json", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    stdout = e.stdout || "";
  }
  return _parseOutdated(stdout.trim() ? JSON.parse(stdout) : []);
}

async function listAvailableVersions(name) {
  const resp = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  if (!resp.ok) throw new Error(`PyPI returned ${resp.status} for ${name}`);
  const data = await resp.json();
  const out = [];
  for (const [v, files] of Object.entries(data.releases || {})) {
    const ts = (files[0] || {}).upload_time_iso_8601 || null;
    out.push({ version: v, released_at: ts });
  }
  return out;
}

function applyUpgrade(cwd, name, version) {
  try {
    execSync(`pip install -U ${name}==${version}`, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    return { success: true };
  } catch (e) {
    return { success: false, stderr: String(e.stderr || e.message) };
  }
}

function verifyCommands(cwd) {
  const cmds = {};
  if (fs.existsSync(path.join(cwd, "pyproject.toml"))) cmds.build = "python -m build";
  if (fs.existsSync(path.join(cwd, "mypy.ini"))) cmds.typecheck = "mypy .";
  cmds.test = "pytest";
  return cmds;
}

module.exports = { detect, listOutdated, listAvailableVersions, applyUpgrade, verifyCommands, _parseOutdated };
```

- [ ] **Step 4: Run Python adapter tests**

Run:
```bash
cd plugins/migration-runner && node --test tests/adapters/python.test.js
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/migration-runner/scripts/adapters/python.js plugins/migration-runner/test-fixtures/python/ plugins/migration-runner/tests/adapters/python.test.js
git commit -m "feat(migration-runner): python adapter (pip + PyPI)"
```

---

## Task 9: Go adapter + tests

**Files:**
- Create: `plugins/migration-runner/scripts/adapters/go.js`
- Create: `plugins/migration-runner/test-fixtures/go/sample-outdated.txt` (Go's `list -m -u -json all` is JSON-lines)
- Create: `plugins/migration-runner/test-fixtures/go/sample-version-info.json`
- Create: `plugins/migration-runner/tests/adapters/go.test.js`

- [ ] **Step 1: Capture fixtures**

Write `plugins/migration-runner/test-fixtures/go/sample-outdated.txt` (JSON-lines, one JSON object per line):

```
{"Path":"golang.org/x/text","Version":"v0.3.0","Update":{"Path":"golang.org/x/text","Version":"v0.16.0"}}
{"Path":"github.com/stretchr/testify","Version":"v1.7.0","Update":{"Path":"github.com/stretchr/testify","Version":"v1.9.0"}}
{"Path":"github.com/google/uuid","Version":"v1.6.0"}
```

Write `plugins/migration-runner/test-fixtures/go/sample-version-info.json` (mirrors `https://proxy.golang.org/golang.org/x/text/@v/v0.16.0.info`):

```json
{ "Version": "v0.16.0", "Time": "2024-06-13T00:00:00Z" }
```

- [ ] **Step 2: Write failing tests**

Write `plugins/migration-runner/tests/adapters/go.test.js`:

```js
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ORIG_FETCH = global.fetch;
let CWD;
before(() => { CWD = fs.mkdtempSync(path.join(os.tmpdir(), "go-adapter-")); });
after(() => { global.fetch = ORIG_FETCH; fs.rmSync(CWD, { recursive: true, force: true }); });

test("detect: returns manifest_path when go.mod exists", () => {
  const go = require("../../scripts/adapters/go.js");
  assert.equal(go.detect(CWD), null);
  fs.writeFileSync(path.join(CWD, "go.mod"), "module x\ngo 1.22\n");
  assert.equal(go.detect(CWD).manifest_path, "go.mod");
});

test("listOutdated parser: handles JSON-lines from `go list -m -u -json all`", () => {
  const go = require("../../scripts/adapters/go.js");
  const text = fs.readFileSync(path.join(__dirname, "../../test-fixtures/go/sample-outdated.txt"), "utf8");
  const out = go._parseOutdated(text);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { name: "golang.org/x/text", current: "v0.3.0", latest_known: "v0.16.0" });
});

test("listAvailableVersions: queries Go proxy list and per-version info", async () => {
  global.fetch = async (url) => {
    if (url.endsWith("/@v/list")) return { ok: true, text: async () => "v0.3.0\nv0.16.0\n" };
    if (url.endsWith("/v0.3.0.info")) return { ok: true, json: async () => ({ Version: "v0.3.0", Time: "2018-01-01T00:00:00Z" }) };
    if (url.endsWith("/v0.16.0.info")) return { ok: true, json: async () => ({ Version: "v0.16.0", Time: "2024-06-13T00:00:00Z" }) };
    throw new Error("unexpected URL " + url);
  };
  const go = require("../../scripts/adapters/go.js");
  const versions = await go.listAvailableVersions("golang.org/x/text");
  assert.equal(versions.length, 2);
  assert.equal(versions.find((v) => v.version === "v0.16.0").released_at, "2024-06-13T00:00:00Z");
});

test("verifyCommands: build, vet, test", () => {
  const go = require("../../scripts/adapters/go.js");
  fs.writeFileSync(path.join(CWD, "go.mod"), "module x\n");
  const cmds = go.verifyCommands(CWD);
  assert.equal(cmds.build, "go build ./...");
  assert.equal(cmds.typecheck, "go vet ./...");
  assert.equal(cmds.test, "go test ./...");
});
```

- [ ] **Step 3: Implement the Go adapter**

Write `plugins/migration-runner/scripts/adapters/go.js`:

```js
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function detect(cwd) {
  return fs.existsSync(path.join(cwd, "go.mod")) ? { manifest_path: "go.mod" } : null;
}

function _parseOutdated(text) {
  const out = [];
  // The output is concatenated JSON objects (Go's encoding/json default), one per module.
  // Split on newlines; tolerate whitespace.
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.Update && obj.Update.Version && obj.Version) {
        out.push({ name: obj.Path, current: obj.Version, latest_known: obj.Update.Version });
      }
    } catch {
      /* ignore non-JSON lines from concatenated output */
    }
  }
  return out;
}

function listOutdated(cwd) {
  let stdout = "";
  try {
    stdout = execSync("go list -m -u -json all", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    stdout = e.stdout || "";
  }
  // Convert concatenated objects to JSON-lines (insert newline between }{).
  stdout = stdout.replace(/\}\s*\{/g, "}\n{");
  return _parseOutdated(stdout);
}

async function listAvailableVersions(name) {
  const base = `https://proxy.golang.org/${name}`;
  const listResp = await fetch(`${base}/@v/list`);
  if (!listResp.ok) throw new Error(`Go proxy /@v/list returned ${listResp.status}`);
  const versions = (await listResp.text()).split(/\s+/).filter(Boolean);
  const out = [];
  for (const v of versions) {
    try {
      const r = await fetch(`${base}/@v/${v}.info`);
      if (!r.ok) { out.push({ version: v, released_at: null }); continue; }
      const info = await r.json();
      out.push({ version: v, released_at: info.Time || null });
    } catch {
      out.push({ version: v, released_at: null });
    }
  }
  return out;
}

function applyUpgrade(cwd, name, version) {
  try {
    execSync(`go get ${name}@${version}`, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    execSync(`go mod tidy`, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    return { success: true };
  } catch (e) {
    return { success: false, stderr: String(e.stderr || e.message) };
  }
}

function verifyCommands() {
  return { build: "go build ./...", typecheck: "go vet ./...", test: "go test ./..." };
}

module.exports = { detect, listOutdated, listAvailableVersions, applyUpgrade, verifyCommands, _parseOutdated };
```

- [ ] **Step 4: Run Go adapter tests**

Run:
```bash
cd plugins/migration-runner && node --test tests/adapters/go.test.js
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/migration-runner/scripts/adapters/go.js plugins/migration-runner/test-fixtures/go/ plugins/migration-runner/tests/adapters/go.test.js
git commit -m "feat(migration-runner): go modules adapter (go list + Go proxy)"
```

---

## Task 10: Rust adapter + tests

**Files:**
- Create: `plugins/migration-runner/scripts/adapters/rust.js`
- Create: `plugins/migration-runner/test-fixtures/rust/sample-outdated.json`
- Create: `plugins/migration-runner/test-fixtures/rust/sample-versions-serde.json`
- Create: `plugins/migration-runner/tests/adapters/rust.test.js`

- [ ] **Step 1: Capture fixtures**

Write `plugins/migration-runner/test-fixtures/rust/sample-outdated.json` (mirrors `cargo outdated --format json`):

```json
{
  "dependencies": [
    { "name": "serde", "project": "1.0.180", "compat": "1.0.180", "latest": "1.0.210", "kind": "Normal", "platform": null }
  ]
}
```

Write `plugins/migration-runner/test-fixtures/rust/sample-versions-serde.json` (mirrors `https://crates.io/api/v1/crates/serde`):

```json
{
  "crate": { "name": "serde" },
  "versions": [
    { "num": "1.0.180", "created_at": "2024-01-01T00:00:00Z", "yanked": false },
    { "num": "1.0.200", "created_at": "2024-04-15T00:00:00Z", "yanked": false },
    { "num": "1.0.210", "created_at": "2024-08-20T00:00:00Z", "yanked": false },
    { "num": "1.0.211", "created_at": "2024-09-01T00:00:00Z", "yanked": true }
  ]
}
```

- [ ] **Step 2: Write failing tests**

Write `plugins/migration-runner/tests/adapters/rust.test.js`:

```js
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ORIG_FETCH = global.fetch;
let CWD;
before(() => { CWD = fs.mkdtempSync(path.join(os.tmpdir(), "rust-adapter-")); });
after(() => { global.fetch = ORIG_FETCH; fs.rmSync(CWD, { recursive: true, force: true }); });

test("detect: returns manifest_path when Cargo.toml exists", () => {
  const rust = require("../../scripts/adapters/rust.js");
  assert.equal(rust.detect(CWD), null);
  fs.writeFileSync(path.join(CWD, "Cargo.toml"), "[package]\nname='x'\nversion='0.1'\n");
  assert.equal(rust.detect(CWD).manifest_path, "Cargo.toml");
});

test("listOutdated parser: handles cargo outdated --format json", () => {
  const rust = require("../../scripts/adapters/rust.js");
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/rust/sample-outdated.json"), "utf8"));
  const out = rust._parseOutdated(fixture);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { name: "serde", current: "1.0.180", latest_known: "1.0.210" });
});

test("listAvailableVersions: queries crates.io and excludes yanked", async () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/rust/sample-versions-serde.json"), "utf8"));
  global.fetch = async (url) => {
    assert.match(url, /crates\.io\/api\/v1\/crates\/serde/);
    return { ok: true, json: async () => fixture };
  };
  const rust = require("../../scripts/adapters/rust.js");
  const versions = await rust.listAvailableVersions("serde");
  assert.equal(versions.length, 3); // yanked excluded
  assert.ok(!versions.some((v) => v.version === "1.0.211"));
});

test("verifyCommands: build, check, test", () => {
  const rust = require("../../scripts/adapters/rust.js");
  const cmds = rust.verifyCommands(CWD);
  assert.equal(cmds.build, "cargo build");
  assert.equal(cmds.typecheck, "cargo check");
  assert.equal(cmds.test, "cargo test");
});
```

- [ ] **Step 3: Implement the Rust adapter**

Write `plugins/migration-runner/scripts/adapters/rust.js`:

```js
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function detect(cwd) {
  return fs.existsSync(path.join(cwd, "Cargo.toml")) ? { manifest_path: "Cargo.toml" } : null;
}

function _parseOutdated(json) {
  return (json.dependencies || [])
    .filter((d) => d.project && d.latest && d.project !== d.latest)
    .map((d) => ({ name: d.name, current: d.project, latest_known: d.latest }));
}

function listOutdated(cwd) {
  let stdout = "";
  try {
    stdout = execSync("cargo outdated --format json", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    if (/not found|unrecognized subcommand/i.test(String(e.message))) {
      throw new Error("cargo-outdated not installed; run `cargo install cargo-outdated` and retry.");
    }
    stdout = e.stdout || "";
  }
  return _parseOutdated(stdout.trim() ? JSON.parse(stdout) : { dependencies: [] });
}

async function listAvailableVersions(name) {
  const resp = await fetch(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`, {
    headers: { "user-agent": "migration-runner (https://github.com/MisterVitoPro/qa-claude-market)" },
  });
  if (!resp.ok) throw new Error(`crates.io returned ${resp.status} for ${name}`);
  const data = await resp.json();
  return (data.versions || [])
    .filter((v) => !v.yanked)
    .map((v) => ({ version: v.num, released_at: v.created_at }));
}

function applyUpgrade(cwd, name, version) {
  try {
    execSync(`cargo update -p ${name} --precise ${version}`, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    return { success: true };
  } catch (e) {
    return { success: false, stderr: String(e.stderr || e.message) };
  }
}

function verifyCommands() {
  return { build: "cargo build", typecheck: "cargo check", test: "cargo test" };
}

module.exports = { detect, listOutdated, listAvailableVersions, applyUpgrade, verifyCommands, _parseOutdated };
```

- [ ] **Step 4: Run Rust adapter tests**

Run:
```bash
cd plugins/migration-runner && node --test tests/adapters/rust.test.js
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/migration-runner/scripts/adapters/rust.js plugins/migration-runner/test-fixtures/rust/ plugins/migration-runner/tests/adapters/rust.test.js
git commit -m "feat(migration-runner): rust adapter (cargo-outdated + crates.io API)"
```

---

## Task 11: Java/Maven adapter + tests

**Files:**
- Create: `plugins/migration-runner/scripts/adapters/java.js`
- Create: `plugins/migration-runner/test-fixtures/java/sample-outdated.txt`
- Create: `plugins/migration-runner/test-fixtures/java/sample-versions-guava.json`
- Create: `plugins/migration-runner/tests/adapters/java.test.js`

- [ ] **Step 1: Capture fixture for Maven `versions:display-dependency-updates` (text output)**

Write `plugins/migration-runner/test-fixtures/java/sample-outdated.txt`:

```
[INFO] The following dependencies in Dependencies have newer versions:
[INFO]   com.google.guava:guava ........................... 31.1-jre -> 33.3.0-jre
[INFO]   org.slf4j:slf4j-api .............................. 1.7.36 -> 2.0.13
[INFO]
```

Write `plugins/migration-runner/test-fixtures/java/sample-versions-guava.json` (mirrors a Maven Central search response for `g:com.google.guava AND a:guava`):

```json
{
  "response": {
    "docs": [
      { "v": "31.1-jre", "timestamp": 1655225862000 },
      { "v": "32.0.0-jre", "timestamp": 1685486800000 },
      { "v": "33.3.0-jre", "timestamp": 1722384000000 }
    ]
  }
}
```

- [ ] **Step 2: Write failing tests**

Write `plugins/migration-runner/tests/adapters/java.test.js`:

```js
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ORIG_FETCH = global.fetch;
let CWD;
before(() => { CWD = fs.mkdtempSync(path.join(os.tmpdir(), "java-adapter-")); });
after(() => { global.fetch = ORIG_FETCH; fs.rmSync(CWD, { recursive: true, force: true }); });

test("detect: prefers pom.xml, then build.gradle", () => {
  const j = require("../../scripts/adapters/java.js");
  assert.equal(j.detect(CWD), null);
  fs.writeFileSync(path.join(CWD, "build.gradle"), "");
  assert.equal(j.detect(CWD).manifest_path, "build.gradle");
  fs.writeFileSync(path.join(CWD, "pom.xml"), "<project/>");
  assert.equal(j.detect(CWD).manifest_path, "pom.xml");
});

test("listOutdated parser: handles Maven versions plugin text output", () => {
  const j = require("../../scripts/adapters/java.js");
  const text = fs.readFileSync(path.join(__dirname, "../../test-fixtures/java/sample-outdated.txt"), "utf8");
  const out = j._parseMavenOutdated(text);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { name: "com.google.guava:guava", current: "31.1-jre", latest_known: "33.3.0-jre" });
});

test("listAvailableVersions: queries Maven Central search", async () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/java/sample-versions-guava.json"), "utf8"));
  global.fetch = async (url) => {
    assert.match(url, /search\.maven\.org/);
    return { ok: true, json: async () => fixture };
  };
  const j = require("../../scripts/adapters/java.js");
  const versions = await j.listAvailableVersions("com.google.guava:guava");
  assert.equal(versions.length, 3);
  assert.equal(versions.find((v) => v.version === "33.3.0-jre").released_at, "2024-07-31T00:00:00.000Z");
});

test("verifyCommands: mvn for pom.xml, gradle for build.gradle", () => {
  const j = require("../../scripts/adapters/java.js");
  const pomDir = fs.mkdtempSync(path.join(os.tmpdir(), "pom-")); fs.writeFileSync(path.join(pomDir, "pom.xml"), "");
  const gradleDir = fs.mkdtempSync(path.join(os.tmpdir(), "gradle-")); fs.writeFileSync(path.join(gradleDir, "build.gradle"), "");
  assert.equal(j.verifyCommands(pomDir).test, "mvn test");
  assert.equal(j.verifyCommands(gradleDir).test, "./gradlew test");
  fs.rmSync(pomDir, { recursive: true }); fs.rmSync(gradleDir, { recursive: true });
});
```

- [ ] **Step 3: Implement the Java adapter**

Write `plugins/migration-runner/scripts/adapters/java.js`:

```js
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function detect(cwd) {
  if (fs.existsSync(path.join(cwd, "pom.xml"))) return { manifest_path: "pom.xml" };
  if (fs.existsSync(path.join(cwd, "build.gradle"))) return { manifest_path: "build.gradle" };
  if (fs.existsSync(path.join(cwd, "build.gradle.kts"))) return { manifest_path: "build.gradle.kts" };
  return null;
}

function _parseMavenOutdated(text) {
  // Format: "  group:artifact ........... oldVersion -> newVersion"
  const out = [];
  const re = /^\[INFO\]\s+([\w.\-]+:[\w.\-]+)\s+\.+\s+(\S+)\s*->\s*(\S+)\s*$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ name: m[1], current: m[2], latest_known: m[3] });
  }
  return out;
}

function listOutdated(cwd) {
  const det = detect(cwd);
  if (!det) return [];
  if (det.manifest_path === "pom.xml") {
    let stdout = "";
    try {
      stdout = execSync("mvn versions:display-dependency-updates -q", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) {
      stdout = e.stdout || "";
    }
    return _parseMavenOutdated(stdout);
  }
  // Gradle: requires com.github.ben-manes.versions plugin. Surface a clear error if missing.
  let stdout = "";
  try {
    stdout = execSync("./gradlew dependencyUpdates -q", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    if (/Task .*dependencyUpdates.* not found/i.test(String(e.message))) {
      throw new Error("Gradle versions plugin not configured. Add `id 'com.github.ben-manes.versions' version '0.51.0'` to build.gradle plugins block.");
    }
    stdout = e.stdout || "";
  }
  // Reuse Maven-style parser; the gradle plugin output uses the same shape in its text report.
  return _parseMavenOutdated(stdout);
}

async function listAvailableVersions(coords) {
  const [g, a] = String(coords).split(":");
  if (!g || !a) throw new Error(`expected GROUP:ARTIFACT, got ${coords}`);
  const url = `https://search.maven.org/solrsearch/select?q=g:%22${encodeURIComponent(g)}%22+AND+a:%22${encodeURIComponent(a)}%22&core=gav&rows=200&wt=json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Maven Central returned ${resp.status} for ${coords}`);
  const data = await resp.json();
  return ((data.response || {}).docs || []).map((d) => ({
    version: d.v,
    released_at: new Date(d.timestamp).toISOString(),
  }));
}

function applyUpgrade(cwd, coords, version) {
  const det = detect(cwd);
  if (!det) return { success: false, stderr: "no Java manifest" };
  try {
    if (det.manifest_path === "pom.xml") {
      execSync(`mvn versions:use-dep-version -Dincludes=${coords} -DdepVersion=${version} -DforceVersion=true -DgenerateBackupPoms=false`, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    } else {
      // Gradle: rewrite the version string in build.gradle / build.gradle.kts.
      const file = path.join(cwd, det.manifest_path);
      const src = fs.readFileSync(file, "utf8");
      const re = new RegExp(`(['"])${coords.replace(/[.+*?^$()[\]{}|\\]/g, "\\\\$&")}:[^'"]+\\1`, "g");
      const next = src.replace(re, (m, q) => `${q}${coords}:${version}${q}`);
      if (next === src) return { success: false, stderr: `no occurrence of ${coords} in ${det.manifest_path}` };
      fs.writeFileSync(file, next);
    }
    return { success: true };
  } catch (e) {
    return { success: false, stderr: String(e.stderr || e.message) };
  }
}

function verifyCommands(cwd) {
  const det = detect(cwd);
  if (!det) return {};
  if (det.manifest_path === "pom.xml") return { build: "mvn -q -DskipTests package", test: "mvn test" };
  return { build: "./gradlew assemble", test: "./gradlew test" };
}

module.exports = { detect, listOutdated, listAvailableVersions, applyUpgrade, verifyCommands, _parseMavenOutdated };
```

- [ ] **Step 4: Run Java adapter tests**

Run:
```bash
cd plugins/migration-runner && node --test tests/adapters/java.test.js
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/migration-runner/scripts/adapters/java.js plugins/migration-runner/test-fixtures/java/ plugins/migration-runner/tests/adapters/java.test.js
git commit -m "feat(migration-runner): java adapter (Maven + Gradle, Maven Central API)"
```

---

## Task 12: Kotlin adapter + tests

**Files:**
- Create: `plugins/migration-runner/scripts/adapters/kotlin.js`
- Create: `plugins/migration-runner/test-fixtures/kotlin/sample-outdated.txt`
- Create: `plugins/migration-runner/tests/adapters/kotlin.test.js`

The Kotlin adapter delegates to the Java adapter for outdated/versions queries (Kotlin-on-Gradle uses the same artifact registry and the same `versions` plugin). The differences are: manifest is `build.gradle.kts`, and `applyUpgrade` rewrites the .kts file's version string.

- [ ] **Step 1: Capture fixture (same shape as Java's)**

Write `plugins/migration-runner/test-fixtures/kotlin/sample-outdated.txt`:

```
[INFO] The following dependencies in Dependencies have newer versions:
[INFO]   org.jetbrains.kotlin:kotlin-stdlib ............... 1.8.22 -> 2.0.20
[INFO]
```

- [ ] **Step 2: Write failing tests**

Write `plugins/migration-runner/tests/adapters/kotlin.test.js`:

```js
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

let CWD;
before(() => { CWD = fs.mkdtempSync(path.join(os.tmpdir(), "kotlin-adapter-")); });
after(() => { fs.rmSync(CWD, { recursive: true, force: true }); });

test("detect: returns build.gradle.kts when present", () => {
  const k = require("../../scripts/adapters/kotlin.js");
  assert.equal(k.detect(CWD), null);
  fs.writeFileSync(path.join(CWD, "build.gradle.kts"), "");
  assert.equal(k.detect(CWD).manifest_path, "build.gradle.kts");
});

test("listOutdated parser: handles versions plugin text output", () => {
  const k = require("../../scripts/adapters/kotlin.js");
  const text = fs.readFileSync(path.join(__dirname, "../../test-fixtures/kotlin/sample-outdated.txt"), "utf8");
  const out = k._parseOutdated(text);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "org.jetbrains.kotlin:kotlin-stdlib");
});

test("applyUpgrade: rewrites version string in build.gradle.kts", () => {
  const k = require("../../scripts/adapters/kotlin.js");
  const file = path.join(CWD, "build.gradle.kts");
  fs.writeFileSync(file, 'dependencies { implementation("org.jetbrains.kotlin:kotlin-stdlib:1.8.22") }\n');
  const r = k.applyUpgrade(CWD, "org.jetbrains.kotlin:kotlin-stdlib", "2.0.20");
  assert.equal(r.success, true);
  assert.match(fs.readFileSync(file, "utf8"), /kotlin-stdlib:2\.0\.20/);
});

test("verifyCommands: ./gradlew test", () => {
  const k = require("../../scripts/adapters/kotlin.js");
  fs.writeFileSync(path.join(CWD, "build.gradle.kts"), "");
  assert.equal(k.verifyCommands(CWD).test, "./gradlew test");
});
```

- [ ] **Step 3: Implement the Kotlin adapter**

Write `plugins/migration-runner/scripts/adapters/kotlin.js`:

```js
"use strict";
const fs = require("fs");
const path = require("path");
const java = require("./java.js");

function detect(cwd) {
  return fs.existsSync(path.join(cwd, "build.gradle.kts")) ? { manifest_path: "build.gradle.kts" } : null;
}

function _parseOutdated(text) {
  return java._parseMavenOutdated(text);
}

function listOutdated(cwd) {
  return java.listOutdated(cwd);
}

function listAvailableVersions(coords) {
  return java.listAvailableVersions(coords);
}

function applyUpgrade(cwd, coords, version) {
  const file = path.join(cwd, "build.gradle.kts");
  if (!fs.existsSync(file)) return { success: false, stderr: "build.gradle.kts not found" };
  const src = fs.readFileSync(file, "utf8");
  const escaped = coords.replace(/[.+*?^$()[\]{}|\\]/g, "\\$&");
  const re = new RegExp(`(['"])${escaped}:[^'"]+\\1`, "g");
  const next = src.replace(re, (m, q) => `${q}${coords}:${version}${q}`);
  if (next === src) return { success: false, stderr: `no occurrence of ${coords} in build.gradle.kts` };
  fs.writeFileSync(file, next);
  return { success: true };
}

function verifyCommands() {
  return { build: "./gradlew assemble", test: "./gradlew test" };
}

module.exports = { detect, listOutdated, listAvailableVersions, applyUpgrade, verifyCommands, _parseOutdated };
```

- [ ] **Step 4: Run Kotlin adapter tests**

Run:
```bash
cd plugins/migration-runner && node --test tests/adapters/kotlin.test.js
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/migration-runner/scripts/adapters/kotlin.js plugins/migration-runner/test-fixtures/kotlin/ plugins/migration-runner/tests/adapters/kotlin.test.js
git commit -m "feat(migration-runner): kotlin adapter (gradle.kts rewrite, reuses java for queries)"
```

---

## Task 13: C# / .NET adapter + tests

**Files:**
- Create: `plugins/migration-runner/scripts/adapters/csharp.js`
- Create: `plugins/migration-runner/test-fixtures/csharp/sample-outdated.json`
- Create: `plugins/migration-runner/test-fixtures/csharp/sample-versions-newtonsoft.json`
- Create: `plugins/migration-runner/tests/adapters/csharp.test.js`

- [ ] **Step 1: Capture fixtures**

Write `plugins/migration-runner/test-fixtures/csharp/sample-outdated.json` (mirrors `dotnet list package --outdated --format json`):

```json
{
  "version": 1,
  "projects": [{
    "path": "MyApp.csproj",
    "frameworks": [{
      "framework": "net8.0",
      "topLevelPackages": [
        { "id": "Newtonsoft.Json", "requestedVersion": "12.0.3", "resolvedVersion": "12.0.3", "latestVersion": "13.0.3" }
      ]
    }]
  }]
}
```

Write `plugins/migration-runner/test-fixtures/csharp/sample-versions-newtonsoft.json` (mirrors NuGet flat container index):

```json
{
  "versions": ["12.0.0", "12.0.3", "13.0.0", "13.0.3"]
}
```

- [ ] **Step 2: Write failing tests**

Write `plugins/migration-runner/tests/adapters/csharp.test.js`:

```js
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ORIG_FETCH = global.fetch;
let CWD;
before(() => { CWD = fs.mkdtempSync(path.join(os.tmpdir(), "csharp-adapter-")); });
after(() => { global.fetch = ORIG_FETCH; fs.rmSync(CWD, { recursive: true, force: true }); });

test("detect: returns first .csproj or .sln", () => {
  const c = require("../../scripts/adapters/csharp.js");
  assert.equal(c.detect(CWD), null);
  fs.writeFileSync(path.join(CWD, "MyApp.csproj"), "<Project/>");
  assert.equal(c.detect(CWD).manifest_path, "MyApp.csproj");
});

test("listOutdated parser: handles dotnet list --outdated --format json", () => {
  const c = require("../../scripts/adapters/csharp.js");
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/csharp/sample-outdated.json"), "utf8"));
  const out = c._parseOutdated(fixture);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { name: "Newtonsoft.Json", current: "12.0.3", latest_known: "13.0.3" });
});

test("listAvailableVersions: queries NuGet flat container; release_at is null (NuGet flat doesn't expose dates)", async () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test-fixtures/csharp/sample-versions-newtonsoft.json"), "utf8"));
  global.fetch = async (url) => {
    assert.match(url, /api\.nuget\.org\/v3-flatcontainer\/newtonsoft\.json\/index\.json/);
    return { ok: true, json: async () => fixture };
  };
  const c = require("../../scripts/adapters/csharp.js");
  const versions = await c.listAvailableVersions("Newtonsoft.Json");
  assert.equal(versions.length, 4);
  assert.equal(versions[0].version, "12.0.0");
  assert.equal(versions[0].released_at, null);
});

test("verifyCommands: dotnet build + test", () => {
  const c = require("../../scripts/adapters/csharp.js");
  const cmds = c.verifyCommands(CWD);
  assert.equal(cmds.build, "dotnet build");
  assert.equal(cmds.test, "dotnet test");
});
```

- [ ] **Step 3: Implement the C# adapter**

Write `plugins/migration-runner/scripts/adapters/csharp.js`:

```js
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function detect(cwd) {
  const entries = fs.readdirSync(cwd);
  const csproj = entries.find((f) => f.endsWith(".csproj"));
  if (csproj) return { manifest_path: csproj };
  const sln = entries.find((f) => f.endsWith(".sln"));
  if (sln) return { manifest_path: sln };
  return null;
}

function _parseOutdated(json) {
  const out = [];
  for (const proj of json.projects || []) {
    for (const fw of proj.frameworks || []) {
      for (const pkg of fw.topLevelPackages || []) {
        if (pkg.latestVersion && pkg.resolvedVersion && pkg.latestVersion !== pkg.resolvedVersion) {
          out.push({ name: pkg.id, current: pkg.resolvedVersion, latest_known: pkg.latestVersion });
        }
      }
    }
  }
  return out;
}

function listOutdated(cwd) {
  let stdout = "";
  try {
    stdout = execSync("dotnet list package --outdated --format json", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    stdout = e.stdout || "";
  }
  if (!stdout.trim()) return [];
  return _parseOutdated(JSON.parse(stdout));
}

async function listAvailableVersions(name) {
  // NuGet's lowercase-ID convention.
  const id = String(name).toLowerCase();
  const resp = await fetch(`https://api.nuget.org/v3-flatcontainer/${encodeURIComponent(id)}/index.json`);
  if (!resp.ok) throw new Error(`NuGet returned ${resp.status} for ${name}`);
  const data = await resp.json();
  // Flat container does not include published dates; OSV.dev still returns them per-vuln.
  // For ranking soak-window, we treat null as "unknown" (== treated as old, so passes soak).
  return (data.versions || []).map((v) => ({ version: v, released_at: null }));
}

function applyUpgrade(cwd, name, version) {
  try {
    execSync(`dotnet add package ${name} --version ${version}`, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    return { success: true };
  } catch (e) {
    return { success: false, stderr: String(e.stderr || e.message) };
  }
}

function verifyCommands() {
  return { build: "dotnet build", test: "dotnet test" };
}

module.exports = { detect, listOutdated, listAvailableVersions, applyUpgrade, verifyCommands, _parseOutdated };
```

- [ ] **Step 4: Run C# adapter tests**

Run:
```bash
cd plugins/migration-runner && node --test tests/adapters/csharp.test.js
```
Expected: 4 tests pass.

- [ ] **Step 5: Run the full adapter test suite**

Run:
```bash
cd plugins/migration-runner && node --test tests/adapters/
```
Expected: all 7 adapter test files pass.

- [ ] **Step 6: Commit**

```bash
git add plugins/migration-runner/scripts/adapters/csharp.js plugins/migration-runner/test-fixtures/csharp/ plugins/migration-runner/tests/adapters/csharp.test.js
git commit -m "feat(migration-runner): csharp adapter (dotnet CLI + NuGet flat container)"
```

---

## Task 14: migration-detector agent

**Files:**
- Create: `plugins/migration-runner/agents/migration-detector.md`

- [ ] **Step 1: Write the agent definition**

Write `plugins/migration-runner/agents/migration-detector.md`:

```markdown
---
name: migration-detector
description: >
  migration-runner pipeline agent that reports outdated dependencies in ONE ecosystem.
  Calls the ecosystem adapter via Bash and returns a strict JSON object with the outdated list.
  Invoked once per ecosystem detected in the repo.
model: haiku
color: blue
---

You are a focused detector that produces a single JSON object describing outdated dependencies for ONE ecosystem in this repository. Do nothing else.

## Inputs

- ECOSYSTEM: one of `npm`, `python`, `go`, `rust`, `java`, `kotlin`, `csharp`. Provided in the dispatch prompt.
- REPO_ROOT: the working directory of the user's repo. Default: current directory.

## Steps

1. Verify the ecosystem manifest exists by running:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/adapter.js" <ECOSYSTEM> detect
   ```
   If the command prints empty output, return:
   ```json
   { "ecosystem": "<ECOSYSTEM>", "manifest_path": null, "outdated": [] }
   ```

2. Otherwise, get the outdated list:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/adapter.js" <ECOSYSTEM> list-outdated
   ```

3. Combine the manifest_path from step 1 with the outdated array from step 2 and return:
   ```json
   {
     "ecosystem": "<ECOSYSTEM>",
     "manifest_path": "<from step 1>",
     "outdated": [ { "name": "...", "current": "...", "latest_known": "..." }, ... ]
   }
   ```

## Rules

- Output ONLY the JSON object. No prose. No code fences in your final response.
- If a command exits non-zero, capture the stderr and return:
  ```json
  { "ecosystem": "<ECOSYSTEM>", "manifest_path": null, "outdated": [], "error": "<stderr trimmed to 500 chars>" }
  ```
- Do not edit any files. Do not call any other tools beyond Bash.
- Validate your output against `${CLAUDE_PLUGIN_ROOT}/schemas/detector-output.schema.json` mentally before returning.
```

- [ ] **Step 2: Smoke-test by reading the file back**

Run:
```bash
test -f plugins/migration-runner/agents/migration-detector.md && echo OK
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add plugins/migration-runner/agents/migration-detector.md
git commit -m "feat(migration-runner): migration-detector agent (per-ecosystem outdated query)"
```

---

## Task 15: migration-planner agent

**Files:**
- Create: `plugins/migration-runner/agents/migration-planner.md`

- [ ] **Step 1: Write the agent definition**

Write `plugins/migration-runner/agents/migration-planner.md`:

```markdown
---
name: migration-planner
description: >
  migration-runner pipeline agent that turns merged detector output into a wave-ordered
  upgrade plan. For each outdated package, queries OSV.dev and the ecosystem registry,
  applies the version-ranker (safety vs recency), topologically sorts, and writes
  docs/migration-runner/migration-plan.md and plan.json.
model: sonnet
color: gold
---

You are the planner. Take the merged outdated list from N detectors and produce a complete plan.

## Inputs

- DETECTOR_OUTPUTS: JSON array of detector results, one per ecosystem.
- ALLOW_MAJOR: boolean, from the user's --allow-major flag.
- IGNORE: array of package-name globs to exclude (from .migration-runner.json if present).
- SOAK_DAYS: integer, default 14.

## Steps

1. **Flatten** DETECTOR_OUTPUTS into a single list of `{ ecosystem, manifest_path, name, current }` items. Filter out any item whose `name` matches any IGNORE pattern (use shell-glob semantics; `*` matches any chars, `?` matches one).

2. **Query OSV.dev in batch** for the (ecosystem, name, current) triples and again for each candidate version (after step 3 produces them). Use:
   ```
   echo '<json array>' | node "${CLAUDE_PLUGIN_ROOT}/scripts/osv-client.js" query
   ```
   **If the OSV call fails** (network error, 5xx, timeout): print one warning line to stdout (`warn: OSV.dev unreachable; proceeding without vuln data`), set the in-memory `vulnsByVersion` to `{}` for every package, and continue. Each affected wave's rationale must include the literal string `vuln data unavailable`. Do NOT abort the run.

3. **Query each ecosystem registry** for available versions:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/adapter.js" <ecosystem> list-versions <name>
   ```

4. **Run the version-ranker** for each package:
   ```
   echo '<{currentVersion, candidates, vulnsByVersion, opts} json>' > /tmp/ranker-in.json
   node "${CLAUDE_PLUGIN_ROOT}/scripts/version-ranker.js" recommend /tmp/ranker-in.json
   ```
   Each call returns `{ target, rationale, risk, skipped }`.

5. **Build the plan**:
   - For each package where `target` is not null: append a wave object to `waves` with the next `wave_index`, the chosen `to_version`, the `rationale`, and `depends_on_waves: []`.
   - For each package whose ranker returned `risk: "major-required"` (or any cross-major version exists when ALLOW_MAJOR is false): append an entry to `available_majors` with the highest available major.

6. **Topologically sort waves** within each ecosystem so common dependency parents go first. Heuristic for v0.1: for npm, upgrade `react` before `react-dom`, `vue` before `vue-router`, `@types/X` after `X`. For other ecosystems, use insertion order. Encode the rule as a small per-ecosystem ordering hint.

7. **Order ecosystems** in the final waves list: Go, Rust, Python, npm, Java, Kotlin, C#.

8. **Write** the two output files to the user's repo:
   - `docs/migration-runner/plan.json` — schema in `${CLAUDE_PLUGIN_ROOT}/schemas/plan.schema.json`.
   - `docs/migration-runner/migration-plan.md` — human-readable, grouped by ecosystem; one section per package showing from/to, rationale, risk, OSV advisory IDs, and a "Skipped versions" subsection. Append "Available major upgrades (not planned)" appendix when `available_majors` is non-empty.

9. **If a stale `docs/migration-runner/fix-plan.md` exists**, print one line warning: `previous run halted on <package>; this plan supersedes it.` Then delete `.migration-runner/state.json` if it exists.

10. **Return** a JSON summary to the orchestrator:
    ```json
    {
      "wave_count": <int>,
      "available_majors_count": <int>,
      "plan_path": "docs/migration-runner/plan.json"
    }
    ```

## Rules

- Output ONLY the JSON summary in step 10. The plan files go to disk; the chat returns only the summary.
- If a registry call (step 3) or ranker call (step 4) fails for an individual package, omit that package from the plan and add a line to a "skipped during planning" appendix in `migration-plan.md`. Do NOT abort the whole run.
- If a fundamental step fails (cannot write `plan.json`, all detector outputs were empty), abort and return `{ "error": "<short message>" }`.
- OSV.dev failures are NOT fatal — see step 2.
- Do not run network calls outside the OSV client and adapter scripts.
- Conventional commit format for wave commit messages: `chore(deps): bump <name> from <old> to <new>`.
```

- [ ] **Step 2: Verify the file is well-formed**

Run:
```bash
test -f plugins/migration-runner/agents/migration-planner.md && head -10 plugins/migration-runner/agents/migration-planner.md
```
Expected: prints the YAML frontmatter.

- [ ] **Step 3: Commit**

```bash
git add plugins/migration-runner/agents/migration-planner.md
git commit -m "feat(migration-runner): migration-planner agent (osv + ranker + write plan files)"
```

---

## Task 16: migration-applier agent

**Files:**
- Create: `plugins/migration-runner/agents/migration-applier.md`

- [ ] **Step 1: Write the agent definition**

Write `plugins/migration-runner/agents/migration-applier.md`:

```markdown
---
name: migration-applier
description: >
  migration-runner pipeline agent that applies a single package upgrade for one wave.
  Calls the ecosystem adapter's apply-upgrade subcommand and reports the outcome.
model: sonnet
color: green
---

You are an applier. Apply ONE package upgrade and report the outcome. Do nothing else.

## Inputs

- ECOSYSTEM, MANIFEST_PATH, PACKAGE, FROM_VERSION, TO_VERSION (from the wave object in plan.json).

## Steps

1. **Re-validate** the package is still at FROM_VERSION in MANIFEST_PATH. If not, return:
   ```json
   { "status": "failed", "stderr": "package <PACKAGE> no longer at <FROM_VERSION> in <MANIFEST_PATH> (was: <observed>)" }
   ```

2. **Apply** the upgrade:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/adapter.js" <ECOSYSTEM> apply-upgrade <PACKAGE> <TO_VERSION>
   ```
   - Capture stdout and exit code.
   - On exit code 0, parse the stdout JSON `{ "success": true }` and return:
     ```json
     { "status": "applied" }
     ```
   - On non-zero exit, return:
     ```json
     { "status": "failed", "stderr": "<stderr trimmed to 1000 chars>" }
     ```

## Rules

- Output ONLY the JSON object. No prose.
- Do not run tests or builds — that is the verifier's job.
- Do not edit files directly — go through the adapter.
- Do not commit anything — the orchestrator does that.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/migration-runner/agents/migration-applier.md
git commit -m "feat(migration-runner): migration-applier agent (single-package upgrade)"
```

---

## Task 17: migration-verifier agent

**Files:**
- Create: `plugins/migration-runner/agents/migration-verifier.md`

- [ ] **Step 1: Write the agent definition**

Write `plugins/migration-runner/agents/migration-verifier.md`:

```markdown
---
name: migration-verifier
description: >
  migration-runner pipeline agent that runs the ecosystem's verify commands (build,
  typecheck, tests) after a wave's upgrade and reports pass/fail with the failed step
  and a tail of stdout.
model: sonnet
color: orange
---

You are a verifier. Run the verify command pipeline and report whether it passed. Do nothing else.

## Inputs

- ECOSYSTEM (string)
- WAVE_INDEX (integer, used to name the log file)
- TIMEOUT_SECONDS (integer, default 600)

## Steps

1. **Get the verify commands** for this ecosystem:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/adapter.js" <ECOSYSTEM> verify-commands
   ```
   Returns an object like `{ build: "...", typecheck?: "...", test?: "..." }`. Any key whose value is missing is skipped.

2. **Create** the log directory:
   ```
   mkdir -p .migration-runner/logs
   ```

3. **Run each step in order**: `build`, then `typecheck` if present, then `test` if present. For each step:
   - Run with a per-command timeout of TIMEOUT_SECONDS using:
     ```
     timeout <TIMEOUT> bash -c '<command>' >> .migration-runner/logs/wave-<NNN>.log 2>&1
     ```
     (Where `<NNN>` is WAVE_INDEX zero-padded to 3 digits.)
   - On Windows shells without `timeout(1)`, run without the wrapper but cap with the shell's own timeout. (The CLI dispatch script handles this in v0.2; v0.1 leaves the timeout to the shell.)
   - Capture exit code.

4. **On the first non-zero exit**, return:
   ```json
   {
     "status": "fail",
     "failed_step": "<build|typecheck|test>",
     "stdout_tail": "<last 200 lines of the log file>",
     "full_output_path": ".migration-runner/logs/wave-<NNN>.log"
   }
   ```

5. **If all configured steps succeed**, return:
   ```json
   { "status": "pass", "full_output_path": ".migration-runner/logs/wave-<NNN>.log" }
   ```

## Rules

- Output ONLY the JSON object. No prose.
- Never edit files. Never run git commands.
- If `verify-commands` returns an empty object, treat as pass (warn in stdout_tail: "no verify commands configured").
```

- [ ] **Step 2: Commit**

```bash
git add plugins/migration-runner/agents/migration-verifier.md
git commit -m "feat(migration-runner): migration-verifier agent (build/typecheck/test pipeline)"
```

---

## Task 18: detect skill

**Files:**
- Create: `plugins/migration-runner/skills/detect/SKILL.md`

- [ ] **Step 1: Write the skill**

Write `plugins/migration-runner/skills/detect/SKILL.md`:

````markdown
---
name: migration-runner:detect
description: >
  Scan the repo for outdated dependencies across all detected ecosystems (npm, Python,
  Go, Rust, Java, Kotlin, C#), query OSV.dev for vulnerabilities, and produce a
  vulnerability-aware upgrade plan at docs/migration-runner/migration-plan.md and plan.json.
  Recommends "latest with no unfixed HIGH/CRITICAL CVE and >=14d soak" within the current
  major; surfaces cross-major upgrades separately unless --allow-major is passed.
argument-hint: "[--allow-major] [--ecosystem npm,python,go,rust,java,kotlin,csharp]"
---

You are orchestrating a `migration-runner:detect` run. Follow these steps exactly.

## Step 0: Parse arguments

Parse `$ARGUMENTS` for:
- `--allow-major` (boolean flag, default false)
- `--ecosystem <comma-separated-list>` (optional; default = auto-detect all)

## Step 1: Read optional config

If `.migration-runner.json` exists at the repo root, read it. Extract:
- `soak_days` (default 14)
- `ignore` (array of package-name globs; default [])
- `allow_major` (override for the flag if not passed on CLI)

## Step 2: Detect present ecosystems

For each of `npm`, `python`, `go`, `rust`, `java`, `kotlin`, `csharp` (or only those in `--ecosystem` if provided), run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/adapter.js" <ecosystem> detect
```
Collect the set of ecosystems where this returns non-empty output.

## Step 3: Dispatch detector agents in parallel

For each detected ecosystem, dispatch a `migration-detector` agent (use the Agent tool, one call per ecosystem, all in a single message for parallelism).

Each detector returns:
```json
{ "ecosystem": "...", "manifest_path": "...", "outdated": [...] }
```

## Step 4: Dispatch the planner

Pass the merged detector outputs to a single `migration-planner` agent dispatch. Include in the prompt:
- DETECTOR_OUTPUTS (the array)
- ALLOW_MAJOR (resolved boolean)
- IGNORE (from config, or [])
- SOAK_DAYS (from config, or 14)

The planner writes `docs/migration-runner/plan.json` and `migration-plan.md` to the user's repo and returns a JSON summary.

## Step 5: Summarize for the user

Read `docs/migration-runner/migration-plan.md` (just the first ~100 lines for context) and write a short message to the user:

> Found N outdated packages across <ecosystems>. Wrote plan to `docs/migration-runner/migration-plan.md`.
> - X waves planned (normal: A, elevated: B)
> - Y major upgrades available (not planned; pass --allow-major to include)
>
> Next: `/migration-runner:run` to execute.

If the planner returned an error, surface it verbatim and stop.

## Rules

- Do not edit any files yourself. The planner writes the plan files.
- Do not run upgrades. This is detect-only.
- Always finish by pointing the user at the plan file.
````

- [ ] **Step 2: Commit**

```bash
git add plugins/migration-runner/skills/detect/SKILL.md
git commit -m "feat(migration-runner): detect skill (orchestrates detector + planner)"
```

---

## Task 19: run skill

**Files:**
- Create: `plugins/migration-runner/skills/run/SKILL.md`

- [ ] **Step 1: Write the skill**

Write `plugins/migration-runner/skills/run/SKILL.md`:

````markdown
---
name: migration-runner:run
description: >
  Execute the upgrade plan written by /migration-runner:detect, one package per wave,
  verifying build + typecheck + tests after each upgrade. On verifier failure: hard
  reset to pre-wave SHA, write fix-plan.md, halt. Resumable with --resume.
argument-hint: "[--package <name>] [--resume] [--ecosystem <name>]"
---

You are orchestrating a `migration-runner:run` execution. Follow these steps exactly.

## Step 0: Parse arguments

Parse `$ARGUMENTS` for:
- `--package <name>` — single-package mode
- `--resume` — continue from last non-completed wave
- `--ecosystem <name>` — restrict to one ecosystem

## Step 1: Preconditions

Run each check; abort with a clear error if any fails:
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/git-helpers.js" require-repo`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/git-helpers.js" require-clean`
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/git-helpers.js" is-detached` — if it prints `true`, abort: "detached HEAD; check out a branch first."
- Verify `docs/migration-runner/plan.json` exists; otherwise: "no plan found; run `/migration-runner:detect` first."

## Step 2: Load plan and state

Run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/state.js" read docs/migration-runner/plan.json > /tmp/plan.json
node "${CLAUDE_PLUGIN_ROOT}/scripts/state.js" read .migration-runner/state.json > /tmp/state.json || true
```

Build the wave list:
- Default: all waves from plan.json in order.
- With `--ecosystem X`: only waves where `wave.ecosystem === X`.
- With `--package X`: a single wave matching `wave.package === X`. Abort if not present.
- With `--resume`: skip waves where state shows `status: "completed"`.

Initialize state.json if missing: every wave starts as `{ wave_index, package, status: "pending" }`.

## Step 3: Execute waves sequentially

For each wave in the wave list:

1. Capture pre-wave SHA: `node "${CLAUDE_PLUGIN_ROOT}/scripts/git-helpers.js" current-sha` → `PRE_SHA`.

2. Dispatch the `migration-applier` agent with this wave's `{ ecosystem, manifest_path, package, from_version, to_version }`. Capture its return JSON.

3. If applier returned `{ "status": "failed", ... }`:
   - Run `git reset --hard <PRE_SHA>`.
   - Write `docs/migration-runner/fix-plan.md` (see Step 4).
   - Mark wave `failed` in state.json.
   - Print summary and halt with exit 1.

4. If applier returned `{ "status": "applied" }`, dispatch the `migration-verifier` agent with `{ ecosystem, wave_index, timeout_seconds: <from config or 600> }`. Capture its return JSON.

5. If verifier returned `{ "status": "fail", ... }`:
   - Run `git reset --hard <PRE_SHA>`.
   - Write `docs/migration-runner/fix-plan.md` with the verifier output (failed_step, stdout_tail, full_output_path).
   - Mark wave `failed` in state.json.
   - Print summary and halt with exit 1.

6. If verifier returned `{ "status": "pass" }`:
   - Try to commit: `node "${CLAUDE_PLUGIN_ROOT}/scripts/git-helpers.js" commit-all "chore(deps): bump <package> from <from_version> to <to_version>"`.
   - **If the commit fails** (non-zero exit; capture stderr): treat as a wave failure — run `git reset --hard <PRE_SHA>`, write `fix-plan.md` (Step 4 template) substituting the failed step as `commit` and including the git stderr in the "Last 200 lines" block, mark wave `failed`, halt.
   - Otherwise, get the new SHA via `current-sha`, update state.json: `{ status: "completed", commit_sha: "<sha>" }`, and continue to the next wave.

## Step 4: fix-plan.md template (on failure)

Write to `docs/migration-runner/fix-plan.md`:

```markdown
# migration-runner fix plan

Halted on **wave <N>**: `<package>` (<ecosystem>) <from_version> -> <to_version>.

## What failed
**Step:** <build|typecheck|test|apply>

## Last 200 lines of output
\`\`\`
<stdout_tail from verifier or stderr from applier>
\`\`\`

Full log: `<full_output_path>`

## Suggested next steps
1. Manually investigate the failure in `<package>`. The pre-wave state is restored (the wave was reverted).
2. Optionally pin a different target version by adding `<package>` to `ignore` in `.migration-runner.json` and re-running `detect`, OR manually upgrading and committing yourself.
3. Once the underlying issue is fixed (or the package excluded), resume with:

   `/migration-runner:run --resume`
```

## Step 5: Final user message

If all waves passed:

> Migration complete. Upgraded N packages across <ecosystems> in <N> commits. Run `git log` to review.

If halted:

> Halted at wave <N> (`<package>`). Wrote fix-plan to `docs/migration-runner/fix-plan.md`.
> Resume with `/migration-runner:run --resume` after addressing the issue.

## Rules

- Always halt on the first failure. Never continue past a failed wave.
- Never bypass the verifier even with --package mode.
- Always commit after a clean wave; never leave applied-but-uncommitted state.
- Do not modify the plan.json during execution.
````

- [ ] **Step 2: Commit**

```bash
git add plugins/migration-runner/skills/run/SKILL.md
git commit -m "feat(migration-runner): run skill (wave executor with rollback + fix-plan)"
```

---

## Task 20: E2E happy-path test (npm fixture)

**Files:**
- Create: `plugins/migration-runner/test-fixtures/e2e-npm-happy/package.json`
- Create: `plugins/migration-runner/tests/e2e/happy-path.test.js`

This test simulates the apply-then-verify loop end-to-end in a temp git repo, with the network calls mocked. It does not invoke the real Claude agents (those are smoke-tested manually); it tests the script-level orchestration that the skills depend on.

- [ ] **Step 1: Capture a tiny fixture project**

Write `plugins/migration-runner/test-fixtures/e2e-npm-happy/package.json`:

```json
{
  "name": "e2e-fixture",
  "version": "0.0.0",
  "scripts": {
    "build": "node -e \"console.log('build ok')\"",
    "test": "node -e \"console.log('test ok')\""
  },
  "dependencies": {
    "left-pad": "1.3.0"
  }
}
```

- [ ] **Step 2: Write the E2E test**

Write `plugins/migration-runner/tests/e2e/happy-path.test.js`:

```js
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

let REPO;

before(() => {
  REPO = fs.mkdtempSync(path.join(os.tmpdir(), "mr-e2e-happy-"));
  // Copy the fixture into a temp git repo.
  fs.copyFileSync(
    path.join(__dirname, "../../test-fixtures/e2e-npm-happy/package.json"),
    path.join(REPO, "package.json"),
  );
  execSync("git init -q && git config user.email t@t && git config user.name t", { cwd: REPO });
  execSync("git add -A && git commit -q -m initial", { cwd: REPO });
});

after(() => fs.rmSync(REPO, { recursive: true, force: true }));

test("verifyCommands runs build+test cleanly on the fixture", () => {
  const npm = require("../../scripts/adapters/npm.js");
  const cmds = npm.verifyCommands(REPO);
  for (const step of ["build", "test"]) {
    if (cmds[step]) {
      execSync(cmds[step], { cwd: REPO, stdio: "ignore" });
    }
  }
  // Reaching here means both commands exited 0.
  assert.ok(true);
});

test("git-helpers round-trip: capture SHA, write a file, commit, reset, file gone", () => {
  const { currentSha, commitAll, resetHardTo } = require("../../scripts/git-helpers.js");
  const before = currentSha(REPO);
  fs.writeFileSync(path.join(REPO, "x.txt"), "added");
  commitAll(REPO, "test commit");
  assert.notEqual(currentSha(REPO), before);
  resetHardTo(REPO, before);
  assert.equal(currentSha(REPO), before);
  assert.ok(!fs.existsSync(path.join(REPO, "x.txt")));
});

test("state read/write round-trip in repo", () => {
  const { read, write } = require("../../scripts/state.js");
  const p = path.join(REPO, ".migration-runner", "state.json");
  write(p, { plan_generated_at: "2026-05-03T00:00:00Z", waves: [{ wave_index: 1, package: "x", status: "pending" }] });
  const r = read(p);
  assert.equal(r.waves[0].package, "x");
});
```

- [ ] **Step 3: Run the E2E happy-path test**

Run:
```bash
cd plugins/migration-runner && node --test tests/e2e/happy-path.test.js
```
Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add plugins/migration-runner/test-fixtures/e2e-npm-happy/ plugins/migration-runner/tests/e2e/happy-path.test.js
git commit -m "test(migration-runner): e2e happy-path covering verify, git, state in a real repo"
```

---

## Task 21: E2E failure-path test (rollback + fix-plan + resume)

**Files:**
- Create: `plugins/migration-runner/tests/e2e/failure-path.test.js`

This test simulates a verifier failure end-to-end at the script level: write a wave-like commit, then revert it, then assert that a freshly-written `fix-plan.md` is correctly resumable.

- [ ] **Step 1: Write the failure-path test**

Write `plugins/migration-runner/tests/e2e/failure-path.test.js`:

```js
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

let REPO;
before(() => {
  REPO = fs.mkdtempSync(path.join(os.tmpdir(), "mr-e2e-fail-"));
  fs.writeFileSync(path.join(REPO, "README.md"), "init");
  execSync("git init -q && git config user.email t@t && git config user.name t", { cwd: REPO });
  execSync("git add -A && git commit -q -m initial", { cwd: REPO });
});
after(() => fs.rmSync(REPO, { recursive: true, force: true }));

test("rollback restores pre-wave SHA and removes wave changes", () => {
  const { currentSha, resetHardTo } = require("../../scripts/git-helpers.js");
  const preSha = currentSha(REPO);

  // Simulate a wave that applied changes (no commit yet).
  fs.writeFileSync(path.join(REPO, "package.json"), '{"name":"x","dependencies":{"foo":"2.0.0"}}');
  fs.writeFileSync(path.join(REPO, "package-lock.json"), '{"lockfileVersion":3}');

  // Verifier reports failure -> we revert.
  resetHardTo(REPO, preSha);

  assert.equal(currentSha(REPO), preSha);
  assert.ok(!fs.existsSync(path.join(REPO, "package.json")));
  assert.ok(!fs.existsSync(path.join(REPO, "package-lock.json")));
});

test("fix-plan.md is well-formed and resumable state is preserved", () => {
  const { write, read } = require("../../scripts/state.js");
  const fixPlan = path.join(REPO, "docs", "migration-runner", "fix-plan.md");
  const stateFile = path.join(REPO, ".migration-runner", "state.json");

  fs.mkdirSync(path.dirname(fixPlan), { recursive: true });
  fs.writeFileSync(fixPlan, "# migration-runner fix plan\n\nHalted on wave 2: lodash\n");

  // Mark waves: 1 completed, 2 failed, 3 pending (resume should pick up at 2).
  write(stateFile, {
    plan_generated_at: "2026-05-03T00:00:00Z",
    waves: [
      { wave_index: 1, package: "axios", status: "completed", commit_sha: "abc" },
      { wave_index: 2, package: "lodash", status: "failed" },
      { wave_index: 3, package: "express", status: "pending" },
    ],
  });

  const state = read(stateFile);
  const next = state.waves.find((w) => w.status !== "completed");
  assert.equal(next.wave_index, 2);
  assert.equal(next.package, "lodash");
  assert.match(fs.readFileSync(fixPlan, "utf8"), /Halted on wave 2/);
});

test("require-clean refuses to run after a partial uncommitted change", () => {
  const { requireCleanTree } = require("../../scripts/git-helpers.js");
  fs.writeFileSync(path.join(REPO, "dirty.txt"), "x");
  assert.throws(() => requireCleanTree(REPO), /dirty/i);
  fs.rmSync(path.join(REPO, "dirty.txt"));
});
```

- [ ] **Step 2: Run the failure-path test**

Run:
```bash
cd plugins/migration-runner && node --test tests/e2e/failure-path.test.js
```
Expected: 3 tests pass.

- [ ] **Step 3: Run the entire test suite**

Run:
```bash
cd plugins/migration-runner && node --test tests/
```
Expected: all tests across all files pass.

- [ ] **Step 4: Commit**

```bash
git add plugins/migration-runner/tests/e2e/failure-path.test.js
git commit -m "test(migration-runner): e2e failure path covers rollback, fix-plan, resume state"
```

---

## Task 22: README

**Files:**
- Modify: `plugins/migration-runner/README.md` (overwrite the stub)

- [ ] **Step 1: Write the full README**

Overwrite `plugins/migration-runner/README.md`:

````markdown
# migration-runner

**Vulnerability-aware dependency upgrade orchestrator across 7 ecosystems.**

`migration-runner` scans your repo for outdated dependencies, queries OSV.dev for known vulnerabilities, and produces a wave-ordered upgrade plan that prefers "the latest version with no unfixed HIGH/CRITICAL CVE and at least 14 days of release soak" — then executes the plan one package at a time with build/typecheck/test verification and clean git rollback on failure.

Supports **npm/yarn/pnpm**, **Python (pip/poetry/uv)**, **Go (modules)**, **Rust (cargo)**, **Java (Maven/Gradle)**, **Kotlin (Gradle)**, and **C# (.NET/NuGet)**.

## Install

```bash
claude plugin install migration-runner@mistervitopro-plugin-marketplace
```

## Two-step flow

```bash
/migration-runner:detect              # writes docs/migration-runner/migration-plan.md
/migration-runner:run                 # executes the plan, one wave at a time
```

### `/migration-runner:detect`

Flags:
- `--allow-major` — include cross-major-version upgrades in the plan. Default off.
- `--ecosystem <list>` — comma-separated subset (e.g., `npm,python`). Default: all detected.

Produces:
- `docs/migration-runner/migration-plan.md` — human-readable, grouped by ecosystem, one section per package with rationale and a "Skipped versions" subsection explaining why newer versions were not picked.
- `docs/migration-runner/plan.json` — machine-readable plan consumed by `run`.

### `/migration-runner:run`

Flags:
- `--package <name>` — apply a single package upgrade from the plan and exit.
- `--resume` — continue from the first non-completed wave.
- `--ecosystem <name>` — restrict the run to one ecosystem.

Per-wave:
1. Capture pre-wave git SHA.
2. Apply the package upgrade via the ecosystem's native CLI.
3. Run build + typecheck + tests.
4. **Pass:** commit `chore(deps): bump <pkg> from <old> to <new>`, continue.
5. **Fail:** `git reset --hard` to pre-wave SHA, write `fix-plan.md`, halt.

Resume after fixing with `/migration-runner:run --resume`.

## Why is the recommended version not always the latest?

Because the latest is sometimes a buggy hot-off-the-press release, and "latest" can have a known unfixed CVE. The ranker walks newest -> oldest within the current major and picks the first version that:
- has no unfixed HIGH/CRITICAL CVE in OSV.dev, AND
- was released at least 14 days ago.

Each pick comes with an auditable rationale ("4.7.2 — latest in 4.x with 21d soak; fixes CVE-2025-1234; no unfixed HIGH/CRITICAL CVEs"), so it is never magic.

For cross-major upgrades (often involving breaking changes), the plugin surfaces them in an "Available major upgrades" appendix but does not include them in the plan unless you pass `--allow-major`.

## Configuration (optional)

`.migration-runner.json` at repo root, every field optional:

```json
{
  "soak_days": 14,
  "ignore": ["@my-org/internal-*", "left-pad"],
  "verify": {
    "npm": { "test": "npm run test:ci" },
    "python": { "typecheck": "mypy src/" }
  },
  "allow_major": false,
  "verify_timeout_seconds": 600
}
```

`ignore` patterns are matched against the package name across all ecosystems. For ecosystem-scoped ignores, nest under the ecosystem key.

## Requirements

- Node.js 20+ on PATH (used for plugin scripts).
- The native CLI for each ecosystem you want to upgrade: `npm`, `pip`, `go`, `cargo`, `cargo-outdated`, `mvn` or `gradle`, `dotnet`.
- A clean git working tree when you run `/migration-runner:run` (preconditions are checked).

## Architecture

See [docs/2026-05-03-migration-runner-design.md](docs/2026-05-03-migration-runner-design.md) for the full design spec.

## License

MIT.
````

- [ ] **Step 2: Commit**

```bash
git add plugins/migration-runner/README.md
git commit -m "docs(migration-runner): full README with install, flow, ranker explanation, config"
```

---

## Task 23: Register in marketplace + update root docs

**Files:**
- Modify: `.claude-plugin/marketplace.json`
- Modify: `README.md` (root)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the plugin to marketplace.json**

Edit `.claude-plugin/marketplace.json` to append a fifth plugin entry to the `plugins` array:

```json
    {
      "name": "migration-runner",
      "description": "Vulnerability-aware dependency upgrade orchestrator across 7 ecosystems (npm, Python, Go, Rust, Java, Kotlin, C#); detects outdated packages, queries OSV.dev for CVEs, recommends the safest-yet-most-recent version per package, then executes wave-by-wave with build/typecheck/test verification and clean git rollback on failure",
      "source": "./plugins/migration-runner",
      "category": "development"
    }
```

(Make sure to add a comma after the previous entry's closing brace.)

- [ ] **Step 2: Validate marketplace.json**

Run:
```bash
node -e "const m=JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8')); console.log('plugins:', m.plugins.length); m.plugins.forEach(p=>console.log(' -', p.name))"
```
Expected output:
```
plugins: 5
 - qa-swarm
 - code-atlas
 - plan-runner
 - jupiter
 - migration-runner
```

- [ ] **Step 3: Add a section to the root README**

Edit `README.md` and insert a new section between the existing `jupiter` section and the closing `## Installation` (or wherever fits the existing pattern). Match the surrounding format:

```markdown
### migration-runner  ![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMisterVitoPro%2Fqa-claude-market%2Fmain%2Fplugins%2Fmigration-runner%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=blue)

**Vulnerability-aware dependency upgrade orchestrator across 7 ecosystems.**

Scans for outdated packages (npm, Python, Go, Rust, Java, Kotlin, C#), queries OSV.dev for CVEs, recommends the safest-yet-most-recent target version per package, then executes wave-by-wave with build/typecheck/test verification and clean git rollback on failure. The two-step flow (`detect` then `run`) lets you review the plan before any code is touched.

```bash
claude plugin install migration-runner@mistervitopro-plugin-marketplace
/migration-runner:detect
/migration-runner:run
```
```

- [ ] **Step 4: Update CLAUDE.md**

In `CLAUDE.md`, add a fifth row to the plugins table (after `jupiter`):

```markdown
| `migration-runner` | 0.1.0 | Vulnerability-aware dependency upgrade orchestrator across 7 ecosystems (npm, Python, Go, Rust, Java, Kotlin, C#) -- detect produces a vuln-aware plan; run executes wave-by-wave with verifier + git rollback |
```

And in the directory-layout block, add:
```
  migration-runner/.claude-plugin/plugin.json # manifest (v0.1.0)
```

In the Architecture > Directory Map block, add:
```
  migration-runner/         # Vuln-aware multi-ecosystem dependency upgrader (v0.1.0)
    .claude-plugin/         # Plugin manifest and metadata
    agents/                 # 4 agents (detector, planner, applier, verifier)
    skills/                 # User-facing commands: detect, run
    scripts/                # CLI tools: adapter dispatcher, OSV client, version-ranker, state, git-helpers
    schemas/                # JSON Schemas for plan, state, agent outputs
    test-fixtures/          # Per-ecosystem captured CLI output fixtures
    tests/                  # node --test suite for adapters, ranker, e2e
    hooks/                  # SessionStart hook (.migration-runner/ gitignore)
```

- [ ] **Step 5: Run the full plugin test suite one last time**

Run:
```bash
cd plugins/migration-runner && node --test tests/
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add .claude-plugin/marketplace.json README.md CLAUDE.md
git commit -m "feat: register migration-runner v0.1.0 in marketplace, root README, CLAUDE.md"
```

- [ ] **Step 7: Tag the release**

```bash
git tag migration-runner/v0.1.0
git push origin main migration-runner/v0.1.0
```

---

## Done

After Task 23: `migration-runner` v0.1.0 is published, the marketplace surfaces it, the test suite is green, and users can install with `claude plugin install migration-runner@mistervitopro-plugin-marketplace`.
