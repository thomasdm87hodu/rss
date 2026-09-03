function getQuery(req) {
  try {
    return new URL(req.url || "/api/share", "https://localhost").searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validatePostUrl(value) {
  try {
    const url = new URL(value);
    const isTelegramHost = url.hostname === "t.me" || url.hostname.endsWith(".t.me");
    if (url.protocol !== "https:" || !isTelegramHost) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export default function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).send("Method not allowed");
  }

  const postUrl = validatePostUrl(getQuery(req).get("url"));
  if (!postUrl) return res.status(400).send("A valid Telegram post URL is required");

  const safeUrl = escapeHtml(postUrl);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
  );
  res.setHeader("Referrer-Policy", "no-referrer");

  return res.status(200).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Copy Telegram link</title>
    <style>
      :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #f4f6f8; color: #17212b; }
      main { width: min(92vw, 32rem); box-sizing: border-box; padding: 2rem; border-radius: 1.25rem; background: white; box-shadow: 0 1rem 3rem rgb(23 33 43 / 12%); }
      h1 { margin: 0 0 .75rem; font-size: 1.35rem; }
      p { line-height: 1.5; }
      .url { overflow-wrap: anywhere; padding: .8rem; border-radius: .75rem; background: #eef2f5; font-size: .9rem; }
      button, a { display: inline-block; margin-top: 1rem; padding: .75rem 1rem; border-radius: .7rem; font: inherit; text-decoration: none; cursor: pointer; }
      button { border: 0; background: #229ed9; color: white; }
      a { margin-left: .5rem; color: #1677a8; }
      @media (prefers-color-scheme: dark) { body { background: #111820; color: #e8edf2; } main { background: #1d2730; } .url { background: #2b3741; } a { color: #7cc9ee; } }
    </style>
  </head>
  <body>
    <main>
      <h1>Copy Telegram link</h1>
      <p>Tap the button to copy the post link, or open the post directly.</p>
      <div class="url">${safeUrl}</div>
      <button type="button" id="copy">Copy link</button>
      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">Open post</a>
      <p id="status" aria-live="polite"></p>
    </main>
    <script>
      const button = document.getElementById('copy');
      const status = document.getElementById('status');
      button.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(${JSON.stringify(postUrl)});
          status.textContent = 'Link copied.';
        } catch {
          status.textContent = 'Copy was blocked by the browser. Select the link above instead.';
        }
      });
    </script>
  </body>
</html>`);
}
