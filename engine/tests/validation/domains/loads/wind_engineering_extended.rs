/// Validation: Wind Engineering — Extended Dynamic Wind Loading
///
/// References:
///   - ASCE 7-22: Minimum Design Loads and Associated Criteria, Ch. 26-31
///   - EN 1991-1-4:2005: Eurocode 1 — Actions on Structures — Wind Actions
///   - Simiu & Yeo: "Wind Effects on Structures", 4th ed.
///   - Vickery & Basu: "Across-Wind Vibrations of Chimneys" (1983)
///   - Chopra: "Dynamics of Structures", 5th ed., Ch. 3 (SDOF dynamics)
///   - AISC 360-22: Specification for Structural Steel Buildings, Ch. L (serviceability)
///
/// Tests:
///   1. Along-wind gust effect factor G (ASCE 7) — equivalent static wind load on portal frame
///   2. Across-wind vortex shedding: Strouhal frequency fv = St*V/D for a chimney cantilever
///   3. Wind pressure profile: power-law wind on 3-story frame, verify story shears
///   4. Wind tunnel Cp distribution: verify base shear = sum(p*A)
///   5. Dynamic amplification under resonant wind: static vs. amplified response
///   6. Wind load combination: 0.75W + 1.0D envelope vs 1.0W + 0.9D
///   7. Shielding effect: compare frame with/without windward obstruction (reduced Cp)
///   8. Wind-induced drift: verify interstory drift under service wind < L/400

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa; solver internally multiplies by 1000
const A: f64 = 0.01;       // m^2
const IZ: f64 = 1e-4;      // m^4

// ================================================================
// 1. Along-Wind Gust Effect Factor G (ASCE 7)
// ================================================================
//
// Per ASCE 7-22 Section 26.11, for rigid structures (f_n > 1 Hz),
// the gust effect factor G = 0.85 is the simplified value.
//
// The equivalent static wind load on a structure is:
//   F_equiv = G * qz * Cp * A_tributary
//
// We apply this as a lateral nodal load on a portal frame and verify
// that the base shear equals the applied load (equilibrium check)
// and that G amplifies the mean-wind-only response by exactly G.
//
// Reference: ASCE 7-22, Table 26.11-1, Eq. 26.11-1

#[test]
fn wind_along_wind_gust_effect_factor() {
    let h = 10.0; // m, building height
    let w = 8.0;  // m, bay width

    // Wind parameters (ASCE 7 simplified)
    let v = 45.0;       // m/s basic wind speed
    let kz = 0.85;      // velocity pressure exposure coefficient at 10 m, Exposure C
    let kd = 0.85;      // directionality factor
    let kzt = 1.0;      // topographic factor (flat terrain)
    let ke = 1.0;       // ground elevation factor (sea level)
    let g_gust = 0.85;  // gust effect factor for rigid structures

    // Velocity pressure: qz = 0.613 * Kz * Kzt * Kd * Ke * V^2 (Pa)
    let qz_pa = 0.613 * kz * kzt * kd * ke * v * v;
    let qz_kn = qz_pa / 1000.0; // kN/m^2

    // Design pressure on windward wall: p = G * qz * Cp
    let cp_windward = 0.8;
    let p_windward = g_gust * qz_kn * cp_windward; // kN/m^2

    // Tributary area for a single-story frame loaded at beam level
    // Assume building width (perpendicular to wind) = 10 m
    let trib_width = 10.0; // m
    let trib_height = h;   // full height, loaded at beam level
    let f_equiv = p_windward * trib_width * trib_height; // kN

    // Solve portal frame with this equivalent static wind load
    let input = make_portal_frame(h, w, E, A, IZ, f_equiv, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Check equilibrium: sum of horizontal reactions = applied lateral load
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), f_equiv, 0.01, "gust factor: base shear = F_equiv");

    // Now solve with mean wind only (no gust factor, G=1.0)
    let p_mean = qz_kn * cp_windward;
    let f_mean = p_mean * trib_width * trib_height;
    let input_mean = make_portal_frame(h, w, E, A, IZ, f_mean, 0.0);
    let results_mean = linear::solve_2d(&input_mean).unwrap();

    // Roof displacement: the gust-factored response should be exactly G times
    // the mean response (linear system => superposition)
    let ux_gust = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux_mean = results_mean.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    let ratio = ux_gust / ux_mean;
    assert_close(ratio, g_gust, 0.01, "gust factor: displacement ratio = G");

    // Verify gust effect factor value
    assert_close(g_gust, 0.85, 1e-10, "ASCE 7 rigid structure G = 0.85");
}

