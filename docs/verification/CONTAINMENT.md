# Safety containment ledger

Round 2 containment audit for #447. No numerical kernels or numerical baselines changed. WARN preserves the result; REFUSE withholds it with a structured code, issue number, id and message. SCOPE identifies process, coverage or feature work without an additional demonstrated wrong-result mechanism.

| Issue | id | mode | predicate / disposition | evidence |
|---|---|---|---|---|
| #762 | `NUM-INVARIANCE` | WARN | Existing conditioning/stability diagnostics; original and reduced constrained stiffness (§ below). | known_issues::invariance_reported_seeds_are_flagged_or_refused (all ten reported seeds); a_plain_frame_carries_no_known_issue; sparse_solver_paths numerical/diagnostic parity |
| #760 | `TH-RECIPROCITY` | WARN | 2D/3D time history; no validated safe subset. | known_issues_analysis_predicates_have_negative_controls; existing time-history numerical tests retained |
| #759 | `MD-ORTHOGONALITY` | WARN | 3D modal/spectral; no validated safe subset. | known_issues_analysis_predicates_have_negative_controls; unchanged modal/spectral numerical tests |
| #758 | `PL-2D-INVARIANCE` / `PL-3D-INVARIANCE` | REFUSE / WARN | Native 2D plastic calls / 3D plastic with curved beams. | core::plastic, certify_plastic, validation plastic/textbook/pushover tests assert structured refusals; known_issues_model_predicates_have_negative_controls |
| #757 | `SH-GLOBAL-STRESS` | REFUSE | Solid-shell face not parallel to global X–Y (or invalid geometry). | known_issues_shell_predicates_have_geometric_controls; solid_shell_locking and shell_benchmark refusal cases |
| #752 | — | SCOPE | not a wrong-result defect: mutation-test coverage gap; surviving synthetic mutants do not establish a wrong result in the current implementation. | Issue scope: Test gap: 260 missed mutants in 21 functions survive in the frame, truss, curved-beam and fiber-beam kernels. No demonstrated current wrong-result case in this item. |
| #751 | — | SCOPE | not a wrong-result defect: mutation-test coverage gap; surviving synthetic mutants do not establish a wrong result in the current implementation. | Issue scope: Test gap: 244 missed mutants in 50 functions survive in the static certificate support code. No demonstrated current wrong-result case in this item. |
| #750 | — | SCOPE | not a wrong-result defect: mutation-test coverage gap; surviving synthetic mutants do not establish a wrong result in the current implementation. | Issue scope: Test gap: 67 missed mutants in 23 functions survive in the design-check certificates. No demonstrated current wrong-result case in this item. |
| #749 | — | SCOPE | not a wrong-result defect: mutation-test coverage gap; surviving synthetic mutants do not establish a wrong result in the current implementation. | Issue scope: Test gap: 160 missed mutants in 30 functions survive in the certificate's independent re-assembly. No demonstrated current wrong-result case in this item. |
| #748 | — | SCOPE | not a wrong-result defect: mutation-test coverage gap; surviving synthetic mutants do not establish a wrong result in the current implementation. | Issue scope: Test gap: 214 missed mutants in 30 functions survive in the modal, spectral, harmonic and time-history certificates. No demonstrated current wrong-result case in this item. |
| #747 | — | SCOPE | not a wrong-result defect: mutation-test coverage gap; surviving synthetic mutants do not establish a wrong result in the current implementation. | Issue scope: Test gap: 119 missed mutants in 8 functions survive in the cable element (catenary). No demonstrated current wrong-result case in this item. |
| #746 | — | SCOPE | not a wrong-result defect: mutation-test coverage gap; surviving synthetic mutants do not establish a wrong result in the current implementation. | Issue scope: Test gap: 133 missed mutants in 12 functions survive in the plate element kernels (DKT, DKMT, CST). No demonstrated current wrong-result case in this item. |
| #745 | — | SCOPE | not a wrong-result defect: mutation-test coverage gap; surviving synthetic mutants do not establish a wrong result in the current implementation. | Issue scope: Test gap: 765 missed mutants in 49 functions survive in the plastic-collapse certificates. No demonstrated current wrong-result case in this item. |
| #741 | `BU-BOUND` | REFUSE | Certified 3D factor outside its available certified bounds. | known_issues_refusal_preserves_structured_identity: inside/lower/upper controls |
| #466 | `AC-PLANE-MAPPING` | WARN | 2D constraints; original source plane unavailable in engine wire. | known_issues_model_predicates_have_negative_controls; model-findings-constraints-and-views.test.ts |
| #458 | `CERT-MECHANISM` | WARN | All-hinged, rotationally unrestrained 2D node with moment or rigid link; no blanket 3D warning. | known_issues_model_predicates_have_negative_controls |
| #456 | `BU-SPAN-COMPRESSION` | WARN | 3D buckling with distributed or point-on-member loads. | known_issues_model_predicates_have_negative_controls |
| #447 | — | SCOPE | not a wrong-result defect: containment programme tracked by this ledger. | Issue scope: Contain first, fix second: per-feature runtime switches (warn/refuse) for known dangerous results. No demonstrated current wrong-result case in this item. |
| #445 | — | CORRECTED | not a current wrong-result defect: X-Z constraint semantics already corrected in constraint-2d-remap.ts; constraints-2d-vs-3d-store.test.ts covers parity. Other planes remain under 466. | 0e5e94dee; web/src/lib/store/__tests__/constraints-2d-vs-3d-store.test.ts and web/src/lib/engine/__tests__/constraint-2d-remap.test.ts |
| #444 | — | CORRECTED | not a current wrong-result defect: Winkler foundation force recovery already corrected; silent_errors_settlement_winkler_imperfections.rs tests foundation forces and released-member refusal. | eef739dfeb8f1bf16c170628cb05f93e2442b511; silent_errors_settlement_winkler_imperfections::winkler_2d_member_forces_match_hetenyi, winkler_3d_member_forces_match_hetenyi_in_y_and_z, winkler_member_end_forces_include_foundation, winkler_on_a_hinged_member_is_refused |
| #443 | — | CORRECTED | not a current wrong-result defect: unsupported settlements already refused; silent_errors_settlement_winkler_imperfections.rs covers dropped components. | eef739dfeb8f1bf16c170628cb05f93e2442b511; silent_errors_settlement_winkler_imperfections::rotation_on_a_2d_pinned_support_is_refused, settlement_on_an_unflagged_3d_dof_is_refused, settlement_on_a_restrained_dof_is_applied |
| #442 | — | CORRECTED | not a current wrong-result defect: imperfections.rs applies member gravity with dimension-specific axes and refuses unapplied options; regression suite covers these paths. | eef739dfeb8f1bf16c170628cb05f93e2442b511; silent_errors_settlement_winkler_imperfections::notional_loads_3d_default_gravity_is_z, notional_loads_include_member_gravity_loads, unapplied_imperfections_are_refused, geometric_imperfections_are_applied |
| #441 | — | SCOPE | not a wrong-result defect: advisory notification process. | Issue scope: Safety advisories: notify users when a released version produced a wrong or unconservative result. No demonstrated current wrong-result case in this item. |
| #433 | `NL-17` | WARN | Returned fiber iterate is unconverged. | known_issues::fiber_warning_is_only_on_unconverged_results (exact warning and converged negative control); existing fiber numerical tests |
| #432 | `NL-13` | WARN | Contact active-set history reports a frozen gap. | contact::containment_tests::freezing_on_the_first_flip_is_reported; existing contact numerical tests |
| #428 | `NL-5` | WARN | Material nonlinear analysis (whole-member secant is intrinsic to this algorithm). | known_issues::material_nonlinear_results_are_flagged; analysis negative controls |
| #426 | `NL-3` | WARN | 3D co-rotational; no validated input bound on non-coaxial rotation. | known_issues_analysis_predicates_have_negative_controls; existing co-rotational numerical tests |
| #419 | `SP-17` | WARN | 3D connector with unequal transverse shear or bending stiffness. | known_issues_model_predicates_have_negative_controls |
| #417 | `SP-14` | WARN | Cable element outside cable analysis. | known_issues_model_predicates_have_negative_controls |
| #408 | `FR-5` | WARN | At least two positive-Cw members share a node. | known_issues_model_predicates_have_negative_controls |
| #394 | — | SCOPE | not a wrong-result defect: engine-unavailability fallback policy; separate engine availability guards apply. | Issue scope: No silent fallbacks: say so when the engine is unavailable. No demonstrated current wrong-result case in this item. |
| #393 | — | SCOPE | not a wrong-result defect: consolidation of footing and load-generation implementations. | Issue scope: Footings and load generation (wind, snow, seismic, combinations) in Rust. No demonstrated current wrong-result case in this item. |
| #392 | — | SCOPE | not a wrong-result defect: consolidation of analysis implementations; no specific erroneous model identified. | Issue scope: Analysis results from the engine: remove TypeScript analysis duplicates. No demonstrated current wrong-result case in this item. |
| #391 | — | SCOPE | not a wrong-result defect: consolidation of steel input calculations; no specific erroneous model identified. | Issue scope: Steel check inputs from the engine: Cb, J/Cw/Z, unbraced lengths, buckling, net area. No demonstrated current wrong-result case in this item. |
| #389 | — | SCOPE | not a wrong-result defect: independent review and experimental labelling policy. | Issue scope: Keep steel results labelled experimental until independent review of CIRSOC 301. No demonstrated current wrong-result case in this item. |
| #388 | — | SCOPE | not a wrong-result defect: dependency upgrade verification policy. | Issue scope: Dependency upgrades through the same gates; numerics crates must stay bit-identical. No demonstrated current wrong-result case in this item. |
| #385 | — | SCOPE | not a wrong-result defect: deployment staging process. | Issue scope: Staging before production: deploy main to staging, promote tagged releases. No demonstrated current wrong-result case in this item. |
| #382 | — | SCOPE | not a wrong-result defect: stress-testing programme; concrete numerical invariance defect is 762. | Issue scope: Numerical stress tests: measure where accuracy degrades and refuse beyond it. No demonstrated current wrong-result case in this item. |
| #381 | — | SCOPE | not a wrong-result defect: nonlinear/dynamic robustness research programme; concrete defects tracked separately. | Issue scope: Nonlinear and dynamic robustness: convergence criteria, step sensitivity, energy drift. No demonstrated current wrong-result case in this item. |
| #376 | — | SCOPE | not a wrong-result defect: proof trusted-base audit programme. | Issue scope: Trusted computing base of certificates: audited and enforced. No demonstrated current wrong-result case in this item. |
| #370 | `NL-DYNAMIC-GAPS` | WARN | Material nonlinear; or beam-containing modal/spectral/time-history/harmonic. | known_issues_analysis_predicates_have_negative_controls; corpus audit includes modal calls |
| #369 | — | SCOPE | not a wrong-result defect: mechanism-detection programme; concrete certificate defect is 458. | Issue scope: Mechanism detection everywhere, with zero false positives on the corpus. No demonstrated current wrong-result case in this item. |
| #366 | — | PARTIAL | The legacy column tension verdict is corrected using signed axialLoads. Remaining missing checks are feature backlog; this evidence does not justify closing the whole issue. | 1d622636b (git log -S axialLoads); cirsoc201-engine-gate.test.ts: “a column is re-checked under the tension it also sees” and “the designer sizes a column for every axial force it sees, tension included”. This closes only the erroneous tension verdict; the issue also tracks unimplemented checks. |
| #359 | — | SCOPE | not a wrong-result defect: dimensioned-type migration programme. | Issue scope: Units in the type system (Rust and TypeScript). No demonstrated current wrong-result case in this item. |
| #356 | — | SCOPE | not a wrong-result defect: discretization-error estimation programme; algebraic certification does not bound mesh error. | Issue scope: Discretization error estimates next to certified results. No demonstrated current wrong-result case in this item. |
| #354 | — | SCOPE | not a wrong-result defect: scheduled verification and failure alerting programme. | Issue scope: Verification jobs that run on schedule and alert on failure. No demonstrated current wrong-result case in this item. |
| #798 | `SH-MITC4-DISTORTION` | WARN / REFUSE | Distorted MITC4; refuse only significant membrane bending (§ thresholds below). | known_issues::mitc4_macneal_harder_contains_membrane_bending_only: regular/trapezoid/parallelogram × extension/in-plane/out-of-plane; shell geometric controls |

