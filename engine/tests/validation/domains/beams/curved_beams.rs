/// Validation: Curved Beam (Arch) Analysis via 3D Solver
///
/// Benchmarks:
///   1. VM18 — Quarter-circle cantilever, out-of-plane load (Timoshenko, δ=-2.648 in)
///   2. Roark Ring — Full circle under diametrically opposite loads (δ=0.1488·PR³/EI)
///   3. Convergence — VM18 problem with N=4,8,16 segments
///   4. Degenerate collinear — straight beam from collinear points
///   5. Parabolic arch — 3-hinge arch under UDL, Roark horizontal thrust formula
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// Build a 3D input with curved beams.
fn make_arch_input(
    nodes: Vec<(usize, f64, f64, f64)>,
    curved_beams: Vec<CurvedBeamInput>,
    supports: Vec<(usize, Vec<bool>)>,
    loads: Vec<SolverLoad3D>,
    mat_e: f64,
    mat_nu: f64,
    sec_a: f64,
    sec_iy: f64,
    sec_iz: f64,
    sec_j: f64,
) -> SolverInput3D {
    let mut nodes_map = HashMap::new();
    for (id, x, y, z) in nodes {
        nodes_map.insert(id.to_string(), SolverNode3D { id, x, y, z });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: mat_e, nu: mat_nu });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: sec_a, iy: sec_iy, iz: sec_iz, j: sec_j, cw: None,
        as_y: None, as_z: None,
    });
    let mut sups_map = HashMap::new();
    for (i, (nid, dofs)) in supports.iter().enumerate() {
        sups_map.insert((i + 1).to_string(), SolverSupport3D {
            node_id: *nid,
            rx: dofs[0], ry: dofs[1], rz: dofs[2],
            rrx: dofs[3], rry: dofs[4], rrz: dofs[5],
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        });
    }
    SolverInput3D {
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
    }
}

// ================================================================
// 1. VM18 — Quarter-Circle Cantilever, Out-of-Plane Load
// ================================================================
//
// Source: ANSYS VM18, Timoshenko *Strength of Materials* Part II, p.412
// Quarter-circle bar in XZ plane, R=100 in, circular d=2 in section,
// E=30×10⁶ psi, ν=0.3, fixed at one end, F=50 lb out-of-plane at free end.
// Reference: δ_B = 2.648 in (magnitude)
// Analytical: δ = F·R³·[π/(4EI) + (3π/4-2)/(GJ)]
//
// SI conversion: E=206842.7 MPa, R=2.54 m, d=0.0508 m, F=0.2224 kN

fn vm18_params() -> (f64, f64, f64, f64, f64, f64, f64, f64, f64) {
    let e_mpa = 206_842.7;    // 30e6 psi -> MPa
    let nu = 0.3;
    let r = 2.54;              // 100 in -> m
    let d: f64 = 0.0508;       // 2 in -> m (circular section diameter)
    let a = std::f64::consts::PI * d * d / 4.0;
    let i_val = std::f64::consts::PI * d.powi(4) / 64.0;
    let j_val = std::f64::consts::PI * d.powi(4) / 32.0;
    let f_kn = 0.2224;        // 50 lb -> kN

    // Reference deflection in meters: 2.648 in = 0.06726 m
    let delta_ref = 0.06726;

    (e_mpa, nu, r, a, i_val, i_val, j_val, f_kn, delta_ref)
}

fn vm18_solve(n_segments: usize) -> (f64, f64) {
    let (e_mpa, nu, r, a, iy, iz, j, f_kn, delta_ref) = vm18_params();

    // Quarter-circle in XZ plane: from (R,0,0) to (0,0,R)
    // Mid-point at 45°: (R·cos45, 0, R·sin45)
    let cos45 = std::f64::consts::FRAC_PI_4.cos();
    let sin45 = std::f64::consts::FRAC_PI_4.sin();

    let nodes = vec![
        (1, r, 0.0, 0.0),
        (2, r * cos45, 0.0, r * sin45),
        (3, 0.0, 0.0, r),
    ];

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

    // Fixed at node 1 (base), free at node 3 (tip)
    let supports = vec![
        (1, vec![true, true, true, true, true, true]),
    ];

    // Out-of-plane load (Y direction) at free end
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx: 0.0, fy: f_kn, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_arch_input(nodes, curved_beams, supports, loads,
        e_mpa, nu, a, iy, iz, j);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    (tip.uy.abs(), delta_ref)
}

#[test]
fn validation_curved_vm18_quarter_circle_out_of_plane() {
    let (computed, reference) = vm18_solve(16);
    let error = (computed - reference).abs() / reference;
    assert!(
        error < 0.05,
        "VM18: computed δ={:.6e} m, reference={:.6e} m, error={:.1}%",
        computed, reference, error * 100.0
    );
}

