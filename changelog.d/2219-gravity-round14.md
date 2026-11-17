### Fixed
#### Preserve axial moment densities through member frame edits (2026-11-17)

Distributed moment densities now use the handedness conversion for axial vectors,
shared by solving, frame editing and floor eccentricity generation. Frame edits
also store the converted density instead of leaving its former components behind.
Regenerate affected left-handed floor loads, restore suspect manual loads from
their physical specification, and rerun analyses, combinations and checks. The
what-if scaling audit preserves version stamps as metadata. See the
[results-change record](../docs/results-changes/2026-11-gravity-round14.md) (#2219).
