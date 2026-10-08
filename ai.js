// ============================================
// ai.js：跟 AI（Google Gemini）溝通
// 之後想換成其他 AI，只要改這個檔案
// ============================================

// 用哪個模型。依序嘗試，前一個太忙、太慢或找不到就換下一個
// 這些模型都會「先思考再回答」，回應比較有深度，但要多等幾秒
// （想要更快的話，可以加上 thinking: { thinkingBudget: 0 } 關掉思考）
const AI_MODELS = [
  { name: "gemini-flash-latest" },
  { name: "gemini-2.5-flash" },
  { name: "gemini-flash-lite-latest" },
];

// 一個模型最多等幾秒，超過就換下一個（思考需要時間，所以給久一點）
const 最多等幾秒 = 40;

// 這些錯誤代表「這個模型現在不行」，可以換下一個試試
// 404 找不到模型、408 太慢、500 Google 內部錯誤、503 太忙
const 可以換模型的錯誤 = [404, 408, 500, 503];

// 問 AI 一個問題，回傳 AI 的回答（文字）
// systemPrompt：告訴 AI 要扮演誰（例如 Theo 的個性）
// userText：要給 AI 看的內容（例如今天的日記）
// options：{ json: true } 代表要 AI 用固定格式（JSON）回答
async function askAI(systemPrompt, userText, apiKey, options) {
  apiKey = apiKey || loadSettings().apiKey;
  if (!apiKey) {
    throw new Error("還沒有設定 Gemini API 金鑰，請到設定頁貼上。");
  }

  let lastError;
  for (const model of AI_MODELS) {
    try {
      return await askModel(model, systemPrompt, userText, apiKey, options || {});
    } catch (e) {
      lastError = e;
      if (!可以換模型的錯誤.includes(e.status)) throw e; // 金鑰錯誤等問題，換模型也沒用
    }
  }
  throw lastError;
}

// 問某一個模型
async function askModel(model, systemPrompt, userText, apiKey, options) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model.name + ":generateContent";

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
  };
  body.generationConfig = {};
  if (model.thinking) body.generationConfig.thinkingConfig = model.thinking;
  if (options.json) body.generationConfig.responseMimeType = "application/json";

  // 超過時間就放棄這次請求
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 最多等幾秒 * 1000);

  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") {
      const error = new Error("Gemini 回得太慢了，等一下再試。");
      error.status = 408;
      throw error;
    }
    throw new Error("連不上網路，請檢查網路後再試一次。");
  }

  const data = await response.json().catch(function () { return {}; });
  clearTimeout(timer);

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
    // 這個模型不支援關掉思考的話，當作「這個模型不行」，換下一個
    if (response.status === 400 && /thinking/i.test(data.error?.message || "")) error.status = 404;
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
