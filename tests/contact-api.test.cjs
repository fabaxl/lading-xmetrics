"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const root = path.resolve(process.env.LANDING_ROOT || path.join(__dirname, ".."));
const modulePromise = import(pathToFileURL(path.join(root, "functions/api/contact.js")));
const origin = "https://xmetrics.cl";
const env = Object.freeze({ CONTACT_FORM_ENABLED: "true", TURNSTILE_SITE_KEY: "public-site-key",
  TURNSTILE_SECRET_KEY: "private-turnstile-secret", BREVO_API_KEY: "private-brevo-key" });
const valid = Object.freeze({ name: "Ana Pérez", email: "ana@example.com", organization: "Clínica de prueba",
  message: "Quiero conocer la demostración.\nGracias.", consent: true, website: "",
  turnstileToken: "valid-test-token", submissionId: "5e3771b9-6939-4c32-bcaf-a399e36ec8f9" });
const verified = { success: true, hostname: "xmetrics.cl", action: "contact" };
const upstream = (body, status = 200) => new Response(JSON.stringify(body), { status });
const aborting = (_url, options) => new Promise((_, reject) => {
  options.signal.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")), { once: true });
});

function request(body = valid, options = {}) {
  const url = options.url || `${origin}/api/contact`;
  const method = options.method || "POST";
  const headers = { Origin: new URL(url).origin, "Content-Type": "application/json", ...options.headers };
  if (headers.Origin === null) delete headers.Origin;
  return new Request(url, { method, headers, ...(method === "GET" || method === "HEAD" ? {} : {
    body: options.rawBody !== undefined ? options.rawBody : JSON.stringify(body), duplex: "half",
  }) });
}

async function harness({ verification, delivery, timeoutMs = 100, fetchImpl, logger } = {}) {
  const { createContactHandler } = await modulePromise;
  const calls = [];
  const logs = [];
  const mockFetch = async (url, options) => {
    calls.push({ url, options });
    const implementation = fetchImpl || (url.includes("siteverify") ? verification : delivery);
    if (implementation) return implementation(url, options);
    return upstream(url.includes("siteverify") ? verified : { messageId: "<accepted-by-provider>" }, 201);
  };
  const handler = createContactHandler({ fetchImpl: mockFetch, timeoutMs, logger: logger || ((entry) => logs.push(entry)) });
  return { calls, logs, run: (input = request(), environment = env) => handler({ request: input, env: environment }) };
}

async function expectError(response, code, status) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error: code });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
}

