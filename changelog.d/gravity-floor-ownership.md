### BREAKING (results)

#### Assign automatic gravity across each floor once

Automatic gravity assigns a fully covered beam bay to its shell when deck ownership is established. Shells on separate decks retain their loads. The ambiguous #2499 shell overlap requires explicit loads. The #2299 and #2347 bay models with unique ownership generate loads. The planner checks area and load conservation before returning a plan. See [the results changes](../docs/results-changes/2026-11-gravity-floor-ownership.md). (#2284, #2299, #2347, #2499)
