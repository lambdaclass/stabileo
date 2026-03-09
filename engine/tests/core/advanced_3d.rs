/// Integration tests for 3D advanced analysis: P-Delta, buckling, modal.
use dedaliano_engine::types::*;
use dedaliano_engine::solver::{pdelta, buckling, modal};
use std::collections::HashMap;

// Material/section constants
const E: f64 = 200_000.0;     // MPa (steel)
const NU: f64 = 0.3;
const A: f64 = 0.01;          // m²
const IY: f64 = 1e-4;         // m⁴
const IZ: f64 = 1e-4;         // m⁴
const J: f64 = 1.5e-4;        // m⁴ (torsional)
const L: f64 = 5.0;           // m
const DENSITY: f64 = 7_850.0; // kg/m³

// Derived: EI = E * 1000 * I = 200,000 * 1000 * 1e-4 = 20,000 kN·m²
const EI: f64 = 20_000.0;

fn make_3d_input(
    nodes: Vec<(usize, f64, f64, f64)>,
    mats: Vec<(usize, f64, f64)>,
    secs: Vec<(usize, f64, f64, f64, f64)>,
    elems: Vec<(usize, &str, usize, usize, usize, usize)>,
    sups: Vec<(usize, usize, bool, bool, bool, bool, bool, bool)>,
    loads: Vec<SolverLoad3D>,
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
            node_i: ni, node_j: nj,
            material_id: mi, section_id: si,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None,
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
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads, constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), curved_beams: vec![],    }
}

/// Build a 3D column along X-axis with n_elem elements.
/// start_sup/end_sup: (rx, ry, rz, rrx, rry, rrz) booleans.
fn make_3d_column(
    n_elem: usize,
    length: f64,
    start_sup: (bool, bool, bool, bool, bool, bool),
    end_sup: Option<(bool, bool, bool, bool, bool, bool)>,
    axial_load: f64,
) -> SolverInput3D {
    let elem_len = length / n_elem as f64;
    let nodes: Vec<_> = (0..=n_elem).map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..n_elem).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();

    let mut sups = vec![(1, 1, start_sup.0, start_sup.1, start_sup.2,
                         start_sup.3, start_sup.4, start_sup.5)];
    if let Some(es) = end_sup {
        sups.push((2, n_elem + 1, es.0, es.1, es.2, es.3, es.4, es.5));
    }

    let loads = if axial_load.abs() > 1e-20 {
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n_elem + 1,
            fx: axial_load, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })]
    } else {
        vec![]
    };

    make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems,
        sups,
        loads,
    )
}

/// Build a 3D portal frame in X-Z plane for P-Delta tests.
/// Columns along Z, beam along X.
fn make_3d_portal(
    h: f64, w: f64, lateral_load: f64, gravity_load: f64,
) -> SolverInput3D {
    // Nodes: 1=base-left, 2=top-left, 3=top-right, 4=base-right
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, h),
        (3, w, 0.0, h),
        (4, w, 0.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1), // left column (along Z)
        (2, "frame", 2, 3, 1, 1), // beam (along X)
        (3, "frame", 3, 4, 1, 1), // right column (along Z)
    ];
    // Fixed bases
    let sups = vec![
        (1, 1, true, true, true, true, true, true),
        (2, 4, true, true, true, true, true, true),
    ];

    let mut loads = Vec::new();
    if lateral_load.abs() > 1e-20 {
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: lateral_load, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
    }
    if gravity_load.abs() > 1e-20 {
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: gravity_load,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: 0.0, fz: gravity_load,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
    }

    make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems,
        sups,
        loads,
    )
}

fn make_densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), DENSITY);
    d
}

// ==================== 3D Buckling Tests ====================

