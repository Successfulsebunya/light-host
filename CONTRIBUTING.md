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
