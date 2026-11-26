use dedaliano_engine::solver::spectral::{solve_spectral_3d, SpectralResult3D};
use dedaliano_engine::solver::modal::{solve_modal_2d, solve_modal_3d, uncondensed_solves, with_condensed_mass_range, ModalResult3D};
use serde_json::json;
use dedaliano_engine::types::*;
use std::collections::HashMap;

fn empty() -> SolverInput3D {
    let mut input = SolverInput3D {
        solver_options: None, masses: Default::default(), nodes: HashMap::new(), materials: HashMap::new(), sections: HashMap::new(),
        elements: HashMap::new(), supports: HashMap::new(), loads: vec![], constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(),
        curved_shells: HashMap::new(), curved_beams: vec![], connectors: HashMap::new(),
    };
    input.materials.insert("1".into(), SolverMaterial { id: 1, e: 30_000.0, nu: 0.2 });
    input
}

fn held(node_id: usize, f: [bool; 6]) -> SolverSupport3D {
    SolverSupport3D {
        node_id, rx: f[0], ry: f[1], rz: f[2], rrx: f[3], rry: f[4], rrz: f[5],
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
    }
}

const PINNED: [bool; 6] = [true, true, true, false, false, false];
const FIXED: [bool; 6] = [true; 6];

/// An n × n mesh of MITC4 quads on the surface `at` gives for (i, j), with no supports. The
/// rotation of each node about the shell's normal has no mass.
fn shell(n: usize, at: &dyn Fn(f64, f64) -> [f64; 3]) -> SolverInput3D {
    let mut input = empty();
    let node = |i: usize, j: usize| i * (n + 1) + j + 1;
    for i in 0..=n {
        for j in 0..=n {
            let [x, y, z] = at(i as f64, j as f64);
            input.nodes.insert(node(i, j).to_string(), SolverNode3D { id: node(i, j), x, y, z });
        }
    }
    let mut id = 1;
    for i in 0..n {
        for j in 0..n {
            input.quads.insert(id.to_string(), SolverQuadElement { id, nodes: [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)], material_id: 1, thickness: 0.2 });
            id += 1;
        }
    }
    input
}

fn hold(input: &mut SolverInput3D, n: usize, which: &dyn Fn(usize, usize) -> Option<[bool; 6]>) {
    for i in 0..=n {
        for j in 0..=n {
            let id = i * (n + 1) + j + 1;
            if let Some(f) = which(i, j) {
                input.supports.insert(id.to_string(), held(id, f));
            }
        }
    }
}

fn densities() -> HashMap<String, f64> {
    HashMap::from([("1".to_string(), 2500.0)])
}

/// The diagnostics of a result, those of a self-check without the values it measured.
fn diagnostics(result: &ModalResult3D) -> Vec<serde_json::Value> {
    let all = serde_json::to_value(&result.structured_diagnostics).unwrap();
    all.as_array().unwrap().iter().map(|d| {
        if d["phase"].as_str().is_some_and(|phase| phase.starts_with("self_check:")) {
            json!([d["code"], d["phase"], d["severity"]])
        } else {
            d.clone()
        }
    }).collect()
}

/// `compared`, for a model that has massless coordinates and is solved without condensing them.
fn agree(name: &str, model: &SolverInput3D, modes: usize, shapes: bool) -> ModalResult3D {
    let (found, uncondensed) = compared(name, model, modes, shapes);
    assert!(uncondensed, "{name}: the model has massless coordinates and is solved without condensing them");
    found
}

