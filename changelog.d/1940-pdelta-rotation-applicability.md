### Fixed

#### P-Delta correction notices require a model with stiffness

Restrict the P-Delta rotation correction recheck notice to models with members, shells, connectors or springs and a recorded or unknown P-Delta history. Empty models and models with only fixed supports, loads or constraints no longer receive it. Recorded analyses without P-Delta and results already using the correction remain excluded.
