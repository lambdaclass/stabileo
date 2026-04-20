/// Validation: 2D Inclined Supports
///
/// Tests constraint transformation for inclined rollers and rotated springs
/// in the 2D solver.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;  // MPa (steel)
const A: f64 = 0.01;       // m²
const IZ: f64 = 1e-4;      // m⁴

fn make_support(id: usize, node_id: usize, support_type: &str) -> SolverSupport {
    SolverSupport {
        id,
        node_id,
        support_type: support_type.to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None,
        angle: None,
    }
}

fn make_inclined_roller(id: usize, node_id: usize, angle: f64) -> SolverSupport {
    SolverSupport {
        id,
        node_id,
        support_type: "inclinedRoller".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None,
        angle: Some(angle),
    }
}

fn make_simple_beam(
    end_support: SolverSupport,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 5.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), make_support(1, 1, "pinned"));
    supports.insert("2".to_string(), end_support);

    SolverInput { nodes, materials, sections, elements, supports, loads, constraints: vec![], connectors: HashMap::new() }
}

// ================================================================
// 1. Inclined roller at 0° should match rollerX behavior
// ================================================================
#[test]
fn validation_2d_inclined_roller_0_matches_roller_x() {
    let load = SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 });

    // rollerX case
    let input_rx = make_simple_beam(
        make_support(2, 2, "rollerX"),
        vec![load.clone()],
    );
    let res_rx = linear::solve_2d(&input_rx).unwrap();

    // inclinedRoller at 0°
    let input_inc = make_simple_beam(
        make_inclined_roller(2, 2, 0.0),
        vec![load],
    );
    let res_inc = linear::solve_2d(&input_inc).unwrap();

    let rz_rx = res_rx.reactions.iter().find(|r| r.node_id == 2).unwrap().rz;
    let rz_inc = res_inc.reactions.iter().find(|r| r.node_id == 2).unwrap().rz;

    assert!(
        (rz_rx - rz_inc).abs() < 0.01,
        "Inclined roller at 0° should match rollerX: rz_rollerX={}, rz_inclined={}",
        rz_rx, rz_inc
    );

    // Horizontal reaction at node 2 should be ~0 (free in X)
    let rx_inc = res_inc.reactions.iter().find(|r| r.node_id == 2).unwrap().rx;
    assert!(
        rx_inc.abs() < 0.01,
        "Inclined roller at 0° should have rx≈0, got {}",
        rx_inc
    );
}

// ================================================================
// 2. 45° inclined roller: reaction has equal horizontal and vertical
// ================================================================
#[test]
fn validation_2d_inclined_roller_45_equal_components() {
    let input = make_simple_beam(
        make_inclined_roller(2, 2, std::f64::consts::FRAC_PI_4),
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 })],
    );

    let res = linear::solve_2d(&input).unwrap();
    let r2 = res.reactions.iter().find(|r| r.node_id == 2).unwrap();

    // At 45°, the reaction is along (sin 45°, cos 45°) = (1/√2, 1/√2)
    // So |rx| ≈ |rz|
    assert!(
        (r2.rx.abs() - r2.rz.abs()).abs() < 0.1,
        "45° inclined roller: |rx| should ≈ |rz|, got rx={}, rz={}",
        r2.rx, r2.rz
    );
}

// ================================================================
// 3. Global equilibrium with inclined roller
// ================================================================
#[test]
fn validation_2d_inclined_roller_equilibrium() {
    let angles = [30.0, 45.0, 60.0, 120.0, 135.0, 150.0, 210.0, 300.0];
    for &deg in &angles {
        let rad = deg * std::f64::consts::PI / 180.0;
        let input = make_simple_beam(
            make_inclined_roller(2, 2, rad),
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -15.0, my: 0.0 })],
        );

        let res = linear::solve_2d(&input).unwrap();
        let total_rx: f64 = res.reactions.iter().map(|r| r.rx).sum();
        let total_rz: f64 = res.reactions.iter().map(|r| r.rz).sum();

        assert!(
            total_rx.abs() < 0.1,
            "{}° inclined roller: ΣFx should ≈ 0, got {}",
            deg, total_rx
        );
        assert!(
            (total_rz - 15.0).abs() < 0.1,
            "{}° inclined roller: ΣFz should ≈ 15, got {}",
            deg, total_rz
        );
    }
}

// ================================================================
// 4. Displacement perpendicular to rolling surface should be ≈ 0
// ================================================================
#[test]
fn validation_2d_inclined_roller_displacement_constraint() {
    let angles = [30.0, 45.0, 60.0, 120.0, 135.0, 300.0];
    for &deg in &angles {
        let rad = deg * std::f64::consts::PI / 180.0;
        let input = make_simple_beam(
            make_inclined_roller(2, 2, rad),
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -15.0, my: 0.0 })],
        );

        let res = linear::solve_2d(&input).unwrap();
        let d2 = res.displacements.iter().find(|d| d.node_id == 2).unwrap();

        // Component along the restrained direction (sin θ, cos θ) should be ≈ 0
        let u_perp = d2.ux * rad.sin() + d2.uz * rad.cos();
        assert!(
            u_perp.abs() < 1e-6,
            "{}° inclined roller: u_perp should ≈ 0, got {} (ux={}, uz={})",
            deg, u_perp, d2.ux, d2.uz
        );
    }
}

