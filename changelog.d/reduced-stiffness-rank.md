### BREAKING (results)
#### Refuse unresolved reduced stiffness rank (2026-11-25)

Linear, staged, modal and covered nonlinear analyses now refuse when roundoff can hide a mechanism in the reduced stiffness. A load balanced entirely by restraints can give a zero residual even when the structure can move freely.
