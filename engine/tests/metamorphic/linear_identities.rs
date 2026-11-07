//! Factored load combinations and shell stress superposition on the linear static solve.
//! P-Delta, buckling, pushover and every other nonlinear analysis are excluded: superposition does not hold for them.

use crate::checks2::{load_floor_2d, scale_loads_2d};
use crate::checks3::{load_floor_3d, scale_loads_3d};
use crate::corpus::fuzz_models::{add_random_constraints_2d, add_random_constraints_3d, random_2d_model_rich, random_3d_model_rich};
use dedaliano_engine::metamorphic::compare::{compare_compliant, flat_2d, flat_3d, Flat, Parts};
use dedaliano_engine::metamorphic::conditioning::{self, Conditioning, INCONCLUSIVE};
use dedaliano_engine::postprocess::combinations::{combine_results_3d_refs_with_thickness, CombinationFactor};
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

fn shell_groups(r: &AnalysisResults3D) -> [Vec<(String, f64)>; 4] {
    let mut g: [Vec<(String, f64)>; 4] = Default::default();
    let mut push = |at: String, membrane: [f64; 3], bending: [f64; 3], shear: [Option<f64>; 2], von_mises: f64| {
        for (n, v) in ["sxx", "syy", "txy"].iter().zip(membrane) {
            g[0].push((format!("{at}.{n}"), v));
        }
        for (n, v) in ["mx", "my", "mxy"].iter().zip(bending) {
            g[1].push((format!("{at}.{n}"), v));
        }
        for (n, v) in ["qx", "qy"].iter().zip(shear) {
            if let Some(v) = v {
                g[2].push((format!("{at}.{n}"), v));
            }
        }
        g[3].push((format!("{at}.vm"), von_mises));
    };
    for (k, p) in r.plate_stresses.iter().enumerate() {
        push(format!("plate#{k}(e{})", p.element_id), [p.sigma_xx, p.sigma_yy, p.tau_xy], [p.mx, p.my, p.mxy], [p.qx, p.qy], p.von_mises);
    }
    for (k, q) in r.quad_stresses.iter().enumerate() {
        push(format!("quad#{k}(e{})", q.element_id), [q.sigma_xx, q.sigma_yy, q.tau_xy], [q.mx, q.my, q.mxy], [q.qx, q.qy], q.von_mises);
    }
    for (k, n) in r.quad_nodal_stresses.iter().enumerate() {
        push(format!("nodal#{k}(n{})", n.node_index), [n.sigma_xx, n.sigma_yy, n.tau_xy], [n.mx, n.my, n.mxy], [n.qx, n.qy], n.von_mises);
    }
    g
}

fn mitc4_shear_reported(s: &SolverInput3D, r: &AnalysisResults3D) -> bool {
    r.quad_stresses.len() >= s.quads.len() && r.quad_stresses[..s.quads.len()].iter().all(|q| q.qx.is_some() && q.qy.is_some())
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
    let floors = [6.0 * force_floor / (t_min * t_min), force_floor, force_floor / t_min, 6.0 * force_floor / (t_min * t_min)];
    for (k, family) in ["membrane stress", "bending moment", "transverse shear", "von Mises stress"].iter().enumerate() {
        let (a, e) = (&gg[k], &ge[k]);
        if a.iter().map(|x| &x.0).ne(e.iter().map(|x| &x.0)) {
            return Err(format!("{family}: {} entries vs {} expected", a.len(), e.len()));
        }
        let scale = terms.iter().map(|(w, r)| w.abs() * group_max(&shell_groups(r)[k])).sum::<f64>().max(floors[k]);
        let tol = rel * scale + f64::MIN_POSITIVE;
        for ((label, x), (_, y)) in a.iter().zip(e) {
            if ![*x, *y, tol].iter().all(|v| v.is_finite()) || !((x - y).abs() <= tol) {
                return Err(format!("{family} {label}: got {x:.10e}, expected {y:.10e}, |diff| {:.3e} > tol {tol:.3e}", (x - y).abs()));
            }
        }
    }
    Ok(())
}

