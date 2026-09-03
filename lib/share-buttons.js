const COPY_TEXT_ERROR_MARKERS = [
  "copy_text",
  "copy text",
  "button_type_invalid",
];

const USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 512;

export const DEFAULT_ALLOWED_UPDATES = ["channel_post", "edited_channel_post"];
export const SHARE_BUTTON_LABELS = Object.freeze({
  facebook: "Facebook",
  x: "𝕏",
  telegram: "Telegram",
  copy: "Copy Link",
  promotion: "➕ Add to your channel",
});

export class TelegramApiError extends Error {
  constructor({ method, status, description, parameters }) {
    super(`${method} failed (${status}): ${description || "Unknown Telegram API error"}`);
    this.name = "TelegramApiError";
    this.method = method;
    this.status = status;
    this.description = description || "Unknown Telegram API error";
    this.parameters = parameters || null;
  }
}

function normalizeUsername(value) {
  if (!value) return "";
  return String(value)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^t\.me\//i, "")
    .split(/[?#/]/)[0]
    .replace(/^@/, "");
}

function normalizeCopyTextMode(value) {
  const normalized = String(value || "auto").trim().toLowerCase();
  if (["false", "0", "off", "no", "fallback", "disabled"].includes(normalized)) {
    return "fallback";
  }
  if (["true", "1", "on", "yes", "copy_text", "enabled"].includes(normalized)) {
    return "copy_text";
  }
  return "auto";
}

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || String(value).trim() === "") return defaultValue;
  return ["true", "1", "yes", "on", "enabled"].includes(String(value).trim().toLowerCase());
}

function normalizeId(value) {
  const normalized = String(value ?? "").trim();
  return normalized || "";
}

export function getShareConfig(env = process.env) {
  return {
    // Keep this token separate from TELEGRAM_BOT_TOKEN, which belongs to the
    // existing BIN/review automation. A dedicated token must be configured for
    // this webhook so setting its webhook cannot affect that other bot.
    token: String(env.TELEGRAM_SHARE_BOT_TOKEN || "").trim(),
    allowedChannelUsername: normalizeUsername(env.TELEGRAM_ALLOWED_CHANNEL_USERNAME),
    allowedChannelId: normalizeId(env.TELEGRAM_ALLOWED_CHANNEL_ID),
    botUsername: normalizeUsername(env.BOT_USERNAME),
    webhookSecret: String(env.TELEGRAM_WEBHOOK_SECRET || "").trim(),
    publicBaseUrl: String(env.PUBLIC_BASE_URL || "").trim(),
    copyTextMode: normalizeCopyTextMode(env.TELEGRAM_COPY_TEXT),
    showAddToChannelButton: normalizeBoolean(env.SHOW_ADD_TO_CHANNEL_BUTTON, false),
  };
}

export function isAllowedChannel(message, { allowedChannelUsername, allowedChannelId } = {}) {
  const chat = message?.chat;
  if (!chat || chat.type !== "channel") return false;

  const expectedId = normalizeId(allowedChannelId);
  if (expectedId && String(chat.id) === expectedId) return true;

  const expectedUsername = normalizeUsername(allowedChannelUsername);
  return Boolean(
    expectedUsername && normalizeUsername(chat.username).toLowerCase() === expectedUsername.toLowerCase(),
  );
}

export function getChannelPostUrl(message, { allowedChannelUsername } = {}) {
  const messageId = Number(message?.message_id);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    throw new Error("Channel post is missing a valid message_id");
  }

  const username = normalizeUsername(message?.chat?.username || allowedChannelUsername);
  if (username) return `https://t.me/${username}/${messageId}`;

  // Telegram's public message URL is unavailable for a private channel, but
  // this c/ form is still useful to members who have access to that channel.
  const chatId = String(message?.chat?.id || "");
  if (/^-100\d+$/.test(chatId)) return `https://t.me/c/${chatId.slice(4)}/${messageId}`;

  throw new Error("Channel post has no usable public username or channel id");
}

function assertBotUsername(botUsername) {
  const normalized = normalizeUsername(botUsername);
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new Error("BOT_USERNAME must be the bot username without @ (5-32 letters, numbers, or underscores)");
  }
  return normalized;
}

export function buildPromotionButton({ botUsername } = {}) {
  const username = assertBotUsername(botUsername);
  return {
    text: SHARE_BUTTON_LABELS.promotion,
    url: `https://t.me/${username}?startchannel&admin=edit_messages`,
  };
}

export function buildCopyFallbackUrl(postUrl, publicBaseUrl = "") {
  if (publicBaseUrl) {
    try {
      const base = new URL(publicBaseUrl);
      if (base.protocol === "https:" || base.protocol === "http:") {
        const sharePage = new URL("/api/share", base);
        sharePage.searchParams.set("url", postUrl);
        return sharePage.toString();
      }
    } catch {
      // Fall through to Telegram's share page when PUBLIC_BASE_URL is invalid.
    }
  }

  const telegramShare = new URL("https://t.me/share/url");
  telegramShare.searchParams.set("url", postUrl);
  telegramShare.searchParams.set("text", "Copy this link");
  return telegramShare.toString();
}

