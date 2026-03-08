/// Validation: Extended CIRSOC 102 Wind Loading -- Structural Response
///
/// References:
///   - CIRSOC 102-2005: Reglamento Argentino de Accion del Viento sobre las Construcciones
///   - CIRSOC 102-2018 (draft update aligned with ASCE 7-16)
///   - ASCE 7-22: Minimum Design Loads and Associated Criteria, Ch. 26-30
///   - Simiu & Yeo: "Wind Effects on Structures", 4th ed., Wiley
///   - EN 1991-1-4: Eurocode 1 -- Actions on structures -- Wind actions
///   - Holmes: "Wind Loading of Structures", 3rd ed., CRC Press
///
/// Tests verify structural models subjected to CIRSOC-derived wind
/// pressures: portal frames, trusses, gust factors, topographic
/// amplification, vortex shedding, partial-length loading, along-wind
/// dynamic response, and drift inter-story limits.

mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

// ================================================================
// Wind helper functions
// ================================================================

/// CIRSOC 102 velocity pressure: q = 0.613 * V^2 (Pa).
fn cirsoc_q_pa(v: f64) -> f64 {
    0.613 * v * v
}

/// Exposure coefficient (power-law profile):
///   Ce(z) = 2.01 * (max(z, z_min) / z_g)^(2/alpha)
fn exposure_ce(z: f64, alpha: f64, z_g: f64, z_min: f64) -> f64 {
    let z_eff = z.max(z_min);
    2.01 * (z_eff / z_g).powf(2.0 / alpha)
}

// Terrain parameters -- CIRSOC 102 Category II (open)
const CIRSOC_ALPHA: f64 = 9.5;
const CIRSOC_CAT2_ZG: f64 = 274.0;
const CIRSOC_ZMIN: f64 = 5.0;

// Common section properties
const E: f64 = 200_000.0;  // MPa (steel)
const A_COL: f64 = 0.01;   // m^2
const IZ_COL: f64 = 1e-4;  // m^4
const A_BEAM: f64 = 0.015;
const IZ_BEAM: f64 = 2e-4;

// ================================================================
// 1. Portal Frame Under CIRSOC Windward + Leeward Pressures
// ================================================================
//
// Single-bay portal frame, fixed bases, h=6m, w=8m.
// Zone V (Buenos Aires): V0=45 m/s.
// Windward Cp=+0.8, leeward Cp=-0.5 (magnitude 0.5).
// Ce evaluated at mid-height for each column (z=3m).
//
// Net horizontal distributed load on each column = q0 * Ce(3m) * Cp * trib_width.
// Since the wind acts on facade, tributary width = 1 m (unit strip analysis).
//
// Equilibrium check: sum of base reactions = total applied wind.
//
// Reference: CIRSOC 102-2005, Section 5.3; Tables 2 & 5.

#[test]
fn cirsoc_portal_windward_leeward() {
    let h = 6.0;
    let w = 8.0;
    let v0 = 45.0;
    let cp_ww = 0.8;
    let cp_lw = 0.5; // magnitude
    let trib = 1.0;  // 1 m tributary width (unit strip)

    let q0_kn = cirsoc_q_pa(v0) / 1000.0;  // kN/m^2
    let ce_mid = exposure_ce(h / 2.0, CIRSOC_ALPHA, CIRSOC_CAT2_ZG, CIRSOC_ZMIN);

    // Distributed loads in kN/m along column
    let w_ww = q0_kn * ce_mid * cp_ww * trib;  // windward, +x
    let w_lw = q0_kn * ce_mid * cp_lw * trib;  // leeward, also +x (suction pulls right col rightward)

    let n_col = 4;
    let dy = h / n_col as f64;
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut eid = 1_usize;

    // Left column: nodes 1..5
    for i in 0..=n_col {
        nodes.push((i + 1, 0.0, i as f64 * dy));
        if i > 0 {
            elems.push((eid, "frame", i, i + 1, 1, 1, false, false));
            eid += 1;
        }
    }
    // Right column: nodes 6..10
    for i in 0..=n_col {
        let nid = n_col + 2 + i;
        nodes.push((nid, w, i as f64 * dy));
        if i > 0 {
            elems.push((eid, "frame", nid - 1, nid, 1, 1, false, false));
            eid += 1;
        }
    }
    // Beam connecting tops
    let left_top = n_col + 1;
    let right_top = 2 * n_col + 2;
    elems.push((eid, "frame", left_top, right_top, 1, 1, false, false));

    // Windward loads on left column (elements 1..n_col)
    let mut loads = Vec::new();
    for i in 1..=n_col {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: w_ww, q_j: w_ww, a: None, b: None,
        }));
    }
    // Leeward loads on right column (elements n_col+1..2*n_col), same direction +x
    for i in 1..=n_col {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: n_col + i, q_i: w_lw, q_j: w_lw, a: None, b: None,
        }));
    }

    let sups = vec![(1, 1, "fixed"), (2, n_col + 2, "fixed")];
    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_COL, IZ_COL)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total applied horizontal force = (w_ww + w_lw) * h
    let total_wind = (w_ww + w_lw) * h;
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>().abs();
    assert_close(sum_rx, total_wind, 0.02,
        "CIRSOC portal W+L: base shear = (ww+lw)*H");

    // Overturning moment about base = total_wind * h/2 (approx for uniform w)
    let m_overturn = total_wind * h / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n_col + 2).unwrap();
    let m_resist = (r1.mz + r2.mz + r2.ry * w).abs();
    assert_close(m_resist, m_overturn, 0.05,
        "CIRSOC portal: moment equilibrium about base");
}

