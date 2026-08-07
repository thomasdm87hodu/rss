import { load } from "cheerio";

const DEFAULT_MODEL = "gpt-5.6-terra";

const WATCHLIST = [
  { label: "Israel / Israeli / IDF", tier: "core", patterns: [/\bisrael(?:i)?\b/i, /\bidf\b/i] },
  {
    label: "United States / US / American / Trump",
    tier: "core",
    patterns: [/\bunited states\b/i, /\bu\.?s\.?\b/i, /\bamerican\b/i, /\btrump\b/i, /\bwhite house\b/i, /\bpentagon\b/i],
  },
  { label: "Iran / Iranian / Khamenei", tier: "core", patterns: [/\biran(?:ian)?\b/i, /\bkhamenei\b/i] },
  { label: "Turkey / Turkish / Erdogan", tier: "core", patterns: [/\bturk(?:ey|ish)\b/i, /\berdogan\b|\berdoğan\b/i] },
  { label: "Syria / Syrian / al-Sharaa / al-Julani", tier: "core", patterns: [/\bsyr(?:ia|ian)\b/i, /\bal[- ]?sharaa\b/i, /\bal[- ]?julani\b/i] },
  { label: "Russia / Russian / Putin", tier: "core", patterns: [/\bruss(?:ia|ian)\b/i, /\bputin\b/i] },
  { label: "Netanyahu", tier: "core", patterns: [/\bnetanyahu\b/i] },
  { label: "Mojtaba Khamenei", tier: "core", patterns: [/\bmojtaba\s+khamenei\b/i] },
  { label: "Hezbollah / Naim Qassem", tier: "core", patterns: [/\bhezbollah\b/i, /\bnaim\s+qassem\b/i] },
  {
    label: "Other Gulf and nearby states",
    tier: "secondary",
    patterns: [/\biraq(?:i)?\b/i, /\buae\b|\bunited arab emirates\b|\bemirati\b/i, /\bbahrain(?:i)?\b/i, /\bsaudi(?: arabia)?\b/i, /\bqatar(?:i)?\b/i, /\bkuwait(?:i)?\b/i, /\boman(?:i)?\b/i, /\bpakistan(?:i)?\b/i],
  },
];

const SENIOR_OFFICIAL_PATTERN = /\b(president|prime minister|foreign minister|defen[cs]e minister|treasury secretary|secretary|leader|chief|commander|official|administration|government)\b/i;

const ARTICLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    contentHtml: { type: "string" },
    alternativeTitles: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["title", "summary", "contentHtml", "alternativeTitles"],
};

const SYSTEM_PROMPT = `You are the editor of a daily news briefing. Transform only the supplied Telegram channel posts into one accurate daily article.

Rules:
- Use only the supplied posts. Do not browse, research, infer missing facts, or add outside context.
- Keep the tone factual, concise, and professional. Do not exaggerate beyond the wording of the posts.
- Do not mention the Telegram source in the article unless the source text itself makes that necessary.
- Prioritize posts using this watchlist: Israel, Israeli, IDF, the United States, US, American, Trump, the White House, the Pentagon, Iran, Iranian, Khamenei, Mojtaba Khamenei, Turkey, Turkish, Erdogan, Syria, Syrian, al-Sharaa, al-Julani, Russia, Russian, Putin, Netanyahu, Hezbollah, and Naim Qassem.
- Treat Iraq, the UAE, Bahrain, Saudi Arabia, Qatar, Kuwait, Oman, and Pakistan as secondary watch terms. They matter, but usually rank below the core watchlist unless the story is unusually consequential.
- Give extra weight when a post contains multiple core watch terms, a named leader, or a senior official such as a president, prime minister, minister, secretary, chief, commander, or other high-ranking official.
- Unless a clearly more important breaking story elsewhere dominates the day, prioritize the most important core-watchlist development when choosing the headline.
- Choose an interesting, specific headline based on that strongest development. Do not use a generic headline such as "Daily News Update". Keep it under 100 characters and do not add a date or number.
- Also return exactly three distinct alternative headline suggestions in alternativeTitles. Keep each under 100 characters, make each specific to the supplied posts, and do not repeat the selected headline. The application will append these suggestions to the end of the article body.
- The summary should be a single paragraph of about 70–120 words and should begin with the main development.
- Write the article body as HTML only, using the exact structure requested below. Do not return Markdown, a document wrapper, CSS, scripts, or images.
- Organize related posts under 2–5 descriptive <h2> section headings.
- Under each heading, use a <ul>. Each post summary should be a <li data-preset-tag="p"><p><strong>Specific Lead-In:</strong> concise factual explanation<br class="trailing-break"></p></li>. Use one line break between bullet points.
- Put two line breaks between the end of one section and the next <h2> heading.
- Include every core-watchlist post that adds a distinct important development when reasonably possible. Do not omit a post merely because it is not centered on Israel or the United States if it concerns Iran, Turkey, Syria, Russia, or a named senior official. Lower-priority posts may be condensed or omitted when necessary.
- Preserve important numbers, names, locations, timeframes, and qualifications from the supplied posts. Never create a quote or fact that is not present in them.
- Use normal sentence case for headlines and lead-ins. Use &amp; when an ampersand is needed in HTML.
- Never use an em dash character (—) or em dash HTML entity. Use commas, semicolons, parentheses, or a normal hyphen instead.

Required body shape:
<p><strong>Briefing Summary:</strong> ...</p>
<h2>Section heading</h2>
<ul><li data-preset-tag="p"><p><strong>Lead-in:</strong> ...<br class="trailing-break"></p></li></ul>`;

