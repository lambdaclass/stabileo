//! What the end-to-end certificate says about models where the engine's
//! answer is not the model's (docs/verification/CERTIFY.md, "End-to-end
//! certificates", findings). Each test pins the current behaviour.

use dedaliano_engine::certify::reassembly::EndToEnd;
use dedaliano_engine::certify::{certify_linear_2d_full, certify_linear_3d_full};
use dedaliano_engine::types::*;

fn input_3d(json: &str) -> SolverInput3D {
    serde_json::from_str(json).unwrap()
}

/// Two columns fixed at the base, tops tied by a constraint in the vertical
/// XZ plane; a horizontal load at the slave top.
fn xz_pair(constraint: &str) -> SolverInput3D {
    input_3d(&format!(
        r#"{{
      "nodes": {{"1": {{"id":1,"x":0,"y":0,"z":0}}, "2": {{"id":2,"x":0,"y":0,"z":3}},
                 "3": {{"id":3,"x":4,"y":0,"z":0}}, "4": {{"id":4,"x":4,"y":0,"z":3}}}},
      "materials": {{"1": {{"id":1,"e":200000,"nu":0.3}}}},
      "sections": {{"1": {{"id":1,"a":0.01,"iy":0.0001,"iz":0.0001,"j":0.00005}}}},
      "elements": {{
        "1": {{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
        "2": {{"id":2,"type":"frame","nodeI":3,"nodeJ":4,"materialId":1,"sectionId":1}}
      }},
      "supports": {{
        "1": {{"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}},
        "2": {{"nodeId":3,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}}
      }},
      "loads": [{{"type":"nodal","data":{{"nodeId":4,"fx":10,"fy":0,"fz":-5,"mx":0,"my":0,"mz":0}}}}],
      "constraints": [{constraint}]
    }}"#
    ))
}

/// A diaphragm in the XZ plane ties the slave's (ux, uz) to the master's
/// translation and its rotation θy, and the slave's θy to the master's.
/// The engine used to write the rotation with the wrong sign (u_x,m − Δz·θy,
/// u_z,m + Δx·θy) and the end-to-end check rejected its result; since #342 it
/// follows ω × r, and the diaphragm agrees end to end with the same tie
/// written as a rigid link.
#[test]
fn diaphragm_xz_rotation_sign() {
    for c in [
        r#"{"type":"diaphragm","masterNode":2,"slaveNodes":[4],"plane":"XZ"}"#,
        r#"{"type":"rigidLink","masterNode":2,"slaveNode":4,"dofs":[0,2,4]}"#,
    ] {
        let out = certify_linear_3d_full(&xz_pair(c)).unwrap();
        assert!(out.certificate.is_certified());
        match &out.end_to_end {
            EndToEnd::Certified { rel_bound, .. } => assert!(*rel_bound < 1e-6, "{c}: {rel_bound}"),
            other => panic!("{c}: {other:?}"),
        }
    }
}

fn input_2d(json: &str) -> SolverInput {
    serde_json::from_str(json).unwrap()
}

/// A nodal moment on a node where every member is hinged: nothing resists it,
/// so the model has no solution. The 2D engine used to hold such a rotation
/// with an artificial spring, and the assembled-level certificate certified
/// the regularised system while the end-to-end check said the model has no
/// solution; the engine now refuses the load before the solve.
#[test]
fn moment_on_fully_hinged_node_2d() {
    let input = input_2d(
        r#"{
      "nodes": {"1": {"id":1,"x":0,"z":0}, "2": {"id":2,"x":1,"z":0}, "3": {"id":3,"x":2,"z":0}},
      "materials": {"1": {"id":1,"e":200000,"nu":0.3}},
      "sections": {"1": {"id":1,"a":1.0,"iz":1.0}},
      "elements": {
        "1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"hingeEnd":true},
        "2": {"id":2,"type":"frame","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":1,"hingeStart":true}
      },
      "supports": {"1": {"id":1,"nodeId":1,"type":"fixed"}, "2": {"id":2,"nodeId":3,"type":"fixed"}},
      "loads": [{"type":"nodal","data":{"nodeId":2,"fx":0,"fz":-10,"my":5}}]
    }"#,
    );
    let e = certify_linear_2d_full(&input).err().expect("refused");
    assert!(e.contains("Nodal moment at node 2 is not supported"), "{e}");
    // Without the moment the same model is certified end to end, the
    // hinged rotation excluded from the bound.
    let mut no_moment = input.clone();
    no_moment.loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 })];
    let out = certify_linear_2d_full(&no_moment).unwrap();
    match &out.end_to_end {
        EndToEnd::Certified { excluded_dofs, .. } => {
            assert_eq!(excluded_dofs.len(), 1);
            assert_eq!((excluded_dofs[0].node_id, excluded_dofs[0].dof), (2, 2));
        }
        other => panic!("{other:?}"),
    }
}

