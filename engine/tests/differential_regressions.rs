//! Regressions found by differential testing against Frame3DD, PyNite,
//! Mystran, Kratos and CalculiX (tools/differential/). Each case is the
//! shrunk model the harness dumped, checked against a closed form or a
//! property every reference program agrees on.

use dedaliano_engine::solver::linear::solve_3d;
use dedaliano_engine::solver::modal::solve_modal_3d;
use dedaliano_engine::types::{DiagnosticCode, SolverInput3D};
use serde_json::json;
use std::collections::HashMap;

fn input_3d(v: serde_json::Value) -> SolverInput3D {
    serde_json::from_value(v).unwrap()
}

fn warns_singular(input: &SolverInput3D) -> bool {
    match solve_3d(input) {
        Err(_) => true, // refusing to solve is also a correct answer
        Ok(res) => res
            .structured_diagnostics
            .iter()
            .any(|d| d.code == DiagnosticCode::StiffnessNotPositiveDefinite),
    }
}

/// A member hinged (My released) at the tip of a skew member and free at its
/// other end spins about the hinge: the stiffness is singular (scaled
/// condition number 9e16 in PyNite and OpenSees). Rounding left the
/// mechanism's Cholesky pivot at ~1e-14 of its diagonal, above the 64 eps
/// singularity threshold, so stabileo solved it with no warning and returned
/// arbitrary displacements (found by tools/differential, PyNite, rich3d-184).
/// The threshold is now 1e-10 (engine/src/solver/definiteness.rs).
#[test]
fn dangling_hinged_member_is_flagged_singular() {
    let input = input_3d(json!({
        "nodes": {"2": {"id": 2, "x": 2.702, "y": 7.419, "z": 6.804},
                  "3": {"id": 3, "x": 4.262, "y": 1.662, "z": 3.603},
                  "4": {"id": 4, "x": 1.046, "y": 2.241, "z": 1.38}},
        "materials": {"2": {"id": 2, "e": 30000.0, "nu": 0.15266999300297987}},
        "sections": {"2": {"id": 2, "a": 0.12183545760538358, "iy": 0.0025300424619031973,
                           "iz": 0.0006047898489029847, "j": 0.0018375321524981133},
                     "3": {"id": 3, "a": 0.3560112246033974, "iy": 0.017583013735482916,
                           "iz": 0.006344522712223157, "j": 0.021401535363011273}},
        "elements": {"2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 2,
                           "sectionId": 3, "rollAngle": -170.94014954363033},
                     "4": {"id": 4, "type": "frame", "nodeI": 4, "nodeJ": 3, "materialId": 2,
                           "sectionId": 2, "rollAngle": -116.35070278367762, "releaseMyEnd": true}},
        "supports": {"2": {"nodeId": 2, "rx": false, "ry": true, "rz": false, "rrx": true,
                           "rry": false, "rrz": true, "kx": 991035.6463398683,
                           "kz": 935700.4969410569, "kry": 415157.6074546659}},
        "loads": [{"type": "nodal", "data": {"nodeId": 3, "fx": 10.0, "fy": -5.0, "fz": 3.0,
                                             "mx": 0.0, "my": 0.0, "mz": 0.0}}]
    }));
    assert!(warns_singular(&input), "singular stiffness solved without a warning");
}

fn rigid_body_warning(input: &SolverInput3D) -> bool {
    solve_3d(input).unwrap().structured_diagnostics.iter().any(|d| {
        d.code == DiagnosticCode::StiffnessNotPositiveDefinite && d.message.contains("rigid-body motion")
    })
}

/// A plate restrained out of plane along its edges with one corner pinned
/// turns freely in its own plane, yet rounding leaves that rigid rotation's
/// Cholesky pivot well above any round-off threshold (1.3e-10 of its diagonal
/// on a 3×3 mesh, 3.4e-8 on 10×10), while regular models with stiff springs
/// reach 9e-9: no pivot threshold separates them (found auditing the pivot
/// threshold against the engine's own test models). The pre-solve
/// rigid-body gate is exact: it must flag the free rotation, and not flag the
/// plate once a second corner holds it in plane.
#[test]
fn plate_free_to_turn_in_its_plane_is_flagged() {
    let mut nodes = serde_json::Map::new();
    let mut id = 0;
    for j in 0..3 {
        for i in 0..3 {
            id += 1;
            nodes.insert(id.to_string(), json!({"id": id, "x": i as f64, "y": j as f64, "z": 0.0}));
        }
    }
    let mut quads = serde_json::Map::new();
    let mut q = 0;
    for j in 0..2 {
        for i in 0..2 {
            q += 1;
            let n = |a: usize, b: usize| 1 + a + 3 * b;
            quads.insert(q.to_string(), json!({"id": q, "nodes": [n(i, j), n(i + 1, j), n(i + 1, j + 1), n(i, j + 1)],
                                               "materialId": 1, "thickness": 0.1}));
        }
    }
    let support = |n: usize, full: bool| json!({"nodeId": n, "rx": full, "ry": full, "rz": true,
                                                "rrx": false, "rry": false, "rrz": false});
    let mut supports = serde_json::Map::new();
    for n in [1, 2, 3, 4, 6, 7, 8, 9] {
        supports.insert(n.to_string(), support(n, n == 1));
    }
    let model = |supports: serde_json::Map<String, serde_json::Value>| input_3d(json!({
        "nodes": nodes.clone(), "materials": {"1": {"id": 1, "e": 30000.0, "nu": 0.2}}, "sections": {},
        "elements": {}, "supports": supports, "quads": quads.clone(),
        "loads": [{"type": "nodal", "data": {"nodeId": 5, "fx": 0.0, "fy": 0.0, "fz": -10.0,
                                             "mx": 0.0, "my": 0.0, "mz": 0.0}}]
    }));
    assert!(rigid_body_warning(&model(supports.clone())), "free in-plane rotation not flagged");
    // A second corner restrained along y holds the plate in its plane.
    supports.insert("3".into(), json!({"nodeId": 3, "rx": false, "ry": true, "rz": true,
                                       "rrx": false, "rry": false, "rrz": false}));
    assert!(!rigid_body_warning(&model(supports)), "plate held in plane flagged");
}

