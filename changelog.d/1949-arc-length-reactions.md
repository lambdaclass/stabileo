### BREAKING (results)
#### Recover reactions from the reported equilibrium state (2026-11-11)

Arc-length and displacement control recover support reactions
and member loading at the final load factor. Staged, P-Delta, corotational,
material-nonlinear, contact, cable, Winkler and Guyan analyses include forces transferred through
constraints to restrained masters in 2D and 3D. Nonlinear constraint forces use
the final internal-force residual. Unavailable time-history total reactions and
undetermined stages without physical stiffness receive explicit diagnostics.
Stages whose active restraints disagree with the solved DOFs are refused;
fully determined constraint-only stages recover their actual reactions.
Guyan 3D also recovers previously omitted member forces. P-Delta states
that fail finite-displacement equilibrium are explicitly diagnosed. See the
[results-change write-up](../docs/results-changes/2026-11-arc-length-reactions.md)
(#1949).
