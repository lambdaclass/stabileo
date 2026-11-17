### Fixed
#### Keep main’s input interval refusals on the gravity branch

- Preserve interval validation before component filtering in both planar and spatial input adapters when merging main; explicitly empty distributed load intervals remain refused as on main (#2219, #2223).
