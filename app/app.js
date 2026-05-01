const MAINTENANCE_ITEMS = [
  {
    key: "majorService",
    name: "大保養",
    action: "保養",
    kmInterval: 20000,
    monthInterval: 0,
    keywords: ["大保養", "major service", "節流閥", "噴油嘴", "積碳", "燃油清潔", "齒盤"],
    note: "每 20,000 km；可包含節流閥、噴油嘴、積碳清潔與全車檢查。",
  },
  {
    key: "engineOil",
    name: "機油",
    action: "更換",
    kmInterval: 4000,
    monthInterval: 12,
    keywords: ["機油", "換油", "engine oil", "10w-30", "5w-30", "gn4"],
    note: "每 4,000 km 或每年；首保通常 1,000 km。",
  },
  {
    key: "oilFilter",
    name: "機油濾芯",
    action: "更換",
    kmInterval: 18000,
    monthInterval: 36,
    keywords: ["機油濾芯", "油芯", "oil filter", "15412"],
    note: "約每 18,000 km；常見料號 15412-K0N-D01。",
  },
  {
    key: "airFilter",
    name: "空氣濾芯",
    action: "更換",
    kmInterval: 18000,
    monthInterval: 36,
    keywords: ["空濾", "空氣濾芯", "air filter", "air cleaner"],
    note: "約每 18,000 km；多塵、潮濕環境提早。",
  },
  {
    key: "sparkPlug",
    name: "火星塞",
    action: "更換",
    kmInterval: 12000,
    monthInterval: 12,
    keywords: ["火星塞", "spark", "mr6k-9"],
    note: "約每 12,000 km；常見規格 NGK MR6K-9。",
  },
  {
    key: "valveClearance",
    name: "汽門間隙",
    action: "檢查",
    kmInterval: 6000,
    monthInterval: 6,
    keywords: ["汽門", "鳥仔", "valve"],
    note: "每 6,000 km 檢查，建議交給店家。",
  },
  {
    key: "chain",
    name: "傳動鏈條",
    action: "檢查/清潔/潤滑",
    kmInterval: 1000,
    monthInterval: 0,
    keywords: ["鏈條", "鍊條", "chain", "清鏈", "上油", "潤滑"],
    note: "每 1,000 km；洗車、雨騎、多塵後也要潤滑。",
  },
  {
    key: "chainSlider",
    name: "鏈條滑塊",
    action: "檢查",
    kmInterval: 12000,
    monthInterval: 12,
    keywords: ["鏈條滑塊", "鍊條滑塊", "chain slider"],
    note: "每 12,000 km 檢查磨耗。",
  },
  {
    key: "brakeFluid",
    name: "煞車油 DOT 4",
    action: "檢查/更換",
    kmInterval: 0,
    monthInterval: 24,
    annualCheck: true,
    keywords: ["煞車油", "剎車油", "brake fluid", "dot4", "dot 4"],
    note: "每年檢查，每 2 年更換。",
  },
  {
    key: "brakePads",
    name: "煞車皮",
    action: "檢查",
    kmInterval: 6000,
    monthInterval: 12,
    keywords: ["煞車皮", "來令", "brake pad"],
    note: "每 6,000 km 或每年檢查磨耗。",
  },
  {
    key: "clutch",
    name: "離合器系統",
    action: "檢查/調整",
    kmInterval: 6000,
    monthInterval: 6,
    keywords: ["離合器", "離合", "clutch"],
    note: "每 6,000 km 檢查自由間隙與作動。",
  },
  {
    key: "tires",
    name: "輪胎/輪框",
    action: "檢查",
    kmInterval: 6000,
    monthInterval: 12,
    keywords: ["輪胎", "胎壓", "胎紋", "輪框", "tire", "tyre"],
    note: "前胎壓參考 29 psi；後 33 psi 單人 / 36 psi 雙載。",
  },
  {
    key: "battery",
    name: "電瓶/電系",
    action: "檢查",
    kmInterval: 6000,
    monthInterval: 12,
    keywords: ["電瓶", "電池", "battery", "燈", "喇叭", "方向燈"],
    note: "每年檢查，也適合行前快速確認。",
  },
  {
    key: "brakeSystem",
    name: "煞車系統",
    action: "檢查",
    kmInterval: 6000,
    monthInterval: 12,
    keywords: ["煞車", "剎車", "卡鉗", "brake"],
    note: "油管、卡鉗、洩漏、煞車手感。",
  },
  {
    key: "general",
    name: "螺絲螺帽/避震/側柱",
    action: "檢查",
    kmInterval: 6000,
    monthInterval: 12,
    keywords: ["螺絲", "螺帽", "避震", "側柱", "sidestand", "suspension"],
    note: "每 6,000 km 或每年檢查重要固定件與作動。",
  },
];

