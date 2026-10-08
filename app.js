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
const micButton = document.getElementById("mic-button");
const askTheoButton = document.getElementById("ask-theo");
const endDayButton = document.getElementById("end-day");

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
  if (message.type === "summary") return createSummaryCard(message);
  if (message.type === "reminder") return createReminderCard(message);           // goals.js
  if (message.type === "goal-confirm") return createGoalConfirmCard(message);    // goals.js
  if (message.type === "goal-ask") return createGoalAskCard(message);            // goals.js
  if (message.type === "goal-followup") return createGoalFollowupCard(message);  // goals.js

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

// 做出一張總結卡片
function createSummaryCard(message) {
  const summary = message.summary;
  const card = document.createElement("div");
  card.className = "summary-card";

  const title = document.createElement("div");
  title.className = "summary-title";
  title.innerHTML = '<svg class="icon"><use href="#icon-moon"/></svg>';
  title.append(formatDayTitle(dayKeyOf(message.time)) + "的總結");
  card.appendChild(title);

  // 一個小標題 + 一串項目
  function addSection(heading, items) {
    if (!items || items.length === 0) return;
    const h = document.createElement("h3");
    h.textContent = heading;
    const list = document.createElement("ul");
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    }
    card.append(h, list);
  }
  addSection("今天做了什麼", summary.did);
  addSection("今天的亮點", summary.highlights);

  if (summary.comment) {
    const comment = document.createElement("p");
    comment.className = "summary-comment";
    comment.textContent = summary.comment + " —— Theo";
    card.appendChild(comment);
  }
  return card;
}

// 把 "2026-10-07" 變成「10/7」
function formatDayTitle(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return m + "/" + d + " ";
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

  // 一般的聊天泡泡（不是卡片）
  function isBubble(message) {
    return message && (message.type === "entry" || message.type === "reply");
  }
  // 同一個人連續傳的：名字只在第一則顯示，時間只在最後一則顯示（同一分鐘內）
  messages.forEach(function (message, i) {
    const el = createBubble(message);
    const prev = messages[i - 1];
    const next = messages[i + 1];
    if (isBubble(message) && isBubble(prev) && prev.role === message.role) {
      el.classList.add("continued");
      el.querySelector(".name")?.remove();
    }
    if (isBubble(message) && isBubble(next) && next.role === message.role &&
        formatTime(next.time) === formatTime(message.time)) {
      el.querySelector(".time")?.remove();
    }
    chat.appendChild(el);
  });
  scrollToBottom();
}

// 捲到最下面，看到最新的訊息
function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight;
}

// 送出：存起來、清空輸入框、重新畫面
function send() {
  stopListening(); // 還在聽的話先停下來
  const text = input.value.trim();
  if (!text) return;

  // 如果 App 一直開著、過了凌晨 4 點，先跳到新的一天
  currentDay = todayKey();
  const message = addMessage("me", text, "entry");
  input.value = "";
  resizeInput();
  showMessages();
  detectGoals(message); // 在背景找有沒有提到之後想做的事（goals.js）
}

// 輸入框隨著字數自動變高
function resizeInput() {
  input.style.height = "auto";
  input.style.height = input.scrollHeight + "px";
}

// ---------- 語音輸入 ----------
// 用瀏覽器內建的語音辨識，把說的話變成文字放進輸入框
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;    // 正在聽的時候才會有東西
let 開始說話前的文字 = "";  // 讓語音接在原本打的字後面

function startListening() {
  if (!SpeechRecognition) {
    alert("這個瀏覽器不支援語音輸入，可以改用鍵盤上的麥克風喔。");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "zh-TW";          // 辨識繁體中文
  recognition.interimResults = true;   // 邊說邊顯示
  recognition.continuous = true;       // 停頓一下也繼續聽

  開始說話前的文字 = input.value;

  // 每次辨識出新的字，就更新輸入框
  recognition.onresult = function (event) {
    let spoken = "";
    for (const result of event.results) {
      spoken += result[0].transcript;
    }
    input.value = 開始說話前的文字 + spoken;
    resizeInput();
  };

  recognition.onerror = function (event) {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      alert("需要允許使用麥克風。可以到 iPhone 的「設定 → Safari → 麥克風」打開。");
    }
  };

  // 停止聆聽時（自己按停，或太久沒說話），按鈕變回原樣
  recognition.onend = function () {
    recognition = null;
    micButton.classList.remove("listening");
    micButton.setAttribute("aria-label", "語音輸入");
  };

  recognition.start();
  micButton.classList.add("listening");
  micButton.setAttribute("aria-label", "停止語音輸入");
}

function stopListening() {
  if (recognition) recognition.stop();
}

// 按一下開始聽，再按一下停止
micButton.addEventListener("click", function () {
  if (recognition) stopListening();
  else startListening();
});

// ---------- 聽聽 Theo 的想法 ----------
// 把某一天的內容整理成文字，例如「09:12 我：起床好累」
function dayAsText(dayKey) {
  return loadMessages()
    .filter(function (message) { return dayKeyOf(message.time) === dayKey; })
    .map(function (message) {
      const who = message.role === "me" ? "我" : "Theo";
      return formatTime(message.time) + " " + who + "：" + message.text;
    })
    .join("\n");
}

