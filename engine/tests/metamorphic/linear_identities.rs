//! Factored load combinations and shell stress superposition on the linear static solve.
//! P-Delta, buckling, pushover and every other nonlinear analysis are excluded: superposition does not hold for them.

use crate::checks2::{load_floor_2d, scale_loads_2d};
use crate::checks3::{load_floor_3d, scale_loads_3d};
use crate::corpus::fuzz_models::{add_random_constraints_2d, add_random_constraints_3d, random_2d_model_rich, random_3d_model_rich};
use dedaliano_engine::metamorphic::compare::{compare_compliant, flat_2d, flat_3d, Flat, Parts};
use dedaliano_engine::metamorphic::conditioning::{self, Conditioning, INCONCLUSIVE};
use dedaliano_engine::solver::{linear, load_cases};
use dedaliano_engine::types::*;
use dedaliano_engine::metamorphic::Rng;
use serde_json::{json, Value};
use std::collections::BTreeMap;

const COMBINATIONS: &[(&str, &[(usize, f64)])] = &[
    ("1.2A+1.6B+0.5C", &[(0, 1.2), (1, 1.6), (2, 0.5)]),
    ("0.9A-1.0B", &[(0, 0.9), (1, -1.0)]),
    ("0A+1.4C", &[(0, 0.0), (2, 1.4)]),
    ("1.0B", &[(1, 1.0)]),
];
const CASES: [&str; 3] = ["A", "B", "C"];
const SEEDS: std::ops::Range<u64> = 0..48;

enum Outcome {
    Checked,
    Skipped(String),
    Violation(String),
}

fn split<T: Clone>(loads: &[T]) -> [Vec<T>; 3] {
    let mut out = [Vec::new(), Vec::new(), Vec::new()];
    for (k, l) in loads.iter().enumerate() {
        out[k % 3].push(l.clone());
    }
    out
}

fn definitions() -> Vec<load_cases::CombinationDef> {
    COMBINATIONS
        .iter()
        .map(|(name, fs)| load_cases::CombinationDef { name: name.to_string(), factors: fs.iter().map(|&(c, f)| (CASES[c].to_string(), f)).collect() })
        .collect()
}

fn add_magnitude(scale: &mut Flat, w: f64, x: &Flat) {
    for (s, v) in [(&mut scale.t, &x.t), (&mut scale.r, &x.r), (&mut scale.f, &x.f), (&mut scale.m, &x.m), (&mut scale.s, &x.s)] {
        s.floor += w.abs() * v.maxabs();
    }
}

fn magnitude_of(terms: &[(f64, &Flat)]) -> Flat {
    let mut scale = Flat::lin_comb(0.0, terms[0].1, 0.0, terms[0].1);
    for &(w, x) in terms {
        add_magnitude(&mut scale, w, x);
    }
    scale
}

fn conditioned(c: Result<Conditioning, String>) -> Result<(Conditioning, f64), String> {
    let c = c?;
    let rel = c.rel();
    if rel > INCONCLUSIVE {
        return Err(format!("inconclusive: rel {rel:.2e}"));
    }
    Ok((c, rel))
}

fn refused<T: serde::Serialize>(diagnostics: &[StructuredDiagnostic], r: &T) -> bool {
    dedaliano_engine::known_issues::refuse_contained(diagnostics, r).is_err()
}