#[test]
fn buckling_3d_euler_pinned_pinned() {
    // Pcr = π²EI/L² for pinned-pinned column
    // With symmetric section (Iy=Iz), first mode can buckle about either axis.
    let p = 100.0;
    // Pinned-pinned: restrain translations at both ends, free rotations
    // End 1: all translations + all rotations restrained (so it doesn't slide)
    // Actually for pinned: restrain translations, free rotations
    // But in 3D we also need to restrain torsion at least at one end
    let input = make_3d_column(
        4, L,
        (true, true, true, true, false, false),  // pinned: xyz + torsion restrained
        Some((false, true, true, true, false, false)), // rollerX: yz + torsion, x free
        -p,
    );
    let result = buckling::solve_buckling_3d(&input, 4).unwrap();

    let pcr_exact = std::f64::consts::PI.powi(2) * EI / (L * L);
    let lambda_exact = pcr_exact / p;

    assert!(!result.modes.is_empty(), "should find buckling modes");
    let lambda1 = result.modes[0].load_factor;
    let error = (lambda1 - lambda_exact).abs() / lambda_exact;

    assert!(
        error < 0.02,
        "3D Euler pinned-pinned: λ={:.2}, expected={:.2}, error={:.2}%",
        lambda1, lambda_exact, error * 100.0
    );
}

#[test]
fn buckling_3d_asymmetric_section() {
    // Asymmetric section: Iy << Iz → first mode buckles about weak axis (Y)
    let p = 100.0;
    let iy_weak = 1e-5; // 10× weaker
    let iz_strong = 1e-4;

    let n_elem = 4;
    let elem_len = L / n_elem as f64;
    let nodes: Vec<_> = (0..=n_elem).map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..n_elem).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();
    let sups = vec![
        (1, 1, true, true, true, true, false, false),
        (2, n_elem + 1, false, true, true, true, false, false),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n_elem + 1, fx: -p, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)],
        vec![(1, A, iy_weak, iz_strong, J)],
        elems, sups, loads,
    );

    let result = buckling::solve_buckling_3d(&input, 4).unwrap();

    // Weak axis: Pcr_weak = π²E*1000*Iy_weak/L² = π²*200e6*1e-5/25 = 7895.7 kN
    // Strong axis: Pcr_strong = π²E*1000*Iz_strong/L² = 10× larger
    let ei_weak = E * 1000.0 * iy_weak;
    let pcr_weak = std::f64::consts::PI.powi(2) * ei_weak / (L * L);
    let lambda_weak = pcr_weak / p;

    let lambda1 = result.modes[0].load_factor;
    let error = (lambda1 - lambda_weak).abs() / lambda_weak;

    assert!(
        error < 0.05,
        "3D weak-axis buckling: λ={:.2}, expected={:.2}, error={:.2}%",
        lambda1, lambda_weak, error * 100.0
    );
}

#[test]
fn buckling_3d_cantilever() {
    // Cantilever: Pcr = π²EI/(4L²)
    let p = 100.0;
    let input = make_3d_column(
        4, L,
        (true, true, true, true, true, true), // fixed
        None,                                   // free end
        -p,
    );
    let result = buckling::solve_buckling_3d(&input, 4).unwrap();

    let pcr_exact = std::f64::consts::PI.powi(2) * EI / (4.0 * L * L);
    let lambda_exact = pcr_exact / p;

    let lambda1 = result.modes[0].load_factor;
    let error = (lambda1 - lambda_exact).abs() / lambda_exact;

    assert!(
        error < 0.05,
        "3D cantilever: λ={:.2}, expected={:.2}, error={:.2}%",
        lambda1, lambda_exact, error * 100.0
    );
}

#[test]
fn buckling_3d_element_data() {
    let p = 100.0;
    let input = make_3d_column(
        4, L,
        (true, true, true, true, false, false),
        Some((false, true, true, true, false, false)),
        -p,
    );
    let result = buckling::solve_buckling_3d(&input, 2).unwrap();

    assert!(!result.element_data.is_empty(), "should have element data");
    for ed in &result.element_data {
        assert!(ed.axial_force < 0.0, "should be in compression");
        assert!(ed.critical_force > 0.0, "Pcr should be positive");
        assert!(ed.slenderness_y > 0.0 || ed.slenderness_z > 0.0, "slenderness should exist");
    }
}

