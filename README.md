# Web Browser

一個以 Electron 製作的桌面瀏覽器原型，提供網址列瀏覽、搜尋、首頁釘選、書籤、歷史紀錄、下載管理、側邊欄與個人中心等功能。

## 環境需求

- Node.js
- npm
- Windows、macOS 或 Linux 桌面環境

## 安裝與啟動

```bash
npm install
npm start
```

`npm start` 會執行 `electron .`，並載入 `main.js` 建立主視窗。

## 主要功能

### 瀏覽與搜尋

- 可在網址列輸入 URL 或搜尋文字。
- 未包含通訊協定的網址會自動補上 `http://` 或 `https://`。
- 支援預設搜尋引擎設定：Google、Bing、DuckDuckGo。
- 首頁搜尋框會保存最近搜尋紀錄。
- 可在設定頁新增常用網站網域，搜尋時可快速套用 `site:` 限定搜尋。

### 首頁

首頁位於 `src/home.html`，主要功能包含：

- 搜尋框與搜尋引擎切換。
- 最近搜尋建議。
- 釘選搜尋詞。
- 釘選網址。
- 可透過設定開啟「釘選書籤顯示」，在首頁釘選網址區顯示「書籤」按鈕，按下後會開啟個人中心的書籤頁。

### 側邊欄

側邊欄包含多種模式：

- 分頁：顯示目前開啟的分頁，可切換、關閉、釘選分頁。
- 書籤：顯示相關書籤、書籤、釘選網址、釘選頁面。
- 歷史：顯示瀏覽歷史，外觀與側邊欄書籤卡片一致。
- 複製暫存：保存本次執行期間複製過的文字、URL、圖片或影片連結。

側邊欄支援：

- 左右位置切換。
- 寬度拖曳調整。
- 分頁縮圖/列表模式切換。
- 工具頁圖示縮圖，例如首頁、設定、個人中心與下載覆蓋層。

### 書籤與釘選

專案中有三種不同的收藏資料：

- 書籤：由網址列書籤按鈕加入，儲存在 `saved-bookmarks`。
- 釘選網址：首頁新增的釘選網址，儲存在 `pinned-urls`。
- 釘選頁面：側邊欄分頁釘選，儲存在 `pinned-tabs`。

網址列的書籤按鈕只會影響 `saved-bookmarks`，不會讓該網址成為側邊欄釘選分頁。

### 個人中心

個人中心位於 `personal-center.html`，包含：

- 歷史紀錄頁。
- 書籤頁。

歷史紀錄頁支援：

- 方塊/清單顯示切換。
- 依時間、標題、瀏覽次數排序。
- 顯示頁面縮圖、favicon、標題、網址與時間。
- 刪除單筆歷史紀錄。

書籤頁支援：

- 方塊/清單顯示切換。
- 分隔顯示「書籤」、「釘選網址」、「釘選頁面」。
- 每張卡片顯示 favicon、標題與網址。
- 刪除對應類型的項目。

### 下載管理

- 下載進度會顯示在下載覆蓋層中。
- 可設定下載前是否詢問儲存位置。
- 若未詢問位置，會使用系統預設下載資料夾。

### 設定頁

設定頁位於 `src/settings.html`，可調整：

- 預設搜尋引擎。
- 網站搜尋清單。
- 側邊欄顯示位置。
- 首頁網址。
- 首頁是否顯示釘選書籤按鈕。

### 右鍵選單與其他功能

- 支援在網頁中複製、貼上、搜尋選取文字。
- 支援將連結用新分頁開啟。
- 支援無痕模式切換。
- 支援上一頁/下一頁預覽。
- 支援階層式位址欄顯示。

## 資料儲存

主要前端資料使用 `localStorage`：

- `saved-bookmarks`：網址列加入的書籤。
- `pinned-tabs`：側邊欄釘選分頁。
- `pinned-urls`：首頁釘選網址。
- `pinned-searches`：首頁釘選搜尋詞。
- `recent-searches`：最近搜尋。
- `global-history`：瀏覽歷史快取。
- `search-engine`：預設搜尋引擎。
- `search-sites`：網站搜尋清單。
- `sidebar-position`：側邊欄位置。
- `sidebar-width`：側邊欄寬度。
- `startup-home-url`：首頁網址設定。
- `pinned-bookmarks-display`：首頁是否顯示書籤按鈕。
- `incognito-mode`：無痕模式狀態。

主程序也會處理：

- 歷史縮圖：儲存在 Electron `userData/history-thumbnails`。
- 歷史追加紀錄：寫入下載資料夾中的 `ai-mini-browser-history.ndjson`。
- 下載事件與下載位置選擇。

## 專案結構

```text
.
├── index.html              # 主瀏覽器 UI
├── main.js                 # Electron 主程序
├── renderer.js             # 主畫面互動、分頁、側邊欄、歷史與書籤邏輯
├── personal-center.html    # 個人中心頁面
├── preload.js              # 主 webview preload，目前為空
├── package.json
└── src
    ├── home.html           # 首頁
    ├── home.js             # 首頁搜尋、釘選搜尋詞與釘選網址
    ├── preload-home.js     # webview 與宿主溝通 API
    ├── settings.html       # 設定頁
    ├── settings.js         # 設定頁邏輯
    └── browser-icon.png    # 應用程式圖示
```

## 開發備註

- 目前沒有正式測試腳本，`npm test` 只會輸出預設錯誤訊息。
- 修改 JavaScript 後可用 `node --check <file>` 做語法檢查。
- 專案使用大量中文 UI 文字，編輯檔案時請使用 UTF-8。
- 不要混用書籤與釘選分頁資料：`saved-bookmarks` 與 `pinned-tabs` 是不同功能。
