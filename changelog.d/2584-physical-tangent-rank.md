### Fixed

#### Check nonlinear rank before applying artificial rotation pins

Corotational and material nonlinear rank checks use the physical stiffness. A pin on an unused rotation can no longer supply rank or cause a rank refusal. A released rotation that moves an offset rigid-link slave still requires physical restraint.
