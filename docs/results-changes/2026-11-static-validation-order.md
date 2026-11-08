# Static input validation has one refusal order

## Static input validation has one refusal order

The support-rule branch added a support-only check at the start of the load-session
constructors. Regular and typed static solves reached that check inside the full input
validator, after earlier checks. An input with both unsupported left-handed axes and a
support conflict therefore reported different first errors. The same mismatch occurred
with invalid section properties, unknown support types and invalid inclined normals.
Sessions also cleared the initial loads before full validation, changing which error won
when both a load reference and a material were invalid.

Both session constructors now call the shared dimension-specific input validator before
clearing their loads. The prepared paths validate before numbering, model guards or
curved-beam expansion. A constrained 3D solve validates the original input before expansion
and uses the same validator before its model guards. The typed 2D path reaches the same
prepared validator; typed 3D input uses the ordinary 3D solver. Expanded 3D models retain
their validation before assembly. No entry point has a separate support-validation sequence.

## What moves

For models with several faults, the first refusal message and structured diagnostic may
change. Invalid initial loads are now checked when constructing a session, including a
constrained session, rather than being discarded first. Validation precedence comes from
`validate_input_2d` and `validate_input_3d_for_analysis`, including the support checks in
those sequences. Both rigid/spring contradictions and earlier input faults remain errors. A prescribed
displacement on a free elastic DOF is still refused; its message now names the spring
instead of describing only the unset rigid-restraint flag.

Seven reproducers were committed first in `abca82b34`, all marked
`#[ignore = "known wrong result: #1780"]`, and all failed when explicitly run. Six compare
first refusals across regular, prepared, typed and constrained/unconstrained session paths.
The seventh detects a contradictory support in the stable certificate fixture builder.
The fix removes their ignores. The existing metamorphic parity test and fuzz generator
are unchanged.

Other branch-induced CI failures came from tests expecting the former spring-precedence
contract. Stable 3D certificate fixtures and the second-order spring control now explicitly
release the spring DOF. The settlement certificate control likewise puts its spring on a
free DOF. Historical metamorphic inputs are retained and checked for structured conflict
refusals; separate explicit-support controls retain their numerical baselines and invariant
assertions. In 2D these controls remove springs from rigid DOFs; in 3D they release rigid
flags on elastic DOFs. Random certificate and determinism checks retain every previous
seed and add seeds to meet their unchanged solved-model quotas. No tolerance, numerical
baseline or assertion is relaxed.

The registry entry `static-input-validation-order` flags both model dimensions conservatively.
Valid saved models are generally unaffected. This correction changes refusal ordering and
validation timing, not the numerical solution of valid inputs. It introduces no newly found
wrong design result requiring a separate safety advisory; the underlying contradictory-support
result defect is documented in [SA-2026-049](../advisories/SA-2026-049-support-spring-conflicts.md).
This branch correction is not a release or deployment claim.
