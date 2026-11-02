### Fixed
#### Merge-queue WASM builds no longer fail on another runner's compiler cache (2026-11-02)

The self-hosted CI runners are separate users on one host, and all of them talked to a single
sccache server on its default port. A job then compiled through a server owned by another runner
user, which could not read its files ("failed to spawn ... Permission denied"), and the PR left the
merge queue. Inside CI, the Nix shell now gives each runner user its own sccache port and cache
directory, and builds without sccache when its server cannot start. Local shells are unchanged.
