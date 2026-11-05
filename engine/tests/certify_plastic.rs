//! Certified plastic collapse load factor (docs/verification/CERTIFY.md,
//! "Plastic collapse load factor").
//!
//! Honesty is checked against closed-form collapse loads of classical rigid-
//! plastic problems (Neal, "Plastic Methods of Structural Analysis"), which are
//! independent of both the LP heuristic and the exact checker. Refusal tests
//! tamper with the exact candidates and with the model.

use crate::common;

use common::*;
use dedaliano_engine::certify::exact::{q, qi, Q};
use dedaliano_engine::certify::plastic::*;
use dedaliano_engine::solver::plastic::solve_plastic_2d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const FY: f64 = 250.0;
const B: f64 = 0.15;
const H: f64 = 0.3;
const A_SEC: f64 = 0.045;
const IZ_SEC: f64 = 3.375e-4;
/// fy·1000·b·h²/4 for b = 0.15, h = 0.3. The f64 values of 0.15 and 0.3 are not
/// those decimals, so the formula's exact value differs from 843.75 in the 17th
/// digit; most tests pass Mp = 843.75 (exact in binary) as an override so the
/// closed forms are exact references, `rectangular_section_formula` uses b, h.
const MP: f64 = 843.75;

fn plastic(solver: SolverInput) -> PlasticInput {
    let mut p = plastic_rect(solver);
    p.mp_overrides = Some(HashMap::from([("1".to_string(), MP)]));
    p
}

fn plastic_rect(solver: SolverInput) -> PlasticInput {
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), PlasticSectionData { a: A_SEC, iz: IZ_SEC, material_id: 1, b: Some(B), h: Some(H) });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), PlasticMaterialData { fy: Some(FY) });
    PlasticInput { solver, sections, materials, max_hinges: Some(20), mp_overrides: None }
}

fn udl(e: usize, q: f64) -> SolverLoad {
    SolverLoad::Distributed(SolverDistributedLoad { element_id: e, q_i: q, q_j: q, a: None, b: None })
}

fn nodal(n: usize, fx: f64, fz: f64) -> SolverLoad {
    SolverLoad::Nodal(SolverNodalLoad { node_id: n, fx, fz, my: 0.0 })
}

/// The certified enclosure contains `exact` and is tight to `rel`.
fn assert_encloses(label: &str, c: &PlasticCertificate, exact: f64, rel: f64) {
    assert!(c.certified, "{label}: not certified: {:?}", c.reason);
    let (lo, up) = (c.lambda_lower.unwrap(), c.lambda_upper.unwrap());
    assert!(lo <= up, "{label}: [{lo}, {up}]");
    // closed forms evaluated in f64 carry a few ulps of their own rounding
    assert!(lo <= exact * (1.0 + 1e-15) && exact * (1.0 - 1e-15) <= up, "{label}: {exact} ∉ [{lo}, {up}]");
    assert!((up - lo) / exact <= rel, "{label}: enclosure too wide [{lo}, {up}] (rel {:e})", (up - lo) / exact);
    eprintln!("{label}: λ_c = {exact} ∈ [{lo}, {up}], rel width {:.2e}, solver {:?} within={:?}", (up - lo) / exact, c.solver_collapse_factor, c.solver_within_bounds);
    // the incremental solver lands in the enclosure, up to its own f64 round-off
    if let Some(dev) = c.solver_deviation {
        assert!(dev < 1e-9, "{label}: solver {:?} outside [{lo}, {up}] (deviation {dev:e})", c.solver_collapse_factor);
    }
}

fn certify(input: &PlasticInput) -> PlasticCertificate {
    let res = solve_plastic_2d(input).ok();
    certify_collapse_2d(input, res.as_ref())
}

#[test]
fn fixed_beam_udl_single_and_multi_element() {
    // λ_c = 16 Mp / (q L²)
    let (l, qv) = (6.0, 10.0);
    let exact = 16.0 * MP / (qv * l * l);
    for n in [1, 2, 4, 5] {
        let loads = (1..=n).map(|e| udl(e, -qv)).collect();
        let inp = plastic(make_beam(n, l, E, A_SEC, IZ_SEC, "fixed", Some("fixed"), loads));
        let c = certify(&inp);
        assert_encloses(&format!("fixed beam UDL n={n}"), &c, exact, 1e-9);
    }
}

