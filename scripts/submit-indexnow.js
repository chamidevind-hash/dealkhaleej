const INDEXNOW_KEY = "3e952bc2e94f4afab8fd05ec4205ce42";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const INDEXNOW_KEY_LOCATION = `https://dealkhaleej.com/${INDEXNOW_KEY}.txt`;
const SITEMAP_URL = process.env.SITEMAP_URL || "https://dealkhaleej.com/sitemap.xml";
const HOST = "dealkhaleej.com";
const MAX_URLS_PER_REQUEST = 10000;

function parseSitemapUrls(xml) {
  return [...String(xml || "").matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => match[1].trim());
}

function cleanUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function normalizedCanonical(value) {
  const url = cleanUrl(value);
  if (!url) return "";
  url.search = "";
  const pathname = url.pathname.replace(/\/$/, "") || "/";
  return `${url.protocol}//${url.hostname.toLowerCase()}${pathname}`;
}

function isCanonicalDealKhaleejUrl(value) {
  const url = cleanUrl(value);
  if (!url) return false;
  return url.protocol === "https:"
    && url.hostname.toLowerCase() === HOST
    && !url.search
    && !url.pathname.startsWith("/go/");
}

function metaRobotsNoindex(html) {
  const match = String(html || "").match(/<meta\b[^>]*name=(["'])robots\1[^>]*content=(["'])(.*?)\2[^>]*>/i)
    || String(html || "").match(/<meta\b[^>]*content=(["'])(.*?)\1[^>]*name=(["'])robots\3[^>]*>/i);
  const content = match ? (match[3] || match[2] || "") : "";
  return content.toLowerCase().includes("noindex");
}

function canonicalFromHtml(html) {
  const match = String(html || "").match(/<link\b[^>]*rel=(["'])canonical\1[^>]*href=(["'])(.*?)\2[^>]*>/i)
    || String(html || "").match(/<link\b[^>]*href=(["'])(.*?)\1[^>]*rel=(["'])canonical\3[^>]*>/i);
  return match ? (match[3] || match[2] || "").trim() : "";
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: "manual",
    headers: {
      "User-Agent": "DealKhaleej IndexNow submitter",
      ...options.headers
    }
  });
  const text = await response.text();
  return { response, text };
}

async function urlIsIndexable(url) {
  const { response, text } = await fetchText(url);
  if (response.status < 200 || response.status >= 300) return false;

  const robotsHeader = String(response.headers.get("x-robots-tag") || "").toLowerCase();
  if (robotsHeader.includes("noindex")) return false;
  if (metaRobotsNoindex(text)) return false;

  const canonical = canonicalFromHtml(text);
  if (canonical && normalizedCanonical(canonical) !== normalizedCanonical(url)) return false;

  return true;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function submitUrls(urls) {
  for (const batch of chunk(urls, MAX_URLS_PER_REQUEST)) {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: HOST,
        key: INDEXNOW_KEY,
        keyLocation: INDEXNOW_KEY_LOCATION,
        urlList: batch
      })
    });

    console.log(`IndexNow response ${response.status}; submitted ${batch.length} URLs.`);
  }
}

async function main() {
  const { response, text } = await fetchText(SITEMAP_URL);
  if (response.status !== 200) {
    throw new Error(`Sitemap returned HTTP ${response.status}: ${SITEMAP_URL}`);
  }

  const sitemapUrls = parseSitemapUrls(text);
  const canonicalUrls = [...new Set(sitemapUrls.filter(isCanonicalDealKhaleejUrl))];
  const indexableUrls = [];

  for (const url of canonicalUrls) {
    if (await urlIsIndexable(url)) {
      indexableUrls.push(url);
    }
  }

  if (!indexableUrls.length) {
    console.log("IndexNow response not sent; submitted 0 URLs.");
    return;
  }

  if (process.env.INDEXNOW_DRY_RUN === "1") {
    console.log(`IndexNow dry run; would submit ${indexableUrls.length} URLs.`);
    return;
  }

  await submitUrls(indexableUrls);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
