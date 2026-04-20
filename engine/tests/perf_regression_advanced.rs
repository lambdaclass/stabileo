//! Performance regression gates for advanced solver paths.
//!
//! Tests cover: modal, buckling, harmonic, Guyan reduction, and Craig-Bampton
//! reduction. Bounds are deliberately generous (5-10x expected time) so they
//! pass on slow CI machines but still catch catastrophic regressions.
//!
//! Run selectively:  cargo test --test perf_regression_advanced -- --nocapture

use dedaliano_engine::solver::{linear, modal, buckling, harmonic, reduction};
use dedaliano_engine::solver::reduction::{GuyanInput3D, CraigBamptonInput3D};
use dedaliano_engine::types::*;
use std::collections::HashMap;
use std::time::Instant;

// ==================== Model Builders ====================

/// Build an nx*ny simply-supported MITC4 plate with uniform pressure.
/// Reuses the same pattern as perf_regression_gates and sparse_shell_gates.
fn make_plate_3d(nx: usize, ny: usize) -> SolverInput3D {
    let lx = 10.0;
    let ly = 10.0;
    let t = 0.1;
    let e = 200_000.0;
    let nu = 0.3;

    let mut nodes = HashMap::new();
    let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
    let mut nid = 1;
    for i in 0..=nx {
        for j in 0..=ny {
            let x = (i as f64 / nx as f64) * lx;
            let y = (j as f64 / ny as f64) * ly;
            nodes.insert(
                nid.to_string(),
                SolverNode3D { id: nid, x, y, z: 0.0 },
            );
            grid[i][j] = nid;
            nid += 1;
        }
    }

    let mut quads = HashMap::new();
    let mut qid = 1;
    for i in 0..nx {
        for j in 0..ny {
            quads.insert(
                qid.to_string(),
                SolverQuadElement {
                    id: qid,
                    nodes: [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]],
                    material_id: 1,
                    thickness: t,
                },
            );
            qid += 1;
        }
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e, nu });

    // Simply-supported edges: rz on all boundary, pin corner fully
    let mut supports = HashMap::new();
    let mut sid = 1;
    let mut boundary = Vec::new();
    for j in 0..=ny {
        boundary.push(grid[0][j]);
        boundary.push(grid[nx][j]);
    }
    for i in 0..=nx {
        boundary.push(grid[i][0]);
        boundary.push(grid[i][ny]);
    }
    boundary.sort();
    boundary.dedup();
    for &n in &boundary {
        supports.insert(
            sid.to_string(),
            SolverSupport3D {
                node_id: n,
                rx: false, ry: false, rz: true,
                rrx: false, rry: false, rrz: false,
                kx: None, ky: None, kz: None,
                krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None,
                drx: None, dry: None, drz: None,
                normal_x: None, normal_y: None, normal_z: None,
                is_inclined: None, rw: None, kw: None,
            },
        );
        sid += 1;
    }
    supports.insert(
        sid.to_string(),
        SolverSupport3D {
            node_id: grid[0][0],
            rx: true, ry: true, rz: true,
            rrx: false, rry: false, rrz: false,
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        },
    );

    let n_quads = quads.len();
    let loads: Vec<SolverLoad3D> = (1..=n_quads)
        .map(|eid| SolverLoad3D::QuadPressure(SolverPressureLoad { element_id: eid, pressure: -1.0 }))
        .collect();

    SolverInput3D {
        nodes,
        materials: mats,
        sections: HashMap::new(),
        elements: HashMap::new(),
        supports,
        loads,
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(),
        quads,
        quad9s: HashMap::new(),
        solid_shells: HashMap::new(),
        curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

/// Build an nx*ny simply-supported MITC4 plate AND return the node grid
/// (needed for boundary node selection in Guyan/Craig-Bampton).
fn make_plate_3d_with_grid(nx: usize, ny: usize) -> (SolverInput3D, Vec<Vec<usize>>) {
    let lx = 10.0;
    let ly = 10.0;
    let t = 0.1;
    let e = 200_000.0;
    let nu = 0.3;

    let mut nodes = HashMap::new();
    let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
    let mut nid = 1;
    for i in 0..=nx {
        for j in 0..=ny {
            let x = (i as f64 / nx as f64) * lx;
            let y = (j as f64 / ny as f64) * ly;
            nodes.insert(
                nid.to_string(),
                SolverNode3D { id: nid, x, y, z: 0.0 },
            );
            grid[i][j] = nid;
            nid += 1;
        }
    }

    let mut quads = HashMap::new();
    let mut qid = 1;
    for i in 0..nx {
        for j in 0..ny {
            quads.insert(
                qid.to_string(),
                SolverQuadElement {
                    id: qid,
                    nodes: [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]],
                    material_id: 1,
                    thickness: t,
                },
            );
            qid += 1;
        }
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e, nu });

    let mut supports = HashMap::new();
    let mut sid = 1;
    let mut boundary = Vec::new();
    for j in 0..=ny {
        boundary.push(grid[0][j]);
        boundary.push(grid[nx][j]);
    }
    for i in 0..=nx {
        boundary.push(grid[i][0]);
        boundary.push(grid[i][ny]);
    }
    boundary.sort();
    boundary.dedup();
    for &n in &boundary {
        supports.insert(
            sid.to_string(),
            SolverSupport3D {
                node_id: n,
                rx: false, ry: false, rz: true,
                rrx: false, rry: false, rrz: false,
                kx: None, ky: None, kz: None,
                krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None,
                drx: None, dry: None, drz: None,
                normal_x: None, normal_y: None, normal_z: None,
                is_inclined: None, rw: None, kw: None,
            },
        );
        sid += 1;
    }
    supports.insert(
        sid.to_string(),
        SolverSupport3D {
            node_id: grid[0][0],
            rx: true, ry: true, rz: true,
            rrx: false, rry: false, rrz: false,
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        },
    );

    let n_quads = quads.len();
    let loads: Vec<SolverLoad3D> = (1..=n_quads)
        .map(|eid| SolverLoad3D::QuadPressure(SolverPressureLoad { element_id: eid, pressure: -1.0 }))
        .collect();

    let input = SolverInput3D {
        nodes,
        materials: mats,
        sections: HashMap::new(),
        elements: HashMap::new(),
        supports,
        loads,
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(),
        quads,
        quad9s: HashMap::new(),
        solid_shells: HashMap::new(),
        curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    };
    (input, grid)
}

