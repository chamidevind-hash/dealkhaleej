const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");
const {
  hasInvalidExpiryDate,
  isOfferExpired,
  isOfferCurrentlyActive,
  offerExpiryDate
} = require("../offer-status");

const TEST_DATE = "2026-09-17";
const PORT = Number(process.env.TEST_PORT || 5798);
const HOST = "127.0.0.1";
const watchedStores = ["ubuy", "muji", "mumzworld", "noon", "temu"];
const watchedPaths = [
  "/",
  "/store/ubuy",
  "/store/muji",
  "/store/mumzworld",
  "/store/noon",
  "/store/temu",
  "/api/coupons",
  "/api/stores",
  "/api/search?q=ubuy"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
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
        // Keep polling until the server is ready.
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

function storeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function activeCountText(html) {
  return Number(html.match(/id="active-coupon-count">([^<]+)</)?.[1] || NaN);
}

function assertEdgeCases() {
  const yesterday = { id: "edge-yesterday", active: true, expiry: "2026-09-16" };
  const today = { id: "edge-today", active: true, expiry: "2026-09-17" };
  const tomorrow = { id: "edge-tomorrow", active: true, expiry: "2026-09-18" };
  const noExpiry = { id: "edge-no-expiry", active: true, expiry: "" };
  const inactiveNoExpiry = { id: "edge-inactive-no-expiry", active: false, expiry: "" };
  const invalid = { id: "edge-invalid", active: true, expiry: "not-a-date" };

  assert(isOfferExpired(yesterday, TEST_DATE), "Yesterday's expiry must be expired.");
  assert(!isOfferCurrentlyActive(yesterday, TEST_DATE), "Yesterday's active offer must not be current.");
  assert(!isOfferExpired(today, TEST_DATE), "Today's expiry must remain active through the day.");
  assert(isOfferCurrentlyActive(today, TEST_DATE), "Today's expiry must be current.");
  assert(isOfferCurrentlyActive(tomorrow, TEST_DATE), "Tomorrow's expiry must be current.");
  assert(isOfferCurrentlyActive(noExpiry, TEST_DATE), "No-expiry active offer must stay current.");
  assert(!isOfferCurrentlyActive(inactiveNoExpiry, TEST_DATE), "active:false offer must stay inactive.");
  assert(!isOfferExpired(invalid, TEST_DATE), "Invalid expiry must not crash or be treated as expired.");
  assert(isOfferCurrentlyActive(invalid, TEST_DATE), "Invalid expiry should still follow the active flag.");
}

function dataSummary(coupons) {
  const rawActive = coupons.filter((coupon) => coupon.active !== false);
  const expired = coupons.filter((coupon) => isOfferExpired(coupon, TEST_DATE));
  const expiredRawActive = rawActive.filter((coupon) => isOfferExpired(coupon, TEST_DATE));
  const currentActive = coupons.filter((coupon) => isOfferCurrentlyActive(coupon, TEST_DATE));
  const invalidExpiry = coupons.filter(hasInvalidExpiryDate);
  const farPast = expired.filter((coupon) => offerExpiryDate(coupon) < "2026-06-19");

  return {
    totalOffers: coupons.length,
    rawActiveOffers: rawActive.length,
    expiredOffers: expired.length,
    expiredRawActiveOffers: expiredRawActive.length,
    currentlyActiveOffers: currentActive.length,
    invalidExpiryDates: invalidExpiry.length,
    farPastExpiredOffers: farPast.length
  };
}

function storeSummary(coupons, storeSlug) {
  const matching = coupons.filter((coupon) => storeKey(coupon.store) === storeKey(storeSlug));
  return {
    storeSlug,
    rawActive: matching.filter((coupon) => coupon.active !== false).length,
    expiredRawActive: matching.filter((coupon) => coupon.active !== false && isOfferExpired(coupon, TEST_DATE)).length,
    currentlyActive: matching.filter((coupon) => isOfferCurrentlyActive(coupon, TEST_DATE)).length,
    ids: matching.map((coupon) => coupon.id)
  };
}

(async () => {
  const coupons = readJson("data/coupons.json");
  const summary = dataSummary(coupons);
  const summariesByStore = watchedStores.map((store) => storeSummary(coupons, store));
  let serverOutput = "";
  let server;

  try {
    assertEdgeCases();
    assert(summary.expiredRawActiveOffers > 0, "Expected to detect expired active raw data.");

    server = spawn(process.execPath, ["server.js"], {
      env: {
        ...process.env,
        PORT: String(PORT),
        DEALKHALEEJ_CURRENT_DATE: TEST_DATE
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    server.stdout.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    server.stderr.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });

    await waitForServer();

    const responses = new Map();
    for (const path of watchedPaths) {
      const response = await request(path);
      responses.set(path, response);
      assert(response.status === 200, `${path} must return 200, got ${response.status}.`);
    }

    const homeCount = activeCountText(responses.get("/").body);
    assert(homeCount === summary.currentlyActiveOffers, `Homepage active count should be ${summary.currentlyActiveOffers}, got ${homeCount}.`);

    const apiCoupons = JSON.parse(responses.get("/api/coupons").body);
    assert(apiCoupons.length === summary.currentlyActiveOffers, `/api/coupons should return ${summary.currentlyActiveOffers} current offers, got ${apiCoupons.length}.`);
    assert(apiCoupons.every((coupon) => isOfferCurrentlyActive(coupon, TEST_DATE)), "/api/coupons returned an expired or inactive offer.");

    const apiStores = JSON.parse(responses.get("/api/stores").body);
    assert(Array.isArray(apiStores) && apiStores.length > 0, "/api/stores should keep returning public stores.");

    const search = JSON.parse(responses.get("/api/search?q=ubuy").body);
    assert(Array.isArray(search.coupons), "/api/search must return a coupons array.");
    assert(search.coupons.every((coupon) => isOfferCurrentlyActive(coupon, TEST_DATE)), "/api/search returned an expired or inactive coupon.");

    for (const slug of watchedStores) {
      const html = responses.get(`/store/${slug}`).body;
      const summaryForStore = summariesByStore.find((item) => item.storeSlug === slug);
      if (summaryForStore.currentlyActive === 0) {
        assert(/No active .* offers are currently available/.test(html), `/store/${slug} should show an honest no-active-offers message.`);
      }
      const expiredStoreCoupons = coupons.filter((coupon) => (
        storeKey(coupon.store) === storeKey(slug) &&
        coupon.active !== false &&
        isOfferExpired(coupon, TEST_DATE)
      ));
      for (const coupon of expiredStoreCoupons) {
        assert(!html.includes(`data-coupon-id="${coupon.id}"`), `/store/${slug} still renders expired coupon ${coupon.id}.`);
      }
    }

    console.log("Expiry status validation passed.");
    console.log(JSON.stringify({
      testDate: TEST_DATE,
      summary,
      watchedStores: summariesByStore,
      homepageActiveCount: homeCount,
      apiCouponsCount: apiCoupons.length,
      checkedPaths: watchedPaths
    }, null, 2));
  } catch (error) {
    console.error(error.message);
    if (serverOutput) console.error(serverOutput);
    process.exitCode = 1;
  } finally {
    if (server) server.kill();
  }
})();
