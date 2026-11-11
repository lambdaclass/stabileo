### Fixed

#### Create unique scratch directories for harness self-tests (2026-11-11)

The seeded replay and nightly findings self-tests now create unique temporary directories and clean them up on exit, including assertion failures. They run when `CARGO_TARGET_DIR` points elsewhere and the repository's `target/` directory does not exist. Replay output write errors identify the destination path. No engine results or numerical assertions change.
