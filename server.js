const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { randomUUID, timingSafeEqual } = require("crypto");
const { availableSources, importFromSource } = require("./imports/providers");
const { renderStorePage } = require("./store-page-renderer");
const {
  COUNTRIES,
  COUNTRY_CODES,
  GCC_COUNTRY_CODES,
  countryFromRequest,
  siteUrlForCountry,
  routeUrlForCountry,
  countrySelectorHtml,
  clientCountryScript,
  hreflangLinks,
  filterCouponsByCountry,
  filterStoresByCountry,
  filterArticlesByCountry,
  isArticleVisibleInCountry,
  countryCodesForStore,
  itemCountries
} = require("./config/countries");

const root = __dirname;
const dataFile = path.join(root, "data", "coupons.json");
const storesFile = path.join(root, "data", "stores.json");
const clicksFile = path.join(root, "data", "clicks.json");
const outboundClicksFile = path.join(root, "data", "outbound-clicks.json");
const importHistoryFile = path.join(root, "data", "import-history.json");
const newsletterFile = path.join(root, "data", "newsletter.json");
const articlesFile = path.join(root, "data", "articles.json");
const storeContentFile = path.join(root, "data", "store-content.json");
const port = Number(process.env.PORT || 5173);
const adminPassword = process.env.ADMIN_PASSWORD;
const adminSessions = new Set();
const siteUrl = siteUrlForCountry("gcc");
const staticPageRoutes = new Map([
  ["/about", "/about.html"],
  ["/contact", "/contact.html"],
  ["/privacy-policy", "/privacy-policy.html"],
  ["/terms", "/terms.html"],
  ["/affiliate-disclosure", "/affiliate-disclosure.html"],
  ["/travel", "/travel.html"],
  ["/travel/hotels", "/travel-hotels.html"],
  ["/travel/flights", "/travel-flights.html"],
  ["/travel/flights/riyadh-to-dubai", "/travel-flights-riyadh-dubai.html"],
  ["/travel/flights/riyadh-to-bangkok", "/travel-flights-riyadh-bangkok.html"],
  ["/travel/flights/dammam", "/travel-flights-dammam.html"],
  ["/travel/flights/map", "/travel-flights-map.html"],
  ["/travel/flights/deals", "/travel-flights-deals.html"],
  ["/travel/car-rentals", "/travel-car-rentals.html"],
  ["/travel/activities", "/travel-activities.html"],
  ["/travel/activities/riyadh", "/travel-activities-riyadh.html"],
  ["/travel/activities/transfers", "/travel-activities-transfers.html"],
  ["/travel/activities/airport-transfers-jeddah", "/travel-activities-airport-transfers-jeddah.html"],
  ["/travel/activities/deals", "/travel-activities-deals.html"],
  ["/travel/esim", "/travel-esim.html"]
]);
let newsletterWriteQueue = Promise.resolve();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, contentType, payload) {
  response.writeHead(status, { "Content-Type": `${contentType}; charset=utf-8` });
  response.end(payload);
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function storeSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countryPageText(country) {
  if (country.code === "gcc") {
    return {
      title: "Coupon Codes and Deals Across the GCC | DealKhaleej",
      description: "Find verified coupon codes, promo codes, shopping offers, and travel deals for GCC shoppers in Saudi Arabia, UAE, Kuwait, Qatar, Bahrain, and Oman.",
      heroTitle: "Verified Coupon Codes & Deals for GCC Shoppers",
      heroCopy: "Find verified coupons, store offers, travel deals, and shopping discounts for Saudi Arabia, UAE, Kuwait, Qatar, Bahrain, and Oman.",
      eyebrow: "DealKhaleej | Verified across the GCC",
      freshLabel: "Fresh GCC offers",
      blogTitle: "GCC Coupon Guides and Shopping Tips | DealKhaleej",
      blogDescription: "Read DealKhaleej guides for GCC coupon codes, promo code tips, travel deals, and smart online shopping offers."
    };
  }

  return {
    title: `Coupon Codes and Deals in ${country.name} | DealKhaleej`,
    description: `Find verified coupon codes, promo codes, shopping offers, and travel deals for shoppers in ${country.name} on DealKhaleej.`,
    heroTitle: `Verified Coupon Codes & Deals in ${country.name}`,
    heroCopy: `Find verified coupons, store offers, travel deals, and shopping discounts available for shoppers in ${country.name}.`,
    eyebrow: `DealKhaleej | Verified in ${country.name}`,
    freshLabel: `Fresh ${country.shortName} offers`,
    blogTitle: `${country.name} Coupon Guides and Shopping Tips | DealKhaleej`,
    blogDescription: `Read DealKhaleej guides for coupon codes, promo code tips, travel deals, and smart online shopping offers in ${country.name}.`
  };
}

function safeSearchForCanonical(searchParams) {
  const safe = new URLSearchParams();
  searchParams.forEach((value, key) => {
    if (key === "country") return;
    if (/^(ref|utm_[a-z0-9_]+|search)$/i.test(key)) safe.set(key, value);
  });
  const text = safe.toString();
  return text ? `?${text}` : "";
}

function injectHeadTags(page, country, pathname, options = {}) {
  const canonicalCountry = options.canonicalCountry || country.code;
  const canonical = routeUrlForCountry(canonicalCountry, pathname);
  const alternateCodes = options.alternateCodes || COUNTRY_CODES;
  const tags = [
    `<link rel="canonical" href="${xmlEscape(canonical)}">`,
    hreflangLinks(pathname, alternateCodes),
    clientCountryScript(country.code)
  ].filter(Boolean).join("\n  ");

  let next = page
    .replace(/<link rel="canonical" href="[^"]*">\s*/g, "")
    .replace(/<link rel="alternate" hreflang="[^"]+" href="[^"]+">\s*/g, "");

  if (next.includes("</head>")) {
    next = next.replace("</head>", `  ${tags}\n</head>`);
  }

  return next;
}

function injectCountrySelector(page, country) {
  let next = page;
  const selectorPattern = /<label class="country-select"[\s\S]*?<\/label>/;
  const selector = countrySelectorHtml(country.code);

  if (selectorPattern.test(next)) {
    next = next.replace(selectorPattern, selector);
  } else {
    next = next.replace('<div class="header-actions">', `<div class="header-actions">\n${selector}`);
  }

  if (!next.includes("/country-client.js")) {
    if (next.includes('<script src="script.js"></script>')) {
      next = next.replace('<script src="script.js"></script>', '<script src="/country-client.js"></script>\n  <script src="script.js"></script>');
    } else if (next.includes('<script src="/blog.js"></script>')) {
      next = next.replace('<script src="/blog.js"></script>', '<script src="/country-client.js"></script>\n  <script src="/blog.js"></script>');
    } else {
      next = next.replace("</body>", "  <script src=\"/country-client.js\"></script>\n</body>");
    }
  }

  return next;
}

function replaceMetaContent(page, selector, content) {
  const pattern = new RegExp(`(<meta ${escapeRegExp(selector)} content=")[^"]*(">)`);
  return page.replace(pattern, `$1${xmlEscape(content)}$2`);
}

function decorateStaticPage(page, country, url, options = {}) {
  const pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/$/, "") || "/";
  const text = countryPageText(country);
  let next = injectCountrySelector(page, country);
  next = injectHeadTags(next, country, pathname, options);
  next = next.replace(/<meta property="og:url" content="[^"]*">/g, `<meta property="og:url" content="${xmlEscape(routeUrlForCountry(country.code, pathname))}">`);

  if (options.type === "blog") {
    next = next
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${xmlEscape(text.blogTitle)}</title>`)
      .replace(/<h1>DealKhaleej Blog<\/h1>/, `<h1>${xmlEscape(country.code === "gcc" ? "DealKhaleej Blog" : `${country.shortName} Coupon Guides`)}</h1>`)
      .replace("Useful coupon tips and deal guides for shoppers in Saudi Arabia.", `Useful coupon tips and deal guides for shoppers in ${xmlEscape(country.name)}.`)
      .replace("DealKhaleej Saudi", `DealKhaleej ${xmlEscape(country.shortName)}`);
    next = replaceMetaContent(next, 'name="description"', text.blogDescription);
    next = replaceMetaContent(next, 'property="og:title"', text.blogTitle);
    next = replaceMetaContent(next, 'property="og:description"', text.blogDescription);
  }

  return next;
}

function findStoreForSlug(stores, coupons, slug, country) {
  const normalizedSlug = storeSlug(slug);
  const exact = stores.find((item) => storeSlug(item.slug || item.name) === normalizedSlug || storeSlug(item.name) === normalizedSlug);
  if (exact) return exact;

  const candidates = stores.filter((store) => {
    const slugValue = storeSlug(store.slug || store.name);
    return slugValue.startsWith(`${normalizedSlug}-`) || slugValue.split("-")[0] === normalizedSlug;
  });

  if (!candidates.length) return null;
  const visibleCandidates = filterStoresByCountry(candidates, coupons, country.code);
  return visibleCandidates[0] || candidates[0];
}

async function serveHomePage(response, country, url) {
  const [coupons, stores] = await Promise.all([readCoupons(), readStores()]);
  const filteredCoupons = filterCouponsByCountry(coupons, country.code).filter((coupon) => coupon.active);
  const filteredStores = filterStoresByCountry(stores, coupons, country.code);
  const text = countryPageText(country);
  let page = await fs.readFile(path.join(root, "index.html"), "utf8");

  page = decorateStaticPage(page, country, new URL("/", "https://dealkhaleej.com"));
  page = page
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${xmlEscape(text.title)}</title>`)
    .replace(/<h1 data-i18n="heroTitle">[\s\S]*?<\/h1>/, `<h1 data-i18n="heroTitle">${xmlEscape(text.heroTitle)}</h1>`)
    .replace(/<p class="hero-copy" data-i18n="heroCopyPlain">[\s\S]*?<\/p>/, `<p class="hero-copy" data-i18n="heroCopyPlain">${xmlEscape(text.heroCopy)}</p>`)
    .replace(/<p class="eyebrow" data-i18n="verifiedSaudi">[\s\S]*?<\/p>/, `<p class="eyebrow" data-i18n="verifiedSaudi">${xmlEscape(text.eyebrow)}</p>`)
    .replace(/<strong id="active-coupon-count">[\s\S]*?<\/strong>/, `<strong id="active-coupon-count">${filteredCoupons.length}</strong>`)
    .replace(/<strong id="verified-count">[\s\S]*?<\/strong>/, `<strong id="verified-count">${filteredCoupons.filter((coupon) => coupon.verified).length}</strong>`)
    .replace(/<strong id="category-count">[\s\S]*?<\/strong>/, `<strong id="category-count">${new Set(filteredCoupons.map((coupon) => coupon.category)).size}</strong>`)
    .replace(/<span data-i18n="freshOffers">[\s\S]*?<\/span>/, `<span data-i18n="freshOffers">${xmlEscape(text.freshLabel)}</span>`);

  page = replaceMetaContent(page, 'name="description"', text.description);
  page = replaceMetaContent(page, 'property="og:title"', text.title);
  page = replaceMetaContent(page, 'property="og:description"', text.description);
  page = replaceMetaContent(page, 'name="twitter:title"', text.title);
  page = replaceMetaContent(page, 'name="twitter:description"', text.description);
  page = page.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${xmlEscape(routeUrlForCountry(country.code, "/"))}">`);
  page = page.replace(/<meta name="twitter:image" content="[^"]*">/, '<meta name="twitter:image" content="https://dealkhaleej.com/assets/preview.jpg">');
  page = page.replace("</head>", `  <meta name="dealkhaleej-country" content="${xmlEscape(country.code)}">\n</head>`);

  sendText(response, 200, "text/html", page);
}

