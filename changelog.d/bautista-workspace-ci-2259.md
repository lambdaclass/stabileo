### Fixed
#### Keep framed snapshots in their workspace dimension

- Use the shared workspace classifier for explicit snapshot modes; educational and Basic 2D models retain their plane geometry and loads with zero-depth nodes (#2259).
- Preserve dimension inference for snapshots without a mode and verify that the axes notice cannot excuse unrelated solver-result changes in the legacy judge (#2259).
