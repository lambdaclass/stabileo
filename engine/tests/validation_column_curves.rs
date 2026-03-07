/// Validation: Column Buckling Curves and Effective Length Concepts
///
/// References:
///   - Timoshenko & Gere, *Theory of Elastic Stability*
///   - AISC 360-16, Chapter E (Compression Members)
///   - Galambos & Surovek, *Structural Stability of Steel*, Ch. 2
///
/// Tests verify column behavior under axial compression via P-delta analysis:
///   1. Euler load pinned-pinned: amplification near Pcr
///   2. Fixed-free (cantilever) effective length K=2
///   3. Fixed-fixed effective length K=0.5
///   4. P-delta amplification factor
///   5. Column stiffness reduction under axial load
///   6. Short vs long column at same P/Pcr ratio
///   7. Axial load effect on lateral flexibility (tension vs compression)
///   8. Two-column portal frame nonlinear sway
mod helpers;

use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01; // m^2
const IZ: f64 = 1e-4; // m^4
const E_EFF: f64 = E * 1000.0; // kN/m^2 (effective E for force calculations)
const PI2: f64 = std::f64::consts::PI * std::f64::consts::PI;

/// Euler critical load for pinned-pinned column: Pcr = pi^2 * EI / L^2
fn pcr_pinned_pinned(l: f64) -> f64 {
    PI2 * E_EFF * IZ / (l * l)
}

/// Euler critical load for fixed-free (cantilever): Pcr = pi^2 * EI / (2L)^2
fn pcr_fixed_free(l: f64) -> f64 {
    PI2 * E_EFF * IZ / (4.0 * l * l)
}

/// Euler critical load for fixed-fixed: Pcr = 4 * pi^2 * EI / L^2
fn pcr_fixed_fixed(l: f64) -> f64 {
    4.0 * PI2 * E_EFF * IZ / (l * l)
}

/// Helper: build a cantilever column (fixed base, free tip) with axial + optional lateral loads.
fn make_cantilever_column(
    n_elem: usize,
    length: f64,
    axial_load: f64,
    lateral_loads: Vec<(usize, f64)>, // (node_id, fy)
) -> SolverInput {
    let elem_len = length / n_elem as f64;
    let n_nodes = n_elem + 1;
    let mut nodes = Vec::new();
    for i in 0..n_nodes {
        nodes.push((i + 1, i as f64 * elem_len, 0.0));
    }
    let mut elems = Vec::new();
    for i in 0..n_elem {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    let mut loads = Vec::new();
    if axial_load.abs() > 1e-20 {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_nodes,
            fx: axial_load,
            fy: 0.0,
            mz: 0.0,
        }));
    }
    for (nid, fy) in lateral_loads {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: nid,
            fx: 0.0,
            fy: fy,
            mz: 0.0,
        }));
    }
    make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        vec![(1, 1, "fixed")], // only fixed at base
        loads,
    )
}

/// Helper: build a column with supports at both ends and optional lateral loads at interior nodes.
fn make_column_with_lateral(
    n_elem: usize,
    length: f64,
    start_sup: &str,
    end_sup: &str,
    axial_load: f64,
    lateral_loads: Vec<(usize, f64)>, // (node_id, fy)
) -> SolverInput {
    let elem_len = length / n_elem as f64;
    let n_nodes = n_elem + 1;
    let mut nodes = Vec::new();
    for i in 0..n_nodes {
        nodes.push((i + 1, i as f64 * elem_len, 0.0));
    }
    let mut elems = Vec::new();
    for i in 0..n_elem {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    let sups = vec![(1, 1, start_sup), (2, n_nodes, end_sup)];
    let mut loads = Vec::new();
    if axial_load.abs() > 1e-20 {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_nodes,
            fx: axial_load,
            fy: 0.0,
            mz: 0.0,
        }));
    }
    for (nid, fy) in lateral_loads {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: nid,
            fx: 0.0,
            fy: fy,
            mz: 0.0,
        }));
    }
    make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    )
}

