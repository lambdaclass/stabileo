/// Validation: Steel Connection Design
///
/// References:
///   - AISC 360-16: Specification for Structural Steel Buildings
///   - AISC Steel Construction Manual, 15th Edition
///   - Salmon, Johnson & Malhas, "Steel Structures: Design and Behavior", 5th Ed.
///   - EN 1993-1-8:2005 (EC3 Part 1-8): Design of joints
///   - Kulak, Fisher & Struik, "Guide to Design Criteria for Bolted and Riveted Joints"
///
/// Tests verify bolt, weld, and connection capacity calculations.

#[allow(unused_imports)]
use dedaliano_engine::types::*;

// ═══════════════════════════════════════════════════════════════
// 1. Bolt Shear Capacity — Single Bolt and Bolt Group
// ═══════════════════════════════════════════════════════════════
//
// AISC 360-16 §J3.6: Nominal shear strength of a single bolt:
//   Rn = Fnv × Ab
//
// For A325-N bolt (threads included in shear plane):
//   Fnv = 54 ksi = 372.3 MPa (Table J3.2)
//
// Bolt diameter: 3/4" = 19.05 mm
//   Ab = π/4 × d² = π/4 × 19.05² = 285.02 mm²
//
// Single bolt nominal shear:
//   Rn = 372.3 × 285.02 = 106,120 N = 106.12 kN
//
// Design shear (φ = 0.75 for bolt shear):
//   φRn = 0.75 × 106.12 = 79.59 kN
//
// For a group of 4 bolts:
//   φRn_group = 4 × 79.59 = 318.36 kN

