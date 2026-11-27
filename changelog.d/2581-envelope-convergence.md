### Fixed

#### Preserve spatial envelope forces and report failed moving sweeps

- Spatial diagram cuts use each case's physical span and face. Envelope figure
  extrema use the inward member faces at both ends.
- Critical force summaries use signed case extrema. Tables with resultant
  columns require concurrent member forces, including at the ends.
- A planar moving-load sweep reports a solver error when its envelope is
  unavailable. Piecewise spatial envelopes publish their member ends and
  signed case sources together.