/// Build an nx*ny compressed MITC4 plate for buckling analysis.
/// Uses uniform in-plane compression along x direction.
fn make_compressed_plate(nx: usize, ny: usize) -> SolverInput3D {
    let a = 1.0;
    let t = 0.01;
    let e = 200_000.0;
    let nu = 0.3;
    let dx = a / nx as f64;
    let dy = a / ny as f64;

    let mut nodes = HashMap::new();
    let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
    let mut nid = 1;
    for i in 0..=nx {
        for j in 0..=ny {
            nodes.insert(
                nid.to_string(),
                SolverNode3D { id: nid, x: i as f64 * dx, y: j as f64 * dy, z: 0.0 },
            );
            grid[i][j] = nid;
            nid += 1;
        }
    }

    let mut quads = HashMap::new();
    let mut qid = 1;
    for i in 0..nx {
        for j in 0..ny {
            quads.insert(
                qid.to_string(),
                SolverQuadElement {
                    id: qid,
                    nodes: [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]],
                    material_id: 1,
                    thickness: t,
                },
            );
            qid += 1;
        }
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e, nu });

    // SS edges: uz=0 on all boundary, ux=0 at x=0, uy=0 at y=0
    let mut supports = HashMap::new();
    let mut sid = 1;
    for i in 0..=nx {
        for j in 0..=ny {
            if i == 0 || i == nx || j == 0 || j == ny {
                supports.insert(
                    sid.to_string(),
                    SolverSupport3D {
                        node_id: grid[i][j],
                        rx: i == 0, ry: j == 0, rz: true,
                        rrx: false, rry: false, rrz: false,
                        kx: None, ky: None, kz: None,
                        krx: None, kry: None, krz: None,
                        dx: None, dy: None, dz: None,
                        drx: None, dry: None, drz: None,
                        normal_x: None, normal_y: None, normal_z: None,
                        is_inclined: None, rw: None, kw: None,
                    },
                );
                sid += 1;
            }
        }
    }

    // Uniform compression along x: nodal forces at x=a edge
    let mut loads = Vec::new();
    for j in 0..=ny {
        let trib = if j == 0 || j == ny { dy / 2.0 } else { dy };
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: grid[nx][j],
            fx: -1.0 * trib, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
    }

    SolverInput3D {
        nodes,
        materials: mats,
        sections: HashMap::new(),
        elements: HashMap::new(),
        supports,
        loads,
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(),
        quads,
        quad9s: HashMap::new(),
        solid_shells: HashMap::new(),
        curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

/// Get perimeter (boundary) nodes from a grid.
fn perimeter_nodes(grid: &[Vec<usize>], nx: usize, ny: usize) -> Vec<usize> {
    let mut boundary = Vec::new();
    for j in 0..=ny {
        boundary.push(grid[0][j]);
        boundary.push(grid[nx][j]);
    }
    for i in 0..=nx {
        boundary.push(grid[i][0]);
        boundary.push(grid[i][ny]);
    }
    boundary.sort();
    boundary.dedup();
    boundary
}

/// Standard densities for modal/harmonic/Craig-Bampton tests.
fn steel_densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), 7850.0); // steel density kg/m3
    d
}

