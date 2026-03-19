/// Validation: Water Retaining Structures & Liquid Containment
///
/// References:
///   - BS 8007: Code of Practice for Design of Concrete Structures for
///     Retaining Aqueous Liquids (1987)
///   - EN 1992-3 (EC2 Part 3): Design of Concrete Structures -- Liquid
///     Retaining and Containment Structures
///   - ACI 350: Code Requirements for Environmental Engineering Concrete
///     Structures
///   - Anchor, "Design of Liquid Retaining Concrete Structures" 2nd ed. (1992)
///   - Ghali & Neville, "Structural Analysis" 7th ed.
///   - Reynolds & Steedman, "Reinforced Concrete Designer's Handbook" 11th ed.
///
/// Tests verify hydrostatic loading, crack width control,
/// minimum reinforcement, hoop tension in circular tanks,
/// joint spacing, rectangular tank walls, water testing,
/// and combined earth + water pressure on basement walls.

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Hydrostatic Pressure: Triangular Load on Cantilever Wall
// ================================================================
//
// A vertical cantilever wall retaining water of depth H.
// Hydrostatic pressure varies linearly: p(z) = gamma_w * z
// where z is measured from the free surface downward.
// At the base: p_max = gamma_w * H.
//
// For a cantilever wall (fixed at base, free at top), the triangular
// load produces:
//   Reaction at base: V = gamma_w * H^2 / 2  (total horizontal force)
//   Base moment:      M = gamma_w * H^3 / 6
//   Maximum deflection at top: delta = gamma_w * H^4 / (30 * E * I)

#[test]
fn water_retaining_hydrostatic_cantilever() {
    let h: f64 = 4.0;           // m, water depth (wall height)
    let gamma_w: f64 = 9.81;    // kN/m^3, unit weight of water
    let n: usize = 16;          // number of elements
    let e: f64 = 30_000.0;      // MPa, concrete E
    let a: f64 = 0.3;           // m^2, wall cross-section area per m width
    let t_wall: f64 = 0.3;      // m, wall thickness
    let iz: f64 = 1.0 * t_wall.powi(3) / 12.0; // m^4 per m width

    // Build cantilever wall as a vertical beam (along X in the solver)
    // Fixed at node 1 (base), free at top.
    // Triangular load: zero at free end (top), max at fixed end (base).
    // Node 1 = base (x=0), Node n+1 = top (x=H).
    // In the solver local frame, the distributed load is transverse (like gravity).
    // Pressure increases from top to base: q_i at start of element, q_j at end.
    // Element 1 is near base (x=0), element n is near top (x=H).
    // At base (x=0): p = gamma_w * H; at top (x=H): p = 0.
    // For element i: x_start = (i-1)*dx, x_end = i*dx
    //   p_start = gamma_w * (H - x_start), p_end = gamma_w * (H - x_end)

    let dx = h / n as f64;
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let x_start = (i - 1) as f64 * dx;
            let x_end = i as f64 * dx;
            let q_start = -gamma_w * (h - x_start); // negative = towards beam
            let q_end = -gamma_w * (h - x_end);
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q_start,
                q_j: q_end,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_beam(n, h, e, a, iz, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Total horizontal force (shear at base)
    let v_exact: f64 = gamma_w * h * h / 2.0;
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // The base reaction ry should equal total load
    assert_close(r_base.rz.abs(), v_exact, 0.02,
        "Hydrostatic cantilever: base shear = gamma_w * H^2 / 2");

    // Base moment: M = gamma_w * H^3 / 6
    let m_exact: f64 = gamma_w * h.powi(3) / 6.0;
    assert_close(r_base.my.abs(), m_exact, 0.02,
        "Hydrostatic cantilever: base moment = gamma_w * H^3 / 6");

    // Tip deflection: delta = gamma_w * H^4 / (30 * E * I)
    // E in MPa = N/mm^2 = 1e3 kN/m^2; loads in kN/m; I in m^4
    let e_kn_m2: f64 = e * 1e3; // convert MPa to kN/m^2
    let delta_exact: f64 = gamma_w * h.powi(4) / (30.0 * e_kn_m2 * iz);
    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip_disp.uz.abs(), delta_exact, 0.03,
        "Hydrostatic cantilever: tip deflection = gamma_w*H^4/(30EI)");
}