// ================================================================
// 2. Roark Ring — Full Circle Under Diametrically Opposite Loads
// ================================================================
//
// Source: Roark *Formulas for Stress and Strain*, Table 9.2, Case 1
// Complete circular ring, two equal opposite forces P along diameter.
// Reference: δ = 0.1488 · P·R³/(E_eff·I)

#[test]
fn validation_curved_roark_ring_diametral_loads() {
    let e_mpa = 200_000.0;
    let nu = 0.3;
    let e_eff = e_mpa * 1000.0; // kN/m²
    let r: f64 = 1.0;
    let side: f64 = 0.05; // 50mm square section
    let a = side * side;
    let i_val = side.powi(4) / 12.0;
    let j_val = 2.25 * side.powi(4) / 16.0;
    let p = 10.0; // kN

    let delta_ref = 0.1488 * p * r.powi(3) / (e_eff * i_val);

    // Model full ring as two semicircular curved beams.
    // Semicircle 1: bottom (0,-R,0) -> right (R,0,0) -> top (0,R,0)
    // Semicircle 2: top (0,R,0) -> left (-R,0,0) -> bottom (0,-R,0)
    // Ring lies in XY plane, loads along Y at top and bottom.
    let n_seg = 16;

    let nodes = vec![
        (1, 0.0, -r, 0.0),   // bottom (load point)
        (2, r, 0.0, 0.0),     // right (mid of semicircle 1)
        (3, 0.0, r, 0.0),     // top (load point)
        (4, -r, 0.0, 0.0),    // left (mid of semicircle 2)
    ];

    let curved_beams = vec![
        CurvedBeamInput {
            node_start: 1, node_mid: 2, node_end: 3,
            material_id: 1, section_id: 1,
            num_segments: n_seg, hinge_start: false, hinge_end: false,
        },
        CurvedBeamInput {
            node_start: 3, node_mid: 4, node_end: 1,
            material_id: 1, section_id: 1,
            num_segments: n_seg, hinge_start: false, hinge_end: false,
        },
    ];

    // Restrain rigid body: fix translations at bottom node, fix X at top node
    let supports = vec![
        (1, vec![true, true, true, false, false, false]),  // fix X,Y,Z at bottom
        (3, vec![true, false, true, false, false, false]),  // fix X,Z at top (free to move in Y)
    ];

    // Diametrically opposite loads: P upward at bottom, P downward at top
    // (compressing the ring along Y)
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 1, fx: 0.0, fy: p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let input = make_arch_input(nodes, curved_beams, supports, loads,
        e_mpa, nu, a, i_val, i_val, j_val);
    let results = linear::solve_3d(&input).unwrap();

    // The relative approach of the two load points:
    // Bottom is fixed in Y, so the ring contracts by the top moving down.
    let top = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let computed = top.uy.abs();

    let error = (computed - delta_ref).abs() / delta_ref;
    assert!(
        error < 0.05,
        "Roark ring: computed δ={:.6e} m, reference={:.6e} m, error={:.1}%",
        computed, delta_ref, error * 100.0
    );
}

// ================================================================
// 3. Convergence Test: VM18 with N=4, 8, 16 Segments
// ================================================================

#[test]
fn validation_curved_convergence_with_segments() {
    let mut deflections = Vec::new();
    for &n_seg in &[4, 8, 16] {
        let (computed, _) = vm18_solve(n_seg);
        deflections.push((n_seg, computed));
    }

    // Successive differences should decrease (convergence)
    let diff_4_8 = (deflections[1].1 - deflections[0].1).abs();
    let diff_8_16 = (deflections[2].1 - deflections[1].1).abs();

    assert!(
        diff_8_16 < diff_4_8 + 1e-10,
        "Convergence: |d16-d8|={:.6e} should be < |d8-d4|={:.6e}",
        diff_8_16, diff_4_8
    );

    // 16-segment result should be within 10% of reference
    let ref_delta = 0.06726; // VM18 reference (2.648 in)
    let error_16 = (deflections[2].1 - ref_delta).abs() / ref_delta;
    assert!(
        error_16 < 0.10,
        "16-segment VM18 should be within 10% of reference, error={:.1}%",
        error_16 * 100.0
    );
}

// ================================================================
// 4. Degenerate Case: Collinear Points -> Straight Elements
// ================================================================

