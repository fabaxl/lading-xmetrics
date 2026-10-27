"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const root = path.resolve(process.env.LANDING_ROOT || path.join(__dirname, ".."));
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const source = fs.readFileSync(path.join(root, "static/js/landing-contact.js"), "utf8");
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const reply = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => data });

function harness({ config = reply(200, { enabled: true, siteKey: "test-public-key" }), scriptFails = false } = {}) {
  const listeners = new Map();
  const requests = [];
  const scripts = [];
  const timers = new Map();
  const answers = [config];
  let renderOptions;
  let resetCount = 0;
  let uuidCount = 0;
  const inputs = Object.fromEntries(["name", "email", "organization", "message", "website", "consent"].map((name) => [name, {
    name, value: "", checked: false, validityMessage: "",
    setCustomValidity(message) { this.validityMessage = message; },
  }]));
  const form = {
    elements: { namedItem: (name) => inputs[name] },
    attributes: {},
    addEventListener: (name, listener) => listeners.set(name, listener),
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    reportValidity: () => !Object.values(inputs).some((field) => field.validityMessage) && inputs.consent.checked && /.+@.+\..+/.test(inputs.email.value),
    reset() { for (const field of Object.values(inputs)) { field.value = ""; field.checked = false; } },
  };
  const nodes = {
    "contact-form": form,
    "contact-fields": { disabled: true },
    "contact-submit": { disabled: true, textContent: "Enviar consulta" },
    "contact-status": { dataset: {}, textContent: "" },
    "contact-turnstile": {},
  };
  const turnstile = {
    render(_target, options) { renderOptions = options; return "test-widget"; },
    reset(id) { assert.equal(id, "test-widget"); resetCount++; },
  };
  const window = { turnstile, crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCount).padStart(12, "0")}` } };
  const document = {
    getElementById: (id) => nodes[id],
    createElement: () => ({}),
    head: { append(script) { scripts.push(script); queueMicrotask(() => scriptFails ? script.onerror() : script.onload()); } },
  };
  vm.runInNewContext(source, {
    document, window, AbortController,
    fetch: async (url, options) => {
      requests.push({ url, ...options, body: options.body ? JSON.parse(options.body) : undefined });
      const answer = answers.shift();
      if (answer instanceof Error) throw answer;
      if (typeof answer === "function") return answer(options);
      if (!answer) throw new Error("Unexpected request in test");
      return answer;
    },
    setTimeout: (callback, delay) => { const id = Symbol(); timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
  }, { filename: "landing-contact.js", timeout: 1000 });
  return {
    nodes, inputs, requests, scripts, answers, timers,
    options: () => renderOptions,
    resetCount: () => resetCount,
    fill() {
      Object.assign(inputs.name, { value: "Equipo Demo" });
      Object.assign(inputs.email, { value: "demo@example.test" });
      Object.assign(inputs.organization, { value: "Organización de prueba" });
      Object.assign(inputs.message, { value: "Quisiera conocer las funcionalidades de xMetrics." });
      inputs.consent.checked = true;
    },
    token: (value = "test-token") => renderOptions.callback(value),
    input: (name) => listeners.get("input")({ target: inputs[name] }),
    submit: () => listeners.get("submit")({ preventDefault() {} }),
  };
}

test("contact markup is accessible, constrained and disabled without JavaScript", () => {
  assert.match(html, /<script defer src="\.\/static\/js\/landing-contact\.js"><\/script>/);
  assert.match(html, /<fieldset id="contact-fields" disabled>/);
  assert.match(html, /id="contact-submit"[^>]*disabled/);
  for (const name of ["name", "email", "organization", "message", "consent"]) {
    assert.match(html, new RegExp(`for="contact-${name}"`));
    assert.match(html, new RegExp(`id="contact-${name}"`));
  }
  assert.match(html, /id="contact-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /name="website"[^>]*tabindex="-1"[^>]*autocomplete="off"/);
  assert.match(html, /No incluyas datos de pacientes ni información clínica/);
  assert.match(html, /No me suscribo a campañas ni a envíos publicitarios/);
  assert.match(html, /href="#contact">Contacto/);
  assert.match(html, /Explorar demostración interactiva/);
  assert.doesNotMatch(html, /mailto:/);
});

for (const [name, config] of [
  ["missing configuration", reply(200, { enabled: false, siteKey: null })],
  ["missing endpoint", reply(404, { error: "unavailable" })],
  ["empty site key", reply(200, { enabled: true, siteKey: " " })],
  ["network failure", new Error("offline")],
]) {
  test(`${name} fails closed without loading Turnstile or posting`, async () => {
    const h = harness({ config });
    await settle();
    await h.submit();
    assert.equal(h.nodes["contact-submit"].disabled, true);
    assert.equal(h.nodes["contact-fields"].disabled, true);
    assert.match(h.nodes["contact-status"].textContent, /Estamos habilitando el formulario/);
    assert.equal(h.scripts.length, 0);
    assert.equal(h.requests.length, 1);
  });
}

test("Turnstile only enables submit for a fresh token and uses official explicit rendering", async () => {
  const h = harness();
  await settle();
  assert.equal(h.scripts[0].src, "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
  assert.equal(h.options().action, "contact");
  assert.equal(h.options().size, "flexible");
  assert.equal(h.options().theme, "dark");
  assert.equal(h.nodes["contact-submit"].disabled, true);
  h.token();
  assert.equal(h.nodes["contact-submit"].disabled, false);
  h.options()["expired-callback"]();
  assert.equal(h.nodes["contact-submit"].disabled, true);
  h.token();
  h.options()["error-callback"]();
  assert.equal(h.nodes["contact-submit"].disabled, true);
  await h.submit();
  assert.equal(h.requests.length, 1);
});

test("blocked Turnstile script leaves the form unavailable", async () => {
  const h = harness({ scriptFails: true });
  await settle();
  assert.equal(h.nodes["contact-submit"].disabled, true);
  assert.equal(h.nodes["contact-fields"].disabled, true);
  assert.match(h.nodes["contact-status"].textContent, /Estamos habilitando/);
});

test("valid submission sends minimal JSON and only 200 ok clears fields", async () => {
  const h = harness();
  await settle();
  h.fill(); h.token();
  h.answers.push(reply(200, { ok: true }));
  await h.submit();
  const sent = h.requests[1];
  assert.equal(sent.url, "./api/contact");
  assert.equal(sent.method, "POST");
  assert.equal(sent.credentials, "omit");
  assert.deepEqual(Object.keys(sent.body).sort(), ["consent", "email", "message", "name", "organization", "submissionId", "turnstileToken", "website"].sort());
  assert.equal(sent.body.consent, true);
  assert.equal(sent.body.website, "");
  assert.equal(sent.body.turnstileToken, "test-token");
  assert.match(sent.body.submissionId, /^[\da-f-]{36}$/);
  assert.equal(h.inputs.message.value, "");
  assert.equal(h.nodes["contact-status"].textContent, "Tu consulta fue enviada a ventas@xmetrics.cl.");
  assert.equal(h.nodes["contact-status"].dataset.state, "success");
  assert.equal(h.resetCount(), 1);
  assert.equal(h.nodes["contact-submit"].disabled, true);
});

test("trimmed minimum length and consent are checked before posting", async () => {
  const h = harness();
  await settle();
  h.fill(); h.token();
  h.inputs.name.value = "   ";
  await h.submit();
  assert.equal(h.requests.length, 1);
  assert.ok(h.inputs.name.validityMessage);
  h.inputs.name.value = "Demo"; h.inputs.consent.checked = false;
  await h.submit();
  assert.equal(h.requests.length, 1);
});

for (const code of ["verification_failed", "delivery_failed", "delivery_uncertain", "duplicate_submission", "invalid_request", "<script>raw provider secret</script>"]) {
  test(`error ${code} retains text, resets token and never exposes provider text`, async () => {
    const h = harness();
    await settle();
    h.fill(); h.token();
    const original = h.inputs.message.value;
    h.answers.push(reply(503, { error: code }));
    await h.submit();
    assert.equal(h.inputs.message.value, original);
    assert.equal(h.nodes["contact-status"].dataset.state, "error");
    assert.doesNotMatch(h.nodes["contact-status"].textContent, /raw provider|<script>|Tu consulta fue enviada/);
    assert.equal(h.resetCount(), 1);
    assert.equal(h.nodes["contact-submit"].disabled, true);
  });
}

test("an unavailable server disables future submission", async () => {
  const h = harness(); await settle(); h.fill(); h.token();
  h.answers.push(reply(503, { error: "unavailable" }));
  await h.submit(); h.token(); await h.submit();
  assert.equal(h.nodes["contact-submit"].disabled, true);
  assert.equal(h.nodes["contact-fields"].disabled, true);
  assert.equal(h.requests.length, 2);
});

test("network errors preserve the idempotency ID for unchanged retries; edits regenerate it", async () => {
  const h = harness(); await settle(); h.fill(); h.token();
  h.answers.push(new Error("offline")); await h.submit();
  assert.match(h.nodes["contact-status"].textContent, /No pudimos confirmar el envío/);
  h.token("new-token"); h.answers.push(reply(409, { error: "duplicate_submission" })); await h.submit();
  assert.equal(h.requests[1].body.submissionId, h.requests[2].body.submissionId);
  assert.notEqual(h.requests[1].body.turnstileToken, h.requests[2].body.turnstileToken);
  h.inputs.message.value += " Gracias."; h.input("message");
  h.token(); h.answers.push(reply(200, { ok: true })); await h.submit();
  assert.notEqual(h.requests[2].body.submissionId, h.requests[3].body.submissionId);
});

test("timeout and repeated clicks cannot claim success or send concurrent duplicates", async () => {
  const h = harness(); await settle(); h.fill(); h.token();
  h.answers.push(({ signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("timeout")))));
  const pending = h.submit();
  await h.submit();
  assert.equal(h.requests.length, 2);
  assert.equal(h.nodes["contact-fields"].disabled, true);
  const timer = [...h.timers.values()].find((timer) => timer.delay === 20000);
  assert.ok(timer); timer.callback(); await pending;
  assert.match(h.nodes["contact-status"].textContent, /No pudimos confirmar el envío/);
  assert.ok(h.inputs.message.value);
  assert.equal(h.nodes["contact-fields"].disabled, false);
});

test("non-200 responses and malformed success objects never claim delivery", async () => {
  for (const response of [reply(202, { ok: true }), reply(200, { ok: false }), reply(500, { ok: true }), { status: 200, json: async () => { throw new Error("non-JSON"); } }]) {
    const h = harness(); await settle(); h.fill(); h.token(); h.answers.push(response);
    await h.submit();
    assert.equal(h.nodes["contact-status"].dataset.state, "error");
    assert.ok(h.inputs.message.value);
  }
});
