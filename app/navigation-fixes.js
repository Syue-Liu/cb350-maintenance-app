/* Mobile app-like navigation:
 * - keep a separate scroll position for each tab
 * - show bike summary only on the home/reminders tab
 * - allow horizontal swipe between the five bottom tabs
 */
(() => {
  const TAB_ORDER = ["reminders", "compose", "history", "spending", "schedule"];
  const scrollPositions = Object.fromEntries(TAB_ORDER.map((id) => [id, 0]));
  scrollPositions.settings = 0;

  let activeTab = "reminders";
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  function setPageMode(tabId) {
    const isHome = tabId === "reminders";
    document.body.classList.toggle("home-tab", isHome);
    document.body.classList.toggle("secondary-tab", !isHome);
  }

  window.switchTab = function switchTabAppStyle(tabId) {
    if (!document.getElementById(tabId)) return;
    scrollPositions[activeTab] = window.scrollY;
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("is-active", view.id === tabId);
    });
    document.querySelectorAll(".tab").forEach((tab) => {
      const active = tab.dataset.tab === tabId;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    activeTab = tabId;
    setPageMode(tabId);
    const destinationY = scrollPositions[tabId] || 0;
    requestAnimationFrame(() => window.scrollTo({ top: destinationY, left: 0, behavior: "auto" }));
  };

  function isInteractiveTarget(target) {
    return Boolean(target.closest("input, textarea, select, button, a, details, summary"));
  }

  document.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1 || isInteractiveTarget(event.target)) return;
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
  }, { passive: true });

  document.addEventListener("touchend", (event) => {
    if (!touchStartTime || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const elapsed = Date.now() - touchStartTime;
    touchStartTime = 0;
    if (activeTab === "settings") return;
    if (elapsed > 700 || Math.abs(dx) < 55 || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
    const currentIndex = TAB_ORDER.indexOf(activeTab);
    if (currentIndex < 0) return;
    const nextIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= TAB_ORDER.length) return;
    window.switchTab(TAB_ORDER[nextIndex]);
  }, { passive: true });

  setPageMode(activeTab);
})();