fn linked_to_a_hinged_column(constraint: &str, member: &str, slave_support: &str) -> SolverInput {
    input_2d(&format!(
        r#"{{
      "nodes": {{"1": {{"id":1,"x":0,"z":0}}, "2": {{"id":2,"x":0,"z":3}}, "3": {{"id":3,"x":2,"z":3}}}},
      "materials": {{"1": {{"id":1,"e":200000,"nu":0.3}}}},
      "sections": {{"1": {{"id":1,"a":0.01,"iz":0.0001}}}},
      "elements": {{
        "1": {{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"hingeEnd":true}},
        "2": {{"id":2,"type":"{member}","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":1}}
      }},
      "supports": {{"1": {{"id":1,"nodeId":1,"type":"fixed"}}{slave_support}}},
      "loads": [{{"type":"nodal","data":{{"nodeId":3,"fx":0,"fz":-10,"my":0}}}}],
      "constraints": [{constraint}]
    }}"#
    ))
}

const TIES_ROTATION: [&str; 3] = [
    r#"{"type":"rigidLink","masterNode":2,"slaveNode":3,"dofs":[]}"#,
    r#"{"type":"rigidLink","masterNode":2,"slaveNode":3,"dofs":[0,1,2]}"#,
    r#"{"type":"diaphragm","masterNode":2,"slaveNodes":[3]}"#,
];

fn every_2d_path(input: &SolverInput) -> Vec<(&'static str, Result<AnalysisResults, String>)> {
    use dedaliano_engine::solver::constraints::{solve_constrained_2d, solve_constrained_2d_dense, ConstrainedInput};
    use dedaliano_engine::solver::dof::DofNumbering;
    use dedaliano_engine::solver::linear::solve_2d;
    let ci = ConstrainedInput { solver: input.clone(), constraints: input.constraints.clone() };
    vec![
        ("solve_2d", solve_2d(input)),
        ("constrained", solve_constrained_2d(&ci)),
        ("constrained dense", solve_constrained_2d_dense(&ci, &DofNumbering::build_2d(input))),
        ("certify", certify_linear_2d_full(input).map(|o| o.results)),
    ]
}

/// A rigid link or diaphragm from a node where its only member is hinged, to a truss end: the
/// linked pair rotates about the hinge freely, so the model is a mechanism (#458) and every 2D
/// path must refuse it.
#[test]
fn rigid_link_hides_a_mechanism_2d() {
    for c in TIES_ROTATION {
        let input = linked_to_a_hinged_column(c, "truss", "");
        for (path, r) in every_2d_path(&input) {
            assert!(r.is_err(), "{c} {path}: solved a mechanism: {:?}", r.map(|r| r.displacements));
        }
    }
}

/// The same links with a roller under the slave, which holds the pair's rotation about the hinge,
/// and a horizontal load on the slave: the pair moves as the column's tip, P·L³/(3EI) =
/// 10·3³/(3·2e8·1e-4) = 4.5 mm, on every path.
#[test]
fn a_held_linked_pair_still_solves_2d() {
    for c in TIES_ROTATION {
        for member in ["truss", "frame"] {
            let support = r#","2": {"id":2,"nodeId":3,"type":"rollerX"}"#;
            let mut input = linked_to_a_hinged_column(c, member, support);
            input.loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 10.0, fz: 0.0, my: 0.0 })];
            for (path, r) in every_2d_path(&input) {
                let r = r.unwrap_or_else(|e| panic!("{c} {member} {path}: {e}"));
                let ux = r.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
                assert!((ux - 4.5e-3).abs() < 1e-9, "{c} {member} {path}: {ux}");
            }
        }
    }
}

