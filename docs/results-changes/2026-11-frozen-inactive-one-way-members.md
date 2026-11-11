# Validate activation of frozen inactive one-way members (2026-11-11)

Issue #1932, follow-up to PR #1921. Registry entry `frozen-inactive-one-way-members`.

The 2D and 3D contact solvers now validate frozen inactive one-way members using
full-stiffness trial axial force on the final geometry, after the solve without
damping. A tension-only member must reactivate if its trial tensile force exceeds
`tolerance * EA/L`; a compression-only member must reactivate if its trial
compressive force exceeds the same limit. Non-finite trial force also refuses.
The existing recovered axial end-force sign checks remain in place for all frozen
members, including active ones. No tolerance, baseline or assertion was relaxed.
Incompatible states return `contact_state_invalid`, severity `error`, naming the
member in phase `element_behavior`, without a results payload.

At #1921 head `c9153fc30`, a frozen inactive member's recovered axial forces were
replaced by its at-rest forces before validation. In the unloaded truss fixture,
these are zero and satisfy either one-way sign check regardless of final elongation.
The full-stiffness trial force used during status iteration was available, but the
final validator discarded it. The fix supplies that trial force for inactive members
and checks the activation condition alongside recovered-force signs.

The reproducer reuses the parallel frame/truss and gap arrangement from the AL-history
control with AL disabled and `maxFlips=1`. The initial load deactivates the one-way
truss; closure of the initially overlapping gap reverses its elongation, but the
second status change is frozen. Each bar and the gap have stiffness 1000 kN/m. The
gap's initial overlap is 0.1 m and the applied axial load opposes the member's allowed
sign with magnitude 50 kN. With the incorrectly inactive truss, equilibrium gives
`u = (1000 * 0.1 - 50) / (1000 + 1000) = 0.025 m`, so the frame carries 25 kN and the
truss carries zero. With reactivation, the denominator is `1000 + 1000 + 1000`, so
each bar carries `50/3 kN`. Reversing load and gap orientation covers compression-only
behavior. Both dimensions were reproduced.

Commit A (`8bf323885`) adds four refusal tests and one scaled-tolerance test marked
`#[ignore = "known wrong result: #1932"]`. Explicit execution before the fix fails
all five; the sufficient-flip-budget control passes. Commit B removes those ignores:
all six tests pass. Controls at 99% and 101% of the unchanged scaled activation limit
respectively accept the frozen inactive state and refuse it in both dimensions and
both behaviors. With `maxFlips=2`, all four unscaled cases still solve, reactivate the
truss, and recover the hand-derived displacement and axial end forces. Existing
active-member sign, tolerance and AL-history controls remain covered.

A native replay of archived `origin/main` sources at
`cb671ed319d14ee4d4505a3c43fe233b9607cd27`, inside this worktree, checked the same
unscaled fixture with `maxFlips=1`. Main ignores member flip limits and reactivates
the truss. All four combinations converge with active members and axial force
`+50/3 kN` for tension-only or `-50/3 kN` for compression-only, agreeing with the hand
solution. This defect is confined to the unmerged #1921 branch; these cases establish
no silent wrong result on main and require no new advisory. No release replay was run.
