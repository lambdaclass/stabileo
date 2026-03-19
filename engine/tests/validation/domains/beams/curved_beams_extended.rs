/// Validation: Curved Beam and Ring Analysis Benchmarks
///
/// References:
///   - Boresi & Schmidt, "Advanced Mechanics of Materials", 6th Ed., Ch. 9 (curved beams)
///   - Roark & Young, "Formulas for Stress and Strain", 8th Ed., Table 9.2 (rings)
///   - Timoshenko & Goodier, "Theory of Elasticity", 3rd Ed., Art. 29 (curved bars)
///   - Timoshenko & Young, "Theory of Structures", 2nd Ed., Ch. 9 (arches)
///   - Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 12, 15
///   - Cook & Young, "Advanced Mechanics of Materials", 2nd Ed., Ch. 8
///
/// Tests verify curved beams modeled as multi-segment straight elements:
///   1. Winkler-Bach bending stress formula for curved beams
///   2. Circular ring under diametral loading: Roark formulas
///   3. Semicircular arch: horizontal thrust and max moment
///   4. Curved beam stress distribution: inner vs outer fiber ratio
///   5. Castigliano's theorem for curved beam deflection
///   6. Ring stiffness: thick vs thin ring behavior (R/h ratio)
///   7. Parabolic arch vs circular arch: thrust comparison for UDL
///   8. Curved beam neutral axis shift from centroidal axis
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa (solver uses E_eff = E * 1000)
const A: f64 = 0.01;       // m^2
const IZ: f64 = 1e-4;      // m^4

/// Build a parabolic arch: y = 4*f_rise/(L^2) * x * (L - x)
fn make_parabolic_arch_ext(
    n: usize,
    l: f64,
    f_rise: f64,
    e: f64,
    a: f64,
    iz: f64,
    left_sup: &str,
    right_sup: &str,
    hinge_at_crown: bool,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let mut nodes = Vec::new();
    for i in 0..=n {
        let x = i as f64 * l / n as f64;
        let y = 4.0 * f_rise / (l * l) * x * (l - x);
        nodes.push((i + 1, x, y));
    }

    let crown_elem = n / 2;
    let elems: Vec<_> = (0..n)
        .map(|i| {
            let hs = hinge_at_crown && (i == crown_elem);
            let he = hinge_at_crown && (i + 1 == crown_elem);
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
        })
        .collect();

    let sups = vec![(1, 1_usize, left_sup), (2, n + 1, right_sup)];
    make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads)
}

// ================================================================
// 1. Winkler-Bach Formula: Bending Stress in Curved Beam
// ================================================================
//
// The Winkler-Bach formula gives the bending stress in a curved beam:
//
//   sigma = M * (R_n - r) / (A * e * r)
//
// where:
//   R = radius of curvature to centroidal axis
//   e = eccentricity = R - R_n (shift of neutral axis from centroid)
//   R_n = A / integral(dA / r) = neutral axis radius
//   r = radial distance from center of curvature to fiber
//
// For a rectangular cross-section of depth h:
//   R_n = h / ln(R_o / R_i)  where R_o = R + h/2, R_i = R - h/2
//   e = R - R_n
//
// We verify this by modeling a quarter-circle cantilever under a tip
// load and comparing the fixed-end reaction moment against the
// analytical value M = P * R (moment arm = radius).
// Also verify the Winkler-Bach prediction that inner fiber stress
// exceeds the straight-beam My/I prediction.
//
// Ref: Boresi & Schmidt, "Advanced Mechanics of Materials", 6th Ed., Ch. 9