function isSafeArticleLink(href) {
  const value = String(href).trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) {
    return false;
  }
  if (value.startsWith("/") && !value.startsWith("//")) {
    return true;
  }
  return value === siteUrl || value.startsWith(`${siteUrl}/`);
}

function renderArticleText(value) {
  const text = String(value);
  const linkPattern = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
  let output = "";
  let lastIndex = 0;
  let match;

  while ((match = linkPattern.exec(text)) !== null) {
    const [fullMatch, label, href] = match;
    output += xmlEscape(text.slice(lastIndex, match.index));

    if (isSafeArticleLink(href)) {
      output += `<a class="article-link" href="${xmlEscape(href.trim())}">${xmlEscape(label)}</a>`;
    } else {
      output += xmlEscape(fullMatch);
    }

    lastIndex = match.index + fullMatch.length;
  }

  return output + xmlEscape(text.slice(lastIndex));
}

function articleMarkup(article) {
  const sections = article.sections
    .map((section) => `
      <section>
        <h2>${xmlEscape(section.heading)}</h2>
        ${section.paragraphs.map((paragraph) => `<p>${renderArticleText(paragraph)}</p>`).join("")}
        ${(section.subsections || []).map((subsection) => `
          <h3>${xmlEscape(subsection.heading)}</h3>
          ${subsection.paragraphs.map((paragraph) => `<p>${renderArticleText(paragraph)}</p>`).join("")}`).join("")}
      </section>`)
    .join("");
  const relatedStores = article.relatedStores
    .map((store) => `<a class="related-store-link" href="/store/${storeSlug(store.slug || store.name)}">${xmlEscape(store.name)} Coupon Codes</a>`)
    .join("");
  const publishedDate = new Date(`${article.publishedAt}T00:00:00`).toLocaleDateString("en-SA", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  return `
      <a class="article-back" href="/blog">All articles</a>
      <header class="article-title">
        <p class="eyebrow">Shopping guide</p>
        <h1>${xmlEscape(article.title)}</h1>
        <time datetime="${xmlEscape(article.publishedAt)}">Published ${xmlEscape(publishedDate)}</time>
      </header>
      <div class="article-content">${sections}
      </div>
      <aside class="related-stores" aria-label="Related stores">
        <p class="eyebrow">Related stores</p>
        <h2>Check current coupon pages</h2>
        <div>${relatedStores}</div>
      </aside>`;
}

async function serveArticlePage(response, slug, country) {
  const articles = await readArticles();
  const article = articles.find((item) => item.slug === slug);
  if (!article || !isArticleVisibleInCountry(article, country.code)) {
    sendText(response, 404, "text/html", "<!DOCTYPE html><title>Article Not Found | DealKhaleej</title><p>Article not found. <a href=\"/blog\">Browse all articles.</a></p>");
    return;
  }

  const articlePath = `/blog/${encodeURIComponent(article.slug)}`;
  const countries = Array.isArray(article.countries) ? article.countries : ["gcc"];
  const isGeneral = countries.includes("gcc") || countries.includes("global");
  const canonicalCountry = isGeneral ? "gcc" : country.code;
  const url = routeUrlForCountry(country.code, articlePath);
  const canonicalUrl = routeUrlForCountry(canonicalCountry, articlePath);
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.metaDescription,
    datePublished: article.publishedAt,
    author: { "@type": "Organization", name: "DealKhaleej" },
    publisher: { "@type": "Organization", name: "DealKhaleej" },
    mainEntityOfPage: canonicalUrl
  }).replace(/</g, "\\u003c");
  let page = await fs.readFile(path.join(root, "article.html"), "utf8");
  const alternateCodes = isGeneral ? COUNTRY_CODES : ["gcc", ...countries.filter((code) => GCC_COUNTRY_CODES.includes(code))];

  page = page
    .replace("<title>Coupon Guide | DealKhaleej</title>", `<title>${xmlEscape(article.metaTitle)}</title>`)
    .replace('content="Saudi Arabia shopping and coupon guide from DealKhaleej."', `content="${xmlEscape(article.metaDescription)}"`)
    .replace('content="Coupon Guide | DealKhaleej"', `content="${xmlEscape(article.metaTitle)}"`)
    .replace('content="Saudi Arabia shopping and coupon guide from DealKhaleej."', `content="${xmlEscape(article.metaDescription)}"`)
    .replace('<meta property="og:url" content="">', `<meta property="og:url" content="${xmlEscape(url)}">`)
    .replace('<meta property="article:published_time" content="">', `<meta property="article:published_time" content="${xmlEscape(article.publishedAt)}">`)
    .replace('<link rel="stylesheet" href="/styles.css">', `<script type="application/ld+json">${structuredData}</script>\n  <link rel="stylesheet" href="/styles.css">`)
    .replace('      <p class="empty-state">Loading article...</p>', articleMarkup(article));
  page = injectCountrySelector(page, country);
  page = injectHeadTags(page, country, articlePath, { canonicalCountry, alternateCodes });

  sendText(response, 200, "text/html", page);
}

