// ============================================
// backup.js：匯出／匯入備份
// 日記只存在手機裡，換手機或清掉 Safari 資料就會不見，所以要偶爾備份
// 備份檔不包含 API 金鑰（萬一檔案外流，金鑰也不會跟著外流）
// ============================================

const 備份版本 = 1;

// 把所有資料打包成一個物件
function collectBackup() {
  const settings = loadSettings();
  return {
    app: "theo-diary",
    version: 備份版本,
    exportedAt: new Date().toISOString(),
    messages: loadMessages(),
    goals: loadGoals(),
    reviews: loadReviews(),
    settings: { personality: settings.personality }, // 不放金鑰
  };
}

// 匯出：iPhone 上用分享選單（可以存到「檔案」或 AirDrop），不支援的話就直接下載
async function exportBackup() {
  const data = collectBackup();
  const fileName = "theo-diary-backup-" + todayKey() + ".json";
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const file = new File([blob], fileName, { type: "application/json" });

  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Theo 日記備份" });
    } else {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.click();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    }
  } catch (e) {
    if (e.name === "AbortError") return; // 自己按了取消，不算失敗
    alert("匯出失敗：" + e.message);
    return;
  }

  saveSettings({ lastBackup: new Date().toISOString() });
  showBackupStatus();
}

// 匯入：合併進目前的資料（不會刪掉現有的，重複的跳過）
async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (e) {
    alert("這個檔案打不開，確定是 Theo 日記的備份檔嗎？");
    return;
  }
  if (!data || data.app !== "theo-diary" || !Array.isArray(data.messages)) {
    alert("這不是 Theo 日記的備份檔。");
    return;
  }

  // 用 id（回顧用類型＋開始日期）判斷是不是同一筆
  function merge(current, incoming, keyOf) {
    const seen = new Set(current.map(keyOf));
    const added = (incoming || []).filter(function (item) { return item && !seen.has(keyOf(item)); });
    return { all: current.concat(added), count: added.length };
  }
  const byId = function (item) { return item.id; };

  const messages = merge(loadMessages(), data.messages, byId);
  const goals = merge(loadGoals(), data.goals, byId);
  const reviews = merge(loadReviews(), data.reviews, function (r) { return r.kind + r.start; });

  const ok = confirm(
    "要匯入這個備份嗎？（" + (data.exportedAt || "").slice(0, 10) + "）\n\n" +
    "會新增：" + messages.count + " 則訊息、" + goals.count + " 個目標、" + reviews.count + " 份回顧\n" +
    "現有的資料都會保留。"
  );
  if (!ok) return;

  messages.all.sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  saveMessages(messages.all);
  saveGoals(goals.all);
  try {
    localStorage.setItem(回顧存放名稱, JSON.stringify(reviews.all)); // reviews.js
  } catch (e) {
    alert("回顧存檔失敗。");
  }

  alert("匯入完成！");
  showMessages();
}

// 設定頁顯示「上次備份：3 天前」
function showBackupStatus() {
  const status = document.getElementById("backup-status");
  const last = loadSettings().lastBackup;
  if (!last) {
    status.textContent = "還沒有備份過";
    status.className = "status error";
    return;
  }
  const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  status.textContent = "上次備份：" + (days === 0 ? "今天" : days + " 天前");
  status.className = "status" + (days >= 7 ? " error" : " ok");
}

document.getElementById("export-backup").addEventListener("click", exportBackup);
document.getElementById("import-backup").addEventListener("click", function () {
  document.getElementById("import-file").click();
});
document.getElementById("import-file").addEventListener("change", function (event) {
  const file = event.target.files[0];
  event.target.value = ""; // 讓同一個檔案可以再選一次
  if (file) importBackup(file);
});
