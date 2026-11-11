### Fixed

#### Reuse the unchanged influence-line stiffness between axle positions (2026-11-10)

The influence-line calculator now reuses the existing prepared 2D load session, checks every load case and frees the session on success or failure. Twenty-one strict full-result comparisons agree with independent solves, and the original near-mesh analytical and timeout assertions pass unchanged.
