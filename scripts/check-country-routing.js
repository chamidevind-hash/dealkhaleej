const http = require("http");
const { spawn } = require("child_process");
const coupons = require("../data/coupons.json");
const stores = require("../data/stores.json");
const articles = require("../data/articles.json");
const affiliateBaseline = require("../data/affiliate-url-baseline.json");
const {
  COUNTRIES,
  COUNTRY_CODES,
  GCC_COUNTRY_CODES,
  HOST_TO_COUNTRY,
  filterCouponsByCountry,
  filterStoresByCountry,
  siteUrlForCountry
} = require("../config/countries");

const PORT = Number(process.env.COUNTRY_CHECK_PORT || 5299);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validCountries(values, context, allowGcc = false) {
  assert(Array.isArray(values) && values.length > 0, `${context} is missing countries`);
  values.forEach((code) => {
    const allowed = code === "global" || GCC_COUNTRY_CODES.includes(code) || (allowGcc && code === "gcc");
    assert(allowed, `${context} contains unsupported country code "${code}"`);
  });
}

function couponById(id) {
  const coupon = coupons.find((item) => item.id === id);
  assert(coupon, `Missing coupon ${id}`);
  return coupon;
}

function countrySet(list) {
  return new Set(list.map((item) => item.id || item.name || item.slug));
}

function requestPath(hostname, path) {
  return new Promise((resolve, reject) => {
    const request = http.get({
      hostname: "127.0.0.1",
      port: PORT,
      path,
      headers: { Host: hostname }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        statusCode: response.statusCode,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });

    request.on("error", reject);
    request.setTimeout(15000, () => {
      request.destroy(new Error(`Timed out requesting ${hostname}${path}`));
    });
  });
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    function tick() {
      requestPath("dealkhaleej.com", "/robots.txt")
        .then((response) => {
          if (response.statusCode === 200) resolve();
          else retry();
        })
        .catch(retry);
    }

    function retry() {
      if (Date.now() - started > 10000) {
        reject(new Error("Timed out waiting for country validation server"));
        return;
      }
      setTimeout(tick, 250);
    }

    tick();
  });
}

async function withServer(run) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: `${__dirname}/..`,
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
    windowsHide: true
  });

  try {
    await waitForServer();
    await run();
  } finally {
    child.kill();
  }
}

function validateData() {
  COUNTRY_CODES.forEach((code) => {
    assert(COUNTRIES[code], `Missing country config for ${code}`);
    assert(COUNTRIES[code].hostname, `Missing hostname for ${code}`);
  });
  assert(HOST_TO_COUNTRY["dealkhaleej.com"] === "gcc", "Root host should map to gcc");
  assert(HOST_TO_COUNTRY["www.dealkhaleej.com"] === "gcc", "www host should map to gcc");
  GCC_COUNTRY_CODES.forEach((code) => {
    assert(HOST_TO_COUNTRY[COUNTRIES[code].hostname] === code, `Hostname mapping missing for ${code}`);
  });

  coupons.forEach((coupon) => {
    validCountries(coupon.countries, `Coupon ${coupon.id}`);
    const baseline = affiliateBaseline[coupon.id];
    assert(baseline, `Missing affiliate URL baseline for ${coupon.id}`);
    assert((coupon.url || "") === baseline.url, `Affiliate URL changed for ${coupon.id}`);
    assert((coupon.uaeUrl || "") === baseline.uaeUrl, `UAE affiliate URL changed for ${coupon.id}`);
  });

  stores.forEach((store) => validCountries(store.countries, `Store ${store.name}`));
  articles.forEach((article) => validCountries(article.countries, `Article ${article.slug}`, true));
}

