// ============================================
// ai.js：跟 AI 溝通
// 主力是 Groq（快），Groq 不行時自動換 Gemini（備援）
// 之後想換 AI 或調整順序，只要改這個檔案
// ============================================

// 依序嘗試的 AI。前一個失敗（太忙、額度用完、金鑰有問題……）就換下一個
// 沒設定金鑰的會自動跳過
const AI_順序 = [
  { 名稱: "Groq", 金鑰欄位: "groqKey", 問: askGroq },
  { 名稱: "Gemini", 金鑰欄位: "geminiKey", 問: askGemini },
];

// 問 AI 一個問題，回傳 AI 的回答（文字）
// systemPrompt：告訴 AI 要扮演誰（例如 Theo 的個性）
// userText：要給 AI 看的內容（例如今天的日記）
// options：{ json: true } 代表要 AI 用固定格式（JSON）回答
async function askAI(systemPrompt, userText, options) {
  const settings = loadSettings();
  const ready = AI_順序.filter(function (ai) { return settings[ai.金鑰欄位]; });
  if (ready.length === 0) {
    throw new Error("還沒有設定 AI 金鑰，請到設定頁貼上。");
  }

  // 每個 AI 都失敗的話，把各自的原因一起列出來
  const reasons = [];
  for (const ai of ready) {
    try {
      return await ai.問(systemPrompt, userText, settings[ai.金鑰欄位], options || {});
    } catch (e) {
      reasons.push(ai.名稱 + "：" + e.message);
    }
  }
  throw new Error(reasons.join("\n\n"));
}

// 測試某一個 AI 的金鑰能不能用（設定頁的「測試連線」會用到）
async function testAIConnection(aiName, apiKey) {
  const ai = AI_順序.find(function (item) { return item.名稱 === aiName; });
  await ai.問("你是一個測試程式。", "請只回答「OK」兩個字。", apiKey, {});
}

// ---------- 共用工具 ----------

// 送出請求，超過時間就放棄
async function postWithTimeout(url, headers, body, seconds) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, seconds * 1000);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: Object.assign({ "Content-Type": "application/json" }, headers),
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(function () { return {}; });
    return { response: response, data: data };
  } catch (e) {
    if (e.name === "AbortError") throw makeError("回得太慢了，等一下再試。", 408);
    throw makeError("連不上網路，請檢查網路後再試一次。", 0);
  } finally {
    clearTimeout(timer);
  }
}

// 做出一個帶有錯誤代碼的錯誤
function makeError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// 把錯誤代碼翻成好懂的話，後面附上 AI 回傳的原因，方便找問題
function explainError(status, detailMessage) {
  let message = "暫時沒有回應，等一下再試。";
  if (status === 401 || status === 403) message = "金鑰好像不能用，請到設定頁檢查。";
  else if (status === 404) message = "找不到這個 AI 模型。";
  else if (status === 429) message = "今天的免費額度用完了，或是問得太快。";
  else if (status === 500 || status === 503) message = "現在太忙了。";
  const detail = detailMessage ? "（" + status + "：" + detailMessage + "）" : "（錯誤代碼 " + status + "）";
  return makeError(message + detail, status);
}

// 依序試每個模型，模型不行（找不到、太慢、太忙）就換下一個
// 全部都不行時，優先回報「找不到模型」以外的原因（那通常才是真正的問題）
const 可以換模型的錯誤 = [404, 408, 500, 503];
async function tryModels(models, askOne) {
  const errors = [];
  for (const model of models) {
    try {
      return await askOne(model);
    } catch (e) {
      if (!可以換模型的錯誤.includes(e.status)) throw e; // 金鑰錯誤等問題，換模型也沒用
      errors.push(e);
    }
  }
  throw errors.find(function (e) { return e.status !== 404; }) || errors[0];
}

// ============================================
// Groq（主力）
// ============================================
const GROQ_網址 = "https://api.groq.com/openai/v1";

// 想用哪些模型。Groq 的模型常常改版，所以寫「名字裡有什麼」，App 會自動找目前有的版本
// 1. Qwen：中文是強項　2. gpt-oss-120b：聰明的備援
const GROQ_模型偏好 = [/qwen/i, /gpt-oss-120b/i];
const GROQ_預設模型 = ["qwen/qwen3.6-27b", "openai/gpt-oss-120b"]; // 查不到清單時用

