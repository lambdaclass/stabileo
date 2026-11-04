//! Checks written while documenting the frame family (docs/solver/frames.md).
//! Each test pins a convention or a formula that the document states, or a
//! discrepancy it records (FR-n).

use crate::common;
use common::*;
use dedaliano_engine::postprocess::beam_stations::{extract_beam_stations, BeamMemberInfo, BeamStationInput, LabeledResults};
use dedaliano_engine::postprocess::diagrams::compute_diagram_value_at;
use dedaliano_engine::postprocess::diagrams_3d::evaluate_diagram_3d_at;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::types::*;

fn udl3(id: usize, qy: f64, qz: f64) -> SolverLoad3D {
    SolverLoad3D::Distributed(SolverDistributedLoad3D {
        q_xi: 0.0, q_xj: 0.0, element_id: id, q_yi: qy, q_yj: qy, q_zi: qz, q_zj: qz, a: None, b: None,
    })
}

/// frames.md §7.3. Simply supported span L = 6 along +X, q = −10 (downward,
/// local −y in 2D; local −y and −z in 3D). |M(L/2)| = qL²/8 = 45.
/// - 2D M: positive = hogging (tension on local +y), so the sagging midspan is −45.
/// - 3D My: +45 (tension on local −z); 3D Mz: −45 (tension on local −y).
/// - Shear at node I equals the support reaction (+30) in every plane.
#[test]
fn moment_and_shear_signs_2d_and_3d() {
    let inp = make_ss_beam_udl(2, 6.0, 200_000.0, 0.01, 1e-4, -10.0);
    let r = solve_2d(&inp).unwrap();
    let ef = r.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!((compute_diagram_value_at("moment", 1.0, ef) + 45.0).abs() < 1e-9);
    assert!((ef.v_start - 30.0).abs() < 1e-9);

    let pinned = vec![true, true, true, true, false, false];
    let roller = vec![false, true, true, false, false, false];
    let inp3 = make_3d_beam(2, 6.0, 200_000.0, 0.3, 0.01, 1e-4, 1e-4, 1e-4, pinned, Some(roller),
        vec![udl3(1, -10.0, -10.0), udl3(2, -10.0, -10.0)]);
    let r3 = solve_3d(&inp3).unwrap();
    let ef3 = r3.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!((evaluate_diagram_3d_at(ef3, "momentY", 1.0) - 45.0).abs() < 1e-9);
    assert!((evaluate_diagram_3d_at(ef3, "momentZ", 1.0) + 45.0).abs() < 1e-9);
    assert!((ef3.vy_start - 30.0).abs() < 1e-9 && (ef3.vz_start - 30.0).abs() < 1e-9);
}

/// frames.md §7.1: torsion follows the same "resultant on the negative face"
/// convention as V and M, so a tip torque +T on a cantilever reports Mx = −T.
#[test]
fn torsion_sign_is_negative_face_resultant() {
    let inp = make_3d_beam(2, 3.0, 200_000.0, 0.3, 0.01, 1e-4, 1e-4, 1e-4, vec![true; 6], None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 3, fx: 0.0, fy: 0.0, fz: 0.0, mx: 1.0, my: 0.0, mz: 0.0, bw: None })]);
    let r = solve_3d(&inp).unwrap();
    for ef in &r.element_forces {
        assert!((ef.mx_start + 1.0).abs() < 1e-9 && (ef.mx_end + 1.0).abs() < 1e-9, "{ef:?}");
    }
}

/// FR-2 (fixed): the 2D beam-station output declared "positive = sagging"
/// while its values are hogging-positive (the midspan of a gravity-loaded
/// simple span is negative). The declared convention now matches the values.
#[test]
fn beam_station_sign_convention_matches_values() {
    let inp = make_ss_beam_udl(1, 6.0, 200_000.0, 0.01, 1e-4, -10.0);
    let results = solve_2d(&inp).unwrap();
    let out = extract_beam_stations(&BeamStationInput {
        members: vec![BeamMemberInfo { element_id: 1, section_id: 1, material_id: 1, length: 6.0, label: None }],
        combinations: vec![LabeledResults { combo_id: 1, combo_name: None, results }],
        num_stations: Some(3),
    });
    let mid = out.stations.iter().find(|s| s.station_index == 1).unwrap();
    let m = mid.combo_forces[0].m;
    assert!((m + 45.0).abs() < 1e-9, "midspan M = {m}");
    let conv = &out.sign_convention.moment;
    assert!(conv.contains("hogging") && !conv.contains("sagging"), "declared: {conv}");
}