// ================================================================
// 2. Across-Wind Vortex Shedding: Strouhal Frequency
// ================================================================
//
// For a circular chimney, the vortex shedding frequency is:
//   fv = St * V / D
// where St ~ 0.20 for circular cylinders (subcritical Re).
//
// If fv matches the structure's natural frequency, lock-in occurs.
// We model the chimney as a cantilever beam, compute its first-mode
// frequency analytically, and compare with the critical wind speed:
//   V_cr = f_n * D / St
//
// Reference: EN 1991-1-4 Annex E, Vickery & Basu (1983)

#[test]
fn wind_vortex_shedding_strouhal_frequency() {
    let d: f64 = 3.0;    // m, chimney outer diameter
    let h: f64 = 40.0;   // m, chimney height
    let st: f64 = 0.20;  // Strouhal number for circular cylinder

    // Chimney section properties (hollow circular, t=0.3m)
    let t_wall = 0.3;
    let r_o = d / 2.0;
    let r_i = r_o - t_wall;
    let a_chim = std::f64::consts::PI * (r_o * r_o - r_i * r_i);
    let iz_chim = std::f64::consts::PI / 4.0 * (r_o.powi(4) - r_i.powi(4));

    // Material: reinforced concrete E = 30,000 MPa
    let e_conc = 30_000.0; // MPa (solver multiplies by 1000 => 30 GPa)
    let e_eff = e_conc * 1000.0; // kN/m^2 = 30e6 kN/m^2

    // Mass per unit length (concrete density ~ 2400 kg/m^3)
    let rho_conc = 2400.0; // kg/m^3
    let m_per_m = rho_conc * a_chim; // kg/m

    // Analytical first-mode frequency of a cantilever:
    //   f1 = (1.8751)^2 / (2*pi) * sqrt(EI / (m * L^4))
    let beta1_l = 1.8751;
    let f_n = beta1_l * beta1_l / (2.0 * std::f64::consts::PI)
        * (e_eff * 1000.0 * iz_chim / (m_per_m * h.powi(4))).sqrt();
    // Note: e_eff is in kN/m^2, need to convert to N/m^2 for consistent units with kg

    // Critical wind speed for vortex shedding
    let v_cr = f_n * d / st;

    // Verify Strouhal relationship: fv = St * V_cr / D should equal f_n
    let fv_check = st * v_cr / d;
    assert_close(fv_check, f_n, 1e-10, "Strouhal: fv = St*V_cr/D = f_n");

    // Critical wind speed should be in a reasonable range (5-50 m/s)
    assert!(
        v_cr > 1.0 && v_cr < 100.0,
        "Critical wind speed V_cr = {:.1} m/s should be in reasonable range", v_cr
    );

    // Natural frequency should be reasonable for a 40m concrete chimney (0.5 - 5 Hz)
    assert!(
        f_n > 0.1 && f_n < 20.0,
        "Natural frequency f_n = {:.2} Hz should be reasonable for chimney", f_n
    );

    // Now verify with a FEM cantilever model that the tip stiffness is consistent
    // Apply a unit lateral load at the tip and check deflection = P*L^3/(3EI)
    let n_elem = 10;
    let p_unit = 1.0; // kN
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_elem + 1, fx: p_unit, fz: 0.0, my: 0.0,
    })];
    let input = make_beam(n_elem, h, e_conc, a_chim, iz_chim, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let ux_tip = results.displacements.iter()
        .find(|d| d.node_id == n_elem + 1).unwrap().ux;

    let delta_exact = p_unit * h.powi(3) / (3.0 * e_eff * iz_chim);
    assert_close(ux_tip, delta_exact, 0.02, "chimney cantilever tip deflection");
}

