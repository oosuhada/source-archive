(() => {
  const enabled = new URLSearchParams(location.search).has("perf");
  const metrics = window.__SOURCE_ARCHIVE_METRICS__ = { navigation: {}, search: {}, media: {}, resources: {} };
  const update = () => {
    if (!enabled) return;
    let panel = document.querySelector("#performanceDashboard");
    if (!panel) {
      panel = document.createElement("output");
      panel.id = "performanceDashboard";
      panel.className = "performance-dashboard";
      document.body.append(panel);
    }
    panel.textContent = [
      `BUILD ${window.SOURCE_ARCHIVE_BUILD?.version || "dev"}`,
      `LCP ${Math.round(metrics.navigation.lcp || 0)}ms`,
      `SEARCH ${Number(metrics.search.last || 0).toFixed(1)}ms`,
      `RESULTS ${metrics.search.results || 0}`,
      `FIRST FRAME ${Math.round(metrics.media.firstFrame || 0)}ms`,
      `SEEK ${Math.round(metrics.media.seek || 0)}ms`,
      `TRANSFER ${Math.round((metrics.resources.bytes || 0) / 1024)}KB`,
    ].join("\n");
  };
  try {
    new PerformanceObserver((list) => { const last = list.getEntries().at(-1); if (last) metrics.navigation.lcp = last.startTime; update(); }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) metrics.resources.bytes = (metrics.resources.bytes || 0) + (entry.transferSize || 0); update(); }).observe({ type: "resource", buffered: true });
  } catch {}
  window.addEventListener("source-archive:metric", ({ detail }) => {
    if (!detail?.group) return;
    Object.assign(metrics[detail.group], detail.values || {});
    update();
  });
  window.addEventListener("load", update, { once: true });
})();
