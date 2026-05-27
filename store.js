const storeLogo = document.querySelector("#store-logo");
const storeInitials = document.querySelector("#store-initials");
const storeCategory = document.querySelector("#store-category");
const storeTitle = document.querySelector("#store-title");
const couponTitle = document.querySelector("#coupon-title");
const officialLink = document.querySelector("#official-link");
const couponGrid = document.querySelector("#store-coupon-grid");
const favoritesStorageKey = "dealkhaleejFavoriteCoupons";
let favoriteCoupons = loadFavoriteCoupons();

function getCurrentMonthYear() {
  return new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  const label = isFavorite ? `Remove ${coupon.title} from favorites` : `Save ${coupon.title} to favorites`;

  return `
    <button class="favorite-button${isFavorite ? " active" : ""}" type="button" data-favorite-id="${escapeHtml(coupon.id)}" data-coupon-title="${escapeHtml(coupon.title)}" aria-label="${escapeHtml(label)}" aria-pressed="${isFavorite}">
      <span aria-hidden="true">${isFavorite ? "&#9829;" : "&#9825;"}</span>
    </button>
  `;
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
  button.setAttribute("aria-label", `${isFavorite ? "Remove" : "Save"} ${button.dataset.couponTitle} ${isFavorite ? "from" : "to"} favorites`);
  button.closest(".coupon-card").dataset.favorite = String(isFavorite);
  button.querySelector("span").innerHTML = isFavorite ? "&#9829;" : "&#9825;";
}

function setupLogoFallback(image) {
  const tile = image.closest(".logo-tile");

  image.addEventListener("load", () => {
    tile.classList.add("has-logo");
    tile.classList.remove("logo-missing");
  }, { once: true });

  image.addEventListener("error", () => {
    tile.classList.add("logo-missing");
    tile.classList.remove("has-logo");
  }, { once: true });

  if (image.complete) {
    tile.classList.toggle("has-logo", image.naturalWidth > 0);
    tile.classList.toggle("logo-missing", image.naturalWidth === 0);
  }
}

function couponCard(coupon) {
  const isCode = coupon.code && !["deal", "offer"].includes(coupon.code.toLowerCase());

  return `
    <article class="coupon-card" data-category="${escapeHtml(coupon.category)}" data-keywords="${escapeHtml(coupon.keywords)}" data-favorite="${favoriteCoupons.has(String(coupon.id))}">
      <div class="logo-tile">
        <img src="${escapeHtml(coupon.logo || "/assets/logos/placeholder.png")}" alt="${escapeHtml(coupon.store)} logo">
        <span>${escapeHtml(initials(coupon.store))}</span>
      </div>
      <div class="coupon-details">
        <div class="coupon-store-row">
          <p class="store-name">${escapeHtml(coupon.store)}</p>
          ${favoriteButton(coupon)}
        </div>
        ${coupon.verified ? '<span class="trending-badge">Trending &#128293;</span>' : ""}
        <h3>${escapeHtml(coupon.title)}</h3>
        <p class="meta">${escapeHtml(coupon.meta)}</p>
        ${coupon.expiry ? `<p class="expiry">Ends: ${escapeHtml(coupon.expiry)}</p>` : ""}
      </div>
      <div class="${isCode ? "coupon-action" : "coupon-action muted"}">
        <span>${escapeHtml(coupon.code || "OFFER")}</span>
        <button type="button" data-copy="${escapeHtml(isCode ? coupon.code : `${coupon.store} offer saved`)}" data-coupon-id="${escapeHtml(coupon.id)}" data-store="${escapeHtml(coupon.store)}" data-code="${escapeHtml(coupon.code || "OFFER")}" data-title="${escapeHtml(coupon.title)}">${isCode ? "Copy code" : "Save"}</button>
        <a class="shop-deal-button" href="/go/${encodeURIComponent(coupon.id)}">Shop Deal</a>
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

async function loadStore() {
  const slug = decodeURIComponent(location.pathname.replace(/^\/store\//, "").replace(/\/$/, "")).toLowerCase();
  const monthYear = getCurrentMonthYear();
  const [storeResponse, couponResponse] = await Promise.all([
    fetch("/api/stores"),
    fetch("/api/coupons")
  ]);
  const stores = await storeResponse.json();
  const coupons = await couponResponse.json();
  const store = stores.find((item) => item.name.toLowerCase() === slug);

  if (!store) {
    storeTitle.textContent = "Store not found";
    couponGrid.innerHTML = '<p class="empty-state">Return to the store directory to choose an available store.</p>';
    return;
  }

  document.title = `${store.name} Coupon Codes Saudi Arabia - ${monthYear} | DealKhaleej`;
  document.querySelector('meta[name="description"]').content = `Find verified ${store.name} coupon codes, promo codes, and deals for Saudi Arabia in ${monthYear}.`;
  storeTitle.textContent = `${store.name} Coupon Codes Saudi Arabia`;
  couponTitle.textContent = `${store.name} Coupon Codes`;
  storeCategory.textContent = store.category;
  storeInitials.textContent = initials(store.name);
  storeLogo.src = store.logo || "/assets/logos/placeholder.png";
  storeLogo.alt = `${store.name} logo`;
  officialLink.href = store.url;
  setupLogoFallback(storeLogo);

  const available = coupons.filter((coupon) => coupon.active && coupon.store.toLowerCase() === slug);
  couponGrid.innerHTML = available.length
    ? available.map(couponCard).join("")
    : '<p class="empty-state">No active coupons for this store yet.</p>';
  couponGrid.querySelectorAll(".logo-tile img").forEach(setupLogoFallback);
}

document.addEventListener("click", async (event) => {
  const favoriteButton = event.target.closest("[data-favorite-id]");
  if (favoriteButton) {
    toggleFavorite(favoriteButton);
    return;
  }

  const button = event.target.closest("[data-copy]");
  if (!button) return;
  trackCouponClick(button);
  await navigator.clipboard.writeText(button.dataset.copy).catch(() => {});
  button.textContent = "Copied";
});

loadStore().catch(() => {
  couponGrid.innerHTML = '<p class="empty-state">Unable to load store offers right now.</p>';
});
