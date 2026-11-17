### Performance
#### Skip the span rotation scan where a bound already settles it (2026-11-17)

The small-displacement check scans every frame member's span in 64 intervals,
finding where each plane's rotation turns, for every case and combination. An
upper bound of that scan is now computed first from 17 rotations per plane and
the largest moment and shear the member's loads allow. Where the bound is
within the limit the member is within it and the scan is not run; otherwise
the scan decides as before. Diagnostics are unchanged.
