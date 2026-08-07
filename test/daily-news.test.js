import test from "node:test";
import assert from "node:assert/strict";

import { formatPostsForPrompt, generateDailyArticle } from "../lib/article.js";
import { getUtcDayWindow, parseTelegramPreview } from "../lib/telegram.js";

test("parses text posts while excluding replies and forwarded blocks", () => {
  const html = `
    <div class="tgme_widget_message" data-post="channel/1">
      <div class="tgme_widget_message_text">Main post<br>with a second line</div>
      <div class="tgme_widget_message_reply"><div class="tgme_widget_message_text">Reply text</div></div>
      <div class="tgme_widget_message_date"><time datetime="2026-08-07T18:00:00+00:00"></time><a href="https://t.me/channel/1"></a></div>
    </div>
    <div class="tgme_widget_message" data-post="channel/2">
      <div class="tgme_widget_message_forwarded_from"><div class="tgme_widget_message_text">Forwarded text</div></div>
      <div class="tgme_widget_message_text">Own text</div>
      <div class="tgme_widget_message_date"><time datetime="2026-08-07T19:00:00+00:00"></time><a href="https://t.me/channel/2"></a></div>
    </div>
    <div class="tme_messages_more"><a href="/s/channel?before=1">Show more</a></div>
  `;

  const parsed = parseTelegramPreview(html, "https://t.me/s/channel");
  assert.equal(parsed.posts.length, 2);
  assert.equal(parsed.posts[0].text, "Main post\nwith a second line");
  assert.equal(parsed.posts[1].text, "Own text");
  assert.equal(parsed.nextUrl, "https://t.me/s/channel?before=1");
});

test("builds a UTC day window", () => {
  const window = getUtcDayWindow({ now: new Date("2026-08-07T20:00:00.000Z") });
  assert.equal(window.date, "2026-08-07");
  assert.equal(window.start.toISOString(), "2026-08-07T00:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-08-07T20:00:00.000Z");
});

test("formats only supplied posts for the article prompt", () => {
  const result = formatPostsForPrompt([
    { publishedAt: "2026-08-07T19:00:00.000Z", url: "https://t.me/channel/1", text: "A reported event" },
  ]);
  assert.match(result, /A reported event/);
  assert.doesNotMatch(result, /external research/);
});

test("normalizes article spacing and removes em dashes", async () => {
  const article = await generateDailyArticle({
    apiKey: "test-key",
    date: "2026-08-07",
    posts: [{ publishedAt: "2026-08-07T19:00:00.000Z", text: "A reported event" }],
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          output_text: JSON.stringify({
            title: "A headline — without an em dash",
            summary: "A summary — without an em dash.",
            contentHtml:
              '<p><strong>Briefing Summary:</strong> Summary — detail.</p><h2>First section</h2><ul><li data-preset-tag="p"><p><strong>Lead:</strong> Detail.<br><br class="trailing-break"></p></li></ul><h2>Second section</h2><ul><li data-preset-tag="p"><p><strong>Lead:</strong> More detail.</p></li></ul>',
          }),
        };
      },
    }),
  });

  assert.doesNotMatch(`${article.title}${article.summary}${article.contentHtml}`, /—|&mdash;|&#8212;/);
  assert.equal((article.contentHtml.match(/class="trailing-break"/g) || []).length, 3);
  assert.match(article.contentHtml, /<p><br><br class="trailing-break"><\/p><h2>Second section<\/h2>/);
});
