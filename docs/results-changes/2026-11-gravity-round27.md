# Gravity generation refuses unsupported geometry and spans

The load planner previously returned READY for the seven quarantined fixture
variants in #2254 and #2255. They now return BLOCKED with no generated loads.
This is a refusal change; it does not repair the tributary partition.

The geometry exclusions are:

- A shell quad with nonzero plan area whose vertices are not coplanar within
  the existing floating-point plane predicate. Its area and eligibility can
  change when the quad is subdivided. This includes full-stadium and
  la-bombonera.
- A member using the width fallback whose shell-coverage classification
  changes along its axis, including the existing edge and height tolerance bands.
  Deciding coverage only at its midpoint cannot preserve that member's loading
  on subdivision. This includes cad-arch-structure-dxf.
- A frame member at the existing area-load slope eligibility boundary, within
  the coordinate arithmetic error bound. Rotation can change its eligibility.
  This includes geodesic-dome.
- Geometry whose unit-pressure first-moment roundoff budget exceeds the
  existing absolute first-moment regression precision. The budget is eight
  machine epsilons times loaded area times the maximum plan coordinate radius of the loaded carriers.
  The limit is `5e-9`, corresponding to the existing eight-decimal-place
  comparisons. This includes suspension-bridge. The budget is a conservative
  domain restriction, not a new engineering acceptance tolerance.

Generated distributed force and moment spans now pass one shared check before
being returned. Their member geometry must be available and finite, with
positive length. The endpoints must be finite and satisfy
`0 <= a < b <= memberLength`. Both the endpoint difference and any declared
span measure must meet `MIN_NATIVE_MEMBER_LOAD_SPAN` (`1e-12` in the source).
Unsupported densities remain refused; they are never replaced with nodal
forces or endpoint couples. Full-member defaults use the actual member length.
Area layouts retain member lengths so callers without a separate model still
validate their generated spans.

Ordinary coplanar shells, complete shell coverage, uncovered members, members
on either side of the slope boundary and geometry within the precision budget
retain their member loading. Targeted member-force, station, torque and
deflection regressions remain the acceptance checks for supported loading;
matching total force and first moments alone does not certify a partition.

Regenerate stored floor and area loads and rerun analyses, combinations and
dependent design checks. A newly blocked model needs supported geometry or a
separately verified load definition before it can be analysed. Re-solving old
generated loads alone does not validate their generation. The shared planning
checks run before any native or WASM analysis, linear or nonlinear, can receive
newly generated loads. These planner restrictions do not change the solver's
independent validation of manually supplied loads.

The seven failures were replayed on unmerged head `424f77bed`; this record does
not establish a new silently wrong release or origin/main result. No new
advisory is assigned here.
