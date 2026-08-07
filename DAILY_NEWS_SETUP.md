# Daily news automation

This repository now contains a separate Vercel cron endpoint at `/api/daily-news`. It does not alter the existing `/api/fetch` Telegram proxy or `/api/tts` text-to-speech endpoint.

At 20:00 UTC each day, the endpoint:

1. Reads all posts from `https://t.me/bin_dailyupdate` for that UTC day, including the bodies of posts forwarded into the channel.
2. Uses the supplied posts only to generate one headline, briefing summary, and HTML article.
3. Adds or updates one `Draft` item in the Framer `Posts` collection with `Thomas David` and `Daily Updates`.
4. Sends a Telegram notification through `@bin_notifybot`.

## Vercel environment variables

Add these variables to the Vercel project before enabling the cron:

- `OPENAI_API_KEY` — the existing key used by `/api/tts`.
- `FRAMER_API_KEY` — create this in Framer Site Settings → General.
- `FRAMER_PROJECT_URL` — `https://framer.com/projects/BibliWatch--CIvjMsjQrZM82VnQbyfP-hYBk8`.
- `TELEGRAM_BOT_TOKEN` — the token issued by BotFather for `@bin_notifybot`.
- `TELEGRAM_CHAT_ID` — the chat ID for the Telegram account/group that should receive notifications.
- `CRON_SECRET` — a long random secret. Vercel cron requests must include it as `Authorization: Bearer <secret>`.
- `OPENAI_MODEL` — optional; defaults to `gpt-5.6-terra`.
- `TELEGRAM_CHANNEL` — set this to `bin_dailyupdate` in both Preview and Production environments.

To find `TELEGRAM_CHAT_ID`, send `/start` to `@bin_notifybot`, then privately call Telegram’s `getUpdates` endpoint using the bot token and copy the numeric `message.chat.id`. Never commit or share the bot token.

## Safe manual test

After the environment variables are configured, a one-day run can be invoked with the cron secret and an explicit UTC date:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://YOUR-VERCEL-DOMAIN.vercel.app/api/daily-news?date=2026-08-07"
```

The endpoint is intentionally idempotent for a date: it updates an existing draft for that day, does not overwrite an item that is already live, and creates no CMS item when there are no posts.