// ==================== 1. Modal Analysis Timing Gate ====================

/// Gate: 3D modal analysis on a 5x5 plate (25 elements) must complete in < 5s.
/// Verifies both timing and mode count.
#[test]
fn modal_3d_5x5_plate_under_5s() {
    let input = make_plate_3d(5, 5);
    let densities = steel_densities();
    let num_modes = 5;

    // Warmup
    let _ = modal::solve_modal_3d(&input, &densities, num_modes);

    let t0 = Instant::now();
    let result = modal::solve_modal_3d(&input, &densities, num_modes)
        .expect("3D modal solve failed");
    let elapsed = t0.elapsed();

    println!(
        "5x5 plate modal (5 modes): {:.1}ms, {} modes found, f1={:.2} Hz",
        elapsed.as_secs_f64() * 1000.0,
        result.modes.len(),
        result.modes[0].frequency,
    );

    assert!(
        elapsed.as_secs() < 5,
        "5x5 plate modal solve took {:.1}s (limit: 5s)",
        elapsed.as_secs_f64()
    );
    assert!(
        result.modes.len() >= 3,
        "Should find at least 3 modes, found {}",
        result.modes.len()
    );
    // Frequencies must be positive
    for (i, mode) in result.modes.iter().enumerate() {
        assert!(mode.frequency > 0.0, "Mode {} frequency should be positive", i);
    }
}

/// Gate: 3D modal analysis on a 10x10 plate (100 elements) must complete in < 10s.
#[test]
fn modal_3d_10x10_plate_under_10s() {
    let input = make_plate_3d(10, 10);
    let densities = steel_densities();
    let num_modes = 5;

    // Warmup
    let _ = modal::solve_modal_3d(&input, &densities, num_modes);

    let t0 = Instant::now();
    let result = modal::solve_modal_3d(&input, &densities, num_modes)
        .expect("3D modal solve failed");
    let elapsed = t0.elapsed();

    println!(
        "10x10 plate modal (5 modes): {:.1}ms, {} modes found, f1={:.2} Hz",
        elapsed.as_secs_f64() * 1000.0,
        result.modes.len(),
        result.modes[0].frequency,
    );

    assert!(
        elapsed.as_secs() < 10,
        "10x10 plate modal solve took {:.1}s (limit: 10s)",
        elapsed.as_secs_f64()
    );
    assert!(
        result.modes.len() >= 3,
        "Should find at least 3 modes, found {}",
        result.modes.len()
    );
}

