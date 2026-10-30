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
assignments are not yet prevented. Removing these bridges is the first remaining slice.
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

## Remaining reviewable slices

1. **Extend the retained typed 2D input to every entry point.** Migrate constrained,
   multi-case, staged and legacy native entry points; remove the temporary legacy
   validation/load view. Migrate truss/cable axial stiffness, thermal
   FEF and shear FEF alongside frame material/section properties. Give model-to-wire
   producers branded fields, rather than rebranding raw stored numbers. Gate all release
   patterns, shear, thermal, constraints, dense/sparse/parallel and full result snapshots.
2. **2D loads and outputs.** Length, force, moment, line load, displacement, rotation,
   spring stiffness and section stress in input/output DTOs; typed matrix insertion and
   extraction helpers. Keep JSON names/numbers and old-file aliases. Require compile-fail
   force/moment and m/mm examples plus unchanged native/WASM snapshots.
3. **3D members and shells.** Iy/Iz/J/Cw, torsion/warping/bimoment, offsets and shell
   thickness/resultants. Distinguish force/length resultants from stress and moment/length
   resultants from moment. Re-run only affected 3D/shell snapshots and invariance filters.
4. **Mass, dynamics, thermal.** kg/m³ versus kN/m³, tonnes, seconds, Hz/rad/s, gravity,
   absolute versus difference temperature and α. Gate historical density/thermal fixes,
   modal mass, self-weight and time-history cases; preserve #762 reproductions.
5. **Nonlinear and certification.** Plastic capacities, fiber stress/strain, residual
   stress, creep and staged properties; exact/certified arithmetic must retain units too.
   Numerical fixes for #758/#762 remain separate PRs with their own result-change review.
6. **Design checks and remaining UI/import/export.** Migrate one clause family at a time,
   including its mm/N/MPa formula boundary and result/report conversion. Then retire raw
   DTO adapters/constructors outside serialization and audited model import. Audit all
   inventory sites again; add a CI rule forbidding new ad-hoc conversions in migrated paths.

## Validation

Commands are deliberately scoped; use `CARGO_BUILD_JOBS=2` and
`CARGO_TARGET_DIR="${TMPDIR:-/tmp}/stabileo-units-target"` for every Cargo invocation.

- `cargo test -p dedaliano-engine --doc types::units`: wrong force/length assignment,
  MPa/internal assignment, area/inertia addition, and assignments to the actual
  typed input material/section fields must fail compilation.
- `cargo test -p dedaliano-engine --lib types::units::tests`: serde/layout,
  typed full-input round trips, exact dense/sparse shear-frame results,
  shear-expression bit identity and 288 frame matrix entries (8 matrices ×36) compared
  bit-for-bit, including signed zeros, with the pre-migration kernel captured at the
  surveyed commit in `engine/tests/fixtures/units-frame-stiffness.json`.
- `npm run test:units:types`: nine `@ts-expect-error` checks plus valid assignments,
  using `tsconfig.units.json`; unused directives fail the command.
- Targeted Vitest: `unit-types.test.ts`, `unit-input.test.ts`, `assert-finite-wire.test.ts`.
- Rebuilt WASM, then `snapshot-basic.test.ts -t '^2d-'`: affected 2D corpus only, using
  the existing results gate without updating snapshots or tolerances. Gate equality is
  at the repository's existing tolerance; bit identity is asserted by the kernel test.

Native verification on this branch: 5 quantity/solver tests, 5 compile-fail doctests,
and 17 `core::linear_2d` tests passed; `cargo check --features parallel` passed.
The TypeScript compiler accepted the positive cases and all 9 negative checks.
Existing compiler warnings outside this workstream were left unchanged.

Final rebuilt-WASM verification: 26 targeted web tests passed (6 unit-boundary,
12 existing unit-input, 8 existing finiteness tests); the Basic snapshot filter
passed 18 checks, skipping 7 unrelated cases. No snapshot file or tolerance was
changed. Thus 48 targeted runtime tests passed in total, plus 18 snapshot checks,
5 Rust compile-fail checks and 9 TypeScript negative type checks. The frame golden
comparison found zero changed bits across 288 coefficients. The conversion index
is lexical coverage, not a proof that all legacy conversions have been migrated.
