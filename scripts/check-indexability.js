const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");

const PORT = Number(process.env.TEST_PORT || 5797);
const HOST = "127.0.0.1";
const baseUrl = `http://${HOST}:${PORT}`;
const articlePath = "/blog/how-to-save-money-amazon-saudi-arabia";
const oldStorePaths = [
  "/store/nice%20one",
  "/store/retouch4me",
  "/store/namshi",
  "/store/cyber%20florist"
];
const oldGoPaths = [
  "/go/renty-coupon-code-2026",
  "/go/yallamomz-coupon-code-2026"
];
const outboundClicksFile = "data/outbound-clicks.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path,
      method: "GET",
      headers: { Host: "dealkhaleej.com" }
    }, (res) => {
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
    req.setTimeout(options.timeout || 5000, () => {
      req.destroy(new Error(`Request timed out: ${path}`));
    });
    req.end();
  });
}

function waitForServer() {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const response = await request("/robots.txt", { timeout: 1000 });
        if (response.status === 200) return resolve();
      } catch {
        // Keep waiting until the server is ready or the startup deadline passes.
      }
      if (Date.now() - started > 10000) {
        reject(new Error("Timed out waiting for local server."));
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}

function metaContent(html, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<meta\\\\b(?=[^>]*${escaped})[^>]*content=(["'])(.*?)\\\\1[^>]*>`, "i"));
  return match ? match[2] : "";
}

function canonicalHref(html) {
  return html.match(/<link\b(?=[^>]*rel=(["'])canonical\1)[^>]*href=(["'])(.*?)\2[^>]*>/i)?.[3] || "";
}

function internalHrefs(html) {
  return [...html.matchAll(/<a\b[^>]*href=(["'])(.*?)\1/gi)]
    .map((match) => match[2])
    .filter((href) => href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/go/"));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

(async () => {
  const originalOutboundClicks = fs.existsSync(outboundClicksFile)
    ? fs.readFileSync(outboundClicksFile, "utf8")
    : null;
  const server = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(PORT) },
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

    const article = await request(articlePath);
    assert(article.status === 200, `Amazon Saudi article must return 200, got ${article.status}.`);
    assert(canonicalHref(article.body) === `https://dealkhaleej.com${articlePath}`, "Amazon Saudi article canonical is not self-referencing.");
    assert(!/<meta\b[^>]*name=(["'])robots\1[^>]*content=(["'])[^"']*noindex/i.test(article.body), "Amazon Saudi article contains noindex.");
    assert(!String(article.headers["x-robots-tag"] || "").toLowerCase().includes("noindex"), "Amazon Saudi article has X-Robots-Tag noindex.");
    assert(article.body.includes("<h1>How to Save Money on Amazon Saudi Arabia</h1>"), "Amazon Saudi article H1 changed unexpectedly.");
    assert(article.body.includes("Amazon.sa"), "Amazon Saudi article should mention Amazon.sa.");
    assert(article.body.includes("final SAR"), "Amazon Saudi article should discuss final SAR cart totals.");
    assert(!article.body.includes('href="/store/amazon-uae"'), "Amazon UAE must not be the primary linked action in the Saudi article.");

    for (const href of new Set(internalHrefs(article.body))) {
      const linked = await request(href);
      assert(linked.status < 400 || [301, 302, 303, 307, 308].includes(linked.status), `Broken internal article link: ${href} returned ${linked.status}.`);
    }

    const sitemap = await request("/sitemap.xml");
    assert(sitemap.status === 200, `sitemap.xml must return 200, got ${sitemap.status}.`);
    assert(!/\/go\//i.test(sitemap.body), "sitemap.xml contains /go/ URLs.");
    for (const path of [...oldStorePaths, ...oldGoPaths]) {
      assert(!sitemap.body.includes(path.replace(/%20/g, " ")), `sitemap.xml contains old URL ${path}.`);
      assert(!sitemap.body.includes(path), `sitemap.xml contains old URL ${path}.`);
    }

    for (const path of oldStorePaths) {
      const response = await request(path);
      assert(response.status === 404 || [301, 308].includes(response.status), `${path} must be a clean 404 or permanent redirect, got ${response.status}.`);
      if ([301, 308].includes(response.status)) {
        const follow = await request(new URL(response.headers.location, baseUrl).pathname);
        assert(follow.status === 200, `${path} redirects to a non-200 replacement.`);
      }
    }

    const coupons = readJson("data/coupons.json");
    for (const path of oldGoPaths) {
      const id = decodeURIComponent(path.replace(/^\/go\//, ""));
      const coupon = coupons.find((item) => item.id === id);
      assert(coupon && coupon.url, `${path} does not have a current coupon destination.`);
      const response = await request(path);
      assert([301, 302, 303, 307, 308].includes(response.status), `${path} should redirect, got ${response.status}.`);
      assert(response.headers.location === coupon.url, `${path} redirects to a different affiliate destination.`);
      assert(String(response.headers["x-robots-tag"] || "").toLowerCase() === "noindex, nofollow", `${path} missing X-Robots-Tag noindex, nofollow.`);
    }

    console.log("Indexability validation passed.");
  } catch (error) {
    console.error(error.message);
    if (serverOutput) console.error(serverOutput);
    process.exitCode = 1;
  } finally {
    server.kill();
    if (originalOutboundClicks !== null) {
      fs.writeFileSync(outboundClicksFile, originalOutboundClicks);
    }
  }
})();
