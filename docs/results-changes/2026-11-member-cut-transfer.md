# Preserve member ordinates through cancellation and cut transfer

For five coincident uniform line loads on a unit member with intensities
2¹¹⁰, 2⁵⁴, 1, −2⁵⁴ and −2¹¹⁰, superposition gives a unit line load and a
midspan shear change of 0.5. A single compensation term can lose that
contribution. The native, WASM and browser diagram evaluators now retain
an expansion for ordinates and interval coefficients.

The native and WASM station queries apply the cut-to-peak difference before
rounding. A station request is refused when its rounded ordinate differs from
the one at the peak. Browser queries whose peaks alias a boundary use the
factored ordinate difference at that boundary. This avoids spurious refusals
when independent polynomial evaluations disagree from intermediate rounding.

Spatial piece queries preserve the approached side of a jump through a rounded
coordinate rebase. A bounded combination's plotting candidates yield to both
faces of a jump at the same station. Critical summaries keep the larger maximum
and smaller minimum, and call ordinates tied only when equal. Single-state and
envelope force tables give the physical distance and side of a governing jump.

Reversed moving-load paths preserve an interior axle's distance from the
element end when subtracting the path offset would round it onto that end.
Recompute affected diagrams, moving-load results and critical summaries,
and regenerate reports with governing force locations.
