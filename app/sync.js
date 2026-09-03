import net from "node:net";
import tls from "node:tls";

const KEY_PREFIX = "cb350-maintenance:";

// Vercel 的 Redis 整合通常會同時給 REST 與 TCP 兩組變數。
// REST 在 serverless 上穩定得多（無連線狀態、無冷啟動 socket 問題），所以優先使用。
const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_URL = process.env.REDIS_URL;

function activeBackend() {
  if (REST_URL && REST_TOKEN) return "rest";
  if (REDIS_URL) return "tcp";
  return "none";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();

  const backend = activeBackend();

  // 健康檢查：GET /api/sync?diag=1
  // 只回報「有沒有設定、連不連得上」，不會洩漏 token 也不會讀到保養資料。
  if (req.method === "GET" && req.query.diag) {
    const report = {
      backend,
      env: {
        KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
        KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
        UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
        UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
        REDIS_URL: Boolean(process.env.REDIS_URL),
      },
    };
    if (backend === "none") {
      report.ok = false;
      report.hint = "Vercel 專案沒有任何 Redis 環境變數。到 Storage 建立 Redis，然後 Redeploy。";
      return res.status(200).json(report);
    }
    try {
      await readKey(`${KEY_PREFIX}__diag__`);
      report.ok = true;
      report.hint = "後端連線正常。";
    } catch (error) {
      report.ok = false;
      report.error = error.message;
      report.hint = "環境變數有設，但連不上 Redis。檢查 token 是否過期，或改用 REST 變數。";
    }
    return res.status(200).json(report);
  }

  if (backend === "none") {
    return res.status(503).json({
      error:
        "伺服器沒有設定 Redis 環境變數（KV_REST_API_URL / KV_REST_API_TOKEN 或 REDIS_URL）。設定後要重新部署才會生效。",
      diag: "/api/sync?diag=1",
    });
  }

  try {
    if (req.method === "GET") {
      let syncKey;
      try {
        syncKey = normalizeSyncKey(req.query.key);
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
      const data = await readKey(syncKey);
      return res.status(200).json({ data, cloudUpdatedAt: data?.cloudUpdatedAt || null });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
      let syncKey;
      try {
        syncKey = normalizeSyncKey(body.key);
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
      if (!body.data || typeof body.data !== "object") {
        return res.status(400).json({ error: "Missing sync data" });
      }
      const payload = { ...body.data, cloudUpdatedAt: new Date().toISOString() };
      await writeKey(syncKey, payload);
      return res.status(200).json({ ok: true, data: payload });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(502).json({
      error: `Redis ${activeBackend() === "rest" ? "REST" : "TCP"} 後端錯誤：${error.message}`,
      diag: "/api/sync?diag=1",
    });
  }
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

// ------------------------------------------------------------------ 讀寫

async function readKey(key) {
  return activeBackend() === "rest" ? restGet(key) : redisGet(REDIS_URL, key);
}

async function writeKey(key, value) {
  return activeBackend() === "rest" ? restSet(key, value) : redisSet(REDIS_URL, key, value);
}

async function restGet(key) {
  const response = await fetch(`${REST_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REST_TOKEN}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  if (!data.result) return null;
  return typeof data.result === "string" ? safeJson(data.result) : data.result;
}

async function restSet(key, value) {
  const response = await fetch(`${REST_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
}

function normalizeSyncKey(value) {
  const key = String(value || "").trim();
  if (!key) throw new Error("Missing sync key");
  if (key.length < 6) throw new Error("同步代碼至少要 6 個字");
  if (key.length > 80) throw new Error("同步代碼太長");
  return `${KEY_PREFIX}${key}`;
}

// ------------------------------------------------------------------ TCP 後援
// 只有在專案僅提供 REDIS_URL（沒有 REST 變數）時才會走到這裡。

async function redisGet(redisUrl, key) {
  const result = await redisCommand(redisUrl, ["GET", key]);
  return result ? safeJson(result) : null;
}

async function redisSet(redisUrl, key, value) {
  await redisCommand(redisUrl, ["SET", key, JSON.stringify(value)]);
}

function redisCommand(redisUrl, args) {
  return new Promise((resolve, reject) => {
    const url = new URL(redisUrl);
    const username = decodeURIComponent(url.username || "");
    const password = decodeURIComponent(url.password || "");
    const commands = [];
    if (password) {
      commands.push(username ? ["AUTH", username, password] : ["AUTH", password]);
    }
    commands.push(args);
    const expectedReplies = commands.length;
    const socketFactory = url.protocol === "rediss:" ? tls.connect : net.connect;
    const socket = socketFactory({
      host: url.hostname,
      port: Number(url.port || 6379),
      servername: url.hostname,
    });
    let buffer = Buffer.alloc(0);
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };

    const timeout = setTimeout(() => finish(new Error("Redis 連線逾時（8 秒）")), 8000);

    socket.on("connect", () => socket.write(commands.map(encodeRedisCommand).join("")));

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      let parsed;
      try {
        parsed = parseRedisReplies(buffer, expectedReplies);
      } catch (error) {
        finish(error);
        return;
      }
      if (!parsed.done) return;
      finish(null, parsed.values[parsed.values.length - 1]);
    });

    socket.on("error", (error) => finish(error));
    // 原本少了這段：連線被對方關閉時 promise 會卡到逾時才失敗。
    socket.on("close", () => finish(new Error("Redis 連線被關閉，回應不完整")));
  });
}

function encodeRedisCommand(args) {
  return `*${args.length}\r\n${args
    .map((arg) => {
      const value = String(arg);
      return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
    })
    .join("")}`;
}

function parseRedisReplies(buffer, expectedCount) {
  const values = [];
  let offset = 0;
  while (values.length < expectedCount) {
    const parsed = parseRedisReplyAt(buffer, offset);
    if (!parsed.done) return { done: false, values };
    values.push(parsed.value);
    offset = parsed.nextOffset;
  }
  return { done: true, values };
}

function parseRedisReplyAt(buffer, offset) {
  if (offset >= buffer.length) return { done: false };
  const type = String.fromCharCode(buffer[offset]);
  const lineEnd = buffer.indexOf("\r\n", offset);
  if (lineEnd < 0) return { done: false };

  if (type === "+") {
    return { done: true, value: buffer.slice(offset + 1, lineEnd).toString("utf8"), nextOffset: lineEnd + 2 };
  }
  if (type === "-") throw new Error(buffer.slice(offset + 1, lineEnd).toString("utf8"));
  if (type === ":") {
    return { done: true, value: Number(buffer.slice(offset + 1, lineEnd).toString("utf8")), nextOffset: lineEnd + 2 };
  }
  if (type === "$") {
    const length = Number(buffer.slice(offset + 1, lineEnd).toString("utf8"));
    const start = lineEnd + 2;
    if (length === -1) return { done: true, value: null, nextOffset: start };
    const end = start + length;
    if (buffer.length < end + 2) return { done: false };
    return { done: true, value: buffer.slice(start, end).toString("utf8"), nextOffset: end + 2 };
  }
  throw new Error("Unsupported Redis response");
}
