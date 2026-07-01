# llm-wiki Improvement Backlog

Working document for the autonomous self-improvement loop (a 2-hour cron). Each
run picks the single highest-value unchecked item, implements it, tests it against
`D:\workspace\toolsandtaverns`, and logs the outcome. When the best-in-class
checklist is fully satisfied and the backlog has no high-value items, the loop stops.

## Best-in-class checklist (the bar)

Design standards (from the 10-agent research sweep):
- [x] Two-pass outline-then-fill generation
- [x] Pure static Markdown, no embeddings (matches Claude Code's grep/read loop)
- [x] Progressive disclosure: index (L1) / pages (L2) / state.json (L3) + SessionStart hook
- [x] Relative Markdown links, per-page frontmatter schema, traversal protocol in the index
- [x] git-blob hash-diff staleness + per-page provenance + hand-edit protection
- [x] code-atlas substrate consumption with schema-version tolerance
- [x] llms.txt / llms-full.txt spec-compliant exports
- [x] Mermaid diagrams, structural ones derived from the dependency graph

Engineering rigor (matches code-atlas / plan-runner bar):
- [x] Deterministic validator (scripts/validate.js) gating both skills
- [x] node --test suite for the validator
- [x] Deterministic finalize step (scripts/finalize.js builds state.json + llms.txt; removes LLM-driven hashing)
- [x] Coverage reporting: generate logs significant modules left undocumented (no silent caps)
- [x] Optional wiki-reviewer agent: adversarial accuracy/corroboration pass over written pages
- [x] path:line citations in pages (not just file-level), so the agent can jump precisely
- [x] Mermaid lint upgrade: catch more real flowchart breakage (subgraph/end balance, header-only). NOTE:
      "undeclared node" detection was dropped on purpose -- a bare id in a Mermaid edge is auto-declared,
      so it is valid syntax, not an error; flagging it would be a false positive.
- [ ] Backlinks written into page frontmatter (currently only computed into state.json)
- [ ] Per-page stale flags surfaced by the SessionStart hook (count of stale pages)
- [ ] package manifest + release: tag llm-wiki/v<version>, register, install

Explicitly out of scope (documented decisions, do NOT add):
- Vector/embedding RAG (deliberately rejected; would reintroduce the infra Claude Code dropped)
- Interactive "Ask-the-wiki" chat server (DeepWiki SaaS feature; the agent IS the chat layer here)

## Backlog (prioritized; pick the top unchecked each run)

P6. Backlinks into page frontmatter: finalize.js (or synthesizer) writes a computed `backlinks:` list
    into each page's frontmatter; validate.js checks it is consistent with actual inbound links.

## Done log (append newest last)

- 2026-06-27 (catOf media fix): the werewolf_sim self-scan test surfaced a categorization bug --
  finalize.js's catOf classified audio files (.mp3) as "source", so a folder of 8 sound effects
  (public/audio/sfx) showed up as an "undocumented module" in coverage (86%, 6/7). Added audio/video
  extensions (mp3|wav|ogg|m4a|flac|aac|mp4|webm|mov|avi|mkv) to the assets regex + a test. After the fix
  the werewolf_sim wiki reports 100% (6/6) coverage, gate still 0 warnings. Suite 45 tests, all pass.
  Also validated the SELF-SCAN substrate path end-to-end for the first time (werewolf_sim has no
  code-atlas index): 15 pages, gate passed clean on the FIRST pass (419 citations, 0 dangling, 0
  warnings, 0 citations needing normalization -- writers cited full paths correctly).
- 2026-06-27 (citation normalizer): scripts/normalize-citations.js + tests/normalize-citations.test.js
  (8 cases) added. Surfaced by the 38->35-page toolsandtaverns regen, where the validator caught 51
  abbreviated citations (writers wrote `downtime/types.rs:9` or `.../loot.rs:21` instead of full
  repo-relative paths). The normalizer rewrites each abbreviated `path:line` to the repo file whose
  suffix it UNIQUELY matches (strips leading ellipsis runs first), never touches a valid citation, and
  leaves ambiguous ones for validate.js to warn on. Wired before finalize in generate (Step 6.0) and
  update (Step 8.0) so content_hash reflects final content. Suite now 45 tests, all pass. Proven
  end-to-end on the real wiki: re-abbreviated one citation -> normalizer restored the full path ->
  validate 0 warnings. Idempotent (no-op on already-clean pages).

- 2026-06-27: scripts/validate.js + tests/validate.test.js (13 cases) added; wired as a gate into
  generate (Step 6b) and update (Step 8). Validates real toolsandtaverns wiki with 0 errors.
- 2026-06-27 (auto-loop iter 1, P1): scripts/finalize.js + tests/finalize.test.js (8 cases) added --
  deterministic state.json + llms.txt builder (git blob OIDs / sha256, per-page source_hashes +
  content_hash, inverse-index backlinks). Wired into generate Step 6 and update Step 8 (LLM no longer
  hand-assembles hashes). Fixed a bug found in testing: the git untracked-file pass was indexing the
  wiki's own pages/ into file_index (699 -> 678 after excluding SKIP_DIRS). Suite now 21 tests, all
  pass; finalize rebuilt the real toolsandtaverns state.json+llms.txt (678 files, 78 backlinks, 0
  missing sources) and validate.js still exits 0. NEXT RUN: P2 (coverage reporting in generate).
- 2026-06-27 (auto-loop iter 2, P2): scripts/coverage.js + tests/coverage.test.js (8 cases) added --
  reads state.json and reports significant source dirs (>= 3 files) with no owning page (a dir is
  covered if any file in it is a page source_file). Wired advisory into generate (Step 6c + summary)
  and update (Step 8 + summary). Suite now 29 tests, all pass. On the real toolsandtaverns wiki it
  reports 14/40 significant modules documented (35%); 26 undocumented (downtime 15 files,
  monster/names 14, several generators) -- the gap the ~12-page cap left, now visible instead of
  silent. validate.js still exits 0 (read-only change). NEXT RUN: P3 (optional wiki-reviewer agent).
- 2026-06-27 (auto-loop iter 3, P3): agents/wiki-reviewer.md added -- adversarial accuracy agent that
  re-reads a page against its source_files and flags unsupported/contradicted/overstated/stale/omitted
  claims with evidence. Wired as opt-in --review into generate (Step 4b: review -> re-run owning writer
  on high-severity findings -> re-review once; plus summary line). README/CLAUDE.md updated (6 agents).
  Tested live on the real toolsandtaverns wiki: reviewer caught two genuine errors -- data-flow claimed
  "21 generators" (router nests ~29) and api-reference claimed the API is GET-only (the /api/coinage
  POST routes with JSON bodies contradict it). Re-ran the two owning writers with the findings, re-ran
  finalize.js and validate.js: both pages corrected, validator exits 0, 678 files / 0 missing sources.
  Suite unchanged at 29 tests (agent change has no unit-testable surface). NEXT RUN: P4 (mermaid lint
  upgrade: detect edges referencing undeclared nodes in validate.js).
- 2026-06-27 (auto-loop iter 4, P4): upgraded the Mermaid structural lint in validate.js. Added, for
  flowchart/graph blocks only: subgraph/end balance (unclosed subgraph or stray end) and header-only
  detection (no nodes/edges -- likely truncated). Deliberately did NOT implement the backlog's original
  "undeclared node" idea: a bare id in a Mermaid edge is auto-declared, so it is valid syntax and
  flagging it would be a false positive (documented in schema-reference). Scoped to flowchart/graph so
  sequenceDiagram alt/loop `end` is not falsely flagged. Added 6 tests (incl. a sequence-diagram
  false-positive guard); suite now 34, all pass. Caught + fixed my own bug mid-run: the test edit
  dropped a describe-closing brace (load-time SyntaxError) -- repaired, re-ran green. Validator still
  exits 0 on the real toolsandtaverns wiki (its 15 diagrams, incl. subgraph/end flowcharts + sequence
  alt/end, all pass with no false positives). NEXT RUN: P5 (path:line citations in writers).
- 2026-06-27 (auto-loop iter 5, P5): path:line citations. Both writer agents now instruct citing
  load-bearing claims as `repo/relative/path.ext:line` (or :start-end) using only lines actually read,
  no over-citing. Added a deterministic guard in validate.js: extractCitations() pulls path:line tokens
  (only inside backticks, only full repo-relative paths -- prose colons, rust ::, URLs, bare filenames
  ignored) and WARNs (advisory, never errors) when a citation points to a missing file or a line past
  the file length -- catching hallucinated line numbers. Added 3 unit tests + 1 integration test (37
  total, all pass). Live test: regenerated backend-lambda-layer.md with the new instruction -> 58
  citations, ALL resolve in-range (validate reports citations=58, 0 warnings), re-finalized, validator
  exits 0. NEXT RUN: P6 (write computed backlinks into page frontmatter + validate consistency).
