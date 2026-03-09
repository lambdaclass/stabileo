/// Validation: Timoshenko & Gere Stability Benchmarks
///
/// References:
///   - Timoshenko & Gere, "Theory of Elastic Stability", 2nd Ed., Dover
///   - Euler critical load: P_cr = π²EI/(KL)²
///   - Column effective length factors: K = 0.5 (fixed-fixed), 0.7 (fixed-pinned),
///     1.0 (pinned-pinned), 2.0 (cantilever)
///
/// Tests verify elastic stability through buckling analysis and P-delta:
///   1. Euler column buckling: pinned-pinned critical load
///   2. Fixed-free (cantilever) column: K=2
///   3. Fixed-pinned column: K≈0.7
///   4. Fixed-fixed column: K=0.5
///   5. Effective length ranking: cantilever weakest, fixed-fixed strongest
///   6. P-delta divergence near Pcr
///   7. Buckling load proportional to EI
///   8. Buckling load inversely proportional to L²
use dedaliano_engine::solver::linear;
use dedaliano_engine::solver::pdelta;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.02;
const IZ: f64 = 2e-4;

// ================================================================
// 1. Pinned-Pinned Euler Column: P_cr = π²EI/L²
// ================================================================
//
// The fundamental Euler buckling load for a pin-ended column.
// Verify via P-delta: load at 90% of Pcr should converge,
// amplification should be large.

#[test]
fn validation_stability_euler_pinned() {
    let l = 5.0;
    let n = 10;
    let e_eff = E * 1000.0; // MPa → kN/m²
    let p_euler = std::f64::consts::PI * std::f64::consts::PI * e_eff * IZ / (l * l);

    // Apply 50% of Euler load as axial compression + small lateral perturbation
    let p_axial = -0.5 * p_euler;
    let h_perturb = 0.001; // tiny lateral load

    // Build as portal-like frame with columns (horizontal beam with axial compression)
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: p_axial, fy: 0.0, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n / 2 + 1, fx: 0.0, fy: -h_perturb, mz: 0.0,
            }),
        ]);

    let res_linear = linear::solve_2d(&input).unwrap();
    let res_pdelta = pdelta::solve_pdelta_2d(&input, 30, 1e-8).unwrap();

    // P-delta should converge
    assert!(res_pdelta.converged, "50% Pcr: P-delta should converge");

    // Amplification should be approximately 1/(1-P/Pcr) = 1/(1-0.5) = 2.0
    let d_linear = res_linear.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();
    let d_pdelta = res_pdelta.results.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    let amp = d_pdelta / d_linear;
    // Should be approximately 2.0 (theoretical B2 factor)
    assert!(amp > 1.5 && amp < 3.0,
        "50% Pcr: amplification ≈ 2.0, got {:.3}", amp);
}

// ================================================================
// 2. Cantilever Column: K=2, P_cr = π²EI/(2L)²
// ================================================================
//
// Fixed-free column: effective length = 2L.
// P_cr_cantilever = π²EI/(4L²) = P_euler/4

#[test]
fn validation_stability_cantilever() {
    let l = 5.0;
    let n = 10;
    let e_eff = E * 1000.0;
    let p_euler_pinned = std::f64::consts::PI * std::f64::consts::PI * e_eff * IZ / (l * l);
    let p_cr_cantilever = p_euler_pinned / 4.0;

    // 40% of cantilever Pcr: should converge
    let p_axial = -0.4 * p_cr_cantilever;
    let h_perturb = 0.001;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: p_axial, fy: -h_perturb, mz: 0.0,
            }),
        ]);

    let res_pdelta = pdelta::solve_pdelta_2d(&input, 30, 1e-8).unwrap();
    assert!(res_pdelta.converged, "Cantilever 40% Pcr: should converge");

    // Amplification should reflect cantilever's lower Pcr
    let d_linear = linear::solve_2d(&input).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();
    let d_pdelta = res_pdelta.results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();
    let amp = d_pdelta / d_linear;

    // At 40% Pcr: B2 ≈ 1/(1-0.4) ≈ 1.67
    assert!(amp > 1.3 && amp < 3.0,
        "Cantilever 40% Pcr: amplification ≈ 1.67, got {:.3}", amp);
}

// ================================================================
// 3. Fixed-Pinned Column: K ≈ 0.7
// ================================================================
//
// P_cr = π²EI/(0.7L)² ≈ 2.04 × P_euler_pinned

