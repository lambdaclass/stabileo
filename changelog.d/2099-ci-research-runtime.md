### Fixed
#### Default research prerender and CI navigation imports (2026-11-15)

- Remove private locale initializers together with disabled Hungarian dictionary entries, so published research pages render with the default build switches (#2099).
- Read navigation switches safely when Node collects the browser tests without a Vite environment.
