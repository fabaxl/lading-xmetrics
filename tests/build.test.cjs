"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(
  process.env.LANDING_ROOT || path.join(__dirname, ".."),
);
const { build } = require(path.join(root, "scripts/build.cjs"));

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "xmetrics-build-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const entry of ["index.html", "404.html", "static", "_routes.json"]) {
    fs.cpSync(path.join(root, entry), path.join(directory, entry), {
      recursive: true,
    });
  }
  return directory;
}

function files(directory, prefix = "") {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.join(prefix, entry.name);
      return entry.isDirectory()
        ? files(path.join(directory, entry.name), relative)
        : [relative];
    })
    .sort();
}

test("build publishes only whitelisted files and clears stale output", (t) => {
  const source = fixture(t);
  for (const filename of [".env", ".dev.vars", "README.md", "package.json", "vercel.json"]) {
    fs.writeFileSync(path.join(source, filename), "must stay private");
  }
  fs.writeFileSync(path.join(source, "static/.env"), "must stay private");
  fs.mkdirSync(path.join(source, "dist"));
  fs.writeFileSync(path.join(source, "dist/stale.txt"), "remove on rebuild");
  const expected = [
    "404.html",
    "index.html",
    "_routes.json",
    ...files(path.join(root, "static"), "static"),
  ].sort();
  const output = build(source);
  assert.equal(output, path.join(source, "dist"));
  assert.deepEqual(files(output), expected);
  for (const filename of expected) {
    assert.deepEqual(
      fs.readFileSync(path.join(output, filename)),
      fs.readFileSync(path.join(root, filename)),
      `Build must preserve ${filename}`,
    );
  }
  build(source);
  assert.deepEqual(files(output), expected, "Rebuild remains deterministic");
});

test("build rejects public symlinks instead of copying external data", (t) => {
  const source = fixture(t);
  const privateFile = path.join(source, "private.txt");
  fs.writeFileSync(privateFile, "not a public asset");
  fs.symlinkSync(privateFile, path.join(source, "static/leak.txt"));
  assert.throws(() => build(source), /must not be symlinks/);
});

test("404 is branded, script-free and resolves links from nested paths", () => {
  const html = fs.readFileSync(path.join(root, "404.html"), "utf8");
  assert.match(html, /<html lang="es">/);
  assert.match(html, /Página no encontrada · xMetrics/);
  assert.match(html, /<h1>Esta página no está disponible\.<\/h1>/);
  assert.match(html, /href="\/static\/css\/landing\.css"/);
  assert.match(html, /href="\/">Volver al inicio/);
  assert.doesNotMatch(html, /<script|http-equiv="refresh"|mailto:/i);
  assert.match(html, /Consulta la información de contacto en el inicio\./);
  for (const [, reference] of html.matchAll(/href="([^"]+)"/g)) {
    assert.ok(reference.startsWith("/"));
  }
});


test("Pages runs server code only for the contact endpoint", () => {
  const routes = JSON.parse(fs.readFileSync(path.join(root, "_routes.json"), "utf8"));
  assert.deepEqual(routes, {version: 1, include: ["/api/contact", "/api/contact/"], exclude: []});
});
