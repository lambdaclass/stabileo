use crate::{energy::variation, koiter::coefficients, model::roorda, replay::reproduce};
use dedaliano_engine::solver::{buckling::solve_buckling_2d, corotational::assemble_corotational_public, dof::DofNumbering};
use serde_json::{json, Value};

/// Largest scaled discrepancy |AD − FD|/(1 + |AD|) of the element energy partials of orders one
/// to four against central differences, best of three steps, over three states.
pub fn derivative_maxima() -> [f64; 4] {
    let mut input = roorda(2, 0.);
    input.elements.retain(|_, e| e.id == 1);
    input.nodes.retain(|_, n| n.id <= 2);
    input.supports.clear();
    input.loads.clear();
    let dofs = DofNumbering::build_2d(&input);
    let n = dofs.n_total;
    assert_eq!(n, 6);
    let basis: Vec<Vec<f64>> = (0..n)
        .map(|i| (0..n).map(|j| if i == j { 1. } else { 0. }).collect())
        .collect();
    let mut maxima = [0_f64; 4];
    for state in [0., 0.001, 0.025] {
        let u: Vec<f64> = (0..n).map(|i| state * ((i + 1) as f64).sin()).collect();
        let mut f = vec![0.; n];
        let mut k = vec![0.; n * n];
        assemble_corotational_public(&input, &dofs, &u, &mut f, &mut k);
        for i in 0..n {
            let g = variation(&input, &dofs, &u, &[&basis[i]]);
            assert!((g - f[i]).abs() / (1. + f[i].abs()) < 1e-9);
            for j in 0..n {
                let h = variation(&input, &dofs, &u, &[&basis[i], &basis[j]]);
                assert!((h - k[i * n + j]).abs() / (1. + k[i * n + j].abs()) < 1e-9);
            }
        }
        for order in 1..=4 {
            for index in 0..n.pow(order as u32) {
                let mut digits = index;
                let mut dirs = Vec::new();
                let mut coordinate = 0;
                for j in 0..order {
                    let i = digits % n;
                    digits /= n;
                    if j + 1 == order {
                        coordinate = i;
                    }
                    dirs.push(basis[i].as_slice());
                }
                let exact = variation(&input, &dofs, &u, &dirs);
                let mut best = f64::INFINITY;
                for step in [1e-4, 5e-5, 2.5e-5] {
                    let mut plus = u.clone();
                    let mut minus = u.clone();
                    plus[coordinate] += step;
                    minus[coordinate] -= step;
                    let approx = (variation(&input, &dofs, &plus, &dirs[..order - 1])
                        - variation(&input, &dofs, &minus, &dirs[..order - 1]))
                        / (2. * step);
                    best = best.min((exact - approx).abs() / (1. + exact.abs()));
                }
                maxima[order - 1] = maxima[order - 1].max(best);
            }
        }
    }
    maxima
}

fn largest_difference(a: &Value, b: &Value) -> f64 {
    match (a, b) {
        (Value::Number(a), Value::Number(b)) => {
            let (a, b) = (a.as_f64().unwrap(), b.as_f64().unwrap());
            (a - b).abs() / (1. + a.abs())
        }
        (Value::Array(a), Value::Array(b)) => {
            assert_eq!(a.len(), b.len());
            a.iter().zip(b).map(|(a, b)| largest_difference(a, b)).fold(0., f64::max)
        }
        (Value::Object(a), Value::Object(b)) => {
            assert_eq!(a.len(), b.len());
            a.iter().map(|(k, v)| largest_difference(v, &b[k])).fold(0., f64::max)
        }
        _ => {
            assert_eq!(a, b);
            0.
        }
    }
}

fn slope_change(delta: f64, alpha: f64) -> f64 {
    if alpha == 0.0 || !alpha.is_finite() { return f64::INFINITY; }
    delta.abs() / alpha.abs()
}

fn check(name: &str, metric: &str, observed: f64, tolerance: f64) -> Value {
    json!({"name": name, "metric": metric, "observed": observed, "tolerance": tolerance, "passed": observed <= tolerance})
}

fn row(id: &str, name: &str, source: &str, reference: f64, computed: f64, absolute: Option<f64>, relative: f64) -> Value {
    let (metric, observed, tolerance) = match absolute {
        Some(tolerance) => ("absolute difference", (computed - reference).abs(), tolerance),
        None => ("relative difference", (computed - reference).abs() / reference.abs(), relative),
    };
    json!({"id": id, "name": name, "source": source, "unit": "", "reference": reference, "computed": computed,
        "metric": metric, "observed": observed, "tolerance": tolerance, "passed": observed <= tolerance})
}

/// Inextensional idealization of the closed form: the members' area, and so EA, raised 1000-fold.
pub const STIFF_AREA: f64 = 10.;

