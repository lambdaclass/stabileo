/// Validation: Structural Optimization Fundamentals
///
/// References:
///   - Haftka & Gürdal: "Elements of Structural Optimization" 3rd ed. (1992)
///   - Bendsøe & Sigmund: "Topology Optimization" (2003)
///   - Christensen & Klarbring: "An Introduction to Structural Optimization" (2009)
///   - Arora: "Introduction to Optimum Design" 4th ed. (2016)
///   - Michell (1904): "The Limits of Economy of Material in Frame Structures"
///   - Dorn, Gomory & Greenberg (1964): Ground Structure Method
///
/// Tests verify fully stressed design, Michell truss, shape optimization,
/// cross-section optimization, weight minimization, and topology concepts.

mod helpers;

// ================================================================
// 1. Fully Stressed Design (FSD) -- Sizing
// ================================================================
//
// Iterative resizing: scale each member area proportional to stress ratio.
// A_new = A_old × σ_actual / σ_allowable
// Converges for statically determinate structures in one step.

#[test]
fn optim_fully_stressed_design() {
    let sigma_allow: f64 = 250.0; // MPa
    let forces: [f64; 3] = [100.0, 200.0, 150.0]; // kN, member forces
    let areas_initial: [f64; 3] = [1000.0, 1000.0, 1000.0]; // mm², initial areas

    // Initial stresses
    let stresses: Vec<f64> = forces.iter().zip(areas_initial.iter())
        .map(|(f, a)| f * 1000.0 / a)
        .collect();

    // FSD iteration (for determinate: one step)
    let areas_fsd: Vec<f64> = forces.iter()
        .map(|f| f * 1000.0 / sigma_allow)
        .collect();

    // All members now at allowable stress
    for (i, a) in areas_fsd.iter().enumerate() {
        let sigma: f64 = forces[i] * 1000.0 / a;
        assert!(
            (sigma - sigma_allow).abs() < 1.0,
            "Member {}: σ = {:.1} ≈ σ_allow = {:.1}", i, sigma, sigma_allow
        );
    }

    // Weight reduction
    let w_initial: f64 = areas_initial.iter().sum::<f64>();
    let w_optimized: f64 = areas_fsd.iter().sum::<f64>();

    assert!(
        w_optimized < w_initial,
        "Weight: {:.0} < {:.0} mm² (total)", w_optimized, w_initial
    );

    let _stresses = stresses;
}

// ================================================================
// 2. Michell Truss -- Theoretical Minimum Weight
// ================================================================
//
// Michell (1904): for a given load and two support points,
// minimum-weight truss has members aligned with principal stress trajectories.
// Volume = F × L / σ (theoretical minimum for single load case).

#[test]
fn optim_michell_truss() {
    let f: f64 = 100.0;         // kN, applied load
    let l: f64 = 5.0;           // m, span
    let sigma_allow: f64 = 250.0; // MPa, both tension & compression

    // Theoretical minimum volume (Michell bound)
    // V_min = F × L / σ × C (where C depends on geometry)
    // For cantilever with point load: C ≈ 1.0 (simplest case)
    let v_michell: f64 = f * 1000.0 * l * 1000.0 / sigma_allow; // mm³
    // = 100000 × 5000 / 250 = 2,000,000 mm³

    assert!(
        v_michell > 1e6,
        "Michell volume: {:.0} mm³", v_michell
    );

    // Any practical truss will weigh more
    // Simple Warren truss for same problem
    let n_members: usize = 5;
    let avg_length: f64 = l / 2.0 * 1000.0; // mm
    let avg_force: f64 = f * 1000.0 * 0.8;  // N (average member force, approximate)
    let avg_area: f64 = avg_force / sigma_allow;
    let v_warren: f64 = n_members as f64 * avg_area * avg_length;

    // Warren volume > Michell bound
    assert!(
        v_warren > v_michell,
        "Warren {:.0} > Michell {:.0} mm³", v_warren, v_michell
    );

    // Efficiency
    let efficiency: f64 = v_michell / v_warren;
    assert!(
        efficiency < 1.0 && efficiency > 0.3,
        "Efficiency: {:.1}%", efficiency * 100.0
    );
}

