const KEY_PREFIX = "cb350-maintenance:";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!kvUrl || !kvToken) {
    return res.status(500).json({ error: "Server is missing KV_REST_API_URL and KV_REST_API_TOKEN" });
  }

  try {
    if (req.method === "GET") {
      const syncKey = normalizeSyncKey(req.query.key);
      const data = await kvGet(kvUrl, kvToken, syncKey);
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
      await kvSet(kvUrl, kvToken, syncKey, payload);
      return res.status(200).json({ ok: true, data: payload });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Sync failed" });
  }
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