function buildFacebookUrl(postUrl) {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`;
}

function buildXUrl(postUrl) {
  return `https://x.com/intent/tweet?url=${encodeURIComponent(postUrl)}&text=${encodeURIComponent(
    "Breaking Israel + News",
  )}`;
}

function buildTelegramUrl(postUrl) {
  return `https://t.me/share/url?url=${encodeURIComponent(postUrl)}&text=${encodeURIComponent(
    "Breaking Israel + News",
  )}`;
}

function isManagedButton(button) {
  return Boolean(button && typeof button === "object" && Object.values(SHARE_BUTTON_LABELS).includes(button.text));
}

function removeManagedButtons(markup) {
  const rows = Array.isArray(markup?.inline_keyboard) ? markup.inline_keyboard : [];
  return rows
    .filter(Array.isArray)
    .map((row) => row.filter((button) => !isManagedButton(button)))
    .filter((row) => row.length > 0);
}

function buildManagedRows({ postUrl, botUsername, copyText, publicBaseUrl, showAddToChannelButton }) {
  const copyButton = copyText
    ? { text: SHARE_BUTTON_LABELS.copy, copy_text: { text: postUrl } }
    : { text: SHARE_BUTTON_LABELS.copy, url: buildCopyFallbackUrl(postUrl, publicBaseUrl) };

  const rows = [
    [
      { text: SHARE_BUTTON_LABELS.facebook, url: buildFacebookUrl(postUrl) },
      { text: SHARE_BUTTON_LABELS.x, url: buildXUrl(postUrl) },
      { text: SHARE_BUTTON_LABELS.telegram, url: buildTelegramUrl(postUrl) },
    ],
    [copyButton],
  ];

  if (showAddToChannelButton) {
    // Keep this as the final button on its own row so the promotional flow is
    // visually separate from the post-sharing controls.
    rows.push([buildPromotionButton({ botUsername })]);
  }

  return rows;
}

export function buildShareKeyboard({
  postUrl,
  existingMarkup,
  botUsername,
  copyText = true,
  publicBaseUrl,
  showAddToChannelButton = false,
} = {}) {
  if (!postUrl) throw new Error("postUrl is required to build share buttons");

  return {
    inline_keyboard: [
      ...removeManagedButtons(existingMarkup),
      ...buildManagedRows({ postUrl, botUsername, copyText, publicBaseUrl, showAddToChannelButton }),
    ],
  };
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function keyboardsEqual(left, right) {
  return stableSerialize(left) === stableSerialize(right);
}

export function isCopyTextUnsupported(error) {
  if (!error || Number(error.status) !== 400) return false;
  const description = String(error.description || error.message || "").toLowerCase();
  return COPY_TEXT_ERROR_MARKERS.some((marker) => description.includes(marker));
}

export function isMessageNotModified(error) {
  return Number(error?.status) === 400 && /message is not modified/i.test(String(error.description || error.message));
}

export async function telegramRequest(method, payload, { token, fetchImpl = fetch } = {}) {
  if (!token) throw new Error("TELEGRAM_SHARE_BOT_TOKEN is not configured");

  const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    result = { ok: false, description: "Telegram returned a non-JSON response" };
  }

  if (!response.ok || result?.ok !== true) {
    throw new TelegramApiError({
      method,
      status: response.status || 500,
      description: result?.description,
      parameters: result?.parameters,
    });
  }

  return result.result;
}

export async function editMessageReplyMarkup({
  token,
  chatId,
  messageId,
  replyMarkup,
  fetchImpl = fetch,
} = {}) {
  return telegramRequest(
    "editMessageReplyMarkup",
    { chat_id: chatId, message_id: messageId, reply_markup: replyMarkup },
    { token, fetchImpl },
  );
}

const inFlightEdits = new Map();
const recentHandledMessages = new Map();
const recentUpdateIds = new Map();

function pruneCache(cache, now = Date.now()) {
  for (const [key, timestamp] of cache) {
    if (now - timestamp > CACHE_TTL_MS) cache.delete(key);
  }
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}

function cacheHas(cache, key, now = Date.now()) {
  pruneCache(cache, now);
  const timestamp = cache.get(key);
  return timestamp !== undefined && now - timestamp <= CACHE_TTL_MS;
}

function cacheSet(cache, key, now = Date.now()) {
  cache.set(key, now);
  pruneCache(cache, now);
}

function rememberSuccessfulProcessing(messageKey, updateId) {
  cacheSet(recentHandledMessages, messageKey);
  if (updateId !== undefined && updateId !== null) cacheSet(recentUpdateIds, String(updateId));
}

export async function addShareButtonsToChannelPost(message, options = {}) {
  const config = getShareConfig();
  const allowedChannelUsername = options.allowedChannelUsername ?? config.allowedChannelUsername;
  const allowedChannelId = options.allowedChannelId ?? config.allowedChannelId;
  const token = options.token ?? config.token;
  const botUsername = options.botUsername ?? config.botUsername;
  const publicBaseUrl = options.publicBaseUrl ?? config.publicBaseUrl;
  const copyTextMode = options.copyTextMode ?? config.copyTextMode;
  const showAddToChannelButton = options.showAddToChannelButton ?? config.showAddToChannelButton;
  const updateId = options.updateId;
  const updateType = options.updateType || "channel_post";

  if (!allowedChannelUsername && !allowedChannelId) {
    throw new Error("TELEGRAM_ALLOWED_CHANNEL_USERNAME or TELEGRAM_ALLOWED_CHANNEL_ID is not configured");
  }
  if (!isAllowedChannel(message, { allowedChannelUsername, allowedChannelId })) {
    return { status: "ignored", reason: "channel-not-allowed" };
  }

  const postUrl = getChannelPostUrl(message, { allowedChannelUsername });
  const messageKey = `${message.chat.id}:${message.message_id}`;
  const updateKey = updateId === undefined || updateId === null ? "" : String(updateId);

  if (updateKey && cacheHas(recentUpdateIds, updateKey)) {
    return { status: "skipped", reason: "duplicate-update", messageId: message.message_id };
  }

  const wantsCopyText = copyTextMode !== "fallback";
  const primaryMarkup = buildShareKeyboard({
    postUrl,
    existingMarkup: message.reply_markup,
    botUsername,
    copyText: wantsCopyText,
    publicBaseUrl,
    showAddToChannelButton,
  });

  if (keyboardsEqual(message.reply_markup, primaryMarkup)) {
    rememberSuccessfulProcessing(messageKey, updateId);
    return { status: "skipped", reason: "already-configured", messageId: message.message_id };
  }

  // A duplicate channel_post can arrive after a successful call but before
  // Telegram has delivered our edited_channel_post update. This cache avoids a
  // second edit in a warm Vercel instance. An edited post is always evaluated
  // again so a human edit that removed the buttons can be repaired.
  if (updateType === "channel_post" && cacheHas(recentHandledMessages, messageKey)) {
    rememberSuccessfulProcessing(messageKey, updateId);
    return { status: "skipped", reason: "duplicate-message", messageId: message.message_id };
  }

  const existingWork = inFlightEdits.get(messageKey);
  if (existingWork) return existingWork;

  const work = (async () => {
    try {
      await editMessageReplyMarkup({
        token,
        chatId: message.chat.id,
        messageId: message.message_id,
        replyMarkup: primaryMarkup,
        fetchImpl: options.fetchImpl,
      });
      rememberSuccessfulProcessing(messageKey, updateId);
      return {
        status: "updated",
        messageId: message.message_id,
        postUrl,
        copyText: wantsCopyText,
        fallback: false,
      };
    } catch (error) {
      if (isMessageNotModified(error)) {
        rememberSuccessfulProcessing(messageKey, updateId);
        return { status: "skipped", reason: "already-configured", messageId: message.message_id };
      }
      if (!wantsCopyText || !isCopyTextUnsupported(error)) throw error;

      const fallbackMarkup = buildShareKeyboard({
        postUrl,
        existingMarkup: message.reply_markup,
        botUsername,
        copyText: false,
        publicBaseUrl,
        showAddToChannelButton,
      });

      try {
        await editMessageReplyMarkup({
          token,
          chatId: message.chat.id,
          messageId: message.message_id,
          replyMarkup: fallbackMarkup,
          fetchImpl: options.fetchImpl,
        });
      } catch (fallbackError) {
        if (!isMessageNotModified(fallbackError)) throw fallbackError;
      }

      rememberSuccessfulProcessing(messageKey, updateId);
      return {
        status: "updated",
        messageId: message.message_id,
        postUrl,
        copyText: false,
        fallback: true,
      };
    }
  })();

  inFlightEdits.set(messageKey, work);
  try {
    return await work;
  } finally {
    inFlightEdits.delete(messageKey);
  }
}

export async function handleTelegramUpdate(update, options = {}) {
  if (update?.channel_post) {
    return addShareButtonsToChannelPost(update.channel_post, {
      ...options,
      updateId: update.update_id,
      updateType: "channel_post",
    });
  }
  if (update?.edited_channel_post) {
    return addShareButtonsToChannelPost(update.edited_channel_post, {
      ...options,
      updateId: update.update_id,
      updateType: "edited_channel_post",
    });
  }
  return { status: "ignored", reason: "not-a-channel-post" };
}
