### Fixed

#### Require applicable snapshot registrations and detect weakened benchmarks (2026-11-10)

The results-snapshot gate now requires a new registration to match the opened model, the
analysis that produced each changed field, and the declared quantities. An unrelated registration
cannot acknowledge a changed snapshot, including beside an examples-scoped entry.

The benchmark gate now checks Rust consumers of case-file tolerances and detects disabled,
removed or disconnected benchmark tests relative to base. A weakening needs the
`tolerance-change` label and a written reason. Seeded good and bad cases cover both gates.

Tighten the loose benchmark checks from #1490 using targeted measurements, per-case Navier
bounds and explicit uncertainty records. Keep distorted SHB8 accuracy floors and add tight
regression pins. Correct the legacy elastica test references to the existing audited references.
No engine results change. See [the tolerance audit](../docs/verification/benchmark-tolerances-1490.md).
