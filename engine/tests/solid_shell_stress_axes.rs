use dedaliano_engine::element::solid_shell::*;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;

fn rotate([x, y, z]: [f64; 3], angle: f64) -> [f64; 3] {
    let (s, c) = angle.sin_cos();
    [x, c * y - s * z, s * y + c * z]
}

fn near(a: f64, b: f64, scale: f64) {
    assert!(
        (a - b).abs() < 1e-7 * scale.max(1.0),
        "actual {a:.12e}, expected {b:.12e}"
    );
}

fn strip(curved: bool, angle: f64) -> SolverInput3D {
    let mut input: SolverInput3D = serde_json::from_str(include_str!(
        "metamorphic_corpus/feature_matrix/3d-solid-shell-strip-cantilever------0-with.json"
    ))
    .unwrap();
    for node in input.nodes.values_mut() {
        let p = if curved {
            let theta = node.y / 0.8;
            [
                node.x,
                (0.8 + node.z) * theta.sin(),
                (0.8 + node.z) * theta.cos() - 0.8,
            ]
        } else {
            [node.x, node.y, node.z]
        };
        [node.x, node.y, node.z] = rotate(p, angle);
    }
    for load in &mut input.loads {
        if let SolverLoad3D::Nodal(f) = load {
            [f.fx, f.fy, f.fz] = rotate([f.fx, 0.4 * f.fx, f.fz], angle);
        }
    }
    input
}

fn rotation_invariance(curved: bool, angle: f64) {
    let base = linear::solve_3d(&strip(curved, 0.0)).unwrap();
    let turned = linear::solve_3d(&strip(curved, angle)).unwrap();
    assert!(!base.quad_stresses.is_empty());
    for a in &base.quad_stresses {
        let b = turned
            .quad_stresses
            .iter()
            .find(|s| s.element_id == a.element_id)
            .unwrap();
        eprintln!(
            "curved={curved}, angle={angle}, e{}: vm {} -> {}",
            a.element_id, a.von_mises, b.von_mises
        );
        for (x, y) in [
            (b.sigma_xx, a.sigma_xx),
            (b.sigma_yy, a.sigma_yy),
            (b.tau_xy, a.tau_xy),
            (b.von_mises, a.von_mises),
        ] {
            near(x, y, a.von_mises);
        }
    }
    for a in &base.displacements {
        let b = turned
            .displacements
            .iter()
            .find(|d| d.node_id == a.node_id)
            .unwrap();
        let expected = rotate([a.ux, a.uy, a.uz], angle);
        for (x, y) in [b.ux, b.uy, b.uz].into_iter().zip(expected) {
            near(x, y, 1.0);
        }
    }
}

#[test]
fn flat_plate_rotated_90_degrees() {
    rotation_invariance(false, std::f64::consts::FRAC_PI_2);
}

#[test]
fn flat_plate_rotated_arbitrary_angle() {
    rotation_invariance(false, 0.731);
}

#[test]
fn curved_panel_rotated_arbitrary_angle() {
    rotation_invariance(true, 1.123);
}

#[test]
fn vertical_plate_analytical_membrane_traction() {
    let (e, nu, force, width, thickness) = (200e6, 0.3, 100.0, 2.0, 0.1);
    let sigma = force / (width * thickness);
    let coords = [
        [0., 0., -0.05],
        [2., 0., -0.05],
        [2., 1., -0.05],
        [0., 1., -0.05],
        [0., 0., 0.05],
        [2., 0., 0.05],
        [2., 1., 0.05],
        [0., 1., 0.05],
    ];
    let u: Vec<f64> = coords
        .iter()
        .flat_map(|&[x, y, z]| {
            rotate(
                [-nu * sigma / e * x, sigma / e * y, -nu * sigma / e * z],
                std::f64::consts::FRAC_PI_2,
            )
        })
        .collect();
    let vertical = coords.map(|p| rotate(p, std::f64::consts::FRAC_PI_2));
    let s = solid_shell_stresses(&vertical, &u, e, nu);
    eprintln!(
        "vertical traction: sigmaYY={}, vm={}, analytical N/A={sigma}",
        s.sigma_yy, s.von_mises
    );
    near(s.sigma_yy, sigma, sigma);
    near(s.sigma_xx, 0.0, sigma);
    near(s.tau_xy, 0.0, sigma);
    near(s.von_mises, sigma, sigma);
}

#[test]
fn aligned_xy_plate_preserves_global_components_exactly() {
    let coords = [
        [0., 0., -0.05],
        [2., 0., -0.05],
        [2., 1., -0.05],
        [0., 1., -0.05],
        [0., 0., 0.05],
        [2., 0., 0.05],
        [2., 1., 0.05],
        [0., 1., 0.05],
    ];
    let u: Vec<f64> = (0..24)
        .map(|k| ((k * 7 % 11) as f64 - 5.0) * 1e-4)
        .collect();
    let g = solid_shell_avg_stress(&coords, &u, 200e6, 0.3);
    let s = solid_shell_stresses(&coords, &u, 200e6, 0.3);
    assert_eq!(
        [s.sigma_xx, s.sigma_yy, s.tau_xy].map(f64::to_bits),
        [g[0], g[1], g[3]].map(f64::to_bits)
    );
    assert_eq!(
        s.von_mises.to_bits(),
        (g[0] * g[0] - g[0] * g[1] + g[1] * g[1] + 3.0 * g[3] * g[3])
            .sqrt()
            .to_bits()
    );
}

fn analytical_membrane_patch(transform: fn([f64; 3]) -> [f64; 3], expected: [f64; 3]) {
    let (e, nu) = (200e6, 0.3);
    let [s11, s22, t12] = expected;
    let coords = [
        [0., 0., -0.05],
        [2., 0., -0.05],
        [2., 1., -0.05],
        [0., 1., -0.05],
        [0., 0., 0.05],
        [2., 0., 0.05],
        [2., 1., 0.05],
        [0., 1., 0.05],
    ];
    let u: Vec<f64> = coords
        .iter()
        .flat_map(|&[x, y, z]| {
            transform([
                (s11 - nu * s22) / e * x + (1.0 + nu) * t12 / e * y,
                (s22 - nu * s11) / e * y + (1.0 + nu) * t12 / e * x,
                -nu * (s11 + s22) / e * z,
            ])
        })
        .collect();
    let turned = coords.map(transform);
    let s = solid_shell_stresses(&turned, &u, e, nu);
    let vm = (s11 * s11 - s11 * s22 + s22 * s22 + 3.0 * t12 * t12).sqrt();
    for (actual, expected) in [s.sigma_xx, s.sigma_yy, s.tau_xy, s.von_mises]
        .into_iter()
        .zip([s11, s22, t12, vm])
    {
        near(actual, expected, vm);
    }
}

#[test]
fn local_e1_along_global_z_analytical_traction() {
    let (force, width, thickness) = (50.0, 1.0, 0.1);
    analytical_membrane_patch(
        |[x, y, z]| [-z, y, x],
        [force / (width * thickness), 0.0, 0.0],
    );
}

#[test]
fn compound_rotation_analytical_membrane_with_shear() {
    analytical_membrane_patch(
        |p| {
            let [x, y, z] = rotate(p, 0.731);
            let (s, c) = 0.917_f64.sin_cos();
            [c * x + s * z, y, -s * x + c * z]
        },
        [700.0, -200.0, 150.0],
    );
}
