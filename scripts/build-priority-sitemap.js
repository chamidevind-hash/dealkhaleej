const fs = require("fs");
const path = require("path");
const {
  root,
  auditCurrentSitemap,
  selectPriorityUrls,
  writeReports
} = require("./crawl-priority-lib");

auditCurrentSitemap({ fullSitemap: true })
  .then((report) => {
    const selectedUrls = selectPriorityUrls(report);
    const selectedSet = new Set(selectedUrls);
    const removedFromSitemap = report.urls
      .filter((row) => !selectedSet.has(row.url))
      .map((row) => row.url);
    const manifest = {
      generatedAt: new Date().toISOString(),
      purpose: "Initial crawl-priority sitemap for Google-discovered but uncrawled URLs.",
      targetUrlCount: selectedUrls.length,
      paths: selectedUrls.map((url) => new URL(url).pathname),
      notes: [
        "Priority B and C articles remain in data/articles.json.",
        "Removed URLs are temporarily excluded from sitemap until content or internal-link strength improves.",
        "No /go/ URLs, query country variants, redirects, malformed legacy slugs, noindex pages, or 404 pages are selected."
      ]
    };

    report.selectedPrioritySitemapUrls = selectedUrls;
    report.removedFromSitemap = removedFromSitemap;
    writeReports(report);
    fs.writeFileSync(path.join(root, "data", "priority-sitemap.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Priority sitemap built: ${selectedUrls.length} URLs selected, ${removedFromSitemap.length} URLs removed temporarily.`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
