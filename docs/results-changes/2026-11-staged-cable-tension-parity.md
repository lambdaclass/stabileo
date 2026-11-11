# Staged cable exception withdrawn (2026-11-11)

PR #1921; issue #417 (SP-14). Results-change entry `staged-cable-tension-parity`.

The former staged dense/sparse fixture checked only that cable force records existed. On
origin/main b8851b21a1d451431596efa4fba9eb30825c351b, cable 103 has equal start/end axial
forces of -112.13571374430562 kN on the 20-element mesh and -111.17566620424299 kN on the
24-element mesh. Cables 101 and 102 remain tensile. Both meshes return the SP-14 warning
for #417, as well as NUM-INVARIANCE. This native replay therefore establishes a warned
wrong result, not a new silent-result advisory. Existing web advisory decisions remain with
the coordinator; no new advisory was added.

The staged exception introduced on this unmerged branch is withdrawn. Positive end forces
and convergence of an Ernst stiffness iteration do not establish cable equilibrium when sag
matters: Ernst stiffness is a tangent, and treating it as a secant is the SP-12 defect.
Both 2D and 3D staged analysis now refuse every cable with `cable_analysis_required` before
assembly. See the [coordinator correction](2026-11-staged-cable-refusal-and-contact-tolerance.md).

The cable fixture checks identical structured refusals on dense and sparse model sizes.
Numerical dense/sparse staged parity uses explicit truss stays, with the original parity
threshold and independent linear references. The dedicated cable solver remains available.
