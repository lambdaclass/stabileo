### Fixed
#### Saved-project re-check tests include the notice for every older linear result (2026-11-10)

The store tests now require the exact notice set, including `linear-stability-refusals`, for a frame solved before containment diagnostics. The shell-edit regression acknowledges the older linear result's notice before saving and reopening with new shells. A saved project with no analysis results opens without a notice. This updates test expectations for the existing all-linear re-check policy; application behavior and engine results are unchanged.
