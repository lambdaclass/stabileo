### Fixed

#### Preserve the stated pile and detailing settings when reinforcement sheets are disabled (2026-11-28)

Opening and resaving a project with sheets disabled preserves the pile definition, founding elevation, presumed bearing pressure, aggregate and minimum tie spacing as supplied. The sheet editor continues to validate and apply its own design assumptions when enabled.

Slab and wall bar lists also keep their supplied order while both their consumers are disabled. Either the unified plate editor or reinforcement sheets can still read the lists it needs.
