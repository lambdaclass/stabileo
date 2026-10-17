# Changelog

Read next:
- solver roadmap: [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/docs/roadmap/SOLVER_ROADMAP.md)
- benchmark/proof status: [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/docs/BENCHMARKS.md)

This file is the historical record.
It should capture what changed, not what should be built next.

## Unreleased

### Changed

#### Further unsafe design-check gaps closed (2026-10-17)

**BREAKING (results): web fillet welds, EC3/AISC lateral-torsional buckling, EC3 Class 4
members, AISC 360 slender-element columns, CIRSOC 301 T/double-angle/channel columns and
CIRSOC 301 tension members give lower capacities, or are refused (not evaluated) where the
inputs needed to compute them safely are absent.**

- **The web fillet weld applied β only to welds marked end-loaded** — the opposite default from
  the engine's weld groups. `designFilletWeld` (joint designer) now treats an undeclared weld as
  end-loaded (CIRSOC 301 §J.2.1, the conservative side); `loading: 'other'` opts out, and the
  joint panel's selector defaults to end-loaded. The Connections tab's quick
  `checkFilletWeld` credited `0.6 L` above `300 w` instead of the clause's `180 w` (at
  `L = 600 w`, twice the allowed length); it now caps at `180 w` and takes `endLoaded`
  (default true).
- **EC3 Mcr ignored where the load acts** (the zg = 0 expression, NCCI SN003b eq. (3)), which
  overstates Mcr for the usual gravity load on the top flange. It is now SN003b eq. (2) with
  the load height zg and C2. `Ec3MemberData` takes optional `geometry` (I/RHS/CHS plate
  dimensions) and `ltb` (`c2`, `loadPosition`, `zg`); absent, the load is on the **top flange**
  (zg = +h/2) with C2 = C1 (a lower bound for every transverse-load case of SN003b Table 3.2),
  and a top-flange load without a depth is refused (not evaluated). The result reports `mcr`.
  SBE Worked Example A.1 (IPE 330, zg = +165 mm, C2 = 0.454: Mcr = 113.9 kNm; at the shear
  centre the check gave more than 1.3× that) is a regression test. The web EC3 check sends
  the section geometry, so its Mcr takes the top-flange load.
- **EC3 Class 4 members used the gross A and Wel when Aeff/Weff were not given**, and never
  added ΔM = eN·NEd. A Class 4 section buckles locally before A·fy or Wel·fy, so the stand-in
  was unconservative by the whole effective-width reduction (a welded I 600×300×12×6 in S355:
  Aeff = 8330 of A = 10 656 mm², −22 %). Aeff, Weff,y and Weff,z are now computed from
  `geometry` by EN 1993-1-5 4.3/4.4 (internal and outstand ρ, Tables 4.1/4.2, web ψ from the
  effective flanges, 4.4(3)) for I and RHS; `aEff`/`weffY`/`weffZ` still override. New
  `eNY`/`eNZ` give the centroid shift; with geometry it is 0 (doubly symmetric). Without
  either, the checks that need the missing property are refused and named ("Class 4 Aeff",
  "Class 4 Weff,y", "Class 4 eN"); a Class 4 CHS (EN 1993-1-6) is refused. Class 3 and 4
  members in compression also get the cross-section check 6.2.9.2/6.2.9.3
  (`interactionRatioSection`), which (6.61)/(6.62) can fall below with Cm < 1. Tension
  yields the gross section (6.2.3) for every class. The result reports `aEff`, `weffY`,
  `weffZ`. The web EC3 check now checks Class 4 I and RHS members (it skipped them), and takes
  an I section as **welded** (Table 6.2 curves b/c, Table 6.4 c/d) unless it was picked from a
  rolled catalogue family — it read every I as rolled (a/b), unconservative for a welded or
  parametric section.
- **AISC 360 compression had no slender-element reduction (E7)**: Pn = Fcr·Ag for every section.
  A W14×22 at Lc = 1 m (h/tw = 53.3, footnoted slender in the Manual) was 10.9 % high, an
  HSS 12×8×3/16 16 %. `SteelMemberData` takes `compressionElements` (Table B4.1a kind: rolled
  or welded flange with kc, angle, tee stem, web, HSS wall, other stiffened, round HSS; b, t,
  count); Ae follows E7-2/E7-3/E7-5 with Table E7.1 c1, c2, and E7-7 for round HSS. **Without
  `compressionElements` the compression check is refused** (an empty list states that there is
  no element to reduce); a round HSS with D/t > 0.45E/Fy is refused. The result reports `ae`
  and names the check "Compression E3/E7".
- **AISC 360 lateral-torsional buckling ignored the load height.** `loadPosition` (`shearCentre`,
  `topFlange`, `bottomFlange`); absent, the load is on the **top flange** and Cb is multiplied
  by 1.4^(2y/h) = 1/1.4 (Helwig, Frank & Yura 1997; SSRC Guide §5.2.3). A bottom-flange load is
  not credited (Cb as given). Applies to F2-2 and F2-3; not to cantilevers, where the factor is
  not valid and Cb itself must be given for the case.
- The web AISC check sends the section's E7 elements (it marked slender columns not evaluated)
  and its LTB takes the top-flange load.
- **CIRSOC 301 compression checked flexural buckling only (§E.3/E.7).** §E.4 is now evaluated
  and Pn is the least of the limit states: E.4.4 torsional buckling for an I (whenever J and Cw
  are given; refused without them when kz·Lz > ky·L), E.4.2/E.4.3 for a tee without slender
  elements, E.4.5 flexural-torsional with Fez (E.4.9) for a channel or a slender tee, the Fe
  going into E.7.2a/E.7.3a with Q. A rolled-flange tee 200×150×12×10 at L = 3 m: φPn =
  392.8 kN where flexural buckling alone gave 451.8 (+15 %). `SteelDesignParams` takes `Kz`,
  `Lz` (default 1 and L) and `shearCentreOffset` (default from the thin-walled plates); a tee or
  channel without J is refused. Closed sections and solid bars are not checked for E.4. The
  steel workflow's «no torsional buckling» assumption is replaced by the one that remains:
  kz = 1 over the member length.
