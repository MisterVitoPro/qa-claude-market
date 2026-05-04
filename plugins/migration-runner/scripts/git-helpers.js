"use strict";

const { execSync } = require("child_process");

function git(cwd, args) {
  return execSync(`git ${args}`, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function currentSha(cwd) {
  return git(cwd, "rev-parse --short HEAD");
}

function requireGitRepo(cwd) {
  try {
    git(cwd, "rev-parse --git-dir");
  } catch {
    throw new Error("not a git repo: rollback would be impossible. Run inside a git repo.");
  }
}

function requireCleanTree(cwd) {
  const out = git(cwd, "status --porcelain");
  if (out.length > 0) {
    throw new Error("working tree is dirty: commit or stash before running migration-runner.");
  }
}

function isDetachedHead(cwd) {
  try {
    const out = git(cwd, "symbolic-ref -q HEAD");
    return out.length === 0;
  } catch {
    return true;
  }
}

function commitAll(cwd, message) {
  execSync(`git add -A`, { cwd });
  execSync(`git commit -m ${JSON.stringify(message)}`, { cwd });
}

function resetHardTo(cwd, sha) {
  execSync(`git reset --hard ${sha}`, { cwd });
}

// Aliases matching acceptance criteria names
function commit(cwd, message) {
  return commitAll(cwd, message);
}

function rollback(cwd, sha) {
  return resetHardTo(cwd, sha);
}

function stash(cwd) {
  execSync("git stash", { cwd });
}

module.exports = {
  currentSha,
  requireGitRepo,
  requireCleanTree,
  isDetachedHead,
  commitAll,
  resetHardTo,
  commit,
  rollback,
  stash,
};

if (require.main === module) {
  const sub = process.argv[2];
  const cwd = process.cwd();
  try {
    if (sub === "current-sha") process.stdout.write(currentSha(cwd));
    else if (sub === "require-clean") requireCleanTree(cwd);
    else if (sub === "require-repo") requireGitRepo(cwd);
    else if (sub === "is-detached") process.stdout.write(String(isDetachedHead(cwd)));
    else if (sub === "commit-all") commitAll(cwd, process.argv[3]);
    else if (sub === "reset-hard") resetHardTo(cwd, process.argv[3]);
    else { process.stderr.write("usage: git-helpers.js <subcommand> [args]\n"); process.exit(2); }
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    process.exit(3);
  }
}
