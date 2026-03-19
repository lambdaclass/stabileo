/// Validation: Cold-Formed Steel Design — Extended Topics
///
/// References:
///   - AISI S100-16: North American Specification for Cold-Formed Steel
///   - EN 1993-1-3:2006 (EC3-1-3): Cold-formed members and sheeting
///   - Yu & LaBoube: "Cold-Formed Steel Design" 5th ed. (2020), Ch. 4-7
///   - Schafer: "Direct Strength Method Design Guide" (2006)
///   - Hancock: "Cold-Formed Steel Structures to AS/NZS 4600" (2007)
///   - Pekoz: "Design of Cold-Formed Steel Screw Connections" (1990)
///   - Rondal & Dubina: "Light Gauge Metal Structures Recent Advances" (2005)
///
/// Tests verify web crippling, DSM column capacity, shear buckling,
/// hat-section purlin analysis, tension member net section, CFS truss
/// behavior, thermal bridging stiffness, and effective section modulus.
///
/// Unit convention: lengths in m, forces in kN, E in MPa.
/// Solver internally uses E_eff = E * 1000 (kN/m^2).

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// E in MPa. Solver internally multiplies by 1000 to get kN/m^2.
const E: f64 = 203_000.0;
// Section properties in m^2 and m^4 (consistent with kN, m units)
const A: f64 = 6.0e-4;    // m^2 (600 mm^2)
const IZ: f64 = 5.0e-7;   // m^4 (5.0e5 mm^4)

/// Effective E in kN/m^2 (for analytical formulas).
const E_EFF: f64 = E * 1000.0;

// ================================================================
// 1. Web Crippling — Interior One-Flange Loading (AISI S100 C3.4)
// ================================================================
//
// Web crippling capacity for interior one-flange (IOF) loading:
//   Pn = C * t^2 * Fy * sin(theta) * (1 - C_R * sqrt(R/t))
//        * (1 + C_N * sqrt(N/t)) * (1 - C_h * sqrt(h/t))
//
// Reference: AISI S100-16, Section C3.4, Table C3.4.1-2
//   C  = 13.0 (IOF, fastened to support)
//   C_R = 0.23, C_N = 0.14, C_h = 0.01
//
// Verify that web crippling capacity decreases with increasing
// web height-to-thickness ratio. Then verify the solver produces
// correct interior reaction for a 2-span continuous beam.

#[test]
fn cfs_web_crippling_iof() {
    // All dimensions in mm for the crippling formula (standard practice)
    let t: f64 = 1.5;         // mm
    let fz: f64 = 350.0;      // MPa
    let theta: f64 = 90.0_f64.to_radians();
    let r: f64 = 3.0;         // mm, inside bend radius
    let n: f64 = 50.0;        // mm, bearing length
    let c: f64 = 13.0;
    let c_r: f64 = 0.23;
    let c_n: f64 = 0.14;
    let c_h: f64 = 0.01;

    let h1: f64 = 150.0;      // mm
    let h2: f64 = 250.0;      // mm (deeper section)

    let pn_1: f64 = c * t * t * fz * theta.sin()
        * (1.0 - c_r * (r / t).sqrt())
        * (1.0 + c_n * (n / t).sqrt())
        * (1.0 - c_h * (h1 / t).sqrt());

    let pn_2: f64 = c * t * t * fz * theta.sin()
        * (1.0 - c_r * (r / t).sqrt())
        * (1.0 + c_n * (n / t).sqrt())
        * (1.0 - c_h * (h2 / t).sqrt());

    // Deeper web => lower crippling capacity
    assert!(
        pn_2 < pn_1,
        "Web crippling: h=250 Pn={:.1}N < h=150 Pn={:.1}N", pn_2, pn_1
    );

    // Capacity should be positive and in 1-20 kN range
    assert!(
        pn_1 > 1000.0 && pn_1 < 20000.0,
        "Pn(h=150) = {:.0} N, expected 1-20 kN range", pn_1
    );

    // Verify with solver: 2-span continuous beam, check interior reaction
    // Interior reaction for 2-span continuous beam under UDL: R = 1.25*w*L
    let l: f64 = 3.0;     // m
    let n_elems = 8;
    let w: f64 = -10.0;   // kN/m (downward)

    let input = make_continuous_beam(
        &[l, l],
        n_elems / 2,
        E,
        A,
        IZ,
        (0..n_elems)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: w,
                q_j: w,
                a: None,
                b: None,
            }))
            .collect(),
    );

    let results = linear::solve_2d(&input).unwrap();

    let mid_node = n_elems / 2 + 1;
    let r_mid = results.reactions.iter()
        .find(|r| r.node_id == mid_node)
        .unwrap();

    // R_interior = 1.25 * |w| * L
    let r_expected: f64 = 1.25 * w.abs() * l;
    assert_close(r_mid.rz, r_expected, 0.03, "Interior reaction (web crippling check)");
}

