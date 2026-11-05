### Changed
#### Web Build's production-build tests reuse the build CI just made (2026-11-04)

`make test.web.build` builds the site once and builds a second copy with a Vite manifest. It stamps
both with a hash of the files each holds and of the sources it was built from: the commit, web/ and research/, the engine and
research WASM, the Vite env files, and the build variables (`VITE_*`, `BASE_PATH`, `GITHUB_SHA`, `NODE_ENV`), recorded before Vitest starts. The production-build tests then read those two builds instead
of making four more. A test refuses a shared build whose sources or files differ from its stamp, so a
stale build fails and is never tested in place of the current one. The VITE_E2E build in the
hook-gating test is still its own, and run on their own, outside `make test.web.build`, the tests still
build what they need.
