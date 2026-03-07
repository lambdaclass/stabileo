/// Validation: Steel Connection Design
///
/// References:
///   - AISC 360-22 Chapter J: Design of Connections
///   - EN 1993-1-8:2005: Design of joints
///   - Salmon, Johnson, Malhas: "Steel Structures: Design and Behavior" 5th ed.
///   - Kulak, Fisher, Struik: "Guide to Design Criteria for Bolted and Riveted Joints" 2nd ed.
///
/// Tests verify bolt group capacity, weld capacity, and connection design rules.

mod helpers;

use std::f64::consts::PI;

// ================================================================
// 1. Bolt Shear Capacity per AISC 360-22 Table J3.2
// ================================================================
//
// Single A325-N bolt, 3/4" diameter (19 mm).
// Fnv = 54 ksi (bearing-type, threads in shear plane).
// Ab = pi/4 * d^2 = pi/4 * (0.75)^2 = 0.4418 in^2.
// Nominal: Rn = Fnv * Ab = 54 * 0.4418 = 23.86 kips.
// LRFD:    phi = 0.75, phi*Rn = 17.9 kips.

#[test]
fn validation_bolt_shear_capacity_aisc() {
    let d = 0.75; // inches, bolt diameter
    let fnv = 54.0; // ksi, nominal shear stress A325-N
    let phi = 0.75; // LRFD resistance factor for bolt shear

    // Bolt cross-sectional area
    let ab = PI / 4.0 * d * d;
    let ab_expected = 0.4418; // in^2
    assert!(
        (ab - ab_expected).abs() / ab_expected < 0.01,
        "Bolt area: actual={:.4}, expected={:.4}",
        ab, ab_expected
    );

    // Nominal shear strength
    let rn = fnv * ab;
    let rn_expected = 23.86; // kips
    assert!(
        (rn - rn_expected).abs() / rn_expected < 0.01,
        "Nominal Rn: actual={:.2}, expected={:.2}",
        rn, rn_expected
    );

    // Design shear strength (LRFD)
    let phi_rn = phi * rn;
    let phi_rn_expected = 17.9; // kips
    assert!(
        (phi_rn - phi_rn_expected).abs() / phi_rn_expected < 0.01,
        "phi*Rn: actual={:.2}, expected={:.2}",
        phi_rn, phi_rn_expected
    );
}

// ================================================================
// 2. Bolt Bearing Capacity per AISC 360-22 J3.10
// ================================================================
//
// Bearing on a 1/2" plate, Fu = 65 ksi, bolt diameter = 3/4".
// When deformation at service load is a consideration:
//   Rn = 2.4 * d * t * Fu = 2.4 * 0.75 * 0.5 * 65 = 58.5 kips.
// LRFD: phi = 0.75, phi*Rn = 43.875 kips.

#[test]
fn validation_bolt_bearing_capacity_aisc() {
    let d: f64 = 0.75; // inches, bolt diameter
    let t: f64 = 0.5; // inches, plate thickness
    let fu: f64 = 65.0; // ksi, ultimate tensile strength of plate
    let phi: f64 = 0.75; // LRFD resistance factor for bearing

    // Nominal bearing strength (deformation at service load considered, AISC Eq. J3-6a)
    let rn = 2.4 * d * t * fu;
    let rn_expected = 58.5; // kips
    assert!(
        (rn - rn_expected).abs() / rn_expected < 0.01,
        "Nominal bearing Rn: actual={:.2}, expected={:.2}",
        rn, rn_expected
    );

    // Design bearing strength
    let phi_rn = phi * rn;
    let phi_rn_expected = 43.875; // kips
    assert!(
        (phi_rn - phi_rn_expected).abs() / phi_rn_expected < 0.01,
        "phi*Rn bearing: actual={:.3}, expected={:.3}",
        phi_rn, phi_rn_expected
    );
}

