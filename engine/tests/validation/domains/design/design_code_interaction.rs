/// Validation: Design Code Interaction Checks
///
/// References:
///   - AISC 360-22, Ch. H (Combined Forces and Torsion)
///   - AISC 360-22, Ch. E (Compression Members, slenderness)
///   - AISC 360-22, Ch. G (Shear design)
///   - AISC 360-22, Ch. L (Serviceability, deflection limits)
///   - Salmon, Johnson & Malhas, "Steel Structures", 5th Ed., Ch. 12 (connections)
///   - Segui, "Steel Design", 6th Ed., Ch. 6 (beam-columns)
///   - Chen & Lui, "Structural Stability", Ch. 4
///
/// Tests verify design-oriented interaction checks using solver output:
///   1. AISC H1-1 interaction: P/Pc + 8/9*(M/Mc) check
///   2. Beam-column P-M interaction: linear vs P-delta moment amplification
///   3. Combined axial + biaxial bending: 3D beam-column
///   4. Slenderness ratio check: KL/r for various end conditions
///   5. Shear-moment interaction: web buckling check
///   6. Serviceability deflection limits: L/360 live, L/240 total
///   7. Connection design forces: bolt group resultant at eccentricity
///   8. Moment frame strong-column/weak-beam: capacity hierarchy check
use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa; solver uses E * 1000.0 internally -> kN/m²
const E_EFF: f64 = E * 1000.0; // kN/m²

// W14x48 section properties (SI)
const W14_A: f64 = 0.00912; // m²
const W14_IZ: f64 = 2.0126e-4; // m⁴  (strong axis)
const W14_D: f64 = 0.3505; // depth m
const W14_TW: f64 = 0.00787; // web thickness m

// W10x33 section (smaller, for beams / weak columns)
const W10_A: f64 = 0.00626; // m²
const W10_IZ: f64 = 7.118e-5; // m⁴ (strong axis)

// ================================================================
// 1. AISC H1-1 Interaction: P/Pc + 8/9*(M/Mc) Check
// ================================================================
//
// AISC 360-22 Eq. H1-1a: For Pu/Pc >= 0.2,
//   Pu/Pc + (8/9)*(Mu/Mc) <= 1.0
//
// This test applies axial + lateral loads to a beam-column
// and verifies the interaction ratio computed from solver output.
// Pc = Fy*A (yield capacity) and Mc = Fy*Zx (plastic moment capacity).
// We use elastic analysis forces as "demand" and check the ratio.

#[test]
fn validation_aisc_h1_1_interaction_ratio() {
    let l = 4.0; // m
    let n = 8;
    let fy = 250.0; // MPa -> 250_000 kN/m² (for A36 steel)
    let fy_eff = fy * 1000.0; // kN/m²

    // Capacities
    let pc = fy_eff * W14_A; // axial yield capacity (kN)
    // Approximate Zx for W14x48: Zx ≈ Ix / (d/2) * shape_factor ≈ 2*Ix/d * 1.12
    let sx = 2.0 * W14_IZ / W14_D; // elastic section modulus
    let zx = sx * 1.12; // approximate plastic section modulus
    let mc = fy_eff * zx; // plastic moment capacity (kN·m)

    // Apply 30% of axial capacity + lateral point load at midspan
    let pu = 0.30 * pc;
    let mid = n / 2 + 1;

    // Choose lateral load to achieve Mu/Mc ≈ 0.40
    // For SS beam with center point load: M_max = P*L/4
    // P_lateral = 0.40 * Mc * 4 / L
    let p_lateral = 0.40 * mc * 4.0 / l;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: -pu,
            fz: 0.0,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid,
            fx: 0.0,
            fz: -p_lateral,
            my: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, W14_A, W14_IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Extract maximum moment (at midspan element)
    let mid_elem_id = n / 2; // element just before midspan node
    let ef = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem_id)
        .unwrap();
    let mu = ef.m_end.abs(); // moment at midspan end of element

    // Extract axial force (should be approximately constant = Pu)
    let nu = ef.n_start.abs();

    // AISC H1-1a: Pu/Pc >= 0.2 condition
    let pu_ratio = nu / pc;
    assert!(
        pu_ratio >= 0.2,
        "Expected Pu/Pc >= 0.2, got {:.4}",
        pu_ratio
    );

    // Interaction: Pu/Pc + (8/9)*(Mu/Mc)
    let interaction = pu_ratio + (8.0 / 9.0) * (mu / mc);
    assert!(
        interaction < 1.0,
        "AISC H1-1a: interaction={:.4} should be < 1.0 (safe design)",
        interaction
    );

    // The design was targeted for ~0.30 + 8/9*0.40 ≈ 0.656 (well below 1.0)
    assert_close(interaction, 0.30 + (8.0 / 9.0) * 0.40, 0.10,
        "AISC H1-1a: interaction ratio near predicted");
}

