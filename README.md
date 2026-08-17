# wp-light

A lightweight, **WordPress-only** local development environment for Windows.
No Docker, no VM, no bloated app shell — just nginx + PHP-FPM + MariaDB run
as portable native binaries, orchestrated by a small Node.js core.

Built for two priorities above all else:

1. **Run comfortably on low-resource Windows machines.** Idle footprint
   target: under ~200MB RAM, under ~200MB installed size.
2. **Painless transfer to a live server.** Because it uses MariaDB (wire- and
   dump-compatible with MySQL — what most WordPress hosts actually run) and
   WP-CLI under the hood, exporting a site produces a plain `.sql` dump and a
   clean file zip that import directly into any standard host. No format
   translation, no proprietary export format to unpack.

## Status

Early scaffold. The **core orchestration engine is implemented and tested**
(registry, hosts-file management, nginx/PHP-FPM/MariaDB process management,
WP-CLI provisioning, and the live-server export flow). What's *not* done yet:

- [ ] Windows portable binaries aren't bundled/auto-downloaded yet (PHP,
      nginx, and MariaDB Windows builds don't have stable "latest" URLs, so
      step 1 is scripted but manual — see `scripts/fetch-binaries.js`)
- [ ] No GUI yet — currently a CLI (`wplight`) only
- [ ] No SSL/mkcert integration wired in yet
- [ ] Mac support (planned after Windows v1 is solid)

This is intentionally sequenced: get the engine's *logic* correct and
tested first (it's platform-agnostic Node.js), then bundle real binaries and
wrap it in a GUI.

## Architecture

```
wp-light/
├── core/                 The orchestration engine (all the real logic)
│   ├── config.js         Central paths, ports, defaults
│   ├── registry.js        Site metadata store (data/registry.json)
│   ├── hostsManager.js    Safely manages *.test entries in the hosts file
│   ├── nginxManager.js    Generates + reloads nginx config per site
│   ├── phpManager.js      Spawns/stops per-site PHP-FPM pools on demand
│   ├── dbManager.js       Shared MariaDB instance; per-site DB/user; export/import
│   ├── wpManager.js       WP-CLI wrapper: core download/install, search-replace
│   ├── exportManager.js   Packages a site (files + DB) for live-server transfer
│   ├── siteManager.js     Top-level orchestration: create/start/stop/delete
│   └── index.js           Public API surface (what a future GUI imports)
├── bin/wplight.js        CLI entry point
├── templates/            nginx site config + wp-config.php templates
├── scripts/fetch-binaries.js   First-run binary bootstrap
└── data/                 Generated at runtime: registry, logs, nginx confs
```

### Why these choices

| Decision | Reasoning |
|---|---|
| No Docker | Docker Desktop's WSL2 backend alone can eat 1-2GB RAM — defeats the low-resource goal |
| MariaDB over MySQL | Same SQL, same dump format, lighter footprint, faster cold start; wire-compatible with MySQL hosts |
| One shared MariaDB instance, per-site DBs | Spinning up a separate `mysqld` per site would multiply RAM use for no benefit |
| Per-site PHP-FPM pools started on demand | Idle sites shouldn't burn RAM — only running sites have a live PHP process |
| nginx over Apache | Smaller binary, simpler config generation, lower idle RAM |
| WP-CLI for all WordPress operations | Never hand-roll WordPress install/config logic; WP-CLI's `search-replace` is serialization-safe, which a naive find/replace is not |
| Node.js core (for now) | Fast to iterate and test the *logic* correctly before investing in a Rust/Tauri rewrite for the shipped GUI |

## Getting started (development)

```bash
npm install
npm run cli -- create mysite
npm run cli -- list
```

Note: `create` will fail until real PHP/nginx/MariaDB binaries are placed
under `binaries/` per the instructions printed by
`node scripts/fetch-binaries.js` — the engine logic runs and has been tested
independently of the binaries (see `core/*.test` notes in CONTRIBUTING.md).

## The live-server export flow

```bash
npm run cli -- export mysite --url https://mysite-production.com
```

This will:
1. Rewrite all URLs in the local database from `http://mysite.test` to your
   production URL — serialization-safe, via WP-CLI `search-replace`.
2. Dump the database to a plain `.sql` file.
3. Revert the local copy back to `mysite.test` so local dev keeps working.
4. Zip the WordPress files, excluding local-only cruft (debug logs, cache).
5. Write a `README.txt` in the export folder with exact import steps.

Drop the `.sql` file into phpMyAdmin on your host, upload the zip contents
to your web root, and update `wp-config.php` on the host with the live DB
credentials. That's the whole migration.

## Roadmap

1. Pin and automate the Windows binary downloads (checksum-verified release
   assets, not "latest")
2. mkcert integration for local HTTPS
3. Tauri GUI wrapping this same `core/` engine unmodified
4. Site "blueprints" (pre-configured plugin/theme starting points)
5. Optional direct SFTP push for the export flow
6. Mac support

## License

MIT