fn membrane_von_mises(x: f64, y: f64, xy: f64) -> f64 {
    (x * x - x * y + y * y + 3.0 * xy * xy).sqrt()
}

/// σ1, σ2 and von Mises on the bottom (membrane + 6M/t²) and top (membrane − 6M/t²) faces.
fn plate_faces(p: &PlateStress, t: f64) -> [(f64, f64, f64); 2] {
    let k = 6.0 / (t * t);
    [1.0, -1.0].map(|side| {
        let (x, y, xy) = (p.sigma_xx + side * k * p.mx, p.sigma_yy + side * k * p.my, p.tau_xy + side * k * p.mxy);
        let (centre, radius) = (0.5 * (x + y), (0.25 * (x - y) * (x - y) + xy * xy).sqrt());
        (centre + radius, centre - radius, membrane_von_mises(x, y, xy))
    })
}

fn plate_thicknesses(s: &SolverInput3D) -> std::collections::HashMap<usize, f64> {
    s.plates.values().map(|p| (p.id, p.thickness)).collect()
}

/// `like`'s shells, each component the factored sum of the terms' and the von Mises and principal
/// stresses recomputed from those sums.
fn factored_shells(terms: &[(f64, &AnalysisResults3D)], like: &AnalysisResults3D, thickness: &std::collections::HashMap<usize, f64>) -> Result<AnalysisResults3D, String> {
    let mut e = like.clone();
    for (_, r) in terms {
        let ids = |r: &AnalysisResults3D| (r.plate_stresses.iter().map(|p| p.element_id).collect::<Vec<_>>(), r.quad_stresses.iter().map(|q| q.element_id).collect::<Vec<_>>(), r.quad_nodal_stresses.iter().map(|n| n.node_index).collect::<Vec<_>>());
        if ids(r) != ids(like) {
            return Err("a case lists its shells differently from the factored solve".into());
        }
    }
    let sum = |at: &dyn Fn(&AnalysisResults3D) -> [f64; 6]| -> [f64; 6] {
        let mut v = [0.0; 6];
        for (w, r) in terms {
            for (a, b) in v.iter_mut().zip(at(r)) {
                *a += w * b;
            }
        }
        v
    };
    let shear = |at: &dyn Fn(&AnalysisResults3D) -> [Option<f64>; 2]| -> [Option<f64>; 2] {
        [0, 1].map(|i| terms.iter().try_fold(0.0, |acc, (w, r)| at(r)[i].map(|v| acc + w * v)))
    };
    for (k, p) in e.plate_stresses.iter_mut().enumerate() {
        let v = sum(&|r| { let x = &r.plate_stresses[k]; [x.sigma_xx, x.sigma_yy, x.tau_xy, x.mx, x.my, x.mxy] });
        (p.sigma_xx, p.sigma_yy, p.tau_xy, p.mx, p.my, p.mxy) = (v[0], v[1], v[2], v[3], v[4], v[5]);
        [p.qx, p.qy] = shear(&|r| [r.plate_stresses[k].qx, r.plate_stresses[k].qy]);
        let t = *thickness.get(&p.element_id).ok_or_else(|| format!("plate {} has no thickness", p.element_id))?;
        let faces = plate_faces(p, t);
        let worse = if faces[1].2 >= faces[0].2 { faces[1] } else { faces[0] };
        (p.sigma_1, p.sigma_2, p.von_mises) = worse;
    }
    for (k, q) in e.quad_stresses.iter_mut().enumerate() {
        let v = sum(&|r| { let x = &r.quad_stresses[k]; [x.sigma_xx, x.sigma_yy, x.tau_xy, x.mx, x.my, x.mxy] });
        (q.sigma_xx, q.sigma_yy, q.tau_xy, q.mx, q.my, q.mxy) = (v[0], v[1], v[2], v[3], v[4], v[5]);
        [q.qx, q.qy] = shear(&|r| [r.quad_stresses[k].qx, r.quad_stresses[k].qy]);
        q.von_mises = membrane_von_mises(v[0], v[1], v[2]);
    }
    for (k, n) in e.quad_nodal_stresses.iter_mut().enumerate() {
        let v = sum(&|r| { let x = &r.quad_nodal_stresses[k]; [x.sigma_xx, x.sigma_yy, x.tau_xy, x.mx, x.my, x.mxy] });
        (n.sigma_xx, n.sigma_yy, n.tau_xy, n.mx, n.my, n.mxy) = (v[0], v[1], v[2], v[3], v[4], v[5]);
        [n.qx, n.qy] = shear(&|r| [r.quad_nodal_stresses[k].qx, r.quad_nodal_stresses[k].qy]);
        n.von_mises = membrane_von_mises(v[0], v[1], v[2]);
    }
    Ok(e)
}

