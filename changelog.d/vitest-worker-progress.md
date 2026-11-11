### Fixed

#### Keep Web Unit workers responsive between synchronous analyses

Yield to the event loop between Vitest cases and between models in the 3D modal, sway-frame and what-if sweeps and the slab-column reference audit. Clear completed slab-audit fixture results before yielding so their deferred background certification cannot outlive the assertions. This lets workers receive pending progress RPC replies instead of timing out after a sequence of passing synchronous tests. Keep every model, sample, numerical assertion and timeout unchanged. Add a deterministic check that a worker callback queued by one test runs before the next test.
