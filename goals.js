// ============================================
// goals.js：目標與提醒
// 1. 寫日記時，在背景找出「之後想做的事」，請你確認後記下來
// 2. 打開 App 時：前一天提醒、當天提醒、事後問你有沒有做到
// 3. 目標頁：看所有目標，可以新增、修改、刪除
// ============================================

// 把 "2026-10-14" 變成「10/14（三）」
function formatGoalDate(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const weekday = "日一二三四五六"[new Date(y, m - 1, d).getDay()];
  return m + "/" + d + "（" + weekday + "）";
}

// 把目標寫成一句話，例如「10/14（三）下午 去運動」
function describeGoal(goal) {
  return formatGoalDate(goal.date) + (goal.time ? goal.time + " " : " ") + goal.what;
}

// ---------- 1. 找出目標 ----------
// 有提到這些「未來」的字眼，才去問 AI，沒有就不問，節省額度
const 未來的字眼 = /明天|明早|明晚|後天|週|周|禮拜|星期|下次|下個|月|號|假日|連假|之後|改天|找時間|有空|打算|計畫|預計/;

// 每次送出日記後呼叫（不用等它，在背景慢慢做）
async function detectGoals(message) {
  if (!未來的字眼.test(message.text)) return;

  const settings = loadSettings();
  if (!settings.groqKey && !settings.geminiKey) return;

  const today = todayKey();
  const planned = loadGoals()
    .filter(function (goal) { return goal.status === "planned"; })
    .map(describeGoal);

  const request =
    "今天是 " + today + "（星期" + "日一二三四五六"[new Date().getDay()] + "），現在 " + formatTime(new Date()) + "。\n" +
    "已經記下的目標：" + (planned.length ? planned.join("、") : "沒有") + "\n" +
    "對方剛剛寫了：「" + message.text + "」\n\n" +
    "請找出對方「打算在明天或之後做的事」，包含還不確定、用問句說的（例如「這個週末想去慢跑嗎」）。\n" +
    "規則：\n" +
    "- 只抓明天或之後的事，今天的行程不要\n" +
    "- 只抓對方自己要做、想做的事；別人的事、已經發生的事、隨口抱怨都不要\n" +
    "- 已經記下的目標不要重複\n" +
    "- dates：可能的日期（YYYY-MM-DD），把「禮拜三」「下週一」換算成實際日期；\n" +
    "  說得很明確就只放一個；說得模糊就列出可能的日期（例如「這個週末」就放星期六和星期日），最多 7 個\n" +
    "- time：對方說的時段（例如「下午」「晚上 7 點」），沒說就空字串\n" +
    "- what：簡短的動詞片語（例如「去運動」「去慢跑或慢走」）\n" +
    "- 對方可能用語音輸入，有同音錯字的話，照原本的意思理解\n" +
    '用 JSON 回答：{ "goals": [ { "what": "去運動", "dates": ["2026-10-14"], "time": "下午" } ] }，沒有就 { "goals": [] }';

  let found;
  try {
    const answer = await askAI("你是幫忙整理行程的小幫手，只用 JSON 回答。", request, { json: true });
    found = JSON.parse(answer).goals || [];
  } catch (e) {
    return; // 找不到就算了，不打擾
  }

  let added = false;
  for (const goal of found) {
    if (!goal || !goal.what) continue;
    // 只留下格式正確、而且是明天以後的日期
    const dates = (goal.dates || [])
      .filter(function (date) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && date > today; })
      .slice(0, 7);
    if (dates.length === 0) continue;
    const time = goal.time || "";

    if (dates.length === 1 && time) {
      // 說得很明確：直接問「對嗎？」
      addMessage("theo", "我幫你記：" + describeGoal({ what: goal.what, date: dates[0], time: time }) + "，對嗎？", "goal-confirm", {
        goal: { what: goal.what, date: dates[0], time: time },
        answered: null,
      });
    } else {
      // 說得比較模糊：問哪一天、什麼時段
      addMessage("theo", "要幫你記下來嗎？「" + goal.what + "」", "goal-ask", {
        goal: { what: goal.what, dates: dates, time: time },
        answered: null,
      });
    }
    added = true;
  }
  if (added && currentDay === todayKey()) showMessages();
}