test("configuration is fail-closed, GET never exposes credentials", async (t) => {
  for (const key of Object.keys(env)) await t.test(`missing ${key}`, async () => {
    const h = await harness();
    const incomplete = { ...env }; delete incomplete[key];
    const response = await h.run(request(null, { method: "GET" }), incomplete);
    assert.deepEqual(await response.json(), { enabled: false, siteKey: null });
    await expectError(await h.run(request(), incomplete), "unavailable", 503);
    assert.equal(h.calls.length, 0);
  });
  for (const flag of [false, true, "false", "TRUE", ""]) {
    const h = await harness();
    assert.deepEqual(await (await h.run(request(null, { method: "GET" }), { ...env, CONTACT_FORM_ENABLED: flag })).json(),
      { enabled: false, siteKey: null });
  }
  const h = await harness();
  const response = await h.run(request(null, { method: "GET" }));
  assert.deepEqual(await response.json(), { enabled: true, siteKey: "public-site-key" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(h.calls.length, 0);
});

test("rejects unsupported methods and non-production hosts without upstream calls", async () => {
  const h = await harness();
  for (const method of ["OPTIONS", "PUT", "DELETE", "HEAD"]) {
    const response = await h.run(request(null, { method }));
    assert.equal(response.headers.get("Allow"), "GET, POST");
    await expectError(response, "method_not_allowed", 405);
  }
  for (const url of ["http://xmetrics.cl/api/contact", "https://evil.example/api/contact",
    "https://preview.lading-xmetrics.pages.dev/api/contact", "https://xmetrics.cl.evil.example/api/contact",
    "https://xmetrics.cl:8443/api/contact"]) {
    await expectError(await h.run(request(valid, { url })), "invalid_request", 400);
  }
  assert.equal(h.calls.length, 0);
});

test("POST requires exact same origin, including scheme and no suffix or slash", async () => {
  const h = await harness();
  for (const value of [null, "null", "https://evil.example", "https://www.xmetrics.cl", "http://xmetrics.cl",
    "https://xmetrics.cl/", "https://xmetrics.cl.evil.example", "https://xmetrics.cl:8443"]) {
    await expectError(await h.run(request(valid, { headers: { Origin: value } })), "invalid_request", 400);
  }
  assert.equal(h.calls.length, 0);
});

test("valid same-origin calls work on all three exact production hosts", async () => {
  for (const hostname of ["xmetrics.cl", "www.xmetrics.cl", "lading-xmetrics.pages.dev"]) {
    const h = await harness({ verification: () => upstream({ ...verified, hostname }) });
    assert.equal((await h.run(request(valid, { url: `https://${hostname}/api/contact` }))).status, 200);
  }
});

test("rejects malformed JSON, invalid encoding, wrong content type and oversized declared or actual bodies", async () => {
  const h = await harness();
  for (const options of [
    { rawBody: "{" }, { rawBody: "" }, { rawBody: new Uint8Array([0xff]) },
    { headers: { "Content-Type": "text/plain" } }, { headers: { "Content-Type": "application/jsonp" } },
    { headers: { "Content-Length": "16385" } }, { headers: { "Content-Length": "-1" } },
    { rawBody: JSON.stringify({ ...valid, ignored: "x".repeat(16384) }), headers: { "Content-Length": "1" } },
    { rawBody: JSON.stringify({ ...valid, ignored: "é".repeat(8192) }) },
  ]) await expectError(await h.run(request(null, options)), "invalid_request", 400);
  let canceled = false;
  const chunks = [new Uint8Array(8192), new Uint8Array(8192), new Uint8Array(1)];
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(chunks.shift() || new Uint8Array(1)); },
    cancel() { canceled = true; } });
  await expectError(await h.run(request(null, { rawBody: stream })), "invalid_request", 400);
  assert.equal(canceled, true);
  assert.equal(h.calls.length, 0);
});

test("validates scalar fields, bounds, consent, honeypot, token and UUID before CAPTCHA", async (t) => {
  const invalid = {
    name: [null, [], {}, "A", "x".repeat(101), "Ana\r\nBcc: test@example.com"],
    email: [null, [], "a@b", "one@example.com,two@example.com", "Ana <ana@example.com>", "ana\n@example.com", "a".repeat(250) + "@example.com"],
    organization: [null, [], "x".repeat(161), "Clinic\rInjected"],
    message: [null, [], "short", " ".repeat(10), "x".repeat(3001)],
    consent: [false, "true", 1], website: [undefined, null, [], "bot.example", " "],
    turnstileToken: [undefined, null, {}, "", " ", "x".repeat(2049)],
    submissionId: [undefined, null, [], "bad", "00000000-0000-0000-0000-000000000000"],
  };
  for (const [field, values] of Object.entries(invalid)) await t.test(field, async () => {
    const h = await harness();
    for (const value of values) await expectError(await h.run(request({ ...valid, [field]: value })), "invalid_request", 400);
    assert.equal(h.calls.length, 0);
  });
  const h = await harness();
  for (const value of [null, true, [], "hello"]) await expectError(await h.run(request(value)), "invalid_request", 400);
  assert.equal(h.calls.length, 0);
});

test("failed, forged, reused, wrong-host and wrong-action CAPTCHA never send email", async () => {
  for (const payload of [null, {}, { ...verified, success: "true" }, { success: false, "error-codes": ["timeout-or-duplicate"] },
    { ...verified, hostname: "evil.example" }, { ...verified, hostname: "www.xmetrics.cl" },
    { ...verified, action: "login" }, { ...verified, action: undefined }]) {
    const h = await harness({ verification: () => upstream(payload) });
    await expectError(await h.run(), "verification_failed", 400);
    assert.equal(h.calls.length, 1);
  }
  for (const verification of [() => upstream(verified, 503), () => new Response("not json"),
    () => { throw new TypeError("network issue"); }, aborting]) {
    const h = await harness({ verification, timeoutMs: 10 });
    await expectError(await h.run(), "verification_failed", 400);
    assert.equal(h.calls.length, 1);
  }
});

