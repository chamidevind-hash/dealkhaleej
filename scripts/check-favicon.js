const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const root = path.join(__dirname, "..");
const port = Number(process.env.FAVICON_CHECK_PORT || 5993);
const origin = `http://127.0.0.1:${port}`;

const faviconFiles = [
  { path: "assets/favicon-48x48.png", route: "/assets/favicon-48x48.png", width: 48, height: 48, type: "png" },
  { path: "assets/favicon-96x96.png", route: "/assets/favicon-96x96.png", width: 96, height: 96, type: "png" },
  { path: "assets/apple-touch-icon.png", route: "/assets/apple-touch-icon.png", width: 180, height: 180, type: "png" },
  { path: "favicon.ico", route: "/favicon.ico", width: 48, height: 48, type: "ico" }
];

const requiredTags = [
  '<link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48x48.png">',
  '<link rel="icon" type="image/png" sizes="96x96" href="/assets/favicon-96x96.png">',
  '<link rel="shortcut icon" href="/favicon.ico">',
  '<link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">'
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pngDimensions(filePath) {
  const png = PNG.sync.read(fs.readFileSync(filePath));
  return { width: png.width, height: png.height };
}

function icoDimensions(filePath) {
  const data = fs.readFileSync(filePath);
  assert(data.length >= 6, "favicon.ico is too small.");
  assert(data.readUInt16LE(0) === 0 && data.readUInt16LE(2) === 1, "favicon.ico is not a valid ICO file.");
  const count = data.readUInt16LE(4);
  const sizes = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    assert(data.length >= offset + 16, "favicon.ico has a truncated directory.");
    const width = data[offset] || 256;
    const height = data[offset + 1] || 256;
    sizes.push({ width, height });
  }
  return sizes;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "favicon-check" },
    stdio: "ignore"
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${origin}/robots.txt`);
      if (response.ok) return child;
    } catch {
      await sleep(250);
    }
  }

  child.kill();
  throw new Error("Local server did not start for favicon checks.");
}

function htmlIconLinks(html) {
  return [...html.matchAll(/<link\s+[^>]*rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]*>/gi)]
    .map((match) => match[0].replace(/\s+/g, " ").trim());
}

function faviconTagPresent(html, tag) {
  return html.includes(tag);
}

function disallowedByRobots(robots, route, userAgent) {
  const groups = [];
  let current = null;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = String(rawKey || "").trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      current = { agents: [value.toLowerCase()], rules: [] };
      groups.push(current);
    } else if (current && (key === "allow" || key === "disallow")) {
      current.rules.push({ type: key, path: value });
    }
  }

  const matchingGroups = groups.filter((group) => group.agents.includes("*") || group.agents.includes(userAgent.toLowerCase()));
  for (const group of matchingGroups) {
    const matchingRules = group.rules
      .filter((rule) => rule.path && route.startsWith(rule.path))
      .sort((left, right) => right.path.length - left.path.length);
    if (matchingRules[0]?.type === "disallow") return true;
  }
  return false;
}

async function checkUrl(route, userAgent = "DealKhaleej-Favicon-Check") {
  const response = await fetch(`${origin}${route}`, {
    redirect: "manual",
    headers: { "User-Agent": userAgent }
  });
  return response;
}

async function main() {
  for (const file of faviconFiles) {
    const absolute = path.join(root, file.path);
    assert(fs.existsSync(absolute), `${file.path} is missing.`);
    if (file.type === "png") {
      const dimensions = pngDimensions(absolute);
      assert(dimensions.width === file.width && dimensions.height === file.height, `${file.path} must be ${file.width}x${file.height}; found ${dimensions.width}x${dimensions.height}.`);
      assert(dimensions.width === dimensions.height, `${file.path} must be square.`);
    } else {
      const sizes = icoDimensions(absolute);
      assert(sizes.some((size) => size.width >= file.width && size.height >= file.height), "favicon.ico must include at least a 48x48 icon.");
    }
  }

  const child = await startServer();
  try {
    const robotsResponse = await checkUrl("/robots.txt", "Googlebot");
    assert(robotsResponse.status === 200, "robots.txt must return 200.");
    const robots = await robotsResponse.text();
    for (const file of faviconFiles) {
      assert(!disallowedByRobots(robots, file.route, "Googlebot"), `robots.txt blocks Googlebot from ${file.route}.`);
      assert(!disallowedByRobots(robots, file.route, "Googlebot-Image"), `robots.txt blocks Googlebot-Image from ${file.route}.`);
    }
    assert(!disallowedByRobots(robots, "/", "Googlebot"), "robots.txt blocks Googlebot from the homepage.");

    for (const file of faviconFiles) {
      for (const userAgent of ["Googlebot", "Googlebot-Image"]) {
        const response = await checkUrl(file.route, userAgent);
        assert(response.status === 200, `${file.route} must return 200 for ${userAgent}; got ${response.status}.`);
        assert(![301, 302, 303, 307, 308].includes(response.status), `${file.route} must not redirect.`);
        const contentType = response.headers.get("content-type") || "";
        assert(contentType.toLowerCase().startsWith("image/"), `${file.route} must return an image MIME type; got ${contentType}.`);
        const body = Buffer.from(await response.arrayBuffer());
        assert(!body.toString("utf8", 0, Math.min(body.length, 64)).toLowerCase().includes("<!doctype html"), `${file.route} returned an HTML fallback.`);
      }
    }

    const stores = JSON.parse(fs.readFileSync(path.join(root, "data", "stores.json"), "utf8"));
    const articles = JSON.parse(fs.readFileSync(path.join(root, "data", "articles.json"), "utf8"));
    const publicPages = [
      "/",
      "/stores",
      "/coupons",
      "/blog",
      `/blog/${encodeURIComponent(articles[0].slug)}`,
      `/store/${stores[0].slug || stores[0].name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      "/travel",
      "/travel/hotels",
      "/travel/flights",
      "/travel/activities",
      "/travel/esim"
    ];

    for (const route of publicPages) {
      const response = await checkUrl(route, "Googlebot");
      assert(response.status === 200, `${route} must return 200 for Googlebot; got ${response.status}.`);
      const contentType = response.headers.get("content-type") || "";
      assert(contentType.includes("text/html"), `${route} must return HTML; got ${contentType}.`);
      const html = await response.text();
      for (const tag of requiredTags) {
        assert(faviconTagPresent(html, tag), `${route} is missing favicon tag: ${tag}`);
      }
      const links = htmlIconLinks(html);
      assert(links.length === requiredTags.length, `${route} has ${links.length} favicon/apple icon tags; expected ${requiredTags.length}.`);
    }

    console.log("Favicon check passed: files, dimensions, tags, MIME types, and robots access are valid.");
  } finally {
    child.kill();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
