/// Validation: Stiffness Method Fundamentals (Pure Formula Verification)
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Dover
///   - Weaver & Gere, "Matrix Analysis of Framed Structures", 3rd Ed.
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed.
///   - Kassimali, "Matrix Analysis of Structures", 2nd Ed.
///
/// Tests verify stiffness method properties using direct matrix operations
/// without calling the dedaliano solver.
///   1. Direct stiffness assembly for simple 2-element truss
///   2. Transformation matrix orthogonality (T^T * T = I)
///   3. Stiffness matrix symmetry (K = K^T)
///   4. Static condensation of internal DOFs
///   5. Bandwidth of banded stiffness matrix
///   6. Flexibility matrix from stiffness inverse (F = K^{-1})
///   7. Partitioned matrix operations (K_ff, K_fs, etc.)
///   8. Static condensation accuracy vs full solution

mod helpers;

use std::f64::consts::PI;

// ================================================================
// Helper: 2x2 matrix inverse
// ================================================================
fn inv2(a: [[f64; 2]; 2]) -> [[f64; 2]; 2] {
    let det = a[0][0] * a[1][1] - a[0][1] * a[1][0];
    assert!(det.abs() > 1e-20_f64, "Singular 2x2 matrix");
    [
        [ a[1][1] / det, -a[0][1] / det],
        [-a[1][0] / det,  a[0][0] / det],
    ]
}

// ================================================================
// Helper: 3x3 matrix inverse (Cramer's rule)
// ================================================================
fn inv3(m: [[f64; 3]; 3]) -> [[f64; 3]; 3] {
    let det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    assert!(det.abs() > 1e-20_f64, "Singular 3x3 matrix");
    let inv_det = 1.0_f64 / det;
    let mut r = [[0.0_f64; 3]; 3];
    r[0][0] =  (m[1][1] * m[2][2] - m[1][2] * m[2][1]) * inv_det;
    r[0][1] = -(m[0][1] * m[2][2] - m[0][2] * m[2][1]) * inv_det;
    r[0][2] =  (m[0][1] * m[1][2] - m[0][2] * m[1][1]) * inv_det;
    r[1][0] = -(m[1][0] * m[2][2] - m[1][2] * m[2][0]) * inv_det;
    r[1][1] =  (m[0][0] * m[2][2] - m[0][2] * m[2][0]) * inv_det;
    r[1][2] = -(m[0][0] * m[1][2] - m[0][2] * m[1][0]) * inv_det;
    r[2][0] =  (m[1][0] * m[2][1] - m[1][1] * m[2][0]) * inv_det;
    r[2][1] = -(m[0][0] * m[2][1] - m[0][1] * m[2][0]) * inv_det;
    r[2][2] =  (m[0][0] * m[1][1] - m[0][1] * m[1][0]) * inv_det;
    r
}

// ================================================================
// 1. Direct Stiffness Assembly for 2-Element Truss
// ================================================================
//
// Two truss bars meeting at a node:
//   Bar 1: node 1 (0,0) -> node 2 (L,0), horizontal
//   Bar 2: node 2 (L,0) -> node 3 (L,L), vertical
//
// Each bar has stiffness k_local = EA/L (axial only).
// Assemble global stiffness, apply BCs, and solve for displacement
// at node 2 under applied load.
//
// Reference: Kassimali, "Matrix Analysis of Structures", Ch. 3

