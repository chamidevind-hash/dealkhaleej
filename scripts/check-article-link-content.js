const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const articles = JSON.parse(fs.readFileSync(path.join(root, "data", "articles.json"), "utf8"));
const stores = JSON.parse(fs.readFileSync(path.join(root, "data", "stores.json"), "utf8"));

const bannedPhrases = [
  "Relevant DealKhaleej internal links",
  "Which DealKhaleej store page should I check first",
  "Internal Store Links",
  "Use DealKhaleej Store Pages",
  "internal paths",
  "internal comparison",
  "internal store page",
  "trusted internal links"
];

function storeSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

const storeSlugs = new Set(stores.map((store) => storeSlug(store.name)));
const markdownLinkPattern = /\[([^\]\n]+)\]\(((?:\/|https:\/\/dealkhaleej\.com\/?)[^)\s]*)\)/g;
const rawInternalPathPattern = /\/(?:store|travel|blog)(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+|\b)/g;
const failures = [];

function collectStrings(article) {
  const values = [
    ["content", article.content],
    ["title", article.title],
    ["excerpt", article.excerpt],
    ["metaTitle", article.metaTitle],
    ["metaDescription", article.metaDescription]
  ];

  for (const [sectionIndex, section] of (article.sections || []).entries()) {
    values.push([`sections[${sectionIndex}].heading`, section.heading]);
    for (const [paragraphIndex, paragraph] of (section.paragraphs || []).entries()) {
      values.push([`sections[${sectionIndex}].paragraphs[${paragraphIndex}]`, paragraph]);
    }
    for (const [subsectionIndex, subsection] of (section.subsections || []).entries()) {
      values.push([`sections[${sectionIndex}].subsections[${subsectionIndex}].heading`, subsection.heading]);
      for (const [paragraphIndex, paragraph] of (subsection.paragraphs || []).entries()) {
        values.push([`sections[${sectionIndex}].subsections[${subsectionIndex}].paragraphs[${paragraphIndex}]`, paragraph]);
      }
    }
  }

  return values.filter(([, value]) => typeof value === "string");
}

function markdownHrefRanges(text) {
  const ranges = [];
  for (const match of text.matchAll(markdownLinkPattern)) {
    const href = match[2];
    const hrefStart = match.index + match[0].lastIndexOf(href);
    ranges.push([hrefStart, hrefStart + href.length, href]);
  }
  return ranges;
}

function isInsideRanges(index, ranges) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

function hasMarkdownLink(text) {
  markdownLinkPattern.lastIndex = 0;
  return markdownLinkPattern.test(text);
}

function validateMarkdownStoreLinks(text, article, field) {
  for (const match of text.matchAll(markdownLinkPattern)) {
    const href = match[2];
    const urlPath = href.startsWith("https://dealkhaleej.com")
      ? href.replace("https://dealkhaleej.com", "") || "/"
      : href;
    if (urlPath.includes("%20")) {
      failures.push(`${article.slug} ${field}: encoded space in markdown link ${href}`);
    }
    if (urlPath.startsWith("/store/")) {
      const slug = urlPath.replace(/^\/store\//, "").replace(/\/$/, "");
      if (!storeSlugs.has(slug)) {
        failures.push(`${article.slug} ${field}: unknown store slug ${href}`);
      }
    }
  }
}

for (const article of articles) {
  const articleJson = JSON.stringify(article);
  for (const phrase of bannedPhrases) {
    if (articleJson.toLowerCase().includes(phrase.toLowerCase())) {
      failures.push(`${article.slug}: banned phrase "${phrase}"`);
    }
  }
  if (articleJson.includes("%20")) {
    failures.push(`${article.slug}: contains %20`);
  }
  if (!collectStrings(article).some(([, text]) => hasMarkdownLink(text))) {
    failures.push(`${article.slug}: missing markdown internal link`);
  }
  markdownLinkPattern.lastIndex = 0;

  for (const relatedStore of article.relatedStores || []) {
    const slug = storeSlug(relatedStore.slug || relatedStore.name);
    if (!storeSlugs.has(slug)) {
      failures.push(`${article.slug}: relatedStores contains unknown store slug ${relatedStore.slug || relatedStore.name}`);
    }
  }

  for (const [field, text] of collectStrings(article)) {
    const ranges = markdownHrefRanges(text);
    validateMarkdownStoreLinks(text, article, field);

    for (const match of text.matchAll(rawInternalPathPattern)) {
      if (!isInsideRanges(match.index, ranges)) {
        failures.push(`${article.slug} ${field}: raw internal path outside markdown link "${match[0]}"`);
      }
    }
  }
}

if (failures.length) {
  console.error(`Article link content check failed with ${failures.length} issue(s):`);
  for (const failure of failures.slice(0, 80)) {
    console.error(`- ${failure}`);
  }
  if (failures.length > 80) {
    console.error(`...and ${failures.length - 80} more`);
  }
  process.exit(1);
}

console.log(`Article link content check passed for ${articles.length} articles.`);