/// A plate's principal stresses are those of its face with the larger von Mises stress: where the
/// two faces tie within the tolerance, either face's pair is accepted.
fn compare_principal(got: &AnalysisResults3D, terms: &[(f64, &AnalysisResults3D)], expected: &AnalysisResults3D, rel: f64, force_floor: f64, t_min: f64, thickness: &std::collections::HashMap<usize, f64>) -> Result<(), String> {
    if got.plate_stresses.len() != expected.plate_stresses.len() {
        return Err(format!("principal stresses: {} plates vs {} expected", got.plate_stresses.len(), expected.plate_stresses.len()));
    }
    let peak = |r: &AnalysisResults3D| r.plate_stresses.iter().fold(0.0, |m: f64, p| m.max(p.sigma_1.abs()).max(p.sigma_2.abs()).max(p.von_mises));
    let scale = terms.iter().map(|(w, r)| w.abs() * peak(r)).sum::<f64>().max(6.0 * force_floor / (t_min * t_min));
    let tol = rel * scale + f64::MIN_POSITIVE;
    for (k, (g, e)) in got.plate_stresses.iter().zip(&expected.plate_stresses).enumerate() {
        let near = |a: f64, b: f64| (a - b).abs() <= tol;
        let matches = |s1: f64, s2: f64| near(g.sigma_1, s1) && near(g.sigma_2, s2);
        let t = *thickness.get(&e.element_id).ok_or_else(|| format!("plate {} has no thickness", e.element_id))?;
        let faces = plate_faces(e, t);
        let tie = near(faces[0].2, faces[1].2);
        if g.element_id != e.element_id || !tol.is_finite() || !(matches(e.sigma_1, e.sigma_2) || tie && faces.iter().any(|f| matches(f.0, f.1))) {
            return Err(format!(
                "principal stresses plate#{k}(e{}): got ({:.10e}, {:.10e}), expected ({:.10e}, {:.10e}), tol {tol:.3e}",
                e.element_id, g.sigma_1, g.sigma_2, e.sigma_1, e.sigma_2
            ));
        }
    }
    Ok(())
}

/// A combination's shell stresses against the linear solve of its factored loads, and against the
/// factored sum of its cases' components with von Mises and principal stresses recomputed from it.
fn check_combined_shells(s: &SolverInput3D, got: &AnalysisResults3D, direct: &AnalysisResults3D, terms: &[(f64, &AnalysisResults3D)], rel: f64, floor: f64) -> Result<(), String> {
    let t_min = thickness_range(s).unwrap_or(1.0);
    let thickness = plate_thicknesses(s);
    let mut with_direct = terms.to_vec();
    with_direct.push((1.0, direct));
    compare_shells(got, &with_direct, direct, rel, floor, t_min).map_err(|e| format!("shell stresses ≠ the factored solve's: {e}"))?;
    compare_principal(got, &with_direct, direct, rel, floor, t_min, &thickness).map_err(|e| format!("shell stresses ≠ the factored solve's: {e}"))?;
    let sum = factored_shells(terms, direct, &thickness)?;
    compare_shells(got, terms, &sum, rel, floor, t_min).map_err(|e| format!("shell stresses ≠ the factored sum of the cases: {e}"))?;
    compare_principal(got, terms, &sum, rel, floor, t_min, &thickness).map_err(|e| format!("shell stresses ≠ the factored sum of the cases: {e}"))
}

