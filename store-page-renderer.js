const CURRENT_YEAR = new Intl.DateTimeFormat("en", {
  year: "numeric",
  timeZone: "Asia/Riyadh"
}).format(new Date());

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function storeSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function isCodeOffer(coupon) {
  const code = String(coupon.code || "").trim();
  return Boolean(code && !["deal", "offer"].includes(code.toLowerCase()));
}

function assetPath(value) {
  const asset = String(value || "assets/logos/placeholder.png").trim();
  if (/^https?:\/\//i.test(asset) || asset.startsWith("/")) return asset;
  return `/${asset}`;
}

function absoluteUrl(siteUrl, value = "/") {
  if (/^https?:\/\//i.test(value)) return value;
  return `${siteUrl}${value.startsWith("/") ? value : `/${value}`}`;
}

function initials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-SA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Riyadh"
  }).format(date);
}

function isoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function newestCouponDate(coupons) {
  const dates = coupons
    .map((coupon) => new Date(coupon.updatedAt || coupon.expiry || ""))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (!dates.length) return "";
  return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString();
}

function detectRegion(text) {
  const value = String(text || "").toLowerCase();
  const regions = [];

  if (/\bgcc\b/.test(value)) regions.push("GCC");
  if (/global|worldwide|middle east/.test(value)) regions.push("Global");
  if (/saudi|ksa|riyadh|jeddah|dammam/.test(value)) regions.push("Saudi Arabia");
  if (/uae|dubai|abu dhabi/.test(value)) regions.push("UAE");
  if (/kuwait/.test(value)) regions.push("Kuwait");
  if (/qatar/.test(value)) regions.push("Qatar");
  if (/bahrain/.test(value)) regions.push("Bahrain");
  if (/oman/.test(value)) regions.push("Oman");

  const unique = [...new Set(regions)];
  if (unique.includes("GCC")) return unique.includes("Global") ? "GCC and global" : "GCC";
  if (unique.includes("Global") && unique.length === 1) return "Global";
  if (unique.length) return unique.slice(0, 4).join(", ");
  return "Availability varies by offer";
}

function couponRegion(coupon, store, content) {
  return detectRegion([
    content?.region || "",
    coupon.store,
    coupon.title,
    coupon.description,
    coupon.meta,
    coupon.keywords,
    store.description
  ].join(" "));
}

function storeRegion(store, coupons, content) {
  if (content?.region) return content.region;
  return detectRegion([
    store.name,
    store.description,
    store.category,
    ...coupons.flatMap((coupon) => [coupon.title, coupon.meta, coupon.keywords])
  ].join(" "));
}

