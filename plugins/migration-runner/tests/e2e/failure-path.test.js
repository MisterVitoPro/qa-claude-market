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
