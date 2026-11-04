### Fixed
#### The production-build test pass runs its builds one at a time, as designed (2026-11-04)

The build Vitest project set `fileParallelism: false` and `maxWorkers: 1`, which Vitest 3 reads
only from the root config, so its four to five production builds and a prerender ran at once
(21.5 GB peak, measured). The project now runs in a single fork (7.6 GB peak), which removes the
out-of-memory kills of those builds that failed Web Build on the shared CI host.