#[test]
fn fixed_beam_udl_solver_hinge_at_midspan_for_any_element_count() {
    // The span hinge forms where the moment peaks, not at an element end:
    // λ_c = 16 Mp/(q L²) whatever the discretisation (it used to read 60.28 for
    // one element and 58.59 for five).
    let (l, qv) = (6.0, 10.0);
    let exact = 16.0 * MP / (qv * l * l);
    for n in [1, 2, 3, 5, 7] {
        let loads = (1..=n).map(|e| udl(e, -qv)).collect();
        let res = solve_plastic_2d(&plastic(make_beam(n, l, E, A_SEC, IZ_SEC, "fixed", Some("fixed"), loads))).unwrap();
        assert!(res.is_mechanism && res.warnings.is_empty(), "n={n}: {:?}", res.warnings);
        assert!((res.collapse_factor - exact).abs() < 1e-6 * exact, "n={n}: {} vs {exact}", res.collapse_factor);
        // the last hinge is at midspan: x = L/2 on the member that holds it
        let last = res.hinges.last().unwrap();
        let x = (last.element_id - 1) as f64 * l / n as f64 + last.position * l / n as f64;
        assert!((x - l / 2.0).abs() < 1e-6 * l, "n={n}: last hinge at x = {x}");
        // results are reported on the model's own members and nodes
        for st in &res.steps {
            assert_eq!(st.results.element_forces.len(), n);
            assert_eq!(st.results.displacements.len(), n + 1);
        }
    }
}

#[test]
fn solver_reports_the_collapse_load_when_its_history_stops_before_a_mechanism() {
    let loads = vec![udl(1, -10.0)];
    let mut inp = plastic(make_beam(1, 6.0, E, A_SEC, IZ_SEC, "fixed", Some("fixed"), loads));
    inp.max_hinges = Some(1);
    let res = solve_plastic_2d(&inp).unwrap();
    assert!(res.is_mechanism);
    assert!(res.steps.last().unwrap().load_factor < 37.5);
    assert!(res.warnings.iter().any(|w| w.contains("history ends at")), "{:?}", res.warnings);
    assert!((res.collapse_factor - 37.5).abs() <= 1e-9 * 37.5, "{}", res.collapse_factor);
}

#[test]
fn simply_supported_point_load_on_element() {
    // λ_c = 4 Mp / (P L); single element, load as a member point load
    let l = 6.0;
    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: 1, a: 3.0, p: -1.0, px: None, my: None })];
    let inp = plastic(make_beam(1, l, E, A_SEC, IZ_SEC, "pinned", Some("rollerX"), loads));
    let c = certify(&inp);
    assert_encloses("SS point load", &c, 4.0 * MP / l, 1e-12);
    // off-centre at a = 2: λ_c = Mp L / (P a b)
    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: 1, a: 2.0, p: -1.0, px: Some(0.5), my: None })];
    let inp = plastic(make_beam(1, l, E, A_SEC, IZ_SEC, "pinned", Some("rollerX"), loads));
    assert_encloses("SS off-centre point load", &certify(&inp), MP * l / (2.0 * 4.0), 1e-12);
}

#[test]
fn propped_cantilever_udl_irrational_collapse_factor() {
    // λ_c = (6 + 4√2) Mp / (q L²), hinge at x = (√2 − 1) L from the propped end:
    // irrational, so the upper bound comes from a rational hinge position.
    let (l, qv) = (8.0, 5.0);
    let exact = (6.0 + 4.0 * 2f64.sqrt()) * MP / (qv * l * l);
    for n in [1, 3] {
        let loads = (1..=n).map(|e| udl(e, -qv)).collect();
        let inp = plastic(make_beam(n, l, E, A_SEC, IZ_SEC, "fixed", Some("rollerX"), loads));
        assert_encloses(&format!("propped cantilever n={n}"), &certify(&inp), exact, 1e-8);
    }
}

fn portal(h: f64, w: f64, hl: f64, v: f64) -> SolverInput {
    // columns 1-2, 4-5; beam 2-3-4 with the vertical load at node 3 (midspan)
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w / 2.0, h), (4, w, h), (5, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 5, "fixed")];
    make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_SEC, IZ_SEC)], elems, sups, vec![nodal(2, hl, 0.0), nodal(3, 0.0, -v)])
}

#[test]
fn portal_frame_mechanisms() {
    // beam 4Mp/(V a), sway 4Mp/(H h), combined 6Mp/(H h + V a), a = w/2
    let (h, w) = (4.0, 6.0);
    for (hl, v) in [(1.0, 1.0), (1.0, 0.0), (0.0, 1.0), (1.0, 3.0)] {
        let a = w / 2.0;
        let mut cands = Vec::new();
        if v > 0.0 {
            cands.push(4.0 * MP / (v * a));
        }
        if hl > 0.0 {
            cands.push(4.0 * MP / (hl * h));
        }
        if v > 0.0 && hl > 0.0 {
            cands.push(6.0 * MP / (hl * h + v * a));
        }
        let exact = cands.into_iter().fold(f64::INFINITY, f64::min);
        let inp = plastic(portal(h, w, hl, v));
        let c = certify(&inp);
        assert_encloses(&format!("portal H={hl} V={v}"), &c, exact, 1e-12);
        // the incremental solver agrees up to its own f64 round-off
        assert!(c.solver_deviation.unwrap() < 1e-10, "solver value outside: {c:?}");
    }
}

