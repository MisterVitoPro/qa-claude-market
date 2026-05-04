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
