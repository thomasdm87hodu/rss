import { load } from "cheerio";

export const DEFAULT_CHANNEL = "bin_dailyupdate";
export const DEFAULT_MAX_PAGES = 20;

function normalizeChannel(value) {
  const input = value || DEFAULT_CHANNEL;
  const withoutProtocol = input.replace(/^https?:\/\//i, "");
  const withoutPath = withoutProtocol.replace(/^t\.me\//i, "").split(/[?#/]/)[0];
  return withoutPath.replace(/^@/, "");
}

export function getTelegramPreviewUrl(channel = process.env.TELEGRAM_CHANNEL) {
  return `https://t.me/s/${normalizeChannel(channel)}`;
}

function normalizeText(value) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripSourceFooter(value) {
  return value
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !/^follow:\s*@\S+/i.test(trimmed) && !/^get daily updates:\s*\S+/i.test(trimmed);
    })
    .join("\n");
}

function absoluteUrl(value, baseUrl) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

export function parseTelegramPreview(html, pageUrl = getTelegramPreviewUrl()) {
  const $ = load(html);
  const posts = [];

  $(".tgme_widget_message").each((_, element) => {
    const message = $(element);
    const content = message.clone();

    // Replies are not part of the channel post. Forwarded bodies are the
    // intended source for BIN Daily Update, so keep them while removing only
    // the forwarding metadata.
    content.find(".tgme_widget_message_reply").remove();
    content
      .find(".tgme_widget_message_forwarded_from_name, .tgme_widget_message_forwarded_from_author")
      .remove();

    const textElement = content.find(".tgme_widget_message_text").first();
    textElement.find("br").replaceWith("\n");
    const text = normalizeText(stripSourceFooter(textElement.text()));
    const dateElement = message.find(".tgme_widget_message_date").first();
    const timeElement = dateElement.find("time").first();
    const publishedAtValue = timeElement.attr("datetime") || dateElement.attr("datetime");
    const publishedAt = publishedAtValue ? new Date(publishedAtValue) : null;

    if (!text || !publishedAt || Number.isNaN(publishedAt.getTime())) return;

    const url = absoluteUrl(dateElement.attr("href"), pageUrl);
    const id = message.attr("data-post") || url || `${publishedAt.toISOString()}-${text}`;

    posts.push({
      id,
      text,
      publishedAt: publishedAt.toISOString(),
      url,
    });
  });

  const moreLink = $(".tme_messages_more").first();
  const nextHref = moreLink.attr("href") || moreLink.find("a").first().attr("href");

  return {
    posts,
    nextUrl: absoluteUrl(nextHref, pageUrl),
  };
}

export function getUtcDayWindow({ date, now = new Date() } = {}) {
  const dateText = date || now.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    throw new Error("date must use YYYY-MM-DD format");
  }

  const start = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new Error("date is not valid");

  const nextDay = new Date(start);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const requestedEnd = date ? new Date(nextDay.getTime() - 1) : now;
  const end = new Date(Math.min(requestedEnd.getTime(), nextDay.getTime() - 1));

  return {
    date: dateText,
    start,
    end,
  };
}

export async function fetchDailyTelegramPosts({
  window,
  fetchImpl = fetch,
  maxPages = Number(process.env.MAX_TELEGRAM_PAGES || DEFAULT_MAX_PAGES),
  channel = process.env.TELEGRAM_CHANNEL,
} = {}) {
  if (!window) throw new Error("A UTC day window is required");

  const headers = {
    "user-agent": "Mozilla/5.0 (compatible; DailyNewsAutomation/1.0)",
    accept: "text/html,application/xhtml+xml",
  };
  const results = new Map();
  let pageUrl = getTelegramPreviewUrl(channel);

  for (let pageNumber = 0; pageNumber < maxPages && pageUrl; pageNumber += 1) {
    const response = await fetchImpl(pageUrl, { headers });
    if (!response.ok) {
      throw new Error(`Telegram preview returned HTTP ${response.status}`);
    }

    const parsed = parseTelegramPreview(await response.text(), pageUrl);
    let oldestPublishedAt = null;

    for (const post of parsed.posts) {
      const publishedAt = new Date(post.publishedAt);
      if (!oldestPublishedAt || publishedAt < oldestPublishedAt) {
        oldestPublishedAt = publishedAt;
      }

      if (publishedAt >= window.start && publishedAt <= window.end) {
        results.set(post.id, post);
      }
    }

    if (oldestPublishedAt && oldestPublishedAt < window.start) break;
    if (!parsed.nextUrl || parsed.nextUrl === pageUrl) break;
    pageUrl = parsed.nextUrl;
  }

  return [...results.values()].sort(
    (left, right) => new Date(left.publishedAt).getTime() - new Date(right.publishedAt).getTime(),
  );
}
