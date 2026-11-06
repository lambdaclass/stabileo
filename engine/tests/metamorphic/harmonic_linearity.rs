use crate::case::{Case2, Case3};
use crate::corpus::Model;
use dedaliano_engine::solver::{assembly, dof::DofNumbering, harmonic, mass_matrix};
use dedaliano_engine::types::*;
use std::collections::HashMap;

pub(crate) fn nightly_case(issue: u32) -> (Option<Case2>, Option<Case3>) {
    let (model, name, dens) = nightly(issue);
    match model {
        Model::D2(s) => {
            let mut c = Case2::new(name, s);
            if let Some(d) = dens {
                c.dens = d;
            }
            (Some(c), None)
        }
        Model::D3(s) => {
            let mut c = Case3::new(name, s);
            if let Some(d) = dens {
                c.dens = d;
            }
            (None, Some(c))
        }
    }
}

fn nightly(issue: u32) -> (Model, String, Option<HashMap<String, f64>>) {
    let text = std::fs::read_to_string(format!("{}/tests/metamorphic_corpus/nightly/issue-{issue}.json", env!("CARGO_MANIFEST_DIR"))).unwrap();
    let meta: serde_json::Value = serde_json::from_str(&text).unwrap();
    let name = meta["_nightly_name"].as_str().unwrap_or("replay").to_owned();
    let dens = meta.get("_nightly_dens").map(|d| serde_json::from_value(d.clone()).unwrap());
    (crate::corpus::parse(&text).unwrap(), name, dens)
}

fn free_block(full: &[f64], n: usize, nf: usize) -> Vec<f64> {
    (0..nf * nf).map(|i| full[(i / nf) * n + i % nf]).collect()
}

fn halves<T: Clone>(loads: &[T]) -> (Vec<T>, Vec<T>) {
    let (a, b): (Vec<_>, Vec<_>) = loads.iter().cloned().enumerate().partition(|(k, _)| k % 2 == 0);
    (a.into_iter().map(|x| x.1).collect(), b.into_iter().map(|x| x.1).collect())
}

struct Row {
    at: String,
    frequency: f64,
    got: (f64, f64),
    lu: (f64, f64),
    gauss: (f64, f64),
}

fn assert_rows_match_direct(issue: u32, what: &str, rows: &[Row]) {
    let freqs: Vec<f64> = rows.iter().map(|r| r.frequency).fold(Vec::new(), |mut v, f| {
        if !v.contains(&f) {
            v.push(f);
        }
        v
    });
    for f in freqs {
        let at_f: Vec<&Row> = rows.iter().filter(|r| r.frequency == f).collect();
        let scale = at_f.iter().map(|r| r.lu.0.hypot(r.lu.1)).fold(0.0f64, f64::max);
        if scale == 0.0 {
            continue;
        }
        for r in at_f {
            let diff = |a: (f64, f64), b: (f64, f64)| (a.0 - b.0).hypot(a.1 - b.1) / scale;
            assert!(diff(r.lu, r.gauss) < 1e-9, "#{issue} {what} {} at {f} Hz: the two direct solves disagree: {:?} vs {:?}", r.at, r.lu, r.gauss);
            assert!(diff(r.got, r.lu) < 1e-6, "#{issue} {what} {} at {f} Hz: reported {:?}, direct {:?} (scale {scale:.3e})", r.at, r.got, r.lu);
        }
    }
}

fn direct_rows_2d(c: &Case2) -> Vec<Row> {
    let dn = DofNumbering::build_2d(&c.s);
    let (nf, n) = (dn.n_free, dn.n_total);
    let asm = assembly::assemble_2d(&c.s, &dn);
    let (kff, mff) = (free_block(&asm.k, n, nf), free_block(&mass_matrix::assemble_mass_matrix_2d(&c.s, &dn, &c.dens), n, nf));
    let mut rows = Vec::new();
    for node in c.s.nodes.values().map(|x| x.id) {
        for (di, dof) in ["x", "y"].into_iter().enumerate() {
            let Some(g) = dn.global_dof(node, di).filter(|&g| g < nf) else { continue };
            let inp = harmonic::HarmonicInput { solver: c.s.clone(), densities: c.dens.clone(), frequencies: c.p.freqs.clone(), damping_ratio: 0.05, response_node_id: node, response_dof: dof.into() };
            let (r, (a0, a1)) = harmonic::solve_harmonic_2d_with_damping(&inp).unwrap();
            let cff: Vec<f64> = (0..nf * nf).map(|i| a0 * mff[i] + a1 * kff[i]).collect();
            for pt in &r.response_points {
                let (lr, li) = harmonic::solve_complex_system(&kff, &mff, &cff, &asm.f[..nf], nf, pt.omega).unwrap();
                let (gr, gi) = crate::regressions::gauss_complex(&kff, &mff, &cff, &asm.f[..nf], nf, pt.omega);
                rows.push(Row { at: format!("n{node} u{dof}"), frequency: pt.frequency, got: (pt.real, pt.imag), lu: (lr[g], li[g]), gauss: (gr[g], gi[g]) });
            }
        }
    }
    rows
}

