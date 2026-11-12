### BREAKING (results)

#### Nonlinear convergence follows physical equilibrium

- Nonlinear equilibrium checks use a shared frame-invariant, dimensionally consistent metric. Rotated and mirrored support-only loads no longer cause false P-Delta or fiber convergence refusals (#761). P-Delta also checks the equilibrium of its final iterate; fiber, corotational, material nonlinear, arc-length and displacement-control corrections share the same residual test. Re-run affected nonlinear analyses; convergence, carried load and the final accepted iterate can change. See [the results-change record](docs/results-changes/2026-11-nonlinear-convergence.md).
