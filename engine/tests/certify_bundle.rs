//! Certificate bundles (docs/verification/CERTIFY.md, "Independent checking:
//! certificate bundles"): export linear-static, plastic-collapse and
//! load-combination bundles for fixture models into `target/cert-bundles/` for
//! `verify/scripts/check-bundles.sh` (`lake exe certcheck`), each with the canonical
//! solver input it was made from (`<name>.input.json`, whose SHA-256 the bundle
//! records), plus negative samples: tampered copies whose claims are false
//! (`*.tampered-*.json`, the checker must reject them) and copies with a wrong input
//! hash (`*.wronghash.json`, the script must flag them).

use crate::common;

use common::*;
use dedaliano_engine::certify::bundle::{export_linear_bundle_3d, from_dyadic, to_dyadic, LinearBundle};
use dedaliano_engine::certify::combination_bundle::{export_combination_bundle_2d, export_combination_bundle_3d, CombinationBundle};
use dedaliano_engine::certify::exact::{qr, Q};
use dedaliano_engine::certify::plastic_bundle::{export_plastic_bundle_2d, export_plastic_bundle_3d, parse_q, qs, PlasticBundle};
use dedaliano_engine::certify::provenance::{canonical_json, sha256_hex, Provenance};
use dedaliano_engine::solver::load_cases::{CombinationDef, LoadCase, LoadCase3D, MultiCaseInput, MultiCaseInput3D};
use dedaliano_engine::types::*;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Instant;

const FIXTURES: [&str; 3] = ["ex-3d-portal-frame", "ex-3d-tower", "ex-3d-nave-industrial"];

