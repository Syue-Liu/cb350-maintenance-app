const { profiles: VEHICLES, hasMileage } = VehicleProfiles;
let vehicleId = readSaved("maintenance-selected-vehicle", "honda");
if (!VEHICLES[vehicleId]) vehicleId = "honda";
let MAINTENANCE_ITEMS = VEHICLES[vehicleId].items;
let CATEGORIES = VEHICLES[vehicleId].categories;
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
const TOAST_MS = 4000;
const SOON_KM = 300;
const SOON_DAYS = 30;

let ITEM_BY_KEY = new Map(MAINTENANCE_ITEMS.map((item) => [item.key, item]));
let CATEGORY_BY_KEY = new Map(CATEGORIES.map((category) => [category.key, category]));

const vehicles = Object.fromEntries(Object.keys(VEHICLES).map(id => [id, VehicleProfiles.normalize(readSaved(VEHICLES[id].storageKey, null))]));
let state = vehicles[vehicleId];
let sharedSyncKey = readSaved("maintenance-shared-sync-key", vehicles.honda.settings.syncKey || "");
const syncStatusByVehicle = {};

const els = {};
[
  "bikeForm", "currentMileage", "currentDate", "statusStrip",
  "dashboard",
  "quickRow", "addForm", "addItem", "addAction", "addDate", "addMileage",
  "addBrand", "addCost", "addNote", "editRecordId", "saveRecordButton", "cancelEditButton",
  "chatForm", "chatText", "sampleButton",
  "reminderList", "toggleRemindersButton", "visitList", "historySearch", "historyFilter", "scheduleList",
  "spendSummary", "spendByItem", "spendByYear",
  "syncKey", "syncStatus", "syncTestButton", "syncDiag",
  "exportButton", "clearButton", "settingsButton", "closeSettingsButton",
  "toast", "tabBadge", "vehicleSelect", "vehicleMark", "vehicleCaption", "deliveryForm", "deliveryDate", "deliveryMileage", "deliveryBlock",
].forEach((id) => {
  els[id] = document.querySelector(`#${id}`);
});

let toastTimer = 0;
let formDirty = false;
const syncVehicle = VehicleSync.createSync({
  vehicles,
  getConfig: () => ({ key: sharedSyncKey, endpoint: defaultSyncEndpoint() }),
  save: (id) => saveVehicle(id),
  changed: (id) => {
    if (id !== vehicleId) return;
    if (!els.bikeForm.contains(document.activeElement)) {
      els.currentMileage.value = state.settings.currentMileage;
      els.currentDate.value = VehicleProfiles.today();
    }
    if (!formDirty) resetAddForm();
    if (!els.deliveryForm.contains(document.activeElement)) fillDeliveryFields();
    render();
    document.dispatchEvent(new Event("vehiclechange"));
  },
  status: (id, text, kind) => { syncStatusByVehicle[id] = [text, kind]; if (id === vehicleId) setSyncStatus(text, kind); },
});

init();

function init() {
  els.currentMileage.value = state.settings.currentMileage;
  els.currentDate.value = state.settings.currentDate || toDateInput(new Date());
  els.syncKey.value = sharedSyncKey;
  applyVehicle();
  els.vehicleSelect.addEventListener("change", switchVehicle);
  els.deliveryForm.addEventListener("submit", saveDelivery);
  els.addForm.addEventListener("input", () => { formDirty = true; });
  els.addForm.addEventListener("change", () => { formDirty = true; });
  els.chatText.addEventListener("input", () => { formDirty = true; });

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
  els.cancelEditButton.addEventListener("click", cancelEdit);
  els.addItem.addEventListener("change", () => syncActionOptions(els.addItem.value));
  els.historySearch.addEventListener("input", renderVisits);
  els.historyFilter.addEventListener("change", renderVisits);
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
  const refresh = () => { if (!document.hidden) Object.keys(vehicles).forEach(id => syncVehicle(id)); };
  window.addEventListener("focus", refresh);
  window.addEventListener("online", refresh);
  document.addEventListener("visibilitychange", refresh);
  setInterval(refresh, 60000);
}

