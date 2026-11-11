### Fixed

#### Reject nonfinite frozen shell test responses (#1948)

Require finite reference, solver and dense-solution components before reducing displacement errors or norms. Share the native comparison check across the restrained controls and dense/sparse test, add NaN and infinity regressions, and move the test helpers into `engine/tests`. Production engine results are unchanged.
