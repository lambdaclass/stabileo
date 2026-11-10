# Staged cable parity requires verified tension (2026-11-10)

PR #1921; issue #417 (SP-14). Results-change entry `staged-cable-tension-parity`.

The former staged dense/sparse fixture checked only that cable force records existed. On
origin/main b8851b21a1d451431596efa4fba9eb30825c351b, cable 103 has equal start/end axial
forces of -112.13571374430562 kN on the 20-element mesh and -111.17566620424299 kN on the
24-element mesh. Cables 101 and 102 remain tensile. Both meshes return the SP-14 warning
for #417, as well as NUM-INVARIANCE. This native replay therefore establishes a warned
wrong result, not a new silent-result advisory. Existing web advisory decisions remain with
the coordinator; no new advisory was added.

The original fixture is retained as a separate test requiring identical structured
`cable_analysis_required` refusals on both paths, severity error, naming cable 103 and
withholding results. For numerical parity, the pylon top is fixed to represent an anchorage
braced to a rigid abutment. This prevents lateral pylon motion from shortening the far stay
under the existing downward deck load. No load magnitude, material, section or parity
tolerance changed. The 20-element and 24-element models remain on opposite sides of
SPARSE_THRESHOLD, verified from their actual DOF numbering. All three stays must have
positive finite axial forces at both ends. The relative midspan tolerance remains 0.05.

The shared linear validator refused every native cable before the staged solver could run
its own Ernst iteration, including the anchored tensile control. The 2D staged entry now
permits this limited configuration: cables first activated in the final stage, only nodal
loads, no earlier applied loads, no prestress, no nonzero imposed support displacements and
no constraints. These limits avoid extending acceptance to histories, load recovery and
constraint handling that this cable iteration does not verify. Models outside this scope
retain the structured cable-analysis refusal. The dedicated cable solver remains the route
for general cable analysis, and all other analysis entry points retain their restrictions.

Cable iteration now propagates factorization failure and refuses exhaustion of the existing
iteration budget instead of silently keeping its previous displacement state. Its iteration
limit and convergence tolerance are unchanged. After force recovery, each active cable must
have positive finite start and end forces; zero, compressive, missing or non-finite cable
force records withhold the result. Member loads are excluded from the accepted scope, so
interior axial load reversals cannot evade these endpoint checks. The original compressive
fixture is refused, including after the new input gate permits its trial solve.

Compared with the prior PR head, the anchored tensile control changes from refusal to
numerical staged results. Existing accepted numerical formulas and tolerances are unchanged.
Tests cover the original compressed stay, unloaded and reverse-loaded stays, earlier loading
or cable activation, prestress, imposed displacement, member loading and constraints on both
meshes. #417 remains refused for unsupported analyses and for the compressive staged case;
this change does not declare that issue generally solved by the staged solver.
