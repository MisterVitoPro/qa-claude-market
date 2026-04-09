# Code Atlas

Scan a codebase and generate a comprehensive architecture index for CLAUDE.md -- giving Claude a head start on understanding the project structure, patterns, and conventions.

Part of the [MisterVitoPro Plugin Marketplace](../../README.md).

Instead of exploring cold every session, Claude reads the architecture index and already knows where things are, what patterns to follow, and how to build and test the project.

## Quick Start

```bash
# Install
claude plugin marketplace add MisterVitoPro/qa-swarm --plugin code-atlas

# Generate the architecture index
/code-atlas:map

# After making structural changes, update incrementally
/code-atlas:update
```

## What Gets Generated

The `/code-atlas:map` command scans your repo and writes a `## Architecture` section into CLAUDE.md with:

| Section | What It Contains |
|---------|------------------|
| **Tech Stack** | Languages, frameworks, build tools, test frameworks, linters, CI |
| **Directory Map** | Every directory annotated with its purpose |
| **Key Files** | The 10-20 most important files with roles and descriptions |
| **Patterns & Conventions** | Architecture style, naming rules, testing patterns, import conventions |
| **Module Dependencies** | How modules depend on each other, high-traffic files, circular deps |
| **Build & Run Commands** | Dev, build, test, lint commands extracted from config files |

## How It Works

### `/code-atlas:map` — Full Scan

```
Step 1: Scan & Categorize
  - Build file tree, detect languages, read config files
  - Sample representative source files per directory
  - Extract all import/require statements

Step 2: Parallel Agent Scan (3 Haiku agents)
  - Structure Analyst:    directory map, key files, entry points
  - Pattern Analyst:      tech stack, conventions, build commands
  - Dependency Analyst:   import graph, module relationships

Step 3: Synthesis (inline, no agent)
  - Merge agent outputs into unified architecture index
  - Format as markdown sections

Step 4: Write to CLAUDE.md
  - Insert between <!-- code-atlas:start/end --> sentinel markers
  - Preserve any existing content and user notes
```

### `/code-atlas:update` — Incremental Update

Detects what changed since the last map using `git diff` against the stored commit hash:

| Change Magnitude | Strategy | Speed |
|------------------|----------|-------|
| < 5 files changed, no new dirs | **Micro-update** — adjust inline, no agents | Seconds |
| 5-30 files or 1-2 new dirs | **Targeted update** — 1 Haiku agent for changed areas | ~30s |
| > 30 files or major restructure | **Full re-scan** — all 3 agents | ~1-2min |

Pass `full` to force a complete re-scan: `/code-atlas:update full`

### SessionStart Hook — Auto-Staleness Detection

At session start, the hook silently checks if the architecture index is current:

- **Index is current** — silent, no output
- **5-10 files changed** — prints a one-line suggestion to update
- **10+ files changed** — auto-runs a micro-update
- **No index exists** — prints a tip to run `/code-atlas:map`

## User Notes

To add your own notes that survive regeneration, wrap them in markers:

```markdown
<!-- user-notes:start -->
### Custom Architecture Notes
- The auth module uses a custom JWT implementation (not a library) for historical reasons
- The legacy/ directory is being migrated; do not add new code there
<!-- user-notes:end -->
```

These are preserved across both `/code-atlas:update` and `/code-atlas:map` runs.

## Agent Roster

| Agent | Specialty | Model |
|-------|-----------|-------|
| Structure Analyst | Directory tree, key files, entry points, module boundaries | Haiku |
| Pattern Analyst | Tech stack, architecture patterns, naming conventions, build commands | Haiku |
| Dependency Analyst | Import graph, high-traffic modules, circular deps, external packages | Haiku |

## Example Output

After running `/code-atlas:map` on a typical Express.js project, CLAUDE.md gets:

```markdown
<!-- code-atlas:start -->
<!-- generated: 2026-04-08 | commit: abc1234 | plugin: code-atlas v1.0.0 -->

## Architecture

### Tech Stack
- **Language(s):** TypeScript (strict mode)
- **Framework:** Express.js 4.x
- **Build:** esbuild via npm scripts
- **Test:** Jest + supertest
- **Lint:** ESLint (airbnb config) + Prettier
- **CI:** GitHub Actions

### Directory Map
src/
  controllers/    # HTTP request handlers, one file per resource
  services/       # Business logic layer, called by controllers
  models/         # Database models (Sequelize ORM)
  middleware/     # Express middleware (auth, validation, error handling)
  routes/         # Route definitions, maps URLs to controllers
  utils/          # Shared utilities (logging, date helpers, crypto)
tests/
  unit/           # Unit tests, mirrors src/ structure
  integration/    # API integration tests using supertest

### Key Files
| File | Role | Description |
|------|------|-------------|
| `src/index.ts` | Entry point | Server startup, middleware registration |
| `src/config/env.ts` | Configuration | Loads and validates environment variables |
| `src/routes/index.ts` | Route registry | Mounts all route modules |

### Patterns & Conventions
- **Architecture:** Layered MVC -- routes -> controllers -> services -> models
- **Naming:** camelCase for files, PascalCase for classes
- **Testing:** user.service.ts -> tests/unit/user.service.test.ts

### Module Dependencies
routes -> controllers -> services -> models
                                  -> utils

High-traffic modules:
1. src/utils/logger.ts (12 importers)
2. src/config/env.ts (8 importers)

### Build & Run Commands
| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server with hot reload |
| `npm test` | Run all tests (Jest) |
| `npm run lint` | Run ESLint |

<!-- code-atlas:end -->
```

## License

MIT
