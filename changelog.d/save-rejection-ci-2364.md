### Fixed

#### Restore the save rejection and account gate tests in CI (#2364)

The save rejection and account gate tests preserve the feature exports used to initialize the axes store, so CI can exercise download error propagation and authorization.