#[test]
fn validation_curv_ext_winkler_bach_curved_beam_stress() {
    let r: f64 = 5.0;    // radius to centroidal axis (m)
    let n = 20;           // segments for quarter circle
    let p = 10.0;         // tip load (kN)

    // Quarter circle arc: theta from 0 to pi/2
    // Fixed at theta=0 (point (R,0)), free at theta=pi/2 (point (0,R))
    let pi: f64 = std::f64::consts::PI;

    let mut nodes = Vec::new();
    for i in 0..=n {
        let theta = pi / 2.0 * i as f64 / n as f64;
        let x = r * theta.cos();
        let y = r * theta.sin();
        nodes.push((i + 1, x, y));
    }

    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1_usize, "fixed")];

    // Downward point load at tip (node n+1 is at top of arc)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // For a quarter-circle cantilever with vertical load P at the free end:
    // The tip is at (0, R) and the support is at (R, 0).
    // Horizontal distance from tip load line (x=0) to support (x=R) = R.
    // So M_fixed = P * R = 10 * 5 = 50 kN-m
    let m_fixed_expected = p * r;

    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(r_fixed.my.abs(), m_fixed_expected, 0.03,
        "Winkler-Bach: fixed-end moment M = P*R");

    // Winkler-Bach stress comparison for rectangular section:
    //   h = sqrt(12 * Iz / A) (from Iz = bh^3/12 and A = bh)
    let h_sec: f64 = (12.0 * IZ / A).sqrt();
    let r_inner: f64 = r - h_sec / 2.0;
    let r_outer: f64 = r + h_sec / 2.0;

    // Neutral axis radius: R_n = h / ln(R_o/R_i)
    let r_n: f64 = h_sec / (r_outer / r_inner).ln();

    // Eccentricity: e = R - R_n (shift from centroid to neutral axis)
    let ecc: f64 = r - r_n;

    // The eccentricity should be positive (neutral axis shifts toward center)
    assert!(ecc > 0.0,
        "Neutral axis should shift toward center of curvature: e={:.6}", ecc);

    // For R/h = 5/0.346 ~ 14.4, confirm this is a relatively thin curved beam
    let r_over_h: f64 = r / h_sec;
    assert!(r_over_h > 10.0,
        "R/h ratio = {:.2}, confirms relatively thin curved beam", r_over_h);

    // Winkler-Bach stress at inner fiber:
    //   sigma_inner = M * (R_n - R_i) / (A * e * R_i)
    // Straight beam stress:
    //   sigma_straight = M * c / I = M * (h/2) / Iz
    let m_at_support: f64 = m_fixed_expected;
    let sigma_wb_inner: f64 = m_at_support * (r_n - r_inner) / (A * ecc * r_inner);
    let sigma_straight: f64 = m_at_support * (h_sec / 2.0) / IZ;

    // For a curved beam, inner fiber stress > straight beam stress
    assert!(sigma_wb_inner > sigma_straight,
        "Curved beam inner stress ({:.2}) > straight beam stress ({:.2})",
        sigma_wb_inner, sigma_straight);
}

// ================================================================
// 2. Circular Ring Under Diametral Loading: Roark Formulas
// ================================================================
//
// A circular ring loaded by two equal and opposite forces P along
// a diameter (diametral compression/tension).
//
// From Roark's "Formulas for Stress and Strain", 8th Ed., Table 9.2:
// For a thin ring under diametrically opposed forces P:
//   Diametral deflection (change in vertical diameter):
//     delta_v = P*R^3/(E*I) * (pi/4 - 2/pi)
//
// We model the right half of the ring (theta from -pi/2 to +pi/2)
// with symmetry boundary conditions:
//   - Bottom and top nodes: rollerX (restrain uy, free ux)
//   - Equator node: rollerY (restrain ux, free uy) to prevent rigid body
//
// Ref: Roark & Young, "Formulas for Stress and Strain", 8th Ed., Table 9.2

#[test]
fn validation_curv_ext_circular_ring_diametral_load() {
    let r: f64 = 4.0;    // ring mean radius (m)
    let n = 24;           // segments for half ring
    let p = 20.0;         // total diametral force (kN)
    let pi: f64 = std::f64::consts::PI;
    let e_eff: f64 = E * 1000.0;

    // Model right half ring from theta = -pi/2 to +pi/2
    // Bottom at (-pi/2) = (0, -R), top at (+pi/2) = (0, +R), equator at (0) = (R, 0)
    let mut nodes = Vec::new();
    for i in 0..=n {
        let theta = -pi / 2.0 + pi * i as f64 / n as f64;
        let x = r * theta.cos();
        let y = r * theta.sin();
        nodes.push((i + 1, x, y));
    }

    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Symmetry boundary conditions for half-ring under diametral loading:
    // Bottom node (1) and top node (n+1) lie on the vertical axis of symmetry:
    //   ux = 0, rz = 0, uy free  ->  "guidedY"
    // Equator node (mid) lies on the horizontal axis of symmetry:
    //   uy = 0, rz = 0, ux free  ->  "guidedX"
    let mid_node = n / 2 + 1;
    let sups = vec![
        (1, 1_usize, "guidedY"),
        (2, n + 1, "guidedY"),
        (3, mid_node, "guidedX"),
    ];

    // Apply P/2 at each load point (top and bottom)
    // This represents two diametrically opposed forces squeezing the ring
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1, fx: 0.0, fz: -p / 2.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: p / 2.0, my: 0.0,
        }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Roark: deflection of the diameter along the load direction
    // delta_v = P*R^3/(E*I) * (pi/4 - 2/pi)  (for the full ring)
    let delta_roark: f64 = p * r * r * r / (e_eff * IZ) * (pi / 4.0 - 2.0 / pi);

    let d_top = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let d_bot = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let delta_computed: f64 = (d_top.uz - d_bot.uz).abs();

    // Deflection comparison: allow 5% tolerance due to polygonal approximation
    assert_close(delta_computed, delta_roark, 0.05,
        "Ring diametral deflection: Roark formula");

    // Verify ovalization: the equator node (on the horizontal symmetry axis)
    // should displace outward horizontally as the ring ovalizes under
    // diametral tension. The ux DOF at the equator is free (guidedX
    // restrains uy and rz only), so it captures the lateral bulging.
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert!(d_mid.ux.abs() > 1e-8,
        "Ring should ovalize: equator horizontal displacement = {:.6e}", d_mid.ux.abs());

    // Verify equilibrium: sum of vertical reactions should equal applied loads
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < 0.01,
        "Ring equilibrium: sum Ry = {:.6} (should be ~0)", sum_ry);
}

