const DEFAULT_TRIGGER_API_URL = "https://triggers.app.pinkfish.ai/ext/triggers/d79rk05214qs73kh5hc0";
const DEFAULT_TRIGGER_API_KEY = "NeEkkkzAzF5JJpI1kqNJ71dAqvnxku531If8slLs";
const DEFAULT_API_KEY_HEADER = "x-api-key";
const DEFAULT_API_WAIT_HEADER = "x-api-wait";
const DEFAULT_API_WAIT_VALUE = "true";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEBUG_ENV_FLAG = "DEBUG_UPLOADS";
const FALLBACK_STYLE_LINES = [
  "Your outfit looks vibrant and camera-ready, with a confident style that really stands out.",
  "Your look is polished and expressive, and your color choices make the photo pop.",
  "You are wearing a sharp, fun look that feels perfect for this Dominican Republic moment.",
];
const FALLBACK_ACTIVITY_LINES = [
  "For fun in the Dominican Republic, take a sunset stroll through the Colonial Zone in Santo Domingo.",
  "For fun in the Dominican Republic, dance to live merengue at a local night spot.",
  "For fun in the Dominican Republic, visit a beach in Puerto Plata and try fresh local food after.",
];

function buildFilename(email) {
  const normalized = String(email || "")
    .trim()
    .toLowerCase()
    .replace(/[\[\]\s]+/g, "")
    .replace(/[<>:\"/\\|?*\x00-\x1f\x7f]/g, "");
  return normalized || "kiosk_capture";
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace(/[\[\]\s]+/g, "");
}

function resolveUpstreamConfig() {
  const upstreamUrl = (process.env.PINKFISH_TRIGGER_API_URL || DEFAULT_TRIGGER_API_URL).trim();
  const apiKey = (process.env.PINKFISH_API_KEY || DEFAULT_TRIGGER_API_KEY).trim();
  const apiKeyHeader = (process.env.PINKFISH_API_KEY_HEADER || DEFAULT_API_KEY_HEADER).trim() || DEFAULT_API_KEY_HEADER;
  const apiWaitHeader = (process.env.PINKFISH_API_WAIT_HEADER || DEFAULT_API_WAIT_HEADER).trim() || DEFAULT_API_WAIT_HEADER;
  const apiWaitValue = (process.env.PINKFISH_API_WAIT_VALUE || DEFAULT_API_WAIT_VALUE).trim() || DEFAULT_API_WAIT_VALUE;

  if (!apiKey) {
    throw new Error("Missing Pinkfish API key.");
  }

  return {
    upstreamUrl,
    headers: {
      "Content-Type": "application/json",
      [apiKeyHeader]: apiKey,
      [apiWaitHeader]: apiWaitValue,
    },
  };
}

function sendJson(res, statusCode, payload) {
  res.status(statusCode).setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key, Authorization, x-api-wait, x-request-id, x-debug");
  res.send(JSON.stringify(payload));
}

function isDebugEnabled(req) {
  const headerFlag = String(req.headers["x-debug"] || "").trim() === "1";
  const envFlag = String(process.env[DEBUG_ENV_FLAG] || "").trim() === "1";
  return headerFlag || envFlag;
}

function getRequestId(req) {
  const incoming = String(req.headers["x-request-id"] || "").trim();
  if (incoming) {
    return incoming.slice(0, 128);
  }
  return `srv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function logEvent(requestId, label, details) {
  const payload = {
    ts: new Date().toISOString(),
    requestId,
    label,
    ...details,
  };
  console.info(`[DR_UPLOAD] ${JSON.stringify(payload)}`);
}

function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

function buildFallbackStyleMessage() {
  return `${pickRandom(FALLBACK_STYLE_LINES)} ${pickRandom(FALLBACK_ACTIVITY_LINES)}`.trim();
}

function extractResponseText(responsePayload) {
  if (typeof responsePayload?.output_text === "string" && responsePayload.output_text.trim()) {
    return responsePayload.output_text.trim();
  }

  const outputItems = Array.isArray(responsePayload?.output) ? responsePayload.output : [];
  const chunks = [];
  for (const item of outputItems) {
    const contentItems = Array.isArray(item?.content) ? item.content : [];
    for (const contentItem of contentItems) {
      if (typeof contentItem?.text === "string" && contentItem.text.trim()) {
        chunks.push(contentItem.text.trim());
      }
    }
  }

  return chunks.join(" ").trim();
}

async function generateStyleMessage(imageData, requestId) {
  const openAiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const openAiModel = String(process.env.OPENAI_VISION_MODEL || DEFAULT_OPENAI_MODEL).trim() || DEFAULT_OPENAI_MODEL;

  if (!openAiKey) {
    logEvent(requestId, "style.fallback.no_key", {});
    return { message: buildFallbackStyleMessage(), source: "fallback_no_key" };
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: openAiModel,
        max_output_tokens: 120,
        temperature: 0.8,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "You write upbeat, short kiosk messages for visitors in the Dominican Republic.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "From this photo, write exactly 2 short sentences. Sentence 1: compliment what the person is wearing. Sentence 2: suggest one fun activity to do in the Dominican Republic. Keep it positive, specific, and concise.",
              },
              {
                type: "input_image",
                image_url: imageData,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI returned ${response.status}`);
    }

    const responsePayload = await response.json();
    const text = extractResponseText(responsePayload);
    if (!text) {
      throw new Error("OpenAI response was empty");
    }

    return { message: text, source: "openai" };
  } catch (error) {
    logEvent(requestId, "style.fallback.error", {
      message: error?.message || String(error),
    });
    return { message: buildFallbackStyleMessage(), source: "fallback_error" };
  }
}

