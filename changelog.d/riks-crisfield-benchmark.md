### Added
#### Arc-length benchmarks: Riks and Crisfield (2026-10-29)

Added a Riks–Crisfield research page that runs Stabileo’s production arc-length solver on shared two-bar cases, compares native and browser WASM results and opens the models in the editor. A limit point now counts only when the load drops between converged frames; an unreached limit is shown as not evaluated. The page says the run passes the upper limit point and does not reach the lower limit, and that it is a method benchmark against analytical equilibrium and native results, not a reproduction of the papers' examples. Per-metric tolerances were tightened from 5 % (peak load 1e-3, peak displacement 5e-3, path residual 5e-5) with a finer step and parabolic peak interpolation; the page is in six languages.