// ================================================================
// 3. Semicircular Arch: Horizontal Thrust and Maximum Moment
// ================================================================
//
// A pinned circular arch under UDL (per horizontal projection).
// Using a moderate rise-to-span ratio (f/L = 1/4) with a circular shape.
//
// For a three-hinge arch under horizontal-projection UDL w:
//   H = w*L^2 / (8*f) (exact from statics, independent of arch shape)
//   R_v = w*L/2 (each support, by symmetry)
//
// The circular shape is NOT the funicular for UDL, so bending moments
// will develop (unlike a parabolic arch which is funicular for UDL).
//
// Ref: Timoshenko & Young, "Theory of Structures", 2nd Ed., Ch. 9

#[test]
fn validation_curv_ext_semicircular_arch_thrust() {
    let l: f64 = 12.0;
    let f_rise: f64 = 3.0;  // rise = L/4 (moderate rise-to-span)
    let n = 20;
    let w: f64 = 10.0;       // UDL per horizontal projection (kN/m)
    let pi: f64 = std::f64::consts::PI;

    // Build circular arch with given span L and rise f:
    // Radius from chord geometry: R = (L^2/4 + f^2) / (2*f)
    let r_circ: f64 = (l * l / 4.0 + f_rise * f_rise) / (2.0 * f_rise);

    // Center of the circular arc: (L/2, -(R - f))
    let cx: f64 = l / 2.0;
    let cy: f64 = -(r_circ - f_rise);

    // Half-angle subtended: sin(alpha) = (L/2)/R
    let alpha: f64 = (l / 2.0 / r_circ).asin();

    // Build circular arch nodes from left to right
    let mut nodes = Vec::new();
    let mut x_coords: Vec<f64> = Vec::new();
    for i in 0..=n {
        let theta = (pi / 2.0 + alpha) - 2.0 * alpha * i as f64 / n as f64;
        let x = cx + r_circ * theta.cos();
        let y = cy + r_circ * theta.sin();
        nodes.push((i + 1, x, y));
        x_coords.push(x);
    }

    let crown_elem = n / 2;
    let elems: Vec<_> = (0..n)
        .map(|i| {
            // Three-hinge: add hinge at crown
            let hs = i == crown_elem;
            let he = i + 1 == crown_elem;
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
        })
        .collect();

    let sups = vec![(1, 1_usize, "pinned"), (2, n + 1, "pinned")];

    // Apply UDL per horizontal projection as nodal loads.
    // IMPORTANT: use actual node x-coordinates for tributary widths,
    // since circular arch nodes are NOT at uniform horizontal spacing.
    let loads: Vec<SolverLoad> = (0..=n)
        .map(|i| {
            let trib = if i == 0 {
                (x_coords[1] - x_coords[0]) / 2.0
            } else if i == n {
                (x_coords[n] - x_coords[n - 1]) / 2.0
            } else {
                (x_coords[i + 1] - x_coords[i - 1]) / 2.0
            };
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: i + 1, fx: 0.0, fz: -w * trib, my: 0.0,
            })
        })
        .collect();

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // H = wL^2/(8f) (exact from statics for any three-hinge arch)
    let h_expected: f64 = w * l * l / (8.0 * f_rise);
    let h_computed: f64 = r_left.rx.abs();

    assert_close(h_computed, h_expected, 0.05,
        "Circular arch: H = wL^2/(8f)");

    // Vertical reactions: each = w*L/2
    let rv_expected: f64 = w * l / 2.0;
    assert_close(r_left.rz, rv_expected, 0.03,
        "Circular arch: Rv_left = wL/2");
    assert_close(r_right.rz, rv_expected, 0.03,
        "Circular arch: Rv_right = wL/2");

    // Horizontal reactions equal and opposite
    let h_balance: f64 = (r_left.rx + r_right.rx).abs();
    assert!(h_balance < h_expected * 0.02,
        "Horizontal balance: |H_left + H_right| = {:.6}", h_balance);

    // Since the circular arch is NOT funicular for UDL, moments should be
    // nonzero (unlike a parabolic arch). The max moment occurs near quarter-points.
    let max_moment: f64 = results.element_forces.iter()
        .map(|f| f.m_start.abs().max(f.m_end.abs()))
        .fold(0.0_f64, f64::max);

    // The moment should be nonzero but much smaller than a beam moment (wL^2/8)
    let m_beam: f64 = w * l * l / 8.0;
    assert!(max_moment > m_beam * 0.001,
        "Circular arch should have non-zero moment (non-funicular): M_max={:.4}", max_moment);
    assert!(max_moment < m_beam * 0.5,
        "Arch action should reduce moment vs beam: M_max={:.4} < M_beam/2={:.4}",
        max_moment, m_beam * 0.5);
}

