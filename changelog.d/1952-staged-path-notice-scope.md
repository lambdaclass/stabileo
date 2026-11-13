### Fixed

#### Limit staged history correction notices to path analyses (#1952)

Require explicit path analysis context as well as members or shells for the staged history results-change entry. Ordinary linear frames and shells retain their existing correction notices. Staged quantities remain covered when path context is present. Engine results, numerical tolerances and result baselines are unchanged.