async function askGroq(systemPrompt, userText, apiKey, options) {
  if (!apiKey.startsWith("gsk_")) {
    throw makeError("這好像不是 Groq 的金鑰（Groq 的金鑰是 gsk_ 開頭）。", 401);
  }
  const models = await pickGroqModels(apiKey);

  return tryModels(models, async function (model) {
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

    const { response, data } = await postWithTimeout(
      GROQ_網址 + "/chat/completions",
      { Authorization: "Bearer " + apiKey },
      body,
      30
    );

    if (!response.ok) {
      const code = data.error?.code;
      if (code === "model_decommissioned" || code === "model_not_found") {
        groq已挑好的模型 = null; // 下次重新查模型清單
        throw explainError(404, data.error?.message);
      }
      throw explainError(response.status, data.error?.message);
    }

    // 萬一還有思考過程（<think>…</think>）就刪掉
    const text = (data.choices?.[0]?.message?.content || "")
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim();
    if (!text) throw makeError("這次沒有回答，換個說法再試一次。", 0);
    return text;
  });
}

// 查 Groq 現在有哪些模型，照偏好挑出要用的（查過一次就記住）
let groq已挑好的模型 = null;
async function pickGroqModels(apiKey) {
  if (groq已挑好的模型) return groq已挑好的模型;
  try {
    const response = await fetch(GROQ_網址 + "/models", {
      headers: { Authorization: "Bearer " + apiKey },
    });
    if (!response.ok) return GROQ_預設模型;

    const data = await response.json();
    const ids = (data.data || [])
      .map(function (model) { return model.id; })
      // 排除不是用來聊天的模型（語音、安全過濾等）
      .filter(function (id) { return !/whisper|tts|guard|orpheus|compound|safeguard/i.test(id); })
      .sort()
      .reverse(); // 版本號大的排前面

    const picked = [];
    for (const pattern of GROQ_模型偏好) {
      const found = ids.find(function (id) { return pattern.test(id); });
      if (found) picked.push(found);
    }
    groq已挑好的模型 = picked.length > 0 ? picked : GROQ_預設模型;
    return groq已挑好的模型;
  } catch (e) {
    return GROQ_預設模型;
  }
}

// ============================================
// Gemini（備援）
// ============================================
// 都會「先思考再回答」；不用比較笨的 Lite 版
// Gemini 的模型也常常改名，所以 App 會自動查目前有哪些 Flash 模型，挑最新的
const GEMINI_預設模型 = ["gemini-flash-latest", "gemini-3.8-flash"]; // 查不到清單時用

let gemini已挑好的模型 = null;
async function pickGeminiModels(apiKey) {
  if (gemini已挑好的模型) return gemini已挑好的模型;
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!response.ok) return GEMINI_預設模型;

    const data = await response.json();
    const flash = (data.models || [])
      .filter(function (model) { return (model.supportedGenerationMethods || []).includes("generateContent"); })
      .map(function (model) { return model.name.replace("models/", ""); })
      // 只要一般的 Flash：不要 Lite（比較笨）、不要圖片／語音／實驗版
      .filter(function (name) { return /^gemini-[\d.]+-flash$/.test(name); })
      .sort(function (a, b) { return parseFloat(b.split("-")[1]) - parseFloat(a.split("-")[1]); }); // 版本新的排前面

    // 先試「最新版」的別名，再試查到的最新版本
    gemini已挑好的模型 = ["gemini-flash-latest"].concat(flash.slice(0, 1));
    return gemini已挑好的模型;
  } catch (e) {
    return GEMINI_預設模型;
  }
}

async function askGemini(systemPrompt, userText, apiKey, options) {
  const models = await pickGeminiModels(apiKey);
  return tryModels(models, async function (model) {
    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {},
    };
    if (options.json) body.generationConfig.responseMimeType = "application/json";

    const { response, data } = await postWithTimeout(
      "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
      { "x-goog-api-key": apiKey },
      body,
      40
    );

    if (!response.ok) {
      if (response.status === 404) gemini已挑好的模型 = null; // 下次重新查模型清單
      // Gemini 金鑰錯誤有時候回 400
      const status = response.status === 400 ? 401 : response.status;
      throw explainError(status, data.error?.message);
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.map(function (part) { return part.text || ""; }).join("").trim();
    if (!text) throw makeError("這次沒有回答，換個說法再試一次。", 0);
    return text;
  });
}
