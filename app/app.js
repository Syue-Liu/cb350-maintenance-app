const { MAINTENANCE_ITEMS, CATEGORIES } = CB350Data;
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

const ITEM_BY_KEY = new Map(MAINTENANCE_ITEMS.map((item) => [item.key, item]));
const CATEGORY_BY_KEY = new Map(CATEGORIES.map((category) => [category.key, category]));

const state = loadState();

const els = {};
[
  "bikeForm", "currentMileage", "currentDate", "statusStrip",
  "quickRow", "addForm", "addItem", "addAction", "addDate", "addMileage",
  "addBrand", "addCost", "addNote",
  "chatForm", "chatText", "sampleButton",
  "reminderList", "toggleRemindersButton", "visitList", "scheduleList",
  "spendSummary", "spendByItem", "spendByYear",
  "syncKey", "syncStatus", "syncTestButton", "syncDiag",
  "exportButton", "clearButton", "settingsButton", "closeSettingsButton",
  "toast", "tabBadge",
].forEach((id) => {
  els[id] = document.querySelector(`#${id}`);
});

let toastTimer = 0;

init();

function init() {
  els.currentMileage.value = state.settings.currentMileage || "";
  els.currentDate.value = state.settings.currentDate || toDateInput(new Date());
  els.syncKey.value = state.settings.syncKey || "";

  // 端點沒有 UI 可以修改，每次載入都重算，避免 localStorage 留著舊網域的值。
  state.settings.syncEndpoint = defaultSyncEndpoint();

  buildItemSelect();
  buildQuickRow();
  resetAddForm();

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  els.bikeForm.addEventListener("submit", updateSettings);
  els.addForm.addEventListener("submit", handleManualAdd);
  els.addItem.addEventListener("change", () => syncActionOptions(els.addItem.value));
  els.chatForm.addEventListener("submit", handleTextAdd);
  els.sampleButton.addEventListener("click", fillSample);
  els.toggleRemindersButton.addEventListener("click", toggleReminderExpansion);
  els.exportButton.addEventListener("click", exportData);
  els.clearButton.addEventListener("click", clearRecords);
  els.syncKey.addEventListener("change", updateSyncKey);
  els.syncTestButton.addEventListener("click", testSyncConnection);
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
  resetAddForm({ keepItem: true });
  render();
  setToast("里程已更新，提醒重新算過了。");
}

/* ------------------------------------------------------------------ 新增表單 */

function buildItemSelect() {
  els.addItem.innerHTML = CATEGORIES.map((category) => {
    const options = MAINTENANCE_ITEMS.filter((item) => item.category === category.key)
      .map((item) => `<option value="${item.key}">${escapeHtml(item.name)}</option>`)
      .join("");
    return options ? `<optgroup label="${escapeHtml(category.name)}">${options}</optgroup>` : "";
  }).join("");
}

function buildQuickRow() {
  const frequent = MAINTENANCE_ITEMS.filter((item) => item.frequent).sort(
    (a, b) => (a.kmInterval || Infinity) - (b.kmInterval || Infinity),
  );
  els.quickRow.innerHTML = frequent
    .map((item) => {
      const every = item.kmInterval ? formatKm(item.kmInterval) : `${item.monthInterval} 個月`;
      return `
        <button class="quick" type="button" data-quick="${item.key}">
          <span class="quick-name">${escapeHtml(item.name)}</span>
          <span class="quick-every">每 ${every}</span>
        </button>`;
    })
    .join("");

  els.quickRow.querySelectorAll("[data-quick]").forEach((button) => {
    button.addEventListener("click", () => {
      els.addItem.value = button.dataset.quick;
      syncActionOptions(button.dataset.quick);
      prefillSpec(button.dataset.quick);
      els.addForm.scrollIntoView({ block: "nearest", behavior: "smooth" });
      els.quickRow.querySelectorAll(".quick").forEach((other) => {
        other.classList.toggle("is-active", other === button);
      });
    });
  });
}

function syncActionOptions(itemKey) {
  const item = ITEM_BY_KEY.get(itemKey);
  if (!item) return;
  const actions = item.actions && item.actions.length ? item.actions : [item.action];
  els.addAction.innerHTML = actions
    .map((action) => `<option value="${escapeHtml(action)}">${escapeHtml(action)}</option>`)
    .join("");
}

