### Fixed

#### Require complete staged WASM regression results

- Check the requested stage count, exact node IDs, every displacement component and final results in the unloaded dormant and inactive-stage regressions, with fabricated incomplete-result controls (#1943).
- Mark the staged refusal tests explicitly as test code so engine lint retains their existing assertions without treating them as production message dispatch.