fn combinations_2d(s: &SolverInput) -> Outcome {
    let solve = |loads: Vec<SolverLoad>| linear::solve_2d(&SolverInput { loads, ..s.clone() });
    if !matches!(solve(s.loads.clone()), Ok(r) if !refused(&r.structured_diagnostics, &r)) {
        return Outcome::Skipped("the model's own loads are refused".into());
    }
    let r0 = match solve(vec![]) {
        Ok(r) if !refused(&r.structured_diagnostics, &r) => r,
        Ok(_) => return Outcome::Violation("zero-load solve refused on a model whose own loads solve".into()),
        Err(e) => return Outcome::Violation(format!("zero-load solve refused on a model whose own loads solve: {e}")),
    };
    let (cond, rel) = match conditioned(conditioning::of_2d(s)) {
        Ok(x) => x,
        Err(e) => return Outcome::Skipped(e),
    };
    let parts = split(&s.loads);
    let input = load_cases::MultiCaseInput {
        solver: SolverInput { loads: vec![], ..s.clone() },
        load_cases: CASES.iter().zip(&parts).map(|(n, l)| load_cases::LoadCase { name: n.to_string(), loads: l.clone() }).collect(),
        combinations: definitions(),
    };
    let mc = match load_cases::solve_multi_case_2d(&input) {
        Ok(m) if m.case_results.iter().any(|c| refused(&c.results.structured_diagnostics, &c.results)) || m.combination_results.iter().any(|c| refused(&c.results.structured_diagnostics, &c.results)) => {
            return Outcome::Violation("multi-case result carries a refusal the linear solve does not".into())
        }
        Ok(m) => m,
        Err(e) => return Outcome::Violation(format!("multi-case refused a model the linear solve accepts: {e}")),
    };
    let flat = |r: &AnalysisResults| flat_2d(r, Parts::ALL);
    let f0 = flat(&r0);
    for (name, fs) in COMBINATIONS {
        let loads: Vec<SolverLoad> = fs.iter().flat_map(|&(c, f)| scale_loads_2d(&parts[c], f)).collect();
        let exp = match solve(loads.clone()) {
            Ok(r) if !refused(&r.structured_diagnostics, &r) => r,
            _ => return Outcome::Violation(format!("{name}: factored solve refused on a model whose own loads solve")),
        };
        let Some(got) = mc.combination_results.iter().find(|c| c.name == *name) else {
            return Outcome::Violation(format!("{name}: combination missing from the results"));
        };
        let cases: Vec<Flat> = fs.iter().map(|&(c, _)| flat(&mc.case_results[c].results)).collect();
        let exp_flat = flat(&exp);
        let sum: f64 = fs.iter().map(|f| f.1).sum();
        let mut terms: Vec<(f64, &Flat)> = vec![(1.0, &exp_flat), (1.0 - sum, &f0)];
        terms.extend(fs.iter().zip(&cases).map(|(&(_, f), x)| (f, x)));
        let floor = load_floor_2d(&SolverInput { loads, ..s.clone() }, cond.lchar) + fs.iter().map(|&(c, f)| f.abs() * load_floor_2d(&SolverInput { loads: parts[c].clone(), ..s.clone() }, cond.lchar)).sum::<f64>();
        if let Err(e) = compare_compliant(&flat(&got.results), &exp_flat, &magnitude_of(&terms), cond.lchar, rel, floor, cond.compliance()) {
            return Outcome::Violation(format!("{name} ≠ linear solve of the factored loads: {e}"));
        }
    }
    for (c, loads) in parts.iter().enumerate() {
        let direct = match solve(loads.clone()) {
            Ok(r) if !refused(&r.structured_diagnostics, &r) => r,
            _ => return Outcome::Violation(format!("case {}: direct solve refused", CASES[c])),
        };
        let (fc, fd) = (flat(&mc.case_results[c].results), flat(&direct));
        let floor = load_floor_2d(&SolverInput { loads: loads.clone(), ..s.clone() }, cond.lchar);
        if let Err(e) = compare_compliant(&fc, &fd, &magnitude_of(&[(1.0, &fc), (1.0, &fd)]), cond.lchar, rel, floor, cond.compliance()) {
            return Outcome::Violation(format!("case {} ≠ its linear solve: {e}", CASES[c]));
        }
    }
    Outcome::Checked
}

fn shell_groups(r: &AnalysisResults3D) -> [Vec<(String, f64)>; 3] {
    let mut g: [Vec<(String, f64)>; 3] = Default::default();
    let mut push = |kind: &str, k: usize, id: usize, membrane: [f64; 3], bending: [f64; 3], shear: [Option<f64>; 2]| {
        for (n, v) in ["sxx", "syy", "txy"].iter().zip(membrane) {
            g[0].push((format!("{kind}#{k}(e{id}).{n}"), v));
        }
        for (n, v) in ["mx", "my", "mxy"].iter().zip(bending) {
            g[1].push((format!("{kind}#{k}(e{id}).{n}"), v));
        }
        for (n, v) in ["qx", "qy"].iter().zip(shear) {
            if let Some(v) = v {
                g[2].push((format!("{kind}#{k}(e{id}).{n}"), v));
            }
        }
    };
    for (k, p) in r.plate_stresses.iter().enumerate() {
        push("plate", k, p.element_id, [p.sigma_xx, p.sigma_yy, p.tau_xy], [p.mx, p.my, p.mxy], [p.qx, p.qy]);
    }
    for (k, q) in r.quad_stresses.iter().enumerate() {
        push("quad", k, q.element_id, [q.sigma_xx, q.sigma_yy, q.tau_xy], [q.mx, q.my, q.mxy], [q.qx, q.qy]);
    }
    g
}