async function serveStorePage(response, slug, country) {
  const [stores, coupons, articles, contentEntries] = await Promise.all([
    readStores(),
    readCoupons(),
    readArticles(),
    readStoreContent()
  ]);
  const store = findStoreForSlug(stores, coupons, slug, country);

  if (!store) {
    sendText(response, 404, "text/html", "<!DOCTYPE html><title>Store Not Found | DealKhaleej</title><p>Store not found. <a href=\"/\">Return to DealKhaleej.</a></p>");
    return;
  }

  const visibleCoupons = filterCouponsByCountry(coupons, country.code);
  const visibleStores = filterStoresByCountry(stores, coupons, country.code);
  const visibleArticles = filterArticlesByCountry(articles, country.code);
  const content = contentEntries.find((item) => storeSlug(item.slug || item.displayName || "") === storeSlug(store.slug || store.name));
  const page = renderStorePage({
    store,
    stores: visibleStores,
    coupons: visibleCoupons,
    articles: visibleArticles,
    content,
    siteUrl: siteUrlForCountry(country.code),
    country,
    alternateCountryCodes: countryCodesForStore(store, coupons)
  });
  sendText(response, 200, "text/html", page);
}

function sitemapDate(values) {
  const dates = values
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));
  const latest = dates.length
    ? new Date(Math.max(...dates.map((date) => date.getTime())))
    : new Date();
  return latest.toISOString().slice(0, 10);
}