/// Every check of `VALIDATION.json` and every row of `published_comparison.json`, recomputed.
pub fn evidence(paper: &Value, stored_replay: &Value) -> (Value, Value) {
    let closed = &paper["closed_form"];
    let numerical = &paper["numerical"];
    let value = |v: &Value, key: &str| v[key].as_f64().unwrap();
    let derivatives = derivative_maxima();
    let lba: Vec<f64> = [4, 10, 20, 40].into_iter().map(|n| solve_buckling_2d(&roorda(n, 0.), 1).unwrap().modes[0].load_factor).collect();
    let study: Vec<_> = [10, 20, 40].into_iter().map(|n| coefficients(n, STIFF_AREA, 0.02, 2.43)).collect();
    let finer = coefficients(40, STIFF_AREA, 0.01, 2.43);
    let softer = coefficients(40, STIFF_AREA / 10., 0.02, 2.43);
    let extensible: Vec<_> = [0.02, 0.01].into_iter().map(|h| (h, coefficients(40, 0.01, h, 2.43))).collect();
    let fine = &study[2];
    let richardson = |f: fn(&crate::koiter::Coefficients) -> f64| f(&study[2]) + (f(&study[2]) - f(&study[1])) / 3.;
    let alpha = -fine.alpha;
    let replay = reproduce();
    let mut checks: Vec<Value> = derivatives.iter().enumerate().map(|(i, &m)| check(
        &format!("All order-{} element energy partials at three states", i + 1),
        "max abs(AD-central difference)/(1+abs(AD)), best of three step sizes", m, 2e-5)).collect();
    checks.extend([
        check("Production LBA, 10 elements per member, versus the published numerical lambda_1", "absolute load factor difference", (lba[1] - value(numerical, "lambda_1")).abs(), 1e-4),
        check("Production LBA, 40 elements per member, versus the closed-form lambda_1", "relative load factor difference", (lba[3] - value(closed, "lambda_1")).abs() / value(closed, "lambda_1"), 1e-3),
        check("Corotational bifurcation load, inextensional, 40 elements per member, versus the closed-form lambda_1", "relative load factor difference", (fine.lambda - value(closed, "lambda_1")).abs() / value(closed, "lambda_1"), 1e-3),
        check("Corotational alpha, inextensional, 40 elements per member, versus the closed form", "relative difference", (alpha - value(closed, "alpha")).abs() / value(closed, "alpha"), 4e-3),
        check("alpha: mesh error of 40 elements per member (Richardson estimate from 20 and 40)", "relative difference", slope_change(richardson(|c| c.alpha) - fine.alpha, alpha), 1e-3),
        check("alpha: independent of the extraction step (theta step 0.02 against 0.01)", "relative difference", slope_change(finer.alpha - fine.alpha, alpha), 1e-4),
        check("alpha: inextensional (area x1000 against x100)", "relative difference", slope_change(softer.alpha - fine.alpha, alpha), 1e-3),
        check("Every replay frame reproduced by the production arc-length solver", "max abs difference/(1+abs(value)) over every saved number", largest_difference(&replay, stored_replay), 1e-9),
    ]);
    let source = |page: &str| format!("Ferrari and Sigmund (2025), Section 2.1.2, printed page {page}");
    let rows = vec![
        row("lambda-numerical", "Critical load factor lambda_1, the paper's numerical value", &source("5"), value(numerical, "lambda_1"), lba[1], Some(1e-4), 0.),
        row("lambda-closed", "Critical load factor lambda_1, closed form", &source("4"), value(closed, "lambda_1"), lba[3], None, 1e-3),
        row("alpha-closed", "Post-buckling slope alpha, closed form", &source("4"), value(closed, "alpha"), alpha, None, 4e-3),
        row("beta-closed", "Post-buckling curvature beta, closed form", &source("4"), value(closed, "beta"), fine.beta, None, 1.1e-2),
    ];
    let validation = json!({
        "scope": "Production linear buckling, the production-style element energy derivatives, the slope alpha of the bifurcated branch traced with the production corotational solver in the inextensional idealization, and the replay. The curvature beta is not validated: see published_comparison.json and the README.",
        "test": "tests/validation.rs",
        "checks": checks,
        "study": {
            "lba_load_factor": {"elements_per_member": [4, 10, 20, 40], "values": lba},
            "inextensional_area_m2": STIFF_AREA,
            "corotational": study.iter().zip([10, 20, 40]).map(|(c, n)| json!({"elements_per_member": n, "theta_step": 0.02, "lambda_1": c.lambda, "alpha": -c.alpha, "beta": c.beta, "alpha_modal": -c.alpha_modal, "beta_modal": c.beta_modal})).collect::<Vec<_>>(),
            "theta_step_0_01": {"elements_per_member": 40, "alpha": -finer.alpha, "beta": finer.beta},
            "area_x100": {"elements_per_member": 40, "alpha": -softer.alpha, "beta": softer.beta},
            "paper_area_step_sensitivity": extensible.iter().map(|(h, c)| json!({"elements_per_member": 40, "area_m2": 0.01, "theta_step": h, "alpha": -c.alpha, "beta": c.beta})).collect::<Vec<_>>(),
            "richardson": {"lambda_1": richardson(|c| c.lambda), "alpha": -richardson(|c| c.alpha), "beta": richardson(|c| c.beta), "beta_modal": richardson(|c| c.beta_modal)},
            "orientation": "theta is the production corner rotation ry with its sign reversed, so that the load rises on the positive branch, as the paper's positive alpha does",
        },
    });
    let comparison = json!({
        "scope": "lambda_1 from production linear buckling of the paper's model; alpha and beta from the bifurcated branch of the inextensional idealization, traced with the production corotational solver, in the corner rotation theta.",
        "checks": rows,
    });
    (validation, comparison)
}

#[test]
fn slope_convergence_checks_require_a_finite_nonzero_magnitude() {
    for slope in [-1.0, 1.0] {
        assert_eq!(slope_change(-2.0, slope), 2.0);
    }
    for slope in [0.0, f64::INFINITY, f64::NEG_INFINITY, f64::NAN] {
        assert_ne!(check("slope", "relative difference", slope_change(2.0, slope), 1e-3)["passed"], true);
    }
}
