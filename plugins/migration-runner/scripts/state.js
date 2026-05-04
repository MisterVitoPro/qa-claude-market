"use strict";

const fs = require("fs");
const path = require("path");

function read(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function write(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}

function initialize(p, template) {
  if (fs.existsSync(p)) return read(p);
  const initial = template || { plan_generated_at: new Date().toISOString(), waves: [] };
  write(p, initial);
  return initial;
}

// Aliases matching acceptance criteria names
const load = read;
const save = write;

module.exports = { read, write, load, save, initialize };

if (require.main === module) {
  const sub = process.argv[2];
  const file = process.argv[3];
  if (sub === "read" && file) {
    const out = read(file);
    process.stdout.write(out === null ? "" : JSON.stringify(out));
  } else if (sub === "write" && file) {
    const data = JSON.parse(fs.readFileSync(0, "utf8"));
    write(file, data);
  } else {
    process.stderr.write("usage: state.js read|write <file>\n");
    process.exit(2);
  }
}
