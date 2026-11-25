# Physical distances in member diagram queries

A normalized query on a split member first computes the physical parent
distance and its multiplication residual. The piece offset is then
subtracted from that distance. At the middle of a 3 m member split at 1 m
and 2 m, a shear of 4 + 2^54(x − 0.5) on the middle piece is 4 at the
requested local distance of 0.5 m. The previous reconstruction from a
rounded normalized boundary sampled a different position and returned 6.

The browser normalizes the physical position of an interval extremum
before checking whether it shares a normalized position with a load
boundary. A materially different ordinate at such a peak causes a refusal.
For a load from 1.5 m to 1.5 + 2^-50 m on a 3 m member with intensities
9 × 2^50 and −41 × 2^50, the peak occurs 9/50 of the way into the loaded
interval. Its normalized position rounds to 0.5, the same as the boundary.
The previous interpolation assigned it to the next floating-point number.

Native and WASM point-force moments include the rounding residual of the
lever arm. At x = 1 m, a force of 2^54 at 0.25 + 2^-54 m gives a moment
contribution of 3 × 2^52 − 1. With a baseline of −3 × 2^52, the result is
−1. The previous calculation returned zero.

The Envelope sheet in XLSX and CSV reports the rounded distance and the
signed rounding residual in metres. Read the two cells together with the
face. Cuts at 1 + 0.24999999999999992 m and 1 + 0.25 m both display 1.25 m
and have residuals of −3 × 2^-55 m and zero respectively.

Recompute affected diagrams and envelopes and re-export critical
workbooks. See #2226, #2437 and PR #2587.