- **CIRSOC 301 tension rupture took Ae = Ag** (no hole deduction, no shear lag), optimistic for
  every bolted member and for any member connected through some of its elements. `SteelDesignParams`
  takes `tensionConnection`: `An`, or `holes` (count, nominal d, t, staggers) with the 2 mm of
  B.4.2.2 and s²t/4g; and U as given, `allElementsConnected` (D.3(1)), `plateWeld` {L, w} (D.3.5
  table, L < w refused) or `xBar`/`length` (D.3.2, U = 1 − x̄/L ≤ 0.9, not below `connectedArea`/Ag,
  on Ag when `welded`). **Without it, a member in tension is NOT EVALUATED** — the model holds no
  hole pattern or connection, so app tension members are now reported not evaluated until the
  connection can be given (`checkSteelMember`'s `lengths.tensionConnection`). The workflow's
  «Ae = Ag» assumption is removed (it is a refusal now).

#### Unsafe design-check disagreements closed (2026-10-17)

**BREAKING (results): weld groups with long fillets, CIRSOC 301 slender-element columns,
CIRSOC 301 noncompact/slender I-girders, CIRSOC 301 lateral-torsional buckling and EC3
members in compression plus bending give lower capacities.** These were the unsafe
disagreements left open by the published-example verification
(`docs/verification/DESIGN_EXAMPLES.md`, D5, D6, D8, D11); each example is now a regression test.

- **Weld groups ignored the end-loaded fillet length reduction β** (AISC 360-22 J2.2b(d),
  CIRSOC 301-2018 §J.2.2(b) eq. J.2.1). AISC Example J.1 (two 27 in. runs of a 3/16 in.
  fillet, l/w = 144) prints φRn = 206 kips; stabileo gave 225. `WeldSegment` takes an
  optional `endLoaded`; absent, the segment is treated as end-loaded (the conservative side),
  `false` opts out. The result reports `minBeta`.
- **EC3 member interaction was a linear sum with every k = 1**, not EN 1993-1-1 6.3.3. It is
  now eqs. (6.61)/(6.62) with the **Annex B** ("Method 2") interaction factors kyy, kyz, kzy,
  kzz (Table B.1, or Table B.2 for open sections with an LTB length). `Ec3MemberData` takes an
  optional `interaction` with Table B.3's `cmy`, `cmz`, `cmLt` (absent: 1.0, the table's upper
  bound) and `hollow`; the result reports `kYy`, `kYz`, `kZy`, `kZz` and both equations. A Cm
  outside [0.4, 1] is refused (not evaluated). Where Annex B gives k > 1 (near-uniform moment,
  high NEd/Nb,Rd) the old sum was unconservative. SBE Multi-Storey Part 8 Example 2 and the
  SBE Single-Storey Part 4 Appendix D column are regression tests. The web EC3 check no longer
  marks the interaction as not evaluated.
- **CIRSOC 301 compression had no slender-element reduction (§E.7).** Every section was taken
  as non-slender. Q = Qs·Qa now follows E.7.1/E.7.2 with the Table B.4.1a limits (rolled and
  welded flanges, angles, tee stems, I/channel webs, welded-box and RHS walls, circular tubes).
  INTI Ejemplo 10(c), a welded box with b/t = 72, prints Pd = 204.7 kN; the checker gave 237.4
  (+16 %). `SteelDesignParams` takes `shape` ('I', 'U', 'T', 'box', 'RHS', 'CHS', 'rect') and
  optionally `hw` and explicit `compressionElements`.
- **CIRSOC 301 flexure implemented only §F.2 (compact sections).** §F.3 (noncompact/slender
  flanges), §F.4 (noncompact webs: Rpc, rt, F.4.7/F.4.8) and §F.5 (slender webs: Rpg, F.5.3/F.5.4)
  are now applied by classification (Table B.4.1b cases 11, 12, 16), and §F.6.2 (minor-axis flange
  local buckling, case 14). INTI Ejemplo 14 girder V2 prints Md = 286.1 kNm (stabileo: 326.0,
  +14 %); girder V3 (slender web) prints Md = 771.4 kNm. Both are regression tests.
- **CIRSOC 301 lateral-torsional buckling used AISC 360-10's form** (rts, Mr = 0.7·Fy·Sx) and
  had no load height. It now follows F.2.4–F.2.7 (X1, X2, FL = Fy − Fr with Fr = 69 MPa rolled,
  114 MPa welded) with both load positions; `loadPosition: 'web' | 'topFlange'` selects
  F.2.4a/F.2.5a/F.2.6a or F.2.4b/F.2.5b/F.2.6b, and **absent it is 'topFlange'**, the lower of the
  two, because the checker does not know where the load acts. INTI Ejemplo 14 V1 case I-B
  (top-flange deck, Lb = 5 m) prints Md = 18.39 kNm, and braced at midspan 37.91 kNm.
- **The CIRSOC 301 checker refuses what it cannot classify.** A shape outside the list above
  (e.g. cold-formed 'C', which is CIRSOC 303), strong-axis flexure of non-I shapes (§F.7–F.11 not
  implemented), a circular tube with D/t > 0.45·E/Fy, a girder with aw > 10, LTB beyond Lp
  without J, or a channel with a slender web come back **not evaluated** (`notEvaluated`, ratio
  ∞, status fail, diagnostic `VERIF_STEEL_NOT_EVALUATED_*`), never as a pass; H.1 interaction is
  refused when it would need a refused capacity.
- **The app's CIRSOC 301 verification takes a section as welded unless it was picked from a rolled
  catalogue family** (`profileFamily`): Fr = 114 MPa, Table B.4.1 case 2/12 flanges and Aw on the
  web height, each the conservative side for a parametric or imported section. It now also passes
  the section's `shape`.

#### Design checks against published worked examples (2026-10-17)

**BREAKING (results): CIRSOC 201 shear, CIRSOC 301 web shear, doubly reinforced ACI 318 / CIRSOC 201 flexure,
AISC flexure of sections given a flange slenderness, and EC3 strong-axis checks with
Lb = 0 give different numbers.** Each was found by reproducing a published worked example
clause by clause (`docs/verification/DESIGN_EXAMPLES.md`,
`engine/tests/design_worked_examples.rs`), and each example is now a regression test.

- **AISC F3/F6.2 flange local buckling was not implemented.** Every W-shape was treated as
  having compact flanges, so a noncompact flange kept Mp: AISC Example F.3B (W21×48) gave
  φbMn = 401 kip-ft against 398. `SteelMemberData` takes an optional `flangeSlenderness`
  (bf/2tf); when given, F3-1/F3-2 cap the major-axis strength and F6-2/F6-3 the minor-axis
  one (slender flanges use the clause's lower bound kc = 0.35, as h/tw is not an input).
- **Doubly reinforced sections were not solved by strain compatibility** (ACI 318 and
  CIRSOC 201 checks). The neutral axis came from the "A's yields" trial and was never
  iterated; with As = A's that trial is c = 0 and the singly reinforced moment came back.
  INTI's CIRSOC 201 Example 2.I.7 prints Mn = 57.40 kNm; stabileo gave 56.21 (ACI) and
  56.97 (CIRSOC). Both now bisect on c.
- **CIRSOC 201 shear used ACI 318M's 0.17 for the 1/6 of CIRSOC 201-2005 §11.3.1.1** (and
  0.66 for the 2/3 of §11.5.7.9): Vc was 1.9% high against INTI Example 3.I. The φ
  transition now starts at εty = fy/Es (§10.3.3) instead of a fixed 0.002.
- **CIRSOC 301 web shear (web checker) used AISC 360-10's rule, not CIRSOC 301-2018 §G.2.1.**
  The Cv = 1 limit was 2.24·√(E/Fy) with kv = 5.34 and there was no elastic branch G.2.5,
  so a slender web kept the inelastic Cv; Aw was the total depth also for built-up
  sections. INTI's CIRSOC 301 Example 14 (welded girder V2, h/tw = 138) prints Cv = 0.336
  and φVn = 130.3 kN; the checker gave 0.536 and 207.8 kN. It now applies G.2.3–G.2.5 with
  kv = 5, and `SteelDesignParams.builtUp` selects the web height for Aw.
- **EC3 strong-axis flexure was NaN (unevaluated) for Lb = 0.** Mcr divided by Lb²; a
  continuously restrained member now takes χLT = 1.

#### Solver fixes found by result certificates and OpenSees differential testing (2026-10-15)

**BREAKING (results): models with Timoshenko members under member loads, plastic analyses,
HHT-α time histories, spectral member forces, harmonic responses, partial distributed loads,
2D truss axial point loads and 2D spring rollers solve differently.** Each was found by a
certificate disagreeing with the solver (`docs/verification/CERTIFY.md`) or by the
comparison against OpenSees (`tools/opensees/`), and each has a regression test.