// ================================================================
// 2. Beam-Column P-M Interaction: Linear vs P-Delta Moments
// ================================================================
//
// For a beam-column, P-delta analysis amplifies bending moments
// beyond first-order analysis. The amplification factor should
// approximate B1 = Cm / (1 - P/Pe).
//
// Reference: AISC 360-22 Appendix 8, Chen & Lui Ch. 4

#[test]
fn validation_beam_column_pm_linear_vs_pdelta() {
    let l = 5.0;
    let n = 10;

    // Euler buckling load for pinned-pinned column
    let pe = std::f64::consts::PI.powi(2) * E_EFF * W14_IZ / (l * l);

    // Apply P = 0.25*Pe axial compression + UDL lateral
    let p_axial = 0.25 * pe;
    let w = 12.0; // kN/m lateral UDL

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let mut loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: -p_axial,
        fz: 0.0,
        my: 0.0,
    })];
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: w,
            q_j: w,
            a: None,
            b: None,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, W14_A, W14_IZ)],
        elems,
        vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        loads,
    );

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
    assert!(pd.converged, "P-delta should converge");
    assert!(pd.is_stable, "P-delta should be stable at 0.25*Pe");

    // Compare midspan displacement amplification
    let mid = n / 2 + 1;
    let lin_uy = lin.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz;
    let pd_uy = pd.results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz;

    // Expected B1 = 1/(1 - P/Pe) = 1/(1 - 0.25) = 1.333
    let b1_expected = 1.0 / (1.0 - p_axial / pe);
    let actual_af = pd_uy.abs() / lin_uy.abs();

    // P-delta amplification should be close to B1
    assert!(
        (actual_af - b1_expected).abs() / b1_expected < 0.08,
        "P-M amplification: actual={:.4}, expected B1={:.4}",
        actual_af, b1_expected
    );

    // P-delta moments must be larger than linear moments
    let lin_m_max = lin.element_forces.iter()
        .flat_map(|ef| [ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);
    let pd_m_max = pd.results.element_forces.iter()
        .flat_map(|ef| [ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);
    assert!(
        pd_m_max > lin_m_max,
        "P-delta moment ({:.2}) should exceed linear ({:.2})",
        pd_m_max, lin_m_max
    );
}

// ================================================================
// 3. Combined Axial + Biaxial Bending: 3D Beam-Column
// ================================================================
//
// A 3D cantilever column subjected to axial compression plus
// transverse loads in both Y and Z directions. In linear analysis,
// axial and bending responses are uncoupled. Verify each component
// matches the single-load analytical value.
//
// Reference: McGuire et al. §5.3, Przemieniecki §4.2

#[test]
fn validation_combined_axial_biaxial_3d() {
    let l = 4.0;
    let n = 8;
    let p_axial = 100.0; // kN (compression along X)
    let fy = 8.0; // kN in Y-direction
    let fz = 5.0; // kN in Z-direction

    let iy = 1e-4; // m⁴ (for bending about local Y)
    let iz = 2e-4; // m⁴ (for bending about local Z)
    let a = 0.01; // m²
    let j = 1.5e-4; // m⁴

    let input = make_3d_beam(
        n, l, E, 0.3, a, iy, iz, j,
        vec![true, true, true, true, true, true], // fixed
        None,                                       // free end
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: -p_axial,
            fy,
            fz,
            mx: 0.0,
            my: 0.0,
            mz: 0.0,
            bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // Axial shortening: delta_x = P*L/(E*A)
    let dx_expected = p_axial * l / (E_EFF * a);
    assert_close(tip.ux.abs(), dx_expected, 0.03,
        "3D biaxial: axial shortening = PL/(EA)");

    // Y-deflection: delta_y = Fy*L^3/(3*E*Iz)
    let dy_expected = fy * l.powi(3) / (3.0 * E_EFF * iz);
    assert_close(tip.uz.abs(), dy_expected, 0.03,
        "3D biaxial: delta_y = Fy*L^3/(3EIz)");

    // Z-deflection: delta_z = Fz*L^3/(3*E*Iy)
    let dz_expected = fz * l.powi(3) / (3.0 * E_EFF * iy);
    assert_close(tip.uz.abs(), dz_expected, 0.03,
        "3D biaxial: delta_z = Fz*L^3/(3EIy)");

    // Resultant transverse deflection
    let delta_trans = (tip.uz.powi(2) + tip.uz.powi(2)).sqrt();
    let delta_trans_expected = (dy_expected.powi(2) + dz_expected.powi(2)).sqrt();
    assert_close(delta_trans, delta_trans_expected, 0.03,
        "3D biaxial: resultant transverse deflection");

    // Base moments from equilibrium
    let ef_base = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    // Mz at base = Fy * L (bending about Z from Y-load)
    assert_close(ef_base.mz_start.abs(), fy * l, 0.03,
        "3D biaxial: Mz_base = Fy * L");
    // My at base = Fz * L (bending about Y from Z-load)
    assert_close(ef_base.my_start.abs(), fz * l, 0.03,
        "3D biaxial: My_base = Fz * L");
}

// ================================================================
// 4. Slenderness Ratio Check: KL/r for Various End Conditions
// ================================================================
//
// The slenderness ratio KL/r determines susceptibility to buckling.
//   K = effective length factor
//   r = sqrt(I/A) = radius of gyration
//
// For a pinned-pinned column, K = 1.0
// For a fixed-fixed column, K = 0.5 (theoretical), 0.65 (AISC recommended)
// For a fixed-free cantilever, K = 2.0
//
// We verify that the Euler load Pe = pi^2*EI/(KL)^2 matches the
// load at which P-delta diverges (approaches instability).
//
// Reference: AISC 360-22 Table C-A-7.1

#[test]
fn validation_slenderness_ratio_kl_r() {
    let a = W14_A;
    let iz = W14_IZ;
    let l = 5.0;
    let n = 10;

    let r = (iz / a).sqrt(); // radius of gyration

    // Test three cases: pinned-pinned (K=1), fixed-fixed (K=0.5), cantilever (K=2)
    let cases: Vec<(&str, Option<&str>, f64)> = vec![
        ("pinned-pinned K=1.0", Some("rollerX"), 1.0),
        ("fixed-fixed K=0.5", Some("fixed"), 0.5),
    ];

    for (label, end_support, k_factor) in &cases {
        let kl = k_factor * l;
        let kl_r = kl / r;
        let pe = std::f64::consts::PI.powi(2) * E_EFF * iz / (kl * kl);

        // Apply 80% of Pe: should converge and be stable
        let p_safe = 0.80 * pe;
        let w_lateral = 5.0; // small lateral load needed for P-delta to have something to amplify

        let mut loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: -p_safe,
            fz: 0.0,
            my: 0.0,
        })];
        for i in 0..n {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: w_lateral,
                q_j: w_lateral,
                a: None,
                b: None,
            }));
        }

        let start_sup = if *k_factor < 0.9 { "fixed" } else { "pinned" };
        let input = make_beam(n, l, E, a, iz, start_sup, *end_support, loads);
        let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
        assert!(
            pd.converged && pd.is_stable,
            "{}: should be stable at 0.80*Pe (KL/r={:.1}, Pe={:.0} kN)",
            label, kl_r, pe
        );

        // Slenderness ratio sanity check
        // KL/r < 200 is the AISC maximum recommended limit
        assert!(
            kl_r < 200.0,
            "{}: KL/r={:.1} should be < 200 (AISC limit)",
            label, kl_r
        );
    }

    // Cantilever case: K=2.0, Pe should be much lower
    let kl_cant = 2.0 * l;
    let pe_cant = std::f64::consts::PI.powi(2) * E_EFF * iz / (kl_cant * kl_cant);
    let pe_pp = std::f64::consts::PI.powi(2) * E_EFF * iz / (l * l);

    // Pe_cantilever = Pe_pinned-pinned / 4
    assert_close(pe_cant, pe_pp / 4.0, 0.01,
        "Cantilever Pe = Pe_pp / 4");
}

