### Changed
#### A pull request's lint, typecheck and unit failures turn red sooner and stop the rest of the run (2026-11-05)

Web typechecking is now its own Web Typecheck job. It needs only the engine WASM, so it no longer waits
for the research assets and the site build's setup. Web Unit runs in eight shards instead of four, and
on pull requests it stops at its first failing test. When Lint Repo, Test CI Scripts, Lint Engine,
Lint Backend, Web Typecheck or Web Unit fails on a pull request, the job cancels the rest of the run:
the long E2E and build jobs stop and their runners are freed. CI OK still reports the failure. Merge
queue and main runs are unchanged.
