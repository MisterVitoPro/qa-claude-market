# migration-runner — Design Spec

**Status:** draft
**Date:** 2026-05-03
**Owner:** MisterVitoPro
**Target version:** v0.1.0

---

## 1. Summary

`migration-runner` is a Claude Code plugin that upgrades a project's dependencies safely. It runs in two steps: `detect` produces a wave-ordered upgrade plan annotated with vulnerability and recency rationale; `run` executes the plan one package per wave, verifying after each upgrade and rolling back on failure.

Unlike Dependabot or Renovate, the plugin is vulnerability-aware in its *recommendation* logic — for each outdated package it picks "the latest version with no unfixed HIGH/CRITICAL CVEs and at least 14 days of release soak" rather than blindly tracking latest.

The plugin supports seven ecosystems on day one: npm/yarn/pnpm, Python (pip/poetry/uv), Go (modules), Rust (cargo), Java (Maven/Gradle), Kotlin (Gradle), and C# (.NET/NuGet). All seven share a single core orchestration loop and one ecosystem adapter each.

## 2. Goals and non-goals

### Goals (v0.1)
- Detect outdated dependencies across all seven supported ecosystems present in a repo.
- For each outdated dependency, recommend a target version using a hybrid safety-vs-recency rule (defined in §6).
- Execute upgrades wave-by-wave (one package per wave), verifying build + typecheck + tests after each.
- Halt cleanly on failure: `git reset --hard` to the pre-wave SHA, write a `fix-plan.md`, exit. Resumable on next run.
- Support an explicit `--allow-major` opt-in for cross-major-version bumps.
- Produce per-wave git commits with conventional commit messages so the upgrade history is bisectable.

### Non-goals (v0.1)
- Cross-library swaps (e.g., Moment → date-fns). Version bumps only.
- Database / runtime data migrations. Code and dependency manifests only.
- Auto-fix attempts on verifier failure. The plugin halts honestly and writes a fix-plan; it does not try to patch on top of a failed upgrade.
- Codemods bundled with the plugin. The plugin uses each ecosystem's native upgrade CLI; if the upstream package ships its own codemod, the user runs it manually after `migration-runner` has done the version bump.
- Per-PR fan-out (one PR per upgrade). v0.1 commits to the current branch. PR fan-out is a v0.2 candidate.
- Scheduled / unattended monitor mode. Use `/schedule` to wrap `/migration-runner:detect` if needed.

## 3. Architecture overview

```
+--------------------------+         +--------------------------+
|  /migration-runner:      |         |  /migration-runner:run   |
|       detect             |         |  [--package <name>]      |
|  [--allow-major]         |         |  [--resume]              |
|  [--ecosystem npm,pip..] |         |  [--ecosystem <name>]    |
+--------------------------+         +--------------------------+
              |                                    |
              v                                    v
   +------------------+               +------------------------+
   | migration-       |               | For each wave (1 pkg)  |
   | detector         |               |  +------------------+  |
   | (per ecosystem)  |               |  | migration-       |  |
   +------------------+               |  | applier          |  |
              |                       |  +------------------+  |
              v                       |           |             |
   +------------------+               |           v             |
   | migration-       |               |  +------------------+  |
   | planner          |               |  | migration-       |  |
   | (osv + ranker)   |               |  | verifier         |  |
   +------------------+               |  +------------------+  |
              |                       |           |             |
              v                       |           v             |
   docs/migration-runner/             |  pass: git commit       |
     migration-plan.md  ------------->|  fail: git reset --hard |
     plan.json                        |        + fix-plan.md    |
                                      |        + halt           |
                                      +------------------------+
```

Two skills, four agents (detector, planner, applier, verifier). Skills orchestrate; agents do focused work; JSON contracts mediate every agent boundary.

## 4. Skills

### `/migration-runner:detect`

Flags:
- `--allow-major` — include cross-major-version recommendations in the plan. Default off.
- `--ecosystem <list>` — comma-separated subset (e.g., `npm,pip`). Default: all detected.

