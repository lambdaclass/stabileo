### BREAKING (results)
#### Constraint reduction retains cancelled stiffness magnitudes; independent rotations and unloaded oblique releases solve (2026-11-10)

Linear 2D and 3D stability checks now carry the absolute pre-reduction stiffness contributions through constraints, refusing a reduced system whose remaining stiffness cannot be resolved. Free-direction classification uses each connected component’s own scale, so an independent soft rotational spring can resist its applied moment. Off-node coupling is compared with the rounding of its matrix-vector products, allowing an unloaded oblique release while still refusing a moment on that release. The precision thresholds are unchanged. See [the results-change evidence](../docs/results-changes/2026-11-linear-stability-refusals.md).