// ================================================================
// 4. Curved Beam Stress Distribution: Inner vs Outer Fiber Ratio
// ================================================================
//
// For a curved beam under pure bending, the stress distribution is
// hyperbolic (not linear as in straight beams). The Winkler-Bach
// theory predicts:
//
//   sigma(r) = M * (R_n - r) / (A * e * r)
//
// where r = distance from center of curvature to the fiber.
//
// The ratio of inner fiber stress to outer fiber stress depends on R/h.
// As R/h increases, the ratio approaches 1 (straight beam limit).
//
// For a rectangular cross-section, computing the exact ratios from the
// Winkler-Bach formula:
//   sigma_inner / sigma_outer = [(R_n - R_i) * R_o] / [(R_o - R_n) * R_i]
//
// At R/h = 2:  ratio ~ 1.41
// At R/h = 5:  ratio ~ 1.14
// At R/h = 10: ratio ~ 1.07
//
// Ref: Cook & Young, "Advanced Mechanics of Materials", 2nd Ed., Ch. 8
//      Boresi & Schmidt, "Advanced Mechanics of Materials", 6th Ed., Ch. 9

#[test]
fn validation_curv_ext_stress_ratio_inner_outer() {
    let pi: f64 = std::f64::consts::PI;

    // Rectangular cross-section: h = sqrt(12*Iz/A)
    let h_sec: f64 = (12.0 * IZ / A).sqrt();

    // Test stress ratios for different R/h values.
    // Expected ratios computed from exact Winkler-Bach formula:
    //   ratio = [(R_n - R_i) / R_i] / [(R_o - R_n) / R_o]
    let test_cases: Vec<(f64, f64)> = vec![
        // (R/h_ratio, expected_stress_ratio_inner_over_outer)
        (2.0, 1.406),
        (5.0, 1.143),
        (10.0, 1.069),
    ];

    for (r_over_h, expected_ratio) in &test_cases {
        let r: f64 = r_over_h * h_sec;
        let r_inner: f64 = r - h_sec / 2.0;
        let r_outer: f64 = r + h_sec / 2.0;

        // Neutral axis radius for rectangular section
        let r_n: f64 = h_sec / (r_outer / r_inner).ln();
        let ecc: f64 = r - r_n;

        // Winkler-Bach stress at inner and outer fibers for unit moment
        let m_unit: f64 = 1.0;

        // At inner fiber (r = R_i):
        //   sigma_i = M * (R_n - R_i) / (A * e * R_i)
        let sigma_inner: f64 = m_unit * (r_n - r_inner) / (A * ecc * r_inner);

        // At outer fiber (r = R_o):
        //   sigma_o = |M * (R_n - R_o) / (A * e * R_o)|
        //   (R_n - R_o) is negative, so sigma_o has opposite sign
        let sigma_outer: f64 = (m_unit * (r_n - r_outer) / (A * ecc * r_outer)).abs();

        let ratio: f64 = sigma_inner / sigma_outer;

        assert_close(ratio, *expected_ratio, 0.01,
            &format!("Stress ratio at R/h={}: inner/outer", r_over_h));

        // Also verify: as R/h increases, ratio approaches 1
        assert!(ratio > 1.0,
            "Inner fiber stress should exceed outer: ratio={:.4} at R/h={}", ratio, r_over_h);
    }

    // FE verification: quarter-circle cantilever under tip moment.
    // The moment at the fixed end should equal the applied tip moment
    // (pure bending, no shear contribution).
    let r_fe: f64 = 5.0 * h_sec; // R/h = 5
    let n = 20;
    let m_app = 10.0; // applied moment at tip

    let mut nodes = Vec::new();
    for i in 0..=n {
        let theta = pi / 2.0 * i as f64 / n as f64;
        let x = r_fe * theta.cos();
        let y = r_fe * theta.sin();
        nodes.push((i + 1, x, y));
    }

    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: 0.0, my: m_app,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, vec![(1, 1_usize, "fixed")], loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Under pure moment, the reaction moment at the fixed end equals M_app
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_fixed.my.abs(), m_app, 0.02,
        "Curved beam pure bending: reaction moment = applied moment");
}

