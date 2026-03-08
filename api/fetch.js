export default async function handler(req, res) {
  // 1. Enable CORS so your React frontend can call this API
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Allows requests from any website
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. Get the target URL from the query string (e.g., ?url=https://t.me/s/...)
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing "url" parameter in the request.' });
  }

  try {
    // 3. Fetch the data from the target URL (Server-to-Server bypasses browser CORS)
    const response = await fetch(targetUrl, {
      headers: {
        // Pretend to be a regular web browser to avoid getting blocked
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    // 4. Send the HTML back to your frontend
    // Set caching headers: Cache on Vercel's edge network for 60 seconds.
    // This gives you near real-time updates while protecting you from spamming the source site!
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.status(200).send(html);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Failed to proxy the request', details: error.message });
  }
}