const MAJOR_SERVICE_KM = 20000;
const MINOR_SERVICE_KM = 6000;
const STORAGE_KEY = "cb350-maintenance-app-v1";

const state = loadState();

const els = {
  currentMileage: document.querySelector("#currentMileage"),
  currentDate: document.querySelector("#currentDate"),
  bikeForm: document.querySelector("#bikeForm"),
  chatForm: document.querySelector("#chatForm"),
  chatText: document.querySelector("#chatText"),
  photoInput: document.querySelector("#photoInput"),
  aiEndpoint: document.querySelector("#aiEndpoint"),
  chatLog: document.querySelector("#chatLog"),
  recordRows: document.querySelector("#recordRows"),
  reminderList: document.querySelector("#reminderList"),
  scheduleGrid: document.querySelector("#scheduleGrid"),
  dueCount: document.querySelector("#dueCount"),
  soonCount: document.querySelector("#soonCount"),
  minorService: document.querySelector("#minorService"),
  majorService: document.querySelector("#majorService"),
  sampleButton: document.querySelector("#sampleButton"),
  clearButton: document.querySelector("#clearButton"),
  exportButton: document.querySelector("#exportButton"),
};

init();

function init() {
  const today = toDateInput(new Date());
  els.currentMileage.value = state.settings.currentMileage || "";
  els.currentDate.value = state.settings.currentDate || today;
  if (!state.settings.aiEndpoint) {
    state.settings.aiEndpoint = defaultAiEndpoint();
  }
  els.aiEndpoint.value = state.settings.aiEndpoint || "";
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });
  document.querySelectorAll("[data-quick]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.dataset.quick;
      els.chatText.value = `今天 ${els.currentDate.value} 里程 ${els.currentMileage.value || ""}，${quickText(item)}。`;
      els.chatText.focus();
    });
  });
  els.bikeForm.addEventListener("submit", updateSettings);
  els.chatForm.addEventListener("submit", handleChatSubmit);
  els.aiEndpoint.addEventListener("change", updateAiEndpoint);
  els.sampleButton.addEventListener("click", fillSample);
  els.clearButton.addEventListener("click", clearRecords);
  els.exportButton.addEventListener("click", exportData);
  els.chatLog.append(document.querySelector("#botIntro").content.cloneNode(true));
  render();
}

function loadState() {
  const fallback = {
    settings: {
      currentMileage: "",
      currentDate: toDateInput(new Date()),
      aiEndpoint: "",
    },
    records: [],
  };
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || fallback;
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function updateSettings(event) {
  event.preventDefault();
  state.settings.currentMileage = Number(els.currentMileage.value) || "";
  state.settings.currentDate = els.currentDate.value || toDateInput(new Date());
  saveState();
  render();
  addMessage("bot", "已更新目前里程與檢查日期，提醒表也重新計算了。");
}

function updateAiEndpoint() {
  state.settings.aiEndpoint = els.aiEndpoint.value.trim();
  saveState();
  addMessage("bot", state.settings.aiEndpoint ? "AI 端點已儲存。之後文字與照片會優先交給 ChatGPT 分析。" : "AI 端點已清空，會改回本機分類模式。");
}

function defaultAiEndpoint() {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith("github.io")) return "";
  return `${window.location.origin}/api/analyze-maintenance`;
}