#[test]
fn validation_curved_degenerate_collinear() {
    let e_mpa = 200_000.0;
    let e_eff = e_mpa * 1000.0;
    let l = 6.0;
    let p = 20.0;
    let a = 0.01;
    let iz = 1e-4;
    let iy = 1e-4;
    let j = 1.5e-4;

    // Three collinear points along X axis
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, l / 2.0, 0.0, 0.0),
        (3, l, 0.0, 0.0),
    ];

    let curved_beams = vec![CurvedBeamInput {
        node_start: 1, node_mid: 2, node_end: 3,
        material_id: 1, section_id: 1,
        num_segments: 8, hinge_start: false, hinge_end: false,
    }];

    // Simply supported: pin at 1, roller (free X) at 3
    let supports = vec![
        (1, vec![true, true, true, true, false, false]),
        (3, vec![false, true, true, true, false, false]),
    ];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_arch_input(nodes, curved_beams, supports, loads,
        e_mpa, 0.3, a, iy, iz, j);
    let results = linear::solve_3d(&input).unwrap();

    // Compare with beam theory: δ = P·L³/(48·E·I) for SS beam, center point load
    let delta_analytical = p * l.powi(3) / (48.0 * e_eff * iz);
    let mid = results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    let ratio = mid.uy.abs() / delta_analytical;
    assert!(
        ratio > 0.5 && ratio < 2.0,
        "Collinear curved beam deflection ratio={:.3} (uy={:.6e}, analytical={:.6e})",
        ratio, mid.uy.abs(), delta_analytical
    );

    // Reactions should sum to P
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert!(
        (sum_fy - p).abs() < 1.0,
        "Collinear curved beam: sum_fy={:.4}, expected={:.4}", sum_fy, p
    );
}

// ================================================================
// 5. Parabolic Arch — 3-Hinge Arch Under Vertical Load
// ================================================================
//
// Source: Roark *Formulas for Stress and Strain*, 3-hinge arch formulas
// Parabolic arch: y(x) = 4h·x(L-x)/L²
// Under concentrated vertical load P at crown:
//   H = P·L/(4h) (horizontal thrust)
//   V = P/2 at each support
//
// Use curved beam element to model the arch, pin supports at both ends.
// Crown node is free (internal hinge not needed for 2-hinge arch version).

#[test]
fn validation_curved_parabolic_arch() {
    let e_mpa = 200_000.0;
    let e_eff = e_mpa * 1000.0;
    let nu = 0.3;
    let l: f64 = 10.0;
    let h: f64 = 2.5; // rise
    let p = 50.0; // kN at crown

    // Section properties
    let side: f64 = 0.15; // 150mm square
    let a = side * side;
    let i_val = side.powi(4) / 12.0;
    let j_val = 0.141 * side.powi(4);

    // 3-point definition for parabolic arch:
    // Start (0,0,0), mid (L/2, h, 0), end (L, 0, 0)
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),       // left support
        (2, l / 2.0, h, 0.0),      // crown
        (3, l, 0.0, 0.0),          // right support
    ];

    let curved_beams = vec![CurvedBeamInput {
        node_start: 1,
        node_mid: 2,
        node_end: 3,
        material_id: 1,
        section_id: 1,
        num_segments: 16,
        hinge_start: false,
        hinge_end: false,
    }];

    // Pinned supports at both ends (restrain translations, free rotations)
    let supports = vec![
        (1, vec![true, true, true, false, false, false]),
        (3, vec![true, true, true, false, false, false]),
    ];

    // Vertical load at crown
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_arch_input(nodes, curved_beams, supports, loads,
        e_mpa, nu, a, i_val, i_val, j_val);
    let results = linear::solve_3d(&input).unwrap();

    // Vertical equilibrium: each support gets P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    let sum_fy = r1.fy + r3.fy;
    assert!(
        (sum_fy - p).abs() / p < 0.02,
        "Arch ΣRy={:.4}, expected P={:.4}", sum_fy, p
    );

    // Horizontal thrust: H = P·L/(4h) for parabolic 2-hinge arch (approximate)
    // For 2-hinge arch under crown load, exact is close to this.
    let h_analytical = p * l / (4.0 * h);

    // Horizontal reactions should be equal and opposite
    let h_left = r1.fx.abs();
    let h_right = r3.fx.abs();
    assert!(
        (h_left - h_right).abs() / h_left.max(1.0) < 0.05,
        "Horizontal reactions should be symmetric: left={:.4}, right={:.4}", h_left, h_right
    );

    // Horizontal thrust should be in right ballpark
    // (2-hinge vs 3-hinge differs, so allow 30% tolerance)
    let error_h = (h_left - h_analytical).abs() / h_analytical;
    assert!(
        error_h < 0.30,
        "Arch thrust: computed H={:.4}, analytical={:.4}, error={:.1}%",
        h_left, h_analytical, error_h * 100.0
    );

    // Crown should deflect downward
    let crown = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(crown.uy < 0.0,
        "Crown should deflect down, got uy={:.6e}", crown.uy);

    // Crown deflection should be much smaller than a beam of same span
    // (arch action greatly reduces deflection)
    let beam_delta = p * l.powi(3) / (48.0 * e_eff * i_val);
    assert!(
        crown.uy.abs() < beam_delta,
        "Arch deflection={:.6e} should be less than beam={:.6e} (arch action)",
        crown.uy.abs(), beam_delta
    );
}