// ================================================================
// 5. Castigliano's Theorem for Curved Beam Deflection
// ================================================================
//
// A quarter-circle cantilever of radius R, fixed at the base (theta=0),
// free at the top (theta=pi/2), with a vertical load P at the free end.
//
// Using Castigliano's theorem (bending energy only):
//   M(theta) = P * R * cos(theta) for a vertical load P at the free end
//
// Integrating:
//   delta_vertical = P*R^3/(EI) * integral_0^{pi/2} cos^2(theta) dtheta
//                  = P*R^3/(EI) * pi/4
//
//   delta_horizontal = P*R^3/(EI) * integral_0^{pi/2} cos(theta)*sin(theta) dtheta
//                    = P*R^3/(EI) * 1/2
//
// Strain energy: U = P^2*R^3*pi / (8*EI)
//
// Ref: Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 12

#[test]
fn validation_curv_ext_castigliano_curved_deflection() {
    let r: f64 = 5.0;
    let n = 24; // fine mesh for accuracy
    let p = 10.0;
    let pi: f64 = std::f64::consts::PI;
    let e_eff: f64 = E * 1000.0;

    // Quarter circle: fixed at theta=0 (point (R,0)), free at theta=pi/2 (point (0,R))
    let mut nodes = Vec::new();
    for i in 0..=n {
        let theta = pi / 2.0 * i as f64 / n as f64;
        let x = r * theta.cos();
        let y = r * theta.sin();
        nodes.push((i + 1, x, y));
    }

    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1_usize, "fixed")];

    // Vertical load P at the free end (top of arc)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Castigliano: vertical deflection (bending only)
    // delta_v = P * R^3 * pi / (4 * E * I)
    let delta_v_exact: f64 = p * r.powi(3) * pi / (4.0 * e_eff * IZ);

    // Castigliano: horizontal deflection
    // delta_h = P * R^3 / (2 * E * I)
    let delta_h_exact: f64 = p * r.powi(3) / (2.0 * e_eff * IZ);

    // The tip displacement should match Castigliano predictions.
    // Due to axial deformation in frame elements, there will be some
    // deviation from pure bending theory, but for slender arcs it
    // should be within tolerance.
    assert_close(tip.uz.abs(), delta_v_exact, 0.03,
        "Castigliano: vertical deflection of quarter-arc");

    assert_close(tip.ux.abs(), delta_h_exact, 0.03,
        "Castigliano: horizontal deflection of quarter-arc");

    // Verify strain energy: U = 1/2 * P * delta_v (only vertical load does work)
    let u_external: f64 = 0.5 * p * tip.uz.abs();
    let u_analytical: f64 = p * p * r.powi(3) * pi / (8.0 * e_eff * IZ);

    assert_close(u_external, u_analytical, 0.03,
        "Castigliano: strain energy U = P^2*R^3*pi/(8EI)");
}

// ================================================================
// 6. Ring Stiffness: Thick vs Thin Ring Behavior (R/h Ratio)
// ================================================================
//
// The stiffness of a circular ring depends strongly on the R/h ratio
// (ratio of mean radius to section depth).
//
// For a semicircular cantilever under a vertical tip load P:
//   delta = P * R^3 / (E*I) * C
// where C depends on the subtended angle. For a semicircle (0 to pi):
//   M(theta) = P * R * (1 + cos(theta))
//   delta_v = P*R^3/(EI) * integral_0^pi (1+cos)^2 dtheta = P*R^3/(EI) * 3*pi/2
//
// For a "thin" ring (R/h >> 1), classical bending theory applies well.
// For a "thick" ring (R/h ~ 2-3), axial and shear deformation become
// significant, causing deviation from pure bending predictions.
//
// We verify:
//   1. Thicker section is stiffer (less deflection)
//   2. Deflection ratio scales approximately as I_thick/I_thin
//   3. Thin ring deflection matches analytical bending formula
//
// Ref: Roark & Young, "Formulas for Stress and Strain", 8th Ed., Ch. 9

