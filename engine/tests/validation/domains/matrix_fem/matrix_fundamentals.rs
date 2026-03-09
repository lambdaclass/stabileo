/// Validation: Matrix Structural Analysis Fundamentals (Pure Formula Verification)
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Dover
///   - Weaver & Gere, "Matrix Analysis of Framed Structures", 3rd Ed.
///   - Clough & Penzien, "Dynamics of Structures", 3rd Ed.
///   - Cook, Malkus, Plesha: "Concepts and Applications of FEA", 4th Ed.
///
/// Tests verify matrix method formulas without calling the solver.
///   1. 2x2 truss stiffness matrix: k = AE/L * [[1,-1],[-1,1]]
///   2. Beam element stiffness condensation (pin release)
///   3. Coordinate transformation: k_global = T^T * k_local * T
///   4. Direct stiffness assembly: 2-element structure
///   5. Bandwidth of stiffness matrix from node numbering
///   6. Condition number estimation for ill-conditioned structures
///   7. Consistent mass matrix for beam element
///   8. Lumped mass vs consistent mass: frequency ratio

use std::f64::consts::PI;

// ================================================================
// 1. 2x2 Truss Stiffness Matrix: k = AE/L * [[1,-1],[-1,1]]
// ================================================================
//
// The local stiffness matrix for a truss (bar) element with
// axial stiffness AE/L is:
//   k = (AE/L) * [[1, -1], [-1, 1]]
//
// Properties:
//   - Symmetric: k = k^T
//   - Singular (det = 0): rigid body mode
//   - Eigenvalues: 0 and 2*AE/L
//
// Reference: Przemieniecki, Ch. 3

#[test]
fn validation_matrix_truss_stiffness_2x2() {
    let a: f64 = 0.005;   // m^2, cross-section area
    let e: f64 = 200e3;    // MPa
    let l: f64 = 3.0;      // m, element length

    let ae_over_l = a * e * 1000.0 / l; // kN/m (E in MPa * 1000 = kN/m^2)
    // = 0.005 * 200e6 / 3 = 333333.33 kN/m
    let ae_over_l_expected = 0.005 * 200_000_000.0 / 3.0;
    assert!(
        (ae_over_l - ae_over_l_expected).abs() / ae_over_l_expected < 1e-10,
        "AE/L: computed={:.2}, expected={:.2}",
        ae_over_l, ae_over_l_expected
    );

    // Stiffness matrix entries
    let k11 = ae_over_l;
    let k12 = -ae_over_l;
    let k21 = -ae_over_l;
    let k22 = ae_over_l;

    // Symmetry check
    assert!(
        (k12 - k21).abs() < 1e-10,
        "Symmetry: k12={:.4} == k21={:.4}",
        k12, k21
    );

    // Determinant = k11*k22 - k12*k21 = (AE/L)^2 - (AE/L)^2 = 0
    let det = k11 * k22 - k12 * k21;
    assert!(
        det.abs() < 1e-6,
        "Determinant should be zero (rigid body mode): det={:.6e}",
        det
    );

    // Eigenvalues: lambda_1 = 0, lambda_2 = 2*AE/L
    // (trace = 2*AE/L = lambda_1 + lambda_2, det = 0 = lambda_1 * lambda_2)
    let trace = k11 + k22;
    let lambda_2 = trace; // since lambda_1 = 0
    let lambda_2_expected = 2.0 * ae_over_l;
    assert!(
        (lambda_2 - lambda_2_expected).abs() / lambda_2_expected < 1e-10,
        "Non-zero eigenvalue: computed={:.2}, expected={:.2}",
        lambda_2, lambda_2_expected
    );

    // Rigid body mode: [1, 1] (uniform translation)
    // k * [1, 1]^T = [k11+k12, k21+k22]^T = [0, 0]^T
    let rbm_1 = k11 * 1.0 + k12 * 1.0;
    let rbm_2 = k21 * 1.0 + k22 * 1.0;
    assert!(
        rbm_1.abs() < 1e-10 && rbm_2.abs() < 1e-10,
        "Rigid body mode: k*[1,1]^T = [{:.6e}, {:.6e}]",
        rbm_1, rbm_2
    );
}

