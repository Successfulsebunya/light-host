# Contributing

## Testing without Windows binaries installed

Most of `core/` is platform-agnostic logic that can be tested without real
PHP/nginx/MariaDB binaries present:

- `core/registry.js` — pure JSON file I/O, fully testable anywhere
- `core/hostsManager.js` — point `config.PATHS.hostsFile` at a temp file to
  test hosts-file editing safely without touching your real system file:

  ```js
  const config = require("./core/config");
  config.PATHS.hostsFile = "/tmp/fake-hosts";
  const hosts = require("./core/hostsManager");
  hosts.addHost("test.test");
  ```

- `core/renderTemplate.js` + `templates/*` — pure string templating, no
  external dependencies
- `core/exportManager.js` zip logic can be tested against a dummy folder
  under `PATHS.sites` without a real WordPress install

Anything that shells out to a binary (`dbManager`, `phpManager`'s FPM spawn,
`wpManager`'s WP-CLI calls, `nginxManager`'s process spawn) needs the real
Windows binaries in place and can only be fully exercised on Windows. When
changing these modules, keep the binary-spawn logic as thin as possible and
push logic (config generation, argument building) into testable pure
functions where you can.

## Adding a new PHP version

1. Add the version string to `DEFAULTS.supportedPhpVersions` in
   `core/config.js`
2. Extract the corresponding NTS Windows PHP build to
   `binaries/php/{version}/`
3. No other code changes needed — `phpManager.js` resolves the binary path
   from the version string

## Style notes

- Keep the dependency list in `package.json` minimal — this is a
  lightweight-by-design project; every new dependency should justify its
  install size.
- Favor explicit failure over silent fallback, especially in
  `hostsManager.js` and `dbManager.js` — these touch system state and a
  live user database, so surprising behavior there is worse than a loud
  error.

## Licensing of contributions

Light Host is released under the GNU GPL v3.0 or later. By submitting a pull
request you agree that your contribution is licensed under the same terms.

If you add a new source file, include the standard header notice at the top:

```js
/*
 * Light Host - lightweight local WordPress development for Windows
 * Copyright (C) 2026 Moses Ssebunya
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
```
