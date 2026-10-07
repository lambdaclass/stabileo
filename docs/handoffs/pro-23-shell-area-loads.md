# PRO — 23: shell loads, load zones and floor loads as definitions

Branch `feat/pro-23-shell-area-loads`, on `feat/pro-22-load-codes-wind`. Everything is in the
application layer; the engine is untouched.

## Area loads on shells

- `engine/shell-load-integration.ts` is the one integral of every area load on a shell:
  `Fi = d · ∫ Ni q dA`, the engine's own pressure load vector (`quad_pressure_load`,
  `plate_pressure_load`: forces only, on the element's flat projection) extended to:
  - direction: local z (the engine's axes, `shell-results.ts` `shellLocalAxes`), a global direction
    per true area, or per area projected normal to it;
  - field: uniform, by corner, or linear in a global coordinate between two values and nothing
    outside them;
  - extent: the whole shell, or the part inside a polygon projected along a direction, openings
    subtracted.
  A whole shell is integrated in natural coordinates (3×3 Gauss, degree-4 triangle rule). A clipped
  piece is integrated over triangles with a composite degree-5 rule, exact on triangles and
  parallelograms.
- `SurfaceLoad3D` gains `on: 'plate'` (the id names a triangle), `frame`, `dir`, `qNodes`, `vary`,
  `region`, `fromDef`. `ThermalLoadQuad3D` gains `on` (sent as the engine's `plateThermal`).
- Readers through the same integral: solve (`solver-shells.ts` `convertSurfaceLoad`), statics check,
  mass source (`surfaceDownwardPressure`: the downward resultant over the area; triangles now add
  mass too), slab design input, report, load table, drawing (`shellLoadSamples`).
- Edits: `member-load-carry.ts` `carrySurface` (copies and in-place transforms turn directions,
  variations and regions; a mirror reorders corner values). Meshing a quad re-evaluates a field by
  corner at the new corners. Renumbering, fragments, file checks and plate removal know triangle loads.
- Tools (`model/loads/shell-load-tools.ts`): a fluid to a level (pushing away from a point in it, by
  default the middle of the shells picked), and a force at a point split by shape functions.
- The generator's soil (H) and fluid (F) wall pressures are surface loads (`special-loads.ts`
  `WallPressure`); its separate quadrature is gone.

## Floors

- `engine/loads/floor-skeleton.ts`: the straight skeleton of a panel with openings, as the cells
  each side sweeps (event simulation; facing fronts that meet on a line are removed as spikes).
- `engine/loads/floor-tributary.ts`: each side's share from its cells, limited to a zone, linear
  between breakpoints; one way by strips, paired across openings. A zone edge across a one-way
  strip refuses the panel (`zoneAcrossSpan`).
- `engine/loads/floor-loads.ts`: the plane (a level, or one inclined plane), openings from rings of
  beams inside a panel, `perPlanArea`, negative q, and `nodal` for the share past a side's end beside
  a re-entrant corner. Convex panels without openings keep the nearest-side clipping.
- `plan-gravity.ts` keeps `points` for those corner loads; area loads and snow carry them.

## Definitions and zones

- `model/loads/floor-definitions.ts`: `FloorLoadDef` (case, q, target, distribution, span,
  `perPlanArea`) stored as a group of kind `floorLoad`; zones as groups of kind `loadZone` (outline
  = ordered nodes, members left out = elements, openings = other zones in `data.openings`).
  `expandDefinition` writes ordinary loads marked `fromDef`.
- `store/defined-loads.ts`: `syncDefinedLoads` rewrites them when they no longer match: after every
  edit of the model (a microtask scheduled by the mutation hook, `store/index.ts`), before a solve
  and live calc, and with every definition change. A rewrite takes no undo step of its own (it is
  amended into the edit's), so undo and redo are untouched; not during Explore. A load marked with
  a definition the model does not hold becomes a plain load.
- Copies (transformed, mirrored, pasted, a duplicated case) carry a definition's loads as plain
  loads; a definition copied with what it loads writes the copy itself. Moving everything a level
  or box definition loads moves its level or box (`carriedTarget`).
- Share links carry the groups (`gr`, schema 6). A load plan keeps definitions' loads apart from
  the unmarked ones and warns that it adds to them.
- UI: `ProFloorLoadSection.svelte` (definition, preview, list) and `loads/ProLoadZones.svelte`.
  Loads from a definition are read-only everywhere: the store refuses `updateLoad`, `removeLoad`
  and the bulk edits on them, and the delete key, the floating panel and the table say why.

## Tests

- `engine/__tests__/shell-load-integration.test.ts`: totals and moments for each direction, field
  and extent against closed forms; the engine's corner shares.
- `model/loads/__tests__/shell-load-tools.test.ts`: tank walls and bottom, point force, carried
  copies, scaling.
- `engine/loads/__tests__/floor-skeleton.test.ts`: the skeleton tiles L, U, T, cross, staircase,
  corridors and panels with one or two openings.
- `engine/loads/__tests__/floor-loads.test.ts`: L panel, opening two way and one way, zone, zone
  across a span, suction, inclined floor per true and plan area.
- `model/loads/__tests__/floor-definitions.test.ts`: targets, zone with opening, slab, box, and the
  loads following a moved node, removed with the definition, restored by undo.
- `e2e/pro-shell-floor-loads.spec.ts` (`@smoke`).

## Not done here

- A definition is changed by removing and adding it again; there is no edit form.
- Zones are used by floor loads. The wind assigned to a zone or range, and an internal pressure by
  zone, go with the wind assignment of PRO — 25.
- The snow drift loads read the panels' distributed pieces; the corner share of a non-convex roof
  enters the balanced and unbalanced snow, not the drifts.
