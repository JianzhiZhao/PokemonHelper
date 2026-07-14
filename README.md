# PokemonHelper

PokemonHelper 是一個用來查詢 Pokemon 對戰防守關係與屬性防守組合的本機網頁工具。專案包含 React 前端、Express API 伺服器，以及以 SQLite 檔案快取的 Pokemon 資料。

## 主要內容

- Pokemon 搜尋與防守鏈查詢
- 屬性防守鏈與互補搭檔分析
- 防守盲點檢查
- Pokemon 資料快取更新
- 本機 SQLite 快取資料庫
- Windows 一鍵啟動與關閉工具

## 環境需求

- Node.js 18 或更新版本
- npm

## 快速安裝與啟動

第一次使用時可以直接執行：

```bat
start-server.bat
```

這個工具會：

1. 切換到專案資料夾
2. 如果尚未安裝 `node_modules`，自動執行 `npm install`
3. 開啟新的命令提示字元視窗
4. 啟動前端與 API 伺服器

啟動後使用：

- 前端頁面：http://127.0.0.1:5173
- API 伺服器：http://127.0.0.1:5174

## 關閉伺服器

要停止由 `start-server.bat` 開啟的服務，執行：

```bat
stop-server.bat
```

這個工具會：

- 關閉標題為 `PokemonHelper Server` 的命令提示字元視窗
- 停止目前專案路徑底下相關的 `node.exe` 與 `esbuild.exe` 程序

## 手動啟動方式

如果不使用批次檔，也可以手動執行：

```bash
npm install
npm run dev
```

`npm run dev` 會同時啟動：

- `npm run dev:server`：Express API 伺服器
- `npm run dev:client`：Vite React 前端

## 常用指令

```bash
npm run dev
npm run build
npm run test
npm run typecheck
```

- `npm run dev`：啟動開發伺服器
- `npm run build`：建立正式版輸出
- `npm run test`：執行測試
- `npm run typecheck`：執行 TypeScript 型別檢查

## 專案結構

```text
PokemonHelper/
├─ src/                 React 前端
├─ server/              Express API、資料快取與分析邏輯
├─ data/                本機資料庫位置
├─ start-server.bat     Windows 啟動工具
├─ stop-server.bat      Windows 關閉工具
├─ package.json         npm 指令與依賴
└─ vite.config.ts       Vite 設定
```

`data/pokemon-cache.sqlite` 是本機快取資料庫，已由 `.gitignore` 排除，不會被提交到 Git。
