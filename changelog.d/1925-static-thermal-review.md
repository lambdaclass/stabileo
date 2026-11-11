### Added

#### Restrained thermal sign cross-check

Static solver regressions now compare restrained thermal bending with imposed mechanical curvature and the 2D thermal solve. The verification derivation records that positive `dtGradientY` heats the minus-y face and gives a positive start `Mz` reaction. Warping-member reactions must include a bimoment, and thermal load inputs and reference calculations share their fixture constants. Engine results are unchanged (#1925).
