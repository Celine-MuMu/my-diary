// ============================================
// ai.js：跟 AI（Groq）溝通
// 之後想換成其他 AI，只要改這個檔案
// （2026-10-08 從 Gemini 換成 Groq，舊版本在 git 紀錄裡）
// ============================================

const GROQ_網址 = "https://api.groq.com/openai/v1";

// 想用哪些模型，依序嘗試。Groq 的模型常常改版，
// 所以這裡寫「名字裡有什麼」，App 會自動找 Groq 目前有的版本
// 1. Qwen：中文是強項
// 2. gpt-oss-120b：聰明的備援
const 模型偏好 = [/qwen/i, /gpt-oss-120b/i];

// 萬一查不到 Groq 的模型清單，就直接用這些
const 預設模型 = ["qwen/qwen3.6-27b", "openai/gpt-oss-120b"];

// 一個模型最多等幾秒，超過就換下一個
const 最多等幾秒 = 30;

// 這些錯誤代表「這個模型現在不行」，可以換下一個試試
// 404 找不到模型、408 太慢、500 Groq 內部錯誤、503 太忙
const 可以換模型的錯誤 = [404, 408, 500, 503];

// 問 AI 一個問題，回傳 AI 的回答（文字）
// systemPrompt：告訴 AI 要扮演誰（例如 Theo 的個性）
// userText：要給 AI 看的內容（例如今天的日記）
// options：{ json: true } 代表要 AI 用固定格式（JSON）回答
async function askAI(systemPrompt, userText, apiKey, options) {
  apiKey = (apiKey || loadSettings().apiKey || "").trim();
  if (!apiKey) {
    throw new Error("還沒有設定 Groq API 金鑰，請到設定頁貼上。");
  }
  if (!apiKey.startsWith("gsk_")) {
    throw new Error("這好像不是 Groq 的金鑰（Groq 的金鑰是 gsk_ 開頭），請到設定頁換一下。");
  }

  const models = await pickModels(apiKey);
  let lastError;
  for (const model of models) {
    try {
      return await askModel(model, systemPrompt, userText, apiKey, options || {});
    } catch (e) {
      lastError = e;
      if (!可以換模型的錯誤.includes(e.status)) throw e; // 金鑰錯誤等問題，換模型也沒用
    }
  }
  throw lastError;
}

// 查 Groq 現在有哪些模型，照「模型偏好」挑出要用的（查過一次就記住）
let 已挑好的模型 = null;
async function pickModels(apiKey) {
  if (已挑好的模型) return 已挑好的模型;

  try {
    const response = await fetch(GROQ_網址 + "/models", {
      headers: { Authorization: "Bearer " + apiKey },
    });
    if (!response.ok) return 預設模型; // 查不到就用預設的，真正的錯誤等等問的時候再說

    const data = await response.json();
    const ids = (data.data || [])
      .map(function (model) { return model.id; })
      // 排除不是用來聊天的模型（語音、安全過濾等）
      .filter(function (id) { return !/whisper|tts|guard|orpheus|compound|safeguard/i.test(id); })
      .sort()
      .reverse(); // 版本號大的排前面

    const picked = [];
    for (const pattern of 模型偏好) {
      const found = ids.find(function (id) { return pattern.test(id); });
      if (found) picked.push(found);
    }
    已挑好的模型 = picked.length > 0 ? picked : 預設模型;
    return 已挑好的模型;
  } catch (e) {
    return 預設模型;
  }
}

// 問某一個模型
async function askModel(model, systemPrompt, userText, apiKey, options) {
  const body = {
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
  };
  // Qwen 會先思考再回答：把思考過程藏起來，只拿最後的回答
  if (/qwen/i.test(model)) body.reasoning_format = "hidden";
  if (options.json) body.response_format = { type: "json_object" };

  // 超過時間就放棄這次請求
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 最多等幾秒 * 1000);

  let response;
  try {
    response = await fetch(GROQ_網址 + "/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") {
      const error = new Error("AI 回得太慢了，等一下再試。");
      error.status = 408;
      throw error;
    }
    throw new Error("連不上網路，請檢查網路後再試一次。");
  }

  const data = await response.json().catch(function () { return {}; });
  clearTimeout(timer);

  if (!response.ok) {
    // AI 回傳的錯誤說明，附在訊息後面方便找問題
    const detail = data.error?.message ? "\n（" + response.status + "：" + data.error.message + "）" : "（錯誤代碼 " + response.status + "）";
    let message = "AI 暫時沒有回應，等一下再試。";
    let status = response.status;
    if (status === 401 || status === 403) {
      message = "API 金鑰好像不能用，請到設定頁檢查。";
    } else if (status === 404 || data.error?.code === "model_decommissioned" || data.error?.code === "model_not_found") {
      message = "找不到這個 AI 模型。";
      status = 404; // 當作「這個模型不行」，換下一個
      已挑好的模型 = null; // 下次重新查模型清單
    } else if (status === 503 || status === 500) {
      message = "AI 現在太忙了，等一下再試。";
    } else if (status === 429) {
      message = "今天的免費額度用完了，或是問得太快，等一下再試。";
    }
    const error = new Error(message + detail);
    error.status = status;
    throw error;
  }

  // 從回傳的資料裡，把文字拿出來；萬一還有思考過程（<think>…</think>）就刪掉
  const text = (data.choices?.[0]?.message?.content || "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
  if (!text) {
    throw new Error("AI 這次沒有回答，換個說法再試一次。");
  }
  return text;
}

// 測試金鑰能不能用（設定頁的「測試連線」按鈕會用到）
async function testAIConnection(apiKey) {
  await askAI("你是一個測試程式。", "請只回答「OK」兩個字。", apiKey);
}
