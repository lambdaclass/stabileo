### Fixed
#### Production unit tests check the complete translation split (2026-11-20)

The production unit lane verifies that every translation appears exactly once across the eager public and app dictionaries, even when the diagram game is disabled. The production bundle still omits the disabled game's navigation label.
