/* Decorative icons for CB350 RS maintenance items. */
(() => {
  const items = window.CB350Data?.MAINTENANCE_ITEMS || [];
  const byName = new Map(items.map((item) => [item.name, item.key]));

  const ICONS = {
    engineOil: '<path d="M5 10h10l2 3v5H5z"/><path d="M8 10V7h5l2 3"/><path d="M18 10l2-2"/><path d="M19 15c1.3-1.7 2-2.8 2-3.5 0-.8-.7-1.5-1.5-1.5S18 10.7 18 11.5c0 .7.7 1.8 2 3.5"/>',
    oilFilter: '<path d="M7 4h10l1 3-2 13H8L6 7z"/><path d="M7 8h10M9 11h6M9 14h6M9 17h6"/>',
    airFilter: '<path d="M7 4h10l2 16H5z"/><path d="M9 7v10M12 7v10M15 7v10"/>',
    sparkPlug: '<path d="M10 3h4v5l2 2-5 5-2-2 3-3V8h-2z"/><path d="M9 13l-4 4M6 16l2 2M4 18l2 2"/>',
    valveClearance: '<path d="M6 5h12M8 5v5l4 3 4-3V5"/><path d="M7 19h10M9 19v-5M15 19v-5"/>',
    chain: '<path d="M8.5 8.5 6.8 6.8a3 3 0 0 0-4.2 4.2l2.2 2.2A3 3 0 0 0 9 13"/><path d="m15.5 15.5 1.7 1.7a3 3 0 0 0 4.2-4.2l-2.2-2.2A3 3 0 0 0 15 11"/><path d="m8 16 8-8"/>',
    chainSlider: '<path d="M4 8.5h13.5a2.5 2.5 0 0 1 0 5H8.5"/><path d="M4 15.5h12.5"/><circle cx="6" cy="12" r="1.25"/><circle cx="10" cy="12" r="1.25"/><circle cx="14" cy="12" r="1.25"/>',
    clutch: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 5v3M12 16v3M5 12h3M16 12h3"/>',
    brakeFluid: '<path d="M6 8h12v10H6z"/><path d="M8 8V5h8v3"/><path d="M12 11c-1.2 1.5-2 2.7-2 3.5a2 2 0 0 0 4 0c0-.8-.8-2-2-3.5z"/>',
    brakePads: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M5 8 3 6M19 8l2-2M5 16l-2 2M19 16l2 2"/>',
    brakeSystem: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M4 9h3M17 9h3M4 15h3M17 15h3"/>',
    battery: '<rect x="5" y="7" width="14" height="11" rx="2"/><path d="M9 7V5h6v2M9 12h4M11 10v4M15 12h2"/>',
    tires: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/>',
    general: '<path d="M14 6a4 4 0 0 0-5 5L4 16l4 4 5-5a4 4 0 0 0 5-5l-3 3-3-3z"/>',
    majorService: '<path d="M7 4v4M17 4v4M4 10h16v10H4z"/><path d="M8 14h2M14 14h2M8 17h2M14 17h2"/>',
  };

  const fallback = '<circle cx="12" cy="12" r="7"/><path d="M12 8v5M12 16h.01"/>';

  function svgFor(key) { return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[key] || fallback}</svg>`; }
  function keyFromName(name) { const clean = String(name || '').trim(); if (byName.has(clean)) return byName.get(clean); const item = items.find((entry) => clean.includes(entry.name) || entry.name.includes(clean)); return item?.key || ''; }
  function makeIcon(key, extraClass = '') { const span = document.createElement('span'); span.className = `maintenance-icon ${extraClass}`.trim(); span.dataset.itemIcon = key || 'unknown'; span.innerHTML = svgFor(key); return span; }
  function decorateQuick() { document.querySelectorAll('.quick[data-quick]').forEach((button) => { if (button.querySelector('.maintenance-icon')) return; button.prepend(makeIcon(button.dataset.quick, 'maintenance-icon--quick')); }); }
  function decorateReminders() { document.querySelectorAll('.reminder').forEach((card) => { if (card.querySelector(':scope > .maintenance-icon')) return; const key = card.querySelector('[data-complete]')?.dataset.complete || keyFromName(card.querySelector('.reminder-name')?.textContent); card.prepend(makeIcon(key, 'maintenance-icon--card')); }); }
  function decorateHistory() { document.querySelectorAll('.visit-item').forEach((row) => { if (row.querySelector(':scope > .maintenance-icon')) return; const key = keyFromName(row.querySelector('.visit-name')?.textContent); row.prepend(makeIcon(key, 'maintenance-icon--history')); }); }
  function decorateSchedule() { document.querySelectorAll('.schedule-row').forEach((row) => { if (row.querySelector('.maintenance-icon')) return; const key = keyFromName(row.querySelector('.schedule-name')?.textContent); row.prepend(makeIcon(key, 'maintenance-icon--schedule')); }); }
  function decorateDashboard() { document.querySelectorAll('.dash-card').forEach((card) => { const label = card.querySelector(':scope > span')?.textContent?.trim(); if (label !== '下次保養' || card.querySelector('.maintenance-icon')) return; const key = keyFromName(card.querySelector('strong')?.textContent); card.prepend(makeIcon(key, 'maintenance-icon--dash')); }); }
  function decorate() { decorateQuick(); decorateReminders(); decorateHistory(); decorateSchedule(); decorateDashboard(); }
  let queued = false;
  const observer = new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; decorate(); }); });
  observer.observe(document.body, { childList: true, subtree: true });
  decorate();
})();
