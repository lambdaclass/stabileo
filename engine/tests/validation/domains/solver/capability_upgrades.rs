/// Validation: Capability Benchmark Upgrades
///
/// This file upgrades 5 CAPABILITY items to DONE status by achieving tight
/// tolerance against published benchmark values.
///
/// Benchmarks:
///   1. VM11 — Cantilever with linearly varying load (ANSYS VM11, Timoshenko)
///   2. VM14a — Mattiasson elastica, cantilever large deflection
///              (v_tip/L < 5%, u_tip/L < 10%)
///   3. VM15 — Fixed-fixed beam plastic collapse (Pc=8*Mp/L)
///   4. VM18 — Quarter-circle cantilever, out-of-plane load (delta_B=2.648 in)
///   5. VM44 — Roark circular ring under diametrically opposite loads
use dedaliano_engine::solver::{corotational, linear, material_nonlinear};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

// ================================================================
// 1. VM11 — Cantilever with Linearly Varying Load
// ================================================================
//
// Source: ANSYS Verification Manual, VM11
//         Timoshenko, *Strength of Materials*
//
// Problem: Cantilever beam with triangular distributed load:
//          q = 0 at fixed end, q = q_max at free end.
//          delta_tip = 11 * q_max * L^4 / (120 * E * I)
//          M_fixed = q_max * L^2 / 3
//          R_fixed = q_max * L / 2
//
// Parameters: L=6m, q_max=12 kN/m, E=200 GPa, A=0.01 m^2, Iz=1e-4 m^4
// Uses 16 elements for converged discretization of the varying load.

