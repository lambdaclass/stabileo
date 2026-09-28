//! Analytical recovery checks independent of the element B matrices.
//! Right-handed rotations: rx = w,y, ry = -w,x. Public moments are
//! sagging-positive (bottom-face tension), so M = Db [w,xx, w,yy, 2 w,xy].
use dedaliano_engine::element::{plate::*, quad::*, quad9::*};

const E: f64 = 30e6;
const NU: f64 = 0.2;
const T: f64 = 0.1;
const ALPHA: f64 = 1e-5;
const Q9: [[f64; 3]; 9] = [
    [0., 0., 0.],
    [2., 0., 0.],
    [2., 1., 0.],
    [0., 1., 0.],
    [1., 0., 0.],
    [2., 0.5, 0.],
    [1., 1., 0.],
    [0., 0.5, 0.],
    [1., 0.5, 0.],
];
const Q4: [[f64; 3]; 4] = [Q9[0], Q9[1], Q9[2], Q9[3]];
// Skew triangle, with its local x axis along global x.
const TRI: [[f64; 3]; 3] = [[0., 0., 0.], [2., 0., 0.], [0.4, 1., 0.]];

fn field(points: &[[f64; 3]], k: [f64; 3], strain: [f64; 3]) -> Vec<f64> {
    points
        .iter()
        .flat_map(|[x, y, _]| {
            [
                strain[0] * x + 0.5 * strain[2] * y,
                strain[1] * y + 0.5 * strain[2] * x,
                0.5 * (k[0] * x * x + k[1] * y * y + k[2] * x * y),
                k[1] * y + 0.5 * k[2] * x,
                -k[0] * x - 0.5 * k[2] * y,
                0.,
            ]
        })
        .collect()
}

fn elastic(v: [f64; 3], scale: f64) -> [f64; 3] {
    let c = E * scale / (1. - NU * NU);
    [
        c * (v[0] + NU * v[1]),
        c * (v[1] + NU * v[0]),
        c * (1. - NU) / 2. * v[2],
    ]
}

fn near(actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() < 1e-8 * expected.abs().max(1.),
        "actual {actual:e}, expected {expected:e}"
    );
}

fn moments(actual: [f64; 3], expected: [f64; 3]) {
    for i in 0..3 {
        near(actual[i], expected[i]);
    }
}

fn equilibrium(k: &[f64], u: &[f64], f: &[f64]) {
    for i in 0..u.len() {
        near((0..u.len()).map(|j| k[i * u.len() + j] * u[j]).sum(), f[i]);
    }
}

#[test]
fn mitc4_free_and_restrained_thermal_moments_at_centroid_and_nodes() {
    for dt in [-20., 20.] {
        let curvature = -ALPHA * dt / T;
        let u: [f64; 24] = field(&Q4, [curvature, curvature, 0.], [0.; 3])
            .try_into()
            .unwrap();
        equilibrium(
            &mitc4_local_stiffness(&Q4, E, NU, T),
            &u,
            &quad_thermal_load(&Q4, E, NU, T, ALPHA, 0., dt),
        );
        for (disp, expected) in [
            (u, [0.; 3]),
            (
                [0.; 24],
                elastic([-curvature, -curvature, 0.], T.powi(3) / 12.),
            ),
        ] {
            let s = quad_stresses(&Q4, &disp, E, NU, T, ALPHA, 0., dt);
            moments([s.mx, s.my, s.mxy], expected);
            for s in quad_stress_at_nodes(&Q4, &disp, E, NU, T, ALPHA, 0., dt) {
                moments([s.mx, s.my, s.mxy], expected);
            }
        }
    }
}