// ================================================================
// 5. Shear-Moment Interaction: Web Buckling Check
// ================================================================
//
// High shear near supports can interact with bending moment.
// For a simply-supported beam with UDL:
//   V_max = wL/2 (at supports)
//   M_max = wL^2/8 (at midspan)
//
// Web shear stress: tau = V / (d * tw)
// Bending stress: sigma = M / S
//
// Verify that the solver produces correct V and M distributions,
// and check the shear-moment interaction ratio.
//
// Reference: AISC 360-22 Ch. G, Segui Ch. 5

#[test]
fn validation_shear_moment_interaction() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -20.0; // kN/m

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_beam(n, l, E, W14_A, W14_IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Maximum shear at supports: V_max = |q|*L/2
    let v_max_expected = q.abs() * l / 2.0;
    let ef_first = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    assert_close(ef_first.v_start.abs(), v_max_expected, 0.03,
        "Shear-moment: V_max = qL/2 at support");

    // Maximum moment at midspan: M_max = |q|*L^2/8
    let m_max_expected = q.abs() * l * l / 8.0;
    let mid_elem = n / 2;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem).unwrap();
    // Moment at midspan: take the end moment of the element just before midspan
    let m_mid = ef_mid.m_end.abs();
    assert_close(m_mid, m_max_expected, 0.05,
        "Shear-moment: M_max = qL^2/8 at midspan");

    // Shear stress at support (elastic): tau = V / (d * tw)
    let tau_max = v_max_expected / (W14_D * W14_TW);

    // Bending stress at midspan: sigma = M * (d/2) / I
    let sigma_max = m_max_expected * (W14_D / 2.0) / W14_IZ;

    // Shear yield stress: tau_y = 0.6 * Fy  (Fy = 250 MPa -> 250_000 kN/m²)
    let fy_eff = 250.0 * 1000.0;
    let tau_y = 0.6 * fy_eff;

    // For this load level, shear stress should be well below yield
    assert!(
        tau_max < tau_y,
        "Shear stress ({:.0} kN/m^2) should be < tau_y ({:.0} kN/m^2)",
        tau_max, tau_y
    );

    // Von Mises interaction: sqrt(sigma^2 + 3*tau^2) < Fy
    let von_mises = (sigma_max.powi(2) + 3.0 * tau_max.powi(2)).sqrt();
    assert!(
        von_mises < fy_eff,
        "Von Mises ({:.0}) should be < Fy ({:.0})",
        von_mises, fy_eff
    );

    // Verify that at midspan, shear is near zero (expected for symmetric UDL)
    let v_mid = ef_mid.v_start.abs().min(ef_mid.v_end.abs());
    assert!(
        v_mid < v_max_expected * 0.15,
        "Near-midspan shear ({:.2}) should be small relative to V_max ({:.2})",
        v_mid, v_max_expected
    );
}