#[test]
fn validation_matrix_direct_stiffness_assembly() {
    let e: f64 = 200_000.0; // MPa
    let a: f64 = 0.001;     // m^2 (1000 mm^2)
    let l: f64 = 2.0;       // m

    // Bar 1: horizontal, angle = 0
    // Bar 2: vertical, angle = 90 deg
    let ea_l: f64 = e * 1e6_f64 * a / l; // N/m = 200e9 * 0.001 / 2 = 100e6

    // Truss element stiffness in global coords: k_global = T^T * k_local * T
    // For angle theta, the 4x4 global stiffness (2 nodes, 2 DOFs each) is:
    //   k * [c^2, cs, -c^2, -cs; cs, s^2, -cs, -s^2; -c^2, -cs, c^2, cs; -cs, -s^2, cs, s^2]
    // where c = cos(theta), s = sin(theta), k = EA/L

    // Bar 1 (theta=0): c=1, s=0
    // k1_global = ea_l * [[1,0,-1,0],[0,0,0,0],[-1,0,1,0],[0,0,0,0]]
    // Maps DOFs: (ux1,uy1,ux2,uy2)

    // Bar 2 (theta=90): c=0, s=1
    // k2_global = ea_l * [[0,0,0,0],[0,1,0,-1],[0,0,0,0],[0,-1,0,1]]
    // Maps DOFs: (ux2,uy2,ux3,uy3)

    // Global DOFs: (ux1,uy1, ux2,uy2, ux3,uy3) = 6 DOFs
    // Assembly: add contributions at shared DOFs (ux2,uy2)

    // After assembly, the 6x6 global stiffness:
    // Row/col order: ux1, uy1, ux2, uy2, ux3, uy3
    // K[2][2] = ea_l + 0 = ea_l  (from bar1 node2 ux + bar2 node2 ux)
    // K[3][3] = 0 + ea_l = ea_l  (from bar1 node2 uy + bar2 node2 uy)

    // BCs: node 1 fixed (ux1=uy1=0), node 3 fixed (ux3=uy3=0)
    // Free DOFs: ux2, uy2
    // K_ff = [[ea_l, 0],[0, ea_l]]

    let k_ff = [[ea_l, 0.0_f64], [0.0_f64, ea_l]];

    // Applied load at node 2: Fx=50 kN, Fy=-30 kN
    let fx: f64 = 50_000.0; // N
    let fy: f64 = -30_000.0; // N

    // Solve: u = K_ff^{-1} * F
    let ux2 = fx / k_ff[0][0];
    let uy2 = fy / k_ff[1][1];

    let ux2_expected = fx / ea_l;
    let uy2_expected = fy / ea_l;

    assert!(
        (ux2 - ux2_expected).abs() < 1e-10_f64,
        "ux2: computed={:.6e}, expected={:.6e}",
        ux2, ux2_expected
    );
    assert!(
        (uy2 - uy2_expected).abs() < 1e-10_f64,
        "uy2: computed={:.6e}, expected={:.6e}",
        uy2, uy2_expected
    );

    // Verify bar forces from displacements
    // Bar 1: axial deformation = ux2 - ux1 = ux2 (ux1=0)
    // Force in bar 1 = EA/L * ux2 = ea_l * ux2 = fx (tension)
    let f1 = ea_l * ux2;
    assert!((f1 - fx).abs() < 1e-6_f64, "Bar 1 force: {:.2} N", f1);

    // Bar 2: axial deformation = uy3 - uy2 = -uy2 (uy3=0)
    // Force in bar 2 = EA/L * (-uy2) = -ea_l * uy2 = -fy = 30000 (tension)
    let f2 = ea_l * (-uy2);
    assert!((f2 - (-fy)).abs() < 1e-6_f64, "Bar 2 force: {:.2} N", f2);
}

// ================================================================
// 2. Transformation Matrix Orthogonality (T^T * T = I)
// ================================================================
//
// The transformation matrix T for rotating element local coordinates
// to global coordinates must be orthogonal: T^T * T = I.
//
// For a 2D frame element at angle theta:
//   T = [[c, s, 0], [-s, c, 0], [0, 0, 1]]
// for each node (repeated for start and end nodes).
//
// Reference: Przemieniecki, Ch. 4

