### Fixed

#### Correct soundness audit attribution and evidence checks

- Match all required reference-model fields and use each MacNeal frame observation's own model and signed displacement or rotation. Rerun the previously empty 3D corotational and buckling selections on both pinned revisions; all 51 additional frozen inputs are unchanged.
- Abort audit scripts on failed setup, integrity checks or incomplete replay; reject suites that execute zero tests. Scan revision history before claiming an earliest change, and label the historical bisections as adjacent-boundary evidence with unverified earliest attribution.
- Mark the two frozen arch outputs with missing support reactions as known wrong under #1949, backed by expected-failure checks. Clarify the audit's follow-up result registrations.
