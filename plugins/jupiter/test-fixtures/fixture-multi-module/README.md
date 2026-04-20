# Fixture: multi-module

Three fake plugins (alpha, beta, gamma) with scattered specs. Mirrors this marketplace's shape.

## Expected adoption outcome (fresh run)

- Mode detected: `module` (three `plugin.json` files)
- Buckets: `alpha`, `beta`, `gamma`, `shared`
- Specs moved:
  - `plugins/alpha/docs/2026-04-10-design.md` -> `docs/master-spec/alpha/2026-04-10-design.md`
  - `plugins/beta/docs/MASTER-SPEC.md` -> `docs/master-spec/beta/MASTER-SPEC.md`
  - `docs/2026-04-15-shared-design.md` -> `docs/master-spec/shared/2026-04-15-shared-design.md`
- Gamma has no existing spec -> `docs/master-spec/gamma/_surface.md` created with `gamma-linter` stub
- `docs/master-spec/index.json` contains 4 buckets, scan_summary.public_surface_found >= 5

## Reset after a smoke test

```bash
git reset --hard HEAD~N
git clean -fd docs/master-spec
```

Where N is the number of commits Jupiter made during the smoke test.