fn out_dir() -> PathBuf {
    let target = std::env::var_os("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../target")));
    let d = target.join("cert-bundles");
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn load(name: &str) -> SolverInput3D {
    let p = format!("{}/tests/fixtures/{name}-input.json", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap()
}

fn write(dir: &PathBuf, name: &str, b: &LinearBundle) {
    std::fs::write(dir.join(format!("{name}.json")), b.to_json()).unwrap();
}

/// Write the canonical input next to the bundle and check the bundle's hash of it.
fn write_input<T: Serialize>(dir: &Path, name: &str, input: &T, prov: &Provenance) {
    let text = canonical_json(input).unwrap();
    assert_eq!(sha256_hex(text.as_bytes()), prov.input_sha256, "{name}: provenance hash");
    assert_eq!(prov.engine_version, env!("CARGO_PKG_VERSION"));
    assert!(!prov.engine_commit.is_empty() && !prov.kinds.is_empty());
    std::fs::write(dir.join(format!("{name}.input.json")), text).unwrap();
}

/// A provenance whose hash is not that of the shipped input.
fn wrong_hash(p: &Provenance) -> Provenance {
    Provenance { input_sha256: sha256_hex(b"not the input"), ..p.clone() }
}

/// Tampered copies whose claims are false (or, for the bound, far tighter than the
/// residual allows): `certcheck` must reject every one of them.
fn write_tampered(dir: &PathBuf, name: &str, b: &LinearBundle) {
    let bound = from_dyadic(b.bound).unwrap();

    // Bound shrunk 1024×: ρ² > (b μ)² for any realistic residual.
    let mut t = b.clone();
    t.bound = to_dyadic(bound / 1024.0).unwrap();
    write(dir, &format!("{name}.tampered-bound"), &t);

    // ũ moved by 4b in one component, bound kept: ‖u* − ũ'‖ ≥ 4b − b > b, so the
    // claim is false and a sound checker must reject it.
    let mut t = b.clone();
    let u: Vec<f64> = b.u.iter().map(|&d| from_dyadic(d).unwrap()).collect();
    let k = (0..u.len()).max_by(|&i, &j| u[i].abs().total_cmp(&u[j].abs())).unwrap();
    let moved = u[k] + 4.0 * bound;
    assert!((moved - u[k]).abs() >= 3.9 * bound, "{name}: perturbation lost to rounding");
    t.u[k] = to_dyadic(moved).unwrap();
    write(dir, &format!("{name}.tampered-u"), &t);

    // μ = 2·min Kᵢᵢ > λ_min(K) (Rayleigh quotient of eᵢ): claim false.
    let mut t = b.clone();
    let mut dmin = f64::INFINITY;
    for j in 0..b.n {
        for p in b.k.col_ptr[j]..b.k.col_ptr[j + 1] {
            if b.k.row_idx[p] == j {
                dmin = dmin.min(from_dyadic(b.k.values[p]).unwrap());
            }
        }
    }
    t.mu = to_dyadic(2.0 * dmin).unwrap();
    write(dir, &format!("{name}.tampered-mu"), &t);
}

#[test]
fn export_bundles() {
    let dir = out_dir();
    for name in FIXTURES {
        let input = load(name);
        let t = Instant::now();
        let b = export_linear_bundle_3d(&input).unwrap_or_else(|e| panic!("{name}: {e}"));
        let json = b.to_json();
        // Exact data must round-trip bit for bit (`info` is display-only f64 text).
        let mut back = LinearBundle::from_json(&json).unwrap();
        back.info = b.info.clone();
        assert_eq!(back, b, "{name}: JSON round trip");
        eprintln!(
            "{name}: n={} nnz(K)={} nnz(L)={} μ={:.3e} bound={:.3e} rel={:.2e} {} bytes, {:.0} ms",
            b.n,
            b.k.values.len(),
            b.l.values.len(),
            b.info.mu,
            b.info.bound,
            b.info.rel_bound,
            json.len(),
            t.elapsed().as_secs_f64() * 1e3
        );
        std::fs::write(dir.join(format!("{name}.json")), json).unwrap();
        let prov = b.provenance.as_ref().expect("provenance");
        write_input(&dir, name, &input, prov);
        write_tampered(&dir, name, &b);
        if name == FIXTURES[0] {
            let mut w = b.clone();
            w.provenance = Some(wrong_hash(prov));
            write(&dir, &format!("{name}.wronghash"), &w);
        }
    }
    eprintln!("bundles written to {}", dir.display());
}

// ───────────────────────────── plastic collapse ─────────────────────────────

const E: f64 = 200_000.0;
const MP: f64 = 843.75;

fn plastic_2d(solver: SolverInput) -> PlasticInput {
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), PlasticSectionData { a: 0.045, iz: 3.375e-4, material_id: 1, b: Some(0.15), h: Some(0.3) });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), PlasticMaterialData { fy: Some(250.0) });
    PlasticInput { solver, sections, materials, max_hinges: Some(20), mp_overrides: Some(HashMap::from([("1".to_string(), MP)])) }
}

/// Portal frame, columns 1-2, 4-5 (h = 4), beam 2-3-4 (w = 6), fixed bases, sway
/// load at 2 and vertical load at 3: λ_c = 6 Mp / (H h + V w/2) = 6 Mp / 7.
fn plastic_portal_2d() -> PlasticInput {
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, 4.0), (3, 3.0, 4.0), (4, 6.0, 4.0), (5, 6.0, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 1.0, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -1.0, my: 0.0 }),
    ];
    plastic_2d(make_input(nodes, vec![(1, E, 0.3)], vec![(1, 0.045, 3.375e-4)], elems, vec![(1, 1, "fixed"), (2, 5, "fixed")], loads))
}

/// Two-span continuous beam with a UDL on one span and a point load on the other:
/// hinges inside the members (the load pieces).
fn plastic_continuous_2d() -> PlasticInput {
    let nodes = vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 10.0, 0.0)];
    let elems = vec![(1, "frame", 1, 2, 1, 1, false, false), (2, "frame", 2, 3, 1, 1, false, false)];
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i: -2.0, q_j: -2.0, a: None, b: None }),
        SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: 2, a: 1.0, p: -5.0, px: None, my: None }),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "rollerX"), (3, 3, "pinned")];
    plastic_2d(make_input(nodes, vec![(1, E, 0.3)], vec![(1, 0.045, 3.375e-4)], elems, sups, loads))
}