/* ------------------------------------------------------------------ 狀態 */

function readSaved(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function saveVehicle(id) {
  localStorage.setItem(VEHICLES[id].storageKey, JSON.stringify(vehicles[id]));
}
function saveState() { saveVehicle(vehicleId); }

function saveStateAndSync() {
  state.dirty = true;
  state.revision += 1;
  saveState();
  uploadCloudData({ silent: true });
}

function applyVehicle() {
  document.body.dataset.vehicle = vehicleId;
  document.title = `${VEHICLES[vehicleId].name} 保養手冊`;
  els.vehicleSelect.value = vehicleId;
  els.vehicleMark.textContent = VEHICLES[vehicleId].name;
  els.vehicleCaption.textContent = vehicleId === "gogoro" ? "歡樂牛仔號 · Jessie" : "RED · 騎乘日誌";
  els.deliveryBlock.hidden = vehicleId !== "gogoro";
  els.addBrand.placeholder = vehicleId === "gogoro" ? "廠牌或零件規格" : "例如 Motul 10W-40";
  els.chatText.placeholder = vehicleId === "gogoro" ? "今天里程 5000，定期保養，費用 800 元" : "今天里程 12850，換機油、清潔鏈條，費用 950 元";
  fillDeliveryFields();
}

function fillDeliveryFields() {
  els.deliveryDate.value = state.settings.deliveryDate || "";
  els.deliveryMileage.value = state.settings.deliveryMileage ?? 0;
}

function switchVehicle() {
  const nextId = els.vehicleSelect.value;
  if (formDirty && !confirm("還有未儲存的內容，切換車輛會捨棄這次填寫。確定切換嗎？")) { els.vehicleSelect.value = vehicleId; return; }
  vehicleId = nextId;
  localStorage.setItem("maintenance-selected-vehicle", JSON.stringify(vehicleId));
  state = vehicles[vehicleId];
  MAINTENANCE_ITEMS = VEHICLES[vehicleId].items;
  CATEGORIES = VEHICLES[vehicleId].categories;
  ITEM_BY_KEY = new Map(MAINTENANCE_ITEMS.map(item => [item.key,item]));
  CATEGORY_BY_KEY = new Map(CATEGORIES.map(category => [category.key,category]));
  els.currentMileage.value = state.settings.currentMileage;
  els.currentDate.value = VehicleProfiles.today();
  els.chatText.value = "";
  els.historySearch.value = "";
  els.historyFilter.value = "all";
  applyVehicle(); buildItemSelect(); buildQuickRow(); resetAddForm(); render(); updateSyncStatus();
  switchTab("reminders");
  document.dispatchEvent(new Event("vehiclechange"));
  syncVehicle(vehicleId);
}

function saveDelivery(event) {
  event.preventDefault();
  const mileage = els.deliveryMileage.value;
  if (!els.deliveryDate.value || !hasMileage(mileage)) return;
  if (els.deliveryDate.value > VehicleProfiles.today() || (hasMileage(state.settings.currentMileage) && Number(mileage) > Number(state.settings.currentMileage))) {
    setToast("請確認交車日期與里程，交車里程不能大於目前里程。", "warn"); return;
  }
  state.settings.deliveryDate = els.deliveryDate.value;
  state.settings.deliveryMileage = Number(mileage);
  if (!hasMileage(state.settings.currentMileage)) { state.settings.currentMileage = Number(mileage); els.currentMileage.value = mileage; }
  state.settingsUpdatedAt = new Date().toISOString();
  saveStateAndSync(); render(); setToast("已儲存交車資料，首保提醒已開始計算。");
}

function updateSettings(event) {
  event.preventDefault();
  state.settings.currentMileage = hasMileage(els.currentMileage.value) ? Number(els.currentMileage.value) : "";
  state.settings.currentDate = els.currentDate.value || toDateInput(new Date());
  state.settingsUpdatedAt = new Date().toISOString();
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
  formDirty = false;
  if (!keepItem) els.addItem.value = MAINTENANCE_ITEMS[0].key;
  syncActionOptions(els.addItem.value);
  els.editRecordId.value = "";
  els.saveRecordButton.textContent = "加入紀錄";
  els.cancelEditButton.hidden = true;
  els.addDate.value = state.settings.currentDate || toDateInput(new Date());
  els.addMileage.value = state.settings.currentMileage;
  els.addBrand.value = "";
  els.addCost.value = "";
  els.addNote.value = "";
  els.quickRow.querySelectorAll(".quick").forEach((button) => button.classList.remove("is-active"));
}

function handleManualAdd(event) {
  event.preventDefault();
  const item = ITEM_BY_KEY.get(els.addItem.value);
  if (!item) return;
  const editId = els.editRecordId.value;

  const mileage = Number(els.addMileage.value) || 0;
  if (!hasMileage(els.addMileage.value)) {
    setToast("里程要填，才能算下一次。", "warn");
    els.addMileage.focus();
    return;
  }

  const brand = els.addBrand.value.trim();
  const extraNote = els.addNote.value.trim();
  const createdAt = new Date().toISOString();
  const record = {
    id: editId || newId(),
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

  if (editId) {
    const previous = state.records.find((entry) => entry.id === editId);
    if (!previous) {
      setToast("找不到要編輯的紀錄，請重新選一次。", "warn");
      resetAddForm();
      return;
    }
    record.createdAt = previous.createdAt || createdAt;
    record.updatedAt = createdAt;
  }

  const comparable = editId ? state.records.filter((entry) => entry.id !== editId) : state.records;
  if (isDuplicateRecord(comparable, record)) {
    setToast(`${item.name}在同一天、同里程已經記過了。`, "warn");
    return;
  }

  if (editId) {
    state.records = state.records.map((entry) => (entry.id === editId ? record : entry));
    commitRecords([], { mileage: record.mileage, date: record.date });
  } else {
    commitRecords([record], { mileage: record.mileage, date: record.date });
  }
  resetAddForm();
  setToast(`${editId ? "已更新" : "已加入"} ${item.name}（${record.action}）${record.cost ? ` NT$ ${number(record.cost)}` : ""}`);
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
    setToast(vehicleId === "gogoro" ? "沒抓到項目。試試「里程 5000 定期保養，費用 800」。" : "沒抓到保養項目。試試「里程 12850 換機油、清潔鏈條，費用 950」。", "warn");
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
  formDirty = false;
  setToast(`加入 ${fresh.length} 筆：${names}${skipped ? `（略過 ${skipped} 筆重複）` : ""}`);
  switchTab("reminders");
}

/** 寫入紀錄，並在里程/日期比現值新時同步更新目前狀態。 */
function commitRecords(records, { mileage, date }) {
  state.settingsUpdatedAt = new Date().toISOString();
  state.records.unshift(...records);

  const value = Number(mileage) || 0;
  if (hasMileage(mileage) && (!hasMileage(state.settings.currentMileage) || value > Number(state.settings.currentMileage))) {
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
  els.chatText.value = vehicleId === "gogoro" ? "今天里程 5000，定期保養，費用 800 元" : "今天 里程 12850，換機油 10W-40、清潔潤滑鏈條、檢查煞車皮，費用 950 元";
  formDirty = true;
  els.chatText.focus();
}

/* ------------------------------------------------------------------ 畫面 */

function render() {
  renderDashboard();
  renderStatusStrip();
  renderReminders();
  renderVisits();
  renderSpending();
  renderSchedule();
}

function renderDashboard() {
  const currentMileage = Number(state.settings.currentMileage) || 0;
  const currentDate = state.settings.currentDate || toDateInput(new Date());
  const reminders = getReminders();
  const due = reminders.filter((item) => item.status === "due");
  const soon = reminders.filter((item) => item.status === "soon");
  const next = reminders.find((item) => ["due", "soon"].includes(item.status)) || reminders.find(item => item.status !== "unknown");
  const regular = reminders.find(item => item.key === "ezzyService");
  const nextMinor = vehicleId === "gogoro" ? regular.nextKm : currentMileage ? nextCycle(currentMileage, MINOR_SERVICE_KM) : 0;
  const minorLeft = nextMinor ? Math.max(0, nextMinor - currentMileage) : 0;

  els.dashboard.innerHTML = `
    <div class="dash-hero">
      <span class="dash-label">目前里程</span>
      <strong>${hasMileage(state.settings.currentMileage) ? number(currentMileage) : "未設定"}<small>${hasMileage(state.settings.currentMileage) ? " km" : ""}</small></strong>
      <span class="dash-date">基準日 ${escapeHtml(currentDate)}</span>
    </div>
    <div class="dash-grid">
      <button class="dash-card urgent" type="button" data-dash-tab="reminders">
        <span>逾期項目</span>
        <strong>${due.length}</strong>
        <small>${due.length ? due.slice(0, 2).map((item) => item.name).join("、") : "目前正常"}</small>
      </button>
      <button class="dash-card" type="button" data-dash-tab="reminders">
        <span>下次保養</span>
        <strong>${next ? escapeHtml(next.name) : "尚無"}</strong>
        <small>${next ? stripTags(next.meta).split("，")[0] : "新增紀錄後開始追蹤"}</small>
      </button>
      <button class="dash-card" type="button" data-dash-tab="schedule">
        <span>${vehicleId === "gogoro" ? "距離定期保養" : "距離小保養"}</span>
        <strong>${nextMinor && hasMileage(state.settings.currentMileage) ? number(minorLeft) : "--"}<small> km</small></strong>
        <small>${nextMinor ? `目標 ${formatKm(nextMinor)}${regular?.nextDate ? ` / ${regular.nextDate}` : ""}` : vehicleId === "gogoro" ? "先設定交車日期與里程" : "先更新目前里程"}</small>
      </button>
      <button class="dash-card warm" type="button" data-dash-tab="reminders">
        <span>快到期</span>
        <strong>${soon.length}</strong>
        <small>${soon.length ? soon.slice(0, 2).map((item) => item.name).join("、") : "30 天 / 300 km 內會提醒"}</small>
      </button>
    </div>`;

  els.dashboard.querySelectorAll("[data-dash-tab]").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.dashTab));
  });
}