#[test]
fn mitc9_free_and_restrained_thermal_moments_at_centroid_and_nodes() {
    for dt in [-20., 20.] {
        let curvature = -ALPHA * dt / T;
        let u: [f64; 54] = field(&Q9, [curvature, curvature, 0.], [0.; 3])
            .try_into()
            .unwrap();
        equilibrium(
            &mitc9_local_stiffness(&Q9, E, NU, T),
            &u,
            &quad9_thermal_load(&Q9, E, NU, T, ALPHA, 0., dt),
        );
        for (disp, expected) in [
            (u, [0.; 3]),
            (
                [0.; 54],
                elastic([-curvature, -curvature, 0.], T.powi(3) / 12.),
            ),
        ] {
            let s = quad9_stresses(&Q9, &disp, E, NU, T, ALPHA, 0., dt);
            moments([s.mx, s.my, s.mxy], expected);
            for s in quad9_stress_at_nodes(&Q9, &disp, E, NU, T, ALPHA, 0., dt) {
                moments([s.mx, s.my, s.mxy], expected);
            }
        }
    }
}

#[test]
fn dkt_reports_sagging_positive_moments_including_twist() {
    for k in [
        [0.002, -0.001, 0.003],
        [-0.002, 0.001, -0.003],
        [0., 0., 0.003],
    ] {
        let u = field(&TRI, k, [0.; 3]);
        let expected = elastic(k, T.powi(3) / 12.);
        let s = plate_stress_recovery(&TRI, E, NU, T, &u, 0., 0., 0.);
        moments([s.mx, s.my, s.mxy], expected);
        for s in plate_stress_at_nodes(&TRI, E, NU, T, &u) {
            moments([s.mx, s.my, s.mxy], expected);
        }
    }
}

#[test]
fn dkt_thermal_equilibrium_and_restrained_moment_sign() {
    for dt in [-20., 20.] {
        let curvature = -ALPHA * dt / T;
        let u = field(&TRI, [curvature, curvature, 0.], [0.; 3]);
        equilibrium(
            &plate_local_stiffness(&TRI, E, NU, T),
            &u,
            &plate_thermal_load(&TRI, E, NU, T, ALPHA, 0., dt),
        );
        let free = plate_stress_recovery(&TRI, E, NU, T, &u, ALPHA, 0., dt);
        moments([free.mx, free.my, free.mxy], [0.; 3]);
        near(free.von_mises, 0.);
        let fixed = plate_stress_recovery(&TRI, E, NU, T, &[0.; 18], ALPHA, 0., dt);
        moments(
            [fixed.mx, fixed.my, fixed.mxy],
            elastic([-curvature, -curvature, 0.], T.powi(3) / 12.),
        );
    }
}

fn principal(s: [f64; 3]) -> [f64; 3] {
    let avg = (s[0] + s[1]) / 2.;
    let r = ((s[0] - s[1]).powi(2) / 4. + s[2].powi(2)).sqrt();
    [
        avg + r,
        avg - r,
        (s[0].powi(2) - s[0] * s[1] + s[1].powi(2) + 3. * s[2].powi(2)).sqrt(),
    ]
}

#[test]
fn dkt_moment_convention_preserves_physical_fibre_stresses() {
    let k = [0.002, -0.001, 0.003];
    for strain in [[0.0004, 0.0002, 0.0001], [-0.0004, -0.0002, -0.0001]] {
        let u = field(&TRI, k, strain);
        let membrane = elastic(strain, 1.);
        // epsilon(z) = epsilon_mid - z * [w,xx, w,yy, 2 w,xy].
        let bend = elastic(k, T / 2.);
        let top = principal(std::array::from_fn(|i| membrane[i] - bend[i]));
        let bottom = principal(std::array::from_fn(|i| membrane[i] + bend[i]));
        let expected = if top[2] >= bottom[2] { top } else { bottom };
        let centroid = plate_stress_recovery(&TRI, E, NU, T, &u, 0., 0., 0.);
        for s in std::iter::once(centroid).chain(plate_stress_at_nodes(&TRI, E, NU, T, &u)) {
            moments([s.sigma_1, s.sigma_2, s.von_mises], expected);
        }
    }
}
