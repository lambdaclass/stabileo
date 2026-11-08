# Units in the type system — workstream 7 / #359

Surveyed at `551b0bb520cf0ac7ee51d895f3e5dc2b093ff2ab`, 2026-10-29.
Branch: `safety/units-in-types`. No wire-version change and no tolerance change.

## Contract and first slice

Quantities must be distinguishable by the compiler, including two units of the same
physical dimension: an MPa value is not a kN/m² value. Serialization must remain bare
numbers in the established units. A type migration must not change the operation order,
reject another model, or purport to fix numerical conditioning.

This slice introduces transparent Rust quantities and typed elastic material/section
wire records. The direct WASM `solve_2d` deserializes `ElasticInput2D` and retains
its typed properties in `PreparedStatic2D` through assembly and force recovery.
The generic `SolverInput<M, S>` defaults preserve existing Rust callers. The frame kernel carries
E, A, Iz and L through dimensionally checked EA/L, EI/L³, EI/L² and EI/L arithmetic;
it erases units only when inserting coefficients into the heterogeneous displacement/
rotation stiffness matrix. The shear expression carries E, ν, As and L through G and
φ without cancelling E or regrouping products. Dense assembly, sparse free/full
assembly, parallel sparse assembly and linear force recovery call the typed kernel.
Legacy callers of the scalar kernel use one explicit compatibility wrapper.

TypeScript supplies branded MPa, kN/m², area, inertia, ratio, length, force and moment;
typed display conversion functions; and typed material/section properties on
`input2DToWireObject`. `unitInputCommit` uses the typed conversion for the three elastic
input quantities. Stored models remain numeric and enter through named adapters.

**Protection boundary:** this is not completion of #359. Shared `SolverMaterial` and
`SolverSection` Rust storage, stored TS models, truss/thermal arithmetic, mixed-DOF
matrices and result DTOs still contain raw numbers. The direct frame path keeps its
original typed properties; a legacy view supplies
validation and still-unmigrated load/constraint algorithms. Legacy Rust callers and
other WASM exports enter through explicit adapters.
Wrong-unit assignments in the typed records/kernel fail compilation; raw legacy field
assignments are not yet prevented. The plan below removes these bridges in order.
Do not describe this PR as making every solver input or result dimension-safe.

## Flow today

| Stage | Representation / units | Conversion ownership |
| --- | --- | --- |
| UI preferences | `uiStore.unitSystem`: SI, SImm, MKS, Imperial | `utils/units.ts`; this changes display, never project units |
| UI labels / formatting | `unitQ`, `fmtQ`, `toQ`, `sigQ` in `store/display-units.svelte.ts` | `unitQ` returns a label, not a quantity; decimal preferences do not change analysis |
| UI parsing | `UnitInput.svelte` → `unitInputCommit` | `fromDisplay`, now typed for stress/section area/inertia; unchanged displayed text retains the original value |
| Model → WASM | `engine/types.ts`, `types-3d.ts`, `wasm-solver.ts` | maps become plain records; E stays MPa; no ×1000 in the JS wire adapter |
| Rust input | `types/input.rs`: material E/ν, section A/Iz/As | E MPa, ν dimensionless, A/As m², Iz m⁴; optional shear area retains absence/null behavior |
| 2D geometry | node x/z, member and load positions | m; node `y` remains the legacy alias for z |
| Elastic stiffness | `solver/assembly.rs`, `sparse_assembly.rs`, `element/frame.rs`, `truss.rs` | E ×1000 gives kN/m²; G = E/[2(1+ν)]; EA/L in kN/m; EI in kN·m² |
| Loads / recovery | `element/fef.rs`, `solver/linear.rs`, `types/output.rs` | forces kN, moments kN·m, line loads kN/m; displacements m and rotations rad; stresses may be converted back to MPa |
| 3D / shells | plate, quad, quad9, curved shell, solid shell | lengths/thickness m, J and Iy/Iz m⁴, Cw m⁶; shell membrane resultants kN/m and bending resultants kN·m/m are not solid stresses |
| Mass | `solver/mass_matrix.rs` | density input kg/m³; divide by 1000 for tonnes = kN·s²/m; added nodal mass t, line mass t/m, rotary inertia t·m² |
| Weight | web section weights/material density, shell self-weight | model weight density kN/m³ differs from shell/dynamic kg/m³; gravity m/s², N→kN /1000; `dynamics/section-mass.ts` uses weight×1000/(g×area) |
| Dynamics | modal, spectral, harmonic, time history | seconds, Hz vs rad/s, accelerations m/s²; spectral g fractions need explicit gravity conversion |
| Thermal | `SolverThermalLoad`, `SolverThermalLoad3D`, shell thermal loads | ΔT in °C, α in 1/°C; gradient fields are face temperature differences, divided by depth in thermal FEF |
| Design / report | Rust postprocess/certify; TS engine/design and codes | analysis m/kN versus clause formula mm/N/MPa; conversions are scattered and must move together with each check |