function prefillSpec(itemKey) {
  const item = ITEM_BY_KEY.get(itemKey);
  if (item && item.defaultSpec && !els.addBrand.value.trim()) {
    els.addBrand.value = item.defaultSpec;
  }
}

function resetAddForm({ keepItem = false } = {}) {
  if (!keepItem) els.addItem.value = MAINTENANCE_ITEMS[0].key;
  syncActionOptions(els.addItem.value);
  els.addDate.value = state.settings.currentDate || toDateInput(new Date());
  els.addMileage.value = state.settings.currentMileage || "";
  els.addBrand.value = "";
  els.addCost.value = "";
  els.addNote.value = "";
  els.quickRow.querySelectorAll(".quick").forEach((button) => button.classList.remove("is-active"));
}

function handleManualAdd(event) {
  event.preventDefault();
  const item = ITEM_BY_KEY.get(els.addItem.value);
  if (!item) return;

  const mileage = Number(els.addMileage.value) || 0;
  if (!mileage) {
    setToast("里程要填，才能算下一次。", "warn");
    els.addMileage.focus();
    return;
  }

  const brand = els.addBrand.value.trim();
  const extraNote = els.addNote.value.trim();
  const createdAt = new Date().toISOString();
  const record = {
    id: newId(),
    date: els.addDate.value || toDateInput(new Date()),
    mileage,
    item: item.name,
    key: item.key,
    action: els.addAction.value || item.action,
    brand,
    cost: Number(els.addCost.value) || "",
    note: extraNote || item.note,
    createdAt,
    updatedAt: createdAt,
  };

  if (isDuplicateRecord(state.records, record)) {
    setToast(`${item.name}在同一天、同里程已經記過了。`, "warn");
    return;
  }

  commitRecords([record], { mileage: record.mileage, date: record.date });
  resetAddForm();
  setToast(`已加入 ${item.name}（${record.action}）${record.cost ? ` NT$ ${number(record.cost)}` : ""}`);
  switchTab("reminders");
}

function handleTextAdd(event) {
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

  commitRecords(fresh, { mileage: parsed.mileage, date: parsed.date });
  els.chatText.value = "";
  const names = fresh.map((record) => record.item).join("、");
  setToast(`加入 ${fresh.length} 筆：${names}${skipped ? `（略過 ${skipped} 筆重複）` : ""}`);
  switchTab("reminders");
}

/** 寫入紀錄，並在里程/日期比現值新時同步更新目前狀態。 */
function commitRecords(records, { mileage, date }) {
  state.records.unshift(...records);

  const value = Number(mileage) || 0;
  if (value > (Number(state.settings.currentMileage) || 0)) {
    state.settings.currentMileage = value;
    els.currentMileage.value = value;
  }
  if (date && (!state.settings.currentDate || date >= state.settings.currentDate)) {
    state.settings.currentDate = date;
    els.currentDate.value = date;
  }

  saveStateAndSync();
  render();
}

function fillSample() {
  els.chatText.value = "今天 里程 12850，換機油 10W-40、清潔潤滑鏈條、檢查煞車皮，費用 950 元";
  els.chatText.focus();
}

/* ------------------------------------------------------------------ 畫面 */

