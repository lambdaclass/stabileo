### Changed

#### Selective `@slow` E2E specs in the merge queue (2026-11-06)

The merge queue (`merge_group`) now runs the `@slow` Playwright E2E specs whose source dependencies intersect the queued entry's diff, sharded across the 14 E2E runners by measured duration (`#1519`). Changes to `engine/`, the WASM bindings, `web/src/lib/engine/`, `web/src/lib/store/` or `web/src/lib/model/` select every `@slow` spec that solves a model (including `design-desk.spec.ts`, all seven `basic-advanced-sweep-*.spec.ts` files, `explained-steps.spec.ts` and `basic-plastic-course.spec.ts`). Docs-only changes select none, and any unknown path, missing diff or script error fails closed to the full `@slow` suite.
