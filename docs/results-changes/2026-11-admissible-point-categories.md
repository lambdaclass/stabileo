# Constrained point models use admissible DOF categories (2026-11-11)

PR #1940, issue #761, round 5.

The shared nonlinear equilibrium metric determines point-model dimensional
categories from nonzero rows of the free constraint transform. A free-numbered
rotation tied to a fixed node has no admissible motion and cannot create a
rotational scale requirement. The same predicate selects entries for the
physical stiffness traces. Nonzero prescribed restrained motions still count.
Models with active mixed categories still require positive physical scales.

This corrects a false refusal introduced on the unmerged PR branch. Valid
coincident models with translational springs and rotations constrained to a
fixed node can now return their answers in P-Delta, corotational,
material-nonlinear and SSI analyses, including the P-Delta certificate wrapper.
Existing unconstrained point-model scaling and unsupported-constraint refusals
are preserved. Re-run affected refused analyses; solve availability can change.
No new advisory is assigned here.

The WASM loaded-cantilever regression now checks signed translation components
against F_i L / (1000 E A). In the fixture, force is in kN, length in m,
Young's modulus in MPa and area in m². Assembly converts E to kN/m² with the
factor 1000, so the expression returns metres. Reversed and transverse vectors
of the correct magnitude are rejected in both dimensions and for both signs.
This test correction does not itself change engine results.