// ================================================================
// 3. Bolt Group with Eccentric Load (Elastic Method)
// ================================================================
//
// 4-bolt group in a 2x2 pattern:
//   gauge (horizontal spacing) = 3", pitch (vertical spacing) = 3".
//   Bolt positions relative to centroid:
//     (-1.5, -1.5), (-1.5, +1.5), (+1.5, -1.5), (+1.5, +1.5)
//
// Applied load P = 30 kips at eccentricity e = 6" from bolt group centroid.
//
// Elastic method:
//   Direct shear per bolt: Vd = P / n = 30/4 = 7.5 kips
//   Moment on bolt group: M = P * e = 30 * 6 = 180 kip-in
//   ri^2 for each bolt: 1.5^2 + 1.5^2 = 4.5 in^2
//   sum(ri^2) = 4 * 4.5 = 18.0 in^4
//   rmax = sqrt(1.5^2 + 1.5^2) = 2.121 in
//   Moment shear per bolt: Vm = M * rmax / sum(ri^2) = 180 * 2.121 / 18.0 = 21.21 kips
//
// For the critical bolt (where direct + moment shears add most unfavorably):
//   The moment shear acts perpendicular to the radius vector. At the bolt
//   farthest from the centroid on the load side, decompose moment shear:
//     Vm_x = M * yi / sum(ri^2) = 180 * 1.5 / 18.0 = 15.0 kips
//     Vm_y = M * xi / sum(ri^2) = 180 * 1.5 / 18.0 = 15.0 kips
//   (signs depend on which bolt; for the critical bolt the vertical component
//    of moment shear adds to the direct shear)
//
//   Resultant on critical bolt:
//     Rx = Vm_x = 15.0 (horizontal component from moment only; no direct horizontal)
//     Ry = Vd + Vm_y = 7.5 + 15.0 = 22.5 kips
//     R = sqrt(15.0^2 + 22.5^2) = sqrt(225 + 506.25) = sqrt(731.25) = 27.04 kips

#[test]
fn validation_bolt_group_eccentric_load() {
    let p = 30.0; // kips, applied load (vertical)
    let e = 6.0; // inches, eccentricity from bolt group centroid
    let n_bolts = 4;
    let gauge = 3.0; // inches, horizontal spacing
    let pitch = 3.0; // inches, vertical spacing

    // Bolt positions relative to centroid
    let bolts: [(f64, f64); 4] = [
        (-gauge / 2.0, -pitch / 2.0),
        (-gauge / 2.0, pitch / 2.0),
        (gauge / 2.0, -pitch / 2.0),
        (gauge / 2.0, pitch / 2.0),
    ];

    // Direct shear (vertical) per bolt
    let vd = p / n_bolts as f64;
    let vd_expected = 7.5;
    assert!(
        (vd - vd_expected).abs() / vd_expected < 0.01,
        "Direct shear: actual={:.2}, expected={:.2}",
        vd, vd_expected
    );

    // Polar moment of inertia of bolt group
    let sum_ri_sq: f64 = bolts.iter().map(|(x, y)| x * x + y * y).sum();
    let sum_ri_sq_expected = 18.0; // in^2
    assert!(
        (sum_ri_sq - sum_ri_sq_expected).abs() / sum_ri_sq_expected < 0.01,
        "Sum(ri^2): actual={:.2}, expected={:.2}",
        sum_ri_sq, sum_ri_sq_expected
    );

    // Moment on bolt group
    let m = p * e; // 180 kip-in

    // Find the critical bolt: the one where moment shear adds to direct shear.
    // For a vertical downward load with eccentricity producing clockwise moment,
    // the critical bolt is at (+1.5, +1.5) — moment shear vertical component
    // is in the same direction as direct shear.
    let mut max_resultant = 0.0_f64;
    for &(xi, yi) in &bolts {
        // Moment shear components (perpendicular to radius, following moment direction):
        //   Vm_x = M * yi / sum(ri^2)  (horizontal component)
        //   Vm_y = M * xi / sum(ri^2)  (vertical component, sign: adds when xi > 0)
        let vm_x = m * yi / sum_ri_sq;
        let vm_y = m * xi / sum_ri_sq;

        // Total force on bolt: direct shear is vertical (downward = negative)
        // Moment shear horizontal: vm_x
        // Moment shear vertical: vm_y adds to direct shear
        let rx = vm_x;
        let ry = vd + vm_y;
        let resultant = (rx * rx + ry * ry).sqrt();
        if resultant > max_resultant {
            max_resultant = resultant;
        }
    }

    let expected_max = 27.04; // kips
    assert!(
        (max_resultant - expected_max).abs() / expected_max < 0.01,
        "Max bolt force: actual={:.2}, expected={:.2}",
        max_resultant, expected_max
    );
}