Internal values are engineering SI, not uniformly base SI. In particular **E is MPa
on the wire**, even though forces are kN and lengths m. SImm displays mm/mm²/mm⁴ but
keeps forces kN and line loads kN/m. SI section tables display cm²/cm⁴/cm³. MKS uses
tf, kgf/cm² and cm-based section properties. Imperial uses ft/kip/ksi/in²/in⁴.
Absolute temperature is affine (°F = °C×9/5+32); temperature difference has no offset.
A future temperature type must distinguish the two, and not offer absolute+absolute.

## Conversion-site audit

The companion [inventory](unit-conversion-inventory.md) lists every match in production
Rust, `web/src/lib`, and UI components for display adapters, explicit engineering scale
factors, named conversions and unit/factor declarations. Regenerate it with:

```sh
python3 scripts/inventory-unit-conversions.py > docs/safety/unit-conversion-inventory.md
```

It is a review index, not a claim of semantic completeness: a unit conversion can be
hidden in arbitrary arithmetic, and factors such as 1000 also occur in numerical
stabilization. Do not blindly replace its hits. Conversion families to review are:

- E→kN/m² in dense/sparse assembly, linear recovery, staged, constrained, corotational,
  material/fiber nonlinear, plastic, creep, buckling and certificate reassembly paths.
  Shear modulus and stiffness must consume the same typed E as load/recovery routines.
- Stress/yield/residual stress MPa↔kN/m² in plastic/fiber constitutive laws and stress
  postprocessing. Keep stress and force/area arithmetic consistent with certificates.
- Geometry m↔mm/cm/in/ft in section catalogs/shapes, built sections, drawn outlines,
  profiles/CSV, IFC, DXF, generators, detailing, reports and export serializers.
  Area/inertia factors are powers of the length factor, never the length factor itself.
- N↔kN and N·mm↔kN·m in RC/steel/code formulas, anchors, joints, connections and footings.
  MPa = N/mm²; a stress conversion alone does not convert the rest of a clause formula.
- Mass↔weight in mass matrices, section-mass, self-weight, imported materials and shells;
  frequency↔angular frequency and g↔m/s² in dynamic analysis and spectrum adapters.
- Temperature versus temperature difference in `utils/units.ts`, UI input and thermal
  loads; degrees↔radians in support/member orientation and display/export.
- `engine/metamorphic/units.rs` intentionally rescales the *whole problem*, including
  conjugate loads and geometry. It is not an ordinary production UI unit conversion.

## Known failures and what types can prevent

