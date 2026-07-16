const favoritesStorageKey = "dealkhaleejFavoriteCoupons";
let favoriteCoupons = loadFavoriteCoupons();

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
    // Favorites still work for the current visit when storage is unavailable.
  }
}

function setupLogoFallback(image) {
  const tile = image.closest(".logo-tile");
  if (!tile) return;

  function syncState() {
    const hasLogo = image.naturalWidth > 0;
    tile.classList.toggle("has-logo", hasLogo);
    tile.classList.toggle("logo-missing", !hasLogo);
  }

  image.addEventListener("load", syncState);
  image.addEventListener("error", () => {
    tile.classList.add("logo-missing");
    tile.classList.remove("has-logo");
  });

  if (image.complete) syncState();
}

function syncFavoriteButton(button) {
  const id = String(button.dataset.favoriteId || "");
  const isFavorite = favoriteCoupons.has(id);
  const icon = button.querySelector("span");

  button.classList.toggle("active", isFavorite);
  button.setAttribute("aria-pressed", String(isFavorite));
  button.setAttribute("aria-label", `${isFavorite ? "Remove" : "Save"} ${button.dataset.couponTitle || "coupon"} ${isFavorite ? "from" : "to"} favorites`);
  if (icon) icon.innerHTML = isFavorite ? "&#9829;" : "&#9825;";

  const card = button.closest(".coupon-card");
  if (card) card.dataset.favorite = String(isFavorite);
}

function toggleFavorite(button) {
  const id = String(button.dataset.favoriteId || "");
  if (!id) return;

  if (favoriteCoupons.has(id)) {
    favoriteCoupons.delete(id);
  } else {
    favoriteCoupons.add(id);
  }

  saveFavoriteCoupons();
  syncFavoriteButton(button);
}

function trackCouponCopy(button) {
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

async function copyCoupon(button) {
  const originalText = button.textContent;

  trackCouponCopy(button);
  await navigator.clipboard.writeText(button.dataset.copy || "").catch(() => {});
  button.textContent = "Copied";
  button.disabled = true;

  setTimeout(() => {
    button.textContent = originalText;
    button.disabled = false;
  }, 1600);
}

async function subscribeToNewsletter(form) {
  const status = document.querySelector("#store-newsletter-status");
  const button = form.querySelector("button[type='submit']");
  const email = new FormData(form).get("email");

  if (status) {
    status.textContent = "";
    status.classList.remove("error");
  }
  if (button) button.disabled = true;

  try {
    const response = await fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to subscribe right now.");
    form.reset();
    if (status) status.textContent = result.message || "Thanks! You are subscribed for deal alerts.";
  } catch (error) {
    if (status) {
      status.textContent = error.message || "Unable to subscribe right now.";
      status.classList.add("error");
    }
  } finally {
    if (button) button.disabled = false;
  }
}

document.querySelectorAll(".logo-tile img").forEach(setupLogoFallback);
document.querySelectorAll("[data-favorite-id]").forEach(syncFavoriteButton);

document.addEventListener("click", (event) => {
  const favoriteButton = event.target.closest("[data-favorite-id]");
  if (favoriteButton) {
    toggleFavorite(favoriteButton);
    return;
  }

  const copyButton = event.target.closest("[data-copy]");
  if (copyButton) copyCoupon(copyButton);
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("#store-newsletter-form");
  if (!form) return;

  event.preventDefault();
  subscribeToNewsletter(form);
});