// ==================== 2. Buckling Analysis Timing Gate ====================

/// Gate: 3D buckling on a 5x5 compressed plate must complete in < 5s.
#[test]
fn buckling_3d_5x5_plate_under_5s() {
    let input = make_compressed_plate(5, 5);
    let num_modes = 3;

    // Warmup
    let _ = buckling::solve_buckling_3d(&input, num_modes);

    let t0 = Instant::now();
    let result = buckling::solve_buckling_3d(&input, num_modes)
        .expect("3D buckling solve failed");
    let elapsed = t0.elapsed();

    println!(
        "5x5 compressed plate buckling: {:.1}ms, {} modes, lambda_cr={:.4}",
        elapsed.as_secs_f64() * 1000.0,
        result.modes.len(),
        result.modes[0].load_factor,
    );

    assert!(
        elapsed.as_secs() < 5,
        "5x5 plate buckling solve took {:.1}s (limit: 5s)",
        elapsed.as_secs_f64()
    );
    assert!(
        result.modes.len() >= 2,
        "Should find at least 2 buckling modes, found {}",
        result.modes.len()
    );
    // Load factors must be positive
    for (i, mode) in result.modes.iter().enumerate() {
        assert!(mode.load_factor > 0.0, "Mode {} load factor should be positive", i);
    }
}

/// Gate: 3D buckling on a 10x10 compressed plate must complete in < 15s.
#[test]
fn buckling_3d_10x10_plate_under_15s() {
    let input = make_compressed_plate(10, 10);
    let num_modes = 3;

    // Warmup
    let _ = buckling::solve_buckling_3d(&input, num_modes);

    let t0 = Instant::now();
    let result = buckling::solve_buckling_3d(&input, num_modes)
        .expect("3D buckling solve failed");
    let elapsed = t0.elapsed();

    println!(
        "10x10 compressed plate buckling: {:.1}ms, {} modes, lambda_cr={:.4}",
        elapsed.as_secs_f64() * 1000.0,
        result.modes.len(),
        result.modes[0].load_factor,
    );

    assert!(
        elapsed.as_secs() < 15,
        "10x10 plate buckling solve took {:.1}s (limit: 15s)",
        elapsed.as_secs_f64()
    );
    assert!(
        result.modes.len() >= 2,
        "Should find at least 2 buckling modes, found {}",
        result.modes.len()
    );
}

// ==================== 3. Harmonic Analysis Timing Gate ====================

/// Gate: 3D harmonic analysis on a 5x5 plate must complete in < 15s.
/// (Harmonic solves multiple frequency points via modal superposition,
/// which requires an eigensolve + sweep. Generous bound for debug builds.)
#[test]
fn harmonic_3d_5x5_plate_under_15s() {
    let nx = 5;
    let ny = 5;
    let input = make_plate_3d(nx, ny);
    let densities = steel_densities();

    // Center node for response
    let center_node = ((nx / 2) * (ny + 1) + ny / 2) + 1;

    // 20 frequency points from 1 to 100 Hz
    let frequencies: Vec<f64> = (0..20)
        .map(|i| 1.0 + 99.0 * i as f64 / 19.0)
        .collect();

    let harmonic_input = harmonic::HarmonicInput3D {
        solver: input.clone(),
        densities: densities.clone(),
        frequencies: frequencies.clone(),
        damping_ratio: 0.05,
        response_node_id: center_node,
        response_dof: "z".to_string(),
    };

    // Warmup
    let _ = harmonic::solve_harmonic_3d(&harmonic_input);

    let harmonic_input2 = harmonic::HarmonicInput3D {
        solver: input,
        densities,
        frequencies,
        damping_ratio: 0.05,
        response_node_id: center_node,
        response_dof: "z".to_string(),
    };

    let t0 = Instant::now();
    let result = harmonic::solve_harmonic_3d(&harmonic_input2)
        .expect("3D harmonic solve failed");
    let elapsed = t0.elapsed();

    println!(
        "5x5 plate harmonic (20 freq points): {:.1}ms, peak at {:.2} Hz, amp={:.6e}",
        elapsed.as_secs_f64() * 1000.0,
        result.peak_frequency,
        result.peak_amplitude,
    );

    assert!(
        elapsed.as_secs() < 15,
        "5x5 plate harmonic solve took {:.1}s (limit: 15s)",
        elapsed.as_secs_f64()
    );
    assert_eq!(
        result.response_points.len(), 20,
        "Should have 20 response points"
    );
    assert!(
        result.peak_amplitude > 0.0,
        "Peak amplitude should be positive"
    );
}