#[test]
fn inclined_member_irrational_length() {
    // Fixed-fixed member from (0,0) to (3,1): L² = 10 (irrational L). Full-length
    // perpendicular UDL: λ_c = 16 Mp / (q L²). Partial / point loads on it are refused.
    let qv = 7.0;
    let nodes = vec![(1, 0.0, 0.0), (2, 3.0, 1.0)];
    let elems = vec![(1, "frame", 1, 2, 1, 1, false, false)];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let inp = plastic(make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A_SEC, IZ_SEC)], elems.clone(), sups.clone(), vec![udl(1, -qv)]));
    assert_encloses("inclined fixed member", &certify(&inp), 16.0 * MP / (qv * 10.0), 1e-9);

    let pl = SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: 1, a: 1.0, p: -1.0, px: None, my: None });
    let inp = plastic(make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_SEC, IZ_SEC)], elems, sups, vec![pl]));
    let c = certify(&inp);
    assert!(!c.certified && c.reason.as_deref().unwrap().contains("irrational"), "{c:?}");
}

#[test]
fn two_span_continuous_and_braced_frame() {
    // Two equal spans, UDL on both, pinned ends: each span collapses as a propped
    // cantilever: λ_c = (6 + 4√2) Mp / (q L²).
    let (l, qv) = (5.0, 4.0);
    let loads = (1..=4).map(|e| udl(e, -qv)).collect();
    let inp = plastic(make_continuous_beam(&[l, l], 2, E, A_SEC, IZ_SEC, loads));
    assert_encloses("two-span UDL", &certify(&inp), (6.0 + 4.0 * 2f64.sqrt()) * MP / (qv * l * l), 1e-8);

    // Portal with a truss brace: certified (no closed form), bounds consistent.
    let mut s = portal(4.0, 6.0, 1.0, 1.0);
    s.elements.insert("5".into(), SolverElement { id: 5, elem_type: "truss".into(), node_i: 1, node_j: 4, material_id: 1, section_id: 1, hinge_start: false, hinge_end: false });
    let c = certify(&plastic(s));
    assert!(c.certified, "{c:?}");
    let (lo, up) = (c.lambda_lower.unwrap(), c.lambda_upper.unwrap());
    assert!(lo <= up && (up - lo) / up < 1e-9, "[{lo}, {up}]");
    // bracing removes the sway / combined mechanisms: only the beam mechanism remains
    assert!(lo <= 4.0 * MP / 3.0 && 4.0 * MP / 3.0 <= up * (1.0 + 1e-15), "[{lo}, {up}]");
}

#[test]
fn rectangular_section_formula() {
    // Mp from fy, b, h (exact rational of the f64 data, ≈ 843.75)
    let (l, qv) = (6.0, 10.0);
    let inp = plastic_rect(make_beam(1, l, E, A_SEC, IZ_SEC, "fixed", Some("fixed"), vec![udl(1, -qv)]));
    assert_encloses("rectangular section", &certify(&inp), 16.0 * MP / (qv * l * l), 1e-9);
}

#[test]
fn approximate_shape_factor_section_is_enclosed() {
    // No b/h: Mp = 1.15·fy·Iz/(h/2), h = √(12 Iz/A) — irrational; enclosed.
    let (l, qv) = (6.0, 10.0);
    let mut inp = plastic_rect(make_beam(1, l, E, A_SEC, IZ_SEC, "fixed", Some("fixed"), vec![udl(1, -qv)]));
    let sec = inp.sections.get_mut("1").unwrap();
    sec.b = None;
    sec.h = None;
    sec.iz = 2.0e-4;
    sec.a = 0.03;
    let mp = 1.15 * FY * 1000.0 * 2.0e-4 / ((12.0f64 * 2.0e-4 / 0.03).sqrt() / 2.0);
    assert_encloses("shape-factor section", &certify(&inp), 16.0 * mp / (qv * l * l), 1e-9);
}

// ───────────────────────── refusal / tamper tests ─────────────────────────

