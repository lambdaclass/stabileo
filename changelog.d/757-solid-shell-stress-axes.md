### BREAKING (results)

#### Solid-shell stresses use local shell axes (2026-10-29)

- Fix #757: SHB8 solid-shell centroid stresses now use local shell axes, correcting
  sigmaXx, sigmaYy, tauXy and in-plane von Mises for vertical, inclined and curved
  panels. Re-run solid-shell models. Stiffness, displacements, reactions and full
  3D integration-point von Mises are unchanged. See
  [the frame definition and affected results](../docs/results-changes/2026-10-solid-shell-stress-axes.md).
