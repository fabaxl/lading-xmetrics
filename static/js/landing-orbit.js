/* A lightweight, dependency-free 3D intelligence field. */
(() => {
  "use strict";

  const canvas = document.getElementById("intelligence-orbit");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const container = canvas.closest(".hero-visual") || canvas.parentElement;
  if (!container) return;

  const motionPreference = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  const tau = Math.PI * 2;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  let width = 0;
  let height = 0;
  let radius = 0;
  let frame = 0;
  let previousTime = 0;
  let elapsed = 0;
  let visible = true;
  let paused =
    document
      .querySelector("[data-motion-toggle]")
      ?.getAttribute("aria-pressed") === "true";
  let reducedMotion = motionPreference.matches;

  // Deterministic points make the illustration stable across page loads.
  const points = Array.from({ length: 470 }, (_, index) => {
    const y = 1 - (index / 469) * 2;
    const ringRadius = Math.sqrt(1 - y * y);
    const longitude = index * Math.PI * (3 - Math.sqrt(5));
    return {
      x: Math.cos(longitude) * ringRadius,
      y,
      z: Math.sin(longitude) * ringRadius,
      size: index % 23 === 0 ? 2.5 : index % 7 === 0 ? 1.6 : 0.9,
      accent: index % 23 === 0,
    };
  });
  const stars = Array.from({ length: 34 }, (_, index) => ({
    x: ((index * 167 + 29) % 997) / 997,
    y: ((index * 241 + 71) % 991) / 991,
    size: index % 5 === 0 ? 1.5 : 0.8,
    phase: index * 1.73,
  }));
  const grid = [];
  for (let latitude = -60; latitude <= 60; latitude += 20) {
    const phi = (latitude * Math.PI) / 180;
    grid.push(
      Array.from({ length: 81 }, (_, index) => {
        const theta = (index / 80) * tau;
        return {
          x: Math.cos(phi) * Math.cos(theta),
          y: Math.sin(phi),
          z: Math.cos(phi) * Math.sin(theta),
        };
      }),
    );
  }
  for (let longitude = 0; longitude < 180; longitude += 15) {
    const theta = (longitude * Math.PI) / 180;
    grid.push(
      Array.from({ length: 81 }, (_, index) => {
        const phi = (index / 80) * tau;
        return {
          x: Math.cos(phi) * Math.cos(theta),
          y: Math.sin(phi),
          z: Math.cos(phi) * Math.sin(theta),
        };
      }),
    );
  }

  const orbitConfigurations = [
    { size: 1.35, tilt: 0.49, angle: -0.31, color: "123,242,211", speed: 0.14 },
    { size: 1.26, tilt: 1.13, angle: 0.83, color: "115,201,244", speed: -0.1 },
    { size: 1.44, tilt: 0.79, angle: 2.48, color: "172,241,215", speed: 0.08 },
  ];

  function rotate(point, xAngle, yAngle) {
    const cosY = Math.cos(yAngle);
    const sinY = Math.sin(yAngle);
    const cosX = Math.cos(xAngle);
    const sinX = Math.sin(xAngle);
    const x = point.x * cosY + point.z * sinY;
    const z = -point.x * sinY + point.z * cosY;
    return { x, y: point.y * cosX - z * sinX, z: point.y * sinX + z * cosX };
  }

  function project(point) {
    const perspective = 5.2 / (5.2 - point.z);
    return {
      x: width * 0.5 + point.x * radius * perspective,
      y: height * 0.49 + point.y * radius * perspective,
      z: point.z,
      scale: perspective,
    };
  }

  function orbitalPoint(angle, orbit) {
    const x = Math.cos(angle) * orbit.size;
    const y = Math.sin(angle) * orbit.size * Math.cos(orbit.tilt);
    const z = Math.sin(angle) * orbit.size * Math.sin(orbit.tilt);
    return rotate(
      {
        x: x * Math.cos(orbit.angle) - y * Math.sin(orbit.angle),
        y: x * Math.sin(orbit.angle) + y * Math.cos(orbit.angle),
        z,
      },
      pointer.y * 0.14,
      pointer.x * 0.16,
    );
  }

  function strokeSegments(path, front, color, opacity, lineWidth) {
    context.beginPath();
    let previous = null;
    path.forEach((point) => {
      if (previous && point.z + previous.z >= 0 === front) {
        context.moveTo(previous.x, previous.y);
        context.lineTo(point.x, point.y);
      }
      previous = point;
    });
    context.strokeStyle = `rgba(${color},${opacity})`;
    context.lineWidth = lineWidth;
    context.stroke();
  }

  function drawOrbits(front) {
    orbitConfigurations.forEach((orbit, orbitIndex) => {
      const path = Array.from({ length: 121 }, (_, index) =>
        project(orbitalPoint((index / 120) * tau, orbit)),
      );
      strokeSegments(
        path,
        front,
        orbit.color,
        front ? 0.35 : 0.11,
        orbitIndex === 0 ? 1 : 0.65,
      );
      const angle = elapsed * orbit.speed + orbitIndex * 2.2 + 0.5;
      const dot = project(orbitalPoint(angle, orbit));
      if (dot.z >= 0 !== front) return;
      context.beginPath();
      context.arc(dot.x, dot.y, front ? 3.1 : 2, 0, tau);
      context.fillStyle = `rgba(${orbit.color},${front ? 0.95 : 0.4})`;
      context.shadowColor = `rgba(${orbit.color},0.7)`;
      context.shadowBlur = front ? 15 : 0;
      context.fill();
      context.shadowBlur = 0;
      if (front) {
        context.beginPath();
        context.arc(dot.x, dot.y, 7, 0, tau);
        context.strokeStyle = `rgba(${orbit.color},0.25)`;
        context.lineWidth = 1;
        context.stroke();
      }
    });
  }

  function draw() {
    if (!width || !height) return;
    context.clearRect(0, 0, width, height);
    const centerX = width * 0.5;
    const centerY = height * 0.49;
    const xAngle = -0.2 + pointer.y * 0.24;
    const yAngle = 0.55 + elapsed * 0.045 + pointer.x * 0.38;

    const aura = context.createRadialGradient(
      centerX,
      centerY,
      radius * 0.5,
      centerX,
      centerY,
      radius * 1.75,
    );
    aura.addColorStop(0, "rgba(47,184,151,0.11)");
    aura.addColorStop(0.5, "rgba(27,129,130,0.05)");
    aura.addColorStop(1, "rgba(27,129,130,0)");
    context.fillStyle = aura;
    context.fillRect(0, 0, width, height);

    stars.forEach((star) => {
      const alpha = 0.14 + (Math.sin(elapsed * 0.7 + star.phase) + 1) * 0.12;
      context.beginPath();
      context.arc(star.x * width, star.y * height, star.size, 0, tau);
      context.fillStyle = `rgba(158,230,217,${alpha})`;
      context.fill();
    });

    drawOrbits(false);

    const atmosphere = context.createRadialGradient(
      centerX - radius * 0.3,
      centerY - radius * 0.4,
      0,
      centerX,
      centerY,
      radius * 1.03,
    );
    atmosphere.addColorStop(0, "rgba(41,91,88,0.12)");
    atmosphere.addColorStop(0.68, "rgba(7,26,32,0.36)");
    atmosphere.addColorStop(0.94, "rgba(48,138,122,0.08)");
    atmosphere.addColorStop(1, "rgba(110,238,211,0.16)");
    context.beginPath();
    context.arc(centerX, centerY, radius * 1.02, 0, tau);
    context.fillStyle = atmosphere;
    context.fill();
    context.strokeStyle = "rgba(132,240,214,0.12)";
    context.lineWidth = 0.75;
    context.stroke();

    const paths = grid.map((line) =>
      line.map((point) => project(rotate(point, xAngle, yAngle))),
    );
    paths.forEach((path) =>
      strokeSegments(path, false, "113,211,193", 0.055, 0.65),
    );
    paths.forEach((path) =>
      strokeSegments(path, true, "139,238,210", 0.17, 0.65),
    );

    const projectedPoints = points.map((point) => ({
      ...project(rotate(point, xAngle, yAngle)),
      size: point.size,
      accent: point.accent,
    }));
    projectedPoints.sort((a, b) => a.z - b.z);
    projectedPoints.forEach((point) => {
      const depth = (point.z + 1) / 2;
      const alpha = 0.1 + depth * 0.72;
      const size = point.size * point.scale * (0.65 + depth * 0.35);
      context.beginPath();
      context.arc(point.x, point.y, size, 0, tau);
      context.fillStyle = `rgba(${point.accent ? "189,255,228" : "133,235,209"},${alpha})`;
      if (point.accent && point.z > 0.25) {
        context.shadowBlur = 12;
        context.shadowColor = "rgba(117,255,210,0.65)";
      }
      context.fill();
      context.shadowBlur = 0;
      if (point.accent && point.z > 0.45) {
        context.beginPath();
        context.arc(
          point.x,
          point.y,
          size + 4 + Math.sin(elapsed * 1.6 + point.x) * 1.2,
          0,
          tau,
        );
        context.strokeStyle = `rgba(165,255,223,${depth * 0.2})`;
        context.lineWidth = 0.7;
        context.stroke();
      }
    });

    drawOrbits(true);
  }

  function canAnimate() {
    return (
      visible &&
      !document.hidden &&
      !paused &&
      !reducedMotion &&
      width > 0 &&
      height > 0
    );
  }

  function animate(time) {
    frame = 0;
    if (!canAnimate()) return;
    const delta = previousTime
      ? Math.min((time - previousTime) / 1000, 0.05)
      : 0;
    previousTime = time;
    elapsed += delta;
    const damping = 1 - Math.exp(-delta * 5);
    pointer.x += (pointer.targetX - pointer.x) * damping;
    pointer.y += (pointer.targetY - pointer.y) * damping;
    draw();
    frame = requestAnimationFrame(animate);
  }

  function synchronize() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    if (canAnimate()) frame = requestAnimationFrame(animate);
    else if (visible && !document.hidden) draw();
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    radius = Math.min(width * 0.285, height * 0.315);
    const density = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    context.setTransform(density, 0, 0, density, 0, 0);
    draw();
    synchronize();
  }

  container.addEventListener(
    "pointermove",
    (event) => {
      if (reducedMotion || paused || event.pointerType === "touch") return;
      const bounds = container.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      pointer.targetX = Math.max(
        -1,
        Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1),
      );
      pointer.targetY = Math.max(
        -1,
        Math.min(1, ((event.clientY - bounds.top) / bounds.height) * 2 - 1),
      );
    },
    { passive: true },
  );
  container.addEventListener("pointerleave", () => {
    pointer.targetX = 0;
    pointer.targetY = 0;
  });
  document.addEventListener("visibilitychange", synchronize);

  function updateMotion(event) {
    if (typeof event.detail?.paused !== "boolean") return;
    paused = event.detail.paused;
    synchronize();
  }
  window.addEventListener("xmetrics:motion", updateMotion);
  document.addEventListener("xmetrics:motion", updateMotion);
  const updatePreference = (event) => {
    reducedMotion = event.matches;
    if (reducedMotion) {
      pointer.x = pointer.targetX = 0;
      pointer.y = pointer.targetY = 0;
    }
    synchronize();
  };
  if (motionPreference.addEventListener)
    motionPreference.addEventListener("change", updatePreference);
  else if (motionPreference.addListener)
    motionPreference.addListener(updatePreference);

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        synchronize();
      },
      { threshold: 0 },
    );
    observer.observe(container);
  }
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
  window.addEventListener("resize", resize, { passive: true });
  resize();
})();
