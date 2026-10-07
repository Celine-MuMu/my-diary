// ============================================
// ai.js：跟 AI（Google Gemini）溝通
// 之後想換成其他 AI，只要改這個檔案
// ============================================

// 用哪個模型。依序嘗試，前一個太忙或找不到就換下一個
const AI_MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest"];

// 這些錯誤代碼代表「這個模型現在不行」，可以換下一個試試
// 404 找不到模型、500 Google 內部錯誤、503 太忙
const 可以換模型的錯誤 = [404, 500, 503];

// 等幾毫秒
function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// 問 AI 一個問題，回傳 AI 的回答（文字）
// systemPrompt：告訴 AI 要扮演誰（例如 Theo 的個性）
// userText：要給 AI 看的內容（例如今天的日記）
async function askAI(systemPrompt, userText, apiKey) {
  apiKey = apiKey || loadSettings().apiKey;
  if (!apiKey) {
    throw new Error("還沒有設定 Gemini API 金鑰，請到設定頁貼上。");
  }

  let lastError;
  for (const model of AI_MODELS) {
    // 每個模型最多試 2 次（太忙的話等 1.5 秒再試一次）
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await askModel(model, systemPrompt, userText, apiKey);
      } catch (e) {
        lastError = e;
        if (!可以換模型的錯誤.includes(e.status)) throw e; // 金鑰錯誤等問題，換模型也沒用
        if (e.status !== 503) break;                     // 不是太忙，就不用重試同一個
        if (attempt === 1) await wait(1500);
      }
    }
  }
  throw lastError;
}

// 問某一個模型
async function askModel(model, systemPrompt, userText, apiKey) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
      }),
    });
  } catch (e) {
    throw new Error("連不上網路，請檢查網路後再試一次。");
  }

  const data = await response.json().catch(function () { return {}; });

  if (!response.ok) {
    // Google 回傳的錯誤說明，附在訊息後面方便找問題
    const detail = data.error?.message ? "\n（" + response.status + "：" + data.error.message + "）" : "（錯誤代碼 " + response.status + "）";
    let message = "AI 暫時沒有回應，等一下再試。";
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      message = "API 金鑰好像不能用，請到設定頁檢查。";
    } else if (response.status === 404) {
      message = "找不到這個 AI 模型。";
    } else if (response.status === 503) {
      message = "Gemini 現在太忙了，等一下再試。";
    } else if (response.status === 429) {
      message = "今天的免費額度用完了，或是問得太快，等一下再試。";
    }
    const error = new Error(message + detail);
    error.status = response.status;
    throw error;
  }

  // 從回傳的資料裡，把文字拿出來
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map(function (part) { return part.text || ""; }).join("").trim();
  if (!text) {
    throw new Error("AI 這次沒有回答，換個說法再試一次。");
  }
  return text;
}

// 測試金鑰能不能用（設定頁的「測試連線」按鈕會用到）
async function testAIConnection(apiKey) {
  await askAI("你是一個測試程式。", "請只回答「OK」兩個字。", apiKey);
}
