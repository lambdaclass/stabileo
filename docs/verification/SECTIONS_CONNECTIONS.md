# Sections, catalogue and material data, connections: verification

What was checked, against what, and what it found. Every row cites a reference that is
independent of the code being tested and names the test that keeps it true. Numbers from
published sources are quoted as printed, and slips in those sources are listed rather than
encoded. A row marked **uncovered** had no source that could be obtained, and is not guessed.

Last run: 2026-10-17, branch `verify/sections-connections`.

## Findings, unsafe first

| # | Severity | What | Reference | Fix and test |
|---|---|---|---|---|
| 1 | **Unsafe** | The shear solve ignored `Iyz`. On non-principal axes the field carried a spurious resultant `Iyz/Iy`, so the shear centre, shear areas, shear stresses and **Cw** were wrong for angles, Z, lipped and unequal sections and rotated outlines. An equal angle 100x100x10 had its shear centre at (−8.5, −8.5) mm instead of (5.3, 5.3) and Cw 24 times too large (1.14e9 vs 4.67e7 mm⁶). An overstated Cw inflates warping stiffness and LTB capacity. | Unsymmetric bending, `dσ/dx = (Iz z − Iyz y)/D`; independent quadratic FE (sectionproperties, ν = 0) | `section/shear.rs`; `engine/tests/section_fe_reference.rs` |
| 2 | **Unsafe** | Bolt bearing used the end bolt's `Lc = e − dh/2` for every bolt. Interior bolts have `Lc = s − dh`, and with a generous edge distance they are the weaker ones: at `s = 3d` they never reach `2.4 d t Fu`. Affected both the designed joint and the PRO-tab calculator. | CIRSOC 301-2018 §J.3.10; INTI ejemplos 1 and 5 | `connection/bolted-joint.ts` (`boltGroupBearing`, Σ min(shear, bearing) per bolt), `engine/connection-design.ts`; `connection/__tests__/published-examples.test.ts` |
| 3 | **Unsafe** | End-loaded fillet welds longer than 300w were credited `0.6 L` in the PRO-tab calculator. The clause fixes `Le = 180 w`, so the credit was 67 % too much at 500w. | CIRSOC 301-2018 eq. J.2.1 | `engine/connection-design.ts`; same test file |
| 4 | **Unsafe** | IRAM steels F-24, F-26 and F-36 used E = 210 000 and G = 80 769 MPa. Those are the CIRSOC 301:1984 values. | CIRSOC 301-2018 §A.3.5: E = 200 000, G = 77 200 | `data/structural-grades.ts`; `structural-grades.test.ts` |
| 5 | **Unsafe** | Material presets were above their standards: RC unit weight 24 kN/m³ (25 per CIRSOC 101-2025 Tabla 3.1 and EN 1991-1-1 Table A.1); the NBR 6118 concrete modulus was `Eci` (§8.2.8 prescribes the secant `Ecs`, 8–18 % lower); aluminium 5052-H32 was 195/230 (EN 1999-1-1 Table 3.2a: 130/210); 6063-T6 was 170/205 (Table 3.2b: 160/195). | as cited | `data/non-metal-grades.ts`, `data/structural-grades.ts` |
| 6 | **Unsafe** (display) | When the Saint-Venant solve failed, the PRO advanced section panel kept the polygon analyser's `j`. That value is Routh's approximation, more than 2× the true J on an I. | — | `ProAdvancedTab.svelte`; engine doc of `SectionProperties::j` |
| 7 | Wrong sign | `Iyz` of a clockwise polygon, or of a hole wound clockwise, came out with the wrong sign. That mirrors the principal axes of asymmetric custom or drawn sections. | Exact rational triangle-fan integration | `section/mod.rs`; `section_exact.rs` |
| 8 | Conservative | Saint-Venant J on thin walls was far low: −18.5 % on a 2–4 mm I and −23.9 % on a 2 mm channel. The P1 Prandtl value is a strict lower bound. The mesh now also bounds triangles by `(2A/P)²/50`, which brings these to −2.2 % and −3.3 %. | sectionproperties | `lib.rs::normalize_and_mesh`; `section_fe_reference.rs` |
| 9 | Conservative | Combined tension and shear divided the required shear stress by φ, which put F′nt 20–40 % below Tabla J.3.6. | Tabla J.3.6 (`806 − 2,5 fv`); ejemplo 8 | `bolted-joint.ts` |
| 10 | Data | M5x18.9: the table's Iz = 327 cm⁴. Its own outline gives 363 and AISC v16.0 gives 362. | AISC Shapes Database v16.0 | `data/iram-hp-m.ts` |