#[test]
fn validation_bolt_shear_capacity_single_and_group() {
    let fnv: f64 = 372.3;          // MPa, A325-N nominal shear stress
    let d_bolt: f64 = 19.05;       // mm, 3/4" bolt diameter
    let phi: f64 = 0.75;           // strength reduction factor
    let n_bolts: usize = 4;

    // --- Bolt area ---
    let ab: f64 = std::f64::consts::PI / 4.0 * d_bolt * d_bolt;
    let ab_expected: f64 = 285.02;

    let rel_err_ab = (ab - ab_expected).abs() / ab_expected;
    assert!(
        rel_err_ab < 0.01,
        "Ab: computed={:.2} mm², expected={:.2} mm², err={:.4}%",
        ab, ab_expected, rel_err_ab * 100.0
    );

    // --- Single bolt nominal shear ---
    let rn_single: f64 = fnv * ab / 1000.0; // kN
    let rn_single_expected: f64 = 106.12;

    let rel_err_rn = (rn_single - rn_single_expected).abs() / rn_single_expected;
    assert!(
        rel_err_rn < 0.01,
        "Rn(single): computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        rn_single, rn_single_expected, rel_err_rn * 100.0
    );

    // --- Design shear (single bolt) ---
    let phi_rn_single: f64 = phi * rn_single;
    let phi_rn_expected: f64 = 79.59;

    let rel_err_phi = (phi_rn_single - phi_rn_expected).abs() / phi_rn_expected;
    assert!(
        rel_err_phi < 0.01,
        "φRn(single): computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        phi_rn_single, phi_rn_expected, rel_err_phi * 100.0
    );

    // --- Bolt group capacity ---
    let phi_rn_group: f64 = n_bolts as f64 * phi_rn_single;
    let phi_rn_group_expected: f64 = 318.36;

    let rel_err_group = (phi_rn_group - phi_rn_group_expected).abs() / phi_rn_group_expected;
    assert!(
        rel_err_group < 0.01,
        "φRn(group): computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        phi_rn_group, phi_rn_group_expected, rel_err_group * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Bolt Bearing Capacity
// ═══════════════════════════════════════════════════════════════
//
// AISC 360-16 §J3.10: Bearing strength at bolt holes.
// When deformation at bolt hole at service load is a design consideration:
//   Rn = 2.4 × d × t × Fu
//
// When deformation is not a design consideration:
//   Rn = 3.0 × d × t × Fu
//
// Also check tearout: Rn = 1.2 × Lc × t × Fu
//
// Bolt diameter: 3/4" = 19.05 mm
// Plate: t = 12 mm, Fu = 400 MPa (A36 steel)
// Edge distance Le = 38 mm, standard hole = d + 2 mm = 21.05 mm
// Clear distance Lc = Le - hole/2 = 38 - 21.05/2 = 27.475 mm
//
// Bearing (deformation considered):
//   Rn_bearing = 2.4 × 19.05 × 12 × 400 = 219,456 N = 219.46 kN
//
// Tearout:
//   Rn_tearout = 1.2 × 27.475 × 12 × 400 = 158,256 N = 158.26 kN
//
// Governing: Rn = min(219.46, 158.26) = 158.26 kN
// φRn = 0.75 × 158.26 = 118.69 kN

#[test]
fn validation_bolt_bearing_capacity() {
    let d_bolt: f64 = 19.05;       // mm
    let t_plate: f64 = 12.0;       // mm, plate thickness
    let fu: f64 = 400.0;           // MPa, ultimate tensile strength
    let le: f64 = 38.0;            // mm, edge distance
    let d_hole: f64 = d_bolt + 2.0; // mm, standard hole diameter
    let phi: f64 = 0.75;

    // --- Clear distance ---
    let lc: f64 = le - d_hole / 2.0;
    let lc_expected: f64 = 27.475;

    let err_lc = (lc - lc_expected).abs();
    assert!(
        err_lc < 0.01,
        "Lc: computed={:.3} mm, expected={:.3} mm", lc, lc_expected
    );

    // --- Bearing strength (deformation considered) ---
    let rn_bearing: f64 = 2.4 * d_bolt * t_plate * fu / 1000.0; // kN
    let rn_bearing_expected: f64 = 219.46;

    let rel_err_b = (rn_bearing - rn_bearing_expected).abs() / rn_bearing_expected;
    assert!(
        rel_err_b < 0.01,
        "Rn(bearing): computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        rn_bearing, rn_bearing_expected, rel_err_b * 100.0
    );

    // --- Tearout strength ---
    let rn_tearout: f64 = 1.2 * lc * t_plate * fu / 1000.0; // kN
    let rn_tearout_expected: f64 = 158.26;

    let rel_err_t = (rn_tearout - rn_tearout_expected).abs() / rn_tearout_expected;
    assert!(
        rel_err_t < 0.01,
        "Rn(tearout): computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        rn_tearout, rn_tearout_expected, rel_err_t * 100.0
    );

    // --- Governing capacity ---
    let rn: f64 = rn_bearing.min(rn_tearout);
    assert!(
        (rn - rn_tearout).abs() < 0.01,
        "Tearout governs: Rn={:.2} kN", rn
    );

    // --- Design bearing strength ---
    let phi_rn: f64 = phi * rn;
    let phi_rn_expected: f64 = 118.69;

    let rel_err_phi = (phi_rn - phi_rn_expected).abs() / phi_rn_expected;
    assert!(
        rel_err_phi < 0.01,
        "φRn: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        phi_rn, phi_rn_expected, rel_err_phi * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Weld Strength — Fillet Weld Effective Area
// ═══════════════════════════════════════════════════════════════
//
// AISC 360-16 §J2.4: Effective area of a fillet weld:
//   Awe = 0.707 × a × L
// where a = weld leg size, L = weld length.
//
// Nominal weld strength (FEXX = 70 ksi = 482.6 MPa, E70xx electrode):
//   Rn = Fnw × Awe = 0.60 × FEXX × Awe
//
// Weld: a = 8 mm, L = 200 mm, FEXX = 482.6 MPa.
//
// Effective throat: te = 0.707 × 8 = 5.656 mm
// Effective area: Awe = 5.656 × 200 = 1131.2 mm²
// Fnw = 0.60 × 482.6 = 289.56 MPa
// Rn = 289.56 × 1131.2 = 327,510 N = 327.51 kN
//
// Design: φ = 0.75
//   φRn = 0.75 × 327.51 = 245.63 kN

#[test]
fn validation_fillet_weld_strength() {
    let a_leg: f64 = 8.0;          // mm, weld leg size
    let l_weld: f64 = 200.0;       // mm, weld length
    let fexx: f64 = 482.6;         // MPa, electrode classification (E70xx)
    let phi: f64 = 0.75;

    // --- Effective throat ---
    let te: f64 = 0.707 * a_leg;
    let te_expected: f64 = 5.656;

    let err_te = (te - te_expected).abs();
    assert!(
        err_te < 0.01,
        "te: computed={:.3} mm, expected={:.3} mm", te, te_expected
    );

    // --- Effective area ---
    let awe: f64 = te * l_weld;
    let awe_expected: f64 = 1131.2;

    let rel_err_a = (awe - awe_expected).abs() / awe_expected;
    assert!(
        rel_err_a < 0.01,
        "Awe: computed={:.2} mm², expected={:.2} mm², err={:.4}%",
        awe, awe_expected, rel_err_a * 100.0
    );

    // --- Nominal weld stress ---
    let fnw: f64 = 0.60 * fexx;
    let fnw_expected: f64 = 289.56;

    let rel_err_fnw = (fnw - fnw_expected).abs() / fnw_expected;
    assert!(
        rel_err_fnw < 0.01,
        "Fnw: computed={:.2} MPa, expected={:.2} MPa", fnw, fnw_expected
    );

    // --- Nominal weld strength ---
    let rn: f64 = fnw * awe / 1000.0; // kN
    let rn_expected: f64 = 327.51;

    let rel_err_rn = (rn - rn_expected).abs() / rn_expected;
    assert!(
        rel_err_rn < 0.01,
        "Rn: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        rn, rn_expected, rel_err_rn * 100.0
    );

    // --- Design weld strength ---
    let phi_rn: f64 = phi * rn;
    let phi_rn_expected: f64 = 245.63;

    let rel_err_phi = (phi_rn - phi_rn_expected).abs() / phi_rn_expected;
    assert!(
        rel_err_phi < 0.01,
        "φRn: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        phi_rn, phi_rn_expected, rel_err_phi * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Bolt Group Polar Moment of Inertia
// ═══════════════════════════════════════════════════════════════
//
// For a bolt group subjected to eccentric shear, the polar moment
// of inertia about the centroid (Ip) governs bolt force distribution.
//
//   Ip = Σ(xi² + yi²)  for each bolt
//
// 4-bolt pattern (2 columns × 2 rows):
//   Gage g = 140 mm (horizontal spacing), Pitch p = 80 mm (vertical spacing)
//   Bolt positions relative to centroid:
//     (±70, ±40) mm
//
//   Ix = Σyi² = 4 × 40² = 6400 mm²
//   Iy = Σxi² = 4 × 70² = 19600 mm²
//   Ip = Ix + Iy = 26000 mm²
//
// Maximum bolt distance from centroid:
//   rmax = √(70² + 40²) = √(4900 + 1600) = √6500 = 80.62 mm

#[test]
fn validation_bolt_group_polar_moment() {
    let g: f64 = 140.0;  // mm, gage (horizontal spacing)
    let p: f64 = 80.0;   // mm, pitch (vertical spacing)

    // Bolt positions relative to centroid
    let bolts: Vec<(f64, f64)> = vec![
        (-g / 2.0, -p / 2.0),
        ( g / 2.0, -p / 2.0),
        (-g / 2.0,  p / 2.0),
        ( g / 2.0,  p / 2.0),
    ];

    // --- Ix = Σ(yi²) ---
    let ix: f64 = bolts.iter().map(|&(_, y)| y * y).sum();
    let ix_expected: f64 = 6400.0;

    let err_ix = (ix - ix_expected).abs();
    assert!(
        err_ix < 0.01,
        "Ix: computed={:.2} mm², expected={:.2} mm²", ix, ix_expected
    );

    // --- Iy = Σ(xi²) ---
    let iy: f64 = bolts.iter().map(|&(x, _)| x * x).sum();
    let iy_expected: f64 = 19600.0;

    let err_iy = (iy - iy_expected).abs();
    assert!(
        err_iy < 0.01,
        "Iy: computed={:.2} mm², expected={:.2} mm²", iy, iy_expected
    );

    // --- Polar moment of inertia ---
    let ip: f64 = ix + iy;
    let ip_expected: f64 = 26000.0;

    let err_ip = (ip - ip_expected).abs();
    assert!(
        err_ip < 0.01,
        "Ip: computed={:.2} mm², expected={:.2} mm²", ip, ip_expected
    );

    // --- Maximum bolt distance ---
    let rmax: f64 = bolts.iter()
        .map(|&(x, y)| (x * x + y * y).sqrt())
        .fold(0.0_f64, f64::max);
    let rmax_expected: f64 = 80.62;

    let rel_err_r = (rmax - rmax_expected).abs() / rmax_expected;
    assert!(
        rel_err_r < 0.01,
        "rmax: computed={:.2} mm, expected={:.2} mm, err={:.4}%",
        rmax, rmax_expected, rel_err_r * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Prying Action Force
// ═══════════════════════════════════════════════════════════════
//
// Prying action per AISC Design Guide 1 / Steel Construction Manual.
//
// For a T-stub or angle flange connection, the prying force Q
// increases the bolt tension beyond the applied load T.
//
// Simplified prying model:
//   B = T + Q  (bolt force = applied tension + prying)
//
// Using AISC formulation (simplified):
//   Q = T × (a'/b') × [t_req/t_f]^4 × (1/(1 + δ'α'))
//
// For a simplified case with:
//   T = 80 kN per bolt (applied tension)
//   b' = 35 mm (effective grip distance to bolt line)
//   a' = 30 mm (effective prying distance)
//   t_f = 16 mm (flange thickness)
//   p = 80 mm (tributary width)
//   Bolt capacity Bn = 130 kN per bolt
//
// Simplified ratio check:
//   α' parameter: relates to flange flexibility
//   For thick flanges (t_f >> required): Q ≈ 0, B ≈ T
//   For thin flanges: Q can be significant (up to 30-40% of T)
//
// Using simplified formula from Kulak et al.:
//   Q/T = (a'/b') × [1 - (t_f/t_req)²]  when t_f < t_req
//
// For our case, first compute t_req (minimum flange thickness for no prying):
//   t_req = √(4·T·b' / (φ·p·Fy))
//   With Fy = 345 MPa, φ = 0.90:
//   t_req = √(4 × 80000 × 35 / (0.90 × 80 × 345))
//         = √(11200000 / 24840) = √450.97 = 21.24 mm
//
// Since t_f = 16 mm < t_req = 21.24 mm, prying exists:
//   Q/T = (a'/b') × [1 - (t_f/t_req)²]
//       = (30/35) × [1 - (16/21.24)²]
//       = 0.857 × [1 - 0.5672]
//       = 0.857 × 0.4328 = 0.371
//   Q = 0.371 × 80 = 29.67 kN
//   B = T + Q = 80 + 29.67 = 109.67 kN

#[test]
fn validation_prying_action_force() {
    let t_applied: f64 = 80.0;     // kN, applied tension per bolt
    let b_prime: f64 = 35.0;       // mm, bolt gage to k-line distance
    let a_prime: f64 = 30.0;       // mm, effective prying lever arm
    let t_f: f64 = 16.0;           // mm, flange thickness
    let p_trib: f64 = 80.0;        // mm, tributary width per bolt
    let fy: f64 = 345.0;           // MPa, flange yield stress
    let phi_bending: f64 = 0.90;   // bending reduction factor

    // --- Required flange thickness for no prying ---
    let t_req: f64 = (4.0 * t_applied * 1000.0 * b_prime / (phi_bending * p_trib * fy)).sqrt();
    let t_req_expected: f64 = 21.24;

    let rel_err_treq = (t_req - t_req_expected).abs() / t_req_expected;
    assert!(
        rel_err_treq < 0.01,
        "t_req: computed={:.2} mm, expected={:.2} mm, err={:.4}%",
        t_req, t_req_expected, rel_err_treq * 100.0
    );

    // --- Verify prying exists ---
    assert!(
        t_f < t_req,
        "Prying exists: t_f={:.1} mm < t_req={:.2} mm", t_f, t_req
    );

    // --- Prying ratio Q/T ---
    let ratio_qt: f64 = (a_prime / b_prime) * (1.0 - (t_f / t_req).powi(2));
    let ratio_expected: f64 = 0.371;

    let rel_err_ratio = (ratio_qt - ratio_expected).abs() / ratio_expected;
    assert!(
        rel_err_ratio < 0.02,
        "Q/T: computed={:.4}, expected={:.4}, err={:.4}%",
        ratio_qt, ratio_expected, rel_err_ratio * 100.0
    );

    // --- Prying force ---
    let q: f64 = ratio_qt * t_applied;
    let q_expected: f64 = 29.67;

    let rel_err_q = (q - q_expected).abs() / q_expected;
    assert!(
        rel_err_q < 0.02,
        "Q: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        q, q_expected, rel_err_q * 100.0
    );

    // --- Total bolt force ---
    let b_total: f64 = t_applied + q;
    let b_expected: f64 = 109.67;

    let rel_err_b = (b_total - b_expected).abs() / b_expected;
    assert!(
        rel_err_b < 0.02,
        "B: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        b_total, b_expected, rel_err_b * 100.0
    );

    // --- Prying force increases bolt demand ---
    assert!(
        b_total > t_applied,
        "Total bolt force B={:.2} kN > applied tension T={:.2} kN",
        b_total, t_applied
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Slip-Critical Bolt Design
// ═══════════════════════════════════════════════════════════════
//
// AISC 360-16 §J3.8: Slip-critical connections.
// Design slip resistance per bolt:
//   φRn = φ × μ × Du × hf × Tb × ns
//
// where:
//   φ = 1.0 (for serviceability limit state) or 0.85 (for strength)
//   μ = 0.35 (Class A surface, AISC Table J3.1)
//   Du = 1.13 (ratio of mean installed bolt tension to minimum)
//   hf = 1.0 (standard holes)
//   Tb = minimum bolt pretension (Table J3.1)
//   ns = number of slip planes
//
// A325 bolt, 3/4" diameter:
//   Tb = 125 kN (from AISC Table J3.1, converted)
//
// For 1 slip plane, Class A, serviceability:
//   φRn = 1.0 × 0.35 × 1.13 × 1.0 × 125 × 1
//       = 49.44 kN per bolt
//
// For 6-bolt group:
//   φRn_group = 6 × 49.44 = 296.63 kN

#[test]
fn validation_slip_critical_bolt_design() {
    let phi: f64 = 1.0;            // serviceability limit state
    let mu: f64 = 0.35;            // Class A surface
    let du: f64 = 1.13;            // mean/minimum pretension ratio
    let hf: f64 = 1.0;             // standard holes
    let tb: f64 = 125.0;           // kN, minimum pretension (3/4" A325)
    let ns: f64 = 1.0;             // number of slip planes
    let n_bolts: usize = 6;

    // --- Single bolt slip resistance ---
    let phi_rn: f64 = phi * mu * du * hf * tb * ns;
    let phi_rn_expected: f64 = 49.44;

    let rel_err = (phi_rn - phi_rn_expected).abs() / phi_rn_expected;
    assert!(
        rel_err < 0.01,
        "φRn(slip): computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        phi_rn, phi_rn_expected, rel_err * 100.0
    );

    // --- Group slip resistance ---
    let phi_rn_group: f64 = n_bolts as f64 * phi_rn;
    let phi_rn_group_expected: f64 = 296.63;

    let rel_err_g = (phi_rn_group - phi_rn_group_expected).abs() / phi_rn_group_expected;
    assert!(
        rel_err_g < 0.01,
        "φRn(group): computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        phi_rn_group, phi_rn_group_expected, rel_err_g * 100.0
    );

    // --- Double shear plane comparison ---
    let ns_double: f64 = 2.0;
    let phi_rn_double: f64 = phi * mu * du * hf * tb * ns_double;

    assert!(
        (phi_rn_double / phi_rn - 2.0).abs() < 0.001,
        "Double shear plane doubles slip resistance: {:.2} / {:.2} = {:.4}",
        phi_rn_double, phi_rn, phi_rn_double / phi_rn
    );

    // --- Strength-level check (φ = 0.85) ---
    let phi_strength: f64 = 0.85;
    let phi_rn_strength: f64 = phi_strength * mu * du * hf * tb * ns;
    assert!(
        phi_rn_strength < phi_rn,
        "Strength-level φRn={:.2} kN < serviceability φRn={:.2} kN",
        phi_rn_strength, phi_rn
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. Block Shear Rupture Capacity
// ═══════════════════════════════════════════════════════════════
//
// AISC 360-16 §J4.3: Block shear rupture strength:
//   Rn = 0.60·Fu·Anv + Ubs·Fu·Ant  ≤  0.60·Fy·Agv + Ubs·Fu·Ant
//
// Connection geometry (2 bolts in a single vertical line):
//   Plate: t = 10 mm, Fy = 250 MPa, Fu = 400 MPa
//   Bolt diameter: 20 mm, standard hole: 22 mm
//   Edge distance (vertical): Lev = 35 mm
//   Edge distance (horizontal): Leh = 30 mm
//   Bolt spacing (vertical): s = 75 mm
//   Ubs = 1.0 (uniform tension stress)
//
// Gross shear area:
//   Agv = t × (Lev + s) = 10 × (35 + 75) = 1100 mm²
//
// Net shear area (deducting 1.5 holes from shear path):
//   Anv = Agv − t × 1.5 × dh = 1100 − 10 × 1.5 × 22 = 770 mm²
//
// Net tension area (deducting 0.5 holes from tension path):
//   Ant = t × (Leh − 0.5 × dh) = 10 × (30 − 11) = 190 mm²
//
// Shear yielding + tension rupture:
//   Rn1 = 0.60 × 250 × 1100 + 1.0 × 400 × 190 = 165000 + 76000 = 241000 N
//
// Shear rupture + tension rupture:
//   Rn2 = 0.60 × 400 × 770 + 1.0 × 400 × 190 = 184800 + 76000 = 260800 N
//
// Rn = min(Rn2, Rn1) = 241000 N = 241.0 kN
// φRn = 0.75 × 241.0 = 180.75 kN

#[test]
fn validation_block_shear_rupture() {
    let t: f64 = 10.0;             // mm, plate thickness
    let fy: f64 = 250.0;           // MPa
    let fu: f64 = 400.0;           // MPa
    let d_hole: f64 = 22.0;        // mm, standard hole diameter
    let lev: f64 = 35.0;           // mm, vertical edge distance
    let leh: f64 = 30.0;           // mm, horizontal edge distance
    let s: f64 = 75.0;             // mm, bolt spacing
    let ubs: f64 = 1.0;            // uniform tension stress
    let phi: f64 = 0.75;

    // --- Gross shear area ---
    let agv: f64 = t * (lev + s);
    let agv_expected: f64 = 1100.0;

    let err_agv = (agv - agv_expected).abs();
    assert!(
        err_agv < 0.01,
        "Agv: computed={:.2} mm², expected={:.2} mm²", agv, agv_expected
    );

    // --- Net shear area (1.5 holes deducted for 2-bolt line) ---
    let anv: f64 = agv - t * 1.5 * d_hole;
    let anv_expected: f64 = 770.0;

    let err_anv = (anv - anv_expected).abs();
    assert!(
        err_anv < 0.01,
        "Anv: computed={:.2} mm², expected={:.2} mm²", anv, anv_expected
    );

    // --- Net tension area ---
    let ant: f64 = t * (leh - 0.5 * d_hole);
    let ant_expected: f64 = 190.0;

    let err_ant = (ant - ant_expected).abs();
    assert!(
        err_ant < 0.01,
        "Ant: computed={:.2} mm², expected={:.2} mm²", ant, ant_expected
    );

    // --- Block shear: shear yielding + tension rupture ---
    let rn1: f64 = (0.60 * fy * agv + ubs * fu * ant) / 1000.0; // kN
    let rn1_expected: f64 = 241.0;

    let rel_err_1 = (rn1 - rn1_expected).abs() / rn1_expected;
    assert!(
        rel_err_1 < 0.01,
        "Rn1 (yield+rupture): computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        rn1, rn1_expected, rel_err_1 * 100.0
    );

    // --- Block shear: shear rupture + tension rupture ---
    let rn2: f64 = (0.60 * fu * anv + ubs * fu * ant) / 1000.0; // kN
    let rn2_expected: f64 = 260.8;

    let rel_err_2 = (rn2 - rn2_expected).abs() / rn2_expected;
    assert!(
        rel_err_2 < 0.01,
        "Rn2 (rupture+rupture): computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        rn2, rn2_expected, rel_err_2 * 100.0
    );

    // --- Governing block shear ---
    let rn: f64 = rn2.min(rn1);
    assert!(
        (rn - rn1).abs() < 0.01,
        "Shear yield path governs: Rn={:.2} kN", rn
    );

    // --- Design capacity ---
    let phi_rn: f64 = phi * rn;
    let phi_rn_expected: f64 = 180.75;

    let rel_err_phi = (phi_rn - phi_rn_expected).abs() / phi_rn_expected;
    assert!(
        rel_err_phi < 0.01,
        "φRn: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        phi_rn, phi_rn_expected, rel_err_phi * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Eccentric Bolt Group — Instantaneous Center Method (Simplified)
// ═══════════════════════════════════════════════════════════════
//
// For a bolt group with eccentric loading, the elastic method
// distributes forces proportionally to distance from the centroid.
//
// Setup: 4 bolts in a vertical line (single column), spacing s = 75 mm.
// Eccentric load V = 100 kN at eccentricity e = 200 mm from bolt line.
//
// Bolt positions (y from centroid):
//   Bolt 1: y = -112.5 mm (bottom)
//   Bolt 2: y = -37.5 mm
//   Bolt 3: y = +37.5 mm
//   Bolt 4: y = +112.5 mm
//
// Moment about centroid: M = V × e = 100 × 200 = 20,000 kN·mm
//
// Direct shear per bolt: Fv = V / n = 100 / 4 = 25 kN
//
// Moment-induced forces (horizontal, from M):
//   Ip = Σyi² = 2 × 112.5² + 2 × 37.5² = 25312.5 + 2812.5 = 28125 mm²
//   Fm_i = M × ri / Ip (all horizontal since bolts are in vertical line)
//
// For outermost bolt (ri = 112.5 mm):
//   Fm = 20000 × 112.5 / 28125 = 80.0 kN (horizontal)
//
// Resultant on outermost bolt:
//   R = √(Fv² + Fm²) = √(25² + 80²) = √(625 + 6400) = √7025 = 83.82 kN

#[test]
fn validation_eccentric_bolt_group_elastic_method() {
    let v: f64 = 100.0;            // kN, applied vertical load
    let e: f64 = 200.0;            // mm, eccentricity
    let s: f64 = 75.0;             // mm, bolt spacing
    let n_bolts: usize = 4;

    // Bolt y-positions from centroid (4 bolts in vertical line)
    let y_positions: Vec<f64> = vec![
        -1.5 * s,   // -112.5 mm
        -0.5 * s,   // -37.5 mm
         0.5 * s,   //  37.5 mm
         1.5 * s,   //  112.5 mm
    ];

    // --- Verify centroid is at center ---
    let y_sum: f64 = y_positions.iter().sum();
    assert!(
        y_sum.abs() < 0.001,
        "Centroid at center: Σy = {:.4}", y_sum
    );

    // --- Direct shear ---
    let fv: f64 = v / n_bolts as f64;
    let fv_expected: f64 = 25.0;

    let err_fv = (fv - fv_expected).abs();
    assert!(
        err_fv < 0.01,
        "Fv: computed={:.2} kN, expected={:.2} kN", fv, fv_expected
    );

    // --- Polar moment of inertia (single column: Ip = Σyi²) ---
    let ip: f64 = y_positions.iter().map(|y| y * y).sum();
    let ip_expected: f64 = 28125.0;

    let err_ip = (ip - ip_expected).abs();
    assert!(
        err_ip < 0.01,
        "Ip: computed={:.2} mm², expected={:.2} mm²", ip, ip_expected
    );

    // --- Moment ---
    let m: f64 = v * e; // kN·mm
    let m_expected: f64 = 20000.0;

    let err_m = (m - m_expected).abs();
    assert!(
        err_m < 0.01,
        "M: computed={:.2} kN·mm, expected={:.2} kN·mm", m, m_expected
    );

    // --- Moment-induced force on outermost bolt ---
    let r_max: f64 = y_positions.iter().map(|y| y.abs()).fold(0.0_f64, f64::max);
    let fm: f64 = m * r_max / ip;
    let fm_expected: f64 = 80.0;

    let rel_err_fm = (fm - fm_expected).abs() / fm_expected;
    assert!(
        rel_err_fm < 0.01,
        "Fm(max): computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        fm, fm_expected, rel_err_fm * 100.0
    );

    // --- Resultant on outermost bolt (vertical shear + horizontal moment force) ---
    let r_bolt: f64 = (fv * fv + fm * fm).sqrt();
    let r_bolt_expected: f64 = 83.82;

    let rel_err_r = (r_bolt - r_bolt_expected).abs() / r_bolt_expected;
    assert!(
        rel_err_r < 0.01,
        "R(max bolt): computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        r_bolt, r_bolt_expected, rel_err_r * 100.0
    );

    // --- Inner bolts have smaller resultant ---
    let r_inner: f64 = y_positions[1].abs();
    let fm_inner: f64 = m * r_inner / ip;
    let r_bolt_inner: f64 = (fv * fv + fm_inner * fm_inner).sqrt();

    assert!(
        r_bolt_inner < r_bolt,
        "Inner bolt R={:.2} kN < outer bolt R={:.2} kN",
        r_bolt_inner, r_bolt
    );
}