Behavior:
1. Walks the repo root for manifest signatures (see §6 for the full list per ecosystem).
2. For each ecosystem found, dispatches the `migration-detector` agent (parallel, one per ecosystem).
3. Merges results, hands them to the `migration-planner` agent.
4. Planner writes `docs/migration-runner/migration-plan.md` (human-readable) and `docs/migration-runner/plan.json` (machine-readable, consumed by `run`).
5. If a stale `fix-plan.md` exists from a previous halted run, prints a warning that the new plan supersedes it and wipes `state.json`.

### `/migration-runner:run`

Flags:
- `--package <name>` — apply a single package upgrade from the plan and exit. Skips wave ordering. The package and its target version come from the existing `plan.json`; `--package` does not re-plan. To get a major-version upgrade for one package, re-run `detect --allow-major` first, then `run --package <name>`.
- `--resume` — continue from the first non-completed wave in `state.json`.
- `--ecosystem <name>` — restrict the run to one ecosystem inside a multi-ecosystem plan.

Preconditions:
- Repo must be a git repo. Refuse otherwise (rollback impossible without git).
- Working tree must be clean. Refuse otherwise (auto-revert would lose uncommitted work).
- `plan.json` must exist (run `detect` first).

Behavior:
1. Reads `plan.json`. If `--resume`, reads `state.json` and skips waves with `status: "completed"`.
2. For each wave (or just the requested one with `--package`):
   - Capture pre-wave SHA via `git rev-parse HEAD`.
   - Re-validate that the package still exists in the manifest at the recorded `current` version (skip the wave with a warning if not).
   - Dispatch `migration-applier` agent → applies upgrade.
   - Dispatch `migration-verifier` agent → runs build + typecheck + tests.
   - **Pass:** `git add -A && git commit -m "chore(deps): bump <name> from <old> to <new>"`, mark wave `completed` in `state.json`, proceed.
   - **Fail:** `git reset --hard <pre-wave SHA>`, write `fix-plan.md` with the failed package, full verifier output path, suggested next steps, and resume instructions. Mark wave `failed` in `state.json`. Exit non-zero.

## 5. Agents

All agents communicate via JSON; schemas live under `plugins/migration-runner/schemas/`.

### `migration-detector` (model: haiku)
Invoked once per ecosystem. Calls the ecosystem adapter's `listOutdated(cwd)` and returns:
```json
{
  "ecosystem": "npm",
  "manifest_path": "package.json",
  "outdated": [
    { "name": "axios", "current": "1.6.7", "latest_known": "1.7.4" }
  ]
}
```

### `migration-planner` (model: sonnet)
Single invocation per `detect`. Takes the merged outdated list, queries OSV.dev in batch, calls `adapter.listAvailableVersions(name)` for each package, applies the version-ranker, topologically sorts, and emits both `plan.md` and `plan.json`. The JSON shape is in §9.

### `migration-applier` (model: sonnet)
One invocation per wave. Calls `adapter.applyUpgrade(cwd, name, version)` and verifies the manifest/lockfile actually moved. Returns:
```json
{ "status": "applied" | "failed", "stderr": "..." }
```

### `migration-verifier` (model: sonnet)
One invocation per wave. Reads `adapter.verifyCommands(cwd)` (returns null for any command not configured in the project) and runs each in order: build → typecheck → test. Stops at the first failure. Returns:
```json
{
  "status": "pass" | "fail",
  "failed_step": "test" | null,
  "stdout_tail": "...last 200 lines...",
  "full_output_path": ".migration-runner/logs/wave-007.log"
}
```

## 6. Ecosystem adapters

Located at `plugins/migration-runner/scripts/adapters/<ecosystem>.js`. Each adapter is a small Node module exporting the same five functions:

```js
{
  detect(cwd)              -> { manifest_path } | null
  listOutdated(cwd)        -> [{ name, current, latest_known }]
  listAvailableVersions(name) -> [version_string, ...]
  applyUpgrade(cwd, name, version) -> { success, stderr? }
  verifyCommands(cwd)      -> { build, typecheck?, test? }   // null per key if absent
}
```

Every adapter shells out to the native CLI; no parser reimplementation.

