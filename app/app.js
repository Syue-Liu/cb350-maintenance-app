const MAINTENANCE_ITEMS = CB350Data.MAINTENANCE_ITEMS;
const {
  parseMaintenanceText,
  findLatestRecord,
  sortRecordsDesc,
  isDuplicateRecord,
  toDateInput,
  defaultUuid: newId,
} = CB350Parser;

const MAJOR_SERVICE_KM = 20000;
const MINOR_SERVICE_KM = 6000;
const STORAGE_KEY = "cb350-maintenance-app-v1";
const TOAST_MS = 4000;

const state = loadState();

const els = {
  bikeForm: document.querySelector("#bikeForm"),
  currentMileage: document.querySelector("#currentMileage"),
  currentDate: document.querySelector("#currentDate"),
  statusStrip: document.querySelector("#statusStrip"),

  chatForm: document.querySelector("#chatForm"),
  chatText: document.querySelector("#chatText"),
  sampleButton: document.querySelector("#sampleButton"),

  reminderList: document.querySelector("#reminderList"),
  toggleRemindersButton: document.querySelector("#toggleRemindersButton"),
  visitList: document.querySelector("#visitList"),
  scheduleList: document.querySelector("#scheduleList"),

  syncKey: document.querySelector("#syncKey"),
  syncStatus: document.querySelector("#syncStatus"),
  exportButton: document.querySelector("#exportButton"),
  clearButton: document.querySelector("#clearButton"),
  settingsButton: document.querySelector("#settingsButton"),
  closeSettingsButton: document.querySelector("#closeSettingsButton"),

  toast: document.querySelector("#toast"),
  tabBadge: document.querySelector("#tabBadge"),
};

let toastTimer = 0;

init();

function init() {
  els.currentMileage.value = state.settings.currentMileage || "";
  els.currentDate.value = state.settings.currentDate || toDateInput(new Date());
  els.syncKey.value = state.settings.syncKey || "";

  // 端點沒有 UI 可以修改，每次載入都重算，避免 localStorage 留著舊網域的值。
  state.settings.syncEndpoint = defaultSyncEndpoint();

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
  document.querySelectorAll("[data-quick]").forEach((button) => {
    button.addEventListener("click", () => insertQuickText(button.dataset.quick));
  });

  els.bikeForm.addEventListener("submit", updateSettings);
  els.chatForm.addEventListener("submit", handleAdd);
  els.sampleButton.addEventListener("click", fillSample);
  els.toggleRemindersButton.addEventListener("click", toggleReminderExpansion);
  els.exportButton.addEventListener("click", exportData);
  els.clearButton.addEventListener("click", clearRecords);
  els.syncKey.addEventListener("change", updateSyncKey);
  els.settingsButton.addEventListener("click", () => switchTab("settings"));
  els.closeSettingsButton.addEventListener("click", () => switchTab("reminders"));

  updateSyncStatus();
  render();
  downloadCloudData({ silent: true });
}

/* ------------------------------------------------------------------ 狀態 */