fn direct_rows_3d(c: &Case3) -> Vec<Row> {
    let dn = DofNumbering::build_3d(&c.s);
    let (nf, n) = (dn.n_free, dn.n_total);
    let asm = assembly::assemble_3d(&c.s, &dn);
    let (kff, mff) = (free_block(&asm.k, n, nf), free_block(&mass_matrix::assemble_mass_matrix_3d(&c.s, &dn, &c.dens), n, nf));
    let mut rows = Vec::new();
    for node in c.s.nodes.values().map(|x| x.id) {
        for (di, dof) in ["x", "y", "z"].into_iter().enumerate() {
            let Some(g) = dn.global_dof(node, di).filter(|&g| g < nf) else { continue };
            let inp = harmonic::HarmonicInput3D { solver: c.s.clone(), densities: c.dens.clone(), frequencies: c.p.freqs.clone(), damping_ratio: 0.05, response_node_id: node, response_dof: dof.into() };
            let (r, (a0, a1)) = harmonic::solve_harmonic_3d_with_damping(&inp).unwrap();
            let cff: Vec<f64> = (0..nf * nf).map(|i| a0 * mff[i] + a1 * kff[i]).collect();
            for pt in &r.response_points {
                let (lr, li) = harmonic::solve_complex_system(&kff, &mff, &cff, &asm.f[..nf], nf, pt.omega).unwrap();
                let (gr, gi) = crate::regressions::gauss_complex(&kff, &mff, &cff, &asm.f[..nf], nf, pt.omega);
                rows.push(Row { at: format!("n{node} u{dof}"), frequency: pt.frequency, got: (pt.real, pt.imag), lu: (lr[g], li[g]), gauss: (gr[g], gi[g]) });
            }
        }
    }
    rows
}

fn unit_loads_3d(c: &Case3) -> Vec<(String, Vec<SolverLoad3D>)> {
    let dn = DofNumbering::build_3d(&c.s);
    let mut out = Vec::new();
    for node_id in c.s.nodes.values().map(|x| x.id) {
        for (d, axis) in ["x", "y", "z"].into_iter().enumerate() {
            if !dn.global_dof(node_id, d).is_some_and(|g| g < dn.n_free) {
                continue;
            }
            let mut v = [0.0; 3];
            v[d] = 1.0;
            out.push((format!("unit F{axis} at n{node_id}"), vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id, fx: v[0], fy: v[1], fz: v[2], mx: 0.0, my: 0.0, mz: 0.0, bw: None })]));
        }
    }
    out
}

fn check(issue: u32, seed: u64, invariant: &str) {
    let t = crate::tally::Tally::default();
    match nightly_case(issue) {
        (Some(c), _) => {
            let anas: Vec<_> = crate::ana2::rows().into_iter().filter(|a| a.name == "harmonic").collect();
            for rng_seed in seed..seed + 16 {
                crate::checks2::check_case(&crate::checks2::Ctx { tally: &t, rng_seed }, &c, &anas, &[invariant]);
            }
            assert_cell_holds(issue, &t, invariant);
            let (a, b) = halves(&c.s.loads);
            for (what, loads) in [("A", a), ("B", b), ("A+B", c.s.loads.clone())] {
                assert_rows_match_direct(issue, what, &direct_rows_2d(&c.with_loads(loads)));
            }
        }
        (None, Some(c)) => {
            let anas: Vec<_> = crate::ana3::rows().into_iter().filter(|a| a.name == "harmonic").collect();
            for rng_seed in seed..seed + 16 {
                crate::checks3::check_case(&crate::checks3::Ctx { tally: &t, rng_seed }, &c, &anas, &[invariant]);
            }
            assert_cell_holds(issue, &t, invariant);
            let sets = if c.s.loads.is_empty() {
                unit_loads_3d(&c)
            } else {
                let (a, b) = halves(&c.s.loads);
                vec![("A".to_string(), a), ("B".to_string(), b), ("A+B".to_string(), c.s.loads.clone())]
            };
            for (what, loads) in sets {
                assert_rows_match_direct(issue, &what, &direct_rows_3d(&c.with_loads(loads)));
            }
        }
        (None, None) => unreachable!(),
    }
}

fn assert_cell_holds(issue: u32, t: &crate::tally::Tally, invariant: &str) {
    let cells = t.cells.lock().unwrap();
    let cell = cells.get(&("harmonic".to_string(), invariant.to_string())).unwrap_or_else(|| panic!("#{issue}: harmonic × {invariant} not run"));
    assert!(cell.fails.is_empty(), "#{issue}: harmonic × {invariant}: {:?}", cell.fails);
    assert!(cell.pass > 0, "#{issue}: harmonic × {invariant} did not complete: {cell:?}");
}

#[test]
fn issue_1537_harmonic_superposition_2d_frame() {
    check(1537, 20763, "superposition");
}

#[test]
fn issue_1538_harmonic_reciprocity_3d_cantilever() {
    check(1538, 2026110602647, "reciprocity");
}

#[test]
fn issue_1539_harmonic_reciprocity_3d_cantilever() {
    check(1539, 2026110607457, "reciprocity");
}

#[test]
fn issue_1540_harmonic_superposition_3d_cantilever() {
    check(1540, 2026110607353, "superposition");
}

#[test]
fn issue_1541_harmonic_reciprocity_3d_frame() {
    check(1541, 2026110607389, "reciprocity");
}
