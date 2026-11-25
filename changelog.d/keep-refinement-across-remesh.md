### Added
#### An adaptive refinement survives the plates being meshed again (2026-11-25)

A plate meshed from its outline keeps the element sizes an adaptive refinement left it. When
its mesh is made again, the sizes are put back on the new one by refining it where it was
fine, with no analysis: on a slab of 20,896 elements, 0.9 s where the adaptive loop took
16.3 s. Giving the plate other mesh settings, or clearing its mesh, drops them.
