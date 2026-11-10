### BREAKING (results)

#### Force geometric stiffness uses the length-average axial force (2026-11-10)

The public 2D and 3D force-based geometric-stiffness builders now centre their constant and span terms on the same length-average axial force. Off-centre point loads and trapezoidal loads previously omitted or added constant geometric work even after the span correction (#1329, PR #1895). Independent regressions cover both builders and displacement assembly; the latter retains its corrected values. The crane-hangar example baseline also records the original P-Delta span correction after verifying unchanged linear outputs. See `docs/results-changes/2026-11-pdelta-span-axial.md` and `docs/advisories/SA-2026-055-pdelta-span-axial.md`.
