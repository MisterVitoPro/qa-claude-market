---
name: code-atlas:map
description: >
  Scan the repository and generate a comprehensive architecture index that gets written
  into CLAUDE.md. Includes directory structure with purpose annotations, key files,
  entry points, tech stack, dependency graph, patterns, conventions, and build commands.
  Run this once on a new codebase to give Claude a head start. Triggers on: map codebase,
  generate architecture, index the repo, document structure, create code map.
argument-hint: "<optional: path to specific directory to map, or leave blank for full repo>"
---

You are orchestrating a Code Atlas scan. Your goal is to produce a comprehensive architecture index that gets written into CLAUDE.md so that Claude understands this codebase without exploring it from scratch.

If the user provided a scoping argument: **"{$ARGUMENTS}"** — use it to narrow the scan to that directory. Otherwise, scan the full repository.

Follow this pipeline exactly. Do not skip steps.

## Timing

Track elapsed time for each phase. At the start of each step, run `date +%s` (Bash tool) to capture the Unix timestamp. Store these timestamps so you can compute durations at the end.

## Step 1: SCAN AND CATEGORIZE

Record the pipeline start time: run `date +%s` and store it as `t_start`.

### 1a. Build file tree

1. Use the Glob tool to list all source files. Exclude these directories:
   - `.git`, `node_modules`, `dist`, `build`, `out`, `target`, `vendor`
   - `__pycache__`, `.next`, `.nuxt`, `coverage`, `.tox`, `.venv`, `venv`
   - `bower_components`, `.cache`, `.parcel-cache`, `.turbo`
2. Store the full file tree (paths only).
3. Count total files and group by file extension.

### 1b. Detect primary languages

From the file extension counts, determine:
- Primary language(s) (highest file count, excluding config/docs)
- Secondary languages if present
- This informs which import patterns to look for in Step 1e

### 1c. Read configuration files

Read any of these that exist (use Read tool, launch reads in parallel):
- `package.json`, `package-lock.json` (just the top 20 lines for lock files)
- `tsconfig.json`, `jsconfig.json`
- `Cargo.toml`, `go.mod`, `go.sum` (top 20 lines)
- `pyproject.toml`, `setup.py`, `setup.cfg`, `requirements.txt`
- `Makefile`, `Rakefile`, `build.gradle`, `pom.xml`
- `Dockerfile`, `docker-compose.yml`
- `.github/workflows/*.yml` (all CI workflow files)
- `.eslintrc*`, `.prettierrc*`, `jest.config.*`, `vitest.config.*`
- `README.md` (for build/run instructions)

### 1d. Sample representative source files

For each source directory (not test, not config, not docs):
1. Select up to 3 representative source files per directory
2. Read the first 100 lines of each file using the Read tool
3. This gives the pattern agent enough context to detect conventions

Launch multiple Read calls in parallel to speed up this phase.

### 1e. Extract import statements

From ALL source files read in 1d, extract the import/require/use statements:
- JavaScript/TypeScript: `import ... from '...'`, `require('...')`
- Python: `import ...`, `from ... import ...`
- Go: `import "..."`, `import (...)`
- Rust: `use ...`, `mod ...`
- Java: `import ...`
- Other: adapt to the detected primary language

Group by source file path. This feeds the dependency agent.

### 1f. Categorize directories

Assign each directory a category based on its contents:
- **source**: application code, business logic
- **test**: test files, fixtures, mocks
- **config**: configuration files, environment setup
- **documentation**: docs, guides, READMEs
- **scripts**: build scripts, deployment scripts, tooling
- **build_output**: compiled output (should be gitignored but might exist)
- **assets**: static files, images, fonts, templates
- **migration**: database migrations, schema changes

### 1g. Print summary and confirm

