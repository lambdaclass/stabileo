# Safety containment ledger

Round 2 containment audit for #447. Every result this change still returns has the same numbers, except 2D support reactions of a settled rigid support that also carries a spring on the settled DOF, which now include that spring's force (#1113, CORRECTED below). Results that are now withheld: CORRECTED rows below (#959: 2D buckling whose only compression is round-off is refused as not determinable) and the REFUSE rows; an influence line now fails instead of returning zero ordinates where a unit-load solve fails. WARN preserves the result; REFUSE withholds it with a structured code, issue number, id and message. SCOPE identifies process, coverage or feature work without an additional demonstrated wrong-result mechanism.

| Issue | id | mode | predicate / disposition | evidence |
|---|---|---|---|---|
| #762 | `NUM-INVARIANCE` | WARN | Existing conditioning/stability diagnostics; original and reduced constrained stiffness (§ below). | known_issues::invariance_reported_seeds_are_flagged_or_refused (all ten reported seeds); a_plain_frame_carries_no_known_issue; sparse_solver_paths numerical/diagnostic parity |
| #760 | `TH-RECIPROCITY` | WARN | 2D/3D time history; no validated safe subset. | known_issues_analysis_predicates_have_negative_controls; existing time-history numerical tests retained |
| #759 | `MD-ORTHOGONALITY` | WARN | 3D modal/spectral and harmonic modal superposition; no validated safe subset. | known_issues_analysis_predicates_have_negative_controls; unchanged modal/spectral numerical tests |
| #758 | `PL-2D-INVARIANCE` / `PL-3D-INVARIANCE` | REFUSE / WARN | Native and Basic UI 2D plastic calls / 3D plastic with curved beams. | core::plastic, certify_plastic, validation plastic/textbook/pushover tests assert structured refusals; known_issues_model_predicates_have_negative_controls |
| #752 | — | SCOPE | not a wrong-result defect: mutation-test coverage gap; surviving synthetic mutants do not establish a wrong result in the current implementation. | Issue scope: Test gap: 260 missed mutants in 21 functions survive in the frame, truss, curved-beam and fiber-beam kernels. No demonstrated current wrong-result case in this item. |
| #751 | — | SCOPE | not a wrong-result defect: mutation-test coverage gap; surviving synthetic mutants do not establish a wrong result in the current implementation. | Issue scope: Test gap: 244 missed mutants in 50 functions survive in the static certificate support code. No demonstrated current wrong-result case in this item. |
| #750 | — | SCOPE | not a wrong-result defect: mutation-test coverage gap; surviving synthetic mutants do not establish a wrong result in the current implementation. | Issue scope: Test gap: 67 missed mutants in 23 functions survive in the design-check certificates. No demonstrated current wrong-result case in this item. |
| #749 | — | SCOPE | not a wrong-result defect: mutation-test coverage gap; surviving synthetic mutants do not establish a wrong result in the current implementation. | Issue scope: Test gap: 160 missed mutants in 30 functions survive in the certificate's independent re-assembly. No demonstrated current wrong-result case in this item. |
| #748 | — | SCOPE | not a wrong-result defect: mutation-test coverage gap; surviving synthetic mutants do not establish a wrong result in the current implementation. | Issue scope: Test gap: 214 missed mutants in 30 functions survive in the modal, spectral, harmonic and time-history certificates. No demonstrated current wrong-result case in this item. |
| #747 | — | SCOPE | not a wrong-result defect: mutation-test coverage gap; surviving synthetic mutants do not establish a wrong result in the current implementation. | Issue scope: Test gap: 119 missed mutants in 8 functions survive in the cable element (catenary). No demonstrated current wrong-result case in this item. |
| #746 | — | SCOPE | not a wrong-result defect: mutation-test coverage gap; surviving synthetic mutants do not establish a wrong result in the current implementation. | Issue scope: Test gap: 133 missed mutants in 12 functions survive in the plate element kernels (DKT, DKMT, CST). No demonstrated current wrong-result case in this item. |
| #745 | — | SCOPE | not a wrong-result defect: mutation-test coverage gap; surviving synthetic mutants do not establish a wrong result in the current implementation. | Issue scope: Test gap: 765 missed mutants in 49 functions survive in the plastic-collapse certificates. No demonstrated current wrong-result case in this item. |
| #741 | `BU-BOUND` | REFUSE | A 3D (and 2D) buckling factor that is certified outside its bounds, or that the certificate finds above its Rayleigh upper bound (`computedAboveUpperBound`, #817), is refused by `certify_buckling_2d/3d`: no factor is returned. | known_issues_refusal_preserves_structured_identity: inside/lower/upper controls; reported_buckling_741_818_plain_and_certified and buckling_741_certificate_contains_reported_and_reference_factors: the fuzz model is refused and its certificate (`buckling_certificate_3d`) cites the reported factor above an exact-arithmetic bound; generated_buckling_certificate_invariant: every computedAboveUpperBound certificate is refused by the public entry point, every other output is returned unchanged; web buckling-containment.test.ts: the app withholds the factor |
| #466 | `AC-PLANE-MAPPING` | WARN / REFUSE | Engine: WARN on every 2D constrained input (the wire has no source plane). Web: a 3D-to-2D cut on Y–Z or X–Y is REFUSED (`slice.constraintsPlane`) when a constraint touching the cut would be read as if the model stood in X–Z (§ below). | known_issues_model_predicates_have_negative_controls; model-findings-constraints-and-views.test.ts; switch-2d-constraints.test.ts: a uy tie (dropped, then refused as disconnected) and a ux tie (read as an in-plane sway tie, 2D sway 0.0023 vs 3D 0.1001 and 0) are refused by slice and projection; an XY floor diaphragm and a full rigid link on a Y–Z cut go ahead and agree with 3D to 1e-9 |
| #458 | `CERT-MECHANISM` / `NUM-INVARIANCE` | WARN / WARN | All-hinged, rotationally unrestrained 2D node with moment or rigid link (CERT-MECHANISM). The 3D rotation held by nothing about a skew axis solves with StiffnessNotPositiveDefinite and so NUM-INVARIANCE, and is not certified at either level. | known_issues_model_predicates_have_negative_controls; known_issue_reproductions::a_rotation_held_by_nothing_about_a_skew_axis_is_warned_and_not_certified (free axis rotation ~1e13 rad; moment along the held axis gives rx/ry of the wrong sign and ratio with ResidualOk; held control: no warning, certified) |
| #1238 | `CUT-SECTION-AXIS` | REFUSE | Web only (the engine never sees the 3D model): a 3D-to-2D cut with a frame member whose in-plane inertia in the space model, Iy·(n·e_y)² + Iz·(n·e_z)² in its real axes, differs from the plane solver's Iy·cos²α + Iz·sin²α, or whose in-plane inertia with the out-of-plane motion free, Iy·Iz / (Iy·(n·e_z)² + Iz·(n·e_y)²), differs from it (bending coupled across the plane by principal axes skew to it), is refused (both within 1e-6 of the plane value) (`slice.sectionAxis`). An IPN 300 portal standing in Y–Z swayed 0.0130 m in 3D and 0.00096 m after the cut. | switch-2d-constraints.test.ts: the I portal in Y–Z is refused by slice and projection; the same portal with its columns rolled 90° is cut and agrees with 3D to 1e-9; the X–Z portal is cut and agrees; equal-inertia sections are never refused; an I column with its section turned 30° (equal in-plane inertia, coupled bending, 3D head uy > 5 % of ux) is refused even on X–Z. Over the bundled 3D models no X–Z cut is refused |
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
| #426 | `NL-3` | WARN | 3D co-rotational; no validated input bound on non-coaxial rotation. Measured: the Bathe–Bolourchi 45° bend is within 1.1 % (uz 0.04 %, uy 4 %), a non-coaxial tip-moment helix (EI = GJ, α = 45°, rotation 1.57 rad) matches the exact tip within 1e-4·L with 40 elements (1.6e-4·L with 20: discretisation, shrinking with refinement), and a helix beyond the increments' reach (kL = π) reports `converged: false` rather than a wrong equilibrium. No measured case is unconservative enough to justify refusing every 3D co-rotational solve. | known_issues_analysis_predicates_have_negative_controls; known_issue_reproductions::the_45_degree_bend_is_within_two_percent_and_carries_nl3, a_helix_from_a_non_coaxial_tip_moment_matches_the_exact_solution_and_carries_nl3, a_helix_beyond_the_increments_reach_is_reported_unconverged_not_wrong |
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
| #810 | `SH-MITC4-CONVERGENCE` | WARN | All MITC4 analyses pending isolation of the stiffness/convergence defect; no validated safe subset. | known_issues_shell_predicates_have_geometric_controls; reported shell obstacle course #809 |
| #846 | — | SCOPE | Benchmark model/reference mismatch and insufficient continuation budget, not an engine defect. Closed 2026-10-30 by merged #852; no engine source changed. | #852: rigid frame energy reference 48.749671 vs 48.750000 kN; true truss traverses both ±95.9850489145 kN limits with path error 8.2e-11 (bound 1e-8). https://github.com/lambdaclass/stabileo/pull/852 |
| #818 | `BU-ACCURACY` | WARN | All 3D buckling, including plain calls and certification fallbacks; no validated input-only safe subset. | reported_buckling_741_818_plain_and_certified: real #741 fuzz model, unchanged factor and certified refusal |
| #1057 | `SH-WARPED-MITC4` / `SH-WARPED-MITC9` | REFUSE / REFUSE | MITC4 quads and MITC9 quad9s on twisted surfaces: twist curvature × thickness, κt = max over Gauss points of n·x,ξη / (x,ξ × x,η) times t. MITC4 WARN above 0.009 and REFUSE above 0.016; MITC9 WARN above 0.0035 and REFUSE above 0.0065 (§ thresholds below). Planar elements, and quad9s on cylinders meshed along their generators, have κ = 0. | known_issues::warped_mitc_shells_on_the_twisted_beam_are_withheld (MITC4 6×2 to 24×8, MITC9 3×1 to 12×4), warped_mitc_thresholds_are_the_measured_bands, warped_mitc_untwisted_flat_and_planar_curved_shells_are_not_flagged (0° strip, flat, cylinder, Scordelis–Lo, sphere), warped_mitc_twist_measure_is_the_helicoid_twist, warped_mitc_refusal_reaches_every_3d_entry_point |
| #798 | `SH-MITC4-DISTORTION` | WARN / REFUSE | Distorted MITC4; refuse only significant membrane bending (§ thresholds below). 3D harmonic analysis, 3D Guyan reduction and 3D Craig–Bampton reduction refuse every model with distorted MITC4 elements (their reduced matrices carry the locked membrane stiffness into any later use): its complex response field is not checked. | known_issues::mitc4_macneal_harder_contains_membrane_bending_only: regular/trapezoid/parallelogram × extension/in-plane/out-of-plane; shell geometric controls; nonlinear_and_dynamic_shell_paths_run_the_membrane_guard (static and harmonic on the distorted and regular strip) |
| #903, #904, #905, #913, #914, #915, #916, #917, #918, #919, #920, #921, #922, #923, #927, #928, #929, #930, #931, #935, #936, #937, #939, #940, #944, #949 | — | SCOPE | Code_Aster harness, not an engine defect: each is the engine's AC-10 refusal of a prescribed displacement on a DOF no rigid restraint carries (unflagged, or freed by a spring). The translator dropped that value (DDL_IMPO only on fixed DOFs), so Code_Aster solved a different model. | 86a01d4be: run.py reports such a refusal as refused, and silent_unimposed if the engine ever solves one; test_to_aster.py; tools/differential/codeaster/regressions/settlement-*. Nightly codeaster-diff on b433c01ba (run 41321561699): 956 models, 0 false_reject, 0 mismatch. |
| #906, #907, #908, #909, #910, #911, #912, #924, #925, #926, #932, #933, #934, #938, #941, #942, #943, #945, #946, #947, #948 | — | SCOPE | Code_Aster translator, not an engine defect: all are rigid-diaphragm models. The engine ties each slave's in-plane rotation to the master's (89bed56b4, as SAP2000/ETABS/OpenSees); the translator left it free and had the XZ lever sign opposite to w × r. | 4cc2a9be4: with the old translator rows as linearMPC, stabileo reproduces Code_Aster's reported values to 3e-11 (9 of the 13 models; 4 hit linearMPC's dependent-DOF choice); the new rows reproduce stabileo's diaphragm to 2e-15; the 13 models are in tools/differential/codeaster/regressions/diaphragm-*, and run 41321561699 (regressions + 900 random) has 0 mismatches. |
| #950 | — | SCOPE | Code_Aster harness: the replay crashed on a near-singular verdict without why. aster3d-757367 is an unloaded twist mechanism the engine warns about (high_diagonal_ratio 8.8e9); holding that rotation gives bit-identical end forces, so Code_Aster's NPREC=-1 solution (rz = 1e13) is no reference. | b433c01ba; regressions/twist-held-aster3d-757367.json, warned-twist-mechanism-aster3d-757367.json; run 41321561699: warned_singular 1. |
| #951, #952, #953, #989, #990, #991 | — | SCOPE | Fuzz harness, not an engine defect: one model (the seed corpus's 8-member 3D portal) through certify_plastic_3d. The job hit libFuzzer's process RSS limit (RSS grew 77 MB → 2 GB over ten minutes, 84 MB live heap at the OOM), charged to the input then running; slow-unit-* files are libFuzzer reports, not failures. | 80bddee4d: robustness fuzz_regressions::plastic_3d_certificate_nightly_inputs_finish (each certifies, natively under 25 MB; λ = 10.125 hand-checked); scripts/nightly-fuzz-findings.py skips slow units and requires an OOM to reproduce alone (test_nightly.py). |
| #954, #956, #960, #965, #966, #968, #972, #973, #993, #994, #1028, #1029, #1040, #1041 | — | SCOPE | Duplicates of #762 (NUM-INVARIANCE WARN), no additional mechanism: on every reproducer the reported analysis's original result carries the NUM-INVARIANCE warning (with stiffness_not_positive_definite, LU fallback or high_diagonal_ratio). Most are reduced to one-member mechanisms (a bar pinned at one end, a frame hinged at its pinned end) whose solve or refusal flips with orientation and units, exactly the #762 class. | Replayed on 002c082c7 with each issue's seed; original-solve diagnostics: linear/PCG/sparse path 954, 956, 993 (fuzz 20840, 20892); harmonic 960, 994; creep 965; buckling 966; staged 968; modal 973; cable 1028; Winkler 1029; time history 1041; 3D P-Delta 972; 3D plastic collapse 1040 |
| #964, #967, #1008 | — | CORRECTED | Containment gap closed: SSI, contact and co-rotational solves factored their own systems without the #762 conditioning check, so a mechanism returned converged with no warning. Each now attaches NUM-INVARIANCE from the factor of its last solve (diagnostics only, numbers unchanged). | 63e8da386; known_issues::contact_ssi_and_corotational_solves_of_a_mechanism_are_flagged (the #1008 bar, plus a plain cantilever negative control) |
| #969, #1009, #970 | — | SCOPE | Duplicates, no additional mechanism: 3D modal orthogonality is #759 (MD-ORTHOGONALITY), 3D time-history reciprocity is #760 (TH-RECIPROCITY), 3D buckling is #818 (BU-ACCURACY); each warning fires on the reproducer's original result. | Replayed on 002c082c7: fuzz_rich_3d/21171 modal, fuzz_rich_3d/21721 time history, seed 2026103104245 buckling |
| #971, #974, #992, #1002, #1034 | — | SCOPE | Metamorphic harness, not an engine defect. 974/992/1002: quad9, solid-shell and curved-shell stresses were relabelled through the quad table, and the padded sparse/PCG paths dropped stresses whose shell id was not a frame id. 1034: the harmonic floor counted only translations, which are round-off under bimoment loads (rotations 1e-3). 971: P-Delta asked for a 1e-12 tolerance below round-off; the rescaled copy stagnates at the same answer to 2e-12 and correctly reports non-convergence (it converges at 1e-11). The harness keeps the strict requirement: P-Delta must converge to 1e-12 within 100 steps, to finite numbers; the #971 replay meets it. | d7440bddd; regressions::nightly_harness_findings_hold replays the five models with their seeds; ana2::p_delta_rows_need_convergence_and_finite_numbers |
| #1014, #1022, #1037 | — | SCOPE | Metamorphic harness noise floor: thermal-only determinate models whose zero member forces carry 1e-14 kN round-off were compared against 1e-22 tolerances. | 002c082c7; regressions::nightly_harness_findings_hold replays all three |
| #955 | — | SCOPE | Metamorphic harness noise floor: a settlement-only model (dz = -0.0024 m on a fixed support) had a force floor of 0; the 1.6e-4 kN mirror difference on N = 10.26 kN is round-off of the settlement's restrained end forces. | 550a0b600 (per-member settlement floor); regressions::nightly_harness_findings_hold replays it. |
| #959 | — | CORRECTED | 2D buckling took round-off for compression: an axial force of -3e-6 kN on an uncompressed cantilever (transverse load only, EA/L = 1.3e7 kN/m, ‖u‖ ~ 1e3 m) passed the absolute -1e-6 test, giving load factors 2.4e7 to 9.4e7 or a refusal by orientation. When every member's compression is within 100·ε·EA·Σ‖u_k·e_k‖/L (the round-off of its elongation, counting only displacement components along the member) the analysis now refuses as not determinable, naming the largest compression; a resolved compression anywhere proceeds as before, with Kg from every member. | d233df091, f6586836a, 19298dc9b; regressions::buckling_without_compression_refuses_in_every_orientation, buckling_compression_threshold_is_per_member (column beside a flexible cantilever, column under 1e-5 kN, slender cantilever under 1e-5 kN deflecting 1.7e5 m with λ ≈ 0.49), restrained_thermal_compression_buckles_under_a_common_translation (an imposed-strain compression keeps its factor to 1e-6 under prescribed rigid translations up to 1e6 m and is refused only past αΔT·L_e/(200ε), 1.4e10 m there). |
| #982 | `BU-UNRESOLVED-MODE` | WARN | 2D buckling modes whose load factor is not resolved: a mode is named when Σ noise_e·abs(φᵀG_eφ), the most the round-off of the axial forces (noise_e as in #959) can change its geometric work, exceeds 1 % of the work Σ N_e·φᵀG_eφ. The reproducer's third mode (λ ≈ 9e9 to 2.8e10, from the round-off axial force of the uncompressed cantilever, in some orientations only) is named; its first two factors agree across relabel, rotation and units to 1e-10 and are not. Modes are not dropped: removing round-off members from Kg is pending a human decision. | regressions::buckling_modes_from_round_off_compression_are_named_in_every_orientation (issue model, 0° to 271°, plus an untouched column as negative control); known-issues.test.ts names the modes in every locale |
| #963 | — | SCOPE | Not an engine defect: the lowest of two frequencies (3.47e-4 vs 3.85 Hz, λmax/λmin = 1.2e8) is computed to its attainable accuracy; the dense generalized eigensolver's relative error bound on it is ε·λmax/λmin = 2.7e-8, and the observed rotation difference is 3e-9 against a harness tolerance of 2e-9 that omits that term. | Replay of the issue model with seed 2026103101370: only modal × rotation fails, by 1.5× its tolerance; harness follow-up: scale the frequency tolerance by (f_max/f)². |
| #1030 | — | SCOPE | Metamorphic harness, not an engine defect: the symmetrised model is two independent mirrored cantilevers, so every mode appears twice; the 2D spectral row took 4 modes, cutting between the two copies of the 12.83 Hz mode, so one cantilever was combined with it and the other without (u@n2 vs its mirror 4.8e-6 relative). Each mode and its mirror agree to 1e-16 and the response over complete pairs is bit-symmetric. | dde3aa390: the 2D row extends its cut to the end of a cluster as the 3D row already did; regressions::spectral_symmetry_keeps_repeated_pairs_whole fails without it with the issue's numbers. |
| #1122, #1123, #1126, #1127, #1131, #1137, #1145, #1149, #1150, #1153, #1154, #1155, #1156, #1168, #1171, #1174, #1180, #1184, #1185, #1186, #1187 | — | SCOPE | OpenSees differential harness, not an engine defect: all 3D P-Delta/buckling models, where the OpenSees reference omits the Wagner term that the engine includes (182/182 P-Delta models of run 41392670163 differ only through it). | #739 root-cause table and its OpenSees Wagner-term reference fix; run 41392670163 on main 7f6899708 |
| #1119, #1120, #1121, #1124, #1125, #1128, #1129, #1130, #1132, #1133, #1134, #1135, #1136, #1138, #1139, #1140, #1141, #1142, #1143, #1144, #1146, #1147, #1148, #1151, #1152, #1157, #1158, #1159, #1160, #1161, #1162, #1163, #1164, #1165, #1166, #1167, #1169, #1170, #1172, #1173, #1175, #1176, #1177, #1178, #1179, #1181, #1182, #1183, #1188, #1189, #1190, #1191 | — | SCOPE | OpenSees differential generator, not an engine defect: false_reject of a settlement prescribed on a DOF the support leaves free or sprung. The engine refuses it by design (AC-10), as for the Code_Aster rows #903 to #949. | #739 settlement generator fix (settles only restrained DOFs); same class as 86a01d4be |
| #1084, #1092, #1108 | — | SCOPE | Duplicates of #974, #992 and #1002: quad9, solid-shell and curved-shell stresses relabelled through the quad table in the metamorphic harness. | d7440bddd; regressions::nightly_harness_findings_hold |
| #1088, #1089, #1100, #1105, #1107, #1109, #1194, #1195, #1197, #1198, #1199, #1201, #1203, #1204, #1206 | — | SCOPE | Metamorphic harness noise floor, the class of #1014, #1022 and #1037: quantities that are zero in exact arithmetic (1e-14 kN of round-off) compared against tolerances of 1e-20 to 1e-31. #1204 is an exact duplicate of #1203. | 002c082c7 and the per-member settlement floor 550a0b600 (load_floor_2d/3d); found on main, where neither is |
| #1085, #1087, #1094, #1098, #1111, #1114, #1200, #1211, #1217, #1220 | — | SCOPE | Metamorphic harness tolerance: differences at most 3 times the tolerance and at most 1e-8 of the quantity's scale, which is round-off of the solve, not a wrong result. | run 41392670163 issue bodies (ratio and scale per issue); harness tolerance |
| #1086, #1097, #1101, #1102, #1115, #1116, #1117, #1118, #1216 | — | SCOPE | Duplicates of #762 (NUM-INVARIANCE WARN), #1116 of #963: differences of 1e-7 to 1e-4 of scale on near-singular, near-resonant or wide-spectrum models, where the original result carries the conditioning diagnostics and NUM-INVARIANCE. | #762 row; same diagnostics on the reported originals |
| #1096, #1214 | — | SCOPE | Duplicates of #1030: the 2D spectral metamorphic row cut a repeated mode pair. | dde3aa390 (#1030) |
| #1213, #1219 | — | SCOPE | Metamorphic harness: a modal participation factor or effective-mass sign was compared with sign, and an eigenvector's sign is arbitrary (the SIGN_FREE rule of #786). | modal relation compares magnitudes; same rule as #786 |
| #1104 | — | SCOPE | Duplicate of #760 (TH-RECIPROCITY WARN): the same model as #1009. | #760 row |
| #1113 | — | CORRECTED | 2D reactions of a rigid support that also carries a spring on a restrained DOF with a prescribed displacement: assembly adds the spring to K on that DOF, so the restrained partition held only the rigid part and the spring force −k·u was never added (an angle-less inclinedRoller, rollerX or pinned tip with ky = 1000 and dz = −0.01 reported ΣRz = −10 with no load). build_reactions_2d now adds −k·u on restrained DOFs too, and the reaction certificate uses the same formula. Displacements and member forces are unchanged. | opensees_differential_regressions::settled_roller_with_its_own_spring_keeps_reactions_in_balance (fails before the fix: ΣRz = −10; also bounds the certified reactions); replay of seed 20759 |
| #1093 | — | CORRECTED | Harness defect plus a containment gap. The fiber rows of the metamorphic harness took a section's elastic modulus from the first element found in a HashMap, so a section shared by two materials got a different modulus in each process (max ux 113.05 or 117.60 m on the same input); the engine is deterministic. The harness now takes the stiffest material of the section, independent of order and numbering. The gap: the 2D and 3D fiber solves did not run the #762 conditioning check, so this near-mechanism (the linear solve carries NUM-INVARIANCE) came back without it. They now inspect the factor of their last Newton solve, as contact, SSI and co-rotational do. Diagnostics only. | regressions::a_section_shared_by_two_materials_gets_one_fiber_material_in_any_order; known_issues::fiber_solves_of_a_mechanism_are_flagged (2D and 3D, full and modified Newton, fixed-end negative controls; fails before the fix); 40 processes of the reproducer give one answer |
| #1209, #1215, #1218 | — | SCOPE | Harness tolerance, not a wrong result. The compared value is the horizontal response at a node on the symmetry axis: exactly zero, and its image is its own negative. A dense direct complex solve of the same K, M, C and f gives 1e-16; modal superposition leaves 1e-5, 3e-6 and 3e-10 of the largest displacement, the eigenproblem's attainable accuracy on spectra spreading 1e10 and 1.6e8 (the #963 class). The results carry MD-ORTHOGONALITY. | Replays at 7f6899708 reproduce each failure; on this branch all three pass with the harmonic floor of d7440bddd; direct complex solve vs modal path at the same Rayleigh damping |
| #1099 | — | SCOPE | Duplicate of #762 (NUM-INVARIANCE WARN). The unpadded model is refused (a connector shear spring needs rotation DOFs the truss chain does not have); the harness padding adds them, leaving one rotation held by a zero pivot, so its value is round-off. The padded result carries StiffnessNotPositiveDefinite, HighDiagonalRatio and NUM-INVARIANCE. | Replay with seed 20759; unpadded solve_2d refuses the connector; padded result diagnostics |
| #1192 | — | SCOPE | Harness defect, not a wrong result. Mirroring or rotating off the axes turns a rollerX on a node that also has a pinned support into an inclined roller, which the engine refuses explicitly as an ambiguous shared support. The harness now treats that transform as unrepresentable. | regressions::shared_node_supports_off_the_axes_are_unrepresentable (fails without the guard); metamorphic_corpus/nightly/issue-1192.json |
| #1083, #1090, #1091, #1095, #1103, #1106, #1112, #1193 | — | SCOPE | Duplicates of #762 (NUM-INVARIANCE WARN): one transformed copy solves and the other refuses on a near-singular model, the invariance class #762 contains. | #762 row |
| #1110, #1202 | — | SCOPE | Duplicates of #959 (CORRECTED): "no compressed elements" after a rotation or rescale of a model whose only compression is round-off. | #959 row; regressions::buckling_without_compression_refuses_in_every_orientation |
| #1081, #1082 | — | SCOPE | Duplicates of the json_plastic class #951: fuzz RSS and slow-unit reports on the 3D plastic certificate, not a wrong result; performance in #743. | 80bddee4d; fuzz_regressions::plastic_3d_certificate_nightly_inputs_finish (limited subprocess) |
| #1196, #1205, #1207, #1208, #1210, #1212, #1269, #1270, #1271, #1277, #1279, #1280 | `TH-NONFINITE` | CORRECTED | 2D/3D time history with massless DOFs: Rayleigh damping was anchored on Lanczos' infinite eigenvalue, so the coefficients and the history went to 1e290 and then NaN. #1239 drops non-finite eigenvalues and refuses any non-finite history or peak reaction. | Replay of all 12 reproducers on #807 + #1239: no NaN or infinite finding left. What remains on #1205, #1207, #1212 and #1271 is the noise-floor class of #1088 (spectral base shear of 1e-32 kN, a C2 image of 1e-23 m) |
| #1256 | — | SCOPE | Code_Aster translator, the diaphragm class of #906 to #948: a YZ diaphragm whose worst error is the slave's rx, the in-plane rotation the engine ties to the master. Fixed in the translator by 4cc2a9be4. | #906 row; reproducer worst error at node 3 rx |
| #1257, #1258, #1259, #1260 | — | SCOPE | Code_Aster harness, the class of #903 to #949: the engine's AC-10 refusal of a settlement on a DOF that is not flagged or that a spring frees (drz, drx, dry, dy). Fixed in the harness by 86a01d4be. | #903 row |
| #1261 | — | SCOPE | The json_plastic fuzz RSS class of #951. The input is a 2-node simply supported beam through certify_plastic_2d: it runs natively in 16 ms on main, and on this branch it is refused with PL-2D-INVARIANCE. | #951 row; #758 row |
| #1263, #1264 | — | SCOPE | Duplicate of #1113 (CORRECTED): an angle-less inclinedRoller that carries springs and a settlement dz. Its reaction under the symmetric and antisymmetric images was 0 instead of 1.73 kN. | Replay passes on #807 |
| #1265 | — | SCOPE | Duplicate of #762 (NUM-INVARIANCE WARN): a near-mechanism 2D model with displacements of about 1e3 m. The original solve carries the NUM-INVARIANCE warning. | #762 row |
| #1262, #1268 | — | SCOPE | Metamorphic harness noise floor, the class of #1088: the load sits on a restrained DOF, so every translation is exactly 0 (scale 0, tolerance 2e-308), or the only rotation is 9e-17. Transformed copies give 1e-22 m and 1e-16 of round-off. | Replay on #807: same values |
| #1266, #1273, #1274, #1275, #1276, #1282, #1283 | — | SCOPE | Metamorphic harness tolerance, the class of #1085: time-history and modal differences of at most 2e-9 of the quantity's scale. The time-history tolerance counts no iteration term, although the Rayleigh coefficients come from an iterative Lanczos solve. | Replay on #807: same values |
| #1281 | — | SCOPE | The class of #1209: a harmonic response on the symmetry axis that is zero in exact arithmetic (3e-11 at a scale of 1e-2). | Replay passes on #807 |
| #1267, #1278 | — | SCOPE | Metamorphic harness, the repeated-mode class of #1030. The symmetrised model has nearly repeated pairs, ω = 6.120165e-5 / 6.120286e-5 and 1.5410433e-4 / 1.5410503e-4 rad/s (splits of 2e-5 and 4.5e-6). Inside a pair the eigenvectors are resolved only to the iteration tolerance divided by the gap, and CQC of a pair that is not exactly repeated depends on that rotation. The meff sign is the SIGN_FREE rule of #1213. Differences are at most 1.1e-4 of the scale. | Mode list from replay of seed 2026110303012 |
| #1272 | — | SCOPE | 3D plastic collapse whose hinge rotation reverses: every copy that returns a value warns that it is a lower bound (1458.12, and 394.09 under one transform), and the unit-scaled copy refuses (no bending collapse). Lower bounds with that warning are not invariant, and the refusal is conservative. | Replay of seed 2026110303871 with the harness printing λ, mechanism flag and warnings |

