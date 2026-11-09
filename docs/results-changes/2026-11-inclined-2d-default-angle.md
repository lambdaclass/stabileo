# Omitted 2D inclined-support angles use zero consistently

## Omitted 2D inclined-support angles use zero consistently

An `inclinedRoller` with no `angle` denotes the same restraint as `angle: 0.0`.
The shared support reader in the unmerged support-rule branch applied its translation
spring exception only when the angle was present. A positive global `ky` therefore
caused `conflicting_support_spring` for an omitted angle, while explicit zero solved.
The exception now depends on the support type. Ordinary rigid supports still refuse
positive springs on their restrained DOFs; this does not change that contract.

Dense and sparse assembly, constraint frames and reaction recovery now also use the
explicit-zero support frame when the angle is omitted. The zero-angle frame reverses
the tangent axis, so merely changing validation would still leave two arithmetic paths.
The exact serialized-result regression found a P-Delta difference in the final digits
with validation alone. The completed fix retains exact equality between the two forms,
including settlements, constrained solves and the forced sparse P-Delta path. No
solver tolerance, baseline or assertion is relaxed.

## What moves

An omitted angle with a positive `ky` can now solve, just as explicit zero already did.
Omitted-angle supports that already solved can change final floating-point digits as
assembly and recovery now take the same frame path as explicit zero. The regression
fixtures compare complete serialized results, including displacements, reactions,
member forces and P-Delta convergence metadata. The registry entry
`inclined-2d-default-angle` flags all 2D projects with inclined supports, including
explicit angles and models without springs that may be unaffected.

This correction concerns refusal and representation consistency. No incorrect published
engineering result has been identified by these reproducers, so no new safety advisory
is added. The support-rule branch remains local and unreleased; this is not a deployment
claim. The existing advisory for contradictory rigid supports and springs remains
[SA-2026-049](../advisories/SA-2026-049-support-spring-conflicts.md).

## P-Delta issue #971 remains tracked

The original `fuzz_rich_2d/20772` is correctly refused: support 3 at node 6 is `guidedZ`
with a positive `kx` on its rigid X restraint. Removing only that `kx` gives the valid
`fuzz_rich_2d/20772-rigid-control`. The base P-Delta solve converges, but its unit-scaled
copy does not, under both quick-tier seeds. This is a masked finding, not a fix of #971.
The two original expected-failure entries are replaced by entries for the valid control.
The control retains the original transform stream by compensating for the case-name
hash in its RNG seed. Only P-Delta runs this additional control; the unchanged original
continues to exercise the normal quick corpus and has a precise conflict-refusal check.
This does not modify the P-Delta solver or its convergence criteria.
