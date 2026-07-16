(function () {
  const countries = Array.isArray(window.DealKhaleejCountries) ? window.DealKhaleejCountries : [];
  const currentCountry = window.DealKhaleejCountry || countries.find((country) => country.code === "gcc") || { code: "gcc", hostname: "dealkhaleej.com" };
  const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

  function isLocalHost(hostname) {
    return localHosts.has(String(hostname || "").toLowerCase());
  }

  function countryForCode(code) {
    return countries.find((country) => country.code === code) || currentCountry;
  }

  function redirectToCountry(code) {
    const target = countryForCode(code);
    const next = new URL(window.location.href);

    try {
      localStorage.setItem("dealkhaleejLastCountry", target.code);
    } catch {
      // Hostname remains the source of truth; this is only a convenience hint.
    }

    if (isLocalHost(next.hostname)) {
      if (target.code === "gcc") {
        next.searchParams.delete("country");
      } else {
        next.searchParams.set("country", target.code);
      }
    } else {
      next.protocol = "https:";
      next.hostname = target.hostname;
      next.searchParams.delete("country");
    }

    window.location.assign(next.toString());
  }

  function countryApiUrl(path) {
    const target = new URL(path, window.location.origin);

    if (isLocalHost(window.location.hostname) && currentCountry.code !== "gcc") {
      target.searchParams.set("country", currentCountry.code);
    }

    return `${target.pathname}${target.search}${target.hash}`;
  }

  function syncSelector(selector) {
    selector.value = currentCountry.code;
    selector.addEventListener("change", () => redirectToCountry(selector.value));
  }

  window.DealKhaleejCountryRedirect = redirectToCountry;
  window.DealKhaleejCountryApiUrl = countryApiUrl;
  document.querySelectorAll("[data-country-selector]").forEach(syncSelector);
})();
