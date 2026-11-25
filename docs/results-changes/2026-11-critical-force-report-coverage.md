# Member force peaks and critical envelopes

A member force peak in the calculation report includes the section just inside
each end. Single-result and envelope calculation reports now use this rule in both
dimensions. A shear of 10 on the exterior I face and a point action of
−5 at I leave an inward shear of 5 when the span has no other interior action.

Critical force envelopes now build a shared list of stations and faces for each
member. Each combination is evaluated at every station on that list. A 100 kN
constant axial force therefore remains a candidate on both faces of a
point-load cut introduced by another combination. Workbook envelope exports
use the same station list.

For a uniform full-span load, the recovered moment follows
`M(x) = M_I + V_I x + q x²/2` with signed local actions. When transfer by the
interval polynomial fails, the station is accepted only if the exact peak
and exact station ordinate both round to the reported value. This allows the
tubular-truss check to use its verified moment station. The seven-storey
station that fails that verification still follows the existing refusal.

Regenerate the affected reports and critical envelope exports.
