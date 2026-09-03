import test from "node:test";
import assert from "node:assert/strict";

import {
  addShareButtonsToChannelPost,
  buildCopyFallbackUrl,
  buildPromotionButton,
  buildShareKeyboard,
  getShareConfig,
  handleTelegramUpdate,
  keyboardsEqual,
} from "../lib/share-buttons.js";

const BOT_USERNAME = "YourShareBot";
const POST_URL = "https://t.me/breakingisraelnews/123";

function channelPost(messageId, replyMarkup) {
  return {
    message_id: messageId,
    chat: { id: -1001234567890, type: "channel", username: "breakingisraelnews" },
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };
}

test("uses the dedicated share token and defaults public onboarding off", () => {
  const config = getShareConfig({
    TELEGRAM_SHARE_BOT_TOKEN: "share-token",
    TELEGRAM_BOT_TOKEN: "bin-review-token",
    SHOW_ADD_TO_CHANNEL_BUTTON: undefined,
  });
  assert.equal(config.token, "share-token");
  assert.equal(config.showAddToChannelButton, false);

  const enabled = getShareConfig({
    TELEGRAM_SHARE_BOT_TOKEN: "share-token",
    SHOW_ADD_TO_CHANNEL_BUTTON: "true",
  });
  assert.equal(enabled.showAddToChannelButton, true);
  assert.equal(getShareConfig({ TELEGRAM_BOT_TOKEN: "bin-review-token" }).token, "");
});

test("builds the final promotional URL button from BOT_USERNAME", () => {
  assert.deepEqual(buildPromotionButton({ botUsername: `@${BOT_USERNAME}` }), {
    text: "➕ Add to your channel",
    url: "https://t.me/YourShareBot?startchannel&admin=edit_messages",
  });
});

test("builds share rows with copy_text and keeps promotion last on its own row", () => {
  const keyboard = buildShareKeyboard({
    postUrl: POST_URL,
    botUsername: BOT_USERNAME,
    showAddToChannelButton: true,
  });

  assert.equal(keyboard.inline_keyboard.length, 3);
  assert.deepEqual(
    keyboard.inline_keyboard[0].map((button) => button.text),
    ["Facebook", "𝕏", "Telegram"],
  );
  assert.deepEqual(keyboard.inline_keyboard[1][0], {
    text: "Copy Link",
    copy_text: { text: POST_URL },
  });
  assert.deepEqual(keyboard.inline_keyboard[2], [
    { text: "➕ Add to your channel", url: "https://t.me/YourShareBot?startchannel&admin=edit_messages" },
  ]);
  assert.equal(Object.hasOwn(keyboard.inline_keyboard[2][0], "callback_data"), false);
});

test("hides the promotional row by default for the private v1 keyboard", () => {
  const keyboard = buildShareKeyboard({ postUrl: POST_URL, botUsername: BOT_USERNAME });

  assert.deepEqual(
    keyboard.inline_keyboard.map((row) => row.map((button) => button.text)),
    [["Facebook", "𝕏", "Telegram"], ["Copy Link"]],
  );
});

test("preserves unrelated inline buttons and replaces only managed rows", () => {
  const existing = {
    inline_keyboard: [
      [{ text: "Read the source", url: "https://example.com/source" }],
      [{ text: "Facebook", url: "https://old.example/facebook" }],
    ],
  };
  const keyboard = buildShareKeyboard({
    postUrl: POST_URL,
    existingMarkup: existing,
    botUsername: BOT_USERNAME,
    showAddToChannelButton: true,
  });

  assert.deepEqual(keyboard.inline_keyboard[0], existing.inline_keyboard[0]);
  assert.equal(keyboard.inline_keyboard.filter((row) => row.some((button) => button.text === "Facebook")).length, 1);
  assert.equal(keyboard.inline_keyboard.at(-1)[0].text, "➕ Add to your channel");
});

test("compares equivalent keyboards independently of object key order", () => {
  assert.equal(
    keyboardsEqual(
      { inline_keyboard: [[{ url: "https://example.com", text: "Link" }]] },
      { inline_keyboard: [[{ text: "Link", url: "https://example.com" }]] },
    ),
    true,
  );
});

test("uses the share page as the copy fallback", () => {
  const fallback = buildCopyFallbackUrl(POST_URL, "https://share.example.com/");
  assert.equal(fallback, `https://share.example.com/api/share?url=${encodeURIComponent(POST_URL)}`);
});

test("coalesces and skips duplicate channel_post updates", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, async json() { return { ok: true, result: true }; } };
  };
  const options = {
    token: "test-token",
    allowedChannelUsername: "@breakingisraelnews",
    botUsername: BOT_USERNAME,
    updateId: 7001,
    fetchImpl,
  };

  const first = await handleTelegramUpdate({ update_id: 7001, channel_post: channelPost(7001) }, options);
  const duplicate = await handleTelegramUpdate({ update_id: 7001, channel_post: channelPost(7001) }, options);
  const repeated = await addShareButtonsToChannelPost(channelPost(7001), {
    ...options,
    updateId: 7002,
  });

  assert.equal(first.status, "updated");
  assert.equal(duplicate.reason, "duplicate-update");
  assert.equal(repeated.reason, "duplicate-message");
  assert.equal(requests.length, 1);
  assert.deepEqual(
    requests[0].body.reply_markup.inline_keyboard.map((row) => row.map((button) => button.text)),
    [["Facebook", "𝕏", "Telegram"], ["Copy Link"]],
  );
});

test("falls back from copy_text when Telegram rejects that button type", async () => {
  const requests = [];
  const fallbackPostUrl = "https://t.me/breakingisraelnews/7002";
  const fetchImpl = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    if (requests.length === 1) {
      return {
        ok: false,
        status: 400,
        async json() { return { ok: false, description: "Bad Request: copy_text is unsupported" }; },
      };
    }
    return { ok: true, status: 200, async json() { return { ok: true, result: true }; } };
  };

  const result = await addShareButtonsToChannelPost(channelPost(7002), {
    token: "test-token",
    allowedChannelUsername: "breakingisraelnews",
    botUsername: BOT_USERNAME,
    publicBaseUrl: "https://share.example.com",
    updateId: 7003,
    fetchImpl,
  });

  assert.equal(result.status, "updated");
  assert.equal(result.fallback, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.reply_markup.inline_keyboard[1][0].copy_text.text, fallbackPostUrl);
  assert.equal(
    requests[1].body.reply_markup.inline_keyboard[1][0].url,
    `https://share.example.com/api/share?url=${encodeURIComponent(fallbackPostUrl)}`,
  );
  assert.deepEqual(
    requests[1].body.reply_markup.inline_keyboard.map((row) => row.map((button) => button.text)),
    [["Facebook", "𝕏", "Telegram"], ["Copy Link"]],
  );
});