fn group_max(g: &[(String, f64)]) -> f64 {
    g.iter().fold(0.0, |m, x| m.max(x.1.abs()))
}

fn thickness_range(s: &SolverInput3D) -> Option<f64> {
    let t = s.plates.values().map(|p| p.thickness)
        .chain(s.quads.values().map(|p| p.thickness))
        .chain(s.quad9s.values().map(|p| p.thickness))
        .chain(s.curved_shells.values().map(|p| p.thickness));
    let solid = s.solid_shells.values().filter_map(|p| {
        let (a, b) = (s.nodes.get(&p.nodes[0].to_string())?, s.nodes.get(&p.nodes[4].to_string())?);
        Some(((b.x - a.x).powi(2) + (b.y - a.y).powi(2) + (b.z - a.z).powi(2)).sqrt())
    });
    t.chain(solid).fold(None, |m: Option<f64>, x| Some(m.map_or(x, |m| m.min(x))))
}

/// Membrane stress, bending moment and shear per length have different units: each needs its own scale.
fn compare_shells(got: &AnalysisResults3D, terms: &[(f64, &AnalysisResults3D)], expected: &AnalysisResults3D, rel: f64, force_floor: f64, t_min: f64) -> Result<(), String> {
    let (gg, ge) = (shell_groups(got), shell_groups(expected));
    let floors = [6.0 * force_floor / (t_min * t_min), force_floor, force_floor / t_min];
    for (k, family) in ["membrane stress", "bending moment", "transverse shear"].iter().enumerate() {
        let (a, e) = (&gg[k], &ge[k]);
        if a.iter().map(|x| &x.0).ne(e.iter().map(|x| &x.0)) {
            return Err(format!("{family}: {} entries vs {} expected", a.len(), e.len()));
        }
        let scale = terms.iter().map(|(w, r)| w.abs() * group_max(&shell_groups(r)[k])).sum::<f64>().max(floors[k]);
        let tol = rel * scale + f64::MIN_POSITIVE;
        for ((label, x), (_, y)) in a.iter().zip(e) {
            if !((x - y).abs() <= tol) {
                return Err(format!("{family} {label}: got {x:.10e}, expected {y:.10e}, |diff| {:.3e} > tol {tol:.3e}", (x - y).abs()));
            }
        }
    }
    Ok(())
}

