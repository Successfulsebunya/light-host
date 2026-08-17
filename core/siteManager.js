"use strict";

const fs = require("fs");
const path = require("path");
const { PATHS, DEFAULTS } = require("./config");
const registry = require("./registry");
const hosts = require("./hostsManager");
const nginx = require("./nginxManager");
const php = require("./phpManager");
const db = require("./dbManager");
const wp = require("./wpManager");

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Creates a brand new local WordPress site end-to-end:
 *   registry entry -> hosts file -> DB + user -> WP core download/install
 *   -> nginx server block -> PHP-FPM pool started
 */
async function createSite(rawName, { phpVersion = DEFAULTS.phpVersion } = {}) {
  const name = slugify(rawName);
  if (!name) throw new Error("Invalid site name.");
  if (registry.getSite(name)) {
    throw new Error(`Site "${name}" already exists.`);
  }
  if (!DEFAULTS.supportedPhpVersions.includes(phpVersion)) {
    throw new Error(
      `PHP ${phpVersion} not bundled. Available: ${DEFAULTS.supportedPhpVersions.join(", ")}`
    );
  }

  const domain = `${name}.${DEFAULTS.tld}`;
  const phpFpmPort = php.allocatePort();

  // Reserve the site in the registry early so port allocation for the
  // *next* site doesn't collide, even if provisioning fails partway.
  const site = registry.addSite({
    name,
    domain,
    phpVersion,
    phpFpmPort,
    status: "provisioning",
    createdAt: new Date().toISOString(),
  });

  try {
    const { dbName, dbUser, dbPassword } = db.createSiteDatabase(name);
    registry.updateSite(name, { dbName, dbUser, dbPassword });
    const updatedSite = registry.getSite(name);

    await wp.provisionWordPress(updatedSite);

    hosts.addHost(domain);
    nginx.writeSiteConfig(updatedSite);
    php.startSitePhp(updatedSite);
    nginx.reload();

    registry.updateSite(name, { status: "running" });
    return registry.getSite(name);
  } catch (err) {
    registry.updateSite(name, { status: "error", lastError: err.message });
    throw err;
  }
}

function startSite(name) {
  const site = registry.getSite(name);
  if (!site) throw new Error(`Site "${name}" not found.`);
  php.startSitePhp(site);
  nginx.writeSiteConfig(site);
  nginx.reload();
  registry.updateSite(name, { status: "running" });
}

function stopSite(name) {
  const site = registry.getSite(name);
  if (!site) throw new Error(`Site "${name}" not found.`);
  php.stopSitePhp(name);
  registry.updateSite(name, { status: "stopped" });
}

async function deleteSite(name, { keepFiles = false } = {}) {
  const site = registry.getSite(name);
  if (!site) throw new Error(`Site "${name}" not found.`);

  php.stopSitePhp(name);
  nginx.removeSiteConfig(name);
  nginx.reload();
  hosts.removeHost(site.domain);
  db.dropSiteDatabase(name);

  if (!keepFiles) {
    const siteRoot = path.join(PATHS.sites, name);
    fs.rmSync(siteRoot, { recursive: true, force: true });
  }

  registry.removeSite(name);
}

function listSites() {
  return registry.listSites();
}

module.exports = { createSite, startSite, stopSite, deleteSite, listSites, slugify };
