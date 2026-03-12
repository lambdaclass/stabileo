/// Validation: Warping Torsion (7th DOF) Analysis
///
/// Reference: Vlasov *Thin-Walled Elastic Beams*, Trahair *Flexural-Torsional Buckling*
///
/// The warping DOF infrastructure (14×14 element matrices, DOF numbering, assembly,
/// bimoment recovery) is fully wired via dof.rs, assembly.rs, and frame.rs.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const E_EFF: f64 = E * 1000.0;
const NU: f64 = 0.3;
const G_EFF: f64 = E_EFF / (2.0 * (1.0 + NU));

// I-beam section properties (typical W310x60 approximation)
const A_SEC: f64 = 7.61e-3;  // m^2
const IY: f64 = 18.4e-6;     // m^4 (weak axis)
const IZ: f64 = 128.0e-6;    // m^4 (strong axis)
const J_SEC: f64 = 0.5e-6;   // m^4 (St. Venant torsion constant)
const CW: f64 = 300.0e-9;    // m^6 (warping constant)

fn make_warping_beam(
    n_elements: usize,
    length: f64,
    start_dofs: Vec<bool>,
    end_dofs: Option<Vec<bool>>,
    loads: Vec<SolverLoad3D>,
    use_warping: bool,
) -> SolverInput3D {
    let n_nodes = n_elements + 1;
    let elem_len = length / n_elements as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        nodes_map.insert((i + 1).to_string(), SolverNode3D {
            id: i + 1, x: i as f64 * elem_len, y: 0.0, z: 0.0,
        });
    }

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });

    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: A_SEC, iy: IY, iz: IZ, j: J_SEC,
        cw: if use_warping { Some(CW) } else { None },
        as_y: None, as_z: None,
    });

    let mut elems_map = HashMap::new();
    for i in 0..n_elements {
        elems_map.insert((i + 1).to_string(), SolverElement3D {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
    }

    let mut sups_map = HashMap::new();
    let mut sup_id = 1;
    sups_map.insert(sup_id.to_string(), SolverSupport3D {
        node_id: 1,
        rx: start_dofs[0], ry: start_dofs[1], rz: start_dofs[2],
        rrx: start_dofs[3], rry: start_dofs[4], rrz: start_dofs[5],
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
        rw: if use_warping { Some(true) } else { None },
        kw: None,
    });
    sup_id += 1;

    if let Some(ed) = end_dofs {
        sups_map.insert(sup_id.to_string(), SolverSupport3D {
            node_id: n_nodes,
            rx: ed[0], ry: ed[1], rz: ed[2],
            rrx: ed[3], rry: ed[4], rrz: ed[5],
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None,
            rw: if use_warping { Some(false) } else { None },
            kw: None,
        });
    }

    SolverInput3D {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

// ================================================================
// 1. Cantilever I-Beam Under End Torque with Warping-Fixed Support
// ================================================================

#[test]
fn validation_warping_cantilever_end_torque() {
    // Cantilever I-beam, L=3m, torque T=1 kN-m at free end.
    // With warping restrained at fixed end:
    //   theta(L) = T*L/(G*J) * [1 - tanh(k*L)/(k*L)]  where k = sqrt(G*J/(E*Cw))
    // Without warping: theta = T*L/(G*J)
    //
    // The warping-restrained twist should be less than the free warping twist.
    let l = 3.0;
    let torque = 1.0;
    let n = 8;

    // Case 1: without warping
    let input_no_warp = make_warping_beam(
        n, l,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: torque, my: 0.0, mz: 0.0, bw: None,
        })],
        false,
    );

    // Case 2: with warping (restrained at fixed end)
    let input_warp = make_warping_beam(
        n, l,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: torque, my: 0.0, mz: 0.0, bw: None,
        })],
        true,
    );

    let res_no_warp = linear::solve_3d(&input_no_warp).unwrap();
    let res_warp = linear::solve_3d(&input_warp).unwrap();

    let tip_no_warp = res_no_warp.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let tip_warp = res_warp.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // St. Venant twist
    let theta_sv = torque * l / (G_EFF * J_SEC);
    assert_close(tip_no_warp.rx.abs(), theta_sv, 0.05, "no-warp twist");

    // Warping-restrained twist should be smaller
    assert!(
        tip_warp.rx.abs() < tip_no_warp.rx.abs(),
        "Warping should reduce twist: warp={:.6e} vs no-warp={:.6e}",
        tip_warp.rx.abs(), tip_no_warp.rx.abs()
    );
}

// ================================================================
// 2. Z-Section Cantilever Under Torsion
// ================================================================

#[test]
fn validation_warping_z_section_torsion() {
    // Z-sections have high warping constant and coupling between bending and torsion.
    // A pure torque should produce bimoment at the fixed end when warping is restrained.
    let l = 4.0;
    let torque = 2.0;
    let n = 8;

    let input = make_warping_beam(
        n, l,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: torque, my: 0.0, mz: 0.0, bw: None,
        })],
        true,
    );

    let results = linear::solve_3d(&input).unwrap();

    // Check bimoment reaction at fixed end
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(
        r1.bimoment.is_some(),
        "Fixed end should have bimoment reaction when warping is restrained"
    );
    assert!(
        r1.bimoment.unwrap().abs() > 1e-6,
        "Bimoment should be non-zero for torsion with warping restraint"
    );
}

// ================================================================
// 3. Mixed Model: Some Elements With Warping, Some Without
// ================================================================

#[test]
fn validation_warping_mixed_model() {
    // A two-span beam where span 1 has warping (Cw set) and span 2 does not.
    // The solver should handle the transition without crashing.
    let l = 3.0;
    let n = 4;
    let torque = 1.0;

    let n_nodes = 2 * n + 1;
    let elem_len = l / n as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        nodes_map.insert((i + 1).to_string(), SolverNode3D {
            id: i + 1, x: i as f64 * elem_len, y: 0.0, z: 0.0,
        });
    }

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });

    // Section 1: with warping
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: A_SEC, iy: IY, iz: IZ, j: J_SEC, cw: Some(CW),
        as_y: None, as_z: None,
    });
    // Section 2: without warping
    secs_map.insert("2".to_string(), SolverSection3D {
        id: 2, name: None, a: A_SEC, iy: IY, iz: IZ, j: J_SEC, cw: None,
        as_y: None, as_z: None,
    });

    let mut elems_map = HashMap::new();
    for i in 0..(2 * n) {
        let sec_id = if i < n { 1 } else { 2 };
        elems_map.insert((i + 1).to_string(), SolverElement3D {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: sec_id,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
    }

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None, rw: Some(true), kw: None,
    });

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n_nodes, fx: 0.0, fy: 0.0, fz: 0.0,
        mx: torque, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = SolverInput3D {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    };

    let results = linear::solve_3d(&input).unwrap();

    // Just verify it solves without panicking
    assert!(
        !results.displacements.is_empty(),
        "Mixed warping model should produce displacement results"
    );

    // Tip should twist
    let tip = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert!(
        tip.rx.abs() > 1e-10,
        "Tip should twist under torque, got rx={:.6e}", tip.rx
    );
}
