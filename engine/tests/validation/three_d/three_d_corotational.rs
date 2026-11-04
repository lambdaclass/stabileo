use dedaliano_engine::solver::corotational::solve_corotational_3d;
use dedaliano_engine::types::*;

fn tip_of(input: &SolverInput3D, node: usize, increments: usize) -> [f64; 3] {
    let r = solve_corotational_3d(input, 100, 1e-9, increments, false).unwrap();
    assert!(r.converged);
    let d = r.results.displacements.iter().find(|d| d.node_id == node).unwrap();
    [d.ux, d.uy, d.uz]
}

fn distance(a: [f64; 3], b: [f64; 3]) -> f64 {
    (0..3).map(|i| (a[i] - b[i]).powi(2)).sum::<f64>().sqrt()
}

/// Bathe and Bolourchi's 45° bend (R = 100, unit square section, E = 10⁷, ν = 0) under an
/// out-of-plane tip load of 600.
fn bathe_bolourchi(n: usize) -> SolverInput3D {
    let r = 100.0f64;
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    for i in 0..=n {
        let a = std::f64::consts::FRAC_PI_4 * i as f64 / n as f64;
        nodes.insert((i + 1).to_string(), serde_json::json!({"id": i + 1, "x": r * a.sin(), "y": r * (1.0 - a.cos()), "z": 0.0}));
        if i > 0 {
            elements.insert(i.to_string(), serde_json::json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 1, "sectionId": 1}));
        }
    }
    serde_json::from_value(serde_json::json!({
        "nodes": nodes, "elements": elements,
        "materials": {"1": {"id": 1, "e": 1.0e4, "nu": 0.0}},
        "sections": {"1": {"id": 1, "a": 1.0, "iy": 1.0 / 12.0, "iz": 1.0 / 12.0, "j": 1.0 / 6.0}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": [{"type": "nodal", "data": {"nodeId": n + 1, "fx": 0, "fy": 0, "fz": 600.0, "mx": 0, "my": 0, "mz": 0}}]
    })).unwrap()
}

#[test]
fn the_45_degree_bend_matches_simo_vu_quoc_and_cardona_geradin() {
    let simo_vu_quoc = [-23.48, -13.50, 53.37];
    let cardona_geradin = [-23.67, -13.74, 53.50];
    let size = distance(simo_vu_quoc, [0.0; 3]);
    let coarse = tip_of(&bathe_bolourchi(8), 9, 60);
    let fine = tip_of(&bathe_bolourchi(16), 17, 60);
    for tip in [coarse, fine] {
        for reference in [simo_vu_quoc, cardona_geradin] {
            assert!(distance(tip, reference) / size < 0.005, "tip {tip:?} vs {reference:?}: {}", distance(tip, reference) / size);
        }
    }
    assert!(distance(coarse, fine) / size < 0.002, "{coarse:?} vs {fine:?}");
}

/// A cantilever along X with EI = GJ under a tip moment of fixed direction (cos α, 0, sin α)
/// bends into a helix about that direction, curvature and torsion in the ratio tan α. Returns
/// the model and the exact tip position.
fn helix(n: usize, alpha: f64, kl: f64) -> (SolverInput3D, [f64; 3]) {
    let (l, ei) = (10.0f64, 1.0e7 / 12.0);
    let k = kl / l;
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    for i in 0..=n {
        nodes.insert((i + 1).to_string(), serde_json::json!({"id": i + 1, "x": l * i as f64 / n as f64, "y": 0.0, "z": 0.0}));
        if i > 0 {
            elements.insert(i.to_string(), serde_json::json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 1, "sectionId": 1}));
        }
    }
    let (c, s) = (alpha.cos(), alpha.sin());
    let input = serde_json::from_value(serde_json::json!({
        "nodes": nodes, "elements": elements,
        "materials": {"1": {"id": 1, "e": 1.0e4, "nu": 0.0}},
        "sections": {"1": {"id": 1, "a": 1.0, "iy": 1.0 / 12.0, "iz": 1.0 / 12.0, "j": 1.0 / 6.0}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": [{"type": "nodal", "data": {"nodeId": n + 1, "fx": 0, "fy": 0, "fz": 0, "mx": k * ei * c, "my": 0, "mz": k * ei * s}}]
    })).unwrap();
    let tip = [c * c * l + s * s * kl.sin() / k, s * (1.0 - kl.cos()) / k, c * s * l - s * c * kl.sin() / k];
    (input, tip)
}

