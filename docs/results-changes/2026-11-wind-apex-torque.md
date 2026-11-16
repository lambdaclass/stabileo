# Finite eccentric wind loading at carrier apexes

PR: #2220. Date: 2026-11-16. This refusal exists on the unmerged wind branch.

Physical carriers meeting at an endpoint could refuse eccentric wind cases,
including building cases 2 and 4. The planner then rolled back all generated
wind cases. The continuous polar-inertia certificate treated a unit torque
as independent of the vanishing physical width.

For two carriers at y = ±r(z) under pressure p(z), physical width is 2r and
requested torque per height is 2erp. Transverse force densities ∓ep form that
couple and remain finite at the endpoint. Each member also receives its share
rp of the direct pressure. The combined member loading has a finite limit even
though the unit-torque transfer alone is singular.

The shared height-field path now recognizes a common physical endpoint of the
continuous carrier chains. Straight carriers scale homothetically from that
endpoint. A supported reference section therefore provides the constant product
of physical width and unit-torque force transfer throughout the band. Pressure
multiplies that product before integration, avoiding division by a vanishing
polar inertia. It also supplies the finite endpoint member-force limit. Net
pressure force and torque vanish at the apex; individual couple forces can
remain nonzero. This corrects the earlier apex record's zero-couple description.

Carrier chains, rather than mesh segments, determine the reference section.
The reference uses the existing plan-transfer function and unchanged polar
limit. Declared-width endpoints, small positive necks and interior crossings
retain continuous certification and existing refusals. Quadrature, moment
acceptance, sign checks, subdivision limits and all tolerances are unchanged.

Regressions check each carrier's loading against an independent affine hand
model through direct fields, building cases, solid signs, the planner and the
complete load plan. Lower and upper apexes, subdivision, rotation, reflection
and both eccentricity signs are covered. Generated loads reach isolated
cantilevers through 2D/3D linear and P-delta solvers in WASM and native code.
Shear, bending and torsion at stations and tip displacement are checked.
Existing varying-pressure apex, narrow-neck and boundary controls remain.
Member-force comparisons now require exactly the model's element IDs in both
outputs, rejecting empty, partial, duplicate and extra rows before comparing.
The Hungarian pressure-field explanation also preserves the separate minimum
horizontal cases.

Regenerate W/Wa and rerun analyses, combinations and design checks. Re-solving
stored loads does not regenerate them. No new advisory is assigned.
