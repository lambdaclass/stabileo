### BREAKING (results)
#### Preserve load targets and accepted paths in experimental nonlinear analysis (2026-11-23)

Experimental 2D co-rotation now solves for the exact final loads and prescribed
positions when continuing from a previous state. Both plane continuation
methods normalize member loads before solving and reporting forces. Arc-length
solves check the weighted radius and restore the last accepted point after a
failed trial. Experimental 3D co-rotation now refuses unsupported shear-centre
offsets on curved beams.
