### Fixed
#### Plastic collapse no longer stops early under distributed loads (2026-10-30)

When a hinge would unload as the structure turned into a false mechanism, the step-by-step collapse
stopped there and reported a low collapse factor: the portal frame example gave 64.06 instead of
71.30. Those hinges now close and the analysis continues. Re-check plastic collapse factors of frames
with distributed loads.