/// Both ways of solving `model`, and that they agree: the frequencies to 1e-9, the mass and its
/// cumulative ratios, and with `shapes` each mode's shape up to sign. With the modes, whether
/// the default way was the uncondensed one.
fn compared(name: &str, model: &SolverInput3D, modes: usize, shapes: bool) -> (ModalResult3D, bool) {
    let before = uncondensed_solves();
    let condensed = with_condensed_mass_range(|| solve_modal_3d(model, &densities(), modes)).unwrap_or_else(|e| panic!("{name}, condensed: {e}"));
    assert_eq!(uncondensed_solves(), before, "{name}: the comparison condenses");
    let found = solve_modal_3d(model, &densities(), modes).unwrap_or_else(|e| panic!("{name}: {e}"));
    let uncondensed = uncondensed_solves() > before;
    assert_eq!(diagnostics(&found), diagnostics(&condensed), "{name}");
    assert_eq!(found.modes.len(), modes, "{name}");
    assert_eq!((found.modes.len(), found.n_dof), (condensed.modes.len(), condensed.n_dof), "{name}");
    assert!((found.total_mass - condensed.total_mass).abs() <= 1e-12 * condensed.total_mass, "{name}");
    for (ratio, expected) in [
        (found.cumulative_mass_ratio_x, condensed.cumulative_mass_ratio_x),
        (found.cumulative_mass_ratio_y, condensed.cumulative_mass_ratio_y),
        (found.cumulative_mass_ratio_z, condensed.cumulative_mass_ratio_z),
    ] {
        assert!((ratio - expected).abs() <= 1e-8, "{name}: mass ratio {ratio} against {expected}");
    }
    for (k, (a, b)) in found.modes.iter().zip(&condensed.modes).enumerate() {
        assert!((a.frequency - b.frequency).abs() <= 1e-9 * b.frequency, "{name}, mode {k}: {} against {}", a.frequency, b.frequency);
        if !shapes {
            continue;
        }
        let all = |d: &Displacement3D| [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
        let scale = b.displacements.iter().flat_map(all).fold(0.0f64, |m, v| m.max(v.abs()));
        let sign = a.displacements.iter().zip(&b.displacements).map(|(x, y)| all(x).iter().zip(all(y)).map(|(p, q)| p * q).sum::<f64>()).sum::<f64>().signum();
        for (x, y) in a.displacements.iter().zip(&b.displacements) {
            assert_eq!(x.node_id, y.node_id);
            for (p, q) in all(x).into_iter().zip(all(y)) {
                assert!((sign * p - q).abs() <= 1e-6 * scale, "{name}, mode {k}, node {}: {p} against {q} (scale {scale})", x.node_id);
            }
        }
    }
    (found, uncondensed)
}

#[test]
fn a_slab_with_no_repeated_frequency_has_the_same_modes_and_shapes() {
    for n in [8, 16, 24] {
        let mut model = shell(n, &|i, j| [i, 0.7 * j, 3.0]);
        hold(&mut model, n, &|i, j| (i % 4 == 0 && j % 4 == 0).then_some(PINNED));
        agree(&format!("slab {n}"), &model, 6, true);
    }
}

#[test]
fn a_square_slab_has_its_repeated_frequencies() {
    let n = 16;
    let mut model = shell(n, &|i, j| [i, j, 3.0]);
    hold(&mut model, n, &|i, j| (i % 4 == 0 && j % 4 == 0).then_some(PINNED));
    let found = agree("square slab", &model, 8, false);
    let twins = found.modes.windows(2).filter(|w| (w[1].frequency - w[0].frequency).abs() <= 1e-9 * w[0].frequency).count();
    assert!(twins >= 2, "{twins} pairs of equal frequencies in {:?}", found.modes.iter().map(|m| m.frequency).collect::<Vec<_>>());
}

#[test]
fn a_curved_roof_whose_massless_rotations_are_along_no_axis_has_the_same_modes() {
    let n = 16;
    let radius = 25.0;
    let mut model = shell(n, &|i, j| {
        let angle = (i / n as f64 - 0.5) * 80f64.to_radians();
        [radius * angle.sin(), 3.1 * j, radius * angle.cos()]
    });
    hold(&mut model, n, &|_, j| (j == 0 || j == n).then_some(PINNED));
    agree("curved roof", &model, 6, true);
}

fn slab_on_columns() -> SolverInput3D {
    let n = 12;
    let mut model = shell(n, &|i, j| [i, 0.7 * j, 3.0]);
    model.sections.insert("1".into(), SolverSection3D {
        id: 1, name: None, a: 0.09, iy: 6.75e-4, iz: 6.75e-4, j: 1.1e-3, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None,
    });
    let mut next = (n + 1) * (n + 1) + 1;
    let mut element = n * n + 1;
    for i in (0..=n).step_by(4) {
        for j in (0..=n).step_by(4) {
            let top = i * (n + 1) + j + 1;
            model.nodes.insert(next.to_string(), SolverNode3D { id: next, x: i as f64, y: 0.7 * j as f64, z: 0.0 });
            model.supports.insert(next.to_string(), held(next, FIXED));
            model.elements.insert(element.to_string(), SolverElement3D {
                id: element, elem_type: "frame".into(), node_i: next, node_j: top, material_id: 1, section_id: 1,
                release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
                release_t_start: false, release_t_end: false, local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
            });
            next += 1;
            element += 1;
        }
    }
    model
}

#[test]
fn a_slab_on_columns_has_the_same_modes() {
    agree("slab on columns", &slab_on_columns(), 6, true);
}

#[test]
fn a_slab_with_an_inclined_support_and_a_tie_has_the_same_modes() {
    let n = 12;
    let mut model = shell(n, &|i, j| [i, 0.7 * j, 3.0]);
    hold(&mut model, n, &|i, j| (i % 4 == 0 && j % 4 == 0).then_some(PINNED));
    let corner = (n + 1) * (n + 1);
    let mut inclined = held(corner, [true, false, false, false, false, false]);
    inclined.is_inclined = Some(true);
    (inclined.normal_x, inclined.normal_y, inclined.normal_z) = (Some(0.6), Some(0.0), Some(0.8));
    model.supports.insert(corner.to_string(), inclined);
    let (a, b) = (2 * (n + 1) + 3, 6 * (n + 1) + 7);
    model.constraints.push(Constraint::EqualDOF(EqualDOFConstraint { master_node: a, slave_node: b, dofs: vec![2] }));
    agree("inclined support and tie", &model, 6, true);
}

#[test]
fn asking_for_half_the_finite_modes_or_more_takes_the_condensed_way() {
    let n = 6;
    let mut model = shell(n, &|i, j| [i, 0.7 * j, 3.0]);
    hold(&mut model, n, &|i, j| (i % 3 == 0 && j % 3 == 0).then_some(PINNED));
    let rank = 5 * (n + 1) * (n + 1) - 3 * 9;
    assert!(rank > 200);
    for modes in [rank / 2 - 1, rank / 2 + 1] {
        let condensed = with_condensed_mass_range(|| solve_modal_3d(&model, &densities(), modes)).unwrap();
        let before = uncondensed_solves();
        let found = solve_modal_3d(&model, &densities(), modes).unwrap();
        assert_eq!(uncondensed_solves() > before, 2 * modes < rank, "{modes} of {rank} modes");
        assert_eq!(found.modes.len(), modes);
        let same_bits = found.modes.iter().zip(&condensed.modes).all(|(a, b)| a.frequency.to_bits() == b.frequency.to_bits());
        if 2 * modes >= rank {
            assert!(same_bits, "{modes} of {rank} modes are found on the condensed pencil");
        }
        for (a, b) in found.modes.iter().zip(&condensed.modes) {
            assert!((a.frequency - b.frequency).abs() <= 1e-8 * b.frequency, "{modes} modes: {} against {}", a.frequency, b.frequency);
        }
    }
}

/// The nodes of an (m + 1) × (m + 1) lattice on the surface `at`, numbered row by row from `first`.
fn lattice(input: &mut SolverInput3D, m: usize, first: usize, at: &dyn Fn(f64, f64) -> [f64; 3]) {
    for i in 0..=m {
        for j in 0..=m {
            let id = first + i * (m + 1) + j;
            let [x, y, z] = at(i as f64, j as f64);
            input.nodes.insert(id.to_string(), SolverNode3D { id, x, y, z });
        }
    }
}

#[test]
fn a_slab_of_nine_node_quads_has_the_same_modes() {
    let n = 8;
    let mut model = empty();
    lattice(&mut model, 2 * n, 1, &|i, j| [0.5 * i, 0.35 * j, 3.0]);
    let node = |i: usize, j: usize| 1 + i * (2 * n + 1) + j;
    let mut id = 1;
    for i in 0..n {
        for j in 0..n {
            let at = |di: usize, dj: usize| node(2 * i + di, 2 * j + dj);
            model.quad9s.insert(id.to_string(), SolverQuad9Element {
                id, nodes: [at(0, 0), at(2, 0), at(2, 2), at(0, 2), at(1, 0), at(2, 1), at(1, 2), at(0, 1), at(1, 1)], material_id: 1, thickness: 0.2,
            });
            id += 1;
        }
    }
    for i in (0..=2 * n).step_by(8) {
        for j in (0..=2 * n).step_by(8) {
            model.supports.insert(node(i, j).to_string(), held(node(i, j), PINNED));
        }
    }
    agree("nine-node quads", &model, 6, true);
}

#[test]
fn a_roof_of_curved_shell_elements_has_the_same_modes() {
    let n = 14;
    let radius = 25.0;
    let mut model = empty();
    lattice(&mut model, n, 1, &|i, j| {
        let angle = (i / n as f64 - 0.5) * 80f64.to_radians();
        [radius * angle.sin(), 3.1 * j, radius * angle.cos()]
    });
    let node = |i: usize, j: usize| 1 + i * (n + 1) + j;
    let mut id = 1;
    for i in 0..n {
        for j in 0..n {
            model.curved_shells.insert(id.to_string(), SolverCurvedShellElement {
                id, nodes: [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)], material_id: 1, thickness: 0.2, normals: None,
            });
            id += 1;
        }
    }
    hold(&mut model, n, &|_, j| (j == 0 || j == n).then_some(PINNED));
    agree("curved shell elements", &model, 6, true);
}

