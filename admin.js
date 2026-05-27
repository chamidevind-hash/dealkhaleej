const form = document.querySelector("#coupon-form");
const list = document.querySelector("#admin-list");
const statusText = document.querySelector("#form-status");
const loginForm = document.querySelector("#login-form");
const loginView = document.querySelector("#login-view");
const loginStatus = document.querySelector("#login-status");
const adminView = document.querySelector("#admin-view");
const authOnlyElements = document.querySelectorAll(".admin-auth-only");
const logoutButton = document.querySelector("#logout-button");
const resetButton = document.querySelector("#reset-form");
const refreshButton = document.querySelector("#refresh-coupons");
const refreshClicksButton = document.querySelector("#refresh-clicks");
const storeTemplate = document.querySelector("#store-template");
const totalClicks = document.querySelector("#total-clicks");
const topClickedStore = document.querySelector("#top-clicked-store");
const clickList = document.querySelector("#click-list");

let coupons = [];
let stores = [];
let clicks = [];
const sessionKey = "dealkhaleejAdminToken";

function token() {
  return localStorage.getItem(sessionKey) || "";
}

function adminHeaders(headers = {}) {
  return { ...headers, Authorization: `Bearer ${token()}` };
}

async function adminFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: adminHeaders(options.headers)
  });

  if (response.status === 401) {
    showLogin("Your session expired. Please sign in again.");
    throw new Error("Admin login required.");
  }

  return response;
}

function showLogin(message = "") {
  localStorage.removeItem(sessionKey);
  loginView.classList.remove("is-hidden");
  adminView.classList.add("is-hidden");
  authOnlyElements.forEach((element) => element.classList.add("is-hidden"));
  loginStatus.textContent = message;
}

function showAdmin() {
  loginView.classList.add("is-hidden");
  adminView.classList.remove("is-hidden");
  authOnlyElements.forEach((element) => element.classList.remove("is-hidden"));
  loginStatus.textContent = "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formPayload() {
  const data = new FormData(form);

  return {
    store: data.get("store"),
    title: data.get("title"),
    code: data.get("code") || "OFFER",
    category: data.get("category"),
    keywords: data.get("keywords"),
    meta: data.get("meta"),
    expiry: data.get("expiry"),
    logo: data.get("logo"),
    storeTagline: data.get("storeTagline"),
    url: data.get("url") || "#",
    active: data.has("active"),
    verified: data.has("verified")
  };
}

function setStatus(message) {
  statusText.textContent = message;
  window.setTimeout(() => {
    if (statusText.textContent === message) statusText.textContent = "";
  }, 2500);
}

function resetForm() {
  form.reset();
  form.elements.id.value = "";
  form.elements.active.checked = true;
  form.elements.verified.checked = true;
  form.querySelector(".primary-button").textContent = "Save coupon";
}

function renderStoreOptions() {
  storeTemplate.innerHTML = [
    '<option value="">Select from catalog</option>',
    ...stores.map((store) => `<option value="${escapeHtml(store.name)}">${escapeHtml(store.name)}</option>`)
  ].join("");
}

function useOfficialStore(name) {
  const store = stores.find((item) => item.name === name);
  if (!store) return;

  form.elements.store.value = store.name;
  form.elements.logo.value = store.logo;
  form.elements.url.value = store.url;
  form.elements.storeTagline.value = store.category;
  form.elements.keywords.value = `${store.name} ${store.category}`.toLowerCase();
}