// ================================================================
// 2. DSM Column — Local-Global Interaction (Schafer, 2006)
// ================================================================
//
// Direct Strength Method for columns:
//   Pne = Pcre-based nominal (global buckling)
//   Pnl = Pne * (1 - 0.15*(Pcrl/Pne)^0.4) * (Pcrl/Pne)^0.4
//   Pnd = Py  * (1 - 0.25*(Pcrd/Py)^0.6)  * (Pcrd/Py)^0.6
//
// Reference: AISI S100-16 Appendix 2, DSM for columns
// Verify capacity ratios and that local-global interaction reduces
// capacity below the global buckling strength.

#[test]
fn cfs_dsm_column_local_global() {
    let fz: f64 = 345.0;      // MPa
    let ag: f64 = 480.0;      // mm^2
    let py: f64 = fz * ag / 1000.0; // kN = 165.6

    // Global buckling (flexural)
    let pcre: f64 = 120.0;    // kN
    let lambda_c: f64 = (py / pcre).sqrt();

    // AISI S100 global column curve
    let pne: f64 = if lambda_c <= 1.5 {
        py * (0.658_f64).powf(lambda_c * lambda_c)
    } else {
        py * 0.877 / (lambda_c * lambda_c)
    };

    assert!(pne < py, "Pne = {:.1} kN < Py = {:.1} kN", pne, py);

    // Local buckling interaction with global
    let pcrl: f64 = 0.8 * pne;
    let lambda_l: f64 = (pne / pcrl).sqrt();

    let pnl: f64 = if lambda_l <= 0.776 {
        pne
    } else {
        let ratio: f64 = pcrl / pne;
        pne * (1.0 - 0.15 * ratio.powf(0.4)) * ratio.powf(0.4)
    };

    assert!(pnl < pne, "Pnl = {:.2} kN < Pne = {:.2} kN", pnl, pne);

    // Distortional buckling
    let pcrd: f64 = 0.5 * py;
    let lambda_d: f64 = (py / pcrd).sqrt();

    let pnd: f64 = if lambda_d <= 0.561 {
        py
    } else {
        let ratio: f64 = pcrd / py;
        py * (1.0 - 0.25 * ratio.powf(0.6)) * ratio.powf(0.6)
    };

    assert!(pnd < py, "Pnd = {:.2} kN < Py = {:.2} kN", pnd, py);

    // Governing capacity = minimum of all modes
    let pn: f64 = pnl.min(pnd);
    let utilization: f64 = pn / py;

    assert!(
        utilization > 0.2 && utilization < 0.8,
        "Pn/Py = {:.3}", utilization
    );
}

// ================================================================
// 3. Shear Buckling of CFS Webs (AISI S100, C3.2)
// ================================================================
//
// Shear buckling stress:
//   Fcr_v = k_v * pi^2 * E / (12*(1-nu^2)) * (t/h)^2
//   k_v = 5.34 + 4.0*(h/a)^2  for a/h >= 1
//
// Reference: Yu & LaBoube, "Cold-Formed Steel Design", 5th Ed., Ch. 4.3
// Verify shear capacity and compare to solver shear forces.