```
Code Atlas -- Scan Summary
=============================
Source files: {file_count}
Directories:  {dir_count}
Primary:      {language(s)} {framework(s) if detected}

Agents to deploy:
  1. Structure Analyst   (directory map, key files, entry points)
  2. Pattern Analyst     (tech stack, conventions, build commands)
  3. Dependency Analyst  (import graph, module relationships)

Proceed? (Y/n)
```

Wait for user confirmation. If "n", stop.

Record timestamp: `t_scan_done`.

## Step 2: PARALLEL AGENT SCAN

Print:
```
[Phase 1/3] Deploying 3 Code Atlas agents in parallel...
```

Launch ALL 3 agents IN PARALLEL in a single message. Each agent gets its scoped data embedded directly -- no file paths to read.

For each agent, use this prompt template:

```
You are being deployed as part of a Code Atlas scan to generate an architecture index.

MISSION: Analyze this codebase and produce a structured map of its architecture.

IMPORTANT: All source code is provided inline below. Do NOT use the Read tool -- analyze the code directly from this prompt.

FULL FILE TREE (for reference -- paths only):
{the file tree from Step 1}

YOUR SCOPED DATA:
{the specific data for this agent}

{Read the agent definition file and include its full content here as the agent's instructions}

Analyze the data provided above according to your specialty. Return your findings as structured JSON.
```

**Agent scoping:**

1. **atlas-structure** (model: haiku):
   - Receives: full file tree + contents of entry point files + config files + directory listing
   - Read agent definition from `agents/atlas-structure.md`

2. **atlas-patterns** (model: haiku):
   - Receives: representative code samples from 1d + all config files from 1c
   - Read agent definition from `agents/atlas-patterns.md`

3. **atlas-dependencies** (model: haiku):
   - Receives: all import statements from 1e grouped by file + package manifests (package.json, Cargo.toml, go.mod, etc.)
   - Read agent definition from `agents/atlas-dependencies.md`

Wait for ALL agents to complete. If any agent fails, log it and continue:
```
Agent {name} failed: {error}
Continuing with {N}/3 agent results.
```

Record timestamp: `t_agents_done`.

## Step 3: INLINE SYNTHESIS

Print:
```
[Phase 2/3] Synthesizing architecture index...
```

**Do NOT launch an agent for this step.** Perform synthesis inline.

### 3a. Merge agent outputs

Combine the three agent results into a unified architecture index:

1. **Tech Stack** (from atlas-patterns):
   Format as a bullet list:
   ```
   - **Language(s):** {languages with version notes}
   - **Framework:** {primary framework}
   - **Build:** {build tool}
   - **Test:** {test framework}
   - **Lint:** {linter + formatter}
   - **CI:** {CI platform}
   - **Package Manager:** {package manager}
   ```
   Omit any line where no tool was detected.

2. **Directory Map** (from atlas-structure):
   Format as an indented tree with one-line annotations:
   ```
   src/
     controllers/    # HTTP request handlers, one file per resource
     services/       # Business logic layer, called by controllers
     models/         # Database models (Sequelize ORM)
   tests/
     unit/           # Unit tests, mirrors src/ structure
   ```
   Include ALL directories from the structure agent's output.

3. **Key Files** (from atlas-structure):
   Format as a markdown table:
   ```
   | File | Role | Description |
   |------|------|-------------|
   | `src/index.ts` | Entry point | Server startup, middleware registration |
   ```

4. **Patterns & Conventions** (from atlas-patterns):
   Format as a bullet list of rules Claude can follow:
   ```
   - **Architecture:** Layered MVC -- routes -> controllers -> services -> models
   - **Naming:** camelCase for files and variables, PascalCase for classes
   - **Testing:** Co-located naming (user.service.ts -> tests/unit/user.service.test.ts)
   ```

5. **Module Dependencies** (from atlas-dependencies):
   Format as an ASCII flow + high-traffic list:
   ```
   routes -> controllers -> services -> models
                                     -> utils
   config <- (imported by most modules)

   High-traffic modules:
   1. src/utils/logger.ts (12 importers)
   2. src/config/env.ts (8 importers)
   ```