// ---------- 2. 提醒 ----------
// 打開 App（或換日）時呼叫
function checkGoalReminders() {
  const today = todayKey();
  const tomorrow = shiftDay(today, 1);
  let added = false;

  for (const goal of loadGoals()) {
    if (goal.status !== "planned") continue;

    if (goal.date < today && !goal.followedUp) {
      // 已經過了：問有沒有做到
      addMessage("theo", "上次說 " + describeGoal(goal) + "，有做到嗎？", "goal-followup", {
        goalId: goal.id,
        answered: null,
      });
      updateGoal(goal.id, { followedUp: true });
      added = true;
    } else if (goal.date === today && !goal.remindedToday) {
      addMessage("theo", "今天" + (goal.time || "") + "要" + goal.what + "喔，記得。", "reminder");
      updateGoal(goal.id, { remindedToday: true, remindedBefore: true });
      added = true;
    } else if (goal.date === tomorrow && !goal.remindedBefore) {
      addMessage("theo", "欸，明天" + (goal.time || "") + "要" + goal.what + "喔，別忘了。", "reminder");
      updateGoal(goal.id, { remindedBefore: true });
      added = true;
    }
  }
  return added;
}

// ---------- 聊天裡的卡片 ----------
// 提醒：橘紅色邊條加鈴鐺
function createReminderCard(message) {
  const card = document.createElement("div");
  card.className = "reminder";
  card.innerHTML = '<svg class="icon"><use href="#icon-bell"/></svg><div></div>';
  card.querySelector("div").textContent = "Theo：" + message.text;
  return card;
}

// 有按鈕的卡片：確認目標、問有沒有做到
// buttons：[{ label: "對", value: true }, ...]；按了之後顯示 resultText
function createChoiceCard(message, iconId, buttons, onChoose, resultText) {
  const card = document.createElement("div");
  card.className = "reminder choice-card";
  card.innerHTML = '<svg class="icon"><use href="#' + iconId + '"/></svg><div class="choice-body"><div class="choice-text"></div></div>';
  card.querySelector(".choice-text").textContent = "Theo：" + message.text;
  const body = card.querySelector(".choice-body");

  if (message.answered === null || message.answered === undefined) {
    const row = document.createElement("div");
    row.className = "choice-buttons";
    for (const button of buttons) {
      const el = document.createElement("button");
      el.textContent = button.label;
      el.addEventListener("click", function () {
        row.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
        onChoose(button.value);
      });
      row.appendChild(el);
    }
    body.appendChild(row);
  } else {
    const result = document.createElement("div");
    result.className = "choice-result";
    result.textContent = resultText(message.answered);
    body.appendChild(result);
  }
  return card;
}

// 「我幫你記：……對嗎？」
function createGoalConfirmCard(message) {
  return createChoiceCard(
    message,
    "icon-target",
    [{ label: "對", value: true }, { label: "不對", value: false }],
    function (yes) {
      if (yes) addGoal(message.goal.what, message.goal.date, message.goal.time);
      updateMessage(message.id, { answered: yes });
      showMessages();
    },
    function (yes) { return yes ? "已記下，可以到目標頁修改" : "好，不記"; }
  );
}

// 「要幫你記下來嗎？」：選哪一天、什麼時段，再按「記下來」
const 時段選項 = ["早上", "中午", "下午", "晚上", "還不確定"];