async function handleChatSubmit(event) {
  event.preventDefault();
  const text = els.chatText.value.trim();
  const imageFile = els.photoInput.files?.[0] || null;
  if (!text && !imageFile) return;
  addMessage("user", imageFile ? `${text || "請分析這張保養照片"}（已附照片：${imageFile.name}）` : text);

  let parsed;
  if (state.settings.aiEndpoint) {
    try {
      setChatBusy(true);
      parsed = await analyzeWithChatGPT(text, imageFile);
    } catch (error) {
      addMessage("bot alert", `ChatGPT 分析失敗：${error.message}。我先改用本機文字分類。`);
      parsed = parseMaintenanceText(text);
    } finally {
      setChatBusy(false);
    }
  } else {
    if (imageFile) {
      addMessage("bot alert", "照片分析需要先設定 AI API 端點；目前我只能用文字做本機分類。");
    }
    parsed = parseMaintenanceText(text);
  }

  if (!parsed.records.length) {
    addMessage("bot alert", "我還沒抓到明確保養項目。可以試著寫「里程 12850 換機油、清潔鏈條、費用 950」。");
    return;
  }

  state.records.unshift(...parsed.records);
  state.settings.currentMileage = parsed.mileage || state.settings.currentMileage;
  state.settings.currentDate = parsed.date || state.settings.currentDate;
  els.currentMileage.value = state.settings.currentMileage || "";
  els.currentDate.value = state.settings.currentDate || toDateInput(new Date());
  saveState();
  render();

  const names = parsed.records.map((record) => `${record.item}（${record.action}）`).join("、");
  const source = parsed.source === "chatgpt" ? "ChatGPT 已分析" : "已分類";
  addMessage("bot", `${source}並加入 ${parsed.records.length} 筆：${names}。我也順手更新了下次提醒。`);
  els.chatText.value = "";
  els.photoInput.value = "";
}

async function analyzeWithChatGPT(text, imageFile) {
  const imageDataUrl = imageFile ? await fileToDataUrl(imageFile) : "";
  const response = await fetch(state.settings.aiEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      imageDataUrl,
      currentMileage: Number(state.settings.currentMileage) || "",
      currentDate: state.settings.currentDate || toDateInput(new Date()),
      maintenanceItems: MAINTENANCE_ITEMS.map(({ key, name, action, kmInterval, monthInterval, note }) => ({
        key,
        name,
        action,
        kmInterval,
        monthInterval,
        note,
      })),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return normalizeAiResult(data);
}

function normalizeAiResult(data) {
  const date = data.date || state.settings.currentDate || toDateInput(new Date());
  const mileage = Number(data.mileage) || Number(state.settings.currentMileage) || "";
  const records = (data.records || [])
    .map((record) => {
      const item = findMaintenanceItem(record.key, record.item);
      if (!item) return null;
      return {
        id: crypto.randomUUID(),
        date: record.date || date,
        mileage: Number(record.mileage) || mileage,
        item: item.name,
        key: item.key,
        action: record.action || item.action,
        cost: Number(record.cost) || "",
        note: record.note || item.note,
        createdAt: new Date().toISOString(),
      };
    })
    .filter(Boolean);
  return { date, mileage, records, source: "chatgpt" };
}

function findMaintenanceItem(key, name) {
  return MAINTENANCE_ITEMS.find((item) => item.key === key || item.name === name || item.name.includes(name || ""));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("照片讀取失敗"));
    reader.readAsDataURL(file);
  });
}

function setChatBusy(isBusy) {
  const button = els.chatForm.querySelector("button[type='submit']");
  button.disabled = isBusy;
  button.textContent = isBusy ? "AI 分析中..." : "分析並加入";
}

function parseMaintenanceText(text) {
  const normalized = text.toLowerCase();
  const date = parseDate(text) || state.settings.currentDate || toDateInput(new Date());
  const mileage = parseMileage(text) || Number(state.settings.currentMileage) || "";
  const cost = parseCost(text);
  const matchedItems = MAINTENANCE_ITEMS.filter((item) => {
    const matched = item.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
    if (!matched) return false;
    if (item.key === "brakeSystem" && /煞車油|剎車油|brake fluid|煞車皮|來令|brake pad/.test(normalized)) return false;
    return true;
  });

  const unique = new Map();
  matchedItems.forEach((item) => unique.set(item.key, item));

  const records = [...unique.values()].map((item) => ({
    id: crypto.randomUUID(),
    date,
    mileage,
    item: item.name,
    key: item.key,
    action: parseAction(text, item) || item.action,
    cost: cost || "",
    note: buildNote(text, item),
    createdAt: new Date().toISOString(),
  }));

  return { date, mileage, cost, records };
}

