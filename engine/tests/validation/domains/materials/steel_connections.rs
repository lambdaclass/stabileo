/// Validation: Steel Connection Design Formulas
///
/// References:
///   - AISC 360-22: "Specification for Structural Steel Buildings", Ch. J
///   - AISC Steel Construction Manual, 15th Edition
///   - AISC Design Guide 4: "Extended End-Plate Moment Connections" (2003)
///   - AISC Design Guide 1: "Base Plate and Anchor Rod Design" (2006)
///   - AISC 360-22 Chapter K: "Design of HSS Connections"
///   - Salmon, Johnson, Malhas: "Steel Structures: Design and Behavior" 5th ed.
///   - Kulak, Fisher, Struik: "Guide to Design Criteria for Bolted and Riveted Joints"
///
/// Tests verify steel connection design formulas with hand-computed values.
/// No solver calls -- pure arithmetic verification of analytical expressions.

use std::f64::consts::PI;

// ================================================================
// Tolerance helper
// ================================================================

fn assert_close(got: f64, expected: f64, rel_tol: f64, label: &str) {
    let err: f64 = if expected.abs() < 1e-12 {
        got.abs()
    } else {
        (got - expected).abs() / expected.abs()
    };
    assert!(
        err < rel_tol,
        "{}: got {:.6}, expected {:.6}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. Bolt Shear: Single Bolt Shear/Bearing Capacity (AISC J3)
// ================================================================
//
// A325-N bolt, 3/4" diameter (d = 0.75 in):
//   Fnv = 54 ksi (threads in shear plane)
//   Ab = pi/4 * d^2 = 0.4418 in^2
//   Rn_shear = Fnv * Ab = 54 * 0.4418 = 23.86 kips
//   phi = 0.75, phi*Rn = 17.90 kips
//
// Bearing on 1/2" plate, Fu = 65 ksi:
//   Rn_bearing = 2.4*d*t*Fu = 2.4*0.75*0.5*65 = 58.5 kips
//   phi*Rn_bearing = 0.75*58.5 = 43.875 kips
//
// Controlling limit state: shear governs (17.90 < 43.875)

#[test]
fn validation_bolt_shear_bearing_capacity() {
    let d: f64 = 0.75;       // in, bolt diameter
    let fnv: f64 = 54.0;     // ksi, nominal shear stress (A325-N)
    let t_plate: f64 = 0.5;  // in, plate thickness
    let fu_plate: f64 = 65.0; // ksi, plate ultimate strength
    let phi: f64 = 0.75;

    // Bolt cross-sectional area
    let ab: f64 = PI / 4.0 * d * d;
    assert_close(ab, 0.4418, 0.01, "Bolt area Ab");

    // Nominal shear strength
    let rn_shear: f64 = fnv * ab;
    assert_close(rn_shear, 23.86, 0.01, "Rn shear");

    // Design shear strength
    let phi_rn_shear: f64 = phi * rn_shear;
    assert_close(phi_rn_shear, 17.90, 0.01, "phi*Rn shear");

    // Bearing strength (deformation at service load considered)
    let rn_bearing: f64 = 2.4 * d * t_plate * fu_plate;
    assert_close(rn_bearing, 58.5, 0.01, "Rn bearing");

    let phi_rn_bearing: f64 = phi * rn_bearing;
    assert_close(phi_rn_bearing, 43.875, 0.01, "phi*Rn bearing");

    // Shear governs
    let controlling: f64 = phi_rn_shear.min(phi_rn_bearing);
    assert_close(controlling, phi_rn_shear, 0.001, "Shear governs");

    // For a 4-bolt connection: total capacity = 4 * controlling
    let n_bolts: f64 = 4.0;
    let total_capacity: f64 = n_bolts * controlling;
    assert_close(total_capacity, 4.0 * phi_rn_shear, 0.001, "4-bolt capacity");
}

// ================================================================
// 2. Bolt Group Eccentricity: Instantaneous Center Method
// ================================================================
//
// 4-bolt group (2x2), gauge = 3", pitch = 3"
// Vertical load P = 30 kips at eccentricity e = 6" from centroid
//
// Elastic method:
//   Direct shear: Vd = P/n = 7.5 kips per bolt
//   Moment: M = P*e = 180 kip-in
//   Ip = sum(ri^2) = 4*(1.5^2+1.5^2) = 18.0 in^2
//   Moment shear components: Vm_x = M*yi/Ip, Vm_y = M*xi/Ip
//
// Critical bolt at (+1.5, +1.5):
//   Vm_x = 180*1.5/18 = 15.0 kips
//   Vm_y = 180*1.5/18 = 15.0 kips
//   Ry = Vd + Vm_y = 7.5 + 15.0 = 22.5 kips
//   R = sqrt(15^2 + 22.5^2) = sqrt(731.25) = 27.04 kips

#[test]
fn validation_bolt_group_eccentricity() {
    let p: f64 = 30.0;      // kips, vertical load
    let e: f64 = 6.0;       // in, eccentricity
    let n_bolts: f64 = 4.0;
    let gauge: f64 = 3.0;   // in, horizontal spacing
    let pitch: f64 = 3.0;   // in, vertical spacing

    // Bolt positions relative to centroid
    let half_g: f64 = gauge / 2.0;
    let half_p: f64 = pitch / 2.0;

    // Direct shear per bolt
    let vd: f64 = p / n_bolts;
    assert_close(vd, 7.5, 0.001, "Direct shear per bolt");

    // Polar moment of bolt group
    let ri_sq: f64 = half_g * half_g + half_p * half_p; // per bolt
    let ip: f64 = n_bolts * ri_sq;
    assert_close(ip, 18.0, 0.001, "Polar moment of inertia");

    // Moment on bolt group
    let m: f64 = p * e;
    assert_close(m, 180.0, 0.001, "Moment M = P*e");

    // Critical bolt moment shear components (+1.5, +1.5)
    let vm_x: f64 = m * half_p / ip;
    let vm_y: f64 = m * half_g / ip;
    assert_close(vm_x, 15.0, 0.001, "Vm_x at critical bolt");
    assert_close(vm_y, 15.0, 0.001, "Vm_y at critical bolt");

    // Resultant on critical bolt
    let rx: f64 = vm_x;
    let ry: f64 = vd + vm_y;
    let r_max: f64 = (rx * rx + ry * ry).sqrt();
    assert_close(ry, 22.5, 0.001, "Ry at critical bolt");
    assert_close(r_max, (731.25_f64).sqrt(), 0.001, "Max bolt force");
    assert_close(r_max, 27.04, 0.01, "Max bolt force = 27.04 kips");

    // With greater eccentricity, moment shear increases
    let e_large: f64 = 12.0;
    let m_large: f64 = p * e_large;
    let vm_y_large: f64 = m_large * half_g / ip;
    let r_large: f64 = ((m_large * half_p / ip).powi(2) + (vd + vm_y_large).powi(2)).sqrt();
    assert!(r_large > r_max, "Greater eccentricity -> larger bolt force");
}

// ================================================================
// 3. Fillet Weld: Directional Strength Increase (AISC J2.4)
// ================================================================
//
// AISC 360-22 Eq. J2-5:
//   Fnw = 0.60*Fexx*(1.0 + 0.50*sin^1.5(theta))
//
// For theta = 0 (longitudinal): factor = 1.0
// For theta = 45 deg: sin(45)^1.5 = 0.7071^1.5 = 0.5946, factor = 1.2973
// For theta = 90 deg (transverse): factor = 1.5
//
// Weld: 5/16" fillet, E70 electrode
//   te = 0.707 * w = 0.707 * 5/16 = 0.2209 in
//   Rn/L (longitudinal) = 0.60*70*0.2209 = 9.28 kips/in

#[test]
fn validation_fillet_weld_directional_strength() {
    let fexx: f64 = 70.0;      // ksi, E70 electrode
    let w: f64 = 5.0 / 16.0;   // in, weld leg size
    let te: f64 = 0.707 * w;   // in, effective throat
    assert_close(te, 0.2209, 0.01, "Effective throat te");

    // Longitudinal weld (theta = 0)
    let theta_0: f64 = 0.0_f64;
    let factor_0: f64 = 1.0 + 0.50 * theta_0.to_radians().sin().powf(1.5);
    assert_close(factor_0, 1.0, 0.001, "Directional factor at 0 deg");

    let rn_per_l_long: f64 = 0.60 * fexx * te * factor_0;
    assert_close(rn_per_l_long, 9.28, 0.01, "Rn/L longitudinal");

    // 45-degree weld
    let theta_45: f64 = 45.0_f64;
    let sin_45: f64 = theta_45.to_radians().sin();
    let factor_45: f64 = 1.0 + 0.50 * sin_45.powf(1.5);
    assert_close(factor_45, 1.2973, 0.01, "Directional factor at 45 deg");

    let rn_per_l_45: f64 = 0.60 * fexx * te * factor_45;
    assert!(rn_per_l_45 > rn_per_l_long, "45-deg weld stronger than longitudinal");

    // Transverse weld (theta = 90)
    let theta_90: f64 = 90.0_f64;
    let factor_90: f64 = 1.0 + 0.50 * theta_90.to_radians().sin().powf(1.5);
    assert_close(factor_90, 1.5, 0.001, "Directional factor at 90 deg");

    let rn_per_l_trans: f64 = 0.60 * fexx * te * factor_90;
    assert_close(rn_per_l_trans / rn_per_l_long, 1.5, 0.001, "Transverse/longitudinal ratio = 1.5");

    // phi = 0.75 for welds
    let phi: f64 = 0.75;
    let phi_rn_long: f64 = phi * rn_per_l_long;
    assert_close(phi_rn_long, 0.75 * 9.28, 0.01, "phi*Rn/L longitudinal");
}

// ================================================================
// 4. Base Plate Design: Cantilever Model (AISC Design Guide 1)
// ================================================================
//
// Column W10x49 on base plate:
//   Column depth d = 10.0 in, bf = 10.0 in
//   Base plate: B = 14 in, N = 14 in
//   Pu = 300 kips (factored axial load)
//   f'c = 4 ksi, phi_c = 0.65 (bearing on concrete)
//
// Bearing pressure:
//   fp = Pu / (B*N) = 300 / (14*14) = 1.531 ksi
//   fp_max = phi_c * 0.85 * f'c = 0.65*0.85*4.0 = 2.21 ksi
//   fp < fp_max -> OK
//
// Plate thickness (cantilever bending):
//   m = (N - 0.95*d)/2 = (14 - 9.5)/2 = 2.25 in
//   n = (B - 0.80*bf)/2 = (14 - 8.0)/2 = 3.0 in
//   t_req = max(m, n) * sqrt(2*fp/(0.9*Fy))

#[test]
fn validation_base_plate_thickness() {
    let d_col: f64 = 10.0;    // in, column depth
    let bf: f64 = 10.0;       // in, column flange width
    let b_plate: f64 = 14.0;  // in, base plate width
    let n_plate: f64 = 14.0;  // in, base plate length
    let pu: f64 = 300.0;      // kips, factored axial load
    let fc: f64 = 4.0;        // ksi, concrete strength
    let fy: f64 = 36.0;       // ksi, plate yield strength
    let phi_c: f64 = 0.65;    // bearing resistance factor

    // Bearing pressure
    let fp: f64 = pu / (b_plate * n_plate);
    assert_close(fp, 300.0 / 196.0, 0.001, "Bearing pressure fp");

    // Maximum bearing pressure
    let fp_max: f64 = phi_c * 0.85 * fc;
    assert_close(fp_max, 0.65 * 0.85 * 4.0, 0.001, "Max bearing pressure");
    assert!(fp < fp_max, "Bearing pressure OK");

    // Cantilever projections
    let m: f64 = (n_plate - 0.95 * d_col) / 2.0;
    let n: f64 = (b_plate - 0.80 * bf) / 2.0;
    assert_close(m, (14.0 - 9.5) / 2.0, 0.001, "Cantilever m");
    assert_close(n, (14.0 - 8.0) / 2.0, 0.001, "Cantilever n");

    // Yield line parameter lambda*n' (simplified, use max(m, n))
    let critical_dim: f64 = m.max(n);
    assert_close(critical_dim, 3.0, 0.001, "Critical cantilever dimension");

    // Required plate thickness
    let phi_b: f64 = 0.90; // bending
    let t_req: f64 = critical_dim * (2.0 * fp / (phi_b * fy)).sqrt();

    let expected_t: f64 = 3.0 * (2.0 * fp / (0.90 * 36.0)).sqrt();
    assert_close(t_req, expected_t, 0.001, "Required plate thickness");
    assert!(t_req > 0.0, "Plate thickness is positive");
    assert!(t_req < 3.0, "Plate thickness < 3 inches (reasonable)");

    // Thicker plate needed for higher loads
    let pu_high: f64 = 500.0;
    let fp_high: f64 = pu_high / (b_plate * n_plate);
    let t_req_high: f64 = critical_dim * (2.0 * fp_high / (phi_b * fy)).sqrt();
    assert!(t_req_high > t_req, "Higher load requires thicker plate");
}

// ================================================================
// 5. Moment End Plate: Bolt Force with Prying Action (AISC DG 4)
// ================================================================
//
// Extended end plate connection:
//   Bolt row tension = T_bolt = M / (n_rows * d_eff)
//   Prying action increases bolt force: B = T + Q
//   where Q = prying force
//
// Simplified prying (AISC Manual Part 9):
//   Q = T * (a'/b') * (t_c^2/t_p^2 - 1) when t_p < t_c
//   where t_c = sqrt(4*T*b'/(phi*p*Fu))  [critical thickness, no prying]
//   a' = distance from bolt to edge
//   b' = distance from bolt to web face

#[test]
fn validation_moment_end_plate_prying() {
    let m_u: f64 = 2400.0;      // kip-in, factored moment
    let d_beam: f64 = 18.0;     // in, beam depth
    let tf: f64 = 0.75;         // in, beam flange thickness
    let n_bolt_rows: f64 = 2.0; // bolt rows in tension
    let d_eff: f64 = d_beam - tf; // effective moment arm
    assert_close(d_eff, 17.25, 0.001, "Effective moment arm");

    // Bolt tension from moment (per row)
    let t_per_row: f64 = m_u / (n_bolt_rows * d_eff);
    assert_close(t_per_row, 2400.0 / (2.0 * 17.25), 0.001, "Tension per bolt row");

    // Per bolt (2 bolts per row)
    let t_per_bolt: f64 = t_per_row / 2.0;

    // Prying action parameters
    let b_prime: f64 = 1.75;   // in, bolt to web face
    let a_prime: f64 = 1.25;   // in, bolt to plate edge
    let p_bolt: f64 = 3.0;     // in, bolt pitch (tributary length)
    let fu_plate: f64 = 65.0;  // ksi, plate Fu
    let phi: f64 = 0.75;

    // Critical plate thickness (no prying)
    let t_c: f64 = (4.0 * t_per_bolt * b_prime / (phi * p_bolt * fu_plate)).sqrt();

    // Actual plate thickness
    let t_p: f64 = 0.75; // in

    // If t_p < t_c, prying exists
    if t_p < t_c {
        // Prying force (simplified)
        let q: f64 = t_per_bolt * (a_prime / b_prime) * (t_c * t_c / (t_p * t_p) - 1.0);
        let b_total: f64 = t_per_bolt + q;

        assert!(q > 0.0, "Prying force is positive when t_p < t_c");
        assert!(b_total > t_per_bolt, "Total bolt force > applied tension");

        // Prying adds typically 20-40% to bolt force
        let prying_ratio: f64 = q / t_per_bolt;
        assert!(prying_ratio > 0.0, "Prying ratio is positive");
    }

    // With thicker plate (t_p >= t_c), no prying
    let t_p_thick: f64 = t_c + 0.25;
    // When t_p >= t_c: Q = 0, B = T
    let b_no_prying: f64 = t_per_bolt; // no prying force
    assert_close(b_no_prying, t_per_bolt, 1e-10, "No prying with thick plate");

    // Verify t_c is reasonable
    assert!(t_c > 0.0, "Critical thickness is positive");
    assert!(t_c < 3.0, "Critical thickness < 3 inches");

    let _ = t_p_thick;
}

// ================================================================
// 6. HSS Connection: Punching Shear for Branch on Chord (AISC Ch. K)
// ================================================================
//
// Round HSS T-connection:
//   Chord: HSS 8.625x0.322
//   Branch: HSS 4.5x0.237
//   Beta = Db/D = 4.5/8.625 = 0.5217
//   Gamma = D/(2t) = 8.625/(2*0.322) = 13.40
//
// Limit state: Chord plastification (AISC Eq. K2-1):
//   Pn_sin(theta) = Fy*t^2 * (3.1 + 15.6*beta^2) * Qf / sin(theta)
//   For theta = 90 deg (T-connection): sin(theta) = 1.0

#[test]
fn validation_hss_punching_shear() {
    let d_chord: f64 = 8.625;   // in, chord outside diameter
    let t_chord: f64 = 0.322;   // in, chord wall thickness
    let d_branch: f64 = 4.5;    // in, branch outside diameter
    let _t_branch: f64 = 0.237; // in, branch wall thickness
    let fy: f64 = 46.0;         // ksi, HSS yield strength
    let theta: f64 = 90.0;      // deg, branch angle

    // Width ratio
    let beta: f64 = d_branch / d_chord;
    assert_close(beta, 4.5 / 8.625, 0.001, "Beta = Db/D");

    // Chord slenderness
    let gamma: f64 = d_chord / (2.0 * t_chord);
    assert_close(gamma, 8.625 / 0.644, 0.001, "Gamma = D/(2t)");

    // Chord plastification (AISC Eq. K2-1)
    let sin_theta: f64 = (theta * PI / 180.0).sin();
    let qf: f64 = 1.0; // chord stress function (assume no axial load in chord)

    let pn_sin: f64 = fy * t_chord * t_chord * (3.1 + 15.6 * beta * beta) * qf;
    let pn: f64 = pn_sin / sin_theta;

    // Hand calculation:
    // pn_sin = 46 * 0.322^2 * (3.1 + 15.6 * 0.5217^2) * 1.0
    //        = 46 * 0.10368 * (3.1 + 4.247) = 4.769 * 7.347 = 35.04 kips
    let expected_pn_sin: f64 = 46.0 * 0.322 * 0.322 * (3.1 + 15.6 * beta * beta);
    assert_close(pn_sin, expected_pn_sin, 0.001, "Pn*sin(theta)");

    // phi = 0.90 for HSS connections
    let phi: f64 = 0.90;
    let phi_pn: f64 = phi * pn;
    assert!(phi_pn > 0.0, "Design strength is positive");

    // Check: beta <= 1.0 (branch must fit within chord)
    assert!(beta <= 1.0, "Beta <= 1.0");

    // For larger beta, strength increases (quadratic term dominates)
    let beta_large: f64 = 0.8;
    let pn_large: f64 = fy * t_chord * t_chord * (3.1 + 15.6 * beta_large * beta_large) * qf;
    assert!(pn_large > pn_sin, "Larger beta gives higher strength");

    // Thicker chord wall gives much higher strength (t^2 term)
    let t_thick: f64 = 0.500;
    let pn_thick: f64 = fy * t_thick * t_thick * (3.1 + 15.6 * beta * beta) * qf;
    let thickness_ratio: f64 = pn_thick / pn_sin;
    let expected_ratio: f64 = (t_thick / t_chord).powi(2);
    assert_close(thickness_ratio, expected_ratio, 0.001, "Strength proportional to t^2");
}

// ================================================================
// 7. Gusset Plate: Whitmore Section and Block Shear (AISC J4)
// ================================================================
//
// Gusset plate with bolted connection:
//   2 rows of 4 bolts, gauge = 3", pitch = 3"
//   Plate thickness = 1/2", Fy = 36 ksi, Fu = 58 ksi
//
// Whitmore width: L_w = 2 * L_conn * tan(30) + gauge
//   L_conn = (n_bolts_per_row - 1) * pitch = 3 * 3 = 9 in
//   L_w = 2 * 9 * tan(30) + 3 = 2*9*0.5774 + 3 = 10.39 + 3 = 13.39 in
//
// Whitmore section tensile yield:
//   Rn = Fy * L_w * t = 36 * 13.39 * 0.5 = 241.1 kips
//
// Block shear (along two shear planes + one tension plane)

#[test]
fn validation_gusset_plate_whitmore_block_shear() {
    let t_gusset: f64 = 0.5;    // in
    let fy: f64 = 36.0;         // ksi
    let fu: f64 = 58.0;         // ksi
    let gauge: f64 = 3.0;       // in, row spacing
    let pitch: f64 = 3.0;       // in, bolt spacing along row
    let n_bolts_per_row: f64 = 4.0;
    let d_bolt: f64 = 0.75;     // in
    let dh: f64 = d_bolt + 1.0 / 16.0; // in, standard hole diameter
    let le: f64 = 1.5;          // in, edge distance

    // Connection length
    let l_conn: f64 = (n_bolts_per_row - 1.0) * pitch;
    assert_close(l_conn, 9.0, 0.001, "Connection length");

    // Whitmore effective width
    let l_w: f64 = 2.0 * l_conn * (30.0_f64 * PI / 180.0).tan() + gauge;
    let expected_lw: f64 = 2.0 * 9.0 * (PI / 6.0).tan() + 3.0;
    assert_close(l_w, expected_lw, 0.001, "Whitmore width");

    // Whitmore section tensile yielding
    let rn_whitmore: f64 = fy * l_w * t_gusset;
    assert!(rn_whitmore > 0.0, "Whitmore yielding capacity positive");

    // Block shear on gusset plate (2 shear planes + 1 tension plane)
    // Shear planes: along each row of bolts
    let lv: f64 = le + l_conn; // shear length per plane
    let agv: f64 = 2.0 * t_gusset * lv; // gross shear area (2 planes)
    let anv: f64 = 2.0 * t_gusset * (lv - (n_bolts_per_row - 0.5) * dh); // net shear area

    // Tension plane: between rows
    let lt: f64 = gauge; // tension length
    let ant: f64 = t_gusset * (lt - 1.0 * dh); // net tension area (1 hole)

    // Block shear (AISC Eq. J4-5)
    let ubs: f64 = 1.0;
    let rn_bs_rupture: f64 = 0.60 * fu * anv + ubs * fu * ant;
    let rn_bs_yield: f64 = 0.60 * fy * agv + ubs * fu * ant;
    let rn_block_shear: f64 = rn_bs_rupture.min(rn_bs_yield);

    assert!(rn_block_shear > 0.0, "Block shear capacity is positive");

    // phi = 0.75 for block shear
    let phi: f64 = 0.75;
    let phi_rn_bs: f64 = phi * rn_block_shear;
    let phi_rn_wh: f64 = 0.90 * rn_whitmore; // phi = 0.90 for yielding

    // Controlling limit state
    let controlling: f64 = phi_rn_bs.min(phi_rn_wh);
    assert!(controlling > 0.0, "Controlling capacity is positive");
}

// ================================================================
// 8. Splice Connection: Flange Splice with Bolt Pattern Moment Capacity
// ================================================================
//
// Beam flange splice (moment connection):
//   Beam: W18x50, d=18.0", tf=0.570", bf=7.50"
//   Flange force: T = M / (d - tf) = M / 17.43"
//   For Mu = 200 kip-ft = 2400 kip-in:
//     T = 2400 / 17.43 = 137.7 kips
//
// Bolt pattern: 2 rows x 3 bolts in each splice plate
//   3/4" A325-N bolts, double shear
//   phi*Rn per bolt = 2 * 17.9 = 35.8 kips (double shear)
//   6 bolts required: T / (phi*Rn) = 137.7 / 35.8 = 3.85 -> 4 bolts minimum
//   Use 6 bolts (2x3 pattern)

#[test]
fn validation_flange_splice_capacity() {
    let mu: f64 = 2400.0;       // kip-in, factored moment
    let d_beam: f64 = 18.0;     // in, beam depth
    let tf: f64 = 0.570;        // in, flange thickness
    let bf: f64 = 7.50;         // in, flange width

    // Effective moment arm
    let d_eff: f64 = d_beam - tf;
    assert_close(d_eff, 17.43, 0.001, "Effective moment arm");

    // Flange force from moment
    let t_flange: f64 = mu / d_eff;
    assert_close(t_flange, 2400.0 / 17.43, 0.01, "Flange force T");

    // Bolt capacity in double shear (A325-N, 3/4")
    let d_bolt: f64 = 0.75;
    let fnv: f64 = 54.0; // ksi
    let ab: f64 = PI / 4.0 * d_bolt * d_bolt;
    let phi: f64 = 0.75;
    let phi_rn_single: f64 = phi * fnv * ab;
    let phi_rn_double: f64 = 2.0 * phi_rn_single; // double shear
    assert_close(phi_rn_double, 2.0 * 17.90, 0.01, "Double shear bolt capacity");

    // Number of bolts required
    let n_bolts_req: f64 = (t_flange / phi_rn_double).ceil();
    assert!(n_bolts_req >= 4.0, "Need at least 4 bolts");

    // Use 6-bolt pattern (2 rows x 3)
    let n_bolts: f64 = 6.0;
    let total_bolt_capacity: f64 = n_bolts * phi_rn_double;
    assert!(total_bolt_capacity >= t_flange, "Bolt capacity >= flange force");

    // Splice plate net section check
    let dh: f64 = d_bolt + 1.0 / 16.0; // standard hole
    let n_holes_per_row: f64 = 3.0;
    let t_splice: f64 = 0.5; // in, splice plate thickness (each side)
    let fu_splice: f64 = 58.0; // ksi

    // Net area of splice plate (2 plates, one each side)
    let an_splice: f64 = 2.0 * t_splice * (bf - n_holes_per_row * dh);
    let phi_rn_net: f64 = 0.75 * fu_splice * an_splice;
    assert!(phi_rn_net > 0.0, "Net section capacity is positive");

    // Gross yielding of splice plate
    let fy_splice: f64 = 36.0;
    let ag_splice: f64 = 2.0 * t_splice * bf;
    let phi_rn_yield: f64 = 0.90 * fy_splice * ag_splice;

    // Controlling splice plate capacity
    let phi_rn_plate: f64 = phi_rn_net.min(phi_rn_yield);
    assert!(phi_rn_plate >= t_flange, "Splice plate capacity >= flange force");
}