// ================================================================
// 1. Euler Load Pinned-Pinned: Amplification Near Pcr
// ================================================================
//
// Column L=5m, 8 elements, pinned-pinned (K=1.0).
// Small lateral perturbation at midspan with increasing axial compression.
// At P = 0.5*Pcr: moderate lateral deflection.
// At P = 0.9*Pcr: much larger deflection due to amplification.
// Theoretical amplification: 1/(1 - P/Pcr).
// Ratio of deflections at 0.9 vs 0.5: (1/(1-0.9)) / (1/(1-0.5)) = 10/2 = 5.

#[test]
fn validation_column_curves_euler_pinned_amplification() {
    let l = 5.0;
    let n = 8;
    let pcr = pcr_pinned_pinned(l);
    let midspan = n / 2 + 1; // node 5 for 8-element column
    let fy_perturb = 0.001;

    // Case 1: P = 0.5 * Pcr
    let p_half = 0.5 * pcr;
    let input_half = make_column_with_lateral(
        n, l, "pinned", "rollerX", -p_half, vec![(midspan, fy_perturb)],
    );
    let res_half = pdelta::solve_pdelta_2d(&input_half, 50, 1e-6).unwrap();
    assert!(res_half.converged, "P-delta should converge at 0.5*Pcr");
    let d_half = res_half.results.displacements.iter()
        .find(|d| d.node_id == midspan).unwrap().uy.abs();

    // Case 2: P = 0.9 * Pcr
    let p_nine = 0.9 * pcr;
    let input_nine = make_column_with_lateral(
        n, l, "pinned", "rollerX", -p_nine, vec![(midspan, fy_perturb)],
    );
    let res_nine = pdelta::solve_pdelta_2d(&input_nine, 50, 1e-6).unwrap();
    assert!(res_nine.converged, "P-delta should converge at 0.9*Pcr");
    let d_nine = res_nine.results.displacements.iter()
        .find(|d| d.node_id == midspan).unwrap().uy.abs();

    // d_nine should be much larger than d_half
    assert!(
        d_nine > d_half,
        "Deflection at 0.9*Pcr ({:.6e}) should exceed 0.5*Pcr ({:.6e})",
        d_nine, d_half
    );

    // Theoretical ratio: AF(0.9)/AF(0.5) = (1/(1-0.9)) / (1/(1-0.5)) = 10/2 = 5
    // P-delta is approximate, so allow 30% tolerance
    let ratio = d_nine / d_half;
    assert!(
        ratio > 3.0 && ratio < 8.0,
        "Amplification ratio d(0.9)/d(0.5) = {:.2}, expected ~5.0",
        ratio
    );
}

// ================================================================
// 2. Fixed-Free Column (Cantilever) Effective Length K=2
// ================================================================
//
// Cantilever column L=3m. K=2 so Pcr = pi^2*EI/(2L)^2 = pi^2*EI/(4L^2).
// This is 4x smaller than pinned-pinned Pcr for same length.
// At same axial load fraction, cantilever deflects more since Pcr is lower.

#[test]
fn validation_column_curves_fixed_free_effective_length() {
    let l = 3.0;
    let n = 8;
    let pcr_pp = pcr_pinned_pinned(l);
    let pcr_ff = pcr_fixed_free(l);
    let tip = n + 1;

    // Verify Pcr ratio: fixed-free is 1/4 of pinned-pinned
    let pcr_ratio = pcr_pp / pcr_ff;
    assert!(
        (pcr_ratio - 4.0).abs() < 0.01,
        "Pcr_pp / Pcr_ff = {:.4}, expected 4.0",
        pcr_ratio
    );

    // Apply P = 0.5 * Pcr_ff (well below cantilever critical load)
    let p_axial = 0.5 * pcr_ff;
    let fy_perturb = 0.001;

    // Cantilever: fixed base, free tip, lateral at tip
    let input_cant = make_cantilever_column(n, l, -p_axial, vec![(tip, fy_perturb)]);
    let res_cant = pdelta::solve_pdelta_2d(&input_cant, 50, 1e-6).unwrap();
    assert!(res_cant.converged, "Cantilever P-delta should converge");
    let d_cant = res_cant.results.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uy.abs();

    // Pinned-pinned at same absolute load (which is only 0.125*Pcr_pp)
    let midspan_pp = n / 2 + 1;
    let input_pp = make_column_with_lateral(
        n, l, "pinned", "rollerX", -p_axial, vec![(midspan_pp, fy_perturb)],
    );
    let res_pp = pdelta::solve_pdelta_2d(&input_pp, 50, 1e-6).unwrap();
    assert!(res_pp.converged, "Pinned-pinned P-delta should converge");
    let d_pp = res_pp.results.displacements.iter()
        .find(|d| d.node_id == midspan_pp).unwrap().uy.abs();

    // Cantilever should deflect more: same load but Pcr is 4x smaller,
    // so P/Pcr is 4x higher for the cantilever.
    assert!(
        d_cant > d_pp,
        "Cantilever deflection ({:.6e}) > pinned-pinned ({:.6e}) at same load",
        d_cant, d_pp
    );
}

