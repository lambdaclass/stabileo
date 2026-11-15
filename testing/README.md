# Test systems

The standalone public API test systems live here. The map also includes the tests that stay beside the engine and web app until later phases. The [testing roadmap](ROADMAP.md) holds the prevention, verification, proof and CI backlog. Durable verification documents live in [docs/](docs/); one-off investigations live in [docs/audits/](docs/audits/). Counts live in the [generated dashboard](docs/DASHBOARD.md).

| Technique | What bug class it catches | Where it lives | CI job or make target that runs it | How often |
|---|---|---|---|---|
| Examples and engineering benchmarks | Answers that disagree with a known solution | `engine/tests`, `testing/docs` | `make test.engine.gates`, `make test.engine.suite` | Every PR, merge queue and nightly |
| Property and certificate checks | Broken equilibrium, bounds and refusal contracts | `engine/tests/certificates`, `engine/tests/property` | `make test.engine.gates`, `make test.engine.suite` | Every PR, merge queue and nightly |
| Metamorphic tests | Answers that change under equivalent models | `engine/src/metamorphic`, `engine/tests/metamorphic` | `make test.engine.metamorphic` | Every PR, merge queue and nightly |
| Mechanism fuzzing | Singular structures accepted as stable | `engine/tests/mechanism_fuzz` | `make test.engine.mechanism-fuzz.quick` | Every PR and merge queue; longer runs nightly |
| Cross-method comparisons | Solver methods that disagree on the same model | `engine/tests/differential` | `make test.engine.differential.quick`, `make test.engine.differential.full` | Quick checks every PR and merge queue; full checks nightly |
| Independent program comparisons | Shared assembly mistakes that certificates cannot see | `testing/differential`, `testing/opensees` | `differential.yml:differential`, `nightly.yml:opensees-diff`, `nightly.yml:codeaster-diff` | Nightly |
| Symbolic derivations | Incorrect element matrices and fixed-end forces | `testing/symbolic` | `verify.yml:symbolic` | Every PR, merge queue and nightly |
| Coverage-guided fuzzing | Crashes, runaway work and broken public API contracts | `testing/fuzz` | `nightly.yml:fuzz` | Nightly |
| Mutation testing | Tests that let planted code defects survive | `testing/scripts`, `web/stryker.config.json` | `make mutants.engine`, `mutation-ts.yml:stryker` | Nightly and on demand |
| Bounded proofs | Arithmetic and indexing counterexamples | `engine/src/kani_proofs.rs`, `testing/scripts/kani-safe.sh` | `verify.yml:kani` | Fast tier every PR and merge queue; all harnesses nightly |
| Formal proofs | Unsound certificate reasoning | `verify` | `verify.yml:lean` | Every PR, merge queue and nightly |
| Web unit tests | Incorrect application state and displayed results | `web/src` | `make test.web.unit` | Every PR, merge queue and nightly |
| Browser tests | Broken user workflows and rendering | `web/e2e` | `make e2e.web.smoke` | Every PR, merge queue and nightly |
| Benchmark protocol checks | Reference data and provenance that drift | `engine/tests/benchmarks` | `make test.engine.benchmark-protocol` | Every PR, merge queue and nightly |
| Test-system script checks | Broken collection, dispatch and reporting | `testing/scripts/tests`, `scripts/tests` | `make test.ci-scripts` | Every PR, merge queue and nightly |
