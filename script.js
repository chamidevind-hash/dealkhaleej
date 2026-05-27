const couponGrid = document.querySelector("#coupon-grid");
const storeGrid = document.querySelector("#store-grid");
const trendingGrid = document.querySelector("#trending-grid");
const categoryButtons = Array.from(document.querySelectorAll(".category-chip"));
const searchInput = document.querySelector("#deal-search");
const searchForm = document.querySelector(".search-panel");
const toast = document.querySelector("#toast");
const activeCouponCount = document.querySelector("#active-coupon-count");
const verifiedCount = document.querySelector("#verified-count");
const categoryCount = document.querySelector("#category-count");
const freshnessLabel = document.querySelector("#freshness-label");
const favoritesCount = document.querySelector("#favorites-count");
const newsletterForm = document.querySelector("#newsletter-form");
const newsletterStatus = document.querySelector("#newsletter-status");
const pushAlertButton = document.querySelector("#push-alert-button");
const pushAlertStatus = document.querySelector("#push-alert-status");
const languageToggle = document.querySelector("#language-toggle");

let coupons = [];
let stores = [];
let trendingCoupons = [];
let trendingUnavailable = false;
let activeFilter = "all";
let toastTimer;
const favoritesStorageKey = "dealkhaleejFavoriteCoupons";
const languageStorageKey = "dealkhaleejLanguage";
const oneSignalAppId = "YOUR_ONESIGNAL_APP_ID";
let favoriteCoupons = loadFavoriteCoupons();
let currentLanguage = loadLanguage();
let oneSignalInitialized = false;