const FIXED6: [bool; 6] = [true; 6];

fn plastic_3d(solver: SolverInput3D, mpy: f64, mpz: f64) -> PlasticInput3D {
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), PlasticSectionData3D { a: 1e-3, iy: 8e-6, iz: 4e-6, material_id: 1, b: None, h: None, d: None });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), PlasticMaterialData { fy: Some(250.0) });
    PlasticInput3D { solver, sections, materials, max_hinges: Some(60), mp_overrides: Some(HashMap::from([("1".to_string(), [mpy, mpz])])) }
}

fn frame_3d(nodes: Vec<(usize, f64, f64, f64)>, elems: Vec<(usize, usize, usize)>, sups: Vec<(usize, [bool; 6])>, loads: Vec<SolverLoad3D>) -> SolverInput3D {
    make_3d_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, 1e-3, 8e-6, 4e-6, 1e-5)],
        elems.into_iter().map(|(id, i, j)| (id, "frame", i, j, 1, 1)).collect(),
        sups.into_iter().map(|(n, d)| (n, d.to_vec())).collect(),
        loads,
    )
}

fn nodal_3d(n: usize, f: [f64; 6]) -> SolverLoad3D {
    SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: n, fx: f[0], fy: f[1], fz: f[2], mx: f[3], my: f[4], mz: f[5], bw: None })
}

/// Space portal (columns 1-2, 4-3 of height 3, beam 2-3 of span 4) under sway in
/// both directions and a vertical point load on the beam: biaxial hinges.
fn plastic_portal_3d() -> PlasticInput3D {
    let mut s = frame_3d(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, 3.0), (3, 4.0, 0.0, 3.0), (4, 4.0, 0.0, 0.0)],
        vec![(1, 1, 2), (2, 2, 3), (3, 4, 3)],
        vec![(1, FIXED6), (4, FIXED6)],
        vec![nodal_3d(2, [1.0, 1.0, 0.0, 0.0, 0.0, 0.0])],
    );
    s.loads.push(SolverLoad3D::PointOnElement(SolverPointLoad3D { element_id: 2, a: 2.0, py: 0.0, pz: -1.0 }));
    plastic_3d(s, 100.0, 50.0)
}

/// Cantilever with a skew tip force: one biaxial hinge, λ_c = 8.
fn plastic_cantilever_3d() -> PlasticInput3D {
    let s = frame_3d(vec![(1, 0.0, 0.0, 0.0), (2, 3.0, 0.0, 0.0)], vec![(1, 1, 2)], vec![(1, FIXED6)], vec![nodal_3d(2, [0.0, -1.0, -1.0, 0.0, 0.0, 0.0])]);
    plastic_3d(s, 30.0, 40.0)
}

fn write_plastic(dir: &Path, name: &str, b: &PlasticBundle) {
    std::fs::write(dir.join(format!("{name}.json")), b.to_json()).unwrap();
}

fn scale_q(s: &str, k: &Q) -> String {
    qs(&(parse_q(s).unwrap() * k))
}