#[test]
fn capability_vm11_triangular_load_cantilever() {
    let e = 200_000.0; // MPa
    let e_eff = e * 1000.0; // kN/m^2
    let a_sec = 0.01;
    let iz = 1e-4;
    let l = 6.0;
    let n = 16;
    let q_max: f64 = -12.0; // kN/m (negative = downward)

    let mut loads = Vec::new();
    for i in 0..n {
        let frac_i = i as f64 / n as f64;
        let frac_j = (i + 1) as f64 / n as f64;
        let qi = q_max * frac_i;
        let qj = q_max * frac_j;
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: qi,
            q_j: qj,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, e, a_sec, iz, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // Exact tip deflection for linearly varying load (q=0 at fixed, q_max at free):
    // delta = 11 * q_max * L^4 / (120 * E * I)
    let delta_exact = 11.0 * q_max.abs() * l.powi(4) / (120.0 * e_eff * iz);
    let err_delta = (tip.uy.abs() - delta_exact).abs() / delta_exact;
    assert!(
        err_delta < 0.02,
        "VM11 delta_tip: computed={:.6e}, exact 11qL^4/(120EI)={:.6e}, error={:.2}%",
        tip.uy.abs(),
        delta_exact,
        err_delta * 100.0
    );

    // Exact fixed-end moment: M = q_max * L^2 / 3
    let m_exact = q_max.abs() * l * l / 3.0;
    let r = results
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap();
    let err_m = (r.mz.abs() - m_exact).abs() / m_exact;
    assert!(
        err_m < 0.02,
        "VM11 M_fixed: computed={:.4}, exact q*L^2/3={:.4}, error={:.2}%",
        r.mz.abs(),
        m_exact,
        err_m * 100.0
    );

    // Exact fixed-end reaction: R = q_max * L / 2
    let r_exact = q_max.abs() * l / 2.0;
    let err_r = (r.ry - r_exact).abs() / r_exact;
    assert!(
        err_r < 0.02,
        "VM11 R_fixed: computed={:.4}, exact q*L/2={:.4}, error={:.2}%",
        r.ry,
        r_exact,
        err_r * 100.0
    );
}

// ================================================================
// 2. VM14a — Mattiasson Elastica (Cantilever Large Deflection)
// ================================================================
//
// Source: Mattiasson (1981), "Numerical results from large deflection
//         beam and frame problems", IJNME 17:145-153, Table 1.
//
// Problem: Cantilever beam, length L, tip load P.
//          Dimensionless load parameter: P*L^2/(EI) = 1.0
// Reference: v_tip/L = 0.3015 (lateral deflection)
//            u_tip/L = 0.0566 (axial shortening)
//
// Use 40 elements and 40 load increments for converged mesh.
// v_tip/L checked at 5% (primary benchmark quantity).
// u_tip/L checked at 10% (second-order kinematic effect, inherently
// harder for corotational beam elements).

#[test]
fn capability_vm14a_mattiasson_elastica() {
    let l = 1.0;
    let e_mpa = 12.0;
    let e_eff = e_mpa * 1000.0; // 12000 kN/m^2
    let a_sec = 1.0;
    let iz = 1.0 / 12.0;
    let ei = e_eff * iz; // = 1000

    // P*L^2/(EI) = 1.0 => P = EI/L^2 = 1000
    let p_load = ei / (l * l);

    let n = 40; // 40 elements for converged mesh
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let input = make_input(
        nodes,
        vec![(1, e_mpa, 0.3)],
        vec![(1, a_sec, iz)],
        elems,
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: 0.0,
            fy: -p_load,
            mz: 0.0,
        })],
    );

    let result = corotational::solve_corotational_2d(&input, 100, 1e-8, 40).unwrap();
    assert!(result.converged, "Mattiasson elastica should converge");

    let tip = result
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // Mattiasson reference for PL^2/(EI) = 1.0:
    // v_tip/L = 0.3015 (lateral deflection)
    // u_tip/L = 0.0566 (axial shortening)
    let v_ratio = tip.uy.abs() / l;
    let u_ratio = tip.ux.abs() / l;

    let v_error = (v_ratio - 0.3015).abs() / 0.3015;
    assert!(
        v_error < 0.05,
        "VM14a Mattiasson v_tip/L={:.4}, expected=0.3015, error={:.1}%",
        v_ratio,
        v_error * 100.0
    );

    // Note: axial shortening u_tip is a second-order kinematic quantity
    // that is inherently harder to compute with corotational beam elements.
    // The existing tests only check a loose range (0.01..0.20).
    // We tighten to 10% which is a significant upgrade.
    let u_error = (u_ratio - 0.0566).abs() / 0.0566;
    assert!(
        u_error < 0.10,
        "VM14a Mattiasson u_tip/L={:.4}, expected=0.0566, error={:.1}%",
        u_ratio,
        u_error * 100.0
    );
}

// ================================================================
// 3. VM15 — Fixed-Fixed Beam Plastic Collapse
// ================================================================
//
// Source: Neal, *Plastic Methods of Structural Analysis*;
//         Chen & Sohal, *Plastic Design and Second-Order Analysis*
//         (ANSYS VM15-style plastic benchmark)
//
// Problem: Fixed-fixed beam, length L, central point load P.
//          Collapse load Pc = 8*Mp/L.
//
// Parameters: L=4m, E=200GPa, b=0.15m, h=0.30m
//   A = 0.045 m^2, Iz = 3.375e-4 m^4, Zp = bh^2/4 = 3.375e-3 m^3
//   Fy = 250 MPa -> Mp = Fy*Zp = 843.75 kN*m
//   Pc = 8*843.75/4 = 1687.5 kN
//
// Strategy: Apply P = Pc (exactly at collapse) and verify the solver
// reaches near-collapse state with load factor close to 1.0 and
// multiple yielded zones.