// ================================================================
// 4. Fillet Weld Capacity per AISC 360-22 J2.4
// ================================================================
//
// 5/16" fillet weld, E70 electrode (Fexx = 70 ksi).
// Effective throat = 0.707 * w = 0.707 * 5/16 = 0.2209 in.
// Nominal strength per unit length:
//   Rn/L = 0.60 * Fexx * te = 0.60 * 70 * 0.2209 = 9.28 kips/in.
// LRFD: phi = 0.75, phi*Rn/L = 6.96 kips/in.

#[test]
fn validation_weld_capacity_fillet_aisc() {
    let w: f64 = 5.0 / 16.0; // inches, weld leg size
    let fexx: f64 = 70.0; // ksi, electrode classification strength (E70)
    let phi: f64 = 0.75; // LRFD resistance factor for welds

    // Effective throat thickness
    let te = 0.707 * w;
    let te_expected = 0.2209; // in
    assert!(
        (te - te_expected).abs() / te_expected < 0.01,
        "Effective throat: actual={:.4}, expected={:.4}",
        te, te_expected
    );

    // Nominal weld strength per unit length (longitudinal, theta = 0)
    let rn_per_l = 0.60 * fexx * te;
    let rn_per_l_expected = 9.28; // kips/in
    assert!(
        (rn_per_l - rn_per_l_expected).abs() / rn_per_l_expected < 0.01,
        "Weld Rn/L: actual={:.2}, expected={:.2}",
        rn_per_l, rn_per_l_expected
    );

    // Design strength per unit length
    let phi_rn_per_l = phi * rn_per_l;
    let phi_rn_per_l_expected = 6.96; // kips/in
    assert!(
        (phi_rn_per_l - phi_rn_per_l_expected).abs() / phi_rn_per_l_expected < 0.01,
        "phi*Rn/L: actual={:.2}, expected={:.2}",
        phi_rn_per_l, phi_rn_per_l_expected
    );
}

// ================================================================
// 5. Weld Directional Strength Increase per AISC J2.4
// ================================================================
//
// Transverse fillet welds (load perpendicular to weld axis, theta = 90 deg)
// receive a 1.5x strength increase per AISC 360-22 Eq. J2-5:
//   Fnw = 0.60*Fexx*(1.0 + 0.50*sin^1.5(theta))
//
// For theta = 90 deg: sin(90) = 1.0, factor = 1.0 + 0.50*1.0 = 1.50.
// So phi*Rn_transverse = 1.5 * phi*Rn_longitudinal.

#[test]
fn validation_weld_directional_strength_increase() {
    let fexx = 70.0; // ksi
    let w = 5.0 / 16.0; // in, weld leg size
    let te = 0.707 * w; // effective throat

    // Longitudinal (theta = 0)
    let theta_long: f64 = 0.0_f64.to_radians();
    let fnw_long = 0.60 * fexx * (1.0 + 0.50 * theta_long.sin().powf(1.5));
    let rn_long = fnw_long * te;

    // Transverse (theta = 90 deg)
    let theta_trans: f64 = 90.0_f64.to_radians();
    let fnw_trans = 0.60 * fexx * (1.0 + 0.50 * theta_trans.sin().powf(1.5));
    let rn_trans = fnw_trans * te;

    // The ratio should be 1.5
    let ratio = rn_trans / rn_long;
    let ratio_expected = 1.5;
    assert!(
        (ratio - ratio_expected).abs() / ratio_expected < 0.01,
        "Transverse/longitudinal ratio: actual={:.3}, expected={:.3}",
        ratio, ratio_expected
    );

    // Verify the directional factor at theta = 90 explicitly
    let directional_factor = 1.0 + 0.50 * (90.0_f64.to_radians()).sin().powf(1.5);
    assert!(
        (directional_factor - 1.5).abs() < 0.001,
        "Directional factor at 90 deg: actual={:.4}, expected=1.5000",
        directional_factor
    );

    // Also check an intermediate angle: theta = 45 deg
    // sin(45)^1.5 = (sqrt(2)/2)^1.5 = 0.7071^1.5 = 0.5946
    // factor = 1.0 + 0.50 * 0.5946 = 1.2973
    let theta_45: f64 = 45.0_f64.to_radians();
    let factor_45 = 1.0 + 0.50 * theta_45.sin().powf(1.5);
    let factor_45_expected = 1.2973;
    assert!(
        (factor_45 - factor_45_expected).abs() / factor_45_expected < 0.01,
        "Directional factor at 45 deg: actual={:.4}, expected={:.4}",
        factor_45, factor_45_expected
    );
}