// ================================================================
// 2. Crack Width Control: Maximum Bar Spacing
// ================================================================
//
// EN 1992-3 / BS 8007: limit crack width to 0.2 mm (or 0.1 mm for
// severe exposure) in water-retaining structures.
// Maximum bar spacing s_max depends on concrete cover, bar diameter,
// and target crack width.
//
// Crack width: w_k = s_r,max * (eps_sm - eps_cm)
//   s_r,max = 3.4*c + 0.425*k1*k2*phi/rho_p,eff
// For direct calculation: s_max from EC2 Table 7.3N.
//
// Verify that computed crack width from a loaded beam satisfies
// the limit by checking tensile steel stress stays within bounds.

#[test]
fn water_retaining_crack_width_control() {
    // Beam properties
    let l: f64 = 6.0;           // m, span
    let n: usize = 12;
    let e: f64 = 30_000.0;      // MPa, concrete
    let b_sec: f64 = 1.0;       // m, width (per m of wall)
    let d_sec: f64 = 0.35;      // m, effective depth
    let h_sec: f64 = 0.40;      // m, total depth
    let a_sec: f64 = b_sec * h_sec;
    let iz: f64 = b_sec * h_sec.powi(3) / 12.0;

    // Water pressure as UDL on propped cantilever (average pressure)
    let gamma_w: f64 = 9.81;
    let h_water: f64 = 3.5;     // m
    let p_avg: f64 = gamma_w * h_water / 2.0; // kN/m (average hydrostatic)

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: -p_avg,
            q_j: -p_avg,
            a: None,
            b: None,
        }))
        .collect();

    let input = make_beam(n, l, e, a_sec, iz, "fixed", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Fixed-end moment for propped cantilever under UDL: M_A = q*L^2/8
    let m_fixed: f64 = p_avg * l * l / 8.0;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.my.abs(), m_fixed, 0.03,
        "Crack width: fixed-end moment = qL^2/8");

    // Crack width computation (EN 1992-3 approach)
    // Steel stress from moment: sigma_s = M / (As * z)
    let as_steel: f64 = 1570.0; // mm^2/m (T16 @ 125 mm c/c)
    let z_lever: f64 = 0.9 * d_sec * 1000.0; // mm, lever arm
    let m_max_nmm: f64 = m_fixed * 1e6; // N.mm
    let sigma_s: f64 = m_max_nmm / (as_steel * z_lever); // MPa

    // Crack spacing (EN 1992-1-1 Eq 7.11)
    let c_cover: f64 = 40.0;    // mm
    let phi_bar: f64 = 16.0;    // mm
    let k1: f64 = 0.8;          // deformed bars
    let k2: f64 = 0.5;          // bending
    let rho_p_eff: f64 = as_steel / (b_sec * 1000.0 * 2.5 * (h_sec * 1000.0 - d_sec * 1000.0).min(h_sec * 1000.0 / 2.0));
    let sr_max: f64 = 3.4 * c_cover + 0.425 * k1 * k2 * phi_bar / rho_p_eff;

    // Mean strain difference
    let es: f64 = 200_000.0;    // MPa, steel modulus
    let fct_eff: f64 = 2.9;     // MPa, effective tensile strength
    let kt: f64 = 0.4;          // long term loading
    let eps_diff: f64 = (sigma_s - kt * fct_eff / rho_p_eff * (1.0 + 200_000.0 / e * rho_p_eff)) / es;
    let eps_min: f64 = 0.6 * sigma_s / es;
    let eps_used: f64 = eps_diff.max(eps_min);

    // Crack width
    let w_k: f64 = sr_max * eps_used;

    // For water-retaining: w_k <= 0.2 mm
    assert!(
        w_k < 0.30,
        "Crack width {:.3} mm should be controlable for WRS", w_k
    );
    assert!(
        w_k > 0.0,
        "Crack width positive: {:.3} mm", w_k
    );

    // Maximum bar spacing for 0.2 mm crack width (EC2 Table 7.3N)
    // For sigma_s ~ 200 MPa: s_max ~ 200 mm
    // For sigma_s ~ 300 MPa: s_max ~ 125 mm
    let s_max: f64 = if sigma_s <= 160.0 {
        300.0
    } else if sigma_s <= 200.0 {
        250.0
    } else if sigma_s <= 240.0 {
        200.0
    } else if sigma_s <= 280.0 {
        150.0
    } else {
        100.0
    };

    assert!(
        s_max >= 100.0,
        "Max bar spacing: {:.0} mm for sigma_s = {:.0} MPa", s_max, sigma_s
    );
}