// ================================================================
// 3. Fixed-Fixed Column Effective Length K=0.5
// ================================================================
//
// Fixed-fixed column L=4m: Pcr = 4*pi^2*EI/L^2, which is 4x pinned-pinned.
// At same axial load, fixed-fixed should deflect less.

#[test]
fn validation_column_curves_fixed_fixed_effective_length() {
    let l = 4.0;
    let n = 8;
    let pcr_pp = pcr_pinned_pinned(l);
    let pcr_ffixed = pcr_fixed_fixed(l);

    // Verify Pcr ratio: fixed-fixed is 4x pinned-pinned
    let pcr_ratio = pcr_ffixed / pcr_pp;
    assert!(
        (pcr_ratio - 4.0).abs() < 0.01,
        "Pcr_fixed / Pcr_pinned = {:.4}, expected 4.0",
        pcr_ratio
    );

    // Apply P = 0.3 * Pcr_pp (moderate for pinned, low for fixed-fixed)
    let p_axial = 0.3 * pcr_pp;
    let fy_perturb = 0.001;
    let midspan = n / 2 + 1;

    // Pinned-pinned: P/Pcr = 0.3
    let input_pp = make_column_with_lateral(
        n, l, "pinned", "rollerX", -p_axial, vec![(midspan, fy_perturb)],
    );
    let res_pp = pdelta::solve_pdelta_2d(&input_pp, 50, 1e-6).unwrap();
    assert!(res_pp.converged, "Pinned-pinned P-delta should converge");
    let d_pp = res_pp.results.displacements.iter()
        .find(|d| d.node_id == midspan).unwrap().uy.abs();

    // Fixed-fixed: P/Pcr = 0.3/4 = 0.075 (much further from buckling)
    // Use guidedX at tip for fixed-fixed boundary (rotation + transverse restrained)
    let input_ff = make_column_with_lateral(
        n, l, "fixed", "guidedX", -p_axial, vec![(midspan, fy_perturb)],
    );
    let res_ff = pdelta::solve_pdelta_2d(&input_ff, 50, 1e-6).unwrap();
    assert!(res_ff.converged, "Fixed-fixed P-delta should converge");
    let d_ff = res_ff.results.displacements.iter()
        .find(|d| d.node_id == midspan).unwrap().uy.abs();

    // Fixed-fixed should deflect significantly less
    assert!(
        d_ff < d_pp,
        "Fixed-fixed deflection ({:.6e}) < pinned-pinned ({:.6e})",
        d_ff, d_pp
    );

    // The ratio should be substantial (fixed-fixed is much stiffer)
    let ratio = d_pp / d_ff;
    assert!(
        ratio > 2.0,
        "Pinned/Fixed deflection ratio = {:.2}, expected > 2.0",
        ratio
    );
}

// ================================================================
// 4. P-Delta Amplification Factor
// ================================================================
//
// Pinned-pinned column L=5m, 10 elements.
// Compare linear lateral displacement (no axial) vs P-delta (with axial).
// Theoretical amplification: 1/(1 - P/Pcr) = 1/0.7 = 1.429 at P=0.3*Pcr.

