### Fixed
#### A research WASM build that runs out of time keeps the bundles it finished (2026-11-04)

The research WASM job saved its cached bundles only when the whole job succeeded, so a job that hit
its time limit on a loaded runner threw away every bundle it had built, and the rerun built them
all again. Each bundle is now saved as soon as it builds, a cache lookup that GitHub rate-limits is
tried a second time instead of counting as a miss, and the job has 90 minutes instead of 60.
