### Fixed

#### Keep the #1901 replay consistent with physical nonlinear equilibrium (#1992)

After merging main's nonlinear convergence checks, require explicit P-Delta nonconvergence for the original #1901 model, its rotated copy and all three spatial embeddings. Retain the independent linear displacement comparisons and verify the rejected nonlinear iterates with a separate high-precision equilibrium audit. Unloaded copies still converge to their exact zero response. This merge correction changes tests and verification tools; it does not change engine tolerances or add another engine result change beyond main's existing convergence registry entries.
