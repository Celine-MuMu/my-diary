// ============================================
// storage.js：存取日記資料
// 資料存在手機瀏覽器的 localStorage 裡，不會上傳到任何地方
// ============================================

const 訊息存放名稱 = "theo-diary-messages";

// 讀出所有訊息（依時間排序）
function loadMessages() {
  try {
    return JSON.parse(localStorage.getItem(訊息存放名稱)) || [];
  } catch (e) {
    // 讀不到（例如無痕模式）就當作還沒有資料
    return [];
  }
}

// 把所有訊息存回去
function saveMessages(messages) {
  try {
    localStorage.setItem(訊息存放名稱, JSON.stringify(messages));
    return true;
  } catch (e) {
    alert("存檔失敗，可能是手機空間不夠或在無痕模式。");
    return false;
  }
}

// 新增一則訊息，回傳新增的那一則
// role：誰說的（"me" 我／"theo" Theo）
// type：類型（"entry" 日記／"reply" 回應／"reminder" 提醒／"summary" 總結）
// extra：其他資料，例如 { time: 指定時間 }、{ summary: 總結內容 }
function addMessage(role, text, type, extra) {
  const message = Object.assign({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    time: new Date().toISOString(),
    role: role,
    type: type,
    text: text,
  }, extra);
  const messages = loadMessages();
  messages.push(message);
  // 依時間排序（補做的總結可能會插在以前的日子）
  messages.sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  saveMessages(messages);
  return message;
}

// 刪掉符合條件的訊息，例如重新做總結時，刪掉舊的總結
function removeMessages(shouldRemove) {
  saveMessages(loadMessages().filter(function (message) {
    return !shouldRemove(message);
  }));
}

// ---------- 設定 ----------
const 設定存放名稱 = "theo-diary-settings";

// 讀出設定（沒有的話用預設值）
function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(設定存放名稱)) || {};
  } catch (e) {}
  return {
    personality: saved.personality || 預設個性, // Theo 的個性
    apiKey: saved.apiKey || "",                 // Groq API 金鑰
  };
}

// 更新部分設定，例如 saveSettings({ personality: "溫柔" })
function saveSettings(changes) {
  const settings = Object.assign(loadSettings(), changes);
  try {
    localStorage.setItem(設定存放名稱, JSON.stringify(settings));
  } catch (e) {
    alert("設定存檔失敗。");
  }
}
