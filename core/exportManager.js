"use strict";

/**
 * This module is the payoff for choosing MariaDB/MySQL and WP-CLI: since
 * both are exactly what real hosts run, "transfer to live server" is just
 * (1) a clean file zip, (2) a search-replaced SQL dump, (3) optionally an
 * SFTP push — no format translation needed.
 */

const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { PATHS } = require("./config");
const db = require("./dbManager");
const wp = require("./wpManager");

/** Zips the site's WordPress folder, excluding local-only cruft. */
function zipSiteFiles(site, outFilePath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outFilePath), { recursive: true });
    const output = fs.createWriteStream(outFilePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(outFilePath));
    archive.on("error", reject);
    archive.pipe(output);

    const siteRoot = path.join(PATHS.sites, site.name);
    archive.glob("**/*", {
      cwd: siteRoot,
      dot: true,
      ignore: [
        "wp-content/debug.log",
        "wp-content/cache/**",
        ".git/**",
      ],
    });
    archive.finalize();
  });
}

/**
 * Full export flow:
 *  1. Dump the local DB
 *  2. Search-replace the local domain -> the production domain the user
 *     provides, directly in a throwaway copy of the DB dump's target site
 *     (we run search-replace against the live local DB is riskier, so we
 *     do the safer thing: run it locally against a *temporary* duplicate).
 *  3. Zip the WordPress files
 *
 * For v1 simplicity we run search-replace directly on the local dev DB
 * before dumping (fine for local-only dev DBs — this is exactly what the
 * "prepare for launch" step is for), then dump.
 */
async function exportSiteForLiveServer(site, { productionUrl, outDir }) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const targetDir = outDir || path.join(PATHS.exports, `${site.name}-${timestamp}`);
  fs.mkdirSync(targetDir, { recursive: true });

  const localUrl = `http://${site.domain}`;

  // Step 1: rewrite URLs in place (serialization-safe via WP-CLI)
  await wp.searchReplaceUrl(site, localUrl, productionUrl);

  // Step 2: dump the now-production-ready database
  const sqlPath = path.join(targetDir, `${site.name}.sql`);
  db.exportDatabase(site.dbName, sqlPath);

  // Step 3: revert the local site back to its local URL so local dev
  // continues to work after export (export shouldn't break the dev copy).
  await wp.searchReplaceUrl(site, productionUrl, localUrl);

  // Step 4: zip the WordPress files (unaffected by the URL swap above,
  // since the URL lives in the DB, not the files, for a stock WP install)
  const zipPath = path.join(targetDir, `${site.name}-files.zip`);
  await zipSiteFiles(site, zipPath);

  // A short README so the user (or whoever they hand this to) knows what to do
  const instructions = `wp-light export for "${site.name}"
Generated: ${new Date().toISOString()}

Contents:
  - ${path.basename(zipPath)}   -> upload contents to your host's web root (e.g. public_html)
  - ${path.basename(sqlPath)}   -> import via phpMyAdmin or: mysql -u USER -p DBNAME < ${path.basename(sqlPath)}

Notes:
  - URLs in the database have already been rewritten from ${localUrl} to ${productionUrl}.
  - After importing, update wp-config.php on the host with the LIVE database
    credentials (DB_NAME, DB_USER, DB_PASSWORD, DB_HOST) — do not reuse the
    local dev credentials from this zip.
`;
  fs.writeFileSync(path.join(targetDir, "README.txt"), instructions, "utf8");

  return { targetDir, sqlPath, zipPath };
}

module.exports = { zipSiteFiles, exportSiteForLiveServer };
