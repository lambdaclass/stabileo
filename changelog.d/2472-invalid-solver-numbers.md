### BREAKING (results)

#### Refuse null moment and other invalid solver numbers

Analysis now refuses explicit null and other invalid numeric load, support, and material inputs with the affected field, including direct 2D and 3D planar point loads. Raw member point loads also refuse nonzero unsupported moment components and accept explicit zero components. See [the results change](../docs/results-changes/2026-11-invalid-solver-numbers.md). (#2472)
