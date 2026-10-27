"use strict";

const fs = require("node:fs");
const path = require("node:path");

// Publish only site files, never repository metadata or local configuration.
const publicEntries = ["index.html", "404.html", "static", "_routes.json"];

function build(root = path.resolve(__dirname, "..")) {
  const output = path.join(root, "dist");
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  for (const entry of publicEntries) {
    fs.cpSync(path.join(root, entry), path.join(output, entry), {
      recursive: true,
      filter(source) {
        if (fs.lstatSync(source).isSymbolicLink()) {
          throw new Error(`Public assets must not be symlinks: ${source}`);
        }
        return !path.basename(source).startsWith(".");
      },
    });
  }
  return output;
}

if (require.main === module) console.log(`Built static site: ${build()}`);
module.exports = { build };
