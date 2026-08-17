#!/usr/bin/env node
"use strict";

/**
 * Downloads the portable binaries Light Host depends on, so the git repo
 * itself stays tiny (no binaries committed). Run automatically via
 * `npm install` (postinstall) or manually: `node scripts/fetch-binaries.js`
 *
 * NOTE: URLs below are placeholders pointing at the general release pages —
 * before shipping, pin these to specific, checksum-verified release asset
 * URLs (don't silently trust "latest" in a tool that writes to a user's
 * hosts file and runs as admin). This script intentionally fails loudly
 * rather than guessing a URL shape that may have changed.
 */

const fs = require("fs");
const path = require("path");
const { PATHS, IS_WINDOWS, DEFAULTS } = require("../core/config");

const SOURCES = {
  php: {
    // https://windows.php.net/download/ — grab the "Non Thread Safe" zip
    // for each version in DEFAULTS.supportedPhpVersions.
    note: "Download the NTS x64 zip for each PHP version from windows.php.net/download and extract to binaries/php/{version}/",
    versions: DEFAULTS.supportedPhpVersions,
  },
  nginx: {
    // https://nginx.org/en/download.html — Windows zip build
    note: "Download the nginx/Windows zip from nginx.org/en/download.html and extract to binaries/nginx/",
  },
  mariadb: {
    // https://mariadb.org/download/ — "Zip file" package for Windows, not the MSI installer
    note: "Download the MariaDB Windows ZIP (not MSI) from mariadb.org/download and extract to binaries/mariadb/",
  },
  wpcli: {
    // https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
    url: "https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar",
    dest: PATHS.wpcli,
  },
  mkcert: {
    // https://github.com/FiloSottile/mkcert/releases — windows amd64 exe
    note: "Download mkcert-vX.Y.Z-windows-amd64.exe from github.com/FiloSottile/mkcert/releases, rename to mkcert.exe, place in binaries/mkcert/",
  },
};

async function downloadFile(url, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  console.log(`Downloaded -> ${destPath}`);
}

async function main() {
  if (!IS_WINDOWS) {
    console.log(
      "This bootstrap script currently targets Windows only (Mac support is on the roadmap). Skipping."
    );
    return;
  }

  console.log("Light Host binary setup\n----------------------");
  console.log(
    "Automatic download is only wired up for WP-CLI right now (a single\n" +
    "small .phar file with a stable direct-download URL). PHP, nginx, and\n" +
    "MariaDB Windows builds are distributed as versioned zip/exe releases\n" +
    "without a stable 'latest' URL, so — to avoid silently fetching an\n" +
    "unverified binary — those steps are manual for now:\n"
  );

  for (const [key, src] of Object.entries(SOURCES)) {
    if (src.note) console.log(`- ${key}: ${src.note}`);
  }

  console.log("\nFetching WP-CLI...");
  await downloadFile(SOURCES.wpcli.url, SOURCES.wpcli.dest);

  console.log(
    "\nOnce the manual downloads above are placed under ./binaries/, run:\n" +
    "  npm run cli -- start-engine\n" +
    "to verify everything launches."
  );
}

main().catch((err) => {
  console.error("Binary setup failed:", err.message);
  process.exit(1);
});