- **Timoshenko members used Euler–Bernoulli fixed-end forces.** Members with shear areas
  assembled a shear-flexible stiffness but loaded it with Euler–Bernoulli fixed-end forces,
  so point loads, couples, partial and trapezoidal loads gave wrong displacements and end
  forces (13.6% on a short cantilever). All member-load fixed-end forces now integrate the
  load against the Timoshenko element's own shape functions; the FEF functions take `phi`
  explicitly. Validation models 04 and 07 moved (largest maxima change 0.67%, applied loads
  unchanged). The member deflection curve in the web now includes shear deflection.
- **Plastic analysis placed hinges only at member ends.** With the peak moment inside a
  loaded member the collapse factor was overestimated, which is unsafe: a one-element fixed
  beam under UDL gave 60.28 instead of 37.5 (2D), and a space portal swaying out of plane
  77.04 instead of 33.33 (3D). Both solvers now search each member's moment diagram for
  span hinges, close hinges whose rotation reverses, and (3D) no longer read a failed solve
  as collapse. 3D hinges under biaxial bending can still land 0.4–3.6% below the certified
  value, on the safe side, and the solver warns.
- **HHT-α was not HHT-α.** It was Newmark with HHT's β and γ and a load blend: dissipative
  but first-order accurate. It now integrates the α-weighted equation of motion and is
  second-order accurate.
- **Spectral member forces included static member loads.** Every mode's member forces
  carried the fixed-end forces of the model's distributed, point and thermal loads, and
  SRSS/CQC combined them as if dynamic (simple beam, q = −20: V_max 25.70 instead of 0.758).
  Modal forces now come from the inertia response only.
- **Harmonic responses were truncated silently.** The omitted modes are now added as a
  static (mode-acceleration) correction, cutting the error against a direct solve from
  ~7e-5 to ~1e-7 of the peak. `HarmonicResult` reports `method`, `modesUsed`, `nDof`,
  `truncationRatio` and `warnings`.
- **Partial distributed loads** were integrated with 20-panel Simpson (~1e-4 relative
  error); now exact Gauss–Legendre.
- **2D truss end forces** ignored axial member point loads.
- **2D roller supports with a spring** on the free DOF left the spring force out of the
  reaction.
- **New warning `StiffnessNotPositiveDefinite`** when the factored stiffness is singular or
  indefinite (LU fallback, a diagonal shift, or a Cholesky pivot at round-off level).
  Numbers are unchanged; the solver used to return them without comment.

#### Shell elements: rigid motions, the DKT triangle, and three sign conventions (2026-09-24)

**BREAKING (results): every model with shell elements solves differently.** Four defects,
found by one check that every element must pass and none did: its stiffness must
annihilate the six rigid motions (`tests/shell_rigid_body_modes.rs`).

- **Drilling stabilisation resisted rigid rotation (MITC4, MITC9, DKT+CST, curved
  shell).** The penalty was γ·∫θz² on the drilling DOF alone. A rigid rotation about the
  normal then cost energy, so the term acted as a spring to ground on every shell node,
  about its normal. A beam sharing nodes with a slab and bending in the slab's plane lost
  part of its moment to the ground: reactions stopped balancing the loads, and floor beams
  under gravity carried weak-axis moments the structure does not have. It is now the
  Hughes–Brezzi term γ·∫(θz − ω)², ω = ½(∂v/∂x − ∂u/∂y), with the same γ (G·t/1000). On
  curved shells it uses the interpolated surface's own normal and dual basis, so it
  vanishes on rigid rotation for any geometry; `rigid_body_modes_curved` was relaxed to 2e-4
  for exactly this energy and is now held to 1e-10.
- **The DKT triangle's B-matrix coefficients were wrong.** Pₖ, qₖ and tₖ had the wrong form
  (Pₖ = −6xy/l² instead of −6x/l², on xⱼ − xᵢ). The element did not annihilate a rigid
  tilt, and a simply supported square plate read 3.75–4.0× Navier's deflection at every
  mesh density. It had passed its benchmark because that benchmark accepted anything within
  5×. It now follows Batoz, Bathe & Ho (1980) and converges to Navier: 0.961, 0.991, 0.998,
  1.000 at 4×4, 8×8, 16×16, 32×32. The benchmark now holds 16×16 to 0.5 %.
- **The curved shell turned its director by d × θ.** Every rotation DOF of the element had
  the opposite sign to the frames and MITC4 it shares nodes with. A tip moment on a
  curved-shell strip bent it the wrong way (+1.59e-3 against −1.60e-3). It now uses θ × d.
- **MITC4 and MITC9 thermal gradients curled plates the wrong way.** With
  dt_gradient = T(+z face) − T(−z face), the convention of the frames' `dt_gradient_z`, of
  the curved shell and of the corrected DKT, a hotter top curled a clamped plate up. The
  moment sign in `quad_thermal_load` and `quad9_thermal_load` is corrected. Centroid
  and nodal stress recovery use the matching free thermal curvature, so a freely curling
  plate reports zero moments. DKT reports sagging-positive moments, matching MITC4/9 and
  the reinforcement design convention, while preserving physical top/bottom fibre stresses.
  Analytical checks cover both gradient signs, free and restrained plates, and bending/twist
  (`tests/shell_stress_conventions.rs`).

Assembled with an upper triangle mirrored, the new terms are exactly symmetric. The shell
modal golden in `tests/core/sparse_mass.rs` was re-captured: the bending modes moved by
1e-8 to 6e-7 relative. `tests/shell_model_equilibrium.rs` pins the model-level
consequences on all four elements: tip moment sign, thermal curl, and reaction balance
with an edge beam.

On the web side, the flagship `pro-edificio-7p` now has no provisional-biaxial beams. Its
last five had secondary ratios of 0.106–0.244, and the drilling spring produced them: they
are 0.010–0.028 now. Tests that exercise the provisional path turn five beams 20° about
their axis (`ROLLED_BEAMS` in `workspace-scene.ts`), which bend about both axes for a real
reason.

#### Modal participation of constrained models (2026-09-24)

**Output change: `participationX/Y/Z`, effective masses and mass ratios from modal analysis of
models with constraints, and every spectral result built on them.** With constraints the
eigenproblem is solved in the reduced space, and the participation numerator φᵀM r was formed
as (Cᵀr)ᵀ(CᵀMC)φ_s. Cᵀ is the force transform: for N nodes tied by EqualDOF it sums their ones
into N, so Γ came out N× too large and the effective mass N²× — three tied columns reported a
cumulative mass ratio of 3.34, a one-storey diaphragm 434. A diaphragm's Cᵀr also put the
nodes' eccentricities on the master's θz, a torsional participation no rigid translation has.

The numerator is now φ_s · Cᵀ(M r): the inertial load of a unit ground acceleration, reduced as
the force it is, which is exact for every constraint type. Unconstrained models compute the
same numbers as before. Pinned by `tests/modal_constrained_participation.rs`, which compares
each constrained model with the same structure tied by stiff massless links.

The web app does not send constraints to modal analysis today, so this was reached only
through the engine API.

#### Modal participation factors refer to the published mode shape (2026-09-23)

