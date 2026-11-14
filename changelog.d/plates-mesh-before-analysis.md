### BREAKING (results)

#### Plates that came with the model as one shell per bay are meshed before the analysis (2026-11-10)

"Mesh before analysis" left a plate alone when its shells came with the model, even one shell for a whole bay, and the status read "Mesh: up to date". Such a plate, with a shell side longer than 1.5 times its mesh size, is now meshed before the analysis like a plate with no mesh; a finer mesh that came with the model is kept. Results move for projects with such plates, such as the seven-storey building and the mat foundation examples; the reference corpus solves its cases as they were built. See `docs/results-changes/2026-11-plates-mesh-before-analysis.md`.
