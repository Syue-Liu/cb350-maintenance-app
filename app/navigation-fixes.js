/* Keep the current vertical scroll position when switching bottom tabs. */
(() => {
  window.switchTab = function switchTabWithoutScrollReset(tabId) {
    const scrollY = window.scrollY;

    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("is-active", view.id === tabId);
    });

    document.querySelectorAll(".tab").forEach((tab) => {
      const active = tab.dataset.tab === tabId;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });

    // Changing which panel is displayed can make the browser clamp the scroll
    // position if the destination panel is shorter. Restore it on the next frame.
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
    });
  };
})();
