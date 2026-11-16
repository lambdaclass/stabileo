### Fixed
#### Preserve member assignments during declared tuple conversion (2026-11-16)

- Accept complete declared demand inventories whose combinations or stations belong to different members. Tuple conversion now builds coverage per member while retaining the shared inventory and all missing-demand refusals (#2096, PR #2173).