fn fixed_beam_model() -> (PlasticModel, PlasticCandidates) {
    let loads = (1..=2).map(|e| udl(e, -10.0)).collect();
    let inp = plastic(make_beam(2, 6.0, E, A_SEC, IZ_SEC, "fixed", Some("fixed"), loads));
    let m = build_model(&inp).unwrap();
    let c = plastic_candidates(&m, None).unwrap();
    (m, c)
}

#[test]
fn tampered_static_field_is_refused() {
    let (m, c) = fixed_beam_model();
    let f = c.static_field.clone().unwrap();
    assert!(check_static(&m, &f).is_ok());
    // one end moment nudged by 1e-9: equilibrium fails exactly
    let mut g = f.clone();
    g.elems[0][2] += q(1e-9).unwrap();
    assert!(check_static(&m, &g).unwrap_err().contains("equilibrium"));
    // λ changed without the forces: equilibrium fails
    let mut g = f.clone();
    g.lambda = &g.lambda * Q::new(1001.into(), 1000.into());
    assert!(check_static(&m, &g).is_err());
    // shear changed: equilibrium fails
    let mut g = f.clone();
    g.elems[1][1] += qi(1);
    assert!(check_static(&m, &g).is_err());
    // a field scaled by 2 (still in equilibrium) yields the same certified bound:
    // the yield check scales it back, never certifies more
    let mut g = f.clone();
    g.lambda = &g.lambda * qi(2);
    for e in &mut g.elems {
        for v in e.iter_mut() {
            *v = &*v * qi(2);
        }
    }
    let a = check_static(&m, &f).unwrap().lambda_lower;
    let b = check_static(&m, &g).unwrap().lambda_lower;
    assert_eq!(a, b);
    // wrong sizes
    let mut g = f.clone();
    g.elems.pop();
    assert!(check_static(&m, &g).is_err());
    let mut g = f;
    g.lambda = qi(0);
    assert!(check_static(&m, &g).is_err());
}

#[test]
fn tampered_mechanism_is_refused() {
    let (m, c) = fixed_beam_model();
    let mech = c.mechanism.clone().unwrap();
    let ok = check_mechanism(&m, &mech).unwrap();
    // D/W ≥ λ_c = 16 Mp / (q L²) = 37.5 exactly (kinematic theorem), and close to it
    let up = dedaliano_engine::certify::exact::to_f64(&ok.lambda_upper);
    assert!(ok.lambda_upper >= q(37.5).unwrap() && up < 37.5 * (1.0 + 1e-9), "{up}");
    assert!(check_static(&m, c.static_field.as_ref().unwrap()).unwrap().lambda_lower <= q(37.5).unwrap());
    // moving the midspan node breaks compatibility
    let mut g = mech.clone();
    g.nodes[1][1] += q(1e-12).unwrap();
    assert!(check_mechanism(&m, &g).unwrap_err().contains("close"));
    // moving a restrained DOF
    let mut g = mech.clone();
    g.nodes[0][2] = qi(1);
    assert!(check_mechanism(&m, &g).unwrap_err().contains("restrained"));
    // reversed mechanism: negative external work
    let mut g = mech.clone();
    for n in &mut g.nodes {
        for v in n.iter_mut() {
            *v = -v.clone();
        }
    }
    for e in &mut g.elems {
        for v in e.omegas.iter_mut() {
            *v = -v.clone();
        }
    }
    assert!(check_mechanism(&m, &g).unwrap_err().contains("work"));
    // interior hinge out of order
    let mut g = mech.clone();
    g.elems[0].hinges = vec![qi(1)];
    g.elems[0].omegas.push(qi(0));
    assert!(check_mechanism(&m, &g).is_err());
    // a hinge rotation in a member that cannot form a hinge
    let mut m2 = m.clone();
    m2.elems[0].mp = None;
    assert!(check_mechanism(&m2, &mech).unwrap_err().contains("no plastic hinge"));
}

#[test]
fn unsupported_models_are_refused() {
    let base = || make_beam(2, 6.0, E, A_SEC, IZ_SEC, "fixed", Some("fixed"), vec![udl(1, -10.0)]);
    let mut s = base();
    s.supports.get_mut("1").unwrap().support_type = "spring".into();
    assert!(!certify(&plastic(s)).certified);
    let mut s = base();
    s.supports.get_mut("2").unwrap().dz = Some(0.01);
    assert!(certify(&plastic(s)).reason.unwrap().contains("prescribed"));
    let mut s = base();
    s.loads.push(SolverLoad::Thermal(SolverThermalLoad { element_id: 1, dt_uniform: 10.0, dt_gradient: 0.0, alpha: None, depth: None }));
    assert!(certify(&plastic(s)).reason.unwrap().contains("thermal"));
    let mut s = base();
    s.elements.get_mut("1").unwrap().elem_type = "cable".into();
    assert!(!certify(&plastic(s)).certified);
    // a cantilever loaded only axially has no bending collapse: never certified
    let s = make_beam(1, 6.0, E, A_SEC, IZ_SEC, "fixed", None, vec![nodal(2, 1.0, 0.0)]);
    let c = certify(&plastic(s));
    assert!(!c.certified, "{c:?}");
    // a mechanism (no supports in z) carries no load: never certified
    let s = make_beam(1, 6.0, E, A_SEC, IZ_SEC, "rollerY", None, vec![nodal(2, 0.0, -1.0)]);
    assert!(!certify(&plastic(s)).certified);
}

