// ============================================
// reviews.js：每週／每月回顧
// 新的一週（星期一）、新的一個月第一次打開 App 時，
// 自動整理上一週／上個月，顯示在日曆頁下方（calendar.js）
// ============================================

const 回顧存放名稱 = "theo-diary-reviews";

// 一個回顧長這樣：
// { id, kind: "week" 週／"month" 月, start: "2026-10-05", end: "2026-10-11",
//   did: [...], highlights: [...], mood: "……", advice: "……" }
function loadReviews() {
  try {
    return JSON.parse(localStorage.getItem(回顧存放名稱)) || [];
  } catch (e) {
    return [];
  }
}

function saveReview(review) {
  const reviews = loadReviews().filter(function (item) {
    return !(item.kind === review.kind && item.start === review.start); // 同一段期間只留新的
  });
  reviews.push(review);
  try {
    localStorage.setItem(回顧存放名稱, JSON.stringify(reviews));
  } catch (e) {
    alert("回顧存檔失敗。");
  }
}

// ---------- 期間 ----------
// 上一週：上週一到上週日
function lastWeekRange() {
  const today = todayKey();
  const [y, m, d] = today.split("-").map(Number);
  const daysSinceMonday = (new Date(y, m - 1, d).getDay() + 6) % 7;
  const thisMonday = shiftDay(today, -daysSinceMonday);
  return { kind: "week", start: shiftDay(thisMonday, -7), end: shiftDay(thisMonday, -1) };
}

// 上個月：上個月 1 號到最後一天
function lastMonthRange() {
  const [y, m] = todayKey().split("-").map(Number);
  const first = new Date(y, m - 2, 1);
  const last = new Date(y, m - 1, 0); // 這個月的第 0 天 = 上個月最後一天
  return { kind: "month", start: formatDayKey(first), end: formatDayKey(last) };
}

// 回顧的標題，例如「10/5 – 10/11 這週」「2026 年 10 月」
function reviewTitle(review) {
  if (review.kind === "month") {
    const [y, m] = review.start.split("-").map(Number);
    return y + " 年 " + m + " 月";
  }
  return formatGoalDate(review.start) + " – " + formatGoalDate(review.end);
}

// ---------- 產生回顧 ----------
// 把一段期間整理成文字：有每日總結就用總結（比較短），沒有就用日記（太長就截短）
function rangeAsText(range) {
  const byDay = {};
  for (const message of loadMessages()) {
    const day = dayKeyOf(message.time);
    if (day < range.start || day > range.end) continue;
    (byDay[day] = byDay[day] || []).push(message);
  }

  const 每天最多幾個字 = range.kind === "month" ? 300 : 800;
  const lines = [];
  for (const day of Object.keys(byDay).sort()) {
    const messages = byDay[day];
    if (!messages.some(function (m) { return m.role === "me"; })) continue;

    const summary = messages.find(function (m) { return m.type === "summary"; });
    let text = summary
      ? summary.text
      : messages.filter(function (m) { return m.role === "me"; }).map(function (m) { return m.text; }).join("／");
    if (text.length > 每天最多幾個字) text = text.slice(0, 每天最多幾個字) + "……";
    lines.push(formatGoalDate(day) + "：" + text);
  }
  return lines.join("\n");
}

async function createReview(range) {
  const diary = rangeAsText(range);
  if (!diary) return null; // 這段期間沒寫日記，就不做回顧

  const goals = loadGoals()
    .filter(function (goal) { return goal.date >= range.start && goal.date <= range.end; })
    .map(function (goal) {
      const status = { done: "完成", missed: "沒做到", planned: "還沒回報" }[goal.status];
      return describeGoal(goal) + "（" + status + "）";
    });

  const period = range.kind === "week" ? "這一週" : "這個月";
  const next = range.kind === "week" ? "下週" : "下個月";
  const request =
    "以下是對方" + period + "（" + range.start + " 到 " + range.end + "）的日記重點：\n\n" +
    diary + "\n\n" +
    "這段期間的目標：" + (goals.length ? goals.join("、") : "沒有") + "\n\n" +
    "請幫對方做" + period + "的回顧，用 JSON 回答：\n" +
    '{ "did": ["……"], "highlights": ["……"], "mood": "……", "advice": "……" }\n' +
    "- did：" + period + "做了哪些事，挑重要的，最多 6 項，每項一句短短的話\n" +
    "- highlights：" + period + "的亮點，1 到 3 項，用你的語氣真心稱讚\n" +
    "- mood：一兩句話說" + period + "的心情走勢\n" +
    "- advice：一兩句給" + next + "的小建議，像朋友說的話，不要說教";

  const answer = await askAI(buildTheoPrompt(loadSettings().personality), request, { json: true });
  const result = JSON.parse(answer);
  const review = {
    id: Date.now().toString(36),
    kind: range.kind,
    start: range.start,
    end: range.end,
    did: result.did || [],
    highlights: result.highlights || [],
    mood: result.mood || "",
    advice: result.advice || "",
  };
  saveReview(review);
  return review;
}

// 打開 App 時：上週、上個月還沒有回顧，就自動做
async function autoReviews() {
  const settings = loadSettings();
  if (!settings.groqKey && !settings.geminiKey) return;

  const done = loadReviews();
  for (const range of [lastWeekRange(), lastMonthRange()]) {
    const exists = done.some(function (item) { return item.kind === range.kind && item.start === range.start; });
    if (exists) continue;
    try {
      const review = await createReview(range);
      if (review) {
        const what = range.kind === "week" ? "上週" : "上個月";
        showNotice(what + "的回顧整理好了", "看看", function () {
          openCalendar(review.end); // 打開那個月的日曆，回顧在下方（calendar.js）
        });
      }
    } catch (e) {
      // 失敗就算了，下次打開再試
    }
  }
}

// ---------- 回顧卡片（日曆頁下方會用到）----------
function createReviewCard(review) {
  const card = document.createElement("div");
  card.className = "summary-card review-card";

  const tag = document.createElement("div");
  tag.className = "review-tag";
  tag.textContent = review.kind === "week" ? "每週回顧" : "每月回顧";
  const title = document.createElement("div");
  title.className = "summary-title";
  title.textContent = reviewTitle(review);
  card.append(tag, title);

  const period = review.kind === "week" ? "這週" : "這個月";
  const next = review.kind === "week" ? "給下週" : "給下個月";

  function addList(heading, items) {
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
  function addText(heading, text) {
    if (!text) return;
    const h = document.createElement("h3");
    h.textContent = heading;
    const p = document.createElement("p");
    p.className = "review-text";
    p.textContent = text;
    card.append(h, p);
  }

  addList(period + "做了什麼", review.did);
  addList(period + "的亮點", review.highlights);
  addText("心情", review.mood);
  addText(next + "的小建議", review.advice);
  return card;
}