#[test]
fn a_slab_of_solid_shells_has_no_massless_coordinate_and_is_solved_as_it_was() {
    let n = 12;
    let mut model = empty();
    let layer = (n + 1) * (n + 1);
    lattice(&mut model, n, 1, &|i, j| [i, 0.7 * j, 2.9]);
    lattice(&mut model, n, 1 + layer, &|i, j| [i, 0.7 * j, 3.1]);
    let node = |i: usize, j: usize| 1 + i * (n + 1) + j;
    let mut id = 1;
    for i in 0..n {
        for j in 0..n {
            let bottom = [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)];
            model.solid_shells.insert(id.to_string(), SolverSolidShellElement {
                id, nodes: [bottom[0], bottom[1], bottom[2], bottom[3], bottom[0] + layer, bottom[1] + layer, bottom[2] + layer, bottom[3] + layer], material_id: 1,
            });
            id += 1;
        }
    }
    hold(&mut model, n, &|i, j| (i % 4 == 0 && j % 4 == 0).then_some(PINNED));
    let (_, uncondensed) = compared("solid shells", &model, 6, true);
    assert!(!uncondensed, "a solid-shell has no rotations, so no coordinate without mass, and is solved as it was");
}

#[test]
fn three_slabs_apart_have_each_frequency_three_times() {
    let n = 8;
    let mut model = empty();
    let per = (n + 1) * (n + 1);
    let mut id = 1;
    for copy in 0..3 {
        let first = 1 + copy * per;
        lattice(&mut model, n, first, &|i, j| [i + 20.0 * copy as f64, 0.7 * j, 3.0]);
        let node = |i: usize, j: usize| first + i * (n + 1) + j;
        for i in 0..n {
            for j in 0..n {
                model.quads.insert(id.to_string(), SolverQuadElement { id, nodes: [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)], material_id: 1, thickness: 0.2 });
                id += 1;
                if i % 4 == 0 && j % 4 == 0 {
                    model.supports.insert(node(i, j).to_string(), held(node(i, j), PINNED));
                }
            }
        }
        for k in (0..=n).step_by(4) {
            model.supports.insert(node(n, k).to_string(), held(node(n, k), PINNED));
            model.supports.insert(node(k, n).to_string(), held(node(k, n), PINNED));
        }
    }
    let found = agree("three slabs", &model, 9, false);
    for triple in found.modes.chunks(3) {
        assert!((triple[2].frequency - triple[0].frequency).abs() <= 1e-8 * triple[0].frequency, "{:?}", found.modes.iter().map(|m| m.frequency).collect::<Vec<_>>());
    }
    assert!(found.modes[3].frequency > 1.0001 * found.modes[2].frequency);
}

