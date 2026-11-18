### Fixed
#### Wind regression checks retain complete member loading (2026-11-16)

Wind regression tests now preserve both distributed-load endpoints, integrate
trapezoidal carrier loading, and require every numeric force component in both
solver outputs. The flexible-building torsion check expands only its selected
load case, reducing temporary allocations without changing its assertions or
timeout. Identical stationary pressure components share their integral, and
quadrature reuses its constants. Native fixtures retain the generated end
intensities.
