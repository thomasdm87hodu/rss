import { DEFAULT_ALLOWED_UPDATES, getShareConfig } from "../lib/share-buttons.js";

const config = getShareConfig();
const replaceWebhook = process.argv.includes("--replace-webhook");

function fail(message) {
  console.error(`Setup failed: ${message}`);
  process.exitCode = 1;
}

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

async function telegram(method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || result?.ok !== true) {
    throw new Error(`${method} failed (${response.status}): ${result?.description || "Unknown Telegram API error"}`);
  }
  return result.result;
}

try {
  requireValue(config.token, "set the dedicated TELEGRAM_SHARE_BOT_TOKEN for @biblishare_bot");
  requireValue(config.publicBaseUrl, "set PUBLIC_BASE_URL to the deployed HTTPS origin");
  requireValue(config.webhookSecret, "set TELEGRAM_WEBHOOK_SECRET");
  requireValue(config.botUsername, "set BOT_USERNAME to the bot username without @");
  requireValue(
    config.allowedChannelUsername || config.allowedChannelId,
    "set TELEGRAM_ALLOWED_CHANNEL_USERNAME or TELEGRAM_ALLOWED_CHANNEL_ID",
  );

  const baseUrl = new URL(config.publicBaseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("PUBLIC_BASE_URL must use https://");
  const webhookUrl = new URL("/api/telegram/webhook", baseUrl).toString();
  const targetChat = config.allowedChannelId || `@${config.allowedChannelUsername}`;

  const bot = await telegram("getMe");
  const chat = await telegram("getChat", { chat_id: targetChat });
  const membership = await telegram("getChatMember", { chat_id: chat.id, user_id: bot.id });
  const isAdmin = membership.status === "administrator" || membership.status === "creator";
  const canEdit = membership.status === "creator" || membership.can_edit_messages === true;

  if (!isAdmin || !canEdit) {
    throw new Error(
      `@${bot.username || config.botUsername} must be a channel administrator with Edit Messages enabled ` +
        `(current status: ${membership.status}, can_edit_messages: ${Boolean(membership.can_edit_messages)})`,
    );
  }
  if (bot.username && bot.username.toLowerCase() !== config.botUsername.toLowerCase()) {
    throw new Error(`BOT_USERNAME does not match the token's bot (@${bot.username})`);
  }

  const existing = await telegram("getWebhookInfo");
  if (existing.url && existing.url !== webhookUrl && !replaceWebhook) {
    throw new Error(
      `This bot already has a different webhook (${existing.url}). ` +
        "Use --replace-webhook only if replacing it is intentional.",
    );
  }

  await telegram("setWebhook", {
    url: webhookUrl,
    secret_token: config.webhookSecret,
    allowed_updates: DEFAULT_ALLOWED_UPDATES,
    drop_pending_updates: false,
  });

  const finalInfo = await telegram("getWebhookInfo");
  console.log(
    JSON.stringify(
      {
        ok: true,
        bot: bot.username ? `@${bot.username}` : null,
        channel: { id: chat.id, username: chat.username || null, title: chat.title || null },
        membership: { status: membership.status, can_edit_messages: Boolean(membership.can_edit_messages) },
        webhook: {
          url: finalInfo.url,
          pending_update_count: finalInfo.pending_update_count,
          last_error_message: finalInfo.last_error_message || null,
          allowed_updates: finalInfo.allowed_updates || DEFAULT_ALLOWED_UPDATES,
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  fail(error.message);
}