| Ecosystem | Manifest signatures | Outdated CLI | Upgrade CLI | Verify defaults |
|---|---|---|---|---|
| npm | `package.json` (+ `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml`) | `npm outdated --json` | `npm install <name>@<version>` | `npm run build`, `tsc --noEmit` if TS, `npm test` |
| Python | `pyproject.toml`, `requirements.txt`, `Pipfile`, `poetry.lock`, `uv.lock` | `pip list --outdated --format=json` (or `poetry show -o`, `uv pip list --outdated`) | `pip install -U <name>==<version>` (or poetry/uv equivalent) | `python -m build` if `pyproject.toml`, `mypy .` if mypy in deps, `pytest` |
| Go | `go.mod` | `go list -m -u -json all` | `go get <name>@v<version> && go mod tidy` | `go build ./...`, `go vet ./...`, `go test ./...` |
| Rust | `Cargo.toml` | `cargo outdated --format json` (requires `cargo-outdated`; fallback to manual diff against crates.io) | `cargo update -p <name> --precise <version>` | `cargo build`, `cargo check`, `cargo test` |
| Java | `pom.xml` (Maven) or `build.gradle` (Gradle) | `mvn versions:display-dependency-updates` (Maven) / `./gradlew dependencyUpdates` (Gradle, requires `versions` plugin) | `mvn versions:use-dep-version -Dincludes=<name> -DdepVersion=<version>` (Maven) / `sed`-edit `build.gradle` (Gradle) | `mvn test` / `./gradlew test` |
| Kotlin | `build.gradle.kts` | same as Java/Gradle | `sed`-edit `build.gradle.kts` | `./gradlew test` |
| C# | `*.csproj` (PackageReference) or `packages.config` | `dotnet list package --outdated --format json` | `dotnet add package <name> --version <version>` | `dotnet build`, `dotnet test` |

Package-manager auto-detection inside an ecosystem (npm vs. yarn vs. pnpm; pip vs. poetry vs. uv; Maven vs. Gradle) is done by lockfile presence in the order listed above.

## 7. Shared scripts

- `scripts/osv-client.js` — POSTs to `https://api.osv.dev/v1/querybatch`. Caches successful responses 24h in `.migration-runner/cache/osv-<sha>.json` keyed by SHA-256 of the query body.
- `scripts/version-ranker.js` — pure function implementing the ranking rule (§8). Table-driven, easily unit-tested.
- `scripts/state.js` — `read(path)` / `write(path, state)` for `state.json` and `plan.json`. Atomic write via tmp-file rename.
- `scripts/git-helpers.js` — `currentSha()`, `requireCleanTree()`, `requireGitRepo()`, `commitAll(message)`, `resetHardTo(sha)`.

## 8. Version ranker (the heart of the plugin)

`recommend(currentVersion, candidateVersions, vulnsByVersion, opts)` returns:
```json
{
  "target": "1.7.2",
  "rationale": "latest in 1.x with 21d soak; fixes CVE-2025-1234; no unfixed HIGH/CRITICAL CVEs",
  "risk": "normal" | "elevated" | "major-required",
  "skipped": [
    { "version": "1.7.4", "reason": "released 3d ago, below 14d soak floor" },
    { "version": "1.7.3", "reason": "unfixed CVE-2026-5678 (HIGH)" }
  ]
}
```

Algorithm:
1. Filter candidates to `>= currentVersion`.
2. Partition into `same_major` and `cross_major` relative to `currentVersion`.
3. For `same_major`, walk newest → oldest. The first version that satisfies BOTH:
   - has no unfixed HIGH/CRITICAL CVE in `vulnsByVersion[version]`, AND
   - was released ≥ `opts.soak_days` (default 14) days ago
   wins. Set `risk: "normal"`.
4. If no `same_major` candidate qualifies, pick the `same_major` version with the **fewest** unfixed HIGH/CRITICAL CVEs, set `risk: "elevated"`, surface the remaining CVE IDs in the rationale.
5. If `opts.allow_major` is true, repeat steps 3-4 over `cross_major` candidates and prefer the higher-version pick if it satisfies step 3.
6. If `opts.allow_major` is false, do NOT include `cross_major` in `target`. Instead, emit `available_majors: [...]` as a side channel in the planner output, with `risk: "major-required"`.

The ranker is a pure function; everything reachable from it is also pure (no I/O). All vuln data, version lists, and release dates are passed in. This makes it 100% unit-testable with table-driven tests.