fn combinations_3d(s: &SolverInput3D) -> Outcome {
    let solve = |loads: Vec<SolverLoad3D>| linear::solve_3d(&SolverInput3D { loads, ..s.clone() });
    if !matches!(solve(s.loads.clone()), Ok(r) if !refused(&r.structured_diagnostics, &r)) {
        return Outcome::Skipped("the model's own loads are refused".into());
    }
    let r0 = match solve(vec![]) {
        Ok(r) if !refused(&r.structured_diagnostics, &r) => r,
        Ok(_) => return Outcome::Violation("zero-load solve refused on a model whose own loads solve".into()),
        Err(e) => return Outcome::Violation(format!("zero-load solve refused on a model whose own loads solve: {e}")),
    };
    let (cond, rel) = match conditioned(conditioning::of_3d(s)) {
        Ok(x) => x,
        Err(e) => return Outcome::Skipped(e),
    };
    let parts = split(&s.loads);
    let input = load_cases::MultiCaseInput3D {
        solver: SolverInput3D { loads: vec![], ..s.clone() },
        load_cases: CASES.iter().zip(&parts).map(|(n, l)| load_cases::LoadCase3D { name: n.to_string(), loads: l.clone() }).collect(),
        combinations: definitions(),
    };
    let mc = match load_cases::solve_multi_case_3d(&input) {
        Ok(m) if m.case_results.iter().any(|c| refused(&c.results.structured_diagnostics, &c.results)) || m.combination_results.iter().any(|c| refused(&c.results.structured_diagnostics, &c.results)) => {
            return Outcome::Violation("multi-case result carries a refusal the linear solve does not".into())
        }
        Ok(m) => m,
        Err(e) => return Outcome::Violation(format!("multi-case refused a model the linear solve accepts: {e}")),
    };
    let parts_no_shell = Parts { shell_stresses: false, ..Parts::ALL };
    let flat = |r: &AnalysisResults3D| flat_3d(r, parts_no_shell);
    let f0 = flat(&r0);
    for (name, fs) in COMBINATIONS {
        let loads: Vec<SolverLoad3D> = fs.iter().flat_map(|&(c, f)| scale_loads_3d(&parts[c], f)).collect();
        let exp = match solve(loads.clone()) {
            Ok(r) if !refused(&r.structured_diagnostics, &r) => r,
            _ => return Outcome::Violation(format!("{name}: factored solve refused on a model whose own loads solve")),
        };
        let Some(got) = mc.combination_results.iter().find(|c| c.name == *name) else {
            return Outcome::Violation(format!("{name}: combination missing from the results"));
        };
        let cases: Vec<Flat> = fs.iter().map(|&(c, _)| flat(&mc.case_results[c].results)).collect();
        let exp_flat = flat(&exp);
        let sum: f64 = fs.iter().map(|f| f.1).sum();
        let mut terms: Vec<(f64, &Flat)> = vec![(1.0, &exp_flat), (1.0 - sum, &f0)];
        terms.extend(fs.iter().zip(&cases).map(|(&(_, f), x)| (f, x)));
        let floor = load_floor_3d(&SolverInput3D { loads, ..s.clone() }, cond.lchar) + fs.iter().map(|&(c, f)| f.abs() * load_floor_3d(&SolverInput3D { loads: parts[c].clone(), ..s.clone() }, cond.lchar)).sum::<f64>();
        if let Err(e) = compare_compliant(&flat(&got.results), &exp_flat, &magnitude_of(&terms), cond.lchar, rel, floor, cond.compliance()) {
            return Outcome::Violation(format!("{name} ≠ linear solve of the factored loads: {e}"));
        }
        if !got.results.plate_stresses.is_empty() || !got.results.quad_stresses.is_empty() {
            return Outcome::Violation(format!("{name}: combinations now report shell stresses; compare them against the factored solve"));
        }
    }
    for (c, loads) in parts.iter().enumerate() {
        let direct = match solve(loads.clone()) {
            Ok(r) if !refused(&r.structured_diagnostics, &r) => r,
            _ => return Outcome::Violation(format!("case {}: direct solve refused", CASES[c])),
        };
        let case = &mc.case_results[c].results;
        let floor = load_floor_3d(&SolverInput3D { loads: loads.clone(), ..s.clone() }, cond.lchar);
        let (fc, fd) = (flat_3d(case, Parts::ALL), flat_3d(&direct, Parts::ALL));
        if let Err(e) = compare_compliant(&fc, &fd, &magnitude_of(&[(1.0, &fc), (1.0, &fd)]), cond.lchar, rel, floor, cond.compliance()) {
            return Outcome::Violation(format!("case {} ≠ its linear solve: {e}", CASES[c]));
        }
        if let Err(e) = compare_shells(case, &[(1.0, case), (1.0, &direct)], &direct, rel, floor, thickness_range(s).unwrap_or(1.0)) {
            return Outcome::Violation(format!("case {} shell results ≠ its linear solve: {e}", CASES[c]));
        }
    }
    Outcome::Checked
}