- [#758](https://github.com/lambdaclass/stabileo/issues/758): 2D plastic λ changes with
  renumbering, reversal and unit scaling. Reported unit case 0.7290→3.376 (4.6×).
  Commits `57691044e`, `47e642380` preserve the reproductions. This is numerical/
  algorithmic invariance failure, not evidence of a single missing ×1000. Keep the
  existing containment and regression tests; this migration does not close it.
- [#762](https://github.com/lambdaclass/stabileo/issues/762): mechanism detection and
  accepted-solution accuracy change with units/orientation near singularity.
  `49e30d7a9` addresses unit-independent orphan-rotation/rank detection; the issue has
  broader cases. Types cannot make a pivot threshold scale-invariant. Do not loosen
  tolerances or expand refusals to make these tests pass.
- `4fb92f162`: curved-shell self-weight was 1000× too heavy because kg/m³ was treated
  as the force-consistent density. Separate `MassDensity` and `WeightDensity` rather
  than a single ambiguous `Density` type. Conversion requires gravity explicitly.
- `98c57261f`: thermal differences incorrectly acquired the 32°F offset; large
  coordinates lost millimetre precision through display/edit round trips. The unit
  utilities also preserve the typed display number when switching force/moment/line
  load toolbar modes. Brands help distinguish quantities; formatting precision and
  round-trip identity still need runtime tests.
- Curved-shell drilling comments record G·h²/1000 versus G·h/1000: a dimensional
  stiffness defect, separate from the density fix. Typed products can detect this
  once shell integration and regularization are migrated.

## Design choice

Use a small handwritten module for the first slices. `#[repr(transparent)]` holds one
f64; `#[serde(transparent)]` preserves bare numeric JSON/JsValue fields. Private storage,
unit-named constructors/accessors, no `Deref`, no generic `Into<f64>`, no implicit
MPa/internal conversion. Addition/subtraction require the same unit; multiplication/
division exist only for reviewed dimensional identities. ν uses a dimensionless ratio.
The matrix is an explicit unit-erasure boundary because its translational and rotational
rows have different dimensions. A scalar type alone cannot describe that matrix.

[uom](https://github.com/iliekturtles/uom) and
[dimensioned](https://github.com/paholg/dimensioned) both provide compile-time dimensional
analysis. They are credible alternatives when the quantity graph becomes large. Here,
a small module makes the mixed wire-unit convention and exact floating operation order
visible in a short diff, adds no dependency compilation, and produces simple diagnostic
names (`Area` versus `SecondMoment`). Representation adds no per-quantity storage overhead. The transitional direct solver
currently clones a legacy view and retains typed lookup maps; those allocations are
a migration cost, to remove when validation and load algorithms accept typed input. No claim
is made that either crate is intrinsically slower/larger: comparative cold compile and
WASM-size measurements were not run on this shared laptop. Revisit the choice before
shell/continuum integration creates a large dimensional algebra; measure representative
builds with the same toolchain, optimization and WASM stripping.

TypeScript brands are compile-time checks only. They do not validate JSON, and arithmetic
on branded numbers yields a plain number. Named conversion functions are therefore the
only approved places for assertions. `NoInfer` prevents a display function from widening
a requested quantity to accept a different dimension. Runtime finiteness/physical-range
validation stays at the existing boundaries; this slice adds no refusals.

## Plan from slice 2 on

### Type design

- **Rust.** Keep the handwritten `quantity!` newtypes in `engine/src/types/units.rs`: one
  `#[repr(transparent)]` `f64`, `#[serde(transparent)]`, a unit-named constructor and
  accessor (`Area::from_m2`/`in_m2`), same-unit `+`/`-`, scaling by `f64`, and `*`/`/` only
  for the identities listed in `product!`/`quotient!`. A new dimension is one `quantity!`
  line plus its reviewed identities. Do not switch to a dimension-generic `Quantity<L, M, T>`
  (or `uom`) until the shell/continuum slices need dozens of derived dimensions; the
  newtypes also separate same-dimension units the wire mixes on purpose (MPa versus kN/m²).
- **Zero cost, bit-identical.** Each type is one `f64` with every method `#[inline]` and no
  extra operation: `in_m2()` returns the stored bits and `a * b` performs the single `f64`
  multiplication the untyped code performed. A migration must keep the original operation
  order (no regrouping `E·I/L³` as `E·(I/L³)`) and the original constants; any change of
  order is a result change and does not belong in a units PR. The quantity wrappers add no
  code or storage in WASM: they erase at compile time, and serde reads the same JSON number.
  The transitional `into_legacy()` / `legacy_view()` adapters do rebuild the material and
  section maps; that cost goes away as each slice moves the erasure point inward.
- **Wire records.** Each typed record mirrors its legacy DTO field for field, with the same
  serde attributes, so the same JSON parses to the same bits and malformed JSON gives the
  same error text. The legacy DTOs become `SolverInput<M, S>` / `SolverInput3D<M, S>`
  generics whose defaults keep every existing Rust caller unchanged.
- **Erasure points.** A typed value becomes a bare `f64` only at a named, reviewed point:
  `into_legacy()` / `legacy_view()` for not-yet-migrated algorithms, and stiffness-matrix
  insertion, where rows of different dimensions share one matrix. Each slice moves an
  erasure point further in; none adds an unnamed one.
- **TypeScript.** Branded numbers in `web/src/lib/engine/unit-types.ts`
  (`Quantity<'m⁴'>`), admitted only by named constructors (`areaM2`, `inertiaM4`,
  `warpingM6`, `lengthM`, `mpa`, ...) at the model-to-wire adapters, and by the typed
  display conversions. The brands are erased at runtime; the adapters must keep key order
  and key presence so `JSON.stringify` of the wire (also a cache key and a reproduction
  hash input) is byte-identical.

### Boundary contract

The units that cross WASM, in both directions, are the engine's: lengths and coordinates m,
areas m², second moments and the torsion constant m⁴, warping constant m⁶, forces kN,
moments kN·m, line loads kN/m, area loads kN/m², **E in MPa**, densities kg/m³,
added masses t, rotations rad, temperature differences °C (= K), α 1/°C, time s, frequency
Hz for inputs that say so. Results come back in the same units; shell resultants are kN/m and
kN·m/m; stresses that a result names as MPa are MPa. Conversion between display units and
these happens in the web app only (`utils/units.ts`, `unit-types.ts`); conversion from MPa
to kN/m² happens in the engine only (`ModulusMPa::to_internal`). Neither side converts the
other's values, and no JSON field changes name, unit or presence in this program.

### Ordered slices

Ranked by risk: the boundary first, because every number crosses it, then the code that
feeds design verdicts. Each slice is one PR, a branch `units/slice-N-<name>`. Every slice
must (a) leave every result bit-identical, proven by CI's `test.web.determinism`, the
results-snapshot gate and its own `to_bits` test against the legacy path, never by updating
a snapshot or a tolerance; (b) add Rust `compile_fail` doctests in `types::units` (run by
`make test.engine.units-types`, part of `test.engine.gates`), each with a positive control
that compiles, so a broken import cannot pass as a compile failure; (c) add TypeScript
`@ts-expect-error` checks in `web/src/lib/engine/__tests__/unit-types.typecheck.ts` (run by
`npm run test:units:types` inside `make typecheck.web`; an unused directive fails). Estimates
are for one engineer who has read this document.

| # | Slice | Risk | Estimate |
| --- | --- | --- | --- |
| 1 | 2D frame material/section into assembly (#864) | — | done |
| 2 | 3D input boundary: material/section records at every 3D WASM export (#1711) | — | done |
| 3 | Node coordinates and nodal/point loads at both boundaries (#1744) | — | done |
| 4 | Distributed, thermal and support-spring inputs at both boundaries (#1752) | — | done |
| 5 | Result DTOs: displacements, reactions, element end forces, both dimensions (#1755) | — | done |
| 6 | 3D frame kernel consumes the typed section (Iy/Iz/J/Cw, shear φ) | medium | 2–3 days |
| 7 | Remaining 2D entry points; delete `legacy_view` | medium | 2 days |
| 8 | Steel member checks (Rust `certify::design` and TS steel codes): mm/N/MPa clause boundary | high | 3 days |
| 9 | RC flexure/shear checks: the same, one clause family per PR | high | 3 days per family |
| 10 | Mass, dynamics, self-weight: `MassDensity`/`WeightDensity`, t, s, Hz/rad/s, g | high | 3 days |
| 11 | Shells and continuum: thickness, resultants per length, drilling stiffness | high | 4 days |
| 12 | Nonlinear/plastic/fiber/certificates; then a CI rule forbidding raw conversions in migrated paths | high | 4 days |

**Slice 2 — 3D input boundary (#1711).** `SolverInput3D` becomes
`SolverInput3D<M = SolverMaterial, S = SolverSection3D>`. `ElasticSection3D` mirrors
`SolverSection3D`: `a`, `as_y`, `as_z` are `Area`; `iy`, `iz`, `j` `SecondMoment`; `cw`
`WarpingConstant` (m⁶, new); `shear_center_y/z` `Length`. `ElasticInput3D =
SolverInput3D<ElasticMaterial, ElasticSection3D>` and its `into_legacy()` (moves every
field; the struct literal is exhaustive, so a new field fails to compile until it is mapped)
is the only erasure point. Every 3D WASM export parses `ElasticInput3D`: the direct ones in
`lib.rs`, `reproduce::linear_hashes`, `LoadSession3D`, the cable input, and every wrapper's
`solver` field through `#[serde(deserialize_with = "crate::types::units::deserialize_input_3d")]`.
TypeScript: `input3DToWireObject` returns `ElasticMaterialWire` and `ElasticSection3DWire`
records via `materialToWire` and `section3DToWire`. Not covered: `StagedInput3D` (its own
struct, slice 7) and 3D internals, which still read `f64` after `into_legacy()` (slice 6).
Proof: `engine/tests/core/units_boundary_3d.rs` (a source scan fails if a 3D wrapper field or WASM parse skips the typed records; every 3D fixture parses to the same bits,
results equal apart from wall-clock timings, malformed sections give the same error text,
wrappers route through the typed path); 5 new `compile_fail` doctests plus a positive
control; 8 new `@ts-expect-error` checks; a Vitest check that the 3D wire JSON text, key
order and absent keys equal the previous builder's.

**Slice 3 — node coordinates and nodal/point loads.** Add `Length`-typed `x/y/z` node
records (`TypedNode`, `TypedNode3D`, keeping 2D's `z` with `alias = "y"`), and `Force`/
`Moment` typed nodal loads (`fx/fz/my` in 2D; `fx/fy/fz/mx/my/mz` in 3D) and point-on-member
loads (`p: Force`, `a: Length`). Add a third and fourth generic parameter to
`SolverInput`/`SolverInput3D` (`N`, `L`) with legacy defaults, mapped in `into_legacy()` /
`legacy_view()`. The load enums are `#[serde(tag = "type", content = "data")]`: mirror the
enum exactly (same tags, same variant order) and map variant by variant; any variant left
unmapped must be a compile error, not a `_ =>` arm. TS: brand `fx…mz` and node coordinates in
`input2DToWireObject`/`input3DToWireObject` with `forceKn`, `momentKnM`, `lengthM`. Compile-fail:
force into moment, length into force, kN·m into kN, 2D `fx` assigned a `Moment`. Risk: the 2D
`y`→`z` alias and old-file aliases must still parse; test every 2D and 3D fixture as slice 2
does, including error text.

Done in #1744. Rust: `TypedNode`/`TypedNode3D`, `TypedNodalLoad` (`fx`, `fz` `Force`; `my`
`Moment`), `TypedPointLoad` (`a` `Length`; `p`, `px` `Force`; `my` `Moment`), `TypedNodalLoad3D`
(`fx…mz`, plus the warping bimoment `bw` as a new `Bimoment`, kN·m², in Rust and TS) and `TypedPointLoad3D` (`a`;
`py`, `pz`), inside `TypedLoad`/`TypedLoad3D`, which mirror the legacy enums variant for variant
and convert with exhaustive matches. The records are declared in `units::wire` under the legacy
names and re-exported under the typed ones, so serde's error text for malformed input is the
legacy text, including the struct name. `ElasticInput2D::into_legacy` is the 2D erasure point
(`legacy_view` now clones and calls it); `ElasticInput3D::into_legacy` maps nodes and loads too.
Scan gap from #1711 (a parse with no type at the call site): closed in the type system rather
than by a stricter scan. `SolverInput3D`'s derived `Deserialize` is bounded on `units::TypedWire`,
implemented only by the typed records, and the legacy `SolverInput3D` implements `Deserialize`
by parsing `ElasticInput3D` and calling `into_legacy`. Every parse of a 3D model, inferred,
generic or nested, therefore goes through the typed records; a mixed instantiation has no
deserializer at all. TS: `nodeToWire`, `node3DToWire`, `loadToWire`, `load3DToWire` in
`unit-types.ts` (with `forceKn`, `momentKnM`, `lengthM`), used by `input2DToWireObject` and
`input3DToWireObject`; they copy only the nodal and point-on-member loads and keep every key's
order and presence. Not covered: 2D entry points other than `solve_2d` still parse the legacy
`SolverInput` (slice 7), and the hand-built wire objects in `wasm-solver.ts` (2D spectral,
plastic, moving loads and similar) still pass nodes and loads unbranded (slice 7).
Proof: `engine/tests/core/units_boundary_nodes_loads.rs` (every 2D and 3D fixture plus two
models with every node/load field, old-file aliases and signed zeros: same bits for every node
coordinate and load component against `tests/core/units_legacy_3d.rs`, an independent copy of the
legacy 3D derive that the slice-2 tests now use too, so a valid input the typed path rejects fails, byte-identical
serialized results, the same error text for 13 malformed node/load inputs and for property
records); 11 new `compile_fail` doctests with their error code (E0308 for a wrong unit, E0277 for
a mixed-record 3D input) plus a positive control; 18 new `@ts-expect-error` checks; Vitest checks
that the node and load JSON text, key paths and signed zeros equal the previous builder's.

**Slice 4 — distributed, thermal and support inputs.** `LineLoad` (kN/m) for
`qI/qJ/qY…/qZ…`, `AreaLoad` (kN/m²) for plate/quad pressures, `TemperatureDifference` (°C,
no affine conversion offered) and `ThermalExpansion` (1/°C) for thermal loads,
`TranslationalStiffness` (kN/m) and `RotationalStiffness` (kN·m/rad, new) for support
springs `kx…krz`, `Length` for prescribed displacements and `Angle` (rad, new) for prescribed
rotations and support/member rotation angles. Same mirroring rules as slice 3. TS brands in
the same two adapters and in `unitInputCommit` for these quantities. Compile-fail: kN/m into
kN, kN/m² into kN/m, a temperature difference added to an absolute temperature (do not define
an absolute temperature type until a field needs it), kN/m into kN·m/rad.

Done in #1752. Rust: new quantities `LineLoad` (kN/m), `AreaLoad` (kN/m²), `TemperatureDifference`
(°C, `from_delta_c`; no absolute temperature type and no `+ f64`), `ThermalExpansion` (1/°C),
`RotationalStiffness` (kN·m/rad), `Angle` (rad) and `AngleDeg` (degrees), with the identities
line load × length = force, area load × length = line load, rotational stiffness × angle = moment
and α × ΔT = strain. Typed records under the legacy names in `units::wire`: `TypedDistributedLoad`,
`TypedAxialDistributedLoad`, `TypedThermalLoad` (2D); `TypedDistributedLoad3D` (`qX…qZ`, `a`, `b`),
`TypedThermalLoad3D`, `TypedPressureLoad` (every plate/quad/quad9/solid-shell/curved-shell
pressure), `TypedPlateThermalLoad` (plate/quad/quad9/curved-shell thermal) and `TypedQuadEdgeLoad`
(`qn`, `qt` kN/m) inside `TypedLoad`/`TypedLoad3D`, still converted with exhaustive matches;
`TypedSupport` (`kx`, `ky` kN/m, `kz` kN·m/rad, `dx`/`dz` m, `dry`/`angle` rad, keeping the `dy`/`drz`
aliases), `TypedSupport3D` (`kx…kz`, `krx…krz`, `dx…dz`, `drx…drz`) and `TypedElement3D`. A fifth
generic on `SolverInput` (`P`, supports) and a fifth and sixth on `SolverInput3D` (`P`, `E`, elements)
default to the legacy records; `into_legacy` maps them, and both are `TypedWire`, so a 3D model with
a legacy support or element record has no deserializer. **Deviation from the plan:** the 3D member
roll angle is degrees on the wire (`compute_local_axes_3d` converts it), so it is `AngleDeg`, not
`Angle`; typing it as radians would have been the very mislabel this program prevents. Not typed
here: the warping spring `kw` (its unit, kN·m³, belongs with slice 6's warping work), the inclined
support normal and member orientation vector (dimensionless directions), the self-weight loads
(density and gravity, slice 10) and the `bimoment` load record. TS: `lineLoadKnM`, `areaLoadKnM2`,
`temperatureDeltaC`, `expansionPerC`, `springKnM`, `springKnMRad`, `angleRad`, `angleDeg`, with
distinct brands for same-dimension roles (a kN/m line load is not a kN/m spring; a kN/m² area load
is not a kN/m² modulus); `loadToWire`/`load3DToWire` brand every member load variant,
`supportToWire`, `support3DToWire`, `element3DToWire` are used by `input2DToWireObject`/
`input3DToWireObject`, and `plateThermalToWire` by the shell thermal load builder; `pressureToWire` and `quadEdgeToWire` brand shell pressures and edge loads, which the web app does not send today (it turns surface loads into nodal forces); `unitInputCommit`
enters line loads, area loads, temperature differences, springs, displacements and rotations through
the typed conversion. Proof: `engine/tests/core/units_boundary_distributed_thermal_supports.rs`
(every 2D and 3D fixture plus models with every slice-4 field, aliases, absent optionals and signed
zeros: the same bits for every support, element and load component against the legacy derive and
`tests/core/units_legacy_3d.rs`, byte-identical serialized records and results, the same error text
for 23 malformed inputs at model and record level and for each record's wrong-shape input); 16 new
`compile_fail` doctests with their error code plus a positive control; 30 new `@ts-expect-error`
checks; Vitest checks that the support, element and load JSON text, key paths, extra web-only keys
and signed zeros equal the previous builder's, that the stored model is not touched, and that the
typed display entry commits the same numbers.

**Slice 5 — result DTOs.** Typed `Displacement`/`Displacement3D` (`Length`, `Angle`),
`Reaction` (`Force`, `Moment`), element end forces (`n/v/m` in 2D; `n, vy, vz, mx, my, mz` in
3D) on the output side, via the same generic-with-defaults pattern on `AnalysisResults` /
`AnalysisResults3D`, built at one named point after recovery. TS: branded result interfaces
in `types.ts`/`types-3d.ts` read by `display-units.svelte.ts`, so a display conversion of a
moment as a force fails to compile. Gate: the full results-snapshot corpus and
`test.web.determinism` unchanged; the serialized result text must be byte-identical (compare
strings, not parsed numbers, so `-0.0` is checked).

Done in #1755. Rust: typed records under the legacy names in `units::wire`: `TypedDisplacement`
(`ux`, `uz` m, `ry` rad, keeping the `uy`/`rz` aliases), `TypedReaction` (`rx`, `rz` kN, `my` kN·m),
`TypedElementForces` (`n`/`v` kN, `m` kN·m, `length` m, `qI`/`qJ` kN/m, with `TypedPointLoadInfo` and
`TypedDistributedLoadInfo`), `TypedDisplacement3D` (`ux…uz` m, `rx…rz` rad), `TypedReaction3D` (`fx…fz`
kN, `mx…mz` kN·m, `bimoment` kN·m²), `TypedElementForces3D` (with `TypedPointLoadInfo3D`; bimoments
kN·m²). `AnalysisResults<D, R, F>` / `AnalysisResults3D<D, R, F>` default to the legacy records;
`TypedResults2D`/`TypedResults3D` are the typed instances and `into_typed()` is the one named point
where results acquire units (a destructuring of every field, so a new field fails to compile until
it is mapped); the `solve_2d` and `solve_3d` exports serialize its output. The legacy result records
no longer derive `Serialize`: each serializes by converting to its typed record, so every result
serialization (certificates, combinations, envelopes, time histories and any other wrapper) goes
through the typed records, and the conversions destructure the legacy record without `..`. The
warping displacement stays `f64` (its unit, rad/m, belongs with slice 6). TS: branded
`AnalysisResultsWire`/`AnalysisResults3DWire` in `unit-types.ts` (rather than in `types.ts`, so the
stored-model interfaces and the 75 production files that build result objects stay unchanged),
admitted by `resultsFromWasm`/`results3DFromWasm` in `solve`/`solve3D`; typed display readers
`fmtTypedQ`/`toTypedQ` in `display-units.svelte.ts`, and `length`, `force`, `moment` and `bimoment`
join the typed display quantities. Not covered: the app components still read the numeric result
interfaces through `fmtQ`/`toQ` (moving them to `fmtTypedQ` is a follow-up, one view per PR), and the
other WASM result exports return their own result types. Proof:
`engine/tests/core/units_boundary_results.rs` compares, for every 2D and 3D fixture solve and every
stored result fixture, the serialized text against `tests/core/units_legacy_results.rs`, an
independent copy of the previous derived serializer, plus hand-built results with signed zeros,
aliases and absent optionals, and the same error text for malformed records; 12 new `compile_fail`
doctests (E0308) plus a positive control; 17 new `@ts-expect-error` checks; Vitest checks that the
admission returns the same object and JSON text and that the typed display conversions give the same
numbers.

**Slice 6 — 3D frame kernel.** Thread `ElasticSection3D`/`ElasticMaterial` through
`prepare_static_3d` into `frame_local_stiffness_3d` / `_warping` and 3D force recovery, as
#864 did for 2D: typed `E·A/L`, `E·I/L³`, `G·J/L`, `E·Cw/L³`, shear `φy`/`φz`, erasing only
at matrix insertion. Capture the pre-migration 12×12 and 14×14 local matrices for several
property sets (with and without shear areas, warping, releases) into
`engine/tests/fixtures/units-frame3d-stiffness.json` at the base commit and compare every
entry with `to_bits`. This is the first slice that touches arithmetic; it is ranked after the
boundary slices so their tests already pin the inputs.

**Slice 7 — remaining 2D entry points.** Constrained, multi-case, staged (2D and
`StagedInput3D`) and the native entry points take the typed input; truss/cable axial and
thermal/shear fixed-end forces consume typed properties; delete
`ElasticInput2D::legacy_view` and the temporary property maps. Gate all release patterns,
shear, thermal, constraints, dense/sparse/parallel and full result snapshots.

**Slices 8–9 — design checks.** One clause family per PR, highest-consequence first: steel
member resistance (axial, flexure, interaction, lateral-torsional buckling), then RC flexure,
RC shear, columns, punching, footings, connections. Each check's inputs arrive in kN/kN·m/m
and its formulas use N/mm/MPa: add `ForceN`, `LengthMm`, `MomentNmm`, `StressMPa` types and
named conversions (`Force::in_n()` etc.), so the clause body cannot read a kN value as N.
The verdict (utilization ratio) is a `Ratio`. TS equivalents in `web/src/lib/engine/codes/`.
Gate: worked-example tests (`design_worked_examples*.rs`) unchanged to the bit, plus the
web code-check tests. Compile-fail: kN into an N parameter, kN·m into N·mm, MPa into kN/m².

**Slice 10 — mass and dynamics.** `MassDensity` (kg/m³) versus `WeightDensity` (kN/m³) with
gravity explicit in the only conversion, `Mass` (t), `Time`, `Frequency` (Hz) versus
`AngularFrequency` (rad/s), spectral accelerations as fractions of g versus m/s². Gate the
historical self-weight fix (`4fb92f162`), modal mass, time history and spectra.

**Slice 11 — shells and continuum.** Thickness, membrane resultants (kN/m) versus stress,
bending resultants (kN·m/m) versus moment, drilling stiffness (the `G·h²/1000` versus
`G·h/1000` defect noted above becomes a type error to fix in its own result-change PR).
Re-evaluate a dimension-generic representation here, measured on WASM size and build time.

**Slice 12 — nonlinear, plastic, certificates, and the lock.** Plastic capacities, fiber
stress/strain, residual stress, creep, certificate reassembly; then a CI check (extend
`scripts/inventory-unit-conversions.py`) that fails on a new raw `* 1000.0`, `/ 1000.0` or
`1e-3` in a migrated module.

## Validation

Commands are deliberately scoped; use `CARGO_BUILD_JOBS=2` and
`CARGO_TARGET_DIR="${TMPDIR:-/tmp}/stabileo-units-target"` for every Cargo invocation.

- `cargo test -p dedaliano-engine --doc types::units`: wrong force/length assignment,
  MPa/internal assignment, area/inertia addition, and assignments to the actual
  typed input material/section fields must fail compilation.
- `cargo test -p dedaliano-engine --lib types::units::tests`: serde/layout,
  typed full-input round trips, dense/sparse shear-frame results equal to the legacy
  `solve_2d` (compared through JSON, so `-0.0` and `0.0` are not distinguished), the
  typed shear parameter bit-identical to `timoshenko_phi_2d` (the fixed-end-force source),
  and 288 frame matrix entries (8 matrices ×36) compared bit-for-bit, including signed
  zeros, with the pre-migration kernel captured at the surveyed commit in
  `engine/tests/fixtures/units-frame-stiffness.json`. Only those 288 entries are compared
  with the captured kernel.
- `npm run test:units:types`: 13 `@ts-expect-error` checks plus valid assignments,
  using `tsconfig.units.json`; unused directives fail the command.
- Targeted Vitest: `unit-types.test.ts`, `unit-input.test.ts`, `assert-finite-wire.test.ts`.
- Rebuilt WASM, then `snapshot-basic.test.ts -t '^2d-'`: affected 2D corpus only, using
  the existing results gate without updating snapshots or tolerances. Gate equality is
  at the repository's existing tolerance; bit identity is asserted by the kernel test.

Previously recorded native verification on this branch: 5 quantity/solver tests, 5 compile-fail doctests,
and 17 `core::linear_2d` tests passed; `cargo check --features parallel` passed.
The review-fix TypeScript rerun accepted the positive cases and all 13 negative checks.
Existing compiler warnings outside this workstream were left unchanged.

Previously recorded rebuilt-WASM verification: 26 targeted web tests passed (6 unit-boundary,
12 existing unit-input, 8 existing finiteness tests); the Basic snapshot filter
passed 18 checks, skipping 7 unrelated cases. No snapshot file or tolerance was
changed. Thus 48 targeted runtime tests passed in total, plus 18 snapshot checks,
5 Rust compile-fail checks and 13 TypeScript negative type checks. The frame golden
comparison found zero changed bits across 288 coefficients. The conversion index
is lexical coverage, not a proof that all legacy conversions have been migrated.

The review-fix rerun uses the existing `src/vite-env.d.ts` declarations in
`tsconfig.units.json`, which are required by the public solver boundary's imports.
`npm run test:units:types` passed; `npm run typecheck` reported 247 existing errors
against a baseline of 247, with zero new errors.
Runtime, snapshot and bundle measurements were not repeated for this documentation
and typecheck-configuration correction.
