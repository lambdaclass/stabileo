### Performance
#### Reuse CI builds and tolerate transient infrastructure outages (2026-10-29)

CI retries known dependency-download infrastructure failures twice while keeping
code and test failures immediate. Self-hosted runners use their local Nix store;
hosted cache outages are non-fatal. Research WASM reuses a source-keyed cache
while validating and publishing the current viewer. Docker smoke tests both the
default source build (including engine WASM, research WASM and frontend compilation)
and a prebuilt-site build consuming the tested `site-production` artifact. A full
cold PR runs 2 engine WASM builds, 2 research WASM sets and 6 site builds, excluding
builds spawned by tests; a research source-cache hit reduces the research WASM
sets to 1 while leaving the other counts unchanged.
