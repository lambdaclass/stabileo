# Planar self-weight rules and workbook support rotations (2026-11-19)

## Planar self-weight rules

The 2D adapter now passes the exact rules for each load case to the shared load builder, including their signed factors, in-plane directions and member scope. The batch and per-case routes generate the same physical loads for a given rule. The all-loads solve uses the explicit rules or the separately recorded standalone gravity rule. A nonzero rule along the out-of-plane axis is refused. A zero factor adds no load. The combination settlement solve receives an empty rule list because the load cases already carry their weights.

For a horizontal cantilever, case weights with unequal factors along X and Z give different reaction components. The adapter regression checks the summed weight calculated from the fixture's density, section area and length. It covers the WASM batch and per-case routes, including duplicate case names, and checks an explicit weight through direct linear and P-Delta solves. The native solver continues to consume the same explicit member load types.

Recompute affected planar results produced from explicitly specified rules. The legacy gravity toggle still applies downward gravity.

## Workbook support rotations

Default-frame model sheets now write the same prescribed rotation fields available to framed exports. The importer reads the fields in radians and preserves their components in the model frame. Re-export from the original model if an older workbook is missing rotations, then reimport and recompute results.