#[test]
fn certify_plastic_2d_reports_solver_value() {
    let inp = plastic(portal(4.0, 6.0, 1.0, 1.0));
    let out = certify_plastic_2d(&inp).unwrap();
    assert!(out.certificate.certified);
    assert_eq!(out.certificate.solver_collapse_factor, Some(out.results.collapse_factor));
    assert!(!out.certificate.mechanism.is_empty());
    let json = serde_json::to_string(&out).unwrap();
    assert!(json.contains("lambdaLower") && json.contains("solverWithinBounds"));
}

// ───────────────────────── random frames vs the incremental solver ─────────────────────────

struct Lcg(u64);
impl Lcg {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }
}

/// Multi-bay, multi-storey frames with nodal loads only (hinges can only form at
/// nodes), beams split at midspan, random column/beam capacities and some pinned
/// beam ends. The incremental solver is an independent reference: with hinge
/// unloading handled it must land in the enclosure every time (it used to fall
/// below it when a hinge that should have closed stayed free: case 8, 148.80 vs
/// [151.5405, 151.5405]).
#[test]
fn random_frames_agree_with_incremental_solver() {
    let mut g = Lcg(2024);
    let (mut checked, mut agree, mut unloaded) = (0, 0, 0);
    for case in 0..24 {
        let bays = 1 + (g.next() * 3.0) as usize;
        let stories = 1 + (g.next() * 6.0) as usize;
        let (w, h) = (4.0 + (g.next() * 4.0).round(), 3.0 + (g.next() * 2.0).round());
        let mut nodes = Vec::new();
        let mut id = |x: f64, z: f64, nodes: &mut Vec<(usize, f64, f64)>| {
            nodes.push((nodes.len() + 1, x, z));
            nodes.len()
        };
        let mut col_node = vec![vec![0; bays + 1]; stories + 1];
        for (s, row) in col_node.iter_mut().enumerate() {
            for (b, n) in row.iter_mut().enumerate() {
                *n = id(b as f64 * w, s as f64 * h, &mut nodes);
            }
        }
        let mut elems = Vec::new();
        let mut loads = Vec::new();
        for s in 0..stories {
            for b in 0..=bays {
                elems.push((elems.len() + 1, "frame", col_node[s][b], col_node[s + 1][b], 1, 1, false, false));
            }
        }
        for s in 1..=stories {
            for b in 0..bays {
                let mid = id(b as f64 * w + w / 2.0, s as f64 * h, &mut nodes);
                let pin = g.next() < 0.2;
                elems.push((elems.len() + 1, "frame", col_node[s][b], mid, 1, 2, pin, false));
                elems.push((elems.len() + 1, "frame", mid, col_node[s][b + 1], 1, 2, false, false));
                loads.push(nodal(mid, 0.0, -(1.0 + (g.next() * 4.0).round())));
            }
            loads.push(nodal(col_node[s][0], (g.next() * 3.0).round(), 0.0));
        }
        let sups: Vec<_> = (0..=bays).map(|b| (b + 1, col_node[0][b], if g.next() < 0.3 { "pinned" } else { "fixed" })).collect();
        let solver = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_SEC, IZ_SEC), (2, A_SEC, IZ_SEC)], elems, sups, loads);
        let mut inp = plastic(solver);
        inp.max_hinges = Some(60);
        let mp_beam = 500.0 + (g.next() * 1000.0).round();
        inp.sections.insert("2".to_string(), PlasticSectionData { a: A_SEC, iz: IZ_SEC, material_id: 1, b: Some(B), h: Some(H) });
        inp.mp_overrides.as_mut().unwrap().insert("2".to_string(), mp_beam);
        let res = solve_plastic_2d(&inp).unwrap();
        let c = certify_collapse_2d(&inp, Some(&res));
        assert!(c.certified, "case {case}: {c:?}");
        let (lo, up) = (c.lambda_lower.unwrap(), c.lambda_upper.unwrap());
        assert!((up - lo) / up < 1e-9, "case {case}: [{lo}, {up}]");
        if res.is_mechanism {
            // With nodal loads only the solver's final state is statically
            // admissible, so it can only err low (a hinge that should unload
            // stays free): never above the certified upper bound.
            assert!(res.collapse_factor <= up * (1.0 + 1e-9), "case {case}: solver {} vs [{lo}, {up}]", res.collapse_factor);
            checked += 1;
            assert!(res.warnings.is_empty(), "case {case}: {:?}", res.warnings);
            if res.hinges.iter().any(|h| h.unloaded_at.is_some()) {
                unloaded += 1;
            }
            if c.solver_deviation.unwrap() < 1e-9 {
                agree += 1;
            } else {
                eprintln!("case {case}: solver {} outside certified [{lo}, {up}]", res.collapse_factor);
            }
        }
    }
    assert!(checked >= 12 && agree == checked, "agree {agree} of {checked}");
    // the unloading path is exercised
    assert!(unloaded >= 1, "no case unloaded a hinge");
}

