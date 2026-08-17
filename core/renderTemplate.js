"use strict";

const fs = require("fs");

/**
 * Extremely small {{TOKEN}} template renderer — deliberately not pulling in
 * a templating engine dependency for this. Throws if a token in the
 * template has no matching value, to catch config bugs early instead of
 * silently writing "{{DB_NAME}}" into a live config file.
 */
function renderTemplate(templatePath, values) {
  const raw = fs.readFileSync(templatePath, "utf8");
  return raw.replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (match, key) => {
    if (!(key in values)) {
      throw new Error(
        `Template ${templatePath} references {{${key}}} but no value was provided.`
      );
    }
    return values[key];
  });
}

module.exports = { renderTemplate };