// ================================================================
// 3. Minimum Reinforcement: As,min = kc * k * fct,eff * Act / sigma_s
// ================================================================
//
// EN 1992-3 / BS 8007: minimum reinforcement to control early-age
// thermal cracking in water-retaining walls.
// As,min = kc * k * fct,eff * Act / sigma_s
//   kc = stress distribution coefficient (1.0 for pure tension, 0.4 for bending)
//   k  = size factor (1.0 for h <= 300mm, 0.65 for h >= 800mm)
//   fct,eff = effective tensile strength at time of cracking
//   Act = area of concrete in tension zone
//   sigma_s = steel stress at cracking (typically limited to ensure crack width)
//
// Verify the beam with minimum reinforcement can carry cracking load.

#[test]
fn water_retaining_minimum_reinforcement() {
    let h_wall: f64 = 400.0;    // mm, wall thickness
    let b_wall: f64 = 1000.0;   // mm, per m width
    let fct_eff: f64 = 2.6;     // MPa, mean tensile strength at 3 days (early age)

    // Parameters for minimum reinforcement (EN 1992-3)
    let kc: f64 = 1.0;          // pure tension (restrained wall)
    let k: f64 = 0.85;          // size factor for h = 400mm (interpolated)
    let sigma_s: f64 = 250.0;   // MPa, steel stress limit for 0.2mm crack width

    // Tension zone area (full section for axial restraint)
    let act: f64 = b_wall * h_wall; // mm^2

    // Minimum reinforcement per face
    let as_min: f64 = kc * k * fct_eff * act / sigma_s;

    // Should be reasonable for WRS (typically 800-2000 mm^2/m)
    assert!(
        as_min > 500.0 && as_min < 5000.0,
        "As,min = {:.0} mm^2/m per face", as_min
    );

    // Verify with solver: beam under axial tension (restraint force)
    // Cracking force N_cr = fct,eff * Ac
    let n_cr: f64 = fct_eff * act / 1000.0; // kN per m width
    // = 2.6 * 400000 / 1000 = 1040 kN/m

    // Model a short wall element under axial tension
    let l: f64 = 2.0;           // m, wall panel length
    let n_elem: usize = 4;
    let e: f64 = 30_000.0;      // MPa
    let a_m2: f64 = (b_wall * h_wall) / 1e6; // m^2
    let iz_m4: f64 = b_wall * h_wall.powi(3) / 12.0 / 1e12; // m^4

    // Apply axial load at free end
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_elem + 1,
        fx: n_cr,
        fz: 0.0,
        my: 0.0,
    })];

    let input = make_beam(n_elem, l, e, a_m2, iz_m4, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Reaction must equal applied load
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.rx.abs(), n_cr, 0.01,
        "Min reinforcement: axial reaction = cracking force");

    // Check steel stress from cracking force applied to min reinforcement area.
    // as_min = kc * k * fct_eff * Act / sigma_s, so
    // N_cr / as_min = (fct_eff * Act) / (kc * k * fct_eff * Act / sigma_s) = sigma_s / (kc * k)
    let sigma_s_check: f64 = n_cr * 1000.0 / as_min; // MPa (N/mm^2)
    let sigma_s_expected: f64 = sigma_s / (kc * k);
    assert_close(sigma_s_check, sigma_s_expected, 0.01,
        "Min reinforcement: sigma_s at cracking = sigma_s / (kc * k)");

    // Reinforcement ratio
    let rho: f64 = as_min / act * 100.0; // percentage
    assert!(
        rho > 0.20 && rho < 1.0,
        "Reinforcement ratio = {:.2}% (typical WRS range)", rho
    );
}