function editCoupon(coupon) {
  form.elements.id.value = coupon.id;
  form.elements.store.value = coupon.store;
  form.elements.title.value = coupon.title;
  form.elements.code.value = coupon.code;
  form.elements.category.value = coupon.category;
  form.elements.keywords.value = coupon.keywords;
  form.elements.meta.value = coupon.meta;
  form.elements.expiry.value = coupon.expiry || "";
  form.elements.logo.value = coupon.logo;
  form.elements.storeTagline.value = coupon.storeTagline;
  form.elements.url.value = coupon.url;
  form.elements.active.checked = coupon.active;
  form.elements.verified.checked = coupon.verified;
  form.querySelector(".primary-button").textContent = "Update coupon";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderList() {
  if (!coupons.length) {
    list.innerHTML = '<p class="empty-state">No coupons saved yet.</p>';
    return;
  }

  list.innerHTML = coupons.map((coupon) => `
    <article class="admin-item">
      <div>
        <p class="store-name">${escapeHtml(coupon.store)}</p>
        <h3>${escapeHtml(coupon.title)}</h3>
        <p class="meta">${escapeHtml(coupon.category)} - ${escapeHtml(coupon.code)} - ${coupon.active ? "Active" : "Hidden"}</p>
      </div>
      <div class="admin-actions">
        <button class="secondary-button" type="button" data-edit="${escapeHtml(coupon.id)}">Edit</button>
        <button class="danger-button" type="button" data-delete="${escapeHtml(coupon.id)}">Delete</button>
      </div>
    </article>
  `).join("");
}

function renderClickStats() {
  totalClicks.textContent = String(clicks.length);

  const storeTotals = clicks.reduce((totals, click) => {
    totals[click.storeName] = (totals[click.storeName] || 0) + 1;
    return totals;
  }, {});
  const leadingStore = Object.entries(storeTotals).sort((left, right) => right[1] - left[1])[0];
  topClickedStore.textContent = leadingStore ? `${leadingStore[0]} (${leadingStore[1]})` : "-";

  clickList.innerHTML = clicks.length
    ? clicks.slice(0, 10).map((click) => `
      <article class="click-item">
        <div>
          <strong>${escapeHtml(click.storeName)}</strong>
          <span>${escapeHtml(click.couponTitle)} - ${escapeHtml(click.couponCode || "OFFER")}</span>
        </div>
        <time datetime="${escapeHtml(click.clickedAt)}">${escapeHtml(new Date(click.clickedAt).toLocaleString())}</time>
      </article>
    `).join("")
    : '<p class="empty-state">No coupon clicks recorded yet.</p>';
}

async function loadCoupons() {
  const response = await adminFetch("/api/coupons");
  coupons = await response.json();
  renderList();
}

async function loadClicks() {
  const response = await adminFetch("/api/clicks");
  clicks = await response.json();
  renderClickStats();
}

async function loadStores() {
  const response = await fetch("/api/stores");
  stores = await response.json();
  renderStoreOptions();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const id = form.elements.id.value;
  const response = await adminFetch(id ? `/api/coupons/${id}` : "/api/coupons", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formPayload())
  });

  const result = await response.json();
  if (!response.ok) {
    setStatus(result.error || "Could not save coupon.");
    return;
  }

  resetForm();
  await Promise.all([loadCoupons(), loadClicks()]);
  setStatus("Saved.");
});

list.addEventListener("click", async (event) => {
  const editId = event.target.closest("[data-edit]")?.dataset.edit;
  const deleteId = event.target.closest("[data-delete]")?.dataset.delete;

  if (editId) {
    const coupon = coupons.find((item) => item.id === editId);
    if (coupon) editCoupon(coupon);
  }

  if (deleteId) {
    const response = await adminFetch(`/api/coupons/${deleteId}`, { method: "DELETE" });
    if (response.ok) {
      await loadCoupons();
      setStatus("Deleted.");
    }
  }
});

resetButton.addEventListener("click", resetForm);
refreshButton.addEventListener("click", loadCoupons);
refreshClicksButton.addEventListener("click", loadClicks);
storeTemplate.addEventListener("change", () => useOfficialStore(storeTemplate.value));

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginStatus.textContent = "Signing in...";

  try {
    const response = await fetch("/api/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: loginForm.elements.password.value })
    });
    const result = await response.json();

    if (!response.ok) {
      loginStatus.textContent = result.error || "Login failed.";
      return;
    }

    localStorage.setItem(sessionKey, result.token);
    loginForm.reset();
    showAdmin();
    await Promise.all([loadCoupons(), loadStores(), loadClicks()]);
  } catch {
    loginStatus.textContent = "Unable to reach the server.";
  }
});

logoutButton.addEventListener("click", async () => {
  await adminFetch("/api/admin-logout", { method: "POST" }).catch(() => {});
  showLogin("You have been logged out.");
});

async function initializeAdmin() {
  if (!token()) {
    showLogin();
    return;
  }

  try {
    const response = await adminFetch("/api/admin-session");
    if (!response.ok) throw new Error("Session unavailable.");
    showAdmin();
    await Promise.all([loadCoupons(), loadStores(), loadClicks()]);
  } catch {
    showLogin("Please sign in to continue.");
  }
}

initializeAdmin().catch(() => {
  showLogin("Unable to reach the server.");
});
