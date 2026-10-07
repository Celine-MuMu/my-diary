// ============================================
// app.js：主要邏輯
// ============================================

// 先把畫面上會用到的東西找出來
const chat = document.getElementById("chat");
const input = document.getElementById("input");
const sendButton = document.getElementById("send-button");
const dateLabel = document.getElementById("date-label");
const prevDayButton = document.getElementById("prev-day");
const nextDayButton = document.getElementById("next-day");
const bottom = document.querySelector(".bottom");
const backToTodayButton = document.getElementById("back-to-today");

// ---------- 日期 ----------
// 一天在凌晨 4 點換日：半夜 1 點寫的，還算前一天
const 換日時間 = 4;

// 把日期寫成 "2026-10-07" 這種格式
function formatDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

// 某個時間「屬於哪一天」：先往回推 4 小時，再看是幾號
function dayKeyOf(time) {
  const date = new Date(time);
  date.setHours(date.getHours() - 換日時間);
  return formatDayKey(date);
}

// 今天是哪一天
function todayKey() {
  return dayKeyOf(new Date());
}

// 從某一天往前或往後移幾天（days 是 -1 就是前一天）
function shiftDay(dayKey, days) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return formatDayKey(new Date(y, m - 1, d + days));
}

// 目前正在看哪一天（一打開是今天）
let currentDay = todayKey();

// 把時間變成「09:12」這種格式
function formatTime(isoTime) {
  const date = new Date(isoTime);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return hh + ":" + mm;
}

// 做出一個聊天泡泡
function createBubble(message) {
  const box = document.createElement("div");
  box.className = "message " + message.role;

  if (message.role === "theo") {
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = "Theo";
    box.appendChild(name);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = message.text; // 用 textContent，避免內容被當成程式碼執行
  box.appendChild(bubble);

  const time = document.createElement("div");
  time.className = "time";
  time.textContent = formatTime(message.time);
  box.appendChild(time);

  return box;
}

// 更新上方的日期，例如「10/7（二）昨天」
function showDateLabel() {
  const [y, m, d] = currentDay.split("-").map(Number);
  const weekday = "日一二三四五六"[new Date(y, m - 1, d).getDay()];

  let hint = "";
  if (currentDay === todayKey()) hint = "今天";
  else if (currentDay === shiftDay(todayKey(), -1)) hint = "昨天";

  dateLabel.innerHTML = "";
  dateLabel.append(m + "/" + d + "（" + weekday + "）");
  const small = document.createElement("small");
  small.textContent = hint;
  dateLabel.appendChild(small);
}

// 把「目前這一天」的訊息畫到聊天區
function showMessages() {
  const isToday = currentDay === todayKey();
  const messages = loadMessages().filter(function (message) {
    return dayKeyOf(message.time) === currentDay;
  });

  showDateLabel();
  nextDayButton.disabled = isToday;          // 今天就不能再往後
  bottom.classList.toggle("read-only", !isToday); // 以前的日子只能看
  chat.innerHTML = "";

  if (messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = isToday ? "今天還沒寫東西，跟 Theo 說說吧" : "這天沒有寫日記";
    chat.appendChild(empty);
    return;
  }

  for (const message of messages) {
    chat.appendChild(createBubble(message));
  }
  scrollToBottom();
}

// 捲到最下面，看到最新的訊息
function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight;
}

// 送出：存起來、清空輸入框、重新畫面
function send() {
  const text = input.value.trim();
  if (!text) return;

  // 如果 App 一直開著、過了凌晨 4 點，先跳到新的一天
  currentDay = todayKey();
  addMessage("me", text, "entry");
  input.value = "";
  resizeInput();
  showMessages();
}

// 輸入框隨著字數自動變高
function resizeInput() {
  input.style.height = "auto";
  input.style.height = input.scrollHeight + "px";
}

// ---------- 綁定按鈕 ----------
sendButton.addEventListener("click", send);
input.addEventListener("input", resizeInput);

// 電腦上可以按 ⌘+Enter（或 Ctrl+Enter）送出；手機上按 Enter 是換行
input.addEventListener("keydown", function (event) {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    send();
  }
});

prevDayButton.addEventListener("click", function () {
  currentDay = shiftDay(currentDay, -1);
  showMessages();
});

nextDayButton.addEventListener("click", function () {
  currentDay = shiftDay(currentDay, 1);
  showMessages();
});

backToTodayButton.addEventListener("click", function () {
  currentDay = todayKey();
  showMessages();
});

// 從背景切回 App 時，如果已經換日了，就跳到新的一天
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible" && currentDay !== todayKey()) {
    currentDay = todayKey();
    showMessages();
  }
});

// ---------- 打開 App 時 ----------
showMessages();