#[test]
fn capability_vm15_plastic_collapse_fixed_beam() {
    let e = 200_000.0; // MPa
    let fy = 250.0; // MPa
    let l = 4.0;
    let n = 8;
    let b_sec: f64 = 0.15;
    let h_sec: f64 = 0.30;
    let a_sec = b_sec * h_sec; // 0.045 m^2
    let iz_sec = b_sec * h_sec.powi(3) / 12.0; // 3.375e-4 m^4
    let zp = b_sec * h_sec * h_sec / 4.0; // 3.375e-3 m^3
    let mp = fy * 1000.0 * zp; // 843.75 kN*m (fy in kN/m^2 * zp)
    let np = fy * 1000.0 * a_sec; // 11250 kN

    let pc = 8.0 * mp / l; // 1687.5 kN

    let mid_node = n / 2 + 1;

    // Apply load at exactly the collapse load
    let p_apply = pc;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fy: -p_apply,
        mz: 0.0,
    })];

    let solver = make_beam(n, l, e, a_sec, iz_sec, "fixed", Some("fixed"), loads);

    let mut material_models = HashMap::new();
    material_models.insert(
        "1".to_string(),
        MaterialModel {
            model_type: "elastic_perfectly_plastic".to_string(),
            fy,
            alpha: Some(0.01),
        },
    );

    let mut section_capacities = HashMap::new();
    section_capacities.insert(
        "1".to_string(),
        SectionCapacity {
            np,
            mp,
            zp: Some(zp),
        },
    );

    let input = NonlinearMaterialInput {
        solver,
        material_models,
        section_capacities,
        max_iter: 100,
        tolerance: 1e-4,
        n_increments: 20,
    };

    let result = material_nonlinear::solve_nonlinear_material_2d(&input).unwrap();

    // At collapse load, the solver should reach near-complete loading.
    // The load factor indicates fraction of applied load that was sustained.
    // With P = Pc exactly, the solver should achieve load_factor close to 1.0.
    // Due to incremental loading and strain hardening (alpha=0.01), it may
    // sustain slightly more or converge near 1.0.
    assert!(
        result.load_factor > 0.90,
        "VM15: load factor={:.3} should be close to 1.0 at Pc", result.load_factor
    );

    // Verify yielding has occurred at expected locations
    // Fixed-fixed beam collapse mechanism: hinges at midspan + both ends
    let yielded = result
        .element_status
        .iter()
        .filter(|s| s.utilization > 0.90)
        .count();
    assert!(
        yielded >= 2,
        "VM15: only {} elements yielded, expect >= 2 (ends + midspan)", yielded
    );

    // Cross-check: run at 0.5*Pc (elastic range) and verify proportional response
    let p_elastic = 0.5 * pc;
    let loads_e = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fy: -p_elastic,
        mz: 0.0,
    })];
    let solver_e = make_beam(n, l, e, a_sec, iz_sec, "fixed", Some("fixed"), loads_e);

    let mut mm2 = HashMap::new();
    mm2.insert(
        "1".to_string(),
        MaterialModel {
            model_type: "elastic_perfectly_plastic".to_string(),
            fy,
            alpha: Some(0.01),
        },
    );
    let mut sc2 = HashMap::new();
    sc2.insert(
        "1".to_string(),
        SectionCapacity {
            np,
            mp,
            zp: Some(zp),
        },
    );

    let input_e = NonlinearMaterialInput {
        solver: solver_e,
        material_models: mm2,
        section_capacities: sc2,
        max_iter: 100,
        tolerance: 1e-4,
        n_increments: 20,
    };

    let result_e = material_nonlinear::solve_nonlinear_material_2d(&input_e).unwrap();
    assert!(
        result_e.converged,
        "VM15: elastic range should converge"
    );
    assert!(
        result_e.load_factor > 0.95,
        "VM15: elastic load factor={:.3} should be ~1.0", result_e.load_factor
    );

    // At 0.5*Pc all elements should be elastic
    let max_util_elastic = result_e
        .element_status
        .iter()
        .map(|s| s.utilization)
        .fold(0.0_f64, f64::max);
    assert!(
        max_util_elastic < 0.95,
        "VM15: at 0.5*Pc, max utilization={:.3} should be < 0.95", max_util_elastic
    );

    // Compare elastic displacement with theory: delta = PL^3/(192*E_eff*I)
    let e_eff = e * 1000.0;
    let delta_elastic_theory = p_elastic * l.powi(3) / (192.0 * e_eff * iz_sec);
    let mid_disp_elastic = result_e
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uy
        .abs();

    let err_disp = (mid_disp_elastic - delta_elastic_theory).abs() / delta_elastic_theory;
    assert!(
        err_disp < 0.05,
        "VM15 elastic δ: computed={:.6e}, theory PL³/(192EI)={:.6e}, error={:.1}%",
        mid_disp_elastic,
        delta_elastic_theory,
        err_disp * 100.0
    );
}

