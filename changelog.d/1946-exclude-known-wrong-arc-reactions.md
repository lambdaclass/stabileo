### Fixed

#### Exclude known-wrong arc reactions from frozen references (#1946)

Exclude all three arc-length input/output pairs affected by the open missing-reactions defect #1949 from the live frozen reference set (#1946). Keep an issue-keyed exclusion inventory, reject attempts to freeze excluded models, and retain historical defect evidence and the per-file open-issue review. PR #1952 restores the cases with corrected outputs; this change does not alter engine results.