function loadState() {
  const fallback = {
    settings: {
      currentMileage: "",
      currentDate: toDateInput(new Date()),
      syncEndpoint: "",
      syncKey: "",
      lastCloudSyncAt: "",
      showAllReminders: false,
    },
    records: [],
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return fallback;
    return { settings: { ...fallback.settings, ...saved.settings }, records: saved.records || [] };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveStateAndSync() {
  saveState();
  uploadCloudData({ silent: true });
}

function updateSettings(event) {
  event.preventDefault();
  state.settings.currentMileage = Number(els.currentMileage.value) || "";
  state.settings.currentDate = els.currentDate.value || toDateInput(new Date());
  saveStateAndSync();
  render();
  setToast("里程已更新，提醒重新算過了。");
}

/* ------------------------------------------------------------------ 新增紀錄 */

function handleAdd(event) {
  event.preventDefault();
  const text = els.chatText.value.trim();
  if (!text) {
    setToast("先寫一句今天做了什麼。", "warn");
    return;
  }

  const parsed = parseMaintenanceText(text, {
    items: MAINTENANCE_ITEMS,
    fallbackDate: state.settings.currentDate,
    fallbackMileage: state.settings.currentMileage,
    uuid: newId,
  });

  if (!parsed.records.length) {
    setToast("沒抓到保養項目。試試「里程 12850 換機油、清潔鏈條，費用 950」。", "warn");
    return;
  }

  const fresh = parsed.records.filter((record) => !isDuplicateRecord(state.records, record));
  const skipped = parsed.records.length - fresh.length;

  if (!fresh.length) {
    setToast("同一天、同里程已經記過這些項目了。", "warn");
    return;
  }

  state.records.unshift(...fresh);

  // 補登舊維修單時，不可以把「目前里程/日期」往回改。
  const parsedMileage = Number(parsed.mileage) || 0;
  if (parsedMileage > (Number(state.settings.currentMileage) || 0)) {
    state.settings.currentMileage = parsedMileage;
    els.currentMileage.value = parsedMileage;
  }
  if (parsed.date && (!state.settings.currentDate || parsed.date >= state.settings.currentDate)) {
    state.settings.currentDate = parsed.date;
    els.currentDate.value = parsed.date;
  }

  saveStateAndSync();
  render();

  const names = fresh.map((record) => record.item).join("、");
  setToast(`加入 ${fresh.length} 筆：${names}${skipped ? `（略過 ${skipped} 筆重複）` : ""}`);
  els.chatText.value = "";
  switchTab("reminders");
}

function insertQuickText(item) {
  const map = {
    機油: "更換機油 10W-30",
    鏈條: "清潔並潤滑鏈條",
    煞車油: "更換煞車油 DOT 4",
    火星塞: "更換火星塞 NGK MR6K-9",
  };
  const mileage = els.currentMileage.value || "";
  const prefix = `${els.currentDate.value}${mileage ? ` 里程 ${mileage}` : ""}，`;
  els.chatText.value = `${prefix}${map[item] || `檢查${item}`}`;
  els.chatText.focus();
}

function fillSample() {
  els.chatText.value = "今天 里程 12850，換機油 10W-30、清潔潤滑鏈條、檢查煞車皮，費用 950 元";
  els.chatText.focus();
}

/* ------------------------------------------------------------------ 畫面 */

function render() {
  renderStatusStrip();
  renderReminders();
  renderVisits();
  renderSchedule();
}

function renderStatusStrip() {
  const reminders = getReminders();
  const due = reminders.filter((item) => item.status === "due").length;
  const soon = reminders.filter((item) => item.status === "soon").length;

  els.tabBadge.hidden = due === 0;

  if (!state.settings.currentMileage) {
    els.statusStrip.innerHTML = "填上目前里程，就會開始幫你算下一次保養。";
    return;
  }
  if (!due && !soon) {
    els.statusStrip.innerHTML = `目前都在週期內，下次小保養 <span class="count">${formatKm(
      nextCycle(Number(state.settings.currentMileage), MINOR_SERVICE_KM),
    )}</span>`;
    return;
  }

  const parts = [];
  if (due) parts.push(`<span class="count due">${due}</span> 項已到期`);
  if (soon) parts.push(`<span class="count soon">${soon}</span> 項快到期`);
  els.statusStrip.innerHTML = parts.join("，");
}

function renderReminders() {
  const reminders = getReminders();
  const showAll = Boolean(state.settings.showAllReminders);
  const visible = showAll ? reminders : reminders.filter((item) => item.status !== "ok");
  els.toggleRemindersButton.textContent = showAll ? "只看要處理的" : "展開全部";

  if (!visible.length) {
    els.reminderList.innerHTML = `
      <div class="empty">
        <b>沒有到期項目</b>
        正常的項目已收合，需要時會自動出現在這裡。
      </div>`;
    return;
  }

  els.reminderList.innerHTML = visible
    .map(
      (item) => `
        <article class="reminder ${item.status}">
          <div class="reminder-name">${escapeHtml(item.name)}</div>
          <span class="reminder-state">${statusText(item.status)}</span>
          <div class="reminder-meta">${item.meta}</div>
          <button class="reminder-done" type="button" data-complete="${item.key}">記錄完成</button>
        </article>`,
    )
    .join("");

  els.reminderList.querySelectorAll("[data-complete]").forEach((button) => {
    button.addEventListener("click", () => completeReminder(button.dataset.complete));
  });
}

function renderVisits() {
  if (!state.records.length) {
    els.visitList.innerHTML = `
      <div class="empty">
        <b>還沒有紀錄</b>
        到「新增」寫一句今天做了什麼，或按下方的常用項目。
      </div>`;
    return;
  }

  const groups = new Map();
  sortRecordsDesc(state.records).forEach((record) => {
    const key = `${record.date || "-"}|${record.mileage || 0}`;
    if (!groups.has(key)) groups.set(key, { date: record.date, mileage: record.mileage, items: [] });
    groups.get(key).items.push(record);
  });

  els.visitList.innerHTML = [...groups.values()]
    .map((visit) => {
      const total = visit.items.reduce((sum, record) => sum + (Number(record.cost) || 0), 0);
      const rows = visit.items
        .map(
          (record) => `
            <div class="visit-item">
              <span class="visit-name">${escapeHtml(record.item)}</span>
              <span class="visit-cost">${record.cost ? `NT$ ${number(record.cost)}` : ""}</span>
              <button class="visit-del" type="button" data-delete="${record.id}" aria-label="刪除 ${escapeHtml(
                record.item,
              )}">×</button>
              <span class="visit-action">${escapeHtml(record.action || "")}</span>
              ${record.note ? `<span class="visit-note">${escapeHtml(record.note)}</span>` : ""}
            </div>`,
        )
        .join("");
      return `
        <article class="visit">
          <header class="visit-head">
            <span class="visit-date">${escapeHtml(visit.date || "日期未填")}</span>
            <span class="visit-odo">${visit.mileage ? formatKm(visit.mileage) : "里程未填"}${
              total ? `　NT$ ${number(total)}` : ""
            }</span>
          </header>
          ${rows}
        </article>`;
    })
    .join("");

  els.visitList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.records = state.records.filter((record) => record.id !== button.dataset.delete);
      saveStateAndSync();
      render();
      setToast("已刪除一筆。");
    });
  });
}

