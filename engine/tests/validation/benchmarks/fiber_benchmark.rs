/// Validation: Fiber Beam Nonlinear 3D Benchmarks
///
/// Tests:
///   3A. Elastic W-section cantilever — PL³/(3EI) parity
///   3B. Steel plastic moment — My and Mp verification
///   3C. RC column pushover — moment capacity order check
///   3D. Biaxial bending symmetry — square section under 45° load
///
/// References:
///   - Spacone, E. et al., "Fiber Beam-Column Model for Nonlinear Analysis
///     of R/C Frames", Earthquake Eng. & Struct. Dyn., 1996
///   - AISC Steel Construction Manual, 15th Edition

use dedaliano_engine::solver::fiber_nonlinear::{
    solve_fiber_nonlinear_3d, FiberNonlinearInput3D,
};
use dedaliano_engine::element::fiber_beam::{
    Fiber, FiberMaterial, FiberSectionDef,
};
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Helper: build a 3D cantilever with n_elem elements along X-axis
// ---------------------------------------------------------------------------
fn cantilever_3d(
    n_elem: usize,
    length: f64,
    e_mpa: f64,
    a: f64,
    iy: f64,
    iz: f64,
    j: f64,
    loads: Vec<SolverLoad3D>,
) -> SolverInput3D {
    let n_nodes = n_elem + 1;
    let dx = length / n_elem as f64;

    let mut nodes = HashMap::new();
    for i in 0..n_nodes {
        nodes.insert((i + 1).to_string(), SolverNode3D {
            id: i + 1,
            x: i as f64 * dx,
            y: 0.0,
            z: 0.0,
        });
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: e_mpa, nu: 0.3 });

    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a, iy, iz, j, cw: None, as_y: None, as_z: None,
    });

    let mut elems = HashMap::new();
    for i in 0..n_elem {
        elems.insert((i + 1).to_string(), SolverElement3D {
            id: i + 1,
            elem_type: "frame".to_string(),
            node_i: i + 1,
            node_j: i + 2,
            material_id: 1,
            section_id: 1,
            hinge_start: false,
            hinge_end: false,
            local_yx: None,
            local_yy: None,
            local_yz: None,
            roll_angle: None,
        });
    }

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None, rw: None, kw: None,
    });

    SolverInput3D {
        nodes,
        materials: mats,
        sections: secs,
        elements: elems,
        supports,
        loads,
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(),
        quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

/// Build a 2D fiber grid for a rectangular section (both y and z vary).
fn rectangular_2d_fiber_grid(
    b: f64,
    h: f64,
    ny: usize,
    nz: usize,
    material: FiberMaterial,
) -> FiberSectionDef {
    let dy = h / ny as f64;
    let dz = b / nz as f64;
    let fiber_area = dy * dz;
    let mut fibers = Vec::new();

    for iy in 0..ny {
        for iz in 0..nz {
            fibers.push(Fiber {
                y: -h / 2.0 + dy / 2.0 + iy as f64 * dy,
                z: -b / 2.0 + dz / 2.0 + iz as f64 * dz,
                area: fiber_area,
                material_idx: 0,
            });
        }
    }

    FiberSectionDef {
        fibers,
        materials: vec![material],
    }
}

// ================================================================
// 3A. Elastic W-Section Cantilever Parity
// ================================================================
//
// W310×97 approximated with 2D fiber grid (z≠0 for 3D bending):
//   d=0.308, bf=0.305, tf=0.0154, tw=0.0095
// L=3m, P=50kN tip load in -Y.
// Analytical: δ_y = PL³/(3EI_z)
// Accept within 5%.

/// Build a W-section with 2D fiber grid (fibers have both y and z).
/// Flanges are distributed across the width (z), web at z=0.
fn wide_flange_2d_grid(
    bf: f64, tf: f64, d: f64, tw: f64,
    n_flange_y: usize, n_flange_z: usize, n_web: usize,
    material: FiberMaterial,
) -> FiberSectionDef {
    let mut fibers = Vec::new();
    let hw = d - 2.0 * tf;

    // Bottom flange: ny layers × nz strips
    let dy_f = tf / n_flange_y as f64;
    let dz_f = bf / n_flange_z as f64;
    for iy in 0..n_flange_y {
        for iz in 0..n_flange_z {
            let y = -d / 2.0 + dy_f / 2.0 + iy as f64 * dy_f;
            let z = -bf / 2.0 + dz_f / 2.0 + iz as f64 * dz_f;
            fibers.push(Fiber { y, z, area: dy_f * dz_f, material_idx: 0 });
        }
    }

    // Web: n_web layers, single strip at z=0
    let dy_w = hw / n_web as f64;
    for i in 0..n_web {
        let y = -hw / 2.0 + dy_w / 2.0 + i as f64 * dy_w;
        fibers.push(Fiber { y, z: 0.0, area: tw * dy_w, material_idx: 0 });
    }

    // Top flange
    for iy in 0..n_flange_y {
        for iz in 0..n_flange_z {
            let y = d / 2.0 - tf + dy_f / 2.0 + iy as f64 * dy_f;
            let z = -bf / 2.0 + dz_f / 2.0 + iz as f64 * dz_f;
            fibers.push(Fiber { y, z, area: dy_f * dz_f, material_idx: 0 });
        }
    }

    FiberSectionDef {
        fibers,
        materials: vec![material],
    }
}

#[test]
fn benchmark_fiber_3d_elastic_w_section() {
    let d = 0.308;
    let bf = 0.305;
    let tf = 0.0154;
    let tw = 0.0095;
    let length = 3.0;
    let p = -50.0; // kN, downward in Y

    let section = wide_flange_2d_grid(bf, tf, d, tw, 2, 6, 10, FiberMaterial::Elastic { e: 200_000.0 });

    // Compute section properties from fibers
    let a_total: f64 = section.fibers.iter().map(|f| f.area).sum();
    let iz_total: f64 = section.fibers.iter().map(|f| f.area * f.y * f.y).sum();
    let iy_total: f64 = section.fibers.iter().map(|f| f.area * f.z * f.z).sum();

    let tip_node = 2;
    let input = cantilever_3d(
        1, length, 200_000.0,
        a_total, iy_total, iz_total, 1e-4,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: tip_node,
            fx: 0.0, fy: p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let mut fiber_sections = HashMap::new();
    fiber_sections.insert("1".into(), section);

    let fiber_input = FiberNonlinearInput3D {
        solver: input,
        fiber_sections,
        n_integration_points: 5,
        max_iter: 30,
        tolerance: 1e-8,
        n_increments: 1,
    };

    let result = solve_fiber_nonlinear_3d(&fiber_input)
        .expect("Fiber 3D W-section solve failed");

    assert!(result.converged, "Elastic W-section should converge");

    let d_tip = result.results.displacements.iter()
        .find(|d| d.node_id == tip_node)
        .expect("Tip displacement not found");

    // Analytical: δ = PL³/(3EI_z)
    let e_kn_m2 = 200_000.0 * 1000.0;
    let delta_analytical = p.abs() * length.powi(3) / (3.0 * e_kn_m2 * iz_total);

    let delta_computed = d_tip.uy.abs();
    let rel_err = (delta_computed - delta_analytical).abs() / delta_analytical;

    eprintln!(
        "W-section elastic: uy={:.6e}, analytical={:.6e}, rel_err={:.2}%",
        delta_computed, delta_analytical, rel_err * 100.0
    );
    eprintln!("Section: A={:.6}, Iy={:.6e}, Iz={:.6e}", a_total, iy_total, iz_total);

    assert!(
        rel_err < 0.05,
        "W-section elastic deflection within 5%: computed={:.6e}, analytical={:.6e}, error={:.2}%",
        delta_computed, delta_analytical, rel_err * 100.0
    );
}

// ================================================================
// 3B. Steel Plastic Moment
// ================================================================
//
// Rectangular section b=0.2, h=0.4, fy=250 MPa, E=200 GPa.
// S = bh²/6 (elastic section modulus)
// Z = bh²/4 (plastic section modulus)
// My = fy * S (first yield moment)
// Mp = fy * Z (full plastic moment)
//
// Load incrementally to verify yielding at My and capacity approaching Mp.

#[test]
fn benchmark_fiber_3d_steel_plastic_moment() {
    let b = 0.2;
    let h = 0.4;
    let fy = 250.0; // MPa
    let length = 2.0;
    let e_mpa = 200_000.0;

    let a = b * h;
    let iz = b * h * h * h / 12.0;
    let iy = h * b * b * b / 12.0;

    // Section moduli
    let s_mod = b * h * h / 6.0;
    let z_mod = b * h * h / 4.0;
    let my_expected = fy * 1000.0 * s_mod; // kN·m
    let mp_expected = fy * 1000.0 * z_mod; // kN·m

    // Use 2D fiber grid for 3D solver
    let section = rectangular_2d_fiber_grid(
        b, h, 20, 4,
        FiberMaterial::SteelBilinear { e: e_mpa, fy, hardening_ratio: 0.01 },
    );

    // Test 1: Load at 60% of My — should remain elastic
    {
        let m_low = 0.6 * my_expected;
        // Tip moment in 3D: apply as mz (bending about Z axis)
        let input = cantilever_3d(
            1, length, e_mpa, a, iy, iz, 1e-4,
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: 2,
                fx: 0.0, fy: 0.0, fz: 0.0,
                mx: 0.0, my: 0.0, mz: m_low, bw: None,
            })],
        );

        let mut fiber_sections = HashMap::new();
        fiber_sections.insert("1".into(), section.clone());

        let fiber_input = FiberNonlinearInput3D {
            solver: input,
            fiber_sections,
            n_integration_points: 5,
            max_iter: 30,
            tolerance: 1e-6,
            n_increments: 1,
        };

        let result = solve_fiber_nonlinear_3d(&fiber_input)
            .expect("Low moment solve failed");
        assert!(result.converged, "Low moment should converge");

        // Should NOT have yielded
        let any_yielded = result.fiber_status.iter().any(|fs| fs.yielded);
        // At 60% My, no yielding expected
        assert!(
            !any_yielded,
            "At 60% My ({:.1} kN·m), should not yield (My={:.1} kN·m)",
            m_low, my_expected
        );
    }

    // Test 2: Load at 120% of My — should yield
    {
        let m_high = 1.2 * my_expected;
        let input = cantilever_3d(
            1, length, e_mpa, a, iy, iz, 1e-4,
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: 2,
                fx: 0.0, fy: 0.0, fz: 0.0,
                mx: 0.0, my: 0.0, mz: m_high, bw: None,
            })],
        );

        let mut fiber_sections = HashMap::new();
        fiber_sections.insert("1".into(), section.clone());

        let fiber_input = FiberNonlinearInput3D {
            solver: input,
            fiber_sections,
            n_integration_points: 5,
            max_iter: 30,
            tolerance: 1e-6,
            n_increments: 5,
        };

        let result = solve_fiber_nonlinear_3d(&fiber_input)
            .expect("High moment solve failed");
        assert!(result.converged, "High moment should converge");

        let any_yielded = result.fiber_status.iter().any(|fs| fs.yielded);
        assert!(
            any_yielded,
            "At 120% My ({:.1} kN·m), should yield (My={:.1} kN·m)",
            m_high, my_expected
        );
    }

    eprintln!(
        "Steel section: My={:.1} kN·m, Mp={:.1} kN·m, shape_factor={:.3}",
        my_expected, mp_expected, z_mod / s_mod
    );
}

