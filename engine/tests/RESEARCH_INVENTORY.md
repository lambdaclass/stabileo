# Research → production-engine inventory (2026-10-29)

Read-only audit of `origin/main` and PR heads obtained with `gh pr view --json
headRefName`, fetched from origin and inspected with `git show`. No PR was merged.
The reference and validation trees were searched; `reference/main.rs` explicitly
contains formula self-checks, not engine solves, so those do not satisfy this gate.

| Page / PR | Model and measured quantity | Reference and source as stated on page | Page tolerance | Production entry point | Existing engine match / gap |
|---|---|---|---|---|---|
| MacNeal–Harder #797 | L=6 frame cantilever, 1/2/4/8 elements, tip shear displacement | 0.0036; Euler–Bernoulli PL³/(3EI), analytical adaptation, **not** the paper's shell model | relative <2% | `linear::solve_2d` | `validation/benchmarks/patch_tests.rs::validation_macneal_harder_straight_cantilever`; helper divides by max(reference,1), so weaker than page |
| #797 | Same frame, 4 elements, tip moment displacement and rotation | 0.009 and 0.003; ML²/(2EI), ML/(EI), same analytical adaptation | relative <2% each | `linear::solve_2d` | `validation_macneal_harder_tip_moment`, same tolerance-helper gap |
| #797 | 6×1 MITC4 strip, regular / trapezoidal / parallelogram; mean of two tip nodes, out/in-plane | 0.4321 / 0.1081; “MacNeal–Harder straight cantilever; values and 6×1 mesh transcribed from solid_shell_locking.rs. Original page/table not yet verified. MITC4 uses midsurface nodes.” Geometry Fig. 4 p.7 | relative <2% each | `linear::solve_3d` | `solid_shell_locking::macneal_harder_straight_cantilever` uses **solid-shell**, different element and floors; PR browser test only reports these errors |
| Riks/Crisfield #803 | Shallow two-frame toggle, half-span 2, rise .1; upper-limit load, apex displacement, full equilibrium path | 95.98504891452458; .04228900098628047; P(y)=2EA(1−L/L0)y/L. “von Mises two-bar truss equilibrium … nonlinear_extended.rs; arc-length method reference: M. A. Crisfield, Non-linear Finite Element Analysis of Solids and Structures, Vol. 1, Ch. 9” | 5% relative peak load/displacement; max path residual / reference peak ≤5% | `arc_length::solve_arc_length` | `validation/domains/solver/arc_length.rs::test_arc_length_detects_limit_point`: qualitative, no reference pin. Page's frame bending differs from axial formula; 100-step budget does not reach limit |
| #803 | Von Mises two-frame model, half-span 3, rise 2; same quantities | 15672.742997591187; .9166559507513323; same exact axial equilibrium and source | same 5%; displacement compared if limit reached on page | `arc_length::solve_arc_length` | `validation/domains/nonlinear/nonlinear_extended.rs::validation_nonlin_ext_4_two_bar_truss_instability` uses another solver/check; no same-quantity arc-length pin |
| Shell obstacle #809 | MITC4 Scordelis–Lo roof, 6²/8²/12²/16²; free-edge midspan vertical displacement | .3024; `shell_benchmark.rs::benchmark_scordelis_lo_convergence`; numerical paper table/page unverified | relative <2% at each mesh | `linear::solve_3d` | Same Rust builder exists; 6² accepts ratio .7–1.2, finest only >.05 and loose convergence; insufficient |
| #809 | MITC4 pinched cylinder with rigid diaphragms, 6²/8²/12²/16²; radial load-point displacement | 1.8248e-5; `shell_benchmark.rs::benchmark_pinched_cylinder_8x8`; added refinements use same construction; numerical paper table/page unverified | relative <2% | `linear::solve_3d` | Same builder; old 6²/8² ratio .01–100; no 12²/16² reference checks |
| #809 | MITC4 hemisphere with 18° hole, 4²/8²/16²; equatorial ux, quarter loads ±2 | .185; NAFEMS TNSB Rev 3 (1990), LE3; `benchmark_hemisphere_hole_convergence`; numerical paper table/page unverified | relative <2% | `linear::solve_3d` | Same builder; old ratio 1e-6–100. Unperforated and solid-shell hemisphere tests have different geometry/load conventions |
| Mattiasson #834 | L=2 cantilever, 16 frame elements, E=200000 MPa, A=.01, I=.0001; signed −ux/L, −uz/L at PL²/EI=1/2/5/10 | (.0566,.3015), (.1632,.4929), (.4054,.6647), (.5584,.6854); Mattiasson (1981), IJNME 17,145–153, DOI 10.1002/nme.1620170113. “BENCHMARK_REFERENCES.md: Mattiasson Elastica; attributed to Table 1, NOT checked against paper text.” | both relative <2%; convergence and full load required | `corotational::solve_corotational_2d`, (50,1e-6,10,false) | `domains/nonlinear/corotational::validation_corotational_mattiasson_elastica`, `domains/solver/capability_upgrades::capability_vm14a_mattiasson_elastica`, `benchmarks/ansys_vm_benchmarks` have other slenderness/meshes or looser checks; none pin all four page cases |
| #834 | ML/EI=1 end moment; intermediate force steps .5,…,10 | No classic numerical target for moment/intermediate steps | convergence/rotation regression only | same corotational entry | Exact moment model already in `corotational_benchmarks_extended::validation_corotational_cantilever_end_moment`; preserved |
| Ferrari–Sigmund #836 | Roorda frame, two 1m members, pinned outer ends, rigid corner, −1kN; λ1, 10 elements/member | Published **2.4313**, §2.1.2 printed p.5, DOI 10.1002/nme.70082. **2.431355677 is the production result**, not a paper value | absolute <1e-4 against paper; additionally pin page output to 1e-8 | `buckling::solve_buckling_2d` | No matching engine model/reference test |
| #836 | Same frame, 40 elements/member, λ1 | 2.430, reported closed form §2.1.2 printed p.4 | relative <.001 | same buckling entry | No matching engine test. Distinct from #818's unrelated 3D fuzz case |
| Arches #835 | 64-element flat clamped beam, thermal N=−1, EI=1; first symmetric/antisymmetric factors and central-70% modal snap threshold | 4π²; 80.7629142257; threshold 21.52√ε. Zmyślony, Khan & Biggins (2026), arXiv v2 2601.06598 Eq.(2) p.3, Eq.(3) p.4; supplementary S2.6/S2.8, Table S1 p.8 (combined PDF p.17) | relative <1e-5 for factors; absolute <.02 for threshold coefficient | `buckling::solve_buckling_2d`, then test-local Hermite integration/modal equilibrium | Euler-column tests exist, but no same thermal model, second factor or threshold |
| Gridshell #837 | Four optimized curves → 128 3D frame segments, lumped self-weight; vertical equilibrium and discrete volume | Table 1 first row, five nodes, unit weight 1.65σ/L, V=13.8394. Fairclough et al. (2026), §4.3, accepted manuscript printed p.28 / PDF p.29, DOI 10.1016/j.compstruc.2025.107997 | engine force balance ≤1e-8 relative; frame volume within .2% of conic volume | `linear::solve_3d` | No matching model. Store curve geometry/areas only; build frame in Rust and solve afresh |
| #818 supplemental known defect | Three-element 3D frame from #741; first buckling factor | Exact rational interval [4688.92034,4688.92035], per #818; current ≈4691.3976 | relative 1e-6 requested by issue | `buckling::solve_buckling_3d` | No exact-reference check or #817 containment on audited main |

