#!/usr/bin/env node
"use strict";

const { Command } = require("commander");
const engine = require("../core/index");

const program = new Command();
program
  .name("wplight")
  .description("Lightweight local WordPress development environment")
  .version("0.1.0");

program
  .command("start-engine")
  .description("Start the shared MariaDB + nginx processes")
  .action(async () => {
    await engine.startEngine();
    console.log("Engine started (MariaDB + nginx).");
  });

program
  .command("stop-engine")
  .description("Stop the shared MariaDB + nginx processes and all site PHP pools")
  .action(() => {
    engine.stopEngine();
    console.log("Engine stopped.");
  });

program
  .command("create <name>")
  .description("Create a new local WordPress site")
  .option("--php <version>", "PHP version to use", "8.3")
  .action(async (name, opts) => {
    console.log(`Creating site "${name}"...`);
    const site = await engine.sites.createSite(name, { phpVersion: opts.php });
    console.log(`Done. Visit: http://${site.domain}`);
    console.log(`WP Admin: http://${site.domain}/wp-admin (admin / admin)`);
  });

program
  .command("list")
  .description("List all local sites")
  .action(() => {
    const sites = engine.sites.listSites();
    if (!sites.length) {
      console.log("No sites yet. Create one with: wplight create mysite");
      return;
    }
    for (const s of sites) {
      console.log(`${s.name}\thttp://${s.domain}\tPHP ${s.phpVersion}\t${s.status}`);
    }
  });

program
  .command("stop <name>")
  .description("Stop a site's PHP process (frees resources without deleting it)")
  .action((name) => {
    engine.sites.stopSite(name);
    console.log(`Stopped "${name}".`);
  });

program
  .command("start <name>")
  .description("Start a stopped site")
  .action((name) => {
    engine.sites.startSite(name);
    console.log(`Started "${name}".`);
  });

program
  .command("delete <name>")
  .description("Delete a site (files, database, config, hosts entry)")
  .option("--keep-files", "keep the site's WordPress files on disk")
  .action(async (name, opts) => {
    await engine.sites.deleteSite(name, { keepFiles: opts.keepFiles });
    console.log(`Deleted "${name}".`);
  });

program
  .command("export <name>")
  .description("Package a site (files + DB) for upload to a live server")
  .requiredOption("--url <productionUrl>", "the live production URL, e.g. https://example.com")
  .action(async (name, opts) => {
    const site = engine.registry.getSite(name);
    if (!site) throw new Error(`Site "${name}" not found.`);
    console.log(`Exporting "${name}" for ${opts.url}...`);
    const result = await engine.exportSite(site, { productionUrl: opts.url });
    console.log(`Export ready: ${result.targetDir}`);
  });

program.parseAsync(process.argv);