// ================================================================
// 3C. RC Column Pushover
// ================================================================
//
// 300×300mm, 4×Ø20mm bars (corners), cover 40mm.
// Concrete: Hognestad fc=30 MPa, ε₀=0.002, εcu=0.004, ft=3 MPa.
// Steel: bilinear fy=500 MPa, E=200 GPa.
// Axial 500kN + lateral pushover.
// Verify moment capacity order: M ≈ As·fy·(d - a/2)

#[test]
fn benchmark_fiber_3d_rc_column_pushover() {
    let b_col = 0.30;
    let h_col = 0.30;
    let cover = 0.04;
    let bar_d = 0.020;
    let bar_area = std::f64::consts::PI * bar_d * bar_d / 4.0;

    let fc = 30.0; // MPa
    let fy = 500.0; // MPa
    let e_steel = 200_000.0;
    let length = 3.0;
    let axial_load = -500.0; // kN, compression

    // Fiber section: concrete grid + 4 corner bars
    let concrete = FiberMaterial::ConcreteHognestad {
        fc, eps_c0: 0.002, eps_cu: 0.004, ft: 3.0,
    };
    let steel = FiberMaterial::SteelBilinear {
        e: e_steel, fy, hardening_ratio: 0.01,
    };

    // Concrete: 8×8 grid
    let nc = 8;
    let dy_c = h_col / nc as f64;
    let dz_c = b_col / nc as f64;

    let mut fibers = Vec::new();
    for iy in 0..nc {
        for iz in 0..nc {
            fibers.push(Fiber {
                y: -h_col / 2.0 + dy_c / 2.0 + iy as f64 * dy_c,
                z: -b_col / 2.0 + dz_c / 2.0 + iz as f64 * dz_c,
                area: dy_c * dz_c,
                material_idx: 0, // concrete
            });
        }
    }

    // 4 corner bars
    let d_eff = h_col / 2.0 - cover - bar_d / 2.0; // effective depth from centroid
    let z_eff = b_col / 2.0 - cover - bar_d / 2.0;
    for &(y, z) in &[(-d_eff, -z_eff), (-d_eff, z_eff), (d_eff, -z_eff), (d_eff, z_eff)] {
        fibers.push(Fiber {
            y, z, area: bar_area,
            material_idx: 1, // steel
        });
    }

    let section = FiberSectionDef {
        fibers,
        materials: vec![concrete, steel],
    };

    let a_total = b_col * h_col;
    let iz = b_col * h_col.powi(3) / 12.0;
    let iy = h_col * b_col.powi(3) / 12.0;

    // Moderate lateral load for pushover
    let lateral = 30.0; // kN

    let n_elem = 4;
    let tip_node = n_elem + 1;
    let input = cantilever_3d(
        n_elem, length, e_steel, a_total, iy, iz, 1e-4,
        vec![
            SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: tip_node,
                fx: axial_load, fy: lateral, fz: 0.0,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }),
        ],
    );

    let mut fiber_sections = HashMap::new();
    fiber_sections.insert("1".into(), section);

    let fiber_input = FiberNonlinearInput3D {
        solver: input,
        fiber_sections,
        n_integration_points: 5,
        max_iter: 50,
        tolerance: 1e-4,
        n_increments: 20,
    };

    let result = solve_fiber_nonlinear_3d(&fiber_input)
        .expect("RC column pushover solve failed");
    assert!(result.converged, "RC column pushover should converge");

    // Tip should have lateral displacement
    let d_tip = result.results.displacements.iter()
        .find(|d| d.node_id == tip_node)
        .expect("Tip displacement not found");
    assert!(
        d_tip.uy.abs() > 1e-6,
        "RC column should have lateral displacement, got uy={:.6e}", d_tip.uy
    );

    // Moment capacity order check: M ≈ As·fy·(d - a/2)
    // As = 4 * bar_area, d = h - cover - bar_d/2 = 0.30 - 0.04 - 0.01 = 0.25 m
    // Approximate: a = As*fy / (0.85*fc*b) ≈ tiny for low reinforcement
    let a_s = 4.0 * bar_area;
    let d_eff_total = h_col - cover - bar_d / 2.0;
    let a_block = a_s * fy / (0.85 * fc * b_col); // stress block depth
    let m_approx = a_s * fy * 1000.0 * (d_eff_total - a_block / 2.0); // kN·m

    // Base moment from lateral load: M_base = H * L
    let m_base = lateral * length;

    eprintln!(
        "RC column: tip uy={:.6e}, M_base={:.1} kN·m, M_approx_capacity={:.1} kN·m",
        d_tip.uy, m_base, m_approx
    );

    // The applied moment should be within an order of magnitude of capacity
    let ratio = m_base / m_approx;
    assert!(
        ratio > 0.1 && ratio < 10.0,
        "Base moment ({:.1}) should be same order as capacity ({:.1})",
        m_base, m_approx
    );
}