// ==================== 3D Modal Tests ====================

#[test]
fn modal_3d_ss_beam_first_bending_mode() {
    // SS beam along X: ω₁ = (π/L)² × √(EI / ρA)
    // In solver units: EI in kN·m², ρA in tonnes/m
    let n_elem = 8;
    let elem_len = L / n_elem as f64;
    let nodes: Vec<_> = (0..=n_elem).map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..n_elem).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();
    // Pinned-pinned: translations restrained, rotations free
    let sups = vec![
        (1, 1, true, true, true, true, false, false),           // node 1: xyz + rx restrained
        (2, n_elem + 1, false, true, true, true, false, false), // end: yz + rx restrained
    ];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems, sups, vec![],
    );

    let densities = make_densities();
    let result = modal::solve_modal_3d(&input, &densities, 6).unwrap();

    assert!(!result.modes.is_empty(), "should find modes");

    let rho_a_solver = DENSITY * A / 1000.0; // tonnes/m
    let omega1_exact = (std::f64::consts::PI / L).powi(2) * (EI / rho_a_solver).sqrt();

    let omega1 = result.modes[0].omega;
    let error = (omega1 - omega1_exact).abs() / omega1_exact;

    assert!(
        error < 0.03,
        "3D SS beam ω₁={:.2}, expected={:.2}, error={:.2}%",
        omega1, omega1_exact, error * 100.0
    );
}

#[test]
fn modal_3d_cantilever_first_mode() {
    // ω₁ = (1.8751/L)² × √(EI/ρA)
    let n_elem = 8;
    let elem_len = L / n_elem as f64;
    let nodes: Vec<_> = (0..=n_elem).map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..n_elem).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();
    let sups = vec![(1, 1, true, true, true, true, true, true)]; // fixed

    let input = make_3d_input(
        nodes, vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems, sups, vec![],
    );

    let densities = make_densities();
    let result = modal::solve_modal_3d(&input, &densities, 6).unwrap();

    let rho_a_solver = DENSITY * A / 1000.0;
    let beta1 = 1.8751;
    let omega1_exact = (beta1 / L).powi(2) * (EI / rho_a_solver).sqrt();

    let omega1 = result.modes[0].omega;
    let error = (omega1 - omega1_exact).abs() / omega1_exact;

    assert!(
        error < 0.03,
        "3D cantilever ω₁={:.2}, expected={:.2}, error={:.2}%",
        omega1, omega1_exact, error * 100.0
    );
}

#[test]
fn modal_3d_total_mass() {
    let n_elem = 4;
    let elem_len = L / n_elem as f64;
    let nodes: Vec<_> = (0..=n_elem).map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..n_elem).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();
    let sups = vec![
        (1, 1, true, true, true, true, false, false),
        (2, n_elem + 1, false, true, true, true, false, false),
    ];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems, sups, vec![],
    );

    let densities = make_densities();
    let result = modal::solve_modal_3d(&input, &densities, 4).unwrap();

    // Total mass = ρ × A × L / 1000 = 7850 × 0.01 × 5 / 1000 = 0.3925 tonnes
    let expected_mass = DENSITY * A * L / 1000.0;
    let error = (result.total_mass - expected_mass).abs() / expected_mass;
    assert!(error < 0.01, "total_mass={:.6}, expected={:.6}", result.total_mass, expected_mass);
}

