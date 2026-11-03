### Changed
#### CI tools use a GitHub runner's thread counts on every runner (2026-11-03)

Cargo, the Rust test harnesses, rayon, vitest, binaryen and esbuild get the thread counts they
already pick on GitHub's four-vCPU runners, in CI and Research, so each tool on the shared
self-hosted runner no longer sizes itself to every core of the machine. These are per-tool
limits, not a cap on a whole job; nothing changes on GitHub's runners.