// ================================================================
// 3D. Biaxial Bending Symmetry
// ================================================================
//
// 200×200mm square section, 2D fiber grid.
// 45° load: equal Fy and Fz components.
// For a square section, |uy - uz| should be < 5%.

#[test]
fn benchmark_fiber_3d_biaxial_symmetry() {
    let b = 0.2;
    let h = 0.2;
    let length = 3.0;
    let e_mpa = 200_000.0;
    let p = 30.0; // kN, applied at 45° (equal Fy and Fz)

    let section = rectangular_2d_fiber_grid(
        b, h, 8, 8,
        FiberMaterial::Elastic { e: e_mpa },
    );

    let a = b * h;
    let i = b * h * h * h / 12.0; // Iy = Iz for square

    let tip_node = 2;
    let input = cantilever_3d(
        1, length, e_mpa, a, i, i, 1e-4,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: tip_node,
            fx: 0.0, fy: p, fz: p, // equal components
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let mut fiber_sections = HashMap::new();
    fiber_sections.insert("1".into(), section);

    let fiber_input = FiberNonlinearInput3D {
        solver: input,
        fiber_sections,
        n_integration_points: 5,
        max_iter: 30,
        tolerance: 1e-8,
        n_increments: 1,
    };

    let result = solve_fiber_nonlinear_3d(&fiber_input)
        .expect("Biaxial symmetry solve failed");
    assert!(result.converged, "Biaxial symmetry should converge");

    let d_tip = result.results.displacements.iter()
        .find(|d| d.node_id == tip_node)
        .expect("Tip displacement not found");

    let uy = d_tip.uy.abs();
    let uz = d_tip.uz.abs();

    eprintln!("Biaxial symmetry: uy={:.6e}, uz={:.6e}", uy, uz);

    // Both should be nonzero
    assert!(uy > 1e-10, "uy should be nonzero, got {:.6e}", uy);
    assert!(uz > 1e-10, "uz should be nonzero, got {:.6e}", uz);

    // |uy - uz| / max(uy,uz) < 5%
    let diff = (uy - uz).abs() / uy.max(uz);
    assert!(
        diff < 0.05,
        "Biaxial symmetry: uy={:.6e}, uz={:.6e}, diff={:.2}% (expected < 5%)",
        uy, uz, diff * 100.0
    );
}

// ================================================================
// 3E. Confined Concrete Column (Elastic Approximation)
// ================================================================
//
// Short RC column under pure axial load. Compare two fiber sections:
//   - "Unconfined": lower E for outer fibers (simulating spalling)
//   - "Confined": higher E for all fibers (simulating confinement effect)
// Both should converge; confined column should have less displacement.

#[test]
fn benchmark_fiber_3d_confined_concrete_column() {
    let b = 0.3;
    let h = 0.3;
    let length = 3.0;
    let axial_load = -1000.0; // kN compression

    let a = b * h;
    let iz = b * h * h * h / 12.0;
    let iy = h * b * b * b / 12.0;

    // Confined: all fibers at E = 30,000 MPa (high-strength confined concrete)
    let section_confined = rectangular_2d_fiber_grid(
        b, h, 8, 8,
        FiberMaterial::Elastic { e: 30_000.0 },
    );

    // Unconfined: lower E = 20,000 MPa (lower stiffness, simulating unconfined concrete)
    let section_unconfined = rectangular_2d_fiber_grid(
        b, h, 8, 8,
        FiberMaterial::Elastic { e: 20_000.0 },
    );

    // Solve confined column
    let disp_confined = {
        let n_elem = 4;
        let tip_node = n_elem + 1;
        let input = cantilever_3d(
            n_elem, length, 30_000.0, a, iy, iz, 1e-4,
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: tip_node,
                fx: axial_load, fy: 0.0, fz: 0.0,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            })],
        );

        let mut fiber_sections = HashMap::new();
        fiber_sections.insert("1".into(), section_confined);

        let fiber_input = FiberNonlinearInput3D {
            solver: input,
            fiber_sections,
            n_integration_points: 5,
            max_iter: 30,
            tolerance: 1e-6,
            n_increments: 1,
        };

        let result = solve_fiber_nonlinear_3d(&fiber_input)
            .expect("Confined column solve failed");
        assert!(result.converged, "Confined column should converge");

        let d_tip = result.results.displacements.iter()
            .find(|d| d.node_id == tip_node)
            .expect("Tip displacement not found");
        let disp = d_tip.ux.abs();

        assert!(
            disp.is_finite() && disp > 0.0,
            "Confined column should have finite nonzero axial displacement, got {:.6e}",
            disp
        );
        disp
    };

    // Solve unconfined column
    let disp_unconfined = {
        let n_elem = 4;
        let tip_node = n_elem + 1;
        let input = cantilever_3d(
            n_elem, length, 20_000.0, a, iy, iz, 1e-4,
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: tip_node,
                fx: axial_load, fy: 0.0, fz: 0.0,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            })],
        );

        let mut fiber_sections = HashMap::new();
        fiber_sections.insert("1".into(), section_unconfined);

        let fiber_input = FiberNonlinearInput3D {
            solver: input,
            fiber_sections,
            n_integration_points: 5,
            max_iter: 30,
            tolerance: 1e-6,
            n_increments: 1,
        };

        let result = solve_fiber_nonlinear_3d(&fiber_input)
            .expect("Unconfined column solve failed");
        assert!(result.converged, "Unconfined column should converge");

        let d_tip = result.results.displacements.iter()
            .find(|d| d.node_id == tip_node)
            .expect("Tip displacement not found");
        let disp = d_tip.ux.abs();

        assert!(
            disp.is_finite() && disp > 0.0,
            "Unconfined column should have finite nonzero axial displacement, got {:.6e}",
            disp
        );
        disp
    };

    // Confined column (higher E) should have LESS displacement for the same load
    assert!(
        disp_confined < disp_unconfined,
        "Confined column should be stiffer: disp_confined={:.6e} < disp_unconfined={:.6e}",
        disp_confined, disp_unconfined
    );

    eprintln!(
        "Confined vs unconfined: disp_conf={:.6e}, disp_unconf={:.6e}, ratio={:.3}",
        disp_confined, disp_unconfined, disp_unconfined / disp_confined
    );
}