fn shell_superposition(s: &SolverInput3D) -> Outcome {
    let Some(t_min) = thickness_range(s) else { return Outcome::Skipped("no shells".into()) };
    let (a, b) = (1.35, -0.6);
    let (la, lb): (Vec<SolverLoad3D>, Vec<SolverLoad3D>) = if s.loads.len() >= 2 {
        let (x, y): (Vec<_>, Vec<_>) = s.loads.iter().cloned().enumerate().partition(|(k, _)| k % 2 == 0);
        (x.into_iter().map(|p| p.1).collect(), y.into_iter().map(|p| p.1).collect())
    } else {
        (s.loads.clone(), scale_loads_3d(&s.loads, -0.7))
    };
    let mut lab = scale_loads_3d(&la, a);
    lab.extend(scale_loads_3d(&lb, b));
    let solve = |loads: Vec<SolverLoad3D>| linear::solve_3d(&SolverInput3D { loads, ..s.clone() }).ok().filter(|r| !refused(&r.structured_diagnostics, r));
    if solve(s.loads.clone()).is_none() {
        return Outcome::Skipped("the model's own loads are refused".into());
    }
    let (Some(ra), Some(rb), Some(rab), Some(r0)) = (solve(la.clone()), solve(lb.clone()), solve(lab.clone()), solve(vec![])) else {
        return Outcome::Violation("a load subset is refused on a model whose own loads solve".into());
    };
    let (cond, rel) = match conditioned(conditioning::of_3d(s)) {
        Ok(x) => x,
        Err(e) => return Outcome::Skipped(e),
    };
    if shell_groups(&ra).iter().all(|g| g.is_empty()) {
        return Outcome::Violation("a model with shells reports no shell stresses".into());
    }
    let parts_no_shell = Parts { shell_stresses: false, ..Parts::ALL };
    let (fa, fb, fab, f0) = (flat_3d(&ra, parts_no_shell), flat_3d(&rb, parts_no_shell), flat_3d(&rab, parts_no_shell), flat_3d(&r0, parts_no_shell));
    let exp = Flat::lin_comb(1.0, &Flat::lin_comb(a, &fa, b, &fb), 1.0 - a - b, &f0);
    let floor = load_floor_3d(&SolverInput3D { loads: lab.clone(), ..s.clone() }, cond.lchar)
        + a.abs() * load_floor_3d(&SolverInput3D { loads: la, ..s.clone() }, cond.lchar)
        + b.abs() * load_floor_3d(&SolverInput3D { loads: lb, ..s.clone() }, cond.lchar);
    let terms = [(a, &fa), (b, &fb), (1.0 - a - b, &f0), (1.0, &fab)];
    if let Err(e) = compare_compliant(&fab, &exp, &magnitude_of(&terms), cond.lchar, rel, floor, cond.compliance()) {
        return Outcome::Violation(format!("R(aA+bB) ≠ aR(A)+bR(B)+(1−a−b)R(∅): {e}"));
    }
    let mut expected = rab.clone();
    let combine = |pick: fn(&AnalysisResults3D) -> Vec<[f64; 8]>| -> Vec<[f64; 8]> {
        pick(&ra).iter().zip(pick(&rb)).zip(pick(&r0)).map(|((x, y), z)| std::array::from_fn(|i| a * x[i] + b * y[i] + (1.0 - a - b) * z[i])).collect()
    };
    let plate = |r: &AnalysisResults3D| r.plate_stresses.iter().map(|p| [p.sigma_xx, p.sigma_yy, p.tau_xy, p.mx, p.my, p.mxy, p.qx.unwrap_or(0.0), p.qy.unwrap_or(0.0)]).collect();
    let quad = |r: &AnalysisResults3D| r.quad_stresses.iter().map(|q| [q.sigma_xx, q.sigma_yy, q.tau_xy, q.mx, q.my, q.mxy, q.qx.unwrap_or(0.0), q.qy.unwrap_or(0.0)]).collect();
    let shear_presence = |r: &AnalysisResults3D| -> Vec<(usize, bool, bool)> {
        r.plate_stresses.iter().map(|p| (p.element_id, p.qx.is_some(), p.qy.is_some())).chain(r.quad_stresses.iter().map(|q| (q.element_id, q.qx.is_some(), q.qy.is_some()))).collect()
    };
    if [&ra, &rb, &r0].iter().any(|r| r.plate_stresses.len() != rab.plate_stresses.len() || r.quad_stresses.len() != rab.quad_stresses.len() || shear_presence(r) != shear_presence(&rab)) {
        return Outcome::Violation("shell stress lists, their element ids or their shear components differ between load cases".into());
    }
    for (p, v) in expected.plate_stresses.iter_mut().zip(combine(plate)) {
        (p.sigma_xx, p.sigma_yy, p.tau_xy, p.mx, p.my, p.mxy) = (v[0], v[1], v[2], v[3], v[4], v[5]);
        p.qx = p.qx.map(|_| v[6]);
        p.qy = p.qy.map(|_| v[7]);
    }
    for (q, v) in expected.quad_stresses.iter_mut().zip(combine(quad)) {
        (q.sigma_xx, q.sigma_yy, q.tau_xy, q.mx, q.my, q.mxy) = (v[0], v[1], v[2], v[3], v[4], v[5]);
        q.qx = q.qx.map(|_| v[6]);
        q.qy = q.qy.map(|_| v[7]);
    }
    if let Err(e) = compare_shells(&rab, &[(a, &ra), (b, &rb), (1.0 - a - b, &r0), (1.0, &rab)], &expected, rel, floor, t_min) {
        return Outcome::Violation(format!("shell stresses: R(aA+bB) ≠ aR(A)+bR(B)+(1−a−b)R(∅): {e}"));
    }
    Outcome::Checked
}

