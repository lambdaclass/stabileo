### Performance
#### Reuse diagram sampling work during results display (2026-11-16)

3D diagrams reuse the regular sampling grid while retaining point-load jumps and
variable-section boundaries. Mesh construction reuses the sampled diagrams it
already computed for scaling. Sample counts, force values, and diagram geometry
are unchanged.
