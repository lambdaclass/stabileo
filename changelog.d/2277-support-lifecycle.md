### Fixed
#### Preserve recorded support restraints and reset preset axes (#2277)

Copying or loading a recorded support preserves its type and any stated restraints. A bare `rollerZ` in a space model requires an explicit restraint choice before solving. Selecting a different preset uses its own restraints and frame. JSON fixtures replay their geometry and loads in the recorded coordinates before the workspace selects a presentation.
