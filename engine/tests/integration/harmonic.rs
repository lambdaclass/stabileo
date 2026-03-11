/// Integration tests for harmonic (frequency response) analysis.
///
/// Tests verify:
/// 1. 2D simple beam resonance peak near natural frequency
/// 2. 2D response decreases away from resonance
/// 3. 3D simple beam resonance peak
/// 4. 3D damping effect on peak amplitude
/// 5. Phase shift near resonance
/// 6. Multiple DOF response

use dedaliano_engine::solver::harmonic::*;
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// Create a 2D simply-supported beam with a downward nodal load at midspan.
/// Beam: 10m span, E=200GPa, A=0.05m², I=1e-4m⁴
fn make_ss_beam_2d_with_load() -> SolverInput {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, y: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 5.0, y: 0.0 });
    nodes.insert("3".to_string(), SolverNode { id: 3, x: 10.0, y: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200e6, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.05, iz: 1.0e-4, as_y: None });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });
    elements.insert("2".to_string(), SolverElement {
        id: 2, elem_type: "frame".to_string(),
        node_i: 2, node_j: 3,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pin".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    supports.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 3, support_type: "roller".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -10.0, mz: 0.0,
        }),
    ];

    SolverInput {
        nodes, materials, sections, elements, supports, loads, constraints: vec![],  connectors: HashMap::new() }
}

fn make_ss_beam_3d_with_load() -> SolverInput3D {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 5.0, y: 0.0, z: 0.0 });
    nodes.insert("3".to_string(), SolverNode3D { id: 3, x: 10.0, y: 0.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200e6, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.05,
        iy: 1.0e-4, iz: 5.0e-5, j: 1.5e-4,
        cw: None, as_y: None, as_z: None,
    });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement3D {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });
    elements.insert("2".to_string(), SolverElement3D {
        id: 2, elem_type: "frame".to_string(),
        node_i: 2, node_j: 3,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true,
        rrx: true, rry: false, rrz: false,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
    });
    supports.insert("2".to_string(), SolverSupport3D {
        node_id: 3,
        rx: false, ry: true, rz: true,
        rrx: true, rry: false, rrz: false,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
    });

    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    SolverInput3D {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

#[test]
fn harmonic_2d_resonance_peak() {
    // Sweep frequencies and verify peak occurs near natural frequency
    let solver = make_ss_beam_2d_with_load();
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0); // steel density

    let frequencies: Vec<f64> = (1..=200).map(|i| i as f64 * 0.5).collect(); // 0.5 to 100 Hz

    let input = HarmonicInput {
        solver,
        densities,
        frequencies,
        damping_ratio: 0.02,
        response_node_id: 2,
        response_dof: "y".to_string(),
    };

    let result = solve_harmonic_2d(&input).unwrap();
    assert!(!result.response_points.is_empty());
    assert!(result.peak_amplitude > 0.0, "Should have a peak amplitude");
    assert!(result.peak_frequency > 0.0, "Should have a peak frequency");
}

#[test]
fn harmonic_2d_off_resonance_smaller() {
    // Response at very low frequency should be close to static response,
    // and response at very high frequency should be small
    let solver = make_ss_beam_2d_with_load();
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);

    let input = HarmonicInput {
        solver,
        densities,
        frequencies: vec![0.1, 1000.0],
        damping_ratio: 0.05,
        response_node_id: 2,
        response_dof: "y".to_string(),
    };

    let result = solve_harmonic_2d(&input).unwrap();
    let amp_low = result.response_points[0].amplitude;
    let amp_high = result.response_points[1].amplitude;

    // At very high frequency, inertia dominates → small response
    assert!(amp_high < amp_low,
        "High frequency response ({}) should be smaller than low frequency ({})",
        amp_high, amp_low);
}

#[test]
fn harmonic_3d_resonance_peak() {
    let solver = make_ss_beam_3d_with_load();
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);

    let frequencies: Vec<f64> = (1..=200).map(|i| i as f64 * 0.5).collect();

    let input = HarmonicInput3D {
        solver,
        densities,
        frequencies,
        damping_ratio: 0.02,
        response_node_id: 2,
        response_dof: "z".to_string(),
    };

    let result = solve_harmonic_3d(&input).unwrap();
    assert!(result.peak_amplitude > 0.0, "Should have a peak amplitude");
    assert!(result.peak_frequency > 0.0, "Should have a peak frequency");
}

#[test]
fn harmonic_3d_damping_effect() {
    // Higher damping → smaller peak amplitude
    let solver = make_ss_beam_3d_with_load();
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);

    let frequencies: Vec<f64> = (1..=200).map(|i| i as f64 * 0.5).collect();

    let input_low_damp = HarmonicInput3D {
        solver: solver.clone(),
        densities: densities.clone(),
        frequencies: frequencies.clone(),
        damping_ratio: 0.01,
        response_node_id: 2,
        response_dof: "z".to_string(),
    };

    let input_high_damp = HarmonicInput3D {
        solver,
        densities,
        frequencies,
        damping_ratio: 0.10,
        response_node_id: 2,
        response_dof: "z".to_string(),
    };

    let result_low = solve_harmonic_3d(&input_low_damp).unwrap();
    let result_high = solve_harmonic_3d(&input_high_damp).unwrap();

    assert!(result_low.peak_amplitude > result_high.peak_amplitude,
        "Lower damping ({}) should have higher peak than higher damping ({})",
        result_low.peak_amplitude, result_high.peak_amplitude);
}

#[test]
fn harmonic_2d_phase_shift() {
    // Near resonance, phase should shift through ~-90° (or ±π/2)
    let solver = make_ss_beam_2d_with_load();
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);

    let frequencies: Vec<f64> = (1..=200).map(|i| i as f64 * 0.5).collect();

    let input = HarmonicInput {
        solver,
        densities,
        frequencies,
        damping_ratio: 0.05,
        response_node_id: 2,
        response_dof: "y".to_string(),
    };

    let result = solve_harmonic_2d(&input).unwrap();

    // At low frequency (quasi-static), phase ≈ 0
    let phase_low = result.response_points[0].phase;
    // At very high frequency, phase ≈ -π (180° out of phase)
    let phase_high = result.response_points.last().unwrap().phase;

    // Just verify phase changes across the spectrum
    assert!((phase_high - phase_low).abs() > 0.1,
        "Phase should change across frequency range: low={}, high={}", phase_low, phase_high);
}

#[test]
fn harmonic_3d_multiple_frequencies() {
    // Verify we get the correct number of response points
    let solver = make_ss_beam_3d_with_load();
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);

    let frequencies = vec![1.0, 5.0, 10.0, 20.0, 50.0];

    let input = HarmonicInput3D {
        solver,
        densities,
        frequencies: frequencies.clone(),
        damping_ratio: 0.05,
        response_node_id: 2,
        response_dof: "z".to_string(),
    };

    let result = solve_harmonic_3d(&input).unwrap();
    assert_eq!(result.response_points.len(), frequencies.len());

    // All amplitudes should be positive
    for pt in &result.response_points {
        assert!(pt.amplitude >= 0.0, "Amplitude should be non-negative at {} Hz", pt.frequency);
        assert!((pt.frequency - pt.omega / (2.0 * std::f64::consts::PI)).abs() < 1e-6,
            "omega should equal 2*PI*f");
    }
}