**Execution behavior by risk:** `run` executes `risk: "normal"` and `risk: "elevated"` waves identically — both are part of the plan. The `elevated` flag is informational so the user can see in `migration-plan.md` and the per-wave commit message that no clean version existed. To exclude an elevated-risk wave, the user adds the package to `ignore` in `.migration-runner.yml` and re-runs `detect`.

## 9. Data formats

### `plan.json` (consumed by `run`)
```json
{
  "schema_version": "1.0",
  "generated_at": "2026-05-03T12:34:56Z",
  "soak_days": 14,
  "allow_major": false,
  "waves": [
    {
      "wave_index": 1,
      "ecosystem": "npm",
      "manifest_path": "package.json",
      "package": "axios",
      "from_version": "1.6.7",
      "to_version": "1.7.2",
      "risk": "normal",
      "rationale": "latest in 1.x with 21d soak; fixes CVE-2025-1234; no unfixed HIGH/CRITICAL CVEs",
      "depends_on_waves": []
    }
  ],
  "available_majors": [
    {
      "ecosystem": "npm",
      "package": "react",
      "from_version": "18.3.1",
      "to_version": "19.0.0",
      "rationale": "major upgrade available; not included (run with --allow-major to plan it)"
    }
  ]
}
```

### `state.json` (gitignored)
```json
{
  "plan_generated_at": "2026-05-03T12:34:56Z",
  "waves": [
    { "wave_index": 1, "package": "axios", "status": "completed", "commit_sha": "abc1234" },
    { "wave_index": 2, "package": "lodash", "status": "failed", "verifier_log": ".migration-runner/logs/wave-002.log" },
    { "wave_index": 3, "package": "express", "status": "pending" }
  ]
}
```

### `migration-plan.md` (human-readable companion to `plan.json`)
A readable Markdown report grouped by ecosystem, with one section per package showing: from/to versions, rationale, risk, link to OSV advisories cited, and a "skipped versions" subsection listing why newer versions were not chosen. Plus an "Available major upgrades (not planned)" appendix when `--allow-major` is off and majors exist.

### `fix-plan.md` (only on failure)
- The failed wave's package + from/to versions
- The verifier's failed step (build / typecheck / test)
- Tail of stdout (last 200 lines) inline; full log path for the rest
- Three suggested next-step paths (manual fix, downgrade target, exclude package)
- One-liner to resume after fixing: `/migration-runner:run --resume`

## 10. Configuration (optional)

`.migration-runner.yml` at repo root, every field optional:
```yaml
soak_days: 14
ignore:                       # global glob patterns; matched against package name across all ecosystems
  - "@my-org/internal-*"
  - "left-pad"
verify:                       # overrides per-ecosystem default verify commands
  npm:
    test: "npm run test:ci"
  python:
    typecheck: "mypy src/"
allow_major: false            # default value of --allow-major flag
verify_timeout_seconds: 600   # per-command timeout for build/typecheck/test
```

`ignore` patterns are matched against the package name as it appears in the manifest, across all ecosystems. If you need ecosystem-scoped ignores (e.g., ignore `lodash` in npm but not in any other ecosystem with the same name), nest under the ecosystem key:
```yaml
ignore:
  npm: ["lodash"]
  python: ["requests"]
```

If absent, defaults are used. The vast majority of users will not write this file.

## 11. Edge cases