/// A cantilever of `segments` frame elements from node 1 (fixed) to node 2 at x = 4, its last end
/// hinged when `hinged`; nodes 3, 4, … at node 2's position, chained to it by zero-length
/// connectors `chain` (kMoment of each, kAxial = kShear = 1e9); a nodal moment of 1 at `loaded`.
fn connector_chain(segments: usize, hinged: bool, chain: &[f64], loaded: usize, extra_supports: &str) -> SolverInput {
    let tip = 2;
    let mut nodes = vec![r#""1": {"id":1,"x":0,"z":0}"#.to_string(), r#""2": {"id":2,"x":4,"z":0}"#.to_string()];
    for k in 0..chain.len() {
        let id = 3 + k;
        nodes.push(format!(r#""{id}": {{"id":{id},"x":4,"z":0}}"#));
    }
    let first_inner = 3 + chain.len();
    for s in 1..segments {
        let id = first_inner + s - 1;
        nodes.push(format!(r#""{id}": {{"id":{id},"x":{},"z":0}}"#, 4.0 * s as f64 / segments as f64));
    }
    let node_at = |s: usize| if s == 0 { 1 } else if s == segments { tip } else { first_inner + s - 1 };
    let elements: Vec<String> = (0..segments)
        .map(|s| {
            let hinge = if hinged && s + 1 == segments { r#","hingeEnd":true"# } else { "" };
            format!(
                r#""{id}": {{"id":{id},"type":"frame","nodeI":{},"nodeJ":{},"materialId":1,"sectionId":1{hinge}}}"#,
                node_at(s),
                node_at(s + 1),
                id = s + 1
            )
        })
        .collect();
    let connectors: Vec<String> = chain
        .iter()
        .enumerate()
        .map(|(k, km)| {
            let id = k + 1;
            format!(
                r#""{id}": {{"id":{id},"nodeI":{},"nodeJ":{},"kAxial":1e9,"kShear":1e9,"kMoment":{km}}}"#,
                2 + k,
                3 + k
            )
        })
        .collect();
    input_2d(&format!(
        r#"{{
      "nodes": {{{}}},
      "materials": {{"1": {{"id":1,"e":200000,"nu":0.3}}}},
      "sections": {{"1": {{"id":1,"a":0.045,"iz":3.375e-4}}}},
      "elements": {{{}}},
      "supports": {{"1": {{"id":1,"nodeId":1,"type":"fixed"}}{extra_supports}}},
      "loads": [{{"type":"nodal","data":{{"nodeId":{loaded},"fx":0,"fz":0,"my":1.0}}}}],
      "connectors": {{{}}}
    }}"#,
        nodes.join(","),
        elements.join(","),
        connectors.join(",")
    ))
}

fn every_2d_path_with_prepared(input: &SolverInput) -> Vec<(&'static str, Result<AnalysisResults, String>)> {
    use dedaliano_engine::solver::linear::{prepare_static_2d, prepare_static_2d_dense_reference};
    let mut paths = every_2d_path(input);
    paths.push(("prepared", prepare_static_2d(input).and_then(|p| p.solve_loads(&input.loads))));
    paths.push(("prepared dense", prepare_static_2d_dense_reference(input).and_then(|p| p.solve_loads(&input.loads))));
    paths
}

/// A hinged cantilever tip tied by zero-length connectors to coincident nodes, a moment on the
/// chain and nothing restraining its rotation against ground: the chain spins about the hinge, a
/// mechanism (#1414). The 2D assembler held the hinged tip's rotation with its artificial spring,
/// which the connector's moment spring turned into a real spring on the chain, and every path
/// returned a rotation of about 10 rad. With 25 segments the free DOFs pass 64 and the sparse
/// assembly is used.
#[test]
fn connector_hides_a_mechanism_2d() {
    let cases: [(&[f64], usize); 6] = [
        (&[1e9], 3),
        (&[0.0], 3),
        (&[1e9, 1e9], 4),
        (&[1e9, 1e9], 3),
        (&[1e9, 0.0], 3),
        (&[0.0, 1e9], 4),
    ];
    for segments in [1, 25] {
        for (chain, loaded) in cases {
            let input = connector_chain(segments, true, chain, loaded, "");
            for (path, r) in every_2d_path_with_prepared(&input) {
                assert!(
                    r.is_err(),
                    "{segments} segments, chain {chain:?}, moment at {loaded}, {path}: solved a mechanism: {:?}",
                    r.map(|r| r.displacements.iter().map(|d| (d.node_id, d.ry)).collect::<Vec<_>>())
                );
            }
        }
    }
}

fn assert_rotations(input: &SolverInput, what: &str, expected: &[(usize, f64)]) {
    for (path, r) in every_2d_path_with_prepared(input) {
        let r = r.unwrap_or_else(|e| panic!("{what} {path}: {e}"));
        for &(node, ry) in expected {
            let got = r.displacements.iter().find(|d| d.node_id == node).unwrap().ry;
            assert!((got - ry).abs() <= 1e-9 * ry.abs(), "{what} {path}: node {node} ry {got}, expected {ry}");
        }
    }
}

/// The same chains with the rotation held: by a rotational spring support under node 3
/// (θ = M/k = 1/1000), by an unhinged cantilever (θ₂ = ML/EI = 4/(2e8·3.375e-4), θ₃ = θ₂ + M/kMoment),
/// or by a fixed support at the end of a two-connector chain (θ₃ = M/kMoment, the hinged tip
/// turning with it). Every path solves and agrees with the hand values.
#[test]
fn a_held_connector_chain_still_solves_2d() {
    let theta_tip = 4.0 / (2e8 * 3.375e-4);
    for segments in [1, 25] {
        let spring = r#","2": {"id":2,"nodeId":3,"type":"spring","kz":1000}"#;
        let input = connector_chain(segments, true, &[1e9], 3, spring);
        assert_rotations(&input, "spring under node 3", &[(2, 1e-3), (3, 1e-3)]);

        let input = connector_chain(segments, false, &[1e9], 3, "");
        assert_rotations(&input, "unhinged tip", &[(2, theta_tip), (3, theta_tip + 1e-9)]);

        let fixed = r#","2": {"id":2,"nodeId":4,"type":"fixed"}"#;
        let input = connector_chain(segments, true, &[1e9, 1e9], 3, fixed);
        assert_rotations(&input, "chain to a fixed node", &[(2, 1e-9), (3, 1e-9)]);
    }
}

/// Two spans hinged at their common node 2 (its rotation held by nothing),
/// with nodal moments `m2` on node 2 and, through an equal-DOF tie of
/// rotations 2 ↔ 4 (node 4 hinged the same way), `m4` on node 4.
fn hinged_moments(m2: f64, m4: Option<f64>) -> SolverInput {
    let mut json = String::from(
        r#"{
      "nodes": {"1": {"id":1,"x":0,"z":0}, "2": {"id":2,"x":1,"z":0}, "3": {"id":3,"x":2,"z":0},
                "4": {"id":4,"x":1,"z":2}, "5": {"id":5,"x":0,"z":2}, "6": {"id":6,"x":2,"z":2}},
      "materials": {"1": {"id":1,"e":200000,"nu":0.3}},
      "sections": {"1": {"id":1,"a":1.0,"iz":1.0}},
      "elements": {
        "1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"hingeEnd":true},
        "2": {"id":2,"type":"frame","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":1,"hingeStart":true},
        "3": {"id":3,"type":"frame","nodeI":5,"nodeJ":4,"materialId":1,"sectionId":1,"hingeEnd":true},
        "4": {"id":4,"type":"frame","nodeI":4,"nodeJ":6,"materialId":1,"sectionId":1,"hingeStart":true}
      },
      "supports": {"1": {"id":1,"nodeId":1,"type":"fixed"}, "2": {"id":2,"nodeId":3,"type":"fixed"},
                   "3": {"id":3,"nodeId":5,"type":"fixed"}, "4": {"id":4,"nodeId":6,"type":"fixed"}},
      "loads": ["#,
    );
    json += &format!(r#"{{"type":"nodal","data":{{"nodeId":2,"fx":0,"fz":-10,"my":{m2}}}}}"#);
    if let Some(m4) = m4 {
        json += &format!(r#",{{"type":"nodal","data":{{"nodeId":4,"fx":0,"fz":-10,"my":{m4}}}}}"#);
    }
    json += "]";
    if m4.is_some() {
        json += r#","constraints": [{"type":"equalDOF","masterNode":2,"slaveNode":4,"dofs":[2]}]"#;
    }
    json += "}";
    input_2d(&json)
}

/// Loads on a DOF nothing stiffens are judged by their net (reduced) load:
/// opposite moments that balance leave the model solvable and must not be
/// reported as "no solution"; equal ones must.
#[test]
fn balanced_loads_on_an_unstiffened_rotation() {
    use dedaliano_engine::certify::reassembly::end_to_end_2d;
    use dedaliano_engine::solver::linear::solve_2d;
    // The engine may refuse these models (a moment on a node no member or
    // constraint stiffens is refused even when opposite moments cancel; tied
    // unstiffened rotations are singular); a result it does return must not
    // be failed.
    let not_failed = |input: &SolverInput, what: &str| match solve_2d(input) {
        Ok(r) => {
            let e = end_to_end_2d(input, &input.loads, &r);
            assert!(!matches!(e, EndToEnd::Failed { .. }), "{what}: {e:?}");
        }
        Err(e) => eprintln!("{what}: refused: {e}"),
    };
    // +5 and −5 on the same hinged node.
    let mut same_node = hinged_moments(5.0, None);
    same_node.loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: 0.0, my: -5.0 }));
    not_failed(&same_node, "+5 and -5 on one node");
    // Two hinged rotations tied by equal-DOF, opposite moments.
    not_failed(&hinged_moments(5.0, Some(-5.0)), "tied rotations, opposite moments");
    // Genuinely inconsistent: tied rotations, moments that add up.
    let input = hinged_moments(5.0, Some(5.0));
    match solve_2d(&input) {
        Ok(r) => match end_to_end_2d(&input, &input.loads, &r) {
            EndToEnd::Failed { reason } => assert!(reason.contains("nothing stiffens"), "{reason}"),
            other => panic!("tied rotations, moments that add: {other:?}"),
        },
        Err(e) => eprintln!("the engine refuses it too: {e}"),
    }
}

/// Axial span loads (`axialDistributed`, added with #437) re-assembled
/// independently: on an inclined frame member over part of its length and on
/// a truss over all of it, the engine's `f` agrees and the result is certified
/// end to end.
#[test]
fn axial_distributed_loads_agree_end_to_end() {
    let input = input_2d(
        r#"{
      "nodes": {"1": {"id":1,"x":0,"z":0}, "2": {"id":2,"x":3,"z":2}, "3": {"id":3,"x":6,"z":0}},
      "materials": {"1": {"id":1,"e":200000,"nu":0.3}},
      "sections": {"1": {"id":1,"a":0.01,"iz":0.0001}},
      "elements": {
        "1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1},
        "2": {"id":2,"type":"frame","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":1},
        "3": {"id":3,"type":"truss","nodeI":1,"nodeJ":3,"materialId":1,"sectionId":1}
      },
      "supports": {"1": {"id":1,"nodeId":1,"type":"pinned"}, "2": {"id":2,"nodeId":3,"type":"rollerX"}},
      "loads": [
        {"type":"axialDistributed","data":{"elementId":1,"qI":-4,"qJ":-1.5,"a":0.4,"b":2.9}},
        {"type":"axialDistributed","data":{"elementId":3,"qI":2,"qJ":2}},
        {"type":"nodal","data":{"nodeId":2,"fx":0,"fz":-10,"my":0}}
      ]
    }"#,
    );
    let out = certify_linear_2d_full(&input).unwrap();
    match &out.end_to_end {
        EndToEnd::Certified { rel_bound, k_discrepancy, f_discrepancy, .. } => {
            assert!(*k_discrepancy < 1e-10 && *f_discrepancy < 1e-10, "{k_discrepancy} {f_discrepancy}");
            assert!(*rel_bound < 1e-6, "{rel_bound}");
        }
        other => panic!("{other:?}"),
    }
}
