### Fixed
#### Modal analysis says so when it returns fewer modes than you asked for (2026-11-03)

Asking for more modes than the model has free degrees of freedom (10 modes of a 3-DOF model)
returned the modes there are with no diagnostic, because the request was trimmed before the
short-spectrum check saw it (#1287). The diagnostic now compares with what you asked for, in 2D
and 3D. The modes themselves do not change.