/// Tampered plastic bundles whose claims are false or whose certificates are broken.
fn write_tampered_plastic(dir: &Path, name: &str, b: &PlasticBundle) {
    // static field and λ scaled by 3/2: equilibrium still holds, the yield test fails
    // (and 1.5 λ_lo > λ_up ≥ λ_c, so the claim is false)
    let mut t = b.clone();
    let k = qr(3, 2);
    t.static_cert.lambda = scale_q(&b.static_cert.lambda, &k);
    t.static_cert.x = b.static_cert.x.iter().map(|v| scale_q(v, &k)).collect();
    write_plastic(dir, &format!("{name}.tampered-lower"), &t);
    // λ_up halved: below λ_lo ≤ λ_c
    let mut t = b.clone();
    t.kinematic.lambda = scale_q(&b.kinematic.lambda, &qr(1, 2));
    write_plastic(dir, &format!("{name}.tampered-upper"), &t);
    // the plastic moment's lower end halved: the claim (for all Mp ∈ [lo/2, hi]) is false
    let mut t = b.clone();
    for c in &mut t.members[0].comps {
        c.mp_lo = scale_q(&c.mp_lo, &qr(1, 2));
    }
    write_plastic(dir, &format!("{name}.tampered-mp"), &t);
    // a hinge rotation changed: the virtual-work identity fails
    let mut t = b.clone();
    let h = &mut t.kinematic.hinges[0];
    h.theta[0] = scale_q(&h.theta[0], &qr(2, 1));
    if parse_q(&h.theta[0]).unwrap() == Q::from_integer(0.into()) {
        h.theta[0] = "1".into();
    }
    write_plastic(dir, &format!("{name}.tampered-hinge"), &t);
}

fn export_plastic<T: Serialize>(dir: &Path, name: &str, input: &T, b: PlasticBundle) {
    let json = b.to_json();
    assert_eq!(PlasticBundle::from_json(&json).unwrap(), b, "{name}: JSON round trip");
    eprintln!(
        "{name}: λ_c ∈ [{:.12}, {:.12}], {} rows, {} yield members, {} hinges, {} bytes",
        b.info.lambda_lower,
        b.info.lambda_upper,
        b.rows.len(),
        b.members.len(),
        b.kinematic.hinges.len(),
        json.len()
    );
    std::fs::write(dir.join(format!("{name}.json")), json).unwrap();
    write_input(dir, name, input, &b.provenance);
    write_tampered_plastic(dir, name, &b);
}

#[test]
fn export_plastic_bundles() {
    let dir = out_dir();
    for input in [plastic_portal_2d(), plastic_continuous_2d()] {
        crate::common::assert_containment(export_plastic_bundle_2d(&input), "PL-2D-INVARIANCE");
    }

    let input = plastic_cantilever_3d();
    let b = export_plastic_bundle_3d(&input).unwrap();
    let results = dedaliano_engine::solver::plastic::solve_plastic_3d(&input).unwrap();
    let diagnostics: Vec<_> = results.structured_diagnostics.iter().map(|d| serde_json::to_value(d).unwrap()).collect();
    assert!(!diagnostics.is_empty(), "the solved increments carry diagnostics");
    assert_eq!(b.structured_diagnostics, diagnostics);

    assert!(b.info.lambda_lower <= 8.0 && 8.0 <= b.info.lambda_upper && b.info.lambda_upper - b.info.lambda_lower < 1e-6, "{:?}", b.info);
    export_plastic(&dir, "plastic-3d-cantilever", &input, b);

    let input = plastic_portal_3d();
    export_plastic(&dir, "plastic-3d-portal", &input, export_plastic_bundle_3d(&input).unwrap());
}

// ───────────────────────────── combinations ─────────────────────────────

