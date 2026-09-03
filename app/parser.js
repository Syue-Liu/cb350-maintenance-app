/**
 * CB350 保養文字解析器（純函式，無 DOM 依賴，可在 Node 下測試）。
 *
 * 修正重點：
 * 1. 民國日期：115/02/04 或「民國115年2月4日」→ 2026-02-04。
 * 2. 關鍵字改為「最長優先 + 消耗字串」，「機油濾芯」不會再同時命中「機油」。
 * 3. 費用改為分段解析，同一筆費用不會被複製到每一個項目。
 * 4. 新增 findLatestRecord()：依里程/日期取最後一次紀錄，而不是取最後輸入的那筆。
 */
(function (global) {
  "use strict";

  const ROC_YEAR_OFFSET = 1911;
  const SEGMENT_SPLIT = /[、,，。．;；\n\r]+|\s{2,}|\s+且\s+/;
  const PLACEHOLDER = "\u0000";

  // ---------------------------------------------------------------- 日期

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function toDateInput(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function isValidYmd(year, month, day) {
    if (!(year >= 1970 && year <= 2100)) return false;
    if (!(month >= 1 && month <= 12)) return false;
    if (!(day >= 1 && day <= 31)) return false;
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function formatYmd(year, month, day) {
    return isValidYmd(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : "";
  }

  /**
   * 支援：
   *   2026-05-01 / 2026/5/1 / 2026年5月1日
   *   民國115年2月4日 / 115/02/04（維修單常見）
   *   5/1（補上今年）
   *   今天 / 昨天 / 前天
   */
  function parseDate(text, options = {}) {
    const now = options.now instanceof Date ? options.now : new Date();
    const raw = String(text || "");

    // 西元四位數年份
    const western = raw.match(/(?:^|[^\d])((?:19|20)\d{2})\s*[年/\-.]\s*(\d{1,2})\s*[月/\-.]\s*(\d{1,2})/);
    if (western) {
      const value = formatYmd(Number(western[1]), Number(western[2]), Number(western[3]));
      if (value) return value;
    }

    // 明寫「民國」
    const rocLabelled = raw.match(/民國\s*(\d{1,3})\s*[年/\-.]\s*(\d{1,2})\s*[月/\-.]\s*(\d{1,2})/);
    if (rocLabelled) {
      const value = formatYmd(Number(rocLabelled[1]) + ROC_YEAR_OFFSET, Number(rocLabelled[2]), Number(rocLabelled[3]));
      if (value) return value;
    }

    // 未標示的民國三段式，例如 115/02/04。年份限 60~150 避免誤判。
    const rocBare = raw.match(/(?:^|[^\d])(\d{2,3})\s*[年/\-.]\s*(\d{1,2})\s*[月/\-.]\s*(\d{1,2})(?![\d])/);
    if (rocBare) {
      const rocYear = Number(rocBare[1]);
      if (rocYear >= 60 && rocYear <= 150) {
        const value = formatYmd(rocYear + ROC_YEAR_OFFSET, Number(rocBare[2]), Number(rocBare[3]));
        if (value) return value;
      }
    }

    // 只有月/日，補今年。前後不可接數字或英數字，避免吃到 10W-30、15412-K0N。
    const monthDay = raw.match(/(?:^|[^\dA-Za-z])(\d{1,2})\s*[月/]\s*(\d{1,2})\s*日?(?![\dA-Za-z])/);
    if (monthDay) {
      const value = formatYmd(now.getFullYear(), Number(monthDay[1]), Number(monthDay[2]));
      if (value) return value;
    }

    if (/今天|本日|今日/.test(raw)) return toDateInput(now);
    if (/昨天|昨日/.test(raw)) {
      const date = new Date(now);
      date.setDate(date.getDate() - 1);
      return toDateInput(date);
    }
    if (/前天/.test(raw)) {
      const date = new Date(now);
      date.setDate(date.getDate() - 2);
      return toDateInput(date);
    }

    return "";
  }

  // ---------------------------------------------------------------- 里程

  function toNumber(value) {
    const digits = String(value).replace(/[,\s]/g, "");
    const parsed = Number(digits);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseMileage(text) {
    const raw = String(text || "");
    const labelled = raw.match(/(?:里程|里成|公里數|odo(?:meter)?|mileage)\s*[:：]?\s*([\d,]{3,8})/i);
    if (labelled) return toNumber(labelled[1]);

    const suffixed = raw.match(/([\d,]{3,8})\s*(?:km|公里|k\b)/i);
    if (suffixed) return toNumber(suffixed[1]);

    return 0;
  }

  // ---------------------------------------------------------------- 費用

  function parseCost(text, options = {}) {
    const raw = String(text || "");
    const exclude = Number(options.exclude) || 0;

    const patterns = [
      /(?:費用|花費|價格|金額|工資|工錢|收費|合計|總計|小計)\s*[:：]?\s*(?:nt\$?|\$)?\s*([\d,]{2,7})/i,
      /(?:nt\$|\$)\s*([\d,]{2,7})/i,
      /([\d,]{2,7})\s*(?:元|塊|圓)/,
    ];

    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (!match) continue;
      const value = toNumber(match[1]);
      if (!value) continue;
      if (exclude && value === exclude) continue; // 別把里程當成費用
      return value;
    }
    return "";
  }

  // ---------------------------------------------------------------- 項目比對

  function buildKeywordIndex(items) {
    const entries = [];
    items.forEach((item) => {
      const words = new Set([item.name, ...(item.keywords || [])]);
      words.forEach((word) => {
        const keyword = String(word || "").trim().toLowerCase();
        if (keyword) entries.push({ key: item.key, keyword });
      });
    });
    // 長的先比對，比對到就把該段字元消耗掉，短的子字串就不會重複命中。
    return entries.sort((a, b) => b.keyword.length - a.keyword.length);
  }

  function matchItemKeys(text, items) {
    const index = buildKeywordIndex(items);
    let working = String(text || "").toLowerCase();
    const hits = new Map();

    index.forEach(({ key, keyword }) => {
      let position = working.indexOf(keyword);
      while (position >= 0) {
        if (!hits.has(key)) hits.set(key, position);
        working =
          working.slice(0, position) +
          PLACEHOLDER.repeat(keyword.length) +
          working.slice(position + keyword.length);
        position = working.indexOf(keyword);
      }
    });

    // 依在原文出現的位置排序，讓紀錄順序符合使用者書寫順序。
    return [...hits.entries()].sort((a, b) => a[1] - b[1]).map(([key]) => key);
  }

  // ---------------------------------------------------------------- 動作

  function parseAction(text, item) {
    const raw = String(text || "");
    const hasReplace = /更換|換新|換掉|換了|更新|replace|換/.test(raw);
    const hasClean = /清潔|清洗|清理|洗淨|清鏈|clean/.test(raw);
    const hasLube = /潤滑|上油|加油(?!站)|注油|lube/.test(raw);
    const hasAdjust = /調整|校正|調校|微調|adjust/.test(raw);
    const hasInspect = /檢查|檢視|檢測|查看|確認|inspect|check/.test(raw);
    const hasTop = /補充|添加|加注/.test(raw);

    if (item && item.key === "chain") {
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
    if (hasTop) return "補充";
    if (hasInspect) return "檢查";
    return "";
  }

  // ---------------------------------------------------------------- 備註

  function buildNote(text, item) {
    const raw = String(text || "");
    const specs = [];
    const oil = raw.match(/\b(\d{1,2}w)\s*-?\s*(\d{2})\b/i);
    const dot = raw.match(/\bdot\s*([345](?:\.1)?)\b/i);
    const plug = raw.match(/\b(mr6k-9|cr8eh?-?9?)\b/i);
    const brand = raw.match(/\b(motul|castrol|shell|repsol|honda|ngk|denso|did|ek|rk)\b/i);

    if (oil) specs.push(`${oil[1].toUpperCase()}-${oil[2]}`);
    if (dot) specs.push(`DOT ${dot[1]}`);
    if (plug) specs.push(plug[1].toUpperCase());
    if (brand) specs.push(brand[1].toUpperCase());

    const base = item && item.note ? item.note : "";
    if (!specs.length) return base;
    return base ? `${specs.join(" / ")}；${base}` : specs.join(" / ");
  }

  // ---------------------------------------------------------------- 主流程

  function splitSegments(text) {
    return String(text || "")
      .split(SEGMENT_SPLIT)
      .map((segment) => segment.trim())
      .filter(Boolean);
  }

  function defaultUuid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    // http:// 或舊瀏覽器沒有 secure context，退回時間戳 + 亂數。
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * @param {string} text 使用者輸入
   * @param {object} options
   *   items        保養項目清單
   *   fallbackDate 找不到日期時使用
   *   fallbackMileage 找不到里程時使用
   *   now / uuid   測試用可注入
   * @returns {{date:string, mileage:number|"", cost:number|"", records:Array, source:string}}
   */
  function parseMaintenanceText(text, options = {}) {
    const items = options.items || (global.CB350Data && global.CB350Data.MAINTENANCE_ITEMS) || [];
    const byKey = new Map(items.map((item) => [item.key, item]));
    const now = options.now instanceof Date ? options.now : new Date();
    const uuid = typeof options.uuid === "function" ? options.uuid : defaultUuid;
    const raw = String(text || "");

    const date = parseDate(raw, { now }) || options.fallbackDate || toDateInput(now);
    const mileage = parseMileage(raw) || Number(options.fallbackMileage) || "";

    const segments = splitSegments(raw);
    const globalAction = parseAction(raw, null);
    const collected = new Map();
    let unassignedCost = "";

    segments.forEach((segment) => {
      const keys = matchItemKeys(segment, items);
      const segmentCost = parseCost(segment, { exclude: mileage });

      if (!keys.length) {
        // 例如「費用 950 元」自成一段：先記下來，最後掛在第一筆上。
        if (segmentCost && !unassignedCost) unassignedCost = segmentCost;
        return;
      }

      keys.forEach((key, indexInSegment) => {
        const item = byKey.get(key);
        if (!item) return;
        const existing = collected.get(key);
        // 同一段內若只有一筆費用，只掛在該段第一個項目上，避免重複計算。
        const cost = segmentCost && indexInSegment === 0 ? segmentCost : "";
        const action = parseAction(segment, item) || globalAction || item.action;
        const note = buildNote(segment, item);

        if (existing) {
          if (!existing.cost && cost) existing.cost = cost;
          if (!existing.action && action) existing.action = action;
          return;
        }
        collected.set(key, { item, action, cost, note });
      });
    });

    // 整句沒有分段（或分段後都沒命中）時，退回整句比對一次。
    if (!collected.size) {
      const keys = matchItemKeys(raw, items);
      const wholeCost = parseCost(raw, { exclude: mileage });
      keys.forEach((key, index) => {
        const item = byKey.get(key);
        if (!item) return;
        collected.set(key, {
          item,
          action: parseAction(raw, item) || item.action,
          cost: index === 0 && wholeCost ? wholeCost : "",
          note: buildNote(raw, item),
        });
      });
    }

    const entries = [...collected.values()];

    // 沒有掛到任何項目的費用，視為本次總額，記在第一筆並標註。
    if (unassignedCost && entries.length) {
      const target = entries.find((entry) => !entry.cost) || entries[0];
      target.cost = target.cost || unassignedCost;
      if (entries.length > 1) {
        target.note = target.note ? `${target.note}（本次合計費用）` : "本次合計費用";
      }
    }

    const createdAt = now.toISOString();
    const records = entries.map((entry) => ({
      id: uuid(),
      date,
      mileage,
      item: entry.item.name,
      key: entry.item.key,
      action: entry.action || entry.item.action,
      cost: entry.cost || "",
      note: entry.note || entry.item.note,
      createdAt,
      updatedAt: createdAt,
    }));

    const cost = records.reduce((sum, record) => sum + (Number(record.cost) || 0), 0) || "";

    return { date, mileage, cost, records, source: "local" };
  }

  // ---------------------------------------------------------------- 提醒用

  function recordSortValue(record) {
    const mileage = Number(record && record.mileage) || 0;
    const time = record && record.date ? Date.parse(`${record.date}T00:00:00`) : NaN;
    const created = record && record.createdAt ? Date.parse(record.createdAt) : NaN;
    return {
      mileage,
      time: Number.isFinite(time) ? time : 0,
      created: Number.isFinite(created) ? created : 0,
    };
  }

  /**
   * 取某個保養項目「真正最後一次」的紀錄。
   * 原本用 records.find() 會拿到最近輸入的那筆，補登舊維修單會讓提醒往回跳。
   */
  function findLatestRecord(records, item) {
    if (!Array.isArray(records) || !item) return null;
    const matched = records.filter(
      (record) => record && (record.key === item.key || record.item === item.name),
    );
    if (!matched.length) return null;

    return matched.reduce((best, current) => {
      const a = recordSortValue(best);
      const b = recordSortValue(current);
      if (b.mileage !== a.mileage) return b.mileage > a.mileage ? current : best;
      if (b.time !== a.time) return b.time > a.time ? current : best;
      return b.created > a.created ? current : best;
    });
  }

  /** 紀錄列表用：日期新的在前，同日看里程，再看輸入時間。 */
  function sortRecordsDesc(records) {
    return [...(records || [])].sort((left, right) => {
      const a = recordSortValue(left);
      const b = recordSortValue(right);
      if (b.time !== a.time) return b.time - a.time;
      if (b.mileage !== a.mileage) return b.mileage - a.mileage;
      return b.created - a.created;
    });
  }

  /** 同一天、同里程、同項目視為重複，避免同一張維修單貼兩次。 */
  function isDuplicateRecord(records, candidate) {
    return (records || []).some(
      (record) =>
        record &&
        record.key === candidate.key &&
        record.date === candidate.date &&
        Number(record.mileage || 0) === Number(candidate.mileage || 0),
    );
  }

  const api = {
    parseMaintenanceText,
    parseDate,
    parseMileage,
    parseCost,
    parseAction,
    buildNote,
    matchItemKeys,
    splitSegments,
    findLatestRecord,
    sortRecordsDesc,
    isDuplicateRecord,
    toDateInput,
    defaultUuid,
  };

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    global.CB350Parser = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
