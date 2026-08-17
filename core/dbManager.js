"use strict";

/**
 * Manages ONE shared MariaDB instance for the whole app (not one instance
 * per site — that would be heavy and pointless). Each site gets its own
 * database + dedicated DB user inside that shared instance, which is
 * exactly how most real WordPress hosts are set up — meaning DB dumps
 * produced here import cleanly on a live server with zero translation.
 *
 * MariaDB is wire- and dump-compatible with MySQL, so mysqldump-format
 * output works against MySQL-based hosts too.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");
const { PATHS, DEFAULTS, IS_WINDOWS } = require("./config");

const bin = (name) =>
  path.join(PATHS.mariadb, "bin", IS_WINDOWS ? `${name}.exe` : name);

let mysqldProcess = null;

function isDataDirInitialized() {
  return fs.existsSync(path.join(PATHS.mysqlData, "mysql"));
}

/** One-time initialization of the MariaDB data directory (like `mysql_install_db`). */
function initDataDir() {
  fs.mkdirSync(PATHS.mysqlData, { recursive: true });
  if (isDataDirInitialized()) return;
  const result = spawnSync(
    bin("mariadb-install-db"),
    [
      `--datadir=${PATHS.mysqlData}`,
      "--auth-root-authentication-method=normal",
    ],
    { stdio: "inherit", windowsHide: true }
  );
  if (result.status !== 0) {
    throw new Error("Failed to initialize MariaDB data directory.");
  }
}

function start() {
  if (mysqldProcess) return mysqldProcess;
  if (!isDataDirInitialized()) initDataDir();
  fs.mkdirSync(PATHS.logs, { recursive: true });

  mysqldProcess = spawn(
    bin("mysqld"),
    [
      `--datadir=${PATHS.mysqlData}`,
      `--port=${DEFAULTS.mysqlPort}`,
      "--bind-address=127.0.0.1",
      "--skip-networking=0",
      `--log-error=${path.join(PATHS.logs, "mariadb-error.log")}`,
      // Small footprint tuning — this is a dev tool, not a production DB.
      "--innodb-buffer-pool-size=64M",
      "--max-connections=50",
    ],
    { stdio: "ignore", windowsHide: true }
  );
  mysqldProcess.on("exit", () => (mysqldProcess = null));
  return mysqldProcess;
}

function stop() {
  if (!mysqldProcess) return;
  spawnSync(
    bin("mysqladmin"),
    ["-u", "root", "--port", String(DEFAULTS.mysqlPort), "-h", "127.0.0.1", "shutdown"],
    { stdio: "ignore", windowsHide: true }
  );
  mysqldProcess = null;
}

function runSql(sql, { database } = {}) {
  const args = ["-u", "root", "--port", String(DEFAULTS.mysqlPort), "-h", "127.0.0.1"];
  if (database) args.push(database);
  const result = spawnSync(bin("mysql"), args, {
    input: sql,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`MySQL command failed: ${result.stderr}`);
  }
  return result.stdout;
}

function generatePassword() {
  return crypto.randomBytes(12).toString("base64url");
}

/** Creates a dedicated database + user for a new site. Mirrors typical host setups. */
function createSiteDatabase(siteName) {
  const dbName = `wp_${siteName}`;
  const dbUser = `wp_${siteName}`;
  const dbPassword = generatePassword();

  runSql(`
    CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE USER IF NOT EXISTS '${dbUser}'@'127.0.0.1' IDENTIFIED BY '${dbPassword}';
    GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'127.0.0.1';
    FLUSH PRIVILEGES;
  `);

  return { dbName, dbUser, dbPassword };
}

function dropSiteDatabase(siteName) {
  const dbName = `wp_${siteName}`;
  const dbUser = `wp_${siteName}`;
  runSql(`
    DROP DATABASE IF EXISTS \`${dbName}\`;
    DROP USER IF EXISTS '${dbUser}'@'127.0.0.1';
    FLUSH PRIVILEGES;
  `);
}

/**
 * Exports a site's database to a plain .sql file, ready to import via
 * phpMyAdmin or `mysql < file.sql` on the live host. This is the file the
 * "transfer to live server" flow hands to the user.
 */
function exportDatabase(dbName, outFilePath) {
  fs.mkdirSync(path.dirname(outFilePath), { recursive: true });
  const result = spawnSync(
    bin("mysqldump"),
    [
      "-u", "root",
      "--port", String(DEFAULTS.mysqlPort),
      "-h", "127.0.0.1",
      "--single-transaction",
      "--routines",
      "--triggers",
      dbName,
    ],
    { encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024 * 200 }
  );
  if (result.status !== 0) {
    throw new Error(`mysqldump failed: ${result.stderr}`);
  }
  fs.writeFileSync(outFilePath, result.stdout, "utf8");
  return outFilePath;
}

/** Imports a .sql file into a site's local database (used for pulling a live site down). */
function importDatabase(dbName, sqlFilePath) {
  const sql = fs.readFileSync(sqlFilePath, "utf8");
  runSql(sql, { database: dbName });
}

module.exports = {
  start,
  stop,
  initDataDir,
  createSiteDatabase,
  dropSiteDatabase,
  exportDatabase,
  importDatabase,
  runSql,
};