## Mattiasson resolution (#845)

The #834 rows above record the original page audit. The production tests now
supersede its provisional table with independently evaluated elliptic integrals:
q=1 (.056433236283377, .301720773799814),
q=2 (.160641720825167, .493457480396712),
q=5 (.387628360724430, .713791523611913),
q=10 (.554995597753751, .810609024880296).
See [the derivation, sources and refinement study](BENCHMARK_REFERENCES.md#mattiasson-elastica--cantilever-large-deflection)
and [the standalone reference generator](research_references/elastica.py).

All four `research_benchmarks::mattiasson_{1,2,5,10}` tests are active. They use
A=1 at unchanged L/E/I and load, 16/32/64 elements, relative tolerances
.1%/.05%/.03%, and require improving signed errors with refinement.
The original A=.01 model is retained in `mattiasson_original_area_extensible`
for all four loads, using independent extensible-rod references (.01% at 64
elements). Its axial effect reaches +2.470% in vertical displacement at q=10;
it was not an inextensible benchmark. Full Newton uses (50,1e-8,100,false).
`mattiasson_load_step_independence` checks 20 versus 100 steps for both areas at
q=10, requiring full load and agreement to 1e-8 relative. The former ten-step
nonconvergence disappears with smaller increments. No engine implementation or
user-model results change; no result-change registration is needed.

## Boundaries: results not computed by a production structural solver

- Main Shauer 2025: phase-field continuum solver is research-owned, reusing engine
  sparse Cholesky primitives, not a production structural entry point. Its 30
  field/reference comparisons remain research tests; the engine has no phase-field
  element to build directly in Rust. Main `reference/` formula tests do not alter this.
- Main Grossman 2026: periodic moduli, auxetic ratios and honeycomb paper comparisons
  use research assembly and engine linear-algebra primitives. Its finite foam-strip
  `engine_model::solve_with_engine` cross-check uses production `linear::solve_2d`
  (displacements and axial forces at 1e-8), but is a research/engine parity comparison,
  not a classic paper target. Existing truss and prescribed-displacement engine tests
  cover those operations, not that research-generated strip. No claim that the
  periodic published moduli are engine-solver benchmarks.
- #832 Andreassen topology: isolated optimizer, no production-engine benchmark.
- #836 Koiter α/β and agreement with Fig.2b are explicitly **not reproduced**;
  the recorded imperfect arc-length path has no published numerical acceptance target.
- #835 the full threshold sweep compares research modal postprocessing to author
  software (0.3%), not a production nonlinear arch solve; the single published
  threshold and production eigenvalues are checked here.
- #837 Table 1 continuous volume 13.8394 at absolute 0.00005 is a **Clarabel SOCP**
  result. The production engine cannot compute that optimization. Testing its
  straight-frame volume at 0.00005 would assert a different model than the page;
  use the page's .2% discretization tolerance and 1e-8 engine equilibrium tolerance.
- Catalogue-only proposed papers on main have no reproduction to port.

## Containment audit

At audited main, `known_issues::model_3d` returns no warnings; there are no #798 or
#810 entries. Generic distortion thresholds (aspect >20, minimum angle <10°) do
not contain these benchmark meshes. #817's certificate containment for #818 is
not on main either. Therefore only correctly bounded ignored accuracy tests are
added for these issues, not invented passing diagnostic assertions. No tolerances
or engine source are changed.

## Audited revisions

| Ref | Commit |
|---|---|
| origin/main | `41d1ab4f8a8a94e5407ec035024b3fa685388c21` |
| origin/research/engine-benchmarks-macneal-harder | `d1953d6a3295fd32ac70e456ea5f54819c8560b2` |
| origin/research/riks-crisfield | `7508e0fe627e48df7228c7fd7166bdfcaa691155` |
| origin/research/engine-benchmarks-shell-obstacle-course | `710b6bad36c2b2d96183d27c6661be9208da945a` |
| origin/research/engine-benchmarks-elastica | `f87de0588da533979b10c67fdc295d9b69760a30` |
| origin/research/koiter-ferrari-sigmund-2025 | `714a79e478c7065389ce87bcadd79b3fb27e2f6a` |
| origin/research/topopt-88-lines | `f2a4fad8a635d9c7cbd40fa582101722c514c447` |
| origin/research/snapping-arches-biggins-2026 | `7229dae218c01c024655d6f29ceb84283f1ce44f` |
| origin/research/gridshell-fairclough-2026 | `59598d662917f3f4355d1144f344f26a48e0fe73` |
