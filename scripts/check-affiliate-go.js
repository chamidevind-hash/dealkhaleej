const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const port = Number(process.env.PORT || 5784);
const origin = `http://127.0.0.1:${port}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function storeSlug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function request(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method: "GET",
      headers: options.headers || {}
    };

    const req = http.request(requestOptions, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });

    req.on("error", reject);
    req.end();
  });
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const response = await request("/robots.txt");
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Server did not start in time.");
}

function extractAnchors(html) {
  return html.match(/<a\b[^>]*>/gi) || [];
}

function hasGoHref(anchor) {
  return /\bhref=(["'])\/go\/[^"']+\1/i.test(anchor);
}

function hasSponsoredNofollow(anchor) {
  const relMatch = anchor.match(/\brel=(["'])(.*?)\1/i);
  if (!relMatch) return false;
  const tokens = relMatch[2].toLowerCase().split(/\s+/);
  return tokens.includes("sponsored") && tokens.includes("nofollow");
}

function checkGoAnchorRel(html, label) {
  const missing = extractAnchors(html)
    .filter(hasGoHref)
    .filter((anchor) => !hasSponsoredNofollow(anchor));

  assert(
    missing.length === 0,
    `${label} has /go/ anchors without rel="sponsored nofollow": ${missing.join(" | ")}`
  );
}

function checkSourceAnchors() {
  const files = ["script.js", "store-page-renderer.js", "store.js", "index.html", "store.html", "blog.html", "article.html", "travel.html"];
  files.forEach((file) => {
    const fullPath = path.join(root, file);
    if (!fs.existsSync(fullPath)) return;
    checkGoAnchorRel(fs.readFileSync(fullPath, "utf8"), file);
  });
}

async function main() {
  checkSourceAnchors();

  const outboundClicksPath = path.join(root, "data", "outbound-clicks.json");
  const outboundClicksBefore = fs.existsSync(outboundClicksPath)
    ? fs.readFileSync(outboundClicksPath, "utf8")
    : null;

  const server = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  try {
    await waitForServer();

    const sitemap = await request("/sitemap.xml");
    assert(sitemap.status === 200, `Expected sitemap.xml HTTP 200, got ${sitemap.status}`);
    assert(!/\/go\//i.test(sitemap.body), "sitemap.xml contains a /go/ URL.");

    const robots = await request("/robots.txt");
    assert(robots.status === 200, `Expected robots.txt HTTP 200, got ${robots.status}`);
    assert(!/^\s*disallow:\s*\/go\/?\s*$/im.test(robots.body), "robots.txt blocks /go/ URLs.");

    const coupons = readJson("data/coupons.json");
    const sample = coupons.find((coupon) => coupon.active && /^https?:\/\//i.test(String(coupon.url || "")));
    assert(sample, "No active coupon with an affiliate URL was found for redirect validation.");

    const redirect = await request(`/go/${encodeURIComponent(sample.id)}`);
    assert([301, 302, 303, 307, 308].includes(redirect.status), `Expected /go/ redirect status, got ${redirect.status}`);
    assert(redirect.headers.location === sample.url, "/go/ redirect destination changed from the coupon affiliate URL.");
    assert(
      String(redirect.headers["x-robots-tag"] || "").toLowerCase() === "noindex, nofollow",
      "/go/ redirect is missing X-Robots-Tag: noindex, nofollow."
    );

    const missingCoupon = await request("/go/not-a-real-coupon");
    assert([301, 302, 303, 307, 308].includes(missingCoupon.status), "Missing /go/ coupon did not redirect.");
    assert(
      String(missingCoupon.headers["x-robots-tag"] || "").toLowerCase() === "noindex, nofollow",
      "Missing /go/ redirect is missing X-Robots-Tag: noindex, nofollow."
    );

    const storePage = await request(`/store/${storeSlug(sample.store)}`);
    assert(storePage.status === 200, `Expected sample store page HTTP 200, got ${storePage.status}`);
    checkGoAnchorRel(storePage.body, `/store/${storeSlug(sample.store)}`);

    const pages = ["/", "/coupons", "/blog", "/travel", `/store/${storeSlug(sample.store)}`];
    for (const page of pages) {
      const response = await request(page);
      assert(response.status === 200, `Expected ${page} HTTP 200, got ${response.status}`);
      const canonicalMatch = response.body.match(/<link\b[^>]*rel=(["'])canonical\1[^>]*>/i);
      if (canonicalMatch) {
        assert(!/href=(["'])[^"']*\/go\/[^"']*\1/i.test(canonicalMatch[0]), `${page} uses a /go/ canonical URL.`);
      }
    }

    console.log("Affiliate /go/ validation passed.");
  } finally {
    server.kill();
    if (outboundClicksBefore === null) {
      fs.rmSync(outboundClicksPath, { force: true });
    } else {
      fs.writeFileSync(outboundClicksPath, outboundClicksBefore);
    }
    if (server.exitCode && server.exitCode !== 0) {
      process.stderr.write(serverOutput);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