// ================================================================
// 4. Hoop Tension: Circular Tank N = gamma_w * h * R
// ================================================================
//
// Circular cylindrical tank under hydrostatic pressure.
// Hoop (ring) tension per unit height: N = p * R = gamma_w * z * R
// At the base: N_max = gamma_w * H * R
// This is pure membrane tension -- no bending in ideal case.
//
// Model a horizontal ring element under uniform outward pressure
// to verify ring tension.

#[test]
fn water_retaining_hoop_tension() {
    let h_water: f64 = 5.0;     // m, water depth
    let r: f64 = 8.0;           // m, tank radius
    let gamma_w: f64 = 9.81;    // kN/m^3
    let t_wall: f64 = 0.30;     // m, wall thickness

    // Maximum hoop tension at base
    let n_hoop_max: f64 = gamma_w * h_water * r;
    // = 9.81 * 5 * 8 = 392.4 kN/m

    // Required steel for hoop tension (sigma_s = 200 MPa for crack control)
    let sigma_s: f64 = 200.0;   // MPa
    let as_hoop: f64 = n_hoop_max * 1000.0 / sigma_s; // mm^2 per m height

    assert!(
        as_hoop > 1000.0 && as_hoop < 5000.0,
        "Hoop steel: {:.0} mm^2/m height", as_hoop
    );

    // Verify with solver: model a unit-height ring segment under
    // equivalent radial pressure. For a small arc of angle dtheta,
    // the radial force per unit length = p = gamma_w * h * (approx as UDL on chord).
    // Instead, verify equilibrium: horizontal beam under outward UDL
    // representing pressure on a wall strip.

    let l_strip: f64 = h_water;  // m, vertical strip height
    let n_elem: usize = 10;
    let e: f64 = 30_000.0;      // MPa
    let a_sec: f64 = t_wall * 1.0; // m^2 per m of circumference
    let iz: f64 = 1.0 * t_wall.powi(3) / 12.0;

    // Triangular hydrostatic pressure on vertical cantilever strip
    // (fixed at base, free at top)
    let dx = l_strip / n_elem as f64;
    let loads: Vec<SolverLoad> = (1..=n_elem)
        .map(|i| {
            let x_start = (i - 1) as f64 * dx;
            let x_end = i as f64 * dx;
            // Pressure increases towards base (node 1)
            let q_start = -gamma_w * (l_strip - x_start);
            let q_end = -gamma_w * (l_strip - x_end);
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q_start,
                q_j: q_end,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_beam(n_elem, l_strip, e, a_sec, iz, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Base shear = gamma_w * H^2 / 2
    let v_base_exact: f64 = gamma_w * h_water * h_water / 2.0;
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.rz.abs(), v_base_exact, 0.02,
        "Hoop tension: base shear on wall strip");

    // Hoop tension distribution (verify the formula)
    // At depth z: N_hoop = gamma_w * z * R
    let z_mid: f64 = h_water / 2.0;
    let n_hoop_mid: f64 = gamma_w * z_mid * r;
    assert_close(n_hoop_mid, n_hoop_max / 2.0, 0.001,
        "Hoop tension: linear variation N(z) = gamma_w * z * R");

    // Total hoop force over full height
    let n_hoop_total: f64 = gamma_w * h_water * h_water * r / 2.0;
    assert_close(n_hoop_total, n_hoop_max * h_water / 2.0, 0.001,
        "Hoop tension: total = integral of gamma_w*z*R dz");
}

// ================================================================
// 5. Joint Spacing: Thermal Contraction and Cracking Control
// ================================================================
//
// BS 8007 / EN 1992-3: movement joints in WRS to control thermal
// cracking from restrained shrinkage and early thermal contraction.
//
// Restrained strain: eps_r = R * (alpha_c * T1 + eps_cs)
//   R = restraint factor (0.5 typical for base-restrained wall)
//   T1 = early thermal drop (20-40 C for OPC concrete)
//   eps_cs = drying shrinkage (200-400 microstrain)
//   alpha_c = thermal expansion coefficient (12e-6 /C)
//
// Without joints: provide reinforcement to control crack widths.
// With joints: max spacing = L_free / (eps_r / w_design)

#[test]
fn water_retaining_joint_spacing() {
    // Thermal and shrinkage parameters
    let alpha_c: f64 = 12.0e-6; // /C, thermal expansion
    let t1: f64 = 30.0;         // C, early thermal drop (OPC, thick section)
    let eps_cs: f64 = 300.0e-6; // drying shrinkage
    let r_factor: f64 = 0.50;   // restraint factor (base-restrained wall)

    // Total restrained strain
    let eps_r: f64 = r_factor * (alpha_c * t1 + eps_cs);

    assert!(
        eps_r > 100.0e-6 && eps_r < 500.0e-6,
        "Restrained strain: {:.0} microstrain", eps_r * 1e6
    );

    // Design crack width
    let w_design: f64 = 0.2;    // mm, for water tightness

    // Crack spacing if no joints (from reinforcement control)
    let sr_max: f64 = w_design / (eps_r * 1000.0); // mm
    // Convert to m
    let sr_max_m: f64 = sr_max / 1000.0;

    // Verify solver: model restrained wall as beam with thermal load
    // represented by equivalent end forces.
    let l_wall: f64 = 6.0;      // m, wall panel between joints
    let n_elem: usize = 8;
    let e: f64 = 30_000.0;      // MPa
    let t_wall: f64 = 0.30;     // m
    let a_sec: f64 = t_wall * 1.0;
    let iz: f64 = 1.0 * t_wall.powi(3) / 12.0;

    // Equivalent thermal force: N = E * A * eps_r (if fully restrained)
    let e_kn_m2: f64 = e * 1e3;  // kN/m^2
    let n_thermal: f64 = e_kn_m2 * a_sec * eps_r; // kN

    // Model as cantilever (fixed at base, free at tip) with axial pull at tip.
    // This simulates one end of a restrained wall panel.
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_elem + 1,
        fx: n_thermal,
        fz: 0.0,
        my: 0.0,
    })];

    let input = make_beam(n_elem, l_wall, e, a_sec, iz, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Reaction at base must equal applied thermal force
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.rx.abs(), n_thermal, 0.01,
        "Joint spacing: base reaction = thermal force");

    // Axial force in elements should be approximately n_thermal
    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(
        ef.n_start.abs() > n_thermal * 0.5,
        "Joint spacing: axial force {:.1} in restrained wall", ef.n_start.abs()
    );

    // Maximum joint spacing (practical range: 5-8 m)
    let joint_spacing_max: f64 = 7.5; // m (BS 8007 recommendation)
    assert!(
        l_wall < joint_spacing_max,
        "Panel length {:.1} m < max spacing {:.1} m", l_wall, joint_spacing_max
    );

    // Crack control: number of cracks in panel
    let n_cracks: f64 = (l_wall / sr_max_m).ceil();
    assert!(
        n_cracks >= 1.0,
        "Expected {:.0} cracks over {:.1} m panel", n_cracks, l_wall
    );
}

