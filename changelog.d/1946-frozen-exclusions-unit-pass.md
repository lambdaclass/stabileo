### Fixed

#### Run frozen exclusion policy checks in the web unit pass (#1946)

Move the frozen reference exclusion policy tests out of the results-only test directory. These tests check exclusion policy and file inventories rather than compare frozen engine outputs. Preserve the exact results-pass inventory and add a regression check that the exclusion policy tests remain in the unit pass.