function renderSchedule() {
  const mileage = Number(state.settings.currentMileage) || 0;
  const milestones = mileage
    ? `
      <div class="schedule-row">
        <span class="schedule-name">下次小保養</span>
        <span class="schedule-every">${formatKm(nextCycle(mileage, MINOR_SERVICE_KM))}</span>
      </div>
      <div class="schedule-row">
        <span class="schedule-name">下次大保養</span>
        <span class="schedule-every">${formatKm(nextCycle(mileage, MAJOR_SERVICE_KM))}</span>
      </div>`
    : "";

  els.scheduleList.innerHTML =
    milestones +
    MAINTENANCE_ITEMS.map((item) => {
      const km = item.kmInterval ? `每 ${formatKm(item.kmInterval)}` : "";
      const months = item.monthInterval ? `每 ${item.monthInterval} 個月` : "";
      const every = [km, months].filter(Boolean).join("　或　") || "依車況";
      return `
        <div class="schedule-row">
          <span class="schedule-name">${escapeHtml(item.name)}</span>
          <span class="schedule-every">${every}</span>
        </div>`;
    }).join("");
}

/* ------------------------------------------------------------------ 提醒計算 */

function getReminders() {
  const currentMileage = Number(state.settings.currentMileage) || 0;
  const currentDate = parseLocalDate(state.settings.currentDate || toDateInput(new Date()));

  return MAINTENANCE_ITEMS.map((item) => {
    const last = findLatestRecord(state.records, item);
    const lastMileage = Number(last?.mileage) || 0;
    const lastDate = last?.date ? parseLocalDate(last.date) : null;

    const nextKm = item.kmInterval
      ? lastMileage
        ? lastMileage + item.kmInterval
        : nextCycle(currentMileage, item.kmInterval)
      : 0;
    const nextDate = item.monthInterval && lastDate ? addMonths(lastDate, item.monthInterval) : null;

    const kmLeft = nextKm ? nextKm - currentMileage : Infinity;
    const daysLeft = nextDate ? Math.ceil((nextDate - currentDate) / 86400000) : Infinity;
    const status = kmLeft <= 0 || daysLeft <= 0 ? "due" : kmLeft <= 300 || daysLeft <= 30 ? "soon" : "ok";

    return { ...item, status, meta: buildReminderMeta({ nextKm, kmLeft, nextDate, daysLeft, last }) };
  }).sort((a, b) => statusRank(a.status) - statusRank(b.status));
}

