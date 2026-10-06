# DWG BOM → CSV

純前端的 DWG 料表批次轉換器，可部署至 GitHub Pages。檔案透過 WebAssembly 在瀏覽器本機解析，不會上傳伺服器。

## 功能

- 一次選擇或拖放多個 DWG
- 自動尋找同列的 `ITEM`、`QTY`、`CATALOG NUMBER` 表頭
- 依圖面座標配對資料列
- 單獨下載 CSV，或將全部結果打包成 ZIP
- 可選擇是否輸出 CSV 欄位名稱

## 本機執行

```bash
npm install
npm run dev
```

正式建置：

```bash
npm run build
```

建置結果位於 `dist/`。

## 發佈至 GitHub Pages

1. 將此資料夾推送至 GitHub repository。
2. Repository 的 **Settings → Pages → Build and deployment** 選擇 **GitHub Actions**。
3. 推送至 `main` 後，`.github/workflows/deploy-pages.yml` 會自動建置並發佈。

## 授權與第三方元件

DWG 解析使用 [@mlightcad/libredwg-web](https://github.com/mlightcad/libredwg-web)，授權為 GPL-3.0。ZIP 下載使用 JSZip，授權為 MIT。
