### BREAKING (results)
#### Preserve snow force and moments on selected carrier subsets (2026-11-16)

Split physical snow strips at active selection boundaries before fitting member
loads. A selection within a subdivided run previously clipped a full-strip
approximation, losing force and both plan moments (#2197). Fit only active
intervals and share the selection predicate with load emission. Strengthen hole
ownership coverage through roof classification and floor load generation.
Regenerate affected generated snow loads, then rerun analyses, combinations and
design checks. See the [results-change record](../docs/results-changes/2026-11-snow-selected-subsets.md).