Not fixed, reported:

- **Stainless grades.** The values are EN 1993-1-4 Table 2.1 cold-rolled strip (the thinnest product). Hot-rolled plate is 10–30 MPa lower, and there are no thickness bands.
- **EN 10025-3 N grades** have no bands above 40 mm (EN 1993-1-1 Table 3.1).
- **7020-T6** uses 280 MPa for every thickness, but Table 3.2b gives 275 for 15 < t ≤ 40.
- **Some EN 338 timber densities** are up to 20 kg/m³ above EN 338:2016.
- **`ifc-mapper.ts` `c35`** has E = 35 000, against Ecm = 34 000.
- **Thin-plate J is still low.** A single 30:1 plate reads 2.2 % low; this is the lower bound and conservative.

All of these come from the materials review. They were not changed here, either because the change touches modelled bands rather than a value, or because a primary source could not be fetched (the timber and IFC items).

## Section properties

| Quantity | Shapes | Reference | Tolerance | Test |
|---|---|---|---|---|
| A, centroid, Iy, Iz, Iyz | rectangle, sharp I/H, channel, unequal angle, tee, RHS: 40 random rational dimension sets each | exact rational closed form (disjoint-rectangle union, `BigRational`) | 1e-12 relative | `section_exact.rs` |
| same | 30 random star polygons (5–44 vertices) with holes, both windings | exact rational triangle-fan integration | 1e-11 | `section_exact.rs` |
| A, I of polygonised circles and CHS | 32–256-gons | exact n-gon: `A = nR² sin(2π/n)/2`, `I = nR⁴ sin(2π/n)(2+cos(2π/n))/24`; SymPy-verified for n = 3…12 | 1e-12 | `section_exact.rs`, `verify/sections/derive_closed_forms.py` |
| i1, i2, θp | all of the above | trace, determinant, and rotation by θp zeroing Iyz and returning i1. θp is the angle, anticlockwise from +Y, of the axis that carries i1. | 1e-11 | `section_exact.rs` |
| Wel top/bottom/left/right, r | all of the above | `I/c` to each extreme fibre, `√(I/A)` | 1e-12 | `section_exact.rs` |
| Wpl (Z) | mesh path, all families (PNA in flange, web or leg) | exact rational PNA and first moments | 1e-9 | `section_exact.rs`; also 1e-6 against sectionproperties |
| J (Saint-Venant) | rectangles 1:1 to 30:1, equilateral triangle | Saint-Venant series; `√3 a⁴/80` | below the exact value; within 0.5–3 % | `section_fe_reference.rs` |
| J | I, H, channel, UPN, angle, tee, RHS R=2t, CHS, thin I and C | sectionproperties (6-node quadratic elements, mesh A/4000, same vertex lists) | lower bound; within 1–5 % | `section_fe_reference.rs` |
| Cw | same open sections | sectionproperties | 1 % (observed ≤ 0.03 %) | `section_fe_reference.rs` |
| Shear centre | channel, UPN, angle, tee, thin C | sectionproperties (elastic and Trefftz agree) | 0.5 % of √A | `section_fe_reference.rs` |
| Shear areas | all | sectionproperties with ν = 0 (the same physical problem); rectangle 5/6 | 1.5 % | `section_fe_reference.rs` |
| Thin-walled formulas in the CIRSOC checker | I `Cw = Iz h0²/4`; channel `e` and `Cw` (AISC DG 9); Bredt `J = 2t bm² hm²/(bm+hm)`; plate-sum Z | SymPy derivation from the sectorial coordinate | exact identity | `derive_closed_forms.py` |
| RC section integration | 300x500 mm, 4 bars, at a given c; turned 90° and wound clockwise | hand strain-compatibility calculation | 1e-9 | `section_exact.rs` |

