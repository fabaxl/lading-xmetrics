"use strict";

// Run from the repository: node --test tests/*.test.cjs
// An external checkout can be selected with LANDING_ROOT=/absolute/path.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(
  process.env.LANDING_ROOT || path.join(__dirname, ".."),
);
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

// This scans the known static document, not arbitrary HTML. Quoted > signs
// remain inside attributes; comments are excluded from the document checks.
const tags = [
  ...html
    .replace(/<!--[\s\S]*?-->/g, "")
    .matchAll(/<([a-z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi),
].map((match) => {
  const attrs = Object.fromEntries(
    [
      ...match[2].matchAll(
        /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
      ),
    ].map((attr) => [
      attr[1].toLowerCase(),
      attr[2] ?? attr[3] ?? attr[4] ?? "",
    ]),
  );
  return { name: match[1].toLowerCase(), attrs };
});
const byId = new Map(
  tags.filter((tag) => tag.attrs.id).map((tag) => [tag.attrs.id, tag]),
);
const visibleText = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ");

function localFile(reference, relativeTo = root) {
  if (!reference || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference))
    return null;
  const clean = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
  return path.resolve(
    clean.startsWith("/") ? root : relativeTo,
    clean.replace(/^\//, ""),
  );
}

test("document is standalone Spanish HTML with xMetrics metadata", () => {
  assert.match(html, /<!doctype html>/i);
  assert.equal(tags.find((tag) => tag.name === "html")?.attrs.lang, "es");
  assert.match(html, /<title>[^<]*xMetrics[^<]+<\/title>/i);
  assert.ok(
    tags.some((tag) => tag.name === "meta" && tag.attrs.name === "viewport"),
  );
  assert.ok(
    tags.some(
      (tag) =>
        tag.name === "meta" &&
        tag.attrs.name === "description" &&
        tag.attrs.content,
    ),
  );
  assert.doesNotMatch(
    html,
    /\{%|\{\{/,
    "Django template directives must be rendered before export",
  );
});

test("all local HTML assets and CSS url references exist", () => {
  const assets = tags.flatMap((tag) => {
    if (tag.attrs.src) return [tag.attrs.src];
    if (tag.name === "link" && tag.attrs.href) return [tag.attrs.href];
    return [];
  });
  assert.ok(assets.some((asset) => asset.includes("landing.css")));
  assert.ok(assets.some((asset) => asset.includes("landing.js")));
  assert.ok(assets.some((asset) => asset.includes("landing-orbit.js")));
  for (const asset of assets) {
    const filename = localFile(asset);
    if (!filename) continue;
    assert.ok(
      filename.startsWith(root + path.sep),
      `Asset must remain inside the site: ${asset}`,
    );
    assert.ok(fs.statSync(filename).isFile(), `Missing asset: ${asset}`);
    if (path.extname(filename) !== ".css") continue;
    const css = fs.readFileSync(filename, "utf8");
    for (const match of css.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/g)) {
      const nested = localFile(match[2].trim(), path.dirname(filename));
      if (nested)
        assert.ok(
          fs.statSync(nested).isFile(),
          `Missing CSS asset: ${match[2]}`,
        );
    }
  }
});

test("document IDs are unique", () => {
  const ids = tags.map((tag) => tag.attrs.id).filter(Boolean);
  assert.ok(ids.length > 0);
  assert.equal(
    new Set(ids).size,
    ids.length,
    "Duplicate IDs break anchors, SVG symbols and controls",
  );
});

test("fragment links, SVG symbols and accessibility references resolve", () => {
  let links = 0;
  let symbols = 0;
  for (const tag of tags) {
    for (const name of ["href", "xlink:href"]) {
      const reference = tag.attrs[name];
      if (!reference?.startsWith("#") || reference === "#") continue;
      const id = decodeURIComponent(reference.slice(1));
      assert.ok(byId.has(id), `Unresolved ${tag.name} ${name}: ${reference}`);
      links += 1;
      if (tag.name === "use") {
        assert.equal(
          byId.get(id).name,
          "symbol",
          `${reference} must target an SVG symbol`,
        );
        symbols += 1;
      }
    }
    for (const name of [
      "aria-labelledby",
      "aria-describedby",
      "aria-controls",
      "for",
    ]) {
      for (const id of (tag.attrs[name] || "").split(/\s+/).filter(Boolean)) {
        assert.ok(byId.has(id), `Unresolved ${name}: ${id}`);
      }
    }
  }
  assert.ok(links > 0);
  assert.ok(symbols > 0);
});

for (const topic of [
  "NPS",
  "Business Intelligence",
  "WhatsApp",
  "correo electrónico",
  "contactabilidad",
  "spam",
]) {
  test(`visible copy explains ${topic}`, () => {
    const escaped = topic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(visibleText, new RegExp(`\\b${escaped}\\b`, "i"));
  });
}

test("unavailable AI capabilities are absent from the public landing", () => {
  assert.doesNotMatch(visibleText, /\bIA\b|inteligencia artificial|análisis de sentimiento|predicción/i);
  assert.ok(!byId.has("inteligencia"));
});

test("sample metrics remain clearly identified as illustrative", () => {
  assert.match(visibleText, /no son datos reales/);
  assert.match(visibleText, /datos ficticios/i);
});

test("every referenced local script parses successfully", () => {
  const scripts = tags.filter((tag) => tag.name === "script" && tag.attrs.src);
  assert.ok(scripts.length >= 2);
  for (const script of scripts) {
    const filename = localFile(script.attrs.src);
    assert.ok(
      filename,
      "Interaction scripts must work without a remote runtime dependency",
    );
    assert.doesNotThrow(
      () => new vm.Script(fs.readFileSync(filename, "utf8"), { filename }),
    );
    assert.ok("defer" in script.attrs, "Scripts should not block HTML parsing");
  }
});

// Minimal DOM adapter: the production IIFE and its real input handler execute
// unchanged. Only the NPS section is mounted; other optional UI is absent.
function npsHarness() {
  const ids = [
    "promoter-slider",
    "nps-score",
    "promoter-value",
    "passive-value",
    "detractor-value",
    "slider-value",
    "nps-gauge",
  ];
  const elements = new Map(
    ids.map((id) => {
      assert.ok(byId.has(id), `Required NPS element is missing: ${id}`);
      const attributes = { ...byId.get(id).attrs };
      return [
        id,
        {
          value: attributes.value,
          textContent: "",
          attributes,
          listeners: new Map(),
          style: {
            properties: new Map(),
            setProperty(name, value) {
              this.properties.set(name, value);
            },
          },
          addEventListener(name, handler) {
            this.listeners.set(name, handler);
          },
          setAttribute(name, value) {
            this.attributes[name] = String(value);
          },
        },
      ];
    }),
  );
  const document = {
    body: { classList: { toggle() {} } },
    documentElement: { classList: { add() {} } },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: (id) => elements.get(id) || null,
    addEventListener() {},
  };
  const window = {
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    dispatchEvent() {},
  };
  const source = fs.readFileSync(
    path.join(root, "static/js/landing.js"),
    "utf8",
  );
  vm.runInNewContext(
    source,
    {
      document,
      window,
      CustomEvent: class {
        constructor(type, options) {
          this.type = type;
          this.detail = options.detail;
        }
      },
    },
    { filename: "landing.js", timeout: 1000 },
  );
  return {
    get: (id) => elements.get(id),
    setPromoters(value) {
      const slider = elements.get("promoter-slider");
      slider.value = String(value);
      assert.ok(slider.listeners.has("input"), "Slider must update on input");
      slider.listeners.get("input")();
    },
  };
}

test("NPS simulator initializes from the actual HTML slider value", () => {
  const harness = npsHarness();
  assert.equal(harness.get("promoter-slider").value, "76");
  assert.equal(harness.get("nps-score").textContent, "+64");
  assert.equal(harness.get("promoter-value").textContent, "76%");
  assert.equal(harness.get("passive-value").textContent, "12%");
  assert.equal(harness.get("detractor-value").textContent, "12%");
});

test("NPS formula, percentages, accessible labels and gauge remain consistent across the entire slider range", () => {
  const harness = npsHarness();
  const slider = harness.get("promoter-slider");
  assert.equal(slider.attributes.min, "0");
  assert.equal(slider.attributes.max, "88");
  for (let promoters = 0; promoters <= 88; promoters += 1) {
    harness.setPromoters(promoters);
    const passives = 12;
    const detractors = 100 - promoters - passives;
    const score = promoters - detractors;
    const formatted = score > 0 ? `+${score}` : score < 0 ? `−${-score}` : "0";
    assert.equal(harness.get("nps-score").textContent, formatted);
    assert.equal(harness.get("promoter-value").textContent, `${promoters}%`);
    assert.equal(harness.get("passive-value").textContent, `${passives}%`);
    assert.equal(harness.get("detractor-value").textContent, `${detractors}%`);
    assert.equal(
      harness.get("slider-value").textContent,
      `${promoters} promotores`,
    );
    assert.equal(
      slider.attributes["aria-valuetext"],
      `${promoters} promotores, 12 pasivos, ${detractors} detractores. NPS ${formatted}.`,
    );
    const gauge = harness.get("nps-gauge").style.properties;
    assert.equal(gauge.get("--promoter-angle"), `${promoters * 3.6}deg`);
    assert.equal(
      gauge.get("--passive-end"),
      `${(promoters + passives) * 3.6}deg`,
    );
    assert.ok(score >= -100 && score <= 100);
    assert.ok(detractors >= 0 && promoters + passives + detractors === 100);
  }
});

test("mobile navigation and primary demo action remain available", () => {
  assert.match(html, /id="mobile-nav"/);
  assert.match(html, /aria-controls="mobile-nav"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /class="menu-toggle"/);
  assert.match(html, /Explorar demo/);
});

test("typography keeps compact labels at least 13px at every breakpoint", () => {
  const css = fs.readFileSync(
    path.join(root, "static/css/landing.css"),
    "utf8",
  );
  const sizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(
    (match) => Number(match[1]),
  );
  assert.ok(sizes.length > 0);
  assert.ok(
    sizes.every((size) => size >= 13),
    `Found undersized labels: ${sizes.filter((size) => size < 13)}`,
  );
});

test("institutional methodology and OIRS clearly distinguish the static demo", () => {
  assert.ok(byId.has("metodologia"));
  assert.ok(byId.has("experiencia"));
  assert.match(visibleText, /Captura\. Segmenta\. Actúa\./);
  assert.match(visibleText, /OIRS virtual/);
  for (const topic of [
    "Reclamos",
    "Felicitaciones",
    "Sugerencias",
    "Tiempo de espera",
    "Atención humanizada",
  ]) {
    assert.ok(
      visibleText.includes(topic),
      `Missing institutional topic: ${topic}`,
    );
  }
  assert.match(visibleText, /enfoque institucional de xMetrics/);
  assert.match(visibleText, /no recibe solicitudes OIRS/i);
  assert.equal(tags.filter((tag) => tag.name === "form").length, 1);
});

test("demo and methodology links work without advertising inactive contact channels", () => {
  const links = tags.filter((tag) => tag.name === "a");
  for (const destination of ["#metodologia", "#explorar"]) {
    assert.ok(
      links.some((tag) => tag.attrs.href === destination),
      `Missing link: ${destination}`,
    );
  }
  assert.ok(byId.has("contact"), "Legacy contact anchor must still resolve");
  assert.match(visibleText, /Explorar demostración interactiva/);
  assert.match(visibleText, /ventas@xmetrics\.cl/);
  assert.ok(
    !links.some((tag) => /^(?:mailto:|tel:|https?:\/\/wa\.me\/)/i.test(tag.attrs.href)),
    "Do not advertise contact channels before they are configured",
  );
  assert.doesNotMatch(visibleText, /bjrmetrics@gmail\.com/);
  assert.ok(
    !links.some((tag) =>
      /^https:\/\/(www\.)?xmetrics\.cl\//.test(tag.attrs.href),
    ),
    "Do not link to the institutional page being replaced",
  );
  for (const tag of links.filter((tag) => tag.attrs.target === "_blank")) {
    const rel = (tag.attrs.rel || "").split(/\s+/);
    assert.ok(rel.includes("noopener") && rel.includes("noreferrer"));
  }
});
