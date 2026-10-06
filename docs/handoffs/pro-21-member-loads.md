# PRO — 21: member and node loads, targets and operations

Branch `feat/pro-21-member-loads`, on `feat/pro-20-loads-units` (#250). Everything is in the
application layer; the engine is untouched.

## What the model gained

| Load | Where | Solved by |
|---|---|---|
| Point load with `px`, `mx`, `my`, `mz` and `frame: 'global'` | `PointLoadOnElement3D` | `engine/member-point-loads.ts`; inside the span an axial part or a moment sits on a node the solve cuts there |
| `ThermalLoad.dtGradientY` (across local y) and `strain` (initial strain) | `ThermalLoad` | `solver-service.ts`, thermal branch |
| `prestress3d` (force, eccentricity at I, middle, J) | new type | `engine/prestress.ts`, equivalent loads |
| `displacement3d` (imposed by a case) | new type | `engine/case-displacements.ts` |

The magnitudes of every load type are one registry, `model/loads/load-magnitudes.ts`, shared by the
what-if sliders and the load operations; a type added to `Load` without an entry fails the
typecheck.

## Decisions

- **Interior moments and axial forces** are solved by cutting the member at the load with the
  machinery of variable-section members (`variable-members.ts`, `loadCuts`): a member is cut for its
  variable section, for its interior point loads, or both, and results collapse back to one member.
  Truss and one-way members are not cut; a moment on one is refused by name.
- **Prestress** is applied as the tendon's equivalent loads on the connected structure (post-
  tensioning): anchor forces and moments at the end nodes, `−P·e″` along the member. Small-angle
  slopes. Splitting a member splits the parabola exactly (`tendonStretch`); merging two members with
  tendons is refused.
- **Initial strain** is `ε / ENGINE_ALPHA` as a uniform temperature, independent of the material.
- **Imposed displacements per case**: each case is solved with its forces on the free supports and
  once more with its displacements and no forces; the combination sums them with the case's factor.
  P-Delta and nonlinear combinations put `Σ f·d` on the supports of the combination they solve. A
  displacement on a free direction, or on a support in local axes, is refused by node.
- **Temperature gradients**: the engine bends a member over the depth of its equivalent rectangle,
  `√(12 I / A)`. The gradient is scaled by the ratio to the section's real depth (`h` for z, `b` for
  y), with the same section and stiffness factors the engine gets. The engine reads its y gradient
  with the −y face hotter, the opposite of z; the conversion accounts for it.
- **Tools write ordinary loads** (`model/loads/member-load-tools.ts`): triangle with a peak, hydrostatic,
  physical member (a straight chain; a reversed piece takes global components), force toward a point.
- **Targets** (`model/loads/load-targets.ts`): selection, ids, group, coordinate range, section,
  member kind (by direction, about 10° tolerance).

## Where the UI lives

- `components/pro/loads/ProWriteLoadCard.svelte`: the write card.
- `components/pro/loads/LoadTargetPicker.svelte`: "apply to".
- `components/pro/loads/ProLoadTables.svelte`: tables, totals (`appliedResultant` from the statics
  check), operations (`store/load-ops.ts`).
- `lib/viewport3d/load-handles.ts`: handles on a selected distributed load's stretch.
- `scene-sync.ts`: partial loads on their stretch, point extras, thermal, strain, tendon and imposed
  displacement drawing; labels through `LoadArrowsBatched.format`, arrow factor `uiStore.loadArrowScale`.

## Tests

- `engine/__tests__/member-point-loads.test.ts`: moment jump, axial split by stiffness, global load,
  tendon moments, restrained tendon, both gradients against `α·ΔT·L²/(2h)`, strain.
- `engine/__tests__/case-displacements.test.ts`: fixed-end moment, combination factor, single solve,
  P-Delta per combination, refusal.
- `model/loads/__tests__/member-load-tools.test.ts`: tools, targets, operations, code and file round
  trip, split and reversed members solving alike.
- `e2e/pro-member-loads.spec.ts` (`@smoke`).

## Not done here

- A distributed moment along a member and nodal masses need the engine (pending list of the engine).
- Importing load tables from a workbook.
- A "prestress before connection" variant (the member's own response only).