// ================================================================
// 3. Cross-Section Optimization -- Minimum Weight Beam
// ================================================================
//
// For given moment capacity: minimize weight.
// I-beam is optimal for bending: most material at flanges.
// Optimal flange thickness: balance local buckling vs. weight.

#[test]
fn optim_beam_cross_section() {
    let m_design: f64 = 500.0;  // kN·m
    let fy: f64 = 355.0;        // MPa
    let l: f64 = 8.0;           // m, span

    // Required section modulus
    let w_required: f64 = m_design * 1e6 / fy; // mm³

    assert!(
        w_required > 1e6,
        "Required W: {:.0} mm³", w_required
    );

    // Compare rectangular vs I-section
    // Rectangular: b×d, W = b*d²/6
    let d_rect: f64 = 500.0;    // mm
    let b_rect: f64 = 6.0 * w_required / (d_rect * d_rect);
    let a_rect: f64 = b_rect * d_rect;

    // I-section: flanges carry bending
    let d_i: f64 = 500.0;       // mm, total depth
    let tf: f64 = 20.0;         // mm, flange thickness
    let bf: f64 = 200.0;        // mm, flange width
    let tw: f64 = 10.0;         // mm, web thickness
    let hw: f64 = d_i - 2.0 * tf;

    // I-section modulus (approximate)
    let i_x: f64 = 2.0 * bf * tf * (d_i / 2.0 - tf / 2.0).powi(2)
        + tw * hw.powi(3) / 12.0;
    let w_i: f64 = i_x / (d_i / 2.0);

    let a_i: f64 = 2.0 * bf * tf + hw * tw;

    // I-section is much lighter for same W
    assert!(
        a_i < a_rect,
        "I-section {:.0} < rect {:.0} mm²", a_i, a_rect
    );

    // Weight saving
    let saving: f64 = (1.0 - a_i / a_rect) * 100.0;
    assert!(
        saving > 20.0,
        "Weight saving: {:.0}%", saving
    );

    let _l = l;
    let _w_i = w_i;
}

// ================================================================
// 4. Shape Optimization -- Constant Stress Arch
// ================================================================
//
// Optimal arch shape for uniform load: parabolic.
// Optimal arch shape for self-weight: catenary.
// No bending in optimal arch → minimum material.

#[test]
fn optim_arch_shape() {
    let l: f64 = 30.0;          // m, span
    let f_rise: f64 = 10.0;     // m, rise
    let w: f64 = 20.0;          // kN/m, uniform load

    // Parabolic arch: y(x) = 4f*x*(L-x)/L²
    // Horizontal thrust: H = w*L²/(8f)
    let h: f64 = w * l * l / (8.0 * f_rise);

    // Maximum axial force (at support)
    let v_support: f64 = w * l / 2.0;
    let n_max: f64 = (h * h + v_support * v_support).sqrt();

    assert!(
        n_max > h,
        "N_max = {:.0} > H = {:.0} kN", n_max, h
    );

    // Bending moment in parabolic arch under uniform load = 0
    // (arch shape matches pressure line)
    let m_arch: f64 = 0.0;

    // Compare with circular arch (non-optimal)
    // Circular arch has bending moments under uniform load
    let r_circ: f64 = (l * l / 4.0 + f_rise * f_rise) / (2.0 * f_rise);
    // Moment at crown (approximate): M ≈ H × (f_parabola - f_circle)
    // At quarter point the difference is noticeable
    let x_quarter: f64 = l / 4.0;
    let y_parabola: f64 = 4.0 * f_rise * x_quarter * (l - x_quarter) / (l * l);
    let y_circle: f64 = f_rise - (r_circ - (r_circ * r_circ - (x_quarter - l / 2.0).powi(2)).sqrt());
    let m_circular: f64 = (h * (y_parabola - y_circle)).abs();

    assert!(
        m_circular > m_arch,
        "Circular M = {:.1} > parabolic M = {:.1} kN·m (parabolic optimal)", m_circular, m_arch
    );
}

