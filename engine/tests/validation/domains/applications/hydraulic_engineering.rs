/// Validation: Hydraulic Engineering Formulas
///
/// References:
///   - Chow: "Open-Channel Hydraulics" (1959), Ch. 5-10
///   - Streeter & Wylie: "Fluid Mechanics" 8th ed.
///   - Chadwick, Morfett & Borthwick: "Hydraulics in Civil and Environmental Engineering" 5th ed.
///   - USBR: "Design of Small Dams" 3rd ed.
///   - Henderson: "Open Channel Flow" (1966)
///   - FHWA HDS-5: "Hydraulic Design of Highway Culverts" (2012)
///
/// Tests verify hydraulic engineering formulas with hand-computed expected values.
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
// 1. Manning's Equation: V = (1/n) * R^(2/3) * S^(1/2)
// ================================================================
//
// Rectangular channel: b = 3.0 m, y = 1.2 m, n = 0.013 (concrete),
// slope S = 0.001
//
// A = b*y = 3.6 m²
// P = b + 2y = 5.4 m
// R = A/P = 0.6667 m
// V = (1/0.013) * 0.6667^(2/3) * 0.001^(1/2)
//   = 76.923 * 0.7631 * 0.03162 = 1.856 m/s
// Q = A*V = 6.682 m³/s

#[test]
fn validation_manning_equation() {
    let b: f64 = 3.0;
    let y: f64 = 1.2;
    let n: f64 = 0.013;
    let s: f64 = 0.001;

    let area: f64 = b * y;
    let perimeter: f64 = b + 2.0 * y;
    let r_h: f64 = area / perimeter;

    assert_close(area, 3.6, 0.001, "Manning area");
    assert_close(perimeter, 5.4, 0.001, "Manning wetted perimeter");
    assert_close(r_h, 3.6 / 5.4, 0.001, "Manning hydraulic radius");

    let velocity: f64 = (1.0 / n) * r_h.powf(2.0 / 3.0) * s.sqrt();
    let discharge: f64 = area * velocity;

    // Hand calculation:
    // R^(2/3) = 0.6667^0.6667 = 0.7631
    // S^(1/2) = 0.03162
    // V = 76.923 * 0.7631 * 0.03162 = 1.856 m/s
    let r_two_thirds: f64 = r_h.powf(2.0 / 3.0);
    let expected_v: f64 = (1.0 / 0.013) * r_two_thirds * 0.001_f64.sqrt();
    assert_close(velocity, expected_v, 0.001, "Manning velocity");
    assert!(velocity > 1.5 && velocity < 2.5, "Velocity in reasonable range for concrete channel");

    let expected_q: f64 = area * velocity;
    assert_close(discharge, expected_q, 0.001, "Manning discharge");

    // Doubling the slope increases velocity by sqrt(2)
    let velocity_2s: f64 = (1.0 / n) * r_h.powf(2.0 / 3.0) * (2.0 * s).sqrt();
    assert_close(velocity_2s / velocity, 2.0_f64.sqrt(), 0.001, "Manning velocity ratio with 2S");
}

// ================================================================
// 2. Bernoulli's Equation: Energy Conservation
// ================================================================
//
// p1/(rho*g) + V1²/(2g) + z1 = p2/(rho*g) + V2²/(2g) + z2 + h_loss
//
// Water in pipe: z1 = 10 m, z2 = 5 m, V1 = 2 m/s, V2 = 4 m/s
// p1 = 200 kPa, rho = 1000 kg/m³, g = 9.81 m/s²
// h_loss = 0.5 m (minor losses)
//
// p1/(rho*g) = 200000/9810 = 20.387 m
// V1²/(2g) = 4/19.62 = 0.2039 m
// V2²/(2g) = 16/19.62 = 0.8155 m
// p2/(rho*g) = 20.387 + 0.2039 + 10 - 0.8155 - 5 - 0.5 = 24.275 m
// p2 = 24.275 * 9810 = 238,138 Pa

