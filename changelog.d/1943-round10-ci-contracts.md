### Fixed

#### Align staged and plastic regression checks with their CI contracts

- Require the unrestrained plastic 3D frame regression to propagate the initial elastic stability refusal, while retaining the valid-frame hinge check (#1943).
- Declare the unloaded-stage and reaction assertion helpers as prerequisites of their targeted script tests so the CI script inventory includes both imported modules.
