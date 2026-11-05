### Fixed

#### "Check an exported report…" fails closed (2026-11-03)

- The printed tables are now printed again for the result the report's fingerprint records, not
  for the result-set key in the report's editable script: a report whose key and numbers were both
  swapped to another case or combination no longer checks as reproduced. A report whose embedded
  choices were removed, or whose result is not on hand, is incomplete instead of reproduced.
- A report of a case, combination or envelope that is not in the results is refused instead of
  printing what is on screen under that name.
- The report dialog keeps the result set you chose when the model is solved again while it is open.
- The seismic weight puts the whole weight of a member or shell with a node on no level on the
  levels its other nodes are on, instead of leaving out that node's share, and reports it as
  skipped only when no node is on a level. Every node is on a level today, so no result changes.
