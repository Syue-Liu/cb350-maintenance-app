const test = require("node:test");
const assert = require("node:assert/strict");

const { MAINTENANCE_ITEMS } = require("../app/maintenance-items.js");
const parser = require("../app/parser.js");

const NOW = new Date(2026, 4, 1); // 2026-05-01 本地時間
let counter = 0;
const uuid = () => `test-${++counter}`;

function parse(text, options = {}) {
  counter = 0;
  return parser.parseMaintenanceText(text, { items: MAINTENANCE_ITEMS, now: NOW, uuid, ...options });
}

function keysOf(result) {
  return result.records.map((record) => record.key);
}

// ------------------------------------------------------------------ 日期

test("解析西元日期的各種寫法", () => {
  assert.equal(parser.parseDate("今天 2026/5/1 換機油", { now: NOW }), "2026-05-01");
  assert.equal(parser.parseDate("2026-05-01 保養", { now: NOW }), "2026-05-01");
  assert.equal(parser.parseDate("2026年5月1日 保養", { now: NOW }), "2026-05-01");
});

test("民國日期會轉成西元（原本會產生 2026-15-02）", () => {
  assert.equal(parser.parseDate("維修單 115/02/04 里程 12850", { now: NOW }), "2026-02-04");
  assert.equal(parser.parseDate("民國115年2月4日", { now: NOW }), "2026-02-04");
  assert.equal(parser.parseDate("114/12/31 大保養", { now: NOW }), "2025-12-31");
});

test("機油規格與料號不會被誤判成日期", () => {
  assert.equal(parser.parseDate("換機油 10W-30", { now: NOW }), "");
  assert.equal(parser.parseDate("機油濾芯 15412-K0N-D01", { now: NOW }), "");
  assert.equal(parser.parseDate("火星塞 NGK MR6K-9", { now: NOW }), "");
});

test("只有月日時補上今年，無效日期不採用", () => {
  assert.equal(parser.parseDate("5/1 洗車順便上鏈條油", { now: NOW }), "2026-05-01");
  assert.equal(parser.parseDate("13/45 亂寫", { now: NOW }), "");
});

test("相對日期", () => {
  assert.equal(parser.parseDate("今天保養", { now: NOW }), "2026-05-01");
  assert.equal(parser.parseDate("昨天換機油", { now: NOW }), "2026-04-30");
});

// ------------------------------------------------------------------ 項目比對

test("子字串不再造成連鎖誤判", () => {
  // 原本這句會同時命中 engineOil / oilFilter / chain / chainSlider / battery
  const keys = parser.matchItemKeys("更換機油濾芯與鏈條滑塊，順便檢查大燈", MAINTENANCE_ITEMS);
  assert.deepEqual(keys.sort(), ["battery", "chainSlider", "oilFilter"].sort());
});

test("煞車油與煞車皮不會再額外命中煞車系統", () => {
  assert.deepEqual(parser.matchItemKeys("更換煞車油 DOT 4", MAINTENANCE_ITEMS), ["brakeFluid"]);
  assert.deepEqual(parser.matchItemKeys("檢查煞車皮", MAINTENANCE_ITEMS), ["brakePads"]);
  assert.deepEqual(parser.matchItemKeys("檢查煞車系統", MAINTENANCE_ITEMS), ["brakeSystem"]);
});

test("單純換機油只會產生一筆機油紀錄", () => {
  assert.deepEqual(parser.matchItemKeys("換機油 10W-30", MAINTENANCE_ITEMS), ["engineOil"]);
});

test("項目順序依原文出現順序", () => {
  const result = parse("換機油、清潔鏈條、檢查輪胎");
  assert.deepEqual(keysOf(result), ["engineOil", "chain", "tires"]);
});

// ------------------------------------------------------------------ 費用

test("單一總額不會被複製到每一筆（原本會 3 倍計算）", () => {
  const result = parse("今天 2026/5/1 里程 12850，換機油 10W-30、清潔潤滑鏈條、檢查煞車皮，費用 950 元。");
  assert.equal(result.records.length, 3);
  const costs = result.records.map((record) => Number(record.cost) || 0);
  assert.equal(costs.reduce((a, b) => a + b, 0), 950);
  assert.equal(costs.filter(Boolean).length, 1);
});

test("分項費用會各自歸屬", () => {
  const result = parse("里程 12850，換機油 800 元、換火星塞 450 元");
  const byKey = Object.fromEntries(result.records.map((record) => [record.key, record.cost]));
    assert.equal(byKey.engineOil, 800);
  assert.equal(byKey.sparkPlug, 450);
  assert.equal(result.cost, 1250);
});

test("里程數字不會被當成費用", () => {
  const result = parse("里程 12850 檢查輪胎");
  assert.equal(result.mileage, 12850);
  assert.equal(result.records[0].cost, "");
});

test("NT$ 寫法", () => {
  assert.equal(parser.parseCost("工資 NT$1,200"), 1200);
  assert.equal(parser.parseCost("$980"), 980);
});

// ------------------------------------------------------------------ 里程

