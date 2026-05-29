const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { randomUUID, timingSafeEqual } = require("crypto");
const { availableSources, importFromSource } = require("./imports/providers");

const root = __dirname;
const dataFile = path.join(root, "data", "coupons.json");
const storesFile = path.join(root, "data", "stores.json");
const clicksFile = path.join(root, "data", "clicks.json");
const outboundClicksFile = path.join(root, "data", "outbound-clicks.json");
const importHistoryFile = path.join(root, "data", "import-history.json");
const newsletterFile = path.join(root, "data", "newsletter.json");
const articlesFile = path.join(root, "data", "articles.json");
const port = Number(process.env.PORT || 5173);
const adminPassword = process.env.ADMIN_PASSWORD;
const adminSessions = new Set();
const siteUrl = "https://dealkhaleej.com";
const staticPageRoutes = new Map([
  ["/about", "/about.html"],
  ["/contact", "/contact.html"],
  ["/privacy-policy", "/privacy-policy.html"],
  ["/terms", "/terms.html"],
  ["/affiliate-disclosure", "/affiliate-disclosure.html"]
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

function articleMarkup(article) {
  const sections = article.sections
    .map((section) => `
      <section>
        <h2>${xmlEscape(section.heading)}</h2>
        ${section.paragraphs.map((paragraph) => `<p>${xmlEscape(paragraph)}</p>`).join("")}
        ${(section.subsections || []).map((subsection) => `
          <h3>${xmlEscape(subsection.heading)}</h3>
          ${subsection.paragraphs.map((paragraph) => `<p>${xmlEscape(paragraph)}</p>`).join("")}`).join("")}
      </section>`)
    .join("");
  const relatedStores = article.relatedStores
    .map((store) => `<a class="related-store-link" href="/store/${encodeURIComponent(store.slug)}">${xmlEscape(store.name)} Coupon Codes</a>`)
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

async function serveArticlePage(response, slug) {
  const articles = await readArticles();
  const article = articles.find((item) => item.slug === slug);
  if (!article) {
    sendText(response, 404, "text/html", "<!DOCTYPE html><title>Article Not Found | DealKhaleej</title><p>Article not found. <a href=\"/blog\">Browse all articles.</a></p>");
    return;
  }

  const url = `${siteUrl}/blog/${encodeURIComponent(article.slug)}`;
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.metaDescription,
    datePublished: article.publishedAt,
    author: { "@type": "Organization", name: "DealKhaleej" },
    publisher: { "@type": "Organization", name: "DealKhaleej" },
    mainEntityOfPage: url
  }).replace(/</g, "\\u003c");
  let page = await fs.readFile(path.join(root, "article.html"), "utf8");

  page = page
    .replace("<title>Coupon Guide | DealKhaleej</title>", `<title>${xmlEscape(article.metaTitle)}</title>`)
    .replace('content="Saudi Arabia shopping and coupon guide from DealKhaleej."', `content="${xmlEscape(article.metaDescription)}"`)
    .replace('content="Coupon Guide | DealKhaleej"', `content="${xmlEscape(article.metaTitle)}"`)
    .replace('content="Saudi Arabia shopping and coupon guide from DealKhaleej."', `content="${xmlEscape(article.metaDescription)}"`)
    .replace('<meta property="og:url" content="">', `<meta property="og:url" content="${xmlEscape(url)}">`)
    .replace('<meta property="article:published_time" content="">', `<meta property="article:published_time" content="${xmlEscape(article.publishedAt)}">`)
    .replace('<link rel="canonical" href="">', `<link rel="canonical" href="${xmlEscape(url)}">`)
    .replace('<link rel="stylesheet" href="/styles.css">', `<script type="application/ld+json">${structuredData}</script>\n  <link rel="stylesheet" href="/styles.css">`)
    .replace('      <p class="empty-state">Loading article...</p>', articleMarkup(article));

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
    active: Boolean(input.active),
    verified: Boolean(input.verified),
    updatedAt: new Date().toISOString()
  };
}

