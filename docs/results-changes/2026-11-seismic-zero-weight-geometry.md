# Static seismic loads account for zero-weight structural geometry

PR #2316. 2026-11-19.

The static planner uses every structural story above the lowest support to
calculate building height and story count for the period and applicability
checks. Positive participating seismic weight still determines where inertial
loads act. The planner also refuses offsets on members used to determine the
seismic footprint, regardless of their weight. Joint centerlines alone can
understate the eccentricity and the accidental torsion in an offset model.

In the regression model, the mass-bearing story is at 4 m and the zero-weight
roof is at 16 m. The approximate steel-frame period changes from 0.21948 s to
0.66533 s. With the specified elastic code settings, base shear changes from
2.46667 kN to 2.45293 kN, and the member loading stays on the same physical span.
A four-story regression model with a zero-weight roof at 12.5 m is now refused
under its configured static height limit.

In the offset regression model, the transverse physical footprint increases
from 10 m to 12 m when one massless edge end moves outward. The earlier planner
generated accidental torsion using 10 m in both cases. The offset model now
returns a member-geometry refusal.

Regenerate affected E cases and repeat the analyses, combinations and design
checks that use them. A refusal means the planner cannot regenerate the
affected static loads for that model.
