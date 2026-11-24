# Refuse null moment and other invalid solver numbers

A planar point load sent directly to analysis with an explicit JSON `null` in `my` or `mz` could solve with its moment dropped. The model now refuses the solve and identifies the moment fields. The native and WASM wire decoders also refuse invalid numeric load, support, and material fields before assembly. Enter a finite value or omit the field if it is optional and no value applies. Then rerun the analysis.

An omitted optional field retains its documented default. Valid inputs keep the same analysis equations. Engine serialization now omits absent optional numbers, so native input hashes can differ for inputs containing these fields.

A raw 2D member point load accepts its in-plane moment through `my` or `mz` and refuses a nonzero `mx` torsional moment. Raw 3D member point loads accept forces. An unsupported moment component can be omitted or set to finite zero. Analysis refuses malformed and nonzero values and identifies the component. For a nonzero unsupported moment, apply it at a node in a 3D model at the original load position.

The same check now runs before a stored planar member load projects into either solver. A nonzero or malformed `mx` blocks the solve before assembly. Static solves that do not use material weight accept an omitted `rho`. Analyses that use material weight or density require a finite, nonnegative density for the materials they use.