#[test]
fn a_helix_from_a_non_coaxial_tip_moment_matches_the_exact_solution() {
    for alpha in [std::f64::consts::FRAC_PI_6, std::f64::consts::FRAC_PI_4, std::f64::consts::FRAC_PI_3] {
        let (input, exact) = helix(40, alpha, std::f64::consts::FRAC_PI_2);
        let tip = tip_of(&input, 41, 40);
        let got = [10.0 + tip[0], tip[1], tip[2]];
        assert!(distance(got, exact) / 10.0 < 1e-4, "α {alpha}: tip {got:?} vs exact {exact:?}");
    }
}

#[test]
fn a_helix_beyond_the_increments_reach_is_reported_unconverged_not_wrong() {
    let (input, _) = helix(20, std::f64::consts::FRAC_PI_4, std::f64::consts::PI);
    let r = solve_corotational_3d(&input, 30, 1e-9, 20, false).unwrap();
    assert!(!r.converged);
    assert!(r.load_factor < 1.0, "{}", r.load_factor);
}

fn twisted_bar(direction: [f64; 3], turn: f64) -> SolverInput3D {
    let (l, gj) = (2.0f64, 1.0e7 / 2.0 / 6.0);
    let norm = (direction[0] * direction[0] + direction[1] * direction[1] + direction[2] * direction[2]).sqrt();
    let axis = direction.map(|v| v / norm);
    let torque = axis.map(|v| v * gj * turn / l);
    serde_json::from_value(serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": l * axis[0], "y": l * axis[1], "z": l * axis[2]}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "materials": {"1": {"id": 1, "e": 1.0e4, "nu": 0.0}},
        "sections": {"1": {"id": 1, "a": 1.0, "iy": 1.0 / 12.0, "iz": 1.0 / 12.0, "j": 1.0 / 6.0}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0, "fy": 0, "fz": 0, "mx": torque[0], "my": torque[1], "mz": torque[2]}}]
    })).unwrap()
}

#[test]
fn one_element_twisted_up_to_0_8_pi_keeps_its_torsion_and_beyond_0_9_pi_is_refused() {
    for direction in [[1.0f64, 0.0, 0.0], [0.0, 0.0, 1.0], [1.0, 2.0, -0.5]] {
        let norm = (direction[0] * direction[0] + direction[1] * direction[1] + direction[2] * direction[2]).sqrt();
        for turns in [0.5, 0.8] {
            let turn = turns * std::f64::consts::PI;
            let r = solve_corotational_3d(&twisted_bar(direction, turn), 100, 1e-10, 40, false).unwrap();
            assert!(r.converged, "{direction:?} {turns}π");
            let d = r.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
            let twist = (d.rx * direction[0] + d.ry * direction[1] + d.rz * direction[2]) / norm;
            assert!((twist / turn - 1.0).abs() < 1e-8, "{direction:?} {turns}π: twist {twist}");
            assert!(d.ux.abs() + d.uy.abs() + d.uz.abs() < 1e-8, "{direction:?} {turns}π: {d:?}");
        }
        for turns in [1.5, 2.0, 2.5] {
            let e = solve_corotational_3d(&twisted_bar(direction, turns * std::f64::consts::PI), 100, 1e-10, 40, false).unwrap_err();
            assert!(e.contains("member 1") && e.contains("split it into shorter members"), "{direction:?} {turns}π: {e}");
        }
    }
}