#[test]
fn a_space_frame_with_its_mass_lumped_at_the_joints_has_the_same_modes() {
    let (bays, storeys) = (3, 6);
    let mut model = empty();
    model.sections.insert("1".into(), SolverSection3D {
        id: 1, name: None, a: 0.09, iy: 6.75e-4, iz: 4.1e-4, j: 1.1e-3, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None,
    });
    let node = |i: usize, j: usize, k: usize| 1 + (k * (bays + 1) + i) * (bays + 1) + j;
    let mut masses = Vec::new();
    for k in 0..=storeys {
        for i in 0..=bays {
            for j in 0..=bays {
                let id = node(i, j, k);
                model.nodes.insert(id.to_string(), SolverNode3D { id, x: 5.0 * i as f64, y: 4.0 * j as f64, z: 3.0 * k as f64 });
                if k == 0 {
                    model.supports.insert(id.to_string(), held(id, FIXED));
                } else {
                    masses.push(json!({"nodeId": id, "mass": 2.0 + 0.01 * (i + 2 * j) as f64}));
                }
            }
        }
    }
    model.masses = serde_json::from_value(json!({"nodal": masses})).unwrap();
    let mut id = 1;
    let mut member = |model: &mut SolverInput3D, a: usize, b: usize| {
        model.elements.insert(id.to_string(), SolverElement3D {
            id, elem_type: "frame".into(), node_i: a, node_j: b, material_id: 1, section_id: 1,
            release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
            release_t_start: false, release_t_end: false, local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
        id += 1;
    };
    for k in 1..=storeys {
        for i in 0..=bays {
            for j in 0..=bays {
                member(&mut model, node(i, j, k - 1), node(i, j, k));
                if i < bays { member(&mut model, node(i, j, k), node(i + 1, j, k)); }
                if j < bays { member(&mut model, node(i, j, k), node(i, j + 1, k)); }
            }
        }
    }
    let none = HashMap::new();
    let before = uncondensed_solves();
    let condensed = with_condensed_mass_range(|| solve_modal_3d(&model, &none, 6)).unwrap();
    let found = solve_modal_3d(&model, &none, 6).unwrap();
    assert!(uncondensed_solves() > before, "the rotations of every joint are without mass");
    for (a, b) in found.modes.iter().zip(&condensed.modes) {
        assert!((a.frequency - b.frequency).abs() <= 1e-9 * b.frequency, "{} against {}", a.frequency, b.frequency);
    }
    assert!((found.cumulative_mass_ratio_x - condensed.cumulative_mass_ratio_x).abs() <= 1e-8);
    assert!((found.cumulative_mass_ratio_y - condensed.cumulative_mass_ratio_y).abs() <= 1e-8);
}

#[test]
fn a_plane_frame_with_its_mass_lumped_at_the_joints_has_the_same_modes() {
    let (bays, storeys) = (8, 14);
    let node = |i: usize, k: usize| 1 + k * (bays + 1) + i;
    let (mut nodes, mut supports, mut elements, mut masses) = (serde_json::Map::new(), serde_json::Map::new(), serde_json::Map::new(), Vec::new());
    let mut id = 1;
    for k in 0..=storeys {
        for i in 0..=bays {
            let n = node(i, k);
            nodes.insert(n.to_string(), json!({"id": n, "x": 5.0 * i as f64, "z": 3.0 * k as f64}));
            if k == 0 {
                supports.insert(n.to_string(), json!({"id": n, "nodeId": n, "type": "fixed"}));
                continue;
            }
            masses.push(json!({"nodeId": n, "mass": 2.0 + 0.01 * i as f64}));
            let mut member = |a: usize, b: usize| {
                elements.insert(id.to_string(), json!({"id": id, "type": "frame", "nodeI": a, "nodeJ": b, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false}));
                id += 1;
            };
            member(node(i, k - 1), n);
            if i < bays { member(n, node(i + 1, k)); }
        }
    }
    let model: SolverInput = serde_json::from_value(json!({
        "nodes": nodes, "materials": {"1": {"id": 1, "e": 30000.0, "nu": 0.2}}, "sections": {"1": {"id": 1, "a": 0.09, "iz": 6.75e-4}},
        "elements": elements, "supports": supports, "loads": [], "masses": {"nodal": masses},
    })).unwrap();
    let none = HashMap::new();
    let before = uncondensed_solves();
    let condensed = with_condensed_mass_range(|| solve_modal_2d(&model, &none, 6)).unwrap();
    assert_eq!(uncondensed_solves(), before);
    let found = solve_modal_2d(&model, &none, 6).unwrap();
    assert!(uncondensed_solves() > before, "the rotation of every joint is without mass, and the mass rank is over 200");
    assert_eq!(found.modes.len(), 6);
    for (a, b) in found.modes.iter().zip(&condensed.modes) {
        assert!((a.frequency - b.frequency).abs() <= 1e-9 * b.frequency, "{} against {}", a.frequency, b.frequency);
        let scale = b.displacements.iter().flat_map(|d| [d.ux, d.uz, d.ry]).fold(0.0f64, |m, v| m.max(v.abs()));
        let sign = a.displacements.iter().zip(&b.displacements).map(|(x, y)| x.ux * y.ux + x.uz * y.uz).sum::<f64>().signum();
        for (x, y) in a.displacements.iter().zip(&b.displacements) {
            for (p, q) in [(x.ux, y.ux), (x.uz, y.uz), (x.ry, y.ry)] {
                assert!((sign * p - q).abs() <= 1e-6 * scale, "node {}: {p} against {q}", x.node_id);
            }
        }
    }
    assert!((found.cumulative_mass_ratio_x - condensed.cumulative_mass_ratio_x).abs() <= 1e-8);
}

fn spectral(model: &SolverInput3D, modal: &ModalResult3D, direction: &str) -> SpectralResult3D {
    let modes = modal.modes.iter().map(|m| SpectralModeInput3D {
        frequency: m.frequency, period: m.period, omega: m.omega,
        displacements: m.displacements.iter().map(|d| SpectralModeDisp3D {
            node_id: d.node_id, ux: d.ux, uy: d.uy, uz: d.uz, rx: d.rx, ry: d.ry, rz: d.rz,
        }).collect(),
        participation_x: m.participation_x, participation_y: m.participation_y, participation_z: m.participation_z,
        effective_mass_x: m.effective_mass_x, effective_mass_y: m.effective_mass_y, effective_mass_z: m.effective_mass_z,
    }).collect();
    let points = [(0.0, 0.4), (0.1, 1.0), (0.5, 1.0), (1.0, 0.5), (4.0, 0.125)];
    solve_spectral_3d(&SpectralInput3D {
        solver: model.clone(), modes, densities: densities(),
        spectrum: DesignSpectrum { name: "plateau".into(), points: points.iter().map(|&(period, sa)| SpectrumPoint { period, sa }).collect(), in_g: Some(true) },
        direction: direction.into(), rule: Some("CQC".into()), xi: Some(0.05), importance_factor: None, reduction_factor: None, total_mass: None,
    }).unwrap_or_else(|e| panic!("spectral {direction}: {e}"))
}

#[test]
fn a_spectral_analysis_on_the_modes_found_without_condensing_is_the_one_on_the_condensed_modes() {
    let model = slab_on_columns();
    let before = uncondensed_solves();
    let found = solve_modal_3d(&model, &densities(), 6).unwrap();
    assert!(uncondensed_solves() > before);
    let condensed = with_condensed_mass_range(|| solve_modal_3d(&model, &densities(), 6)).unwrap();
    for direction in ["X", "Y", "Z"] {
        let (a, b) = (spectral(&model, &found, direction), spectral(&model, &condensed, direction));
        assert!(b.base_shear > 0.0, "{direction}");
        assert!((a.base_shear - b.base_shear).abs() <= 1e-8 * b.base_shear, "{direction}: base shear {} against {}", a.base_shear, b.base_shear);
        assert_eq!(serde_json::to_value(&a.structured_diagnostics).unwrap(), serde_json::to_value(&b.structured_diagnostics).unwrap(), "{direction}");
        assert_eq!(a.per_mode.len(), b.per_mode.len());
        for (x, y) in a.per_mode.iter().zip(&b.per_mode) {
            assert!((x.sa - y.sa).abs() <= 1e-9 * y.sa && (x.modal_force.abs() - y.modal_force.abs()).abs() <= 1e-8 * b.base_shear, "{direction}, mode {}", y.mode);
        }
        let all = |d: &Displacement3D| [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
        let scale = b.displacements.iter().flat_map(all).fold(0.0f64, |m, v| m.max(v.abs()));
        assert!(scale > 0.0 && a.displacements.len() == b.displacements.len());
        for (x, y) in a.displacements.iter().zip(&b.displacements) {
            assert_eq!(x.node_id, y.node_id);
            for (p, q) in all(x).into_iter().zip(all(y)) {
                assert!((p - q).abs() <= 1e-6 * scale, "{direction}, node {}: {p} against {q}", x.node_id);
            }
        }
        let forces = |f: &dedaliano_engine::solver::spectral::SpectralElementForce3D| [f.n_max, f.vy_max, f.vz_max, f.mx_max, f.my_max, f.mz_max];
        let scale = b.element_forces.iter().flat_map(forces).fold(0.0f64, f64::max);
        assert!(scale > 0.0 && a.element_forces.len() == b.element_forces.len());
        for (x, y) in a.element_forces.iter().zip(&b.element_forces) {
            assert_eq!(x.element_id, y.element_id);
            for (p, q) in forces(x).into_iter().zip(forces(y)) {
                assert!((p - q).abs() <= 1e-6 * scale, "{direction}, element {}: {p} against {q}", x.element_id);
            }
        }
    }
}
