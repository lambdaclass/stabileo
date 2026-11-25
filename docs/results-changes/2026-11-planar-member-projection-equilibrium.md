# Preserve equilibrium in planar nonlinear member projections (2026-11-25)

PR #2567, final review of issue #2560.

A frame with chord (3, 4) carries a transverse point force of 5 × 2^52
at its tip. Its global force is (−4, 3) × 2^52, so the balancing nodal
force (4, −3) × 2^52 leaves zero tip reaction. The review parent
reported a tip reaction of (1, 0.5). The same input gave zero on
origin/main at `0ab2f4f38`.

A frame with reference chord (5, 0) rotates to (3, 4) without stretching.
The dead tip action (−4, 3) × 2^52 in reference axes is perpendicular to
the displaced chord, so its recovered axial component is zero. The
review parent reported −1. Origin/main reported −2. Both returned a
converged result without diagnostics.

Assembly combines member and nodal forces in rational arithmetic using
the reference chord components over the represented length. Recovery
combines dead actions before projecting them with the exact chord dot
and cross products over a common normalization. Both paths round after
combining the action terms. The exact load path shares the same matched
inclined support basis for applied forces and displacement recovery.

Recheck saved planar co-rotation, arc-length and displacement-control
results for models with member loads. The corrected applied force
vector can change the solution path, displacements and support reactions
as well as recovered member end forces.
