### BREAKING (results)
#### Preserve physical distances in member diagram queries (2026-11-25)

Split-member queries use the physical parent distance, and browser diagram
readers refuse distinct extrema that round to a load boundary. Native and
WASM point moments retain the lever-arm rounding residual. Critical envelope
exports include the distance residual so cuts with equal rounded metre
coordinates remain distinguishable.