fn fixture_text(name: &str) -> String {
    std::fs::read_to_string(format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"))).unwrap()
}

fn meta_combinations(meta: &str, case_names: &[String]) -> Vec<CombinationDef> {
    let v: serde_json::Value = serde_json::from_str(&fixture_text(meta)).unwrap();
    v["combinations"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| CombinationDef {
            name: c["name"].as_str().unwrap().to_string(),
            factors: c["factors"]
                .as_array()
                .unwrap()
                .iter()
                .map(|f| (case_names[f["caseId"].as_u64().unwrap() as usize - 1].clone(), f["factor"].as_f64().unwrap()))
                .collect(),
        })
        .collect()
}

fn multi_case_2d(prefix: &str, n: usize) -> MultiCaseInput {
    let names: Vec<String> = (1..=n).map(|i| format!("case{i}")).collect();
    let inputs: Vec<SolverInput> =
        (1..=n).map(|i| serde_json::from_str(&fixture_text(&format!("{prefix}-case{i}-input.json"))).unwrap()).collect();
    let mut solver = inputs[0].clone();
    solver.loads = vec![];
    let mut combinations = meta_combinations(&format!("{prefix}-meta.json"), &names);
    combinations.push(CombinationDef {
        name: "0.9 case1 - 1.6 case2".into(),
        factors: [("case1".to_string(), 0.9), ("case2".to_string(), -1.6)].into_iter().collect(),
    });
    MultiCaseInput {
        solver,
        load_cases: names.iter().zip(&inputs).map(|(n, i)| LoadCase { name: n.clone(), loads: i.loads.clone() }).collect(),
        combinations,
    }
}

fn multi_case_3d() -> MultiCaseInput3D {
    let names: Vec<String> = (1..=4).map(|i| format!("case{i}")).collect();
    let inputs: Vec<SolverInput3D> =
        (1..=4).map(|i| serde_json::from_str(&fixture_text(&format!("ex-3d-building-case{i}-input.json"))).unwrap()).collect();
    let mut solver = inputs[0].clone();
    solver.loads = vec![];
    MultiCaseInput3D {
        solver,
        load_cases: names.iter().zip(&inputs).map(|(n, i)| LoadCase3D { name: n.clone(), loads: i.loads.clone() }).collect(),
        combinations: meta_combinations("ex-3d-building-meta.json", &names),
    }
}

fn write_combo(dir: &Path, name: &str, b: &CombinationBundle) {
    std::fs::write(dir.join(format!("{name}.json")), b.to_json()).unwrap();
}

/// Tampered combination bundles whose claims are false.
fn write_tampered_combo(dir: &Path, name: &str, b: &CombinationBundle) {
    // a combination bound shrunk 1024× (below the rounding term or the case terms)
    let mut t = b.clone();
    let bound = from_dyadic(b.combos[0].bound).unwrap();
    t.combos[0].bound = to_dyadic(bound / 1024.0).unwrap();
    write_combo(dir, &format!("{name}.tampered-combo-bound"), &t);
    // a combination's ũ moved by 4B in one component: ‖Σcᵢu*ᵢ − ũ'‖ > B
    let mut t = b.clone();
    let u: Vec<f64> = b.combos[0].u.iter().map(|&d| from_dyadic(d).unwrap()).collect();
    let k = (0..u.len()).max_by(|&i, &j| u[i].abs().total_cmp(&u[j].abs())).unwrap();
    t.combos[0].u[k] = to_dyadic(u[k] + 4.0 * bound).unwrap();
    write_combo(dir, &format!("{name}.tampered-combo-u"), &t);
    // an envelope value doubled (at the DOF with the largest value)
    let mut t = b.clone();
    let env: Vec<f64> = b.envelope.max_abs.iter().map(|&d| from_dyadic(d).unwrap()).collect();
    let k = (0..env.len()).max_by(|&i, &j| env[i].total_cmp(&env[j])).unwrap();
    t.envelope.max_abs[k] = to_dyadic(2.0 * env[k]).unwrap();
    write_combo(dir, &format!("{name}.tampered-envelope"), &t);
    // an end-force combination bound shrunk 1024× (the largest one)
    let mut t = b.clone();
    let qb: Vec<f64> = b.quantities.combo_bounds[0].iter().map(|&d| from_dyadic(d).unwrap()).collect();
    let q = (0..qb.len()).max_by(|&i, &j| qb[i].total_cmp(&qb[j])).unwrap();
    t.quantities.combo_bounds[0][q] = to_dyadic(qb[q] / 1024.0).unwrap();
    write_combo(dir, &format!("{name}.tampered-force-bound"), &t);
}

fn export_combo<T: Serialize>(dir: &Path, name: &str, input: &T, b: CombinationBundle) {
    let json = b.to_json();
    let mut back = CombinationBundle::from_json(&json).unwrap();
    back.info = b.info.clone();
    assert_eq!(back, b, "{name}: JSON round trip");
    eprintln!(
        "{name}: n={} cases={} combos={} quantities={} envelope bound={:.3e} {} bytes",
        b.n,
        b.cases.len(),
        b.combos.len(),
        b.quantities.labels.len(),
        b.info.envelope_bound,
        json.len()
    );
    std::fs::write(dir.join(format!("{name}.json")), json).unwrap();
    write_input(dir, name, input, &b.provenance);
    write_tampered_combo(dir, name, &b);
}

#[test]
fn export_combination_bundles() {
    let dir = out_dir();
    let input = multi_case_2d("ex-frame-cirsoc-dl", 2);
    let b = export_combination_bundle_2d(&input).unwrap();
    let mut w = b.clone();
    w.provenance = wrong_hash(&b.provenance);
    write_combo(&dir, "combo-2d-frame.wronghash", &w);
    export_combo(&dir, "combo-2d-frame", &input, b);

    let input = multi_case_2d("ex-building-3story-dlw", 3);
    export_combo(&dir, "combo-2d-building", &input, export_combination_bundle_2d(&input).unwrap());

    let input = multi_case_3d();
    export_combo(&dir, "combo-3d-building", &input, export_combination_bundle_3d(&input).unwrap());
}


/// Rigid-jointed 3D frame building: an nx×ny bay grid (5 m) with nz stories (3 m),
/// fixed bases, nodal lateral and gravity loads. 6 DOFs per free node.
fn make_frame_building(nx: usize, ny: usize, nz: usize) -> SolverInput3D {
    let id = |i: usize, j: usize, k: usize| (k * (ny + 1) + j) * (nx + 1) + i + 1;
    let (mut nodes, mut elements, mut supports, mut loads) = (vec![], vec![], vec![], vec![]);
    let mut add_elem = |a: usize, b: usize, sec: usize| {
        let e = elements.len() + 1;
        elements.push(serde_json::json!({"id": e, "type": "frame", "nodeI": a, "nodeJ": b, "materialId": 1, "sectionId": sec}));
    };
    for k in 0..=nz {
        for j in 0..=ny {
            for i in 0..=nx {
                let n = id(i, j, k);
                nodes.push(serde_json::json!({"id": n, "x": 5.0 * i as f64, "y": 5.0 * j as f64, "z": 3.0 * k as f64}));
                if k == 0 {
                    supports.push(serde_json::json!({"nodeId": n, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}));
                    continue;
                }
                add_elem(id(i, j, k - 1), n, 1);
                if i > 0 {
                    add_elem(id(i - 1, j, k), n, 2);
                }
                if j > 0 {
                    add_elem(id(i, j - 1, k), n, 2);
                }
                let (fx, fz) = (if i == 0 { 2.0 } else { 0.0 }, -10.0 - (i + 2 * j) as f64 * 0.1);
                loads.push(serde_json::json!({"type": "nodal", "data": {"nodeId": n, "fx": fx, "fy": 0.5, "fz": fz, "mx": 0, "my": 0, "mz": 0}}));
            }
        }
    }
    let keyed = |v: Vec<serde_json::Value>, key: &str| -> serde_json::Value {
        v.into_iter().map(|x| (x[key].to_string(), x)).collect::<serde_json::Map<_, _>>().into()
    };
    let input = serde_json::json!({
        "nodes": keyed(nodes, "id"),
        "materials": {"1": {"id": 1, "e": 200000, "nu": 0.3}},
        "sections": {
            "1": {"id": 1, "name": "column", "a": 0.02, "iy": 2e-4, "iz": 1.5e-4, "j": 1e-4},
            "2": {"id": 2, "name": "beam", "a": 0.012, "iy": 1.2e-4, "iz": 4e-5, "j": 3e-5}
        },
        "elements": keyed(elements, "id"),
        "supports": keyed(supports, "nodeId"),
        "loads": loads,
    });
    serde_json::from_value(input).expect("valid SolverInput3D")
}

/// Timing case (a few thousand DOFs), written to `target/cert-bundles-large/`:
/// `cargo test --release --test certificates certify_bundle:: -- --ignored`, then
/// `lake exe certcheck ../target/cert-bundles-large/*.json`.
#[test]
#[ignore]
fn export_large_bundles() {
    let dir = out_dir().with_file_name("cert-bundles-large");
    std::fs::create_dir_all(&dir).unwrap();
    for (nx, ny, nz) in [(6, 6, 8), (8, 8, 12)] {
        let name = format!("frame-{nx}x{ny}x{nz}");
        let t = Instant::now();
        let b = export_linear_bundle_3d(&make_frame_building(nx, ny, nz)).unwrap_or_else(|e| panic!("{name}: {e}"));
        let json = b.to_json();
        eprintln!(
            "{name}: n={} nnz(K)={} nnz(L)={} μ={:.3e} bound={:.3e} rel={:.2e} {} bytes, {:.0} ms",
            b.n,
            b.k.values.len(),
            b.l.values.len(),
            b.info.mu,
            b.info.bound,
            b.info.rel_bound,
            json.len(),
            t.elapsed().as_secs_f64() * 1e3
        );
        std::fs::write(dir.join(format!("{name}.json")), json).unwrap();
    }
}

/// 2D beam of `n` elements, pinned with a settlement at node 1, a settled
/// roller mid-length, a plain roller at the end.
fn settled_beam_2d(n: usize) -> SolverInput {
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    for i in 0..=n {
        nodes.insert((i + 1).to_string(), serde_json::json!({ "id": i + 1, "x": 12.0 * i as f64 / n as f64, "z": 0.0 }));
        if i < n {
            elements.insert((i + 1).to_string(), serde_json::json!({
                "id": i + 1, "type": "frame", "nodeI": i + 1, "nodeJ": i + 2, "materialId": 1, "sectionId": 1
            }));
        }
    }
    serde_json::from_value(serde_json::json!({
        "nodes": nodes, "elements": elements,
        "materials": { "1": { "id": 1, "e": 200000.0, "nu": 0.3 } },
        "sections": { "1": { "id": 1, "a": 0.01, "iz": 1e-4 } },
        "supports": {
            "1": { "id": 1, "nodeId": 1, "type": "pinned", "dx": 0.002, "dz": -0.01 },
            "2": { "id": 2, "nodeId": n / 2 + 1, "type": "rollerX", "dz": -0.005 },
            "3": { "id": 3, "nodeId": n + 1, "type": "rollerX" }
        },
        "loads": [{ "type": "nodal", "data": { "nodeId": n / 4 + 1, "fx": 0.0, "fz": -20.0, "my": 0.0 } }]
    }))
    .unwrap()
}

/// 2D bundles export for small and large models with settlements, and the
/// bound is tight (the restrained columns enter fLo/fHi). Inclined supports
/// and constraints are refused. (Mutants in reduced_sparse_2d and
/// reduce_rhs_sparse survived without a 2D bundle test.)
#[test]
fn export_bundles_2d_with_settlements() {
    use dedaliano_engine::certify::bundle::export_linear_bundle_2d;
    for n in [6, 40] {
        let b = export_linear_bundle_2d(&settled_beam_2d(n)).unwrap_or_else(|e| panic!("{n} elements: {e}"));
        assert_eq!(b.n, 3 * (n + 1) - 4, "{n} elements: free DOFs");
        assert!(b.info.rel_bound < 1e-8, "{n} elements: relative bound {} is not tight", b.info.rel_bound);
        assert!(b.f_lo.iter().zip(&b.f_hi).any(|(lo, hi)| from_dyadic(*lo).unwrap() != 0.0 || from_dyadic(*hi).unwrap() != 0.0));
    }
    let mut inclined = settled_beam_2d(6);
    let s = inclined.supports.get_mut("3").unwrap();
    (s.support_type, s.angle) = ("inclinedRoller".into(), Some(0.3));
    assert!(export_linear_bundle_2d(&inclined).unwrap_err().contains("inclined"));
}
