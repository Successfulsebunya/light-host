"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PATHS, DEFAULTS } = require("./config");
const { renderTemplate } = require("./renderTemplate");
const php = require("./phpManager");

const WP_CONFIG_TEMPLATE = path.join(
  __dirname, "..", "templates", "wp-config.php.template"
);

async function wpCli(site, args) {
  const siteRoot = path.join(PATHS.sites, site.name);
  return php.runCli(site.phpVersion, [PATHS.wpcli, ...args, `--path=${siteRoot}`], {
    cwd: siteRoot,
  });
}

function generateAuthSalts() {
  // Same 8 constants WordPress expects; random per-site for real security
  // even in local dev (some plugins/behavior depend on these being set).
  const keys = [
    "AUTH_KEY", "SECURE_AUTH_KEY", "LOGGED_IN_KEY", "NONCE_KEY",
    "AUTH_SALT", "SECURE_AUTH_SALT", "LOGGED_IN_SALT", "NONCE_SALT",
  ];
  return keys
    .map((k) => `define( '${k}', '${crypto.randomBytes(32).toString("hex")}' );`)
    .join("\n");
}

/**
 * Full provisioning flow for a new site:
 *  1. Create the site folder
 *  2. Download WordPress core via WP-CLI (cached after first download)
 *  3. Write wp-config.php from template with this site's DB credentials
 *  4. Run `wp core install` to set up the DB tables + admin user
 */
async function provisionWordPress(site) {
  const siteRoot = path.join(PATHS.sites, site.name);
  fs.mkdirSync(siteRoot, { recursive: true });

  await wpCli(site, ["core", "download", "--locale=" + DEFAULTS.wpLocale, "--force"]);

  const configContents = renderTemplate(WP_CONFIG_TEMPLATE, {
    DB_NAME: site.dbName,
    DB_USER: site.dbUser,
    DB_PASSWORD: site.dbPassword,
    MYSQL_PORT: String(DEFAULTS.mysqlPort),
    AUTH_KEYS_SALTS: generateAuthSalts(),
    SITE_NAME: site.name,
  });
  fs.writeFileSync(path.join(siteRoot, "wp-config.php"), configContents, "utf8");

  await wpCli(site, [
    "core", "install",
    `--url=http://${site.domain}`,
    `--title=${site.name}`,
    `--admin_user=${DEFAULTS.adminUser}`,
    `--admin_password=${DEFAULTS.adminPassword}`,
    `--admin_email=${DEFAULTS.adminEmail}`,
    "--skip-email",
  ]);

  return siteRoot;
}

/**
 * The key "easy transfer to live server" helper: rewrites all occurrences
 * of the local URL to the production URL, including inside PHP-serialized
 * data (post content, widget options, theme mods, etc.) which a naive
 * find-and-replace would corrupt. WP-CLI's search-replace handles the
 * serialization-safe rewriting for us.
 */
async function searchReplaceUrl(site, fromUrl, toUrl, { dryRun = false } = {}) {
  const args = ["search-replace", fromUrl, toUrl, "--all-tables"];
  if (dryRun) args.push("--dry-run");
  const { stdout } = await wpCli(site, args);
  return stdout;
}

module.exports = { wpCli, provisionWordPress, searchReplaceUrl, generateAuthSalts };