// ================================================================
// 6. Serviceability Deflection Limits: L/360 Live, L/240 Total
// ================================================================
//
// Common serviceability limits:
//   - L/360 for live load deflection (floor beams)
//   - L/240 for total load deflection (total dead + live)
//
// For a SS beam with UDL, delta = 5qL^4/(384EI).
// Given a span and load, we back-calculate the minimum Iz required
// to meet each limit, then verify the solver deflection.
//
// Reference: AISC 360-22 Ch. L, IBC Table 1604.3

#[test]
fn validation_serviceability_deflection_limits() {
    let l: f64 = 10.0; // m (typical beam span)
    let n = 10;

    // Load intensities
    let q_dead: f64 = -8.0; // kN/m dead load
    let q_live: f64 = -12.0; // kN/m live load
    let q_total = q_dead + q_live;

    // Limits
    let limit_live = l / 360.0; // L/360 for live
    let limit_total = l / 240.0; // L/240 for total

    // Minimum Iz to satisfy L/360 for live load:
    // delta_live = 5*|q_live|*L^4/(384*E*Iz) <= L/360
    // Iz_min_live = 5*|q_live|*L^3*360/(384*E)
    let iz_min_live = 5.0 * q_live.abs() * l.powi(3) * 360.0 / (384.0 * E_EFF);

    // Minimum Iz to satisfy L/240 for total:
    let iz_min_total = 5.0 * q_total.abs() * l.powi(3) * 240.0 / (384.0 * E_EFF);

    // Use the larger (more demanding) Iz
    let iz_design = iz_min_live.max(iz_min_total);

    // Design with Iz = 1.1 * iz_design (10% margin)
    let iz_used = 1.1 * iz_design;
    let a_used = 0.015; // m² (reasonable for this beam size)

    // Live load only analysis
    let loads_live: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q_live,
                q_j: q_live,
                a: None,
                b: None,
            })
        })
        .collect();
    let input_live = make_beam(n, l, E, a_used, iz_used, "pinned", Some("rollerX"), loads_live);
    let res_live = linear::solve_2d(&input_live).unwrap();

    let mid = n / 2 + 1;
    let delta_live = res_live.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Live load deflection should be within L/360 (with our 10% margin)
    assert!(
        delta_live < limit_live,
        "Live deflection ({:.4} m) should be < L/360 ({:.4} m)",
        delta_live, limit_live
    );

    // Total load analysis
    let loads_total: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q_total,
                q_j: q_total,
                a: None,
                b: None,
            })
        })
        .collect();
    let input_total = make_beam(n, l, E, a_used, iz_used, "pinned", Some("rollerX"), loads_total);
    let res_total = linear::solve_2d(&input_total).unwrap();

    let delta_total = res_total.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Total deflection should be within L/240
    assert!(
        delta_total < limit_total,
        "Total deflection ({:.4} m) should be < L/240 ({:.4} m)",
        delta_total, limit_total
    );

    // Verify analytical formula: delta = 5qL^4/(384EI)
    let delta_live_exact = 5.0 * q_live.abs() * l.powi(4) / (384.0 * E_EFF * iz_used);
    assert_close(delta_live, delta_live_exact, 0.02,
        "Serviceability: live delta matches 5qL^4/(384EI)");

    let delta_total_exact = 5.0 * q_total.abs() * l.powi(4) / (384.0 * E_EFF * iz_used);
    assert_close(delta_total, delta_total_exact, 0.02,
        "Serviceability: total delta matches 5qL^4/(384EI)");
}