function couponScore(coupon) {
  const text = `${coupon.title || ""} ${coupon.meta || ""} ${coupon.description || ""}`.toLowerCase();
  const numbers = [...text.matchAll(/(?:sar|aed|usd)?\s*(\d+(?:\.\d+)?)(?:\s*%|\s*off|\s*coupon|\s*bundle)?/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
  const strongestNumber = numbers.length ? Math.max(...numbers) : 0;
  return strongestNumber + (isCodeOffer(coupon) ? 20 : 0) + (coupon.verified ? 10 : 0);
}

function bestOffer(coupons) {
  return [...coupons].sort((left, right) => {
    const scoreDelta = couponScore(right) - couponScore(left);
    if (scoreDelta) return scoreDelta;
    return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
  })[0];
}

function favoriteButton(coupon) {
  return `
    <button class="favorite-button" type="button" data-favorite-id="${escapeHtml(coupon.id)}" data-coupon-title="${escapeHtml(coupon.title)}" aria-label="Save ${escapeHtml(coupon.title)} to favorites" aria-pressed="false">
      <span aria-hidden="true">&#9825;</span>
    </button>
  `;
}

function actionMarkup(coupon, featured = false) {
  const code = String(coupon.code || "").trim();
  if (isCodeOffer(coupon)) {
    return `
      <div class="store-code-box">
        <span>${escapeHtml(code)}</span>
        <button type="button" data-copy="${escapeHtml(code)}" data-coupon-id="${escapeHtml(coupon.id)}" data-store="${escapeHtml(coupon.store)}" data-code="${escapeHtml(code)}" data-title="${escapeHtml(coupon.title)}">Copy Code</button>
      </div>
      <a class="shop-deal-button${featured ? " featured-action" : ""}" href="/go/${encodeURIComponent(coupon.id)}">Shop Deal</a>
    `;
  }

  return `<a class="shop-deal-button${featured ? " featured-action" : ""}" href="/go/${encodeURIComponent(coupon.id)}">Get Offer</a>`;
}

function couponCard(coupon, store, content) {
  const region = couponRegion(coupon, store, content);
  const description = coupon.description || coupon.meta || "Review this offer on DealKhaleej, then confirm eligibility with the store before checkout.";
  return `
    <article class="store-offer-card coupon-card" data-coupon-id="${escapeHtml(coupon.id)}">
      <div class="logo-tile">
        <img src="${escapeHtml(assetPath(coupon.logo || store.logo))}" alt="${escapeHtml(coupon.store)} logo">
        <span>${escapeHtml(initials(coupon.store))}</span>
      </div>
      <div class="coupon-details">
        <div class="coupon-store-row">
          <p class="store-name">${escapeHtml(coupon.store)}</p>
          ${favoriteButton(coupon)}
        </div>
        <div class="coupon-badges">
          <span class="${coupon.verified ? "verified-badge" : "coupon-region"}">${coupon.verified ? "Verified" : "Active"}</span>
          <span class="coupon-region">Region: ${escapeHtml(region)}</span>
        </div>
        <h3>${escapeHtml(coupon.title)}</h3>
        <p class="meta">${escapeHtml(description)}</p>
        ${coupon.expiry ? `<p class="expiry">Ends: ${escapeHtml(coupon.expiry)}</p>` : ""}
      </div>
      <div class="${isCodeOffer(coupon) ? "coupon-action store-offer-action" : "coupon-action muted link-only store-offer-action"}">
        ${actionMarkup(coupon)}
      </div>
    </article>
  `;
}

function featuredOfferMarkup(coupon, store, content) {
  if (!coupon) {
    return `
      <section class="store-panel best-offer-panel">
        <p class="eyebrow">Best available offer</p>
        <h2>No active offers listed yet</h2>
        <p>DealKhaleej does not currently show an active offer for this store. Browse similar stores below or check back later.</p>
      </section>
    `;
  }

  const description = coupon.description || coupon.meta || "Open this offer through DealKhaleej, then confirm the final terms with the merchant before checkout.";
  return `
    <section class="store-panel best-offer-panel">
      <div>
        <p class="eyebrow">Best available offer</p>
        <h2>${escapeHtml(coupon.title)}</h2>
        <div class="coupon-badges">
          ${coupon.verified ? '<span class="verified-badge">Verified</span>' : '<span class="coupon-region">Active</span>'}
          <span class="coupon-region">Region: ${escapeHtml(couponRegion(coupon, store, content))}</span>
          ${coupon.expiry ? `<span class="coupon-region">Expires: ${escapeHtml(coupon.expiry)}</span>` : ""}
        </div>
        <p>${escapeHtml(description)}</p>
      </div>
      <div class="${isCodeOffer(coupon) ? "best-offer-actions" : "best-offer-actions offer-only"}">
        ${actionMarkup(coupon, true)}
      </div>
    </section>
  `;
}

function summaryTable(coupons, store, content) {
  if (!coupons.length) return "";
  return `
    <section class="store-panel">
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">Coupon summary</p>
          <h2>${escapeHtml(store.name)} offer details</h2>
        </div>
      </div>
      <div class="store-table-wrap">
        <table class="store-summary-table">
          <thead>
            <tr>
              <th>Offer</th>
              <th>Coupon code</th>
              <th>Discount or benefit</th>
              <th>Region</th>
              <th>Expiry</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${coupons.map((coupon) => `
              <tr>
                <td>${escapeHtml(coupon.title)}</td>
                <td>${isCodeOffer(coupon) ? escapeHtml(coupon.code) : "No code required"}</td>
                <td>${escapeHtml(coupon.title)}</td>
                <td>${escapeHtml(couponRegion(coupon, store, content))}</td>
                <td>${coupon.expiry ? escapeHtml(coupon.expiry) : "Not listed"}</td>
                <td>${coupon.verified ? "Verified" : "Active"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function howToUseMarkup(hasCodeOffers, hasOfferOnly) {
  return `
    <section class="store-panel store-how-to">
      <p class="eyebrow">How to use a coupon</p>
      <h2>How to use these offers</h2>
      <ol class="store-steps">
        <li><span>1</span><p>Choose an offer that matches the store, country, and products you want to buy.</p></li>
        <li><span>2</span><p>${hasCodeOffers ? "Copy the code when a code is provided." : "Use Get Offer when no coupon code is provided."}</p></li>
        <li><span>3</span><p>Open the store through DealKhaleej using the Shop Deal or Get Offer button.</p></li>
        <li><span>4</span><p>Add eligible items on the store website or app.</p></li>
        <li><span>5</span><p>${hasCodeOffers ? "Enter the code at checkout when a promo code field is available." : "Continue through the linked store page and follow the merchant checkout flow."}</p></li>
        <li><span>6</span><p>Confirm the discount, promotion, or final price before payment.</p></li>
      </ol>
      ${hasOfferOnly ? "<p class=\"store-note\">For no-code offers, DealKhaleej shows only a Get Offer button. The merchant page controls final availability and checkout terms.</p>" : ""}
    </section>
  `;
}

function seoSections(store, coupons, content, region) {
  const fallbackIntro = `${store.name} is listed on DealKhaleej in the ${store.category} category. This page uses current store and coupon data to help shoppers review available offers before checkout.`;
  const tips = content?.shoppingTips?.length ? content.shoppingTips : [
    "Check the offer title, coupon code, expiry date, and region before using it.",
    "Open the store through DealKhaleej so the offer link is tracked correctly.",
    "Confirm the final price and merchant terms before payment."
  ];

  return `
    <section class="store-seo-grid">
      <article class="store-panel">
        <p class="eyebrow">About the store</p>
        <h2>About ${escapeHtml(store.name)}</h2>
        <p>${escapeHtml(content?.about || store.description || fallbackIntro)}</p>
      </article>
      <article class="store-panel">
        <p class="eyebrow">What it sells</p>
        <h2>What ${escapeHtml(store.name)} offers</h2>
        <p>${escapeHtml(content?.whatSells || `${store.name} is categorized as ${store.category} on DealKhaleej. Review the offer cards on this page for current titles and details.`)}</p>
      </article>
      <article class="store-panel">
        <p class="eyebrow">Who it suits</p>
        <h2>Who these offers are suitable for</h2>
        <p>${escapeHtml(content?.suitableFor || `These offers are suitable for shoppers comparing ${store.category} deals in supported GCC or global regions.`)}</p>
      </article>
      <article class="store-panel">
        <p class="eyebrow">Regions</p>
        <h2>Countries and availability</h2>
        <p>${escapeHtml(content?.regions || `${region}. Availability can vary by individual offer, merchant page, account, products, and checkout country.`)}</p>
      </article>
      <article class="store-panel">
        <p class="eyebrow">Eligibility</p>
        <h2>How to check coupon eligibility</h2>
        <p>${escapeHtml(content?.eligibility || "Open the offer, review merchant terms, check cart eligibility, and confirm the final price before payment.")}</p>
      </article>
      <article class="store-panel">
        <p class="eyebrow">Troubleshooting</p>
        <h2>Common reasons a code may not work</h2>
        <p>A code may not apply if it has expired, the cart does not meet the merchant terms, the offer is limited to a specific region or account type, or the store has changed the promotion. DealKhaleej only shows the data available in the coupon record, so always verify before checkout.</p>
      </article>
    </section>
    <section class="store-panel">
      <p class="eyebrow">Shopping tips</p>
      <h2>Before you checkout</h2>
      <ul class="store-tip-list">
        ${tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function generatedFaqs(store, coupons, content, region) {
  const codeOffers = coupons.filter(isCodeOffer);
  const offerOnly = coupons.filter((coupon) => !isCodeOffer(coupon));
  const latestCode = codeOffers[0];
  const faqs = [
    {
      question: `What is the latest ${store.name} coupon code?`,
      answer: latestCode
        ? `The current code shown on DealKhaleej is ${latestCode.code} for "${latestCode.title}". Check the offer card and merchant checkout before payment.`
        : `DealKhaleej does not currently list a public coupon code for ${store.name}. Use the Get Offer button for current no-code offers when available.`
    },
    {
      question: `How do I use a ${store.name} coupon?`,
      answer: latestCode
        ? `Choose the offer, copy the code, open ${store.name} through DealKhaleej, add eligible items, enter the code at checkout, and confirm the discount before payment.`
        : `Choose a no-code offer, click Get Offer, complete the purchase through the linked store page, and confirm the final price before payment.`
    },
    {
      question: `Why is my ${store.name} coupon not working?`,
      answer: "The code may be expired, region-limited, product-limited, account-limited, or changed by the merchant. Check the expiry date and merchant checkout terms."
    },
    {
      question: `Can existing customers use the ${store.name} offer?`,
      answer: "DealKhaleej only marks customer restrictions when they are present in the coupon title or description. If no restriction is shown, confirm eligibility on the merchant page before checkout."
    },
    {
      question: `Are app-only ${store.name} offers available?`,
      answer: "DealKhaleej does not label an offer as app-only unless that requirement appears in the offer data. Check the merchant page for app or account requirements."
    },
    {
      question: `Does the ${store.name} offer work in Saudi Arabia or UAE?`,
      answer: `The listed availability is: ${region}. Individual offers can still vary by country, account, cart, and merchant checkout rules.`
    }
  ];

  if (offerOnly.length) {
    faqs.push({
      question: `Do I need a code for every ${store.name} offer?`,
      answer: "No. Some DealKhaleej listings are no-code offers. Those cards show only a Get Offer button and do not display a coupon box."
    });
  }

  if (content?.faq?.length) {
    faqs.push(...content.faq);
  }

  return faqs.slice(0, 8);
}

function faqMarkup(faqs) {
  return `
    <section class="store-panel">
      <p class="eyebrow">FAQ</p>
      <h2>Frequently asked questions</h2>
      <div class="store-faq-list">
        ${faqs.map((faq) => `
          <details>
            <summary>${escapeHtml(faq.question)}</summary>
            <p>${escapeHtml(faq.answer)}</p>
          </details>
        `).join("")}
      </div>
    </section>
  `;
}

function relatedArticlesMarkup(store, articles, content) {
  const preferred = new Set(content?.relatedArticleSlugs || []);
  const slug = storeSlug(store.name);
  const related = articles
    .map((article) => {
      const relatedStores = Array.isArray(article.relatedStores) ? article.relatedStores : [];
      const matchesStore = relatedStores.some((item) => storeSlug(item.slug || item.name) === slug || String(item.name || "").toLowerCase() === store.name.toLowerCase());
      const text = `${article.title || ""} ${article.excerpt || ""} ${article.metaDescription || ""}`.toLowerCase();
      let score = 0;
      if (preferred.has(article.slug)) score += 100;
      if (matchesStore) score += 60;
      if (text.includes(store.name.toLowerCase())) score += 35;
      if (text.includes(String(store.category || "").toLowerCase())) score += 12;
      return { article, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.article.title.localeCompare(right.article.title))
    .slice(0, 6)
    .map((item) => item.article);

  if (!related.length) return "";

  return `
    <section class="store-panel">
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">Related shopping guides</p>
          <h2>Learn more before you shop</h2>
        </div>
      </div>
      <div class="store-article-grid">
        ${related.map((article) => `
          <article class="store-article-card">
            <time datetime="${escapeHtml(article.publishedAt || "")}">${escapeHtml(formatDate(article.publishedAt) || article.publishedAt || "")}</time>
            <h3><a href="/blog/${encodeURIComponent(article.slug)}">${escapeHtml(article.title)}</a></h3>
            <p>${escapeHtml(article.excerpt || article.metaDescription || "")}</p>
            <a class="article-link" href="/blog/${encodeURIComponent(article.slug)}">Read guide</a>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function similarStoresMarkup(store, stores) {
  const related = stores
    .filter((item) => item.name !== store.name && String(item.category || "").toLowerCase() === String(store.category || "").toLowerCase())
    .slice(0, 6);

  if (!related.length) return "";

  return `
    <section class="store-panel">
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">Similar stores</p>
          <h2>More ${escapeHtml(store.category)} stores</h2>
        </div>
      </div>
      <div class="similar-store-grid">
        ${related.map((item) => `
          <article class="similar-store-card">
            <span class="logo-tile small">
              <img src="${escapeHtml(assetPath(item.logo))}" alt="${escapeHtml(item.name)} logo">
              <strong>${escapeHtml(initials(item.name))}</strong>
            </span>
            <div>
              <h3>${escapeHtml(item.name)}</h3>
              <p>${escapeHtml(item.category || "Store")}</p>
            </div>
            <a class="secondary-button" href="/store/${storeSlug(item.name)}">View Offers</a>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function detailsPanel(store, coupons, region, lastUpdated, featured) {
  const hasCodeOffers = coupons.some(isCodeOffer);
  const hasOfferOnly = coupons.some((coupon) => !isCodeOffer(coupon));

  return `
    <aside class="store-details-panel">
      <p class="eyebrow">Store details</p>
      <dl>
        <div><dt>Category</dt><dd>${escapeHtml(store.category || "Store")}</dd></div>
        <div><dt>Supported region</dt><dd>${escapeHtml(region)}</dd></div>
        <div><dt>Shopping link</dt><dd>${featured ? `<a href="/go/${encodeURIComponent(featured.id)}">Open through DealKhaleej</a>` : "Not listed"}</dd></div>
        <div><dt>Active offers</dt><dd>${coupons.length}</dd></div>
        <div><dt>Last updated</dt><dd>${lastUpdated ? escapeHtml(formatDate(lastUpdated)) : "Not available"}</dd></div>
        <div><dt>Code deals</dt><dd>${hasCodeOffers ? "Available" : "Not listed"}</dd></div>
        <div><dt>No-code deals</dt><dd>${hasOfferOnly ? "Available" : "Not listed"}</dd></div>
      </dl>
    </aside>
  `;
}

function newsletterMarkup() {
  return `
    <section class="store-newsletter">
      <div>
        <p class="eyebrow">Deal alerts</p>
        <h2>Get new GCC coupon and travel deals by email.</h2>
        <p>Receive useful DealKhaleej updates when new shopping, travel, hotel, fashion, electronics, and lifestyle offers are added.</p>
      </div>
      <form class="newsletter-form store-newsletter-form" id="store-newsletter-form">
        <label for="store-newsletter-email">Email address</label>
        <div class="newsletter-controls">
          <input id="store-newsletter-email" name="email" type="email" placeholder="you@email.com" autocomplete="email" required>
          <button class="primary-button" type="submit">Subscribe</button>
        </div>
        <p class="newsletter-status" id="store-newsletter-status" role="status" aria-live="polite"></p>
      </form>
    </section>
  `;
}

function trackingSnippets() {
  return `
  <script type="text/javascript">(function(i,m,p,a,c,t){c.ire_o=p;c[p]=c[p]||function(){(c[p].a=c[p].a||[]).push(arguments)};t=a.createElement(m);var z=a.getElementsByTagName(m)[0];t.async=1;t.src=i;z.parentNode.insertBefore(t,z)})('https://utt.impactcdn.com/P-A7359435-89b6-4416-b05e-1e7dae20bbd91.js','script','impactStat',document,window);impactStat('transformLinks');impactStat('trackImpression');</script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-XW886N4BQ8"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-XW886N4BQ8');
  </script>
  <script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
  <script nowprocket data-noptimize="1" data-cfasync="false" data-wpfc-render="false" seraph-accel-crit="1" data-no-defer="1">
    (function () {
        var script = document.createElement("script");
        script.async = 1;
        script.src = 'https://emrldco.com/NTQzNDc5.js?t=543479';
        document.head.appendChild(script);
    })();
  </script>`;
}

function structuredData(siteUrl, store, coupons, content, faqs, region) {
  const pageUrl = `${siteUrl}/store/${storeSlug(store.name)}`;
  const logo = absoluteUrl(siteUrl, assetPath(store.logo));
  const graph = [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "All Stores", item: `${siteUrl}/#stores` },
        { "@type": "ListItem", position: 3, name: store.name, item: pageUrl }
      ]
    },
    {
      "@type": "Organization",
      name: store.name,
      url: pageUrl,
      logo
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer
        }
      }))
    }
  ];

  const offerItems = coupons.map((coupon) => {
    const offer = {
      "@type": "Offer",
      name: coupon.title,
      url: `${siteUrl}/go/${encodeURIComponent(coupon.id)}`,
      seller: { "@type": "Organization", name: store.name },
      areaServed: region
    };
    const validThrough = isoDate(coupon.expiry);
    if (validThrough) offer.validThrough = validThrough;
    if (isCodeOffer(coupon)) offer.identifier = coupon.code;
    return offer;
  });

  if (offerItems.length) {
    graph.push({
      "@type": "ItemList",
      name: `${store.name} offers`,
      itemListElement: offerItems.map((offer, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: offer
      }))
    });
  }

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

function renderStorePage({ store, stores, coupons, articles, content, siteUrl }) {
  const activeCoupons = coupons
    .filter((coupon) => coupon.active && coupon.store.toLowerCase() === store.name.toLowerCase())
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
  const featured = bestOffer(activeCoupons);
  const remaining = featured ? activeCoupons.filter((coupon) => coupon.id !== featured.id) : activeCoupons;
  const region = storeRegion(store, activeCoupons, content);
  const lastUpdated = newestCouponDate(activeCoupons);
  const pageUrl = `${siteUrl}/store/${storeSlug(store.name)}`;
  const title = `${store.name} Coupon Codes and Deals for GCC Shoppers | DealKhaleej`;
  const description = `Browse verified ${store.name} offers for GCC shoppers. View current coupon codes, shopping deals, expiry details, and check terms before checkout.`;
  const h1 = `${store.name} Coupons, Deals and Offers for GCC Shoppers - ${CURRENT_YEAR}`;
  const intro = content?.intro || `${store.name} offers listed on DealKhaleej are organized for GCC shoppers who want to check current coupon data before checkout.`;
  const hasCodeOffers = activeCoupons.some(isCodeOffer);
  const hasOfferOnly = activeCoupons.some((coupon) => !isCodeOffer(coupon));
  const faqs = generatedFaqs(store, activeCoupons, content, region);
  const jsonLd = structuredData(siteUrl, store, activeCoupons, content, faqs, region);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="impact-site-verification" value="6904bed0-5dec-4860-9797-d9e558f0f45b">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(pageUrl)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:image" content="${escapeHtml(absoluteUrl(siteUrl, assetPath(store.logo)))}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(absoluteUrl(siteUrl, assetPath(store.logo)))}">
  ${trackingSnippets()}
  <script type="application/ld+json">${jsonLd}</script>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="site-header article-header">
    <a class="brand" href="/" aria-label="DealKhaleej home">
      <img class="brand-logo" src="/assets/brand/dealkhaleej-logo.png" alt="DealKhaleej">
    </a>
    <nav class="main-nav" aria-label="Primary navigation">
      <a href="/">Home</a>
      <a href="/#stores">Stores</a>
      <a href="/#deals">Coupons</a>
      <a href="/travel">Travel</a>
      <a href="/blog">Blog</a>
    </nav>
    <div class="header-actions">
      <a class="primary-button" href="/#deals">View Deals</a>
    </div>
  </header>

  <main class="store-landing-page">
    <nav class="store-breadcrumbs" aria-label="Breadcrumb">
      <a href="/">Home</a>
      <span aria-hidden="true">/</span>
      <a href="/#stores">All Stores</a>
      <span aria-hidden="true">/</span>
      <span>${escapeHtml(store.name)}</span>
    </nav>

    <section class="store-seo-hero">
      <div class="store-hero-main">
        <span class="logo-tile store-logo">
          <img src="${escapeHtml(assetPath(store.logo))}" alt="${escapeHtml(store.name)} logo">
          <span>${escapeHtml(initials(store.name))}</span>
        </span>
        <div>
          <p class="eyebrow">${escapeHtml(store.category || "Store")} offers</p>
          <h1>${escapeHtml(h1)}</h1>
          <p>${escapeHtml(intro)}</p>
          <div class="store-hero-meta">
            <span>${escapeHtml(region)}</span>
            <span>${escapeHtml(store.category || "Store")}</span>
            <span>${activeCoupons.length} ${activeCoupons.length === 1 ? "active offer" : "active offers"}</span>
            <span>Updated ${lastUpdated ? escapeHtml(formatDate(lastUpdated)) : "when offer data changes"}</span>
          </div>
        </div>
      </div>
      ${detailsPanel(store, activeCoupons, region, lastUpdated, featured)}
    </section>

    ${featuredOfferMarkup(featured, store, content)}

    <section class="store-panel store-coupons-panel">
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">Available coupons and offers</p>
          <h2>All ${escapeHtml(store.name)} offers</h2>
        </div>
      </div>
      <div class="store-coupon-grid">
        ${remaining.length
          ? remaining.map((coupon) => couponCard(coupon, store, content)).join("")
          : '<p class="empty-state">The highlighted offer above is the only active offer currently listed for this store.</p>'}
      </div>
    </section>

    ${summaryTable(activeCoupons, store, content)}
    ${howToUseMarkup(hasCodeOffers, hasOfferOnly)}
    ${seoSections(store, activeCoupons, content, region)}
    ${faqMarkup(faqs)}
    ${relatedArticlesMarkup(store, articles, content)}
    ${similarStoresMarkup(store, stores)}
    ${newsletterMarkup()}
  </main>

  <a class="telegram-float" href="https://t.me/dealkhaleej" target="_blank" rel="noopener noreferrer">
    Telegram Deals
  </a>
  <script src="/store.js"></script>
</body>
</html>`;
}

module.exports = {
  renderStorePage,
  storeSlug
};
