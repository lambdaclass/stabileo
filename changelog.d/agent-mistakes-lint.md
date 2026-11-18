### Added
#### Fast local checks and lint for silent fallbacks and skips

- Run the targeted web checks and CI script gates with `make check.fast`. Repository lint catches value-producing switch defaults in engine, model and store code, untracked test skips, and environment-gated tests.
