# Refuse null moment and other invalid solver numbers

A planar point load sent directly to analysis with an explicit JSON `null` in `my` or `mz` could solve with its moment dropped. The model now refuses the solve and identifies the moment fields. The native and WASM wire decoders also refuse invalid numeric load, support, and material fields before assembly. Enter a finite value or omit the field if it is optional and no value applies. Then rerun the analysis.

An omitted optional field retains its documented default. Valid inputs keep the same analysis equations. Engine serialization now omits absent optional numbers, so native input hashes can differ for inputs containing these fields.

A raw 2D member point load accepts its in-plane moment through `my` or `mz` and refuses a nonzero `mx` torsional moment. Raw 3D member point loads accept forces. An unsupported moment component can be omitted or set to finite zero. Analysis refuses malformed and nonzero values and identifies the component. For a nonzero unsupported moment, apply it at a node in a 3D model at the original load position.

## Refuse unsupported torsion on planar member point loads

The same check runs before a stored planar member load projects into either solver. A nonzero or malformed `mx` blocks the solve before assembly. Omitted and zero `mx` keep the same answer. Apply nonzero torsion at a node in a 3D model at the original load position.

## Require material density for dynamic mass

Dynamic mass preparation requires a finite, nonnegative density for every material used by a solved frame member or shell. This includes members added during input expansion, nine-node quads and solid shells. Previously, an omitted density could contribute zero mass. An explicit zero density still contributes zero mass. A density refusal identifies the material field in the app's active language.

A static cable solve without self-weight treats omitted density as weightless, which matches explicit zero density. Present invalid densities are refused. The native and WASM wire decoders also refuse negative density in raw quad, nine-node quad, curved-shell and solid-shell self-weight loads. Positive densities and zero retain their existing load and reaction behavior.

## Refuse negative density in shell self-weight

During static analysis, a negative material density could reverse the direction of a plate or shell’s self-weight, making downward gravity act upward. The solve now refuses the input and identifies the material. Enter a finite, nonnegative density and rerun the analysis. The recheck notice applies to saved spatial models with a self-weight rule that covers a plate or shell made from a negative-density material.

## Refuse self-weight with a missing group or invalid membership

A self-weight rule with a missing group or invalid membership could silently omit the group’s weight. Analysis now refuses the rule and identifies the group. The saved-result check flags affected earlier results. Restore the group and its membership or change the self-weight target before rerunning the analysis. An explicitly empty membership is valid and contributes zero weight.

## Flag invalid density in static shell self-weight

An earlier static solve could treat a plate or quad density saved as `null` as zero and omit that shell’s self-weight. Saved spatial results now receive a recheck notice when an applicable self-weight rule covers a plate or quad with invalid density. Analysis uses the same rule that density must be a finite number at least zero. Enter the material’s density and rerun the analysis.
