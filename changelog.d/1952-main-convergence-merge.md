### BREAKING (results)

#### Preserve physical recovery across the nonlinear convergence merge

- Preserve main's nonlinear convergence and soil-curve corrections together with
  physical reaction recovery. Regenerate the two frozen arc paths and existing
  replay outputs from the merged engine; record every changed scalar in
  `docs/results-changes/1952-main-merge-values.json` (#1952, #1940).

- Limit staged-history declarations to their stage and final-stage collections,
  and register nonlinear path history through its own analysis context. Static
  force changes remain unexplained by these notices (#1952).
