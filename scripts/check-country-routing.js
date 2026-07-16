const http = require("http");
const fs = require("fs");
const vm = require("vm");
const { spawn, spawnSync } = require("child_process");
const coupons = require("../data/coupons.json");
const stores = require("../data/stores.json");
const articles = require("../data/articles.json");
const affiliateBaseline = require("../data/affiliate-url-baseline.json");
const {
  COUNTRIES,
  COUNTRY_CODES,
  GCC_COUNTRY_CODES,
  COUNTRY_SUBDOMAINS_ENABLED,
  HOST_TO_COUNTRY,
  countrySubdomainsEnabledFromEnv,
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
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });

    request.on("error", reject);
    request.setTimeout(15000, () => {
      request.destroy(new Error(`Timed out requesting ${hostname}${path}`));
    });
  });
}

function anchor(href) {
  return {
    attrs: { href },
    getAttribute(name) {
      return this.attrs[name];
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name);
    },
    matches(selector) {
      return selector === "a[href]";
    },
    querySelectorAll() {
      return [];
    },
    nodeType: 1
  };
}

function runCountryClientScenario({ href, subdomainsEnabled = false, storedCountry = "" }) {
  const script = fs.readFileSync(`${__dirname}/../country-client.js`, "utf8");
  const countries = COUNTRY_CODES.map((code) => COUNTRIES[code]);
  const selector = {
    value: "",
    addEventListener(event, handler) {
      if (event === "change") this.handler = handler;
    }
  };
  const links = [
    anchor("/store/nike"),
    anchor("/travel"),
    anchor("/blog/example?ref=home#faq"),
    anchor("/go/nike-ksa-web-affiliate-offer-1924"),
    anchor("https://t.me/dealkhaleej"),
    anchor("mailto:hello@dealkhaleej.com"),
    anchor("/assets/logos/nike.png"),
    anchor("#faq")
  ];
  const assigned = [];
  const storage = new Map(storedCountry ? [["dealkhaleej_country", storedCountry]] : []);
  const currentUrl = new URL(href);
  const context = {
    URL,
    Node: { ELEMENT_NODE: 1 },
    MutationObserver: class {
      observe() {}
    },
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      }
    },
    window: {
      location: {
        href: currentUrl.href,
        origin: currentUrl.origin,
        hostname: currentUrl.hostname,
        assign(value) {
          assigned.push(value);
        }
      },
      history: {
        state: null,
        replaceState(state, title, value) {
          this.lastReplace = value;
        }
      },
      DealKhaleejCountries: countries,
      DealKhaleejCountry: COUNTRIES.gcc,
      DealKhaleejCountrySubdomainsEnabled: subdomainsEnabled
    },
    document: {
      readyState: "complete",
      documentElement: { dataset: {} },
      querySelectorAll(selectorText) {
        if (selectorText === "[data-country-selector]") return [selector];
        if (selectorText === "a[href]") return links;
        return [];
      },
      addEventListener() {}
    }
  };

  context.window.window = context.window;
  context.window.document = context.document;
  context.window.localStorage = context.localStorage;
  context.window.MutationObserver = context.MutationObserver;
  context.window.Node = context.Node;
  vm.createContext(context);
  vm.runInContext(script, context);
  return { context, selector, links, assigned, storage };
}

function validateEnvFlagParsing() {
  [undefined, "", "false", "False", "0", "off", " OFF "].forEach((value) => {
    assert(countrySubdomainsEnabledFromEnv(value) === false, `COUNTRY_SUBDOMAINS_ENABLED=${value} should be disabled`);
  });
  assert(countrySubdomainsEnabledFromEnv("true") === true, "COUNTRY_SUBDOMAINS_ENABLED=true should be enabled");

  [
    ["", "false"],
    ["false", "false"],
    ["0", "false"],
    ["off", "false"],
    ["true", "true"]
  ].forEach(([value, expected]) => {
    const child = spawnSync(process.execPath, ["-e", "console.log(require('./config/countries').COUNTRY_SUBDOMAINS_ENABLED)"], {
      cwd: `${__dirname}/..`,
      env: value ? { ...process.env, COUNTRY_SUBDOMAINS_ENABLED: value } : { ...process.env, COUNTRY_SUBDOMAINS_ENABLED: "" },
      encoding: "utf8",
      windowsHide: true
    });
    assert(child.status === 0, `Flag subprocess failed for ${value || "missing"}`);
    assert(child.stdout.trim() === expected, `Flag subprocess mismatch for ${value || "missing"}`);
  });
}

