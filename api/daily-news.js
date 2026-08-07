import { generateDailyArticle } from "../lib/article.js";
import { saveFramerDraft } from "../lib/framer.js";
import {
  draftReadyMessage,
  failureMessage,
  noPostsMessage,
  sendTelegramNotification,
} from "../lib/notify.js";
import { fetchDailyTelegramPosts, getUtcDayWindow } from "../lib/telegram.js";

function getQuery(req) {
  try {
    return new URL(req.url || "/api/daily-news", "https://localhost").searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return req.headers?.authorization === `Bearer ${cronSecret}`;
}

function respond(res, status, payload) {
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return respond(res, 405, { error: "Method not allowed" });
  }

  if (!isAuthorized(req)) return respond(res, 401, { error: "Unauthorized" });

  let window;
  try {
    const query = getQuery(req);
    window = getUtcDayWindow({ date: query.get("date") || undefined });
  } catch (error) {
    return respond(res, 400, { error: error.message });
  }

  try {
    const posts = await fetchDailyTelegramPosts({ window });

    if (!posts.length) {
      await sendTelegramNotification(noPostsMessage({ date: window.date }));
      return respond(res, 200, { ok: true, date: window.date, posts: 0, draft: false });
    }

    const article = await generateDailyArticle({ posts, date: window.date });
    const projectUrl = process.env.FRAMER_PROJECT_URL || "https://framer.com/projects/BibliWatch--CIvjMsjQrZM82VnQbyfP-hYBk8";
    const result = await saveFramerDraft({ article, date: window.date, projectUrl });
    result.postCount = posts.length;

    await sendTelegramNotification(draftReadyMessage({ date: window.date, article, projectUrl, result }));
    return respond(res, 200, {
      ok: true,
      date: window.date,
      posts: posts.length,
      draft: true,
      itemId: result.item?.id || null,
      slug: result.item?.slug || null,
      created: result.created,
      updated: result.updated,
      alreadyLive: result.alreadyLive || false,
    });
  } catch (error) {
    try {
      await sendTelegramNotification(failureMessage({ date: window.date, error }));
    } catch {
      // Preserve the original error response if notification setup is incomplete.
    }
    console.error("Daily news automation failed", error);
    return respond(res, 500, { ok: false, date: window.date, error: error.message });
  }
}