/// A beam pinned at both ends (no rotational restraint) spins about its own
/// axis: flagged. With the torsion held at one end it is not.
#[test]
fn beam_free_to_spin_about_its_supports_is_flagged() {
    let beam = |rrx: bool| input_3d(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "y": 0.0, "z": 0.0},
                  "3": {"id": 3, "x": 6.0, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 2e-5, "iz": 1e-5, "j": 5e-6}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
                     "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": rrx, "rry": false, "rrz": false},
                     "2": {"nodeId": 3, "rx": false, "ry": true, "rz": true, "rrx": false, "rry": false, "rrz": false}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fy": 1.0, "fz": -10.0,
                                             "mx": 0.0, "my": 0.0, "mz": 0.0}}]
    }));
    assert!(warns_singular(&beam(false)));
    assert!(!rigid_body_warning(&beam(true)), "beam with torsion held flagged");
}

/// Members with a released rotation get a lumped mass (no rotary inertia),
/// so a small model whose members all have a release has massless rotations:
/// M is singular and the dense eigen path (Cholesky of M) failed with
/// "Eigenvalue decomposition failed" (found by tools/differential, MYSTRAN,
/// modal3d_lumped). Fixed-fixed beam of two members meeting at node 2, the
/// first released about y there, the second about z: lumped mass ρAL at node
/// 2, vertical stiffness 3EIy/L³ from each member (the first pinned at node
/// 2, the second fixed-free in rotation since node 2's θy is massless and
/// condensed), so ω² = 6EIy/(L³ ρAL); likewise 6EIz/(L³ ρAL) sideways.
#[test]
fn modal_with_massless_rotations_solves() {
    let (l, e, a, iy, iz, rho) = (3.0, 200000.0, 0.01, 2e-5, 1e-5, 7850.0);
    let input = input_3d(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": l, "y": 0.0, "z": 0.0},
                  "3": {"id": 3, "x": 2.0 * l, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": e, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": a, "iy": iy, "iz": iz, "j": 5e-6}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1,
                           "releaseMyEnd": true},
                     "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1,
                           "releaseMzStart": true}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true},
                     "2": {"nodeId": 3, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": []
    }));
    let dens: HashMap<String, f64> = [("1".to_string(), rho)].into();
    let res = solve_modal_3d(&input, &dens, 3).expect("modal with massless rotations");
    let m = rho / 1000.0 * a * l;
    let w2 = |i: f64| 6.0 * e * 1000.0 * i / (l * l * l * m);
    let mut got: Vec<f64> = res.modes.iter().map(|md| md.omega * md.omega).collect();
    got.sort_by(f64::total_cmp);
    let mut want = vec![w2(iy), w2(iz), 2.0 * e * 1000.0 * a / l / m];
    want.sort_by(f64::total_cmp);
    for (g, w) in got.iter().zip(&want) {
        assert!((g - w).abs() <= 1e-9 * w, "omega^2 {got:?} vs {want:?}");
    }
}

/// Two rotational restraints at a node whose only member releases My there:
/// neither restraint alone acts on the structure (the node turns freely about
/// the member's local y), but together they do, through the combination
/// that axis cannot absorb. The first version of the rigid-body gate counted
/// restraints one at a time and flagged this regular model (PyNite κ = 4e4;
/// found by tools/differential, PyNite, rich3d_eb-557).
#[test]
fn rotational_restraints_combine_through_a_released_end() {
    let input = input_3d(serde_json::from_str(r#"{"nodes": {"1": {"id": 1, "x": 4.037, "y": 5.431, "z": 7.051}, "2": {"id": 2, "x": 6.757, "y": 5.106, "z": 3.241}, "3": {"id": 3, "x": 4.754, "y": 6.128, "z": 1.412}}, "materials": {"1": {"id": 1, "e": 15187.112505507092, "nu": 0.1774214968032978}, "2": {"id": 2, "e": 200000.0, "nu": 0.26224332909049797}}, "sections": {"1": {"id": 1, "a": 0.12948526732991544, "iy": 0.0019544357604186365, "iz": 0.0009988437087988238, "j": 0.002900179903104928}, "2": {"id": 2, "a": 0.04858193393768227, "iy": 0.00037968693107250643, "iz": 0.00010188518900655119, "j": 0.0003587968197734484}, "3": {"id": 3, "a": 0.20881961557909248, "iy": 0.00992746133894461, "iz": 0.0013301005442339848, "j": 0.004440487819632662}}, "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 3, "releaseMyStart": true}, "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 2, "sectionId": 2}}, "supports": {"1": {"nodeId": 1, "rx": true, "ry": false, "rz": true, "rrx": true, "rry": true, "rrz": false}, "2": {"nodeId": 3, "rx": false, "ry": true, "rz": false, "rrx": true, "rry": false, "rrz": true}}, "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 1.0, "fy": 2.0, "fz": -3.0, "mx": 0.0, "my": 0.0, "mz": 0.0}}]}"#).unwrap());
    assert!(!rigid_body_warning(&input), "regular model flagged");
    assert!(!warns_singular(&input));
}