// ==================== 4. Guyan Reduction Timing Gate ====================

/// Gate: 3D Guyan reduction on a 8x8 plate must complete in < 5s.
#[test]
fn guyan_3d_8x8_plate_under_5s() {
    let nx = 8;
    let ny = 8;
    let (input, grid) = make_plate_3d_with_grid(nx, ny);
    let boundary_nodes = perimeter_nodes(&grid, nx, ny);

    let guyan_input = GuyanInput3D {
        solver: input.clone(),
        boundary_nodes: boundary_nodes.clone(),
    };

    // Warmup
    let _ = reduction::guyan_reduce_3d(&guyan_input);

    let guyan_input2 = GuyanInput3D {
        solver: input,
        boundary_nodes,
    };

    let t0 = Instant::now();
    let result = reduction::guyan_reduce_3d(&guyan_input2)
        .expect("3D Guyan reduction failed");
    let elapsed = t0.elapsed();

    println!(
        "8x8 plate Guyan: {:.1}ms, nb={}, ni={}, {} displacements",
        elapsed.as_secs_f64() * 1000.0,
        result.n_boundary,
        result.n_interior,
        result.displacements.len(),
    );

    assert!(
        elapsed.as_secs() < 5,
        "8x8 plate Guyan reduction took {:.1}s (limit: 5s)",
        elapsed.as_secs_f64()
    );
    assert!(result.n_boundary > 0, "Should have boundary DOFs");
    assert!(result.n_interior > 0, "Should have interior DOFs");
    assert!(!result.displacements.is_empty(), "Should produce displacements");
}

// ==================== 5. Craig-Bampton Reduction Timing Gate ====================

/// Gate: 3D Craig-Bampton on a 6x6 plate must complete in < 5s.
#[test]
fn craig_bampton_3d_6x6_plate_under_5s() {
    let nx = 6;
    let ny = 6;
    let (input, grid) = make_plate_3d_with_grid(nx, ny);
    let boundary_nodes = perimeter_nodes(&grid, nx, ny);
    let densities = steel_densities();

    let cb_input = CraigBamptonInput3D {
        solver: input.clone(),
        boundary_nodes: boundary_nodes.clone(),
        n_modes: 5,
        densities: densities.clone(),
    };

    // Warmup
    let _ = reduction::craig_bampton_3d(&cb_input);

    let cb_input2 = CraigBamptonInput3D {
        solver: input,
        boundary_nodes,
        n_modes: 5,
        densities,
    };

    let t0 = Instant::now();
    let result = reduction::craig_bampton_3d(&cb_input2)
        .expect("3D Craig-Bampton failed");
    let elapsed = t0.elapsed();

    println!(
        "6x6 plate Craig-Bampton (5 interior modes): {:.1}ms, n_reduced={}, nb={}, n_modes={}",
        elapsed.as_secs_f64() * 1000.0,
        result.n_reduced,
        result.n_boundary,
        result.n_modes_kept,
    );

    assert!(
        elapsed.as_secs() < 5,
        "6x6 plate Craig-Bampton took {:.1}s (limit: 5s)",
        elapsed.as_secs_f64()
    );
    assert!(result.n_modes_kept > 0, "Should retain at least 1 interior mode");
    assert_eq!(
        result.n_reduced,
        result.n_boundary + result.n_modes_kept,
        "n_reduced should equal n_boundary + n_modes_kept"
    );
    // Interior frequencies should be positive
    for (i, &f) in result.interior_frequencies.iter().enumerate() {
        assert!(f >= 0.0, "Interior mode {} frequency should be non-negative", i);
    }
}

