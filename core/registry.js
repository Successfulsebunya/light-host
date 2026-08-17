"use strict";

/**
 * The registry is a flat JSON file that tracks every site wp-light knows
 * about: its name, domain, DB name/credentials, PHP version, ports, and
 * status. Kept intentionally simple (no embedded DB) so it's easy to
 * inspect, back up, or hand-edit if something goes wrong.
 */

const fs = require("fs");
const path = require("path");
const { PATHS } = require("./config");

function ensureRegistryFile() {
  fs.mkdirSync(path.dirname(PATHS.registry), { recursive: true });
  if (!fs.existsSync(PATHS.registry)) {
    fs.writeFileSync(PATHS.registry, JSON.stringify({ sites: {} }, null, 2));
  }
}

function readRegistry() {
  ensureRegistryFile();
  const raw = fs.readFileSync(PATHS.registry, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Registry file at ${PATHS.registry} is corrupted: ${err.message}`
    );
  }
}

function writeRegistry(data) {
  ensureRegistryFile();
  fs.writeFileSync(PATHS.registry, JSON.stringify(data, null, 2));
}

function getSite(name) {
  const reg = readRegistry();
  return reg.sites[name] || null;
}

function listSites() {
  const reg = readRegistry();
  return Object.values(reg.sites);
}

function addSite(site) {
  const reg = readRegistry();
  if (reg.sites[site.name]) {
    throw new Error(`Site "${site.name}" already exists in registry.`);
  }
  reg.sites[site.name] = site;
  writeRegistry(reg);
  return site;
}

function updateSite(name, patch) {
  const reg = readRegistry();
  if (!reg.sites[name]) {
    throw new Error(`Site "${name}" not found in registry.`);
  }
  reg.sites[name] = { ...reg.sites[name], ...patch };
  writeRegistry(reg);
  return reg.sites[name];
}

function removeSite(name) {
  const reg = readRegistry();
  delete reg.sites[name];
  writeRegistry(reg);
}

module.exports = {
  readRegistry,
  writeRegistry,
  getSite,
  listSites,
  addSite,
  updateSite,
  removeSite,
};
