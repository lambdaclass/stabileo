### Changed
#### A pull request's lint, typecheck and unit failures turn red sooner and stop the rest of the run (2026-11-05)

Web typechecking is now its own Web Typecheck job. It needs only the engine WASM, so it no longer waits
for the research assets and the site build's setup. Web Unit runs in eight shards instead of four. On
pull requests from this repository's branches, Web Unit stops at its first failing test. When Lint
Repo, Test CI Scripts, Lint Engine, Lint Backend, Web Typecheck or Web Unit fails on such a pull
request, the run is cancelled once that job has ended as a failure, so the failed check stays red
and the long E2E and build jobs stop. A small workflow, Stop a failed pull request run, does the
cancelling. CI OK still reports the failure. Pull requests from forks get a read-only token, so their runs are not cancelled;
they run to the end as before. The merge queue and main still run every test.