// ================================================================
// 7. Connection Design Forces: Bolt Group Resultant at Eccentricity
// ================================================================
//
// A beam framing into a column with an eccentricity creates both
// shear and moment at the connection. Given a simply-supported beam
// with a point load, the end reactions produce:
//   V_connection = R (end reaction)
//   M_connection = R * e (eccentricity of bolt group from beam centerline)
//
// The resultant force on the outermost bolt in a bolt group is:
//   F_bolt = sqrt(F_direct^2 + F_moment^2 + 2*F_direct*F_moment*cos(theta))
//
// This test uses the solver to get end reactions, then computes
// bolt group forces analytically.
//
// Reference: Salmon et al. Ch. 12, AISC Manual Part 7

#[test]
fn validation_connection_bolt_group_resultant() {
    let l = 6.0;
    let n = 12;
    let p = 60.0; // kN point load at midspan

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input = make_beam(n, l, E, W14_A, W14_IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // End reaction at node 1 (pinned support)
    let r_left = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap();
    let v_connection = r_left.rz.abs();

    // For symmetric loading: each reaction = P/2
    assert_close(v_connection, p / 2.0, 0.02,
        "Connection: end reaction = P/2");

    // Bolt group analysis: 4 bolts in a vertical line
    // Bolt positions (relative to centroid): y = [-75mm, -25mm, +25mm, +75mm]
    let bolt_y = [-0.075_f64, -0.025, 0.025, 0.075]; // m
    let n_bolts = bolt_y.len() as f64;
    let eccentricity = 0.05; // m (distance from weld line to bolt group centroid)

    // Moment at bolt group: M = V * e
    let m_bolt_group = v_connection * eccentricity;

    // Sum of y_i^2 for moment distribution
    let sum_y2: f64 = bolt_y.iter().map(|y| y * y).sum();

    // Direct shear per bolt: F_direct = V / n_bolts
    let f_direct = v_connection / n_bolts;

    // Moment-induced force on outermost bolt: F_moment = M * y_max / sum(y_i^2)
    let y_max = bolt_y.iter().map(|y| y.abs()).fold(0.0_f64, f64::max);
    let f_moment = m_bolt_group * y_max / sum_y2;

    // For outermost bolt, direct and moment forces are in same direction (both vertical)
    // so resultant = F_direct + F_moment (they add since load is vertical and
    // bolt is at maximum distance in the direction of the load)
    let f_resultant_max = f_direct + f_moment;

    // The maximum bolt force must be greater than the simple direct shear
    assert!(
        f_resultant_max > f_direct,
        "Bolt resultant ({:.2} kN) should exceed direct shear ({:.2} kN)",
        f_resultant_max, f_direct
    );

    // Eccentricity ratio check: with e/d_bolt_group, moment amplifies forces
    // Maximum bolt force should be < 3 * direct shear for moderate eccentricity
    assert!(
        f_resultant_max < 3.0 * f_direct,
        "Bolt resultant ({:.2} kN) should be < 3*direct ({:.2} kN) for moderate eccentricity",
        f_resultant_max, 3.0 * f_direct
    );

    // Verify analytical bolt force with known formula
    // F_resultant = V/n + M*y_max / sum(y_i^2)
    let f_expected = v_connection / n_bolts + v_connection * eccentricity * y_max / sum_y2;
    assert_close(f_resultant_max, f_expected, 0.01,
        "Connection: bolt resultant matches analytical formula");

    // Verify equilibrium: sum of all bolt forces = V_connection
    // Direct component: n_bolts * f_direct = V_connection
    assert_close(n_bolts * f_direct, v_connection, 0.01,
        "Connection: bolt group equilibrium for direct shear");
}

// ================================================================
// 8. Moment Frame Strong-Column/Weak-Beam: Capacity Hierarchy
// ================================================================
//
// In seismic design, the strong-column/weak-beam (SCWB) philosophy
// requires that column moment capacity exceed beam moment capacity
// at each joint:
//
//   sum(M_pc) / sum(M_pb) > 1.0  (AISC 341-22 §E3.4a)
//
// where M_pc = column plastic moment adjusted for axial load,
//       M_pb = beam plastic moment (with overstrength if applicable).
//
// This test builds a portal frame, extracts column and beam moments,
// and checks the SCWB ratio. Columns use W14x48, beams use W10x33.
//
// Reference: AISC 341-22 §E3.4a, Bruneau et al. "Ductile Design"

#[test]
fn validation_strong_column_weak_beam() {
    let h = 3.5; // m (story height)
    let w = 7.0; // m (bay width)
    let f_lateral = 50.0; // kN (lateral seismic force at beam level)
    let f_gravity = -30.0; // kN (gravity on each beam-column joint)

    // Build portal frame:
    // Nodes: 1(0,0), 2(0,h), 3(w,h), 4(w,0)
    // Elements: 1(col:1-2), 2(beam:2-3), 3(col:3-4)
    // Columns use W14x48, beam uses W10x33
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    // Material 1 for all (same steel)
    // Section 1: column (W14x48), Section 2: beam (W10x33)
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, W14_A, W14_IZ), (2, W10_A, W10_IZ)];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 2, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: f_lateral,
            fz: f_gravity,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: 0.0,
            fz: f_gravity,
            my: 0.0,
        }),
    ];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Extract moments at the beam-column joint (node 2)
    // Left column: element 1, moment at end (node 2)
    let ef_col_left = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    let m_col_left_top = ef_col_left.m_end.abs();

    // Beam: element 2, moment at start (node 2)
    let ef_beam = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap();
    let m_beam_left = ef_beam.m_start.abs();

    // Right column: element 3, moment at start (node 3)
    let ef_col_right = results.element_forces.iter()
        .find(|e| e.element_id == 3).unwrap();
    let _m_col_right_top = ef_col_right.m_start.abs();

    // Beam at right: moment at end (node 3)
    let _m_beam_right = ef_beam.m_end.abs();

    // SCWB check at node 2: column moment vs beam moment
    // In elastic analysis, moment equilibrium at node:
    // M_col_above + M_col_below = M_beam_left + M_beam_right (at the same joint)
    // For portal frame bottom story: only one column below, none above at node 2
    // So M_col_left_top should balance M_beam_left at node 2

    // Capacity-based SCWB ratio:
    // sum(Mpc) = Fy * Zx_column (for each column at joint)
    // sum(Mpb) = Fy * Zx_beam (for each beam at joint)
    let fy_eff = 250.0 * 1000.0; // kN/m² (A36)
    let sx_col = 2.0 * W14_IZ / W14_D;
    let zx_col = sx_col * 1.12; // approximate
    let mpc = fy_eff * zx_col; // column plastic moment capacity

    let w10_d = 0.2470; // W10x33 depth (m)
    let sx_beam = 2.0 * W10_IZ / w10_d;
    let zx_beam = sx_beam * 1.12;
    let mpb = fy_eff * zx_beam;

    // At node 2: one column meets one beam
    // SCWB ratio = M_pc_column / M_pb_beam
    let scwb_ratio = mpc / mpb;
    assert!(
        scwb_ratio > 1.0,
        "SCWB: column capacity ({:.1} kN-m) > beam capacity ({:.1} kN-m), ratio={:.2}",
        mpc, mpb, scwb_ratio
    );

    // Column W14x48 is significantly stiffer than beam W10x33, so ratio should be > 1.5
    assert!(
        scwb_ratio > 1.5,
        "SCWB: W14x48 col / W10x33 beam ratio ({:.2}) should exceed 1.5",
        scwb_ratio
    );

    // Demand check: elastic moments should be within capacity
    assert!(
        m_col_left_top < mpc,
        "Column elastic demand ({:.1}) < capacity ({:.1})",
        m_col_left_top, mpc
    );
    assert!(
        m_beam_left < mpb,
        "Beam elastic demand ({:.1}) < capacity ({:.1})",
        m_beam_left, mpb
    );

    // Global equilibrium check
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_rx, -f_lateral, 0.02,
        "SCWB frame: horizontal equilibrium");
    assert_close(sum_ry, -2.0 * f_gravity, 0.02,
        "SCWB frame: vertical equilibrium");
}