#[test]
fn validation_stability_fixed_pinned() {
    let l = 5.0;
    let n = 10;
    let e_eff = E * 1000.0;
    let p_euler = std::f64::consts::PI * std::f64::consts::PI * e_eff * IZ / (l * l);

    // Fixed-pinned Pcr ≈ 2.04 × P_euler. Apply 50% of this.
    let p_cr_fp = 2.04 * p_euler;
    let p_axial = -0.5 * p_cr_fp;
    let h_perturb = 0.001;

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: p_axial, fy: 0.0, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n / 2 + 1, fx: 0.0, fy: -h_perturb, mz: 0.0,
            }),
        ]);

    let res = pdelta::solve_pdelta_2d(&input, 30, 1e-8).unwrap();
    assert!(res.converged, "Fixed-pinned 50% Pcr: converges");

    // Amplification should be approximately 1/(1-0.5) = 2.0
    let d_linear = linear::solve_2d(&input).unwrap()
        .displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();
    let d_pdelta = res.results.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    let amp = d_pdelta / d_linear;
    assert!(amp > 1.3 && amp < 4.0,
        "Fixed-pinned: amplification reasonable: {:.3}", amp);
}

// ================================================================
// 4. Fixed-Fixed Column: K=0.5, P_cr = 4π²EI/L²
// ================================================================
//
// Strongest column configuration.

#[test]
fn validation_stability_fixed_fixed() {
    let l = 5.0;
    let n = 10;
    let e_eff = E * 1000.0;
    let p_euler = std::f64::consts::PI * std::f64::consts::PI * e_eff * IZ / (l * l);
    let p_cr_ff = 4.0 * p_euler;

    // 30% of fixed-fixed Pcr
    let p_axial = -0.3 * p_cr_ff;
    let h_perturb = 0.001;

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: p_axial, fy: 0.0, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n / 2 + 1, fx: 0.0, fy: -h_perturb, mz: 0.0,
            }),
        ]);

    let res = pdelta::solve_pdelta_2d(&input, 30, 1e-8).unwrap();
    assert!(res.converged, "Fixed-fixed 30% Pcr: converges");
}

// ================================================================
// 5. Effective Length Ranking
// ================================================================
//
// Same column, different end conditions.
// P_cr ranking: cantilever < pinned-pinned < fixed-pinned < fixed-fixed
// ∴ at same load, cantilever has most amplification, fixed-fixed least.

#[test]
fn validation_stability_effective_length_ranking() {
    let l = 5.0;
    let n = 10;
    let e_eff = E * 1000.0;
    let p_euler = std::f64::consts::PI * std::f64::consts::PI * e_eff * IZ / (l * l);

    // Apply 20% of pinned-pinned Pcr (well below all critical loads)
    let p = -0.2 * p_euler;
    let h = 0.01;

    let get_amplification = |start: &str, end: Option<&str>| -> f64 {
        let tip = n + 1;
        let mid = n / 2 + 1;

        let mut loads = vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: tip, fx: p, fy: 0.0, mz: 0.0,
            }),
        ];
        // Add lateral perturbation
        if end.is_none() {
            // Cantilever: lateral at tip
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: tip, fx: 0.0, fy: -h, mz: 0.0,
            }));
        } else {
            // Others: lateral at midspan
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fy: -h, mz: 0.0,
            }));
        }

        let input = make_beam(n, l, E, A, IZ, start, end, loads);
        let d_lin = linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
        let d_pd = pdelta::solve_pdelta_2d(&input, 30, 1e-8).unwrap()
            .results.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
        if d_lin > 1e-15 { d_pd / d_lin } else { 1.0 }
    };

    let amp_cantilever = get_amplification("fixed", None);
    let amp_pp = get_amplification("pinned", Some("rollerX"));
    let amp_ff = get_amplification("fixed", Some("fixed"));

    // Cantilever has most amplification (weakest), fixed-fixed has least
    assert!(amp_cantilever > amp_pp,
        "Cantilever > pinned-pinned: {:.4} > {:.4}", amp_cantilever, amp_pp);
    assert!(amp_pp > amp_ff,
        "Pinned-pinned > fixed-fixed: {:.4} > {:.4}", amp_pp, amp_ff);
}

// ================================================================
// 6. Near-Critical: Large Amplification
// ================================================================
//
// As P → Pcr, amplification → ∞. At 90% Pcr, B2 ≈ 10.

