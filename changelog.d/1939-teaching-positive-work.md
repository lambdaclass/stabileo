### BREAKING (results)

#### Keep resolved teaching buckling modes with large load factors (#818, 2026-11-11)

Teaching buckling checks each mode's refined geometric work against that mode's existing eigenvalue error bound. It retains exact positive modes that the previous branch dropped when another mode had much larger reciprocal eigenvalue, including equivalent pencils in different units. Zero and negative geometric work remain excluded. See [the results-change evidence](../docs/results-changes/2026-11-buckling-original-pencil.md).
