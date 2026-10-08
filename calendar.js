// ============================================
// calendar.js：日曆頁
// 點上方的日期打開。看出哪些天有寫日記、有目標，點某一天就跳過去
// 下方顯示這個月的回顧（reviews.js）
// ============================================

const calendarPage = document.getElementById("calendar-page");
const calendarGrid = document.getElementById("calendar-grid");
const calendarMonthLabel = document.getElementById("calendar-month");
const reviewsList = document.getElementById("reviews-list");

// 目前在看哪一個月，例如 { y: 2026, m: 10 }
let calendarMonth = null;

// 打開日曆，顯示某一天所在的月份（沒給就用正在看的那天）
function openCalendar(dayKey) {
  const [y, m] = (dayKey || currentDay).split("-").map(Number);
  calendarMonth = { y: y, m: m };
  showCalendar();
  calendarPage.hidden = false;
}

function closeCalendar() {
  calendarPage.hidden = true;
}

// 換到上個月／下個月（step 是 -1 或 1）
function changeMonth(step) {
  const date = new Date(calendarMonth.y, calendarMonth.m - 1 + step, 1);
  calendarMonth = { y: date.getFullYear(), m: date.getMonth() + 1 };
  showCalendar();
}

function showCalendar() {
  const { y, m } = calendarMonth;
  calendarMonthLabel.textContent = y + " 年 " + m + " 月";

  const today = todayKey();
  const monthStart = formatDayKey(new Date(y, m - 1, 1));
  const monthEnd = formatDayKey(new Date(y, m, 0));

  // 哪些天有寫日記、有目標
  const entryDays = new Set();
  for (const message of loadMessages()) {
    if (message.role === "me") entryDays.add(dayKeyOf(message.time));
  }
  const goalDays = new Set(loadGoals().map(function (goal) { return goal.date; }));

  calendarGrid.innerHTML = "";

  // 星期一開頭：1 號前面要空幾格
  const blanks = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  for (let i = 0; i < blanks; i++) {
    calendarGrid.appendChild(document.createElement("span"));
  }

  const daysInMonth = new Date(y, m, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dayKey = formatDayKey(new Date(y, m - 1, d));
    const cell = document.createElement("button");
    cell.className = "calendar-day";
    if (dayKey === today) cell.classList.add("today");
    if (dayKey === currentDay) cell.classList.add("selected");
    cell.disabled = dayKey > today; // 未來的日子還沒有日記
    cell.setAttribute("aria-label", m + " 月 " + d + " 日" +
      (entryDays.has(dayKey) ? "，有寫日記" : "") + (goalDays.has(dayKey) ? "，有目標" : ""));

    const number = document.createElement("span");
    number.textContent = d;
    const dots = document.createElement("span");
    dots.className = "dots";
    if (entryDays.has(dayKey)) dots.innerHTML += '<i class="dot entry"></i>';
    if (goalDays.has(dayKey)) dots.innerHTML += '<i class="dot goal"></i>';
    cell.append(number, dots);

    cell.addEventListener("click", function () {
      currentDay = dayKey; // app.js
      closeCalendar();
      showMessages();
    });
    calendarGrid.appendChild(cell);
  }

  // 下一個月還沒到的話，不能往後翻
  document.getElementById("next-month").disabled = monthEnd >= today;

  showMonthReviews(monthStart, monthEnd);
}

// 這個月的回顧：期間跟這個月有重疊的都算，新的在上面
function showMonthReviews(monthStart, monthEnd) {
  const reviews = loadReviews()
    .filter(function (review) { return review.start <= monthEnd && review.end >= monthStart; })
    .sort(function (a, b) {
      return a.end < b.end ? 1 : a.end > b.end ? -1 : (a.kind === "month" ? -1 : 1);
    });

  reviewsList.innerHTML = "";
  if (reviews.length === 0) {
    reviewsList.innerHTML = '<p class="hint">這個月還沒有回顧。每到新的一週（星期一）、新的一個月，Theo 會自動幫你整理上一週、上個月。</p>';
    return;
  }
  for (const review of reviews) {
    reviewsList.appendChild(createReviewCard(review)); // reviews.js
  }
}

document.getElementById("date-label").addEventListener("click", function () { openCalendar(); });
document.getElementById("calendar-back").addEventListener("click", closeCalendar);
document.getElementById("prev-month").addEventListener("click", function () { changeMonth(-1); });
document.getElementById("next-month").addEventListener("click", function () { changeMonth(1); });
