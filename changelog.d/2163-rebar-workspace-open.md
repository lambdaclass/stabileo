### Performance
#### Sample reinforcement coordinates once before projecting the workspace (2026-11-15)

Bar-path sampling now copies source coordinates into plain points before bounds and mesh construction. Opening and reopening the reinforcement workspace no longer carry reactive endpoint objects through those passes, and arc sampling reads each source coordinate once. Sampling tolerance, subdivision counts, geometry and analysis results are unchanged. Regression checks count source reads instead of depending on runner speed; the existing workspace timing budgets are unchanged.
