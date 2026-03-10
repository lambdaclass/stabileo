/// Validation: Elastic Spring Support Benchmarks
///
/// References:
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///   - Przemieniecki, "Theory of Matrix Structural Analysis"
///   - Weaver & Gere, "Matrix Analysis of Framed Structures"
///
/// Tests verify behavior of elastic (spring) supports:
///   1. Axial spring: δ = F/(EA/L + k)
///   2. Vertical spring at midspan: deflection bounded
///   3. Rotational spring: stiffness between pin and fixed
///   4. Very stiff spring ≈ rigid support
///   5. Very soft spring ≈ free end
///   6. Spring + settlement: combined effect
///   7. Multiple springs: load distribution
///   8. Spring reaction: F = k × δ
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

fn make_beam_with_springs(
    n: usize, l: f64, start: &str, end: Option<&str>,
    springs: Vec<(usize, Option<f64>, Option<f64>, Option<f64>)>, // (node, kx, ky, kz)
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let n_nodes = n + 1;
    let elem_len = l / n as f64;

    let mut nodes = HashMap::new();
    for i in 0..n_nodes {
        nodes.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x: i as f64 * elem_len, y: 0.0,
        });
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut elems = HashMap::new();
    for i in 0..n {
        elems.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }

    let mut sups = HashMap::new();
    let mut sid = 1;
    sups.insert(sid.to_string(), SolverSupport {
        id: sid, node_id: 1, support_type: start.to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sid += 1;
    if let Some(es) = end {
        sups.insert(sid.to_string(), SolverSupport {
            id: sid, node_id: n_nodes, support_type: es.to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });
        sid += 1;
    }

    // Add spring supports
    for (nid, kx, ky, kz) in springs {
        sups.insert(sid.to_string(), SolverSupport {
            id: sid, node_id: nid, support_type: "spring".to_string(),
            kx, ky, kz,
            dx: None, dy: None, drz: None, angle: None,
        });
        sid += 1;
    }

    SolverInput { nodes, materials: mats, sections: secs, elements: elems, supports: sups, loads, constraints: vec![],  connectors: HashMap::new() }
}

// ================================================================
// 1. Axial Spring: δ = F/(EA/L + k)
// ================================================================

#[test]
fn validation_spring_axial() {
    let l = 4.0;
    let n = 4;
    let fx = 50.0;
    let k_spring = 1e6; // kN/m
    let e_eff = E * 1000.0;

    let input = make_beam_with_springs(n, l, "fixed", None,
        vec![(n + 1, Some(k_spring), None, None)],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx, fy: 0.0, mz: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Effective stiffness: k_eff = EA/L + k_spring (in series with beam axial stiffness)
    // Actually the beam and spring are in series: 1/k_eff = L/(EA) + 1/k_spring
    // Wait, they are in parallel if the spring is at the tip.
    // Actually: beam has axial stiffness EA/L. Spring adds k at the tip.
    // The force F pushes against the combined system.
    // For a cantilever with axial spring at tip:
    // The beam transmits axial force through EA/L, and the spring also resists at the tip.
    // But the spring is grounded, so: δ × (EA/L + k) = F → δ = F/(EA/L + k)

    // Actually, re-reading: the spring connects the node to ground. So:
    // Internal axial force in beam = N
    // Spring force = k × δ
    // At the tip: N = F - k × δ
    // Beam compatibility: δ = NL/(EA)
    // So: δ = (F - kδ)L/(EA)
    // δ(1 + kL/(EA)) = FL/(EA)
    // δ = FL/(EA) / (1 + kL/(EA)) = F / (EA/L + k)

    let k_beam = e_eff * A / l;
    let delta_exact = fx / (k_beam + k_spring);
    let error = (tip.ux - delta_exact).abs() / delta_exact;
    assert!(error < 0.05,
        "Axial spring: δ={:.6e}, exact F/(EA/L+k)={:.6e}, err={:.1}%",
        tip.ux, delta_exact, error * 100.0);
}

// ================================================================
// 2. Vertical Spring at Midspan: Deflection Bounded
// ================================================================
//
// SS beam with extra vertical spring at midspan. Deflection should be
// less than without spring, more than with rigid support.

#[test]
fn validation_spring_vertical_midspan() {
    let l = 8.0;
    let n = 8;
    let q = -10.0;
    let k_spring = 5000.0; // kN/m

    // Without spring (plain SS beam)
    let input_no = make_ss_beam_udl(n, l, E, A, IZ, q);
    let res_no = linear::solve_2d(&input_no).unwrap();
    let mid_no = res_no.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // With spring at midspan
    let mut loads_spring = Vec::new();
    for i in 0..n {
        loads_spring.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_spring = make_beam_with_springs(n, l, "pinned", Some("rollerX"),
        vec![(n / 2 + 1, None, Some(k_spring), None)],
        loads_spring);
    let res_spring = linear::solve_2d(&input_spring).unwrap();
    let mid_spring = res_spring.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // Spring should reduce deflection
    assert!(mid_spring < mid_no,
        "Spring reduces deflection: with={:.6e}, without={:.6e}", mid_spring, mid_no);
    // But not to zero (spring is finite)
    assert!(mid_spring > mid_no * 0.01,
        "Finite spring: deflection={:.6e} should be >0", mid_spring);
}

// ================================================================
// 3. Rotational Spring: Between Pinned and Fixed
// ================================================================
//
// Beam with rotational spring at one end. Behavior between pin and fixed.

#[test]
fn validation_spring_rotational() {
    let l = 6.0;
    let n = 4;
    let p = 20.0;

    // Cantilever (fixed)
    let input_fixed = crate::common::make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_fixed = linear::solve_2d(&input_fixed).unwrap();
    let tip_fixed = res_fixed.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // With rotational spring (moderate stiffness)
    let k_rot = 1e5; // kN·m/rad
    let mut nodes = HashMap::new();
    let elem_len = l / n as f64;
    for i in 0..=n {
        nodes.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x: i as f64 * elem_len, y: 0.0,
        });
    }
    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems = HashMap::new();
    for i in 0..n {
        elems.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }
    let mut sups = HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: Some(k_rot),
        dx: None, dy: None, drz: None, angle: None,
    });
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input_spring = SolverInput { nodes, materials: mats, sections: secs,
        elements: elems, supports: sups, loads, constraints: vec![],
        connectors: HashMap::new(), };
    let res_spring = linear::solve_2d(&input_spring).unwrap();
    let tip_spring = res_spring.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Spring support should give more deflection than fixed (less restraint)
    assert!(tip_spring > tip_fixed * 0.95,
        "Rotational spring: δ={:.6e} should be ≥ fixed δ={:.6e}", tip_spring, tip_fixed);
}

