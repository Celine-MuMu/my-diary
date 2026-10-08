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

  // 舊版只有一個 apiKey：gsk_ 開頭的是 Groq，其他的是 Gemini
  if (saved.apiKey) {
    if (saved.apiKey.startsWith("gsk_")) saved.groqKey = saved.groqKey || saved.apiKey;
    else saved.geminiKey = saved.geminiKey || saved.apiKey;
  }

  return {
    personality: saved.personality || 預設個性, // Theo 的個性
    groqKey: saved.groqKey || "",               // Groq API 金鑰（主力）
    geminiKey: saved.geminiKey || "",           // Gemini API 金鑰（備援）
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

// 修改某一則訊息，例如按了「對」之後記下答案
function updateMessage(id, changes) {
  const messages = loadMessages();
  const message = messages.find(function (item) { return item.id === id; });
  if (!message) return;
  Object.assign(message, changes);
  saveMessages(messages);
}

// ---------- 目標 ----------
const 目標存放名稱 = "theo-diary-goals";

// 一個目標長這樣：
// { id, what: "去運動", date: "2026-10-14", time: "下午",
//   status: "planned" 還沒做／"done" 完成／"missed" 沒做到,
//   remindedBefore: 前一天提醒過了沒, remindedToday: 當天提醒過了沒, followedUp: 事後問過了沒 }
function loadGoals() {
  try {
    return JSON.parse(localStorage.getItem(目標存放名稱)) || [];
  } catch (e) {
    return [];
  }
}

function saveGoals(goals) {
  try {
    localStorage.setItem(目標存放名稱, JSON.stringify(goals));
  } catch (e) {
    alert("目標存檔失敗。");
  }
}

function addGoal(what, date, time) {
  const goal = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    what: what,
    date: date,
    time: time || "",
    status: "planned",
    remindedBefore: false,
    remindedToday: false,
    followedUp: false,
  };
  const goals = loadGoals();
  goals.push(goal);
  saveGoals(goals);
  return goal;
}

function updateGoal(id, changes) {
  const goals = loadGoals();
  const goal = goals.find(function (item) { return item.id === id; });
  if (!goal) return;
  Object.assign(goal, changes);
  saveGoals(goals);
}

function removeGoal(id) {
  saveGoals(loadGoals().filter(function (goal) { return goal.id !== id; }));
}