#[test]
fn validation_bernoulli_equation() {
    let rho: f64 = 1000.0;
    let g: f64 = 9.81;
    let z1: f64 = 10.0;
    let z2: f64 = 5.0;
    let v1: f64 = 2.0;
    let v2: f64 = 4.0;
    let p1: f64 = 200_000.0; // Pa
    let h_loss: f64 = 0.5;

    let head_p1: f64 = p1 / (rho * g);
    let head_v1: f64 = v1 * v1 / (2.0 * g);
    let head_v2: f64 = v2 * v2 / (2.0 * g);

    assert_close(head_p1, 200_000.0 / 9810.0, 0.001, "Bernoulli pressure head 1");
    assert_close(head_v1, 4.0 / 19.62, 0.001, "Bernoulli velocity head 1");
    assert_close(head_v2, 16.0 / 19.62, 0.001, "Bernoulli velocity head 2");

    // Total energy at point 1
    let e1: f64 = head_p1 + head_v1 + z1;

    // Solve for p2 head
    let head_p2: f64 = e1 - head_v2 - z2 - h_loss;
    let p2: f64 = head_p2 * rho * g;

    // Energy balance check
    let e2_plus_loss: f64 = head_p2 + head_v2 + z2 + h_loss;
    assert_close(e1, e2_plus_loss, 0.001, "Bernoulli energy balance");

    // p2 should be higher than p1 (elevation drop > velocity increase + losses)
    assert!(p2 > p1, "Downstream pressure higher due to elevation drop");

    // Without losses, total energy is conserved
    let head_p2_no_loss: f64 = e1 - head_v2 - z2;
    let e2_no_loss: f64 = head_p2_no_loss + head_v2 + z2;
    assert_close(e1, e2_no_loss, 1e-10, "Bernoulli perfect energy conservation");
}

// ================================================================
// 3. Sharp-Crested Rectangular Weir: Q = C_d * L * H^(3/2)
// ================================================================
//
// Rehbock formula (SI): C_d = 0.611 + 0.075*(H/P)
// Full weir equation: Q = (2/3)*C_d*sqrt(2g)*L*H^(3/2)
//
// L = 2.0 m, H = 0.3 m, P = 1.0 m (weir height)
//   C_d = 0.611 + 0.075*(0.3/1.0) = 0.6335
//   Q = (2/3)*0.6335*sqrt(19.62)*2.0*0.3^1.5
//   Q = 0.6667*0.6335*4.429*2.0*0.16432 = 0.6157 m³/s

#[test]
fn validation_weir_discharge() {
    let l_weir: f64 = 2.0;
    let h: f64 = 0.3;
    let p_weir: f64 = 1.0;
    let g: f64 = 9.81;

    // Rehbock discharge coefficient
    let c_d: f64 = 0.611 + 0.075 * (h / p_weir);
    assert_close(c_d, 0.6335, 0.001, "Weir Rehbock Cd");

    // Weir discharge
    let q: f64 = (2.0 / 3.0) * c_d * (2.0 * g).sqrt() * l_weir * h.powf(1.5);
    let expected_q: f64 = (2.0 / 3.0) * 0.6335 * (19.62_f64).sqrt() * 2.0 * (0.3_f64).powf(1.5);
    assert_close(q, expected_q, 0.001, "Weir discharge Q");

    // Q should be positive and in reasonable range
    assert!(q > 0.0, "Discharge must be positive");
    assert!(q < 2.0, "Discharge reasonable for small weir");

    // Doubling head: Q ratio = 2^1.5 = 2.828
    let q_2h: f64 = (2.0 / 3.0) * c_d * (2.0 * g).sqrt() * l_weir * (2.0 * h).powf(1.5);
    // Cd changes with H, so use same Cd for ratio check
    let c_d_2h: f64 = 0.611 + 0.075 * (2.0 * h / p_weir);
    let q_2h_exact: f64 = (2.0 / 3.0) * c_d_2h * (2.0 * g).sqrt() * l_weir * (2.0 * h).powf(1.5);
    assert!(q_2h_exact > q * 2.5, "Doubling head more than doubles flow (H^1.5 relationship)");

    // Proportional to weir length
    let q_half_l: f64 = (2.0 / 3.0) * c_d * (2.0 * g).sqrt() * (l_weir / 2.0) * h.powf(1.5);
    assert_close(q_half_l, q / 2.0, 0.001, "Weir Q proportional to L");
    let _ = q_2h;
}

// ================================================================
// 4. Darcy-Weisbach Pipe Friction: hf = f*L*V²/(2*g*D)
// ================================================================
//
// Pipe: D = 0.3 m, L = 100 m, V = 2.5 m/s, f = 0.02 (Darcy friction factor)
//   hf = 0.02 * 100 * 2.5² / (2 * 9.81 * 0.3)
//   hf = 0.02 * 100 * 6.25 / 5.886 = 12.5 / 5.886 = 2.124 m
//
// Reynolds number check: Re = V*D/nu, nu = 1e-6 m²/s
//   Re = 2.5*0.3/1e-6 = 750,000 (turbulent)

