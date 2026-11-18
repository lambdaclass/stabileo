### Performance
#### Reduce allocation and repeated interpolation work in solver checks (2026-11-17)

Result validation retains typed diagnostic-path segments and renders them only
when reporting a non-finite value. Span-rotation checks reuse interpolation
nodes and denominators across station intervals. All values, station intervals,
root searches, and refusal thresholds remain checked. The standalone solve
benchmark now detects and avoids a bundling-induced repeated load scan.
