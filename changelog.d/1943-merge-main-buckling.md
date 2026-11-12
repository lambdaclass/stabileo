### Fixed

#### Keep staged and buckling regression coverage together

- Preserve both staged stability and buckling original-pencil WASM checks in CI and their Make targets when merging main into PR #1943.
- Retain the independent provenance tests for kinematic translation and buckling result changes.
- Mark the accumulated-load unit test explicitly as test-only so the production message-matching guard excludes it while preserving its assertions.