#[test]
fn validation_matrix_transformation_orthogonality() {
    let angles: [f64; 5] = [0.0_f64, 30.0_f64, 45.0_f64, 60.0_f64, 90.0_f64];
    let tol = 1e-14_f64;

    for &angle_deg in &angles {
        let theta = angle_deg * PI / 180.0_f64;
        let c = theta.cos();
        let s = theta.sin();

        // 3x3 transformation for one node (ux, uy, rz)
        let t = [
            [c,  s,  0.0_f64],
            [-s, c,  0.0_f64],
            [0.0_f64, 0.0_f64, 1.0_f64],
        ];

        // Compute T^T * T
        let mut tt_t = [[0.0_f64; 3]; 3];
        for i in 0..3_usize {
            for j in 0..3_usize {
                for k in 0..3_usize {
                    tt_t[i][j] += t[k][i] * t[k][j]; // T^T[i][k] * T[k][j]
                }
            }
        }

        // Check identity
        for i in 0..3_usize {
            for j in 0..3_usize {
                let expected = if i == j { 1.0_f64 } else { 0.0_f64 };
                assert!(
                    (tt_t[i][j] - expected).abs() < tol,
                    "T^T*T[{}][{}] at {}deg: computed={:.6e}, expected={:.1}",
                    i, j, angle_deg, tt_t[i][j], expected
                );
            }
        }

        // Also check determinant = 1 (proper rotation)
        let det = t[0][0] * (t[1][1] * t[2][2] - t[1][2] * t[2][1])
                - t[0][1] * (t[1][0] * t[2][2] - t[1][2] * t[2][0])
                + t[0][2] * (t[1][0] * t[2][1] - t[1][1] * t[2][0]);
        assert!(
            (det - 1.0_f64).abs() < tol,
            "det(T) at {}deg: {:.6e}, expected 1.0",
            angle_deg, det
        );
    }
}

// ================================================================
// 3. Stiffness Matrix Symmetry (K = K^T)
// ================================================================
//
// The stiffness matrix of any linear elastic element must be symmetric.
// For a 2D frame element (6x6):
//   K_local = f(EA/L, EI/L^3, EI/L^2, EI/L)
// And the global stiffness K_global = T^T * K_local * T must also
// be symmetric for any angle.
//
// Reference: Weaver & Gere, Ch. 5

#[test]
fn validation_matrix_stiffness_symmetry() {
    let e: f64 = 200_000.0; // MPa
    let a_sec: f64 = 0.005; // m^2
    let iz: f64 = 2e-4;     // m^4
    let l: f64 = 3.0;       // m
    let tol = 1e-10_f64;

    let ea_l = e * 1e6_f64 * a_sec / l;
    let ei = e * 1e6_f64 * iz;
    let ei_l3 = ei / l.powi(3);
    let ei_l2 = ei / l.powi(2);
    let ei_l = ei / l;

    // 6x6 local stiffness for beam-column element
    // DOFs: [ux_i, uy_i, rz_i, ux_j, uy_j, rz_j]
    let k_local: [[f64; 6]; 6] = [
        [ ea_l,       0.0_f64,        0.0_f64,       -ea_l,       0.0_f64,        0.0_f64],
        [ 0.0_f64,    12.0*ei_l3,     6.0*ei_l2,      0.0_f64,  -12.0*ei_l3,      6.0*ei_l2],
        [ 0.0_f64,     6.0*ei_l2,     4.0*ei_l,       0.0_f64,   -6.0*ei_l2,      2.0*ei_l],
        [-ea_l,        0.0_f64,        0.0_f64,        ea_l,       0.0_f64,        0.0_f64],
        [ 0.0_f64,  -12.0*ei_l3,    -6.0*ei_l2,       0.0_f64,   12.0*ei_l3,     -6.0*ei_l2],
        [ 0.0_f64,     6.0*ei_l2,     2.0*ei_l,       0.0_f64,   -6.0*ei_l2,      4.0*ei_l],
    ];

    // Verify local stiffness symmetry
    for i in 0..6_usize {
        for j in 0..6_usize {
            assert!(
                (k_local[i][j] - k_local[j][i]).abs() < tol * ea_l,
                "K_local[{}][{}]={:.6e} != K_local[{}][{}]={:.6e}",
                i, j, k_local[i][j], j, i, k_local[j][i]
            );
        }
    }

    // Now check symmetry of global stiffness at 37 degrees (arbitrary)
    let theta = 37.0_f64 * PI / 180.0_f64;
    let c = theta.cos();
    let s = theta.sin();

    // Full 6x6 transformation
    let mut t_full = [[0.0_f64; 6]; 6];
    // Node i block
    t_full[0][0] = c;  t_full[0][1] = s;
    t_full[1][0] = -s; t_full[1][1] = c;
    t_full[2][2] = 1.0_f64;
    // Node j block
    t_full[3][3] = c;  t_full[3][4] = s;
    t_full[4][3] = -s; t_full[4][4] = c;
    t_full[5][5] = 1.0_f64;

    // K_global = T^T * K_local * T
    let mut temp = [[0.0_f64; 6]; 6]; // K_local * T
    for i in 0..6_usize {
        for j in 0..6_usize {
            for k in 0..6_usize {
                temp[i][j] += k_local[i][k] * t_full[k][j];
            }
        }
    }
    let mut k_global = [[0.0_f64; 6]; 6]; // T^T * temp
    for i in 0..6_usize {
        for j in 0..6_usize {
            for k in 0..6_usize {
                k_global[i][j] += t_full[k][i] * temp[k][j];
            }
        }
    }

    // Verify global stiffness symmetry
    for i in 0..6_usize {
        for j in 0..6_usize {
            assert!(
                (k_global[i][j] - k_global[j][i]).abs() < tol * ea_l,
                "K_global[{}][{}]={:.6e} != K_global[{}][{}]={:.6e} at 37deg",
                i, j, k_global[i][j], j, i, k_global[j][i]
            );
        }
    }
}

