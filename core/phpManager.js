"use strict";

/**
 * Manages PHP-FPM processes. To stay lightweight, we do NOT run every site's
 * PHP-FPM pool all the time — pools are spawned when a site is started and
 * stopped when the site (or the whole app) is stopped. Each pool listens on
 * its own TCP port on 127.0.0.1, recorded in the site's registry entry as
 * `phpFpmPort`.
 *
 * Port allocation: starts at 9000 and increments per site, avoiding
 * collisions with anything already recorded in the registry.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { PATHS, IS_WINDOWS } = require("./config");
const { listSites } = require("./registry");

const BASE_FPM_PORT = 9000;
const running = new Map(); // siteName -> child process

function phpBinDir(version) {
  return path.join(PATHS.php, version);
}

function phpFpmBin(version) {
  return path.join(phpBinDir(version), IS_WINDOWS ? "php-cgi.exe" : "php-fpm");
}

function phpCliBin(version) {
  return path.join(phpBinDir(version), IS_WINDOWS ? "php.exe" : "php");
}

/** Finds the next free FPM port not already claimed by another registered site. */
function allocatePort() {
  const used = new Set(listSites().map((s) => s.phpFpmPort).filter(Boolean));
  let port = BASE_FPM_PORT;
  while (used.has(port)) port++;
  return port;
}

/**
 * Writes a minimal php-fpm pool config for the given site. Kept intentionally
 * small: modest process limits since these are single-developer local sites,
 * not production servers.
 */
function writePoolConfig(site) {
  const confDir = path.join(PATHS.data, "php-pools");
  fs.mkdirSync(confDir, { recursive: true });
  const confPath = path.join(confDir, `${site.name}.conf`);
  const conf = `
[${site.name}]
listen = 127.0.0.1:${site.phpFpmPort}
pm = dynamic
pm.max_children = 4
pm.start_servers = 1
pm.min_spare_servers = 1
pm.max_spare_servers = 2
php_admin_value[error_log] = "${path.join(PATHS.logs, site.name + "-php.log").replace(/\\/g, "/")}"
php_admin_flag[log_errors] = on
`;
  fs.writeFileSync(confPath, conf, "utf8");
  return confPath;
}

function startSitePhp(site) {
  if (running.has(site.name)) return running.get(site.name);
  const confPath = writePoolConfig(site);
  const bin = phpFpmBin(site.phpVersion);
  const child = spawn(bin, ["--fpm-config", confPath, "--nodaemonize"], {
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("exit", () => running.delete(site.name));
  running.set(site.name, child);
  return child;
}

function stopSitePhp(siteName) {
  const child = running.get(siteName);
  if (child) {
    child.kill();
    running.delete(siteName);
  }
}

function stopAll() {
  for (const name of running.keys()) stopSitePhp(name);
}

/** Runs a one-off PHP CLI command (used heavily by wpManager for WP-CLI calls). */
function runCli(phpVersion, args, options = {}) {
  return new Promise((resolve, reject) => {
    const bin = phpCliBin(phpVersion);
    const child = spawn(bin, args, {
      windowsHide: true,
      cwd: options.cwd,
      env: options.env || process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`PHP CLI exited ${code}: ${stderr || stdout}`));
    });
  });
}

module.exports = {
  allocatePort,
  startSitePhp,
  stopSitePhp,
  stopAll,
  runCli,
  phpCliBin,
};
