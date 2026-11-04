### Added
#### Newmark (1959): one SDOF step response

A research page at `/research/benchmarks/newmark-1959` runs the production WASM
time-history solver with Newmark average acceleration and compares an undamped
axial SDOF step response with its exact solution. Includes a shared JSON engine
benchmark, precomputed replay, Stabileo viewer, live recomputation, four time steps
showing period elongation, and English, Spanish and Portuguese text. The page says
what it is compared with (exact closed-form solutions and the native engine; no
printed figure is reproduced) and cites the paper as a benchmark, not a reproduction.
The engine test checks every model number and writes 13 checks (discrete error below
1e-10 m, period against Tₙ within 0.5 %, continuous error within the phase-lag bound),
which the page recomputes from the histories it shows. Playback runs at physical speed
with the viewer above the fold, 44 px controls and an accessible slider. Published
figures, damping, harmonic loads, nonlinear and multi-DOF examples are not yet covered.
