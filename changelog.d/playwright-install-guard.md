### Fixed

#### Installing Playwright browsers never writes into the Nix store (2026-11-06)

- Every `make` target that installs browsers goes through `web/scripts/playwright-install.sh`, which
  installs nothing when `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` or when `PLAYWRIGHT_BROWSERS_PATH` is a
  Nix store path. Before, `make` decided from its own environment, so `make test.web.build
  NIX_RUN="nix develop .#e2e --command"` run as root overwrote the Nix Playwright browsers with an
  unpatched download and broke every Web Build and E2E Site job on the self-hosted runners.
