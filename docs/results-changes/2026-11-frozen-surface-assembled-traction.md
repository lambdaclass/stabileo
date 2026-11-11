# Frozen surface contacts check the equilibrated spring force (2026-11-10)

PR #1921 final round; issue #432. Results-change entry `frozen-surface-assembled-traction`.

The final undamped contact solve assembles each surface spring on the preceding geometry.
When the master rotates, the signed gap on the returned geometry differs from the extension
of that assembled spring. Using only the final gap for the no-tension check could accept a
tensile spring and report it as compressive. Validation now projects the final deformed
positions using the normal and interpolation weights of the actual final assembly, including
the reference-position term and the AL multiplier. The opening check still uses the final gap.
Reported surface normal force uses that same assembled spring force. Contact tolerances and
the bearing, opening and no-tension conditions are unchanged.

The rotating-master regression uses the existing surface-bearing fixture with its upper master
endpoint attached to a frame, the slave tangential load multiplied by four, and two AL passes.
At the previous head its final gap is -2.1995743241684833 m, while the assembled signed spring
force divided by stiffness is +0.0025657689218886587 m: tension. The previous check returned a
closed contact and reported +222237.79645034365 kN compression, with `converged=false`.
The corrected check returns `contact_state_invalid`, severity error, phase `node_to_surface`,
naming slave node 2, and withholds the result. The former acceptance test for this same invalid
fixture now requires that structured refusal. Fixed-master frozen and unfrozen AL controls
still converge and satisfy their unchanged normal-force and equilibrium assertions.

The linear sparse/dense truss-and-connector parity fixture also contained native cable members.
It now uses trusses for those linear members; its sparse-path, displacement, reaction and force
parity assertions are unchanged. Unsupported linear cable inputs remain refused.

The historical SA-2026-059 source now lives beside its engine imports. Its influence replay
checks truss identity and the absence of warnings without claiming that influence coefficients
are loaded cable forces. The basic toolbar control checks compressive force and the recorded
#1551 warning. Panel replays parse complete function declarations through TypeScript.

The tensile acceptance was introduced on this unmerged branch. Recorded origin/main retains
the NL-13 contact warning, so this correction does not establish a new silent main/release
result. Existing SA-2026-059 cable evidence and advisory decisions remain with the coordinator.
