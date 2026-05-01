# Honda CB350 RS 保養助理

這是一個可以放在 GitHub Pages 上使用的 Honda CB350 RS 保養記錄 App。

功能：

- 貼上中文保養描述，自動分類成保養紀錄
- 可接 ChatGPT 端點分析文字與保養照片
- 抓取日期、里程、費用、保養項目
- 依 CB350 保養週期提醒下次更換/檢查
- 顯示下次小保養與每 20,000 km 大保養里程
- 資料儲存在手機或電腦瀏覽器本機

維修單照片範例可辨識：

- 民國日期，例如 `115/02/04` 會轉成 `2026-02-04`
- 目前里程
- 大保養、鏈條清潔、火星塞、煞車油、煞車皮、電瓶等品項

## GitHub Pages 設定

1. 把這個專案推到 GitHub repository。
2. 到 repository 的 Settings -> Pages。
3. Source 選 `Deploy from a branch`。
4. Branch 選 `main`，資料夾選 `/root`。
5. 儲存後等待 GitHub Pages 產生網址。

App 入口是 `index.html`，會自動轉到 `app/`。

## ChatGPT 圖片/文字分析

GitHub Pages 不能安全保存 AI API Key，所以圖片分析需要一個後端端點。

這個 repo 已包含 Vercel API：

```text
api/analyze-maintenance.js
```

部署到 Vercel 後，在 Vercel 專案設定新增環境變數。建議優先用 Gemini：

```text
GEMINI_API_KEY=你的 Gemini API Key
GEMINI_MODEL=gemini-2.5-flash
```

也可以使用 OpenAI：

```text
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-5
```

如果同時設定 Gemini 和 OpenAI，後端會優先使用 Gemini。

如果 App 也是從 Vercel 網址開啟，會自動使用：

```text
/api/analyze-maintenance
```

如果 App 繼續用 GitHub Pages，請在 App 的「ChatGPT 分析設定」貼上 Vercel 端點：

```text
https://你的-vercel-專案.vercel.app/api/analyze-maintenance
```
