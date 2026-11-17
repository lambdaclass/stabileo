### Fixed

#### Keep old-project recheck expectations current

The recheck store regression now requires the round 19 `fixed-beam-directional-spacing` notice for the old concrete-frame snapshot (#2198). Its incomplete cage data cannot rule out the affected checks, so the existing conservative concrete-member applicability remains appropriate. Both SSI registry variants share one exact expected notice list and verify that the round 19 entry accounts for exactly one added notice. Engine results and notice applicability are unchanged.
