# Standalone gravity toggle after workbook import (2026-11-20)

## Standalone gravity toggle

A SelfWeight workbook row with source `single` records a standalone gravity setting and turns on the self-weight toggle when the workbook is imported. Previously the imported setting forced gravity into the solve even after the toggle was turned off. A saved project could restore the setting and the off toggle when Global Axes was disabled.

The 2D and 3D solve adapters now use the toggle to decide whether to add standalone gravity for these models. Case and combination solves still use their case rules. There is no change to how the solver distributes or balances an applied gravity load.

Recheck standalone results from an imported model that was solved with self-weight off. For a fixed cantilever, the downward tip force alone should balance the vertical support reaction when the toggle is off. With it on, the reaction must also balance the member weight calculated from the fixture's density, section area and length.
