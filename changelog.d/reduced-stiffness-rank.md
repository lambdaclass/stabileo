### BREAKING (results)
#### Refuse unresolved reduced stiffness rank (2026-11-25)

Linear, staged, modal and covered nonlinear analyses now refuse when roundoff can hide a mechanism in the reduced stiffness. A load balanced entirely by restraints can give a zero residual even when the structure can move freely.

Carry stiffness rounding through inclined supports and constraints and check the active corotational tangent before reporting convergence. Translate the rank refusal with or without its diagnostic envelope.

Require physical tangent rank before accepting material convergence, retain compatible corotational release cases, and preserve the specific cause in translated rank refusals.
