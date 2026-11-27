
### Fixed

#### Require concurrent member forces for demand and stress

Endpoint demand and section stress refuse envelopes and magnitude combinations,
including when a split member contains one. Member envelope readers validate their
ordinates. Storey sway uses the inward shear at the lower cut for either column
orientation. Moment colours use the larger absolute bending component at each
shared cut.