// ================================================================
// 6. EC3 Bolt Shear — Category A (M20, Grade 8.8)
// ================================================================
//
// EN 1993-1-8 Table 3.4: Shear resistance per bolt, single shear plane.
// M20 bolt, grade 8.8: fub = 800 MPa.
// Shear through the shank (unthreaded part):
//   alpha_v = 0.6 (for grade 8.8)
//   A = gross area = pi/4 * 20^2 = 314.16 mm^2
//   gamma_M2 = 1.25
//   Fv,Rd = alpha_v * fub * A / gamma_M2
//         = 0.6 * 800 * 314.16 / 1.25
//         = 120,637 N = 120.6 kN

#[test]
fn validation_ec3_bolt_shear_category_a() {
    let d = 20.0; // mm, bolt diameter
    let fub = 800.0; // MPa, ultimate tensile strength (grade 8.8)
    let alpha_v = 0.6; // shear factor for 8.8 bolts
    let gamma_m2 = 1.25; // partial safety factor

    // Gross cross-sectional area of bolt shank
    let a_bolt = PI / 4.0 * d * d;
    let a_bolt_expected = 314.16; // mm^2
    assert!(
        (a_bolt - a_bolt_expected).abs() / a_bolt_expected < 0.01,
        "Bolt area: actual={:.2}, expected={:.2} mm^2",
        a_bolt, a_bolt_expected
    );

    // Design shear resistance per bolt (single shear plane through shank)
    let fv_rd = alpha_v * fub * a_bolt / gamma_m2; // in Newtons
    let fv_rd_kn = fv_rd / 1000.0; // convert to kN
    let fv_rd_kn_expected = 120.6; // kN
    assert!(
        (fv_rd_kn - fv_rd_kn_expected).abs() / fv_rd_kn_expected < 0.01,
        "Fv,Rd: actual={:.1}, expected={:.1} kN",
        fv_rd_kn, fv_rd_kn_expected
    );

    // Also verify for shear through the threaded part (As = tensile stress area)
    // For M20: As = 245 mm^2 (from EN ISO 898-1 / EC3 tables)
    let a_s = 245.0; // mm^2, tensile stress area for M20
    let fv_rd_thread = alpha_v * fub * a_s / gamma_m2 / 1000.0; // kN
    let fv_rd_thread_expected = 94.08; // kN
    assert!(
        (fv_rd_thread - fv_rd_thread_expected).abs() / fv_rd_thread_expected < 0.01,
        "Fv,Rd (threaded): actual={:.2}, expected={:.2} kN",
        fv_rd_thread, fv_rd_thread_expected
    );
}

// ================================================================
// 7. EC3 Bolt Spacing and Edge Distance Requirements
// ================================================================
//
// EN 1993-1-8 Table 3.3 specifies minimum spacing and edge distances
// as multiples of the hole diameter d0.
//
// For M20 bolt: d0 = 22 mm (standard hole = d + 2 mm).
//
// Minimum spacing:   p1_min = 2.2 * d0 = 2.2 * 22 = 48.4 mm
// Minimum edge dist: e1_min = 1.2 * d0 = 1.2 * 22 = 26.4 mm
//
// Maximum spacing (compression): p1_max = min(14*t, 200 mm) per Table 3.3
// Maximum edge distance:         e1_max = min(4*t + 40, max table value)

