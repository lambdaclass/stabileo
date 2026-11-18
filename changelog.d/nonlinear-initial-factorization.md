### Performance
#### Reuse the initial matrix across nonlinear load cases (2026-11-17)

Nonlinear combination analysis retains one prepared linear solve while its full
structural input matches. Changed members, supports, or prescribed displacements
use an independent solve. The preparation is released on completion or failure;
active-set iterations and per-load checks remain unchanged.