| Situation | Behavior |
|---|---|
| Repo not a git repo | `run` refuses with a clear error. `detect` works fine. |
| Working tree dirty when `run` starts | Refuse with a clear error and suggest `git stash` or commit. |
| OSV.dev unreachable | `detect` warns; planner falls back to "latest with ≥ soak_days soak", marks each rationale `vuln data unavailable`. Run continues. |
| Package has no version with zero HIGH/CRITICAL CVE | Recommend the version with the fewest unfixed HIGH/CRITICAL, surface the remaining CVE IDs in rationale, set `risk: "elevated"`. |
| Multi-ecosystem repo | One unified plan ordered: Go → Rust → Python → npm → Java/Kotlin → C# (lockfile-only ecosystems first, build-heavier last). User can scope to one with `--ecosystem`. |
| Peer-dependency conflict mid-run | Treated as an applier failure → revert + fix-plan with the conflict text. |
| Package was added/removed since `detect` ran | `run` re-validates each wave's package still matches the recorded `current` version before applying; logs and skips waves whose package vanished. |
| Test suite takes > 10 min | Verifier per-command timeout (default 600s, configurable). Timeout is treated as failure. |
| User runs `detect` while a `fix-plan.md` exists | `detect` proceeds but warns: "previous run halted on `<package>`; this plan supersedes it." Stale `state.json` is wiped. |
| Same package outdated in two manifests (monorepo) | Each manifest gets its own wave; rationale notes the manifest path. |
| Single package with `--package <name>` not in plan | Refuse with a clear error: "no wave for <name> in current plan; run `detect` first or check spelling." |
| `git commit` fails (e.g. unconfigured `user.email`, hooks reject) | Treated as a wave failure: `git reset --hard` to pre-wave SHA, write `fix-plan.md` with the git error, halt. |
| Detached HEAD when `run` starts | Refuse with a clear error: "detached HEAD detected; check out a branch before running." |

## 12. Testing strategy

- **Adapter unit tests** — fixture repos under `plugins/migration-runner/test-fixtures/<ecosystem>/`, each with an intentionally outdated package. Adapter functions are pure-shell-out so tests assert the parsed JSON shape against captured `--json` output of the native CLI.
- **Version-ranker unit tests** — table-driven: `(currentVersion, candidates, vulnsByVersion, opts) -> expected { target, rationale, risk }`. Covers the same-major path, the elevated-risk path (no clean version exists), the major-required path, the allow-major path, and the soak-floor edge.
- **OSV client** — mocked via `nock` for unit tests. One live integration test gated behind a `MIGRATION_RUNNER_LIVE=1` env var.
- **End-to-end smoke per ecosystem** — fixture repo seeded with three packages (one safe minor, one vulnerable version that should be skipped, one major requiring `--allow-major`). Test runs `detect`, asserts the resulting `plan.json` shape, then runs `run` and asserts the per-wave commits and final state.
- **Failure-path E2E** — fixture where the test suite intentionally breaks after upgrading a specific package; assert the rollback restores the pre-wave SHA, `fix-plan.md` is written with the right contents, and `state.json` records the failure. Then run `--resume` after fixing the underlying issue and assert it picks up correctly.

## 13. Plugin layout

```
plugins/migration-runner/
  .claude-plugin/
    plugin.json                  # name, version (0.1.0), keywords, etc.
  agents/
    migration-detector.md
    migration-planner.md
    migration-applier.md
    migration-verifier.md
  skills/
    detect/
      SKILL.md
    run/
      SKILL.md
  scripts/
    adapters/
      npm.js
      python.js
      go.js
      rust.js
      java.js
      kotlin.js
      csharp.js
    osv-client.js
    version-ranker.js
    state.js
    git-helpers.js
    session-start.js             # invoked by hooks/hooks.json
  schemas/
    plan.schema.json
    state.schema.json
    detector-output.schema.json
    applier-output.schema.json
    verifier-output.schema.json
  hooks/
    hooks.json                   # SessionStart: gitignore .migration-runner/
  test-fixtures/
    npm/
    python/
    go/
    rust/
    java/
    kotlin/
    csharp/
  docs/
    2026-05-03-migration-runner-design.md   (this file)
  README.md
  LICENSE
```

## 14. Versioning and release

- Initial release: `migration-runner/v0.1.0` after the implementation lands and all seven ecosystem adapters smoke-test green.
- Tagging convention: `migration-runner/v<version>`, matching the rest of the marketplace.
- `plugin.json` `version` field bumped on each release so Claude Code's version cache honors the update.
- Marketplace `marketplace.json` adds the plugin entry alongside the existing four.

## 15. Open questions intentionally deferred to v0.2+

- PR fan-out mode (one PR per upgrade, optionally grouped).
- Codemod integration when the upstream package ships one (e.g., React's `npx types-react-codemod`).
- A "monitor" mode that runs on a schedule and opens a PR with a fresh plan.
- Cross-library swaps (Moment → date-fns), and the broader "framework migration guide" mode that motivated the original conversation.
- A Dockerized verify mode for projects where the host doesn't have the right toolchain installed.
