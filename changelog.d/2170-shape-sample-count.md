### Fixed
#### Teaching shape tests require every recovered sample (2026-11-16)

Require all 21 samples in both the loaded teaching displacement sketch and the load-free mode before comparing ordinates, so empty or truncated recovery cannot pass the fixed-fixed couple regression tests (PR #2170). Preserve the member-recovery and snow-ridge advisories and saved-project notices when merging main. Engine results are unchanged.