function createGoalAskCard(message) {
  const card = document.createElement("div");
  card.className = "reminder choice-card";
  card.innerHTML = '<svg class="icon"><use href="#icon-target"/></svg><div class="choice-body"><div class="choice-text"></div></div>';
  card.querySelector(".choice-text").textContent = "Theo：" + message.text;
  const body = card.querySelector(".choice-body");

  // 已經回答過：只顯示結果
  if (message.answered !== null && message.answered !== undefined) {
    const result = document.createElement("div");
    result.className = "choice-result";
    result.textContent = message.answered ? "已記下：" + describeGoal(message.answered) : "好，不記";
    body.appendChild(result);
    return card;
  }

  const goal = message.goal;
  let pickedDate = goal.dates.length === 1 ? goal.dates[0] : null;
  let pickedTime = goal.time && 時段選項.includes(goal.time) ? goal.time : (goal.time || null);

  // 一排可以選的小按鈕
  function addChips(label, options, getText, isPicked, onPick) {
    const title = document.createElement("div");
    title.className = "chip-label";
    title.textContent = label;
    const row = document.createElement("div");
    row.className = "chips";
    for (const option of options) {
      const chip = document.createElement("button");
      chip.className = "chip" + (isPicked(option) ? " picked" : "");
      chip.textContent = getText(option);
      chip.addEventListener("click", function () {
        onPick(option);
        row.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("picked"); });
        chip.classList.add("picked");
        updateSaveButton();
      });
      row.appendChild(chip);
    }
    body.append(title, row);
  }

  addChips("哪一天？", goal.dates, formatGoalDate,
    function (date) { return date === pickedDate; },
    function (date) { pickedDate = date; });

  // 如果 AI 抓到的時段不在選項裡（例如「晚上 7 點」），也放進去
  const times = 時段選項.includes(goal.time) || !goal.time ? 時段選項 : [goal.time].concat(時段選項);
  addChips("大概什麼時候？", times, function (time) { return time; },
    function (time) { return time === pickedTime; },
    function (time) { pickedTime = time; });

  const buttons = document.createElement("div");
  buttons.className = "choice-buttons";
  const save = document.createElement("button");
  save.textContent = "記下來";
  const skip = document.createElement("button");
  skip.textContent = "不用";
  buttons.append(save, skip);
  body.appendChild(buttons);

  // 還沒選日期就不能按「記下來」
  function updateSaveButton() { save.disabled = !pickedDate; }
  updateSaveButton();

  save.addEventListener("click", function () {
    const time = pickedTime === "還不確定" ? "" : (pickedTime || "");
    addGoal(goal.what, pickedDate, time);
    updateMessage(message.id, { answered: { what: goal.what, date: pickedDate, time: time } });
    showMessages();
  });
  skip.addEventListener("click", function () {
    updateMessage(message.id, { answered: false });
    showMessages();
  });
  return card;
}

// 「上次說……有做到嗎？」
function createGoalFollowupCard(message) {
  return createChoiceCard(
    message,
    "icon-target",
    [{ label: "有！", value: true }, { label: "沒有……", value: false }],
    function (yes) { answerFollowup(message, yes); },
    function (yes) { return yes ? "有做到" : "這次沒做到"; }
  );
}

// 回答有沒有做到之後，Theo 回一句話
async function answerFollowup(message, yes) {
  const goal = loadGoals().find(function (item) { return item.id === message.goalId; });
  updateGoal(message.goalId, { status: yes ? "done" : "missed" });
  updateMessage(message.id, { answered: yes });
  showMessages();
  if (!goal) return;

  showTyping();
  const request = yes
    ? "對方原本計畫 " + describeGoal(goal) + "，剛剛說有做到。請用一兩句話真心稱讚。"
    : "對方原本計畫 " + describeGoal(goal) + "，剛剛說沒有做到。請用一兩句話回應，不要責備，可以給一個很小的建議。";
  let reply;
  try {
    reply = await askAI(buildTheoPrompt(loadSettings().personality), request + "\n像傳訊息一樣，可以分成 1 到 2 則，每則之間空一行。");
  } catch (e) {
    reply = yes ? "說到做到，很可以喔。" : "沒關係，下次再約自己一次。";
  }
  await addTheoReplies(reply); // app.js
}

// ---------- 3. 目標頁 ----------
const goalsPage = document.getElementById("goals-page");
const goalsList = document.getElementById("goals-list");
const goalForm = document.getElementById("goal-form");
const goalWhatInput = document.getElementById("goal-what");
const goalDateInput = document.getElementById("goal-date");
const goalTimeInput = document.getElementById("goal-time");
let 正在編輯的目標 = null; // null 代表新增