#[test]
fn modal_3d_participation_and_rayleigh() {
    let n_elem = 8;
    let elem_len = L / n_elem as f64;
    let nodes: Vec<_> = (0..=n_elem).map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..n_elem).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();
    let sups = vec![
        (1, 1, true, true, true, true, false, false),
        (2, n_elem + 1, false, true, true, true, false, false),
    ];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems, sups, vec![],
    );

    let densities = make_densities();
    let result = modal::solve_modal_3d(&input, &densities, 6).unwrap();

    // Check participation factors exist
    let any_participation = result.modes.iter().any(|m|
        m.participation_x.abs() > 1e-10 ||
        m.participation_y.abs() > 1e-10 ||
        m.participation_z.abs() > 1e-10
    );
    assert!(any_participation, "should have nonzero participation");

    // Rayleigh damping
    if result.modes.len() >= 2 {
        let rayleigh = result.rayleigh.as_ref().expect("should have Rayleigh damping");
        assert!(rayleigh.a0 > 0.0);
        assert!(rayleigh.a1 > 0.0);
    }
}

#[test]
fn modal_3d_no_density_fails() {
    let input = make_3d_column(
        2, L,
        (true, true, true, true, true, true),
        None, 0.0,
    );
    let densities = HashMap::new();
    let result = modal::solve_modal_3d(&input, &densities, 2);
    assert!(result.is_err(), "should fail with no mass");
}

// ==================== 3D P-Delta Tests ====================

#[test]
fn pdelta_3d_portal_amplifies_sway() {
    let input = make_3d_portal(4.0, 6.0, 20.0, -100.0);

    let linear = dedaliano_engine::solver::linear::solve_3d(&input).unwrap();
    let pdelta = pdelta::solve_pdelta_3d(&input, 20, 1e-4).unwrap();

    assert!(pdelta.converged, "should converge");
    assert!(pdelta.is_stable, "should be stable");

    // Lateral displacement at top node (fx direction = ux)
    let lin_ux = linear.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let pd_ux = pdelta.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // P-Delta sway should exceed linear
    assert!(
        pd_ux.abs() > lin_ux.abs() * 0.99,
        "P-Delta ux ({:.6}) should exceed linear ({:.6})",
        pd_ux.abs(), lin_ux.abs()
    );
}

#[test]
fn pdelta_3d_b2_factor() {
    let input = make_3d_portal(4.0, 6.0, 20.0, -100.0);
    let pdelta = pdelta::solve_pdelta_3d(&input, 20, 1e-4).unwrap();

    assert!(
        pdelta.b2_factor >= 1.0 && pdelta.b2_factor < 5.0,
        "B2={:.4} should be reasonable", pdelta.b2_factor
    );
}

#[test]
fn pdelta_3d_convergence() {
    let input = make_3d_portal(4.0, 6.0, 20.0, -50.0);
    let pdelta = pdelta::solve_pdelta_3d(&input, 20, 1e-4).unwrap();

    assert!(pdelta.converged, "should converge");
    assert!(pdelta.iterations < 15, "took {} iterations", pdelta.iterations);
}

#[test]
fn pdelta_3d_no_gravity_matches_linear() {
    let input = make_3d_portal(4.0, 6.0, 20.0, 0.0);
    let pdelta = pdelta::solve_pdelta_3d(&input, 20, 1e-4).unwrap();

    let lin_ux = pdelta.linear_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let pd_ux = pdelta.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    let ratio = if lin_ux.abs() > 1e-10 { pd_ux / lin_ux } else { 1.0 };
    assert!(
        (ratio - 1.0).abs() < 0.05,
        "No gravity: ratio={:.4}, should be ~1.0", ratio
    );
}

#[test]
fn pdelta_3d_includes_linear_results() {
    let input = make_3d_portal(4.0, 6.0, 20.0, -50.0);
    let pdelta = pdelta::solve_pdelta_3d(&input, 20, 1e-4).unwrap();

    assert!(!pdelta.linear_results.displacements.is_empty());
    assert!(!pdelta.linear_results.reactions.is_empty());
    assert!(!pdelta.linear_results.element_forces.is_empty());
}
