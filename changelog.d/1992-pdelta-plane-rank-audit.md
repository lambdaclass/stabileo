### Fixed

#### Enable the repaired truss reproducers in merge-queue checks (#1969, #1992)

Enable main's two #1969 reproducers as passing regressions now that the truss member-load fix satisfies their unchanged assertions. Add an independent exact-rank audit showing that #1088's released frame has a physical mechanism; retain that test's existing expectations and ignore. No engine result or numerical limit changes.
