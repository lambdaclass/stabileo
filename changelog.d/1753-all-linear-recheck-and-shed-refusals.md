### Fixed
#### Every saved linear result receives the stability re-check notice (2026-11-10)

The linear-stability notice now covers all previously accepted linear analysis results, including plain frame, truss and cable mechanisms that model-feature gating missed. Ordinary legacy truss and shell projects receive the notice too; projects without a linear analysis result remain outside its scope. Shed regressions now check the documented mechanism refusal for unbraced and incompletely braced configurations under longitudinal and vertical loads, including roof-only bracing in every bay without purlins. Stable, fully braced displacement bounds are unchanged.
