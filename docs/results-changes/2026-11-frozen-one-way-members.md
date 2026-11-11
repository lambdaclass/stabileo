# Validate frozen one-way member forces (2026-11-11)

PR #1921, issue #432. Registry entry `frozen-one-way-members`.

Both contact solvers now apply `max_flips` to `element_behaviors`, retain the IDs of
members frozen in any augmented-Lagrangian pass, and validate their recovered axial
end forces after the final solve without damping. A tension-only member cannot carry
compression above `tolerance * EA/L`; a compression-only member cannot carry tension
above the same limit. Non-finite forces or stiffness and non-positive stiffness also
refuse. The structured error is `contact_state_invalid`, severity `error`, with the
member's element ID and phase `element_behavior`. Empty gap and surface lists do not
bypass validation. The member phase has translated refusal text in all six locales,
so it does not display the gap-specific no-tension message for a tension-only member.
No tolerance, baseline or existing assertion was relaxed.

At the reviewed head `0a4f994c2850b6ec086a132defbfc5b7326e1566`, member flip counts
were recorded but did not limit member status changes. Unlike gaps and surface pairs,
these members therefore had no frozen history or final sign validation. The review's
specific claim that a gap-free member remained active in compression with
`maxFlips=0` did not reproduce: the four controls deactivated the member, reported
zero member force and returned `converged=true`. They failed the new refusal assertion
because the member flip limit was ignored. With the fix, the initial active state is
frozen at that limit and incompatible final forces are withheld.

The reproducer uses a frame and a truss in parallel between a fixed node and a free
node, with no gaps or surface pairs. Both have identical axial stiffness. Applied
compression tests `tension_only`; reversed loading tests `compression_only`, in 2D
and 3D, with and without AL enabled. The four tests were first committed with
`#[ignore = "known wrong result: #432"]` and demonstrated failure before the fix.
All four now require structured refusal naming the truss. Permitted-sign controls
still converge and share the load equally. Controls at 99% and 101% of the unchanged
scaled force limit respectively converge and refuse in both dimensions and both
behaviours. A separate gap-bearing control exercises freezing in an early AL pass,
subsequent reactivation and validation on the final geometry while retaining the
member's earlier-pass diagnostic.

Native replay of origin/main `cb671ed319d14ee4d4505a3c43fe233b9607cd27` used its
archived engine sources inside this worktree. All eight gap-free combinations (two
behaviours, two dimensions, AL off/on) returned an inactive member with zero reported
force, zero recovered axial end forces and `converged=true`. Structured diagnostics
were empty, with an ordinary member-oscillation diagnostic. Thus these cases do not
establish silent wrong-sign forces on main. No release replay or new advisory is
claimed; the coordinator retains the advisory decision.