## Decisions (2026-11-02)

- #798 SH-MITC4-DISTORTION ships as is. The membrane-response predicate (§ thresholds below) already lets distorted meshes without membrane bending through, but it still over-refuses accurate curved-shell benchmarks: the pinched hemisphere (4×4, 8×8 and the R/t sweep), the hypar self-convergence meshes, the spherical cap and the obstacle-course hemisphere are withheld although they are within 2% of their references (shell_benchmark.rs and discretization_error.rs assert each refusal). Combinations whose Σ|factor| exceeds 1, envelopes of more than one distorted result and 3D harmonic analysis of a distorted model are refused for the same reason: the combined or dynamic field is not checked. Narrowing all of these is a separate follow-up on the roadmap (item 16); until then the refusals stand.
- #458 and #762 near-mechanisms stay WARN (CERT-MECHANISM, NUM-INVARIANCE), not REFUSE. The static certificate never certifies them.
- The web results store withholds every case or combination result when any one of them is refused, because footing service sums, fire design and slab deflection add up every case, and dropping a refused case would understate design actions (user 2026-11-02: c1/c2/c10 accepted as answered).

## Predicates and limits

- NUM-INVARIANCE: existing HighDiagonalRatio (>1e8), ExtremelyHighDiagonalRatio (>1e12), NearZeroDiagonal (<= max diagonal × 1e-12), StiffnessNotPositiveDefinite, CholeskyFailedLuFallback, or ExcessiveDisplacement diagnostics. The checks do not change numerical thresholds, factors used by the solve, or solve arithmetic. Staged/cable iterations reuse their cached symbolic analysis and numeric factors; Winkler, harmonic modal, time-history effective-stiffness, and large modal/buckling paths inspect their existing factors. Additional diagnostic factorizations remain where the required stiffness factor is not produced: dense eigensolver branches without an exposed stiffness factor (modal branches normally factor mass), spectral analyses accepting externally supplied modes, reduction analyses factoring interior/condensed blocks, direct harmonic analyses factoring frequency-dependent systems, and time-history checks of the original stiffness rather than effective stiffness. These checks remain separate from the solve and can add runtime and memory; see the measurements below. Issue #762 supplies seed cases but no conditioning cutoff. All ten reported seeds are covered: 2D 20800, 20833, 20865, 20795, 20756, 20824, 20840, 20806; 3D 20761, 20788. The 2D and 3D fiber solves inspect the factor of their last Newton solve, as contact, SSI and co-rotational do (#1093). Constrained solves also inspect their existing original free stiffness before reduction: seed 20840 loses the warning after reduction alone (reduced diagonal ratio about 139), while the original matrix exposes the artificial-hinge stiffness contrast. This conservative conditioning boundary is the narrowest tested boundary covering all reported cases; it is not a complete invariance detector. A well-conditioned plain frame is a negative control.
- CERT-MECHANISM: a 2D node with incident members, all of which release rotation (or are non-frame), and either a nonzero nodal moment or an incident rigid link. A real rotational support or positive rotational spring excludes the node. Nodal moments are checked against the actual prepared load case. No blanket 3D warning. The skew-axis mechanism of #458 is pinned in known_issue_reproductions: NUM-INVARIANCE (from StiffnessNotPositiveDefinite) warns on it and both certificate levels refuse it; CERT-MECHANISM does not claim it.
- AC-PLANE-MAPPING: every 2D constrained input; the engine wire no longer contains the original 3D plane, so it cannot narrow this further. The web cut (`plane-cut-guard.ts`) has the plane: on Y–Z or X–Y it refuses when a constraint with a node in the cut would be read otherwise than on X–Z. Read alike: a rigid link or equal-DOF whose DOFs map to the same plane DOFs either way (no DOFs, all six, the three translations, uz), an XY diaphragm on a Y–Z cut and a YZ diaphragm on an X–Y cut. Everything else (linear MPCs, eccentric connections, other diaphragms, partial DOF sets) is refused. X–Z cuts are unchanged.
- BU-SPAN-COMPRESSION: 3D buckling with distributed or point-on-member loads.
- SH-MITC4-DISTORTION: WARN for MITC4 skew >10°, Jacobian ratio <0.9, warping >0.01, or non-finite/missing geometry. The MacNeal–Harder regular rectangle (0° / ratio 1) passes; the reported 45° trapezoid and parallelogram fail. These conservative geometry cutoffs lie between the demonstrated endpoints, not experimentally established accuracy boundaries. The reported in-plane values are regular 0.1071 versus 0.1081, trapezoid 0.0084 (−92%), parallelogram 0.0104 (−90%); out-of-plane values 0.4235, 0.4162, 0.4226 versus 0.4321 stay within 4%.
  On each recovered static load case, compute local nodal normal membrane stresses after subtracting its thermal strains. REFUSE if either normal component has a maximum-minus-minimum variation greater than E × 1e-12 (E in solver stress units). This conservative significance test is independent of uniform axial stress and plate bending stress: superimposing either cannot suppress containment. Uniform affine extension and pure transverse bending retain WARN; a clamped extension with nonuniform membrane stress may be refused. The modulus-scaled floor excludes numerical noise. Prepared solves cache geometry and index displacements and thermal loads once per load case. Other analysis types retain the geometry warning; no modal stress pattern is treated as static membrane bending.
