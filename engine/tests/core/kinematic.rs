use crate::common::*;
use dedaliano_engine::types::*;
use dedaliano_engine::solver::kinematic::*;
use std::collections::HashMap;

// ==================== 2D Kinematic Tests ====================

#[test]
fn test_isostatic_ss_beam() {
    // Simply supported beam: pinned + rollerX, 1 frame element
    // Static degree = 3*1 + 3 - 3*2 = 0 → isostatic
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 0.001)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![],
    );
    let result = analyze_kinematics_2d(&input);
    assert_eq!(result.degree, 0, "SS beam should be isostatic (degree=0)");
    assert!(result.is_solvable, "SS beam should be solvable");
}

#[test]
fn test_hyperstatic_fixed_fixed_beam() {
    // Fixed-fixed beam: 6 reactions, 1 frame element
    // Static degree = 3*1 + 6 - 3*2 = 3
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 0.001)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed"), (2, 2, "fixed")],
        vec![],
    );
    let result = analyze_kinematics_2d(&input);
    assert!(result.degree > 0, "Fixed-fixed beam should be hyperstatic, got degree={}", result.degree);
    assert!(result.is_solvable, "Fixed-fixed beam should be solvable");
}

#[test]
fn test_cantilever_isostatic() {
    // Cantilever: 1 fixed support, 1 frame element
    // Static degree = 3*1 + 3 - 3*2 = 0
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 0.001)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![],
    );
    let result = analyze_kinematics_2d(&input);
    assert_eq!(result.degree, 0, "Cantilever should be isostatic");
    assert!(result.is_solvable, "Cantilever should be solvable");
}

#[test]
fn test_beam_with_both_hinges_acts_as_truss() {
    // Beam with hinges at both ends acts like a truss element
    // With pinned + roller: m+r-2n = 1+3-4 = 0 → isostatic (solvable)
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 0.001)],
        vec![(1, "frame", 1, 2, 1, 1, true, true)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![],
    );
    let result = analyze_kinematics_2d(&input);
    assert!(result.is_solvable, "Double-hinged beam with pinned+roller should be solvable");
}

#[test]
fn test_mechanism_unsupported() {
    // Beam with only one roller → insufficient support, hypostatic
    // 3*1 + 1 - 3*2 = -2
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 0.001)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "rollerX")],
        vec![],
    );
    let result = analyze_kinematics_2d(&input);
    assert!(result.degree < 0, "Under-supported beam should be hypostatic, got degree={}", result.degree);
}

#[test]
fn test_truss_isostatic() {
    // Simple triangle truss: 3 bars, pinned+roller = 3 reactions
    // Truss: m + r - 2n = 3 + 3 - 2*3 = 0
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 3.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.001, 0.0)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 1, 3, 1, 1, false, false),
            (3, "truss", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![],
    );
    let result = analyze_kinematics_2d(&input);
    assert_eq!(result.degree, 0, "Triangle truss should be isostatic");
    assert!(result.is_solvable, "Triangle truss should be solvable");
}

#[test]
fn test_portal_frame_hyperstatic() {
    // Portal frame: 2 columns + 1 beam, 2 fixed supports
    // 3*3 + 6 - 3*4 = 3
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, 4.0), (3, 6.0, 4.0), (4, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 0.001)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![],
    );
    let result = analyze_kinematics_2d(&input);
    assert_eq!(result.degree, 3, "Portal frame with 2 fixed supports should have degree=3");
    assert!(result.is_solvable, "Portal frame should be solvable");
}

// ==================== 3D Kinematic Tests ====================

