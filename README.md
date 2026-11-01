# 🚌 香港巴士抽獎機 HK Bus Lottery

一個純靜態（無後端、無框架、無 build）的抽獎機網站：撳一掣，隨機抽一條香港巴士路線，抽到邊條就去搭邊條。
路線資料即時取自政府「資料一線通」（data.gov.hk）的九巴／龍運、城巴、嶼巴開放數據，離線時自動改用倉庫內的備用清單。

**Live Demo：`https://<你的帳號>.github.io/hk-bus-lottery/`**

---

## ✨ 功能

| 模式 | 玩法 |
|---|---|
| 🚌 抽巴士路線 | 老虎機式逐格滾動路線編號，定格後顯示公司、起點、終點 |
| 🎁 自訂名單抽獎 | 貼上名字（每行一個），滾動抽中獎者，可自動移出名單 |

- 公司篩選：全部／九巴／龍運／城巴／嶼巴
- 「唔抽重複」模式：抽過唔再中，抽完一輪自動重置
- 抽獎紀錄、中獎紀錄、名單都存在瀏覽器（localStorage），關掉都仲喺度
- 滾動音效 + 中獎音效（Web Audio 即時合成，無需音檔）
- 手機優先設計：大字、大按鈕、安全邊距、空格鍵快速再抽

---

## 🚀 部署到 GitHub Pages（3 分鐘）

### 1. 建立倉庫
在 GitHub 開一個新倉庫，例如 `hk-bus-lottery`（Public，唔使加 README／.gitignore）。

### 2. 上傳檔案
最簡單：喺倉庫頁面撳 **Add file → Upload files**，把整個資料夾拖入去（保留 `assets/`、`data/`、`scripts/`、`.github/` 結構），Commit。

或者用命令列：

```bash
cd hk-bus-lottery
git init && git add . && git commit -m "feat: 香港巴士抽獎機"
git branch -M main
git remote add origin https://github.com/<你的帳號>/hk-bus-lottery.git
git push -u origin main
```

### 3. 開啟 Pages
**Settings → Pages → Build and deployment**
- Source：`Deploy from a branch`
- Branch：`main` / `/ (root)` → Save

等 1–2 分鐘，就會見到網址 `https://<你的帳號>.github.io/hk-bus-lottery/`。

> 💡 倉庫名改成 `<帳號>.github.io` 就會變成主頁 `https://<帳號>.github.io/`。

---

## 🧪 本機預覽

```bash
cd hk-bus-lottery
python3 -m http.server 8000
# 開 http://localhost:8000
```

> ⚠️ 直接雙擊 `index.html`（`file://`）都用得，但會因為瀏覽器限制讀唔到 `data/routes.json`，只會用內置極簡清單。想用完整路線庫，請用上面嘅本機伺服器或 GitHub Pages。

---

## 🗂 資料來源與自動更新

- 九巴／龍運：`https://data.etabus.gov.hk/v1/transport/kmb/route/`
- 城巴：`https://rt.data.gov.hk/v2/transport/citybus/route/CTB`
- 嶼巴：`https://rt.data.gov.hk/v2/transport/nlb/route.php?action=list`

網站開啟時會**即時**向以上 API 抓最新路線（可在「設定」關閉）；
同時 `.github/workflows/update-routes.yml` 每日香港時間 11:23 自動跑一次，把結果寫入 `data/routes.json` 並提交，離線／API 失敗時就靠佢。

任何一家 API 抓失敗都只會靜默降級，唔會影響網站運作。

---

## 🎨 改做你自己嘅版本

| 想改咩 | 改邊度 |
|---|---|
| 頁尾 GitHub 連結 | `index.html` 裡 `#gh-link` 嘅 `href` |
| 標題、副標題 | `index.html` 嘅 `<h1>` / `.sub` |
| 配色（霓虹青／桃紅／金） | `assets/style.css` 最頂 `:root` 嘅變數 |
| 滾動時間、音效 | `assets/app.js` 嘅 `roll()`、`fanfare()` |
| 內置保底路線清單 | `scripts/update_routes.py` 嘅 `FALLBACK` |

---

## ❓ 常見問題

**Q：點解抽到嘅路線冇起點終點？**
A：代表而家用緊離線備用清單（只有編號）。連到網或者 GitHub Actions 跑過一次之後就會有起訖點。

**Q：想淨係抽九巴？**
A：撳「九巴」個 chip 再抽。「唔抽重複」係按目前篩選獨立計算。

**Q：可唔可以抽小巴／港鐵？**
A：運輸署 `Routes and Fares` 開放資料都有專線小巴（GMB）同港鐵巴士，改 `scripts/update_routes.py` 加一個來源即可。

---

## 📄 授權

程式碼 MIT License。路線資料版權屬運輸署及各巴士公司，依 data.gov.hk 開放數據條款使用；本網站只作抽籤娛樂，實際班次、路線及收費以官方公佈為準。