function validateFilters() {
  const saCoupons = filterCouponsByCountry(coupons, "sa");
  const aeCoupons = filterCouponsByCountry(coupons, "ae");
  const saIds = countrySet(saCoupons);
  const aeIds = countrySet(aeCoupons);

  assert(saIds.has("samsung-ksa-affiliate-offer-1960"), "Saudi results should include Samsung KSA");
  assert(!saIds.has("samsung-uae-affiliate-offer-1961"), "Saudi results must exclude Samsung UAE");
  assert(aeIds.has("samsung-uae-affiliate-offer-1961"), "UAE results should include Samsung UAE");
  assert(!aeIds.has("samsung-ksa-affiliate-offer-1960"), "UAE results must exclude Samsung KSA");
  assert(saIds.has("nike-ksa-web-affiliate-offer-1924"), "Saudi results should include Nike KSA");
  assert(!saIds.has("nike-uae-web-affiliate-offer-1907"), "Saudi results must exclude Nike UAE");
  assert(aeIds.has("nike-uae-web-affiliate-offer-1907"), "UAE results should include Nike UAE");
  assert(!aeIds.has("nike-ksa-web-affiliate-offer-1924"), "UAE results must exclude Nike KSA");

  coupons.filter((coupon) => coupon.countries.includes("global")).forEach((coupon) => {
    GCC_COUNTRY_CODES.forEach((code) => {
      assert(countrySet(filterCouponsByCountry(coupons, code)).has(coupon.id), `Global offer ${coupon.id} missing from ${code}`);
    });
  });

  coupons.filter((coupon) => GCC_COUNTRY_CODES.every((code) => coupon.countries.includes(code))).forEach((coupon) => {
    GCC_COUNTRY_CODES.forEach((code) => {
      assert(countrySet(filterCouponsByCountry(coupons, code)).has(coupon.id), `GCC offer ${coupon.id} missing from ${code}`);
    });
  });

  const saStores = countrySet(filterStoresByCountry(stores, coupons, "sa"));
  const aeStores = countrySet(filterStoresByCountry(stores, coupons, "ae"));
  assert(saStores.has("Samsung KSA"), "Saudi store directory should include Samsung KSA");
  assert(!saStores.has("Samsung UAE"), "Saudi store directory must exclude Samsung UAE");
  assert(aeStores.has("Samsung UAE"), "UAE store directory should include Samsung UAE");
  assert(!aeStores.has("Samsung KSA"), "UAE store directory must exclude Samsung KSA");
}

async function validateServerRoutes() {
  for (const code of COUNTRY_CODES) {
    const host = COUNTRIES[code].hostname;
    const robots = await requestPath(host, "/robots.txt");
    assert(robots.body.includes(`Sitemap: ${siteUrlForCountry(code)}/sitemap.xml`), `robots.txt sitemap host mismatch for ${code}`);

    const sitemap = await requestPath(host, "/sitemap.xml");
    assert(sitemap.statusCode === 200, `sitemap failed for ${code}`);
    const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    assert(locs.length > 0, `sitemap has no URLs for ${code}`);
    locs.forEach((loc) => assert(loc.startsWith(siteUrlForCountry(code)), `Sitemap URL ${loc} uses wrong host for ${code}`));

    if (code === "sa") {
      assert(!locs.includes(`${siteUrlForCountry(code)}/store/samsung-uae`), "Saudi sitemap must exclude Samsung UAE");
      assert(locs.includes(`${siteUrlForCountry(code)}/store/samsung-ksa`), "Saudi sitemap should include Samsung KSA");
    }
    if (code === "ae") {
      assert(!locs.includes(`${siteUrlForCountry(code)}/store/samsung-ksa`), "UAE sitemap must exclude Samsung KSA");
      assert(locs.includes(`${siteUrlForCountry(code)}/store/samsung-uae`), "UAE sitemap should include Samsung UAE");
    }
  }

  const saHome = await requestPath(COUNTRIES.sa.hostname, "/");
  assert(saHome.body.includes("<title>Coupon Codes and Deals in Saudi Arabia | DealKhaleej"), "Saudi homepage title mismatch");
  assert(saHome.body.includes('href="https://sa.dealkhaleej.com/"'), "Saudi homepage canonical/hreflang host missing");
  assert(saHome.body.includes('value="sa" selected'), "Saudi country selector should be selected");

  const aeStore = await requestPath(COUNTRIES.ae.hostname, "/store/samsung-uae");
  assert(aeStore.body.includes('<link rel="canonical" href="https://ae.dealkhaleej.com/store/samsung-uae">'), "UAE store canonical mismatch");
  assert(!aeStore.body.includes("Shop Samsung KSA Offers"), "UAE Samsung page must not include Samsung KSA offer");

  const saStore = await requestPath(COUNTRIES.sa.hostname, "/store/samsung-ksa");
  assert(saStore.body.includes('<link rel="canonical" href="https://sa.dealkhaleej.com/store/samsung-ksa">'), "Saudi store canonical mismatch");
  assert(!saStore.body.includes("Shop Samsung UAE Offers"), "Saudi Samsung page must not include Samsung UAE offer");
}

async function main() {
  validateData();
  validateFilters();
  await withServer(validateServerRoutes);
  console.log("Country routing check passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
