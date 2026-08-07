const DEFAULT_PROJECT_URL = "https://framer.com/projects/BibliWatch--CIvjMsjQrZM82VnQbyfP-hYBk8";
const POSTS_COLLECTION_NAME = "Posts";
const CATEGORIES_COLLECTION_NAME = "Categories";
const AUTHOR = "Thomas David";
const CATEGORY = "Daily Updates";

function fieldByName(fields, name) {
  const field = fields.find((candidate) => candidate.name === name);
  if (!field) throw new Error(`Framer Posts collection is missing the “${name}” field`);
  return field;
}

function fieldEntry(field, value, extra = {}) {
  return { type: field.type, value, ...extra };
}

function dateForItem(item, dateField) {
  const value = item.fieldData?.[dateField.id]?.value;
  return typeof value === "string" ? value.slice(0, 10) : null;
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "daily-news-update";
}

function nextArticleNumber(items, numberField) {
  let highest = 0;
  for (const item of items) {
    const value = item.fieldData?.[numberField.id]?.value;
    const match = String(value || "").match(/(\d+)\s*$/);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `[No. ${String(highest + 1).padStart(4, "0")}]`;
}

async function getCategorySlug(collections) {
  const categories = collections.find((collection) => collection.name === CATEGORIES_COLLECTION_NAME);
  if (!categories) throw new Error("Framer Categories collection was not found");

  const fields = await categories.getFields();
  const titleField = fields.find((field) => field.name === "Title") || fields[0];
  const items = await categories.getItems();
  const category = items.find((item) => item.fieldData?.[titleField.id]?.value === CATEGORY);
  if (!category) throw new Error(`Framer category “${CATEGORY}” was not found`);
  return category.slug;
}

function makeFieldData({ fields, article, date, number, categorySlug }) {
  const data = {};
  data[fields.title.id] = fieldEntry(fields.title, article.title);
  data[fields.number.id] = fieldEntry(fields.number, number);
  data[fields.shortDescription.id] = fieldEntry(fields.shortDescription, article.summary);
  data[fields.author.id] = fieldEntry(fields.author, AUTHOR);
  data[fields.date.id] = fieldEntry(fields.date, `${date}T00:00:00.000Z`);
  data[fields.category.id] = fieldEntry(fields.category, categorySlug);
  data[fields.featured.id] = fieldEntry(fields.featured, false);
  data[fields.editorChoice.id] = fieldEntry(fields.editorChoice, false);
  data[fields.content.id] = fieldEntry(fields.content, article.contentHtml, { contentType: "html" });

  // Media is intentionally left empty for this first version of the automation.
  if (fields.thumbnail) data[fields.thumbnail.id] = fieldEntry(fields.thumbnail, null);
  if (fields.thumbnailLg) data[fields.thumbnailLg.id] = fieldEntry(fields.thumbnailLg, null);
  if (fields.videoUrl) data[fields.videoUrl.id] = fieldEntry(fields.videoUrl, "");
  if (fields.telegramVideoEmbed) data[fields.telegramVideoEmbed.id] = fieldEntry(fields.telegramVideoEmbed, "");
  if (fields.propheticConnection) data[fields.propheticConnection.id] = fieldEntry(fields.propheticConnection, "None");

  return data;
}

export async function saveFramerDraft({
  article,
  date,
  projectUrl = process.env.FRAMER_PROJECT_URL || DEFAULT_PROJECT_URL,
  apiKey = process.env.FRAMER_API_KEY,
} = {}) {
  if (!apiKey) throw new Error("FRAMER_API_KEY is not configured");

  const { connect } = await import("framer-api");
  const framer = await connect(projectUrl, apiKey);
  const collections = await framer.getCollections();
  const postsCollection = collections.find((collection) => collection.name === POSTS_COLLECTION_NAME);
  if (!postsCollection) throw new Error(`Framer collection “${POSTS_COLLECTION_NAME}” was not found`);

  const fieldsList = await postsCollection.getFields();
  const fields = {
    title: fieldByName(fieldsList, "Title"),
    number: fieldByName(fieldsList, "Number"),
    shortDescription: fieldByName(fieldsList, "Short Description"),
    author: fieldByName(fieldsList, "Author"),
    date: fieldByName(fieldsList, "Date"),
    category: fieldByName(fieldsList, "Category"),
    featured: fieldByName(fieldsList, "Featured?"),
    editorChoice: fieldByName(fieldsList, "Editor’s Choice?"),
    content: fieldByName(fieldsList, "Content"),
    thumbnail: fieldsList.find((field) => field.name === "Thumbnail"),
    thumbnailLg: fieldsList.find((field) => field.name === "Thumbnail LG"),
    videoUrl: fieldsList.find((field) => field.name === "Video URL"),
    telegramVideoEmbed: fieldsList.find((field) => field.name === "Telegram Video Embed"),
    propheticConnection: fieldsList.find((field) => field.name === "Prophetic Connection"),
  };

  const categorySlug = await getCategorySlug(collections);
  const items = await postsCollection.getItems();
  const draftForDate = items.find((item) => item.draft && dateForItem(item, fields.date) === date);
  const liveForDate = items.find((item) => !item.draft && dateForItem(item, fields.date) === date);

  if (liveForDate) {
    return { item: liveForDate, created: false, alreadyLive: true };
  }

  const number = draftForDate
    ? draftForDate.fieldData?.[fields.number.id]?.value || nextArticleNumber(items, fields.number)
    : nextArticleNumber(items, fields.number);
  const fieldData = makeFieldData({ fields, article, date, number, categorySlug });
  const slug = slugify(article.title);

  if (draftForDate) {
    await draftForDate.setAttributes({ draft: true, slug, fieldData });
    return { item: { id: draftForDate.id, slug }, created: false, updated: true };
  }

  await postsCollection.addItems([{ draft: true, slug, fieldData }]);
  const refreshedItems = await postsCollection.getItems();
  const createdItem = refreshedItems.find((item) => item.slug === slug && dateForItem(item, fields.date) === date);

  return {
    item: createdItem || { slug },
    created: true,
    updated: false,
  };
}