## Predicates and limits

- NUM-INVARIANCE: existing HighDiagonalRatio (>1e8), ExtremelyHighDiagonalRatio (>1e12), NearZeroDiagonal (<= max diagonal × 1e-12), StiffnessNotPositiveDefinite, CholeskyFailedLuFallback, or ExcessiveDisplacement diagnostics. No new matrix factorization or numerical threshold affects the solve. Issue #762 supplies seed cases but no conditioning cutoff. All ten reported seeds are covered: 2D 20800, 20833, 20865, 20795, 20756, 20824, 20840, 20806; 3D 20761, 20788. Constrained solves also inspect their existing original free stiffness before reduction: seed 20840 loses the warning after reduction alone (reduced diagonal ratio about 139), while the original matrix exposes the artificial-hinge stiffness contrast. This conservative conditioning boundary is the narrowest tested boundary covering all reported cases; it is not a complete invariance detector. A well-conditioned plain frame is a negative control.
- CERT-MECHANISM: a 2D node with incident members, all of which release rotation (or are non-frame), and either a nonzero nodal moment or an incident rigid link. A real rotational support or positive rotational spring excludes the node. Nodal moments are checked against the actual prepared load case. No blanket 3D warning. The separately described skew-axis mechanism lacks a pinned 3D case in #458; this predicate does not claim to detect it.
- AC-PLANE-MAPPING: every 2D constrained input; the engine wire no longer contains the original 3D plane, so it cannot narrow this further.
- BU-SPAN-COMPRESSION: 3D buckling with distributed or point-on-member loads.
- SH-GLOBAL-STRESS: any solid shell whose lower or upper four-node face has unequal global Z coordinates, or missing nodes.
- SH-MITC4-DISTORTION: WARN for MITC4 skew >10°, Jacobian ratio <0.9, warping >0.01, or non-finite/missing geometry. The MacNeal–Harder regular rectangle (0° / ratio 1) passes; the reported 45° trapezoid and parallelogram fail. These conservative geometry cutoffs lie between the demonstrated endpoints, not experimentally established accuracy boundaries. The reported in-plane values are regular 0.1071 versus 0.1081, trapezoid 0.0084 (−92%), parallelogram 0.0104 (−90%); out-of-plane values 0.4235, 0.4162, 0.4226 versus 0.4321 stay within 4%.
  On each recovered static load case, compute local nodal normal membrane stresses after subtracting its thermal strains. For each normal component crossing zero, take V = 2 min(−minimum, maximum); otherwise V = 0. Use the largest V, membrane magnitude S = max absolute normal stress, and outer-fibre plate stress B = max 6|Mx, My, Mxy|/t². REFUSE only if V > 0.5 S, V > B, and V > E × 1e-12 (E in solver stress units). Sign reversal and the 50% threshold require a substantial bending component, rather than ordinary extension or a small membrane perturbation; plate stress dominance keeps transverse bending at WARN. The modulus-scaled floor excludes numerical noise. These are conservative operational significance thresholds validated against all nine shape/load controls, not a general error estimator. Mixed responses without sufficient sign-reversing membrane bending remain WARN. Static prepared load cases are checked individually. Other analysis types retain the geometry warning; no modal stress sign pattern is treated as a static bending result.