function parseDate(text) {
  const match = text.match(/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})|(\d{1,2})[/-](\d{1,2})/);
  if (!match) {
    if (/今天/.test(text)) return toDateInput(new Date());
    if (/昨天/.test(text)) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return toDateInput(d);
    }
    return "";
  }
  const year = match[1] || new Date().getFullYear();
  const month = match[2] || match[4];
  const day = match[3] || match[5];
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseMileage(text) {
  const match = text.match(/(?:里程|公里|km|odometer)\s*[:：]?\s*(\d{3,6})|(\d{3,6})\s*(?:km|公里)/i);
  return match ? Number(match[1] || match[2]) : 0;
}

function parseCost(text) {
  const match = text.match(/(?:費用|花費|價格|nt\$?|元)\s*[:：]?\s*(\d{2,6})|(\d{2,6})\s*(?:元|塊)/i);
  return match ? Number(match[1] || match[2]) : "";
}

function parseAction(text, item) {
  const hasReplace = /更換|換/.test(text);
  const hasClean = /清潔|清/.test(text);
  const hasLube = /潤滑|上油/.test(text);
  const hasAdjust = /調整|調/.test(text);
  const hasInspect = /檢查|看/.test(text);
  if (item.key === "chain") {
    if (hasClean && hasLube) return "清潔/潤滑";
    if (hasClean) return "清潔";
    if (hasLube) return "潤滑";
    if (hasAdjust) return "調整";
  }
  if (hasReplace) return "更換";
  if (hasAdjust) return "調整";
  if (hasClean && hasLube) return "清潔/潤滑";
  if (hasClean) return "清潔";
  if (hasLube) return "潤滑";
  if (hasInspect) return "檢查";
  return "";
}

function buildNote(text, item) {
  const specs = [];
  const oil = text.match(/\b(?:5w|10w)-?30\b/i);
  const dot = text.match(/\bdot\s*4\b/i);
  const plug = text.match(/\bmr6k-9\b/i);
  if (oil) specs.push(oil[0].toUpperCase());
  if (dot) specs.push("DOT 4");
  if (plug) specs.push("NGK MR6K-9");
  return specs.length ? `${specs.join(" / ")}；${item.note}` : item.note;
}

function render() {
  renderRecords();
  renderReminders();
  renderSchedule();
}

function renderRecords() {
  if (!state.records.length) {
    els.recordRows.innerHTML = `<tr><td colspan="7"><div class="empty">還沒有紀錄，先把今天保養內容貼給 AI Bot。</div></td></tr>`;
    return;
  }

  els.recordRows.innerHTML = state.records
    .map(
      (record) => `
        <tr>
          <td>${escapeHtml(record.date || "-")}</td>
          <td>${record.mileage ? formatKm(record.mileage) : "-"}</td>
          <td>${escapeHtml(record.item)}</td>
          <td>${escapeHtml(record.action)}</td>
          <td>${record.cost ? `NT$ ${number(record.cost)}` : "-"}</td>
          <td>${escapeHtml(record.note || "")}</td>
          <td><button class="icon-button" title="刪除" data-delete="${record.id}">×</button></td>
        </tr>
      `,
    )
    .join("");

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.records = state.records.filter((record) => record.id !== button.dataset.delete);
      saveState();
      render();
    });
  });
}

function renderReminders() {
  const reminders = getReminders();
  const due = reminders.filter((item) => item.status === "due").length;
  const soon = reminders.filter((item) => item.status === "soon").length;
  els.dueCount.textContent = due;
  els.soonCount.textContent = soon;
  els.minorService.textContent = nextServiceText(MINOR_SERVICE_KM);
  els.majorService.textContent = nextServiceText(MAJOR_SERVICE_KM);

  els.reminderList.innerHTML = reminders
    .map(
      (item) => `
        <article class="reminder-item ${item.status}">
          <div>
            <div class="item-title">${escapeHtml(item.name)}</div>
            <div class="item-detail">${escapeHtml(item.action)} · ${escapeHtml(item.note)}</div>
          </div>
          <div class="item-detail">${item.detail}</div>
          <span class="pill ${item.status}">${statusText(item.status)}</span>
        </article>
      `,
    )
    .join("");
}

