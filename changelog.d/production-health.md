### Added
#### The deployed site is checked after a deploy and every hour (2026-10-28)

Production and staging now get a browser health check after successful deploys or rollbacks and
hourly (#738, #720). It checks the landing page, a blog page and backend health, opens Basic,
loads the deployed WASM engine with the right content type and solves a reference cantilever
against its closed-form result. A failing site opens one issue, updates it while the failure
persists and closes it on recovery. This catches a broken deployed build even when the build
itself passed. Re-check the site's health run and reference solve after a deployment failure.
