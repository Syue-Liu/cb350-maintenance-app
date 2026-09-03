/**
 * CB350 RS 保養項目定義。
 *
 * keywords：比對採「最長優先 + 消耗字串」（見 parser.js），子字串不會連鎖誤判。
 *           不要放純動作詞（潤滑、上油、清潔…），那些由 parseAction 處理。
 * category：用於選單分組、週期表分區、花費統計。
 * actions： 這個項目合理的動作，第一個是預設值。
 * frequent：里程週期短、實際上最常做的項目，會出現在「新增」頁的快捷列。
 */
(function (global) {
  "use strict";

  const CATEGORIES = [
    { key: "engine", name: "引擎", color: "#B4531F" },
    { key: "drive", name: "傳動", color: "#1F6FB4" },
    { key: "brake", name: "煞車", color: "#8E2F45" },
    { key: "electric", name: "電系", color: "#7A5CA8" },
    { key: "chassis", name: "車體", color: "#2C6E52" },
    { key: "overall", name: "全車", color: "#4A5560" },
  ];

  const MAINTENANCE_ITEMS = [
    {
      key: "engineOil",
      name: "機油",
      category: "engine",
      action: "更換",
      actions: ["更換", "補充", "檢查"],
      frequent: true,
      defaultSpec: "10W-40",
      kmInterval: 4000,
      monthInterval: 12,
      keywords: ["機油", "引擎油", "換油", "engine oil", "10w-40", "10w-30", "5w-30", "gn4"],
      note: "每 4,000 km 或每年；首保通常 1,000 km。",
    },
    {
      key: "oilFilter",
      name: "機油濾芯",
      category: "engine",
      action: "更換",
      actions: ["更換", "檢查"],
      kmInterval: 18000,
      monthInterval: 36,
      keywords: ["機油濾芯", "機油芯", "油濾芯", "油芯", "oil filter", "15412"],
      note: "約每 18,000 km；常見料號 15412-K0N-D01。",
    },
    {
      key: "airFilter",
      name: "空氣濾芯",
      category: "engine",
      action: "更換",
      actions: ["更換", "清潔", "檢查"],
      kmInterval: 18000,
      monthInterval: 36,
      keywords: ["空氣濾芯", "空氣濾清器", "空濾", "air filter", "air cleaner"],
      note: "約每 18,000 km；多塵、潮濕環境提早。",
    },
    {
      key: "sparkPlug",
      name: "火星塞",
      category: "engine",
      action: "更換",
      actions: ["更換", "檢查", "清潔"],
      defaultSpec: "NGK MR6K-9",
      kmInterval: 12000,
      monthInterval: 12,
      keywords: ["火星塞", "火咬子", "spark plug", "sparkplug", "mr6k-9"],
      note: "約每 12,000 km；常見規格 NGK MR6K-9。",
    },
    {
      key: "valveClearance",
      name: "汽門間隙",
      category: "engine",
      action: "檢查",
      actions: ["檢查", "調整"],
      kmInterval: 6000,
      monthInterval: 6,
      keywords: ["汽門間隙", "汽門", "氣門", "鳥仔", "valve clearance", "valve"],
      note: "每 6,000 km 檢查，建議交給店家。",
    },
    {
      key: "chain",
      name: "傳動鏈條",
      category: "drive",
      action: "清潔/潤滑",
      actions: ["清潔/潤滑", "潤滑", "清潔", "調整", "更換", "檢查"],
      frequent: true,
      kmInterval: 1000,
      monthInterval: 0,
      keywords: ["傳動鏈條", "鏈條", "鍊條", "鏈子", "chain", "清鏈", "鏈條上油"],
      note: "每 1,000 km；洗車、雨騎、多塵後也要潤滑。",
    },
    {
      key: "chainSlider",
      name: "鏈條滑塊",
      category: "drive",
      action: "檢查",
      actions: ["檢查", "更換"],
      kmInterval: 12000,
      monthInterval: 12,
      keywords: ["鏈條滑塊", "鍊條滑塊", "滑塊", "chain slider"],
      note: "每 12,000 km 檢查磨耗。",
    },
    {
      key: "clutch",
      name: "離合器系統",
      category: "drive",
      action: "檢查",
      actions: ["檢查", "調整", "更換"],
      kmInterval: 6000,
      monthInterval: 6,
      keywords: ["離合器", "離合", "clutch"],
      note: "每 6,000 km 檢查自由間隙與作動。",
    },
    {
      key: "brakeFluid",
      name: "煞車油",
      category: "brake",
      action: "更換",
      actions: ["更換", "檢查", "補充"],
      frequent: true,
      defaultSpec: "DOT 4",
      kmInterval: 0,
      monthInterval: 24,
      annualCheck: true,
      keywords: ["煞車油", "剎車油", "brake fluid", "dot4", "dot 4"],
      note: "每年檢查，每 2 年更換；規格 DOT 4。",
    },
    {
      key: "brakePads",
      name: "煞車皮",
      category: "brake",
      action: "檢查",
      actions: ["檢查", "更換"],
      frequent: true,
      kmInterval: 6000,
      monthInterval: 12,
      keywords: ["煞車皮", "剎車皮", "來令片", "來令", "brake pad"],
      note: "每 6,000 km 或每年檢查磨耗。",
    },
    {
      key: "brakeSystem",
      name: "煞車系統",
      category: "brake",
      action: "檢查",
      actions: ["檢查", "調整"],
      kmInterval: 6000,
      monthInterval: 12,
      keywords: ["煞車系統", "煞車卡鉗", "剎車系統", "卡鉗", "煞車", "剎車", "brake"],
      note: "油管、卡鉗、洩漏、煞車手感。",
    },
    {
      key: "battery",
      name: "電瓶/電系",
      category: "electric",
      action: "檢查",
      actions: ["檢查", "更換", "充電"],
      kmInterval: 6000,
      monthInterval: 12,
      keywords: ["電瓶", "電池", "battery", "大燈", "方向燈", "尾燈", "煞車燈", "儀表燈", "喇叭"],
      note: "每年檢查，也適合行前快速確認。",
    },
    {
      key: "tires",
      name: "輪胎/輪框",
      category: "chassis",
      action: "檢查",
      actions: ["檢查", "更換", "補胎"],
      frequent: true,
      kmInterval: 6000,
      monthInterval: 12,
      keywords: ["輪胎", "胎壓", "胎紋", "輪框", "鋼圈", "tire", "tyre"],
      note: "前胎壓 29 psi；後 33 psi 單人 / 36 psi 雙載。",
    },
    {
      key: "general",
      name: "螺絲/避震/側柱",
      category: "chassis",
      action: "檢查",
      actions: ["檢查", "調整"],
      kmInterval: 6000,
      monthInterval: 12,
      keywords: ["螺絲", "螺帽", "避震", "側柱", "sidestand", "suspension"],
      note: "每 6,000 km 或每年檢查重要固定件與作動。",
    },
    {
      key: "majorService",
      name: "大保養",
      category: "overall",
      action: "保養",
      actions: ["保養", "檢查"],
      kmInterval: 20000,
      monthInterval: 0,
      keywords: ["大保養", "major service", "節流閥", "噴油嘴", "積碳", "燃油清潔", "齒盤"],
      note: "每 20,000 km；含節流閥、噴油嘴、積碳清潔與全車檢查。",
    },
  ];

  const api = { MAINTENANCE_ITEMS, CATEGORIES };

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    global.CB350Data = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
