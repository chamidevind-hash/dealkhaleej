(function () {
  const storageKey = "dealkhaleej_country";
  const countries = Array.isArray(window.DealKhaleejCountries) ? window.DealKhaleejCountries : [];
  const subdomainsEnabled = Boolean(window.DealKhaleejCountrySubdomainsEnabled);
  const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
  const countryCodes = new Set(countries.map((country) => country.code));
  const fallbackCountry = countries.find((country) => country.code === "gcc") || { code: "gcc", name: "GCC", shortName: "GCC", hostname: "dealkhaleej.com" };

  function isLocalHost(hostname) {
    return localHosts.has(String(hostname || "").toLowerCase());
  }

  function isDealKhaleejHost(hostname) {
    return /(^|\.)dealkhaleej\.com$/i.test(String(hostname || ""));
  }

  function normalizeCode(value) {
    const code = String(value || "").trim().toLowerCase();
    return countryCodes.has(code) ? code : "";
  }

  function countryForCode(code) {
    return countries.find((country) => country.code === code) || fallbackCountry;
  }

  function readStoredCountry() {
    try {
      return normalizeCode(localStorage.getItem(storageKey));
    } catch {
      return "";
    }
  }

  function saveCountry(code) {
    try {
      localStorage.setItem(storageKey, normalizeCode(code) || "gcc");
    } catch {
      // Country still applies for this page visit when storage is unavailable.
    }
  }

  function countryFromUrl() {
    const url = new URL(window.location.href);
    return normalizeCode(url.searchParams.get("country"));
  }

  function activeCountryCode() {
    return countryFromUrl()
      || readStoredCountry()
      || normalizeCode(window.DealKhaleejCountry && window.DealKhaleejCountry.code)
      || "gcc";
  }

  function cleanCountryParam() {
    const next = new URL(window.location.href);
    const rawCountry = next.searchParams.get("country");
    const normalized = normalizeCode(rawCountry);

    if (rawCountry && (!normalized || normalized === "gcc")) {
      next.searchParams.delete("country");
      window.history.replaceState(window.history.state, "", next.toString());
    }
  }

  const currentCountry = countryForCode(activeCountryCode());
  if (countryFromUrl()) saveCountry(currentCountry.code);
  cleanCountryParam();

  window.DealKhaleejCountry = currentCountry;
  document.documentElement.dataset.country = currentCountry.code;

  function countryUrl(path) {
    const next = new URL(path, window.location.origin);

    if (subdomainsEnabled && !isLocalHost(window.location.hostname)) {
      const target = countryForCode(currentCountry.code);
      next.protocol = "https:";
      next.hostname = target.hostname;
      next.searchParams.delete("country");
      return next.toString();
    }

    if (currentCountry.code === "gcc") {
      next.searchParams.delete("country");
    } else {
      next.searchParams.set("country", currentCountry.code);
    }

    return `${next.pathname}${next.search}${next.hash}`;
  }

  function redirectToCountry(code) {
    const target = countryForCode(normalizeCode(code) || "gcc");
    const next = new URL(window.location.href);

    saveCountry(target.code);

    if (subdomainsEnabled && !isLocalHost(next.hostname)) {
      next.protocol = "https:";
      next.hostname = target.hostname;
      next.searchParams.delete("country");
    } else if (target.code === "gcc") {
      next.searchParams.delete("country");
    } else {
      next.searchParams.set("country", target.code);
    }

    window.location.assign(next.toString());
  }

  function countryApiUrl(path) {
    return countryUrl(path);
  }

  function shouldSkipLink(anchor, rawHref) {
    const href = String(rawHref || "").trim();
    if (!href || href.startsWith("#")) return true;
    if (/^(?:mailto:|tel:|sms:|javascript:)/i.test(href)) return true;

    let target;
    try {
      target = new URL(href, window.location.origin);
    } catch {
      return true;
    }

    const sameSite = target.origin === window.location.origin || isDealKhaleejHost(target.hostname);
    if (!sameSite) return true;
    if (/^\/go\/[^/]+\/?$/i.test(target.pathname)) return true;
    if (/^\/api\//i.test(target.pathname)) return true;
    if (/^\/(?:assets|imports|config|data|scripts)\//i.test(target.pathname)) return true;
    if (/\.(?:css|js|mjs|json|png|jpe?g|svg|webp|gif|ico|xml|txt|pdf|woff2?|map)$/i.test(target.pathname)) return true;
    if (anchor.hasAttribute("download")) return true;

    return false;
  }

  function updateInternalLink(anchor) {
    const rawHref = anchor.getAttribute("href");
    if (shouldSkipLink(anchor, rawHref)) return;

    const updated = countryUrl(rawHref);
    if (updated && anchor.getAttribute("href") !== updated) {
      anchor.setAttribute("href", updated);
    }
  }

  function updateInternalLinks(root = document) {
    root.querySelectorAll("a[href]").forEach(updateInternalLink);
  }

  function syncSelector(selector) {
    selector.value = currentCountry.code;
    selector.addEventListener("change", () => redirectToCountry(selector.value));
  }

  window.DealKhaleejCountryRedirect = redirectToCountry;
  window.DealKhaleejCountryApiUrl = countryApiUrl;
  window.DealKhaleejCountryUrl = countryUrl;
  document.querySelectorAll("[data-country-selector]").forEach(syncSelector);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => updateInternalLinks(document), { once: true });
  } else {
    updateInternalLinks(document);
  }

  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.matches && node.matches("a[href]")) updateInternalLink(node);
        if (node.querySelectorAll) updateInternalLinks(node);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
