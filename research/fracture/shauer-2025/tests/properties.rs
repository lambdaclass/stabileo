use phasefield_shauer_2025::examples::{bar, NotchedPlate};
use phasefield_shauer_2025::fe;
use phasefield_shauer_2025::mesh::{self, NotchedSquare};
use phasefield_shauer_2025::model::{Controls, Irreversibility, Material, Plane};
use phasefield_shauer_2025::solver::Solver;

fn steel() -> Material {
    Material { e: 210.0, nu: 0.3, gc: 2.7e-3, l0: 0.0075, plane: Plane::Strain }
}

#[test]
fn element_stiffness_reproduces_uniform_strain_energy_and_has_three_rigid_modes() {
    let m = steel();
    let x = [[0.0, 0.0], [2.0, 0.0], [2.5, 1.5], [0.2, 1.0]];
    for aligned in [false] {
        let k = fe::elastic_stiffness(&m, &x, &[0.0; 4], aligned).unwrap();
        let eps = [1e-3, -4e-4, 2.5e-4];
        let ue: Vec<f64> = x.iter().flat_map(|p| [eps[0] * p[0] + eps[2] * p[1], eps[2] * p[0] + eps[1] * p[1]]).collect();
        let energy: f64 = (0..8).map(|i| (0..8).map(|j| ue[i] * k[i][j] * ue[j]).sum::<f64>()).sum::<f64>() * 0.5;
        let area = 0.5 * ((x[0][0] * x[1][1] - x[1][0] * x[0][1]) + (x[1][0] * x[2][1] - x[2][0] * x[1][1]) + (x[2][0] * x[3][1] - x[3][0] * x[2][1]) + (x[3][0] * x[0][1] - x[0][0] * x[3][1]));
        let exact = fe::psi_total(&m, &eps) * area;
        assert!((energy - exact).abs() <= 1e-12 * exact, "{energy} vs {exact}");
        for rigid in [[1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0], [0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0]] {
            let f: f64 = (0..8).map(|i| (0..8).map(|j| k[i][j] * rigid[j]).sum::<f64>().abs()).sum();
            assert!(f < 1e-9);
        }
        let rot: Vec<f64> = x.iter().flat_map(|p| [-p[1], p[0]]).collect();
        let f: f64 = (0..8).map(|i| (0..8).map(|j| k[i][j] * rot[j]).sum::<f64>().abs()).sum();
        assert!(f < 1e-9);
    }
}

#[test]
fn full_damage_removes_stiffness_and_damage_system_is_symmetric() {
    let m = steel();
    let x = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
    let k = fe::elastic_stiffness(&m, &x, &[1.0; 4], true).unwrap();
    assert!(k.iter().flatten().all(|v| v.abs() < 1e-20));
    let (kd, fd) = fe::damage_system(&m, &x, &[0.3, 0.1, 0.0, 2.0], true).unwrap();
    for i in 0..4 {
        for j in 0..4 {
            assert_eq!(kd[i][j], kd[j][i]);
        }
        assert!(fd[i] >= 0.0);
    }
}

#[test]
fn tensile_energy_vanishes_in_pure_compression_and_equals_total_in_equibiaxial_tension() {
    let m = steel();
    assert_eq!(fe::psi_plus(&m, &[-1e-3, -2e-3, 1e-4]), 0.0);
    let e = [1e-3, 1e-3, 0.0];
    assert!((fe::psi_plus(&m, &e) - fe::psi_total(&m, &e)).abs() < 1e-15);
}

#[test]
fn homogeneous_bar_damage_matches_the_1d_at2_solution_before_localisation() {
    let mat = Material { e: 30.0, nu: 0.0, gc: 1.2e-4, l0: 10.0, plane: Plane::Stress };
    let controls = Controls { dt: 0.1, total_time: 0.6, max_iterations: 500, tolerance: 1e-10, irreversibility: Irreversibility::None };
    let problem = bar(mat, controls);
    let u_end = problem.reference_displacement;
    let mut solver = Solver::new(problem).unwrap();
    while let Some(s) = solver.advance().unwrap() {
        let eps = s.pseudotime * u_end / 200.0;
        let psi = 0.5 * mat.e * eps * eps;
        let d = 2.0 * psi / (mat.gc / mat.l0 + 2.0 * psi);
        let (_, d_mid) = solver.center_stress(450).unwrap();
        assert!((d_mid - d).abs() < 2e-3 * d.max(1e-6) + 1e-12, "step {}: {d_mid} vs {d}", s.step);
    }
}

fn damage_after_unloading(irreversibility: Irreversibility) -> (f64, f64) {
    let mut plate = NotchedPlate::reference();
    plate.mesh = NotchedSquare { nx: 30, ny: 30, nx_fine: 10, ny_fine: 6, h_fine: 0.004 };
    plate.material.l0 = 0.015;
    plate.controls.dt = 0.1;
    plate.controls.irreversibility = irreversibility;
    let mut solver = Solver::new(plate.problem().unwrap()).unwrap();
    for _ in 0..4 {
        solver.advance().unwrap().unwrap();
    }
    let loaded = solver.d.iter().cloned().fold(0.0, f64::max);
    for bc in solver.problem.dirichlet.iter_mut() {
        bc.value = 0.0;
    }
    solver.advance().unwrap().unwrap();
    (loaded, solver.d.iter().cloned().fold(0.0, f64::max))
}