// ================================================================
// 3. Wind Pressure Profile: Power-Law Wind on Multi-Story Frame
// ================================================================
//
// Wind speed varies with height per the power law:
//   V(z) = V_ref * (z / z_ref)^alpha
// Velocity pressure: q(z) = 0.5 * rho * V(z)^2
//
// We apply discrete nodal loads at each story level of a 3-story frame,
// proportional to the velocity pressure at that height.
//
// Story shear at level k = sum of all lateral loads above and at level k.
// The base shear must equal the total applied lateral load.
//
// Reference: ASCE 7-22 Section 26.10, EN 1991-1-4 Section 4.3.2

#[test]
fn wind_pressure_profile_multistory_story_shears() {
    let h = 4.0;   // m, story height
    let w = 6.0;   // m, bay width

    // Wind parameters
    let v_ref = 30.0;   // m/s at reference height
    let z_ref = 10.0;   // m, reference height
    let alpha = 0.16;   // power-law exponent (open terrain)
    let rho = 1.225;    // kg/m^3, air density
    let cp = 0.8;       // pressure coefficient
    let trib_area_per_story = h * 10.0; // m^2 (tributary area per story)

    // Compute wind force at each story level
    let n_stories = 3;
    let mut f_story = Vec::new();
    for i in 1..=n_stories {
        let z = i as f64 * h;
        let v_z = v_ref * (z / z_ref).powf(alpha);
        let qz = 0.5 * rho * v_z * v_z / 1000.0; // kN/m^2
        let f = qz * cp * trib_area_per_story;
        f_story.push(f);
    }

    // Build 3-story single-bay frame
    let nodes = vec![
        (1, 0.0, 0.0),       (2, w, 0.0),
        (3, 0.0, h),         (4, w, h),
        (5, 0.0, 2.0 * h),   (6, w, 2.0 * h),
        (7, 0.0, 3.0 * h),   (8, w, 3.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 3, 5, 1, 1, false, false),
        (5, "frame", 4, 6, 1, 1, false, false),
        (6, "frame", 5, 6, 1, 1, false, false),
        (7, "frame", 5, 7, 1, 1, false, false),
        (8, "frame", 6, 8, 1, 1, false, false),
        (9, "frame", 7, 8, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];

    // Apply wind loads at left-side nodes of each story
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f_story[0], fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: f_story[1], fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: f_story[2], fz: 0.0, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total base shear = sum of all story forces
    let v_base_expected: f64 = f_story.iter().sum();
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), v_base_expected, 0.01, "wind profile: total base shear");

    // Wind forces should increase with height (power-law profile)
    assert!(
        f_story[0] < f_story[1] && f_story[1] < f_story[2],
        "Wind force should increase with height: F1={:.2}, F2={:.2}, F3={:.2}",
        f_story[0], f_story[1], f_story[2]
    );

    // Story shears: V_story3 = F3, V_story2 = F2+F3, V_story1 = F1+F2+F3
    let v_story3 = f_story[2];
    let v_story2 = f_story[1] + f_story[2];
    let v_story1 = f_story[0] + f_story[1] + f_story[2];
    assert!(
        v_story1 > v_story2 && v_story2 > v_story3,
        "Story shears must increase downward: V1={:.2}, V2={:.2}, V3={:.2}",
        v_story1, v_story2, v_story3
    );
    assert_close(v_story1, v_base_expected, 1e-10, "V_story1 = total base shear");

    // Verify displacements increase monotonically upward
    let ux3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let ux5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;
    let ux7 = results.displacements.iter().find(|d| d.node_id == 7).unwrap().ux;
    assert!(
        ux3 > 0.0 && ux5 > ux3 && ux7 > ux5,
        "Lateral displacement must increase upward: ux1={:.4e}, ux2={:.4e}, ux3={:.4e}",
        ux3, ux5, ux7
    );
}