function removeEmDashes(value) {
  return String(value)
    .replace(/—/g, "-")
    .replace(/&(?:amp;)?mdash;/gi, "-")
    .replace(/&#(?:x2014|8212);/gi, "-");
}

function escapePromptText(value) {
  return value.replace(/\u0000/g, "").trim();
}

export function formatPostsForPrompt(posts) {
  return posts
    .map((post, index) => {
      const time = new Date(post.publishedAt).toISOString().replace("T", " ").replace(".000Z", " UTC");
      const signals = getWatchlistSignals(post.text);
      const priority = signals.labels.length
        ? ` | Watchlist priority ${signals.score}: ${signals.labels.join(", ")}${signals.seniorOfficial ? ", senior-official context" : ""}`
        : "";
      return `[Post ${index + 1} | ${time} | ${post.url || "no link"}${priority}]\n${escapePromptText(post.text)}`;
    })
    .join("\n\n");
}

export function getWatchlistSignals(text) {
  const value = String(text || "");
  const matches = WATCHLIST.filter((entry) => entry.patterns.some((pattern) => pattern.test(value)));
  const coreCount = matches.filter((entry) => entry.tier === "core").length;
  const seniorOfficial = coreCount > 0 && SENIOR_OFFICIAL_PATTERN.test(value);
  const score = matches.reduce((total, entry) => total + (entry.tier === "core" ? 3 : 1), 0)
    + Math.max(0, coreCount - 1) * 2
    + (seniorOfficial ? 2 : 0);

  return {
    labels: matches.map((entry) => entry.label),
    score,
    seniorOfficial,
  };
}

function sanitizeContentHtml(html) {
  const $ = load(`<div id="article-root">${html}</div>`, null, false);
  const root = $("#article-root");

  root.find("script, style, iframe, img, video, audio, object, embed, form").remove();
  root.find("*").each((_, element) => {
    const node = $(element);
    for (const attribute of Object.keys(element.attribs || {})) {
      if (attribute !== "data-preset-tag" || element.name !== "li") {
        node.removeAttr(attribute);
      }
    }
  });

  return root.html().trim();
}

function normalizeContentLayout(html) {
  const $ = load(`<div id="article-root">${html}</div>`, null, false);
  const root = $("#article-root");

  // Keep one line break at the end of each bullet paragraph.
  root.find("li p").each((_, element) => {
    const paragraph = $(element);
    paragraph.find("br").remove();
    paragraph.append('<br class="trailing-break">');
  });

  // Keep two line breaks between the end of one section and the next heading.
  root.find("h2").each((index, element) => {
    if (index > 0) $(element).before('<p><br><br class="trailing-break"></p>');
  });

  return removeEmDashes(root.html().trim());
}

function readResponseText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }

  throw new Error("OpenAI returned no article text");
}

function cleanHeadline(value) {
  return removeEmDashes(String(value))
    .replace(/<[^>]*>/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
    .trim();
}

function cleanAlternativeHeadlines(values, selectedTitle) {
  const selected = cleanHeadline(selectedTitle).toLowerCase();
  const seen = new Set([selected]);
  const titles = [];

  for (const value of Array.isArray(values) ? values : []) {
    const title = cleanHeadline(value);
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
  }

  if (titles.length < 3) {
    throw new Error("OpenAI returned fewer than three alternative headlines");
  }

  return titles.slice(0, 3);
}

function appendAlternativeHeadlines(html, titles) {
  const $ = load(`<div id="article-root">${html}</div>`, null, false);
  const root = $("#article-root");
  const heading = $("<h2>").text("Alternative headline suggestions");
  const list = $("<ul>");

  for (const title of titles) {
    const paragraph = $("<p>").append($("<strong>").text(title));
    list.append($("<li>").attr("data-preset-tag", "p").append(paragraph));
  }

  root.append(heading, list);
  return root.html().trim();
}

export async function generateDailyArticle({
  posts,
  date,
  fetchImpl = fetch,
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || DEFAULT_MODEL,
} = {}) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  if (!posts?.length) throw new Error("At least one Telegram post is required");

  const input = `Create the daily article for ${date} from these Telegram posts. The date is provided only for editorial context; do not put it in the title.\n\n${formatPostsForPrompt(posts)}`;
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      store: false,
      input: [
        { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
        { role: "user", content: [{ type: "input_text", text: input }] },
      ],
      text: {
        verbosity: "medium",
        format: {
          type: "json_schema",
          name: "daily_news_article",
          strict: true,
          schema: ARTICLE_SCHEMA,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI returned HTTP ${response.status}: ${detail.slice(0, 500)}`);
  }

  let article;
  try {
    article = JSON.parse(readResponseText(await response.json()));
  } catch (error) {
    throw new Error(`OpenAI returned invalid article JSON: ${error.message}`);
  }

  const title = cleanHeadline(article.title);
  const summary = removeEmDashes(article.summary?.trim() || "");
  const alternativeTitles = cleanAlternativeHeadlines(article.alternativeTitles, title);
  const bodyHtml = sanitizeContentHtml(article.contentHtml || "");
  const contentHtml = normalizeContentLayout(appendAlternativeHeadlines(bodyHtml, alternativeTitles));
  if (!title || !summary || !bodyHtml || !contentHtml) {
    throw new Error("OpenAI returned an incomplete article");
  }

  return { title, summary, contentHtml, alternativeTitles };
}