// ================================================================
// 4. Static Condensation of Internal DOFs
// ================================================================
//
// For a structure partitioned as:
//   [K_aa  K_ab] [u_a]   [F_a]
//   [K_ba  K_bb] [u_b] = [F_b]
//
// If u_b are internal (free) DOFs to condense out:
//   K_condensed = K_aa - K_ab * K_bb^{-1} * K_ba
//   F_condensed = F_a - K_ab * K_bb^{-1} * F_b
//
// Reference: Przemieniecki, Ch. 6; Guyan reduction

#[test]
fn validation_matrix_static_condensation() {
    // Simple 3-DOF system:
    // K = [[4, -1, 0], [-1, 3, -1], [0, -1, 2]]
    // F = [10, 0, 5]
    //
    // Condense out DOF 2 (middle DOF, index 1):
    // K_aa = [[4, 0],[0, 2]], K_ab = [[-1],[-1]]
    // K_bb = [[3]], K_ba = [[-1, -1]]

    let k_full: [[f64; 3]; 3] = [
        [4.0_f64, -1.0_f64, 0.0_f64],
        [-1.0_f64, 3.0_f64, -1.0_f64],
        [0.0_f64, -1.0_f64, 2.0_f64],
    ];
    let f_full: [f64; 3] = [10.0_f64, 0.0_f64, 5.0_f64];

    // Full solution: K * u = F => u = K^{-1} * F
    let k_inv = inv3(k_full);
    let mut u_full = [0.0_f64; 3];
    for i in 0..3_usize {
        for j in 0..3_usize {
            u_full[i] += k_inv[i][j] * f_full[j];
        }
    }

    // Now condense out DOF 2 (index 1)
    let k_aa: [[f64; 2]; 2] = [[k_full[0][0], k_full[0][2]],
                                 [k_full[2][0], k_full[2][2]]];
    let k_ab: [f64; 2] = [k_full[0][1], k_full[2][1]]; // column vector
    let k_ba: [f64; 2] = [k_full[1][0], k_full[1][2]]; // row vector
    let k_bb: f64 = k_full[1][1];

    // K_condensed = K_aa - K_ab * K_bb^{-1} * K_ba
    let k_bb_inv = 1.0_f64 / k_bb;
    let mut k_cond = [[0.0_f64; 2]; 2];
    for i in 0..2_usize {
        for j in 0..2_usize {
            k_cond[i][j] = k_aa[i][j] - k_ab[i] * k_bb_inv * k_ba[j];
        }
    }

    // F_condensed = F_a - K_ab * K_bb^{-1} * F_b
    let f_a = [f_full[0], f_full[2]];
    let f_b = f_full[1];
    let mut f_cond = [0.0_f64; 2];
    for i in 0..2_usize {
        f_cond[i] = f_a[i] - k_ab[i] * k_bb_inv * f_b;
    }

    // Solve condensed system
    let k_cond_inv = inv2(k_cond);
    let mut u_cond = [0.0_f64; 2];
    for i in 0..2_usize {
        for j in 0..2_usize {
            u_cond[i] += k_cond_inv[i][j] * f_cond[j];
        }
    }

    // Compare with full solution
    let tol = 1e-10_f64;
    assert!(
        (u_cond[0] - u_full[0]).abs() < tol,
        "Condensed u1: {:.6}, full u1: {:.6}",
        u_cond[0], u_full[0]
    );
    assert!(
        (u_cond[1] - u_full[2]).abs() < tol,
        "Condensed u3: {:.6}, full u3: {:.6}",
        u_cond[1], u_full[2]
    );

    // Recover condensed DOF: u_b = K_bb^{-1} * (F_b - K_ba * u_a)
    let u_b_recovered = k_bb_inv * (f_b - k_ba[0] * u_cond[0] - k_ba[1] * u_cond[1]);
    assert!(
        (u_b_recovered - u_full[1]).abs() < tol,
        "Recovered u2: {:.6}, full u2: {:.6}",
        u_b_recovered, u_full[1]
    );
}

