"use strict";

/**
 * Public API surface of the Light Host core engine. A future Tauri UI (or
 * anything else) should only ever import from here, not reach into
 * individual manager modules directly — keeps the UI decoupled from
 * internal refactors.
 */

const siteManager = require("./siteManager");
const dbManager = require("./dbManager");
const nginxManager = require("./nginxManager");
const phpManager = require("./phpManager");
const exportManager = require("./exportManager");
const registry = require("./registry");
const config = require("./config");

async function startEngine() {
  dbManager.start();
  nginxManager.start();
  // PHP-FPM pools are started per-site in siteManager, not globally,
  // since idle sites shouldn't consume RAM.
}

function stopEngine() {
  phpManager.stopAll();
  nginxManager.stop();
  dbManager.stop();
}

module.exports = {
  startEngine,
  stopEngine,
  sites: siteManager,
  db: dbManager,
  exportSite: exportManager.exportSiteForLiveServer,
  registry,
  config,
};