fn make_3d_input(
    nodes: Vec<(usize, f64, f64, f64)>,
    mats: Vec<(usize, f64, f64)>,
    secs: Vec<(usize, f64, f64, f64, f64)>, // (id, A, Iy, Iz, J)
    elems: Vec<(usize, &str, usize, usize, usize, usize)>,
    sups: Vec<(usize, usize, bool, bool, bool, bool, bool, bool)>, // (id, node, rx, ry, rz, rrx, rry, rrz)
) -> SolverInput3D {
    let mut nodes_map = HashMap::new();
    for (id, x, y, z) in nodes {
        nodes_map.insert(id.to_string(), SolverNode3D { id, x, y, z });
    }
    let mut mats_map = HashMap::new();
    for (id, e, nu) in mats {
        mats_map.insert(id.to_string(), SolverMaterial { id, e, nu });
    }
    let mut secs_map = HashMap::new();
    for (id, a, iy, iz, j) in secs {
        secs_map.insert(id.to_string(), SolverSection3D { id, name: None, a, iy, iz, j, cw: None, as_y: None, as_z: None });
    }
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si) in elems {
        elems_map.insert(id.to_string(), SolverElement3D {
            id,
            elem_type: t.to_string(),
            node_i: ni,
            node_j: nj,
            material_id: mi,
            section_id: si,
            release_my_start: false,
            release_my_end: false,
            release_mz_start: false,
            release_mz_end: false,
            release_t_start: false,
            release_t_end: false,
            local_yx: None,
            local_yy: None,
            local_yz: None,
            roll_angle: None,
        });
    }
    let mut sups_map = HashMap::new();
    for (id, nid, rx, ry, rz, rrx, rry, rrz) in sups {
        sups_map.insert(id.to_string(), SolverSupport3D {
            node_id: nid,
            rx, ry, rz, rrx, rry, rrz,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
            });
    }
    SolverInput3D {
        solver_options: None,
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads: vec![],
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_beams: vec![],
            curved_shells: HashMap::new(),
        connectors: HashMap::new(),    }
}

#[test]
fn test_3d_cantilever_isostatic() {
    // 3D cantilever: 1 fixed support (6 DOFs restrained), 1 frame element
    // 6*1 + 6 - 6*2 = 0 → isostatic
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 0.001, 0.001, 0.002)],
        vec![(1, "frame", 1, 2, 1, 1)],
        // fixed = all 6 DOFs restrained
        vec![(1, 1, true, true, true, true, true, true)],
    );
    let result = analyze_kinematics_3d(&input);
    assert_eq!(result.degree, 0, "3D cantilever should be isostatic, got {}", result.degree);
    assert!(result.is_solvable, "3D cantilever should be solvable");
}

#[test]
fn test_3d_portal_frame() {
    // 3D portal frame: 2 columns + 1 beam, 2 fixed supports
    let input = make_3d_input(
        vec![
            (1, 0.0, 0.0, 0.0),
            (2, 0.0, 4.0, 0.0),
            (3, 6.0, 4.0, 0.0),
            (4, 6.0, 0.0, 0.0),
        ],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 0.001, 0.001, 0.002)],
        vec![
            (1, "frame", 1, 2, 1, 1),
            (2, "frame", 2, 3, 1, 1),
            (3, "frame", 3, 4, 1, 1),
        ],
        vec![
            (1, 1, true, true, true, true, true, true),
            (2, 4, true, true, true, true, true, true),
        ],
    );
    let result = analyze_kinematics_3d(&input);
    assert!(result.degree > 0, "3D portal should be hyperstatic, got {}", result.degree);
    assert!(result.is_solvable, "3D portal should be solvable");
}

// Per-axis hinge oracle: a node-end that releases ONLY one bending axis is not
// fully hinged. The pre-Bug-B kinematic.rs counted any-axis-released as a full
// hinge (OR shortcut), which over-marks rotation continuity as broken. Under
// the AND oracle a single-axis pin hinge does not collapse the node's
// rotational continuity in this count.
//
// Three-hinge-arch in 3D, crown release on Mz only at node 2 from both
// adjacent ends. Static degree under OR = 3; under AND = 6. We assert the
// per-axis-correct value.
#[test]
fn kinematic_3d_per_axis_release_does_not_overcount_hinges() {
    let mut input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 5.0, 0.0, 3.0), (3, 10.0, 0.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 1e-4, 2e-4, 1.5e-4)],
        vec![(1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1)],
        vec![
            (1, 1, true, true, true, true, true, true),
            (2, 3, true, true, true, true, true, true),
        ],
    );
    // Release Mz only at the crown — My and torsion stay coupled across node 2.
    input.elements.get_mut("1").unwrap().release_mz_end = true;
    input.elements.get_mut("2").unwrap().release_mz_start = true;

    let result = analyze_kinematics_3d(&input);
    // 6m + r - 6n - c with c = 0 (no end has both bending axes released):
    // 6*2 + 12 - 6*3 - 0 = 6.
    assert_eq!(
        result.degree, 6,
        "single-axis Mz release at crown must not be counted as a full hinge \
         (got degree={}, expected 6 under per-axis AND oracle)",
        result.degree,
    );
    assert!(result.is_solvable);
}

// ─── The sparse proof of solvability, above its 64-free-DOF threshold ─────
//
// A large constraint-free model takes the sparse Cholesky proof instead of
// the dense assembly plus dense LU rank; a mechanism at that size still falls
// through to the full path, which names the DOFs.

