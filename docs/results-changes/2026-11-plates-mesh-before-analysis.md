# Mesh before analysis meshes plates that came as one shell per bay

## Plates that came with the model as one shell per bay are meshed before the analysis (2026-11-10)

A plate whose shells came with the model (an example, an older project, an import) and are coarser
than the plate's mesh size, such as one shell for a whole bay, was read as meshed and current. The
plates panel already called it "not meshed · 1 element as modelled", but "Mesh before analysis" left
it alone and the status by Analyse read "Mesh: up to date". The analysis then solved each bay as a
single element.

With "Mesh before analysis" on (the default), such a plate is now meshed at its mesh size before the
analysis, like a plate with no mesh. A coarse shell is one with a side longer than 1.5 times the
plate's mesh size. A finer mesh that came with the model is kept while it is compatible with its neighbors. A panel
of more than four shells keeps its own element size as the plate's mesh size. With the option off, they are
solved as they came, as before.

Results move for the projects that have such plates: displacements, reactions, member forces and
shell stresses of the meshed plates and of what they carry, such as the seven-storey building and
the mat foundation examples as the app opens them. The reference corpus records each case as it was
built, with the option off, so its snapshots do not move.

This behavior is available in builds that enable `proPlatesUnified`. The production setting
disables it and uses the existing PRO model and solver paths. When automatic meshing leaves a neighboring plate with a hanging shell node, the same analysis
preparation also attempts to mesh that plate. Each plate is attempted at most once, and analysis
requires compatible meshes before proceeding. A plate with shell loads that cannot follow the new
mesh blocks automatic meshing. An interrupted mesh operation keeps the old meshes of plates it has
not processed and applies loads and springs to the plates it has completed before yielding.
