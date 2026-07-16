const fs = require("fs");
const path = require("path");
const {
  GCC_COUNTRY_CODES,
  countriesFromText,
  normalizeExplicitCountryList,
  normalizeCountryList
} = require("../config/countries");

const root = path.join(__dirname, "..");
const couponsPath = path.join(root, "data", "coupons.json");
const storesPath = path.join(root, "data", "stores.json");
const articlesPath = path.join(root, "data", "articles.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function countryTextForOffer(offer) {
  return [
    offer.store,
    offer.title,
    offer.description,
    offer.keywords,
    offer.meta,
    offer.storeTagline,
    offer.url,
    offer.uaeUrl ? "UAE" : ""
  ].filter(Boolean).join(" ");
}

function primaryCountryTextForOffer(offer) {
  return [
    offer.store,
    offer.title,
    offer.description,
    offer.meta,
    offer.url,
    offer.uaeUrl ? "UAE" : ""
  ].filter(Boolean).join(" ");
}

function specificCountriesFromText(text) {
  const value = String(text || "").toLowerCase();
  const normalized = value
    .replace(/&/g, " and ")
    .replace(/[._/]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ");
  const found = new Set();

  if (/\bsaudi arabia\b|\bsaudi\b|\bksa\b|\briyadh\b|\bjeddah\b|\bdammam\b|\.sa\b/.test(value) || /\bsa\b/.test(normalized)) found.add("sa");
  if (/\buae\b|\bunited arab emirates\b|\bdubai\b|\babu dhabi\b|\bae\b/.test(normalized)) found.add("ae");
  if (/\bkuwait\b|\bkw\b/.test(normalized)) found.add("kw");
  if (/\bqatar\b|\bdoha\b|\bqa\b/.test(normalized)) found.add("qa");
  if (/\bbahrain\b|\bmanama\b|\bbh\b/.test(normalized)) found.add("bh");
  if (/\boman\b|\bmuscat\b|\bom\b/.test(normalized)) found.add("om");

  return Array.from(found);
}

function normalizeOfferCountries(offer) {
  const explicit = normalizeExplicitCountryList(offer.countries);
  if (explicit.length) return explicit;

  if (/\bgcc\b/i.test(String(offer.store || ""))) {
    return [...GCC_COUNTRY_CODES];
  }

  const primaryText = primaryCountryTextForOffer(offer);
  const primarySpecific = specificCountriesFromText(primaryText);
  if (primarySpecific.length) return normalizeCountryList(primarySpecific);

  const primaryDetected = countriesFromText(primaryText);
  if (primaryDetected.length) return normalizeCountryList(primaryDetected);

  const detected = countriesFromText(countryTextForOffer(offer));
  return detected.length ? normalizeCountryList(detected) : [];
}

function normalizeStoreCountries(store, coupons) {
  const explicit = normalizeExplicitCountryList(store.countries);
  if (explicit.length) return explicit;

  if (/\bgcc\b/i.test(String(store.name || ""))) {
    return [...GCC_COUNTRY_CODES];
  }

  const storeOffers = coupons.filter((coupon) => String(coupon.store || "").toLowerCase() === String(store.name || "").toLowerCase());
  const detected = [
    ...countriesFromText([store.name, store.description, store.url, store.category].filter(Boolean).join(" ")),
    ...storeOffers.flatMap((coupon) => coupon.countries || normalizeOfferCountries(coupon))
  ];

  return detected.length ? normalizeCountryList(detected) : [];
}

function normalizeArticleCountries(article) {
  const primary = [article.title, article.slug, article.metaTitle].filter(Boolean).join(" ");
  const primarySpecific = specificCountriesFromText(primary);
  if (primarySpecific.length) return primarySpecific;

  const primaryLower = primary.toLowerCase();
  if (/\bgcc\b|\bgulf\b/.test(primaryLower)) return ["gcc"];
  if (/\bglobal\b|\bworldwide\b|\binternational\b/.test(primaryLower)) return ["global"];

  const secondary = [
    article.excerpt,
    article.metaDescription,
    Array.isArray(article.relatedStores) ? article.relatedStores.map((store) => `${store.name || ""} ${store.slug || ""}`).join(" ") : ""
  ].filter(Boolean).join(" ");
  const secondarySpecific = specificCountriesFromText(secondary);
  if (secondarySpecific.length && secondarySpecific.length < GCC_COUNTRY_CODES.length) return secondarySpecific;

  const detected = countriesFromText(`${primary} ${secondary}`);
  if (detected.includes("global") && detected.length === 1) return ["global"];
  if (detected.length && detected.length < GCC_COUNTRY_CODES.length) return detected;
  return ["gcc"];
}

function main() {
  const coupons = readJson(couponsPath);
  const stores = readJson(storesPath);
  const articles = readJson(articlesPath);
  const couponUrlSnapshot = new Map(coupons.map((coupon) => [coupon.id, { url: coupon.url, uaeUrl: coupon.uaeUrl }]));

  const normalizedCoupons = coupons.map((coupon) => ({
    ...coupon,
    countries: normalizeOfferCountries(coupon)
  }));

  const normalizedStores = stores.map((store) => ({
    ...store,
    countries: normalizeStoreCountries(store, normalizedCoupons)
  }));

  const normalizedArticles = articles.map((article) => ({
    ...article,
    countries: normalizeArticleCountries(article)
  }));

  normalizedCoupons.forEach((coupon) => {
    const before = couponUrlSnapshot.get(coupon.id);
    if (!before || before.url !== coupon.url || before.uaeUrl !== coupon.uaeUrl) {
      throw new Error(`Affiliate URL changed while normalizing ${coupon.id}`);
    }
  });

  writeJson(couponsPath, normalizedCoupons);
  writeJson(storesPath, normalizedStores);
  writeJson(articlesPath, normalizedArticles);
  console.log(`Normalized countries for ${normalizedCoupons.length} coupons, ${normalizedStores.length} stores, and ${normalizedArticles.length} articles.`);
}

main();