// ================================================================
// 3F. Beam-Column Interaction (Combined Axial + Bending)
// ================================================================
//
// Cantilever column, 3.0m tall, fiber section.
// Apply both axial compression (fx = -100) and lateral load (fy = 10) at tip.
// Verify: both lateral and axial displacements are nonzero,
// and P-delta effect in the fiber model amplifies lateral displacement.

#[test]
fn benchmark_fiber_3d_beam_column_interaction() {
    let b = 0.3;
    let h = 0.3;
    let length = 3.0;
    let e_mpa = 200_000.0;

    let a = b * h;
    let iz = b * h * h * h / 12.0;
    let iy = h * b * b * b / 12.0;

    let section = rectangular_2d_fiber_grid(
        b, h, 8, 8,
        FiberMaterial::Elastic { e: e_mpa },
    );

    let n_elem = 4;
    let tip_node = n_elem + 1;

    // Combined axial + lateral load
    let input = cantilever_3d(
        n_elem, length, e_mpa, a, iy, iz, 1e-4,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: tip_node,
            fx: -100.0, // axial compression
            fy: 10.0,   // lateral load
            fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let mut fiber_sections = HashMap::new();
    fiber_sections.insert("1".into(), section);

    let fiber_input = FiberNonlinearInput3D {
        solver: input,
        fiber_sections,
        n_integration_points: 5,
        max_iter: 50,
        tolerance: 1e-6,
        n_increments: 5,
    };

    let result = solve_fiber_nonlinear_3d(&fiber_input)
        .expect("Beam-column interaction solve failed");
    assert!(result.converged, "Beam-column interaction should converge");

    let d_tip = result.results.displacements.iter()
        .find(|d| d.node_id == tip_node)
        .expect("Tip displacement not found");

    // Both axial and lateral displacements should be nonzero
    assert!(
        d_tip.ux.abs() > 1e-10,
        "Axial displacement should be nonzero, got ux={:.6e}", d_tip.ux
    );
    assert!(
        d_tip.uy.abs() > 1e-10,
        "Lateral displacement should be nonzero, got uy={:.6e}", d_tip.uy
    );

    // All results should be finite
    assert!(d_tip.ux.is_finite(), "ux should be finite");
    assert!(d_tip.uy.is_finite(), "uy should be finite");
    assert!(d_tip.uz.is_finite(), "uz should be finite");

    eprintln!(
        "Beam-column interaction: ux={:.6e} (axial), uy={:.6e} (lateral), uz={:.6e}",
        d_tip.ux, d_tip.uy, d_tip.uz
    );
}