// ==================== 6. Scaling Gate: Modal Analysis ====================

/// Gate: modal analysis scales sub-cubically.
///
/// Test at 5x5 (25 elems) and 10x10 (100 elems). The dominant cost is the
/// Lanczos eigensolver which is O(nnz * k * n_iter). For a 2D plate mesh,
/// expected scaling is roughly O(N^1.5) where N is DOF count.
/// 4x elements => ~8x time at O(N^1.5). We allow up to 20x to stay CI-safe.
#[test]
fn scale_modal_3d_sub_cubic() {
    let small = make_plate_3d(5, 5);
    let large = make_plate_3d(10, 10);
    let densities = steel_densities();
    let num_modes = 5;

    // Warmup both sizes
    let _ = modal::solve_modal_3d(&small, &densities, num_modes);
    let _ = modal::solve_modal_3d(&large, &densities, num_modes);

    // Measure small (average of 3 runs)
    let t0 = Instant::now();
    for _ in 0..3 {
        let _ = modal::solve_modal_3d(&small, &densities, num_modes);
    }
    let small_us = t0.elapsed().as_micros() / 3;

    // Measure large (average of 3 runs)
    let t0 = Instant::now();
    for _ in 0..3 {
        let _ = modal::solve_modal_3d(&large, &densities, num_modes);
    }
    let large_us = t0.elapsed().as_micros() / 3;

    let ratio = large_us as f64 / small_us.max(1) as f64;
    let n_elem_ratio = (10.0 * 10.0) / (5.0 * 5.0); // = 4

    println!(
        "Modal scale: 5x5 = {}us, 10x10 = {}us, ratio = {:.1}x (elem ratio = {:.0}x)",
        small_us, large_us, ratio, n_elem_ratio
    );

    // O(N^1.5) => ratio ~ 4^1.5 = 8. O(N^3) => ratio ~ 4^3 = 64.
    // 20x catches cubic blowup while being generous for CI variability.
    assert!(
        ratio < 20.0,
        "Modal solve time ratio {:.1}x exceeds 20x for 4x element increase -- possible cubic regression",
        ratio
    );
}

// ==================== 7. Sparse Path Verification ====================

/// Gate: modal analysis on 10x10 plate uses the sparse eigensolve path
/// (no constraints => sparse path should be taken, completing faster
/// than a hypothetical dense path would).
///
/// We verify this by checking that the sparse modal solve completes
/// and produces valid results, then compare against a full linear solve
/// timing as a sanity check (modal should be comparable, not 100x slower).
#[test]
fn modal_3d_uses_sparse_path() {
    let input = make_plate_3d(10, 10);
    let densities = steel_densities();
    let num_modes = 5;

    // Time the full linear solve as baseline
    let t0 = Instant::now();
    let _ = linear::solve_3d(&input).expect("Linear solve failed");
    let linear_us = t0.elapsed().as_micros();

    // Time the modal solve
    let t0 = Instant::now();
    let modal_result = modal::solve_modal_3d(&input, &densities, num_modes)
        .expect("Modal solve failed");
    let modal_us = t0.elapsed().as_micros();

    let ratio = modal_us as f64 / linear_us.max(1) as f64;

    println!(
        "10x10 plate: linear={}us, modal={}us, ratio={:.1}x",
        linear_us, modal_us, ratio
    );

    // Modal should not be more than 30x slower than linear
    // (if it's 100x+ slower, the sparse path probably isn't being used)
    assert!(
        ratio < 30.0,
        "Modal solve ({}us) is {:.1}x slower than linear ({}us) -- sparse path may not be active",
        modal_us, ratio, linear_us
    );

    // Verify we got valid modes
    assert!(
        modal_result.modes.len() >= 3,
        "Should find at least 3 modes on 10x10 plate"
    );
    assert!(
        modal_result.total_mass > 0.0,
        "Total mass should be positive"
    );
}

