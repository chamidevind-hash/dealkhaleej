const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const siteUrl = "https://dealkhaleej.com";
const port = Number(process.env.CRAWL_PRIORITY_PORT || 5987);
const localOrigin = `http://127.0.0.1:${port}`;
const reportsDir = path.join(root, "reports");

const staticPriorityPaths = [
  "/",
  "/stores",
  "/coupons",
  "/blog",
  "/travel",
  "/travel/hotels",
  "/travel/flights",
  "/travel/car-rentals",
  "/travel/activities",
  "/travel/esim"
];

function readJson(relativePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
  } catch (error) {
    if (fallback !== null && error.code === "ENOENT") return fallback;
    throw error;
  }
}

function storeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer({ fullSitemap = false } = {}) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "crawl-priority-check",
      DEALKHALEEJ_FULL_SITEMAP: fullSitemap ? "1" : ""
    },
    stdio: "ignore"
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${localOrigin}/robots.txt`);
      if (response.ok) return child;
    } catch {
      await sleep(250);
    }
  }

  child.kill();
  throw new Error("Local server did not start for crawl priority audit.");
}

function localizeUrl(url) {
  return url.replace(siteUrl, localOrigin);
}

function textFromHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text) {
  return (String(text || "").match(/\b[\w'-]+\b/g) || []).length;
}

function firstMatch(html, pattern) {
  const match = String(html || "").match(pattern);
  return match ? textFromHtml(match[1]) : "";
}

function canonicalFromHtml(html) {
  const match = String(html || "").match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/i);
  return match ? match[1] : "";
}

function robotsStatus(headers, html) {
  const header = headers.get("x-robots-tag") || "";
  const meta = String(html || "").match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["'][^>]*>/i)?.[1] || "";
  const value = `${header} ${meta}`.toLowerCase().trim();
  if (!value) return "indexable";
  if (value.includes("noindex")) return "noindex";
  return value;
}

function pageType(pathname) {
  if (pathname === "/") return "home";
  if (pathname === "/stores") return "stores-directory";
  if (pathname === "/coupons") return "coupons-directory";
  if (pathname === "/blog") return "blog-index";
  if (pathname.startsWith("/blog/")) return "article";
  if (pathname.startsWith("/store/")) return "store";
  if (pathname.startsWith("/travel")) return "travel";
  if (pathname.startsWith("/go/")) return "utility";
  return "static";
}

function tokenize(value) {
  const stop = new Set(["the", "and", "for", "with", "from", "this", "that", "your", "you", "are", "how", "best", "guide", "coupon", "coupons", "code", "codes", "deals", "deal", "online", "shopping", "saudi", "arabia", "gcc", "uae", "in", "to", "of", "a", "an"]);
  return new Set(String(value || "").toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 2 && !stop.has(word)) || []);
}

function jaccard(left, right) {
  if (!left.size && !right.size) return 0;
  const intersection = [...left].filter((item) => right.has(item)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function articleText(article) {
  return [
    article.title,
    article.excerpt,
    article.metaTitle,
    article.metaDescription,
    ...(article.sections || []).flatMap((section) => [
      section.heading,
      ...(section.paragraphs || []),
      ...(section.subsections || []).flatMap((subsection) => [subsection.heading, ...(subsection.paragraphs || [])])
    ])
  ].filter(Boolean).join(" ");
}

function articleSimilarityScores(articles) {
  const tokens = new Map(articles.map((article) => [article.slug, tokenize(articleText(article))]));
  const scores = new Map();

  for (const article of articles) {
    let max = 0;
    let closest = "";
    for (const other of articles) {
      if (other.slug === article.slug) continue;
      const score = jaccard(tokens.get(article.slug), tokens.get(other.slug));
      if (score > max) {
        max = score;
        closest = other.slug;
      }
    }
    scores.set(article.slug, { score: Number(max.toFixed(3)), closest });
  }

  return scores;
}

function activeOfferCountForStore(store, coupons) {
  return coupons.filter((coupon) => coupon.active && coupon.store.toLowerCase() === store.name.toLowerCase()).length;
}

function couponStrength(coupon) {
  const text = `${coupon.title || ""} ${coupon.meta || ""}`;
  const numbers = [...text.matchAll(/(\d+(?:\.\d+)?)/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  return (numbers.length ? Math.max(...numbers) : 0) + (coupon.verified ? 25 : 0) + (String(coupon.code || "").toLowerCase() !== "offer" ? 15 : 0);
}

function storeScore(store, coupons) {
  const matching = coupons.filter((coupon) => coupon.active && coupon.store.toLowerCase() === store.name.toLowerCase());
  const strength = matching.reduce((total, coupon) => total + couponStrength(coupon), 0);
  return matching.length * 80 + strength + (store.logo && !String(store.logo).includes("placeholder") ? 15 : 0);
}

function classify(row) {
  if (row.httpStatus >= 300 || row.httpStatus < 200 || row.robotsStatus === "noindex") return "D";
  if (row.canonical && row.canonical !== row.url) return "D";
  if (row.pageType === "store" && row.activeOfferCount === 0) return "C";
  if (row.pageType === "article" && row.articleSimilarityScore >= 0.72) return "C";
  if (row.pageType === "article" && row.bodyWordCount < 900) return "B";
  if (row.bodyWordCount < 300 && !["home", "stores-directory", "coupons-directory", "blog-index"].includes(row.pageType)) return "B";
  if (row.pageType === "store" && row.activeOfferCount > 0 && row.bodyWordCount >= 500) return "A";
  if (row.pageType === "article" && row.bodyWordCount >= 1200 && row.articleSimilarityScore < 0.58) return "A";
  if (staticPriorityPaths.includes(new URL(row.url).pathname)) return "A";
  return "B";
}

function reasonFor(row) {
  if (row.classification === "D") return "Not indexable, redirecting, canonical mismatch, noindex, or unavailable.";
  if (row.classification === "C") return row.pageType === "store" ? "Store page has no active offers; remove temporarily from sitemap." : "Weak or highly overlapping page; remove temporarily until improved.";
  if (row.classification === "B") return "Useful page, but needs stronger unique content, clearer intent, or more internal support before sitemap priority.";
  return "Strong crawl target with useful content and/or active commercial intent.";
}

function articleGroup(article) {
  const text = `${article.title || ""} ${article.slug || ""}`.toLowerCase();
  if (text.includes("noon")) return "Noon coupon-code guides";
  if (/hotel|hotels|dubai|riyadh|jeddah/.test(text) && /travel|booking|hotel/.test(text)) return "Best hotel destination guides";
  if (/travel|flight|flights|esim|car-rental|activities|booking/.test(text)) return "General travel booking guides";
  if (/buying-guide|review|store|websites|sites/.test(text)) return "Store buying guides";
  if (/saudi|uae|gcc|qatar|oman|kuwait|bahrain/.test(text) && /shopping|online/.test(text)) return "Country online-shopping guides";
  if (/coupon|promo|discount|verified|saving/.test(text)) return "Generic coupon-code guides";
  return "";
}

function overlapGroups(articles, articleMetrics) {
  const grouped = new Map();
  for (const article of articles) {
    const group = articleGroup(article);
    if (!group) continue;
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(article);
  }

  return [...grouped.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([group, items]) => {
      const ranked = [...items].sort((left, right) => {
        const leftMetric = articleMetrics.get(left.slug) || {};
        const rightMetric = articleMetrics.get(right.slug) || {};
        return (rightMetric.bodyWordCount || 0) - (leftMetric.bodyWordCount || 0)
          || String(right.publishedAt || "").localeCompare(String(left.publishedAt || ""));
      });
      const strongest = ranked[0];
      const weaker = ranked.slice(1);
      const maxSimilarity = Math.max(...ranked.map((article) => articleMetrics.get(article.slug)?.articleSimilarityScore || 0));
      return {
        group,
        strongestPage: `${siteUrl}/blog/${strongest.slug}`,
        weakerPages: weaker.map((article) => `${siteUrl}/blog/${article.slug}`),
        overlappingSearchIntent: group,
        recommendation: maxSimilarity >= 0.72 ? "merge" : maxSimilarity >= 0.62 ? "improve separately" : "improve separately"
      };
    });
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeReports(report) {
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, "crawl-priority-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const headers = [
    "url",
    "pageType",
    "httpStatus",
    "canonical",
    "robotsStatus",
    "title",
    "h1",
    "bodyWordCount",
    "internalIncomingLinkCount",
    "activeOfferCount",
    "articleSimilarityScore",
    "serverRendered",
    "inSitemap",
    "classification",
    "recommendation"
  ];
  const rows = report.urls.map((row) => headers.map((header) => csvEscape(row[header])).join(","));
  fs.writeFileSync(path.join(reportsDir, "crawl-priority-report.csv"), `${headers.join(",")}\n${rows.join("\n")}\n`);
  for (const level of ["A", "B"]) {
    fs.writeFileSync(
      path.join(reportsDir, `priority-${level.toLowerCase()}-urls.txt`),
      `${report.urls.filter((row) => row.classification === level).map((row) => row.url).join("\n")}\n`
    );
  }
  fs.writeFileSync(path.join(reportsDir, "removed-from-sitemap.txt"), `${(report.removedFromSitemap || []).join("\n")}\n`);
}

async function fetchSitemapUrls() {
  const response = await fetch(`${localOrigin}/sitemap.xml`);
  if (!response.ok) throw new Error(`sitemap.xml returned ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
}