// 在聊天區最下面顯示「Theo 正在思考……」
function showTyping(text) {
  const typing = document.createElement("div");
  typing.className = "message theo";
  typing.id = "typing";
  typing.innerHTML = '<div class="name">Theo</div><div class="bubble typing"></div>';
  typing.querySelector(".bubble").textContent = text || "正在思考……";
  chat.appendChild(typing);
  scrollToBottom();
}

async function askTheo() {
  currentDay = todayKey();
  const diary = dayAsText(todayKey());
  if (!diary) {
    alert("今天還沒寫東西，先跟 Theo 說點什麼吧。");
    return;
  }

  askTheoButton.disabled = true;
  showMessages();
  showTyping();

  const settings = loadSettings();
  const request =
    "現在時間 " + formatTime(new Date()) + "。\n" +
    "以下是對方今天到目前為止的日記，也包含你之前的回應：\n\n" +
    diary + "\n\n" +
    "請以 Theo 的身分回應。重點放在你上次回應之後對方新寫的內容，但可以連結今天稍早的事。\n" +
    "像傳訊息一樣，分成 1 到 3 則短訊息，每則之間空一行。";

  try {
    const reply = await askAI(buildTheoPrompt(settings.personality), request);
    await addTheoReplies(reply);
  } catch (e) {
    alert(e.message);
  }

  askTheoButton.disabled = false;
  showMessages();
}

// 把 Theo 的回覆拆成好幾則（用空行分開），一則一則跳出來
async function addTheoReplies(reply) {
  const parts = reply.split(/\n\s*\n/).map(function (part) { return part.trim(); }).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      // 中間停頓一下，像朋友在打下一則；字越多停越久，但最多 1.8 秒
      showMessages();
      showTyping("……");
      await new Promise(function (resolve) {
        setTimeout(resolve, Math.min(600 + parts[i].length * 30, 1800));
      });
    }
    addMessage("theo", parts[i], "reply");
  }
  showMessages();
}

askTheoButton.addEventListener("click", askTheo);

// ---------- 每日總結 ----------
// 某一天有沒有自己寫的日記
function hasEntries(dayKey) {
  return loadMessages().some(function (message) {
    return message.role === "me" && dayKeyOf(message.time) === dayKey;
  });
}

// 某一天有沒有做過總結
function hasSummary(dayKey) {
  return loadMessages().some(function (message) {
    return message.type === "summary" && dayKeyOf(message.time) === dayKey;
  });
}

// 請 Theo 整理某一天，存成一張總結卡片
async function summarizeDay(dayKey) {
  const diary = dayAsText(dayKey);
  const settings = loadSettings();
  const request =
    "以下是對方 " + dayKey + " 一整天的日記，也包含你當天的回應：\n\n" +
    diary + "\n\n" +
    "請幫對方整理這一天，用 JSON 回答，格式如下：\n" +
    '{ "did": ["……"], "highlights": ["……"], "comment": "……" }\n' +
    "- did：這天做了什麼，依時間順序，每項一句短短的話，只寫對方做的事\n" +
    "- highlights：這天的亮點，1 到 3 項，用你的語氣真心稱讚對方\n" +
    "- comment：一句你對這天的總評，像朋友說的話";

  const answer = await askAI(buildTheoPrompt(settings.personality), request, { json: true });

  let summary;
  try {
    summary = JSON.parse(answer);
  } catch (e) {
    throw new Error("Theo 整理得亂七八糟，再按一次試試。");
  }

  // 總結放在這一天的最後：今天就用現在時間；以前的日子用最後一則之後的時間
  const dayMessages = loadMessages().filter(function (message) {
    return dayKeyOf(message.time) === dayKey && message.type !== "summary";
  });
  let time = new Date().toISOString();
  if (dayKey !== todayKey()) {
    const last = new Date(dayMessages[dayMessages.length - 1].time);
    time = new Date(last.getTime() + 1000).toISOString();
  }

  // 重新整理的話，先刪掉舊的總結
  removeMessages(function (message) {
    return message.type === "summary" && dayKeyOf(message.time) === dayKey;
  });

  const text =
    "【總結】做了什麼：" + (summary.did || []).join("；") +
    "。亮點：" + (summary.highlights || []).join("；") +
    "。" + (summary.comment || "");
  addMessage("theo", text, "summary", { time: time, summary: summary });
}

// 按「結束今天」
async function endDay() {
  currentDay = todayKey();
  if (!hasEntries(currentDay)) {
    alert("今天還沒寫東西，沒有東西可以整理喔。");
    return;
  }
  if (hasSummary(currentDay) && !confirm("今天已經整理過了，要重新整理嗎？")) {
    return;
  }

  endDayButton.disabled = true;
  askTheoButton.disabled = true;
  showMessages();
  showTyping("正在整理今天……");

  try {
    await summarizeDay(currentDay);
  } catch (e) {
    alert(e.message);
  }

  endDayButton.disabled = false;
  askTheoButton.disabled = false;
  showMessages();
}

