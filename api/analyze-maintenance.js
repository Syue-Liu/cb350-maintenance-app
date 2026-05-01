const SYSTEM_PROMPT = `
你是 Honda CB350 RS 的保養紀錄助理。請根據使用者文字與可能附上的照片，判斷本次保養項目。
只輸出 JSON，不要 Markdown，不要解釋。
輸出格式：
{
  "date": "YYYY-MM-DD 或空字串",
  "mileage": 數字或空字串,
  "records": [
    {
      "key": "maintenanceItems 裡的 key",
      "item": "maintenanceItems 裡的 name",
      "action": "檢查/清潔/潤滑/更換/調整/檢查/更換 等",
      "cost": 數字或空字串,
      "note": "從文字或照片看出的規格、狀態、信心或提醒"
    }
  ]
}
規則：
- 只能使用 maintenanceItems 中存在的保養項目。
- 照片若看得出油品、火星塞、煞車皮、鏈條、輪胎、里程錶、收據或包裝文字，請納入 note。
- 台灣民國日期要轉成西元，例如 115/02/04 代表 2026-02-04。
- 如果同一張維修單含有多個保養品項，請輸出多筆 records。
- 如果照片或文字不足以確定保養項目，records 回傳空陣列。
- 機油週期是 4000 km；大保養是 20000 km，但這裡只負責分類本次紀錄。
`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiKey && !openAiKey) {
    return res.status(500).json({ error: "Server is missing GEMINI_API_KEY or OPENAI_API_KEY" });
  }

  try {
    const { text = "", imageDataUrl = "", currentMileage = "", currentDate = "", maintenanceItems = [] } = req.body || {};
    if (!text && !imageDataUrl) {
      return res.status(400).json({ error: "Missing text or image" });
    }

    if (geminiKey) {
      const outputText = await analyzeWithGemini({ geminiKey, text, imageDataUrl, currentMileage, currentDate, maintenanceItems });
      return res.status(200).json(parseJsonOutput(outputText, "Gemini"));
    }

    const content = [
      {
        type: "input_text",
        text: JSON.stringify({
          userText: text,
          currentMileage,
          currentDate,
          maintenanceItems,
        }),
      },
    ];

    if (imageDataUrl) {
      content.push({
        type: "input_image",
        image_url: imageDataUrl,
        detail: "auto",
      });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5",
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: SYSTEM_PROMPT }],
          },
          {
            role: "user",
            content,
          },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "OpenAI request failed" });
    }

    const outputText = data.output_text || extractOutputText(data);
    const parsed = parseJsonOutput(outputText, "OpenAI");
    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Analyze failed" });
  }
}

async function analyzeWithGemini({ geminiKey, text, imageDataUrl, currentMileage, currentDate, maintenanceItems }) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const parts = [
    {
      text: `${SYSTEM_PROMPT}\n\n使用者資料：${JSON.stringify({
        userText: text,
        currentMileage,
        currentDate,
        maintenanceItems,
      })}`,
    },
  ];

  if (imageDataUrl) {
    const image = parseDataUrl(imageDataUrl);
    parts.push({
      inline_data: {
        mime_type: image.mimeType,
        data: image.base64,
      },
    });
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        response_mime_type: "application/json",
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return Promise.reject(new Error(data.error?.message || "Gemini request failed"));
  }

  return (data.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n");
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  return {
    mimeType: match[1],
    base64: match[2],
  };
}

function extractOutputText(data) {
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text)
    .join("\n");
}

function parseJsonOutput(text, provider = "AI") {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error(`${provider} returned empty output`);

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return JSON.parse(fenced[1].trim());

    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1));
    }
    throw new Error(`${provider} output was not valid JSON`);
  }
}