function render() {
  renderStatusStrip();
  renderReminders();
  renderVisits();
  renderSpending();
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
    .map((item) => {
      const category = CATEGORY_BY_KEY.get(item.category);
      return `
        <article class="reminder ${item.status}">
          <div class="reminder-top">
            <span class="reminder-name">${escapeHtml(item.name)}</span>
            <span class="reminder-cat" style="color:${category ? category.color : "inherit"}">${escapeHtml(
              category ? category.name : "",
            )}</span>
            <span class="reminder-state">${statusText(item.status)}</span>
          </div>
          <div class="bar" role="presentation"><span style="width:${item.progress}%"></span></div>
          <div class="reminder-bottom">
            <span class="reminder-meta">${item.meta}</span>
            <button class="reminder-done" type="button" data-complete="${item.key}">記錄完成</button>
          </div>
        </article>`;
    })
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
        到「新增」選一個項目，或用一句話記下今天做了什麼。
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
        .map((record) => {
          const category = CATEGORY_BY_KEY.get(ITEM_BY_KEY.get(record.key)?.category);
          const detail = [record.action, record.brand].filter(Boolean).join("　");
          return `
            <div class="visit-item">
              <span class="dot" style="background:${category ? category.color : "#999"}"></span>
              <span class="visit-name">${escapeHtml(record.item)}</span>
              <span class="visit-cost">${record.cost ? `NT$ ${number(record.cost)}` : ""}</span>
              <button class="visit-del" type="button" data-delete="${record.id}" aria-label="刪除 ${escapeHtml(
                record.item,
              )}">×</button>
              ${detail ? `<span class="visit-detail">${escapeHtml(detail)}</span>` : ""}
              ${record.note ? `<span class="visit-note">${escapeHtml(record.note)}</span>` : ""}
            </div>`;
        })
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

function renderSpending() {
  const withCost = state.records.filter((record) => Number(record.cost) > 0);
  if (!withCost.length) {
    els.spendSummary.innerHTML = `
      <div class="empty">
        <b>還沒有花費資料</b>
        新增紀錄時填上金額，這裡就會統計總花費、各項目佔比和每年支出。
      </div>`;
    els.spendByItem.innerHTML = "";
    els.spendByYear.innerHTML = "";
    return;
  }

  const total = withCost.reduce((sum, record) => sum + Number(record.cost), 0);
  const dates = withCost.map((record) => record.date).filter(Boolean).sort();
  const mileages = state.records.map((record) => Number(record.mileage) || 0).filter(Boolean);
  const span = mileages.length ? Math.max(...mileages) - Math.min(...mileages) : 0;
  const visits = new Set(state.records.map((record) => `${record.date}|${record.mileage}`)).size;

  els.spendSummary.innerHTML = `
    <div class="spend-total">
      <span class="spend-total-label">累計花費</span>
      <strong>NT$ ${number(total)}</strong>
    </div>
    <dl class="spend-facts">
      <div><dt>進廠次數</dt><dd>${visits} 次</dd></div>
      <div><dt>平均每次</dt><dd>NT$ ${number(Math.round(total / visits))}</dd></div>
      <div><dt>每 1,000 km</dt><dd>${span ? `NT$ ${number(Math.round((total / span) * 1000))}` : "—"}</dd></div>
      <div><dt>紀錄起訖</dt><dd>${dates[0] || "—"} 起</dd></div>
    </dl>`;

  const byItem = new Map();
  withCost.forEach((record) => {
    const entry = byItem.get(record.key) || { name: record.item, key: record.key, sum: 0, count: 0 };
    entry.sum += Number(record.cost);
    entry.count += 1;
    byItem.set(record.key, entry);
  });
  const ranked = [...byItem.values()].sort((a, b) => b.sum - a.sum);
  const max = ranked[0].sum;

  els.spendByItem.innerHTML = `
    <h3 class="sub-head">依項目</h3>
    ${ranked
      .map((entry) => {
        const category = CATEGORY_BY_KEY.get(ITEM_BY_KEY.get(entry.key)?.category);
        const color = category ? category.color : "#4A5560";
        return `
          <div class="spend-row">
            <div class="spend-row-top">
              <span class="spend-name">${escapeHtml(entry.name)}</span>
              <span class="spend-count">${entry.count} 次</span>
              <span class="spend-sum">NT$ ${number(entry.sum)}</span>
            </div>
            <div class="bar"><span style="width:${Math.round((entry.sum / max) * 100)}%;background:${color}"></span></div>
          </div>`;
      })
      .join("")}`;

  const byYear = new Map();
  withCost.forEach((record) => {
    const year = String(record.date || "").slice(0, 4) || "未填日期";
    byYear.set(year, (byYear.get(year) || 0) + Number(record.cost));
  });
  const years = [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  els.spendByYear.innerHTML = `
    <h3 class="sub-head">依年度</h3>
    ${years
      .map(
        ([year, sum]) => `
          <div class="schedule-row">
            <span class="schedule-name">${escapeHtml(year)}</span>
            <span class="schedule-every">NT$ ${number(sum)}</span>
          </div>`,
      )
      .join("")}`;
}

function renderSchedule() {
  const mileage = Number(state.settings.currentMileage) || 0;
  const milestones = mileage
    ? `<h3 class="sub-head">接下來</h3>
       <div class="schedule-row">
         <span class="schedule-name">小保養</span>
         <span class="schedule-every">${formatKm(nextCycle(mileage, MINOR_SERVICE_KM))}</span>
       </div>
       <div class="schedule-row">
         <span class="schedule-name">大保養</span>
         <span class="schedule-every">${formatKm(nextCycle(mileage, MAJOR_SERVICE_KM))}</span>
       </div>`
    : "";

  const groups = CATEGORIES.map((category) => {
    const rows = MAINTENANCE_ITEMS.filter((item) => item.category === category.key)
      .map((item) => {
        const km = item.kmInterval ? `每 ${formatKm(item.kmInterval)}` : "";
        const months = item.monthInterval ? `每 ${item.monthInterval} 個月` : "";
        const every = [km, months].filter(Boolean).join("　或　") || "依車況";
        return `
          <div class="schedule-row">
            <span class="schedule-name">${escapeHtml(item.name)}</span>
            <span class="schedule-every">${every}</span>
          </div>`;
      })
      .join("");
    return rows
      ? `<h3 class="sub-head" style="color:${category.color}">${escapeHtml(category.name)}</h3>${rows}`
      : "";
  }).join("");

  els.scheduleList.innerHTML = milestones + groups;
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

    // 進度條：這個週期已經用掉多少。km 與時間取用得比較多的那一個。
    const kmUsed = item.kmInterval && Number.isFinite(kmLeft) ? 1 - kmLeft / item.kmInterval : 0;
    const dayInterval = item.monthInterval ? item.monthInterval * 30.4 : 0;
    const dayUsed = dayInterval && Number.isFinite(daysLeft) ? 1 - daysLeft / dayInterval : 0;
    const progress = Math.max(0, Math.min(1, Math.max(kmUsed, dayUsed))) * 100;

    return {
      ...item,
      status,
      progress: Math.round(progress),
      meta: buildReminderMeta({ nextKm, kmLeft, nextDate, daysLeft, last }),
    };
  }).sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.progress - a.progress);
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
  const item = ITEM_BY_KEY.get(key);
  if (!item) return;

  const mileage = Number(state.settings.currentMileage) || 0;
  if (!mileage) {
    setToast("先填上目前里程，才能推算下一次。", "warn");
    els.currentMileage.focus();
    return;
  }

  // 帶著項目跳到新增頁，廠牌和金額可以順手補，不想填就直接送出。
  switchTab("compose");
  els.addItem.value = item.key;
  syncActionOptions(item.key);
  els.addDate.value = state.settings.currentDate || toDateInput(new Date());
  els.addMileage.value = mileage;
  els.addBrand.value = item.defaultSpec || "";
  els.addCost.value = "";
  els.addNote.value = "";
  els.addCost.focus();
  setToast(`${item.name}已帶入表單，填金額或直接按加入。`);
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
    resetAddForm();
    render();
    setSyncStatus(`已同步 ${formatDateTime(state.settings.lastCloudSyncAt)}`, "ok");
    if (!silent) setToast("已從雲端取回保養資料。");
  } catch (error) {
    setSyncStatus(`同步失敗：${error.message}`, "warn");
    console.warn("[sync] download failed", state.settings.syncEndpoint, error);
    if (!silent) setToast(`同步失敗：${error.message}`, "warn");
  }
}

/** 直接在 App 裡打 ?diag=1，省得在手機上開網址查問題。 */
async function testSyncConnection() {
  els.syncDiag.hidden = false;
  els.syncDiag.textContent = "測試中…";
  try {
    const response = await fetch(`${state.settings.syncEndpoint}?diag=1`);
    const report = await response.json();
    const lines = [
      `後端　　${report.backend}`,
      `連線　　${report.ok ? "正常" : "失敗"}`,
      report.redisHost ? `主機　　${report.redisHost}` : "",
      report.error ? `錯誤　　${report.error}` : "",
      report.hint ? `\n${report.hint}` : "",
    ].filter(Boolean);
    els.syncDiag.textContent = lines.join("\n");
    els.syncDiag.dataset.status = report.ok ? "ok" : "warn";
  } catch (error) {
    els.syncDiag.dataset.status = "warn";
    els.syncDiag.textContent = `打不到同步端點：${error.message}\n\n端點：${state.settings.syncEndpoint}\n確認 api/sync.js 已部署，且網址正確。`;
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
