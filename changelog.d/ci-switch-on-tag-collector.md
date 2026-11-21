### Fixed
#### Switch-on browser test collection (2026-11-21)

CI uses Playwright's reported `@switch-on` tags to collect browser specs and ignores ordinary assertions that mention the tag. It reports an error when a spec in the expected inventory or a spec with a reported `@switch-on` tag contributes no active tagged cases, even when Playwright excludes a registered spec that imports its tag.
