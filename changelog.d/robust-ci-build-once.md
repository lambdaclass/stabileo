### Performance
#### Reuse CI builds and tolerate transient infrastructure outages (2026-10-29)

CI retries known dependency-download infrastructure failures twice while keeping
code and test failures immediate. Self-hosted runners use their local Nix store;
hosted cache outages are non-fatal. Research WASM reuses a source-keyed cache
while validating and publishing the current viewer. Docker smoke consumes the
tested production site instead of rebuilding the engine, research and frontend.