// ================================================================
// 5. Weight Minimization -- Stress Constraints
// ================================================================
//
// min Σ(ρ × Ai × Li)
// s.t. σi ≤ σ_allow for all members
// For determinate truss: analytical solution = FSD.

#[test]
fn optim_weight_minimization() {
    let rho: f64 = 7850.0;      // kg/m³, steel density
    let sigma_allow_t: f64 = 250.0; // MPa, tension
    let sigma_allow_c: f64 = 150.0; // MPa, compression (reduced for buckling)

    // 3-bar truss problem (classic optimization benchmark)
    let f_applied: f64 = 100.0; // kN
    let bar_lengths: [f64; 3] = [1000.0, 1414.0, 1000.0]; // mm
    let bar_forces: [f64; 3] = [70.7, -100.0, 70.7]; // kN (tension, compression, tension)

    // Optimal areas (FSD for determinate structure)
    let mut total_weight: f64 = 0.0;
    for i in 0..3 {
        let sigma_limit: f64 = if bar_forces[i] > 0.0 { sigma_allow_t } else { sigma_allow_c };
        let a_opt: f64 = bar_forces[i].abs() * 1000.0 / sigma_limit;
        let weight: f64 = rho * a_opt * 1e-6 * bar_lengths[i] * 1e-3; // kg

        total_weight += weight;
    }

    assert!(
        total_weight > 0.0,
        "Total weight: {:.2} kg", total_weight
    );

    // Compare with uniform sizing
    let a_uniform: f64 = f_applied * 1000.0 / sigma_allow_c; // sized for worst member
    let weight_uniform: f64 = rho * a_uniform * 1e-6
        * bar_lengths.iter().sum::<f64>() * 1e-3;

    assert!(
        total_weight < weight_uniform,
        "Optimal {:.2} < uniform {:.2} kg", total_weight, weight_uniform
    );
}

// ================================================================
// 6. Topology Indicator -- SIMP Method Concept
// ================================================================
//
// SIMP: Solid Isotropic Material with Penalization.
// E(x) = x^p × E0, where x ∈ [0,1] is density variable, p ≥ 3.
// Penalization drives intermediate densities to 0 or 1.

#[test]
fn optim_simp_concept() {
    let e0: f64 = 210_000.0;    // MPa, solid steel modulus
    let p: f64 = 3.0;           // penalization exponent

    // Density-stiffness relationship
    let densities: [f64; 5] = [0.0, 0.25, 0.50, 0.75, 1.0];

    let mut prev_e: f64 = -1.0;
    for &x in &densities {
        let e_x: f64 = x.powf(p) * e0;

        assert!(
            e_x >= prev_e,
            "E({:.2}) = {:.0} MPa (monotonic)", x, e_x
        );
        prev_e = e_x;

        // Penalization effect: at x=0.5, E = 0.125*E0 (not 0.5*E0)
        if (x - 0.5).abs() < 0.01 {
            let ratio: f64 = e_x / e0;
            assert!(
                ratio < 0.2,
                "SIMP penalization: E/E0 = {:.3} at x=0.5 (< linear 0.5)", ratio
            );
        }
    }

    // Volume constraint check
    let n_elements: usize = 100;
    let volume_fraction: f64 = 0.40; // keep 40% of material
    let max_volume: f64 = volume_fraction * n_elements as f64;

    // Optimal topology assigns x=1 or x=0
    let n_solid: usize = (volume_fraction * n_elements as f64) as usize;
    let n_void: usize = n_elements - n_solid;

    assert!(
        n_solid as f64 <= max_volume,
        "Solid elements: {} ≤ volume limit {:.0}", n_solid, max_volume
    );

    assert!(
        n_void > n_solid,
        "Void {} > solid {} (60% removed)", n_void, n_solid
    );
}

