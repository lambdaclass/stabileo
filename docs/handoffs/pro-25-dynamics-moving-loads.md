# PRO — 25: dynamic and moving loads, units across PRO, names and table tools

Branch `feat/pro-25-dynamics-moving-loads`, on `feat/pro-24-cases-combinations`. Everything is in
the application layer; the engine is untouched.

## Spectra

- `engine/spectral-case.ts`: `UserSpectrum` (Sa in g or m/s², or Sd in m; linear or log
  interpolation), `userSa`, `userSpectrumPointsInG` (the engine's spectral analysis takes a table;
  log and Sd tables are sampled densely), `modeCoefficients` (k = Sd · Σ f_d Γ_d per mode),
  `modalCombine` (SRSS, CQC with `cqcRho`, ABS; the dominant mode's sign), `combineModes`.
- A spectral case (`LoadCase.spectral`): each mode shape imposed at every node and solved once
  (`store/spectral-cases.ts` `imposed`, `spectralCaseResults`), then each case's modes combined with
  its multipliers. Member diagrams are the straight line between the combined ends (each mode's is
  straight; their combination stays under that line). The results are handed to the combinations
  (`solveCombinations3D(..., spectral)`, `combination-methods.ts` `finishBundle`), which add them by
  superposition; a spectral case without results is left out with what takes it (the live solve).
- Projects with constraints are refused (the engine withholds participation factors there).
- User spectra are kept in `model.dynamics.spectra` (`setDynamics` keeps the other fields);
  `ProUserSpectra.svelte` edits them; the advanced spectral analysis can run on one.
- `store/dynamic-input.ts`: one builder of the centerline input and the mass source for the advanced
  panel and the spectral cases.

## Vehicles

- `engine/vehicles.ts`: `Vehicle` (variable gap, gauge, dynamic factor), `AASHTO_VEHICLES`,
  `vehicleTrains`, JSON file, `trainModelLoads` (vertical global point loads, half on each path with
  two wheel lines), `positionsAlong`.
- `moving-loads-3d.ts`: `sweepTrains3D` (every spacing), `path2` (second wheel line).
- `store/moving-cases.ts` `addPositionCases`: one Tr case per position, alternatives of one group.

## Generator

- Wind (`load-plan-wind.ts`): `wind.region` (node ids: the levels and the front are theirs; roof
  loads only on members inside) and `wind.profile` (net lateral pressure against height, mean over
  each band exactly by `profileMean`; case 1, one internal-pressure variant, no roof pressures, no
  §2.1.5 minimum). `ProActionRegion.svelte`, `ProfileChart.svelte`.
- Snow (`snow-loads.ts`): `snow.roof` (member ids) in place of the detected roof, in the projection
  and the panel paths and the corner loads.
- `model/loads/region-nodes.ts`: a region (all, zone, group, box) as nodes and members.

## Mass weights

- `MassSource.weights` (`mass-source.ts`, kept by `normalizeMassSource` and through a change of the
  factors): members kN/m, slabs kN/m², floor kN/m² to the beams (`floor-definitions.ts`), on a
  region. `engine/dynamics/mass-weights.ts` writes them as loads of a case of their own that the
  mass source takes at factor 1. `ProMassWeights.svelte` in the mass-source panel.

## Pushover

- `engine/pushover-pattern.ts`: lateral patterns along X or Y by each node's dead-load weight
  (uniform, triangular by height, the dominant mode's shape), adding up to 1 kN; `upToTarget` (base
  shear or control-node displacement, the last step interpolated). The advanced panel adds the
  pattern, the case and the target; `PushoverView` reads the curve up to the target.
- What a pushover needs, and where it stands: present are the hinge sequence, the capacity curve and a
  control node; added here are the load pattern, the target and a choice of case. Missing, and the
  engine's: gravity held constant while the lateral pattern grows, FEMA-type hinge curves with
  IO/LS/CP acceptance, geometric nonlinearity in the pushover, and a performance point against a
  demand spectrum.

## Adding supports and loads

- One way to add each: the panel's "Add support" / "Add load" card (`WriteInPanelButton verb="add"`).
  The Draw buttons for supports and loads are gone, and so are their options in `ProDrawBar` and
  the PRO click branches in `Viewport3D` (with `drawState.nodalLoad` / `memberLoad`). A support or
  load tool armed in Basic is put down when PRO's draw bar mounts.
- The support card ends in the loads' `LoadTargetPicker` (`entity="nodes"`): selection, numbers,
  group or range, resolved by `resolveTargets`, in one batch; a node with a support takes the new one.
- The model's context menu on a node, in PRO, selects it and opens the card on the selection
  (`drawState.writeOnSelection`, `writeSeq`); the load card turns to a node kind.
- `LoadTargetPicker`: the group filter's precedence fixed (a floor-load definition was offered).

## Self-weight in the Add load card

- `ProWriteLoadCard`: a fourth group of kinds, General, with Self-weight (direction, factor). It
  writes `analysis.selfWeight` (the rule the solve already reads): `all` is the whole model, a group
  is `groupId`, any other target an `elements` list. A rule with the same case, direction and reach
  is replaced. `ProSelfWeight.svelte` is gone; the rules are a table at the top of
  `ProLoadTables` (case, direction and factor edited in place; removed there). PRO does not offer
  the older D-case switch.
- A PRO project with no rule and no members is given `selfWeight: []` (`selfWeightRuleEffect`), so a
  new project has no self-weight until it is added; one with members and no rule (an older file, a
  Basic model) is migrated as before, and its rule shows in the table.
- `load-targets.ts`: `{ by: 'all' }`. `LoadTargetPicker` offers it with `allowAll`.
- The picker no longer shows the count: it hands `summary` to the card, which shows it beside the
  Add button (`WriteCard`'s `aside` snippet for supports). On the selection, when the pointer is not
  selecting what it needs, a button beside the choice switches it (`load-target-activate`).

## Units, names and table tools

From issues #251, #181, #96, #205 and #206.

### Units

- `utils/units.ts`:
  - A fourth display system, `SImm`: SI with lengths in mm (coordinates, displacements, section properties). Forces, loads per metre and per square metre and stresses stay as in SI; files stay in SI.
  - `temperatureDiff`: a ΔT or a gradient, no offset. The thermal labels in the 3D view used `temperature`, which added 32 °F to a difference.
  - `sectionArea`, `sectionInertia`, `sectionModulus`, `sectionDim`: shown in cm in SI, as section tables give them.
  - `isUnitSystem` guards the stored preference.
- `QuantityInput`:
  - nullable (an empty field is the default its placeholder names);
  - placeholder, `describedBy`, `showUnit` and `onchange` (once, on leaving: one undo step for a table cell);
  - the bound value follows the typing, and the field is not rewritten while it has the focus.
- The Add load card (`ProWriteLoadCard`, `ProShellLoadForm`): every magnitude is a `QuantityInput`.
  - Imposed displacements and tendon eccentricities used to be typed in mm. They are now `displacement` and `length` in the display system (mm in SImm).
  - ε₀ stays in ‰.
- Inputs moved to the unit layer (the sweep found 177 tags in 50 files reading SI without it):
  - **Modelling:**
    - `ProNodesTab`: table cells convert at the edge; the write card uses `QuantityInput`.
    - `ProQuickEdit`, `PlacementHud`, `ProDrawBar`.
    - `ProGridPanel`: bays and storey lists in display units.
    - `ProTransformPanel`, `ProEditPanel` (fill thickness and element size), `ProMesher`.
    - `ProSurfaces` (length keys only), `ProShellTab`, `spec/SpecSurfaces`.
    - `ProConstraintsTab` (offsets, springK, springKr), `ProMemberBehaviour`, `SupportDofFields`.
    - `ProSupportEditor` (springs), `ProSteelLbEditor`, `ProStairSection`.
    - `ProViewPanel` (note position), `property/MemberOffsetEditor`.
  - **Loads:**
    - `ProLoadTables`: every cell, with units in the headers.
    - `LoadTargetPicker` range, `ProActionRegion`, `ProCaseDetails`, `ProFloorLoadSection` box, `ProDeadLoadBuilder`.
    - `ProSnowSection`, `ProSpecialLoadsSection`, `ProWindCasesPanel`, `ProWindCladding`, `ProWindDynamics`, `ProWindStructure`.
    - `ProAutoLoadsApplying`, `ProAutoLoadsDialog` (altitude), `ProMovingLoadsPanel`.
    - `dynamics/ProMassWeights`, `dynamics/TimeHistoryPanel`.
    - `ProResultsTab` (query threshold and its readouts), `ProFoundationSprings`.
  - **Analysis, design, materials:**
    - `ProAdvancedTab`: pushover target, Winkler, SSI.
    - The section builder in `sectionDim`, and the section readout (A, I, J, W) in `sectionArea`/`sectionInertia`/`sectionModulus`.
    - `ProMaterialsTab`: E, γ, fy in display units with the unit in the header.
    - `material/CustomMaterialPanel`.
    - `design/FoundationsPanel`, `design/BatchEditDialog`, `design/DetailingWorkflow`, `design/RebarEditorBeam`, `design/RebarEditorColumn`.
    - `generators/*`: the "(m)" in the steel dictionaries' generator labels and hints is gone.
    - `ProConnectionsTab` (its SI fields only).
- Left as they are, with a fixed unit on purpose:
  - mm: connections, rebar, drawn sections, cold-formed, weld tolerance, taper.
  - cm²: shear areas.
  - Also %, ‰, degrees, s, Hz, ratios and counts.
  - The support force–displacement curve, typed as "mm kN".
  - Shell contour limits (kN·m/m has no Quantity).
- Read-only texts still with a fixed SI unit:
  - `loadTarget.chainOk` (m), the floor-load level names.
  - The wind qz profile table, the cladding pressure header.
  - The time-history summary, the δmax line of the advanced tab.
  - The loose P-Δ of Basic (`ToolbarAdvanced`) publishes without the stability check; Basic takes it in its own PR.

### Names

- `Node.name`, `Element.name`, optional:
  - kept in the `.ded`; a file without them opens as before;
  - `renameNode` / `renameElement` record on the views undo channel (`restoreViewsOnly` restores the names), so renaming keeps the results;
  - `updateNode` keeps the name on a move.
- Edited in the nodes and members tables (a Name column after the id).
- Labels: `MEMBER_LABELS` has `name`. Members show their name; nodes too when labels read names (`nodeLabelText`, one line in `results-sync.ts`, nothing else of the labels touched).
- Excel: `name` column in Nodes and Members, written and read (`schema.ts`, `parse.ts`, `load-fixture.ts`).
- Report: the nodes and members tables add the Name column when some entity has one.

### Load sketches

- `loads/LoadSketch.svelte`: an SVG beside the Add load card's fields, one drawing per kind (node forces and moments with the global axes, inclined force, imposed displacement, distributed trapezoid/triangle/hydrostatic with a and b, point load at a, thermal profile across the depth, strain, prestress tendon through eI/eM/eJ, self-weight, slab area loads by field, fluid against a wall, point on a slab, slab temperature).
- Drawn from the card's state (`SketchInput`; the slab form hands its own through `bind:sketch`): signs set the arrows, magnitudes scale against each other, empty fields show their symbol. Schematic, not to the model's scale.
- Members are drawn sloping so local, global and projected axes differ; stations along the member (a, b, peak, a of a point load) are dimensioned from I; the prestress eccentricities are dimensioned from the axis. Thermal loads are the temperature diagram across the section (member: ΔTgz = T(−z) − T(+z), ΔTgy across the width; plate: ΔTg = T(+z) − T(−z), the engine's sign for shells). Plate area loads: side on (direction, true or projected area, the projection drawn) and in plan (uniform, corners, along an axis, the partial rectangle).
- The corner button shows the sketch large over the viewport's canvas, or the whole screen on a phone; the overlay is moved to `document.body` (`utils/portal.ts`) so the panel's stacking context does not keep it under the header. Escape closes it.
- The card: case and kind on top (the kind a `<select>` with an optgroup per Node / Member / Plate / General, testid `wl-kind`); the fields on one grid (`.fg-r`: a right-aligned name column, cells of one width, the unit after the row; vectors under X, Y, Z or I, J headers), set in under a rule; Apply to and Add at the end. The sketch stays to the right, shrinks to 120 px, then wraps under the fields; on a phone it goes under them.
- An inclined force: an origin (a node or a point) toward the loaded node, each node Apply to names; the target is not typed. An origin on the loaded node is refused (no direction).

### Tools

- **Loose P-Δ** (`ProAdvancedTab.handlePDelta`): `amplification()` and `converged`, the same criterion as per combination. Unstable or not converged: not published, an earlier P-Δ result is cleared, and the panel says why (`pdelta-refused`).
- **Report:**
  - `exportReportAs` is async;
  - `screenshotWithNumbers` turns on node and member numbers (ids, not on the selection only), waits three frames, captures, and puts back what the reader had;
  - the picture is Figure 1, and the figures section continues from 2.
- **Tables:** a double click on a node or member row selects it and dispatches `stabileo-zoom-to-selection`, not on a cell being edited. The members table keeps the place of the "Open specifications" button, which used to appear on the first click and move the row under the pointer.
- **Clean-up** (`ProEditPanel`):
  - exact duplicates are counted from `checkModel` (`MODEL_DUPLICATE_ELEMENT`) and removed as before;
  - overlapping collinear members come from `overlappingCollinearWarnings`, are listed by pair with their shared length and are selected to decide.
- **CAD tests:**
  - `cad-real-dxf` and `cad-rooms-uploaded` warn when the client plans are absent and say so in the suite title.
  - `cad-real-like.test.ts` builds a plan with author layer names, block columns and a wrong `$INSUNITS`, and runs the shipped path.

## Generator form

- `generators/GenSection.svelte`: a `<details>` per group of the form (shed: Frames, Columns, Roof, Bracing; truss: Shape, Web members; column; structures: Geometry; then Sections and material, Generated structures, Where), testid `gen-sec-<id>`. They start folded and fold again on picking a generator (`gen-help.svelte.ts`, `foldAllSections`); folded, the heading shows a summary (`gen-sec-sum-<id>`). The fields stay in the DOM, so `aria-describedby` and the U1 test still find them; the e2e helper `pickGenerator` opens them all (`openGenSections`).
- `generators/GenRow.svelte`: one parameter on the load card's grid (name right-aligned, box in the next column, unit after; a checkbox in the box column). The explanation is kept beside the field, visually hidden, under `gen-hint-<key>` (structure fields: `gen-hint-f-<key>`, text `generator.fhint.*`), and shown in the help line at the top of the dock for the row under the pointer or in focus.
- The help line is one line tall, beside the preview's pin; a longer explanation opens as a card over the drawing (absolute, `pointer-events: none`), never pushing anything. At first it grew with the text, which shrank the scroller: at the bottom of the list the hovered row moved out from under the pointer and the form shook. `m2-generators-ui.spec.ts` checks the row does not move. On a touch screen the idle invitation is hidden (`hover: none`).
- The Place / Preview / Regenerate actions are a footer of their own (`.gen-actions`), outside the dock: always at the foot of the panel, pinned preview or not. On a phone (≤ 767 px) the preview starts unpinned, so the short sheet keeps room for the form; picking a generator scrolls the form to its top.
- `TrussFields` takes `part: 'shape' | 'web'`; the shed's two previews sit side by side when the panel is wide enough, so the dock keeps the Place button in sight.

## Selection panel

- `components/SelectionPanel.svelte` is shared with Basic; the behaviour is the same in both, plates only in PRO.
- Every operation goes through `applyArmed`: armed kinds take the operation's answer (or keep their selection when it gives none), the others are emptied. Changing the kind from the panel drops the selection of kinds no longer armed (`dropUnarmed`), the isolation `basic-selection-permutations.spec.ts` already states for drags.
- `lib/model/select-like.ts`: "like the selection" per kind (`LIKE_OPS`), plates parallel to a global axis or plane, and `focusNodeIds` (what zoom to selection frames: member ends, plate corners, supported nodes, loaded nodes/members/plates). `Viewport3D`'s zoom-to-selection handler reads it; that one line is the only change there.
- Loaded in case: each armed kind takes its part (disabled with only supports armed). Parallel to: members and plates (disabled otherwise). Walk: through the armed kind. Previous: `selectionHistory.back(kinds)` gives back the last selection of the armed kinds and skips the others.
- By id: nodes, members, plates (one kind: `selectByIds(..., 'shells')` looks in triangles and quadrilaterals and reports an id found in both), supports, loads. The list follows the armed kind, and naming another kind arms it.

## Merged with main and with #264

- `main` went into PRO 24 first (signed merge), then PRO 24 into PRO 25, then `basic/interaction-view` (#264) into PRO 25, so this PR carries #264 until it is merged: merge #264 first.
- Where they met:
  - `solver-service.ts`: main's plan (`combinationsPlan3D`, refusals, imposed displacements) with PRO 24's case effects and cases to solve, and PRO 25's spectral cases (`finishBundle(…, spectral)`), in both the sequential and the workers' entry.
  - `write-load.ts` and `shell-load-form.ts` (main's pure builders of the Add load card) take the card's SI values (`null` for a blank field); the inclined force goes from an origin (a node or a point) toward each loaded node (`writeLoad.fromNodeMissing`, `writeLoad.fromSelf`). Their tests were moved to numbers.
  - `centerlineInput(opts)` (`store/dynamic-input.ts`) takes main's `caseDisplacements` and `uncut`.
  - One temperature-difference quantity, `temperatureDelta` (#264's name; PRO 25 had `temperatureDiff`), and one set of section quantities.
  - `SelectionPanel`: Basic as #264 left it; PRO by armed kind. One walk for both (`selectWalkItem` takes plates); Basic's "like the selection" uses `likeMembers` from `select-like.ts`.
- The WASM engine must be rebuilt after the merge (`npm run wasm`): main changed the Rust side.

## Nodes, scrollbars, selection and temperature in PRO

- Nodes are drawn a fixed size on screen in PRO too (`NodesInstanced.setStyle`, `uiStore.nodeStyle3D`, default `auto`); the mesh stays as the click target. `resolveNodeStyle(pref, tool, aiming)`: in PRO, aiming is also `shellNodePick.active`, `placementStore.active` and the connections tab. Settings › node style and panel scrollbars are shown in PRO.
- Scrollbars: `styles/panel-scrollbars.css`, class `st-panel-scrollbars`, on Basic's panel and PRO's (`data-testid="pro-panel"`), never on the phone.
- Zoom to selection frames one node with a third of the model around it, in both modes.
- Temperature: the signs along the member (#264's `drawThermalSigns`) show in PRO; PRO keeps its names (ΔT, ΔTgz, ΔTgy; ΔTg on plates), because it has two gradients and "ΔTg" is already the plate gradient.
- A load on a plate is picked on its fill (`LoadArrowsBatched.markArea`, `pickLoadsWithDistance(…, areas)`); the load tables move to the case of a load selected in the model; a model from Basic keeps its self-weight case (`migrateSelfWeightIfNeeded`).

## Large models

- Measured with a real GPU (Metal) on a generated building (`e2e/large-model.ts`: 1,638 nodes, 4,245 members, 1,200 slab faces, 5,130 loads): members 860 → ~40 ms to open, loads 942 → ~80 ms, plates 203 → ~30 ms, nodes 144 → ~40 ms. On the industrial shed example: members ~25 ms, loads ~38 ms, no long frame.
- `lib/utils/progressive-rows.svelte.ts` (`progressiveRows`, `progressiveLimit`): first 30 rows, then a batch a frame; `reach(i)` draws up to a row the model asks for. Used by Basic's members table, PRO's members (40 a frame), nodes, plates (60) and load tables (one budget of 30 a frame over the eight tables).
- `components/tables/LazySelect.svelte`: a select holding its list only while open; `LazyIdSelect` is built on it. Used for material and section per member row, material per plate row, frame per distributed and point load row.
- The rest of the drawing time is the browser's style and layout of the large tables (a CPU profile shows it native), spread over frames. Virtualizing would be the next step if a table must stay smaller.
- `e2e/pro-large-model-tables.spec.ts` counts rows and options on the first frame (not times: CI draws WebGL on the CPU).

## Tests

- `engine/__tests__/spectral-case.test.ts`: the engine's spectral displacements for the same modes,
  spectrum and rule (CQC, SRSS); an imposed mode reproduced; the rules and the sign; user spectra;
  a user spectrum with the code's values.
- `engine/__tests__/vehicles.test.ts`: HS20-44, spacings, dynamic factor, file; position cases
  against the sweep; two wheel lines.
- `engine/loads/__tests__/pro25-actions.test.ts`: wind profile and region, mass weights, pushover
  pattern and target.
- `e2e/pro-dynamics-loads.spec.ts` (`@smoke`).
- `e2e/pro-units-names-tools.spec.ts` (`@smoke`): the card in MKS, SImm and Imperial; names in the tables and the label mode; double click; duplicates and overlaps; P-Δ refused; the report figure.
- `lib/utils/__tests__/units-mks.test.ts` (SImm, section quantities, temperatureDiff), `lib/store/__tests__/entity-names.test.ts`, `lib/cad/__tests__/cad-real-like.test.ts`.
- `e2e/pro-add-supports-loads.spec.ts` (`@smoke`): every option of both cards, on the selection and
  on numbers, and the context menu.
- `lib/model/__tests__/select-like.test.ts`: like by kind, plates parallel, by id over every kind, zoom framing.
- `e2e/pro-selection-tools.spec.ts` (`@smoke` block): supports, by id, previous by kind, loaded in case with nodes.
- `e2e/m2-generators-ui.spec.ts` (`@smoke` block): folded sections with summaries; the hovered row does not move.

## Not done here

- The constant-gravity pushover, FEMA hinges and the performance point (the engine's pending list).
- Nodal and concentrated mass weights need nodal masses in the engine.
- Spectral cases are not computed by the live (on-edit) solve.
- The tributary area of each member is not drawn in 3D.