/// The #1673 reproduction: two cases from the model's loads, combined 1.2A + 1.6B.
fn combined_shells_3d(s: &SolverInput3D) -> Outcome {
    let solve = |loads: Vec<SolverLoad3D>| linear::solve_3d(&SolverInput3D { loads, ..s.clone() });
    let (cond, rel) = match conditioned(conditioning::of_3d(s)) {
        Ok(x) => x,
        Err(e) => return Outcome::Skipped(e),
    };
    let (Ok(r0), [a, b, _]) = (solve(vec![]), split(&s.loads)) else {
        return Outcome::Violation("zero-load solve refused".into());
    };
    let input = load_cases::MultiCaseInput3D {
        solver: SolverInput3D { loads: vec![], ..s.clone() },
        load_cases: vec![load_cases::LoadCase3D { name: "A".into(), loads: a.clone() }, load_cases::LoadCase3D { name: "B".into(), loads: b.clone() }],
        combinations: vec![load_cases::CombinationDef { name: "1.2A+1.6B".into(), factors: [("A".to_string(), 1.2), ("B".to_string(), 1.6)].into_iter().collect() }],
    };
    let mut factored = scale_loads_3d(&a, 1.2);
    factored.extend(scale_loads_3d(&b, 1.6));
    let (mc, direct) = match (load_cases::solve_multi_case_3d(&input), solve(factored.clone())) {
        (Ok(mc), Ok(direct)) => (mc, direct),
        (Err(e), _) | (_, Err(e)) => return Outcome::Violation(format!("refused: {e}")),
    };
    let floor = load_floor_3d(&SolverInput3D { loads: factored, ..s.clone() }, cond.lchar);
    let terms = [(1.2, &mc.case_results[0].results), (1.6, &mc.case_results[1].results), (1.0 - 1.2 - 1.6, &r0)];
    match check_combined_shells(s, &mc.combination_results[0].results, &direct, &terms, rel, floor) {
        Ok(()) => Outcome::Checked,
        Err(e) => Outcome::Violation(e),
    }
}