**Output change: `participationX/Y/Z` from modal analysis, and every spectral displacement and
member force.** `solve_modal_2d`/`solve_modal_3d` computed Γ on the eigenvector as the
eigensolver returned it (mass-normalized) and then published that vector scaled to a unit
maximum, without rescaling Γ. Γ scales inversely with its shape, so the pair no longer
belonged together — and `solve_spectral_2d`/`solve_spectral_3d` build each modal response as
Γ·φ·Sd from exactly that pair. Spectral displacements and member forces came out multiplied by
the reciprocal of the eigenvector's largest entry: √m for a single-degree-of-freedom system,
3.13× for a 9.8 t girder, growing with the square root of the model's mass.

Γ is now rescaled with the shape. Unaffected: frequencies, periods, mode shapes, effective
masses and mass ratios (Γ²·φᵀMφ is invariant), and therefore spectral base shear, which is
built from effective mass. Pinned by `validation/domains/dynamics/spectral_normalization.rs`:
Γ = 1 and u = Sa/ω² for an SDOF frame in 2D and 3D, and the modal expansion Σ Γₙφₙ = ι over
all modes of a cantilever, in every direction, in 2D and 3D — an identity that holds under any
normalization only if Γ and φ share one.

The PRO modal table's "Cum. X/Y" columns added up |Γ| and read the sum as a mass percentage
against the 90 % target; with unit-maximum shapes a cantilever's first mode showed 157 %,
marked sufficient, while carrying 61 % of the mass. (That display was fixed separately on
main; this entry covers the engine side.)

#### Shell edge loads: outward normal sign corrected (E6 audit, 2026-08-14)

