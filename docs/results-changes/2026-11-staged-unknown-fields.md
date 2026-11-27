# Unknown fields in 3D construction stages

The native and WASM 3D staged solvers reject unrecognized fields in a construction stage. Previously a misspelled field could be silently ignored and the solver could return results for a different construction sequence.

For example, `loadIndices` applies the selected loads in a stage. A model using `loadsIndices` used to return the unloaded stage result. The parser now identifies the unknown field. Valid stages, including stages that intentionally omit the load list, continue to decode.