- SH-WARPED-MITC4 / SH-WARPED-MITC9 (#1057): the error of the flat-facet MITC4 and MITC9 on a twisted surface is set by the twist curvature κ times the thickness t, not by the element size, so it does not shrink as the warp per element (quad_quality_metrics warping) goes to zero. On the MacNeal–Harder twisted beam (90°, κt = 0.042) MITC4 converges to 1.32 (load A) and 1.27 (load B) times the reference and MITC9 to 2.5 and 2.3; changing the width or the length at fixed κt leaves the ratio unchanged, and changing t at fixed κ moves it with κt. Measured over-flexibility (ratio to beam theory, minus the untwisted ratio): MITC4 about 185·(κt)², 0.9 % at κt = 0.007, 1.7 % at 0.010, 4.1 % at 0.015, 8 % at 0.021, 32 % at 0.042, 120 % at 0.084; a hyperbolic-paraboloid cantilever (z = c·x·y) against curved shells gives 1.4 % at 0.010 and 5.4 % at 0.020. MITC9 about 1100·(κt)², 2.9 % at 0.005 (hyperbolic paraboloid), 5.4 % at 0.007, 11 % at 0.010, 43 % at 0.021, 150 % at 0.042. A cylinder meshed on helices (R/t 20 and 50, 30° and 45°) with quad9s is 7 to 16 % too flexible at κt 0.012 to 0.050, inside the refusal band. The WARN levels (0.009, 0.0035) are where the measured excess in the worse load case reaches about 1.5 %; the REFUSE levels (0.016, 0.0065) where it reaches about 5 % (other load cases on the same geometry can be less affected, e.g. MITC9 load B at 15° is 0.4 % off, so the message says the error can exceed 5 %, not that it does): the error is non-conservative in stiffness, grows quadratically, and no convergence study can reveal it. A finding lists the elements above the WARN level and is an error when any exceeds the REFUSE level. A collapsed element (no measurable twist) or a non-finite or non-positive thickness is not measured: input validation and the collapse gate refuse those by name. SH-MITC4-DISTORTION previously caught only the coarsest twisted-beam mesh (warping 0.017 > 0.01); nothing covered quad9s (SH-7, #411, removed the old warped-MITC9 warning when its rigid-link correction landed).
- PL-2D-INVARIANCE: all native Rust and Basic UI 2D plastic-collapse calls; no validated safe subset is known. Basic refuses before displaying a legacy result or requesting native certification. The internal TypeScript algorithm retains its numerical regression tests.
- BU-BOUND: a 3D certified buckling result whose computed factor is below the lower bound or above its available upper bound. This additionally checks the output because the defect has an exact observable contradiction.
- SP-17: 3D connectors with unequal transverse shear or bending stiffnesses.
- FR-5: at least two positive-Cw members sharing a node; continuity requires verification even for a collinear change of section.
- SP-14: cable elements outside the cable analysis, conservatively independent of load sign.
- NL-5: all material nonlinear analysis because the whole-member secant formulation is intrinsic, independent of input geometry.
- NL-3: 3D co-rotational analysis; no proven input-only bound on non-coaxial rotations.
- NL-13: only a returned contact history with a frozen gap, including max_flips = 0 on the first flip; no warning for an ordinary converged contact solve.
- NL-17: only a returned unconverged fiber iterate; no warning for a converged fiber solve.
- MD-ORTHOGONALITY: 3D modal, spectral, and harmonic modal-superposition analysis; no proven safe input subset.
- TH-RECIPROCITY: 2D and 3D time history; no proven safe input subset.

## Verification policy

The results snapshot corpus includes diagnostic codes. New warnings can change those strings while all numbers remain bit-identical. REFUSE intentionally removes an affected result. Do not regenerate numerical baselines to hide either a refusal or a numerical change. The read-only audit runs on pull requests, merge queues, schedules and manual requests. The audit is advisory: it is neither a reusable workflow nor a required deployment dependency.

- PL-3D-INVARIANCE: 3D plastic analysis containing curved beams.
- NL-DYNAMIC-GAPS: material nonlinear analysis (increment/convergence gap), or modal/spectral/time-history/harmonic models containing frame members or curved beams expanded into frames (omitted rotary inertia). A model without frame members does not get the dynamic warning. Modal orthogonality and time-history reciprocity have no demonstrated reliable input-only cutoff, so those analysis-level warnings remain broad and explicit.

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
| #757 | SH-GLOBAL-STRESS (retired) | CORRECTED | Solid-shell centroid stresses use the local shell frame; the refusal for faces off the global X–Y plane is removed. | PR #814 (closed #757); shells::solid_shell_stress_axes (rotation invariance, analytical membrane tractions, aligned X–Y bit identity); solid_shell_locking Scordelis–Lo, pinched cylinder and hemisphere; shell_benchmark benchmark_ss_* and frontier gates; known_issues_shell_predicates_have_geometric_controls and determinism containment.test.mjs assert no #757 containment remains |

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
| nix develop -c make typecheck.web | PASS: 247 existing TypeScript baseline errors, no new typecheck errors; no errors in guarded Svelte paths (repository-wide informational count: 343 errors, 264 warnings) |
| python3 scripts/check-containment.py | Historical result; superseded by the review follow-up audit below |
| git diff --check (read-only) | Historical claim corrected: review found an extra EOF blank line in legacy-plastic-helper.ts; removed during follow-up |

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

## Propagation and numerical stability

No new typecheck errors is the acceptance criterion; the repository has an existing baseline.
The membrane-bending predicate is checked on constrained, prepared, combined, second-order,
foundation, SSI, contact and staged static results, using the returned state's
thermal loads. Model-less combination and envelope APIs cannot recompute the membrane predicate and refuse
cases carrying `SH-MITC4-DISTORTION`, except the identity combination (one case, factor 1), which returns the field
the guard already checked (a scaled field can cross its absolute E·1e-12 threshold); envelopes keep refusing because the web hands them combinations it
superposed itself; model-aware multi-case solves check the combined displacement
field with factored thermal loads. This conservative model-less refusal is diagnostic-only.
The determinism gate requires six structured 2D plastic refusals (#758), retains both 3D plastic
certificates and their bundle exports, and compares all outputs exactly across runtimes.
Results version 7 (renumbered at landing) registers the warnings and refusals; the only numerical kernel change is the 2D reaction of a settled rigid support with its own spring (#1113), and no baseline changes.

The constrained-path guard also withholds validation-01's DEAD LOAD case (quads 640 and 657).
Its numerical baseline is retained unchanged alongside validation-03's; the tests now require
the specific #798 diagnostic. The Node determinism corpus contains 191 cases and 27 recorded
refusals/errors, with six required PL-2D-INVARIANCE refusals, including the 2D bundle exports.

Advanced modal, harmonic, time-history and reduction results inspect their assembled and
reduced stiffness matrices for `NUM-INVARIANCE`, including round-off factorization pivots. Time history also inspects its effective stiffness.
Buckling retains preload diagnostics and checks the eigenproblem stiffness; creep retains
the base solve and every step's diagnostics. Linear and combination certificate bundles
serialize deduplicated structured diagnostics alongside their unchanged numerical payloads.
The viewport keeps time-history warnings visible while its response is shown, independently
of the dynamics panel. Production worker and synchronous solve errors use localized
containment refusals. Basic 2D plastic refuses before displaying a legacy result or scheduling
a native certificate; internal legacy numerical regression tests remain active.

## Review follow-up for 3c95d9828

- Influence services retain native sweep diagnostics and aggregate point-by-point and truss
  endpoint diagnostics. Both moving-load services publish all position diagnostics; the
  banner also traverses positions, including findings absent from position zero.
- Standalone 2D and 3D spectral solves inspect original and constrained stiffness for
  NUM-INVARIANCE. Modal → spectral → certification tests cover affected models and
  well-conditioned controls.
- Prepared 2D solves cache rotational restraint and model findings. Per-load mechanism
  checks inspect nodal moment demands against that cache. The diagnostic sweep test took
  0.99 ms for 1,000 members/positions and 11.38 ms for 10,000 in the debug run.
- BU-ACCURACY warns on all plain 3D buckling outputs, including ordinary certification
  fallbacks. The real #741/#818 fixture retains factor 4691.397553909858 and refuses its
  contradictory certificate with BU-BOUND. Native and WASM regressions cover this model.
- Time-history warnings remain visible in both viewport dispositions.
- The audit runs on pull requests, the merge queue and a daily schedule as a visible but non-required
  check. It is deliberately not a deploy dependency: it calls the GitHub API, and a deploy (an urgent
  safety fix included) must never wait on it. That historical audit included #818; it predates #846.
- The EOF whitespace defect is removed; read-only diff checks against both HEAD and
  origin/main pass.

Validation used CARGO_TARGET_DIR=/tmp/stabileo-containment-target and a separate
temporary Nix cache. Debug lib/certificates/robustness/solver targets passed
579/149/243/208 tests (12 existing ignored); the final focused containment run passed
24 tests, including the two additional scaling and 3D spectral regressions.
Release validation passed all 4,763 tests. Web unit tests passed 15,619 tests
(14 existing skipped), and the results suite passed all 41 tests. No snapshots or
numerical baselines were changed during this follow-up. WASM build, changelog check,
results snapshot provenance gate, TypeScript/Svelte gates, and three audit unit tests
passed. TypeScript retained its 247-error baseline with no new errors.


### Conditioning diagnostic cost

Measured on arm64 macOS, release profile, using
`CARGO_TARGET_DIR=/tmp/stabileo-containment-target nix develop -c cargo test -p dedaliano-engine --release --test robustness conditioning_cost_large_frame -- --ignored --nocapture`.
The deterministic model is a 50-bay, 40-storey plane frame (6,120 free DOFs,
26,196 lower-triangle stiffness entries). For 100 checks, standalone
symbolic/numeric factorization plus inspection took 5.231 s (52.31 ms/check);
inspection of an existing factor took 5.820 ms (0.0582 ms/check).
This measures diagnostic overhead, not an end-to-end browser solve.

The standalone check holds 1,901,288 bytes of numeric factor values and
2,828,424 bytes of symbolic arrays, plus factorization workspace. Reusing
the factor requires only a 48,960-byte diagonal scratch vector at peak.
These are measured array payload sizes on the native 64-bit target, not
process peak RSS or a WASM heap measurement. A dense standalone check also
allocates an additional `8*n*n` bytes for its factor copy. The benchmark is
ignored in ordinary test runs and retained for repeatable cost comparisons.

## PR #807 review fixes (2026-10-30)

Earlier suite and corpus totals above are historical; this follow-up ran targeted checks only.

- #810 now carries SH-MITC4-CONVERGENCE WARN for every MITC4 model until a safe
  subset is established. Native static/cable regressions retain their numerical assertions.
- #846 was closed by merged [#852](https://github.com/lambdaclass/stabileo/pull/852)
  on 2026-10-30. Its reference compared a rigid frame to a pin-jointed truss, and its
  continuation budget ended before the truss limit. The fix changes tests/documentation
  only, not engine source; the ledger records SCOPE rather than an unjustified warning.
- The public buckling matrix helper omitted affected solid-shell stresses while #757
  was contained; after the #814 fix that omission and the static refusal are removed.
  The vertical-shell regression now checks that the static solve, the helper, spectral
  analysis and kinematic solvability all return solid-shell results.
- Advanced reruns retire panel/store/report state; P-Delta retains nested diagnostics.
  Table, CSV, XLSX, workbook and report boundaries carry localized containment.
  Refusal keeps the modelling viewport mounted and suppresses numerical overlays.
- Advanced controls have 44px minimum targets through 810px and 12px minimum text;
  labels wrap and wide result tables scroll within their container. Source/compiler
  checks cover the controls; rendered 390/810px overflow was not checked (no Playwright).

Targeted results: native known_issues unit tests 5/5, MITC4 multi-path regression 1/1,
rotated solid-shell regression 1/1; touched web Vitest files 48/48 across focused runs (the final two-file
rerun passed 23/23 and the report entry-point rerun passed 4/4); checker and CI-filter tests 6/6. TypeScript retains its 247-error
baseline with zero new errors. Svelte reports 342 errors (down from 343 before this
follow-up); changed components introduce no new errors. Changelog validation and read-only diff whitespace
checks pass. The live GitHub containment audit passes after the #846 ledger correction.
No numerical tolerances, numerical baselines or existing tests were removed or weakened;
no full suites, Playwright, git writes or WASM rebuild were run.
