### Fixed
#### A research WASM build that runs out of time keeps the bundles it finished (2026-11-04)

The research WASM job saved its cached bundles only when the whole job succeeded, so a job that hit
its time limit on a loaded runner threw away every bundle it had built, and the rerun built them
all again. The bundles build in parallel and each one is marked for saving the moment it finishes;
the build step stops at 75 minutes so the finished bundles are still saved within the job's 90
(was 60). A cache lookup that GitHub rate-limits is tried a second time instead of counting as a miss.