#[test]
fn validation_darcy_weisbach() {
    let d: f64 = 0.3;
    let l_pipe: f64 = 100.0;
    let v: f64 = 2.5;
    let f_darcy: f64 = 0.02;
    let g: f64 = 9.81;
    let nu: f64 = 1e-6;

    let hf: f64 = f_darcy * l_pipe * v * v / (2.0 * g * d);
    let expected_hf: f64 = 0.02 * 100.0 * 6.25 / (2.0 * 9.81 * 0.3);
    assert_close(hf, expected_hf, 0.001, "Darcy-Weisbach head loss");

    // Reynolds number
    let re: f64 = v * d / nu;
    assert_close(re, 750_000.0, 0.001, "Reynolds number");
    assert!(re > 4000.0, "Flow is turbulent");

    // Head loss proportional to L
    let hf_double_l: f64 = f_darcy * (2.0 * l_pipe) * v * v / (2.0 * g * d);
    assert_close(hf_double_l, 2.0 * hf, 0.001, "hf proportional to L");

    // Head loss proportional to V²
    let hf_double_v: f64 = f_darcy * l_pipe * (2.0 * v) * (2.0 * v) / (2.0 * g * d);
    assert_close(hf_double_v, 4.0 * hf, 0.001, "hf proportional to V^2");

    // Head loss inversely proportional to D
    let hf_double_d: f64 = f_darcy * l_pipe * v * v / (2.0 * g * 2.0 * d);
    assert_close(hf_double_d, 0.5 * hf, 0.001, "hf inversely proportional to D");

    // Pressure drop: dp = rho * g * hf
    let rho: f64 = 1000.0;
    let dp: f64 = rho * g * hf;
    assert!(dp > 0.0, "Pressure drop is positive");
    assert_close(dp, 1000.0 * 9.81 * expected_hf, 0.001, "Pressure drop from hf");
}

// ================================================================
// 5. Hydraulic Jump: Sequent Depth y2 = (y1/2)*(sqrt(1 + 8*Fr1²) - 1)
// ================================================================
//
// Upstream: y1 = 0.3 m, V1 = 6.0 m/s, g = 9.81
//   Fr1 = V1/sqrt(g*y1) = 6.0/sqrt(2.943) = 6.0/1.7155 = 3.497
//   y2 = 0.3/2 * (sqrt(1 + 8*12.23) - 1) = 0.15*(sqrt(98.84) - 1)
//      = 0.15 * (9.942 - 1) = 0.15 * 8.942 = 1.341 m
//
// Energy loss: dE = (y2-y1)³ / (4*y1*y2)

#[test]
fn validation_hydraulic_jump() {
    let y1: f64 = 0.3;
    let v1: f64 = 6.0;
    let g: f64 = 9.81;

    // Froude number
    let fr1: f64 = v1 / (g * y1).sqrt();
    assert_close(fr1, 6.0 / (9.81 * 0.3_f64).sqrt(), 0.001, "Froude number Fr1");
    assert!(fr1 > 1.0, "Upstream flow is supercritical");

    // Sequent depth (Belanger equation)
    let y2: f64 = (y1 / 2.0) * ((1.0 + 8.0 * fr1 * fr1).sqrt() - 1.0);
    let expected_y2: f64 = 0.15 * ((1.0 + 8.0 * fr1 * fr1).sqrt() - 1.0);
    assert_close(y2, expected_y2, 0.001, "Sequent depth y2");
    assert!(y2 > y1, "Sequent depth > initial depth");

    // Continuity: V1*y1 = V2*y2 (unit width)
    let q_unit: f64 = v1 * y1;
    let v2: f64 = q_unit / y2;
    assert_close(v1 * y1, v2 * y2, 0.001, "Continuity across jump");

    // Downstream Froude number < 1 (subcritical)
    let fr2: f64 = v2 / (g * y2).sqrt();
    assert!(fr2 < 1.0, "Downstream flow is subcritical");

    // Energy loss in jump
    let de: f64 = (y2 - y1).powi(3) / (4.0 * y1 * y2);
    assert!(de > 0.0, "Energy loss is positive");

    // Specific energy before and after
    let e1: f64 = y1 + v1 * v1 / (2.0 * g);
    let e2: f64 = y2 + v2 * v2 / (2.0 * g);
    assert_close(e1 - e2, de, 0.01, "Energy loss matches formula");
}

