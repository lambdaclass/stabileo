### Fixed
#### Switch-on browser test collection (2026-11-21)

CI uses Playwright's reported `@switch-on` tags to collect browser specs and ignores ordinary assertions that mention the tag. Collection rejects tagged specs missing from the registry in either profile and requires every registered spec to contribute an active tagged case in the test profile. The collector regression target installs web dependencies when needed.
