# Honda CB350 RS 保養手冊

記錄每次進廠的里程、項目與費用，依原廠週期提醒下一次保養。手機優先，資料存在瀏覽器裡，可用同步代碼在手機和電腦之間共用。

## 功能

- 用一句中文記一筆保養，自動抓出日期、里程、費用與保養項目
- 依 CB350 週期計算下次更換／檢查的里程與日期
- 保養歷史依「進廠次」分組，同一天同里程的項目收在一張維修單裡
- 匯出 JSON 備份
- 雲端同步（需自行部署 `api/sync.js` 與 Redis）

## 文字解析

不需要網路或 AI，離線也能用。看得懂：

- 民國日期，`115/02/04` 或「民國115年2月4日」轉成 `2026-02-04`
- 西元日期 `2026/5/1`、`2026-05-01`、`2026年5月1日`，以及「今天」「昨天」
- 里程 `里程 12850`、`12,850 km`、`ODO：8600`
- 費用 `費用 950 元`、`NT$1,200`、`$980`；分項寫法會各自歸屬，不會重複計算
- 動作：更換／清潔／潤滑／調整／檢查

例句：

```
今天 里程 12850，換機油 10W-30、清潔潤滑鏈條、檢查煞車皮，費用 950 元
```

## 部署

### GitHub Pages

1. Settings → Pages
2. Source 選 `Deploy from a branch`，Branch 選 `main`，資料夾 `/root`
3. 入口是 `index.html`，會自動轉到 `app/`

雲端同步需要後端，GitHub Pages 上會改打 Vercel 的端點。

### Vercel

直接匯入 repo 即可，不需要 build。API 函式在 `api/`。

## 雲端同步設定

`api/sync.js` 需要一組 Redis。在 Vercel 專案的 Storage 建立資料庫後，確認環境變數存在：

```
KV_REST_API_URL
KV_REST_API_TOKEN
```

或（只有 TCP 的服務）：

```
REDIS_URL
```

兩者都有時會優先使用 REST，在 serverless 上比較穩定。**環境變數不會套用到既有的部署，設定完要 Redeploy。**

### 排查

```
/api/sync?diag=1
```

會回報目前使用哪種後端、環境變數有沒有設、連不連得上，並把底層錯誤翻成排查方向。不含 token 或保養資料。

### 注意

同步代碼等於密碼，知道的人就能讀寫你的紀錄。建議使用一長串隨機字元，不要用猜得到的名字。

## 本機測試

解析邏輯在 `app/parser.js`，純函式、無 DOM 依賴：

```
node --test test/parser.test.js
```

改動 regex 或關鍵字之後請先跑過測試。

## 檔案結構

```
index.html                  轉址到 app/
app/index.html              App 主頁（三支 js 的載入順序不可調換）
app/maintenance-items.js    保養項目與週期定義
app/parser.js               文字解析，純函式
app/app.js                  UI、狀態、雲端同步
app/styles.css              樣式
api/sync.js                 雲端同步 API（含 ?diag=1 排查端點）
test/parser.test.js         解析器測試
```
