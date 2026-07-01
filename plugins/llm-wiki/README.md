# llm-wiki

**Turns your codebase into a navigable, version-controlled wiki -- written for both new engineers and Claude's per-task context.**

`llm-wiki` generates a multi-page Markdown wiki under `.llm-wiki/` from your repository. It is the *prose layer* that complements [`code-atlas`](../code-atlas/): where code-atlas produces a machine-first JSON dependency graph ("what connects to what"), llm-wiki writes the human-and-agent-readable narrative ("how and why"). When a code-atlas index is present, llm-wiki consumes it as ground truth; otherwise it self-scans.

It is engineered for **on-demand retrieval as agent memory**: a small index loads at session start, and Claude reads exactly one page per task instead of grepping the repo from scratch -- while the same pages stay perfectly readable for humans onboarding to the project.

## Why it is different

The "AI codebase wiki" space is crowded, so llm-wiki commits to a narrow, defensible niche -- a triad nothing else in this marketplace covers:

1. **Generated from / consistent with code-atlas.** Reuses the dependency graph as ground truth, so architecture and dependency diagrams are derived from real edges, not hallucinated.
2. **On-demand LLM context retrieval, not just a human site.** Progressive disclosure (index -> page), per-page token budgets, a SessionStart hook, and `source_files` provenance on every page.
3. **First-class staleness detection.** Git-blob hash-diffing maps changed source files to the exact pages they feed, so only stale pages regenerate -- and a stale wiki never silently misleads.

It is **additive depth beneath `CLAUDE.md`**: CLAUDE.md is the index card, the wiki is the manual it points to.

## Design choices

- **Pure static Markdown, no embeddings.** Claude Code already greps and reads; a markdown wiki drops straight into that loop, stays fresh, is auditable, and adds zero runtime dependencies. (Vector search would reintroduce exactly the RAG infra Claude Code dropped.)
- **Two-pass generation: outline then fill.** A planner decides the page set first; writers then fill each page from scoped source -- the move that keeps generated wikis grounded and consistently shaped.
- **Relative Markdown links, not wikilinks.** The link target is a resolvable path with no resolver step -- the most parseable form for an agent, and it renders on GitHub.
- **Mermaid diagrams**, with structural ones derived deterministically from the dependency graph.

## Usage

```bash
claude plugin install llm-wiki@mistervitopro-plugin-marketplace

# Best results: run code-atlas first so llm-wiki reuses its dependency graph
/code-atlas:map

/llm-wiki:generate                 # build the full wiki under .llm-wiki/
/llm-wiki:generate src/api         # scope to a subdirectory
/llm-wiki:generate --llms-full     # also emit llms-full.txt for external agents
/llm-wiki:update                   # incrementally refresh only stale pages
/llm-wiki:update full              # force a complete rebuild
```

A `SessionStart` hook loads `.llm-wiki/index.md` into context automatically on future sessions (Node must be on `PATH`).

## What it writes

```
.llm-wiki/
  index.md            # navigation index, injected at session start (committed)
  pages/<slug>.md     # one page per subsystem/concept/reference (committed)
  state.json          # provenance + hash cache (gitignored)
  llms.txt            # llms.txt-format export for external agents (committed)
  llms-full.txt       # all pages concatenated (gitignored, --llms-full only)
```

The pages and index are the deliverable and are meant to be committed; only the cache and the heavy full export are gitignored. See [docs/schema-reference.md](docs/schema-reference.md) for exact shapes.

## Pipeline

| Phase | Agent(s) | Role |
|-------|----------|------|
| Setup | (inline) | Build the file-hash index; reuse code-atlas or self-scan |
| Plan | `wiki-planner` | Decide the page set; file-disjoint waves of <=6 writers |
| Diagrams | `wiki-diagram-author` | Mermaid component/dependency/sequence diagrams from the graph |
| Write | `wiki-overview-writer`, `wiki-module-writer` | One page per writer, each owns one output file, parallel waves |
| Review (opt-in) | `wiki-reviewer` | `--review`: verify each page against its source files; flag and fix unsupported claims |
| Synthesize | `wiki-index-synthesizer` | Build `index.md`, validate cross-links |
| Normalize | (inline, `scripts/normalize-citations.js`) | Expand abbreviated `path:line` citations to full repo-relative paths |
| Finalize | (inline, `scripts/finalize.js`) | Deterministically build `state.json` (hashes, backlinks, provenance) + `llms.txt` |
| Validate | (inline, `scripts/validate.js`) | Deterministic gate: frontmatter, cross-links, Mermaid lint, index honesty |
| Coverage | (inline, `scripts/coverage.js`) | Report significant source modules left undocumented (no silent caps) |

Auto-detects Claude Code Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) for token-lean orchestration, with a subagent fallback.

## Validation

Generation is the easy part; trustworthiness is the differentiator -- a wrong page misleads an agent more than no page. Both skills run a dependency-free deterministic validator (`scripts/validate.js`) as a gate before reporting success: it checks page frontmatter and enums, resolves every cross-link and index link, verifies `page_count`/`broken_link_count` honesty, and structurally lints every Mermaid block (known diagram type, balanced brackets, closed fence, balanced `subgraph`/`end`). It exits non-zero on any error so a wiki that would mislead never ships.

```bash
node scripts/validate.js .llm-wiki           # human report; --json for machine output
node scripts/normalize-citations.js --wiki .llm-wiki   # expand abbreviated path:line citations
node scripts/finalize.js --wiki .llm-wiki --input in.json  # rebuild state.json + llms.txt deterministically
node --test plugins/llm-wiki/tests/*.test.js # validator + finalizer + coverage + normalizer suites
```

## License

MIT. See [LICENSE](LICENSE).
