# Physical cuts and jump sides in member results

Member diagrams accumulate the two endpoints of a varying distributed load
separately. On a unit member, line loads with intensities `(1, 2^54)`,
`(0, -2^54)` and `(0, -1)` superpose to `1 - 2t`. The integrated shear
change `t - t²` peaks at `1/4` at midspan. Rounding each load's gradient
first can lose that stationary point.

An interior extremum can share the normalized coordinate of a boundary even
when their rounded ordinates differ. The native and WASM postprocessors compare
the recovered values at the two physical cuts and refuse that station if the
values differ. An ordinate common to both cuts can still be reported.

Spatial variable-member curves preserve the local cut through rebasing.
Two different cuts that collapse onto the same normalized station cause a
refusal when the cuts are combined. Explicit physical queries select the
requested face at the cut. A single-part absolute combination preserves the
squared component, so its transverse resultant can use the underlying
polynomial extrema.

Critical result summaries mark the left and right faces with superscripts
`−` and `+`. The workbook's critical Maxima sheet carries the side in its own
column alongside the numeric distance. Rerun affected analyses and regenerate
reports that include member extrema.