/// Moment sign conventions (nodal `my`, member couples, transverse loads) agree
/// with the solver: a cantilever with a tip force and a couple of the sign that
/// adds to it collapses at Mp/5, not Mp/3.
#[test]
fn moment_sign_conventions_match_solver() {
    let l = 4.0;
    let tip = SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: 1.0, my: 1.0 });
    let inp = plastic(make_beam(1, l, E, A_SEC, IZ_SEC, "fixed", None, vec![tip]));
    let c = certify(&inp);
    assert_encloses("tip force + nodal couple", &c, MP / 5.0, 1e-12);
    assert!(c.solver_deviation.unwrap() < 1e-12, "{c:?}");

    let loads = vec![
        nodal(2, 0.0, 1.0),
        SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: 1, a: 2.0, p: 0.0, px: None, my: Some(1.0) }),
    ];
    let inp = plastic(make_beam(1, l, E, A_SEC, IZ_SEC, "fixed", None, loads));
    let c = certify(&inp);
    assert_encloses("tip force + member couple", &c, MP / 5.0, 1e-12);
    assert!(c.solver_deviation.unwrap() < 1e-12, "{c:?}");

    // transverse member load q > 0 acts along local y = (−sin, cos): on a beam
    // along +x it pushes up, like a tip force fz > 0, so they add: M_base = qL²/2 + F L
    let loads = vec![nodal(2, 0.0, 1.0), udl(1, 1.0)];
    let inp = plastic(make_beam(1, l, E, A_SEC, IZ_SEC, "fixed", None, loads));
    assert_encloses("tip force + member UDL", &certify(&inp), MP / (8.0 + 4.0), 1e-12);
}

#[test]
fn issue_758_textbook_absolute_references() {
    let mut cases = vec![
        ("propped", plastic(make_beam(1, 8.0, E, A_SEC, IZ_SEC, "fixed", Some("rollerX"), vec![udl(1, -5.0)])), (6.0 + 4.0 * 2f64.sqrt()) * MP / 320.0),
        ("fixed-fixed", plastic(make_beam(1, 6.0, E, A_SEC, IZ_SEC, "fixed", Some("fixed"), vec![udl(1, -10.0)])), 16.0 * MP / 360.0),
    ];
    for (name, h, v, expected) in [("beam", 0.0, 1.0, 4.0 * MP / 3.0), ("sway", 1.0, 0.0, MP), ("combined", 1.0, 1.0, 6.0 * MP / 7.0)] {
        cases.push((name, plastic(portal(4.0, 6.0, h, v)), expected));
    }
    for (name, input, expected) in cases {
        let result = solve_plastic_2d(&input).unwrap();
        assert!(result.is_mechanism && result.warnings.is_empty(), "{name}: {result:?}");
        assert!((result.collapse_factor - expected).abs() <= 1e-9 * expected, "{name}: {} vs {expected}", result.collapse_factor);
        assert_encloses(name, &certify_collapse_2d(&input, Some(&result)), expected, 1e-8);
    }
}