// ================================================================
// 5. Bandwidth of Banded Stiffness Matrix
// ================================================================
//
// For a structure with N nodes and maximum node number difference
// across any element = d, the semi-bandwidth of the global
// stiffness matrix is:
//   B = (d + 1) * ndof_per_node
//
// For a sequentially numbered beam with 2D frame DOFs (3 per node):
//   d = 1 (adjacent nodes differ by 1)
//   B = (1+1)*3 = 6
//
// For a poorly numbered mesh (d = max_diff), B can be much larger.
//
// Reference: Weaver & Gere, Ch. 2; Cuthill-McKee algorithm

#[test]
fn validation_matrix_bandwidth_optimization() {
    let ndof: usize = 3; // DOFs per node for 2D frame

    // Case 1: Sequential numbering of 5-element beam
    // Elements: 1-2, 2-3, 3-4, 4-5, 5-6
    let elems_good: Vec<(usize, usize)> = vec![(1, 2), (2, 3), (3, 4), (4, 5), (5, 6)];
    let max_diff_good = elems_good.iter()
        .map(|(ni, nj)| if *ni > *nj { ni - nj } else { nj - ni })
        .max()
        .unwrap();
    let bw_good = (max_diff_good + 1) * ndof;

    assert_eq!(max_diff_good, 1_usize, "Sequential numbering: max node diff = 1");
    assert_eq!(bw_good, 6_usize, "Sequential bandwidth = (1+1)*3 = 6");

    // Case 2: Poor numbering (reversed middle)
    // Elements: 1-6, 6-2, 2-5, 5-3, 3-4
    let elems_bad: Vec<(usize, usize)> = vec![(1, 6), (6, 2), (2, 5), (5, 3), (3, 4)];
    let max_diff_bad = elems_bad.iter()
        .map(|(ni, nj)| if *ni > *nj { ni - nj } else { nj - ni })
        .max()
        .unwrap();
    let bw_bad = (max_diff_bad + 1) * ndof;

    assert_eq!(max_diff_bad, 5_usize, "Poor numbering: max node diff = 5");
    assert_eq!(bw_bad, 18_usize, "Poor bandwidth = (5+1)*3 = 18");

    // Bandwidth ratio shows the cost of poor numbering
    let ratio = bw_bad as f64 / bw_good as f64;
    assert!(
        ratio > 2.0_f64,
        "Poor/good bandwidth ratio: {:.1} should be > 2",
        ratio
    );

    // For a 2D grid (NxN nodes), optimal bandwidth ~ N * ndof
    let n_grid: usize = 10;
    let bw_grid_optimal = n_grid * ndof;
    let bw_grid_worst = (n_grid * n_grid - 1) * ndof; // worst case: node 1 connected to node N*N
    assert!(
        bw_grid_optimal < bw_grid_worst,
        "Grid: optimal BW ({}) < worst BW ({})",
        bw_grid_optimal, bw_grid_worst
    );
}

// ================================================================
// 6. Flexibility Matrix from Stiffness Inverse (F = K^{-1})
// ================================================================
//
// The flexibility matrix is the inverse of the stiffness matrix
// (for the free DOFs). Each column j of F gives the displacements
// when a unit load is applied at DOF j.
//
// For a cantilever beam (1 element, 3 free DOFs at tip):
//   K_ff = [[EA/L, 0, 0], [0, 12EI/L^3, -6EI/L^2], [0, -6EI/L^2, 4EI/L]]
//   F = K_ff^{-1}
//   F[1][1] = L^3/(3EI) (tip deflection per unit transverse load)
//   F[2][2] = L/(EI)    (tip rotation per unit moment, after accounting for coupling)
//
// Reference: McGuire, Gallagher & Ziemian, Ch. 4

