### Fixed
#### "Check an exported report…" catches a report with sections removed (2026-11-05)

- Fix #1402 (#1416): the check printed a report's tables again from its embedded settings, which
  nothing bound, so a report with a section switched off and its marker removed still checked as
  reproduced. The fingerprint now records the report's choices and every table it printed, the
  check prints from that record, and a missing, extra or reordered table fails it. A report exported
  before this change checks as incomplete; export it again. No result changes.
