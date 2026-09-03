/* Mobile app-like navigation and home hero enhancements. */
(() => {
  if (!document.querySelector('link[data-cb350-hero]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './hero-overrides.css';
    link.dataset.cb350Hero = 'true';
    document.head.appendChild(link);
  }

  const TAB_ORDER = ["reminders", "compose", "history", "spending", "schedule"];
  const scrollPositions = Object.fromEntries(TAB_ORDER.map((id) => [id, 0]));
  scrollPositions.settings = 0;
  let activeTab = "reminders";
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  function syncHeroSummary() {
    const masthead = document.querySelector(".masthead");
    const mileageInput = document.querySelector("#currentMileage");
    const dateInput = document.querySelector("#currentDate");
    if (!masthead) return;
    const mileage = Number(mileageInput?.value || 0);
    masthead.dataset.mileage = mileage ? mileage.toLocaleString("zh-TW") : "—";
    masthead.dataset.checkDate = dateInput?.value ? dateInput.value.replaceAll("-", ".") : "";
  }

  function setPageMode(tabId) {
    const isHome = tabId === "reminders";
    document.body.classList.toggle("home-tab", isHome);
    document.body.classList.toggle("secondary-tab", !isHome);
    if (isHome) syncHeroSummary();
  }

  window.switchTab = function switchTabAppStyle(tabId) {
    if (!document.getElementById(tabId)) return;
    scrollPositions[activeTab] = window.scrollY;
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.id === tabId));
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

  document.querySelector("#bikeForm")?.addEventListener("submit", () => requestAnimationFrame(syncHeroSummary));
  document.querySelector("#currentMileage")?.addEventListener("input", syncHeroSummary);
  document.querySelector("#currentDate")?.addEventListener("change", syncHeroSummary);
  setPageMode(activeTab);
  requestAnimationFrame(syncHeroSummary);
})();