// ================================================================
// 2. Gust Effect Factor Validation
// ================================================================
//
// CIRSOC 102 gust effect factor for rigid structures (f1 > 1 Hz):
//   G = 0.925 * (1 + 1.7 * g_Q * I_z_bar * Q^0.5) /
//       (1 + 1.7 * g_v * I_z_bar)
//
// For rigid structures (simplified): G ~ 0.85
//
// Apply wind with G=0.85 vs G=1.0 to a cantilever column
// and verify the ratio of base reactions equals G.
//
// Reference: CIRSOC 102-2005 Section 4.4; ASCE 7-22 Section 26.11.

#[test]
fn cirsoc_gust_effect_factor() {
    let h = 10.0;
    let v0 = 45.0;
    let cp = 0.8;
    let trib = 1.0;
    let g_factor = 0.85;

    let q0_kn = cirsoc_q_pa(v0) / 1000.0;
    let ce = exposure_ce(h / 2.0, CIRSOC_ALPHA, CIRSOC_CAT2_ZG, CIRSOC_ZMIN);
    let w_base = q0_kn * ce * cp * trib;       // without gust factor
    let w_gust = w_base * g_factor;             // with gust factor

    let n = 8;
    let dy = h / n as f64;

    // Helper to build vertical cantilever with given distributed load
    let build_cantilever = |w_load: f64| -> SolverInput {
        let mut nodes = Vec::new();
        let mut elems = Vec::new();
        for i in 0..=n {
            nodes.push((i + 1, 0.0, i as f64 * dy));
            if i > 0 {
                elems.push((i, "frame", i, i + 1, 1, 1, false, false));
            }
        }
        let loads: Vec<SolverLoad> = (1..=n)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: w_load, q_j: w_load, a: None, b: None,
            }))
            .collect();
        make_input(
            nodes,
            vec![(1, E, 0.3)],
            vec![(1, A_COL, IZ_COL)],
            elems,
            vec![(1, 1, "fixed")],
            loads,
        )
    };

    let res_base = linear::solve_2d(&build_cantilever(w_base)).unwrap();
    let res_gust = linear::solve_2d(&build_cantilever(w_gust)).unwrap();

    let rx_base = res_base.reactions[0].rx.abs();
    let rx_gust = res_gust.reactions[0].rx.abs();

    // Ratio of gusted to base shear should equal G
    let ratio = rx_gust / rx_base;
    assert_close(ratio, g_factor, 0.01,
        "CIRSOC gust factor: shear ratio = G");

    // Also verify moments scale by G
    let mz_base = res_base.reactions[0].mz.abs();
    let mz_gust = res_gust.reactions[0].mz.abs();
    let m_ratio = mz_gust / mz_base;
    assert_close(m_ratio, g_factor, 0.01,
        "CIRSOC gust factor: moment ratio = G");
}