// ================================================================
// 2. Beam Element Stiffness Condensation (Pin Release)
// ================================================================
//
// The 4x4 beam stiffness matrix (v1, theta1, v2, theta2):
//   k = (EI/L^3) * [[12, 6L, -12, 6L],
//                     [6L, 4L^2, -6L, 2L^2],
//                     [-12, -6L, 12, -6L],
//                     [6L, 2L^2, -6L, 4L^2]]
//
// Pin release at node 2 (theta2 free): condense out DOF 4
//   k_cc = k[0:3, 0:3] - k[0:3, 3] * k[3,3]^-1 * k[3, 0:3]
//
// After condensation, the modified stiffness for DOF (v1, theta1, v2):
//   k_condensed_33 = 12 - 6L * (4L^2)^-1 * 6L ... wait, need to use
//   the correct submatrix operations.
//
// The condensed stiffness at (3,3) position (v2, v2):
//   k22_condensed = k22 - k24 * k44^-1 * k42
//   = 12 - (−6L)*(4L^2)^−1*(−6L) * (EI/L^3)
//   = (EI/L^3) * (12 - 36L^2/(4L^2))
//   = (EI/L^3) * (12 - 9) = 3*EI/L^3
//
// This is the well-known result: a beam pinned at one end has
// stiffness 3EI/L^3 for transverse displacement at the pinned end.
//
// Reference: Weaver & Gere, Ch. 5

#[test]
fn validation_matrix_beam_stiffness_condensation() {
    let e: f64 = 200e3;  // MPa
    let i: f64 = 1e-4;   // m^4
    let l: f64 = 5.0;    // m

    let ei = e * 1000.0 * i; // kN*m^2 (E in kN/m^2)
    let ei_over_l3 = ei / l.powi(3);

    // Full beam stiffness matrix entries (EI/L^3 factored out)
    // For DOFs: [v1, theta1, v2, theta2]
    let k_full = [
        [12.0, 6.0 * l, -12.0, 6.0 * l],
        [6.0 * l, 4.0 * l * l, -6.0 * l, 2.0 * l * l],
        [-12.0, -6.0 * l, 12.0, -6.0 * l],
        [6.0 * l, 2.0 * l * l, -6.0 * l, 4.0 * l * l],
    ];

    // Verify symmetry
    for row in 0..4 {
        for col in 0..4 {
            assert!(
                (k_full[row][col] - k_full[col][row]).abs() < 1e-10,
                "Symmetry: k[{},{}]={:.4} == k[{},{}]={:.4}",
                row, col, k_full[row][col], col, row, k_full[col][row]
            );
        }
    }

    // Static condensation: eliminate theta2 (DOF index 3)
    // For each remaining DOF pair (i,j), i,j in {0,1,2}:
    //   k_cond[i][j] = k[i][j] - k[i][3] * k[3][3]^-1 * k[3][j]
    let k44_inv = 1.0 / k_full[3][3]; // = 1/(4L^2)

    // Condensed stiffness for v2-v2 (index 2,2):
    let k_cond_22 = k_full[2][2] - k_full[2][3] * k44_inv * k_full[3][2];
    // = 12 - (-6L) * (1/(4L^2)) * (-6L) = 12 - 36L^2/(4L^2) = 12 - 9 = 3
    let k_cond_22_expected = 3.0;
    assert!(
        (k_cond_22 - k_cond_22_expected).abs() / k_cond_22_expected < 1e-10,
        "Condensed k_v2v2: computed={:.4}, expected={:.4}",
        k_cond_22, k_cond_22_expected
    );

    // The actual stiffness (with EI/L^3 factor): 3*EI/L^3
    let stiffness_pinned = k_cond_22 * ei_over_l3;
    let stiffness_expected = 3.0 * ei / l.powi(3);
    assert!(
        (stiffness_pinned - stiffness_expected).abs() / stiffness_expected < 1e-10,
        "Pinned beam stiffness: computed={:.4}, expected={:.4}",
        stiffness_pinned, stiffness_expected
    );

    // Condensed stiffness for theta1-theta1 (index 1,1):
    let k_cond_11 = k_full[1][1] - k_full[1][3] * k44_inv * k_full[3][1];
    // = 4L^2 - 2L^2 * (1/(4L^2)) * 2L^2 = 4L^2 - 4L^4/(4L^2) = 4L^2 - L^2 = 3L^2
    let k_cond_11_expected = 3.0 * l * l;
    assert!(
        (k_cond_11 - k_cond_11_expected).abs() / k_cond_11_expected < 1e-10,
        "Condensed k_theta1_theta1: computed={:.4}, expected={:.4}",
        k_cond_11, k_cond_11_expected
    );
}

