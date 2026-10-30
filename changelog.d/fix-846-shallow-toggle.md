### Fixed
#### Verify shallow-toggle snap-through against the matching structural model (2026-10-29)

The shallow-toggle benchmark compared rigid-jointed frame elements against an axial-only truss formula and demanded a limit point that the frame does not have over apex inversion. Use true truss elements for the exact snap-through reference, trace both limit points, and check every equilibrium point and forward displacement increment. Preserve the original frame geometry and stiffness in a separate test against its independently derived energy reference. Tighten the limit-point validation so an incomplete positive-load path cannot pass. This corrects tests and references only; production solver results are unchanged. Resolves #846.
