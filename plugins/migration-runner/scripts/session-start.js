#!/usr/bin/env node
// migration-runner SessionStart hook.
// If .gitignore exists in CWD and does not contain ".migration-runner/", append it.
// Exits silently on any failure.

const fs = require("fs");
const path = require("path");

const GITIGNORE = path.join(process.cwd(), ".gitignore");
const ENTRY = ".migration-runner/";

try {
  if (!fs.existsSync(GITIGNORE)) {
    process.exit(0);
  }
  const contents = fs.readFileSync(GITIGNORE, "utf8");
  if (contents.split(/\r?\n/).some((line) => line.trim() === ENTRY)) {
    process.exit(0);
  }
  const lead = contents.length > 0 && !contents.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(GITIGNORE, `${lead}${ENTRY}\n`);
  process.exit(0);
} catch {
  process.exit(0);
}