// ================================================================
// 3. Coordinate Transformation: k_global = T^T * k_local * T
// ================================================================
//
// For a truss element at angle alpha from the global X-axis:
//   T = [[c, s], [-s, c]] for 2D rotation
//
// For 4-DOF truss (ux1, uy1, ux2, uy2):
//   T = [[c, s, 0, 0],
//        [0, 0, c, s]]
//   k_global = T^T * k_local * T
//
// Result for a truss at angle alpha:
//   k_global = (AE/L) * [[c^2, cs, -c^2, -cs],
//                          [cs, s^2, -cs, -s^2],
//                          [-c^2, -cs, c^2, cs],
//                          [-cs, -s^2, cs, s^2]]
// where c = cos(alpha), s = sin(alpha).
//
// Reference: Przemieniecki, Ch. 4

#[test]
fn validation_matrix_coordinate_transformation() {
    let _ae_over_l: f64 = 1000.0; // kN/m (normalized)
    let alpha = 30.0_f64.to_radians(); // 30 degrees
    let c = alpha.cos();
    let s = alpha.sin();

    // Global stiffness matrix for truss at angle alpha
    let k_global = [
        [c * c, c * s, -c * c, -c * s],
        [c * s, s * s, -c * s, -s * s],
        [-c * c, -c * s, c * c, c * s],
        [-c * s, -s * s, c * s, s * s],
    ];

    // Verify symmetry
    for i in 0..4 {
        for j in 0..4 {
            assert!(
                (k_global[i][j] - k_global[j][i]).abs() < 1e-10,
                "Symmetry: k[{},{}]={:.6} == k[{},{}]={:.6}",
                i, j, k_global[i][j], j, i, k_global[j][i]
            );
        }
    }

    // Verify specific values for alpha = 30 deg
    // c = cos(30) = sqrt(3)/2 ~ 0.8660, s = sin(30) = 0.5
    let c_expected = 3.0_f64.sqrt() / 2.0;
    let s_expected = 0.5;
    assert!((c - c_expected).abs() < 1e-10, "cos(30): {:.6}", c);
    assert!((s - s_expected).abs() < 1e-10, "sin(30): {:.6}", s);

    // k[0][0] = c^2 = 3/4 = 0.75
    let k00_expected = 0.75;
    assert!(
        (k_global[0][0] - k00_expected).abs() / k00_expected < 1e-10,
        "k[0][0]: computed={:.6}, expected={:.6}",
        k_global[0][0], k00_expected
    );

    // k[0][1] = cs = (sqrt(3)/2)(1/2) = sqrt(3)/4 ~ 0.4330
    let k01_expected = 3.0_f64.sqrt() / 4.0;
    assert!(
        (k_global[0][1] - k01_expected).abs() / k01_expected < 1e-10,
        "k[0][1]: computed={:.6}, expected={:.6}",
        k_global[0][1], k01_expected
    );

    // k[1][1] = s^2 = 1/4 = 0.25
    let k11_expected = 0.25;
    assert!(
        (k_global[1][1] - k11_expected).abs() / k11_expected < 1e-10,
        "k[1][1]: computed={:.6}, expected={:.6}",
        k_global[1][1], k11_expected
    );

    // For alpha = 0 (horizontal element): k should reduce to
    // [[1,0,-1,0],[0,0,0,0],[-1,0,1,0],[0,0,0,0]]
    let alpha0 = 0.0_f64;
    let c0 = alpha0.cos();
    let s0 = alpha0.sin();
    assert!((c0 * c0 - 1.0).abs() < 1e-10, "cos^2(0) = 1");
    assert!(s0.abs() < 1e-10, "sin(0) = 0");
    assert!((c0 * s0).abs() < 1e-10, "cos(0)*sin(0) = 0");

    // For alpha = 90 (vertical element): k should be
    // [[0,0,0,0],[0,1,0,-1],[0,0,0,0],[0,-1,0,1]]
    let alpha90 = PI / 2.0;
    let c90 = alpha90.cos();
    let s90 = alpha90.sin();
    assert!(c90.abs() < 1e-10, "cos(90) ~ 0");
    assert!((s90 - 1.0).abs() < 1e-10, "sin(90) ~ 1");
}