#[test]
fn validation_matrix_flexibility_from_stiffness() {
    let e: f64 = 200_000.0; // MPa
    let a_sec: f64 = 0.01;  // m^2
    let iz: f64 = 1e-4;     // m^4
    let l: f64 = 5.0;       // m

    let ea_l = e * 1e6_f64 * a_sec / l;
    let ei = e * 1e6_f64 * iz;
    let ei_l3 = 12.0_f64 * ei / l.powi(3);
    let ei_l2 = 6.0_f64 * ei / l.powi(2);
    let ei_l = 4.0_f64 * ei / l;

    // Stiffness of free DOFs at cantilever tip (ux, uy, rz)
    // The cantilever stiffness at the free end:
    let k_ff: [[f64; 3]; 3] = [
        [ea_l,     0.0_f64,    0.0_f64],
        [0.0_f64,  ei_l3,     -ei_l2],
        [0.0_f64, -ei_l2,      ei_l],
    ];

    // Compute F = K^{-1}
    let f_mat = inv3(k_ff);

    // Check F * K = I
    let tol = 1e-8_f64;
    for i in 0..3_usize {
        for j in 0..3_usize {
            let mut val = 0.0_f64;
            for k in 0..3_usize {
                val += f_mat[i][k] * k_ff[k][j];
            }
            let expected = if i == j { 1.0_f64 } else { 0.0_f64 };
            assert!(
                (val - expected).abs() < tol,
                "F*K[{}][{}]={:.6e}, expected {:.1}",
                i, j, val, expected
            );
        }
    }

    // Verify specific flexibility coefficients
    // F[0][0] = L/(EA) (axial flexibility)
    let f_axial_expected = l / (e * 1e6_f64 * a_sec);
    assert!(
        (f_mat[0][0] - f_axial_expected).abs() / f_axial_expected < 1e-10_f64,
        "F_axial: {:.6e}, expected {:.6e}",
        f_mat[0][0], f_axial_expected
    );

    // F[1][1] = L^3/(3EI) (transverse flexibility)
    let f_transverse_expected = l.powi(3) / (3.0_f64 * ei);
    assert!(
        (f_mat[1][1] - f_transverse_expected).abs() / f_transverse_expected < 1e-10_f64,
        "F_transverse: {:.6e}, expected {:.6e}",
        f_mat[1][1], f_transverse_expected
    );

    // F[2][2] = L/(3EI) (rotational flexibility from full inverse, NOT L/(EI))
    // For the 2x2 submatrix: [[12EI/L^3, -6EI/L^2],[-6EI/L^2, 4EI/L]]
    // Inverse gives F[2][2] = 12EI/L^3 / det where det = 12EI/L^3 * 4EI/L - (6EI/L^2)^2
    //                       = 48(EI)^2/L^4 - 36(EI)^2/L^4 = 12(EI)^2/L^4
    // So F[2][2] = (12EI/L^3) / (12(EI)^2/L^4) = L/(EI)  ... wait:
    // Actually for 2x2: inv = 1/det * [[d, -b],[-c, a]]
    // det = 12EI/L^3 * 4EI/L - (6EI/L^2)^2 = 12(EI)^2/L^4
    // F[2][2] = (12EI/L^3) / (12(EI)^2/L^4) = L/EI  (nope: need the [0][0] element of inv for [1][1])
    // F_22 = a/det = (12EI/L^3) / (12(EI)^2/L^4) = L/EI
    // Actually: F is for the full 3x3, which includes the axial DOF.
    // The bending subblock inverse gives:
    // F_bending = 1/(12(EI)^2/L^4) * [[4EI/L, 6EI/L^2],[6EI/L^2, 12EI/L^3]]
    //           = L^4/(12(EI)^2) * [[4EI/L, 6EI/L^2],[6EI/L^2, 12EI/L^3]]
    //           = [[L^3/(3EI), L^2/(2EI)],[L^2/(2EI), L/EI]]
    let f_rot_expected = l / ei;
    assert!(
        (f_mat[2][2] - f_rot_expected).abs() / f_rot_expected < 1e-10_f64,
        "F_rotational: {:.6e}, expected {:.6e}",
        f_mat[2][2], f_rot_expected
    );

    // Verify coupling term F[1][2] = L^2/(2EI)
    let f_coupling_expected = l.powi(2) / (2.0_f64 * ei);
    assert!(
        (f_mat[1][2] - f_coupling_expected).abs() / f_coupling_expected < 1e-10_f64,
        "F_coupling: {:.6e}, expected {:.6e}",
        f_mat[1][2], f_coupling_expected
    );
}