async function handleApi(request, response, url) {
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
    const today = riyadhDateStamp();
    const activity = new Map();

    outboundClicks.forEach((click) => {
      if (riyadhDateStamp(click.clickedAt) !== today) return;

      const current = activity.get(click.couponId) || { outboundCount: 0, lastClickedAt: "" };
      current.outboundCount += 1;
      current.lastClickedAt = current.lastClickedAt > click.clickedAt ? current.lastClickedAt : click.clickedAt;
      activity.set(click.couponId, current);
    });

    const trending = coupons
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
    sendJson(response, 200, await readArticles());
    return true;
  }

  const articleMatch = url.pathname.match(/^\/api\/articles\/([^/]+)$/);
  if (articleMatch && request.method === "GET") {
    const articles = await readArticles();
    const article = articles.find((item) => item.slug === decodeURIComponent(articleMatch[1]));
    if (!article) {
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
    sendJson(response, 200, await readStores());
    return true;
  }

  if (url.pathname === "/api/coupons" && request.method === "GET") {
    sendJson(response, 200, await readCoupons());
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

async function handleSeoRoutes(response, url) {
  if (url.pathname === "/robots.txt") {
    sendText(response, 200, "text/plain", `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
    return true;
  }

  if (url.pathname !== "/sitemap.xml") return false;

  const [stores, coupons, articles] = await Promise.all([readStores(), readCoupons(), readArticles()]);
  const homepageLastmod = sitemapDate(coupons.map((coupon) => coupon.updatedAt));
  const entries = [
    { loc: `${siteUrl}/`, lastmod: homepageLastmod },
    { loc: `${siteUrl}/blog`, lastmod: sitemapDate(articles.map((article) => article.publishedAt)) },
    ...[...staticPageRoutes.keys()].map((route) => ({
      loc: `${siteUrl}${route}`,
      lastmod: "2026-05-29"
    })),
    ...stores.map((store) => {
      const storeCoupons = coupons.filter((coupon) => coupon.store.toLowerCase() === store.name.toLowerCase());
      return {
        loc: `${siteUrl}/store/${encodeURIComponent(store.name.toLowerCase())}`,
        lastmod: sitemapDate(storeCoupons.map((coupon) => coupon.updatedAt))
      };
    }),
    ...articles.map((article) => ({
      loc: `${siteUrl}/blog/${encodeURIComponent(article.slug)}`,
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

async function serveStatic(request, response, url) {
  const isStoreRoute = /^\/store\/[^/]+\/?$/.test(url.pathname);
  const isBlogIndexRoute = /^\/blog\/?$/.test(url.pathname);
  const isArticleRoute = /^\/blog\/[^/]+\/?$/.test(url.pathname);
  if (isArticleRoute) {
    await serveArticlePage(response, decodeURIComponent(url.pathname.replace(/^\/blog\//, "").replace(/\/$/, "")));
    return;
  }

  const requestedPath = url.pathname === "/"
    ? "/index.html"
    : isStoreRoute
      ? "/store.html"
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
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

async function handleOutboundRedirect(response, url) {
  const match = url.pathname.match(/^\/go\/([^/]+)\/?$/);
  if (!match) return false;

  const couponId = decodeURIComponent(match[1]);
  const coupons = await readCoupons();
  const coupon = coupons.find((item) => item.id === couponId);
  const targetUrl = coupon && affiliateUrl(coupon.url);

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

  try {
    if (url.pathname.startsWith("/api/") && await handleApi(request, response, url)) return;
    if (request.method === "GET" && await handleSeoRoutes(response, url)) return;
    if (request.method === "GET" && await handleOutboundRedirect(response, url)) return;
    await serveStatic(request, response, url);
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message || "Server error." });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`DealKhaleej running on port ${port}`);
});
