### Changed
#### Reuse AMD external counts within each pivot (2026-11-26)

Cache unchanged external-neighbor counts during sparse ordering, retaining the
same permutation and downstream arithmetic. Bound additional storage at 8 MiB
with checked size arithmetic and the original scan as fallback.