// ================================================================
// 4. Direct Stiffness Assembly: 2-Element Structure
// ================================================================
//
// Two truss elements connected at a middle node:
//   Element 1: nodes 1-2, length L, AE/L = k1
//   Element 2: nodes 2-3, length L, AE/L = k2
//
// Both horizontal. Global stiffness matrix (3 DOFs: u1, u2, u3):
//   K = [[k1, -k1, 0],
//        [-k1, k1+k2, -k2],
//        [0, -k2, k2]]
//
// With u1 = 0 (fixed), force P at node 3:
//   Reduced system: [[k1+k2, -k2], [-k2, k2]] * [u2, u3] = [0, P]
//   Solution: u2 = P/k1, u3 = P*(1/k1 + 1/k2)
//     (springs in series)
//
// Reference: Weaver & Gere, Ch. 2

#[test]
fn validation_matrix_direct_stiffness_assembly() {
    let k1: f64 = 5000.0; // kN/m, stiffness of element 1
    let k2: f64 = 3000.0; // kN/m, stiffness of element 2
    let p: f64 = 60.0;    // kN, applied force at node 3

    // Assembled global stiffness matrix (before applying BCs)
    let k_global = [
        [k1, -k1, 0.0],
        [-k1, k1 + k2, -k2],
        [0.0, -k2, k2],
    ];

    // Verify symmetry
    for i in 0..3 {
        for j in 0..3 {
            assert!(
                (k_global[i][j] - k_global[j][i]).abs() < 1e-10,
                "Assembly symmetry: K[{},{}] = K[{},{}]",
                i, j, j, i
            );
        }
    }

    // Apply BC: u1 = 0, reduce to 2x2 system
    // [[k1+k2, -k2], [-k2, k2]] * [u2, u3] = [0, P]
    let det = (k1 + k2) * k2 - (-k2) * (-k2);
    // det = k1*k2 + k2^2 - k2^2 = k1*k2
    let det_expected = k1 * k2;
    assert!(
        (det - det_expected).abs() / det_expected < 1e-10,
        "Determinant: computed={:.2}, expected={:.2}",
        det, det_expected
    );

    // Solve: u2 = (k2*0 - (-k2)*P) / det = k2*P/(k1*k2) = P/k1
    let u2 = p / k1;
    let u2_expected = 60.0 / 5000.0; // = 0.012 m
    assert!(
        (u2 - u2_expected).abs() / u2_expected < 1e-10,
        "u2: computed={:.6}, expected={:.6}",
        u2, u2_expected
    );

    // u3 = ((k1+k2)*P - (-k2)*0) / det = (k1+k2)*P/(k1*k2) = P/k1 + P/k2
    let u3 = p / k1 + p / k2;
    let u3_expected = 0.012 + 0.02; // = 0.032 m
    assert!(
        (u3 - u3_expected).abs() / u3_expected < 1e-10,
        "u3: computed={:.6}, expected={:.6}",
        u3, u3_expected
    );

    // Reaction at node 1: R1 = -k1 * u2 = -5000 * 0.012 = -60 kN (equal to applied load)
    let r1 = -k1 * u2;
    assert!(
        (r1 + p).abs() < 1e-10,
        "Reaction: R1={:.2}, P={:.2}, should satisfy R1+P=0",
        r1, p
    );
}