function renderStatusStrip() {
  const reminders = getReminders();
  const due = reminders.filter((item) => item.status === "due").length;
  const soon = reminders.filter((item) => item.status === "soon").length;
  els.tabBadge.hidden = due === 0;

  if (vehicleId === "gogoro" && reminders.some(item => item.status === "unknown")) {
    els.statusStrip.innerHTML = '尚有項目缺少保養基準。<button class="btn quiet" id="setupDelivery" type="button">設定交車資料</button>';
    document.getElementById("setupDelivery").addEventListener("click", () => { switchTab("settings"); els.deliveryDate.focus(); });
    if (!due && !soon) return;
  }
  if (!hasMileage(state.settings.currentMileage)) {
    els.statusStrip.innerHTML = "填上目前里程，就會開始幫你算下一次保養。";
    return;
  }
  if (!due && !soon) {
    if (vehicleId === "gogoro") {
      const next = reminders.find(item => item.key === "ezzyService");
      els.statusStrip.innerHTML = `下次定保 <span class="count">${formatKm(next.nextKm)}</span> 或 ${escapeHtml(next.nextDate)}，先到為準。`;
      return;
    }
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
  const visible = showAll ? reminders : reminders.filter((item) => ["due", "soon"].includes(item.status));
  els.toggleRemindersButton.textContent = showAll ? "只看要處理的" : "展開全部";

  if (!visible.length) {
    if (vehicleId === "gogoro" && reminders.some(item => item.status === "unknown")) {
      els.reminderList.innerHTML = '<div class="empty"><b>等待保養基準</b>設定交車資料，或補上先前的保養紀錄。</div>';
      return;
    }
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
  const filteredRecords = getFilteredRecords();
  if (!state.records.length) {
    els.visitList.innerHTML = `
      <div class="empty">
        <b>還沒有紀錄</b>
        到「新增」選一個項目，或用一句話記下今天做了什麼。
      </div>`;
    return;
  }
  if (!filteredRecords.length) {
    els.visitList.innerHTML = `
      <div class="empty">
        <b>找不到符合的紀錄</b>
        換個關鍵字或篩選條件，就能再把維修單找回來。
      </div>`;
    return;
  }

  const groups = new Map();
  sortRecordsDesc(filteredRecords).forEach((record) => {
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
              <button class="visit-edit" type="button" data-edit="${record.id}" aria-label="編輯 ${escapeHtml(
                record.item,
              )}">編輯</button>
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
            <span class="visit-odo">${hasMileage(visit.mileage) ? formatKm(visit.mileage) : "里程未填"}${
              total ? `　NT$ ${number(total)}` : ""
            }</span>
          </header>
          ${rows}
        </article>`;
    })
    .join("");

  els.visitList.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => editRecord(button.dataset.edit));
  });

  els.visitList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tombstones[button.dataset.delete] = new Date().toISOString();
      state.records = state.records.filter((record) => record.id !== button.dataset.delete);
      saveStateAndSync();
      render();
      setToast("已刪除一筆。");
    });
  });
}

function getFilteredRecords() {
  const query = String(els.historySearch.value || "").trim().toLowerCase();
  const filter = els.historyFilter.value || "all";
  const now = parseLocalDate(state.settings.currentDate || toDateInput(new Date()));
  const recentCutoff = new Date(now);
  recentCutoff.setMonth(recentCutoff.getMonth() - 12);

  return state.records.filter((record) => {
    if (filter === "cost" && !(Number(record.cost) > 0)) return false;
    if (filter === "frequent" && !ITEM_BY_KEY.get(record.key)?.frequent) return false;
    if (filter === "recent") {
      const recordDate = record.date ? parseLocalDate(record.date) : null;
      if (!recordDate || recordDate < recentCutoff) return false;
    }
    if (!query) return true;
    const haystack = [
      record.date,
      record.mileage,
      record.item,
      record.action,
      record.brand,
      record.cost,
      record.note,
      CATEGORY_BY_KEY.get(ITEM_BY_KEY.get(record.key)?.category)?.name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function editRecord(id) {
  const record = state.records.find((entry) => entry.id === id);
  if (!record) return;
  switchTab("compose");
  els.editRecordId.value = record.id;
  els.addItem.value = record.key;
  syncActionOptions(record.key);
  els.addAction.value = record.action || ITEM_BY_KEY.get(record.key)?.action || "";
  els.addDate.value = record.date || toDateInput(new Date());
  els.addMileage.value = record.mileage ?? "";
  els.addBrand.value = record.brand || "";
  els.addCost.value = record.cost || "";
  els.addNote.value = record.note || "";
  els.saveRecordButton.textContent = "儲存修改";
  els.cancelEditButton.hidden = false;
  formDirty = true;
  els.addItem.focus();
  setToast("正在編輯這筆保養紀錄。");
}

function cancelEdit() {
  resetAddForm();
  setToast("已取消編輯。");
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
  const milestones = mileage && vehicleId === "honda"
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

  const sourceNote = vehicleId === "gogoro" ? `<p class="schedule-source">首次及後續每 5,000 km 或 6 個月，先到為準。檢查項目依車況更換；煞車油另依 18,000 km 或 3 年。<a href="${VehicleProfiles.source}" target="_blank" rel="noopener">Gogoro 官方保養表</a></p><p class="asset-credit">車款圖片：Gogoro · © Disney/Pixar</p>` : "";
  els.scheduleList.innerHTML = milestones + groups + sourceNote;
}

/* ------------------------------------------------------------------ 提醒計算 */

function getReminders() {
  if (vehicleId === "gogoro") return VehicleProfiles.ezzyReminders(state).map(item => ({ ...item, meta: item.status === "unknown" ? "等待交車資料或首次保養紀錄" : buildReminderMeta({ ...item, nextDate: item.nextDate ? parseLocalDate(item.nextDate) : null }) })).sort((a,b)=>statusRank(a.status)-statusRank(b.status) || b.progress-a.progress);
  const currentMileage = Number(state.settings.currentMileage) || 0;
  const currentDate = parseLocalDate(state.settings.currentDate || toDateInput(new Date()));

  return MAINTENANCE_ITEMS.map((item) => {
    const last = findLatestRecord(state.records, item);
    const lastMileage = Number(last?.mileage) || 0;
    const lastDate = last?.date ? parseLocalDate(last.date) : null;

    const nextKm = item.kmInterval
      ? last && hasMileage(last.mileage)
        ? lastMileage + item.kmInterval
        : nextCycle(currentMileage, item.kmInterval)
      : 0;
    const nextDate = item.monthInterval && lastDate ? addMonths(lastDate, item.monthInterval) : null;

    const kmLeft = nextKm ? nextKm - currentMileage : Infinity;
    const daysLeft = nextDate ? Math.ceil((nextDate - currentDate) / 86400000) : Infinity;
    const status = kmLeft <= 0 || daysLeft <= 0 ? "due" : kmLeft <= SOON_KM || daysLeft <= SOON_DAYS ? "soon" : "ok";

    // 進度條：這個週期已經用掉多少。km 與時間取用得比較多的那一個。
    const kmUsed = item.kmInterval && Number.isFinite(kmLeft) ? 1 - kmLeft / item.kmInterval : 0;
    const dayInterval = item.monthInterval ? item.monthInterval * 30.4 : 0;
    const dayUsed = dayInterval && Number.isFinite(daysLeft) ? 1 - daysLeft / dayInterval : 0;
    const progress = Math.max(0, Math.min(1, Math.max(kmUsed, dayUsed))) * 100;

    return {
      ...item,
      status,
      progress: Math.round(progress),
      nextKm,
      kmLeft,
      nextDate: nextDate ? toDateInput(nextDate) : "",
      daysLeft,
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
  if (!hasMileage(state.settings.currentMileage)) {
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
  if (window.location.protocol === "file:" || host === "localhost" || host === "127.0.0.1" || host.endsWith("github.io")) {
    return "https://cb350-maintenance-app.vercel.app/api/sync";
  }
  return `${window.location.origin}/api/sync`;
}

function uploadCloudData() { return syncVehicle(vehicleId); }
function downloadCloudData() { return syncVehicle(vehicleId); }

/** 直接在 App 裡打 ?diag=1，省得在手機上開網址查問題。 */
async function testSyncConnection() {
  els.syncDiag.hidden = false;
  els.syncDiag.textContent = "測試中…";
  try {
    const response = await fetch(`${defaultSyncEndpoint()}?diag=1`);
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
  const key = els.syncKey.value.trim();
  if (key && (key.length < 6 || key.length > 80)) { setSyncStatus("同步代碼需要 6 至 80 個字", "warn"); return; }
  sharedSyncKey = key;
  localStorage.setItem("maintenance-shared-sync-key", JSON.stringify(key));
  Object.keys(vehicles).forEach(id => { vehicles[id].settings.syncKey = key; saveVehicle(id); delete syncStatusByVehicle[id]; });
  updateSyncStatus();
  Object.keys(vehicles).forEach(id => syncVehicle(id));
}

function updateSyncStatus() {
  if (syncStatusByVehicle[vehicleId]) { setSyncStatus(...syncStatusByVehicle[vehicleId]); return; }
  if (!sharedSyncKey) {
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
  saveState();
  renderReminders();
}

function clearRecords() {
  if (!confirm(`確定清空 ${VEHICLES[vehicleId].name} 的所有保養紀錄嗎？另一台車不受影響。這個動作無法復原。`)) return;
  state.records.forEach(record => { state.tombstones[record.id] = new Date().toISOString(); });
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
  link.download = `${vehicleId}-maintenance-${toDateInput(new Date())}.json`;
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
  return { due: "已到期", soon: "快到期", ok: "正常", unknown: "待設定" }[status] || status;
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

function stripTags(value) {
  const element = document.createElement("div");
  element.innerHTML = String(value || "");
  return element.textContent || "";
}
