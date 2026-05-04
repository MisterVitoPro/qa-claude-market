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
  execSync("git init -q", { cwd: REPO });
  execSync("git config user.email t@t", { cwd: REPO });
  execSync("git config user.name t", { cwd: REPO });
  execSync("git add -A", { cwd: REPO });
  execSync("git commit -q -m initial", { cwd: REPO });
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