module.exports = async function handler(req, res) {
  const requestId = getRequestId(req);
  const debugEnabled = isDebugEnabled(req);
  res.setHeader("x-request-id", requestId);

  if (req.method === "OPTIONS") {
    return sendJson(res, 204, { requestId });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed", requestId });
  }

  try {
    const startedAt = Date.now();
    const imageData = req.body?.imageData;
    const email = normalizeEmail(req.body?.email);
    logEvent(requestId, "request.received", {
      debugEnabled,
      hasImageData: Boolean(imageData),
      imageDataLength: typeof imageData === "string" ? imageData.length : 0,
      email,
    });

    if (!imageData) {
      throw new Error("Missing imageData");
    }
    if (!email) {
      throw new Error("Missing email");
    }

    const fileName = buildFilename(email);
    const payload = {
      imageUrl: imageData,
      email,
      fileName,
    };

    const { upstreamUrl, headers } = resolveUpstreamConfig();
    const [upstreamResponse, styleResult] = await Promise.all([
      fetch(upstreamUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }),
      generateStyleMessage(imageData, requestId),
    ]);

    const responseText = await upstreamResponse.text();
    logEvent(requestId, "upstream.response", {
      status: upstreamResponse.status,
      ok: upstreamResponse.ok,
      durationMs: Date.now() - startedAt,
    });
    logEvent(requestId, "style.message.ready", {
      source: styleResult.source,
      hasMessage: Boolean(styleResult.message),
    });

    if (!upstreamResponse.ok) {
      throw new Error(`Pinkfish returned ${upstreamResponse.status}: ${responseText}`);
    }

    let parsed;
    try {
      parsed = responseText ? JSON.parse(responseText) : {};
    } catch {
      parsed = { raw: responseText };
    }

    const successPayload = {
      status: "success",
      requestId,
      email,
      fileName,
      styleMessage: styleResult.message,
      styleSource: styleResult.source,
      upstreamResponse: {
        ...parsed,
        upstreamUrl,
      },
    };

    if (debugEnabled) {
      successPayload.debug = {
        upstreamSummary: {
          triggerId: parsed?.triggerId || null,
          runId: parsed?.id || null,
          resultCount: Array.isArray(parsed?.results) ? parsed.results.length : null,
        },
        imageDataLength: typeof imageData === "string" ? imageData.length : 0,
        durationMs: Date.now() - startedAt,
      };
    }

    return sendJson(res, 200, successPayload);
  } catch (error) {
    logEvent(requestId, "request.error", {
      message: error?.message || String(error),
    });

    const errorPayload = {
      error: error?.message || String(error),
      requestId,
    };

    if (debugEnabled) {
      errorPayload.debug = {
        stack: error?.stack || null,
      };
    }

    return sendJson(res, 500, errorPayload);
  }
};