fn rotation(t: [f64; 3]) -> [[f64; 3]; 3] {
    let a = distance(t, [0.0; 3]);
    if a < 1e-15 { return [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]; }
    let k = t.map(|v| v / a);
    let skew = [[0.0, -k[2], k[1]], [k[2], 0.0, -k[0]], [-k[1], k[0], 0.0]];
    let mut r = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            r[i][j] = if i == j { a.cos() } else { 0.0 } + a.sin() * skew[i][j] + (1.0 - a.cos()) * k[i] * k[j];
        }
    }
    r
}

fn product(a: [[f64; 3]; 3], b: [[f64; 3]; 3]) -> [[f64; 3]; 3] {
    let mut out = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            out[i][j] = (0..3).map(|k| a[i][k] * b[k][j]).sum();
        }
    }
    out
}

/// With equal bending stiffnesses a rod under a tip moment M of fixed direction still bends into
/// the helix of `helix` whatever GJ is: its frame turns as exp(s·M/EI)·exp(s·(1/GJ − 1/EI)(M·e_x)·e_x).
/// Returns the tip position and rotation errors (tip rotation read as exp of the nodal rotations).
fn helix_with_torsion_stiffness(n: usize, gj_over_ei: f64) -> (bool, f64, f64) {
    let (alpha, kl, l, ei) = (std::f64::consts::FRAC_PI_4, std::f64::consts::FRAC_PI_2, 10.0, 1.0e7 / 12.0);
    let (mut input, exact) = helix(n, alpha, kl);
    input.sections.values_mut().for_each(|s| s.j = gj_over_ei / 6.0);
    let r = solve_corotational_3d(&input, 100, 1e-10, 40, false).unwrap();
    let d = r.results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let m = [kl / l * ei * alpha.cos(), 0.0, kl / l * ei * alpha.sin()];
    let twist = (1.0 / (gj_over_ei * ei) - 1.0 / ei) * m[0] * l;
    let want = product(rotation(m.map(|v| v * l / ei)), rotation([twist, 0.0, 0.0]));
    let have = rotation([d.rx, d.ry, d.rz]);
    let rotation_error = (0..9).map(|e| (want[e / 3][e % 3] - have[e / 3][e % 3]).powi(2)).sum::<f64>().sqrt();
    (r.converged, distance([10.0 + d.ux, d.uy, d.uz], exact) / l, rotation_error)
}

#[test]
fn a_helix_with_torsion_stiffer_than_bending_converges_to_the_exact_solution() {
    let (converged_20, position_20, rotation_20) = helix_with_torsion_stiffness(20, 2.0);
    let (converged_40, position_40, rotation_40) = helix_with_torsion_stiffness(40, 2.0);
    assert!(converged_20 && converged_40);
    assert!(position_40 < 5e-5 && rotation_40 < 5e-5, "{position_40} {rotation_40}");
    assert!(position_40 < 0.3 * position_20 && rotation_40 < 0.3 * rotation_20, "{position_20} → {position_40}, {rotation_20} → {rotation_40}");
}

#[test]
fn a_helix_with_torsion_softer_than_bending_is_exact_or_reported_unconverged() {
    let (converged, position, rotation) = helix_with_torsion_stiffness(40, 0.5);
    assert!(!converged || (position < 5e-5 && rotation < 5e-5), "converged to {position} {rotation}");
}

fn has_nl3(r: &CorotationalResult3D) -> bool {
    r.results.structured_diagnostics.iter().any(|d| d.phase.as_deref() == Some("NL-3"))
}

/// A member fixed against rotation at both ends whose far end sways by `sway_over_length`·L: double
/// curvature, both ends turning against the chord while not turning relative to each other.
fn swaying_member(sway_over_length: f64) -> SolverInput3D {
    let (l, ei) = (2.0f64, 1.0e7 / 12.0);
    serde_json::from_value(serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": l, "y": 0.0, "z": 0.0}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "materials": {"1": {"id": 1, "e": 1.0e4, "nu": 0.0}},
        "sections": {"1": {"id": 1, "a": 1.0, "iy": 1.0 / 12.0, "iz": 1.0 / 12.0, "j": 1.0 / 6.0}},
        "supports": {
            "1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true},
            "2": {"nodeId": 2, "rx": false, "ry": false, "rz": true, "rrx": true, "rry": true, "rrz": true}
        },
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0, "fy": 12.0 * ei * sway_over_length / (l * l), "fz": 0, "mx": 0, "my": 0, "mz": 0}}]
    })).unwrap()
}

