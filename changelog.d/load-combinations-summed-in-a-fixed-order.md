### Fixed
#### Load combinations add their cases in the same order on every solve (2026-11-04)

The engine summed a combination's load cases in hash-map order, which differs between builds and
between the browser and native runs, so a combined force could move in its last digit and flip a
marginal detailing decision (#1341). Cases are now summed in their names' order, every time. The
results snapshot corpus is unchanged, so no results version is registered.
