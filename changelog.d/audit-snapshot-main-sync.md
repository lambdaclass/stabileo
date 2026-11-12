### Fixed

#### Refresh audit frozen additions after nonlinear main changes

Regenerate the audit-only SSI and arc-length snapshots with the merged engine. Keep main-owned result snapshots unchanged and #1949 defect annotations in the audit report. Check the exact SSI-versus-linear reaction invariant independently so its failure does not prevent the frozen corpus from recording every case.
