function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendTelegramNotification(
  message,
  {
    token = process.env.TELEGRAM_BOT_TOKEN,
    chatId = process.env.TELEGRAM_CHAT_ID,
    fetchImpl = fetch,
  } = {},
) {
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID is not configured");

  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Telegram notification returned HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }

  return response.json();
}

export function draftReadyMessage({ date, article, projectUrl, result }) {
  const action = result.alreadyLive ? "already live" : result.updated ? "updated" : "created";
  return [
    `✅ <b>Daily news draft ${action}</b>`,
    `<b>Date:</b> ${escapeHtml(date)}`,
    `<b>Title:</b> ${escapeHtml(article.title)}`,
    `<b>Posts:</b> ${result.postCount ?? "—"}`,
    `<a href="${escapeHtml(projectUrl)}">Open Framer project</a>`,
  ].join("\n");
}

export function noPostsMessage({ date }) {
  return `ℹ️ <b>No Telegram posts found</b>\nNo draft was created for ${escapeHtml(date)}.`;
}

export function failureMessage({ date, error }) {
  return [
    "⚠️ <b>Daily news automation failed</b>",
    `<b>Date:</b> ${escapeHtml(date)}`,
    `<b>Error:</b> ${escapeHtml(error.message || String(error)).slice(0, 900)}`,
  ].join("\n");
}