// ================================================================
// 4. VM18 — Quarter-Circle Cantilever, Out-of-Plane Load
// ================================================================
//
// Source: ANSYS VM18, Timoshenko *Strength of Materials* Part II, p.412
//
// Problem: Quarter-circle bar in XZ plane, radius R = 100 in,
//          circular cross-section d = 2 in (0.0508 m),
//          E = 30e6 psi (206842.7 MPa), nu = 0.3,
//          fixed at one end, F = 50 lb (0.2224 kN) out-of-plane.
//
// Reference: delta_B = 2.648 in = 0.06726 m (magnitude)
//
// Strategy: Use 32 segments for high-accuracy mesh and assert <5%.

#[test]
fn capability_vm18_quarter_circle_out_of_plane() {
    let e_mpa = 206_842.7; // 30e6 psi -> MPa
    let nu = 0.3;
    let r = 2.54; // 100 in -> m
    let d: f64 = 0.0508; // 2 in -> m (circular section)
    let a_sec = std::f64::consts::PI * d * d / 4.0;
    let i_val = std::f64::consts::PI * d.powi(4) / 64.0;
    let j_val = std::f64::consts::PI * d.powi(4) / 32.0;
    let f_kn = 0.2224; // 50 lb -> kN

    // Reference deflection: 2.648 in = 0.06726 m
    let delta_ref = 0.06726;

    let n_segments = 32; // refined mesh for tight tolerance

    // Quarter-circle in XZ plane: from (R,0,0) to (0,0,R)
    let cos45 = std::f64::consts::FRAC_PI_4.cos();
    let sin45 = std::f64::consts::FRAC_PI_4.sin();

    let mut nodes_map = HashMap::new();
    nodes_map.insert(
        "1".to_string(),
        SolverNode3D {
            id: 1,
            x: r,
            y: 0.0,
            z: 0.0,
        },
    );
    nodes_map.insert(
        "2".to_string(),
        SolverNode3D {
            id: 2,
            x: r * cos45,
            y: 0.0,
            z: r * sin45,
        },
    );
    nodes_map.insert(
        "3".to_string(),
        SolverNode3D {
            id: 3,
            x: 0.0,
            y: 0.0,
            z: r,
        },
    );

    let mut mats_map = HashMap::new();
    mats_map.insert(
        "1".to_string(),
        SolverMaterial {
            id: 1,
            e: e_mpa,
            nu,
        },
    );

    let mut secs_map = HashMap::new();
    secs_map.insert(
        "1".to_string(),
        SolverSection3D {
            id: 1,
            name: None,
            a: a_sec,
            iy: i_val,
            iz: i_val,
            j: j_val,
            cw: None,
            as_y: None,
            as_z: None,
        },
    );

    let curved_beams = vec![CurvedBeamInput {
        node_start: 1,
        node_mid: 2,
        node_end: 3,
        material_id: 1,
        section_id: 1,
        num_segments: n_segments,
        hinge_start: false,
        hinge_end: false,
    }];

    // Fixed at node 1 (base)
    let mut sups_map = HashMap::new();
    sups_map.insert(
        "1".to_string(),
        SolverSupport3D {
            node_id: 1,
            rx: true,
            ry: true,
            rz: true,
            rrx: true,
            rry: true,
            rrz: true,
            kx: None,
            ky: None,
            kz: None,
            krx: None,
            kry: None,
            krz: None,
            dx: None,
            dy: None,
            dz: None,
            drx: None,
            dry: None,
            drz: None,
            normal_x: None,
            normal_y: None,
            normal_z: None,
            is_inclined: None,
            rw: None,
            kw: None,
        },
    );

    // Out-of-plane load (Y direction) at free end
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3,
        fx: 0.0,
        fy: f_kn,
        fz: 0.0,
        mx: 0.0,
        my: 0.0,
        mz: 0.0,
        bw: None,
    })];

    let input = SolverInput3D {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: HashMap::new(),
        supports: sups_map,
        loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams,
        connectors: HashMap::new(),
    };

    let results = linear::solve_3d(&input).unwrap();
    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == 3)
        .unwrap();
    let computed = tip.uy.abs();

    let error = (computed - delta_ref).abs() / delta_ref;
    assert!(
        error < 0.05,
        "VM18: computed delta={:.6e} m, reference={:.6e} m, error={:.1}% (need <5%)",
        computed,
        delta_ref,
        error * 100.0
    );
}

