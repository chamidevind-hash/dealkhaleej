const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");
const {
  filterCurrentOffers,
  isOfferExpired,
  isOfferCurrentlyActive
} = require("../offer-status");
const {
  COUNTRY_CODES,
  filterCouponsByCountry
} = require("../config/countries");

const TEST_DATE = "2026-09-17";
const PORT = Number(process.env.TEST_PORT || 5799);
const HOST = "127.0.0.1";
const zeroActiveStores = ["ubuy", "muji", "mumzworld"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function storeSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
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
        // Keep waiting until the local server is ready.
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

function countText(html, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Number(html.match(new RegExp(`<strong id="${escaped}">([^<]+)</strong>`))?.[1] || NaN);
}

function browserCurrentCoupons(apiCoupons) {
  return apiCoupons.filter((coupon) => coupon.active !== false && coupon.currentlyActive !== false && coupon.expired !== true);
}

function storeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function expectedCounts(coupons, countryCode) {
  const visible = filterCouponsByCountry(coupons, countryCode);
  const current = filterCurrentOffers(visible, TEST_DATE);
  return {
    country: countryCode,
    rawVisible: visible.length,
    rawActive: visible.filter((coupon) => coupon.active !== false).length,
    expiredRawActive: visible.filter((coupon) => coupon.active !== false && isOfferExpired(coupon, TEST_DATE)).length,
    current: current.length,
    currentVerified: current.filter((coupon) => coupon.verified).length
  };
}

(async () => {
  const coupons = readJson("data/coupons.json");
  const stores = readJson("data/stores.json");
  const countryCounts = Object.fromEntries(COUNTRY_CODES.map((code) => [code, expectedCounts(coupons, code)]));
  const globalCount = countryCounts.gcc.current;
  const currentStoreCoupon = coupons.find((coupon) => {
    if (!isOfferCurrentlyActive(coupon, TEST_DATE)) return false;
    return stores.some((store) => storeKey(store.name) === storeKey(coupon.store));
  });
  assert(currentStoreCoupon, "Expected at least one current offer with a store page.");

  let server;
  let serverOutput = "";

  try {
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

    for (const code of ["gcc", "sa"]) {
      const homePath = code === "gcc" ? "/" : `/?country=${code}`;
      const apiPath = code === "gcc" ? "/api/coupons" : `/api/coupons?country=${code}`;
      const expected = countryCounts[code];
      const home = await request(homePath);
      const api = await request(apiPath);
      assert(home.status === 200, `${homePath} returned ${home.status}.`);
      assert(api.status === 200, `${apiPath} returned ${api.status}.`);
      assert(home.body.includes("Verified offers"), `${homePath} must contain the Verified offers label.`);
      assert(!home.body.includes("Verified today"), `${homePath} must not contain Verified today.`);
      assert(countText(home.body, "active-coupon-count") === expected.current, `${homePath} active count must be ${expected.current}.`);
      assert(countText(home.body, "verified-count") === expected.currentVerified, `${homePath} verified count must be ${expected.currentVerified}.`);

      const apiCoupons = JSON.parse(api.body);
      const browserCoupons = browserCurrentCoupons(apiCoupons);
      assert(apiCoupons.length === expected.current, `${apiPath} count must be ${expected.current}, got ${apiCoupons.length}.`);
      assert(browserCoupons.length === expected.current, `Simulated browser count for ${code} must be ${expected.current}, got ${browserCoupons.length}.`);
      assert(apiCoupons.every((coupon) => coupon.currentlyActive === true && coupon.expired === false), `${apiPath} returned a non-current coupon payload.`);
    }

    assert(countryCounts.sa.rawActive === 39, "Expected Saudi raw active count to remain 39 for discrepancy documentation.");
    assert(countryCounts.sa.current <= globalCount, "Saudi current count must not exceed global current count.");

    for (const slug of zeroActiveStores) {
      const response = await request(`/store/${slug}`);
      assert(response.status === 200, `/store/${slug} returned ${response.status}.`);
      assert(response.body.includes("No verified active coupons are available right now."), `/store/${slug} should show zero-active copy.`);
      assert(!response.body.includes("The highlighted offer above is the only active offer currently listed for this store."), `/store/${slug} has stale highlighted-offer copy.`);
      assert(!response.body.includes("The current code shown on DealKhaleej is"), `/store/${slug} has stale current-code FAQ copy.`);
      assert(!/"@type":"Offer"/.test(response.body), `/store/${slug} should not publish expired Offer JSON-LD.`);

      const expiredCoupons = coupons.filter((coupon) => (
        storeKey(coupon.store) === storeKey(slug) &&
        coupon.active !== false &&
        isOfferExpired(coupon, TEST_DATE)
      ));
      expiredCoupons.forEach((coupon) => {
        assert(!response.body.includes(`data-coupon-id="${coupon.id}"`), `/store/${slug} renders expired coupon ${coupon.id}.`);
        assert(!response.body.includes(`/go/${encodeURIComponent(coupon.id)}`), `/store/${slug} links expired coupon ${coupon.id} as current.`);
      });
    }

    const currentSlug = storeSlug(currentStoreCoupon.store);
    const currentPage = await request(`/store/${currentSlug}`);
    assert(currentPage.status === 200, `/store/${currentSlug} returned ${currentPage.status}.`);
    assert(currentPage.body.includes(`/go/${encodeURIComponent(currentStoreCoupon.id)}`), `/store/${currentSlug} must link current offer ${currentStoreCoupon.id}.`);
    assert(/"@type":"Offer"/.test(currentPage.body), `/store/${currentSlug} should retain current Offer JSON-LD.`);

    console.log("Expiry rendering parity validation passed.");
    console.log(JSON.stringify({
      testDate: TEST_DATE,
      countryCounts,
      finalAuthoritativeActiveCount: globalCount,
      currentStoreRegression: {
        slug: currentSlug,
        couponId: currentStoreCoupon.id,
        store: currentStoreCoupon.store
      }
    }, null, 2));
  } catch (error) {
    console.error(error.message);
    if (serverOutput) console.error(serverOutput);
    process.exitCode = 1;
  } finally {
    if (server) server.kill();
  }
})();