function buildReminderMeta({ nextKm, kmLeft, nextDate, daysLeft, last }) {
  const parts = [];
  if (nextKm) {
    const left = Number.isFinite(kmLeft)
      ? kmLeft <= 0
        ? `已超過 <b>${formatKm(Math.abs(kmLeft))}</b>`
        : `還有 <b>${formatKm(kmLeft)}</b>`
      : "";
    parts.push(`下次 <b>${formatKm(nextKm)}</b>${left ? `，${left}` : ""}`);
  }
  if (nextDate) {
    const left = daysLeft <= 0 ? `已過期 <b>${Math.abs(daysLeft)}</b> 天` : `還有 <b>${daysLeft}</b> 天`;
    parts.push(`${toDateInput(nextDate)}，${left}`);
  }
  if (!parts.length) parts.push(last ? "依車況檢查" : "還沒有紀錄，記一筆就會開始算");
  return parts.join("<br>");
}

function completeReminder(key) {
  const item = MAINTENANCE_ITEMS.find((entry) => entry.key === key);
  if (!item) return;

  const mileage = Number(state.settings.currentMileage) || 0;
  if (!mileage) {
    setToast("先填上目前里程，才能推算下一次。", "warn");
    els.currentMileage.focus();
    return;
  }

  const date = state.settings.currentDate || toDateInput(new Date());
  const createdAt = new Date().toISOString();
  const record = {
    id: newId(),
    date,
    mileage,
    item: item.name,
    key: item.key,
    action: item.action,
    cost: "",
    note: item.note,
    createdAt,
    updatedAt: createdAt,
  };

  if (isDuplicateRecord(state.records, record)) {
    setToast(`${item.name}在同一天、同里程已經記過了。`, "warn");
    return;
  }

  state.records.unshift(record);
  saveStateAndSync();
  render();
  setToast(`${item.name}已記錄，提醒推到下一次。要補費用就到「新增」再寫一次。`);
}

/* ------------------------------------------------------------------ 雲端同步 */

function defaultSyncEndpoint() {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith("github.io")) {
    return "https://cb350-maintenance-app.vercel.app/api/sync";
  }
  return `${window.location.origin}/api/sync`;
}

function cloudPayload() {
  return {
    settings: {
      currentMileage: state.settings.currentMileage,
      currentDate: state.settings.currentDate,
      showAllReminders: state.settings.showAllReminders,
    },
    records: state.records,
  };
}

async function uploadCloudData({ silent = false } = {}) {
  if (!state.settings.syncKey || !state.settings.syncEndpoint) {
    if (!silent) setSyncStatus("請先輸入同步代碼。", "warn");
    return;
  }
  try {
    setSyncStatus("正在備份…", "busy");
    const response = await fetch(state.settings.syncEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: state.settings.syncKey, data: cloudPayload() }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    state.settings.lastCloudSyncAt = result.data?.cloudUpdatedAt || new Date().toISOString();
    saveState();
    setSyncStatus(`已備份 ${formatDateTime(state.settings.lastCloudSyncAt)}`, "ok");
  } catch (error) {
    setSyncStatus(`備份失敗：${error.message}`, "warn");
    console.warn("[sync] upload failed", state.settings.syncEndpoint, error);
    if (!silent) setToast(`備份失敗：${error.message}`, "warn");
  }
}

