# Conditional elastic response recovery in scaled coordinates

Issue #2519 reported a stiffness refusal after changing units on an existing
spatial frame. The conditioned static stiffness passed its rank and factorization
checks in each unit system. The size of the first correction from the mixed-unit
factorization decided whether the displacement could be returned.

Conditionally admitted linear, constrained and staged solves now factor their
reduced stiffness in diagonal energy coordinates. They recover the response with
compensated residual corrections to the original equations and check the final
correction at the existing limit. The correction must also converge within the
existing six-step refinement algorithm. For straight spatial frames where the
member laws represent the entire stiffness, the final recovery also applies the
local member actions before summing forces in the global equations. This recovers
weak terms lost when rounding the assembled stiffness. The stiffness rank, pivot
and physical force checks still apply.

The archived frame solves across its original units, all three harness conversions
and the other representable harness images. Across the four unit systems, the
computed displacements and forces agree with an independent model assembled at
90 decimal digits at the existing accuracy limit. Conditioned responses can
change within that limit after refinement. Re-run analyses on models previously
refused for conditional response accuracy.
