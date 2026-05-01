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
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Redis request timed out"));
    }, 8000);

    socket.on("connect", () => {
      socket.write(commands.map(encodeRedisCommand).join(""));
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      let parsed;
      try {
        parsed = parseRedisReplies(buffer, expectedReplies);
      } catch (error) {
        clearTimeout(timeout);
        socket.destroy();
        reject(error);
        return;
      }
      if (!parsed.done) return;
      clearTimeout(timeout);
      socket.end();
      resolve(parsed.values[parsed.values.length - 1]);
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
    return {
      done: true,
      value: buffer.slice(offset + 1, lineEnd).toString("utf8"),
      nextOffset: lineEnd + 2,
    };
  }
  if (type === "-") throw new Error(buffer.slice(offset + 1, lineEnd).toString("utf8"));
  if (type === ":") {
    return {
      done: true,
      value: Number(buffer.slice(offset + 1, lineEnd).toString("utf8")),
      nextOffset: lineEnd + 2,
    };
  }
  if (type === "$") {
    const length = Number(buffer.slice(offset + 1, lineEnd).toString("utf8"));
    const start = lineEnd + 2;
    if (length === -1) return { done: true, value: null, nextOffset: start };
    const end = start + length;
    if (buffer.length < end + 2) return { done: false };
    return {
      done: true,
      value: buffer.slice(start, end).toString("utf8"),
      nextOffset: end + 2,
    };
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
