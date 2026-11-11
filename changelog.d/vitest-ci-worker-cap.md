### Fixed

#### Bound Vitest worker concurrency on shared CI runners

Cap Web Unit and Timing Budgets at two Vitest workers per job, with an optional `VITEST_WORKERS` Makefile knob and unchanged local defaults. Fourteen self-hosted runners share 30 cores: two workers per runner limits their combined Vitest workers to 28 instead of hundreds. Remove the global afterEach event-loop yield, which charged deferred application work to its 10-second hook limit. Keep the targeted in-test yields and resumable candidate search, and preserve the scale model, timing assertions and all timeouts.