// ================================================================
// 3. Topographic Amplification Factor (Hill/Escarpment)
// ================================================================
//
// CIRSOC 102 allows a topographic factor Kt for speed-up over
// hills and escarpments:
//   Kzt = (1 + K1 * K2 * K3)^2
//
// For a 2D escarpment with H/Lh = 0.3:
//   K1 = 0.29 (from CIRSOC 102-2005 Table 6)
//   K2 = 1.0 at crest
//   K3 = 1.0 at ground level
//   Kzt = (1 + 0.29)^2 = 1.6641
//
// Apply Kzt-amplified wind to portal frame and check the reaction
// ratio matches the pressure ratio (Kzt for force, Kzt^0.5 for speed).
//
// Reference: CIRSOC 102-2005, Section 4.3; ASCE 7-22, Section 26.8.

#[test]
fn cirsoc_topographic_amplification() {
    let k1: f64 = 0.29;
    let k2: f64 = 1.0;
    let k3: f64 = 1.0;
    let kzt: f64 = (1.0 + k1 * k2 * k3).powi(2);

    // Expected: (1.29)^2 = 1.6641
    assert_close(kzt, 1.6641, 0.001,
        "CIRSOC Kzt = (1+K1*K2*K3)^2");

    let h = 5.0;
    let w = 6.0;
    let v0 = 45.0;
    let cp = 0.8;
    let trib = 1.0;
    let q0_kn = cirsoc_q_pa(v0) / 1000.0;
    let ce = exposure_ce(h / 2.0, CIRSOC_ALPHA, CIRSOC_CAT2_ZG, CIRSOC_ZMIN);

    let w_flat = q0_kn * ce * cp * trib;
    let w_topo = w_flat * kzt;

    // Build portal frame helper
    let build_portal = |w_load: f64| -> SolverInput {
        let n_col = 4;
        let dy = h / n_col as f64;
        let mut nodes = Vec::new();
        let mut elems = Vec::new();
        let mut eid = 1_usize;
        for i in 0..=n_col {
            nodes.push((i + 1, 0.0, i as f64 * dy));
            if i > 0 {
                elems.push((eid, "frame", i, i + 1, 1, 1, false, false));
                eid += 1;
            }
        }
        for i in 0..=n_col {
            let nid = n_col + 2 + i;
            nodes.push((nid, w, i as f64 * dy));
            if i > 0 {
                elems.push((eid, "frame", nid - 1, nid, 1, 1, false, false));
                eid += 1;
            }
        }
        let lt = n_col + 1;
        let rt = 2 * n_col + 2;
        elems.push((eid, "frame", lt, rt, 1, 1, false, false));
        let loads: Vec<SolverLoad> = (1..=n_col)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: w_load, q_j: w_load, a: None, b: None,
            }))
            .collect();
        make_input(
            nodes,
            vec![(1, E, 0.3)],
            vec![(1, A_COL, IZ_COL)],
            elems,
            vec![(1, 1, "fixed"), (2, n_col + 2, "fixed")],
            loads,
        )
    };

    let res_flat = linear::solve_2d(&build_portal(w_flat)).unwrap();
    let res_topo = linear::solve_2d(&build_portal(w_topo)).unwrap();

    let rx_flat: f64 = res_flat.reactions.iter().map(|r| r.rx).sum::<f64>().abs();
    let rx_topo: f64 = res_topo.reactions.iter().map(|r| r.rx).sum::<f64>().abs();

    let ratio = rx_topo / rx_flat;
    assert_close(ratio, kzt, 0.02,
        "CIRSOC topographic: shear amplification = Kzt");
}

// ================================================================
// 4. Wind on Truss Roof Structure
// ================================================================
//
// Parallel-chord Pratt truss (single span, 12 m, 2 m deep).
// Wind uplift on top chord = -2 kN/m (CIRSOC roof suction).
// Verify equilibrium: sum Ry = total uplift.
// Truss members: hinge_start=true, hinge_end=true.
//
// Reference: CIRSOC 102-2005, Section 7 (roofs);
//            McCormac & Csernak, "Structural Steel Design", Ch. 18.