6. **Build & Run Commands** (from atlas-patterns):
   Format as a markdown table:
   ```
   | Command | Purpose |
   |---------|---------|
   | `npm run dev` | Start development server with hot reload |
   ```

### 3b. Assemble the full section

Get the current git commit hash: run `git rev-parse --short HEAD`.
Get today's date.

Assemble the architecture section with sentinel markers:

```markdown
<!-- code-atlas:start -->
<!-- generated: {DATE} | commit: {SHORT_HASH} | plugin: code-atlas v1.0.0 -->

## Codebase Exploration

Before using the Explore agent or doing broad codebase searches, **always consult the Architecture section below first** (Directory Map, Key Files, Module Dependencies). It contains a pre-built map of the entire repository. Use it to orient yourself and target your exploration rather than scanning blindly. When spawning an Explore agent, include relevant architecture context in its prompt so it starts informed.

## Architecture

### Tech Stack
{tech stack from 3a}

### Directory Map
```
{directory tree from 3a}
```

### Key Files
{key files table from 3a}

### Patterns & Conventions
{conventions list from 3a}

### Module Dependencies
```
{dependency flow from 3a}
```
{high-traffic modules from 3a}

### Build & Run Commands
{commands table from 3a}

<!-- code-atlas:end -->
```

### 3c. Size check

If the assembled section exceeds 120 lines, trim:
- Collapse the dependency graph to just the `dependency_flow` one-liner
- Keep only the top 5 high-traffic modules
- Keep only the top 10 key files
- Merge minor conventions into a single line

If the repo is small (< 20 files), the section may be shorter -- that is fine. Do not pad with filler.

Record timestamp: `t_synthesis_done`.

## Step 4: WRITE TO CLAUDE.MD

Print:
```
[Phase 3/3] Writing architecture index to CLAUDE.md...
```

1. Read the existing CLAUDE.md file. If it does not exist, create one with a `# Project Instructions` header.

2. Check for existing sentinel markers:
   - If `<!-- code-atlas:start -->` and `<!-- code-atlas:end -->` markers exist, replace EVERYTHING between them (inclusive of markers) with the new section.
   - If no markers exist, append the new section at the end of CLAUDE.md.

3. Check for user-notes markers within the existing section:
   - If `<!-- user-notes:start -->` and `<!-- user-notes:end -->` exist within the old section, extract them and insert them just before `<!-- code-atlas:end -->` in the new section.

4. Write the updated CLAUDE.md using the Write tool (if creating) or Edit tool (if updating).

Record timestamp: `t_write_done`.

## Step 5: SUMMARY

Compute phase durations (format as Xm Ys):
- Scan + Categorize: `t_scan_done - t_start`
- Agent Analysis: `t_agents_done - t_scan_done`
- Synthesis: `t_synthesis_done - t_agents_done`
- Write: `t_write_done - t_synthesis_done`
- Total: `t_write_done - t_start` (minus user confirmation wait)

```
Code Atlas -- Complete
========================
Architecture index written to CLAUDE.md

Sections generated:
  - Tech Stack          ({N} tools detected)
  - Directory Map       ({N} directories annotated)
  - Key Files           ({N} files indexed)
  - Patterns            ({N} conventions identified)
  - Module Dependencies ({N} modules mapped)
  - Build Commands      ({N} commands detected)

Phase Timing:
  Scan + Categorize   {Xm Ys}
  Agent Analysis      {Xm Ys}   (3 Haiku agents in parallel)
  Synthesis           {Xm Ys}   (inline -- no agent)
  Write               {Xm Ys}
  ────────────────────────
  Total               {Xm Ys}

Claude will now read CLAUDE.md at session start and already know:
  - Where things are and what they do
  - What patterns and conventions to follow
  - How modules depend on each other
  - How to build, test, and run the project

To update after structural changes: /code-atlas:update
```