/// A fixed-base portal frame of `bays`×`storeys`, fixed at the base corners.
fn big_portal(bays: usize, storeys: usize, pinned_base: bool) -> dedaliano_engine::types::SolverInput {
    let (span, h) = (6.0, 3.5);
    let id = |i: usize, k: usize| 1 + k * (bays + 1) + i;
    let mut nodes = Vec::new();
    for k in 0..=storeys {
        for i in 0..=bays {
            nodes.push((id(i, k), span * i as f64, h * k as f64));
        }
    }
    let mut elements = Vec::new();
    let mut eid = 1;
    for k in 0..=storeys {
        for i in 0..bays {
            elements.push((eid, "frame", id(i, k), id(i + 1, k), 1, 1, false, false));
            eid += 1;
        }
    }
    for k in 0..storeys {
        for i in 0..=bays {
            elements.push((eid, "frame", id(i, k), id(i, k + 1), 1, 1, false, false));
            eid += 1;
        }
    }
    let supports = vec![
        (1, id(0, 0), if pinned_base { "pinned" } else { "fixed" }),
        (2, id(bays, 0), if pinned_base { "pinned" } else { "fixed" }),
    ];
    make_input(nodes, vec![(1, 200000.0, 0.3)], vec![(1, 0.01, 0.001)], elements, supports, vec![])
}

#[test]
fn sparse_proof_solves_a_large_stable_frame() {
    // 6 bays × 8 storeys: 63 nodes, 189 DOFs, 183 free — past the threshold.
    let input = big_portal(6, 8, false);
    let result = analyze_kinematics_2d(&input);
    assert!(result.is_solvable, "a fixed-base portal is stable: {}", result.diagnosis);
    assert_eq!(result.mechanism_modes, 0);
    assert!(result.degree > 0);
}

#[test]
fn a_mechanism_at_size_still_falls_through_and_is_named() {
    // Same frame on pinned bases with every beam end released: a sway mechanism
    // the sparse proof refuses to pass, so the dense path must name it.
    let mut input = big_portal(6, 8, true);
    for e in input.elements.values_mut() {
        e.hinge_start = true;
        e.hinge_end = true;
    }
    let result = analyze_kinematics_2d(&input);
    assert!(!result.is_solvable, "a pinned, all-hinged portal is a mechanism");
    assert!(result.mechanism_modes > 0);
    assert!(!result.mechanism_nodes.is_empty());
}

#[test]
fn sparse_proof_agrees_with_the_dense_path_on_a_heated_frame() {
    // A thermal load adds nothing to the count but exercises the load-agnostic path.
    let mut input = big_portal(6, 8, false);
    input.loads.push(SolverLoad::Thermal(SolverThermalLoad { element_id: 1, dt_uniform: 20.0, dt_gradient: 0.0 }));
    let result = analyze_kinematics_2d(&input);
    assert!(result.is_solvable);
    assert_eq!(result.mechanism_modes, 0);
}

// ─── The sparse constrained solve, above its threshold ─────────────

#[test]
fn a_mechanism_whose_factorization_succeeds_is_still_a_mechanism() {
    // A singular K need not make the sparse Cholesky fail: the zero pivot comes out of the
    // elimination as rounding, often positive. Each of these factored and was called solvable.
    let mut one_pin = big_portal(6, 8, false);
    one_pin.supports.retain(|_, s| s.id == 1);
    for s in one_pin.supports.values_mut() { s.support_type = "pinned".into(); }

    let mut rollers = big_portal(6, 8, false);
    for s in rollers.supports.values_mut() { s.support_type = "rollerX".into(); }

    // 30 frame elements, pin and roller, one internal hinge at midspan.
    let nodes: Vec<_> = (0..=30).map(|i| (i + 1, i as f64 * 0.5, 0.0)).collect();
    let elements: Vec<_> = (0..30).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, i == 14)).collect();
    let hinged_beam = make_input(nodes, vec![(1, 200000.0, 0.3)], vec![(1, 0.01, 0.001)], elements,
        vec![(1, 1, "pinned"), (2, 31, "rollerX")], vec![]);

    for (name, input) in [("a rigid frame on one pin", one_pin), ("on two rollers", rollers), ("a beam with an internal hinge", hinged_beam)] {
        let result = analyze_kinematics_2d(&input);
        assert!(!result.is_solvable, "{name} is a mechanism: {}", result.diagnosis);
        assert!(result.mechanism_modes > 0, "{name}");
    }
}