const translations = {
  en: {
    primaryNavigation: "Primary navigation",
    switchLanguage: "Switch to Arabic",
    topDeals: "Top Deals",
    stores: "Stores",
    howItWorks: "How It Works",
    app: "App",
    viewDeals: "View Deals",
    verifiedSaudi: "DealKhaleej | Verified in Saudi Arabia",
    heroTitle: "Saudi coupon codes.",
    heroCopy: "<strong>Find the code before checkout.</strong> Browse promo codes, flash offers, and store discounts without digging through endless lists.",
    searchCoupons: "Search coupons",
    searchPlaceholder: "Search store, code, or category",
    search: "Search",
    savingsSummary: "Savings summary",
    activeCoupons: "Active coupons",
    verifiedToday: "Verified today",
    popularCategories: "Popular categories",
    freshOffers: "Fresh Saudi offers",
    couponCategories: "Coupon categories",
    shopByCategory: "Shop by category",
    browseMenu: "Browse the deal menu",
    all: "All",
    favorites: "Favorites",
    fashion: "Fashion",
    beauty: "Beauty",
    grocery: "Grocery",
    travel: "Travel",
    electronics: "Electronics",
    food: "Food",
    sportswear: "Sportswear",
    digitalServices: "Digital Services",
    marketplace: "Marketplace",
    healthBeauty: "Health & Beauty",
    mostClicked: "Most clicked today",
    trendingToday: "Trending Today",
    editorPick: "Editor pick",
    nextFeatured: "Your next featured deal",
    featuredCopy: "Once you add coupons in the admin dashboard, featured codes can be promoted here for Saudi shoppers.",
    comingSoon: "COMING SOON",
    browseStores: "Browse Stores",
    liveBoard: "Live board",
    featuredCoupons: "Featured coupon cards",
    popularStores: "Popular stores",
    shopOfficialStores: "Shop official stores",
    checkoutFlow: "Simple checkout flow",
    howShoppersUse: "How shoppers use DealKhaleej",
    guideCopy: "Search for your store, copy a verified coupon, then paste it into the promo field at checkout. We separate coupon codes from regular offers so shoppers know what to expect before leaving the page.",
    stepOne: "Pick a store or category.",
    stepTwo: "Copy a code or save an offer.",
    stepThree: "Apply it before payment.",
    mobileReady: "Mobile ready",
    neverMiss: "Never miss a checkout code.",
    alertsCopy: "Turn on alerts for fashion drops, grocery weekends, travel deals, and new-user promos.",
    enableAlerts: "Enable Deal Alerts",
    dealAlerts: "Deal alerts",
    newsletterTitle: "Get fresh coupon codes by email.",
    newsletterCopy: "New Saudi offers and popular savings, delivered when they matter.",
    emailAddress: "Email address",
    emailPlaceholder: "you@email.com",
    subscribe: "Subscribe",
    footerBrand: "DealKhaleej Saudi",
    saudiArabia: "Saudi Arabia",
    uae: "UAE",
    kuwait: "Kuwait",
    contact: "Contact",
    blog: "Blog",
    telegramDeals: "Telegram Deals",
    trending: "Trending",
    ends: "Ends:",
    copyCode: "Copy code",
    save: "Save",
    shopDeal: "Shop Deal",
    savedOffer: "offer saved",
    saveFavorite: "Save {title} to favorites",
    removeFavorite: "Remove {title} from favorites",
    savedFavorites: "Saved to favorites",
    removedFavorites: "Removed from favorites",
    copied: "{value} copied",
    noFavorites: "No favorite coupons saved yet.",
    noMatches: "No coupons match your search.",
    noActive: "No active coupons yet.",
    noStores: "No stores yet.",
    loadingCoupons: "Loading coupons...",
    loadingStores: "Loading stores...",
    startBackend: "Start the backend with <strong>node server.js</strong> to load coupons.",
    backendOffline: "Backend offline.",
    rank: "Rank {number}",
    dealVisit: "{count} deal visit today",
    dealVisits: "{count} deal visits today",
    loadingTrending: "Loading trending coupons...",
    noTrending: "Trending coupons will appear after shoppers visit deals today.",
    trendingUnavailable: "Trending deals are unavailable right now.",
    subscribing: "Subscribing...",
    subscribed: "Thanks! You are subscribed for deal alerts.",
    subscribeUnavailable: "Unable to subscribe right now.",
    alertsSoon: "Deal alerts are coming soon.",
    enablingAlerts: "Enabling alerts...",
    unsupportedAlerts: "Push alerts are not supported on this browser.",
    alertsEnabled: "Deal alerts enabled.",
    alertsNotEnabled: "Deal alerts were not enabled.",
    alertsUnavailable: "Unable to enable deal alerts right now."
  },
  ar: {
    primaryNavigation: "التنقل الرئيسي",
    switchLanguage: "التبديل إلى الإنجليزية",
    topDeals: "أفضل العروض",
    stores: "المتاجر",
    howItWorks: "كيف يعمل",
    app: "التطبيق",
    viewDeals: "عرض العروض",
    verifiedSaudi: "DealKhaleej | موثق في السعودية",
    heroTitle: "كوبونات السعودية.",
    heroCopy: "<strong>اعثر على الكود قبل الدفع.</strong> تصفح أكواد الخصم والعروض السريعة وتخفيضات المتاجر بسهولة.",
    searchCoupons: "ابحث عن كوبونات",
    searchPlaceholder: "ابحث عن متجر أو كود أو فئة",
    search: "بحث",
    savingsSummary: "ملخص التوفير",
    activeCoupons: "كوبونات نشطة",
    verifiedToday: "موثق اليوم",
    popularCategories: "فئات شائعة",
    freshOffers: "عروض سعودية حديثة",
    couponCategories: "فئات الكوبونات",
    shopByCategory: "تسوق حسب الفئة",
    browseMenu: "تصفح قائمة العروض",
    all: "الكل",
    favorites: "المفضلة",
    fashion: "الأزياء",
    beauty: "الجمال",
    grocery: "البقالة",
    travel: "السفر",
    electronics: "الإلكترونيات",
    food: "الطعام",
    sportswear: "الملابس الرياضية",
    digitalServices: "الخدمات الرقمية",
    marketplace: "متجر شامل",
    healthBeauty: "الصحة والجمال",
    mostClicked: "الأكثر زيارة اليوم",
    trendingToday: "الأكثر رواجًا اليوم",
    editorPick: "اختيار المحرر",
    nextFeatured: "عرضك المميز التالي",
    featuredCopy: "بعد إضافة الكوبونات من لوحة الإدارة، يمكنك إبراز أفضل الأكواد للمتسوقين في السعودية.",
    comingSoon: "قريبًا",
    browseStores: "تصفح المتاجر",
    liveBoard: "العروض المباشرة",
    featuredCoupons: "بطاقات الكوبونات المميزة",
    popularStores: "متاجر شائعة",
    shopOfficialStores: "تسوق من المتاجر الرسمية",
    checkoutFlow: "خطوات دفع بسيطة",
    howShoppersUse: "كيف يستخدم المتسوقون DealKhaleej",
    guideCopy: "ابحث عن متجرك، وانسخ كوبونًا موثقًا، ثم ألصقه في خانة الرمز الترويجي عند الدفع. نوضح الفرق بين أكواد الخصم والعروض العادية قبل الانتقال إلى المتجر.",
    stepOne: "اختر متجرًا أو فئة.",
    stepTwo: "انسخ كودًا أو احفظ عرضًا.",
    stepThree: "طبقه قبل الدفع.",
    mobileReady: "جاهز للجوال",
    neverMiss: "لا تفوت كود خصم.",
    alertsCopy: "فعّل التنبيهات لعروض الأزياء والبقالة والسفر وعروض العملاء الجدد.",
    enableAlerts: "تفعيل تنبيهات العروض",
    dealAlerts: "تنبيهات العروض",
    newsletterTitle: "احصل على أكواد خصم جديدة بالبريد.",
    newsletterCopy: "عروض سعودية جديدة وخصومات شائعة تصلك في الوقت المناسب.",
    emailAddress: "البريد الإلكتروني",
    emailPlaceholder: "you@email.com",
    subscribe: "اشترك",
    footerBrand: "DealKhaleej السعودية",
    saudiArabia: "السعودية",
    uae: "الإمارات",
    kuwait: "الكويت",
    contact: "تواصل معنا",
    blog: "المدونة",
    telegramDeals: "عروض تيليجرام",
    trending: "رائج",
    ends: "ينتهي:",
    copyCode: "نسخ الكود",
    save: "حفظ",
    shopDeal: "تسوق العرض",
    savedOffer: "تم حفظ العرض",
    saveFavorite: "حفظ {title} في المفضلة",
    removeFavorite: "إزالة {title} من المفضلة",
    savedFavorites: "تم الحفظ في المفضلة",
    removedFavorites: "تمت الإزالة من المفضلة",
    copied: "تم نسخ {value}",
    noFavorites: "لا توجد كوبونات محفوظة في المفضلة بعد.",
    noMatches: "لا توجد كوبونات تطابق بحثك.",
    noActive: "لا توجد كوبونات نشطة بعد.",
    noStores: "لا توجد متاجر بعد.",
    loadingCoupons: "جارٍ تحميل الكوبونات...",
    loadingStores: "جارٍ تحميل المتاجر...",
    startBackend: "شغّل الخادم باستخدام <strong>node server.js</strong> لتحميل الكوبونات.",
    backendOffline: "الخادم غير متصل.",
    rank: "الترتيب {number}",
    dealVisit: "زيارة واحدة للعرض اليوم",
    dealVisits: "{count} زيارات للعرض اليوم",
    loadingTrending: "جارٍ تحميل العروض الرائجة...",
    noTrending: "ستظهر العروض الرائجة بعد زيارة المتسوقين للعروض اليوم.",
    trendingUnavailable: "العروض الرائجة غير متاحة الآن.",
    subscribing: "جارٍ الاشتراك...",
    subscribed: "شكرًا! تم اشتراكك في تنبيهات العروض.",
    subscribeUnavailable: "تعذر الاشتراك الآن.",
    alertsSoon: "تنبيهات العروض قادمة قريبًا.",
    enablingAlerts: "جارٍ تفعيل التنبيهات...",
    unsupportedAlerts: "هذا المتصفح لا يدعم التنبيهات.",
    alertsEnabled: "تم تفعيل تنبيهات العروض.",
    alertsNotEnabled: "لم يتم تفعيل تنبيهات العروض.",
    alertsUnavailable: "تعذر تفعيل تنبيهات العروض الآن."
  }
};