#[test]
fn validation_curv_ext_ring_stiffness_r_over_h() {
    let pi: f64 = std::f64::consts::PI;
    let e_eff: f64 = E * 1000.0;
    let p = 10.0;
    let r: f64 = 4.0;
    let n = 24;

    // Thin ring properties (R/h ~ 11.5)
    let a_thin: f64 = A;      // 0.01 m^2
    let iz_thin: f64 = IZ;    // 1e-4 m^4
    let h_thin: f64 = (12.0 * iz_thin / a_thin).sqrt();
    let rh_thin: f64 = r / h_thin;

    // Thick ring: increase section depth by factor of 4
    // A_thick = 4*A, Iz_thick = 64*Iz (h_thick = 4*h_thin)
    let a_thick: f64 = 4.0 * A;     // 0.04 m^2
    let iz_thick: f64 = 64.0 * IZ;  // 6.4e-3 m^4
    let h_thick: f64 = (12.0 * iz_thick / a_thick).sqrt();
    let rh_thick: f64 = r / h_thick;

    // Build semicircular cantilever: fixed at theta=0 (R,0), load at theta=pi (-R,0)
    let build_semicircle = |a_val: f64, iz_val: f64| -> f64 {
        let mut nodes = Vec::new();
        for i in 0..=n {
            let theta = pi * i as f64 / n as f64;
            let x = r * theta.cos();
            let y = r * theta.sin();
            nodes.push((i + 1, x, y));
        }
        let elems: Vec<_> = (0..n)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();
        let sups = vec![(1, 1_usize, "fixed")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        })];
        let input = make_input(
            nodes, vec![(1, E, 0.3)], vec![(1, a_val, iz_val)],
            elems, sups, loads,
        );
        let results = linear::solve_2d(&input).unwrap();
        let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
        tip.uz.abs()
    };

    let delta_thin = build_semicircle(a_thin, iz_thin);
    let delta_thick = build_semicircle(a_thick, iz_thick);

    // Thicker ring should be stiffer (less deflection)
    assert!(delta_thick < delta_thin,
        "Thick ring should be stiffer: delta_thick={:.6e} < delta_thin={:.6e}",
        delta_thick, delta_thin);

    // The ratio of deflections should scale roughly as I_thin/I_thick = 1/64
    // For pure bending: delta_thin/delta_thick = Iz_thick/Iz_thin
    // With axial effects in the thick ring, the ratio deviates somewhat.
    let stiffness_ratio: f64 = delta_thin / delta_thick;
    let iz_ratio: f64 = iz_thick / iz_thin; // = 64

    // For the thick ring (R/h ~ 2.9), axial effects are significant,
    // so the ratio won't be exactly 64. Check it's in the right ballpark.
    assert!(stiffness_ratio > iz_ratio * 0.5,
        "Stiffness ratio ({:.2}) should be roughly proportional to Iz ratio ({:.0})",
        stiffness_ratio, iz_ratio);
    assert!(stiffness_ratio < iz_ratio * 1.5,
        "Stiffness ratio ({:.2}) should not exceed 1.5x Iz ratio ({:.0})",
        stiffness_ratio, iz_ratio);

    // Verify R/h ratios are as expected
    assert!(rh_thin > 10.0,
        "Thin ring: R/h = {:.2} > 10", rh_thin);
    assert!(rh_thick > 2.0 && rh_thick < 5.0,
        "Thick ring: R/h = {:.2} in range 2-5", rh_thick);

    // For the thin ring, compare with analytical bending formula:
    // Semicircular cantilever under vertical tip load P at theta=pi:
    //   M(theta) = P*R*(1 + cos(theta))
    //   delta_v = P*R^3/(EI) * integral_0^pi (1+cos(theta))^2 dtheta
    //   integral_0^pi (1+cos)^2 dtheta = integral (1 + 2cos + cos^2) dtheta
    //     = pi + 0 + pi/2 = 3*pi/2
    //   delta_v = P*R^3 * 3*pi / (2*EI)
    let delta_thin_analytical: f64 = p * r.powi(3) * 3.0 * pi / (2.0 * e_eff * iz_thin);

    assert_close(delta_thin, delta_thin_analytical, 0.02,
        "Thin ring deflection matches analytical bending formula");
}

// ================================================================
// 7. Parabolic Arch vs Circular Arch: Thrust Comparison for UDL
// ================================================================
//
// For a three-hinge arch under UDL (per horizontal projection):
//   H = w*L^2 / (8*f)   regardless of arch shape
//
// This is because the three-hinge condition + equilibrium fully determines H.
// However, the bending moments differ between parabolic and circular shapes:
//   - Parabolic arch: M ~ 0 everywhere (funicular for horizontal UDL)
//   - Circular arch: M != 0 (not funicular for horizontal UDL)
//
// We verify:
//   1. Both arches have approximately the same horizontal thrust
//   2. The parabolic arch has much smaller moments than the circular arch
//
// Ref: Timoshenko & Young, "Theory of Structures", 2nd Ed., Ch. 9