// ================================================================
// 5. Bandwidth of Stiffness Matrix from Node Numbering
// ================================================================
//
// For a banded stiffness matrix, the semi-bandwidth is:
//   b = (max node difference in any element) * DOFs_per_node + 1
//
// Good numbering minimizes bandwidth.
// For a chain of n elements (1D mesh):
//   Sequential numbering: max diff = 1, bandwidth = DOF+1
//   Reversed: same
//   Random: bandwidth can be much larger
//
// Reference: Cook et al., "Concepts and Applications of FEA", Ch. 2

#[test]
fn validation_matrix_bandwidth_estimation() {
    let dof_per_node = 3; // 2D frame: ux, uy, rz

    // Case 1: 5-element sequential chain (nodes 1-2-3-4-5-6)
    let elements_seq = [(1, 2), (2, 3), (3, 4), (4, 5), (5, 6)];
    let max_diff_seq = elements_seq.iter()
        .map(|(ni, nj)| (*ni as i32 - *nj as i32).unsigned_abs() as usize)
        .max().unwrap();
    assert_eq!(max_diff_seq, 1, "Sequential max diff should be 1");

    let bw_seq = (max_diff_seq + 1) * dof_per_node;
    let bw_seq_expected = 6; // (1+1)*3 = 6
    assert_eq!(bw_seq, bw_seq_expected,
        "Sequential bandwidth: {} (expected {})", bw_seq, bw_seq_expected);

    // Case 2: Poor numbering (nodes 1-6-2-5-3-4)
    let elements_poor = [(1, 6), (6, 2), (2, 5), (5, 3), (3, 4)];
    let max_diff_poor = elements_poor.iter()
        .map(|(ni, nj)| (*ni as i32 - *nj as i32).unsigned_abs() as usize)
        .max().unwrap();
    assert_eq!(max_diff_poor, 5, "Poor numbering max diff should be 5");

    let bw_poor = (max_diff_poor + 1) * dof_per_node;
    let bw_poor_expected = 18; // (5+1)*3 = 18
    assert_eq!(bw_poor, bw_poor_expected,
        "Poor bandwidth: {} (expected {})", bw_poor, bw_poor_expected);

    // Poor numbering bandwidth >> sequential numbering bandwidth
    assert!(bw_poor > bw_seq,
        "Poor BW ({}) > Sequential BW ({})", bw_poor, bw_seq);

    // Case 3: 2D mesh example (4 nodes, 4 elements forming a square)
    // Good numbering: elements (1,2), (2,3), (3,4), (4,1), (1,3)
    let elements_2d = [(1, 2), (2, 3), (3, 4), (4, 1), (1, 3)];
    let max_diff_2d = elements_2d.iter()
        .map(|(ni, nj)| (*ni as i32 - *nj as i32).unsigned_abs() as usize)
        .max().unwrap();
    // max diff is from element (4,1) or (1,3): 3 or 2 → 3
    assert_eq!(max_diff_2d, 3, "2D mesh max diff should be 3");
}

// ================================================================
// 6. Condition Number Estimation for Ill-Conditioned Structures
// ================================================================
//
// The condition number of a stiffness matrix indicates numerical
// sensitivity. For a diagonal matrix:
//   cond(K) = max(k_ii) / min(k_ii)
//
// High condition numbers arise from:
//   - Very different element stiffnesses (e.g., stiff truss + flexible beam)
//   - Long slender elements vs short stiff ones
//
// For a simple 2x2 system [[a, 0], [0, b]]:
//   cond = max(a,b) / min(a,b)
//
// Reference: Cook et al., Sec. 2.9