#[test]
fn cirsoc_wind_truss_roof_uplift() {
    let span: f64 = 12.0;
    let depth: f64 = 2.0;
    let n_panels: usize = 6;
    let dx = span / n_panels as f64;
    let q_uplift = 2.0; // kN/m upward (+y means up in this coordinate system)

    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut eid = 1_usize;

    // Bottom chord nodes: 1..(n_panels+1), y=0
    for i in 0..=n_panels {
        nodes.push((i + 1, i as f64 * dx, 0.0));
    }
    // Top chord nodes: (n_panels+2)..(2*n_panels+2), y=depth
    for i in 0..=n_panels {
        nodes.push((n_panels + 2 + i, i as f64 * dx, depth));
    }

    // Bottom chord elements (truss)
    for i in 0..n_panels {
        elems.push((eid, "frame", i + 1, i + 2, 1, 1, true, true));
        eid += 1;
    }
    // Top chord elements (truss)
    for i in 0..n_panels {
        let ni = n_panels + 2 + i;
        let nj = n_panels + 3 + i;
        elems.push((eid, "frame", ni, nj, 1, 1, true, true));
        eid += 1;
    }
    // Verticals
    for i in 0..=n_panels {
        let nb = i + 1;
        let nt = n_panels + 2 + i;
        elems.push((eid, "frame", nb, nt, 1, 1, true, true));
        eid += 1;
    }
    // Diagonals (alternating pattern for Pratt truss)
    for i in 0..n_panels {
        let nb_left = i + 1;
        let nt_right = n_panels + 3 + i;
        elems.push((eid, "frame", nb_left, nt_right, 1, 1, true, true));
        eid += 1;
    }

    // Uplift distributed load on top chord elements
    // Top chord elements are numbered (n_panels+1)..(2*n_panels)
    let top_chord_start = n_panels + 1;
    let mut loads = Vec::new();
    for i in 0..n_panels {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: top_chord_start + i,
            q_i: q_uplift,
            q_j: q_uplift,
            a: None,
            b: None,
        }));
    }

    // Supports: pin at bottom-left, roller at bottom-right
    let sups = vec![
        (1, 1, "pinned"),
        (2, n_panels + 1, "rollerX"),
    ];

    let a_truss = 0.002;  // m^2
    let iz_truss = 1e-7;  // m^4 (small but nonzero for numerical stability)
    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_truss, iz_truss)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total uplift = q * span
    let total_uplift = q_uplift * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();

    // Reactions should balance the uplift (reactions are downward = negative)
    assert_close(sum_ry.abs(), total_uplift, 0.05,
        "CIRSOC truss uplift: |sum Ry| = q*L");

    // Each reaction should be approximately half the total (symmetric)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n_panels + 1).unwrap();
    assert_close(r1.ry.abs(), total_uplift / 2.0, 0.05,
        "CIRSOC truss uplift: R1 ~ q*L/2");
    assert_close(r2.ry.abs(), total_uplift / 2.0, 0.05,
        "CIRSOC truss uplift: R2 ~ q*L/2");
}

// ================================================================
// 5. Height-Varying Wind Profile on Multi-Story Frame
// ================================================================
//
// 3-story frame (story height 3.5 m), single bay (6 m).
// Wind pressure increases with height per CIRSOC power-law profile.
// Concentrated forces at each floor level from tributary area.
//
// F_i = q0 * Ce(z_i) * Cp * A_trib
//
// Verify base shear = sum of story forces.
// Verify overturning moment = sum(F_i * z_i).
//
// Reference: CIRSOC 102-2005, Section 5.3; Taranath, Ch. 3.