fn run<M>(what: &str, models: impl Iterator<Item = (String, M)>, check: impl Fn(&M) -> Outcome, tag: impl Fn(&M) -> Vec<&'static str>) -> BTreeMap<&'static str, usize> {
    let mut covered: BTreeMap<&'static str, usize> = BTreeMap::new();
    let (mut skipped, mut violations) = (Vec::new(), Vec::new());
    for (name, m) in models {
        match check(&m) {
            Outcome::Checked => {
                *covered.entry("checked").or_default() += 1;
                for t in tag(&m) {
                    *covered.entry(t).or_default() += 1;
                }
            }
            Outcome::Skipped(e) if name.starts_with("building") => violations.push(format!("{name}: a well-posed model was skipped: {e}")),
            Outcome::Skipped(e) => skipped.push(format!("{name}: {e}")),
            Outcome::Violation(e) => violations.push(format!("{name}: {e}")),
        }
    }
    println!("{what}: {covered:?}, skipped {}:\n{}", skipped.len(), skipped.join("\n"));
    assert!(violations.is_empty(), "{what}: {} violation(s):\n{}", violations.len(), violations.join("\n"));
    covered
}

fn models_2d() -> impl Iterator<Item = (String, SolverInput)> {
    SEEDS.map(|seed| {
        let (mut s, _) = random_2d_model_rich(seed);
        if seed % 2 == 1 {
            add_random_constraints_2d(&mut s, seed);
        }
        (format!("fuzz_rich_2d/{seed}"), s)
    })
}

fn models_3d() -> impl Iterator<Item = (String, SolverInput3D)> {
    let fuzz = SEEDS.map(|seed| {
        let (mut s, _) = random_3d_model_rich(seed);
        if seed % 2 == 1 {
            add_random_constraints_3d(&mut s, seed);
        }
        (format!("fuzz_rich_3d/{seed}"), s)
    });
    (0..20u64).map(|seed| (format!("building_3d/{seed}"), building_3d(seed))).chain(fuzz)
}

fn building_3d(seed: u64) -> SolverInput3D {
    let mut rng = Rng::new(seed ^ 0x5eed_b111_d1a6);
    let (bx, by, h) = (rng.range(3.0, 6.0), rng.range(3.0, 6.0), rng.range(2.8, 3.6));
    let stories = 1 + (seed / 5 % 2) as usize;
    let t = rng.range(0.12, 0.25);
    let id = |i: usize, j: usize, k: usize| 1 + i + 3 * j + 9 * k;
    let mut nodes = serde_json::Map::new();
    let mut node = |n: usize, x: f64, y: f64, z: f64| {
        nodes.insert(n.to_string(), json!({"id": n, "x": x, "y": y, "z": z}));
    };
    for k in 0..=stories {
        for j in 0..3 {
            for i in 0..3 {
                node(id(i, j, k), i as f64 * bx, j as f64 * by, k as f64 * h);
            }
        }
    }
    let mut elements = serde_json::Map::new();
    let mut beams = Vec::new();
    let add = |elements: &mut serde_json::Map<String, Value>, a: usize, b: usize, sec: usize, release_end: bool| {
        let e = elements.len() + 1;
        elements.insert(e.to_string(), json!({"id": e, "type": "frame", "nodeI": a, "nodeJ": b, "materialId": 1, "sectionId": sec, "releaseMyEnd": release_end, "releaseMzEnd": release_end}));
        e
    };
    for k in 0..stories {
        for j in 0..3 {
            for i in 0..3 {
                add(&mut elements, id(i, j, k), id(i, j, k + 1), 1, false);
            }
        }
    }
    for k in 1..=stories {
        for j in 0..3 {
            for i in 0..2 {
                let release = (i + j + k + seed as usize) % 7 == 0;
                beams.push(add(&mut elements, id(i, j, k), id(i + 1, j, k), 2, release));
            }
        }
        for j in 0..2 {
            for i in 0..3 {
                beams.push(add(&mut elements, id(i, j, k), id(i, j + 1, k), 2, false));
            }
        }
    }
    let mut supports = serde_json::Map::new();
    for j in 0..3 {
        for i in 0..3 {
            let n = id(i, j, 0);
            let mut sp = json!({"nodeId": n, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true});
            if (i, j) == (2, 2) {
                sp["rz"] = json!(false);
                sp["kz"] = json!(rng.range(5e4, 2e5));
            }
            if (i, j) == (1, 0) && seed % 2 == 1 {
                sp["dz"] = json!(-rng.range(0.002, 0.008));
            }
            supports.insert(n.to_string(), sp);
        }
    }
    let top = stories;
    let (mut plates, mut quads, mut quad9s, mut solid, mut curved) = (serde_json::Map::new(), serde_json::Map::new(), serde_json::Map::new(), serde_json::Map::new(), serde_json::Map::new());
    let mut shell_loads = Vec::new();
    let mut extra = 9 * (stories + 1);
    let z = top as f64 * h;
    for j in 0..2 {
        for i in 0..2 {
            let c = [id(i, j, top), id(i + 1, j, top), id(i + 1, j + 1, top), id(i, j + 1, top)];
            let p = rng.range(-12.0, -4.0);
            let mut fresh = |x: f64, y: f64, zz: f64| {
                extra += 1;
                node(extra, x, y, zz);
                extra
            };
            let (x0, y0) = (i as f64 * bx, j as f64 * by);
            match seed % 5 {
                0 => {
                    for tri in [[c[0], c[1], c[2]], [c[0], c[2], c[3]]] {
                        let e = plates.len() + 1;
                        plates.insert(e.to_string(), json!({"id": e, "nodes": tri, "materialId": 2, "thickness": t}));
                        shell_loads.push(json!({"type": "pressure", "data": {"elementId": e, "pressure": p}}));
                    }
                }
                1 => {
                    let e = quads.len() + 1;
                    quads.insert(e.to_string(), json!({"id": e, "nodes": c, "materialId": 2, "thickness": t}));
                    shell_loads.push(json!({"type": "quadPressure", "data": {"elementId": e, "pressure": p}}));
                    shell_loads.push(json!({"type": "quadThermal", "data": {"elementId": e, "dtUniform": rng.range(-20.0, 20.0), "dtGradient": rng.range(-10.0, 10.0)}}));
                }
                2 => {
                    let mid = [(0.5, 0.0), (1.0, 0.5), (0.5, 1.0), (0.0, 0.5), (0.5, 0.5)].map(|(s, q)| fresh(x0 + s * bx, y0 + q * by, z));
                    let e = quad9s.len() + 1;
                    quad9s.insert(e.to_string(), json!({"id": e, "nodes": [c[0], c[1], c[2], c[3], mid[0], mid[1], mid[2], mid[3], mid[4]], "materialId": 2, "thickness": t}));
                    shell_loads.push(json!({"type": "quad9Pressure", "data": {"elementId": e, "pressure": p}}));
                }
                3 => {
                    let up = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)].map(|(s, q)| fresh(x0 + s * bx, y0 + q * by, z + t));
                    let e = solid.len() + 1;
                    solid.insert(e.to_string(), json!({"id": e, "nodes": [c[0], c[1], c[2], c[3], up[0], up[1], up[2], up[3]], "materialId": 2}));
                    shell_loads.push(json!({"type": "solidShellPressure", "data": {"elementId": e, "pressure": p}}));
                }
                _ => {
                    let e = curved.len() + 1;
                    curved.insert(e.to_string(), json!({"id": e, "nodes": c, "materialId": 2, "thickness": t}));
                    shell_loads.push(json!({"type": "curvedShellPressure", "data": {"elementId": e, "pressure": p}}));
                }
            }
        }
    }
    let mut loads = Vec::new();
    for (k, &b) in beams.iter().enumerate() {
        let q = rng.range(-15.0, -5.0);
        loads.push(json!({"type": "distributed", "data": {"elementId": b, "qYI": 0.0, "qYJ": 0.0, "qZI": q, "qZJ": q * rng.range(0.5, 1.5)}}));
        if let Some(l) = shell_loads.get(k) {
            loads.push(l.clone());
        }
    }
    loads.extend(shell_loads.iter().skip(beams.len()).cloned());
    for (i, j) in [(0, 0), (2, 1), (1, 2)] {
        loads.push(json!({"type": "nodal", "data": {"nodeId": id(i, j, top), "fx": rng.range(-20.0, 20.0), "fy": rng.range(-20.0, 20.0), "fz": rng.range(-10.0, 0.0), "mx": rng.range(-5.0, 5.0), "my": rng.range(-5.0, 5.0), "mz": rng.range(-5.0, 5.0)}}));
    }
    loads.push(json!({"type": "pointOnElement", "data": {"elementId": 1, "a": h / 2.0, "py": rng.range(-10.0, 10.0), "pz": rng.range(-10.0, 10.0)}}));
    loads.push(json!({"type": "thermal", "data": {"elementId": beams[0], "dtUniform": rng.range(-20.0, 20.0), "dtGradientY": rng.range(-10.0, 10.0), "dtGradientZ": rng.range(-10.0, 10.0)}}));
    serde_json::from_value(json!({
        "nodes": nodes, "elements": elements, "supports": supports, "loads": loads,
        "materials": {"1": {"id": 1, "e": 2.0e8, "nu": 0.3}, "2": {"id": 2, "e": rng.range(2.5e7, 3.5e7), "nu": 0.2}},
        "sections": {
            "1": {"id": 1, "a": rng.range(0.01, 0.02), "iy": rng.range(1e-4, 3e-4), "iz": rng.range(1e-4, 3e-4), "j": rng.range(1e-5, 5e-5)},
            "2": {"id": 2, "a": rng.range(0.008, 0.015), "iy": rng.range(1e-4, 4e-4), "iz": rng.range(2e-5, 8e-5), "j": rng.range(5e-6, 2e-5)}
        },
        "plates": plates, "quads": quads, "quad9s": quad9s, "solidShells": solid, "curvedShells": curved
    }))
    .unwrap()
}