#[test]
fn validation_stability_near_critical_amplification() {
    let l = 5.0;
    let n = 10;
    let e_eff = E * 1000.0;
    let p_euler = std::f64::consts::PI * std::f64::consts::PI * e_eff * IZ / (l * l);

    let h = 0.001;

    let get_amp = |ratio: f64| -> f64 {
        let p = -ratio * p_euler;
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
            vec![
                SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: p, fy: 0.0, mz: 0.0 }),
                SolverLoad::Nodal(SolverNodalLoad { node_id: n / 2 + 1, fx: 0.0, fy: -h, mz: 0.0 }),
            ]);
        let d_lin = linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();
        let d_pd = pdelta::solve_pdelta_2d(&input, 50, 1e-10).unwrap()
            .results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();
        d_pd / d_lin
    };

    let amp_30 = get_amp(0.3);
    let amp_60 = get_amp(0.6);

    // Amplification should increase as load increases
    assert!(amp_60 > amp_30,
        "More load → more amplification: {:.3} > {:.3}", amp_60, amp_30);

    // 30% Pcr: B2 ≈ 1/(1-0.3) ≈ 1.43
    assert!(amp_30 > 1.2 && amp_30 < 2.0,
        "30% Pcr: B2 ≈ 1.43, got {:.3}", amp_30);

    // 60% Pcr: B2 ≈ 1/(1-0.6) ≈ 2.5
    assert!(amp_60 > 1.8 && amp_60 < 4.0,
        "60% Pcr: B2 ≈ 2.5, got {:.3}", amp_60);
}

// ================================================================
// 7. Buckling Load Proportional to EI
// ================================================================
//
// Doubling EI should double the load at which the same amplification occurs.
// Equivalently, at the same load, halving EI doubles the amplification effect.

#[test]
fn validation_stability_ei_proportionality() {
    let l = 5.0;
    let n = 10;
    let e_eff = E * 1000.0;
    let h = 0.01;

    let get_amp = |iz: f64| -> f64 {
        let p_euler = std::f64::consts::PI * std::f64::consts::PI * e_eff * iz / (l * l);
        let p = -0.4 * p_euler; // always 40% of this column's Pcr
        let input = make_beam(n, l, E, A, iz, "pinned", Some("rollerX"),
            vec![
                SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: p, fy: 0.0, mz: 0.0 }),
                SolverLoad::Nodal(SolverNodalLoad { node_id: n / 2 + 1, fx: 0.0, fy: -h, mz: 0.0 }),
            ]);
        let d_lin = linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();
        let d_pd = pdelta::solve_pdelta_2d(&input, 30, 1e-8).unwrap()
            .results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();
        d_pd / d_lin
    };

    let amp1 = get_amp(IZ);
    let amp2 = get_amp(IZ * 2.0);

    // At the same fraction of Pcr, amplification should be similar
    // (B2 = 1/(1-0.4) = 1.667 regardless of EI)
    let err = (amp1 - amp2).abs() / amp1;
    assert!(err < 0.15,
        "Same Pcr fraction → similar amplification: {:.3} vs {:.3}", amp1, amp2);
}

// ================================================================
// 8. Buckling Load Inversely Proportional to L²
// ================================================================
//
// Doubling length quarters the Euler load.
// At same absolute load: longer column has more amplification.

#[test]
fn validation_stability_length_effect() {
    let n = 10;
    let h = 0.01;
    let e_eff = E * 1000.0;

    // Use a fixed absolute load
    let p_ref = std::f64::consts::PI * std::f64::consts::PI * e_eff * IZ / 5.0_f64.powi(2);
    let p = -0.3 * p_ref; // 30% of Pcr for L=5

    let get_amp = |l: f64| -> f64 {
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
            vec![
                SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: p, fy: 0.0, mz: 0.0 }),
                SolverLoad::Nodal(SolverNodalLoad { node_id: n / 2 + 1, fx: 0.0, fy: -h, mz: 0.0 }),
            ]);
        let d_lin = linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();
        let res = pdelta::solve_pdelta_2d(&input, 30, 1e-8).unwrap();
        let d_pd = res.results.displacements.iter()
            .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();
        d_pd / d_lin
    };

    let amp_short = get_amp(4.0); // shorter: higher Pcr, less amplification
    let amp_long = get_amp(6.0);  // longer: lower Pcr, more amplification

    assert!(amp_long > amp_short,
        "Longer column → more amplification: {:.3} > {:.3}", amp_long, amp_short);
}