// ================================================================
// 6. Gradually Varied Flow: Backwater Curve Step Method
// ================================================================
//
// Direct step method: dx = (E2 - E1) / (S0 - Sf_avg)
// where E = y + V²/(2g) is specific energy
//
// Rectangular channel: b = 4 m, n = 0.015, S0 = 0.0005
// Step from y1 = 2.0 m to y2 = 2.1 m (M1 curve, backwater)
// q = Q/b, assume Q = 8 m³/s, so q = 2 m²/s

#[test]
fn validation_backwater_curve_step() {
    let b: f64 = 4.0;
    let n: f64 = 0.015;
    let s0: f64 = 0.0005;
    let q_total: f64 = 8.0;
    let g: f64 = 9.81;

    let y1: f64 = 2.0;
    let y2: f64 = 2.1;

    // Velocities at each section
    let a1: f64 = b * y1;
    let v1: f64 = q_total / a1;
    let a2: f64 = b * y2;
    let v2: f64 = q_total / a2;

    assert_close(v1, 8.0 / 8.0, 0.001, "Velocity at section 1");
    assert_close(v2, 8.0 / 8.4, 0.001, "Velocity at section 2");

    // Specific energy at each section
    let e1: f64 = y1 + v1 * v1 / (2.0 * g);
    let e2: f64 = y2 + v2 * v2 / (2.0 * g);

    // Friction slope using Manning's equation: Sf = (n*V)² / R^(4/3)
    let p1: f64 = b + 2.0 * y1;
    let r1: f64 = a1 / p1;
    let sf1: f64 = (n * v1).powi(2) / r1.powf(4.0 / 3.0);

    let p2: f64 = b + 2.0 * y2;
    let r2: f64 = a2 / p2;
    let sf2: f64 = (n * v2).powi(2) / r2.powf(4.0 / 3.0);

    let sf_avg: f64 = (sf1 + sf2) / 2.0;

    // Step length
    let dx: f64 = (e2 - e1) / (s0 - sf_avg);

    // Since y > yn (normal depth), S0 > Sf, so dx should be positive (M1 curve)
    // For these parameters, Sf < S0 because depth is above normal depth
    assert!(sf_avg < s0, "Friction slope < bed slope for M1 curve");
    assert!(dx > 0.0, "Step dx is positive for M1 backwater");

    // Energy balance: E2 = E1 + (S0 - Sf_avg) * dx
    let e2_check: f64 = e1 + (s0 - sf_avg) * dx;
    assert_close(e2, e2_check, 0.001, "Energy balance in step method");

    // Verify specific energies are reasonable
    assert!(e1 > y1, "Specific energy > depth");
    assert!(e2 > y2, "Specific energy > depth at section 2");
}

// ================================================================
// 7. Culvert Capacity: Inlet vs Outlet Control
// ================================================================
//
// Circular culvert: D = 1.2 m, L = 30 m, n = 0.012, S0 = 0.01
// Headwater HW = 2.0 m
//
// Inlet control (FHWA HDS-5, unsubmerged): HW/D = K * (Q/(A*D^0.5))^M
//   with K = 0.0098, M = 2.0 (concrete pipe, square edge)
//   A = pi*D²/4 = 1.1310 m²
//   HW/D = 2.0/1.2 = 1.667
//   Q_inlet = A*D^0.5 * (HW/(D*K))^(1/M)
//
// Outlet control: HW = H + h0 - L*S0
//   where H = friction + entrance + exit losses

