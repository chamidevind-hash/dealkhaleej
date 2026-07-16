const GCC_COUNTRY_CODES = ["sa", "ae", "kw", "qa", "bh", "om"];
const COUNTRY_CODES = ["gcc", ...GCC_COUNTRY_CODES];
const ROOT_HOSTNAME = "dealkhaleej.com";
const COUNTRY_SUBDOMAINS_ENABLED = countrySubdomainsEnabledFromEnv(process.env.COUNTRY_SUBDOMAINS_ENABLED);

function countrySubdomainsEnabledFromEnv(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

const COUNTRIES = {
  gcc: {
    code: "gcc",
    name: "GCC",
    shortName: "GCC",
    hostname: "dealkhaleej.com",
    currency: "SAR",
    locale: "en"
  },
  sa: {
    code: "sa",
    name: "Saudi Arabia",
    shortName: "Saudi Arabia",
    hostname: "sa.dealkhaleej.com",
    currency: "SAR",
    locale: "en-SA",
    hreflang: "en-SA"
  },
  ae: {
    code: "ae",
    name: "United Arab Emirates",
    shortName: "UAE",
    hostname: "ae.dealkhaleej.com",
    currency: "AED",
    locale: "en-AE",
    hreflang: "en-AE"
  },
  kw: {
    code: "kw",
    name: "Kuwait",
    shortName: "Kuwait",
    hostname: "kw.dealkhaleej.com",
    currency: "KWD",
    locale: "en-KW",
    hreflang: "en-KW"
  },
  qa: {
    code: "qa",
    name: "Qatar",
    shortName: "Qatar",
    hostname: "qa.dealkhaleej.com",
    currency: "QAR",
    locale: "en-QA",
    hreflang: "en-QA"
  },
  bh: {
    code: "bh",
    name: "Bahrain",
    shortName: "Bahrain",
    hostname: "bh.dealkhaleej.com",
    currency: "BHD",
    locale: "en-BH",
    hreflang: "en-BH"
  },
  om: {
    code: "om",
    name: "Oman",
    shortName: "Oman",
    hostname: "om.dealkhaleej.com",
    currency: "OMR",
    locale: "en-OM",
    hreflang: "en-OM"
  }
};

const HOST_TO_COUNTRY = Object.fromEntries(
  Object.values(COUNTRIES).map((country) => [country.hostname, country.code])
);
HOST_TO_COUNTRY["www.dealkhaleej.com"] = "gcc";

function normalizeHost(host = "") {
  return String(host).split(":")[0].toLowerCase();
}

function isLocalHostname(hostname) {
  return ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(normalizeHost(hostname));
}

function normalizeCountryCode(value, fallback = "gcc") {
  const code = String(value || "").trim().toLowerCase();
  return COUNTRY_CODES.includes(code) ? code : fallback;
}

function countryFromHostname(hostname) {
  return HOST_TO_COUNTRY[normalizeHost(hostname)] || "gcc";
}

function countryFromRequest(request, url) {
  const hostname = normalizeHost(request.headers.host || "");
  const queryCountry = normalizeCountryCode(url.searchParams.get("country"), "");

  if (queryCountry) {
    return COUNTRIES[queryCountry];
  }

  if (COUNTRY_SUBDOMAINS_ENABLED) {
    return COUNTRIES[countryFromHostname(hostname)] || COUNTRIES.gcc;
  }

  return COUNTRIES.gcc;
}

function siteUrlForCountry(countryCode = "gcc") {
  const country = COUNTRIES[normalizeCountryCode(countryCode)];
  return `https://${COUNTRY_SUBDOMAINS_ENABLED ? country.hostname : ROOT_HOSTNAME}`;
}

function routeUrlForCountry(countryCode, pathname = "/", search = "") {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  if (!COUNTRY_SUBDOMAINS_ENABLED) params.delete("country");
  const normalizedSearch = params.toString();

  return `${siteUrlForCountry(countryCode)}${normalizedPath}${normalizedSearch ? `?${normalizedSearch}` : ""}`;
}

function countrySelectorOptions(selectedCode = "gcc") {
  return COUNTRY_CODES.map((code) => {
    const country = COUNTRIES[code];
    const selected = code === selectedCode ? " selected" : "";
    return `<option value="${country.code}"${selected}>${country.shortName}</option>`;
  }).join("");
}

function countrySelectorHtml(selectedCode = "gcc", id = "country-selector") {
  return `
      <label class="country-select" for="${id}">
        <span>Country</span>
        <select id="${id}" data-country-selector aria-label="Select GCC country">
          ${countrySelectorOptions(selectedCode)}
        </select>
      </label>`;
}

function clientCountryScript(countryCode = "gcc") {
  const selected = COUNTRIES[normalizeCountryCode(countryCode)];
  return `<script>window.DealKhaleejCountry=${JSON.stringify(selected)};window.DealKhaleejCountries=${JSON.stringify(COUNTRY_CODES.map((code) => COUNTRIES[code]))};window.DealKhaleejCountrySubdomainsEnabled=${JSON.stringify(COUNTRY_SUBDOMAINS_ENABLED)};</script>`;
}

function hreflangLinks(pathname, countryCodes = COUNTRY_CODES) {
  if (!COUNTRY_SUBDOMAINS_ENABLED) return "";

  const codes = Array.from(new Set(countryCodes.map((code) => normalizeCountryCode(code)).filter(Boolean)));
  const links = [];

  GCC_COUNTRY_CODES.forEach((code) => {
    if (!codes.includes(code)) return;
    links.push(`<link rel="alternate" hreflang="${COUNTRIES[code].hreflang}" href="${routeUrlForCountry(code, pathname)}">`);
  });

  links.push(`<link rel="alternate" hreflang="x-default" href="${routeUrlForCountry("gcc", pathname)}">`);
  return links.join("\n  ");
}

function tokenizeCountryText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[._/]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function countriesFromText(text) {
  const normalized = tokenizeCountryText(text);
  const found = new Set();

  if (!normalized) return [];
  if (/\bgcc\b|\bgulf\b/.test(normalized)) {
    GCC_COUNTRY_CODES.forEach((code) => found.add(code));
  }
  if (/\bglobal\b|\bworldwide\b|\binternational\b/.test(normalized)) found.add("global");
  if (/\bmiddle east\b|\bmiddle eastern\b/.test(normalized)) {
    GCC_COUNTRY_CODES.forEach((code) => found.add(code));
  }
  if (/\bsaudi arabia\b|\bsaudi\b|\bksa\b|\briyadh\b|\bjeddah\b|\bdammam\b/.test(normalized)) found.add("sa");
  if (/\buae\b|\bunited arab emirates\b|\bdubai\b|\babu dhabi\b/.test(normalized)) found.add("ae");
  if (/\bkuwait\b/.test(normalized)) found.add("kw");
  if (/\bqatar\b|\bdoha\b/.test(normalized)) found.add("qa");
  if (/\bbahrain\b|\bmanama\b/.test(normalized)) found.add("bh");
  if (/\boman\b|\bmuscat\b/.test(normalized)) found.add("om");

  return normalizeCountryList(Array.from(found));
}

function normalizeCountryList(values) {
  const input = Array.isArray(values) ? values : [values];
  const normalized = new Set();

  input.forEach((value) => {
    const code = String(value || "").trim().toLowerCase();
    if (code === "gcc") {
      GCC_COUNTRY_CODES.forEach((countryCode) => normalized.add(countryCode));
      return;
    }
    if (code === "global") {
      normalized.add("global");
      return;
    }
    if (GCC_COUNTRY_CODES.includes(code)) normalized.add(code);
  });

  const ordered = ["global", ...GCC_COUNTRY_CODES].filter((code) => normalized.has(code));
  return ordered.length ? ordered : [...GCC_COUNTRY_CODES];
}

function itemCountries(item, fallbackText = "") {
  if (Array.isArray(item?.countries) && item.countries.length) {
    return normalizeCountryList(item.countries);
  }

  return normalizeCountryList(countriesFromText([
    item?.store,
    item?.name,
    item?.title,
    item?.keywords,
    item?.meta,
    item?.description,
    item?.storeTagline,
    item?.url,
    fallbackText
  ].filter(Boolean).join(" ")));
}

function articleCountries(article) {
  if (Array.isArray(article?.countries) && article.countries.length) {
    return article.countries.map((code) => String(code).toLowerCase()).filter((code) => code === "gcc" || code === "global" || GCC_COUNTRY_CODES.includes(code));
  }

  const detected = countriesFromText([
    article?.title,
    article?.slug,
    article?.excerpt,
    article?.metaTitle,
    article?.metaDescription,
    Array.isArray(article?.relatedStores) ? article.relatedStores.map((store) => `${store.name || ""} ${store.slug || ""}`).join(" ") : ""
  ].filter(Boolean).join(" "));

  if (detected.includes("global")) return ["global"];
  if (detected.length && detected.length < GCC_COUNTRY_CODES.length) return detected;
  return ["gcc"];
}

function isItemVisibleInCountry(item, countryCode) {
  if (countryCode === "gcc") return true;
  const countries = itemCountries(item);
  return countries.includes("global") || countries.includes(countryCode);
}

function isArticleVisibleInCountry(article, countryCode) {
  if (countryCode === "gcc") return true;
  const countries = articleCountries(article);
  return countries.includes("global") || countries.includes("gcc") || countries.includes(countryCode);
}

function filterCouponsByCountry(coupons, countryCode) {
  return countryCode === "gcc" ? coupons : coupons.filter((coupon) => isItemVisibleInCountry(coupon, countryCode));
}

function filterArticlesByCountry(articles, countryCode) {
  return countryCode === "gcc" ? articles : articles.filter((article) => isArticleVisibleInCountry(article, countryCode));
}

function filterStoresByCountry(stores, coupons, countryCode) {
  if (countryCode === "gcc") return stores;
  const visibleStoreNames = new Set(filterCouponsByCountry(coupons, countryCode).map((coupon) => String(coupon.store || "").toLowerCase()));

  return stores.filter((store) => visibleStoreNames.has(String(store.name || "").toLowerCase()) || isItemVisibleInCountry(store, countryCode));
}

function countryCodesForStore(store, coupons) {
  const relatedCoupons = coupons.filter((coupon) => String(coupon.store || "").toLowerCase() === String(store.name || "").toLowerCase());
  const codes = new Set();

  [...itemCountries(store), ...relatedCoupons.flatMap((coupon) => itemCountries(coupon))].forEach((code) => {
    if (code === "global") {
      GCC_COUNTRY_CODES.forEach((countryCode) => codes.add(countryCode));
    } else if (GCC_COUNTRY_CODES.includes(code)) {
      codes.add(code);
    }
  });

  return codes.size ? Array.from(codes) : [...GCC_COUNTRY_CODES];
}

module.exports = {
  COUNTRIES,
  COUNTRY_CODES,
  GCC_COUNTRY_CODES,
  COUNTRY_SUBDOMAINS_ENABLED,
  countrySubdomainsEnabledFromEnv,
  HOST_TO_COUNTRY,
  normalizeCountryCode,
  countryFromHostname,
  countryFromRequest,
  siteUrlForCountry,
  routeUrlForCountry,
  countrySelectorHtml,
  clientCountryScript,
  hreflangLinks,
  countriesFromText,
  normalizeCountryList,
  itemCountries,
  articleCountries,
  isItemVisibleInCountry,
  isArticleVisibleInCountry,
  filterCouponsByCountry,
  filterStoresByCountry,
  filterArticlesByCountry,
  countryCodesForStore,
  isLocalHostname
};
