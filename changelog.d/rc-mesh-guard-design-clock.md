### Fixed
#### Keep the RC slab mesh guard independent of runner speed (2026-11-20)

Mesh comparisons now require a complete design run and use a deterministic clock for design in the test. The guard still checks the exact torsion refusal for each affected beam and checks the scheduled mass of the beams that can be detailed.