#[test]
fn validation_curv_ext_parabolic_vs_circular_thrust() {
    let l: f64 = 10.0;
    let f_rise: f64 = 2.5; // rise = L/4
    let n_para = 20;        // parabolic arch mesh
    let n_circ = 40;        // finer mesh for circular arch (polygonal approx)
    let w: f64 = 10.0;      // UDL per horizontal projection
    let pi: f64 = std::f64::consts::PI;

    // Apply horizontal-projection UDL as nodal loads
    let make_h_loads = |n: usize| -> Vec<SolverLoad> {
        let dx = l / n as f64;
        (0..=n)
            .map(|i| {
                let trib = if i == 0 || i == n { dx / 2.0 } else { dx };
                SolverLoad::Nodal(SolverNodalLoad {
                    node_id: i + 1, fx: 0.0, fz: -w * trib, my: 0.0,
                })
            })
            .collect()
    };

    // --- Parabolic arch ---
    let input_para = make_parabolic_arch_ext(
        n_para, l, f_rise, E, A, IZ, "pinned", "pinned", true, make_h_loads(n_para),
    );
    let res_para = linear::solve_2d(&input_para).unwrap();

    let h_para: f64 = res_para.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().rx.abs();
    let m_max_para: f64 = res_para.element_forces.iter()
        .map(|f| f.m_start.abs().max(f.m_end.abs()))
        .fold(0.0_f64, f64::max);

    // --- Circular arch ---
    // Circular arch with same span and rise:
    //   R = (L^2/4 + f^2) / (2*f)  (radius from chord geometry)
    let r_circ: f64 = (l * l / 4.0 + f_rise * f_rise) / (2.0 * f_rise);

    // Center of the circular arc: (L/2, -(R - f))
    let cx: f64 = l / 2.0;
    let cy: f64 = -(r_circ - f_rise);

    // Half-angle subtended: sin(alpha) = (L/2)/R
    let alpha: f64 = (l / 2.0 / r_circ).asin();

    // Build circular arch nodes with finer mesh
    let mut nodes_circ = Vec::new();
    let mut x_coords_circ: Vec<f64> = Vec::new();
    for i in 0..=n_circ {
        let theta = (pi / 2.0 + alpha) - 2.0 * alpha * i as f64 / n_circ as f64;
        let x = cx + r_circ * theta.cos();
        let y = cy + r_circ * theta.sin();
        nodes_circ.push((i + 1, x, y));
        x_coords_circ.push(x);
    }

    // Single hinge_end release at the crown node (avoid double-release mechanism)
    let crown_node_0 = n_circ / 2;
    let elems_circ: Vec<_> = (0..n_circ)
        .map(|i| {
            let he = i + 1 == crown_node_0;
            (i + 1, "frame", i + 1, i + 2, 1, 1, false, he)
        })
        .collect();

    let sups_circ = vec![(1, 1_usize, "pinned"), (2, n_circ + 1, "pinned")];

    // Compute nodal loads from actual x-coordinates for correct tributary widths,
    // since circular arch nodes are NOT at uniform horizontal spacing.
    let loads_circ: Vec<SolverLoad> = (0..=n_circ)
        .map(|i| {
            let trib = if i == 0 {
                (x_coords_circ[1] - x_coords_circ[0]) / 2.0
            } else if i == n_circ {
                (x_coords_circ[n_circ] - x_coords_circ[n_circ - 1]) / 2.0
            } else {
                (x_coords_circ[i + 1] - x_coords_circ[i - 1]) / 2.0
            };
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: i + 1, fx: 0.0, fz: -w * trib, my: 0.0,
            })
        })
        .collect();

    let input_circ = make_input(
        nodes_circ, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems_circ, sups_circ, loads_circ,
    );
    let res_circ = linear::solve_2d(&input_circ).unwrap();

    let h_circ: f64 = res_circ.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().rx.abs();
    let m_max_circ: f64 = res_circ.element_forces.iter()
        .map(|f| f.m_start.abs().max(f.m_end.abs()))
        .fold(0.0_f64, f64::max);

    // Both arches should have similar horizontal thrust.
    // H = wL^2/(8f) for three-hinge arch under horizontal-projection UDL.
    // The parabolic arch matches closely (funicular form).
    // The circular arch has some deviation from polygonal approximation.
    let h_expected: f64 = w * l * l / (8.0 * f_rise);

    assert_close(h_para, h_expected, 0.05,
        "Parabolic arch: H = wL^2/(8f)");

    // Circular arch thrust should be close but may deviate due to
    // polygonal discretization of the curved shape
    assert_close(h_circ, h_expected, 0.05,
        "Circular arch: H ~ wL^2/(8f)");

    // Parabolic arch should have much smaller moments (funicular form)
    assert!(m_max_para < m_max_circ,
        "Parabolic moments ({:.4}) < circular moments ({:.4})",
        m_max_para, m_max_circ);

    // Parabolic arch: moments should be very small (near-funicular)
    let m_beam: f64 = w * l * l / 8.0; // equivalent beam moment
    assert!(m_max_para < m_beam * 0.05,
        "Parabolic arch moments ({:.4}) << beam moment ({:.4})",
        m_max_para, m_beam);

    // Circular arch: moments nonzero but less than beam
    assert!(m_max_circ < m_beam * 0.5,
        "Circular arch moments ({:.4}) < beam moment/2 ({:.4})",
        m_max_circ, m_beam * 0.5);
}

// ================================================================
// 8. Curved Beam Neutral Axis Shift from Centroidal Axis
// ================================================================
//
// In a curved beam, the neutral axis shifts toward the center of
// curvature. The shift e = R - R_n where:
//   R_n = A / integral(dA/r) = neutral axis radius
//
// For a rectangular section of depth h:
//   R_n = h / ln(R_o/R_i)
//   e = R - h / ln((R+h/2)/(R-h/2))
//
// Key properties of the neutral axis shift:
//   1. e > 0 (shift toward center of curvature)
//   2. e -> 0 as R/h -> infinity (straight beam limit)
//   3. e increases as R/h decreases (more curvature -> more shift)
//   4. Approximate formula for large R/h: e ~ Iz/(A*R)
//
// We verify these properties analytically and confirm the FE model
// captures correct deflection behavior for a curved cantilever.
//
// Ref: Boresi & Schmidt, "Advanced Mechanics of Materials", 6th Ed., Ch. 9
//      Timoshenko & Goodier, "Theory of Elasticity", 3rd Ed., Art. 29