#[test]
fn cfs_shear_buckling_web() {
    // Dimensions in mm for plate buckling formula
    let t: f64 = 1.2;
    let h: f64 = 200.0;
    let a: f64 = 600.0;
    let nu: f64 = 0.3;
    let fz: f64 = 350.0;
    let e_mpa: f64 = 203_000.0;

    // Shear buckling coefficient
    let ratio_ah: f64 = a / h;
    let k_v: f64 = if ratio_ah >= 1.0 {
        5.34 + 4.0 * (h / a).powi(2)
    } else {
        4.0 + 5.34 * (h / a).powi(2)
    };

    let fcr_v: f64 = k_v * std::f64::consts::PI.powi(2) * e_mpa
        / (12.0 * (1.0 - nu * nu)) * (t / h).powi(2);

    assert!(fcr_v > 0.0, "Critical shear stress: {:.1} MPa", fcr_v);

    let fy_v: f64 = fz / (3.0_f64).sqrt();

    let lambda_v: f64 = (fy_v / fcr_v).sqrt();
    let vn_ratio: f64 = if lambda_v <= 0.815 {
        1.0
    } else if lambda_v <= 1.227 {
        0.815 / lambda_v
    } else {
        fcr_v / fy_v
    };

    assert!(
        vn_ratio > 0.0 && vn_ratio <= 1.0,
        "Vn/Vy ratio = {:.3}", vn_ratio
    );

    // Verify using solver: SS beam with midspan point load -> V = P/2
    let beam_l: f64 = 4.0;   // m
    let p: f64 = -50.0;      // kN downward
    let n_elems = 4;
    let mid_node = n_elems / 2 + 1;

    let input = make_beam(
        n_elems,
        beam_l,
        E,
        A,
        IZ,
        "pinned",
        Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node,
            fx: 0.0,
            fz: p,
            my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    let ef1 = results.element_forces.iter()
        .find(|ef| ef.element_id == 1)
        .unwrap();

    let v_expected: f64 = p.abs() / 2.0;
    assert_close(ef1.v_start.abs(), v_expected, 0.02, "Shear in first element");
}

// ================================================================
// 4. Hat-Section Purlin Under Gravity (Hancock, 2007)
// ================================================================
//
// Hat-section purlins are common in CFS roofing. Under gravity
// loading the bottom flange is in compression.
//
// Reference: Hancock, "Cold-Formed Steel Structures to AS/NZS 4600",
//   Ch. 5.3
//
// Model a simply-supported purlin and verify deflection and moments:
//   delta_max = 5*q*L^4 / (384*E_eff*I)
//   M_max = q*L^2 / 8

#[test]
fn cfs_hat_section_purlin_gravity() {
    // Hat section properties in m units
    let a_hat: f64 = 4.35e-4;  // m^2 (435 mm^2)
    let iz_hat: f64 = 3.8e-7;  // m^4 (3.8e5 mm^4)

    let span: f64 = 5.0;       // m
    let w: f64 = -1.5;         // kN/m (gravity)
    let n_elems = 8;

    // Analytical formulas (E_eff in kN/m^2)
    let m_max_exact: f64 = w.abs() * span * span / 8.0;            // kN-m
    let delta_exact: f64 = 5.0 * w.abs() * span.powi(4) / (384.0 * E_EFF * iz_hat); // m

    let loads: Vec<SolverLoad> = (0..n_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: w,
            q_j: w,
            a: None,
            b: None,
        }))
        .collect();

    let input = make_beam(n_elems, span, E, a_hat, iz_hat, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check midspan deflection
    let mid_node = n_elems / 2 + 1;
    let mid_d = results.displacements.iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();

    assert_close(mid_d.uz.abs(), delta_exact, 0.05, "Hat purlin midspan deflection");

    // Check maximum moment at midspan
    let mid_elem = n_elems / 2;
    let ef = results.element_forces.iter()
        .find(|ef| ef.element_id == mid_elem)
        .unwrap();

    assert_close(ef.m_end.abs(), m_max_exact, 0.05, "Hat purlin midspan moment");

    // LTB check: Mn = Sf * Fy if fully braced
    let fz: f64 = 500.0;   // MPa (G500 steel)
    let _sf: f64 = iz_hat / 0.05 * 1e6; // mm^3: I(m^4)/y(m) -> m^3, *1e9 -> mm^3
    // Actually: Se = I/y in m^3, Mn = Se * fy (MPa) = Se(m^3)*fy(N/m^2*1e6)
    // Simpler: Mn(kN-m) = I(m^4)/(h/2)(m) * fy(MPa) * 1000
    let mn_braced: f64 = iz_hat / 0.05 * fz * 1000.0; // kN-m
    let demand_ratio: f64 = m_max_exact / mn_braced;
    assert!(
        demand_ratio > 0.0 && demand_ratio < 5.0,
        "Demand/capacity = {:.3}", demand_ratio
    );
}