async function downloadCloudData({ silent = false, uploadIfEmpty = false } = {}) {
  if (!state.settings.syncKey || !state.settings.syncEndpoint) {
    setSyncStatus("手機和電腦輸入同一組代碼就會共用資料。", "");
    return;
  }
  try {
    setSyncStatus("正在同步…", "busy");
    const url = `${state.settings.syncEndpoint}?key=${encodeURIComponent(state.settings.syncKey)}`;
    const response = await fetch(url);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

    if (!result.data) {
      setSyncStatus("這組代碼還沒有雲端資料，之後的變更會自動備份。", "warn");
      if (uploadIfEmpty && state.records.length) uploadCloudData({ silent: true });
      return;
    }

    state.settings = {
      ...state.settings,
      ...result.data.settings,
      syncKey: state.settings.syncKey,
      syncEndpoint: state.settings.syncEndpoint,
      lastCloudSyncAt: result.data.cloudUpdatedAt || new Date().toISOString(),
    };
    state.records = Array.isArray(result.data.records) ? result.data.records : [];
    saveState();

    els.currentMileage.value = state.settings.currentMileage || "";
    els.currentDate.value = state.settings.currentDate || toDateInput(new Date());
    render();
    setSyncStatus(`已同步 ${formatDateTime(state.settings.lastCloudSyncAt)}`, "ok");
    if (!silent) setToast("已從雲端取回保養資料。");
  } catch (error) {
    setSyncStatus(`同步失敗：${error.message}`, "warn");
    console.warn("[sync] download failed", state.settings.syncEndpoint, error);
    if (!silent) setToast(`同步失敗：${error.message}`, "warn");
  }
}

function updateSyncKey() {
  state.settings.syncKey = els.syncKey.value.trim();
  saveState();
  updateSyncStatus();
  downloadCloudData({ silent: false, uploadIfEmpty: true });
}

function updateSyncStatus() {
  if (!state.settings.syncKey) {
    setSyncStatus("手機和電腦輸入同一組代碼就會共用資料。", "");
    return;
  }
  setSyncStatus(
    state.settings.lastCloudSyncAt
      ? `上次同步 ${formatDateTime(state.settings.lastCloudSyncAt)}`
      : "等待第一次同步",
    "ok",
  );
}

function setSyncStatus(text, status) {
  els.syncStatus.textContent = text;
  els.syncStatus.dataset.status = status;
}

/* ------------------------------------------------------------------ 其他動作 */

function toggleReminderExpansion() {
  state.settings.showAllReminders = !state.settings.showAllReminders;
  saveStateAndSync();
  renderReminders();
}

function clearRecords() {
  if (!confirm("確定要清空所有保養紀錄嗎？這個動作無法復原。")) return;
  state.records = [];
  saveStateAndSync();
  render();
  setToast("紀錄已清空，里程設定保留。", "warn");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cb350-maintenance-${toDateInput(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setToast("備份檔已下載。");
}

function switchTab(tabId) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("is-active", view.id === tabId);
  });
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.tab === tabId;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setToast(text, kind = "ok") {
  els.toast.textContent = text;
  els.toast.dataset.kind = kind;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, TOAST_MS);
}

/* ------------------------------------------------------------------ 小工具 */

function nextCycle(current, interval) {
  return Math.ceil((current + 1) / interval) * interval;
}

function statusRank(status) {
  return { due: 0, soon: 1, ok: 2 }[status] ?? 3;
}

function statusText(status) {
  return { due: "已到期", soon: "快到期", ok: "正常" }[status] || status;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function parseLocalDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatKm(value) {
  return `${number(value)} km`;
}

function number(value) {
  return Number(value).toLocaleString("zh-TW");
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