- PL-2D-INVARIANCE: all native Rust 2D plastic-collapse calls; no validated safe subset is known. The separate legacy TypeScript plastic-collapse routine is not the demonstrated #758 algorithm; its successful-result numerical assertions remain active. The native certificate job refuses.
- BU-BOUND: a 3D certified buckling result whose computed factor is below the lower bound or above its available upper bound. This additionally checks the output because the defect has an exact observable contradiction.
- SP-17: 3D connectors with unequal transverse shear or bending stiffnesses.
- FR-5: at least two positive-Cw members sharing a node; continuity requires verification even for a collinear change of section.
- SP-14: cable elements outside the cable analysis, conservatively independent of load sign.
- NL-5: all material nonlinear analysis because the whole-member secant formulation is intrinsic, independent of input geometry.
- NL-3: 3D co-rotational analysis; no proven input-only bound on non-coaxial rotations.
- NL-13: only a returned contact history with a frozen gap, including max_flips = 0 on the first flip; no warning for an ordinary converged contact solve.
- NL-17: only a returned unconverged fiber iterate; no warning for a converged fiber solve.
- MD-ORTHOGONALITY: 3D modal and spectral analysis; no proven safe input subset.
- TH-RECIPROCITY: 2D and 3D time history; no proven safe input subset.

