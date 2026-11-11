### Fixed

#### Preserve linear stability and modal basis re-check notices together (2026-11-10)

The PR #1753 merge with main retains both the linear-stability and modal-basis results-change notices in the saved-project version assertions. Both branches’ engine checks, tests, containment records and results-change documentation are preserved. No numerical tolerance or assertion is relaxed; the merge adds no engine result change beyond the merged commits.