#[test]
fn history_field_keeps_damage_on_unloading_and_the_reference_scheme_does_not() {
    let (loaded, unloaded) = damage_after_unloading(Irreversibility::History);
    assert!(loaded > 0.05);
    assert!((unloaded - loaded).abs() < 1e-6 * loaded, "history: {loaded} -> {unloaded}");
    let (loaded, unloaded) = damage_after_unloading(Irreversibility::None);
    assert!(loaded > 0.05);
    assert!(unloaded < 1e-12, "reference scheme: {loaded} -> {unloaded}");
}

#[test]
fn invalid_inputs_are_refused() {
    let bad = Material { e: -1.0, ..steel() };
    assert!(bad.validate().is_err());
    assert!(Material { nu: 0.5, ..steel() }.validate().is_err());
    assert!(NotchedSquare { nx: 31, ..NotchedSquare::REFERENCE }.validate().is_err());
    assert!(NotchedSquare { h_fine: 0.1, ..NotchedSquare::REFERENCE }.validate().is_err());
    let mut plate = NotchedPlate::reference();
    plate.controls.dt = 0.0;
    assert!(Solver::new(plate.problem().unwrap()).is_err());
    let m = mesh::rectangle(2, 1, 1.0, 1.0);
    assert_eq!(m.elements.len(), 2);
}

#[test]
fn invalid_spacing_and_jacobians_are_refused() {
    for h_fine in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 0.0, -0.001] {
        assert!(NotchedSquare { h_fine, ..NotchedSquare::REFERENCE }.validate().is_err());
    }
    let (_, dn) = fe::shape(0.0, 0.0);
    for aligned in [true, false] {
        for width in [0.0, f64::NAN, f64::INFINITY] {
            let x = [[0.0, 0.0], [width, 0.0], [width, 1.0], [0.0, 1.0]];
            assert!(fe::gradients(&x, &dn, aligned).is_err());
        }
    }
}

// Independent rectangular-Q4 integration: no production shape/gradient/energy helpers.
// Two Gauss points in each direction are the quadrature specified by the reference.
fn independent_energies(solver: &Solver) -> (f64, f64) {
    let m = solver.problem.material;
    let lambda = m.e * m.nu / ((1.0 + m.nu) * (1.0 - 2.0 * m.nu));
    let mu = m.e / (2.0 * (1.0 + m.nu));
    let mut elastic = 0.0;
    let mut fracture = 0.0;
    let g = 1.0 / 3.0f64.sqrt();
    for el in &solver.problem.mesh.elements {
        let x = &solver.problem.mesh.nodes;
        let width = x[el[1]][0] - x[el[0]][0];
        let height = x[el[3]][1] - x[el[0]][1];
        for xi in [-g, g] {
            for eta in [-g, g] {
                let mut d = 0.0;
                let mut dx = 0.0;
                let mut dy = 0.0;
                let mut ex = 0.0;
                let mut ey = 0.0;
                let mut shear = 0.0;
                for (a, (sx, sy)) in [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)].iter().enumerate() {
                    let n = (1.0 + sx * xi) * (1.0 + sy * eta) / 4.0;
                    let nx = sx * (1.0 + sy * eta) / (2.0 * width);
                    let ny = sy * (1.0 + sx * xi) / (2.0 * height);
                    let node = el[a];
                    d += n * solver.d[node];
                    dx += nx * solver.d[node];
                    dy += ny * solver.d[node];
                    ex += nx * solver.u[2 * node];
                    ey += ny * solver.u[2 * node + 1];
                    shear += ny * solver.u[2 * node] + nx * solver.u[2 * node + 1];
                }
                let area = width * height / 4.0;
                elastic += area * (1.0 - d).powi(2) * (lambda / 2.0 * (ex + ey).powi(2) + mu * (ex * ex + ey * ey + shear * shear / 2.0));
                fracture += area * m.gc / 2.0 * (d * d / m.l0 + m.l0 * (dx * dx + dy * dy));
            }
        }
    }
    (elastic, fracture)
}

#[test]
fn every_plate_energy_and_larger_length_peak_are_checked() {
    let mut peaks = Vec::new();
    for length in [0.0075, 0.015] {
        let mut plate = NotchedPlate::reference();
        plate.material.l0 = length;
        let mut solver = Solver::new(plate.problem().unwrap()).unwrap();
        let mut peak = 0.0f64;
        let mut count = 0;
        while let Some(step) = solver.advance().unwrap() {
            assert!(step.converged);
            let (elastic, fracture) = independent_energies(&solver);
            assert!((step.elastic_energy - elastic).abs() <= 1e-12 * elastic.abs().max(1e-20), "elastic step {}", step.step);
            assert!((step.fracture_energy - fracture).abs() <= 1e-12 * fracture.abs().max(1e-20), "fracture step {}", step.step);
            assert!((step.displacement - step.pseudotime * 0.01).abs() < 1e-14);
            peak = peak.max(step.reaction);
            count += 1;
        }
        assert_eq!(count, 79);
        peaks.push(peak);
    }
    assert!((peaks[0] - 0.7257947845).abs() < 1e-9);
    assert!(peaks[1] < peaks[0], "length-scale peaks: {peaks:?}");
}
