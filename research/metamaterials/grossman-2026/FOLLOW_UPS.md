# PR #776 deferred work

## Responsive live computation and precomputed replay (item 6)

Open follow-up, deliberately deferred under the review request's documentation
option. Current `Simulation.run` executes synchronous WASM on the UI thread;
a long solve prevents input, navigation and Pause from being processed. The
automatic sweep also solves each frame live. The page discloses this limitation.

Move all strip and periodic solves, including prestress relaxation, into a
research-only module worker. Terminate the worker on Stop, superseding inputs
and page destruction; reject late results and restart with a fresh worker.
Load WASM inside the worker with deployment-safe asset URLs. Replace the
live autoplay sweep with precomputed frames from the same solver; retain
reduced-motion, visibility, narrow-screen and stop-on-interaction behavior.
Provide Recompute live, Stop and Restart with accurate source and busy labels.

Acceptance requires browser tests with the real WASM bundle and a slow
prestressed network: UI heartbeat and navigation remain responsive, Stop
terminates computation, obsolete results never publish, and Restart completes.
Verify autoplay performs no solves and worker chunks load only on research
routes. Mocked worker tests alone cannot establish responsiveness.

## Other deferred items (unchanged)

- Crossref remains only in the standalone workflow, by deliberate user decision.
- Immutable deployed assets across deploys: covered by the #777 redesign.
- Sticky pane overflow on short windows: shared-shell follow-up.