## Verification policy

The results snapshot corpus includes diagnostic codes. New warnings can change those strings while all numbers remain bit-identical. REFUSE intentionally removes an affected result. Do not regenerate numerical baselines to hide either a refusal or a numerical change. The scheduled audit is informational and read-only; it is not a required CI check.

- PL-3D-INVARIANCE: 3D plastic analysis containing curved beams.
- NL-DYNAMIC-GAPS: material nonlinear analysis (increment/convergence gap), or modal/spectral/time-history/harmonic models containing frame members (omitted rotary inertia). A model without frame members does not get the dynamic warning. Modal orthogonality and time-history reciprocity have no demonstrated reliable input-only cutoff, so those analysis-level warnings remain broad and explicit.

## Additional corrected behaviour evidence

These are already-fixed mechanisms referenced by the containment negative controls; they require no runtime warning. History was read with log -S and commit inspection. Existing regression tests already discriminate the old behaviour, so no redundant replacements were added.

| Issue | id | mode | predicate / disposition | evidence |
|---|---|---|---|---|
| #407 | FR-4 | CORRECTED | Explicit thermal expansion coefficient and real section depths are honoured; defaults are diagnosed. | 9bd59f8d1, 19f609094, 12d59d771; frame_thermal_inputs::restrained_aluminium_bar_carries_e_a_alpha_dt_with_its_own_alpha, steel_ipe_gradient_uses_its_real_depth, every_2d_path_honours_alpha_and_depth, every_3d_path_honours_alpha_and_depths, prepared_solves_refuse_invalid_thermal_properties |
| #410 | SH-6 | CORRECTED | Curved-shell moments recovered and thermal strain subtracted. | 210421ab6, fd39e9bde, ad8067f4a; derivation_shells::sh6_curved_shell_reports_bending_moments, sh6_curved_shell_cantilever_reports_the_static_moment, sh6_free_heated_curved_shell_is_stress_free |
| #411 | SH-7 | CORRECTED | MITC9 rigid links restore rigid-motion invariance; compatible thermal load. | 5c85f01b6, 845c70e53; derivation_shells::sh7_curved_mitc9_annihilates_rigid_motions, sh7_warped_doubly_curved_mitc9_annihilates_rigid_motions, sh7_curved_mitc9_rigid_motion_is_stress_free |
| #416 | SP-12 | CORRECTED | Cable iteration uses chord law rather than Ernst tangent as secant. | f51c8e6c7, 583547e2b, 576c51e6a; derivation_special_elements::guyed_mast_cable_tension_matches_the_chord_law (af0bae39b), cable_chord_tension_is_robust, cable_on_an_inclined_roller_follows_the_chord_law |
| #418 | SP-15 | CORRECTED | Arc segments keep one section orientation. | bbb832fa8; derivation_special_elements::curved_beam_arch_is_invariant_under_plan_rotation |
| #421, #422, #423 | AC-12 / AC-13 / AC-16 | CORRECTED | Soil curves follow their cited references. | 0ab97bf6b, 343ff25ce; soil_curves_references::soft_clay_ultimate_follows_matlock_with_j, stiff_clay_is_welch_reese_quarter_power_to_16_y50, sand_static_and_cyclic_match_api_hand_values, tz_is_shaft_friction_times_perimeter, qz_follows_api_table_times_tip_area |