#[test]
fn validation_column_curves_pdelta_amplification_factor() {
    let l = 5.0;
    let n = 10;
    let pcr = pcr_pinned_pinned(l);
    let midspan = n / 2 + 1; // node 6
    let q_lateral = 1.0; // 1 kN lateral at midspan

    // Case 1: Linear analysis, lateral only (no axial)
    let input_linear = make_column_with_lateral(
        n, l, "pinned", "rollerX", 0.0, vec![(midspan, q_lateral)],
    );
    let res_linear = linear::solve_2d(&input_linear).unwrap();
    let d_linear = res_linear.displacements.iter()
        .find(|d| d.node_id == midspan).unwrap().uy.abs();

    // Case 2: P-delta with P = 0.3*Pcr + same lateral
    let p_axial = 0.3 * pcr;
    let input_pdelta = make_column_with_lateral(
        n, l, "pinned", "rollerX", -p_axial, vec![(midspan, q_lateral)],
    );
    let res_pdelta = pdelta::solve_pdelta_2d(&input_pdelta, 50, 1e-6).unwrap();
    assert!(res_pdelta.converged, "P-delta should converge at 0.3*Pcr");
    let d_pdelta = res_pdelta.results.displacements.iter()
        .find(|d| d.node_id == midspan).unwrap().uy.abs();

    // Amplification factor
    let amp = d_pdelta / d_linear;
    let theoretical = 1.0 / (1.0 - 0.3); // 1.429

    // P-delta is approximate, and exact amplification depends on load pattern,
    // so allow 20% tolerance
    assert!(
        (amp - theoretical).abs() / theoretical < 0.20,
        "Amplification factor: {:.3}, theoretical: {:.3}",
        amp, theoretical
    );

    // At minimum, pdelta must be larger
    assert!(
        d_pdelta > d_linear,
        "P-delta deflection ({:.6e}) > linear ({:.6e})",
        d_pdelta, d_linear
    );
}

// ================================================================
// 5. Column Stiffness Reduction Under Axial Load
// ================================================================
//
// Pinned-pinned column L=6m, 8 elements.
// Lateral stiffness k = F/delta. Under axial P=0.5*Pcr,
// effective stiffness should drop: k/k0 ~ 1 - P/Pcr = 0.5.

#[test]
fn validation_column_curves_stiffness_reduction() {
    let l = 6.0;
    let n = 8;
    let pcr = pcr_pinned_pinned(l);
    let midspan = n / 2 + 1;
    let f_lateral = 1.0; // 1 kN

    // Case 1: No axial, measure lateral stiffness k0 = F/delta
    let input_no_axial = make_column_with_lateral(
        n, l, "pinned", "rollerX", 0.0, vec![(midspan, f_lateral)],
    );
    let res_no_axial = linear::solve_2d(&input_no_axial).unwrap();
    let d0 = res_no_axial.displacements.iter()
        .find(|d| d.node_id == midspan).unwrap().uy.abs();
    let k0 = f_lateral / d0;

    // Case 2: Axial P = 0.5*Pcr + same lateral, measure effective stiffness
    let p_axial = 0.5 * pcr;
    let input_axial = make_column_with_lateral(
        n, l, "pinned", "rollerX", -p_axial, vec![(midspan, f_lateral)],
    );
    let res_axial = pdelta::solve_pdelta_2d(&input_axial, 50, 1e-6).unwrap();
    assert!(res_axial.converged, "P-delta should converge at 0.5*Pcr");
    let d_axial = res_axial.results.displacements.iter()
        .find(|d| d.node_id == midspan).unwrap().uy.abs();
    let k_eff = f_lateral / d_axial;

    // Stiffness ratio should be approximately 1 - P/Pcr = 0.5
    let stiffness_ratio = k_eff / k0;
    let theoretical_ratio = 1.0 - 0.5; // 0.5

    assert!(
        (stiffness_ratio - theoretical_ratio).abs() / theoretical_ratio < 0.25,
        "Stiffness ratio k/k0 = {:.3}, theoretical: {:.3}",
        stiffness_ratio, theoretical_ratio
    );

    // Stiffness must be reduced
    assert!(
        k_eff < k0,
        "Axial compression reduces stiffness: k_eff={:.4} < k0={:.4}",
        k_eff, k0
    );
}