/// frames.md §5: the bimoment recovered from the 14-DOF element converges to
/// Vlasov's |B(0)| = (T/k)·tanh(kL) for a cantilever with warping fixed at the
/// root and free at the tip; the support's bimoment reaction balances it.
/// (No test checked the recovered bimoment before.)
#[test]
fn warping_bimoment_matches_vlasov() {
    let (e, nu, a, iy, iz, j, cw): (f64, f64, f64, f64, f64, f64, f64) =
        (200_000.0, 0.3, 7.61e-3, 18.4e-6, 128.0e-6, 0.5e-6, 300.0e-9);
    let (l, torque) = (3.0, 1.0);
    let ee = e * 1000.0;
    let g = ee / (2.0 * (1.0 + nu));
    let k = (g * j / (ee * cw)).sqrt();
    let exact = torque / k * (k * l).tanh();
    for (n, tol) in [(4usize, 1e-3), (16, 1e-5)] {
        let mut inp = make_3d_beam(n, l, e, nu, a, iy, iz, j, vec![true; 6], None,
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0, mx: torque, my: 0.0, mz: 0.0, bw: None })]);
        for s in inp.sections.values_mut() { s.cw = Some(cw); }
        for s in inp.supports.values_mut() { s.rw = Some(true); }
        let r = solve_3d(&inp).unwrap();
        let b0 = r.element_forces.iter().find(|e| e.element_id == 1).unwrap().bimoment_start.unwrap();
        let bl = r.element_forces.iter().find(|e| e.element_id == n).unwrap().bimoment_end.unwrap();
        let reac = r.reactions.iter().find(|x| x.node_id == 1).unwrap().bimoment.unwrap();
        assert!((b0.abs() - exact).abs() < tol * exact, "n={n}: B(0) = {b0}, Vlasov {exact}");
        assert!(bl.abs() < 1e-9 * exact, "free-warping tip: B(L) = {bl}");
        assert!((reac + b0).abs() < 1e-9 * exact, "reaction {reac} vs B(0) {b0}");
    }
}

/// FR-1 (fixed by refusal): `leftHand: true` reversed ey, making the member
/// triad improper while the kernels assume θz = v', θy = −w'. The stiffness
/// then depended on the labelling of an axis: this skew cantilever's tip twist
/// changed sign and its deflection moved 2% between leftHand false and true.
/// No product path sends `leftHand: true`; the engine now refuses it.
#[test]
fn left_handed_axes_are_refused() {
    let mk = |lh: Option<bool>| {
        let mut inp = make_3d_input(
            vec![(1, 0.0, 0.0, 0.0), (2, 3.0, 1.0, 2.0), (3, 5.0, 3.0, 2.5)],
            vec![(1, 200_000.0, 0.3)],
            vec![(1, 0.01, 2e-5, 8e-5, 1e-5)],
            vec![(1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1)],
            vec![(1, vec![true; 6])],
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 3, fx: 1.0, fy: -2.0, fz: -5.0, mx: 0.3, my: 0.7, mz: -0.4, bw: None })],
        );
        inp.left_hand = lh;
        solve_3d(&inp)
    };
    let a = mk(None).unwrap();
    let b = mk(Some(false)).unwrap();
    let (da, db) = (&a.displacements, &b.displacements);
    for (x, y) in da.iter().zip(db) {
        assert_eq!((x.ux, x.uz, x.rx), (y.ux, y.uz, y.rx));
    }
    let err = mk(Some(true)).unwrap_err();
    assert!(err.contains("leftHand"), "{err}");
}