## Round 2 verification

The maintainer authorized diagnostic expectation updates and refusal assertions. Successful calls retain their numerical checks. Refused calls assert code, id, issue number and exact message; their previous numerical expectations remain in comments (shared fixture checks stay active for non-refused fixtures). Independent plastic certificates and the legacy TypeScript plastic routine retain their successful-result checks.

Verification results and corpus counts are recorded below. Read-only history evidence used log -S and show; no commit, push, checkout, stash or worktree operation was performed.

### Results corpus

39 models, counted once per id and severity across their captured base, case, combination and advanced analyses. The audit also inspects modal/buckling outputs that the numerical snapshot does not serialize.

| id | WARN models | REFUSE models |
|---|---:|---:|
| NL-DYNAMIC-GAPS | 2 | 0 |
| PL-3D-INVARIANCE | 0 | 0 |
| NUM-INVARIANCE | 1 | 0 |
| CERT-MECHANISM | 0 | 0 |
| BU-SPAN-COMPRESSION | 2 | 0 |
| AC-PLANE-MAPPING | 0 | 0 |
| NL-5 | 0 | 0 |
| SH-GLOBAL-STRESS | 0 | 0 |
| SH-MITC4-DISTORTION | 0 | 0 |
| PL-2D-INVARIANCE | 0 | 0 |
| BU-BOUND | 0 | 0 |
| SP-17 | 0 | 0 |
| FR-5 | 1 | 0 |
| SP-14 | 0 | 0 |
| NL-3 | 0 | 0 |
| NL-13 | 0 | 0 |
| NL-17 | 0 | 0 |
| MD-ORTHOGONALITY | 2 | 0 |
| TH-RECIPROCITY | 0 | 0 |

