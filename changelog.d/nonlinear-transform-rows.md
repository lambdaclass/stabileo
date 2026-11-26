### Changed
#### Traverse larger stiffness transforms by rows (2026-11-26)

Use contiguous rows for stiffness transforms of order 12 and above while
preserving each entry’s accumulation order and nonfinite propagation.