// ================================================================
// 5. VM44 — Roark Circular Ring Under Diametrically Opposite Loads
// ================================================================
//
// Source: Roark, *Formulas for Stress and Strain*, 8th Ed.,
//         Table 9.2, Case 1.
//
// Problem: Complete circular ring, two equal opposite forces P
//          along a diameter. Ring in XY plane.
// Reference: delta = (pi/4 - 2/pi) * P*R^3/(E_eff*I)
//          = 0.1488 * P*R^3/(E_eff*I)
//
// Use 32 segments per semicircle (64 total elements) for high accuracy.

#[test]
fn capability_vm44_roark_circular_ring() {
    let e_mpa = 200_000.0;
    let nu = 0.3;
    let e_eff = e_mpa * 1000.0; // kN/m^2
    let r: f64 = 1.0;
    let side: f64 = 0.05; // 50mm square section
    let a_sec = side * side;
    let i_val = side.powi(4) / 12.0;
    let j_val = 2.25 * side.powi(4) / 16.0; // approximate J for square section
    let p = 10.0; // kN

    // Roark reference
    let delta_ref = 0.1488 * p * r.powi(3) / (e_eff * i_val);

    let n_seg = 32; // 32 segments per semicircle for tight tolerance

    // Model full ring as two semicircular curved beams in XY plane.
    // Semicircle 1: bottom (0,-R,0) -> right (R,0,0) -> top (0,R,0)
    // Semicircle 2: top (0,R,0) -> left (-R,0,0) -> bottom (0,-R,0)
    let mut nodes_map = HashMap::new();
    nodes_map.insert(
        "1".to_string(),
        SolverNode3D {
            id: 1,
            x: 0.0,
            y: -r,
            z: 0.0,
        },
    ); // bottom
    nodes_map.insert(
        "2".to_string(),
        SolverNode3D {
            id: 2,
            x: r,
            y: 0.0,
            z: 0.0,
        },
    ); // right
    nodes_map.insert(
        "3".to_string(),
        SolverNode3D {
            id: 3,
            x: 0.0,
            y: r,
            z: 0.0,
        },
    ); // top
    nodes_map.insert(
        "4".to_string(),
        SolverNode3D {
            id: 4,
            x: -r,
            y: 0.0,
            z: 0.0,
        },
    ); // left

    let mut mats_map = HashMap::new();
    mats_map.insert(
        "1".to_string(),
        SolverMaterial {
            id: 1,
            e: e_mpa,
            nu,
        },
    );

    let mut secs_map = HashMap::new();
    secs_map.insert(
        "1".to_string(),
        SolverSection3D {
            id: 1,
            name: None,
            a: a_sec,
            iy: i_val,
            iz: i_val,
            j: j_val,
            cw: None,
            as_y: None,
            as_z: None,
        },
    );

    let curved_beams = vec![
        CurvedBeamInput {
            node_start: 1,
            node_mid: 2,
            node_end: 3,
            material_id: 1,
            section_id: 1,
            num_segments: n_seg,
            hinge_start: false,
            hinge_end: false,
        },
        CurvedBeamInput {
            node_start: 3,
            node_mid: 4,
            node_end: 1,
            material_id: 1,
            section_id: 1,
            num_segments: n_seg,
            hinge_start: false,
            hinge_end: false,
        },
    ];

    // Supports: fix rigid body without over-constraining the ring.
    // Fix all translations at bottom node, fix X and Z at top node
    // (top is free to move in Y to measure diametral deflection).
    let mut sups_map = HashMap::new();
    sups_map.insert(
        "1".to_string(),
        SolverSupport3D {
            node_id: 1,
            rx: true,
            ry: true,
            rz: true,
            rrx: false,
            rry: false,
            rrz: false,
            kx: None,
            ky: None,
            kz: None,
            krx: None,
            kry: None,
            krz: None,
            dx: None,
            dy: None,
            dz: None,
            drx: None,
            dry: None,
            drz: None,
            normal_x: None,
            normal_y: None,
            normal_z: None,
            is_inclined: None,
            rw: None,
            kw: None,
        },
    );
    sups_map.insert(
        "2".to_string(),
        SolverSupport3D {
            node_id: 3,
            rx: true,
            ry: false,
            rz: true,
            rrx: false,
            rry: false,
            rrz: false,
            kx: None,
            ky: None,
            kz: None,
            krx: None,
            kry: None,
            krz: None,
            dx: None,
            dy: None,
            dz: None,
            drx: None,
            dry: None,
            drz: None,
            normal_x: None,
            normal_y: None,
            normal_z: None,
            is_inclined: None,
            rw: None,
            kw: None,
        },
    );

    // Diametrically opposite loads: P upward at bottom, P downward at top
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 1,
            fx: 0.0,
            fy: p,
            fz: 0.0,
            mx: 0.0,
            my: 0.0,
            mz: 0.0,
            bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3,
            fx: 0.0,
            fy: -p,
            fz: 0.0,
            mx: 0.0,
            my: 0.0,
            mz: 0.0,
            bw: None,
        }),
    ];

    let input = SolverInput3D {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: HashMap::new(),
        supports: sups_map,
        loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams,
        connectors: HashMap::new(),
    };

    let results = linear::solve_3d(&input).unwrap();

    // The relative approach of the two load points:
    // Bottom is fixed in Y, so measure Y displacement of top node.
    let top = results
        .displacements
        .iter()
        .find(|d| d.node_id == 3)
        .unwrap();
    let computed = top.uy.abs();

    let error = (computed - delta_ref).abs() / delta_ref;
    assert!(
        error < 0.05,
        "VM44 Roark ring: computed delta={:.6e} m, reference={:.6e} m, error={:.1}% (need <5%)",
        computed,
        delta_ref,
        error * 100.0
    );

    // Also verify horizontal expansion: the ring should expand laterally
    // Roark: delta_horizontal = 0.1366 * P*R^3/(E_eff*I) (perpendicular to load)
    let right = results
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap();
    let left = results
        .displacements
        .iter()
        .find(|d| d.node_id == 4)
        .unwrap();

    // Right node should move to the right (+x), left to the left (-x)
    // The total expansion is |ux_right - ux_left|
    let delta_h_ref = 0.1366 * p * r.powi(3) / (e_eff * i_val);
    let delta_h_computed = (right.ux - left.ux).abs();

    let error_h = (delta_h_computed - delta_h_ref).abs() / delta_h_ref;
    assert!(
        error_h < 0.10,
        "VM44 ring horizontal: computed={:.6e}, Roark={:.6e}, error={:.1}%",
        delta_h_computed,
        delta_h_ref,
        error_h * 100.0
    );
}