// ================================================================
// 6. Short vs Long Column at Same P/Pcr Ratio
// ================================================================
//
// Same cross-section, L1=2m vs L2=6m. Both pinned-pinned.
// Pcr proportional to 1/L^2, ratio = (6/2)^2 = 9.
// At same P/Pcr ratio (0.3), amplification should be similar.

#[test]
fn validation_column_curves_short_vs_long_column() {
    let l_short = 2.0;
    let l_long = 6.0;
    let n = 8;
    let f_lateral = 1.0;

    let pcr_short = pcr_pinned_pinned(l_short);
    let pcr_long = pcr_pinned_pinned(l_long);

    // Verify Pcr ratio: (L_long/L_short)^2 = 9
    let pcr_ratio = pcr_short / pcr_long;
    assert!(
        (pcr_ratio - 9.0).abs() < 0.1,
        "Pcr ratio = {:.2}, expected 9.0",
        pcr_ratio
    );

    // Function to compute amplification at a given length
    let compute_amplification = |l: f64, pcr: f64| -> f64 {
        let midspan = n / 2 + 1;
        let p_axial = 0.3 * pcr;

        // Linear: lateral only
        let input_lin = make_column_with_lateral(
            n, l, "pinned", "rollerX", 0.0, vec![(midspan, f_lateral)],
        );
        let d_lin = linear::solve_2d(&input_lin).unwrap()
            .displacements.iter()
            .find(|d| d.node_id == midspan).unwrap().uy.abs();

        // P-delta: axial + lateral
        let input_pd = make_column_with_lateral(
            n, l, "pinned", "rollerX", -p_axial, vec![(midspan, f_lateral)],
        );
        let d_pd = pdelta::solve_pdelta_2d(&input_pd, 50, 1e-6).unwrap()
            .results.displacements.iter()
            .find(|d| d.node_id == midspan).unwrap().uy.abs();

        d_pd / d_lin
    };

    let amp_short = compute_amplification(l_short, pcr_short);
    let amp_long = compute_amplification(l_long, pcr_long);

    // Both at P/Pcr = 0.3, amplification should be similar (~1.43)
    // Allow 20% difference between the two
    let diff = (amp_short - amp_long).abs() / amp_short.max(amp_long);
    assert!(
        diff < 0.20,
        "Amplification at same P/Pcr: short={:.3}, long={:.3}, diff={:.1}%",
        amp_short, amp_long, diff * 100.0
    );

    // Both should show amplification > 1
    assert!(
        amp_short > 1.0 && amp_long > 1.0,
        "Both should show amplification: short={:.3}, long={:.3}",
        amp_short, amp_long
    );
}

// ================================================================
// 7. Axial Load Effect: Tension Stiffens, Compression Softens
// ================================================================
//
// Pinned-pinned column L=5m, 10 elements.
// Case 1: no axial, lateral P=1kN at midspan -> delta_1
// Case 2: axial tension T=0.5*Pcr + same lateral -> delta_2 (smaller: tension stiffens)
// Case 3: axial compression C=0.5*Pcr + same lateral -> delta_3 (larger: compression softens)
// Verify: delta_3 > delta_1 > delta_2

#[test]
fn validation_column_curves_tension_compression_effect() {
    let l = 5.0;
    let n = 10;
    let pcr = pcr_pinned_pinned(l);
    let midspan = n / 2 + 1;
    let f_lateral = 1.0;
    let p_half_pcr = 0.5 * pcr;

    // Case 1: No axial load (linear)
    let input_no_axial = make_column_with_lateral(
        n, l, "pinned", "rollerX", 0.0, vec![(midspan, f_lateral)],
    );
    let d1 = linear::solve_2d(&input_no_axial).unwrap()
        .displacements.iter()
        .find(|d| d.node_id == midspan).unwrap().uy.abs();

    // Case 2: Axial tension (fx > 0 at tip, pulling away from fixed end)
    // For tension, we apply positive fx (tension along X-axis)
    let input_tension = make_column_with_lateral(
        n, l, "pinned", "rollerX", p_half_pcr, vec![(midspan, f_lateral)],
    );
    let res_tension = pdelta::solve_pdelta_2d(&input_tension, 50, 1e-6).unwrap();
    assert!(res_tension.converged, "Tension P-delta should converge");
    let d2 = res_tension.results.displacements.iter()
        .find(|d| d.node_id == midspan).unwrap().uy.abs();

    // Case 3: Axial compression (fx < 0)
    let input_compression = make_column_with_lateral(
        n, l, "pinned", "rollerX", -p_half_pcr, vec![(midspan, f_lateral)],
    );
    let res_compression = pdelta::solve_pdelta_2d(&input_compression, 50, 1e-6).unwrap();
    assert!(res_compression.converged, "Compression P-delta should converge");
    let d3 = res_compression.results.displacements.iter()
        .find(|d| d.node_id == midspan).unwrap().uy.abs();

    // Compression softens (larger deflection), tension stiffens (smaller deflection)
    assert!(
        d3 > d1,
        "Compression softens: d_compression ({:.6e}) > d_no_axial ({:.6e})",
        d3, d1
    );
    assert!(
        d1 > d2,
        "Tension stiffens: d_no_axial ({:.6e}) > d_tension ({:.6e})",
        d1, d2
    );
}

