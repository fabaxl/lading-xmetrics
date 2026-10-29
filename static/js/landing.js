(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let userPaused = false;
  const motionButton = document.querySelector("[data-motion-toggle]");
  const heroVisual = document.querySelector(".hero-visual");
  let pointerFrame = 0;

  function syncMotion() {
    const paused = userPaused || reducedMotion.matches;
    document.body.classList.toggle("motion-paused", paused);
    if (motionButton) {
      motionButton.setAttribute("aria-pressed", String(paused));
      motionButton.disabled = reducedMotion.matches;
      motionButton.querySelector("[data-motion-label]").textContent =
        reducedMotion.matches
          ? "Movimiento reducido"
          : paused
            ? "Activar animación"
            : "Pausar animación";
      motionButton.firstElementChild.textContent = paused ? "▷" : "Ⅱ";
    }
    if (paused && heroVisual) {
      heroVisual.style.setProperty("--pointer-x", "0");
      heroVisual.style.setProperty("--pointer-y", "0");
    }
    window.dispatchEvent(
      new CustomEvent("xmetrics:motion", { detail: { paused } }),
    );
  }
  motionButton?.addEventListener("click", () => {
    userPaused = !userPaused;
    syncMotion();
  });
  reducedMotion.addEventListener("change", syncMotion);
  syncMotion();

  heroVisual?.querySelectorAll("[data-depth]").forEach((card) => {
    card.style.setProperty("--depth", card.dataset.depth);
  });
  heroVisual?.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "touch" || reducedMotion.matches || userPaused)
        return;
      cancelAnimationFrame(pointerFrame);
      pointerFrame = requestAnimationFrame(() => {
        if (reducedMotion.matches || userPaused) return;
        const rect = heroVisual.getBoundingClientRect();
        heroVisual.style.setProperty(
          "--pointer-x",
          ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3),
        );
        heroVisual.style.setProperty(
          "--pointer-y",
          ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3),
        );
      });
    },
    { passive: true },
  );
  heroVisual?.addEventListener("pointerleave", () => {
    cancelAnimationFrame(pointerFrame);
    heroVisual.style.setProperty("--pointer-x", "0");
    heroVisual.style.setProperty("--pointer-y", "0");
  });

  if ("IntersectionObserver" in window && !reducedMotion.matches) {
    document.documentElement.classList.add("js-reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.06 },
    );
    document
      .querySelectorAll(".reveal")
      .forEach((element) => observer.observe(element));
  }

  const menuButton = document.querySelector(".menu-toggle");
  const mobileNav = document.getElementById("mobile-nav");
  function closeMenu() {
    if (!mobileNav || !menuButton) return;
    mobileNav.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Abrir menú");
  }
  menuButton?.addEventListener("click", () => {
    const open = menuButton.getAttribute("aria-expanded") !== "true";
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    mobileNav.hidden = !open;
  });
  mobileNav
    ?.querySelectorAll("a")
    .forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  window
    .matchMedia("(min-width: 701px)")
    .addEventListener("change", (event) => {
      if (event.matches) closeMenu();
    });

  const tour = document.getElementById("tour-dialog");
  document.querySelectorAll("[data-tour-open]").forEach((button) =>
    button.addEventListener("click", () => {
      if (tour?.showModal) tour.showModal();
      else document.getElementById("explorar")?.scrollIntoView();
    }),
  );
  document
    .querySelectorAll("[data-tour-close]")
    .forEach((button) => button.addEventListener("click", () => tour?.close()));
  tour?.addEventListener("click", (event) => {
    const rect = tour.getBoundingClientRect();
    if (
      event.target === tour &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    )
      tour.close();
  });

  const promoterSlider = document.getElementById("promoter-slider");
  const signed = (value) =>
    value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
  function updateNps() {
    const promoters = Number(promoterSlider.value);
    const passives = 12;
    const detractors = 100 - promoters - passives;
    const score = promoters - detractors;
    document.getElementById("nps-score").textContent = signed(score);
    document.getElementById("promoter-value").textContent = `${promoters}%`;
    document.getElementById("passive-value").textContent = `${passives}%`;
    document.getElementById("detractor-value").textContent = `${detractors}%`;
    document.getElementById("slider-value").textContent =
      `${promoters} promotores`;
    const gauge = document.getElementById("nps-gauge");
    gauge.style.setProperty("--promoter-angle", `${promoters * 3.6}deg`);
    gauge.style.setProperty(
      "--passive-end",
      `${(promoters + passives) * 3.6}deg`,
    );
    promoterSlider.style.background = `linear-gradient(90deg, var(--mint) ${(promoters / 88) * 100}%, #29414c ${(promoters / 88) * 100}%)`;
    promoterSlider.setAttribute(
      "aria-valuetext",
      `${promoters} promotores, ${passives} pasivos, ${detractors} detractores. NPS ${signed(score)}.`,
    );
  }
  promoterSlider?.addEventListener("input", updateNps);
  if (promoterSlider) updateNps();

  const areas = {
    all: {
      label: "Todas las áreas",
      nps: 64,
      responses: "1.248",
      cases: 18,
      change: 12,
      points: [40, 45, 42, 51, 49, 58, 54, 62, 59, 66, 64],
    },
    consultas: {
      label: "Consultas",
      nps: 72,
      responses: "620",
      cases: 6,
      change: 9,
      points: [51, 57, 54, 61, 60, 67, 65, 70, 68, 74, 72],
    },
    urgencias: {
      label: "Urgencias",
      nps: 42,
      responses: "310",
      cases: 9,
      change: 7,
      points: [20, 29, 24, 32, 26, 35, 30, 39, 36, 45, 42],
    },
  };
  function selectArea(key) {
    const area = areas[key];
    if (!area) return;
    document.querySelectorAll("[data-area]").forEach((button) => {
      const active = button.dataset.area === key;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const nps = document.getElementById("bi-nps");
    nps.replaceChildren(document.createTextNode(signed(area.nps)));
    const unit = document.createElement("small");
    unit.textContent = "pts";
    nps.append(unit);
    document.getElementById("bi-responses").textContent = area.responses;
    document.getElementById("bi-cases").textContent = area.cases;
    document.getElementById("bi-trend").textContent =
      `↑ ${area.change} respecto al período anterior`;
    document.getElementById("chart-area-label").textContent = area.label;
    const points = area.points.map(
      (value, index) => `${index * 60} ${10 + (100 - value) * 0.8}`,
    );
    const path = `M${points.join(" L")}`;
    document.getElementById("bi-line").setAttribute("d", path);
    document.getElementById("bi-area").setAttribute("d", `${path} V180 H0 Z`);
    document
      .getElementById("bi-endpoint")
      .setAttribute("cy", String(10 + (100 - area.nps) * 0.8));
    document
      .getElementById("bi-chart")
      .setAttribute(
        "aria-label",
        `Evolución NPS de ejemplo, ${area.label}: de ${area.points[0]} a ${area.nps} puntos. Datos ficticios.`,
      );
  }
  document
    .querySelectorAll("[data-area]")
    .forEach((button) =>
      button.addEventListener("click", () => selectArea(button.dataset.area)),
    );
  if (document.getElementById("bi-nps")) selectArea("all");

})();