function renderSchedule() {
  els.scheduleGrid.innerHTML = MAINTENANCE_ITEMS.map(
    (item) => `
      <article class="schedule-item">
        <div class="item-title">${escapeHtml(item.name)}</div>
        <div class="item-detail">${item.kmInterval ? `每 ${formatKm(item.kmInterval)}` : "按時間"}${item.monthInterval ? ` / 每 ${item.monthInterval} 個月` : ""}</div>
        <span class="pill">${escapeHtml(item.action)}</span>
      </article>
    `,
  ).join("");
}

function getReminders() {
  const currentMileage = Number(state.settings.currentMileage) || 0;
  const currentDate = parseLocalDate(state.settings.currentDate || toDateInput(new Date()));
  return MAINTENANCE_ITEMS.map((item) => {
    const last = state.records.find((record) => record.key === item.key || record.item === item.name);
    const lastMileage = Number(last?.mileage) || 0;
    const lastDate = last?.date ? parseLocalDate(last.date) : null;
    const nextKm = item.kmInterval && lastMileage ? lastMileage + item.kmInterval : item.kmInterval ? nextCycle(currentMileage, item.kmInterval) : 0;
    const nextDate = item.monthInterval && lastDate ? addMonths(lastDate, item.monthInterval) : null;
    const kmLeft = nextKm ? nextKm - currentMileage : Infinity;
    const daysLeft = nextDate ? Math.ceil((nextDate - currentDate) / 86400000) : Infinity;
    const status = kmLeft <= 0 || daysLeft <= 0 ? "due" : kmLeft <= 300 || daysLeft <= 30 ? "soon" : "ok";
    const pieces = [];
    if (nextKm) pieces.push(`下次 ${formatKm(nextKm)}${Number.isFinite(kmLeft) ? `，剩 ${formatKm(Math.max(kmLeft, 0))}` : ""}`);
    if (nextDate) pieces.push(`日期 ${toDateInput(nextDate)}${Number.isFinite(daysLeft) ? `，剩 ${Math.max(daysLeft, 0)} 天` : ""}`);
    if (!last) pieces.push("尚無此項紀錄，先用目前里程推估");
    return { ...item, status, detail: pieces.join(" · ") };
  }).sort((a, b) => statusRank(a.status) - statusRank(b.status));
}

function nextServiceText(interval) {
  const currentMileage = Number(state.settings.currentMileage) || 0;
  if (!currentMileage) return "-";
  return formatKm(nextCycle(currentMileage, interval));
}

function nextCycle(current, interval) {
  return Math.ceil((current + 1) / interval) * interval;
}

function statusRank(status) {
  return { due: 0, soon: 1, ok: 2 }[status] ?? 3;
}

function statusText(status) {
  return { due: "已到期", soon: "快到期", ok: "未到期" }[status] || status;
}

function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabId));
  document.querySelectorAll(".tab-view").forEach((view) => view.classList.toggle("active", view.id === tabId));
}

function addMessage(type, text) {
  const div = document.createElement("div");
  div.className = `message ${type}`;
  const label = type.includes("user") ? "你" : "保養助理";
  div.innerHTML = `<strong>${label}</strong><p>${escapeHtml(text)}</p>`;
  els.chatLog.append(div);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function fillSample() {
  els.chatText.value = "今天 2026/5/1 里程 12850，換機油 10W-30、清潔潤滑鏈條、檢查煞車皮，費用 950 元。";
  els.chatText.focus();
}

function quickText(item) {
  const map = {
    "機油": "更換機油 10W-30",
    "鏈條": "清潔並潤滑鏈條",
    "煞車油": "更換煞車油 DOT 4",
    "火星塞": "更換火星塞 NGK MR6K-9",
  };
  return map[item] || `檢查${item}`;
}

function clearRecords() {
  if (!confirm("確定要清空所有保養紀錄嗎？")) return;
  state.records = [];
  saveState();
  render();
  addMessage("bot alert", "保養紀錄已清空。目前里程設定仍保留。");
}

function exportData() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cb350-maintenance-${toDateInput(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
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

function toDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatKm(value) {
  return `${number(value)} km`;
}

function number(value) {
  return Number(value).toLocaleString("zh-TW");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