/// Gate: buckling analysis on a compressed plate completes via the sparse path.
/// On an unconstrained model the sparse Lanczos path should be used.
/// We verify timing is in-line with expectations (not a dense fallback regression).
#[test]
fn buckling_3d_uses_sparse_path() {
    let input = make_compressed_plate(10, 10);
    let num_modes = 3;

    // Time the full linear solve as baseline
    let t0 = Instant::now();
    let _ = linear::solve_3d(&input).expect("Linear solve failed");
    let linear_us = t0.elapsed().as_micros();

    // Time the buckling solve (includes an internal linear solve + eigenproblem)
    let t0 = Instant::now();
    let buckling_result = buckling::solve_buckling_3d(&input, num_modes)
        .expect("Buckling solve failed");
    let buckling_us = t0.elapsed().as_micros();

    // Buckling includes a linear pre-solve, so expect 2-10x linear time
    let ratio = buckling_us as f64 / linear_us.max(1) as f64;

    println!(
        "10x10 compressed plate: linear={}us, buckling={}us, ratio={:.1}x",
        linear_us, buckling_us, ratio
    );

    // Buckling should not be more than 50x slower than linear
    // (dense Jacobi fallback on this size would be enormously slower)
    assert!(
        ratio < 50.0,
        "Buckling solve ({}us) is {:.1}x slower than linear ({}us) -- possible dense fallback",
        buckling_us, ratio, linear_us
    );

    assert!(
        buckling_result.modes.len() >= 2,
        "Should find at least 2 buckling modes"
    );
}

// ==================== 8. Scaling Gate: Buckling Analysis ====================

/// Gate: buckling analysis scales sub-cubically.
///
/// Test at 5x5 (25 elems) and 10x10 (100 elems). The dominant cost is the
/// linear pre-solve + Lanczos eigensolver. Allow up to 25x (generous for
/// CI machines and the linear pre-solve overhead).
#[test]
fn scale_buckling_3d_sub_cubic() {
    let small = make_compressed_plate(5, 5);
    let large = make_compressed_plate(10, 10);
    let num_modes = 3;

    // Warmup both sizes
    let _ = buckling::solve_buckling_3d(&small, num_modes);
    let _ = buckling::solve_buckling_3d(&large, num_modes);

    // Measure small
    let t0 = Instant::now();
    for _ in 0..3 {
        let _ = buckling::solve_buckling_3d(&small, num_modes);
    }
    let small_us = t0.elapsed().as_micros() / 3;

    // Measure large
    let t0 = Instant::now();
    for _ in 0..3 {
        let _ = buckling::solve_buckling_3d(&large, num_modes);
    }
    let large_us = t0.elapsed().as_micros() / 3;

    let ratio = large_us as f64 / small_us.max(1) as f64;
    let n_elem_ratio = (10.0 * 10.0) / (5.0 * 5.0); // = 4

    println!(
        "Buckling scale: 5x5 = {}us, 10x10 = {}us, ratio = {:.1}x (elem ratio = {:.0}x)",
        small_us, large_us, ratio, n_elem_ratio
    );

    // 25x threshold catches cubic blowup (4^3 = 64x) while being generous.
    assert!(
        ratio < 25.0,
        "Buckling solve time ratio {:.1}x exceeds 25x for 4x element increase -- possible cubic regression",
        ratio
    );
}