#[test]
fn validation_matrix_condition_number_estimation() {
    // Case 1: Well-conditioned: similar stiffnesses
    let k1: f64 = 1e6;  // kN/m
    let k2: f64 = 2e6;  // kN/m
    let cond_good = k2 / k1; // = 2
    assert!(
        (cond_good - 2.0).abs() < 1e-10,
        "Well-conditioned: cond={:.2}",
        cond_good
    );

    // Case 2: Ill-conditioned: very different stiffnesses
    let k_stiff: f64 = 1e10; // very stiff element (e.g., rigid link)
    let k_flex: f64 = 1e3;   // very flexible element
    let cond_bad = k_stiff / k_flex; // = 1e7
    let cond_bad_expected = 1e7;
    assert!(
        (cond_bad - cond_bad_expected).abs() / cond_bad_expected < 1e-10,
        "Ill-conditioned: cond={:.2e}",
        cond_bad
    );

    // In practice, cond > 1e15 leads to loss of all significant digits
    // (for f64 with ~16 decimal digits)
    let max_reliable_cond = 1e15;
    assert!(
        cond_bad < max_reliable_cond,
        "Condition number {:.2e} should be < {:.2e} for reliable results",
        cond_bad, max_reliable_cond
    );

    // Condition number for a truss element stiffness matrix:
    // The non-trivial eigenvalue is 2*AE/L, the trivial is 0.
    // After applying BCs, the condition number depends on the ratio
    // of max/min diagonal entries.
    //
    // For two springs in series: K_reduced = [[k1+k2, -k2],[-k2, k2]]
    // Eigenvalues: lambda = ((k1+2*k2) +/- sqrt((k1+2*k2)^2 - 4*k1*k2)) / 2
    //            = ((k1+2*k2) +/- sqrt(k1^2 + 4*k2^2)) / 2
    let ka: f64 = 100.0;
    let kb: f64 = 10000.0;
    let trace_val = ka + 2.0 * kb;
    let det_val = ka * kb;
    let disc = (trace_val * trace_val - 4.0 * det_val).sqrt();
    let lambda_max = (trace_val + disc) / 2.0;
    let lambda_min = (trace_val - disc) / 2.0;
    let cond_springs = lambda_max / lambda_min;

    // For ka << kb: lambda_max ~ 2*kb, lambda_min ~ ka*kb/(2*kb) = ka/2
    // cond ~ 4*kb/ka = 400
    assert!(
        cond_springs > 1.0,
        "Spring system condition: {:.2}",
        cond_springs
    );
    assert!(
        cond_springs < 1000.0,
        "Moderate condition number: {:.2}",
        cond_springs
    );
}

// ================================================================
// 7. Consistent Mass Matrix for Beam Element
// ================================================================
//
// The consistent mass matrix for a beam element is:
//   M = (rho*A*L/420) * [[156, 22L, 54, -13L],
//                          [22L, 4L^2, 13L, -3L^2],
//                          [54, 13L, 156, -22L],
//                          [-13L, -3L^2, -22L, 4L^2]]
//
// Properties:
//   - Symmetric: M = M^T
//   - Positive definite
//   - Total mass: sum of diagonal = rho*A*L*(156+4L^2+156+4L^2)/420
//     Actually total mass = rho*A*L; diagonal sum != total mass.
//     The total translational mass check: M*[1,0,1,0]^T should give
//     total mass distributed to translational DOFs.
//
// Reference: Clough & Penzien, Ch. 10; Przemieniecki, Ch. 8

