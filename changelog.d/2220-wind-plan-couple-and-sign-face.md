### BREAKING (results)
#### Wind eccentricity acts across the physical plan and sign width excludes supports (2026-11-16)

Generated building cases 2 and 4 now distribute eccentric torsion as a force
couple on the active cross-section before transferring it to member endpoints.
This corrects member forces and reactions in frames without a rigid diaphragm.
Solid-sign coefficients and eccentricity use the face above its clearance,
including carrier intersections at that height, instead of a wider support
base. The enclosure editor can remove wall records for triangular buildings.
Spanish instructions use voseo.

The coordinator-assigned advisories SA-2026-076 (#2203), SA-2026-077 (#2204)
and SA-2026-078 (#2205) are cataloged in all public locales. PR #2220 is pending
merge and release. #2206 is conservative and has no advisory. Review enclosure
records, regenerate W and Wa, then rerun analyses, combinations and design
checks. Re-solving stored loads alone does not correct them. See the
[results-change record](../docs/results-changes/2026-11-wind-plan-couple-and-sign-face.md).
