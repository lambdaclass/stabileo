### Fixed
#### The production-build tests no longer time out on hosted runners (2026-11-04)

Every test in the build pass spawns a process, such as a `vite build` or `npm ls --all`. The
notices check had no timeout of its own, so it got Vitest's 5 s default. `npm ls` took 64 s on a
GitHub-hosted runner and failed Web Build there. The build pass now gives each test 120 s unless the
test sets its own.

Prerendering the site gave each page navigation Playwright's 30 s default, so on a heavily loaded
build host a page that was still loading failed the whole E2E Site job. Each prerender page now
allows 120 s per navigation.