`analyze_section`'s own `zy`/`zz` (strip approximation) and `j` (Routh) are not used for design. Z comes from the mesh path, and J from the torsion solve or a table. They are documented as approximations.

**Uncovered:**

- Composite (multi-material) transformed sections beyond the existing tests.
- The column-capacity kernel's φ law, which is the member-design agents' scope.
- Cold-formed effective-section properties (`profiles/cold-formed.ts`).

## Catalogue data

| Family | n | Against producer table | Tabulated vs computed from dimensions (`catalogue-tabulated-vs-computed.test.ts`) |
|---|---|---|---|
| IPE, HEA, HEB, HEM | 80 | ArcelorMittal Orange Book (2023) and eurocodepy. All dimensions exact; A and I within table rounding (≤ 0.9 %, none unconservative over 1 %). HEM J matches the Orange Book. | max \|dA\| 0.40 %, \|dI\| 0.47 % |
| IPN | 21 | ArcelorMittal IPN sheet: exact | 0.23 % / 0.49 % (DIN 1025-1 taper and radius rules) |
| UPN | 12 | Orange Book: exact. Note that the Orange Book rounds r2 up to 0.5 mm; the outline uses 0.5 tf. | 0.28 % / 0.44 % |
| L, EN equal and unequal | 42 | Orange Book: exact except L 30x30x3 Iy, 1.41 vs 1.40 (+0.7 %) | L family ≤ 2.0 % / 0.64 %; unequal-angle J within 4 % |
| W, HP, M, C, MC (IRAM) | 345 | AISC Shapes Database v16.0. 339 profiles matched; 20 W and the small IRAM angles have no v16 entry. A and I agree to a median of 0.0–1.1 %. Above AISC by more than 1 %: 11 MC Iy (≤ 1.7 %), 7 C Iy (C3x6 +4.1 %, whole-cm⁴ rounding), W40x183 Iz (+1.5 %), and L 63.5x63.5x4.8 A (+3.2 %, IRAM radii). | W ≤ 4.0 % / 5.5 % (nominal dimensions, declared per profile); HP 1.0 / 1.3 %; M 2.2 % after the M5x18.9 fix; C 1.5 / 4.7 %; MC properties-only |
| T, L (IRAM small) | 50 | No AISC equivalent (**uncovered** externally) | ≤ 1.8 % / 1.7 % |
| RHS, SHS, CHS (IRAM, R = 2t) | 239 | IRAM-IAS tables (Troglia), internally consistent (`g = 0.785 A`, `r = √(I/A)`) | A ≤ 0.07 % (CHS 1.0 %); I ≤ 0.8 % (CHS 2.8 % at 12.7 mm). Tabulated J: SHS up to 8 % BELOW the Saint-Venant lower bound, so the table is conservative; CHS within the 2-decimal rounding. |

Fillet-radius differences are explained per family in the data files. In EN profiles the radii are exact. In W, HP, M and C the radius is solved from the published clear web depth. IRAM L and T publish both radii. The comparison scripts and outputs are reproducible from the sources above; the Orange Book and AISC v16.0 xlsx were read on 2026-10-17.

## Materials and grades