#[test]
fn validation_ec3_bolt_spacing_and_edge_distance() {
    let d: f64 = 20.0; // mm, bolt diameter
    let d0: f64 = d + 2.0; // mm, standard hole diameter per EC3-1-8 cl. 2.8

    // --- Minimum spacing ---
    let p1_min = 2.2 * d0;
    let p1_min_expected = 48.4; // mm
    assert!(
        (p1_min - p1_min_expected).abs() / p1_min_expected < 0.01,
        "Min spacing p1: actual={:.1}, expected={:.1} mm",
        p1_min, p1_min_expected
    );

    // --- Minimum edge distance ---
    let e1_min = 1.2 * d0;
    let e1_min_expected = 26.4; // mm
    assert!(
        (e1_min - e1_min_expected).abs() / e1_min_expected < 0.01,
        "Min edge dist e1: actual={:.1}, expected={:.1} mm",
        e1_min, e1_min_expected
    );

    // --- Maximum spacing in compression members ---
    // Per Table 3.3: p1 <= min(14*t, 200 mm) for outer row
    let t_plate: f64 = 12.0; // mm, plate thickness
    let p1_max = (14.0 * t_plate).min(200.0);
    let p1_max_expected = 168.0; // mm (14 * 12 = 168 < 200)
    assert!(
        (p1_max - p1_max_expected).abs() / p1_max_expected < 0.01,
        "Max spacing p1: actual={:.1}, expected={:.1} mm",
        p1_max, p1_max_expected
    );

    // --- Maximum edge distance ---
    // Per Table 3.3: e_max = 4*t + 40 mm (but not more than 8*t or certain limits)
    let e_max = 4.0 * t_plate + 40.0;
    let e_max_expected = 88.0; // mm
    assert!(
        (e_max - e_max_expected).abs() / e_max_expected < 0.01,
        "Max edge dist: actual={:.1}, expected={:.1} mm",
        e_max, e_max_expected
    );

    // --- Verify a typical connection is within limits ---
    let spacing_used = 60.0; // mm, chosen spacing
    let edge_dist_used = 35.0; // mm, chosen edge distance
    assert!(
        spacing_used >= p1_min,
        "Spacing {:.1} must be >= min {:.1} mm",
        spacing_used, p1_min
    );
    assert!(
        spacing_used <= p1_max,
        "Spacing {:.1} must be <= max {:.1} mm",
        spacing_used, p1_max
    );
    assert!(
        edge_dist_used >= e1_min,
        "Edge dist {:.1} must be >= min {:.1} mm",
        edge_dist_used, e1_min
    );
}

// ================================================================
// 8. Block Shear Tearout per AISC 360-22 J4.3
// ================================================================
//
// Block shear rupture for a 2-bolt connection in a 3/8" plate.
//
// Geometry:
//   Plate: 3/8" thick, Fu = 58 ksi, Fy = 36 ksi
//   Bolt diameter: 3/4", hole diameter: 13/16" (standard hole = d + 1/16")
//   Edge distance (Le) = 1.5", bolt spacing (s) = 3.0"
//   One vertical line of 2 bolts
//
// Block shear paths:
//   Shear plane (along bolt line): length = Le + s = 1.5 + 3.0 = 4.5"
//   Tension plane (perpendicular at last bolt): width = Le = 1.5"
//     (from bolt to plate edge, horizontal tearout)
//
// Gross shear area:   Agv = t * Lv = 0.375 * 4.5 = 1.6875 in^2
// Net shear area:     Anv = t * (Lv - 1.5*dh) = 0.375 * (4.5 - 1.5*0.8125) = 1.2305 in^2
// Net tension area:   Ant = t * (Le - 0.5*dh) = 0.375 * (1.5 - 0.5*0.8125) = 0.4102 in^2
//
// AISC Eq. J4-5:
//   Rn = 0.60*Fu*Anv + Ubs*Fu*Ant   (shear rupture + tension rupture)
//   Rn = 0.60*Fy*Agv + Ubs*Fu*Ant   (shear yield + tension rupture)
//   Take the LESSER value. Ubs = 1.0 (uniform tension stress).
//
// Rupture: Rn1 = 0.60*58*1.2305 + 1.0*58*0.4102 = 42.82 + 23.79 = 66.61 kips
// Yield:   Rn2 = 0.60*36*1.6875 + 1.0*58*0.4102 = 36.45 + 23.79 = 60.24 kips
// Rn = min(66.61, 60.24) = 60.24 kips (yield controls)
// phi*Rn = 0.75 * 60.24 = 45.18 kips

