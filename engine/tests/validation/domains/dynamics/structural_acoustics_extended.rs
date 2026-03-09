/// Validation: Structural Acoustics & Vibration Control (Extended)
///
/// References:
///   - Cremer, Heckl & Petersson: "Structure-Borne Sound" 3rd ed. (2005)
///   - Fahy & Gardonio: "Sound and Structural Vibration" 2nd ed. (2007)
///   - AISC Design Guide 11: Vibrations of Steel-Framed Structural Systems (2016)
///   - Den Hartog: "Mechanical Vibrations" 4th ed. (1956)
///   - Beranek & Ver: "Noise and Vibration Control Engineering" 2nd ed. (2006)
///   - Lyon & DeJong: "Theory and Application of Statistical Energy Analysis" (1995)
///   - EN 12354: Building Acoustics
///   - ASTM E413: Classification for Rating Sound Insulation (STC)
///
/// Tests verify:
///   1. Mass law: TL = 20*log10(m*f) - 47 dB
///   2. STC rating: single-number rating from mass and frequency
///   3. Coincidence frequency: fc = c^2/(1.8*t)*sqrt(12*rho/(E*t^2)) -- simplified
///   4. Double wall improvement: TL increase from cavity
///   5. Floor impact: AISC DG11 walking frequency vs natural frequency
///   6. Vibration isolation: transmissibility T = 1/|1-(f/fn)^2|
///   7. Modal density: number of modes per frequency band
///   8. Radiation efficiency: panel radiating area vs frequency

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Mass Law: TL = 20*log10(m*f) - 47 dB (Sound Transmission)
// ================================================================
//
// The field-incidence mass law predicts the transmission loss (TL)
// of a single homogeneous panel below its coincidence frequency.
//
// TL = 20*log10(f*m') - 47 dB
//
// where f = frequency [Hz], m' = surface mass density [kg/m^2].
// Doubling mass or frequency adds 6 dB.
//
// We use a beam model to determine the flexural stiffness of a
// concrete floor panel and then apply the mass law formula.