async function auditCurrentSitemap({ fullSitemap = false } = {}) {
  const stores = readJson("data/stores.json", []);
  const coupons = readJson("data/coupons.json", []);
  const articles = readJson("data/articles.json", []);
  const similarity = articleSimilarityScores(articles);
  const articleBySlug = new Map(articles.map((article) => [article.slug, article]));
  const storeBySlug = new Map(stores.map((store) => [storeSlug(store.slug || store.name), store]));
  const child = await startServer({ fullSitemap });

  try {
    const sitemapUrls = await fetchSitemapUrls();
    const fetched = [];
    for (const url of sitemapUrls) {
      const response = await fetch(localizeUrl(url), { redirect: "manual" });
      const html = (response.headers.get("content-type") || "").includes("text/html") ? await response.text() : "";
      const pathname = new URL(url).pathname;
      const type = pageType(pathname);
      const article = type === "article" ? articleBySlug.get(decodeURIComponent(pathname.replace(/^\/blog\//, ""))) : null;
      const store = type === "store" ? storeBySlug.get(storeSlug(decodeURIComponent(pathname.replace(/^\/store\//, "")))) : null;
      const text = textFromHtml(html);
      fetched.push({
        url,
        pathname,
        pageType: type,
        httpStatus: response.status,
        canonical: canonicalFromHtml(html),
        robotsStatus: robotsStatus(response.headers, html),
        title: firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
        h1: firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
        bodyWordCount: wordCount(text),
        activeOfferCount: store ? activeOfferCountForStore(store, coupons) : "",
        articleSimilarityScore: article ? similarity.get(article.slug)?.score || 0 : "",
        closestSimilarArticle: article ? similarity.get(article.slug)?.closest || "" : "",
        serverRendered: Boolean(html && !/Loading article|Loading articles|Loading coupons|Loading stores/i.test(html)),
        inSitemap: true
      });
    }

    const htmlByUrl = new Map(fetched.map((row) => [row.url, ""]));
    for (const row of fetched) {
      if (row.httpStatus !== 200) continue;
      const response = await fetch(localizeUrl(row.url));
      htmlByUrl.set(row.url, await response.text());
    }

    for (const row of fetched) {
      const pathToFind = new URL(row.url).pathname;
      row.internalIncomingLinkCount = [...htmlByUrl.entries()].reduce((count, [sourceUrl, html]) => {
        if (sourceUrl === row.url) return count;
        const matches = [...String(html).matchAll(/href=["']([^"']+)["']/g)]
          .filter((match) => {
            try {
              return new URL(match[1], siteUrl).pathname.replace(/\/$/, "") === pathToFind.replace(/\/$/, "");
            } catch {
              return false;
            }
          }).length;
        return count + matches;
      }, 0);
      row.classification = classify(row);
      row.recommendation = reasonFor(row);
    }

    const articleMetrics = new Map(fetched
      .filter((row) => row.pageType === "article")
      .map((row) => [decodeURIComponent(new URL(row.url).pathname.replace(/^\/blog\//, "")), row]));
    const report = {
      generatedAt: new Date().toISOString(),
      mode: fullSitemap ? "full-candidate-sitemap" : "current-sitemap",
      totals: {
        urls: fetched.length,
        priorityA: fetched.filter((row) => row.classification === "A").length,
        priorityB: fetched.filter((row) => row.classification === "B").length,
        priorityC: fetched.filter((row) => row.classification === "C").length,
        priorityD: fetched.filter((row) => row.classification === "D").length
      },
      urls: fetched,
      overlapGroups: overlapGroups(articles, articleMetrics),
      removedFromSitemap: []
    };
    return report;
  } finally {
    child.kill();
  }
}

function selectPriorityUrls(report) {
  const byPath = new Map(report.urls.map((row) => [new URL(row.url).pathname, row]));
  const selected = [];
  const add = (pathValue) => {
    const row = byPath.get(pathValue);
    if (row && !selected.includes(row.url) && row.classification !== "D") selected.push(row.url);
  };

  staticPriorityPaths.forEach(add);

  report.urls
    .filter((row) => row.pageType === "store" && row.classification === "A")
    .sort((left, right) => Number(right.activeOfferCount || 0) - Number(left.activeOfferCount || 0) || right.bodyWordCount - left.bodyWordCount)
    .slice(0, 16)
    .forEach((row) => selected.push(row.url));

  report.urls
    .filter((row) => row.pageType === "article" && row.classification === "A")
    .sort((left, right) => right.bodyWordCount - left.bodyWordCount || left.articleSimilarityScore - right.articleSimilarityScore)
    .slice(0, 20)
    .forEach((row) => {
      if (!selected.includes(row.url)) selected.push(row.url);
    });

  report.urls
    .filter((row) => row.pageType === "article" && row.classification === "B" && row.bodyWordCount >= 1200 && row.articleSimilarityScore < 0.7)
    .sort((left, right) => right.bodyWordCount - left.bodyWordCount || left.articleSimilarityScore - right.articleSimilarityScore)
    .slice(0, 12)
    .forEach((row) => {
      if (selected.length < 44 && !selected.includes(row.url)) selected.push(row.url);
    });

  report.urls
    .filter((row) => row.pageType === "travel" && row.classification !== "D")
    .sort((left, right) => right.bodyWordCount - left.bodyWordCount)
    .slice(0, 6)
    .forEach((row) => {
      if (selected.length < 50 && !selected.includes(row.url)) selected.push(row.url);
    });

  return selected.slice(0, 50);
}

module.exports = {
  root,
  siteUrl,
  staticPriorityPaths,
  auditCurrentSitemap,
  selectPriorityUrls,
  writeReports
};