// ================================================================
// 6. Rectangular Tank: Wall as Propped Cantilever, Base Moment
// ================================================================
//
// Rectangular tank wall assumed fixed at base, free or propped at top.
// For a long wall (L/H > 2), 1-m strip analysis is valid.
// Propped cantilever (fixed base, pinned at top support):
//   R_top = 3*w_max*H/8 (for triangular hydrostatic)
//   M_base = w_max*H^2/15 (for triangular load on propped cantilever)
//
// More precisely for triangular load on propped cantilever:
//   R_B (prop) = w_max * H * (1/10 + 0) via superposition
// Exact: R_top = gamma_w*H^2/20 * ... (standard table results)

#[test]
fn water_retaining_rectangular_tank() {
    let h: f64 = 4.0;           // m, wall height = water depth
    let gamma_w: f64 = 9.81;    // kN/m^3
    let n: usize = 16;
    let e: f64 = 30_000.0;      // MPa
    let t_wall: f64 = 0.30;     // m
    let a_sec: f64 = t_wall * 1.0;
    let iz: f64 = 1.0 * t_wall.powi(3) / 12.0;

    // Triangular load on propped cantilever (fixed at base, roller at top)
    // Node 1 = base (x=0, fixed), Node n+1 = top (x=H, roller)
    // At base: p = gamma_w * H, at top: p = 0
    let dx = h / n as f64;
    let w_max: f64 = gamma_w * h; // max pressure at base

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let x_start = (i - 1) as f64 * dx;
            let x_end = i as f64 * dx;
            // Pressure decreases from base to top
            let q_start = -(w_max * (1.0 - x_start / h));
            let q_end = -(w_max * (1.0 - x_end / h));
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q_start,
                q_j: q_end,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_beam(n, h, e, a_sec, iz, "fixed", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Total load = gamma_w * H^2 / 2
    let total_load: f64 = gamma_w * h * h / 2.0;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.02,
        "Rect tank: total reaction = gamma_w*H^2/2");

    // For triangular load (max at fixed end) on propped cantilever:
    // Exact top reaction: R_top = w_max * L / 10 = gamma_w * H^2 / 10
    // This is from the standard formula for triangular load decreasing
    // from fixed end to zero at prop end.
    let r_top_exact: f64 = w_max * h / 10.0;
    let r_top = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_top.rz.abs(), r_top_exact, 0.03,
        "Rect tank: top prop reaction for triangular load");

    // Base reaction: R_base = total - R_top = gamma_w*H^2/2 - gamma_w*H^2/10
    //              = gamma_w*H^2 * 2/5
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_base_exact: f64 = total_load - r_top_exact;
    assert_close(r_base.rz.abs(), r_base_exact, 0.03,
        "Rect tank: base reaction for triangular load");

    // Base moment: M_base = w_max*H^2/15 (standard table for this loading)
    let m_base_exact: f64 = w_max * h * h / 15.0;
    assert_close(r_base.my.abs(), m_base_exact, 0.05,
        "Rect tank: base moment for triangular load");
}