function riyadhDateStamp(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date(value));
}

function passwordsMatch(candidate) {
  if (!adminPassword) return false;
  const supplied = Buffer.from(String(candidate || ""));
  const expected = Buffer.from(adminPassword);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function adminToken(request) {
  const header = request.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function requireAdmin(request, response) {
  if (!adminSessions.has(adminToken(request))) {
    sendJson(response, 401, { error: "Admin login required." });
    return false;
  }
  return true;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function readCoupons() {
  const text = await fs.readFile(dataFile, "utf8");
  return JSON.parse(text);
}

async function readStores() {
  const text = await fs.readFile(storesFile, "utf8");
  return JSON.parse(text);
}

async function readClicks() {
  try {
    const text = await fs.readFile(clicksFile, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readOutboundClicks() {
  try {
    const text = await fs.readFile(outboundClicksFile, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readImportHistory() {
  try {
    const text = await fs.readFile(importHistoryFile, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readNewsletter() {
  try {
    const text = await fs.readFile(newsletterFile, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readArticles() {
  const text = await fs.readFile(articlesFile, "utf8");
  return JSON.parse(text);
}

async function readStoreContent() {
  try {
    const text = await fs.readFile(storeContentFile, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeCoupons(coupons) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  await fs.writeFile(dataFile, `${JSON.stringify(coupons, null, 2)}\n`);
}

async function writeClicks(clicks) {
  await fs.mkdir(path.dirname(clicksFile), { recursive: true });
  await fs.writeFile(clicksFile, `${JSON.stringify(clicks, null, 2)}\n`);
}

async function writeOutboundClicks(clicks) {
  await fs.mkdir(path.dirname(outboundClicksFile), { recursive: true });
  await fs.writeFile(outboundClicksFile, `${JSON.stringify(clicks, null, 2)}\n`);
}

async function writeImportHistory(history) {
  await fs.mkdir(path.dirname(importHistoryFile), { recursive: true });
  await fs.writeFile(importHistoryFile, `${JSON.stringify(history, null, 2)}\n`);
}

async function addNewsletterSubscriber(email) {
  let added = false;

  newsletterWriteQueue = newsletterWriteQueue.then(async () => {
    const subscribers = await readNewsletter();
    if (subscribers.some((subscriber) => subscriber.email === email)) return;

    subscribers.unshift({ email, subscribedAt: new Date().toISOString() });
    await fs.mkdir(path.dirname(newsletterFile), { recursive: true });
    await fs.writeFile(newsletterFile, `${JSON.stringify(subscribers, null, 2)}\n`);
    added = true;
  });

  await newsletterWriteQueue;
  return added;
}

function affiliateUrl(value) {
  try {
    const target = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(target.protocol) ? target.href : null;
  } catch {
    return null;
  }
}

function cleanClick(input) {
  const couponId = String(input.couponId || "").trim();
  const storeName = String(input.storeName || "").trim();
  const couponCode = String(input.couponCode || "").trim();
  const couponTitle = String(input.couponTitle || "").trim();

  if (!couponId || !storeName || !couponTitle) {
    const error = new Error("Coupon id, store, and title are required.");
    error.status = 400;
    throw error;
  }

  return {
    id: randomUUID(),
    couponId,
    storeName,
    couponCode,
    couponTitle,
    clickedAt: new Date().toISOString()
  };
}

function cleanEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!validEmail.test(email) || email.length > 254) {
    const error = new Error("Please enter a valid email address.");
    error.status = 400;
    throw error;
  }

  return email;
}

function cleanCoupon(input, existing = {}) {
  const store = String(input.store || "").trim();
  const title = String(input.title || "").trim();
  const category = String(input.category || "").trim().toLowerCase();

  if (!store || !title || !category) {
    const error = new Error("Store, title, and category are required.");
    error.status = 400;
    throw error;
  }

  return {
    id: existing.id || randomUUID(),
    store,
    title,
    code: String(input.code || "OFFER").trim().toUpperCase(),
    category,
    keywords: String(input.keywords || `${store} ${title} ${category}`).trim(),
    meta: String(input.meta || "Fresh offer").trim(),
    expiry: String(input.expiry || "").trim(),
    logo: String(input.logo || "assets/logos/placeholder.png").trim(),
    storeTagline: String(input.storeTagline || title).trim(),
    url: String(input.url || "#").trim(),
    countries: itemCountries({ ...input, store, title, category }, `${existing.countries || ""}`),
    active: Boolean(input.active),
    verified: Boolean(input.verified),
    updatedAt: new Date().toISOString()
  };
}

async function handleApi(request, response, url, country) {
  const idMatch = url.pathname.match(/^\/api\/coupons\/([^/]+)$/);

  if (url.pathname === "/api/admin-login" && request.method === "POST") {
    if (!adminPassword) {
      sendJson(response, 503, { error: "Admin login is not configured. Set ADMIN_PASSWORD on the server." });
      return true;
    }

    const input = await readBody(request);
    if (!passwordsMatch(input.password)) {
      sendJson(response, 401, { error: "Incorrect password." });
      return true;
    }

    const token = randomUUID();
    adminSessions.add(token);
    sendJson(response, 200, { token });
    return true;
  }

  if (url.pathname === "/api/admin-session" && request.method === "GET") {
    if (!requireAdmin(request, response)) return true;
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (url.pathname === "/api/admin-logout" && request.method === "POST") {
    if (!requireAdmin(request, response)) return true;
    adminSessions.delete(adminToken(request));
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (url.pathname === "/api/clicks" && request.method === "GET") {
    if (!requireAdmin(request, response)) return true;
    sendJson(response, 200, await readClicks());
    return true;
  }

  if (url.pathname === "/api/clicks" && request.method === "POST") {
    const clicks = await readClicks();
    const click = cleanClick(await readBody(request));
    clicks.unshift(click);
    await writeClicks(clicks);
    sendJson(response, 201, click);
    return true;
  }

  if (url.pathname === "/api/trending" && request.method === "GET") {
    const [coupons, outboundClicks] = await Promise.all([readCoupons(), readOutboundClicks()]);
    const visibleCoupons = filterCouponsByCountry(coupons, country.code);
    const today = riyadhDateStamp();
    const activity = new Map();

    outboundClicks.forEach((click) => {
      if (riyadhDateStamp(click.clickedAt) !== today) return;

      const current = activity.get(click.couponId) || { outboundCount: 0, lastClickedAt: "" };
      current.outboundCount += 1;
      current.lastClickedAt = current.lastClickedAt > click.clickedAt ? current.lastClickedAt : click.clickedAt;
      activity.set(click.couponId, current);
    });

    const trending = visibleCoupons
      .filter((coupon) => coupon.active && activity.has(coupon.id))
      .map((coupon) => ({ ...coupon, ...activity.get(coupon.id) }))
      .sort((left, right) => right.outboundCount - left.outboundCount || right.lastClickedAt.localeCompare(left.lastClickedAt))
      .slice(0, 5);

    sendJson(response, 200, trending);
    return true;
  }

  if (url.pathname === "/api/newsletter" && request.method === "POST") {
    const email = cleanEmail((await readBody(request)).email);
    await addNewsletterSubscriber(email);
    sendJson(response, 200, { ok: true, message: "Thanks! You are subscribed for deal alerts." });
    return true;
  }

  if (url.pathname === "/api/articles" && request.method === "GET") {
    sendJson(response, 200, filterArticlesByCountry(await readArticles(), country.code));
    return true;
  }

  const articleMatch = url.pathname.match(/^\/api\/articles\/([^/]+)$/);
  if (articleMatch && request.method === "GET") {
    const articles = await readArticles();
    const article = articles.find((item) => item.slug === decodeURIComponent(articleMatch[1]));
    if (!article || !isArticleVisibleInCountry(article, country.code)) {
      sendJson(response, 404, { error: "Article not found." });
      return true;
    }
    sendJson(response, 200, article);
    return true;
  }

  if (url.pathname === "/api/import-coupons" && request.method === "POST") {
    if (!requireAdmin(request, response)) return true;

    const result = await importFromSource((await readBody(request)).source);
    const history = await readImportHistory();
    const entry = {
      importedAt: new Date().toISOString(),
      source: result.source,
      importedCount: result.coupons.length
    };

    history.unshift(entry);
    await writeImportHistory(history);
    sendJson(response, 200, {
      ...entry,
      supportedSources: availableSources(),
      message: "Import provider is ready for API integration. No coupons were changed."
    });
    return true;
  }

  if (url.pathname === "/api/stores" && request.method === "GET") {
    const [stores, coupons] = await Promise.all([readStores(), readCoupons()]);
    sendJson(response, 200, filterStoresByCountry(stores, coupons, country.code));
    return true;
  }

  if (url.pathname === "/api/coupons" && request.method === "GET") {
    sendJson(response, 200, filterCouponsByCountry(await readCoupons(), country.code));
    return true;
  }

  if (url.pathname === "/api/search" && request.method === "GET") {
    const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
    const [stores, coupons, articles] = await Promise.all([readStores(), readCoupons(), readArticles()]);
    const visibleCoupons = filterCouponsByCountry(coupons, country.code);
    const visibleStores = filterStoresByCountry(stores, coupons, country.code);
    const visibleArticles = filterArticlesByCountry(articles, country.code);

    if (!query) {
      sendJson(response, 200, { country: country.code, stores: [], coupons: [], articles: [] });
      return true;
    }

    const includesQuery = (value) => String(value || "").toLowerCase().includes(query);
    sendJson(response, 200, {
      country: country.code,
      stores: visibleStores.filter((store) => includesQuery(`${store.name} ${store.category} ${store.description}`)).slice(0, 12),
      coupons: visibleCoupons.filter((coupon) => includesQuery(`${coupon.store} ${coupon.title} ${coupon.code} ${coupon.category} ${coupon.keywords} ${coupon.meta}`)).slice(0, 12),
      articles: visibleArticles.filter((article) => includesQuery(`${article.title} ${article.excerpt} ${article.metaDescription}`)).slice(0, 12)
    });
    return true;
  }

  if (url.pathname === "/api/coupons" && request.method === "POST") {
    if (!requireAdmin(request, response)) return true;
    const coupons = await readCoupons();
    const coupon = cleanCoupon(await readBody(request), { id: randomUUID() });
    coupons.unshift(coupon);
    await writeCoupons(coupons);
    sendJson(response, 201, coupon);
    return true;
  }

  if (idMatch && request.method === "PUT") {
    if (!requireAdmin(request, response)) return true;
    const coupons = await readCoupons();
    const index = coupons.findIndex((coupon) => coupon.id === idMatch[1]);
    if (index === -1) {
      sendJson(response, 404, { error: "Coupon not found." });
      return true;
    }

    coupons[index] = cleanCoupon(await readBody(request), coupons[index]);
    await writeCoupons(coupons);
    sendJson(response, 200, coupons[index]);
    return true;
  }

  if (idMatch && request.method === "DELETE") {
    if (!requireAdmin(request, response)) return true;
    const coupons = await readCoupons();
    const nextCoupons = coupons.filter((coupon) => coupon.id !== idMatch[1]);
    if (nextCoupons.length === coupons.length) {
      sendJson(response, 404, { error: "Coupon not found." });
      return true;
    }

    await writeCoupons(nextCoupons);
    sendJson(response, 200, { ok: true });
    return true;
  }

  return false;
}

async function handleSeoRoutes(response, url, country) {
  const currentSiteUrl = siteUrlForCountry(country.code);

  if (url.pathname === "/robots.txt") {
    sendText(response, 200, "text/plain", `User-agent: *\nAllow: /\nSitemap: ${currentSiteUrl}/sitemap.xml\n`);
    return true;
  }

  if (url.pathname !== "/sitemap.xml") return false;

  const [stores, coupons, articles] = await Promise.all([readStores(), readCoupons(), readArticles()]);
  const visibleCoupons = filterCouponsByCountry(coupons, country.code);
  const visibleStores = filterStoresByCountry(stores, coupons, country.code);
  const visibleArticles = filterArticlesByCountry(articles, country.code);
  const homepageLastmod = sitemapDate(visibleCoupons.map((coupon) => coupon.updatedAt));
  const entries = [
    { loc: `${currentSiteUrl}/`, lastmod: homepageLastmod },
    { loc: `${currentSiteUrl}/blog`, lastmod: sitemapDate(visibleArticles.map((article) => article.publishedAt)) },
    ...[...staticPageRoutes.keys()].map((route) => ({
      loc: `${currentSiteUrl}${route}`,
      lastmod: "2026-05-29"
    })),
    ...visibleStores.map((store) => {
      const storeCoupons = visibleCoupons.filter((coupon) => coupon.store.toLowerCase() === store.name.toLowerCase());
      return {
        loc: `${currentSiteUrl}/store/${storeSlug(store.name)}`,
        lastmod: sitemapDate(storeCoupons.map((coupon) => coupon.updatedAt))
      };
    }),
    ...visibleArticles.map((article) => ({
      loc: `${currentSiteUrl}/blog/${encodeURIComponent(article.slug)}`,
      lastmod: sitemapDate([article.publishedAt])
    }))
  ];
  const urls = entries
    .map((entry) => `  <url>\n    <loc>${xmlEscape(entry.loc)}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n  </url>`)
    .join("\n");
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  sendText(response, 200, "application/xml", sitemap);
  return true;
}

async function serveStatic(request, response, url, country) {
  const isStoreRoute = /^\/store\/[^/]+\/?$/.test(url.pathname);
  const isBlogIndexRoute = /^\/blog\/?$/.test(url.pathname);
  const isArticleRoute = /^\/blog\/[^/]+\/?$/.test(url.pathname);
  if (url.pathname === "/") {
    await serveHomePage(response, country, url);
    return;
  }

  if (isStoreRoute) {
    await serveStorePage(response, decodeURIComponent(url.pathname.replace(/^\/store\//, "").replace(/\/$/, "")), country);
    return;
  }

  if (isArticleRoute) {
    await serveArticlePage(response, decodeURIComponent(url.pathname.replace(/^\/blog\//, "").replace(/\/$/, "")), country);
    return;
  }

  const requestedPath = url.pathname === "/"
    ? "/index.html"
    : isBlogIndexRoute
        ? "/blog.html"
        : staticPageRoutes.get(url.pathname.replace(/\/$/, "")) || decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(root, requestedPath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    if (path.extname(filePath) === ".html") {
      const html = decorateStaticPage(file.toString("utf8"), country, url, { type: isBlogIndexRoute ? "blog" : "static" });
      sendText(response, 200, "text/html", html);
      return;
    }
    response.writeHead(200, { "Content-Type": contentType });
    response.end(file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

async function handleOutboundRedirect(response, url, country) {
  const match = url.pathname.match(/^\/go\/([^/]+)\/?$/);
  if (!match) return false;

  const couponId = decodeURIComponent(match[1]);
  const coupons = await readCoupons();
  const coupon = coupons.find((item) => item.id === couponId);
  const preferredUrl = country.code === "ae" && coupon?.uaeUrl ? coupon.uaeUrl : coupon?.url;
  const targetUrl = coupon && affiliateUrl(preferredUrl);

  if (!coupon || !targetUrl) {
    response.writeHead(302, { Location: "/" });
    response.end();
    return true;
  }

  const outboundClicks = await readOutboundClicks();
  outboundClicks.unshift({
    couponId: coupon.id,
    store: coupon.store,
    title: coupon.title,
    url: targetUrl,
    clickedAt: new Date().toISOString()
  });
  await writeOutboundClicks(outboundClicks);

  response.writeHead(302, { Location: targetUrl });
  response.end();
  return true;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const country = countryFromRequest(request, url);

  try {
    if (url.pathname.startsWith("/api/") && await handleApi(request, response, url, country)) return;
    if (request.method === "GET" && await handleSeoRoutes(response, url, country)) return;
    if (request.method === "GET" && await handleOutboundRedirect(response, url, country)) return;
    await serveStatic(request, response, url, country);
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message || "Server error." });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`DealKhaleej running on port ${port}`);
});
