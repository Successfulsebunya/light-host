"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { PATHS, DEFAULTS, IS_WINDOWS } = require("./config");
const { renderTemplate } = require("./renderTemplate");

const NGINX_TEMPLATE = path.join(__dirname, "..", "templates", "nginx-site.conf.template");
const NGINX_BIN = path.join(PATHS.nginx, IS_WINDOWS ? "nginx.exe" : "nginx");

let nginxProcess = null;

function ensureDirs() {
  fs.mkdirSync(PATHS.nginxConf, { recursive: true });
  fs.mkdirSync(PATHS.logs, { recursive: true });
}

/** Writes (or rewrites) the per-site server block. */
function writeSiteConfig(site) {
  ensureDirs();
  const rendered = renderTemplate(NGINX_TEMPLATE, {
    SITE_NAME: site.name,
    DOMAIN: site.domain,
    SITE_ROOT: path.join(PATHS.sites, site.name).replace(/\\/g, "/"),
    HTTP_PORT: String(DEFAULTS.httpPort),
    PHP_FPM_PORT: String(site.phpFpmPort),
    LOG_DIR: PATHS.logs.replace(/\\/g, "/"),
  });
  const outPath = path.join(PATHS.nginxConf, `${site.name}.conf`);
  fs.writeFileSync(outPath, rendered, "utf8");
  return outPath;
}

function removeSiteConfig(siteName) {
  const outPath = path.join(PATHS.nginxConf, `${siteName}.conf`);
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
}

/**
 * Generates the top-level nginx.conf that `include`s every per-site config
 * from data/nginx-conf/*.conf. Regenerated on every start/reload so we
 * never hand-maintain a big config file.
 */
function writeMainConfig() {
  ensureDirs();
  const mainConf = `
worker_processes  1;
error_log         "${path.join(PATHS.logs, "nginx-error.log").replace(/\\/g, "/")}";
pid               "${path.join(PATHS.data, "nginx.pid").replace(/\\/g, "/")}";

events {
    worker_connections  256;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout  65;

    include "${PATHS.nginxConf.replace(/\\/g, "/")}/*.conf";
}
`;
  const mainConfPath = path.join(PATHS.nginx, "conf", "lighthost.conf");
  fs.mkdirSync(path.dirname(mainConfPath), { recursive: true });
  fs.writeFileSync(mainConfPath, mainConf, "utf8");
  return mainConfPath;
}

function start() {
  if (nginxProcess) return nginxProcess;
  const mainConfPath = writeMainConfig();
  nginxProcess = spawn(NGINX_BIN, ["-c", mainConfPath, "-p", PATHS.nginx], {
    stdio: "ignore",
    windowsHide: true,
  });
  nginxProcess.on("exit", () => {
    nginxProcess = null;
  });
  return nginxProcess;
}

function reload() {
  writeMainConfig();
  if (!nginxProcess) return start();
  spawn(NGINX_BIN, ["-s", "reload", "-p", PATHS.nginx], {
    stdio: "ignore",
    windowsHide: true,
  });
}

function stop() {
  if (!nginxProcess) return;
  spawn(NGINX_BIN, ["-s", "stop", "-p", PATHS.nginx], {
    stdio: "ignore",
    windowsHide: true,
  });
  nginxProcess = null;
}

module.exports = { writeSiteConfig, removeSiteConfig, start, reload, stop };