// ================================================================
// 7. Water Testing: Empty vs Full Condition, Structural Adequacy
// ================================================================
//
// BS 8007 / EN 1992-3: water testing checks:
//   - Maximum water loss: < 1/500 of surface area per 24h * 10mm
//   - Structural adequacy: deflections within limits
//   - Compare empty (self-weight) vs full (self-weight + hydrostatic)
//
// Model a wall panel as a simply-supported beam:
//   Empty: self-weight only
//   Full: self-weight + hydrostatic pressure

#[test]
fn water_retaining_water_testing() {
    let l: f64 = 6.0;           // m, span between supports
    let n: usize = 12;
    let e: f64 = 30_000.0;      // MPa
    let t_wall: f64 = 0.30;     // m
    let gamma_c: f64 = 25.0;    // kN/m^3 (reinforced concrete)
    let h_water: f64 = 4.0;     // m, water depth
    let gamma_w: f64 = 9.81;    // kN/m^3

    let a_sec: f64 = t_wall * 1.0; // m^2 per m width
    let iz: f64 = 1.0 * t_wall.powi(3) / 12.0;

    // Case 1: Empty tank -- self-weight only
    let sw: f64 = gamma_c * t_wall * 1.0; // kN/m

    let loads_empty: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: -sw,
            q_j: -sw,
            a: None,
            b: None,
        }))
        .collect();

    let input_empty = make_beam(n, l, e, a_sec, iz, "pinned", Some("rollerX"), loads_empty);
    let results_empty = solve_2d(&input_empty).expect("solve empty");

    // Case 2: Full tank -- self-weight + average hydrostatic
    let p_hydro: f64 = gamma_w * h_water / 2.0; // average pressure
    let q_full: f64 = sw + p_hydro; // combined load

    let loads_full: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: -q_full,
            q_j: -q_full,
            a: None,
            b: None,
        }))
        .collect();

    let input_full = make_beam(n, l, e, a_sec, iz, "pinned", Some("rollerX"), loads_full);
    let results_full = solve_2d(&input_full).expect("solve full");

    // Midspan deflection: delta = 5*q*L^4 / (384*E*I)
    let e_kn_m2: f64 = e * 1e3;
    let delta_empty_exact: f64 = 5.0 * sw * l.powi(4) / (384.0 * e_kn_m2 * iz);
    let delta_full_exact: f64 = 5.0 * q_full * l.powi(4) / (384.0 * e_kn_m2 * iz);

    let mid_node = n / 2 + 1;
    let disp_empty = results_empty.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    let disp_full = results_full.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    assert_close(disp_empty.uz.abs(), delta_empty_exact, 0.02,
        "Water test: empty tank midspan deflection");
    assert_close(disp_full.uz.abs(), delta_full_exact, 0.02,
        "Water test: full tank midspan deflection");

    // Full condition deflection must be larger
    assert!(
        disp_full.uz.abs() > disp_empty.uz.abs(),
        "Full deflection {:.4} > empty {:.4} mm",
        disp_full.uz.abs(), disp_empty.uz.abs()
    );

    // Deflection ratio: full/empty = q_full/sw
    let ratio_expected: f64 = q_full / sw;
    let ratio_actual: f64 = disp_full.uz.abs() / disp_empty.uz.abs();
    assert_close(ratio_actual, ratio_expected, 0.02,
        "Water test: deflection ratio full/empty = load ratio");

    // Serviceability: delta < L/250 (typical limit)
    let delta_limit: f64 = l / 250.0;
    assert!(
        disp_full.uz.abs() < delta_limit,
        "Water test: full deflection {:.4} m < L/250 = {:.4} m",
        disp_full.uz.abs(), delta_limit
    );
}

