### Fixed

#### Require a coordinate frame when reading result rows (#2364)

Result table readers require an explicit coordinate frame so an equilibrium check cannot silently combine canonical reaction components with loads and coordinates in the user frame.
