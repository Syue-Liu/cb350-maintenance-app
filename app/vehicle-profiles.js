(function (global) {
  "use strict";
  const honda = typeof module === "object" && module.exports ? require("./maintenance-items.js") : global.CB350Data;
  const inspection = { kmInterval: 5000, monthInterval: 6, action: "檢查", actions: ["檢查", "更換", "調整"], frequent: true, includedInService: true };
  const ezzyItems = [
    { key: "ezzyService", name: "定期保養", category: "overall", kmInterval: 5000, monthInterval: 6, action: "保養", actions: ["保養"], frequent: true, keywords: ["定期保養", "定保", "首保", "首次保養", "全車保養"], note: "首次及後續每 5,000 km 或 6 個月，以先到者為準。完成全套定保後再記錄此項。" },
    { ...inspection, key: "switches", name: "燈具／開關", category: "electric", keywords: ["燈具", "開關", "大燈", "方向燈", "煞車燈", "喇叭"], note: "檢查各開關及燈具是否正常作動。" },
    { ...inspection, key: "hinges", name: "活動部件潤滑", category: "chassis", action: "潤滑", actions: ["潤滑", "檢查", "調整"], keywords: ["側柱", "中柱", "座墊鎖", "拉桿", "後照鏡", "鎖孔", "活動部件"], note: "主腳架、側腳架、座墊鎖、煞車拉桿及後照鏡等活動部件檢查潤滑。" },
    { ...inspection, key: "tires", name: "輪胎／胎壓", category: "chassis", keywords: ["輪胎", "胎壓", "胎紋", "輪框"], note: "定期檢查胎壓與磨耗；依胎況更換，不是每 5,000 km 固定換胎。" },
    { ...inspection, key: "brakePads", name: "煞車皮／碟盤", category: "brake", keywords: ["煞車皮", "剎車皮", "來令片", "碟盤"], note: "定期檢查磨耗；依厚度與車況更換。" },
    { ...inspection, key: "batteryContacts", name: "電池接點", category: "electric", keywords: ["電池接點", "電池接頭", "冠簧", "接點"], note: "檢查電池連接器與冠簧，由服務中心處理異常。換電不視為此項保養。" },
    { key: "brakeFluid", name: "煞車油", category: "brake", kmInterval: 18000, monthInterval: 36, action: "更換", actions: ["更換", "檢查", "補充"], frequent: false, keywords: ["煞車油", "剎車油", "brake fluid"], note: "每 18,000 km 或 3 年更換，以先到者為準；檢查、補充不會重設更換週期。" },
  ];
  const profiles = {
    honda: { name: "Honda CB350 RS", label: "CB350 RS · 紅", storageKey: "cb350-maintenance-app-v1", items: honda.MAINTENANCE_ITEMS, categories: honda.CATEGORIES },
    gogoro: { name: "Gogoro EZZY 500", label: "EZZY 500 · 歡樂牛仔號", storageKey: "gogoro-ezzy500-maintenance-v1", items: ezzyItems, categories: [{ key: "overall", name: "定期保養", color: "#a84c31" }, ...honda.CATEGORIES.filter(c => ["electric", "chassis", "brake"].includes(c.key))] },
  };
  const source = "https://support.gogoro.com/tw/articles/6080334790067584?collection=5238806020866982";
  function hasMileage(value) { return value !== "" && value != null && Number.isFinite(Number(value)) && Number(value) >= 0; }
  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
  function normalize(value) {
    const saved = value && typeof value === "object" ? value : {};
    return { ...saved, settings: { currentMileage: "", currentDate: today(), deliveryDate: "", deliveryMileage: 0, showAllReminders: false, ...saved.settings }, records: Array.isArray(saved.records) ? saved.records : [], tombstones: saved.tombstones || {}, revision: Number(saved.revision) || 0, dirty: saved.dirty ?? Boolean(saved.records?.length || hasMileage(saved.settings?.currentMileage)), settingsUpdatedAt: saved.settingsUpdatedAt || "" };
  }
  function cloudPayload(value) {
    const { currentMileage, currentDate, deliveryDate, deliveryMileage } = value.settings;
    return { settings: { currentMileage, currentDate, deliveryDate, deliveryMileage }, records: value.records, tombstones: value.tombstones, settingsUpdatedAt: value.settingsUpdatedAt };
  }
  function merge(local, remote) {
    if (!remote) return local;
    const incoming = normalize(remote);
    const tombstones = { ...incoming.tombstones };
    Object.entries(local.tombstones).forEach(([id, at]) => { if (at > (tombstones[id] || "")) tombstones[id] = at; });
    const records = new Map();
    for (const record of [...incoming.records, ...local.records]) {
      if (tombstones[record.id]) continue;
      const prior = records.get(record.id);
      if (!prior || (record.updatedAt || record.createdAt || "") > (prior.updatedAt || prior.createdAt || "")) records.set(record.id, record);
    }
    const localTime = local.settingsUpdatedAt || local.cloudUpdatedAt || local.settings.lastCloudSyncAt || "";
    const remoteTime = remote.settingsUpdatedAt || remote.cloudUpdatedAt || "";
    const localSettingsWin = localTime > remoteTime;
    const settings = localSettingsWin ? local.settings : { ...local.settings, ...cloudPayload(incoming).settings, showAllReminders: local.settings.showAllReminders };
    const merged = { ...local, settings, records: [...records.values()], tombstones, settingsUpdatedAt: localSettingsWin ? localTime : remoteTime, cloudVersion: remote.cloudVersion, cloudUpdatedAt: remote.cloudUpdatedAt };
    const comparable = (v) => JSON.stringify({ ...cloudPayload(v), records: [...v.records].sort((a,b)=>String(a.id).localeCompare(String(b.id))), tombstones: Object.fromEntries(Object.entries(v.tombstones).sort()) });
    merged.dirty = comparable(merged) !== comparable(incoming);
    return merged;
  }
  function addMonths(value, months) {
    const [y,m,d] = value.split("-").map(Number);
    const result = new Date(y,m-1+months,1);
    result.setDate(Math.min(d,new Date(result.getFullYear(),result.getMonth()+1,0).getDate()));
    return `${result.getFullYear()}-${String(result.getMonth()+1).padStart(2,"0")}-${String(result.getDate()).padStart(2,"0")}`;
  }
  function ezzyReminders(state, date = today()) {
    return ezzyItems.map(item => {
      const matches = state.records.filter(r => (r.key === item.key && (item.action !== "更換" || /更換/.test(r.action)) && (item.key !== "ezzyService" || /保養/.test(r.action))) || (item.includedInService && r.key === "ezzyService" && /保養/.test(r.action)));
      matches.sort((a,b)=>Number(b.mileage)-Number(a.mileage) || String(b.date).localeCompare(String(a.date)));
      const last = matches[0];
      const baseKm = last?.mileage ?? (state.settings.deliveryDate ? state.settings.deliveryMileage : null);
      const baseDate = last?.date || state.settings.deliveryDate;
      const nextKm = hasMileage(baseKm) ? Number(baseKm)+item.kmInterval : 0;
      const nextDate = baseDate ? addMonths(baseDate,item.monthInterval) : "";
      const kmLeft = nextKm && hasMileage(state.settings.currentMileage) ? nextKm-Number(state.settings.currentMileage) : Infinity;
      const daysLeft = nextDate ? Math.round((Date.parse(`${nextDate}T00:00:00Z`)-Date.parse(`${date}T00:00:00Z`))/86400000) : Infinity;
      const status = !last && !baseDate ? "unknown" : kmLeft<=0 || daysLeft<=0 ? "due" : kmLeft<=300 || daysLeft<=30 ? "soon" : "ok";
      return { ...item, last, nextKm, nextDate, kmLeft, daysLeft, status, progress: Math.round(Math.max(0,Math.min(1,Math.max(1-kmLeft/item.kmInterval,1-daysLeft/(item.monthInterval*30.44))))*100) };
    });
  }
  const api = { profiles, source, hasMileage, normalize, cloudPayload, merge, today, addMonths, ezzyReminders };
  if (typeof module === "object" && module.exports) module.exports = api;
  else global.VehicleProfiles = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
