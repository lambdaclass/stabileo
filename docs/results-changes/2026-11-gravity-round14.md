# Axial moment density frames

PR #2219 round 14 gives distributed moment densities their own axial-vector
conversion between displayed member axes and global axes. For a left-handed
member basis formed by reversing local Y, a polar vector changes its Y
component; an axial vector changes its X and Z components. If R is that basis,
the global moment is det(R) R m. The reverse conversion uses the same determinant
with the transposed basis. Right-handed conversions and global/projected
intensities retain their meanings.

The shared conversion pair now handles the distributed-moment reader, the load
frame editor and floor eccentricity generation. The store also writes the
converted density when changing a distributed load's frame; previously it
changed the frame and force components while retaining the old density
components. This could change the next solve even with right-handed axes.
Existing left-handed floor density components must be regenerated. Restore
suspect manual loads from the physical specification before re-solving; a frame
toggle cannot reconstruct an earlier corrupted edit. Rerun analyses,
combinations, diagrams and design checks after restoring the loading.

The regressions compare each member's shear, bending and torsion at five
stations with the closed-form solution for a beam fixed at both ends. They also
check the middle displacement and twist. They cover both handedness conventions,
local and global input, repeated store frame toggles, two subdivisions, two plan
rotations and both mirrored orientations. Linear and P–Delta results are checked
with transverse force and each moment-density component. Corotational results
are checked separately under pure distributed torque, whose straight-axis hand
solution remains exact without a small-displacement approximation. Independent
component tests cover global, local and projected frames and all three samples
of nonuniform densities. Zero and small moment densities on both sides of the
force display cutoff retain their exact magnitudes. The moment editor is also
checked for explicit removal and ownership of its stored arrays. Plane input retains its explicit spatial-moment
refusal and a force-only control remains accepted.

The prior force-vector assumptions in four gravity test helpers have been corrected
to the axial convention. No tolerance, result snapshot, fixture skip or
assertion strength is relaxed. The what-if scaling audit now treats version
stamps as metadata: production scaling already preserves them through its
explicit magnitude-field allowlist. This audit correction changes no result.

These density fields and their edit omission were introduced on the unmerged
#2219 branch. This record assigns no advisory. The SRSS/ABS combined-peak work
in #2252 and the existing fixture skips remain deferred.

Round 15 narrows this entry to spatial frame projects with nonzero distributed
moment densities in global or projected load frames. Force-only loads, zero
moment densities and default local frames cannot explain unrelated legacy solve
differences through this entry. The predicate is shared by the project assessment,
legacy judge and results snapshot gate. This changes provenance, not engine results.

The entry independently requires generated-load and floor-definition regeneration
as well as manual-load restoration. A current solve cannot replace any of those
stamps. The lazy notice loader and the assessment read the same three provenance
versions, including floor loads detached from their definition. Missing or older
stamps retain the notice; reaching the entry version clears that requirement only.
