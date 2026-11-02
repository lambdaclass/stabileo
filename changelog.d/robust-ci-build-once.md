### Performance
#### Reuse CI builds and tolerate transient infrastructure outages (2026-10-29)

CI retries known dependency-download infrastructure failures twice while keeping
code and test failures immediate. A download that stalls is killed after 15
minutes and retried as an infrastructure failure, cargo fetches without HTTP/2
multiplexing, and the retry wrapper no longer waits for daemons a command starts
(sccache held its output pipe, so Research WASM hung for an hour after the fetch). Self-hosted runners use their local Nix store;
hosted cache outages are non-fatal. Research WASM reuses a source-keyed cache
while validating and publishing the current viewer. Docker smoke tests both the
default source build (including engine WASM, research WASM and frontend compilation)
and a prebuilt-site build consuming the tested `site-production` artifact. A full
cold PR runs 5 engine WASM builds (the shared WASM job, Docker's source build and
three research validation jobs), 2 research WASM sets and 6 site builds, excluding
builds spawned by tests; a research source-cache hit reduces the research WASM
sets to 1 while leaving the other counts unchanged.