// ================================================================
// 5. Inclined roller at 180° should match inclined roller at 0°
// ================================================================
#[test]
fn validation_2d_inclined_roller_180_matches_0() {
    let load = SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 });

    let input_0 = make_simple_beam(
        make_inclined_roller(2, 2, 0.0),
        vec![load.clone()],
    );
    let input_pi = make_simple_beam(
        make_inclined_roller(2, 2, std::f64::consts::PI),
        vec![load],
    );

    let res_0 = linear::solve_2d(&input_0).unwrap();
    let res_pi = linear::solve_2d(&input_pi).unwrap();

    let d2_0 = res_0.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d2_pi = res_pi.displacements.iter().find(|d| d.node_id == 2).unwrap();

    assert!(
        (d2_0.uz - d2_pi.uz).abs() < 1e-6,
        "180° should match 0°: uz_0={}, uz_180={}",
        d2_0.uz, d2_pi.uz
    );
}

// ================================================================
// 6. Rotated spring at 0° (no rotation): standard behavior
// ================================================================
#[test]
fn validation_2d_rotated_spring_0_standard() {
    let load = SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 });

    // Standard spring
    let mut sup_std = make_support(2, 2, "spring");
    sup_std.ky = Some(5000.0);

    // Rotated spring at 0°
    let mut sup_rot = make_support(2, 2, "spring");
    sup_rot.ky = Some(5000.0);
    sup_rot.angle = Some(0.0);

    let input_std = make_simple_beam(sup_std, vec![load.clone()]);
    let input_rot = make_simple_beam(sup_rot, vec![load]);

    let res_std = linear::solve_2d(&input_std).unwrap();
    let res_rot = linear::solve_2d(&input_rot).unwrap();

    let d2_std = res_std.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d2_rot = res_rot.displacements.iter().find(|d| d.node_id == 2).unwrap();

    assert!(
        (d2_std.uz - d2_rot.uz).abs() < 1e-8,
        "Rotated spring at 0° should match standard: uz_std={}, uz_rot={}",
        d2_std.uz, d2_rot.uz
    );
}

// ================================================================
// 7. Rotated spring at 90°: kx acts vertically
// ================================================================
#[test]
fn validation_2d_rotated_spring_90() {
    let load = SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 });

    // Standard: ky = 5000 (vertical stiffness)
    let mut sup_std = make_support(2, 2, "spring");
    sup_std.ky = Some(5000.0);

    // Rotated 90°: kx = 5000 should act vertically
    let mut sup_rot = make_support(2, 2, "spring");
    sup_rot.kx = Some(5000.0);
    sup_rot.angle = Some(std::f64::consts::FRAC_PI_2);

    let input_std = make_simple_beam(sup_std, vec![load.clone()]);
    let input_rot = make_simple_beam(sup_rot, vec![load]);

    let res_std = linear::solve_2d(&input_std).unwrap();
    let res_rot = linear::solve_2d(&input_rot).unwrap();

    let d2_std = res_std.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d2_rot = res_rot.displacements.iter().find(|d| d.node_id == 2).unwrap();

    assert!(
        (d2_std.uz - d2_rot.uz).abs() < 1e-4,
        "Spring kx rotated 90° should match ky: uz_std={}, uz_rot={}",
        d2_std.uz, d2_rot.uz
    );
}

// ================================================================
// 8. Rotated spring at 45°: stiffness couples both directions
// ================================================================
#[test]
fn validation_2d_rotated_spring_45_coupling() {
    let load = SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 });

    let mut sup = make_support(2, 2, "spring");
    sup.kx = Some(10000.0);
    sup.ky = Some(0.0);
    sup.angle = Some(std::f64::consts::FRAC_PI_4);

    let input = make_simple_beam(sup, vec![load]);
    let res = linear::solve_2d(&input).unwrap();
    let d2 = res.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // With a spring only in the 45° direction, both ux and uz should be non-zero
    assert!(d2.uz < 0.0, "Should deflect downward, got uz={}", d2.uz);
    assert!(
        d2.ux.abs() > 1e-6,
        "45° spring coupling should produce horizontal displacement, got ux={}",
        d2.ux
    );
}

// ================================================================
// 9. Rotated spring equilibrium
// ================================================================
#[test]
fn validation_2d_rotated_spring_equilibrium() {
    let mut sup = make_support(2, 2, "spring");
    sup.kx = Some(8000.0);
    sup.ky = Some(2000.0);
    sup.kz = Some(100.0);
    sup.angle = Some(std::f64::consts::FRAC_PI_3);

    let input = make_simple_beam(
        sup,
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 5.0, fz: -10.0, my: 0.0 })],
    );

    let res = linear::solve_2d(&input).unwrap();
    let total_rx: f64 = res.reactions.iter().map(|r| r.rx).sum();
    let total_rz: f64 = res.reactions.iter().map(|r| r.rz).sum();

    assert!(
        (total_rx + 5.0).abs() < 0.1,
        "ΣFx should ≈ -5, got {}",
        total_rx
    );
    assert!(
        (total_rz - 10.0).abs() < 0.1,
        "ΣFz should ≈ 10, got {}",
        total_rz
    );
}