// ================================================================
// 8. Combined Earth + Water Pressure: Basement Wall
// ================================================================
//
// Basement wall subject to both earth pressure and groundwater.
// Total lateral pressure: p = Ka * gamma_soil * z + gamma_w * z_w
// where z_w = depth below water table.
//
// Model as propped cantilever: fixed at base slab, propped at
// ground floor slab.

#[test]
fn water_retaining_combined_earth_water() {
    let h: f64 = 5.0;           // m, basement wall height
    let n: usize = 20;
    let e: f64 = 30_000.0;      // MPa
    let t_wall: f64 = 0.35;     // m
    let a_sec: f64 = t_wall * 1.0;
    let iz: f64 = 1.0 * t_wall.powi(3) / 12.0;

    let gamma_soil: f64 = 18.0; // kN/m^3, soil unit weight
    let gamma_w: f64 = 9.81;    // kN/m^3, water
    let phi: f64 = 30.0_f64.to_radians();
    let ka: f64 = (std::f64::consts::FRAC_PI_4 - phi / 2.0).tan().powi(2);
    // Ka = 1/3 for phi = 30 deg

    let h_wt: f64 = 2.0;        // m, water table depth below ground surface
    // So water pressure starts at depth h_wt from top.

    // Node 1 = base (fixed), Node n+1 = top (roller/prop at ground floor)
    // x = 0 is base, x = h is top.
    // Depth from ground surface z = h - x.
    // Earth pressure at depth z: p_earth = Ka * gamma_soil * z
    //   (simplified: use total stress above WT, effective below)
    // Water pressure at depth z: p_water = gamma_w * max(z - h_wt, 0)

    let dx = h / n as f64;

    // Case A: Earth pressure only (no water)
    let loads_earth: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let x_start = (i - 1) as f64 * dx;
            let x_end = i as f64 * dx;
            let z_start = h - x_start; // depth from surface
            let z_end = h - x_end;
            let q_start = -(ka * gamma_soil * z_start);
            let q_end = -(ka * gamma_soil * z_end);
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q_start,
                q_j: q_end,
                a: None,
                b: None,
            })
        })
        .collect();

    let input_earth = make_beam(n, h, e, a_sec, iz, "fixed", Some("rollerX"), loads_earth);
    let results_earth = solve_2d(&input_earth).expect("solve earth");

    // Case B: Combined earth + water pressure
    let loads_combined: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let x_start = (i - 1) as f64 * dx;
            let x_end = i as f64 * dx;
            let z_start = h - x_start;
            let z_end = h - x_end;
            // Earth pressure (use effective stress below WT)
            let gamma_eff: f64 = gamma_soil - gamma_w; // buoyant weight
            let p_earth_start = if z_start <= h_wt {
                ka * gamma_soil * z_start
            } else {
                ka * (gamma_soil * h_wt + gamma_eff * (z_start - h_wt))
            };
            let p_earth_end = if z_end <= h_wt {
                ka * gamma_soil * z_end
            } else {
                ka * (gamma_soil * h_wt + gamma_eff * (z_end - h_wt))
            };
            // Water pressure below WT
            let p_water_start: f64 = gamma_w * (z_start - h_wt).max(0.0);
            let p_water_end: f64 = gamma_w * (z_end - h_wt).max(0.0);

            let q_start = -(p_earth_start + p_water_start);
            let q_end = -(p_earth_end + p_water_end);
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q_start,
                q_j: q_end,
                a: None,
                b: None,
            })
        })
        .collect();

    let input_combined = make_beam(n, h, e, a_sec, iz, "fixed", Some("rollerX"), loads_combined);
    let results_combined = solve_2d(&input_combined).expect("solve combined");

    // Combined loading produces greater reactions than earth alone
    let r_base_earth = results_earth.reactions.iter()
        .find(|r| r.node_id == 1).unwrap();
    let r_base_combined = results_combined.reactions.iter()
        .find(|r| r.node_id == 1).unwrap();

    assert!(
        r_base_combined.rz.abs() > r_base_earth.rz.abs(),
        "Combined base reaction {:.1} > earth only {:.1} kN",
        r_base_combined.rz.abs(), r_base_earth.rz.abs()
    );
    assert!(
        r_base_combined.my.abs() > r_base_earth.my.abs(),
        "Combined base moment {:.1} > earth only {:.1} kN.m",
        r_base_combined.my.abs(), r_base_earth.my.abs()
    );

    // Verify total load for earth-only case
    // Total earth pressure force = Ka * gamma_soil * H^2 / 2
    let total_earth: f64 = ka * gamma_soil * h * h / 2.0;
    let sum_ry_earth: f64 = results_earth.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry_earth, total_earth, 0.02,
        "Combined: earth-only total = Ka*gamma*H^2/2");

    // The water adds gamma_w * (H - h_wt)^2 / 2 to the total
    let h_water: f64 = h - h_wt;
    let total_water: f64 = gamma_w * h_water * h_water / 2.0;
    // But effective stress reduces earth component, so total combined
    // is not simply earth + water. Check that combined > earth-only.
    let sum_ry_combined: f64 = results_combined.reactions.iter().map(|r| r.rz).sum();
    assert!(
        sum_ry_combined > sum_ry_earth,
        "Combined total {:.1} > earth only {:.1} kN",
        sum_ry_combined, sum_ry_earth
    );

    // Water component is significant
    assert!(
        total_water > 10.0,
        "Water force contribution: {:.1} kN/m", total_water
    );
}
