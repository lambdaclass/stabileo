### Fixed
#### Simplifying a building slab preserves cell loads and properties

The published building panel again lists the grid slabs waiting for analysis or eligible for simplification. It leaves independently authored plate meshes alone. Simplification refuses a mesh whose loads or shell properties cannot be transferred to one panel. Spatial solve preparation reports the same refusal before changing the model. Uniform thermal loads keep their generation source through subdivision.