endDayButton.addEventListener("click", endDay);

// 打開 App 時：昨天有寫日記、但忘了總結，就自動補做
async function autoSummarizeYesterday() {
  const yesterday = shiftDay(todayKey(), -1);
  if (!hasEntries(yesterday) || hasSummary(yesterday)) return;
  const settings = loadSettings();
  if (!settings.groqKey && !settings.geminiKey) return;

  try {
    await summarizeDay(yesterday);
    showNotice("昨天忘了按「結束今天」，我幫你整理好了", "看看", function () {
      currentDay = yesterday;
      showMessages();
    });
  } catch (e) {
    // 失敗就算了，下次打開再試
  }
}

// 在聊天區最上面顯示一則小通知（不會存起來）
function showNotice(text, buttonText, onClick) {
  if (currentDay !== todayKey()) return;
  const notice = document.createElement("div");
  notice.className = "reminder";
  notice.innerHTML = '<svg class="icon"><use href="#icon-moon"/></svg><div></div>';
  notice.querySelector("div").textContent = "Theo：" + text + " ";
  const button = document.createElement("button");
  button.className = "link-button";
  button.textContent = buttonText;
  button.addEventListener("click", onClick);
  notice.querySelector("div").appendChild(button);
  chat.prepend(notice);
}

// ---------- 設定頁 ----------
const settingsPage = document.getElementById("settings-page");
const personalityOptions = document.getElementById("personality-options");
const saveKeyButton = document.getElementById("save-key");

// 每個 AI 的金鑰輸入框和狀態文字
const 金鑰欄位 = [
  { ai: "Groq", 設定: "groqKey", input: document.getElementById("groq-key-input"), status: document.getElementById("groq-status") },
  { ai: "Gemini", 設定: "geminiKey", input: document.getElementById("gemini-key-input"), status: document.getElementById("gemini-status") },
];

function showKeyStatus(field, text, kind) {
  field.status.textContent = text;
  field.status.className = "status" + (kind ? " " + kind : "");
}

function openSettings() {
  const settings = loadSettings();

  // 根據 theo.js 的個性列表，做出選項卡片
  personalityOptions.innerHTML = "";
  for (const key in 個性列表) {
    const label = document.createElement("label");
    label.className = "option";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "personality";
    radio.value = key;
    radio.checked = key === settings.personality;
    radio.addEventListener("change", function () {
      saveSettings({ personality: key }); // 選了就馬上存
    });

    const text = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = 個性列表[key].名稱;
    const intro = document.createElement("span");
    intro.textContent = 個性列表[key].簡介;
    text.append(title, intro);

    label.append(radio, text);
    personalityOptions.appendChild(label);
  }

  for (const field of 金鑰欄位) {
    field.input.value = settings[field.設定];
    field.input.type = "password";
    showKeyStatus(field, settings[field.設定] ? "已設定金鑰" : "還沒設定");
  }
  settingsPage.hidden = false;
}

function closeSettings() {
  settingsPage.hidden = true;
}

// 儲存兩個金鑰，順便各自測試能不能用
async function saveKeys() {
  const changes = { apiKey: "" }; // 清掉舊版的單一金鑰
  for (const field of 金鑰欄位) {
    changes[field.設定] = field.input.value.trim();
  }
  saveSettings(changes);

  saveKeyButton.disabled = true;
  await Promise.all(金鑰欄位.map(async function (field) {
    const key = changes[field.設定];
    if (!key) {
      showKeyStatus(field, "沒有設定，會跳過這個 AI");
      return;
    }
    showKeyStatus(field, "測試連線中……");
    try {
      await testAIConnection(field.ai, key);
      showKeyStatus(field, "連線成功", "ok");
    } catch (e) {
      showKeyStatus(field, e.message, "error");
    }
  }));
  saveKeyButton.disabled = false;
}

document.getElementById("settings-button").addEventListener("click", openSettings);
document.getElementById("settings-back").addEventListener("click", closeSettings);
saveKeyButton.addEventListener("click", saveKeys);

// 眼睛按鈕：顯示／隱藏金鑰
document.querySelectorAll(".toggle-key").forEach(function (button) {
  button.addEventListener("click", function () {
    const input = document.getElementById(button.dataset.for);
    input.type = input.type === "password" ? "text" : "password";
  });
});

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

// 從背景切回 App 時，如果真的換日了：原本在看「今天」的話，就跳到新的一天
let lastToday = todayKey();
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState !== "visible") return;
  const now = todayKey();
  if (now === lastToday) return; // 沒換日，什麼都不用做
  if (currentDay === lastToday) currentDay = now;
  lastToday = now;
  checkGoalReminders(); // 換日了，看看有沒有要提醒的目標（goals.js）
  showMessages();
});

// ---------- 打開 App 時 ----------
checkGoalReminders(); // 看看有沒有要提醒的目標（goals.js）
showMessages();
// 依序做，避免同時問 AI 太多次：先補昨天的總結，再做上週／上個月的回顧（reviews.js）
(async function () {
  await autoSummarizeYesterday();
  await autoReviews();
})();