test("里程解析", () => {
  assert.equal(parser.parseMileage("里程 12850"), 12850);
  assert.equal(parser.parseMileage("目前 12,850 km"), 12850);
  assert.equal(parser.parseMileage("ODO：8600"), 8600);
  assert.equal(parser.parseMileage("換機油"), 0);
});

// ------------------------------------------------------------------ 動作

test("鏈條動作會分辨清潔與潤滑", () => {
  const chain = MAINTENANCE_ITEMS.find((item) => item.key === "chain");
  assert.equal(parser.parseAction("清潔並潤滑鏈條", chain), "清潔/潤滑");
  assert.equal(parser.parseAction("鏈條上油", chain), "潤滑");
  assert.equal(parser.parseAction("調整鏈條鬆緊", chain), "調整");
});

test("動作按分段判斷，不會被句中其他動詞污染", () => {
  const result = parse("里程 13000，更換機油、檢查輪胎");
  const byKey = Object.fromEntries(result.records.map((record) => [record.key, record.action]));
  assert.equal(byKey.engineOil, "更換");
  assert.equal(byKey.tires, "檢查");
});

// ------------------------------------------------------------------ 備註

test("備註會帶出機油規格", () => {
  assert.match(parse("換機油 10W-40").records[0].note, /10W-40/);
  assert.match(parse("換機油 10w40").records[0].note, /10W-40/);
  assert.match(parse("換機油 5W-30").records[0].note, /5W-30/);
});

test("每個項目都有分類與動作清單", () => {
  const categories = new Set(require("../app/maintenance-items.js").CATEGORIES.map((c) => c.key));
  MAINTENANCE_ITEMS.forEach((item) => {
    assert.ok(categories.has(item.category), `${item.name} 分類無效`);
    assert.ok(Array.isArray(item.actions) && item.actions.length, `${item.name} 缺少動作清單`);
    assert.ok(item.actions.includes(item.action), `${item.name} 預設動作不在清單內`);
  });
});

test("快捷項目存在且都是短週期", () => {
  const frequent = MAINTENANCE_ITEMS.filter((item) => item.frequent);
  assert.ok(frequent.length >= 3 && frequent.length <= 6);
  frequent.forEach((item) => {
    assert.ok(item.kmInterval <= 6000 || item.monthInterval <= 24, `${item.name} 週期太長`);
  });
});

// ------------------------------------------------------------------ 整體

test("沒有命中任何項目時回傳空陣列", () => {
  const result = parse("今天天氣很好，去山上騎車");
  assert.equal(result.records.length, 0);
});

test("找不到日期與里程時使用 fallback", () => {
  const result = parse("換機油", { fallbackDate: "2026-03-02", fallbackMileage: 9000 });
  assert.equal(result.records[0].date, "2026-03-02");
  assert.equal(result.records[0].mileage, 9000);
});

// ------------------------------------------------------------------ 最後一次紀錄

test("findLatestRecord 依里程取最後一次，而不是最後輸入的那筆", () => {
  const item = MAINTENANCE_ITEMS.find((entry) => entry.key === "engineOil");
  const records = [
    // 補登的舊維修單，最後輸入所以排在最前面
    { key: "engineOil", date: "2026-01-10", mileage: 9000, createdAt: "2026-05-01T10:00:00Z" },
    { key: "engineOil", date: "2026-04-20", mileage: 12800, createdAt: "2026-04-20T10:00:00Z" },
  ];
  assert.equal(parser.findLatestRecord(records, item).mileage, 12800);
});

test("findLatestRecord 在沒有里程時改用日期", () => {
  const item = MAINTENANCE_ITEMS.find((entry) => entry.key === "brakeFluid");
  const records = [
    { key: "brakeFluid", date: "2024-06-01", mileage: "", createdAt: "2026-05-01T10:00:00Z" },
    { key: "brakeFluid", date: "2026-02-01", mileage: "", createdAt: "2026-02-01T10:00:00Z" },
  ];
  assert.equal(parser.findLatestRecord(records, item).date, "2026-02-01");
});

test("findLatestRecord 找不到時回傳 null", () => {
  const item = MAINTENANCE_ITEMS.find((entry) => entry.key === "clutch");
  assert.equal(parser.findLatestRecord([], item), null);
});

// ------------------------------------------------------------------ 排序與重複

test("紀錄列表依日期由新到舊", () => {
  const sorted = parser.sortRecordsDesc([
    { date: "2026-01-01", mileage: 9000, createdAt: "2026-05-01T00:00:00Z" },
    { date: "2026-04-01", mileage: 12000, createdAt: "2026-04-01T00:00:00Z" },
  ]);
  assert.equal(sorted[0].date, "2026-04-01");
});

test("同日同里程同項目視為重複", () => {
  const existing = [{ key: "engineOil", date: "2026-05-01", mileage: 12850 }];
  assert.equal(parser.isDuplicateRecord(existing, { key: "engineOil", date: "2026-05-01", mileage: 12850 }), true);
  assert.equal(parser.isDuplicateRecord(existing, { key: "engineOil", date: "2026-05-01", mileage: 13000 }), false);
  assert.equal(parser.isDuplicateRecord(existing, { key: "chain", date: "2026-05-01", mileage: 12850 }), false);
});
