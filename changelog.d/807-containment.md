### BREAKING (results)

#### Safety containment diagnostics (2026-10-29)

- Register safety containment diagnostics (#807, #447): known-issue warnings added; numerical values of retained results are unchanged. Unsafe affected results are withheld with structured refusals. See [Safety containment diagnostics](docs/results-changes/2026-10-containment.md).
- Preserve warnings across influence and moving-load sweeps and standalone spectral certification; warn on all 3D buckling factors pending #818. Run the read-only containment audit as an advisory check. Numerical values are unchanged.
- Preserve the model viewport during containment, retire failed advanced reruns, and carry localized refusals and warnings through tables and exports. Warn on MITC4 shell convergence uncertainty (#810); non-static rotated-shell operations remain available.
