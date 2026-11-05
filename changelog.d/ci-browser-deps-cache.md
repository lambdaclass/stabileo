### Changed
#### Browser system packages come from the Actions cache on hosted runners (2026-11-04)

Every hosted job that installs Playwright's system packages (E2E shards, E2E Site, Web Build, Determinism,
Timing Budgets, the flaky suite) now goes through one action. That action keeps apt's downloaded
packages in the Actions cache, keyed by runner image, browsers and lockfile, so apt no longer fetches
them from Ubuntu's mirror on each run. The mirror sometimes serves at about 50 kB/s: 21 MB took
6.5 minutes and was the slowest step of an E2E shard. The action also has apt wait up to 5 minutes
for the dpkg lock.