function openGoals() {
  closeGoalForm();
  showGoals();
  goalsPage.hidden = false;
}

function closeGoals() {
  goalsPage.hidden = true;
  showMessages();
}

// 依狀態分組列出所有目標
function showGoals() {
  const today = todayKey();
  const goals = loadGoals().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  const groups = [
    { title: "接下來", items: goals.filter(function (g) { return g.status === "planned" && g.date >= today; }) },
    { title: "還沒回報", items: goals.filter(function (g) { return g.status === "planned" && g.date < today; }) },
    { title: "完成了", items: goals.filter(function (g) { return g.status === "done"; }).reverse() },
    { title: "沒做到", items: goals.filter(function (g) { return g.status === "missed"; }).reverse() },
  ];

  goalsList.innerHTML = "";
  if (goals.length === 0) {
    goalsList.innerHTML = '<p class="hint">還沒有目標。跟 Theo 說「禮拜三下午想去運動」，他就會幫你記下來。</p>';
    return;
  }

  for (const group of groups) {
    if (group.items.length === 0) continue;
    const section = document.createElement("section");
    section.className = "setting-section";
    const h2 = document.createElement("h2");
    h2.textContent = group.title;
    section.appendChild(h2);

    for (const goal of group.items) {
      section.appendChild(createGoalItem(goal));
    }
    goalsList.appendChild(section);
  }
}

function createGoalItem(goal) {
  const item = document.createElement("div");
  item.className = "goal-item" + (goal.status === "done" ? " done" : "");

  const date = document.createElement("div");
  date.className = "goal-date";
  date.textContent = formatGoalDate(goal.date) + (goal.time ? " " + goal.time : "");
  const what = document.createElement("div");
  what.className = "goal-what";
  what.textContent = goal.what;

  const actions = document.createElement("div");
  actions.className = "goal-actions";
  function addAction(label, onClick) {
    const button = document.createElement("button");
    button.textContent = label;
    button.addEventListener("click", onClick);
    actions.appendChild(button);
  }
  if (goal.status === "planned") {
    addAction("完成", function () {
      updateGoal(goal.id, { status: "done", followedUp: true });
      showGoals();
    });
  } else {
    addAction("改回未完成", function () {
      updateGoal(goal.id, { status: "planned", followedUp: true });
      showGoals();
    });
  }
  addAction("編輯", function () { openGoalForm(goal); });
  addAction("刪除", function () {
    if (confirm("確定要刪除「" + goal.what + "」嗎？")) {
      removeGoal(goal.id);
      showGoals();
    }
  });

  item.append(date, what, actions);
  return item;
}

// 新增或編輯目標的表單
function openGoalForm(goal) {
  正在編輯的目標 = goal || null;
  goalWhatInput.value = goal ? goal.what : "";
  goalDateInput.value = goal ? goal.date : shiftDay(todayKey(), 1);
  goalTimeInput.value = goal ? goal.time : "";
  goalForm.hidden = false;
  goalWhatInput.focus();
}

function closeGoalForm() {
  goalForm.hidden = true;
  正在編輯的目標 = null;
}

function saveGoalForm(event) {
  event.preventDefault();
  const what = goalWhatInput.value.trim();
  const date = goalDateInput.value;
  const time = goalTimeInput.value.trim();
  if (!what || !date) {
    alert("請填寫要做什麼和日期。");
    return;
  }

  if (正在編輯的目標) {
    const changes = { what: what, date: date, time: time };
    // 改了日期的話，提醒要重新來
    if (date !== 正在編輯的目標.date) {
      Object.assign(changes, { remindedBefore: false, remindedToday: false, followedUp: false });
    }
    updateGoal(正在編輯的目標.id, changes);
  } else {
    addGoal(what, date, time);
  }
  closeGoalForm();
  showGoals();
}

document.getElementById("goals-button").addEventListener("click", openGoals);
document.getElementById("goals-back").addEventListener("click", closeGoals);
document.getElementById("add-goal").addEventListener("click", function () { openGoalForm(null); });
document.getElementById("goal-cancel").addEventListener("click", closeGoalForm);
goalForm.addEventListener("submit", saveGoalForm);
