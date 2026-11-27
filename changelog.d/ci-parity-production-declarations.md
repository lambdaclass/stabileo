### Fixed
#### Production parity accepts declared edits that already landed on the target (2026-11-27)

CI validates each incoming PR’s declared production paths against the changes made by that PR. When building the reference, it replays only the declared paths that differ between the build snapshots. A matching edit on the target no longer blocks the build.
