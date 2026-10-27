const HOSTS = new Set(["xmetrics.cl", "www.xmetrics.cl", "lading-xmetrics.pages.dev"]);
const MAX_BODY_BYTES = 16 * 1024;
const TURNSTILE_CODES = new Set(["missing-input-secret", "invalid-input-secret", "missing-input-response",
  "invalid-input-response", "bad-request", "timeout-or-duplicate", "internal-error"]);
const EXCEPTION_NAMES = new Set(["AbortError", "TimeoutError", "TypeError", "SyntaxError", "Error"]);
const SINGLE_LINE = /^[^\u0000-\u001f\u007f]*$/u;
const EMAIL = /^[^\s@<>(),;:"\\\[\]]+@[^\s@<>(),;:"\\\[\]]+\.[^\s@<>(),;:"\\\[\]]+$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function configured(env) {
  return env.CONTACT_FORM_ENABLED === "true" &&
    ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "BREVO_API_KEY"].every(
      (key) => typeof env[key] === "string" && env[key].trim().length > 0,
    );
}

async function readJSON(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) {
    throw new Error("invalid content type");
  }
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    throw new Error("invalid content length");
  }
  if (!request.body) throw new Error("missing body");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new Error("body too large");
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function fields(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const line = (value, min, max) => typeof value === "string" &&
    SINGLE_LINE.test(value) && value.trim().length >= min && value.length <= max;
  if (!line(body.name, 2, 100) || !line(body.email, 3, 254) || !EMAIL.test(body.email.trim()) ||
      (body.organization !== undefined && !line(body.organization, 0, 160)) ||
      typeof body.message !== "string" || body.message.trim().length < 10 || body.message.length > 3000 ||
      body.consent !== true || body.website !== "" ||
      typeof body.turnstileToken !== "string" || !body.turnstileToken.trim() || body.turnstileToken.length > 2048 ||
      typeof body.submissionId !== "string" || !UUID.test(body.submissionId)) return null;
  return {
    name: body.name.trim(), email: body.email.trim(), organization: (body.organization || "").trim(),
    message: body.message.trim(), token: body.turnstileToken, submissionId: body.submissionId,
  };
}

// The deadline also covers reading the response body, not just receiving headers.
async function fetchJSON(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { ...options, signal: controller.signal, redirect: "manual" });
        const payload = await response.json().catch((error) => {
          if (error instanceof SyntaxError) return null;
          throw error;
        });
        return { ok: response.ok, payload };
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new DOMException("", "TimeoutError"));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createContactHandler({ fetchImpl = globalThis.fetch, timeoutMs = 8000,
  logger = (entry) => console.warn(JSON.stringify(entry)) } = {}) {
  const diagnose = (reason, details = {}) => {
    // Only callers' fixed reasons and explicitly allowlisted labels belong here, never request/provider data.
    try { logger({ event: "contact_turnstile_rejected", reason, ...details }); } catch { /* Logging must not affect validation. */ }
  };
  const rejectChallenge = (reason, details) => {
    diagnose(reason, details);
    return json({ error: "verification_failed" }, 400);
  };
  return async function handleContact({ request, env = {} }) {
    const fail = (error, status) => json({ error }, status);
    if (!["GET", "POST"].includes(request.method)) {
      return json({ error: "method_not_allowed" }, 405, { Allow: "GET, POST" });
    }
    const url = new URL(request.url);
    if (url.protocol !== "https:" || url.port || !HOSTS.has(url.hostname)) return fail("invalid_request", 400);
    const enabled = configured(env);
    if (request.method === "GET") return json({ enabled, siteKey: enabled ? env.TURNSTILE_SITE_KEY : null });
    if (request.headers.get("Origin") !== url.origin) return fail("invalid_request", 400);
    if (!enabled) return fail("unavailable", 503);
    let contact;
    try { contact = fields(await readJSON(request)); } catch { return fail("invalid_request", 400); }
    if (!contact) return fail("invalid_request", 400);

    const challenge = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: contact.token });
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) challenge.set("remoteip", ip);
    try {
      const { ok, payload } = await fetchJSON(fetchImpl,
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        { method: "POST", body: challenge }, timeoutMs);
      if (!ok) {
        return rejectChallenge("upstream_rejected");
      } else if (payload?.success !== true) {
        const codes = Array.isArray(payload?.["error-codes"])
          ? [...new Set(payload["error-codes"].filter((code) => TURNSTILE_CODES.has(code)))] : [];
        return rejectChallenge("challenge_rejected", { codes });
      } else if (payload.hostname !== url.hostname) {
        return rejectChallenge("hostname_mismatch");
      } else if (payload.action !== "contact") {
        return rejectChallenge("action_mismatch");
      }
    } catch (error) {
      return rejectChallenge("upstream_exception", {
        exceptionName: EXCEPTION_NAMES.has(error?.name) ? error.name : "UnknownError",
      });
    }

    const message = {
      sender: { email: "contacto@xmetrics.cl", name: "xMetrics" },
      to: [{ email: "ventas@xmetrics.cl", name: "Ventas xMetrics" }],
      replyTo: { email: contact.email, name: contact.name },
      subject: "Consulta comercial desde xMetrics",
      textContent: ["Nueva consulta comercial", `Nombre: ${contact.name}`, `Correo: ${contact.email}`,
        `Organización: ${contact.organization || "No indicada"}`, "", contact.message,
        "", "La persona autorizó el uso de estos datos para responder a su consulta."].join("\n"),
      headers: { idempotencyKey: contact.submissionId },
    };
    try {
      const { ok, payload } = await fetchJSON(fetchImpl, "https://api.brevo.com/v3/smtp/email", {
        method: "POST", headers: { "Content-Type": "application/json", "api-key": env.BREVO_API_KEY },
        body: JSON.stringify(message),
      }, timeoutMs);
      if (!ok && payload?.code === "duplicate_parameter") return fail("duplicate_submission", 409);
      if (!ok) return fail("delivery_failed", 502);
      // A successful status without a usable receipt may still represent an accepted email.
      if (typeof payload?.messageId !== "string" || !payload.messageId.trim()) return fail("delivery_uncertain", 504);
      return json({ ok: true });
    } catch {
      // The provider may have accepted the email before the connection failed. Never retry automatically.
      return fail("delivery_uncertain", 504);
    }
  };
}

export const onRequest = createContactHandler();