// ================================================================
// 5. Tension Member — Net Section Capacity (AISI S100 C2)
// ================================================================
//
// Tensile capacity of CFS members with holes:
//   Pn = Ae * Fu  (fracture on net section)
//   Ae = An * U   (effective net area with shear lag)
//   An = Ag - n_holes * d_hole * t
//
// Reference: AISI S100-16 C2, Yu & LaBoube Ch. 7.2
// Verify with solver: axial bar in tension, delta = PL / (E_eff * A).

#[test]
fn cfs_tension_member_net_section() {
    // Dimensions in mm for net section calculation
    let ag: f64 = 750.0;      // mm^2
    let t: f64 = 1.5;         // mm
    let fz: f64 = 350.0;      // MPa
    let fu: f64 = 450.0;      // MPa

    let n_holes: f64 = 2.0;
    let d_hole: f64 = 14.0;   // mm (12mm bolt + 2mm clearance)

    let an: f64 = ag - n_holes * d_hole * t;
    // = 750 - 2*14*1.5 = 750 - 42 = 708 mm^2

    let u: f64 = 0.75;        // shear lag factor

    let ae: f64 = an * u;
    // = 708 * 0.75 = 531 mm^2

    // Capacity modes
    let pn_yield: f64 = ag * fz / 1000.0;   // kN, yielding on gross section
    let pn_fracture: f64 = ae * fu / 1000.0; // kN, fracture on net section

    // Net section fracture should be less than gross yielding
    assert!(
        pn_fracture < pn_yield,
        "Fracture {:.1} kN < yield {:.1} kN", pn_fracture, pn_yield
    );

    // Net section efficiency
    let efficiency: f64 = ae / ag;
    assert!(
        efficiency > 0.3 && efficiency < 1.0,
        "Net section efficiency Ae/Ag = {:.3}", efficiency
    );

    // Verify with solver: simple tension bar in m/kN units
    let bar_l: f64 = 2.0;          // m
    let a_bar: f64 = ag * 1e-6;    // m^2 (from mm^2)
    let p_applied: f64 = 50.0;     // kN tension

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, bar_l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, a_bar, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, true, true)], // truss element
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: p_applied,
            fz: 0.0,
            my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // delta = P*L / (E_eff * A)
    let delta_expected: f64 = p_applied * bar_l / (E_EFF * a_bar);
    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(tip.ux, delta_expected, 0.01, "Tension bar axial deformation");
}

// ================================================================
// 6. CFS Truss — Roof Truss Panel Points (Rondal & Dubina, 2005)
// ================================================================
//
// Light-gauge CFS trusses use double-hinged frame elements.
// For a simple triangle truss with vertical load at the apex,
// member forces follow method-of-joints statics.
//
// Reference: Rondal & Dubina, "Light Gauge Metal Structures", Ch. 8
//   Hibbeler, "Structural Analysis", 10th Ed., truss problems
//
// Triangle: base 4m, height 2m, loaded at apex.

