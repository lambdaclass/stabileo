# SA-2026-004: Analysis results that ignored part of the model before 0.2.0

| | |
|---|---|
| Severity | Critical |
| Status | Published 2026-10-21 (fixed in 0.2.0, released 2026-10-18) |
| Issues / fix | PRs #275, #278, #279, #283, #284, #287, #288, #289, #290, #296, #297, #302 (safety wave), released in **0.2.0** (2026-10-18) |
| Affected versions | every deployment before 2026-10-17; introduction not bisected |
| Re-check registry | `inclined-supports-every-analysis`, `constraints-on-supported-slaves`, `constraints-at-inclined-supports`, `multiple-supports-one-node`, `buckling-axial-from-elongation`, `buckling-2d-linear-stiffness`, `ground-motion-coupled-mass`, `plastic-collapse-corrected`, `connectors-shear-and-dofs`, `nonlinear-solvers-as-given`, `solid-shell-and-mitc4-warping`, `feature-matrix-refusals` (PR #328) |

## Affected features

Modal, harmonic, spectral, buckling, time-history, P-Delta, plastic collapse and nonlinear
analyses; inclined supports, constraints, connectors, shells; the example gallery.

## What was wrong

- **Ground-motion time history** dropped the mass coupled to the supports: up to about **50 % of
  the earthquake load** missing.
- **Plastic collapse** 3D formed hinges only at member ends (up to **2.3× unsafe**); 2D ignored
  unloading hinges and hinges at springs and connectors (150 vs 83.3 in one case).
- **Inclined supports** were treated as global in dynamic and buckling analyses (a rotated portal:
  6.31 Hz instead of 5.67 Hz; a column on an inclined guide buckled at 30.9 instead of 11.4).
- **Constraints on supported nodes were dropped** with only an `OverConstrainedDof` warning.
- **Buckling**: axial force not read from member elongation (λ off by 3× in one case), 2D Kg not
  condensed at hinges, curved-shell buckling 200× too high.
- **P-Delta** member end forces omitted the geometric stiffness; **Timoshenko** members used
  Euler–Bernoulli fixed-end forces (13.6 % off on a short cantilever).
- **Mechanisms solved silently** (singularity threshold 64ε); analyses that could not handle a
  feature solved a simplified model without saying so (now refused by name,
  [FEATURE_MATRIX.md](../verification/FEATURE_MATRIX.md)).
- **Example models** had gravity loads in a horizontal axis or duplicated/unconnected members
  (dead vertical reaction 2 695 → 4 135 kN in `3d-building`).

## How to tell if your model is affected

Any of: inclined supports; constraints (rigid links, diaphragms, EqualDOF, MPC) at supported
nodes; connectors; modal, spectral, harmonic, time-history, buckling, P-Delta, plastic or nonlinear
analyses; shells; or a project started from a gallery example; solved before 2026-10-17.

## Fixed in

0.2.0 (release notes §1.5–1.8).

## Workaround

None needed in 0.2.0. Re-solve; a model that is now refused was being solved without the named
feature.

## What to do with results you already have

Re-run and compare. Dynamic and seismic results, collapse factors and buckling factors from
pre-0.2.0 runs should not be relied on for these models.

## Credits and references

Differential testing against OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos and CalculiX;
the feature matrix; symbolic derivation; the model sanity review (October 2026 safety wave).
