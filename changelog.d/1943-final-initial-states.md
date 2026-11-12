### Fixed
#### Initial plastic refusals and unloaded staged rotations

- Route every initial 3D plastic state through the regular elastic solver so conditioning refusals cannot become silent zero collapse factors through the hinge fallback. Permit exact cancellation of accumulated moments when member removal leaves a zero stiffness column; retain refusals for every nonzero accumulated moment. Require exact node and element identities in the staged settlement WASM reference (#1846, #1943).