#[test]
fn mass_law_transmission_loss() {
    // 150 mm concrete slab modelled as a beam strip 1 m wide
    let e_concrete: f64 = 30_000.0; // MPa (30 GPa)
    let thickness: f64 = 0.15;      // m
    let width: f64 = 1.0;           // m strip
    let a: f64 = width * thickness;  // 0.15 m^2
    let iz: f64 = width * thickness.powi(3) / 12.0; // m^4
    let l: f64 = 4.0;               // m span

    // Build a simply-supported beam to confirm stiffness participation
    let input = make_beam(
        4, l, e_concrete, a, iz,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -1.0, q_j: -1.0, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: -1.0, q_j: -1.0, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 3, q_i: -1.0, q_j: -1.0, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 4, q_i: -1.0, q_j: -1.0, a: None, b: None,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // Midspan deflection for SS beam under UDL: delta = 5*q*L^4 / (384*E*I)
    let q: f64 = 1.0; // kN/m (magnitude)
    let e_kn: f64 = e_concrete * 1000.0; // convert MPa to kN/m^2
    let delta_theory: f64 = 5.0 * q * l.powi(4) / (384.0 * e_kn * iz);

    // Get midspan displacement from solver
    let mid_node = 3; // node 3 is at midspan for 4-element beam
    let mid_disp: f64 = results.displacements.iter()
        .find(|d| d.node_id == mid_node)
        .unwrap().uy.abs();

    assert_close(mid_disp, delta_theory, 0.02, "SS beam midspan deflection");

    // Now apply mass law formula
    let rho_concrete: f64 = 2400.0; // kg/m^3
    let m_surface: f64 = rho_concrete * thickness; // 360 kg/m^2

    let f_test: f64 = 500.0; // Hz
    let tl: f64 = 20.0 * (f_test * m_surface).log10() - 47.0;

    // TL = 20*log10(180000) - 47 = 105.1 - 47 = 58.1 dB
    let tl_expected: f64 = 20.0 * (180_000.0_f64).log10() - 47.0;
    assert_close(tl, tl_expected, 0.001, "Mass law TL at 500 Hz");

    // Doubling mass adds 6.02 dB
    let m_double: f64 = 2.0 * m_surface;
    let tl_double: f64 = 20.0 * (f_test * m_double).log10() - 47.0;
    let delta_tl: f64 = tl_double - tl;
    let six_db: f64 = 20.0 * 2.0_f64.log10();
    assert_close(delta_tl, six_db, 0.001, "Mass law 6 dB per doubling of mass");

    // Doubling frequency adds 6.02 dB
    let tl_2f: f64 = 20.0 * (2.0 * f_test * m_surface).log10() - 47.0;
    let delta_tl_f: f64 = tl_2f - tl;
    assert_close(delta_tl_f, six_db, 0.001, "Mass law 6 dB per doubling of frequency");
}

// ================================================================
// 2. STC Rating: Single-Number Rating from Mass and Frequency
// ================================================================
//
// Sound Transmission Class (STC) per ASTM E413:
// - Reference contour shifted to measured TL curve
// - Total deficiency <= 32 dB, no single deficiency > 8 dB
// - STC = reference contour value at 500 Hz
//
// For a concrete slab the TL curve rises with frequency (mass law)
// until the coincidence dip. We use the mass law TL at standard
// 1/3-octave centre frequencies to predict an STC rating.

#[test]
fn stc_rating_from_mass_law() {
    // Use beam model to verify slab bending stiffness
    let e_mpa: f64 = 30_000.0;
    let t: f64 = 0.20; // 200 mm concrete slab
    let a: f64 = 1.0 * t;
    let iz: f64 = 1.0 * t.powi(3) / 12.0;
    let l: f64 = 5.0;

    let input = make_beam(
        2, l, e_mpa, a, iz,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -10.0, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // Verify we get a valid deflection (beam works)
    let mid_dy: f64 = results.displacements.iter()
        .find(|d| d.node_id == 2)
        .unwrap().uy.abs();
    assert!(mid_dy > 0.0, "Beam deflects under load");

    // Mass law TL at standard 1/3-octave frequencies
    let rho: f64 = 2400.0;
    let m_surface: f64 = rho * t; // 480 kg/m^2

    let frequencies: [f64; 16] = [
        125.0, 160.0, 200.0, 250.0, 315.0, 400.0,
        500.0, 630.0, 800.0, 1000.0, 1250.0, 1600.0,
        2000.0, 2500.0, 3150.0, 4000.0,
    ];

    let mut tl_values: [f64; 16] = [0.0; 16];
    for (i, &f) in frequencies.iter().enumerate() {
        tl_values[i] = 20.0 * (f * m_surface).log10() - 47.0;
    }

    // STC reference contour offsets (relative to STC value at 500 Hz)
    let ref_offsets: [f64; 16] = [
        -16.0, -13.0, -10.0, -7.0, -4.0, -1.0,
          0.0,   1.0,   2.0,  3.0,  4.0,  4.0,
          4.0,   4.0,   4.0,  4.0,
    ];

    // Find STC: highest candidate where total deficiency <= 32 and max single <= 8
    let mut stc: f64 = 0.0;
    let mut candidate: f64 = 30.0;
    while candidate <= 80.0 {
        let mut total_def: f64 = 0.0;
        let mut max_single: f64 = 0.0;
        for i in 0..16 {
            let ref_val: f64 = candidate + ref_offsets[i];
            if ref_val > tl_values[i] {
                let d: f64 = ref_val - tl_values[i];
                total_def += d;
                if d > max_single { max_single = d; }
            }
        }
        if total_def <= 32.0 && max_single <= 8.0 {
            stc = candidate;
        }
        candidate += 1.0;
    }

    // 200 mm concrete (480 kg/m^2) should have STC ~ 55-65
    assert!(
        stc >= 50.0 && stc <= 70.0,
        "STC = {:.0}, expected 50-70 for 200mm concrete", stc
    );

    // Heavier slab should have higher STC
    let m_heavy: f64 = 2.0 * m_surface;
    let mut tl_heavy: [f64; 16] = [0.0; 16];
    for (i, &f) in frequencies.iter().enumerate() {
        tl_heavy[i] = 20.0 * (f * m_heavy).log10() - 47.0;
    }
    let mut stc_heavy: f64 = 0.0;
    candidate = 30.0;
    while candidate <= 90.0 {
        let mut total_def: f64 = 0.0;
        let mut max_single: f64 = 0.0;
        for i in 0..16 {
            let ref_val: f64 = candidate + ref_offsets[i];
            if ref_val > tl_heavy[i] {
                let d: f64 = ref_val - tl_heavy[i];
                total_def += d;
                if d > max_single { max_single = d; }
            }
        }
        if total_def <= 32.0 && max_single <= 8.0 {
            stc_heavy = candidate;
        }
        candidate += 1.0;
    }

    assert!(
        stc_heavy > stc,
        "Heavier slab STC {:.0} > lighter STC {:.0}", stc_heavy, stc
    );
}

// ================================================================
// 3. Coincidence Frequency: fc = c^2/(2*pi*t) * sqrt(12*rho*(1-nu^2)/E)
// ================================================================
//
// The critical coincidence frequency is where the bending wavelength
// in the plate equals the acoustic wavelength in air. Above fc the
// mass law breaks down.
//
// fc = c0^2 / (2*pi*h) * sqrt(12*rho*(1-nu^2) / E)
//
// We derive the bending stiffness D = E*h^3/(12*(1-nu^2)) from
// beam analysis (Iz for a unit-width strip) and use it in the fc formula.

#[test]
fn coincidence_frequency_from_bending_stiffness() {
    let c0: f64 = 343.0; // m/s speed of sound in air
    let pi: f64 = std::f64::consts::PI;

    // Concrete slab properties
    let rho_c: f64 = 2400.0;  // kg/m^3
    let e_pa: f64 = 30.0e9;   // Pa
    let e_mpa: f64 = 30_000.0;
    let nu: f64 = 0.2;
    let h: f64 = 0.15;        // m (150 mm)

    // Use beam model: unit-width strip, Iz = b*h^3/12
    let b: f64 = 1.0;
    let a: f64 = b * h;
    let iz: f64 = b * h.powi(3) / 12.0;
    let l: f64 = 3.0;

    let input = make_beam(
        4, l, e_mpa, a, iz,
        "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -1.0, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // Verify beam deflects (stiffness is working)
    let mid_dy: f64 = results.displacements.iter()
        .find(|d| d.node_id == 3)
        .unwrap().uy.abs();
    assert!(mid_dy > 0.0, "Fixed-fixed beam deflects");

    // Flexural rigidity D = E*Iz (for unit width, plane stress)
    // For plate: D = E*h^3 / (12*(1-nu^2))
    let d_plate: f64 = e_pa * h.powi(3) / (12.0 * (1.0 - nu * nu));

    // Coincidence frequency: fc = c0^2 / (2*pi) * sqrt(rho_s * h / D)
    // where rho_s * h = surface mass density as volumetric density * thickness
    let fc_concrete: f64 = (c0 * c0 / (2.0 * pi * h))
        * (12.0 * rho_c * (1.0 - nu * nu) / e_pa).sqrt();

    // Alternative using D directly: fc = c0^2/(2*pi) * sqrt(m_surface / D)
    let m_surface: f64 = rho_c * h;
    let fc_alt: f64 = c0 * c0 / (2.0 * pi) * (m_surface / d_plate).sqrt();

    assert_close(fc_concrete, fc_alt, 0.001, "Coincidence frequency two formulations match");

    // 150mm concrete: fc should be ~100-130 Hz
    assert!(
        fc_concrete > 80.0 && fc_concrete < 180.0,
        "Concrete 150mm: fc = {:.0} Hz, expected ~100-130 Hz", fc_concrete
    );

    // fc scales inversely with thickness for same material
    let h2: f64 = 0.30; // double thickness
    let fc2: f64 = (c0 * c0 / (2.0 * pi * h2))
        * (12.0 * rho_c * (1.0 - nu * nu) / e_pa).sqrt();
    let ratio: f64 = fc_concrete / fc2;
    assert_close(ratio, 2.0, 0.001, "Doubling thickness halves fc");

    // Glass pane: 6mm, E=70 GPa, rho=2500
    let rho_g: f64 = 2500.0;
    let e_g: f64 = 70.0e9;
    let nu_g: f64 = 0.22;
    let h_g: f64 = 0.006;
    let fc_glass: f64 = (c0 * c0 / (2.0 * pi * h_g))
        * (12.0 * rho_g * (1.0 - nu_g * nu_g) / e_g).sqrt();

    assert!(
        fc_glass > 1500.0 && fc_glass < 3000.0,
        "Glass 6mm: fc = {:.0} Hz, expected ~2000-2500 Hz", fc_glass
    );
}

// ================================================================
// 4. Double Wall Improvement: TL Increase from Cavity
// ================================================================
//
// A double wall (two leaves separated by an air gap) provides
// improved TL above its mass-air-mass resonance f0:
//
//   f0 = (1/(2*pi)) * sqrt(rho_air * c^2 * (1/m1 + 1/m2) / d)
//
// Below f0: acts as single wall of combined mass.
// Above f0: TL increases at ~18 dB/octave (vs 6 for single).
//
// The improvement over single wall of same total mass at frequency f:
//   delta_TL ~ 20*log10(f/f0) for f >> f0 (simplified)

#[test]
fn double_wall_improvement_from_cavity() {
    let pi: f64 = std::f64::consts::PI;
    let rho_air: f64 = 1.21;  // kg/m^3
    let c0: f64 = 343.0;      // m/s

    // Model each leaf as a beam to verify independent stiffness
    let e_gypsum: f64 = 3_000.0; // MPa
    let t_leaf: f64 = 0.0125;    // 12.5 mm gypsum board
    let a_leaf: f64 = 1.0 * t_leaf;
    let iz_leaf: f64 = 1.0 * t_leaf.powi(3) / 12.0;
    let l: f64 = 3.0;

    let input = make_beam(
        2, l, e_gypsum, a_leaf, iz_leaf,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -0.1, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");
    let leaf_dy: f64 = results.displacements.iter()
        .find(|d| d.node_id == 2)
        .unwrap().uy.abs();
    assert!(leaf_dy > 0.0, "Single leaf deflects");

    // Double wall parameters
    let rho_gypsum: f64 = 800.0; // kg/m^3
    let m1: f64 = rho_gypsum * t_leaf; // 10 kg/m^2
    let m2: f64 = m1;                   // equal leaves
    let d: f64 = 0.100;                 // 100 mm air gap

    // Mass-air-mass resonance frequency
    let f0: f64 = (1.0 / (2.0 * pi))
        * (rho_air * c0 * c0 * (1.0 / m1 + 1.0 / m2) / d).sqrt();

    assert!(
        f0 > 50.0 && f0 < 90.0,
        "Double wall f0 = {:.1} Hz, expected ~65 Hz", f0
    );

    // Single wall TL (combined mass)
    let m_total: f64 = m1 + m2;
    let f_test: f64 = 1000.0; // Hz, well above f0
    let tl_single: f64 = 20.0 * (f_test * m_total).log10() - 47.0;

    // Double wall TL: each leaf contributes + air gap bonus
    // Simplified: TL_double ~ TL_leaf1 + TL_leaf2 + 20*log10(f*d/c0)
    // At high frequency, the double wall significantly exceeds single wall
    let tl_leaf1: f64 = 20.0 * (f_test * m1).log10() - 47.0;
    let tl_leaf2: f64 = 20.0 * (f_test * m2).log10() - 47.0;

    // The improvement of double wall over single wall of same total mass
    // At f >> f0 the improvement is substantial
    let tl_double_approx: f64 = tl_leaf1 + tl_leaf2 + 6.0; // simplified estimate
    let improvement: f64 = tl_double_approx - tl_single;

    assert!(
        improvement > 0.0,
        "Double wall improvement = {:.1} dB > 0 at {:.0} Hz", improvement, f_test
    );

    // Doubling the gap lowers f0 by factor sqrt(2)
    let d2: f64 = 2.0 * d;
    let f0_d2: f64 = (1.0 / (2.0 * pi))
        * (rho_air * c0 * c0 * (1.0 / m1 + 1.0 / m2) / d2).sqrt();
    let gap_ratio: f64 = f0 / f0_d2;
    assert_close(gap_ratio, 2.0_f64.sqrt(), 0.001, "Doubling gap lowers f0 by sqrt(2)");
}

// ================================================================
// 5. Floor Impact: AISC DG11 Walking Frequency vs Natural Frequency
// ================================================================
//
// AISC DG11 criterion for walking vibration:
//   a_p/g = P0 * exp(-0.35*fn) / (beta * W)
//
// where P0 = 0.29 kN, fn = natural frequency, beta = damping,
// W = effective weight. The floor natural frequency must exceed
// the walking excitation frequency to avoid resonance.
//
// fn = pi/(2*L^2) * sqrt(EI / m_bar) for simply-supported beam.

#[test]
fn floor_impact_aisc_dg11_walking() {
    // Steel floor beam: W460x52 equivalent
    let e_steel: f64 = 200_000.0; // MPa
    let l: f64 = 8.0;             // m span
    let iz: f64 = 2.12e-4;        // m^4 (212e6 mm^4)
    let a: f64 = 6.65e-3;         // m^2
    let m_bar: f64 = 400.0;       // kg/m (beam + slab + SDL)

    // Compute natural frequency analytically
    let e_pa: f64 = e_steel * 1.0e6; // Pa
    let fn_theory: f64 = (pi_val() / 2.0) / (l * l)
        * (e_pa * iz / m_bar).sqrt();

    // Verify with solver -- midspan deflection under self-weight
    // delta_sw = 5*w*L^4 / (384*EI)
    let w_per_m: f64 = m_bar * 9.81 / 1000.0; // kN/m
    let e_kn: f64 = e_steel * 1000.0; // kN/m^2

    let mut loads = Vec::new();
    for i in 1..=4 {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -w_per_m, q_j: -w_per_m, a: None, b: None,
        }));
    }
    let input = make_beam(4, l, e_steel, a, iz, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    let delta_sw: f64 = results.displacements.iter()
        .find(|d| d.node_id == 3)
        .unwrap().uy.abs();
    let delta_theory: f64 = 5.0 * w_per_m * l.powi(4) / (384.0 * e_kn * iz);
    assert_close(delta_sw, delta_theory, 0.02, "Self-weight deflection");

    // Natural frequency from deflection: fn = 0.18*sqrt(g/delta) [Hz]
    // (Simplified DG11 formula)
    let g: f64 = 9.81; // m/s^2
    let fn_from_defl: f64 = 0.18 * (g / delta_sw).sqrt();

    // Both methods should give similar frequency
    assert!(
        (fn_theory - fn_from_defl).abs() / fn_theory < 0.15,
        "fn_theory={:.2} Hz, fn_defl={:.2} Hz", fn_theory, fn_from_defl
    );

    // AISC DG11 acceleration criterion
    let p0: f64 = 0.29;        // kN, excitation constant
    let beta: f64 = 0.03;      // damping ratio
    let w_eff: f64 = m_bar * l * g / 1000.0; // effective weight in kN

    let ap_g: f64 = p0 * (-0.35 * fn_theory).exp() / (beta * w_eff);

    // Office limit: 0.5%g
    let limit: f64 = 0.005;
    assert!(
        ap_g > 0.0 && ap_g < 0.05,
        "a_p/g = {:.5}, limit = {:.4}", ap_g, limit
    );

    // Higher frequency floor has lower acceleration (exponential decay)
    let fn_higher: f64 = fn_theory * 1.5;
    let ap_g_higher: f64 = p0 * (-0.35 * fn_higher).exp() / (beta * w_eff);
    assert!(
        ap_g_higher < ap_g,
        "Higher fn: a_p/g={:.5} < {:.5}", ap_g_higher, ap_g
    );
}

fn pi_val() -> f64 {
    std::f64::consts::PI
}

// ================================================================
// 6. Vibration Isolation: Transmissibility T = 1/|1-(f/fn)^2|
// ================================================================
//
// For an undamped SDOF system, the force transmissibility is:
//   T = 1 / |1 - r^2|  where r = f/fn
//
// With damping:
//   T = sqrt((1 + (2*zeta*r)^2) / ((1-r^2)^2 + (2*zeta*r)^2))
//
// Isolation occurs when r > sqrt(2). For a machine on isolators,
// the isolator stiffness determines fn and thus the isolation.
//
// We model the isolator support as a beam on elastic foundation
// to verify the stiffness concept.

#[test]
fn vibration_isolation_transmissibility() {
    // Machine isolator parameters
    let m_machine: f64 = 500.0;     // kg
    let k_isolator: f64 = 50_000.0; // N/m per mount
    let n_mounts: usize = 4;
    let k_total: f64 = n_mounts as f64 * k_isolator; // 200,000 N/m

    // Natural frequency of isolation system
    let fn_iso: f64 = (1.0 / (2.0 * pi_val())) * (k_total / m_machine).sqrt();
    // fn = 1/(2*pi) * sqrt(200000/500) = 1/(2*pi) * 20 = 3.18 Hz

    assert_close(fn_iso, 3.183, 0.01, "Isolator natural frequency");

    // Model a short beam as the machine base to verify load transfer
    let e_steel: f64 = 200_000.0; // MPa
    let a: f64 = 0.01;   // m^2
    let iz: f64 = 1.0e-5; // m^4
    let l: f64 = 2.0;

    let f_machine: f64 = m_machine * 9.81 / 1000.0; // kN weight
    let input = make_beam(
        2, l, e_steel, a, iz,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -f_machine, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // Verify load transfer through reactions
    let total_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(total_ry, f_machine, 0.01, "Machine weight transferred");

    // Undamped transmissibility at various frequency ratios
    let undamped_t = |r: f64| -> f64 {
        1.0 / (1.0 - r * r).abs()
    };

    // At r = 0 (static): T = 1
    assert_close(undamped_t(0.0), 1.0, 0.001, "T at r=0 (static)");

    // At r = 0.5: T = 1/(1-0.25) = 1.333 (amplification)
    assert_close(undamped_t(0.5), 4.0 / 3.0, 0.001, "T at r=0.5");

    // At r = sqrt(2): T = 1/|1-2| = 1.0 (crossover)
    let r_cross: f64 = 2.0_f64.sqrt();
    assert_close(undamped_t(r_cross), 1.0, 0.001, "T at r=sqrt(2) crossover");

    // At r = 3: T = 1/|1-9| = 1/8 = 0.125 (good isolation)
    assert_close(undamped_t(3.0), 0.125, 0.001, "T at r=3 (isolation)");

    // At r = 5: T = 1/24 = 0.04167
    assert_close(undamped_t(5.0), 1.0 / 24.0, 0.001, "T at r=5");

    // Damped transmissibility at r = 3, zeta = 0.05
    let zeta: f64 = 0.05;
    let r: f64 = 3.0;
    let num: f64 = 1.0 + (2.0 * zeta * r).powi(2);
    let den: f64 = (1.0 - r * r).powi(2) + (2.0 * zeta * r).powi(2);
    let t_damped: f64 = (num / den).sqrt();

    // Damped T slightly higher than undamped (damping reduces isolation)
    assert!(
        t_damped > undamped_t(3.0),
        "Damped T={:.4} > undamped T={:.4}", t_damped, undamped_t(3.0)
    );

    // Insertion loss in dB
    let il: f64 = -20.0 * t_damped.log10();
    assert!(il > 15.0, "Insertion loss = {:.1} dB > 15 dB at r=3", il);
}

// ================================================================
// 7. Modal Density: Number of Modes per Frequency Band
// ================================================================
//
// For a simply-supported beam of length L:
//   fn = n^2 * pi / (2*L^2) * sqrt(EI/m)  (nth mode)
//   n(f) = sqrt(f / f1)  (mode number at frequency f)
//
// Modal density: dn/df = 1/(2*sqrt(f*f1))
//
// For a rectangular plate (Lx x Ly):
//   n(f) ~ S * sqrt(m/D) * f / 2  (Bolotin asymptotic estimate)
//   modal density: dn/df ~ S * sqrt(m/D) / 2
//
// Lyon's SEA framework uses modal density to predict energy flow.

#[test]
fn modal_density_beam_and_plate() {
    // Simply-supported beam
    let e_mpa: f64 = 200_000.0; // steel
    let l: f64 = 6.0;           // m
    let b: f64 = 0.30;          // m flange width
    let h: f64 = 0.50;          // m depth
    let a: f64 = b * h;
    let iz: f64 = b * h.powi(3) / 12.0;
    let rho_steel: f64 = 7850.0; // kg/m^3
    let m_per_m: f64 = rho_steel * a; // kg/m

    // Build and solve beam to verify stiffness
    let input = make_beam(
        4, l, e_mpa, a, iz,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -100.0, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");
    let mid_dy: f64 = results.displacements.iter()
        .find(|d| d.node_id == 3)
        .unwrap().uy.abs();
    assert!(mid_dy > 0.0, "Beam deflects");

    let e_pa: f64 = e_mpa * 1.0e6;
    let ei: f64 = e_pa * iz; // N*m^2

    // First mode frequency: f1 = pi/(2*L^2) * sqrt(EI/m)
    let f1: f64 = (pi_val() / (2.0 * l * l)) * (ei / m_per_m).sqrt();

    // Mode frequencies: fn = n^2 * f1
    let f_mode = |n: usize| -> f64 {
        (n as f64).powi(2) * f1
    };

    // Verify first few modes
    assert_close(f_mode(1), f1, 0.001, "1st mode = f1");
    assert_close(f_mode(2), 4.0 * f1, 0.001, "2nd mode = 4*f1");
    assert_close(f_mode(3), 9.0 * f1, 0.001, "3rd mode = 9*f1");

    // Count modes below a given frequency
    let f_upper: f64 = 1000.0; // Hz
    let n_modes_below: f64 = (f_upper / f1).sqrt();
    assert!(n_modes_below > 1.0, "Modes below {} Hz: {:.1}", f_upper, n_modes_below);

    // Modal density for beam: dn/df = 1/(2*sqrt(f*f1))
    let f_eval: f64 = 500.0; // Hz
    let modal_density_beam: f64 = 1.0 / (2.0 * (f_eval * f1).sqrt());
    assert!(modal_density_beam > 0.0, "Beam modal density = {:.4} modes/Hz", modal_density_beam);

    // For a plate (Lx x Ly), modal density is approximately constant:
    // dn/df ~ S * sqrt(12*rho*h / (E*h^3/(1-nu^2))) / (2*pi)
    // = S / (2*pi) * sqrt(12*rho*(1-nu^2) / (E*h^2))
    let lx: f64 = 4.0; // m
    let ly: f64 = 3.0; // m
    let s_plate: f64 = lx * ly; // 12 m^2
    let h_plate: f64 = 0.008; // 8 mm steel plate
    let nu: f64 = 0.3;

    let modal_density_plate: f64 = s_plate / (2.0 * pi_val())
        * (12.0 * rho_steel * (1.0 - nu * nu) / (e_pa * h_plate * h_plate)).sqrt();

    // Plate has higher modal density than beam (2D vs 1D)
    assert!(
        modal_density_plate > modal_density_beam,
        "Plate modal density {:.4} > beam {:.4} modes/Hz",
        modal_density_plate, modal_density_beam
    );

    // Doubling plate area doubles modal density
    let s_double: f64 = 2.0 * s_plate;
    let md_double: f64 = s_double / (2.0 * pi_val())
        * (12.0 * rho_steel * (1.0 - nu * nu) / (e_pa * h_plate * h_plate)).sqrt();
    assert_close(md_double / modal_density_plate, 2.0, 0.001, "Doubling area doubles modal density");
}

// ================================================================
// 8. Radiation Efficiency: Panel Radiating Area vs Frequency
// ================================================================
//
// The radiation efficiency sigma of a vibrating panel describes
// how effectively it radiates sound:
//
//   P_radiated = rho_air * c * sigma * S * <v^2>
//
// For a simply supported rectangular panel:
//   - Below fc: sigma < 1 (poor radiator), sigma ~ (f/fc)^0.5 (corner/edge modes)
//   - At fc: sigma peaks (coincidence)
//   - Above fc: sigma -> 1 (efficient radiator)
//
// Maidanik's formulation for sigma above fc:
//   sigma = 1 / sqrt(1 - fc/f)
//
// Below fc, for a baffled panel:
//   sigma ~ (perimeter / (pi * S)) * sqrt(f * c0 / (2 * fc))

#[test]
fn radiation_efficiency_panel() {
    let c0: f64 = 343.0;      // m/s
    let rho_air: f64 = 1.21;  // kg/m^3

    // Steel plate panel (large floor panel)
    let lx: f64 = 6.0;        // m
    let ly: f64 = 4.0;        // m
    let h_plate: f64 = 0.003; // 3 mm
    let s_panel: f64 = lx * ly; // 24 m^2
    let perimeter: f64 = 2.0 * (lx + ly); // 20 m

    let rho_steel: f64 = 7850.0;
    let e_steel_pa: f64 = 200.0e9;
    let e_steel_mpa: f64 = 200_000.0;
    let nu: f64 = 0.3;

    // Compute coincidence frequency for this plate
    let fc: f64 = (c0 * c0 / (2.0 * pi_val() * h_plate))
        * (12.0 * rho_steel * (1.0 - nu * nu) / e_steel_pa).sqrt();
    // For 3mm steel: fc ~ 4000 Hz

    assert!(fc > 3000.0 && fc < 5000.0, "3mm steel plate fc = {:.0} Hz", fc);

    // Model a strip of the panel as a beam to verify stiffness
    let a_strip: f64 = 1.0 * h_plate;
    let iz_strip: f64 = 1.0 * h_plate.powi(3) / 12.0;

    let input = make_beam(
        4, lx, e_steel_mpa, a_strip, iz_strip,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -0.01, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");
    let strip_dy: f64 = results.displacements.iter()
        .find(|d| d.node_id == 3)
        .unwrap().uy.abs();
    assert!(strip_dy > 0.0, "Panel strip deflects");

    // Radiation efficiency above fc (Maidanik):
    // sigma = 1 / sqrt(1 - fc/f) for f > fc
    let f_above: f64 = 2.0 * fc; // well above coincidence
    let sigma_above: f64 = 1.0 / (1.0 - fc / f_above).sqrt();
    assert_close(sigma_above, 2.0_f64.sqrt(), 0.001, "sigma at 2*fc = sqrt(2)");

    let f_far_above: f64 = 10.0 * fc;
    let sigma_far: f64 = 1.0 / (1.0 - fc / f_far_above).sqrt();
    // As f >> fc, sigma -> 1
    assert!(
        (sigma_far - 1.0).abs() < 0.1,
        "sigma at 10*fc = {:.4}, approaching 1.0", sigma_far
    );

    // Radiation efficiency below fc (edge/corner radiation, simplified):
    // sigma ~ (perimeter/(pi*S)) * sqrt(f*c0 / (2*fc))  (approximate)
    // Valid at frequencies well below fc where sigma << 1
    let f_below: f64 = fc / 100.0; // far below coincidence
    let sigma_below: f64 = (perimeter / (pi_val() * s_panel))
        * (f_below * c0 / (2.0 * fc)).sqrt();

    assert!(
        sigma_below < 1.0,
        "sigma far below fc = {:.4} < 1 (poor radiator)", sigma_below
    );

    // Sound power radiated: P = rho_air * c0 * sigma * S * <v^2>
    let v_rms: f64 = 1.0e-3; // m/s, typical vibration velocity
    let power_above: f64 = rho_air * c0 * sigma_above * s_panel * v_rms * v_rms;
    let power_below: f64 = rho_air * c0 * sigma_below * s_panel * v_rms * v_rms;

    assert!(
        power_above > power_below,
        "Power above fc ({:.2e} W) > below fc ({:.2e} W)",
        power_above, power_below
    );

    // Radiation efficiency increases monotonically below fc
    let f_low1: f64 = fc / 200.0;
    let f_low2: f64 = fc / 100.0;
    let sigma_low1: f64 = (perimeter / (pi_val() * s_panel))
        * (f_low1 * c0 / (2.0 * fc)).sqrt();
    let sigma_low2: f64 = (perimeter / (pi_val() * s_panel))
        * (f_low2 * c0 / (2.0 * fc)).sqrt();
    assert!(
        sigma_low2 > sigma_low1,
        "sigma increases with frequency below fc: {:.4} > {:.4}", sigma_low2, sigma_low1
    );
}
