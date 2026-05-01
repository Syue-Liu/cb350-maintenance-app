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
- 如果照片或文字不足以確定保養項目，records 回傳空陣列。
- 機油週期是 4000 km；大保養是 20000 km，但這裡只負責分類本次紀錄。
`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server is missing OPENAI_API_KEY" });
  }

  try {
    const { text = "", imageDataUrl = "", currentMileage = "", currentDate = "", maintenanceItems = [] } = req.body || {};
    if (!text && !imageDataUrl) {
      return res.status(400).json({ error: "Missing text or image" });
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
        Authorization: `Bearer ${apiKey}`,
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
    const parsed = JSON.parse(outputText);
    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Analyze failed" });
  }
}

function extractOutputText(data) {
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text)
    .join("\n");
}