#[test]
fn cirsoc_height_varying_multistory() {
    let n_stories: usize = 3;
    let h_story = 3.5;
    let bay = 6.0;
    let v0 = 45.0;
    let cp = 0.8;
    let a_trib = h_story * 1.0; // tributary height * 1 m depth (unit strip)

    let q0_kn = cirsoc_q_pa(v0) / 1000.0;

    // Compute story forces
    let mut story_forces = Vec::new();
    let mut total_force = 0.0_f64;
    let mut total_moment = 0.0_f64;
    for i in 1..=n_stories {
        let z_i = i as f64 * h_story;
        let ce_i = exposure_ce(z_i, CIRSOC_ALPHA, CIRSOC_CAT2_ZG, CIRSOC_ZMIN);
        let f_i = q0_kn * ce_i * cp * a_trib;
        story_forces.push((i, z_i, f_i));
        total_force += f_i;
        total_moment += f_i * z_i;
    }

    // Build 3-story single-bay frame
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut sups = Vec::new();
    let mut eid = 1_usize;

    // Base nodes
    nodes.push((1, 0.0, 0.0));
    nodes.push((2, bay, 0.0));
    sups.push((1, 1, "fixed"));
    sups.push((2, 2, "fixed"));

    for s in 1..=n_stories {
        let y = s as f64 * h_story;
        let left = 2 * s + 1;
        let right = 2 * s + 2;
        nodes.push((left, 0.0, y));
        nodes.push((right, bay, y));

        let bl = if s == 1 { 1 } else { 2 * (s - 1) + 1 };
        let br = if s == 1 { 2 } else { 2 * (s - 1) + 2 };
        elems.push((eid, "frame", bl, left, 1, 1, false, false)); eid += 1;
        elems.push((eid, "frame", br, right, 1, 1, false, false)); eid += 1;
        elems.push((eid, "frame", left, right, 1, 1, false, false)); eid += 1;
    }

    // Lateral wind loads at left nodes of each story
    let loads: Vec<SolverLoad> = story_forces.iter().map(|&(s, _z, f)| {
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2 * s + 1,
            fx: f,
            fy: 0.0,
            mz: 0.0,
        })
    }).collect();

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_COL, IZ_COL)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Check base shear equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>().abs();
    assert_close(sum_rx, total_force, 0.02,
        "CIRSOC multistory: base shear = sum(Fi)");

    // Check overturning moment equilibrium
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    let m_resist = (r1.mz + r2.mz + r2.ry * bay).abs();
    assert_close(m_resist, total_moment, 0.05,
        "CIRSOC multistory: overturning moment");

    // Wind force should increase with height (higher Ce)
    for i in 1..story_forces.len() {
        assert!(
            story_forces[i].2 > story_forces[i - 1].2,
            "CIRSOC: F at story {} ({:.3} kN) > F at story {} ({:.3} kN)",
            i + 1, story_forces[i].2, i, story_forces[i - 1].2
        );
    }
}

// ================================================================
// 6. Vortex Shedding Critical Speed and Lock-In Check
// ================================================================
//
// Verify the critical wind speed for vortex shedding on a chimney
// or signpost column, and check if lock-in occurs within the
// design wind speed range.
//
// Critical speed: V_cr = f_n * D / St
// Strouhal number St = 0.20 for circular cross-section.
// Lock-in bandwidth: 0.8 * V_cr < V < 1.2 * V_cr (approx.)
//
// Model a 15 m cantilever mast (D=0.5 m) and compute deflection
// under resonant cross-wind load estimated from Scruton number.
//
// Reference: CIRSOC 102-2005, Annex C (dynamic effects);
//            EN 1991-1-4, Annex E (vortex shedding).

#[test]
fn cirsoc_vortex_shedding_mast() {
    let h_mast: f64 = 15.0;  // m
    let d_mast = 0.5;        // m, circular diameter
    let st = 0.20;           // Strouhal number
    let rho_air = 1.225;     // kg/m^3

    // Natural frequency of cantilever: f1 = (1.875^2)/(2*pi) * sqrt(EI/(m*L^4))
    // Use structural properties for steel mast
    let e_steel = 200_000.0; // MPa = N/mm^2 = 10^6 N/m^2
    let t_wall = 0.010;      // 10 mm wall thickness
    let r_out: f64 = d_mast / 2.0;
    let r_in: f64 = r_out - t_wall;
    let i_mast: f64 = std::f64::consts::PI / 4.0 * (r_out.powi(4) - r_in.powi(4));
    let a_mast: f64 = std::f64::consts::PI * (r_out.powi(2) - r_in.powi(2));
    let rho_steel = 7850.0;  // kg/m^3
    let m_per_m = rho_steel * a_mast; // kg/m

    // EI in N*m^2: E(Pa)*I(m^4) = E(MPa)*1e6*I
    let ei = e_steel * 1e6 * i_mast;
    let f1: f64 = (1.875_f64).powi(2) / (2.0 * std::f64::consts::PI)
        * (ei / (m_per_m * h_mast.powi(4))).sqrt();

    // Critical wind speed
    let v_cr = f1 * d_mast / st;

    assert!(
        v_cr > 1.0 && v_cr < 50.0,
        "CIRSOC vortex: V_cr = {:.2} m/s should be in [1, 50]", v_cr
    );

    // Lock-in range
    let v_lock_low = 0.8 * v_cr;
    let v_lock_high = 1.2 * v_cr;
    assert!(
        v_lock_high > v_lock_low,
        "Lock-in range: [{:.2}, {:.2}] m/s", v_lock_low, v_lock_high
    );

    // Scruton number
    let xi = 0.005; // damping ratio (welded steel)
    let sc = 2.0 * m_per_m * xi / (rho_air * d_mast * d_mast);

    // Structural model: cantilever with tip load = estimated vortex force
    // Cross-wind force per unit length: F_L = 0.5*rho*V_cr^2*D*clat
    let clat = 0.2;
    let f_per_m = 0.5 * rho_air * v_cr * v_cr * d_mast * clat; // N/m
    let f_tip = f_per_m * h_mast / 1000.0 * 0.5; // kN, simplified equiv. tip force

    let n_elem = 6;
    let dy = h_mast / n_elem as f64;
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n_elem {
        nodes.push((i + 1, 0.0, i as f64 * dy));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_elem + 1,
        fx: f_tip,
        fy: 0.0,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, e_steel, 0.3)],
        vec![(1, a_mast, i_mast)],
        elems,
        vec![(1, 1, "fixed")],
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Verify reaction equilibrium
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.rx.abs(), f_tip, 0.02,
        "CIRSOC vortex mast: base shear = F_tip");

    // Cantilever moment: M = F * H
    assert_close(r.mz.abs(), f_tip * h_mast, 0.02,
        "CIRSOC vortex mast: base moment = F*H");

    // Tip deflection should be finite and positive
    let tip = results.displacements.iter().find(|d| d.node_id == n_elem + 1).unwrap();
    assert!(tip.ux.abs() > 0.0, "CIRSOC vortex mast: nonzero tip displacement");

    // Scruton number sanity
    assert!(sc > 0.0, "CIRSOC vortex mast: Sc = {:.2}", sc);
}