#[test]
fn validation_matrix_consistent_mass_beam() {
    let rho: f64 = 7850.0;  // kg/m^3
    let a: f64 = 0.005;     // m^2
    let l: f64 = 4.0;       // m

    let factor: f64 = rho * a * l / 420.0;
    let factor_expected = 7850.0 * 0.005 * 4.0 / 420.0;
    assert!(
        (factor - factor_expected).abs() / factor_expected < 1e-10,
        "Mass matrix factor: computed={:.6}, expected={:.6}",
        factor, factor_expected
    );

    // Mass matrix entries (without the rho*A*L/420 factor)
    let m_raw = [
        [156.0, 22.0 * l, 54.0, -13.0 * l],
        [22.0 * l, 4.0 * l * l, 13.0 * l, -3.0 * l * l],
        [54.0, 13.0 * l, 156.0, -22.0 * l],
        [-13.0 * l, -3.0 * l * l, -22.0 * l, 4.0 * l * l],
    ];

    // Verify symmetry
    for i in 0..4 {
        for j in 0..4 {
            assert!(
                (m_raw[i][j] - m_raw[j][i]).abs() < 1e-10,
                "Mass symmetry: M[{},{}]={:.4} == M[{},{}]={:.4}",
                i, j, m_raw[i][j], j, i, m_raw[j][i]
            );
        }
    }

    // Check specific entries for L = 4 m
    assert!((m_raw[0][1] - 88.0).abs() < 1e-10, "M[0,1] = 22L = 88");
    assert!((m_raw[1][1] - 64.0).abs() < 1e-10, "M[1,1] = 4L^2 = 64");
    assert!((m_raw[0][2] - 54.0).abs() < 1e-10, "M[0,2] = 54");
    assert!((m_raw[0][3] - (-52.0)).abs() < 1e-10, "M[0,3] = -13L = -52");
    assert!((m_raw[1][2] - 52.0).abs() < 1e-10, "M[1,2] = 13L = 52");
    assert!((m_raw[1][3] - (-48.0)).abs() < 1e-10, "M[1,3] = -3L^2 = -48");

    // Total mass check: apply uniform translation [1, 0, 1, 0]
    // The consistent mass matrix should give total force = rho*A*L * accel
    // M * [1,0,1,0]^T = factor * [156+54, 22L+13L, 54+156, -13L-22L]
    //                  = factor * [210, 35L, 210, -35L]
    let translational_mass = factor * (156.0 + 54.0 + 54.0 + 156.0);
    // = factor * 420 = rho*A*L
    let total_mass = rho * a * l;
    assert!(
        (translational_mass - total_mass).abs() / total_mass < 1e-10,
        "Total mass: sum_diag_translational={:.6}, rho*A*L={:.6}",
        translational_mass, total_mass
    );
}

// ================================================================
// 8. Lumped Mass vs Consistent Mass: Frequency Ratio
// ================================================================
//
// For a simply supported beam, the nth natural frequency is:
//   f_n = (n*pi/L)^2 * sqrt(EI/(rho*A))  / (2*pi)
//
// Using lumped mass matrix: frequencies are slightly lower than
// with consistent mass for lower modes, and the ratio depends on
// the number of elements.
//
// For a single-element model with lumped mass:
//   omega_lumped = sqrt(k/m_lumped)
// For consistent mass:
//   omega_consistent = sqrt(k/m_consistent)
//
// The exact first frequency for SS beam:
//   omega_1 = pi^2/L^2 * sqrt(EI/(rho*A))
//
// For a single-element model (2 DOFs after BCs: one transverse + one rotation):
//   The lumped mass approximation gives a frequency that is lower
//   by a factor that depends on the mass distribution.
//
// Known result: for a single-element SS beam model:
//   omega_consistent / omega_exact = 1.0 (exact for 1 element w/ consistent mass)
//   omega_lumped / omega_exact < 1.0
//
// More specifically, for n elements with lumped mass, the frequency
// converges from below, while consistent mass converges from above.
//
// Reference: Cook et al., Ch. 11

