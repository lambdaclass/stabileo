### Fixed
#### Seismic load generation smoke tests (2026-11-18)

The static and modal browser tests now model a flat shell as the floor mass carrier. They check that generated seismic cases apply loads to the frame and shell, and that a floor requiring unsupported eccentric member loading blocks Apply. (#2316)
