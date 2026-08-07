import { load } from "cheerio";

const DEFAULT_MODEL = "gpt-5.6-terra";

const ARTICLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    contentHtml: { type: "string" },
  },
  required: ["title", "summary", "contentHtml"],
};

const SYSTEM_PROMPT = `You are the editor of a daily news briefing. Transform only the supplied Telegram channel posts into one accurate daily article.

Rules:
- Use only the supplied posts. Do not browse, research, infer missing facts, or add outside context.
- Keep the tone factual, concise, and professional. Do not exaggerate beyond the wording of the posts.
- Do not mention the Telegram source in the article unless the source text itself makes that necessary.
- Choose an interesting, specific headline based on the strongest development of the day. Do not use a generic headline such as "Daily News Update". Keep it under 100 characters and do not add a date or number.
- The summary should be a single paragraph of about 70–120 words and should begin with the main development.
- Write the article body as HTML only, using the exact structure requested below. Do not return Markdown, a document wrapper, CSS, scripts, or images.
- Organize related posts under 2–5 descriptive <h2> section headings.
- Under each heading, use a <ul>. Each post summary should be a <li data-preset-tag="p"><p><strong>Specific Lead-In:</strong> concise factual explanation<br><br class="trailing-break"></p></li>.
- Preserve important numbers, names, locations, timeframes, and qualifications from the supplied posts. Never create a quote or fact that is not present in them.
- Use normal sentence case for headlines and lead-ins. Use &amp; when an ampersand is needed in HTML.

Required body shape:
<p><strong>Briefing Summary:</strong> ...</p>
<h2>Section heading</h2>
<ul><li data-preset-tag="p"><p><strong>Lead-in:</strong> ...<br><br class="trailing-break"></p></li></ul>`;

function escapePromptText(value) {
  return value.replace(/\u0000/g, "").trim();
}

export function formatPostsForPrompt(posts) {
  return posts
    .map((post, index) => {
      const time = new Date(post.publishedAt).toISOString().replace("T", " ").replace(".000Z", " UTC");
      return `[Post ${index + 1} | ${time} | ${post.url || "no link"}]\n${escapePromptText(post.text)}`;
    })
    .join("\n\n");
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

  const title = article.title?.trim();
  const summary = article.summary?.trim();
  const contentHtml = sanitizeContentHtml(article.contentHtml || "");
  if (!title || !summary || !contentHtml) {
    throw new Error("OpenAI returned an incomplete article");
  }

  return { title, summary, contentHtml };
}