function translate(key, replacements = {}) {
  return Object.entries(replacements).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, value),
    translations[currentLanguage][key] || translations.en[key] || key
  );
}

function loadLanguage() {
  try {
    return localStorage.getItem(languageStorageKey) === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

function saveLanguage() {
  try {
    localStorage.setItem(languageStorageKey, currentLanguage);
  } catch {
    // Language still applies for this page visit when storage is unavailable.
  }
}

function loadSearchQueryFromUrl() {
  const query = new URLSearchParams(window.location.search).get("search");
  if (query) searchInput.value = query;
}

function getCurrentMonthYear() {
  return new Date().toLocaleString(currentLanguage === "ar" ? "ar-SA" : "en-US", { month: "long", year: "numeric" });
}

function updateStructuredData(monthYear) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "DealKhaleej",
    description: `Verified Saudi coupon codes and daily deals for ${monthYear}.`,
    url: "https://dealkhaleej.com",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://dealkhaleej.com/?search={search_term_string}"
      },
      "query-input": "required name=search_term_string"
    }
  };
  let jsonLd = document.querySelector('script[data-schema="website"]');

  if (!jsonLd) {
    jsonLd = document.createElement("script");
    jsonLd.type = "application/ld+json";
    jsonLd.dataset.schema = "website";
    document.head.appendChild(jsonLd);
  }

  jsonLd.textContent = JSON.stringify(structuredData);
}

