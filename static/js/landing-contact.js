(() => {
  "use strict";

  const form = document.getElementById("contact-form");
  if (!form) return;
  const fields = document.getElementById("contact-fields");
  const submit = document.getElementById("contact-submit");
  const status = document.getElementById("contact-status");
  const challenge = document.getElementById("contact-turnstile");
  const unavailable = "Estamos habilitando el formulario. Inténtalo más tarde.";
  const errors = {
    unavailable,
    invalid_request: "Revisa los campos y la autorización antes de volver a enviar.",
    verification_failed: "La verificación de seguridad no se completó. Vuelve a verificar e inténtalo otra vez.",
    delivery_failed: "No pudimos enviar tu consulta. Conservamos tu mensaje para que puedas reintentar más tarde.",
    delivery_uncertain: "No pudimos confirmar el envío. Tu mensaje sigue aquí; espera un momento antes de reintentar.",
    duplicate_submission: "Esta consulta ya fue procesada o está en curso. No podemos confirmar su entrega; evita volver a enviarla por ahora.",
  };
  let enabled = false;
  let busy = false;
  let token = "";
  let widgetId;
  let submissionId;
  let submissionContent;

  function show(message, state = "info") {
    status.textContent = message;
    status.dataset.state = state;
  }

  function syncButton() {
    submit.disabled = !enabled || busy || !token;
  }

  function clearChallenge() {
    token = "";
    syncButton();
    if (widgetId !== undefined && window.turnstile) {
      window.turnstile.reset(widgetId);
    }
  }

  async function request(options = {}, timeout = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch("./api/contact", {
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        ...options,
        signal: controller.signal,
      });
      const data = await response.json();
      return { response, data };
    } finally {
      clearTimeout(timer);
    }
  }

  function loadChallenge() {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(() => reject(new Error("challenge_timeout")), 15000);
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => {
        clearTimeout(timer);
        if (window.turnstile?.render) resolve();
        else reject(new Error("challenge_unavailable"));
      };
      script.onerror = () => {
        clearTimeout(timer);
        reject(new Error("challenge_unavailable"));
      };
      document.head.append(script);
    });
  }

  function payload() {
    const value = (name) => form.elements.namedItem(name).value.trim();
    return {
      name: value("name"),
      email: value("email"),
      organization: value("organization"),
      message: value("message"),
      consent: form.elements.namedItem("consent").checked,
      website: value("website"),
    };
  }

  function valid(data) {
    const lengths = { name: [2, 100], email: [1, 254], organization: [0, 160], message: [10, 3000] };
    for (const [name, [min, max]] of Object.entries(lengths)) {
      const field = form.elements.namedItem(name);
      const size = data[name].length;
      field.setCustomValidity(size < min || size > max ? `Completa este campo con entre ${min} y ${max} caracteres.` : "");
    }
    return form.reportValidity() && data.consent;
  }

  form.addEventListener("input", (event) => {
    event.target.setCustomValidity?.("");
    submissionId = undefined;
    submissionContent = undefined;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!enabled || busy) return;
    if (!token) {
      show("Completa la verificación de seguridad antes de enviar.", "error");
      return;
    }
    const data = payload();
    if (!valid(data)) return;
    const content = JSON.stringify(data);
    if (!submissionId || submissionContent !== content) {
      submissionId = window.crypto.randomUUID();
      submissionContent = content;
    }
    busy = true;
    fields.disabled = true;
    form.setAttribute("aria-busy", "true");
    submit.textContent = "Enviando consulta…";
    syncButton();
    show("Enviando tu consulta de forma segura…");
    try {
      const { response, data: result } = await request({
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...data, turnstileToken: token, submissionId }),
      });
      if (response.status === 200 && result?.ok === true) {
        form.reset();
        submissionId = undefined;
        submissionContent = undefined;
        show("Tu consulta fue enviada a ventas@xmetrics.cl.", "success");
      } else {
        const code = typeof result?.error === "string" ? result.error : "delivery_failed";
        show(Object.hasOwn(errors, code) ? errors[code] : errors.delivery_failed, "error");
        if (code === "unavailable") enabled = false;
      }
    } catch {
      show(errors.delivery_uncertain, "error");
    } finally {
      busy = false;
      fields.disabled = !enabled;
      form.removeAttribute("aria-busy");
      submit.textContent = "Enviar consulta";
      clearChallenge();
    }
  });

  async function initialize() {
    syncButton();
    try {
      const { response, data } = await request({ headers: { Accept: "application/json" } }, 10000);
      if (!response.ok || data?.enabled !== true || typeof data.siteKey !== "string" || !data.siteKey.trim() || !window.crypto?.randomUUID) {
        show(unavailable);
        return;
      }
      show("Cargando la verificación de seguridad…");
      await loadChallenge();
      enabled = true;
      fields.disabled = false;
      widgetId = window.turnstile.render(challenge, {
        sitekey: data.siteKey,
        theme: "dark",
        size: "flexible",
        action: "contact",
        language: "es",
        "response-field": false,
        callback(value) {
          token = typeof value === "string" ? value : "";
          syncButton();
          if (!busy && status.dataset.state !== "success" && status.dataset.state !== "error") {
            show("Verificación completada. Puedes enviar tu consulta.");
          }
        },
        "expired-callback"() {
          token = "";
          syncButton();
          if (!busy) show("La verificación caducó. Complétala nuevamente antes de enviar.");
        },
        "error-callback"() {
          token = "";
          syncButton();
          if (!busy) show("No pudimos completar la verificación de seguridad. Revisa tu conexión o recarga la página.", "error");
        },
      });
      if (!token) show("Completa los campos y la verificación de seguridad para enviar.");
    } catch {
      enabled = false;
      fields.disabled = true;
      syncButton();
      show(unavailable);
    }
  }

  initialize();
})();
