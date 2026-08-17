"use strict";

/**
 * Central configuration for wp-light.
 *
 * Design goal: everything the app needs lives under one root folder so
 * uninstalling is "delete the folder" and nothing pollutes the OS beyond
 * the hosts file entries and (on first run) a couple of firewall rules.
 *
 * Folder layout under APP_ROOT:
 *   /binaries/php/{version}/     portable PHP + php-fpm builds
 *   /binaries/nginx/             portable nginx build
 *   /binaries/mariadb/           portable MariaDB build
 *   /binaries/wp-cli/            wp-cli.phar
 *   /binaries/mkcert/            mkcert.exe (local SSL certs)
 *   /sites/{siteName}/           each site's WordPress files (wp-content, etc.)
 *   /data/mysql/                 MariaDB data directory (all DBs live here)
 *   /data/nginx-conf/            generated per-site nginx server blocks
 *   /data/logs/                  php-fpm, nginx, mariadb logs
 *   /data/registry.json          the site registry (source of truth for the app)
 */

const path = require("path");
const os = require("os");

const IS_WINDOWS = process.platform === "win32";

// Root install directory. On Windows this defaults to a folder next to the
// executable / repo checkout so nothing is scattered across the system.
const APP_ROOT = process.env.WPLIGHT_ROOT || path.resolve(__dirname, "..");

const PATHS = {
  root: APP_ROOT,
  binaries: path.join(APP_ROOT, "binaries"),
  php: path.join(APP_ROOT, "binaries", "php"),
  nginx: path.join(APP_ROOT, "binaries", "nginx"),
  mariadb: path.join(APP_ROOT, "binaries", "mariadb"),
  wpcli: path.join(APP_ROOT, "binaries", "wp-cli", "wp-cli.phar"),
  mkcert: path.join(APP_ROOT, "binaries", "mkcert"),

  sites: path.join(APP_ROOT, "sites"),
  data: path.join(APP_ROOT, "data"),
  mysqlData: path.join(APP_ROOT, "data", "mysql"),
  nginxConf: path.join(APP_ROOT, "data", "nginx-conf"),
  logs: path.join(APP_ROOT, "data", "logs"),
  registry: path.join(APP_ROOT, "data", "registry.json"),
  exports: path.join(APP_ROOT, "data", "exports"),

  // Windows hosts file location
  hostsFile: IS_WINDOWS
    ? path.join(process.env.WINDIR || "C:\\Windows", "System32", "drivers", "etc", "hosts")
    : "/etc/hosts",
};

const DEFAULTS = {
  tld: "test", // sites are created as {name}.test
  httpPort: 80,
  httpsPort: 443,
  mysqlPort: 3306, // single shared MariaDB instance, one DB per site
  phpVersion: "8.3", // default PHP version bundled first
  supportedPhpVersions: ["8.1", "8.3"], // keep this list short on purpose (lightweight!)
  wpLocale: "en_US",
  adminUser: "admin",
  adminPassword: "admin", // local-only, never used in production
  adminEmail: "admin@local.test",
};

const MARKERS = {
  // Used to safely find/remove wp-light's own block in the hosts file
  hostsStart: "# >>> wp-light managed entries >>>",
  hostsEnd: "# <<< wp-light managed entries <<<",
};

module.exports = { IS_WINDOWS, PATHS, DEFAULTS, MARKERS, os };
