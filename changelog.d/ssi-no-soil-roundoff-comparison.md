### Fixed

#### Compare no-soil SSI reactions with the shared numerical comparator

The 3D no-soil SSI regression now uses the existing results comparison rule for cross-solver reactions, while keeping frozen outputs exact. On origin/main the vertical reaction differs from linear by 3.552713678800501e-15 (8.881784197001279e-17 of the largest reaction); both answers balance the input loads. Add independent load-balance checks and controls rejecting changed, missing, relabelled and non-finite reactions. Engine results are unchanged.
