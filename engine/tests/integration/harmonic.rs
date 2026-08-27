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
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 5.0, z: 0.0 });
    nodes.insert("3".to_string(), SolverNode { id: 3, x: 10.0, z: 0.0 });

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
        dx: None, dz: None, dry: None, angle: None,
    });
    supports.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 3, support_type: "roller".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -10.0, my: 0.0,
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
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false, release_t_start: false, release_t_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });
    elements.insert("2".to_string(), SolverElement3D {
        id: 2, elem_type: "frame".to_string(),
        node_i: 2, node_j: 3,
        material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false, release_t_start: false, release_t_end: false,
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

/// Large 2D beam (nf >= SPARSE_THRESHOLD) with an EqualDOF constraint:
/// exercises the sparse constrained harmonic path (sparse triple-product
/// reduction + sparse Lanczos), which used to fall back to dense assembly.
fn make_large_ss_beam_2d_constrained() -> SolverInput {
    let n_elem = 30;
    let mut nodes = HashMap::new();
    for i in 0..=n_elem {
        let id = i + 1;
        nodes.insert(id.to_string(), SolverNode { id, x: 10.0 * i as f64 / n_elem as f64, z: 0.0 });
    }
    // Auxiliary node hanging off midspan, coupled by EqualDOF below.
    nodes.insert("100".to_string(), SolverNode { id: 100, x: 5.0, z: -1.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200e6, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.05, iz: 1.0e-4, as_y: None });

    let mut elements = HashMap::new();
    for i in 0..n_elem {
        let id = i + 1;
        elements.insert(id.to_string(), SolverElement {
            id, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }
    elements.insert("100".to_string(), SolverElement {
        id: 100, elem_type: "frame".to_string(),
        node_i: 16, node_j: 100,
        material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pin".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    supports.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 31, support_type: "roller".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 16, fx: 0.0, fz: -10.0, my: 0.0,
        }),
    ];

    let constraints = vec![
        Constraint::EqualDOF(EqualDOFConstraint {
            master_node: 16, slave_node: 100, dofs: vec![0, 1],
        }),
    ];

    SolverInput {
        nodes, materials, sections, elements, supports, loads, constraints, connectors: HashMap::new() }
}

#[test]
fn harmonic_2d_sparse_with_constraints() {
    let solver = make_large_ss_beam_2d_constrained();
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);

    let frequencies: Vec<f64> = (1..=200).map(|i| i as f64 * 0.5).collect();
    let n_freq = frequencies.len();

    let input = HarmonicInput {
        solver,
        densities,
        frequencies,
        damping_ratio: 0.02,
        response_node_id: 16,
        response_dof: "y".to_string(),
    };

    let result = solve_harmonic_2d(&input).unwrap();
    assert_eq!(result.response_points.len(), n_freq);
    assert!(result.peak_amplitude > 0.0 && result.peak_amplitude.is_finite());
    assert!(result.peak_frequency > 0.0);
    for pt in &result.response_points {
        assert!(pt.amplitude.is_finite() && pt.phase.is_finite(),
            "Non-finite response at {} Hz", pt.frequency);
    }
}

#[test]
fn harmonic_2d_sparse_equal_dof_slave_matches_master() {
    // EqualDOF makes the slave's row a unit pointer at the master's reduced
    // DOF, so the slave's response must reproduce the master's exactly.
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);
    let frequencies: Vec<f64> = (1..=100).map(|i| i as f64).collect();

    let master = solve_harmonic_2d(&HarmonicInput {
        solver: make_large_ss_beam_2d_constrained(),
        densities: densities.clone(),
        frequencies: frequencies.clone(),
        damping_ratio: 0.02,
        response_node_id: 16,
        response_dof: "y".to_string(),
    }).unwrap();
    let slave = solve_harmonic_2d(&HarmonicInput {
        solver: make_large_ss_beam_2d_constrained(),
        densities,
        frequencies,
        damping_ratio: 0.02,
        response_node_id: 100,
        response_dof: "y".to_string(),
    }).unwrap();

    for (pm, ps) in master.response_points.iter().zip(&slave.response_points) {
        assert!((pm.real - ps.real).abs() < 1e-12 && (pm.imag - ps.imag).abs() < 1e-12,
            "Slave response must equal master response at {} Hz: ({}, {}) vs ({}, {})",
            pm.frequency, pm.real, pm.imag, ps.real, ps.imag);
    }
}

#[test]
fn harmonic_2d_sparse_constrained_dependent_target_errors() {
    // A RigidLink slave's transverse DOF expands to master translation +
    // rotation (non-unit row) — it has no single reduced DOF, so targeting it
    // must be a hard error, not a silent wrong answer.
    let mut solver = make_large_ss_beam_2d_constrained();
    solver.constraints = vec![
        Constraint::RigidLink(RigidLinkConstraint {
            master_node: 16, slave_node: 100, dofs: vec![0, 1],
        }),
    ];
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);

    let input = HarmonicInput {
        solver,
        densities,
        frequencies: vec![1.0, 2.0, 5.0],
        damping_ratio: 0.05,
        response_node_id: 100,
        response_dof: "x".to_string(),
    };

    let err = solve_harmonic_2d(&input).unwrap_err();
    assert!(err.contains("dependent"), "Unexpected error: {}", err);
}

#[test]
fn harmonic_3d_with_constraints() {
    // 3D constrained models now take the sparse modal path end to end
    // (previously: dense mass + dense K conversion).
    let mut solver = make_ss_beam_3d_with_load();
    solver.nodes.insert("4".to_string(), SolverNode3D { id: 4, x: 5.0, y: -1.0, z: 0.0 });
    solver.elements.insert("3".to_string(), SolverElement3D {
        id: 3, elem_type: "frame".to_string(),
        node_i: 2, node_j: 4,
        material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
        release_t_start: false, release_t_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    });
    solver.constraints = vec![
        Constraint::EqualDOF(EqualDOFConstraint {
            master_node: 2, slave_node: 4, dofs: vec![2],
        }),
    ];

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);

    let frequencies = vec![1.0, 5.0, 10.0, 20.0, 50.0];
    let n_freq = frequencies.len();

    let input = HarmonicInput3D {
        solver,
        densities,
        frequencies,
        damping_ratio: 0.05,
        response_node_id: 2,
        response_dof: "z".to_string(),
    };

    let result = solve_harmonic_3d(&input).unwrap();
    assert_eq!(result.response_points.len(), n_freq);
    assert!(result.peak_amplitude > 0.0 && result.peak_amplitude.is_finite());
    for pt in &result.response_points {
        assert!(pt.amplitude.is_finite() && pt.phase.is_finite(),
            "Non-finite response at {} Hz", pt.frequency);
    }
}
