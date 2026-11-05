use crate::models::*;
use crate::support::*;
use dedaliano_engine::solver::linear::solve_2d;
use dedaliano_engine::solver::plastic::solve_plastic_2d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

const MP_KNM: f64 = 100.0;

fn plastic_input(s: &SolverInput) -> PlasticInput {
    PlasticInput {
        solver: s.clone(),
        sections: s.sections.values().map(|c| (c.id.to_string(), PlasticSectionData { a: c.a, iz: c.iz, material_id: 1, b: None, h: None })).collect(),
        materials: HashMap::from([("1".to_string(), PlasticMaterialData { fy: Some(355.0) })]),
        max_hinges: Some(20),
        mp_overrides: Some(s.sections.keys().map(|k| (k.clone(), MP_KNM)).collect()),
    }
}

/// Lower bound theorem: the elastic moment field is in equilibrium with the load,
/// so scaled until its largest moment reaches Mp it is statically admissible and
/// `Mp / max|M|` cannot exceed the collapse factor. With nodal loads only, M is
/// linear along each element and its maximum sits at an element end.
fn elastic_lower_bound(s: &SolverInput) -> LoadFactor {
    let r = solve_2d(s).unwrap();
    let m = r.element_forces.iter().map(|f| f.m_start.abs().max(f.m_end.abs())).fold(0.0, f64::max);
    LoadFactor::from_factor(MP_KNM / m)
}

/// Event-to-event plastic analysis of an elastic–perfectly plastic frame under
/// nodal loads is exact arithmetic on piecewise-linear moments: it must reproduce
/// the kinematic (upper bound) minimum, which here is the exact collapse factor
/// (Neal, The Plastic Methods of Structural Analysis, ch. 2–3), to round-off, and
/// lie above the elastic lower bound.
fn bounds(what: &str, s: &SolverInput, mechanisms: &[(&str, f64)]) -> Result<Report, String> {
    let p = solve_plastic_2d(&plastic_input(s))?;
    let mut r = Report::new();
    if !p.warnings.is_empty() || !p.is_mechanism {
        r.fail(format!("{what}: mechanism {} warnings {:?}", p.is_mechanism, p.warnings));
    }
    let got = LoadFactor::from_factor(p.collapse_factor);
    let upper = mechanisms.iter().map(|m| m.1).fold(f64::INFINITY, f64::min);
    let exact = LoadFactor::from_factor(upper);
    r.close(&format!("{what}: collapse factor vs the governing mechanism"), got, exact, exact * 1e-9);
    for (name, lambda) in mechanisms {
        if !(got.in_factor() <= lambda * (1.0 + 1e-9)) {
            r.fail(format!("{what}: λ = {} above the {name} mechanism's upper bound {lambda}", got.in_factor()));
        }
    }
    let lower = elastic_lower_bound(s);
    if !(lower.in_factor() <= got.in_factor() * (1.0 + 1e-9)) {
        r.fail(format!("{what}: λ = {} below the elastic lower bound {}", got.in_factor(), lower.in_factor()));
    }
    Ok(r)
}

fn beam(n: usize, l: f64, ends: (&str, &str), p_node: usize, p: f64) -> SolverInput {
    let nodes = (0..=n).map(|i| (i + 1, l * i as f64 / n as f64, 0.0)).collect();
    let elems = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
    crate::common::make_input(
        nodes,
        vec![(1, E_STEEL_MPA, 0.3)],
        vec![(1, 6.26e-3, 1.17e-4)],
        elems,
        vec![(1, 1, ends.0), (2, n + 1, ends.1)],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: p_node, fx: 0.0, fz: -p, my: 0.0 })],
    )
}

#[test]
fn fixed_beam_collapse_matches_the_beam_mechanism() {
    let (l, p) = (6.0, 50.0);
    agree("fixed–fixed beam, central load", bounds("fixed beam", &beam(2, l, ("fixed", "fixed"), 2, p), &[("beam", 8.0 * MP_KNM / (p * l))]));
}

#[test]
fn propped_cantilever_collapse_matches_the_beam_mechanism() {
    let (l, p) = (6.0, 50.0);
    agree("propped cantilever, central load", bounds("propped cantilever", &beam(2, l, ("fixed", "pinned"), 2, p), &[("beam", 6.0 * MP_KNM / (p * l))]));
    let a = l / 3.0;
    let lambda = MP_KNM * (2.0 * l - a) / (p * a * (l - a));
    agree("propped cantilever, load at L/3", bounds("propped cantilever L/3", &beam(3, l, ("fixed", "pinned"), 2, p), &[("beam", lambda)]));
}

/// Neal's fixed-base portal: span L, height h, H at beam level, V at midspan.
/// Beam 8Mp/(VL), sway 4Mp/(Hh), combined 6Mp/(Hh + VL/2).
fn portal(h: f64, l: f64, hk: f64, vk: f64) -> SolverInput {
    crate::common::make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, l / 2.0, h), (4, l, h), (5, l, 0.0)],
        vec![(1, E_STEEL_MPA, 0.3)],
        vec![(1, 6.26e-3, 1.17e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false), (2, "frame", 2, 3, 1, 1, false, false), (3, "frame", 3, 4, 1, 1, false, false), (4, "frame", 4, 5, 1, 1, false, false)],
        vec![(1, 1, "fixed"), (2, 5, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: hk, fz: 0.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -vk, my: 0.0 }),
        ],
    )
}

fn portal_mechanisms(h: f64, l: f64, hk: f64, vk: f64) -> Vec<(&'static str, f64)> {
    vec![
        ("beam", 8.0 * MP_KNM / (vk * l)),
        ("sway", 4.0 * MP_KNM / (hk * h)),
        ("combined", 6.0 * MP_KNM / (hk * h + vk * l / 2.0)),
    ]
}

#[test]
fn portal_collapse_matches_neal_mechanisms() {
    for (h, l, hk, vk, governs) in [(4.0, 8.0, 20.0, 30.0, "combined"), (4.0, 8.0, 5.0, 40.0, "beam"), (4.0, 8.0, 40.0, 5.0, "sway")] {
        let m = portal_mechanisms(h, l, hk, vk);
        let min = m.iter().min_by(|a, b| a.1.total_cmp(&b.1)).unwrap().0;
        assert_eq!(min, governs, "the test's own case selection: {m:?}");
        agree(&format!("portal, {governs} governs"), bounds(&format!("portal H={hk} V={vk}"), &portal(h, l, hk, vk), &m));
    }
}

#[test]
#[ignore = "nightly: make test.engine.differential.full"]
fn portal_collapse_matches_neal_mechanisms_across_load_ratios() {
    for k in 0..40 {
        let ratio = 0.05 * 1.2f64.powi(k);
        let (h, l, vk) = (3.0 + 0.05 * k as f64, 6.0 + 0.1 * k as f64, 30.0);
        let hk = ratio * vk;
        agree(&format!("portal H/V = {ratio:.3}"), bounds(&format!("portal H/V = {ratio:.3}"), &portal(h, l, hk, vk), &portal_mechanisms(h, l, hk, vk)));
    }
}
