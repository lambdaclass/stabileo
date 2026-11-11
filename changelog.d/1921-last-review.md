### Fixed
#### Require assembled bearing and distinguish staged solver failures (2026-11-11)

Active frozen contact states must carry assembled compression consistent with penetration.
Closed surface pairs with tensile assembled force are refused instead of reporting zero force.
Staged cable factorization and iteration failures now return solver errors; the input and
tension gates retain `cable_analysis_required`, using an order-independent force lookup.
The staged cable exception and superseded contact notice are documented accurately, and the
panel refusal regression verifies clearing a previously successful result from both stores
(#432, #417; PR #1921).
