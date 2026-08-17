"use strict";

/**
 * Manages entries in the Windows hosts file so that `sitename.test` resolves
 * to 127.0.0.1. All wp-light entries live inside a clearly marked block so
 * we NEVER touch lines we didn't add ourselves.
 *
 * IMPORTANT: writing to the hosts file requires Administrator privileges on
 * Windows. The calling process (the Tauri app or CLI) should already be
 * elevated, or should re-launch itself elevated, before calling addHost().
 * We deliberately do not attempt a runas/UAC shell-out here — that decision
 * belongs to the app shell, not the core engine.
 */

const fs = require("fs");
const { PATHS, MARKERS } = require("./config");

function readHosts() {
  if (!fs.existsSync(PATHS.hostsFile)) return "";
  return fs.readFileSync(PATHS.hostsFile, "utf8");
}

function parseManagedBlock(contents) {
  const startIdx = contents.indexOf(MARKERS.hostsStart);
  const endIdx = contents.indexOf(MARKERS.hostsEnd);
  if (startIdx === -1 || endIdx === -1) {
    return { before: contents, entries: [], after: "" };
  }
  const before = contents.slice(0, startIdx);
  const after = contents.slice(endIdx + MARKERS.hostsEnd.length);
  const blockBody = contents.slice(
    startIdx + MARKERS.hostsStart.length,
    endIdx
  );
  const entries = blockBody
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  return { before, entries, after };
}

function rebuildHosts(before, entries, after) {
  const uniqueEntries = [...new Set(entries)];
  const block =
    `${MARKERS.hostsStart}\n` +
    uniqueEntries.map((e) => e).join("\n") +
    (uniqueEntries.length ? "\n" : "") +
    `${MARKERS.hostsEnd}\n`;
  // Ensure exactly one blank line separates the OS's own content from our
  // block, and strip any leading blank lines from "after" so re-saving
  // repeatedly doesn't accumulate blank lines over time.
  const trimmedBefore = before.replace(/\s*$/, "\n\n");
  const trimmedAfter = after.replace(/^\s*\n/, "");
  return trimmedBefore + block + (trimmedAfter ? "\n" + trimmedAfter : "");
}

function addHost(domain, ip = "127.0.0.1") {
  const contents = readHosts();
  const { before, entries, after } = parseManagedBlock(contents);
  const line = `${ip}\t${domain}`;
  const alreadyPresent = entries.some((e) => e.endsWith(domain));
  const nextEntries = alreadyPresent
    ? entries
    : [...entries, line];
  const updated = rebuildHosts(before, nextEntries, after);
  fs.writeFileSync(PATHS.hostsFile, updated, "utf8");
  return !alreadyPresent;
}

function removeHost(domain) {
  const contents = readHosts();
  const { before, entries, after } = parseManagedBlock(contents);
  const nextEntries = entries.filter((e) => !e.endsWith(domain));
  const updated = rebuildHosts(before, nextEntries, after);
  fs.writeFileSync(PATHS.hostsFile, updated, "utf8");
}

function listManagedHosts() {
  const contents = readHosts();
  const { entries } = parseManagedBlock(contents);
  return entries;
}

module.exports = { addHost, removeHost, listManagedHosts };