Models with findings:
- warning:BU-SPAN-COMPRESSION: pro-3d-portal-frame, pro-3d-tower.
- warning:FR-5: pro-3d-tower.
- warning:MD-ORTHOGONALITY: pro-3d-portal-frame, pro-3d-tower.
- warning:NL-DYNAMIC-GAPS: pro-3d-portal-frame, pro-3d-tower.
- warning:NUM-INVARIANCE: 2d-three-hinge-arch.

The 41 results-project tests (39 models plus two negative controls) pass. The comparison with the original snapshots has exactly three changed diagnostic strings: 2d-three-hinge-arch base.diagnosticCodes and pro-3d-portal-frame spectral.X/Y.diagnosticCodes. All 145,515 numerical result values are identical to the original snapshots at their existing 10-significant-digit storage precision; all 39 format-version fields are also unchanged, with no added or removed quantities. Numerical baseline files outside these diagnostic-only edits were not regenerated.

Reproduce the audit from web/: `CONTAINMENT_AUDIT_DIR=/tmp/containment-corpus nix develop .. -c npx vitest run --project results`. `CONTAINMENT_UPDATE_DIAGNOSTICS=1` permits only existing diagnostic string updates and fails on numerical differences or added/removed fields.

### Test results

Commands use the pinned Nix environment and locked Cargo dependencies. The full debug run is followed by focused reruns of the final per-load-case predicate and warning controls. No new ignored/skipped tests were introduced. Historical failures caused by containment are now refusal/diagnostic expectations; no unresolved failure is being attributed to origin/main.

| Check | Result |
|---|---|
| engine/: nix develop .. -c cargo test --locked | 8,437 passed, 0 failed, 44 existing ignored; all targets complete |
| engine/: nix develop .. -c cargo test --locked --lib --test solver --test robustness | PASS: lib 578, robustness 232, solver 208 passed; 4 existing ignored |
| engine/: nix develop .. -c cargo test --locked --release --test validation | 4,763 passed, 0 failed |
| engine/: nix develop .. -c cargo test --locked --release --test metamorphic | 19 passed, 5 existing ignored |
| web/: nix develop .. -c npx vitest run --project unit | 15,589 passed, 14 existing skipped; 1,260 files passed, 2 skipped |
| web/: nix develop .. -c npx vitest run --project results | 41 passed; all numerical baselines unchanged |
| nix develop -c make typecheck.web | PASS: 247 existing TypeScript baseline errors, no new errors; no errors in guarded Svelte paths (repository-wide informational count: 343 errors, 264 warnings) |
| python3 scripts/check-containment.py | PASS: all 46 currently open safety issues have a decision |
| git diff --check (read-only) | PASS |

The corrected-behaviour evidence tests above are included in the native solver/derivation and web unit runs. Refused validation-03 retains its complete numerical baseline file for the future fix. The stadium, Bombonera, CAD roof and wall-with-opening integration cases now assert #798, while successful fixtures retain every numerical assertion.

Native debug target totals (focused final reruns have the same counts):

| Target | Passed | Failed | Existing ignored |
|---|---:|---:|---:|
| lib | 578 | 0 | 0 |
| certificates | 149 | 0 | 8 |
| core | 213 | 0 | 0 |
| derivations | 238 | 0 | 15 |
| elements | 157 | 0 | 0 |
| gates | 120 | 0 | 12 |
| integration | 333 | 0 | 0 |
| metamorphic | 19 | 0 | 5 |
| property | 110 | 0 | 0 |
| reference | 1192 | 0 | 0 |
| robustness | 232 | 0 | 0 |
| shells | 125 | 0 | 0 |
| solver | 208 | 0 | 4 |
| validation | 4763 | 0 | 0 |
| doc-tests | 0 | 0 | 0 |