function updateMonthlyPageContent() {
  const monthYear = getCurrentMonthYear();
  const title = currentLanguage === "ar"
    ? `DealKhaleej | كوبونات وعروض السعودية - ${monthYear}`
    : `DealKhaleej | Saudi Coupon Codes and Deals - ${monthYear}`;
  const description = currentLanguage === "ar"
    ? `اعثر على كوبونات وأكواد خصم وعروض يومية موثقة للسعودية لشهر ${monthYear} على DealKhaleej.`
    : `Find verified Saudi coupon codes, promo codes, and daily deals for ${monthYear} on DealKhaleej.`;

  document.title = title;
  document.querySelector('meta[name="description"]').content = description;
  document.querySelector('meta[property="og:title"]').content = title;
  document.querySelector('meta[property="og:description"]').content = description;
  document.querySelector('meta[name="twitter:title"]').content = title;
  document.querySelector('meta[name="twitter:description"]').content = description;
  freshnessLabel.textContent = monthYear;
  updateStructuredData(monthYear);
}

function applyLanguage(refreshDynamic = true) {
  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = currentLanguage === "ar" ? "rtl" : "ltr";
  languageToggle.textContent = currentLanguage === "ar" ? "EN" : "AR";
  languageToggle.setAttribute("aria-label", translate("switchLanguage"));

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = translate(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((element) => {
    element.innerHTML = translate(element.dataset.i18nHtml);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", translate(element.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", translate(element.dataset.i18nAriaLabel));
  });

  updateMonthlyPageContent();
  if (refreshDynamic && coupons.length) renderCoupons();
  if (refreshDynamic) renderTrendingCoupons();
}