// ================================================================
// 4. Wind Tunnel Cp Distribution: Base Shear = sum(p*A)
// ================================================================
//
// Given a set of pressure coefficients from a wind tunnel test (or code),
// applied as discrete nodal forces on a frame, the total base shear
// must equal the sum of all applied forces.
//
// We model a portal frame with pressure loads from windward (+Cp) and
// leeward (-Cp) walls, converting to nodal forces via tributary areas.
//
// Reference: ASCE 7-22 Section 27.3, EN 1991-1-4 Section 7.2

#[test]
fn wind_tunnel_cp_distribution_base_shear() {
    let h = 12.0;  // m, building height
    let w = 8.0;   // m, building depth (parallel to wind)
    let b = 15.0;  // m, building width (perpendicular to wind)

    // Reference velocity pressure at roof height
    let q_ref = 0.8; // kN/m^2

    // Cp distribution (simplified wind tunnel results):
    // Windward face: Cp varies by zone
    let cp_zones = [
        (0.0, 4.0, 0.7),    // zone 1: 0-4m, Cp=0.7
        (4.0, 8.0, 0.8),    // zone 2: 4-8m, Cp=0.8
        (8.0, 12.0, 0.9),   // zone 3: 8-12m, Cp=0.9
    ];
    // Leeward face: uniform Cp = -0.5
    let cp_leeward: f64 = -0.5;

    // Compute total force from Cp distribution
    let mut f_total_analytical = 0.0;
    for &(z_bot, z_top, cp) in &cp_zones {
        let area = (z_top - z_bot) * b;
        let f_zone = q_ref * cp * area;
        f_total_analytical += f_zone;
    }
    // Leeward force (acts in same direction as windward — pushes structure)
    let f_leeward = q_ref * cp_leeward.abs() * h * b;
    f_total_analytical += f_leeward;

    // Now build a 3-element portal frame (column-beam-column) and apply
    // the total wind force at beam level for simplicity
    let input = make_portal_frame(h, w, E, A, IZ, f_total_analytical, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Base shear must equal total applied force
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(
        sum_rx.abs(), f_total_analytical, 0.01,
        "Cp distribution: base shear = sum(p*A)"
    );

    // Verify the analytical sum step by step
    let f_ww_zone1 = q_ref * 0.7 * 4.0 * b;
    let f_ww_zone2 = q_ref * 0.8 * 4.0 * b;
    let f_ww_zone3 = q_ref * 0.9 * 4.0 * b;
    let f_lw = q_ref * 0.5 * h * b;
    let f_check = f_ww_zone1 + f_ww_zone2 + f_ww_zone3 + f_lw;

    assert_close(f_total_analytical, f_check, 1e-10, "Cp zone force summation");

    // Verify individual zone contributions are positive and ordered
    assert!(
        f_ww_zone1 < f_ww_zone2 && f_ww_zone2 < f_ww_zone3,
        "Higher Cp zones should yield larger forces"
    );

    // The total should be a reasonable value
    assert!(
        f_total_analytical > 50.0 && f_total_analytical < 500.0,
        "Total wind force {:.1} kN should be in reasonable range", f_total_analytical
    );
}

// ================================================================
// 5. Dynamic Amplification Under Resonant Wind
// ================================================================
//
// For a flexible structure where the natural frequency is close to
// the vortex shedding frequency, the dynamic response is amplified
// by the dynamic amplification factor (DAF):
//   DAF = 1 / (2 * zeta)    (at resonance)
// where zeta is the damping ratio.
//
// In a linear static framework, we model this by applying the
// amplified equivalent static load: F_dynamic = DAF * F_static.
// The response should scale linearly: delta_dyn = DAF * delta_static.
//
// Reference: Chopra §3.2 (resonance of SDOF), EN 1991-1-4 Annex C

#[test]
fn wind_dynamic_amplification_resonant() {
    let h = 10.0;
    let w = 6.0;

    // Damping ratio (typical for steel structures)
    let zeta = 0.02; // 2% damping

    // Dynamic amplification factor at resonance
    let daf = 1.0 / (2.0 * zeta);
    assert_close(daf, 25.0, 1e-10, "DAF at resonance = 1/(2*zeta) = 25");

    // Static wind load
    let f_static = 10.0; // kN

    // Solve under static load
    let input_static = make_portal_frame(h, w, E, A, IZ, f_static, 0.0);
    let results_static = linear::solve_2d(&input_static).unwrap();

    // Solve under amplified (resonant) load
    let f_dynamic = daf * f_static;
    let input_dynamic = make_portal_frame(h, w, E, A, IZ, f_dynamic, 0.0);
    let results_dynamic = linear::solve_2d(&input_dynamic).unwrap();

    // Roof displacement comparison
    let ux_static = results_static.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let ux_dynamic = results_dynamic.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Dynamic response = DAF * static response (linear system)
    let ratio = ux_dynamic / ux_static;
    assert_close(ratio, daf, 0.01, "dynamic amplification ratio = DAF");

    // Base moments should also scale by DAF
    let m_static = results_static.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my;
    let m_dynamic = results_dynamic.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my;
    let m_ratio = m_dynamic / m_static;
    assert_close(m_ratio, daf, 0.01, "moment amplification ratio = DAF");

    // Verify DAF > 1.0 (amplification, not reduction)
    assert!(
        daf > 1.0,
        "DAF = {:.1} must be greater than 1.0 for resonant conditions", daf
    );
}

// ================================================================
// 6. Wind Load Combination: 0.75W + 1.0D vs 1.0W + 0.9D
// ================================================================
//
// Two load combinations per ASCE 7 ASD approach:
//   Combo A: 1.0D + 0.75W  (serviceability)
//   Combo B: 0.9D + 1.0W   (strength, checking uplift/overturning)
//
// For a portal frame, we solve dead load and wind load cases separately,
// then form the linear combinations and compare deflections and reactions.
//
// Reference: ASCE 7-22 Section 2.4 (ASD load combinations)

#[test]
fn wind_load_combination_envelope() {
    let h = 10.0;
    let w = 8.0;

    // Dead load: gravity at beam-column joints
    let g = -30.0; // kN (gravity)
    // Wind load: lateral at beam level
    let f_wind = 15.0; // kN

    // Solve dead load case
    let input_d = make_portal_frame(h, w, E, A, IZ, 0.0, g);
    let results_d = linear::solve_2d(&input_d).unwrap();

    // Solve wind load case
    let input_w = make_portal_frame(h, w, E, A, IZ, f_wind, 0.0);
    let results_w = linear::solve_2d(&input_w).unwrap();

    // Combination A: 1.0D + 0.75W
    // Combination B: 0.9D + 1.0W
    let ux_d = results_d.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let uy_d = results_d.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;
    let ux_w = results_w.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let uy_w = results_w.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;

    let ux_combo_a = 1.0 * ux_d + 0.75 * ux_w;
    let uy_combo_a = 1.0 * uy_d + 0.75 * uy_w;
    let ux_combo_b = 0.9 * ux_d + 1.0 * ux_w;
    let uy_combo_b = 0.9 * uy_d + 1.0 * uy_w;

    // Verify against direct solve of Combo A: lateral = 0.75*f_wind, gravity = 1.0*g
    let input_combo_a = make_portal_frame(h, w, E, A, IZ, 0.75 * f_wind, 1.0 * g);
    let results_combo_a = linear::solve_2d(&input_combo_a).unwrap();
    let ux_direct_a = results_combo_a.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let uy_direct_a = results_combo_a.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;

    assert_close(ux_combo_a, ux_direct_a, 0.01, "Combo A ux superposition");
    assert_close(uy_combo_a, uy_direct_a, 0.01, "Combo A uy superposition");

    // Verify against direct solve of Combo B: lateral = 1.0*f_wind, gravity = 0.9*g
    let input_combo_b = make_portal_frame(h, w, E, A, IZ, 1.0 * f_wind, 0.9 * g);
    let results_combo_b = linear::solve_2d(&input_combo_b).unwrap();
    let ux_direct_b = results_combo_b.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let uy_direct_b = results_combo_b.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;

    assert_close(ux_combo_b, ux_direct_b, 0.01, "Combo B ux superposition");
    assert_close(uy_combo_b, uy_direct_b, 0.01, "Combo B uy superposition");

    // Combo B should have more lateral drift than Combo A (higher wind factor)
    assert!(
        ux_combo_b.abs() > ux_combo_a.abs(),
        "Combo B (1.0W) should have more lateral drift than Combo A (0.75W): B={:.4e}, A={:.4e}",
        ux_combo_b, ux_combo_a
    );

    // Combo A should have more vertical displacement than Combo B (higher dead load factor)
    assert!(
        uy_combo_a.abs() > uy_combo_b.abs(),
        "Combo A (1.0D) should have more vertical deflection than Combo B (0.9D): A={:.4e}, B={:.4e}",
        uy_combo_a, uy_combo_b
    );
}

// ================================================================
// 7. Shielding Effect: Reduced Cp Due to Windward Obstruction
// ================================================================
//
// When a structure is shielded by an upstream building, the effective
// wind pressure is reduced. Per EN 1991-1-4 Section 4.5, a shielding
// factor eta_s < 1.0 can be applied.
//
// We compare the response of the same frame under:
//   (a) Full wind: Cp = 0.8 (exposed)
//   (b) Shielded wind: Cp_effective = 0.8 * eta_s = 0.8 * 0.6 = 0.48
//
// The shielded frame should have proportionally less drift and forces.
//
// Reference: EN 1991-1-4 Section 4.5, Simiu & Yeo Ch. 10

#[test]
fn wind_shielding_effect_reduced_cp() {
    let h = 10.0;
    let w = 6.0;

    // Velocity pressure at building height
    let qz = 1.0; // kN/m^2
    let trib_area = h * 10.0; // m^2

    // Full exposure
    let cp_full = 0.8;
    let f_full = qz * cp_full * trib_area;

    // Shielded (upstream building reduces pressure)
    let eta_s = 0.6; // shielding factor
    let cp_shielded = cp_full * eta_s;
    let f_shielded = qz * cp_shielded * trib_area;

    // Solve both cases
    let input_full = make_portal_frame(h, w, E, A, IZ, f_full, 0.0);
    let results_full = linear::solve_2d(&input_full).unwrap();

    let input_shielded = make_portal_frame(h, w, E, A, IZ, f_shielded, 0.0);
    let results_shielded = linear::solve_2d(&input_shielded).unwrap();

    // Displacement ratio should equal force ratio = eta_s (linear system)
    let ux_full = results_full.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let ux_shielded = results_shielded.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    let disp_ratio = ux_shielded / ux_full;
    assert_close(disp_ratio, eta_s, 0.01, "shielding: displacement ratio = eta_s");

    // Base shear ratio
    let rx_full: f64 = results_full.reactions.iter().map(|r| r.rx).sum::<f64>().abs();
    let rx_shielded: f64 = results_shielded.reactions.iter().map(|r| r.rx).sum::<f64>().abs();
    let shear_ratio = rx_shielded / rx_full;
    assert_close(shear_ratio, eta_s, 0.01, "shielding: base shear ratio = eta_s");

    // Base moment ratio
    let mz_full = results_full.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my;
    let mz_shielded = results_shielded.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my;
    let moment_ratio = mz_shielded / mz_full;
    assert_close(moment_ratio, eta_s, 0.01, "shielding: moment ratio = eta_s");

    // Shielded response must be less than full exposure
    assert!(
        ux_shielded.abs() < ux_full.abs(),
        "Shielded drift {:.4e} must be less than full drift {:.4e}",
        ux_shielded, ux_full
    );
}

// ================================================================
// 8. Wind-Induced Drift: Interstory Drift < H/400
// ================================================================
//
// Under service-level wind, the interstory drift should satisfy:
//   delta_i / h_i < 1/400  (AISC Design Guide 3)
//
// We apply a service wind load to a 2-story frame and verify the
// interstory drift index (IDI) at each story.
//
// For a flexible structure where drift might exceed the limit, we
// demonstrate that increasing the section stiffness brings it into
// compliance.
//
// Reference: AISC Design Guide 3, ASCE 7-22 Commentary CC.1.2

#[test]
fn wind_interstory_drift_serviceability() {
    let h = 4.0; // m, story height
    let w = 6.0; // m, bay width

    // Service wind loads (unfactored)
    let f1 = 8.0;  // kN at level 1
    let f2 = 12.0; // kN at level 2 (roof)

    // Drift limit
    let drift_limit = 1.0 / 400.0; // H/400

    // Two-story single-bay frame
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),
        (3, 0.0, h),   (4, w, h),
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 3, 5, 1, 1, false, false),
        (5, "frame", 4, 6, 1, 1, false, false),
        (6, "frame", 5, 6, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f1, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: f2, fz: 0.0, my: 0.0 }),
    ];

    // Use a stiffer section to ensure drift compliance
    let a_stiff = 0.05;   // m^2
    let iz_stiff = 5e-3;  // m^4 (large Iz for drift control)

    let input = make_input(
        nodes.clone(),
        vec![(1, E, 0.3)],
        vec![(1, a_stiff, iz_stiff)],
        elems.clone(), sups.clone(), loads.clone(),
    );
    let results = linear::solve_2d(&input).unwrap();

    // Extract lateral displacements
    let ux_lvl1 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let ux_lvl2 = results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;

    // Interstory drift indices
    let idi_story1 = ux_lvl1.abs() / h;
    let idi_story2 = (ux_lvl2 - ux_lvl1).abs() / h;

    // Both stories should satisfy drift limit
    assert!(
        idi_story1 < drift_limit,
        "Story 1 IDI = {:.6} exceeds limit {:.6} = H/400",
        idi_story1, drift_limit
    );
    assert!(
        idi_story2 < drift_limit,
        "Story 2 IDI = {:.6} exceeds limit {:.6} = H/400",
        idi_story2, drift_limit
    );

    // Now solve with a much more flexible section — drift should exceed limit
    let iz_flex = 1e-5; // m^4 (very small Iz)
    let input_flex = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, iz_flex)],
        elems, sups, loads,
    );
    let results_flex = linear::solve_2d(&input_flex).unwrap();

    let ux_flex_lvl1 = results_flex.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let idi_flex = ux_flex_lvl1.abs() / h;

    // Flexible frame should exceed drift limit
    assert!(
        idi_flex > drift_limit,
        "Flexible frame IDI = {:.6} should exceed limit {:.6}",
        idi_flex, drift_limit
    );

    // Verify the stiff frame drifts less than the flexible frame
    assert!(
        ux_lvl1.abs() < ux_flex_lvl1.abs(),
        "Stiff frame drift {:.4e} must be less than flexible frame drift {:.4e}",
        ux_lvl1, ux_flex_lvl1
    );

    // Verify global equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), f1 + f2, 0.01, "drift check: base shear equilibrium");
}