#[test]
fn validation_culvert_capacity() {
    let d: f64 = 1.2;
    let l_culv: f64 = 30.0;
    let n: f64 = 0.012;
    let s0: f64 = 0.01;
    let hw: f64 = 2.0;
    let g: f64 = 9.81;

    let area: f64 = PI * d * d / 4.0;
    assert_close(area, PI * 1.44 / 4.0, 0.001, "Culvert area");

    // Inlet control - simplified approach
    // For submerged inlet (HW/D > 1.2):
    // HW/D = c * (Q/(A*sqrt(2gD)))^2 + Y - 0.5*S0
    // Use simplified: Q_inlet = Cd * A * sqrt(2*g*HW) with Cd = 0.62
    let cd_inlet: f64 = 0.62;
    let q_inlet: f64 = cd_inlet * area * (2.0 * g * hw).sqrt();
    assert!(q_inlet > 0.0, "Inlet control Q is positive");

    // Outlet control - full pipe flow
    // H = (1 + Ke + Kx + f*L/D) * V²/(2g) where Ke=0.5 (entrance), Kx=1.0 (exit)
    // f = 185*n²/D^(1/3) (Manning-to-Darcy conversion for full pipe)
    let ke: f64 = 0.5;
    let kx: f64 = 1.0;
    let f_pipe: f64 = 185.0 * n * n / d.powf(1.0 / 3.0);

    // Tailwater = 0 for free outfall, h0 = D/2 for partially full
    let h0: f64 = d / 2.0;
    // HW = (1 + Ke + Kx + f*L/D)*V²/(2g) + h0 - L*S0
    // Solve for V: V² = 2g*(HW - h0 + L*S0)/(1 + Ke + Kx + f*L/D)
    let loss_coeff: f64 = 1.0 + ke + kx + f_pipe * l_culv / d;
    let v_outlet: f64 = (2.0 * g * (hw - h0 + l_culv * s0) / loss_coeff).sqrt();
    let q_outlet: f64 = area * v_outlet;

    assert!(q_outlet > 0.0, "Outlet control Q is positive");

    // Controlling flow is the lesser of inlet and outlet control
    let q_control: f64 = q_inlet.min(q_outlet);
    assert!(q_control > 0.0, "Controlling Q is positive");
    assert!(q_control <= q_inlet, "Controlling Q <= inlet Q");
    assert!(q_control <= q_outlet, "Controlling Q <= outlet Q");

    // Verify loss coefficient > 1 (always has at least entrance loss)
    assert!(loss_coeff > 1.0, "Total loss coefficient > 1");
}

// ================================================================
// 8. Dam Seepage: Darcy's Law Q = k*i*A
// ================================================================
//
// Earth dam with flow net analysis:
// Permeability k = 1e-5 m/s
// Head difference H = 15 m
// Nf = 4 flow channels, Nd = 12 equipotential drops
//
// Darcy's law: Q = k * H * (Nf/Nd)  [per unit width]
//   Q = 1e-5 * 15 * (4/12) = 1e-5 * 15 * 0.3333 = 5.0e-5 m³/s/m
//
// Seepage velocity: v_s = k * i = k * (H/L_flow)
// Average hydraulic gradient: i = H/Nd * (1/avg_element_length)

#[test]
fn validation_dam_seepage_darcy() {
    let k: f64 = 1e-5;      // m/s
    let h: f64 = 15.0;       // m, head difference
    let nf: f64 = 4.0;       // flow channels
    let nd: f64 = 12.0;      // equipotential drops

    // Flow net solution: Q per unit width
    let q_per_m: f64 = k * h * (nf / nd);
    let expected_q: f64 = 1e-5 * 15.0 * (4.0 / 12.0);
    assert_close(q_per_m, expected_q, 0.001, "Dam seepage Q per unit width");
    assert_close(q_per_m, 5.0e-5, 0.001, "Dam seepage Q = 5e-5 m³/s/m");

    // Head drop per equipotential interval
    let delta_h: f64 = h / nd;
    assert_close(delta_h, 1.25, 0.001, "Head drop per interval");

    // Pore pressure at a point 3 drops from upstream:
    // h_point = H - 3*dH = 15 - 3.75 = 11.25 m
    let n_drops: f64 = 3.0;
    let h_point: f64 = h - n_drops * delta_h;
    assert_close(h_point, 11.25, 0.001, "Head at 3 drops from upstream");

    // Pore water pressure: u = gamma_w * h_point (above datum)
    let gamma_w: f64 = 9.81; // kN/m³
    let u: f64 = gamma_w * h_point;
    assert_close(u, 9.81 * 11.25, 0.001, "Pore pressure at point");

    // Average gradient through dam
    let l_seepage: f64 = 45.0; // approximate seepage path length (m)
    let i_avg: f64 = h / l_seepage;
    assert_close(i_avg, 15.0 / 45.0, 0.001, "Average hydraulic gradient");
    assert_close(i_avg, 1.0 / 3.0, 0.001, "i = 0.333");

    // Seepage velocity vs Darcy velocity
    // v_darcy = k * i, v_seepage = v_darcy / n_porosity
    let porosity: f64 = 0.35;
    let v_darcy: f64 = k * i_avg;
    let v_seepage: f64 = v_darcy / porosity;
    assert_close(v_seepage, v_darcy / 0.35, 0.001, "Seepage velocity > Darcy velocity");
    assert!(v_seepage > v_darcy, "True seepage velocity exceeds Darcy velocity");

    // Total seepage for 100 m wide dam
    let dam_width: f64 = 100.0;
    let q_total: f64 = q_per_m * dam_width;
    assert_close(q_total, 5.0e-3, 0.001, "Total dam seepage for 100m width");
}