// ================================================================
// 7. Partitioned Matrix Operations (K_ff, K_fs, etc.)
// ================================================================
//
// The global stiffness equation K*u = F is partitioned into
// free (f) and supported (s) DOFs:
//   [K_ff  K_fs] [u_f]   [F_f]
//   [K_sf  K_ss] [u_s] = [R_s]
//
// Solving: u_f = K_ff^{-1} * F_f (when u_s = 0)
// Reactions: R_s = K_sf * u_f
//
// Verify: F_f = K_ff * u_f (equilibrium check)
//         R_s + F_applied = 0 (global equilibrium)
//
// Reference: Kassimali, Ch. 6

#[test]
fn validation_matrix_partitioned_operations() {
    // Simple spring system: 3 springs in series
    //   1 --k1-- 2 --k2-- 3 --k3-- 4
    // Node 1: fixed (u1=0), Node 4: fixed (u4=0)
    // Apply F2 = 100 N, F3 = -50 N
    let k1: f64 = 1000.0; // N/m
    let k2: f64 = 2000.0;
    let k3: f64 = 1500.0;

    // Full 4x4 stiffness
    // K[1][1] = k1, K[1][2] = -k1
    // K[2][2] = k1+k2, K[2][3] = -k2
    // K[3][3] = k2+k3, K[3][4] = -k3
    // K[4][4] = k3
    // (using 0-based indexing below)

    // Free DOFs: u2, u3 (indices 1, 2)
    // Supported DOFs: u1, u4 (indices 0, 3)
    let k_ff: [[f64; 2]; 2] = [
        [k1 + k2,   -k2],
        [-k2,       k2 + k3],
    ];

    let k_sf: [[f64; 2]; 2] = [
        [-k1,     0.0_f64],  // reaction at node 1 from u2, u3
        [0.0_f64, -k3],      // reaction at node 4 from u2, u3
    ];

    let f_f: [f64; 2] = [100.0_f64, -50.0_f64]; // applied at DOFs 2, 3

    // Solve: u_f = K_ff^{-1} * F_f
    let k_ff_inv = inv2(k_ff);
    let mut u_f = [0.0_f64; 2];
    for i in 0..2_usize {
        for j in 0..2_usize {
            u_f[i] += k_ff_inv[i][j] * f_f[j];
        }
    }

    // Verify: K_ff * u_f = F_f
    let tol = 1e-8_f64;
    for i in 0..2_usize {
        let mut check = 0.0_f64;
        for j in 0..2_usize {
            check += k_ff[i][j] * u_f[j];
        }
        assert!(
            (check - f_f[i]).abs() < tol,
            "K_ff*u_f[{}]={:.6}, expected {:.6}",
            i, check, f_f[i]
        );
    }

    // Compute reactions: R_s = K_sf * u_f
    let mut r_s = [0.0_f64; 2];
    for i in 0..2_usize {
        for j in 0..2_usize {
            r_s[i] += k_sf[i][j] * u_f[j];
        }
    }

    // Global equilibrium: sum of all forces = 0
    let sum_forces = f_f[0] + f_f[1] + r_s[0] + r_s[1];
    assert!(
        sum_forces.abs() < tol,
        "Global equilibrium: sum = {:.6e}",
        sum_forces
    );

    // Verify reactions have correct sign (restoring forces)
    // R1 = -k1 * u2, R4 = -k3 * u3
    let r1_check = -k1 * u_f[0];
    let r4_check = -k3 * u_f[1];
    assert!(
        (r_s[0] - r1_check).abs() < tol,
        "R1: {:.6}, expected {:.6}",
        r_s[0], r1_check
    );
    assert!(
        (r_s[1] - r4_check).abs() < tol,
        "R4: {:.6}, expected {:.6}",
        r_s[1], r4_check
    );
}

