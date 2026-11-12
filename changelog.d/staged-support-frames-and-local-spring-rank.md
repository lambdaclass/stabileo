### Fixed

#### Staged support frames and local kinematic spring rank

- Keep staged 2D cumulative loads and recovery in their assembled support basis, with global components for recovery; public inclined-stage refusals remain in place. Kinematic spring checks use stiffness local to constraint-connected directions, so unrelated stiff members cannot create false mechanisms. Staged cancellation checks require every support reaction row (PR #1943).
