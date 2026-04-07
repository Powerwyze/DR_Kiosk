const DEFAULT_TRIGGER_API_URL = "https://triggers.app.pinkfish.ai/ext/triggers/d79rk05214qs73kh5hc0";
const DEFAULT_TRIGGER_API_KEY = "NeEkkkzAzF5JJpI1kqNJ71dAqvnxku531If8slLs";
const DEFAULT_API_KEY_HEADER = "x-api-key";
const DEFAULT_API_WAIT_HEADER = "x-api-wait";
const DEFAULT_API_WAIT_VALUE = "true";

function buildFilename(email) {
  const normalized = String(email || "")
    .trim()
    .toLowerCase()
    .replace(/[\[\]]/g, "");
  return normalized || "kiosk_capture";
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace(/[\[\]]/g, "");
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key, Authorization, x-api-wait");
  res.send(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const imageData = req.body?.imageData;
    const email = normalizeEmail(req.body?.email);

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
    const upstreamResponse = await fetch(upstreamUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const responseText = await upstreamResponse.text();
    if (!upstreamResponse.ok) {
      throw new Error(`Pinkfish returned ${upstreamResponse.status}: ${responseText}`);
    }

    let parsed;
    try {
      parsed = responseText ? JSON.parse(responseText) : {};
    } catch {
      parsed = { raw: responseText };
    }

    return sendJson(res, 200, {
      status: "success",
      email,
      fileName,
      upstreamResponse: {
        ...parsed,
        upstreamUrl,
      },
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error?.message || String(error),
    });
  }
};
