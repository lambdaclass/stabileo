### BREAKING (results)

#### Keep correct P-Delta answers across rotations and unit changes

P-Delta physical recovery now shares the iteration's assembled tangent and
compensated residual arithmetic. Correct answers near the requested residual
criterion remain available; failed physical residuals still withhold forces
and stresses. The sparse tangent also retains small real coefficients instead
of erasing them with an absolute cutoff before physical checking. Reaction recovery binds the assembled support model to its
physical forces, preventing callers from substituting raw inputs. Recheck
saved P-Delta results; see the
[results-change write-up](../docs/results-changes/2026-11-pdelta-compensated-recovery.md)
(#1952).
