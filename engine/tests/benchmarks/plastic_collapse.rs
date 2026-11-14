use dedaliano_engine::{solver::plastic::solve_plastic_3d, types::PlasticInput3D};
use std::collections::HashMap;

fn num(v: &serde_json::Value, key: &str) -> f64 {
    v[key].as_f64().unwrap_or_else(|| panic!("{key} missing"))
}

#[test]
fn portal_combined_mechanism() {
    let case: serde_json::Value = serde_json::from_str(include_str!("plastic_collapse.json")).unwrap();
    let input: PlasticInput3D = serde_json::from_value(case["input"].clone()).unwrap();
    let checked = dedaliano_engine::certify::plastic_3d::certify_plastic_3d(&input).unwrap();
    let mut result = solve_plastic_3d(&input).unwrap();
    assert_eq!(Some(result.collapse_factor), checked.certificate.lambda_lower);
    assert_eq!(checked.certificate.solver_within_bounds, Some(true));
    let raw = checked.certificate.solver_collapse_factor.unwrap();
    let upper = checked.certificate.lambda_upper.unwrap();
    println!("{}", serde_json::to_string(&result).unwrap());
    assert_eq!(result.warnings.pop().unwrap(), format!("collapseFactor is the certified lower bound {}. Raw incremental factor {raw} lies within the certified interval [{}, {upper}]. Incremental steps, hinges and the mechanism flag retain raw solver values and are not certified by this interval.", result.collapse_factor, result.collapse_factor));

    let mp = num(&case, "mp");
    let (h, v, l, height) = (num(&case, "horizontal"), num(&case, "vertical"), num(&case, "span"), num(&case, "height"));
    let tolerance = num(&case, "tolerance");
    let yield_tol = num(&case, "yieldTolerance") * mp;
    let eq_tol = num(&case, "equilibriumTolerance");

    assert!(result.is_mechanism);
    assert!(result.warnings.is_empty(), "{:?}", result.warnings);
    let combined = 6.0 * mp / (h * height + v * l / 2.0);
    assert!((num(&case["reference"], "combined") - combined).abs() < 1e-12);
    assert!((result.collapse_factor - combined).abs() < tolerance);
    use dedaliano_engine::certify::exact::{q, qi};
    let exact = qi(6) * q(mp).unwrap() / (q(h).unwrap() * q(height).unwrap() + q(v).unwrap() * q(l).unwrap() / qi(2));
    assert!(q(result.collapse_factor).unwrap() <= exact && exact <= q(upper).unwrap());

    assert!((raw - combined).abs() < tolerance);
    let mut history = result.clone();
    history.collapse_factor = raw;
    let events = case["events"].as_array().unwrap();
    assert_eq!(history.steps.len(), events.len());
    assert_eq!(history.hinges.len(), events.len());
    for (i, (expected, step)) in events.iter().zip(&history.steps).enumerate() {
        assert_eq!(step.hinges_formed.len(), 1, "event {i}");
        let hinge = &step.hinges_formed[0];
        assert_eq!(hinge.element_id as u64, expected["elementId"].as_u64().unwrap(), "event {i}");
        assert_eq!(hinge.end, expected["end"].as_str().unwrap(), "event {i}");
        assert_eq!(hinge.step, i);
        assert_eq!(hinge.moment_y.signum(), num(expected, "momentSign"), "event {i}");
        assert!((hinge.moment_y.abs() - mp).abs() < yield_tol, "event {i}: {}", hinge.moment_y);
        assert!(hinge.moment_z.abs() < yield_tol, "event {i}");
        assert!((hinge.load_factor - step.load_factor).abs() < 1e-12);
        assert!((step.load_factor - num(expected, "loadFactor")).abs() < tolerance, "event {i}: {}", step.load_factor);
        let listed = &history.hinges[i];
        assert_eq!((listed.element_id, listed.end.as_str()), (hinge.element_id, hinge.end.as_str()));
    }
    assert!((history.steps.last().unwrap().load_factor - history.collapse_factor).abs() < 1e-12);
    assert!(
        !history.hinges.iter().any(|h| matches!((h.element_id, h.end.as_str()), (1, "end") | (2, "start"))),
        "the left roof corner must not yield"
    );

    let mut moments: HashMap<(usize, &str), f64> = HashMap::new();
    let mut reactions: HashMap<usize, [f64; 6]> = HashMap::new();
    for step in &history.steps {
        for f in &step.results.element_forces {
            *moments.entry((f.element_id, "start")).or_default() += f.my_start;
            *moments.entry((f.element_id, "end")).or_default() += f.my_end;
            assert!(f.mz_start.abs() < yield_tol && f.mz_end.abs() < yield_tol);
        }
        for r in &step.results.reactions {
            let sum = reactions.entry(r.node_id).or_default();
            for (s, x) in sum.iter_mut().zip([r.fx, r.fy, r.fz, r.mx, r.my, r.mz]) {
                *s += x;
            }
        }
    }
    assert_eq!(moments.len(), 8);
    for (key, m) in &moments {
        assert!(m.abs() <= mp + yield_tol, "{key:?}: |My| = {m} exceeds Mp");
    }
    let corner = 3.0 * mp - history.collapse_factor * h * height;
    assert!((corner - num(&case, "leftCornerMoment")).abs() < tolerance);
    assert!((moments[&(1, "end")].abs() - corner).abs() < tolerance, "{}", moments[&(1, "end")]);
    assert!((3.0 * mp + corner - history.collapse_factor * v * l / 2.0).abs() < tolerance);
    let corner = 3.0 * mp - result.collapse_factor * h * height;
    assert!((3.0 * mp + corner - result.collapse_factor * v * l / 2.0).abs() < tolerance);

    let lambda = history.collapse_factor;
    let node = |id: usize| {
        let n = &case["input"]["solver"]["nodes"][id.to_string()];
        [num(n, "x"), num(n, "y"), num(n, "z")]
    };
    let mut force = [0.0; 3];
    let mut moment = [0.0; 3];
    let mut add = |p: [f64; 3], f: [f64; 3], m: [f64; 3]| {
        for k in 0..3 {
            force[k] += f[k];
            moment[k] += m[k];
        }
        moment[0] += p[1] * f[2] - p[2] * f[1];
        moment[1] += p[2] * f[0] - p[0] * f[2];
        moment[2] += p[0] * f[1] - p[1] * f[0];
    };
    for load in case["input"]["solver"]["loads"].as_array().unwrap() {
        let d = &load["data"];
        let scaled = |a: &str, b: &str, c: &str| [lambda * num(d, a), lambda * num(d, b), lambda * num(d, c)];
        add(node(d["nodeId"].as_u64().unwrap() as usize), scaled("fx", "fy", "fz"), scaled("mx", "my", "mz"));
    }
    assert_eq!(reactions.len(), 2);
    for (id, r) in &reactions {
        add(node(*id), [r[0], r[1], r[2]], [r[3], r[4], r[5]]);
    }
    assert!(force.iter().chain(&moment).all(|x| x.abs() < eq_tol), "residual {force:?} {moment:?}");
}