#[test]
fn cfs_roof_truss_panel() {
    let p: f64 = 30.0; // kN at apex

    // Triangle truss: nodes 1(0,0), 2(4,0), 3(2,2)
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 2.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, true), // bottom chord
            (2, "frame", 1, 3, 1, 1, true, true), // left diagonal
            (3, "frame", 2, 3, 1, 1, true, true), // right diagonal
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // All moments must be zero (truss behavior)
    for ef in &results.element_forces {
        assert_close(ef.m_start, 0.0, 0.01, &format!("truss elem {} m_start", ef.element_id));
        assert_close(ef.m_end, 0.0, 0.01, &format!("truss elem {} m_end", ef.element_id));
    }

    // Reactions: symmetric triangle => R1y = R2y = P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.rz, p / 2.0, 0.01, "R1y");
    assert_close(r2.rz, p / 2.0, 0.01, "R2y");

    // Method of joints at node 1:
    // Left diagonal: length = sqrt(2^2 + 2^2) = 2*sqrt(2) = 2.828 m
    // sin(theta) = 2/2.828 = 0.7071
    // At node 1: Ry + F_diag * sin(theta) = 0
    // F_diag = -(P/2) / sin(theta)  (compression in diagonal)
    let diag_len: f64 = (2.0_f64.powi(2) + 2.0_f64.powi(2)).sqrt();
    let sin_theta: f64 = 2.0 / diag_len;
    let f_diag_expected: f64 = (p / 2.0) / sin_theta; // magnitude

    let ef2 = results.element_forces.iter()
        .find(|ef| ef.element_id == 2)
        .unwrap();

    assert_close(ef2.n_start.abs(), f_diag_expected, 0.02, "Left diagonal axial force");

    // Bottom chord tension: F_bottom = F_diag * cos(theta) = (P/2)/tan(theta)
    let cos_theta: f64 = 2.0 / diag_len;
    let f_bottom_expected: f64 = f_diag_expected * cos_theta;

    let ef1 = results.element_forces.iter()
        .find(|ef| ef.element_id == 1)
        .unwrap();

    assert_close(ef1.n_start.abs(), f_bottom_expected, 0.02, "Bottom chord axial force");
}

// ================================================================
// 7. Thermal Bridging — Reduced Stiffness (EN 1993-1-3, Annex C)
// ================================================================
//
// CFS studs in walls create thermal bridges. Thermal breaks
// reduce effective moment of inertia for structural analysis.
//
// Reference: EN 1993-1-3:2006, Annex C
//
// For a cantilever stud with tip load: delta = PL^3 / (3*E_eff*I).
// Reduced I should give proportionally larger deflection (1/alpha).

#[test]
fn cfs_thermal_bridging_stiffness() {
    let stud_l: f64 = 3.0;     // m (3m wall height)
    let p: f64 = -2.0;         // kN, lateral wind load at tip
    let a_stud: f64 = 3.5e-4;  // m^2 (350 mm^2)
    let iz_full: f64 = 2.5e-7; // m^4 (2.5e5 mm^4)

    let alpha: f64 = 0.80;
    let iz_reduced: f64 = iz_full * alpha;

    // Analytical cantilever tip deflection: delta = P*L^3 / (3*E_eff*I)
    let delta_full: f64 = p.abs() * stud_l.powi(3) / (3.0 * E_EFF * iz_full);
    let delta_reduced: f64 = p.abs() * stud_l.powi(3) / (3.0 * E_EFF * iz_reduced);

    // Reduced I => larger deflection
    assert!(
        delta_reduced > delta_full,
        "Reduced I deflection {:.6} > full {:.6} m", delta_reduced, delta_full
    );

    // Ratio should equal 1/alpha
    let ratio: f64 = delta_reduced / delta_full;
    assert_close(ratio, 1.0 / alpha, 0.001, "Deflection ratio = 1/alpha");

    // Verify full-I case with solver
    let n_elems = 4;
    let input = make_beam(
        n_elems,
        stud_l,
        E,
        a_stud,
        iz_full,
        "fixed",
        None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_elems + 1,
            fx: 0.0,
            fz: p,
            my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n_elems + 1)
        .unwrap();

    assert_close(tip.uz.abs(), delta_full, 0.05, "Cantilever stud deflection (full I)");

    // Verify reduced-I case with solver
    let input_red = make_beam(
        n_elems,
        stud_l,
        E,
        a_stud,
        iz_reduced,
        "fixed",
        None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_elems + 1,
            fx: 0.0,
            fz: p,
            my: 0.0,
        })],
    );

    let results_red = linear::solve_2d(&input_red).unwrap();
    let tip_red = results_red.displacements.iter()
        .find(|d| d.node_id == n_elems + 1)
        .unwrap();

    assert_close(tip_red.uz.abs(), delta_reduced, 0.05, "Cantilever stud deflection (reduced I)");

    // Solver ratio should match analytical ratio
    let solver_ratio: f64 = tip_red.uz.abs() / tip.uz.abs();
    assert_close(solver_ratio, 1.0 / alpha, 0.05, "Solver deflection ratio matches 1/alpha");
}

