const RIYADH_TIME_ZONE = "Asia/Riyadh";

function dateStampForTimeZone(value = new Date(), timeZone = RIYADH_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function currentRiyadhDateStamp(value) {
  const override = String(process.env.DEALKHALEEJ_CURRENT_DATE || "").trim();
  if (arguments.length === 0) {
    return parseDateOnly(override) || dateStampForTimeZone();
  }
  return dateStampForTimeZone(value);
}

function parseDateOnly(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (!match) return "";

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }

  return `${yearText}-${monthText}-${dayText}`;
}

function offerExpiryDate(offer) {
  return parseDateOnly(offer?.expiry);
}

function hasInvalidExpiryDate(offer) {
  const raw = String(offer?.expiry || "").trim();
  return Boolean(raw && !offerExpiryDate(offer));
}

function isOfferExpired(offer, today = currentRiyadhDateStamp()) {
  const expiry = offerExpiryDate(offer);
  return Boolean(expiry && expiry < today);
}

function isOfferCurrentlyActive(offer, today = currentRiyadhDateStamp()) {
  return offer?.active !== false && !isOfferExpired(offer, today);
}

function filterCurrentOffers(offers, today = currentRiyadhDateStamp()) {
  return offers.filter((offer) => isOfferCurrentlyActive(offer, today));
}

function offerRuntimeStatus(offer, today = currentRiyadhDateStamp()) {
  const expired = isOfferExpired(offer, today);
  const currentlyActive = isOfferCurrentlyActive(offer, today);
  return {
    expiryDate: offerExpiryDate(offer),
    invalidExpiryDate: hasInvalidExpiryDate(offer),
    expired,
    currentlyActive
  };
}

module.exports = {
  RIYADH_TIME_ZONE,
  dateStampForTimeZone,
  currentRiyadhDateStamp,
  parseDateOnly,
  offerExpiryDate,
  hasInvalidExpiryDate,
  isOfferExpired,
  isOfferCurrentlyActive,
  filterCurrentOffers,
  offerRuntimeStatus
};
