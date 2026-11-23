### BREAKING (results)

#### Assign automatic gravity across each floor once

Automatic gravity now assigns a covered beam bay to its shell and puts the pressure on the upper shell of an unambiguously coupled stack. The #2499 deck now receives 60 kN instead of 120 kN. The #2299 and #2347 bay models with unique ownership now generate loads. Ambiguous or unrepresentable overlaps refuse, and the generator checks area and load conservation before returning a plan. See [the results changes](../docs/results-changes/2026-11-gravity-floor-ownership.md). (#2284, #2299, #2347, #2499)
