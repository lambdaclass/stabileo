### Fixed

#### Recheck saved scoped self-weight and refuse stale targets during renumbering

Older results receive a recheck notice when selected members may have been underweighted after subdivision. Renumbering refuses to assign a missing self-weight target's ID even if another ID in the selector is malformed. (#2565)
