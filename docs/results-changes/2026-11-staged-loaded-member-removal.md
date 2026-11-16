# Refuse removal of loaded staged members (2026-11-13)

PR #1952, review round 20; containment of #1996.

Removing a member with nonzero internal end force requires redistribution of
its released forces. Staged construction currently accumulates load increments
without implementing that redistribution. Earlier branch containment withheld
forces but retained the old cumulative displacements with a warning. Main can
return the unredistributed displacement and inconsistent forces without warning.

Both dimensions now refuse the complete history before removing a loaded member.
The structured error names #1996 and the member IDs, and returns no result
payload. This also covers cancellation or new loading during the removal stage:
the removal check uses the preceding state. Member end forces are recorded before
any existing result containment clears output collections. The same history
object guards every removal in both staged solvers. Every force component,
including spatial torsion and optional bimoments, is checked against exact zero;
no tolerance or reporting threshold is used. Nonfinite forces cannot establish
that a member is unloaded. A private member-state enum distinguishes loaded, unloaded and uncertified.
A failed physical equilibrium check or an already uncertified history means a
zero recovered end force cannot certify an unloaded member; removing it also refuses
the history. The shared fixture includes this case in both dimensions.

Removing an exactly unloaded member remains supported. Only a pure member
removal can bypass the general stiffness-history warning; simultaneous support,
member addition or shell changes retain the existing containment. A member
removed before loading remains supported. Full redistribution and activation
reference deformations are out of scope.

Reaction recovery now requires a global-displacement type in every shared caller.
Staged output obtains it by converting a separate solver-displacement type;
physical equilibrium checks require the solver type. The reviewed 2D line already
used a shadowed global slice on the parent, so this is a type invariant rather
than a claimed numerical correction. Public staged inclined rigid supports remain
refused in both dimensions. Angled planar springs and spatial global springs
retain their analytical answers.

The native tests restore the original removal scenario and activate the #1996
reproducer with an explicit refusal assertion. The shared removal fixture covers
both dimensions, signed loads, tiny nonzero loads, zero load, loaded and unrelated
unloaded members, removal before loading, and later/final states. Native and WASM
compare supported displacements and reactions with EA/L and load balance.
Rotated planar and spatial recovery also check spring reactions against hand
values through the internal physical recovery path. Planar staged output checks
the global displacement components too. The existing staged
rotation and cancellation tests now require #1996 refusal for loaded removals;
original displacement and reaction checks remain on supported prefixes and
unloaded controls, with unchanged tolerances.

Re-run saved staged histories with member removal. Origin/main replay evidence,
including the exact model and raw output for the coordinator's advisory decision,
is recorded in untracked round-20 handoff notes. No advisory is added here.