test("success uses server-only credentials, fixed addresses, validated reply-to, plain text and stable idempotency key", async () => {
  const h = await harness();
  const response = await h.run(request({ ...valid, to: "victim@example.com", sender: "forged@example.com",
    subject: "attacker subject", headers: { Bcc: "victim@example.com" } }, { headers: { "CF-Connecting-IP": "192.0.2.1" } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(h.calls.length, 2);
  const [verification, delivery] = h.calls;
  assert.equal(verification.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.equal(verification.options.body.get("secret"), env.TURNSTILE_SECRET_KEY);
  assert.equal(verification.options.body.get("response"), valid.turnstileToken);
  assert.equal(verification.options.body.get("remoteip"), "192.0.2.1");
  assert.equal(delivery.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(delivery.options.headers["api-key"], env.BREVO_API_KEY);
  assert.equal(delivery.options.redirect, "manual");
  const sent = JSON.parse(delivery.options.body);
  assert.deepEqual(sent.sender, { email: "contacto@xmetrics.cl", name: "xMetrics" });
  assert.deepEqual(sent.to, [{ email: "ventas@xmetrics.cl", name: "Ventas xMetrics" }]);
  assert.deepEqual(sent.replyTo, { email: valid.email, name: valid.name });
  assert.deepEqual(sent.headers, { idempotencyKey: valid.submissionId });
  assert.equal(sent.subject, "Consulta comercial desde xMetrics");
  assert.equal(sent.textContent.includes(valid.message), true);
  assert.equal(sent.htmlContent, undefined);
  assert.equal(sent.bcc, undefined);
  assert.equal(sent.cc, undefined);
  assert.equal(delivery.options.body.includes(valid.turnstileToken), false);
});

test("organization is optional and whitespace is normalized in contact text", async () => {
  const h = await harness();
  assert.equal((await h.run(request({ ...valid, organization: undefined, name: " Ana ", email: " ana@example.com " }))).status, 200);
  const sent = JSON.parse(h.calls[1].options.body);
  assert.deepEqual(sent.replyTo, { email: "ana@example.com", name: "Ana" });
  assert.match(sent.textContent, /Organización: No indicada/);
});

test("provider non-2xx errors never claim success or expose upstream secrets", async () => {
  for (const delivery of [() => upstream({ code: "unauthorized", message: env.BREVO_API_KEY }, 401),
    () => upstream({ code: "not_enough_credits" }, 402), () => upstream({}, 429), () => upstream({}, 500),
    () => new Response("invalid json", { status: 500 })]) {
    const h = await harness({ delivery });
    await expectError(await h.run(), "delivery_failed", 502);
    assert.equal(h.calls.length, 2);
  }
});

test("provider 2xx without usable messageId is uncertain and never retried", async () => {
  for (const delivery of [() => upstream({}), () => upstream({ messageId: "" }),
    () => upstream({ messageId: " " }), () => upstream({ messageId: 123 }),
    () => new Response("invalid json", { status: 201 }), () => new Response(null, { status: 204 })]) {
    const h = await harness({ delivery });
    await expectError(await h.run(), "delivery_uncertain", 504);
    assert.equal(h.calls.length, 2);
  }
});

test("duplicates are reported without claiming delivery or retrying", async () => {
  const h = await harness({ delivery: () => upstream({ code: "duplicate_parameter" }, 400) });
  await expectError(await h.run(), "duplicate_submission", 409);
  assert.equal(h.calls.length, 2);
  assert.equal(JSON.parse(h.calls[1].options.body).headers.idempotencyKey, valid.submissionId);
});

test("network/timeout after send is uncertain, aborts and never retries", async () => {
  for (const delivery of [() => { throw new TypeError("network issue"); }, aborting,
    () => ({ ok: true, json: () => new Promise(() => {}) }),
    () => ({ ok: true, json: async () => { throw new TypeError("body stream disconnected"); } })]) {
    const h = await harness({ delivery, timeoutMs: 10 });
    await expectError(await h.run(), "delivery_uncertain", 504);
    assert.equal(h.calls.length, 2);
  }
});


test("both upstreams use Workers-supported manual redirect mode and never follow a 302", async () => {
  for (const provider of ["verification", "delivery"]) {
    const h = await harness({ [provider]: () => new Response(JSON.stringify({ ...verified, messageId: "not-accepted" }), {
      status: 302, headers: { Location: "https://untrusted-redirect.example" },
    }) });
    await expectError(await h.run(), provider === "verification" ? "verification_failed" : "delivery_failed",
      provider === "verification" ? 400 : 502);
    assert.equal(h.calls.length, provider === "verification" ? 1 : 2);
    assert.deepEqual(h.logs, provider === "verification"
      ? [{ event: "contact_turnstile_rejected", reason: "upstream_rejected" }] : []);
    for (const call of h.calls) {
      assert.equal(call.options.redirect, "manual");
      assert.notEqual(call.url, "https://untrusted-redirect.example");
    }
  }
});

test("CAPTCHA diagnostics classify all guards and only include allowlisted provider codes", async () => {
  const cases = [
    [() => upstream(verified, 503), { reason: "upstream_rejected" }],
    [() => upstream({ success: false, "error-codes": ["invalid-input-secret", "timeout-or-duplicate",
      "invalid-input-secret", "private-provider-data", { secret: env.TURNSTILE_SECRET_KEY }] }),
      { reason: "challenge_rejected", codes: ["invalid-input-secret", "timeout-or-duplicate"] }],
    [() => upstream({ success: "true", "error-codes": env.TURNSTILE_SECRET_KEY }), { reason: "challenge_rejected", codes: [] }],
    [() => new Response("malformed-json"), { reason: "challenge_rejected", codes: [] }],
    [() => upstream({ ...verified, hostname: "private-host.example" }), { reason: "hostname_mismatch" }],
    [() => upstream({ ...verified, action: "private-action" }), { reason: "action_mismatch" }],
    [() => { throw new TypeError("private exception message"); }, { reason: "upstream_exception", exceptionName: "TypeError" }],
    [() => { throw Object.assign(new Error("private exception message"), { name: "private-exception-name" }); },
      { reason: "upstream_exception", exceptionName: "UnknownError" }],
    [aborting, { reason: "upstream_exception", exceptionName: "TimeoutError" }],
  ];
  for (const [verification, expected] of cases) {
    const h = await harness({ verification, timeoutMs: 10 });
    await expectError(await h.run(), "verification_failed", 400);
    assert.deepEqual(h.logs, [{ event: "contact_turnstile_rejected", ...expected }]);
    assert.equal(h.calls.length, 1);
  }
});

test("CAPTCHA diagnostics do not leak contact, tokens, secrets, IP, hostname, bodies or exception text", async () => {
  const sensitive = [env.TURNSTILE_SECRET_KEY, env.BREVO_API_KEY, valid.turnstileToken,
    valid.name, valid.email, valid.organization, valid.message, "192.0.2.55", "private-host.example", "private-action"];
  const malicious = sensitive.join(" | ");
  for (const verification of [
    () => upstream({ success: false, "error-codes": [malicious, "bad-request"], body: malicious }),
    () => upstream({ ...verified, hostname: "private-host.example", body: malicious }),
    () => upstream({ ...verified, action: "private-action", body: malicious }),
    () => { throw new TypeError(malicious); },
    () => { throw { name: malicious, message: malicious, stack: malicious, cause: malicious }; },
  ]) {
    const h = await harness({ verification });
    const response = await h.run(request(valid, { headers: { "CF-Connecting-IP": "192.0.2.55" } }));
    const publicBody = await response.text();
    assert.equal(publicBody, JSON.stringify({ error: "verification_failed" }));
    const captured = JSON.stringify(h.logs);
    for (const value of sensitive) {
      assert.equal(captured.includes(value), false);
      assert.equal(publicBody.includes(value), false);
    }
    assert.equal(h.calls.length, 1);
  }
});

test("logging is silent on success and logger failures cannot bypass CAPTCHA", async () => {
  const success = await harness();
  assert.equal((await success.run()).status, 200);
  assert.deepEqual(success.logs, []);
  const rejected = await harness({ verification: () => upstream({ success: false }), logger: () => { throw new Error("logger down"); } });
  await expectError(await rejected.run(), "verification_failed", 400);
  assert.equal(rejected.calls.length, 1);
});
