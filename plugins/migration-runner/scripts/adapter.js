#!/usr/bin/env node
"use strict";

const ECOSYSTEMS = ["npm", "python", "go", "rust", "java", "kotlin", "csharp"];

async function main() {
  const [, , eco, sub, ...rest] = process.argv;
  if (!ECOSYSTEMS.includes(eco)) {
    process.stderr.write(`error: unknown ecosystem: ${eco}\nvalid: ${ECOSYSTEMS.join(", ")}\n`);
    process.exit(2);
  }
  const adapter = require(`./adapters/${eco}.js`);
  const cwd = process.env.MIGRATION_RUNNER_CWD || process.cwd();

  try {
    if (sub === "detect") {
      const out = adapter.detect(cwd);
      process.stdout.write(out === null ? "" : JSON.stringify(out));
    } else if (sub === "list-outdated") {
      process.stdout.write(JSON.stringify(adapter.listOutdated(cwd)));
    } else if (sub === "list-versions") {
      const name = rest[0];
      const versions = await adapter.listAvailableVersions(name);
      process.stdout.write(JSON.stringify(versions));
    } else if (sub === "apply-upgrade") {
      const [name, version] = rest;
      const r = adapter.applyUpgrade(cwd, name, version);
      process.stdout.write(JSON.stringify(r));
      if (!r.success) process.exit(4);
    } else if (sub === "verify-commands") {
      process.stdout.write(JSON.stringify(adapter.verifyCommands(cwd)));
    } else {
      process.stderr.write("usage: adapter.js <ecosystem> <detect|list-outdated|list-versions|apply-upgrade|verify-commands> [args]\n");
      process.exit(2);
    }
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    process.exit(3);
  }
}

main();