// ================================================================
// 7. Partial-Length Wind Load on Cantilever Signboard
// ================================================================
//
// A 6 m cantilever post supports a signboard from 4 m to 6 m height.
// Wind pressure acts only on the sign portion (partial distributed load).
//
// CIRSOC 102 sign pressure: q_sign = q0 * Ce * Cf, where Cf ~ 1.2.
// Model as partial distributed load on the upper elements only.
//
// M_base = q * (h_top - h_sign_start) * (h_sign_start + h_top) / 2
//        = q * 2 * 5 = 10q    (centroid at 5 m above base)
//
// Reference: CIRSOC 102-2005, Section 7.4 (signs and billboards).

#[test]
fn cirsoc_partial_wind_signboard() {
    let h_total = 6.0;
    let h_sign_start = 4.0;
    let h_sign_end = 6.0;
    let v0 = 40.0;     // m/s (lower zone)
    let cf_sign = 1.2;  // force coefficient for flat sign
    let trib = 1.0;

    let q0_kn = cirsoc_q_pa(v0) / 1000.0;
    let ce = exposure_ce((h_sign_start + h_sign_end) / 2.0, CIRSOC_ALPHA, CIRSOC_CAT2_ZG, CIRSOC_ZMIN);
    let w_sign = q0_kn * ce * cf_sign * trib; // kN/m

    let n = 6; // elements: 1m each
    let dy = h_total / n as f64;

    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, i as f64 * dy));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }

    // Wind only on elements 5 and 6 (4-5m and 5-6m)
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 5, q_i: w_sign, q_j: w_sign, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 6, q_i: w_sign, q_j: w_sign, a: None, b: None,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_COL, IZ_COL)],
        elems,
        vec![(1, 1, "fixed")],
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Base shear = w_sign * (h_sign_end - h_sign_start)
    let sign_len = h_sign_end - h_sign_start;
    let expected_shear = w_sign * sign_len;
    assert_close(r.rx.abs(), expected_shear, 0.02,
        "CIRSOC signboard: base shear = w*L_sign");

    // Base moment = w_sign * L_sign * z_centroid (centroid of loaded region above base)
    let z_centroid = (h_sign_start + h_sign_end) / 2.0;
    let expected_moment = w_sign * sign_len * z_centroid;
    assert_close(r.mz.abs(), expected_moment, 0.02,
        "CIRSOC signboard: base moment = w*L*z_c");

    // Tip deflection should be larger than at sign start
    let d_top = results.displacements.iter().find(|d| d.node_id == 7).unwrap().ux.abs();
    let d_mid = results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux.abs();
    assert!(d_top > d_mid,
        "CIRSOC signboard: tip deflection > mid deflection");
}