fn tags_2d(s: &SolverInput) -> Vec<&'static str> {
    let mut t = Vec::new();
    if !s.constraints.is_empty() {
        t.push("constraints");
    }
    if s.supports.values().any(|x| x.dx.is_some() || x.dz.is_some() || x.dry.is_some()) {
        t.push("settlements");
    }
    t
}

fn tags_3d(s: &SolverInput3D) -> Vec<&'static str> {
    let mut t = Vec::new();
    if !s.constraints.is_empty() {
        t.push("constraints");
    }
    if s.supports.values().any(|x| [x.dx, x.dy, x.dz, x.drx, x.dry, x.drz].iter().any(Option::is_some)) {
        t.push("settlements");
    }
    for (present, name) in [(!s.plates.is_empty(), "plates"), (!s.quads.is_empty(), "quads"), (!s.quad9s.is_empty(), "quad9s"), (!s.solid_shells.is_empty(), "solid shells"), (!s.curved_shells.is_empty(), "curved shells")] {
        if present {
            t.push(name);
        }
    }
    t
}

fn require(covered: &BTreeMap<&'static str, usize>, keys: &[&str]) {
    for k in keys {
        assert!(covered.get(k).copied().unwrap_or(0) > 0, "no model with {k} was checked: {covered:?}");
    }
}

#[test]
fn factored_combinations_equal_the_factored_solve_2d() {
    let covered = run("combinations 2D", models_2d(), combinations_2d, tags_2d);
    require(&covered, &["checked", "constraints", "settlements"]);
}

#[test]
fn factored_combinations_equal_the_factored_solve_3d() {
    let covered = run("combinations 3D", models_3d(), combinations_3d, tags_3d);
    require(&covered, &["checked", "constraints", "settlements", "plates", "quads"]);
}

#[test]
fn shell_stress_components_superpose() {
    let covered = run("shell superposition", models_3d().filter(|(_, s)| thickness_range(s).is_some()), shell_superposition, tags_3d);
    require(&covered, &["plates", "quads", "quad9s", "solid shells", "curved shells"]);
}