#[test]
fn members_whose_ends_turn_past_0_02_rad_against_their_chord_carry_nl3() {
    let small = solve_corotational_3d(&swaying_member(0.005), 100, 1e-10, 10, false).unwrap();
    assert!(small.converged && !has_nl3(&small), "{:?}", small.results.structured_diagnostics);
    let large = solve_corotational_3d(&swaying_member(0.05), 100, 1e-10, 10, false).unwrap();
    assert!(large.converged && has_nl3(&large), "{:?}", large.results.structured_diagnostics);
    let d = large.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d.rx.abs() + d.ry.abs() + d.rz.abs() < 1e-12 && d.uy > 0.09, "{d:?}");

    let (coarse, _) = helix(4, std::f64::consts::FRAC_PI_4, std::f64::consts::FRAC_PI_2);
    assert!(has_nl3(&solve_corotational_3d(&coarse, 100, 1e-9, 40, false).unwrap()));
    let (gentle, _) = helix(4, std::f64::consts::FRAC_PI_4, 0.04);
    let r = solve_corotational_3d(&gentle, 100, 1e-9, 4, false).unwrap();
    assert!(r.converged && !has_nl3(&r), "{:?}", r.results.structured_diagnostics);
}

fn bent_in_double_curvature(end_turn: f64) -> SolverInput3D {
    let (l, ei) = (2.0f64, 1.0e7 / 12.0);
    let moment = 6.0 * ei * end_turn / l;
    serde_json::from_value(serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": l, "y": 0.0, "z": 0.0}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "materials": {"1": {"id": 1, "e": 1.0e4, "nu": 0.0}},
        "sections": {"1": {"id": 1, "a": 1.0, "iy": 1.0 / 12.0, "iz": 1.0 / 12.0, "j": 1.0 / 6.0}},
        "supports": {
            "1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": false},
            "2": {"nodeId": 2, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": false}
        },
        "loads": [
            {"type": "nodal", "data": {"nodeId": 1, "fx": 0, "fy": 0, "fz": 0, "mx": 0, "my": 0, "mz": moment}},
            {"type": "nodal", "data": {"nodeId": 2, "fx": 0, "fy": 0, "fz": 0, "mx": 0, "my": 0, "mz": moment}}
        ]
    })).unwrap()
}

#[test]
fn both_ends_bent_the_same_way_past_half_a_turn_are_never_reported_converged() {
    for turns in [0.5, 0.8] {
        let turn = turns * std::f64::consts::PI;
        let r = solve_corotational_3d(&bent_in_double_curvature(turn), 100, 1e-10, 40, false).unwrap();
        assert!(r.converged, "{turns}π");
        for d in &r.results.displacements {
            assert!((d.rz / turn - 1.0).abs() < 1e-8, "{turns}π: {d:?}");
        }
    }
    for end_turn in [1.5 * std::f64::consts::PI, 2.0 * std::f64::consts::PI, 2.0 * std::f64::consts::PI + 0.01] {
        for increments in [1, 10, 100] {
            match solve_corotational_3d(&bent_in_double_curvature(end_turn), increments, 1e-10, 40, false) {
                Err(e) => assert!(e.contains("member 1"), "{end_turn}: {e}"),
                Ok(r) => {
                    assert!(!r.converged && r.load_factor < 1.0, "{end_turn} rad in {increments}: reported converged");
                    let turn = r.results.displacements.iter().map(|d| d.rz.abs()).fold(0.0, f64::max);
                    assert!(turn <= 0.9 * std::f64::consts::PI, "{end_turn} rad in {increments}: ends at {turn}");
                }
            }
        }
    }
}