#[test]
fn issue_758_course_portal_beam_mechanism() {
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, 4.0), (3, 6.0, 4.0), (4, 6.0, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 2, false, false),
        (2, "frame", 2, 3, 1, 3, false, false),
        (3, "frame", 4, 3, 1, 2, false, false),
    ];
    let solver = make_input(nodes, vec![(1, 30_000.0, 0.2)], vec![(2, 0.09, 0.000675), (3, 0.1, 0.002083)], elems, vec![(1, 1, "fixed"), (2, 4, "fixed")], vec![udl(2, -15.0), nodal(2, 10.0, 0.0)]);
    let (mpc, mpb) = (1687.5, 3125.0);
    let sections = HashMap::from([
        ("2".to_string(), PlasticSectionData { a: 0.09, iz: 0.000675, material_id: 1, b: Some(0.3), h: Some(0.3) }),
        ("3".to_string(), PlasticSectionData { a: 0.1, iz: 0.002083, material_id: 1, b: Some(0.2), h: Some(0.5) }),
    ]);
    let materials = HashMap::from([("1".to_string(), PlasticMaterialData { fy: Some(FY) })]);
    let input = PlasticInput { solver, sections, materials, max_hinges: None, mp_overrides: Some(HashMap::from([("2".to_string(), mpc), ("3".to_string(), mpb)])) };
    let beam = 8.0 * (mpc + mpb) / (15.0 * 36.0);
    let sway = 4.0 * mpc / (10.0 * 4.0);
    let combined = (0..=6000).map(|k| 6.0 * k as f64 / 6001.0).map(|x| (2.0 * mpc + (mpb + mpc) * 6.0 / (6.0 - x)) / (40.0 + 45.0 * x)).fold(f64::INFINITY, f64::min);
    let exact = 1925.0 / 27.0;
    assert!((beam - exact).abs() <= 1e-13 * exact && sway > beam && combined > beam, "{beam} {sway} {combined}");
    let result = solve_plastic_2d(&input).unwrap();
    assert!(result.is_mechanism, "{result:?}");
    assert!((result.collapse_factor - exact).abs() <= 1e-9 * exact, "{} vs {exact}", result.collapse_factor);
    let history = result.steps.last().unwrap().load_factor;
    assert!(history > exact * (1.0 + 1e-3), "the hinge history overshoots the collapse load: {history}");
    assert!(result.warnings.len() == 1 && result.warnings[0].contains("history ends at"), "{:?}", result.warnings);
    assert_encloses("course portal", &certify_collapse_2d(&input, Some(&result)), exact, 1e-8);
}

#[test]
fn issue_758_limit_analysis_refuses_axial_point_loads_too_close_to_resolve() {
    let bar = |gap: f64| {
        let loads = [(0.5, -9.0), (0.5 + gap, 10.0)]
            .map(|(a, px)| SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: 1, a, p: 0.0, px: Some(px), my: None }))
            .to_vec();
        make_input(vec![(1, 0.0, 0.0), (2, 1.0, 0.0)], vec![(1, E, 0.3)], vec![(1, A_SEC, IZ_SEC)], vec![(1, "frame", 1, 2, 1, 1, false, false)], vec![(1, 1, "fixed")], loads)
    };
    let (mp, np) = (HashMap::from([(1, 1e6)]), HashMap::from([(1, 10.0)]));
    let resolved = dedaliano_engine::solver::plastic_limit::limit_analysis_2d(&bar(1e-3), &mp, &np).unwrap();
    assert!((resolved.lambda - 1.0).abs() <= 1e-9, "{resolved:?}");
    let err = dedaliano_engine::solver::plastic_limit::limit_analysis_2d(&bar(1e-12), &mp, &np).unwrap_err();
    assert!(err.contains("closer than 1e-9"), "{err}");
}

#[test]
fn issue_758_limit_analysis_refuses_a_transverse_load_too_close_to_a_fixed_end() {
    let cantilever = |a: f64| {
        let loads = vec![
            SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: 1, a, p: -5e8, px: None, my: None }),
            nodal(2, 0.0, -1.0),
        ];
        make_input(vec![(1, 0.0, 0.0), (2, 1.0, 0.0)], vec![(1, E, 0.3)], vec![(1, A_SEC, IZ_SEC)], vec![(1, "frame", 1, 2, 1, 1, false, false)], vec![(1, 1, "fixed")], loads)
    };
    let mp = HashMap::from([(1, 1.0)]);
    let resolved = dedaliano_engine::solver::plastic_limit::limit_analysis_2d(&cantilever(1e-9 * 4.0), &mp, &HashMap::new()).unwrap();
    let exact = 1.0 / (1.0 + 5e8 * 4e-9);
    assert!((resolved.lambda - exact).abs() <= 1e-6 * exact, "{resolved:?} vs {exact}");
    let err = dedaliano_engine::solver::plastic_limit::limit_analysis_2d(&cantilever(5e-10), &mp, &HashMap::new()).unwrap_err();
    assert!(err.contains("closer than 1e-9"), "{err}");
}