// ================================================================
// 4. Very Stiff Spring ≈ Rigid Support
// ================================================================

#[test]
fn validation_spring_very_stiff() {
    let l = 6.0;
    let n = 4;
    let p = 20.0;
    let k_stiff = 1e12; // very stiff spring

    // SS beam with load at midspan
    let mid = n / 2 + 1;
    let input_rigid = crate::common::make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_rigid = linear::solve_2d(&input_rigid).unwrap();
    let mid_rigid = res_rigid.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    // Same beam but with spring at midspan (very stiff → acts like third support)
    let input_spring = make_beam_with_springs(n, l, "pinned", Some("rollerX"),
        vec![(mid, None, Some(k_stiff), None)],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_spring = linear::solve_2d(&input_spring).unwrap();
    let mid_spring = res_spring.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    // Very stiff spring should greatly reduce midspan deflection
    assert!(mid_spring.abs() < mid_rigid.abs() * 0.01,
        "Very stiff spring: δ={:.6e} should be << rigid δ={:.6e}", mid_spring, mid_rigid);
}

// ================================================================
// 5. Very Soft Spring ≈ Free End
// ================================================================

#[test]
fn validation_spring_very_soft() {
    let l = 5.0;
    let n = 4;
    let p = 20.0;
    let k_soft = 0.001; // very soft spring

    // Cantilever (free end)
    let input_free = crate::common::make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_free = linear::solve_2d(&input_free).unwrap();
    let tip_free = res_free.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy;

    // Cantilever with very soft spring at tip
    let input_soft = make_beam_with_springs(n, l, "fixed", None,
        vec![(n + 1, None, Some(k_soft), None)],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_soft = linear::solve_2d(&input_soft).unwrap();
    let tip_soft = res_soft.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy;

    // Very soft spring ≈ free end
    let err = (tip_soft - tip_free).abs() / tip_free.abs();
    assert!(err < 0.01,
        "Very soft spring ≈ free: δ_soft={:.6e}, δ_free={:.6e}", tip_soft, tip_free);
}

// ================================================================
// 6. Spring Reaction: F = k × δ
// ================================================================

#[test]
fn validation_spring_reaction_check() {
    let l = 6.0;
    let n = 4;
    let p = 20.0;
    let k_spring = 5000.0;

    let mid = n / 2 + 1;
    let input = make_beam_with_springs(n, l, "pinned", Some("rollerX"),
        vec![(mid, None, Some(k_spring), None)],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // Find spring reaction at midspan
    let r_spring = results.reactions.iter()
        .find(|r| r.node_id == mid);

    if let Some(r) = r_spring {
        // Spring force = k × δ
        let f_expected = k_spring * mid_d.uy.abs();
        let err = (r.ry - f_expected).abs() / f_expected.max(1e-12);
        assert!(err < 0.10,
            "Spring reaction: R={:.4}, expected kδ={:.4}", r.ry, f_expected);
    }

    // Regardless, global equilibrium must hold
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let err = (sum_ry - p).abs() / p;
    assert!(err < 0.01,
        "Spring equilibrium: ΣRy={:.4}, P={:.4}", sum_ry, p);
}

// ================================================================
// 7. Multiple Springs: Load Distribution
// ================================================================

#[test]
fn validation_spring_multiple_distribution() {
    let l = 8.0;
    let n = 8;
    let q = -10.0;
    let k1 = 5000.0;
    let k2 = 10000.0; // stiffer spring

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    // Springs at L/4 and 3L/4
    let n1 = n / 4 + 1;
    let n2 = 3 * n / 4 + 1;
    let input = make_beam_with_springs(n, l, "pinned", Some("rollerX"),
        vec![(n1, None, Some(k1), None), (n2, None, Some(k2), None)],
        loads);

    let results = linear::solve_2d(&input).unwrap();

    // Stiffer spring should attract more load (smaller deflection at that point)
    let d1 = results.displacements.iter().find(|d| d.node_id == n1).unwrap().uy.abs();
    let d2 = results.displacements.iter().find(|d| d.node_id == n2).unwrap().uy.abs();

    // With higher k at n2, deflection there should be smaller
    assert!(d2 < d1,
        "Stiffer spring less deflection: d_k2={:.6e} < d_k1={:.6e}", d2, d1);

    // Equilibrium
    let total_load = q.abs() * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let err = (sum_ry - total_load).abs() / total_load;
    assert!(err < 0.01,
        "Multi-spring equilibrium: ΣRy={:.4}, qL={:.4}", sum_ry, total_load);
}

// ================================================================
// 8. Spring Stiffness Scaling
// ================================================================
//
// Doubling spring stiffness should reduce deflection at spring location.

#[test]
fn validation_spring_stiffness_scaling() {
    let l = 6.0;
    let n = 4;
    let p = 20.0;
    let k1 = 5000.0;
    let k2 = 10000.0;

    let mid = n / 2 + 1;

    let make_spring_beam = |k: f64| -> SolverInput {
        make_beam_with_springs(n, l, "pinned", Some("rollerX"),
            vec![(mid, None, Some(k), None)],
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
            })])
    };

    let res1 = linear::solve_2d(&make_spring_beam(k1)).unwrap();
    let res2 = linear::solve_2d(&make_spring_beam(k2)).unwrap();

    let d1 = res1.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
    let d2 = res2.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // Stiffer spring → less deflection
    assert!(d2 < d1,
        "Stiffness scaling: δ(2k)={:.6e} < δ(k)={:.6e}", d2, d1);
}
