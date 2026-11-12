### Fixed

#### Cover every affected reaction result with a PR re-check notice (#1952)

Check the union of this PR’s notices for P-Delta equilibrium, constrained
nonlinear recovery, configured and recorded time histories, and path results.
Extend the dedicated P-Delta notice to non-frame structural contexts and add a
scoped time-history reaction-availability notice. Unrelated static fields and
current results remain excluded; engine results and tolerances are unchanged.
