### Fixed
#### Load Hungarian research fallback only on Hungarian paths (2026-11-16)

- Keep the research fallback behind a shared lazy module in both navigation shells, restoring unpublished Hungarian research addresses with research expansion disabled without loading the helper on other landings (#2099).
- Remove the redundant bootstrap fallback call, which only ran when Hungarian research was already published.
- Discard stale navigation after loading the helper, preserving the active route.
- Retain existing route allowances, tolerances and ceilings.
