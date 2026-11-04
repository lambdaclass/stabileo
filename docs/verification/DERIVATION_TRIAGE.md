# Triage of the element-derivation findings

The derivation review (PR [#330](https://github.com/lambdaclass/stabileo/pull/330), `docs/solver/`)
left 29 open findings as issues ([#406](https://github.com/lambdaclass/stabileo/issues/406)–[#433](https://github.com/lambdaclass/stabileo/issues/433),
[#453](https://github.com/lambdaclass/stabileo/issues/453), with [#338](https://github.com/lambdaclass/stabileo/issues/338) and
[#439](https://github.com/lambdaclass/stabileo/issues/439)). This page classifies each one by what it can do to a user's result, as
of the batch-4 integration (PR [#507](https://github.com/lambdaclass/stabileo/pull/507)).

Status was checked by running every `#[ignore]`d demonstration test in `engine/tests/derivation_*.rs`
on that branch: a test that now passes means the finding is fixed.

**Classes.**
- **Fixed**: the demonstration passes or the fix is merged; close with a reference.
- **A**: can give a wrong or unconservative result a user would rely on. Fix, contain until fixed (a
  warning on the affected results, Release safety item 7), and publish an advisory.
- **B**: wrong behaviour without a plausible wrong design result (a missing output, a refusal or
  diagnostic that should exist, a false convergence flag that the result itself contradicts). Fix; no advisory.
- **C**: documentation, naming or dead code; no effect on results.

## Fixed

| Issue | Finding | Fixed by | Evidence |
|---|---|---|---|
| [#424](https://github.com/lambdaclass/stabileo/issues/424) | MD-6 spectral forces from per-mode absolute end values | #434 (batch 4) | `spectral_forces_are_combined_signed_like_displacements` passes |
| [#425](https://github.com/lambdaclass/stabileo/issues/425) | MD-10 time-history `method` ignored | #434 (batch 4) | `time_history_method_field_selects_the_scheme` passes |
| [#431](https://github.com/lambdaclass/stabileo/issues/431) | NL-10 notional loads ignore member gravity loads | merged earlier | `nl_notional_loads_include_member_gravity_loads` passes |
| [#439](https://github.com/lambdaclass/stabileo/issues/439) | web sends no Cw and a fallback J | #468 (batch 4) | real J, shear centre, buckling Cw; missing data refused by name |
| — | settlement on a spring DOF dropped; Winkler member end forces | #436 (batch 4) | `settlement_on_spring_dof_is_not_silently_dropped`, `winkler_member_end_forces_include_foundation` pass |
| — | SH-9 solid shell Poisson locking | #401 | `sh9_solid_shell_strip_does_not_poisson_lock` passes |
| [#418](https://github.com/lambdaclass/stabileo/issues/418) | SP-15 curved-beam segment axes depend on plan orientation | #523 (advisory SA-2026-016) | `curved_beam_arch_is_invariant_under_plan_rotation` passes and is un-ignored; containment removed |
| [#429](https://github.com/lambdaclass/stabileo/issues/429) | NL-6 3D material-nonlinear yield surface unconservative vs 2D | `fix/nl6-yield-surface` (advisory SA-2026-020) | `nl_material_2d_and_3d_use_the_same_yield_surface` and three new 3D tests pass; the I-section strong-axis N–M term stays open for 2D and 3D (docs/solver/nonlinear.md NL-6) |
| [#407](https://github.com/lambdaclass/stabileo/issues/407) | FR-4 frame/truss thermal: fixed α = 12e-6 and depth √(12I/A) | branch `fix/frame-thermal` (SA-2026-019) | `engine/tests/frame_thermal_inputs.rs` (material α and real depth; defaults warn) |

## A: wrong results a user would rely on (fix, contain, advisory)

| Issue | Finding | Why it matters | Demonstration |
|---|---|---|---|
| [#427](https://github.com/lambdaclass/stabileo/issues/427) | NL-4 material-nonlinear member forces are the elastic `K_el·u` | after yield the reported forces are up to ~100× off and do not balance the reactions | `nl_material_2d_member_forces_balance_the_reactions` fails |
| [#428](https://github.com/lambdaclass/stabileo/issues/428) | NL-5 material nonlinear is a whole-member secant, not plasticity | response jumps at first yield; load factors depend on the step | `nl_material_2d_response_is_continuous_at_first_yield` fails |
| [#410](https://github.com/lambdaclass/stabileo/issues/410) | SH-6 curved shell reports zero bending moments; stresses ignore thermal strain | a design read from curved-shell moments sees none | **FIXED** in #522 (advisory SA-2026-013): moments recovered through the thickness, thermal strain subtracted, app curved-quad temperatures applied; `sh6_*` tests pass |
| [#416](https://github.com/lambdaclass/stabileo/issues/416) | SP-12 cable tension too low in indeterminate systems | unconservative cable and anchorage forces | **fixed**: the cable solve runs Newton on the elastic-catenary chord law (Ernst's modulus as the tangent); `cable_tension_follows_the_elastic_catenary_chord_law` and its 3D twin pass against the closed form; advisory [SA-2026-015](../advisories/SA-2026-015-cable-tension-chord-law.md) |
| [#421](https://github.com/lambdaclass/stabileo/issues/421) | AC-12 p-y curves depart from the cited references | lateral pile and soil-spring response off | **FIXED** (#526, SA-2026-017): `py_soft_clay_ultimate_includes_j_term` passes, un-ignored; `soil_curves_references.rs` |
| [#422](https://github.com/lambdaclass/stabileo/issues/422) | AC-13 "stiff clay" p-y discontinuous, not Reese's curve | same | **FIXED** (#526, SA-2026-017): `py_stiff_clay_is_continuous` passes, un-ignored |
| [#423](https://github.com/lambdaclass/stabileo/issues/423) | AC-16 t-z / q-z curves missing perimeter / tip area | units kPa·m instead of kN: axial pile springs off by the perimeter or area | **FIXED** (#526, SA-2026-017): `single_pile_axial_capacity_matches_hand_calculation` |
| [#411](https://github.com/lambdaclass/stabileo/issues/411) | SH-7 MITC9 on non-planar geometry does not reproduce rigid motion | spurious strains on curved shells | **FIXED** (rigid links on all nine nodes; containment removed; advisory [SA-2026-018](../advisories/SA-2026-018-mitc9-curved-rigid-motion.md)): `sh7_curved_mitc9_annihilates_rigid_motions` passes |

## B: fix, no advisory

| Issue | Finding | Note | Demonstration |
|---|---|---|---|
| [#417](https://github.com/lambdaclass/stabileo/issues/417) | SP-14 linear solver lets a cable carry compression with no diagnostic | refuse or warn by name | `linear_solver_does_not_report_cable_compression_silently` fails |
| [#432](https://github.com/lambdaclass/stabileo/issues/432) | NL-13 contact reports converged after freezing a chattering gap | must report not converged | none; to add |
| [#433](https://github.com/lambdaclass/stabileo/issues/433) | NL-17 fiber solver reports an unconverged iterate on failure | must refuse or report the last converged step | none; to add |
| [#420](https://github.com/lambdaclass/stabileo/issues/420) | SP-18 fiber solvers return no reactions | missing output | `fiber_solver_reports_reactions` fails |
| [#419](https://github.com/lambdaclass/stabileo/issues/419) | SP-17 3D connector axes discontinuous in direction, not orientable | results jump across a direction; promote to A if a connector's stiffness differs by axis | `connector_3d_axes_are_continuous_in_direction` fails |
| [#426](https://github.com/lambdaclass/stabileo/issues/426) | NL-3 3D co-rotational adds rotation vectors | error for large non-coaxial rotations; promote to A if reachable within the documented range | none; to add |
| [#408](https://github.com/lambdaclass/stabileo/issues/408) | FR-5 warping DOF shared by all members at a node | a modelling assumption to state in the UI and offer a release for | n/a |
| [#338](https://github.com/lambdaclass/stabileo/issues/338) | modal drops modes on a mechanism | PR [#331](https://github.com/lambdaclass/stabileo/pull/331) (mechanism detection) | — |
| [#453](https://github.com/lambdaclass/stabileo/issues/453) | solid-shell buckling converges ≈ first order, from below | an accuracy note with mesh guidance; ties to discretization estimates (#356) | — |

## C: documentation, naming, dead code

| Issue | Finding | Action |
|---|---|---|
| [#406](https://github.com/lambdaclass/stabileo/issues/406) | FR-3 shear-area field names mean different axes in 2D and 3D | docs fixed; rename with a compatibility alias |
| [#409](https://github.com/lambdaclass/stabileo/issues/409) | SH-1 DKMT thick-plate add-on wrong and unused | remove |
| [#412](https://github.com/lambdaclass/stabileo/issues/412) | SH-8 MITC9 tying points | confirm the variant and cite it |
| [#413](https://github.com/lambdaclass/stabileo/issues/413) | SH-15 shell docstrings disagree with the code | fix the docstrings |
| [#414](https://github.com/lambdaclass/stabileo/issues/414) | SP-10 parabolic vs catenary ordinate sag sides | fix the helper; check its callers (promote if a result uses it) |
| [#415](https://github.com/lambdaclass/stabileo/issues/415) | SP-11 Ernst tangent not the derivative of the chord law | **fixed** with #416: `ernst_tangent_modulus` returns the derivative (= `ernst_equivalent_modulus`); `ernst_tangent_modulus_is_the_chord_law_derivative` passes |
| [#430](https://github.com/lambdaclass/stabileo/issues/430) | NL-8 line-search slope (unused) | fix or remove |

## Order of work

1. **Containment** for class A: a warning on the results of the affected features (material
   nonlinear member forces; curved-shell moments and stresses; cables in indeterminate systems;
   curved beams with near-vertical segments; p-y / t-z / q-z springs; non-planar MITC9; frame
   thermal with a non-steel material), naming the issue, until each fix lands.
2. **Fixes**, worst first: NL-4 and NL-6 (material nonlinear), SH-6, SP-12 with SP-11, SP-15,
   AC-12/13/16, SH-7, FR-4; each with its demonstration un-ignored and an advisory.
3. Class B and C alongside, small PRs.
4. Close the fixed issues when batch 4 is merged.
