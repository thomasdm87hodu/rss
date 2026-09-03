# Telegram share-buttons bot

This feature extends the existing Vercel project with a private v1 webhook for
`@breakingisraelnews`. The webhook edits the original channel post's inline
keyboard in place. It does not copy, delete, or republish the post.

## Code changes in private v1

The managed keyboard is intentionally private-first:

```text
[Facebook] [𝕏] [Telegram]
[Copy Link]
```

`SHOW_ADD_TO_CHANNEL_BUTTON=false` is the default in `.env.example`, and the
production private v1 should keep it false. The optional promotion row remains
available in code for a later, deliberate public-onboarding release:

```text
[➕ Add to your channel]
```

When enabled, it is the final button on its own row and is built from
`BOT_USERNAME`:

```text
https://t.me/${BOT_USERNAME}?startchannel&admin=edit_messages
```

The button is a URL button, never a callback button. Private v1 does not add
`my_chat_member` handling, external-channel registration, or multi-channel
allow-list behavior.

The handler also:

- processes `channel_post` and `edited_channel_post`
- decorates only the configured allowed channel
- preserves unrelated inline buttons
- replaces only the managed rows deterministically
- coalesces concurrent edits and suppresses duplicate webhook deliveries
- repairs managed buttons after a later channel edit removes them
- uses `copy_text` for `Copy Link`, with a fallback to `/api/share` if the API
  rejects that button type
- uses only the X web intent URL; there is no X API, OAuth, paid access, or
  email integration

The share webhook uses only `TELEGRAM_SHARE_BOT_TOKEN`. It deliberately does
not fall back to `TELEGRAM_BOT_TOKEN`, which remains reserved for existing
BIN/review automation. Using the dedicated `@biblishare_bot` token therefore
does not change that other bot's webhook or workflows.

## Environment variables

The required private-v1 configuration is:

```ini
TELEGRAM_SHARE_BOT_TOKEN=
TELEGRAM_ALLOWED_CHANNEL_USERNAME=@breakingisraelnews
TELEGRAM_ALLOWED_CHANNEL_ID=
BOT_USERNAME=biblishare_bot
TELEGRAM_WEBHOOK_SECRET=
PUBLIC_BASE_URL=
TELEGRAM_COPY_TEXT=auto
SHOW_ADD_TO_CHANNEL_BUTTON=false
```

Set secrets in Vercel and/or a local `.env`; do not commit `.env` or paste the
bot token into chat. `TELEGRAM_ALLOWED_CHANNEL_ID` can be used instead of the
username for a private test channel.

## Deployment steps: private test channel first

The deployment target and the Telegram allow-list are separate decisions. The
code can be deployed to Vercel without touching `@breakingisraelnews`, but the
webhook must first be configured to a private test channel.

1. Create or choose a private Telegram test channel.
2. Add `@biblishare_bot` to that test channel as an administrator with **Edit
   Messages** enabled. **Post Messages** is not needed for this test.
3. Before setting the webhook, configure the Vercel Production environment
   with `SHOW_ADD_TO_CHANNEL_BUTTON=false` and the test channel's numeric ID in
   `TELEGRAM_ALLOWED_CHANNEL_ID`. Leave
   `TELEGRAM_ALLOWED_CHANNEL_USERNAME` empty for a private channel unless it
   has a usable username.
4. Deploy the repository:

   ```bash
   cd /Users/thomasmaidment/Documents/Codex/rss
   npm test
   npx vercel link
   npx vercel --prod
   ```

5. Set `PUBLIC_BASE_URL` to the deployed HTTPS origin and add the dedicated
   `@biblishare_bot` token as `TELEGRAM_SHARE_BOT_TOKEN`.
6. Put the same non-secret configuration and webhook secret in a local `.env`
   and run:

   ```bash
   npm run setup:webhook
   ```

   The setup script checks `getMe`, `getChat`, and `getChatMember` first. It
   stops unless the dedicated bot is an administrator with
   `can_edit_messages=true`. It then sets the webhook with only
   `channel_post` and `edited_channel_post` in `allowed_updates`.
7. Check the deployed health endpoint:

   ```bash
   curl https://YOUR-VERCEL-DOMAIN.vercel.app/api/health
   ```

   It should return `ready: true` and show `showAddToChannelButton: false`.
8. Post a temporary message in the private test channel. Confirm that the
   same post receives only Facebook, X, Telegram, and Copy Link buttons.
9. Edit the test message and confirm the managed buttons remain present.
10. Confirm Telegram's `getWebhookInfo` output has the expected URL, the two
    allowed update types, no recent error, and a pending count near zero.

## Promote the tested configuration to the live channel

Do not add the bot to `@breakingisraelnews` or change the allow-list until the
private test has succeeded.

After approval of the test result:

1. Add `@biblishare_bot` to `@breakingisraelnews` as an administrator with
   **Edit Messages** enabled.
2. Change the Vercel Production allow-list to either:

   ```ini
   TELEGRAM_ALLOWED_CHANNEL_USERNAME=@breakingisraelnews
   TELEGRAM_ALLOWED_CHANNEL_ID=
   ```

   or the channel's verified numeric ID.
3. Redeploy or update the Production environment so the new allow-list is
   active.
4. Post one controlled manual test message in `@breakingisraelnews` and
   confirm the private keyboard appears. Remove the test message manually
   afterward if desired.

The dedicated token has its own Telegram webhook. It does not share the
existing BIN/review bot token, so this rollout does not replace or alter that
other bot's workflows.

## Later public-onboarding release

Public onboarding is intentionally out of scope for private v1. A later
release can set `SHOW_ADD_TO_CHANNEL_BUTTON=true`, add `my_chat_member` to the
update handling, register external channels, verify `can_edit_messages`, and
maintain a multi-channel registration store. That later release should be
planned separately from the private channel rollout above.