// ================================================================
// 10. Symmetric inclined rollers: symmetric response
// ================================================================
#[test]
fn validation_2d_symmetric_inclined_rollers() {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 3.0, z: 0.0 });
    nodes.insert("3".to_string(), SolverNode { id: 3, x: 6.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });
    elements.insert("2".to_string(), SolverElement {
        id: 2, elem_type: "frame".to_string(),
        node_i: 2, node_j: 3, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let pi4 = std::f64::consts::FRAC_PI_4;
    let mut supports = HashMap::new();
    supports.insert("1".to_string(), make_inclined_roller(1, 1, pi4));
    supports.insert("2".to_string(), make_support(2, 2, "pinned"));
    supports.insert("3".to_string(), make_inclined_roller(3, 3, -pi4));

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: -10.0, my: 0.0,
    })];

    let input = SolverInput {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![], connectors: HashMap::new(),
    };

    let res = linear::solve_2d(&input).unwrap();

    let r1 = res.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = res.reactions.iter().find(|r| r.node_id == 3).unwrap();

    // By symmetry: |rz_1| ≈ |rz_3| and rx_1 ≈ -rx_3
    assert!(
        (r1.rz.abs() - r3.rz.abs()).abs() < 0.1,
        "Symmetric: |rz_1| should ≈ |rz_3|, got rz_1={}, rz_3={}",
        r1.rz, r3.rz
    );
    assert!(
        (r1.rx + r3.rx).abs() < 0.1,
        "Symmetric: rx_1 should ≈ -rx_3, got rx_1={}, rx_3={}",
        r1.rx, r3.rx
    );

    let total_rz: f64 = res.reactions.iter().map(|r| r.rz).sum();
    assert!(
        (total_rz - 10.0).abs() < 0.1,
        "ΣFz should ≈ 10, got {}",
        total_rz
    );
}

// ================================================================
// 11. Triangular truss with inclined roller
// ================================================================
#[test]
fn validation_2d_inclined_roller_truss() {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 4.0, z: 0.0 });
    nodes.insert("3".to_string(), SolverNode { id: 3, x: 2.0, z: 3.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "truss".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });
    elements.insert("2".to_string(), SolverElement {
        id: 2, elem_type: "truss".to_string(),
        node_i: 2, node_j: 3, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });
    elements.insert("3".to_string(), SolverElement {
        id: 3, elem_type: "truss".to_string(),
        node_i: 1, node_j: 3, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let angle_30 = std::f64::consts::PI / 6.0;
    let mut supports = HashMap::new();
    supports.insert("1".to_string(), make_support(1, 1, "pinned"));
    supports.insert("2".to_string(), make_inclined_roller(2, 2, angle_30));

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: -10.0, my: 0.0,
    })];

    let input = SolverInput {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![], connectors: HashMap::new(),
    };

    let res = linear::solve_2d(&input).unwrap();

    // Equilibrium
    let total_rx: f64 = res.reactions.iter().map(|r| r.rx).sum();
    let total_rz: f64 = res.reactions.iter().map(|r| r.rz).sum();
    assert!(total_rx.abs() < 0.1, "ΣFx should ≈ 0, got {}", total_rx);
    assert!((total_rz - 10.0).abs() < 0.1, "ΣFz should ≈ 10, got {}", total_rz);

    // Displacement at node 2 should be constrained in the 30° direction
    let d2 = res.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let u_perp = d2.ux * angle_30.sin() + d2.uz * angle_30.cos();
    assert!(
        u_perp.abs() < 1e-6,
        "30° inclined roller truss: u_perp should ≈ 0, got {}",
        u_perp
    );
}

// ================================================================
// 12. Equilibrium summary diagnostic must be correct for inclined supports
// ================================================================
#[test]
fn validation_2d_inclined_roller_equilibrium_summary_correct() {
    // The EquilibriumSummary must report equilibrium_ok = true when inclined
    // rollers are present. Before the fix, reactions were summed in the rotated
    // local frame, causing a false imbalance.
    let angles = [30.0, 45.0, 60.0, 120.0];
    for &deg in &angles {
        let rad = deg * std::f64::consts::PI / 180.0;
        let input = make_simple_beam(
            make_inclined_roller(2, 2, rad),
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -15.0, my: 0.0 })],
        );

        let res = linear::solve_2d(&input).unwrap();
        let eq = res.equilibrium.as_ref().expect("equilibrium summary should be present");

        assert!(
            eq.equilibrium_ok,
            "{}° inclined roller: equilibrium summary should report OK, \
             but max_imbalance={:.6e}, reaction_sum={:?}, applied_sum={:?}",
            deg, eq.max_imbalance, eq.reaction_force_sum, eq.applied_force_sum
        );

        assert!(
            eq.max_imbalance < 1e-3,
            "{}° inclined roller: equilibrium imbalance should be near zero, got {:.6e}",
            deg, eq.max_imbalance
        );
    }
}