// ================================================================
// 7. Compliance Minimization -- Stiffness Maximization
// ================================================================
//
// Minimize compliance C = F^T × u (= 2 × strain energy)
// Subject to volume constraint.
// Equivalent to maximizing stiffness.

#[test]
fn optim_compliance_minimization() {
    // Simple beam: compare two cross-section distributions
    let l: f64 = 6.0;           // m, span
    let p: f64 = 50.0;          // kN, midpoint load
    let e: f64 = 210_000.0;     // MPa

    // Uniform beam
    let i_uniform: f64 = 5e7;   // mm⁴, constant along span
    let delta_uniform: f64 = p * 1000.0 * (l * 1000.0).powi(3) / (48.0 * e * i_uniform);

    // Compliance (uniform)
    let c_uniform: f64 = p * 1000.0 * delta_uniform; // N·mm

    // Optimized beam (deeper at midspan, thinner at ends)
    // Varying I: parabolic, I(x) = I_max × (1 - (2x/L - 1)²)
    // Average I ≈ 2/3 × I_max
    let i_max: f64 = 1.5 * i_uniform; // same total material
    // Deflection of variable section (approximate): ~70% of uniform
    let delta_opt: f64 = delta_uniform * 0.70;

    // Compliance (optimized)
    let c_opt: f64 = p * 1000.0 * delta_opt;

    assert!(
        c_opt < c_uniform,
        "Optimized C = {:.0} < uniform C = {:.0} N·mm", c_opt, c_uniform
    );

    // Stiffness improvement
    let improvement: f64 = (1.0 - c_opt / c_uniform) * 100.0;
    assert!(
        improvement > 10.0,
        "Compliance reduction: {:.0}%", improvement
    );

    let _i_max = i_max;
}

// ================================================================
// 8. Multi-Load Optimization -- Weighted Compliance
// ================================================================
//
// Real structures have multiple load cases.
// Minimize: C_total = Σ(wi × Ci) (weighted sum)
// Different load cases favor different topologies → compromise needed.

#[test]
fn optim_multi_load() {
    // Two load cases with weights
    let w1: f64 = 0.6;          // weight for load case 1
    let w2: f64 = 0.4;          // weight for load case 2

    // Compliance of each design for each load case
    // Design A: optimized for LC1
    let c_a_lc1: f64 = 100.0;   // good for LC1
    let c_a_lc2: f64 = 300.0;   // poor for LC2

    // Design B: optimized for LC2
    let c_b_lc1: f64 = 250.0;   // poor for LC1
    let c_b_lc2: f64 = 120.0;   // good for LC2

    // Design C: balanced
    let c_c_lc1: f64 = 150.0;
    let c_c_lc2: f64 = 180.0;

    // Weighted compliance
    let c_total_a: f64 = w1 * c_a_lc1 + w2 * c_a_lc2;
    let c_total_b: f64 = w1 * c_b_lc1 + w2 * c_b_lc2;
    let c_total_c: f64 = w1 * c_c_lc1 + w2 * c_c_lc2;

    // Balanced design may be best overall
    assert!(
        c_total_c < c_total_a || c_total_c < c_total_b,
        "Balanced design C_total = {:.0} competes with specialized", c_total_c
    );

    // Verify weights sum to 1
    assert!(
        (w1 + w2 - 1.0).abs() < 0.01,
        "Weights: {:.1} + {:.1} = 1.0", w1, w2
    );

    // Pareto optimality check
    // A dominates B if better in ALL objectives
    let a_dominates_b: bool = c_a_lc1 < c_b_lc1 && c_a_lc2 < c_b_lc2;
    assert!(
        !a_dominates_b,
        "Neither dominates the other (Pareto front)"
    );
}
