### Fixed

#### Share browser system dependency installation across workflows

Route deployment, performance and production health browser packages through the same cached installer as Determinism and E2E. Support standalone pinned Playwright installations without requiring Nix. Verify the Linux package planning contract against a recording from lockfile-pinned Playwright 1.60.0, including refusal when the expected apt simulation is absent.
