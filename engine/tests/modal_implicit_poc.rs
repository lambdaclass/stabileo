use dedaliano_engine::solver::modal::{solve_modal_3d, with_implicit_mass_range};
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// An n × n slab of MITC4 quads, 1 m by 0.7 m each so that no two modes share a frequency,
/// pinned at every fourth node both ways. The rotation of each node about the vertical has no
/// mass.
fn slab(n: usize) -> SolverInput3D {
    let mut input = SolverInput3D {
        solver_options: None, masses: Default::default(), nodes: HashMap::new(), materials: HashMap::new(), sections: HashMap::new(),
        elements: HashMap::new(), supports: HashMap::new(), loads: vec![], constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(),
        curved_shells: HashMap::new(), curved_beams: vec![], connectors: HashMap::new(),
    };
    input.materials.insert("1".into(), SolverMaterial { id: 1, e: 30_000.0, nu: 0.2 });
    let node = |i: usize, j: usize| i * (n + 1) + j + 1;
    for i in 0..=n {
        for j in 0..=n {
            let id = node(i, j);
            input.nodes.insert(id.to_string(), SolverNode3D { id, x: i as f64, y: 0.7 * j as f64, z: 3.0 });
            if i % 4 == 0 && j % 4 == 0 {
                input.supports.insert(id.to_string(), SolverSupport3D {
                    node_id: id, rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false,
                    kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
                    dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
                    normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
                });
            }
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

#[test]
fn the_modes_of_the_uncondensed_pencil_are_the_condensed_ones_to_rounding() {
    let densities: HashMap<String, f64> = HashMap::from([("1".to_string(), 2500.0)]);
    for n in [8, 16, 24] {
        let model = slab(n);
        let condensed = solve_modal_3d(&model, &densities, 6).unwrap();
        let implicit = with_implicit_mass_range(|| solve_modal_3d(&model, &densities, 6)).unwrap();
        assert_eq!(implicit.modes.len(), condensed.modes.len());
        assert_eq!(implicit.n_dof, condensed.n_dof);
        assert!((implicit.total_mass - condensed.total_mass).abs() <= 1e-12 * condensed.total_mass);
        for (ratio, expected) in [
            (implicit.cumulative_mass_ratio_x, condensed.cumulative_mass_ratio_x),
            (implicit.cumulative_mass_ratio_y, condensed.cumulative_mass_ratio_y),
            (implicit.cumulative_mass_ratio_z, condensed.cumulative_mass_ratio_z),
        ] {
            assert!((ratio - expected).abs() <= 1e-9, "n {n}: mass ratio {ratio} against {expected}");
        }
        for (k, (a, b)) in implicit.modes.iter().zip(&condensed.modes).enumerate() {
            assert!((a.frequency - b.frequency).abs() <= 1e-10 * b.frequency, "n {n}, mode {k}: {} against {}", a.frequency, b.frequency);
            let scale = b.displacements.iter().flat_map(|d| [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz]).fold(0.0f64, |m, v| m.max(v.abs()));
            let sign = a.displacements.iter().zip(&b.displacements).map(|(x, y)| x.uz * y.uz + x.ux * y.ux + x.uy * y.uy).sum::<f64>().signum();
            for (x, y) in a.displacements.iter().zip(&b.displacements) {
                assert_eq!(x.node_id, y.node_id);
                for (p, q) in [(x.ux, y.ux), (x.uy, y.uy), (x.uz, y.uz), (x.rx, y.rx), (x.ry, y.ry), (x.rz, y.rz)] {
                    assert!((sign * p - q).abs() <= 1e-7 * scale, "n {n}, mode {k}, node {}: {p} against {q} (scale {scale})", x.node_id);
                }
            }
        }
        assert!(!with_implicit_mass_range(|| true) || solve_modal_3d(&model, &densities, 2).is_ok(), "the switch does not outlive the call");
    }
}