#[test]
fn validation_curv_ext_neutral_axis_shift() {
    let pi: f64 = std::f64::consts::PI;
    let e_eff: f64 = E * 1000.0;

    // Rectangular cross-section properties
    let h_sec: f64 = (12.0 * IZ / A).sqrt();

    // Test neutral axis shift for a range of R/h values
    let r_over_h_values: Vec<f64> = vec![2.0, 3.0, 5.0, 10.0, 20.0, 50.0];

    let mut shifts: Vec<(f64, f64, f64)> = Vec::new(); // (R/h, exact_shift, approx_shift)

    for &rh in &r_over_h_values {
        let r: f64 = rh * h_sec;
        let r_inner: f64 = r - h_sec / 2.0;
        let r_outer: f64 = r + h_sec / 2.0;

        // Exact neutral axis for rectangular section
        let r_n: f64 = h_sec / (r_outer / r_inner).ln();
        let ecc_exact: f64 = r - r_n;

        // Approximate formula: e ~ Iz/(A*R) for large R/h
        let ecc_approx: f64 = IZ / (A * r);

        shifts.push((rh, ecc_exact, ecc_approx));

        // Property 1: e > 0
        assert!(ecc_exact > 0.0,
            "Neutral axis shift should be positive at R/h={}: e={:.6e}", rh, ecc_exact);
    }

    // Property 2: e -> 0 as R/h -> infinity
    // At R/h = 50: e/h ~ 0.0017, which is very small relative to h
    let (_, e_large, _) = shifts.last().unwrap();
    assert!(*e_large < h_sec * 0.01,
        "At large R/h, shift should be small relative to h: e={:.6e}, h={:.4}, e/h={:.6}",
        e_large, h_sec, e_large / h_sec);

    // Property 3: e increases as R/h decreases
    for i in 1..shifts.len() {
        let (rh_i, e_i, _) = shifts[i];
        let (rh_prev, e_prev, _) = shifts[i - 1];
        assert!(e_prev > e_i,
            "Shift should increase with decreasing R/h: e({:.0})={:.6e} > e({:.0})={:.6e}",
            rh_prev, e_prev, rh_i, e_i);
    }

    // Property 4: approximate formula converges to exact for large R/h
    for &(rh, e_exact, e_approx) in &shifts {
        if rh >= 10.0 {
            let rel_err: f64 = (e_approx - e_exact).abs() / e_exact;
            assert!(rel_err < 0.05,
                "Approximate formula at R/h={:.0}: exact={:.6e}, approx={:.6e}, err={:.2}%",
                rh, e_exact, e_approx, rel_err * 100.0);
        }
    }

    // Verify monotonicity quantitatively: the ratio e*R should be ~ constant
    // (since e ~ Iz/(A*R), so e*R ~ Iz/A = const for large R/h)
    let er_products: Vec<f64> = shifts.iter()
        .filter(|(rh, _, _)| *rh >= 5.0)
        .map(|(rh, e_exact, _)| e_exact * rh * h_sec)
        .collect();
    let er_mean: f64 = er_products.iter().sum::<f64>() / er_products.len() as f64;
    let iz_over_a: f64 = IZ / A;
    assert_close(er_mean, iz_over_a, 0.02,
        "e*R product should approach Iz/A for large R/h");

    // FE verification: quarter-circle cantilever under tip load.
    // The deflection should match Castigliano's bending prediction.
    let r_fe: f64 = 4.0;
    let n = 20;
    let p = 10.0;

    let mut nodes = Vec::new();
    for i in 0..=n {
        let theta = pi / 2.0 * i as f64 / n as f64;
        let x = r_fe * theta.cos();
        let y = r_fe * theta.sin();
        nodes.push((i + 1, x, y));
    }

    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, vec![(1, 1_usize, "fixed")], loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Castigliano bending deflection: delta_v = P*R^3*pi/(4EI)
    let delta_v_castigliano: f64 = p * r_fe.powi(3) * pi / (4.0 * e_eff * IZ);

    assert_close(tip.uz.abs(), delta_v_castigliano, 0.03,
        "Neutral axis shift FE: vertical deflection matches Castigliano");

    // The moment at the fixed support should equal P * R
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_expected: f64 = p * r_fe;
    assert_close(r_fixed.my.abs(), m_expected, 0.02,
        "Neutral axis shift FE: fixed-end moment = P*R");
}
