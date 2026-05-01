import net from "node:net";
import tls from "node:tls";

const KEY_PREFIX = "cb350-maintenance:";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const redisUrl = process.env.REDIS_URL;
  if ((!kvUrl || !kvToken) && !redisUrl) {
    return res.status(500).json({ error: "Server is missing Redis environment variables" });
  }

  try {
    if (req.method === "GET") {
      const syncKey = normalizeSyncKey(req.query.key);
      const data = redisUrl ? await redisGet(redisUrl, syncKey) : await kvGet(kvUrl, kvToken, syncKey);
      return res.status(200).json({ data });
    }

    if (req.method === "POST") {
      const { key, data } = req.body || {};
      const syncKey = normalizeSyncKey(key);
      if (!data || typeof data !== "object") return res.status(400).json({ error: "Missing sync data" });
      const payload = {
        ...data,
        cloudUpdatedAt: new Date().toISOString(),
      };
      if (redisUrl) {
        await redisSet(redisUrl, syncKey, payload);
      } else {
        await kvSet(kvUrl, kvToken, syncKey, payload);
      }
      return res.status(200).json({ ok: true, data: payload });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Sync failed" });
  }
}

async function redisGet(redisUrl, key) {
  const result = await redisCommand(redisUrl, ["GET", key]);
  return result ? JSON.parse(result) : null;
}

async function redisSet(redisUrl, key, value) {
  await redisCommand(redisUrl, ["SET", key, JSON.stringify(value)]);
}

function redisCommand(redisUrl, args) {
  return new Promise((resolve, reject) => {
    const url = new URL(redisUrl);
    const socketFactory = url.protocol === "rediss:" ? tls.connect : net.connect;
    const socket = socketFactory({
      host: url.hostname,
      port: Number(url.port || 6379),
      servername: url.hostname,
    });
    let buffer = Buffer.alloc(0);
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Redis request timed out"));
    }, 8000);

    socket.on("connect", () => {
      const commands = [];
      if (url.password) {
        commands.push(["AUTH", decodeURIComponent(url.username || "default"), decodeURIComponent(url.password)]);
      }
      commands.push(args);
      socket.write(commands.map(encodeRedisCommand).join(""));
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const parsed = parseRedisReply(buffer);
      if (!parsed.done) return;
      clearTimeout(timeout);
      socket.end();
      resolve(parsed.value);
    });

    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function encodeRedisCommand(args) {
  return `*${args.length}\r\n${args.map((arg) => {
    const value = String(arg);
    return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
  }).join("")}`;
}

function parseRedisReply(buffer) {
  const text = buffer.toString("utf8");
  if (!text) return { done: false };
  const type = text[0];
  if (type === "+") return { done: text.includes("\r\n"), value: text.slice(1, text.indexOf("\r\n")) };
  if (type === "-") throw new Error(text.slice(1, text.indexOf("\r\n")));
  if (type === ":") return { done: text.includes("\r\n"), value: Number(text.slice(1, text.indexOf("\r\n"))) };
  if (type === "$") {
    const lineEnd = text.indexOf("\r\n");
    if (lineEnd < 0) return { done: false };
    const length = Number(text.slice(1, lineEnd));
    if (length === -1) return { done: true, value: null };
    const start = lineEnd + 2;
    const end = start + length;
    if (buffer.length < end + 2) return { done: false };
    return { done: true, value: buffer.slice(start, end).toString("utf8") };
  }
  throw new Error("Unsupported Redis response");
}

function normalizeSyncKey(value) {
  const key = String(value || "").trim();
  if (!key) throw new Error("Missing sync key");
  if (key.length < 6) throw new Error("Sync key must be at least 6 characters");
  if (key.length > 80) throw new Error("Sync key is too long");
  return `${KEY_PREFIX}${key}`;
}

async function kvGet(kvUrl, kvToken, key) {
  const response = await fetch(`${kvUrl}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Cloud download failed");
  return data.result ? JSON.parse(data.result) : null;
}

async function kvSet(kvUrl, kvToken, key, value) {
  const response = await fetch(`${kvUrl}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kvToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Cloud upload failed");
}
