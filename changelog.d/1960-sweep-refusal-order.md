### Fixed

#### Make slider sweep refusal checks independent of test order (2026-11-12)

Populate seeded sample checks in deterministic setup batches so the aggregate
refusal assertion works alone and with shuffled tests (#1960). Preserve the
original seeds, all 300 samples per example, the strict refusal limit, the
25-analysis batch budget and each 120-second timeout. Check sample cleanliness
in isolated aggregate runs as well. Engine results are unchanged.
