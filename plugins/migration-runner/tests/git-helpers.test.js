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
