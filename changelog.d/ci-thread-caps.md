### Changed
#### CI jobs use four threads on every runner (2026-11-03)

Cargo, the Rust test harnesses, rayon, vitest, binaryen and esbuild are capped at a GitHub
runner's four threads in CI and Research, so jobs on the shared self-hosted runner no longer
each claim every core of the machine. On GitHub's runners nothing changes.