fn shell_ids_collide(s: &SolverInput3D) -> bool {
    let ids: Vec<usize> = s.quads.values().map(|e| e.id).chain(s.quad9s.values().map(|e| e.id)).chain(s.solid_shells.values().map(|e| e.id)).chain(s.curved_shells.values().map(|e| e.id)).collect();
    ids.iter().collect::<std::collections::HashSet<_>>().len() != ids.len()
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
        Ok(_) if shell_ids_collide(s) => return Outcome::Violation("combined shells whose ids collide across families were not refused".into()),
        Err(e) if shell_ids_collide(s) => {
            let Ok(r) = solve(s.loads.clone()) else { return Outcome::Violation(format!("multi-case refused: {e}")) };
            let mut no_quads = r.clone();
            (no_quads.quad_stresses, no_quads.quad_nodal_stresses) = (vec![], vec![]);
            let once = |r: &AnalysisResults3D| combine_results_3d_refs_with_thickness(&[CombinationFactor { case_id: 0, factor: 1.0 }], &[(0, r)], &plate_thicknesses(s)).is_ok();
            return if !once(&r) && once(&no_quads) {
                Outcome::Skipped("shell ids collide across families: combinations refused (#1666)".into())
            } else {
                Outcome::Violation(format!("multi-case refused for another reason than its colliding shell ids: {e}"))
            };
        }
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
        let mut shell_terms: Vec<(f64, &AnalysisResults3D)> = fs.iter().map(|&(c, f)| (f, &mc.case_results[c].results)).collect();
        shell_terms.push((1.0 - sum, &r0));
        if let Err(e) = check_combined_shells(s, &got.results, &exp, &shell_terms, rel, floor) {
            return Outcome::Violation(format!("{name}: {e}"));
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
        if !mitc4_shear_reported(s, case) || !mitc4_shear_reported(s, &direct) {
            return Outcome::Violation(format!("case {}: MITC4 quads report no transverse shear", CASES[c]));
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
    if [&ra, &rb, &r0, &rab].iter().any(|r| !mitc4_shear_reported(s, r)) {
        return Outcome::Violation("MITC4 quads report no transverse shear".into());
    }
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

pub(crate) fn building_3d(seed: u64) -> SolverInput3D {
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

#[test]
fn issue_1673_combinations_report_the_shell_stresses_of_the_factored_solve() {
    for seed in 0..5 {
        match combined_shells_3d(&building_3d(seed)) {
            Outcome::Checked => {}
            Outcome::Skipped(e) | Outcome::Violation(e) => panic!("building_3d/{seed}: {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dedaliano_engine::postprocess::combinations::{combine_results_3d, combine_results_3d_refs, CaseEntry3D, CombinationInput3D, PlateThicknesses};

    fn quad_building() -> (SolverInput3D, AnalysisResults3D) {
        let s = building_3d(1);
        assert!(!s.quads.is_empty());
        let r = linear::solve_3d(&s).unwrap();
        (s, r)
    }

    #[test]
    fn nonfinite_shell_stresses_fail() {
        let (_, r) = quad_building();
        for bad in [f64::INFINITY, f64::NAN] {
            let mut got = r.clone();
            got.quad_stresses[0].mx = bad;
            assert!(compare_shells(&got, &[(1.0, &got), (1.0, &r)], &r, 1e-10, 1.0, 0.1).is_err(), "got {bad}");
            assert!(compare_shells(&r, &[(1.0, &got), (1.0, &r)], &got, 1e-10, 1.0, 0.1).is_err(), "expected {bad}");
        }
        assert!(compare_shells(&r, &[(1.0, &r)], &r, 1e-10, 1.0, 0.1).is_ok());
    }

    fn two_cases(seed: u64) -> (SolverInput3D, load_cases::MultiCaseResult3D) {
        let s = building_3d(seed);
        let [a, b, _] = split(&s.loads);
        let input = load_cases::MultiCaseInput3D {
            solver: SolverInput3D { loads: vec![], ..s.clone() },
            load_cases: vec![load_cases::LoadCase3D { name: "A".into(), loads: a }, load_cases::LoadCase3D { name: "B".into(), loads: b }],
            combinations: vec![load_cases::CombinationDef { name: "1.2A+1.6B".into(), factors: [("A".to_string(), 1.2), ("B".to_string(), 1.6)].into_iter().collect() }],
        };
        let mc = load_cases::solve_multi_case_3d(&input).unwrap();
        (s, mc)
    }

    fn factors() -> Vec<CombinationFactor> {
        vec![CombinationFactor { case_id: 0, factor: 1.2 }, CombinationFactor { case_id: 1, factor: 1.6 }]
    }

    #[test]
    fn a_combination_of_given_cases_needs_each_plates_thickness() {
        let (s, mc) = two_cases(0);
        let (a, b) = (&mc.case_results[0].results, &mc.case_results[1].results);
        assert!(!a.plate_stresses.is_empty());
        assert!(combine_results_3d_refs(&factors(), &[(0, a), (1, b)]).is_err());
        let mut thickness = plate_thicknesses(&s);
        let combined = combine_results_3d_refs_with_thickness(&factors(), &[(0, a), (1, b)], &thickness).unwrap().unwrap();
        let expected = &mc.combination_results[0].results;
        assert_eq!(serde_json::to_value(&combined.plate_stresses).unwrap(), serde_json::to_value(&expected.plate_stresses).unwrap());
        let input = CombinationInput3D {
            factors: factors(),
            cases: vec![CaseEntry3D { case_id: 0, results: a.clone() }, CaseEntry3D { case_id: 1, results: b.clone() }],
            plate_thicknesses: thickness.iter().map(|(&id, &t)| (id, t)).collect(),
        };
        assert_eq!(serde_json::to_value(combine_results_3d(&input).unwrap().unwrap().plate_stresses).unwrap(), serde_json::to_value(&expected.plate_stresses).unwrap());
        for t in [0.0, f64::NAN] {
            thickness.insert(a.plate_stresses[0].element_id, t);
            assert!(combine_results_3d_refs_with_thickness(&factors(), &[(0, a), (1, b)], &thickness).is_err(), "thickness {t}");
        }
    }

    #[test]
    fn shells_that_do_not_line_up_are_refused() {
        let (_, mc) = two_cases(1);
        let (a, b) = (&mc.case_results[0].results, &mc.case_results[1].results);
        assert!(a.quad_stresses.len() > 1 && !a.quad_nodal_stresses.is_empty());
        let none = PlateThicknesses::new();
        let combine = |x: &AnalysisResults3D, y: &AnalysisResults3D| combine_results_3d_refs_with_thickness(&factors(), &[(0, x), (1, y)], &none);
        assert_eq!(combine(a, b).unwrap().unwrap().quad_stresses.len(), a.quad_stresses.len());
        let mut reordered = b.clone();
        reordered.quad_stresses.reverse();
        let mut missing = b.clone();
        missing.quad_stresses.pop();
        let mut nodal = b.clone();
        nodal.quad_nodal_stresses.pop();
        let mut repeated = a.clone();
        repeated.quad_stresses[1].element_id = repeated.quad_stresses[0].element_id;
        for (what, x, y) in [("reordered", a, &reordered), ("missing", a, &missing), ("nodal", a, &nodal), ("repeated id", &repeated, &repeated)] {
            assert!(combine(x, y).is_err(), "{what}");
        }
        let zero = [CombinationFactor { case_id: 0, factor: 1.0 }, CombinationFactor { case_id: 1, factor: 0.0 }];
        assert!(combine_results_3d_refs_with_thickness(&zero, &[(0, a), (1, &missing)], &none).is_ok());
        let mut shearless = missing.clone();
        shearless.quad_stresses[0].qx = None;
        let inactive_first = combine_results_3d_refs_with_thickness(&zero, &[(1, &shearless), (0, a)], &none).unwrap().unwrap();
        assert_eq!(inactive_first.quad_stresses.len(), a.quad_stresses.len());
        assert_eq!(inactive_first.quad_stresses[0].qx, a.quad_stresses[0].qx);
    }

    #[test]
    fn a_combined_shell_stress_beyond_f64_is_refused() {
        let (_, mc) = two_cases(1);
        let mut huge = mc.case_results[0].results.clone();
        (huge.quad_stresses[0].sigma_xx, huge.quad_stresses[0].sigma_yy) = (1e154, 1e154);
        assert!(combine_results_3d_refs(&[CombinationFactor { case_id: 0, factor: 2.0 }], &[(0, &huge)]).is_err());
        assert!(combine_results_3d_refs(&[CombinationFactor { case_id: 0, factor: 2.0 }], &[(0, &mc.case_results[0].results)]).is_ok());
    }

    #[test]
    fn a_shell_shear_is_combined_only_where_every_case_has_it() {
        let (_, mc) = two_cases(1);
        let (a, mut b) = (&mc.case_results[0].results, mc.case_results[1].results.clone());
        assert!(a.quad_stresses[0].qx.is_some());
        b.quad_stresses[0].qy = None;
        let combined = combine_results_3d_refs(&factors(), &[(0, a), (1, &b)]).unwrap().unwrap();
        assert_eq!((combined.quad_stresses[0].qx, combined.quad_stresses[0].qy), (None, None));
        let q = &combined.quad_stresses[1];
        assert_eq!(q.qx, Some(1.2 * a.quad_stresses[1].qx.unwrap() + 1.6 * b.quad_stresses[1].qx.unwrap()));
    }

    #[test]
    fn missing_mitc4_shear_is_caught() {
        let (s, r) = quad_building();
        assert!(mitc4_shear_reported(&s, &r));
        let mut stripped = r.clone();
        for q in &mut stripped.quad_stresses {
            (q.qx, q.qy) = (None, None);
        }
        assert!(!mitc4_shear_reported(&s, &stripped));
    }
}