**BREAKING (saved models): `quadEdge` and `quad9Edge` loads reverse direction.**
`quad_edge_load` and `quad9_edge_load` built their in-plane normal as `ez × et`, which
points INWARD for the CCW node ordering `quad_local_axes` guarantees — the opposite of
the convention documented on `SolverQuadEdgeLoad` ("positive `qn` = outward from
element") and of `curved_shell_edge_load`, which has always used `t̂ × d̂`. The three
shell elements disagreed, and the two quads contradicted their own documented input.

The code now matches the documentation, so **the documentation did not change and the
results did**. Any existing model carrying a `quadEdge`/`quad9Edge` load now produces
forces in the opposite direction: a case that read as tension reads as compression.
There is no version gate and no automatic migration — `qn` is passed through unmodified
at every call site. Re-check any saved model that uses these load types, and negate `qn`
where the previous (inward) direction was the intended one.

Unaffected: `curved_shell` edge loads, which were already correct; pressure loads; and
any model without edge loads.

**Magnitude fix in the same place.** The normal was also unnormalized. `ez` is derived
from the element diagonals, so it is perpendicular to the edge chord only when the quad
is planar; on a warped element `|et × ez| = sin θ < 1` and `qn` was applied at that
fraction of its stated value — correct direction, silently short, and invisible to any
test built on a flat square. Both quads now normalize, matching `curved_shell`.

#### Curved shell thermal gradient: 2× factor removed (E6 audit, 2026-08-14)

`curved_shell_thermal_load` applied twice the thermal moment it should. The through
-thickness gradient term now integrates to `M_T = Eα·ΔTg·t²/(12(1−ν))`, matching
`quad_thermal_load`. Thermal-gradient results on curved shells change by a factor of 2.

#### RC Design workflow rebuild — verified auto-design, honest invalidation (PR15, 2026-07-25)

**BREAKING (verification results): `cirsoc201.provided.v1` → `cirsoc201.provided.v2`.**
Statuses produced by earlier versions are NOT comparable with this release — some
previous passes were false. Every design certificate now records `verifierId`, and
the UI carries a migration notice (`design.cert.migrationNotice`).

**Reported regression fixed.** A committed reinforcement edit called
`verificationStore.clear()`, which emptied the design table and also destroyed
`concreteMap` — the data the live provided-rebar verification needs as input. Editing
reinforcement now preserves the table, the expansion, filters, scroll position and
selection; the affected member re-verifies immediately from retained demand.

**The real trust bug fixed.** The table summary and the viewport overlay read the
auto-design baseline, which is "designed to pass" by construction. Weakening a
member's rebar left the viewport green. Status everywhere is now derived from the
PROVIDED reinforcement, with three honest display states: current, stale (desaturated
status colour + hatch + glyph) and unavailable (never green).

**Governing-axis correction.** Beam and column verification was hardcoded to the
Mz/Vy pair while the generator selected the axis per member. Measured on the
408-member flagship frame: 128 X-beams received *false passes* (utilization 0.62 while
the real 1113 kN·m gravity moment was unchecked), and columns were designed for a
6 kN·m moment while carrying 973 kN·m. Both now consume a single
`resolveDesignAxes` result. Missing reinforcement in a loaded region is an explicit
FAILURE instead of a silently skipped check; column ties check both shear components;
the slenderness magnifier reaches the verifier.

**Auto-design now produces verified reinforcement.** A deterministic, bounded
candidate search designs each beam region independently, enforces bar fit at
generation time, recomputes the effective depth from the actual layer centroid, and
verifies every candidate with the authoritative verifier the UI displays. Outcomes are
`VERIFIED` (with a certificate), `SECTION_INADEQUATE` (exhaustive, with a preliminary
section recommendation), `DEMAND_UNAVAILABLE`, `SEARCH_EXHAUSTED` or `UNSUPPORTED` —
none of which is ever counted as a pass. Measured on `rc-design-frame`:
**376/408 failing before → 408/408 VERIFIED after** at rebuild time, worst certified
utilization 0.993, 408 members in ~0.4 s. (The second review round below later
tightened biaxial coverage: the same frame now reports 386 VERIFIED + 22 honest
refusals of previously false-passing wind-combo beams.)

**Utilization convention** is now demand/capacity everywhere (warn 0.95 < u ≤ 1.00,
fail above 1.00); the ad-hoc `1/ratio` inversion in the UI is gone.

**Review hardening (PR #78 review follow-ups).** Three verifier defects in the
regional rewrite, all in `station-design-forces.ts`:

- Column uniaxial P-M capacity was analyzed about the WRONG axis for My-governed
  rectangular columns (b≠h): the capacity axis followed the moment NAME instead of
  the flex-rotated section, checking at the strong depth — measured false passes of
  ~2.2x (util 0.68 reported where the true value is 1.51). The mapping is now
  primary→depth h, secondary→depth b.
- Opposite-sign demand was silently unchecked: hogging in the span (cantilevers,
  pattern live load, uplift) and sagging at the supports were filtered out of every
  region. A new sweep checks them against the steel that actually reaches each region
  (from the curtailment/continuity resolution) and FAILS explicitly when none does;
  the candidate generator seeds and escalates support top steel for span hogging and
  span bottom steel for support sagging. The pre-PR sweep coverage is restored.
- Shear capacity received the axial force in the solver's sign (+ = tension) while
  expecting compression-positive — compression weakened members (false failures) and
  tension strengthened them (unsafe passes). Both call sites now pass -N. Column ties
  also use a per-axis effective depth (secondary axis used the primary depth).

Plus: stirrup/tie legs clamped to [2, 6] and column face bars to 6 at the store layer
(typed input bypassed the editors' max; legs multiply shear capacity unchecked);
`designOne` keeps provisional flags in sync; the design table no longer hijacks
editor keystrokes (Enter collapsed the row being edited). Regression coverage:
`design/__tests__/review-fixes.test.ts` (9 tests incl. rectangular-column P-M,
cantilever-style span hogging, shear axial sign) and
`store/__tests__/rebar-review-fixes.test.ts` (clamps + provisional sync).
The flagship frame still designed 408/408 VERIFIED with the sweep active
(now 386 + 22 explicit biaxial refusals — see the second review round below).

**Review hardening, second round (independent review of the full PR).** Six
further fixes, each RED-verified before the change:

- Biaxial column P-M mapping: the first-round axis fix covered the uniaxial branch
  only; the biaxial branch passed moments by name into the rotated section. Same
  physical column gave utilization 0.903 vs 0.518 depending on axis naming; now
  primary→Muz/secondary→Muy with a mirror-symmetry regression test.
- Biaxial beams (secondary demand ≥10% of primary) are now explicitly REFUSED
  instead of certified with an unchecked axis — 22 wind-combo beams on the flagship
  frame moved from false-pass to `SEARCH_EXHAUSTED (limiting: biaxial)`.
- Undo/redo of reinforcement-only edits goes through the silent path: the analysis,
  demand and results survive Ctrl+Z (previously a full invalidation).
- Solve generations are stamped on every results publish: verification computed
  against superseded forces now displays as `stale` (previously unreachable), closing
  the self-weight/axis-convention re-solve hole.
- Solve results that arrive after a model mutation are discarded (mutation-epoch
  guard in live-calc) — the moving-load fix generalized to the main combination path.
- The 190 `design.*` i18n keys now exist in all 14 locales (2,280 translated strings)
  with a key-parity test.

**One "Run Design" button became three explicit commands plus Design all**
(compute demands / run code check / auto-design), with progress, cancellation and
partial-run honesty. Reinforcement writes go through
`modelStore.reinforcementTransaction`: one undo step per action, one reactive commit,
no model-version bump and **zero structural solves** — previously rebar edits were not
undoable at all.

**Added**: derived member grouping (elevation bands labelled `L3 +10.20 m`, structural
planes, frame lines with a collinearity gate, section/material/kind/connectivity),
batch editing with preview + validation + opt-in "Protect manual overrides" +
one-step undo, changed-members review with provisional (uncertified) candidates, a
design-code adapter registry (CIRSOC 201 implemented; ACI/Eurocode/NDS/TMS/AISI
registered as honestly unsupported), and Playwright browser coverage.

**Fixture corrections**: `rc-design-frame` authored its 120 Y-direction beams' gravity
load in the local *y* (horizontal) component — 240 load entries moved to `qZ`. Load
combinations added; sections enlarged to 500×500 columns and 350×650 beams so the
flagship example demonstrates a complete design. New `rc-design-qa-8` fixture for fast
deterministic tests. `orientation-diagnostic.ts` detects this class of error and blocks
certification for affected members.

**Initially-suspected solver defect: withdrawn.** While authoring this work, a raw
WASM probe (no explicit `localY`) appeared to bend a global-Y member about local y
instead of local z — ratio exactly Iz/Iy — and it reproduced on the untouched baseline,
so it was written up as a pre-existing upstream defect. CI disproved that: `web/src/lib/wasm/`
is gitignored and CI rebuilds it from the current `engine/` source, where the same probe
returns the correct Iz result. The authoring machine's binary predated the newest engine
commit by nine days. There is no solver defect and no solver change is needed; the
regression coverage in `design/__tests__/orientation-boundary.test.ts` now asserts the
correct behaviour and fails with an explicit "rebuild your local WASM" message if a
stale binary is used.

**Deferred to the next PR**: continuity-aware continuous-beam detailing, coordinated
bar cutoff/laps across spans, beam-column joint design, seismic joint checks and
strong-column/weak-beam design.

### Performance

#### JsValue boundary on the 8 hot WASM exports (2026-07-24)

- `solve_2d`/`solve_3d`, `combine_results_2d`/`3d`, `compute_envelope_2d`/`3d`, and `solve_multi_case_2d`/`3d` now cross the JS↔WASM boundary as `JsValue` (serde-wasm-bindgen, maps as plain objects) instead of JSON text — no `stringify`/`parse` round trip on the hot path. Export names unchanged; ~70 cold exports untouched.
- Worker pool messages carry structured-cloned plain objects instead of ~1MB JSON strings, removing main-thread JSON work from the parallel 3D combinations path.
- `assertFiniteWire` guard preserves the old boundary semantics: NaN/Infinity inputs are rejected before reaching the solver (JSON.stringify used to coerce them to `null`, which serde_json rejected).
- New `web/scripts/bench-wasm-boundary.mjs` benchmark (`npm run bench:wasm-boundary`): combine+envelope per call 1.15–2.1× faster; single-solve total is noise-bound (boundary is ~2% of solve).

### Fixed

#### Hinge/release correctness cleanup (2026-04-26)

Systematic cleanup of hinge/release semantics across the solver contract:

- **Bug A — orphan rotation DOFs**: 2D and 3D kinematic analysis now detect rotation-only zero-stiffness rows directly from `K_ff` instead of relying only on topology heuristics. Dense 2D assembly also stabilizes these orphan rotational DOFs so truss-attached pinned nodes no longer fail as false mechanisms.
- **Bug B — 3D articulated arch / over-release**: 3D frame elements now use explicit per-axis end releases (`releaseMy`, `releaseMz`, `releaseT`) instead of ambiguous generic hinge booleans. This fixes the articulated-arch failure mode caused by releasing both bending planes at once.
- **3D schema cleanup**: legacy 3D `hingeStart` / `hingeEnd` fields are no longer accepted by the solver input contract; stale 3D JSON now fails loudly instead of silently preserving broken semantics.
- **3D UI bridge mapping**: the current 3D hinge bridge now maps the existing generic UI hinge toggle to a single in-plane bending release (`Mz`) rather than an accidental ball-joint-style double release.
- **Regression coverage**: Rust + TypeScript reproducers now cover both the orphan-rotation false mechanism and the 3D articulated-arch release contract.

#### Trust hardening — 25+ correctness fixes (2026-04-19)

Systematic audit and fix of solver correctness issues across elements, constraints, and diagnostics:

- **Timoshenko hinge FEF condensation**: correct shear/moment redistribution ratios derived from stiffness matrix — `sv = 6/(L(4+φ))`, `sm = (2-φ)/(4+φ)`. Both 2D (φ=0) and 3D (φ_y, φ_z) call sites updated across `assembly.rs`, `sparse_assembly.rs`, `linear.rs`, `corotational.rs`
- **Pre-solve gates**: `run_pre_solve_gates_3d` wired into all advanced solvers (corotational, material_nonlinear, fiber_nonlinear, winkler) — shell distortion, suspicious local axes, isolated/duplicate nodes
- **Shell distortion / Jacobian gating**: quality metrics for Quad9 (MITC9), SolidShell (SHB8-ANS), and CurvedShell — aspect ratio, skew, warping, Jacobian ratio at integration points. 24 shell mesh quality gate tests
- **RigidLink DOF validation**: `validate_constraint_refs` now checks RigidLink DOF indices against `max_dofs_per_node` (3 for 2D, 6 for 3D)
- **Inclined support equilibrium summary**: reactions transformed from support-local to global before summing, fixing incorrect totals. 2D + 3D tests
- **Hognestad tangent**: removed contradictory dead code in pre-peak ascending branch
- **Cable validation**: cable elements now pass input validation (were rejected as unknown type)
- **Dead DKT code**: removed unused `ak/bk/ck/dk/ek` arrays from plate.rs

### Added

#### Certified results (2026-10-15)

After a solve the engine can prove rigorous bounds on how far its answers are from the
exact solution of the assembled model: interval-arithmetic a posteriori certificates for
linear static analysis (constraints included), member and shell forces, combinations and
envelopes, design utilizations, buckling, modal (with proof that no mode below the cutoff
was missed), spectral, harmonic, P-Delta, plastic collapse (2D and 3D, exact rationals)
and time integration. Their soundness is proved in Lean (`verify/`), and a verified Lean
checker re-checks exported certificate bundles. The web shows the certificates beside the
results. Kani proves the element kernels, interval rounding and sparse index code
(`docs/verification/KANI.md`); `scripts/kani-safe.sh` runs the harnesses one at a time
under a memory watchdog. See `docs/verification/CERTIFY.md`.

#### Step 4 runtime gates and CI improvements (2026-04-19)

- **Runtime regression gates** (`perf_regression_advanced.rs` — 11 tests): timing bounds for modal, buckling, harmonic, Guyan, Craig-Bampton on representative plate models; sub-cubic scaling verification; sparse path efficiency checks
- **k_full overbuild gates** (`kfull_overbuild_gates.rs` — 15 tests): audit confirmed all solver paths correct (no unnecessary k_full construction); gate tests lock down the contract; fill-ratio gates for frame, shell, and modal paths
- **CI pipeline**: named gates for perf regression, advanced perf, and k_full overbuild; quick criterion benchmark run with HTML artifact upload (30-day retention)

#### Frontend performance optimizations (2026-04-19)

- **Invalidation-based viewport rendering**: both 2D (Canvas) and 3D (Three.js) viewports now render on-demand instead of continuous 60fps loops. Continuous rendering only for active animations, keyboard navigation, and orbit damping. Idle CPU drops to near-zero
- **Live calc debounce**: 120ms for 2D, 200ms for 3D — prevents solver spam during drag/type operations. Manual solve remains immediate
- **Continuous rendering flag**: `uiStore.continuousRendering` toggle to opt-in to old always-render behavior

#### Comprehensive Z-up coordinate convention enforcement (2026-04-18)

Audited and fixed 60+ Z-up/Y-up axis convention inconsistencies across 30+ files:

- **viewport 3D rendering**: WASD pan uses forward.z (not forward.y), Q/E vertical movement on Z axis, distributed load axis fixed, 5 results-sync functions now use `projectNodeToScene()` (computeStructureBBox, syncVerificationLabels, applyFrameHeatmap, syncReactions, syncConstraintForces), measurement label offset corrected
- **store operations**: `splitElementAtPoint`, `mirrorNodes`, `rotateNodes` now preserve Z coordinate for 3D models
- **file persistence**: `.ded` files now persist `analysisMode` and `axisConvention3D`; share links serialize plates, quads, and constraints for PRO models; HTML report uses `dz`/`dry` instead of `dy`/`drz`
- **exports**: added `isMode3D()` helper so PRO mode uses 3D code paths in CSV, HTML, and Excel exports (6 instances in excel.ts, 3 in toolbar)
- **fixture loading**: separated spring stiffness keys from support opts in `load-fixture.ts`
- **IFC import**: added `ifcToZup()`/`ifcDirToZup()` remapping with parent placement hierarchy composition
- **backend AI**: `fz`/`my` as canonical 2D nodal load fields (`fy`/`mz` as serde aliases for backward compat); bounds contract uses `z_min`/`z_max` always-present, `y_min`/`y_max` optional for 3D
- **section stress**: quick-path `computeSectionStress` in `section-stress-3d.ts` fixed My/Mz ↔ yMax/zMax pairing per Navier formula (`σ = N/A + Mz·y/Iz + My·z/Iy`)
- **locale labels**: `rotMomentHelp` corrected across all 14 locales — My is weak-axis bending, Mz is strong-axis
- **basic 3D node creation**: `shouldProjectModelToXZ()` now excludes `'3d'` mode (was only excluding `'pro'`), fixing Y/Z swap in basic 3D mode node placement
- **axis validation**: added `validateAxisSafety()` to detect 2D files with non-zero Z coordinates on load
- **autosave**: `restoreAutosave()` now restores `analysisMode` and `axisConvention3D`

New tests: 39 tests across 4 new test files (model-zcoord, zup-results-sync-projection, fixture-support-metadata, file-save-load). All 1946 web tests and 5919 engine tests pass. (blended count predating the engine-coupled/reference split — see docs/BENCHMARKS.md 'Test taxonomy')

### Added

#### Extraction contracts, structured diagnostics, and solver-run artifacts

- hardened the beam-station extraction contract for downstream RC/steel workflows:
  - added `schemaVersion` to station payloads with documented evolution rules
  - added no-phantom-governing protections so empty governing entries do not serialize fake combo IDs or infinities
  - added representative full-pipeline regression fixtures for RC and steel solve → stations → demands workflows
  - added grouped/member-level snapshot and contract coverage
  - added governing combo names to governing entries and grouped member-governing entries
- added pre-solve model-quality gates for:
  - disconnected nodes / isolated components
  - near-duplicate nodes
  - initial 2D instability-risk detection
- expanded structured diagnostics and trust signals:
  - machine-readable diagnostic codes, severity, node/DOF references, and path-parity coverage
  - equilibrium and residual summaries in representative result payloads
  - sparse fill-ratio diagnostics after sparse Cholesky
  - documented tolerance policy by test type
- added a solver-run artifact contract for reproducibility and replay:
  - `SolverRunMeta` with engine version, build SHA, solver path, and model size
  - `SolverRunArtifact` carrying metadata, diagnostics, equilibrium, timings, result summary, and compact output fingerprint
  - JSON round-trip coverage for artifact serialization

### Changed

#### WASM-first with TS fallback across engine modules

- rewired kinematic analysis (2D/3D) to delegate to WASM when available, falling back to full TS LU rank analysis when not
- deduplicated diagram code: diagrams-3d.ts `computeDiagram3D` now calls `evaluateDiagramAt` instead of duplicating 140-line switch/case; diagrams.ts uses shared `buildDiagram` helper
- added TS fallback for `computeDeformedShape` (was WASM-only, broke tests)
- restored TS fallback for `analyzeSectionStress` (2D), `analyzeSectionStress3D`, and `analyzeSectionStressFromForces` — all had been migrated to WASM-only without fallback
- rewired `moving-loads.ts` to use TS solver when WASM unavailable
- net reduction of ~240 LOC across migrated files

### Fixed

#### Test infrastructure: localStorage and WASM fallback

- fixed `i18n/store.svelte.ts` localStorage crash in vitest: `typeof localStorage !== 'undefined'` passes in Node but `.getItem` is not a function; added `hasLocalStorage()` guard
- fixed test imports in `inclined-supports.test.ts` and `kinematic-analysis.test.ts` to import kinematic functions from `kinematic-2d` instead of `solver-js`
- test suite went from 122 passing / 3 failing / 31 suites crashing to 1625 passing / 0 failing / 35 suites green

### Added

#### Design-grade beam station extraction

- added `engine/src/postprocess/beam_stations.rs` with 2D and 3D station extraction
- `extract_beam_stations()` and `extract_beam_stations_3d()` evaluate M/V/N (or all 6 force components in 3D) at configurable stations per member, across all load combinations, tracking governing pos/neg values with combo provenance
- exposed as WASM functions `extract_beam_stations` and `extract_beam_stations_3d` for direct use from the product layer
- default 11 stations (tenth-points), configurable via `num_stations`
- 8 unit tests (endpoint parity, midspan UDL, governing combo split, configurable count, missing element skip, determinism, 3D endpoint parity, envelope cross-check)
- 3 integration tests (full solve→station extraction with multi-span continuous beam and two combos, JSON round-trip with camelCase verification, snapshot stability test for product-team contract)
- unblocks RC design tables, reinforcement schedules, and downstream BBS generation
- `Option<GoverningEntry>` pattern prevents phantom infinities / sentinel combo_id=0 when no combo data exists
- `combo_name` propagated into per-station combo force entries — frontend never needs a separate join
- `SignConvention2D` / `SignConvention3D` metadata embedded in every result payload
- grouped-by-member convenience layer: `extract_beam_stations_grouped()` / `extract_beam_stations_grouped_3d()` with member-level governing summaries (`MemberGoverning` / `MemberGoverningEntry` including station index), WASM bindings, 5 unit tests, 1 integration test

#### Modified Newton-Raphson for nonlinear solvers

- added `modified_nr: bool` parameter to corotational 2D/3D and fiber nonlinear 2D/3D solvers
- when enabled, caches the Cholesky factorization from iteration 0 and reuses it across subsequent NR iterations within each load increment, avoiding refactorization; falls back to full NR if Cholesky fails on iteration 0
- measured on fiber nonlinear 2D with bilinear steel (fy=250 MPa, 1% hardening): converges for moderate plasticity with 2-3× more iterations; diverges for deep plasticity — not a blanket win, useful where factorization cost dominates and nonlinearity is moderate
- corotational (geometric nonlinearity) diverges under modified NR; full NR remains more robust for geometric-nonlinear and deep-plasticity cases
- added 3 parity tests (corotational 2D, corotational 3D, fiber 2D) and 1 measurement benchmark

#### Sparse buckling eigensolver milestone

- added `lanczos_buckling_eigen_sparse` in `engine/src/linalg/lanczos.rs`
- wired `solve_buckling_3d` to use the sparse buckling eigensolver path directly in the common unconstrained case, while keeping a dense path for small models and conservative fallback behavior
- added sparse shell gate coverage for sparse buckling parity
- confirmed the sparse buckling path handles the generalized `K phi = lambda (-Kg) phi` case by factorizing `K` and applying `K^{-1}(-Kg)` as the operator

#### Sparse modal eigensolver milestone

- added sparse Lanczos operators in `engine/src/linalg/lanczos.rs`, including sparse symmetric mat-vec and sparse shift-invert helpers
- wired `solve_modal_3d` to use the sparse eigensolver path directly in the common unconstrained case, skipping dense `K_ff` reconstruction there
- added sparse shell gate coverage for:
  - sparse faster than dense at representative shell size
  - deterministic sparse assembly
  - fill-ratio regression bounds
  - sparse modal parity
- added measured modal sparse-vs-dense timing coverage, including an `11.8×` speedup at `20×20 MITC4`
- measured AMD vs RCM fill behavior and confirmed AMD wins materially on larger shell meshes

#### Sparse reuse into 3D eigen and reduction workflows

- switched `solve_modal_3d`, `solve_buckling_3d`, `solve_harmonic_3d`, `guyan_reduce_3d`, and `craig_bampton_3d` from dense `n×n` assembly to sparse assembly plus dense `K_ff` conversion
- eliminated full dense `n×n` stiffness allocation in those workflows while leaving mass matrices, geometric stiffness, and eigensolver internals unchanged
- added sparse shell gate coverage for these reuse paths (`321` tests reported green)

#### Sparse assembly bottlenecks resolved

- rewrote `from_triplets` from per-column duplicate compaction to global sort + single-pass CSC build, eliminating the memmove-heavy hotspot
- added `k_ff`-only sparse assembly where full reactions are not needed
- sparse assembly on representative shell models moved from major regression to runtime win after those fixes

#### Measured sparse vs dense runtime gains

- added dense vs sparse benchmarks for all three shell families: MITC4, Quad9, and curved shell
- measured factorization-only speedups: 4.5× at 700 DOFs, 22× at 2600 DOFs, 77-89× at 5700 DOFs
- measured end-to-end speedup: 22× at 30×30 MITC4 (sparse 0.56s vs dense 12.3s)
- 0 pivot perturbations across all tested sizes and element families
- sparse wins on all families above ~500 DOFs; dense still faster at curved 8×8 (~450 DOFs)
- fill ratio grows from 2.6× (10×10) to 7.0× (50×50) under RCM ordering — not constant as previously estimated
- extended `bench_solve_3d_shell` to 20×20 and 30×30 mesh sizes
- added `bench_solve_3d_quad9` (5×5 to 15×15), `bench_solve_3d_curved` (8×8 to 24×24), and `bench_full_solve_3d_families` criterion benchmarks
- added `sparse_vs_dense_comparison` in opt-in `bench_phases.rs` profiling test target, now gated behind `--features manual-bench-phases`

#### Sparse shell solve viability and deterministic assembly

- replaced broken etree-based symbolic Cholesky with direct left-looking symbolic factorization that correctly computes fill structure
- added two-tier pivot perturbation in numeric Cholesky: hard threshold (1e-20 × max_diag) rejects true singularities, soft threshold (1e-10 × max_diag) perturbs drilling-DOF pivots with controlled regularization
- added RCM (Reverse Cuthill-McKee) ordering with George-Liu pseudo-peripheral start node; fill ratio dropped from 673× to 1.8× on representative shell meshes
- eliminated dense LU fallback on shell models: sparse Cholesky now survives MITC4, MITC9, and curved-shell plates that previously always fell back to dense LU (87% of wall time → 0%)
- made all assembly paths (dense, sparse, parallel) deterministic by sorting HashMap element iterations by ID
- fixed DOF numbering determinism: when multiple supports target the same node, constraint flags are now merged with OR instead of nondeterministic HashMap overwrite
- added residual-based parity testing for ill-conditioned shell matrices: both sparse and dense solutions verified via ||Ku-f||/||f|| < 1e-6 instead of max-displacement comparison
- added benchmark gate tests: no-dense-fallback gate, fill-ratio gate (< 200×), and sparse-vs-dense residual parity gate
- wired pivot perturbation count and max perturbation into SolveTimings and solver diagnostics
- added `PivotInfo` to `NumericCholesky` for tracking perturbation statistics

#### Parallel 3D element assembly

- added `assemble_sparse_3d_parallel()` behind `#[cfg(feature = "parallel")]` using rayon
- unified all 8 element families (frame, truss, plate, quad, quad9, solid-shell, curved-shell, connector) into a single `AnyElement3D` enum for one `par_iter()` work pool
- pre-built element-id load index reduces load dispatch from O(elem × loads) to O(elem + loads)
- serial fallback via `#[cfg(not(feature = "parallel"))]` delegates to the existing `assemble_sparse_3d()`
- wired parallel path into `solve_3d()` as the default sparse assembly call
- added parity tests: flat-plate (4×4) and mixed frame+slab (4 columns + 16 quads + nodal + pressure loads)
- added criterion benchmarks: flat-plate up to 50×50 (2500 quads, ~15k DOFs) and mixed frame+slab up to 8-storey 8×8
- measured 2-6% speedup on MITC4 flat plates (lightweight per-element cost); later profiling showed CSC construction, not element math, is the real sparse-assembly bottleneck
- made `inclined_rotation_matrix` and `apply_inclined_transform_triplets` public for reuse
- fixed pre-existing `transform_force` scope issue in the 2D parallel path

#### Curved shell family and corrected hemisphere interpretation

- integrated the curved-shell family into the solver narrative as a production shell option for genuinely curved geometry
- established that the old hemisphere extremes were partly inflated by an `E` unit issue in the benchmark setup, and corrected that interpretation across the shell benchmark story
- added curved-shell benchmark coverage showing near-reference hemisphere behavior while preserving credible flat-shell and barrel-vault performance
- clarified that the shell stack is now `MITC4 + MITC9 + SHB8-ANS + curved shell`, with the remaining work focused on family guidance, workflow hardening, and shell-adjacent breadth

#### MITC9 and SHB8-ANS shell-family expansion

- integrated the `MITC9` 9-node quadrilateral shell through the full solver stack: dense+sparse assembly, mass, geometric stiffness, buckling, stress recovery, and all shell load types
- added `MITC9` acceptance/workflow models covering cantilever shell response, mixed beam+slab building workflow, cylindrical tank wall behavior, and modal plate extraction
- integrated the `SHB8-ANS` solid-shell family as a new shell path for the curved/non-planar frontier
- added shell-family frontier gates and comparative benchmarks across `MITC4`, `MITC9`, and `SHB8-ANS`
- established explicit shell selection guidance instead of treating shell support as a single undifferentiated element family
- shifted the shell roadmap from “add more shell breadth” to “harden and guide the multi-family shell stack”

#### Sparse-first 3D assembly and solve

- completed sparse 3D assembly for plates, quads, inclined supports, and diagnostics
- wired sparse path into `solve_3d()` for models with 64+ free DOFs
- 11-22x memory reduction on shell models (10×10 to 15×15 quad meshes)
- 13 new validation tests: 8 dense-vs-sparse parity, 2 performance benchmarks, 3 drilling regression

#### Shell validation and hardening

- added `QuadSelfWeight` body force load type (density, gx, gy, gz) with consistent Gauss integration, wired into assembly
- added mesh distortion robustness study: aspect ratio, parallelogram skew, trapezoidal taper, and random perturbation sweeps against Navier analytical
- added MacNeal-Harder pinched cylinder benchmark (R=300, L=600, t=3, E=3×10⁶) at 6×6 and 8×8 meshes
- added edge load validation: normal (in-plane) and tangential (axial extension) against beam theory
- added thermal gradient convergence sweep: 4×4, 8×8, 16×16 with monotonic convergence and tightened tolerances
- added warped element accuracy study: cantilever strip at 0%, 5%, 10%, 20% warp with graceful degradation tracking

#### Shell and nonlinear 3D workflows

- verified quad shell load vectors, mass, geometric stiffness, and quality metrics
- verified mixed DKT and MITC4 assembly and beam-shell DOF interfacing
- wired plate and quad stress recovery into the major nonlinear 3D solver families
- added beam-shell mixed benchmarks, shell buckling benchmarks, shell thermal benchmarks, and shell acceptance models
- added plate geometric stiffness contribution in 3D buckling
- added assembly diagnostics for distorted/low-quality plate and quad meshes
- added full nodal stress tensor recovery for MITC4 quads

#### Constraints and connectors

- pushed constraint-system unification further across solver families
- added connector-element assembly coverage across dense and sparse 2D/3D paths
- added constraint-force output in constrained solver paths
- added eccentric-connection integration tests and new constraint benchmark coverage
- propagated constraint-force output into plastic and fiber nonlinear solver paths
- added cross-solver constraint-force parity coverage

#### Benchmark gates and test infrastructure

- added explicit gate suites for:
  - constraints
  - contact
  - shells
  - reduction
  - sparse and conditioning paths
- added explicit CI gate steps for shell benchmarks, shell acceptance models, and constraint benchmarks before the full suite
- added conditioning diagnostics
- added sparse triplet assembly infrastructure
- added parallel element assembly behind the `parallel` feature flag
- extended criterion benchmarks with larger-model assembly and dense-vs-sparse solve comparisons
- switched CI and local default full-suite execution toward `cargo nextest`, with engine-local nextest config and Linux `mold` linker support

### Changed

#### MITC4 shell element: Bathe-Dvorkin ANS shear tying

- implemented true assumed natural strain (ANS) transverse shear interpolation (Bathe & Dvorkin, 1986) in the MITC4 quad shell element
- uses covariant strain tying at 4 edge midpoints with Jacobian-correct transformation at each Gauss point, eliminating transverse shear locking on thin plates
- added EAS-4 membrane softening to the MITC4 quad shell element via static condensation
- benchmark improvements: Scordelis-Lo 6×6 ratio from 0.14 to 0.80, Navier plate from 0.08 to 0.93, cantilever pressure from 0.10 to 1.05, buckling from wide tolerance to 1.02, modal frequencies from ~6× error to 0.1% error
- tightened shell benchmark tolerances across the board to lock in the formulation quality
- added `quad_check_jacobian()` for negative/degenerate Jacobian detection
- added moderate warping diagnostics (0.01-0.1 range) in assembly
- added dedicated thin-plate locking test (a/t = 1000) to prevent regression
- expanded CI shell benchmark gate to cover plate bending, Navier convergence, Scordelis-Lo, cantilever, hemisphere, and thin-plate tests
- EAS-4 is mathematically correct and stable, but pinched hemisphere remains a known membrane-locking limit; that boundary is now documented explicitly

#### MITC4 shell element: EAS-7 upgrade and curved-shell tracking

- replaced the 4-mode membrane enhancement with EAS-7 using a generic small-matrix inverse and 7 enhanced membrane modes
- Scordelis-Lo improved further to roughly 0.84 of reference with no regressions on Navier, buckling, modal, or existing shell gates
- added new shell tracking benchmarks for Raasch hook and twisted beam as explicit non-planar / curved-shell formulation-limit indicators
- clarified that the remaining shell decision is no longer `EAS-4 vs EAS-7`; it is `bounded MITC4+EAS-7 vs broader shell family`

### Fixed

#### Deterministic DOF numbering and assembly

- fixed 3D DOF numbering: multiple supports targeting the same node now merge constraint flags with OR instead of nondeterministic HashMap overwrite
- fixed 2D DOF numbering: supports sorted by ID for deterministic overwrite order
- fixed nondeterministic assembly: all element iterations in dense, sparse, and parallel assembly paths now sorted by element ID
- fixed point-of-contraflexure inflection detection: rewrote to use nodal moment profile approach that handles inflection points on element boundaries

#### Solver quality milestone

- fixed the staged fixed-end-force accumulation bug by tracking cumulative loads across stages
- corrected four pre-existing TME validation expectations involving formulas, sign conventions, and a wrong midspan-node assumption
- added residual-checked Cholesky fallback: if ||Kff*u - f||/||f|| > 1e-6, the sparse 3D solve falls back to dense LU

### Validation

- latest reported full-suite status reached `5590` passing engine-coupled tests with `0` failures
  (plus `1192` reference-formula self-checks counted separately — see `docs/BENCHMARKS.md`
  "Test taxonomy")