function categoryLabel(category) {
  const categoryKeys = {
    marketplace: "marketplace",
    fashion: "fashion",
    beauty: "beauty",
    grocery: "grocery",
    travel: "travel",
    electronics: "electronics",
    food: "food",
    sports: "sportswear",
    services: "digitalServices",
    "health & beauty": "healthBeauty"
  };
  const key = categoryKeys[String(category || "").toLowerCase()];
  return key ? translate(key) : category;
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function loadFavoriteCoupons() {
  try {
    const saved = JSON.parse(localStorage.getItem(favoritesStorageKey) || "[]");
    return new Set(Array.isArray(saved) ? saved.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveFavoriteCoupons() {
  try {
    localStorage.setItem(favoritesStorageKey, JSON.stringify(Array.from(favoriteCoupons)));
  } catch {
    // Keep favorites usable for this page visit when storage is unavailable.
  }
}

function favoriteButton(coupon) {
  const isFavorite = favoriteCoupons.has(String(coupon.id));
  const label = translate(isFavorite ? "removeFavorite" : "saveFavorite", { title: coupon.title });

  return `
    <button class="favorite-button${isFavorite ? " active" : ""}" type="button" data-favorite-id="${escapeHtml(coupon.id)}" data-coupon-title="${escapeHtml(coupon.title)}" aria-label="${escapeHtml(label)}" aria-pressed="${isFavorite}">
      <span aria-hidden="true">${isFavorite ? "&#9829;" : "&#9825;"}</span>
    </button>
  `;
}

function updateFavoritesCount() {
  const activeIds = new Set(coupons.filter((coupon) => coupon.active).map((coupon) => String(coupon.id)));
  const count = Array.from(favoriteCoupons).filter((id) => activeIds.has(id)).length;
  favoritesCount.textContent = String(count);
}

function toggleFavorite(button) {
  const id = String(button.dataset.favoriteId);
  const isFavorite = !favoriteCoupons.has(id);

  if (isFavorite) {
    favoriteCoupons.add(id);
  } else {
    favoriteCoupons.delete(id);
  }

  saveFavoriteCoupons();
  button.classList.toggle("active", isFavorite);
  button.setAttribute("aria-pressed", String(isFavorite));
  button.setAttribute("aria-label", translate(isFavorite ? "removeFavorite" : "saveFavorite", { title: button.dataset.couponTitle }));
  button.querySelector("span").innerHTML = isFavorite ? "&#9829;" : "&#9825;";
  button.closest(".coupon-card").dataset.favorite = String(isFavorite);
  updateFavoritesCount();
  applyFilters();
  showToast(translate(isFavorite ? "savedFavorites" : "removedFavorites"));
}

function setupLogoFallbacks(scope = document) {
  const images = Array.from(scope.querySelectorAll(".logo-tile img"));

  images.forEach((image) => {
    const tile = image.closest(".logo-tile");

    function markLoaded() {
      tile.classList.add("has-logo");
      tile.classList.remove("logo-missing");
    }

    function markMissing() {
      tile.classList.add("logo-missing");
      tile.classList.remove("has-logo");
    }

    image.addEventListener("load", markLoaded, { once: true });
    image.addEventListener("error", markMissing, { once: true });

    if (image.complete) {
      image.naturalWidth > 0 ? markLoaded() : markMissing();
    }
  });
}

function couponCard(coupon) {
  const isCode = coupon.code && coupon.code.toLowerCase() !== "deal" && coupon.code.toLowerCase() !== "offer";
  const actionClass = isCode ? "coupon-action" : "coupon-action muted";
  const actionText = translate(isCode ? "copyCode" : "save");
  const copyValue = isCode ? coupon.code : `${coupon.store} ${translate("savedOffer")}`;

  return `
    <article class="coupon-card" data-category="${escapeHtml(coupon.category)}" data-keywords="${escapeHtml(coupon.keywords)}" data-favorite="${favoriteCoupons.has(String(coupon.id))}">
      <div class="logo-tile">
        <img src="${escapeHtml(coupon.logo || "assets/logos/placeholder.png")}" alt="${escapeHtml(coupon.store)} logo">
        <span>${escapeHtml(initials(coupon.store))}</span>
      </div>
      <div class="coupon-details">
        <div class="coupon-store-row">
          <p class="store-name">${escapeHtml(coupon.store)}</p>
          ${favoriteButton(coupon)}
        </div>
        ${coupon.verified ? `<span class="trending-badge">${escapeHtml(translate("trending"))} &#128293;</span>` : ""}
        <h3>${escapeHtml(coupon.title)}</h3>
        <p class="meta">${escapeHtml(coupon.meta)}</p>
        ${coupon.expiry ? `<p class="expiry">${escapeHtml(translate("ends"))} ${escapeHtml(coupon.expiry)}</p>` : ""}
      </div>
      <div class="${actionClass}">
        <span>${escapeHtml(coupon.code || "OFFER")}</span>
        <button type="button" data-copy="${escapeHtml(copyValue)}" data-coupon-id="${escapeHtml(coupon.id)}" data-store="${escapeHtml(coupon.store)}" data-code="${escapeHtml(coupon.code || "OFFER")}" data-title="${escapeHtml(coupon.title)}">${actionText}</button>
        <a class="shop-deal-button" href="/go/${encodeURIComponent(coupon.id)}">${escapeHtml(translate("shopDeal"))}</a>
      </div>
    </article>
  `;
}

function trackCouponClick(button) {
  fetch("/api/clicks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      couponId: button.dataset.couponId,
      storeName: button.dataset.store,
      couponCode: button.dataset.code,
      couponTitle: button.dataset.title
    })
  }).catch(() => {});
}

function storeCard(store) {
  return `
    <a href="/store/${encodeURIComponent(store.name.toLowerCase())}">
      <span class="logo-tile small">
        <img src="${escapeHtml(store.logo || "assets/logos/placeholder.png")}" alt="${escapeHtml(store.name)} logo">
        <strong>${escapeHtml(initials(store.name))}</strong>
      </span>
      ${escapeHtml(store.name)}
      <small>${escapeHtml(categoryLabel(store.category))}</small>
    </a>
  `;
}

function trendingCard(coupon, index) {
  return `
    <article class="trending-card">
      <span class="trending-rank" aria-label="${escapeHtml(translate("rank", { number: index + 1 }))}">${index + 1}</span>
      <span class="logo-tile small">
        <img src="${escapeHtml(coupon.logo || "assets/logos/placeholder.png")}" alt="${escapeHtml(coupon.store)} logo">
        <strong>${escapeHtml(initials(coupon.store))}</strong>
      </span>
      <div class="trending-details">
        <p class="store-name">${escapeHtml(coupon.store)}</p>
        <h3>${escapeHtml(coupon.title)}</h3>
        <p class="trending-clicks">${escapeHtml(translate(coupon.outboundCount === 1 ? "dealVisit" : "dealVisits", { count: coupon.outboundCount }))}</p>
      </div>
      <a class="shop-deal-button" href="/go/${encodeURIComponent(coupon.id)}">${escapeHtml(translate("shopDeal"))}</a>
    </article>
  `;
}

async function loadTrendingCoupons() {
  try {
    const response = await fetch("/api/trending");
    if (!response.ok) throw new Error("Unable to load trending coupons");
    trendingCoupons = await response.json();
    trendingUnavailable = false;
    renderTrendingCoupons();
  } catch {
    trendingUnavailable = true;
    renderTrendingCoupons();
  }
}

function renderTrendingCoupons() {
  if (trendingUnavailable) {
    trendingGrid.innerHTML = `<p class="empty-state">${escapeHtml(translate("trendingUnavailable"))}</p>`;
    return;
  }

  trendingGrid.innerHTML = trendingCoupons.length
    ? trendingCoupons.map(trendingCard).join("")
    : `<p class="empty-state">${escapeHtml(translate("noTrending"))}</p>`;
  setupLogoFallbacks(trendingGrid);
}

function renderCoupons() {
  const activeCoupons = coupons.filter((coupon) => coupon.active);

  couponGrid.innerHTML = activeCoupons.length
    ? `${activeCoupons.map(couponCard).join("")}<p class="empty-state filter-empty is-hidden">${escapeHtml(translate("noFavorites"))}</p>`
    : `<p class="empty-state">${escapeHtml(translate("noActive"))}</p>`;

  storeGrid.innerHTML = stores.length
    ? stores.map(storeCard).join("")
    : `<p class="empty-state">${escapeHtml(translate("noStores"))}</p>`;

  activeCouponCount.textContent = String(activeCoupons.length);
  verifiedCount.textContent = String(activeCoupons.filter((coupon) => coupon.verified).length);
  categoryCount.textContent = String(new Set(activeCoupons.map((coupon) => coupon.category)).size);
  updateFavoritesCount();

  setupLogoFallbacks(document);
  applyFilters();
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  const cards = Array.from(document.querySelectorAll(".coupon-card"));
  const filterEmpty = couponGrid.querySelector(".filter-empty");
  let visibleCount = 0;

  cards.forEach((card) => {
    const categoryMatch = activeFilter === "all" || activeFilter === "favorites" || card.dataset.category === activeFilter;
    const favoriteMatch = activeFilter !== "favorites" || card.dataset.favorite === "true";
    const searchableText = `${card.textContent} ${card.dataset.keywords}`.toLowerCase();
    const searchMatch = !query || searchableText.includes(query);
    const isVisible = categoryMatch && favoriteMatch && searchMatch;

    card.classList.toggle("is-hidden", !isVisible);
    if (isVisible) visibleCount += 1;
  });

  couponGrid.setAttribute("data-visible-count", String(visibleCount));
  if (filterEmpty) {
    filterEmpty.textContent = translate(activeFilter === "favorites" ? "noFavorites" : "noMatches");
    filterEmpty.classList.toggle("is-hidden", visibleCount !== 0);
  }
}

async function loadCoupons() {
  try {
    const [couponResponse, storeResponse] = await Promise.all([
      fetch("/api/coupons"),
      fetch("/api/stores")
    ]);
    if (!couponResponse.ok || !storeResponse.ok) throw new Error("Unable to load data");
    coupons = await couponResponse.json();
    stores = await storeResponse.json();
    renderCoupons();
  } catch {
    couponGrid.innerHTML = `<p class="empty-state">${translate("startBackend")}</p>`;
    storeGrid.innerHTML = `<p class="empty-state">${escapeHtml(translate("backendOffline"))}</p>`;
  }
}

categoryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    categoryButtons.forEach((item) => item.classList.toggle("active", item === button));
    applyFilters();
  });
});

searchInput.addEventListener("input", applyFilters);

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applyFilters();
});

languageToggle.addEventListener("click", () => {
  currentLanguage = currentLanguage === "en" ? "ar" : "en";
  saveLanguage();
  newsletterStatus.textContent = "";
  pushAlertStatus.textContent = "";
  applyLanguage();
});

newsletterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = newsletterForm.querySelector('button[type="submit"]');
  const email = newsletterForm.elements.email.value;

  submitButton.disabled = true;
  newsletterStatus.classList.remove("error");
  newsletterStatus.textContent = translate("subscribing");

  try {
    const response = await fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(translate("subscribeUnavailable"));

    newsletterForm.reset();
    newsletterStatus.textContent = translate("subscribed");
  } catch (error) {
    newsletterStatus.classList.add("error");
    newsletterStatus.textContent = error.message || translate("subscribeUnavailable");
  } finally {
    submitButton.disabled = false;
  }
});

pushAlertButton.addEventListener("click", () => {
  if (oneSignalAppId === "YOUR_ONESIGNAL_APP_ID") {
    pushAlertStatus.textContent = translate("alertsSoon");
    return;
  }

  pushAlertButton.disabled = true;
  pushAlertStatus.textContent = translate("enablingAlerts");
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    try {
      if (!oneSignalInitialized) {
        await OneSignal.init({ appId: oneSignalAppId });
        oneSignalInitialized = true;
      }

      if (!OneSignal.Notifications.isPushSupported()) {
        pushAlertStatus.textContent = translate("unsupportedAlerts");
        return;
      }

      await OneSignal.Notifications.requestPermission();
      pushAlertStatus.textContent = OneSignal.Notifications.permission
        ? translate("alertsEnabled")
        : translate("alertsNotEnabled");
    } catch {
      pushAlertStatus.textContent = translate("alertsUnavailable");
    } finally {
      pushAlertButton.disabled = false;
    }
  });
});

document.addEventListener("click", async (event) => {
  const favoriteButton = event.target.closest("[data-favorite-id]");
  if (favoriteButton) {
    toggleFavorite(favoriteButton);
    return;
  }

  const copyButton = event.target.closest("[data-copy]");
  if (!copyButton) return;

  const value = copyButton.dataset.copy;
  trackCouponClick(copyButton);

  try {
    await navigator.clipboard.writeText(value);
    showToast(translate("copied", { value }));
  } catch {
    showToast(value);
  }
});

loadSearchQueryFromUrl();
applyLanguage(false);
loadCoupons();
loadTrendingCoupons();

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadTrendingCoupons();
});

setInterval(loadTrendingCoupons, 60000);
