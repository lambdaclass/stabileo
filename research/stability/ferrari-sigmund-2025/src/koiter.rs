use crate::model::roorda;
use dedaliano_engine::solver::{buckling::{buckling_system_2d, solve_buckling_2d}, corotational::solve_corotational_2d};
use dedaliano_engine::types::Displacement;
use dedaliano_engine::types::{SolverInput, SolverNodalLoad, SolverLoad, SolverSupport};

pub const SPRING: f64 = 10.0;

fn held(n: usize, area: f64, lambda: f64, theta: f64) -> SolverInput {
    let mut input = roorda(n, 0.);
    for section in input.sections.values_mut() {
        section.a = area;
    }
    input.supports.insert(
        "3".into(),
        SolverSupport { id: 3, node_id: n + 1, support_type: "spring".into(), kx: None, ky: None, kz: Some(SPRING), dx: None, dz: None, dry: None, angle: None },
    );
    input.loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: 0., fz: -lambda, my: SPRING * theta })];
    input
}

fn vector(n: usize, displacements: &[Displacement]) -> Vec<f64> {
    let mut v = vec![0.; 3 * (2 * n + 1)];
    for d in displacements {
        v[3 * (d.node_id - 1)..3 * d.node_id].copy_from_slice(&[d.ux, d.uz, d.ry]);
    }
    v
}

pub fn state(n: usize, area: f64, lambda: f64, theta: f64) -> Vec<f64> {
    let run = solve_corotational_2d(&held(n, area, lambda, theta), 80, 1e-11, 16, false).unwrap();
    assert!(run.converged, "corotational solve did not converge at lambda {lambda}, theta {theta}");
    vector(n, &run.results.displacements)
}

pub fn corner_rotation(n: usize, area: f64, lambda: f64, theta: f64) -> f64 {
    state(n, area, lambda, theta)[3 * n + 2]
}

/// The linear prebuckling displacement for the unit corner load and the first buckling mode
/// scaled to unit corner rotation, both from production linear buckling.
pub fn linear_modes(n: usize, area: f64) -> (Vec<f64>, Vec<f64>) {
    let mut input = roorda(n, 0.);
    for section in input.sections.values_mut() {
        section.a = area;
    }
    let linear = vector(n, &buckling_system_2d(&input).unwrap().linear.displacements);
    let mode = vector(n, &solve_buckling_2d(&input, 1).unwrap().modes[0].displacements);
    let scale = mode[3 * n + 2];
    (linear, mode.iter().map(|x| x / scale).collect())
}

/// The load factor at which the perfect frame stays in equilibrium with its corner turned by
/// `theta` and no moment applied there: a point of the bifurcated branch. A stiff rotational
/// spring holds the corner while a bracketed Illinois iteration finds the load that leaves the
/// spring unloaded.
pub fn branch_load(n: usize, area: f64, theta: f64, guess: f64) -> f64 {
    let g = |lambda: f64| corner_rotation(n, area, lambda, theta) - theta;
    let step = 0.01 * guess;
    let (mut a, mut fa) = (guess, g(guess));
    let (mut b, mut fb) = (guess + step, g(guess + step));
    let direction = if (fb - fa) * fa > 0. { -1. } else { 1. };
    if direction < 0. {
        (b, fb) = (guess - step, g(guess - step));
    }
    while fa * fb > 0. {
        (a, fa) = (b, fb);
        b += direction * step;
        assert!((b - guess).abs() < 0.5 * guess, "no bracket at theta {theta}");
        fb = g(b);
    }
    for _ in 0..200 {
        let c = (a * fb - b * fa) / (fb - fa);
        let fc = g(c);
        if fc == 0. || (b - a).abs() <= 1e-13 * c.abs() || (c - b).abs() <= 1e-14 * c.abs() {
            return c;
        }
        if fc * fb < 0. {
            (a, fa) = (b, fb);
        } else {
            fa *= 0.5;
        }
        (b, fb) = (c, fc);
    }
    panic!("Illinois iteration did not converge at theta {theta}");
}

fn interpolate(xs: &[f64], ys: &[f64]) -> Vec<f64> {
    let k = xs.len();
    let mut m: Vec<Vec<f64>> = xs.iter().zip(ys).map(|(&x, &y)| (0..k).map(|c| x.powi(c as i32)).chain([y]).collect()).collect();
    for col in 0..k {
        let pivot = (col..k).max_by(|&i, &j| m[i][col].abs().total_cmp(&m[j][col].abs())).unwrap();
        m.swap(col, pivot);
        for row in 0..k {
            if row != col {
                let f = m[row][col] / m[col][col];
                for c in col..=k {
                    let v = m[col][c];
                    m[row][c] -= f * v;
                }
            }
        }
    }
    (0..k).map(|i| m[i][k] / m[i][i]).collect()
}

/// Koiter coefficients of the bifurcated branch through θ = ±h, ±2h, ±3h, read from
/// λθ = λ₁(−Δ + θ + αθ² + βθ³ + …) so that a residual imperfection Δ does not leak into α:
/// (λ₁, α, β) in the corner rotation θ, then (α, β) in the modal coordinate ξ, the Euclidean
/// projection of d − λû on the mode scaled to unit corner rotation.
pub struct Coefficients {
    pub lambda: f64,
    pub alpha: f64,
    pub beta: f64,
    pub alpha_modal: f64,
    pub beta_modal: f64,
}

pub fn coefficients(n: usize, area: f64, h: f64, guess: f64) -> Coefficients {
    let (linear, mode) = linear_modes(n, area);
    let vv: f64 = mode.iter().map(|x| x * x).sum();
    let thetas: Vec<f64> = [-3., -2., -1., 1., 2., 3.].iter().map(|k| k * h).collect();
    let mut xis = vec![];
    let mut loads = vec![];
    for &t in &thetas {
        let lambda = branch_load(n, area, t, guess);
        let d = state(n, area, lambda, t);
        xis.push(d.iter().zip(&linear).zip(&mode).map(|((d, u), v)| (d - lambda * u) * v).sum::<f64>() / vv);
        loads.push(lambda);
    }
    let a: Vec<f64> = thetas.iter().zip(&loads).map(|(t, l)| t * l).collect();
    let b: Vec<f64> = xis.iter().zip(&loads).map(|(x, l)| x * l).collect();
    let ct = interpolate(&thetas, &a);
    let cx = interpolate(&xis, &b);
    Coefficients { lambda: ct[1], alpha: ct[2] / ct[1], beta: ct[3] / ct[1], alpha_modal: cx[2] / cx[1], beta_modal: cx[3] / cx[1] }
}