#[test]
fn validation_block_shear_tearout() {
    let t: f64 = 3.0 / 8.0; // inches, plate thickness
    let fu: f64 = 58.0; // ksi, ultimate tensile strength (A36 steel)
    let fy: f64 = 36.0; // ksi, yield strength
    let d_bolt: f64 = 3.0 / 4.0; // inches, bolt diameter
    let dh: f64 = d_bolt + 1.0 / 16.0; // inches, standard hole diameter (13/16")
    let le: f64 = 1.5; // inches, edge distance
    let s: f64 = 3.0; // inches, bolt spacing
    let ubs: f64 = 1.0; // uniform tension stress distribution
    let phi: f64 = 0.75; // LRFD resistance factor for block shear

    // Shear length (along bolt line from edge to last bolt + one edge distance)
    let lv = le + s; // 4.5 in

    // Gross shear area
    let agv: f64 = t * lv;
    let agv_expected = 1.6875; // in^2
    assert!(
        (agv - agv_expected).abs() / agv_expected < 0.01,
        "Agv: actual={:.4}, expected={:.4}",
        agv, agv_expected
    );

    // Net shear area: deduct 1.5 hole diameters (2 bolts: 1 full hole + 2 half holes = 1.5)
    let anv: f64 = t * (lv - 1.5 * dh);
    let anv_expected = 1.2305; // in^2
    assert!(
        (anv - anv_expected).abs() / anv_expected < 0.01,
        "Anv: actual={:.4}, expected={:.4}",
        anv, anv_expected
    );

    // Net tension area: deduct 0.5 hole diameters (one half hole)
    let ant: f64 = t * (le - 0.5 * dh);
    let ant_expected = 0.4102; // in^2
    assert!(
        (ant - ant_expected).abs() / ant_expected < 0.01,
        "Ant: actual={:.4}, expected={:.4}",
        ant, ant_expected
    );

    // Block shear — shear rupture path (Eq. J4-5, first expression)
    let rn_rupture: f64 = 0.60 * fu * anv + ubs * fu * ant;
    let rn_rupture_expected = 66.61; // kips
    assert!(
        (rn_rupture - rn_rupture_expected).abs() / rn_rupture_expected < 0.01,
        "Rn (rupture): actual={:.2}, expected={:.2}",
        rn_rupture, rn_rupture_expected
    );

    // Block shear — shear yield path (Eq. J4-5, second expression)
    let rn_yield: f64 = 0.60 * fy * agv + ubs * fu * ant;
    let rn_yield_expected = 60.24; // kips
    assert!(
        (rn_yield - rn_yield_expected).abs() / rn_yield_expected < 0.01,
        "Rn (yield): actual={:.2}, expected={:.2}",
        rn_yield, rn_yield_expected
    );

    // Governing block shear strength = minimum of the two
    let rn: f64 = rn_rupture.min(rn_yield);
    assert!(
        (rn - rn_yield).abs() < 0.01,
        "Yield path should govern: Rn_rupture={:.2}, Rn_yield={:.2}",
        rn_rupture, rn_yield
    );

    // Design block shear strength (LRFD)
    let phi_rn = phi * rn;
    let phi_rn_expected = 45.18; // kips
    assert!(
        (phi_rn - phi_rn_expected).abs() / phi_rn_expected < 0.01,
        "phi*Rn block shear: actual={:.2}, expected={:.2}",
        phi_rn, phi_rn_expected
    );
}
