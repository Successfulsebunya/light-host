# Light Host

A lightweight, **WordPress-only** local development environment for Windows.
No Docker, no VM, no bloated app shell — just nginx, PHP-FPM and MariaDB run as
portable native binaries, orchestrated by a small Node.js core.

🌐 **[lighthost website](https://successfulsebunya.github.io/light-host/)** · 🧪 **[Testing guide](https://successfulsebunya.github.io/light-host/testing.html)**

Built around two priorities above all else:

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
      nginx and MariaDB Windows builds don't have stable "latest" URLs, so
      that step is scripted but manual — see `scripts/fetch-binaries.js`)
- [ ] No GUI yet — currently a CLI (`lighthost`) only
- [ ] No SSL/mkcert integration wired in yet
- [ ] macOS support (planned after Windows v1 is solid)

This is intentionally sequenced: get the engine's *logic* correct and
tested first (it's platform-agnostic Node.js), then bundle real binaries and
wrap it in a GUI.

## Architecture

```
light-host/
├── core/                 The orchestration engine (all the real logic)
│   ├── config.js          Central paths, ports, defaults
│   ├── registry.js        Site metadata store (data/registry.json)
│   ├── hostsManager.js    Safely manages *.test entries in the hosts file
│   ├── nginxManager.js    Generates + reloads nginx config per site
│   ├── phpManager.js      Spawns/stops per-site PHP-FPM pools on demand
│   ├── dbManager.js       Shared MariaDB instance; per-site DB/user; export/import
│   ├── wpManager.js       WP-CLI wrapper: core download/install, search-replace
│   ├── exportManager.js   Packages a site (files + DB) for live-server transfer
│   ├── siteManager.js     Top-level orchestration: create/start/stop/delete
│   └── index.js           Public API surface (what a future GUI imports)
├── bin/lighthost.js      CLI entry point
├── templates/            nginx site config + wp-config.php templates
├── scripts/              First-run binary bootstrap
├── website/              Marketing + docs site (served via GitHub Pages)
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

## Getting started (from source)

```bash
git clone https://github.com/Successfulsebunya/light-host.git
cd light-host
npm install
```

`npm install` fetches WP-CLI automatically and prints instructions for the
remaining binaries. Place them under `binaries/`:

```
binaries/
  php/8.3/        # PHP 8.3 NTS x64 — windows.php.net/download
  nginx/          # nginx Windows zip — nginx.org/en/download.html
  mariadb/        # MariaDB Windows ZIP (not the MSI) — mariadb.org/download
  wp-cli/         # fetched automatically
```

Then, from an **Administrator** terminal (hosts-file edits require it):

```bash
npm run cli -- start-engine
npm run cli -- create mysite
npm run cli -- list
```

Visit `http://mysite.test` — admin login is `admin` / `admin`.

## Building a Windows .exe

To test Light Host on a desktop without installing Node.js, compile it to a
single executable using [`@yao-pkg/pkg`](https://www.npmjs.com/package/@yao-pkg/pkg)
(the maintained fork of the archived `vercel/pkg`), which is already listed as
a dev dependency.

```bash
npm install          # installs the build tool along with everything else
npm run build:exe
```

This produces **`dist/light-host.exe`**. Run it exactly like the CLI, without
the npm wrapper:

```bash
light-host.exe start-engine
light-host.exe create testsite
light-host.exe list
light-host.exe export testsite --url https://myrealsite.com
```

### Important: the .exe is not the whole program

The executable bundles the Light Host source and a Node.js runtime, but **not**
PHP, nginx or MariaDB. Those still need to live in a `binaries/` folder next to
the `.exe`. A true all-in-one installer that carries the runtimes is a later
goal — see the roadmap.

Distribute it like this:

```
light-host/
  light-host.exe
  binaries/
    php/8.3/
    nginx/
    mariadb/
    wp-cli/
```

### Cross-compiling

`pkg` can build macOS and Linux binaries from a Windows machine, though the
non-Windows side of the project isn't finished yet:

```bash
npm run build:exe:all    # windows + macos x64 + macos arm64 into dist/
```

### Build troubleshooting

| Problem | Fix |
|---|---|
| Antivirus deletes the output | Unsigned executables built this way are commonly flagged. Add an exclusion for `dist/`. Code signing is a later step. |
| "Cannot find module" at runtime | A dependency wasn't traced. Make sure it's in `dependencies`, not `devDependencies`. |
| Templates missing at runtime | The `pkg.assets` field in `package.json` controls bundled non-JS files. Add new templates there. |
| Executable is large (~40-50MB) | Expected — it embeds the Node.js runtime. The runtime binaries in `binaries/` are the bigger share of total install size. |

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

Drop the `.sql` file into phpMyAdmin on your host, upload the zip contents to
your web root, and update `wp-config.php` on the host with the live DB
credentials. That's the whole migration.

## The website

The `website/` folder holds the project's public site, deployed to GitHub Pages
by `.github/workflows/pages.yml`. **Only that folder is published** — the rest
of the repository is never deployed.

One-time setup: **Settings → Pages → Source → "GitHub Actions"**.

To use a custom domain later, add it under Settings → Pages; GitHub manages the
`CNAME` file in the deployed output, so no workflow changes are needed.

## Roadmap

1. Pin and automate the Windows binary downloads (checksum-verified release
   assets, not "latest")
2. Ship a first compiled `.exe` on the Releases page
3. mkcert integration for local HTTPS
4. Tauri GUI wrapping this same `core/` engine unmodified
5. Site "blueprints" (pre-configured plugin/theme starting points)
6. Optional direct SFTP push for the export flow
7. All-in-one installer bundling the runtimes
8. macOS support

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Testing on real Windows machines is the
single most useful contribution right now — the process-spawning code has never
run against real binaries.

## License

Light Host is free software released under the **GNU General Public License
v3.0 or later**. See [LICENSE](LICENSE).

This means you're free to use, study, modify and redistribute it — including
commercially — provided derivative works are released under the same license
and source is made available.
