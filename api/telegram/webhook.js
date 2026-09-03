import {
  getShareConfig,
  handleTelegramUpdate,
  isMessageNotModified,
  TelegramApiError,
} from "../../lib/share-buttons.js";

function respond(res, status, payload) {
  return res.status(status).json(payload);
}

function hasValidSecret(req, configuredSecret) {
  if (!configuredSecret) return process.env.NODE_ENV !== "production";
  const suppliedSecret =
    req.headers?.["x-telegram-bot-api-secret-token"] || req.headers?.["X-Telegram-Bot-Api-Secret-Token"];
  return suppliedSecret === configuredSecret;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  let body = req.body;
  if (typeof body !== "string") {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    body = Buffer.concat(chunks).toString("utf8");
  }
  if (!body) return null;
  return JSON.parse(body);
}

function isPermanentTelegramError(error) {
  return error instanceof TelegramApiError && error.status >= 400 && error.status < 500 && error.status !== 429;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respond(res, 405, { error: "Method not allowed" });
  }

  const config = getShareConfig();
  if (!hasValidSecret(req, config.webhookSecret)) return respond(res, 401, { error: "Unauthorized" });

  let update;
  try {
    update = await readJsonBody(req);
  } catch {
    return respond(res, 400, { error: "Invalid JSON body" });
  }

  if (!update || typeof update !== "object") return respond(res, 400, { error: "Update body is required" });

  try {
    const result = await handleTelegramUpdate(update, config);
    return respond(res, 200, { ok: true, updateId: update.update_id ?? null, ...result });
  } catch (error) {
    console.error("Telegram share-button webhook failed", {
      updateId: update.update_id ?? null,
      message: error.message,
      status: error.status,
      description: error.description,
    });

    // A permanent Bot API rejection (for example missing channel admin rights)
    // should be acknowledged so Telegram does not retry the same bad update
    // forever. Transient errors remain non-2xx and are eligible for retry.
    if (isPermanentTelegramError(error) && !isMessageNotModified(error)) {
      return respond(res, 200, { ok: false, updateId: update.update_id ?? null, error: "Telegram rejected the edit" });
    }
    return respond(res, 500, { ok: false, updateId: update.update_id ?? null, error: "Temporary processing failure" });
  }
}
