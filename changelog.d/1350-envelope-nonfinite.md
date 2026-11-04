### Fixed
#### Load-combination envelopes refuse instead of returning infinite or NaN values (2026-11-04)

- Fix #1350: the 2D and 3D envelopes (`compute_envelope`, `compute_envelope_3d`, and the multi-case
  solves that use them) evaluated each member's diagrams without checking the result, so end forces
  near the f64 limit overflowed to ±∞ along the member and were returned as envelope values, and a
  NaN in any result after the first was dropped by the max/min comparisons. They now refuse, naming
  the result and the field, or the member, diagram and station that left the range of f64. Envelopes
  of finite, in-range results are unchanged.