| Grade(s) | Verified against | Result |
|---|---|---|
| F-24 / F-26 / F-36 | IRAM-IAS U 500-503; CIRSOC 301-2018 §A.3.5 | fy/fu match. E and G corrected (finding 4). The −20 MPa band above 30 mm comes from the 1984 edition and is kept as conservative. |
| A36, A572 42–65, A992, A913, A588 | ASTM | match. A529 Gr.50 fu is 450 against ASTM 485, which is conservative. |
| S235–S450 incl. 40–80 mm bands; S275N–S460N (t ≤ 40) | EN 1993-1-1 Table 3.1 | match; N-grade bands missing (reported) |
| ADN 420; H-20…H-50; ACI 3000–6000 psi | CIRSOC 201-2025 Tabla 20.2.1, Eq. 19.2.2.1.b; ACI 318 §19.2.2.1 | match |
| EN C20/25…C50/60 | EN 1992-1-1 Table 3.1 | match (E); density corrected |
| NBR C20…C50 | NBR 6118 §8.2.8 | corrected to Ecs |
| Aluminium 6060, 6061, 6082 (bands), 5083-H111 | EN 1999-1-1 Table 3.2b | match; 5052-H32 and 6063-T6 corrected |
| Stainless 1.4003…1.4462 | EN 1993-1-4 Table 2.1 | cold-rolled-strip values (reported) |
| Timber C16…D60 | EN 338:2016 | E0,mean matches; some densities high (reported) |
| A500, A653, A1011, A1003, EN 10346, NBR 7007/7008 | — | **uncovered** (no source fetched) |

## Connections

The equations follow CIRSOC 301-2018 (AISC 360-05 form in SI). The sources used:

- **[E18]** INTI-CIRSOC, *Ejemplos de aplicación … CIRSOC 301-2018*, July 2018.
- **[A15]** AISC v15.1 Companion, Vol. 1, Design Examples.

| Check | Implemented in | Published example (printed values) | Test |
|---|---|---|---|
| Bolt shear φFnvAb, planes | bolted-joint, connection-design | [E18] Ex 1: 61,63 kN/bolt (A325 5/8" X). Ex 5 flange: 49,8 kN (ISO 8.8 16 N). Group of 8: 398,4 kN. | `published-examples.test.ts` |
| Bolt tension φFntAb | both | [E18] Ex 8: 93,4 kN | same |
| Combined T+V, F′nt | both | Tabla J.3.6 `806 − 2,5 fv`; [E18] Ex 8 `806 − 2,0·62,2 = 681,6 > 620 → 93,4 kN` | same |
| Bearing/tear-out, end and interior, Σ min per bolt | both | [E18] Ex 1: end 74,6 → φ 55,95 kN; interior capped at 90,25; group 179,2 kN. Ex 5: end 174,80, interior 180,44 kN. | same |
| Fillet weld 0,60·0,6FEXX·0,707w·L | fillet-weld, connection-design | [E18] Ex 3: 12,22 kN/cm (dw = 1 cm). Ex 2: 4 mm × 113 mm carries 55 kN. | same |
| Min/max fillet size | both | [E18] Ex 2 (5 / 4,40 mm), Ex 3 (6 mm) | same |
| End-loaded β, 180w | both | [A15] J.1: l/w = 144 → β = 0,912; eq. J.2.1 | same |
| Hole sizes, min edge distance, spacing, max edge distance | bolt-geometry | Tablas J.3.3 and J.3.4, §J.3.3 and §J.3.5, read against the shipped text | existing `bolt-geometry.test.ts` |

Source slips that are not encoded:

- Ex 1 labels the bearing cap with the hole diameter.
- Ex 4 takes the interior Lc as s − d.
- Ex 5 (web) uses Fnv = 320.
- Ex 2 adopts a weld below its own stated minimum.

**Uncovered (not implemented in the app):**

- Block shear (J.4.3)
- Slip-critical (J.3.8/J.3.9)
- Prying
- Eccentric bolt groups (elastic/ICR)
- Weld groups and the directional strength increase
- Plate tension yield and rupture (J.4.1)
- Batten plate design

Worked examples exist for most of these ([E18] Ex 1, 3, 4, 5, 7, 8; [A15] II.A-24…27, II.D-1). They are the starting point when the checks are added.

## Reproducing

- `cargo test --release -j 4 --test section_exact --test section_fe_reference` (engine)
- `npx vitest run src/lib/connection src/lib/section src/lib/data src/lib/grades src/lib/material` (web, after `make wasm`)
- `python -I verify/sections/derive_closed_forms.py` (SymPy)
- `python -I verify/sections/sp_reference.py geom.json 4000` (sectionproperties ≥ 3.x)

The outline JSON is dumped from the catalogue builders, so both solvers see identical vertices.
