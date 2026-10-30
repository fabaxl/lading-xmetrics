(() => {
  "use strict";

  function selectVideoVariant(width, height) {
    const ratio = width / Math.max(1, height);
    return ratio < 0.7 ? "portrait" : ratio < 1.4 ? "square" : "landscape";
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { selectVideoVariant };
  if (typeof document === "undefined") return;

  const dialog = document.getElementById("tour-dialog");
  const video = document.getElementById("tour-video");
  if (!dialog || !video) return;
  let activeVariant;
  let resizeTimer;
  let generation = 0;

  function updateVideo() {
    if (!dialog.open) return;
    const variant = selectVideoVariant(window.innerWidth, window.innerHeight);
    if (variant === activeVariant) return;
    const currentTime = video.currentTime || 0;
    const resume = !video.paused;
    const currentGeneration = ++generation;
    video.pause();
    activeVariant = variant;
    dialog.dataset.videoFormat = variant;
    dialog.querySelector(".tour-video-frame").dataset.videoFormat = variant;
    const base = `./static/video/how-it-works-${variant}`;
    video.poster = `${base}.jpg`;
    video.preload = "metadata";
    // Only the selected asset is assigned, so hidden variants are never downloaded.
    video.src = `${base}.mp4`;
    video.addEventListener("loadedmetadata", () => {
      if (currentGeneration !== generation || !dialog.open) return;
      if (currentTime > 0) video.currentTime = Math.min(currentTime, Math.max(0, video.duration - 0.1));
      if (resume) video.play().catch(() => {});
    }, { once: true });
    video.load();
  }
  document.querySelectorAll("[data-tour-open]").forEach((button) => button.addEventListener("click", updateVideo));
  dialog.addEventListener("close", () => {
    ++generation;
    clearTimeout(resizeTimer);
    video.pause();
    video.removeAttribute("src");
    video.preload = "none";
    video.load();
    activeVariant = undefined;
  });
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    if (dialog.open) resizeTimer = setTimeout(updateVideo, 150);
  });
})();
