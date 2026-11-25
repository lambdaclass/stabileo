# Count each restrained degree of freedom once (2026-11-25)

Issue #1848. Results-change entry `shared-rigid-support-degree`.

When several plain rigid support records share a node, the solver restrains
the union of their degrees of freedom. The kinematic report previously summed
the individual support counts. The published 3D model in #1848 has a fixed
support and a redundant single-axis roller at node 3. Its degree of static
indeterminacy was reported as 1. The equivalent single-support model reports 0.

The 2D and 3D kinematic checks now count the union at each node. The rigid
motion test harness applies the same union before rotating a support so it
can compare physically equivalent restraint sets. In 2D the published #1192
pinned support and redundant roller give the same report and static solution
as the pinned support alone, before and after rotation. A loaded equivalent
also verifies reflection and rotation against the original solution. The #1848
replay asserts degree 0 in the original and rotated frames.

Recheck the degree of static indeterminacy, classification and diagnosis on
models with multiple rigid supports at one node. Displacements, reactions and
member forces use the same restraint DOFs as before.
