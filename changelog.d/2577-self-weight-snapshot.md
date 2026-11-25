### Fixed

#### Capture projected self-weight with the solve mesh

Asynchronous spatial solves with nonlinear behavior or P-Delta combinations capture the self-weight source groups, target IDs, and member mappings together with the analysis mesh. An edit to the source model cannot change the self-weight selected for that solve. (#2565)
