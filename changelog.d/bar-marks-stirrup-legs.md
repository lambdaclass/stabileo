### Fixed
#### The verification report's bar marks count every stirrup leg, and its table is translated (2026-10-23)

The estimated bar marks of the PRO verification report read each stirrup's number of legs and
dropped it: a 4-leg stirrup was scheduled as one 2-leg hoop, so its cut list and steel weight left
out the inner legs. They are now listed as crossties (two per hoop for a 4-leg stirrup, across the
depth, hooked at both ends), and beams with different leg counts are no longer grouped as one mark.
The table's labels named keys that do not exist (`report.bm*`), so it printed the keys in every
language; it now uses the app's `pro.bm*` strings. Quantities only: no design check changes.
Found while clearing the type-check baseline (an unused `legs`).
