# Empty cases contribute zero to nonlinear superposition (2026-11-18)

In the integration branch for PR #2283, a nonzero factor could cause a declared empty case to run through the nonlinear solver. A pretensioned cable develops an equilibrium response even without case loads. Superposing that response added the empty case's weighted share of the cable forces, displacements and reactions to the combination and its envelope.

The synchronous and worker-backed solves now exclude cases that have neither assembled solver loads nor case-imposed displacements from both the nonlinear solve queue and the superposition factors. A support settlement still enters once per combination. A combination made only of empty cases with no settlement has no result. A nonzero factor for an undeclared case still causes a refusal.

If you computed combinations using nonlinear superposition with the affected integration build, rerun the combinations and review their responses and envelopes.