// ================================================================
// 8. Two-Column Portal Frame: Nonlinear Sway Growth
// ================================================================
//
// Portal frame h=4, w=6. Both columns carry axial load.
// As gravity load increases toward frame buckling, sway grows nonlinearly.
// Low load vs high load: high load causes disproportionately more sway.

#[test]
fn validation_column_curves_portal_frame_nonlinear_sway() {
    let h = 4.0;
    let w = 6.0;
    let p_lateral = 1.0; // small lateral perturbation

    // Helper to compute sway at given gravity level
    let compute_sway = |gravity: f64| -> f64 {
        let input = make_portal_frame(h, w, E, A, IZ, p_lateral, gravity);
        let res = pdelta::solve_pdelta_2d(&input, 50, 1e-6).unwrap();
        assert!(res.converged, "P-delta should converge at gravity={:.1}", gravity);
        res.results.displacements.iter()
            .find(|d| d.node_id == 2).unwrap().ux.abs()
    };

    // Also compute linear sway for reference
    let compute_sway_linear = |gravity: f64| -> f64 {
        let input = make_portal_frame(h, w, E, A, IZ, p_lateral, gravity);
        let res = linear::solve_2d(&input).unwrap();
        res.displacements.iter()
            .find(|d| d.node_id == 2).unwrap().ux.abs()
    };

    // Low gravity load
    let g_low = -30.0;
    let sway_low = compute_sway(g_low);
    let sway_low_lin = compute_sway_linear(g_low);

    // High gravity load (but still below buckling)
    let g_high = -150.0;
    let sway_high = compute_sway(g_high);
    let sway_high_lin = compute_sway_linear(g_high);

    // Both P-delta sways should exceed linear sways
    assert!(
        sway_low > sway_low_lin * 0.99,
        "P-delta sway >= linear at low gravity: {:.6e} vs {:.6e}",
        sway_low, sway_low_lin
    );
    assert!(
        sway_high > sway_high_lin,
        "P-delta sway > linear at high gravity: {:.6e} vs {:.6e}",
        sway_high, sway_high_lin
    );

    // Nonlinear growth: amplification increases with gravity
    let amp_low = sway_low / sway_low_lin;
    let amp_high = sway_high / sway_high_lin;

    assert!(
        amp_high > amp_low,
        "Higher gravity gives more amplification: amp_high={:.3} > amp_low={:.3}",
        amp_high, amp_low
    );

    // P-delta sway should grow nonlinearly: with constant lateral perturbation,
    // higher gravity causes disproportionately more sway via amplification.
    // sway_high > sway_low because amplification is larger.
    assert!(
        sway_high > sway_low,
        "Higher gravity increases P-delta sway: {:.6e} > {:.6e}",
        sway_high, sway_low
    );

    // The amplification at high gravity should be meaningfully larger than at low gravity.
    // This demonstrates the nonlinear relationship between gravity and lateral response.
    assert!(
        amp_high > 1.01 * amp_low,
        "Amplification grows nonlinearly: amp_high={:.4} > 1.01*amp_low={:.4}",
        amp_high, 1.01 * amp_low
    );
}
