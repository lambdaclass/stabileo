### BREAKING (results)

#### Preserve prescribed master motion in constrained solutions (2026-11-12)

Staged, Winkler, contact, material nonlinear, 2D corotational and arc-length analyses now carry prescribed constraint-master settlements and rotations into slave displacements and equilibrium (#2008). Every constraint expansion explicitly selects prescribed or homogeneous master motion through one shared API. Cable analyses with cable elements and linear time histories now refuse nonzero prescribed support motion that they previously omitted. Re-run affected analyses; displacements and forces can change. See [the results-change write-up](../docs/results-changes/2026-11-prescribed-master-motion.md).