#[test]
fn validation_matrix_lumped_vs_consistent_frequency() {
    let e: f64 = 200e3;     // MPa = 200e3 N/mm^2
    let i_val: f64 = 1e-4;  // m^4
    let rho: f64 = 7850.0;  // kg/m^3
    let a: f64 = 0.005;     // m^2
    let l: f64 = 6.0;       // m

    // Exact first natural frequency of SS beam
    let ei = e * 1e6 * i_val; // N*m^2 (E in Pa)
    let rho_a = rho * a;       // kg/m

    let omega_1_exact = PI * PI / (l * l) * (ei / rho_a).sqrt();
    // = (pi^2/36) * sqrt(200e9 * 1e-4 / (7850*0.005))
    // = (9.8696/36) * sqrt(2e7 / 39.25)
    // = 0.27416 * sqrt(509554)
    // = 0.27416 * 713.83
    // = 195.7 rad/s
    let f_1_exact = omega_1_exact / (2.0 * PI);

    // Frequency should be reasonable (typically 10-100 Hz for steel beams)
    assert!(
        f_1_exact > 1.0 && f_1_exact < 500.0,
        "Exact f1 = {:.2} Hz should be reasonable",
        f_1_exact
    );

    // For a single-element SS beam model with consistent mass:
    // Stiffness: k_theta = 4EI/L (rotational spring at midspan)
    // But the single-element model has only one free DOF (midspan rotation).
    // Actually for SS beam with single element: after BCs, free DOFs are
    // (uy and rz at each internal node). With 1 element, there are no
    // internal nodes! So we need at least 2 elements.

    // For a 2-element model, 1 internal node with DOFs (uy2, rz2):
    // Consistent mass at internal node (from two beam elements each of L/2):
    // M_node = 2 * (rho*A*(L/2)/420) * 156 = rho*A*L/420 * 156
    // But this is approximate — let's just verify the exact formula.

    // Verify the exact formula components
    let ei_check = e * 1e6 * i_val;
    assert!(
        (ei_check - 20_000_000.0).abs() < 1e-6,
        "EI: {:.2} N*m^2",
        ei_check
    );

    let rho_a_check = rho * a;
    assert!(
        (rho_a_check - 39.25).abs() < 1e-10,
        "rho*A: {:.4} kg/m",
        rho_a_check
    );

    // Lumped mass frequency will be lower than consistent mass frequency
    // (this is a well-known result in FEA).
    // For a simple 1-DOF model: omega^2 = k/m
    // Lumped mass: m_L = rho*A*L/2 (half the beam mass at midspan)
    // Consistent mass (effective): m_C = rho*A*L * 156/420 ~ 0.3714*rho*A*L
    //   (This is the diagonal entry of the consistent mass matrix)

    let m_lumped = rho_a * l / 2.0; // kg (half total mass at midspan)
    let m_consistent_diag = rho_a * l * 156.0 / 420.0; // effective consistent mass

    // omega^2_L = k / m_L, omega^2_C = k / m_C
    // ratio = omega_L / omega_C = sqrt(m_C / m_L)
    let freq_ratio = (m_consistent_diag / m_lumped).sqrt();
    // m_C/m_L = (156/420) / (1/2) = 312/420 = 0.7429
    // ratio = sqrt(0.7429) = 0.8619
    let ratio_expected = (312.0 / 420.0_f64).sqrt();
    assert!(
        (freq_ratio - ratio_expected).abs() / ratio_expected < 1e-10,
        "Frequency ratio (lumped/consistent): computed={:.6}, expected={:.6}",
        freq_ratio, ratio_expected
    );

    // Lumped mass gives lower frequency (larger mass → lower frequency)
    assert!(
        m_lumped > m_consistent_diag,
        "Lumped mass ({:.4}) > Consistent diag ({:.4})",
        m_lumped, m_consistent_diag
    );

    // Therefore omega_lumped < omega_consistent for this simple model
    assert!(
        freq_ratio < 1.0,
        "Lumped frequency < Consistent frequency: ratio={:.4}",
        freq_ratio
    );
}