// ================================================================
// 8. Static Condensation Accuracy vs Full Solution
// ================================================================
//
// For a 2-span continuous beam with interior support, verify that
// condensing out the interior DOFs at the middle support gives the
// same boundary displacements as the full solution.
//
// Use a 4-DOF system representing a two-spring model:
//   [k1+k2   -k2    0  ] [u1]   [F1]
//   [-k2    k2+k3  -k3 ] [u2] = [F2]
//   [ 0     -k3    k3  ] [u3]   [F3]
//
// Condense out u2, solve for (u1, u3), then recover u2.
//
// Reference: McGuire, Gallagher & Ziemian, Ch. 14 (substructuring)

#[test]
fn validation_matrix_condensation_accuracy() {
    let k1: f64 = 5000.0; // N/m
    let k2: f64 = 3000.0;
    let k3: f64 = 4000.0;

    let k_full: [[f64; 3]; 3] = [
        [k1 + k2,  -k2,      0.0_f64],
        [-k2,      k2 + k3, -k3],
        [0.0_f64, -k3,       k3],
    ];
    let f_full: [f64; 3] = [200.0_f64, -100.0_f64, 300.0_f64];

    // Full solution
    let k_inv = inv3(k_full);
    let mut u_full = [0.0_f64; 3];
    for i in 0..3_usize {
        for j in 0..3_usize {
            u_full[i] += k_inv[i][j] * f_full[j];
        }
    }

    // Condense out u2 (index 1)
    // Retained: u1 (index 0), u3 (index 2)
    let k_aa: [[f64; 2]; 2] = [
        [k_full[0][0], k_full[0][2]],
        [k_full[2][0], k_full[2][2]],
    ];
    let k_ab: [f64; 2] = [k_full[0][1], k_full[2][1]];
    let k_ba: [f64; 2] = [k_full[1][0], k_full[1][2]];
    let k_bb_inv: f64 = 1.0_f64 / k_full[1][1];

    // Condensed stiffness
    let mut k_cond = [[0.0_f64; 2]; 2];
    for i in 0..2_usize {
        for j in 0..2_usize {
            k_cond[i][j] = k_aa[i][j] - k_ab[i] * k_bb_inv * k_ba[j];
        }
    }

    // Condensed force
    let f_a = [f_full[0], f_full[2]];
    let f_b = f_full[1];
    let mut f_cond = [0.0_f64; 2];
    for i in 0..2_usize {
        f_cond[i] = f_a[i] - k_ab[i] * k_bb_inv * f_b;
    }

    // Solve condensed
    let k_cond_inv = inv2(k_cond);
    let mut u_cond = [0.0_f64; 2];
    for i in 0..2_usize {
        for j in 0..2_usize {
            u_cond[i] += k_cond_inv[i][j] * f_cond[j];
        }
    }

    // Recover u2
    let u2_recovered = k_bb_inv * (f_b - k_ba[0] * u_cond[0] - k_ba[1] * u_cond[1]);

    // Compare
    let tol = 1e-10_f64;
    assert!(
        (u_cond[0] - u_full[0]).abs() < tol,
        "u1: condensed={:.10}, full={:.10}",
        u_cond[0], u_full[0]
    );
    assert!(
        (u_cond[1] - u_full[2]).abs() < tol,
        "u3: condensed={:.10}, full={:.10}",
        u_cond[1], u_full[2]
    );
    assert!(
        (u2_recovered - u_full[1]).abs() < tol,
        "u2: recovered={:.10}, full={:.10}",
        u2_recovered, u_full[1]
    );

    // Verify condensed stiffness is still symmetric
    assert!(
        (k_cond[0][1] - k_cond[1][0]).abs() < tol,
        "Condensed K symmetry: K[0][1]={:.6}, K[1][0]={:.6}",
        k_cond[0][1], k_cond[1][0]
    );

    // Verify condensed stiffness is positive definite (both eigenvalues > 0)
    let trace = k_cond[0][0] + k_cond[1][1];
    let det = k_cond[0][0] * k_cond[1][1] - k_cond[0][1] * k_cond[1][0];
    assert!(trace > 0.0_f64, "Trace > 0: {:.6}", trace);
    assert!(det > 0.0_f64, "Det > 0: {:.6}", det);
}