function validateCountryClient() {
  ["false", "0", "off", false, undefined].forEach((disabledValue) => {
    const { context, selector, links, assigned, storage } = runCountryClientScenario({
      href: "http://localhost:5173/blog/example?ref=home&country=sa#faq",
      subdomainsEnabled: disabledValue
    });

    assert(context.window.DealKhaleejCountry.code === "sa", "Query country should be the active browser country");
    assert(storage.get("dealkhaleej_country") === "sa", "Query country should be saved to localStorage");
    assert(selector.value === "sa", "Selector should show Saudi Arabia");
    assert(links[0].attrs.href === "/store/nike?country=sa", "Store links should keep selected country");
    assert(links[1].attrs.href === "/travel?country=sa", "Travel links should keep selected country");
    assert(links[2].attrs.href === "/blog/example?ref=home&country=sa#faq", "Blog links should preserve query and hash");
    assert(links[3].attrs.href === "/go/nike-ksa-web-affiliate-offer-1924", "Tracking links should stay clean");
    assert(links[4].attrs.href === "https://t.me/dealkhaleej", "External links should stay clean");
    assert(links[5].attrs.href === "mailto:hello@dealkhaleej.com", "Mail links should stay clean");
    assert(links[6].attrs.href === "/assets/logos/nike.png", "Static files should stay clean");
    assert(links[7].attrs.href === "#faq", "Hash-only links should stay clean");
    assert(context.window.DealKhaleejCountryApiUrl("/api/search?q=nike") === "/api/search?q=nike&country=sa", "API URLs should include active country");

    context.window.DealKhaleejCountryRedirect("ae");
    assert(assigned[0] === "http://localhost:5173/blog/example?ref=home&country=ae#faq", "Selecting UAE should preserve localhost, path, ref, and hash");
    context.window.DealKhaleejCountryRedirect("gcc");
    assert(assigned[1] === "http://localhost:5173/blog/example?ref=home#faq", "Selecting GCC should remove country");
    assigned.forEach((value) => assert(!/https:\/\/(?:sa|ae|kw|qa|bh|om)\.dealkhaleej\.com/.test(value), `Disabled selector produced subdomain URL ${value}`));
  });

  const stored = runCountryClientScenario({
    href: "http://localhost:5173/store/nike?ref=home#faq",
    storedCountry: "ae"
  });
  assert(stored.context.window.DealKhaleejCountry.code === "ae", "Saved country should be used when query is missing");
  assert(stored.context.window.DealKhaleejCountryApiUrl("/api/stores") === "/api/stores?country=ae", "Saved country should be sent to store API");
  stored.context.window.DealKhaleejCountryRedirect("kw");
  assert(stored.assigned[0] === "http://localhost:5173/store/nike?ref=home&country=kw#faq", "Selecting Kuwait should keep path, ref, and hash");
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
    env: { ...process.env, PORT: String(PORT), COUNTRY_SUBDOMAINS_ENABLED: "false" },
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
  assert(COUNTRY_SUBDOMAINS_ENABLED === false, "Country subdomains should default to disabled");
  assert(siteUrlForCountry("sa") === "https://dealkhaleej.com", "Saudi temporary site URL should stay on root domain");
  assert(siteUrlForCountry("ae") === "https://dealkhaleej.com", "UAE temporary site URL should stay on root domain");
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
  const rootHost = COUNTRIES.gcc.hostname;
  const robots = await requestPath(rootHost, "/robots.txt");
  assert(robots.body.includes("Sitemap: https://dealkhaleej.com/sitemap.xml"), "robots.txt should keep the root-domain sitemap");

  for (const code of GCC_COUNTRY_CODES) {
    const subdomainResponse = await requestPath(COUNTRIES[code].hostname, "/store/nike?country=sa");
    assert(subdomainResponse.statusCode === 200, `${code} subdomain host should render without redirect while disabled`);
    assert(![301, 302, 307, 308].includes(subdomainResponse.statusCode), `${code} subdomain host must not redirect while disabled`);
    assert(!subdomainResponse.headers.location, `${code} subdomain host must not set a redirect location while disabled`);
  }

  const sitemap = await requestPath(rootHost, "/sitemap.xml?country=sa");
  assert(sitemap.statusCode === 200, "sitemap failed");
  const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert(locs.length > 0, "sitemap has no URLs");
  locs.forEach((loc) => {
    assert(loc.startsWith("https://dealkhaleej.com"), `Sitemap URL ${loc} should stay on the root domain`);
    assert(!loc.includes("?country="), `Sitemap URL ${loc} should not include country query variants`);
  });
  assert(locs.includes("https://dealkhaleej.com/store/samsung-ksa"), "Clean sitemap should include Samsung KSA");
  assert(locs.includes("https://dealkhaleej.com/store/samsung-uae"), "Clean sitemap should include Samsung UAE");

  const saHome = await requestPath(rootHost, "/?country=sa");
  assert(saHome.body.includes("<title>Coupon Codes and Deals in Saudi Arabia | DealKhaleej"), "Saudi homepage title mismatch");
  assert(saHome.body.includes('<link rel="canonical" href="https://dealkhaleej.com/">'), "Saudi homepage canonical should be clean");
  assert(saHome.body.includes('<meta name="robots" content="noindex,follow">'), "Saudi query homepage should be noindex");
  assert(!saHome.body.includes('rel="alternate" hreflang='), "Country query pages should not emit hreflang");
  assert(saHome.body.includes('value="sa" selected'), "Saudi country selector should be selected");

  const aeHome = await requestPath(rootHost, "/?country=ae");
  assert(aeHome.body.includes("<title>Coupon Codes and Deals in United Arab Emirates | DealKhaleej"), "UAE homepage title mismatch");
  assert(aeHome.body.includes('value="ae" selected'), "UAE country selector should be selected");

  const aeStore = await requestPath(rootHost, "/store/samsung-uae?country=ae");
  assert(aeStore.body.includes('<link rel="canonical" href="https://dealkhaleej.com/store/samsung-uae">'), "UAE store canonical should be clean");
  assert(aeStore.body.includes('<meta name="robots" content="noindex,follow">'), "UAE query store should be noindex");
  assert(!aeStore.body.includes('rel="alternate" hreflang='), "UAE query store should not emit hreflang");
  assert(!aeStore.body.includes("Shop Samsung KSA Offers"), "UAE Samsung page must not include Samsung KSA offer");

  const saStore = await requestPath(rootHost, "/store/samsung-ksa?country=sa");
  assert(saStore.body.includes('<link rel="canonical" href="https://dealkhaleej.com/store/samsung-ksa">'), "Saudi store canonical should be clean");
  assert(saStore.body.includes('<meta name="robots" content="noindex,follow">'), "Saudi query store should be noindex");
  assert(!saStore.body.includes("Shop Samsung UAE Offers"), "Saudi Samsung page must not include Samsung UAE offer");

  const saCoupons = JSON.parse((await requestPath(rootHost, "/api/coupons?country=sa")).body);
  const aeCoupons = JSON.parse((await requestPath(rootHost, "/api/coupons?country=ae")).body);
  assert(countrySet(saCoupons).has("samsung-ksa-affiliate-offer-1960"), "Saudi API should include Samsung KSA");
  assert(!countrySet(saCoupons).has("samsung-uae-affiliate-offer-1961"), "Saudi API must exclude Samsung UAE");
  assert(countrySet(aeCoupons).has("samsung-uae-affiliate-offer-1961"), "UAE API should include Samsung UAE");
  assert(!countrySet(aeCoupons).has("samsung-ksa-affiliate-offer-1960"), "UAE API must exclude Samsung KSA");

  const invalidCoupons = JSON.parse((await requestPath(rootHost, "/api/coupons?country=unsupported")).body);
  assert(countrySet(invalidCoupons).has("samsung-ksa-affiliate-offer-1960"), "Unsupported country should fall back to GCC data");
  assert(countrySet(invalidCoupons).has("samsung-uae-affiliate-offer-1961"), "Unsupported country should fall back to GCC data");

  const saSearch = JSON.parse((await requestPath(rootHost, "/api/search?q=nike&country=sa")).body);
  const aeSearch = JSON.parse((await requestPath(rootHost, "/api/search?q=nike&country=ae")).body);
  assert(saSearch.country === "sa", "Saudi search should report selected country");
  assert(aeSearch.country === "ae", "UAE search should report selected country");
  assert(JSON.stringify(saSearch).includes("nike-ksa-web-affiliate-offer-1924"), "Saudi search should include Nike KSA");
  assert(!JSON.stringify(saSearch).includes("nike-uae-web-affiliate-offer-1907"), "Saudi search must exclude Nike UAE");
  assert(JSON.stringify(aeSearch).includes("nike-uae-web-affiliate-offer-1907"), "UAE search should include Nike UAE");
  assert(!JSON.stringify(aeSearch).includes("nike-ksa-web-affiliate-offer-1924"), "UAE search must exclude Nike KSA");
}

async function main() {
  validateEnvFlagParsing();
  validateData();
  validateFilters();
  validateCountryClient();
  await withServer(validateServerRoutes);
  console.log("Country routing check passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
