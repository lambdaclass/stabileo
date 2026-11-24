### BREAKING (results)

#### Refuse null moment and other invalid solver numbers

Analysis now refuses explicit null and other invalid numeric load, support, and material inputs with the affected field, including direct 2D and 3D planar point loads. Stored planar member point loads and raw engine inputs refuse nonzero unsupported moment components and accept explicit zero components. Static solves can omit unused density. See [the results change](../docs/results-changes/2026-11-invalid-solver-numbers.md). (#2472)
