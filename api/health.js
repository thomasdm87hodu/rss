import { DEFAULT_ALLOWED_UPDATES, getShareConfig } from "../lib/share-buttons.js";

export default function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const config = getShareConfig();
  const ready = Boolean(
    config.token &&
      (config.allowedChannelUsername || config.allowedChannelId) &&
      config.botUsername &&
      config.webhookSecret &&
      config.publicBaseUrl,
  );

  return res.status(200).json({
    ok: true,
    service: "telegram-share-buttons",
    ready,
    configured: {
      botToken: Boolean(config.token),
      allowedChannel: Boolean(config.allowedChannelUsername || config.allowedChannelId),
      botUsername: Boolean(config.botUsername),
      webhookSecret: Boolean(config.webhookSecret),
      publicBaseUrl: Boolean(config.publicBaseUrl),
      copyTextMode: config.copyTextMode,
      showAddToChannelButton: config.showAddToChannelButton,
    },
    allowedUpdates: DEFAULT_ALLOWED_UPDATES,
  });
}
