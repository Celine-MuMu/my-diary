// ============================================
// ai.js：跟 AI（Google Gemini）溝通
// 之後想換成其他 AI，只要改這個檔案
// ============================================

// 用哪個模型。"gemini-flash-latest" 會自動用最新的 Flash 版本
const AI_MODEL = "gemini-flash-latest";

// 問 AI 一個問題，回傳 AI 的回答（文字）
// systemPrompt：告訴 AI 要扮演誰（例如 Theo 的個性）
// userText：要給 AI 看的內容（例如今天的日記）
async function askAI(systemPrompt, userText, apiKey) {
  apiKey = apiKey || loadSettings().apiKey;
  if (!apiKey) {
    throw new Error("還沒有設定 Gemini API 金鑰，請到設定頁貼上。");
  }

  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + AI_MODEL + ":generateContent";

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
    if (response.status === 400 || response.status === 403) {
      throw new Error("API 金鑰好像不對，請到設定頁檢查。");
    }
    if (response.status === 429) {
      throw new Error("今天的免費額度用完了，或是問得太快，等一下再試。");
    }
    throw new Error("AI 暫時沒有回應（錯誤代碼 " + response.status + "），等一下再試。");
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
