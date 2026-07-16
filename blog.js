const articleGrid = document.querySelector("#article-grid");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-SA", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function articleCard(article) {
  return `
    <article class="article-card">
      <time datetime="${escapeHtml(article.publishedAt)}">${escapeHtml(formatDate(article.publishedAt))}</time>
      <h2><a href="/blog/${encodeURIComponent(article.slug)}">${escapeHtml(article.title)}</a></h2>
      <p>${escapeHtml(article.excerpt)}</p>
      <a class="article-link" href="/blog/${encodeURIComponent(article.slug)}">Read article</a>
    </article>
  `;
}

function apiUrl(path) {
  return window.DealKhaleejCountryApiUrl ? window.DealKhaleejCountryApiUrl(path) : path;
}

async function loadArticles() {
  try {
    const response = await fetch(apiUrl("/api/articles"));
    if (!response.ok) throw new Error("Unable to load articles");
    const articles = await response.json();
    articleGrid.innerHTML = articles.length
      ? articles.map(articleCard).join("")
      : '<p class="empty-state">No articles have been published yet.</p>';
  } catch {
    articleGrid.innerHTML = '<p class="empty-state">Articles are unavailable right now.</p>';
  }
}

loadArticles();