// ================================================================
// 8. Effective Section Modulus — Iterative (AISI S100, B2.1)
// ================================================================
//
// For CFS beams, the effective section modulus Se depends on
// compression flange effective width (Winter's formula).
//
// Reference: AISI S100-16, Section B2.1, Examples 1-2
//   Yu & LaBoube, Ch. 4, Example 4.1
//
// Verify that effective width ratio decreases with slenderness,
// and that a solver beam using effective I gives expected deflection.

#[test]
fn cfs_effective_section_modulus_iteration() {
    let fz: f64 = 350.0;      // MPa
    let k: f64 = 4.0;         // buckling coefficient for SS edges
    let e_mpa: f64 = 203_000.0;

    // Section 1: thick flange
    let b1: f64 = 60.0;       // mm
    let t1: f64 = 2.0;        // mm
    let lambda1: f64 = (b1 / t1) / (1.052 * k.sqrt()) * (fz / e_mpa).sqrt();
    let rho1: f64 = if lambda1 <= 0.673 {
        1.0
    } else {
        (1.0 - 0.22 / lambda1) / lambda1
    };

    // Section 2: thin flange
    let t2: f64 = 1.0;        // mm
    let lambda2: f64 = (b1 / t2) / (1.052 * k.sqrt()) * (fz / e_mpa).sqrt();
    let rho2: f64 = if lambda2 <= 0.673 {
        1.0
    } else {
        (1.0 - 0.22 / lambda2) / lambda2
    };

    // Thinner plate => higher slenderness => lower effective width ratio
    assert!(
        lambda2 > lambda1,
        "lambda_thin={:.3} > lambda_thick={:.3}", lambda2, lambda1
    );
    assert!(
        rho2 < rho1,
        "rho_thin={:.3} < rho_thick={:.3}", rho2, rho1
    );

    // Simplified flange-dominated I: I ~ 2*b*t*(h/2)^2
    let h: f64 = 150.0;       // mm, total depth

    // Effective I: replace b with be = rho * b
    let i_eff_1: f64 = 2.0 * (rho1 * b1) * t1 * (h / 2.0).powi(2); // mm^4
    let i_eff_2: f64 = 2.0 * (rho2 * b1) * t2 * (h / 2.0).powi(2); // mm^4

    // Effective section modulus: Se = Ie / (h/2)
    let se_1: f64 = i_eff_1 / (h / 2.0); // mm^3
    let se_2: f64 = i_eff_2 / (h / 2.0); // mm^3

    assert!(se_2 < se_1, "Se_thin = {:.0} < Se_thick = {:.0} mm^3", se_2, se_1);

    // Moment capacity: Mn = Se * Fy
    let mn_1: f64 = se_1 * fz / 1e6; // kN-m
    let mn_2: f64 = se_2 * fz / 1e6; // kN-m

    assert!(mn_2 < mn_1, "Mn_thin = {:.2} < Mn_thick = {:.2} kN-m", mn_2, mn_1);

    // Verify with solver: SS beam, check deflection with effective I
    // delta = 5*q*L^4 / (384*E_eff*I_eff)
    let span: f64 = 4.0;      // m
    let q: f64 = -5.0;        // kN/m
    let n_elems = 8;

    // Convert I_eff from mm^4 to m^4
    let i_eff_m4: f64 = i_eff_1 * 1e-12;

    let loads: Vec<SolverLoad> = (0..n_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }))
        .collect();

    let input = make_beam(
        n_elems,
        span,
        E,
        A,
        i_eff_m4,
        "pinned",
        Some("rollerX"),
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    let mid_node = n_elems / 2 + 1;
    let mid_d = results.displacements.iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();

    let delta_expected: f64 = 5.0 * q.abs() * span.powi(4) / (384.0 * E_EFF * i_eff_m4);
    assert_close(mid_d.uz.abs(), delta_expected, 0.05, "SS beam deflection with effective I");
}
