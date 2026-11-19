# Static seismic inertia stays on story-level members and shells

PR #2316. 2026-11-19.

Each static story force is assigned in proportion to participating mass.
The mass already at the story elevation produces distributed member loads
and in-plane shell or plate tractions. Mass from columns, braces and
other members crossing the elevation bands produces nodal loads at the
receiving story. The case generator accounts for all three load types
when creating seismic combinations.

The roof-beam fixture has a 4 m span and a 2 kN/m transverse inertia
load. Endpoint forces gave a zero moment and zero displacement at
midspan with the span ends laterally restrained. With member loading,
the simply supported span has a 4 kN·m midspan moment and a transverse
deflection of 1/3000 m. The fixed-ended span has end-moment magnitudes
of 8/3 kN·m and a midspan deflection of 1/15000 m. The test derives
these values by integrating the beam equations and checks the beam's
shear and torsion through the span.

Orthogonal static cases still support signed accidental eccentricity.
The planner refuses the 45° selection with medium or extreme torsional
irregularity because that case requires an eccentricity calculation
specific to the diagonal direction. The 45° case remains available for
low torsional irregularity.

Regenerate the affected E cases and repeat analyses, combinations and
design checks using those cases.