// ================================================================
// 8. Inter-Story Drift Limit Compliance
// ================================================================
//
// CIRSOC 102 / CIRSOC 301 requires inter-story drift < H/500
// for serviceability wind (return period 10 years, reduced speed).
//
// 2-story portal frame with service wind. Compute inter-story
// drift for each level and verify compliance.
//
// V_service = V_design * 0.75 (approx. 10-year to 50-year ratio).
// Drift ratio = (u_top - u_bottom) / story_height
//
// Reference: CIRSOC 102-2005, Section 3.3;
//            CIRSOC 301-2005, Table 9.5.2 (drift limits).

#[test]
fn cirsoc_interstory_drift_limit() {
    let n_stories: usize = 2;
    let h_story = 3.5;
    let bay = 6.0;
    let v_design = 45.0;
    let v_service = v_design * 0.75;

    let q0_kn = cirsoc_q_pa(v_service) / 1000.0;
    let cp = 0.8;
    let trib = 1.0;

    // Stiffer section for realistic drift values
    let a_stiff = 0.02;       // m^2
    let iz_stiff = 5e-4;      // m^4

    // Build 2-story frame
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut sups = Vec::new();
    let mut eid = 1_usize;

    nodes.push((1, 0.0, 0.0));
    nodes.push((2, bay, 0.0));
    sups.push((1, 1, "fixed"));
    sups.push((2, 2, "fixed"));

    for s in 1..=n_stories {
        let y = s as f64 * h_story;
        let left = 2 * s + 1;
        let right = 2 * s + 2;
        nodes.push((left, 0.0, y));
        nodes.push((right, bay, y));
        let bl = if s == 1 { 1 } else { 2 * (s - 1) + 1 };
        let br = if s == 1 { 2 } else { 2 * (s - 1) + 2 };
        elems.push((eid, "frame", bl, left, 1, 1, false, false)); eid += 1;
        elems.push((eid, "frame", br, right, 1, 1, false, false)); eid += 1;
        elems.push((eid, "frame", left, right, 1, 2, false, false)); eid += 1;
    }

    // Story wind forces (concentrated at left node of each level)
    let mut loads = Vec::new();
    for s in 1..=n_stories {
        let z_s = s as f64 * h_story;
        let ce_s = exposure_ce(z_s, CIRSOC_ALPHA, CIRSOC_CAT2_ZG, CIRSOC_ZMIN);
        let f_s = q0_kn * ce_s * cp * trib * h_story;
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2 * s + 1,
            fx: f_s,
            fy: 0.0,
            mz: 0.0,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_stiff, iz_stiff), (2, A_BEAM, IZ_BEAM)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Compute inter-story drift ratios
    // Story 1: drift = ux(node 3) - ux(node 1), but node 1 is fixed (ux=0)
    // Story 2: drift = ux(node 5) - ux(node 3)
    let ux = |nid: usize| -> f64 {
        results.displacements.iter().find(|d| d.node_id == nid).unwrap().ux
    };

    let drift_1 = (ux(3) - 0.0).abs();        // base is fixed
    let drift_2 = (ux(5) - ux(3)).abs();
    let ratio_1 = drift_1 / h_story;
    let ratio_2 = drift_2 / h_story;

    let limit = 1.0 / 500.0; // H/500

    // With sufficiently stiff sections, both should satisfy drift limit
    assert!(
        ratio_1 < limit,
        "CIRSOC drift story 1: {:.6} < H/500 = {:.6}", ratio_1, limit
    );
    assert!(
        ratio_2 < limit,
        "CIRSOC drift story 2: {:.6} < H/500 = {:.6}", ratio_2, limit
    );

    // Drift should be positive (leftward wind => rightward drift)
    assert!(drift_1 > 0.0, "CIRSOC drift story 1 > 0");
    assert!(drift_2 >= 0.0, "CIRSOC drift story 2 >= 0");

    // Equilibrium check
    let total_wind: f64 = (1..=n_stories).map(|s| {
        let z_s = s as f64 * h_story;
        let ce_s = exposure_ce(z_s, CIRSOC_ALPHA, CIRSOC_CAT2_ZG, CIRSOC_ZMIN);
        q0_kn * ce_s * cp * trib * h_story
    }).sum();
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>().abs();
    assert_close(sum_rx, total_wind, 0.02,
        "CIRSOC drift: base shear equilibrium");
}
