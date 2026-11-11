### Fixed

#### Run the soundness audit checks in CI

Register the soundness audit tests with the required script job, allow them to run in a fresh checkout without local audit directories or cached Cargo dependencies, and include the frozen engine checks in the exact results-pass test inventory. Preserve all numerical assertions and known-wrong result expectations.
