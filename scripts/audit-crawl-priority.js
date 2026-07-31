const { auditCurrentSitemap, writeReports } = require("./crawl-priority-lib");

auditCurrentSitemap()
  .then((report) => {
    writeReports(report);
    console.log(`Crawl priority audit complete: ${report.totals.urls} sitemap URLs audited.`);
    console.log(`Priority A: ${report.totals.priorityA}, B: ${report.totals.priorityB}, C: ${report.totals.priorityC}, D: ${report.totals.priorityD}.`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