#[test]
fn issue_758_exact_certificate_rejects_the_unresolved_load_factors() {
    use dedaliano_engine::solver::plastic_limit::{confirm_2d, Confirmation};
    let cantilever = make_input(
        vec![(1, 0.0, 0.0), (2, 1.0, 0.0)], vec![(1, E, 0.3)], vec![(1, A_SEC, IZ_SEC)], vec![(1, "frame", 1, 2, 1, 1, false, false)], vec![(1, 1, "fixed")],
        vec![SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: 1, a: 5e-10, p: -5e8, px: None, my: None }), nodal(2, 0.0, -1.0)],
    );
    let mp = HashMap::from([(1, 1.0)]);
    let exact = 1.0 / (1.0 + 5e8 * 5e-10);
    assert_eq!(confirm_2d(&cantilever, &mp, &HashMap::new(), exact), Confirmation::Exact);
    assert!(matches!(confirm_2d(&cantilever, &mp, &HashMap::new(), 1.0), Confirmation::Contradicted { reason, lower } if reason.contains("brackets") && lower <= exact && lower >= exact * (1.0 - 1e-6)));

    let bar = make_input(
        vec![(1, 0.0, 0.0), (2, 1.0, 0.0)], vec![(1, E, 0.3)], vec![(1, A_SEC, IZ_SEC)], vec![(1, "frame", 1, 2, 1, 1, false, false)], vec![(1, 1, "fixed")],
        [(0.5, -9.0), (0.5 + 1e-12, 10.0)].map(|(a, px)| SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: 1, a, p: 0.0, px: Some(px), my: None })).to_vec(),
    );
    assert!(matches!(confirm_2d(&bar, &HashMap::from([(1, 1e6)]), &HashMap::from([(1, 10.0)]), 10.0), Confirmation::OutOfScope { .. }));
}

#[test]
fn issue_758_exact_confirmation_holds_the_static_field_to_the_axial_capacity() {
    use dedaliano_engine::solver::plastic_limit::{confirm_2d, Confirmation};
    let column = make_input(
        vec![(1, 0.0, 0.0), (2, 1.0, 0.0)], vec![(1, E, 0.3)], vec![(1, A_SEC, IZ_SEC)], vec![(1, "frame", 1, 2, 1, 1, false, false)], vec![(1, 1, "fixed")],
        vec![nodal(2, -10.0, -1.0)],
    );
    let mp = HashMap::from([(1, 1.0)]);
    assert_eq!(confirm_2d(&column, &mp, &HashMap::new(), 1.0), Confirmation::Exact);
    let np = HashMap::from([(1, 5.0)]);
    assert_eq!(confirm_2d(&column, &mp, &np, 0.5), Confirmation::Exact);
    assert!(matches!(confirm_2d(&column, &mp, &np, 1.0), Confirmation::Contradicted { reason, lower } if reason.contains("axial capacities govern") && lower <= 0.5 && lower >= 0.5 * (1.0 - 1e-6)));
    assert!(matches!(confirm_2d(&column, &mp, &HashMap::new(), 1.01), Confirmation::Contradicted { reason, lower } if reason.contains("brackets") && lower <= 1.0 && lower >= 1.0 - 1e-6));
}

#[test]
fn issue_758_a_small_real_bending_redundancy_survives_every_unit_system() {
    use dedaliano_engine::solver::plastic_limit::limit_analysis_2d;
    let (a, p, mp) = (3.0f64, 10.0, 1.0);
    for rise in [1e-4, 1e-7] {
        let np = mp / rise;
        let l2 = a * a + rise * rise;
        let reference = (4.0 * a * mp + 2.0 * rise * np * l2.sqrt()) / (p * l2);
        let flat = 4.0 * mp / (p * a);
        assert!(reference > 1.4 * flat);
        for (length, force) in [(1.0, 1.0), (1e-6, 1.0), (1e6, 1.0), (1.0, 1e-6), (1.0, 1e6), (1e-6, 1e6), (1e6, 1e-6)] {
            let arch = make_input(
                vec![(1, 0.0, 0.0), (2, a * length, rise * length), (3, 2.0 * a * length, 0.0)],
                vec![(1, E * force / (length * length), 0.3)],
                vec![(1, A_SEC * length * length, IZ_SEC * length.powi(4))],
                vec![(1, "frame", 1, 2, 1, 1, false, false), (2, "frame", 2, 3, 1, 1, false, false)],
                vec![(1, 1, "fixed"), (2, 3, "fixed")],
                vec![nodal(2, 0.0, -p * force)],
            );
            let r = limit_analysis_2d(&arch, &HashMap::from([(1, mp * force * length), (2, mp * force * length)]), &HashMap::from([(1, np * force), (2, np * force)])).unwrap();
            assert!((r.lambda - reference).abs() <= 1e-6 * reference, "rise {rise}, units ({length}, {force}): {} vs {reference}", r.lambda);
        }
    }
}
