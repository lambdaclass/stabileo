//! #407 (FR-4): frame and truss thermal loads take the material's α and the section's real
//! depth from the load (`alpha`, `depth` in 2D, `depthY`/`depthZ` in 3D). Before, every member
//! was solved with α = 12·10⁻⁶ /°C and h = √(12·I/A), so an aluminium member carried about half
//! its restrained thermal force and an IPE's gradient moment came out 30 % low.
//!
//! Hand values: a fixed–fixed member stays straight under a uniform ΔT and a linear gradient, so
//! its force is the fixed-end one: N = E·A·α·ΔT and M = E·I·α·ΔT_g / h.

use dedaliano_engine::certify::reassembly::{end_to_end_2d, end_to_end_3d, EndToEnd};
use dedaliano_engine::solver::corotational::solve_corotational_2d;
use dedaliano_engine::solver::linear::{prepare_static_2d, solve_2d, solve_3d};
use dedaliano_engine::solver::pdelta::{solve_pdelta_2d, solve_pdelta_3d};
use dedaliano_engine::types::*;
use serde_json::{json, Value};

const STEEL: f64 = 200_000.0; // MPa
const ALU: f64 = 70_000.0; // MPa
const ALPHA_ALU: f64 = 23e-6;

// IPE 300: A, strong-axis I, weak-axis I, depth, flange width.
const IPE_A: f64 = 53.8e-4;
const IPE_I_STRONG: f64 = 8356e-8;
const IPE_I_WEAK: f64 = 603.8e-8;
const IPE_H: f64 = 0.300;
const IPE_B: f64 = 0.150;

fn close(what: &str, a: f64, b: f64, rel: f64) {
    let scale = a.abs().max(b.abs()).max(1e-30);
    assert!((a - b).abs() <= rel * scale, "{what}: {a} vs {b}");
}

/// A 2D member from (0,0) to (`n`·`l`/n, 0), split in `n`, fixed at both ends.
fn fixed_2d(n: usize, l: f64, e: f64, a: f64, iz: f64, kind: &str, thermal: Value) -> SolverInput {
    let nodes: serde_json::Map<String, Value> =
        (1..=n + 1).map(|k| (k.to_string(), json!({"id": k, "x": l * (k - 1) as f64 / n as f64, "z": 0.0}))).collect();
    let elements: serde_json::Map<String, Value> = (1..=n)
        .map(|k| (k.to_string(), json!({"id": k, "type": kind, "nodeI": k, "nodeJ": k + 1, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false})))
        .collect();
    let support = if kind == "truss" { "pinned" } else { "fixed" };
    let loads: Vec<Value> = (1..=n)
        .map(|k| {
            let mut d = thermal.clone();
            d["elementId"] = json!(k);
            json!({"type": "thermal", "data": d})
        })
        .collect();
    serde_json::from_value(json!({
        "nodes": nodes,
        "materials": {"1": {"id": 1, "e": e, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": a, "iz": iz}},
        "elements": elements,
        "supports": {"1": {"id": 1, "nodeId": 1, "type": support}, "2": {"id": 2, "nodeId": n + 1, "type": support}},
        "loads": loads,
    }))
    .unwrap()
}

/// A 3D member along global X in two halves (a truss: one bar), fixed at both ends.
fn fixed_3d(e: f64, a: f64, iy: f64, iz: f64, kind: &str, thermal: Value) -> SolverInput3D {
    let fixed = |node: usize| json!({"nodeId": node, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true});
    let n = if kind == "truss" { 1 } else { 2 };
    let nodes: serde_json::Map<String, Value> =
        (1..=n + 1).map(|k| (k.to_string(), json!({"id": k, "x": 5.0 * (k - 1) as f64 / n as f64, "y": 0.0, "z": 0.0}))).collect();
    let elements: serde_json::Map<String, Value> = (1..=n)
        .map(|k| (k.to_string(), json!({"id": k, "type": kind, "nodeI": k, "nodeJ": k + 1, "materialId": 1, "sectionId": 1})))
        .collect();
    let loads: Vec<Value> = (1..=n)
        .map(|k| {
            let mut d = thermal.clone();
            d["elementId"] = json!(k);
            json!({"type": "thermal", "data": d})
        })
        .collect();
    serde_json::from_value(json!({
        "nodes": nodes,
        "materials": {"1": {"id": 1, "e": e, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": a, "iy": iy, "iz": iz, "j": 1e-6}},
        "elements": elements,
        "supports": {"1": fixed(1), "2": fixed(n + 1)},
        "loads": loads,
    }))
    .unwrap()
}

fn assumed(d: &[StructuredDiagnostic]) -> Vec<String> {
    d.iter().filter(|x| x.code == DiagnosticCode::ThermalDefaultAssumed).map(|x| x.phase.clone().unwrap_or_default()).collect()
}

// ─── Uniform ΔT: N = E·A·α·ΔT with the material's α ─────────────────────────────

#[test]
fn restrained_aluminium_bar_carries_e_a_alpha_dt_with_its_own_alpha() {
    let a = 0.005;
    for kind in ["frame", "truss"] {
        let r = solve_2d(&fixed_2d(1, 5.0, ALU, a, 1e-5, kind, json!({"dtUniform": 30.0, "dtGradient": 0.0, "alpha": ALPHA_ALU}))).unwrap();
        let n = r.element_forces[0].n_start;
        // 70 GPa · 0.005 m² · 23e-6 · 30 = 241.5 kN of compression (it was 126 kN with 12e-6).
        close(&format!("{kind} N"), n.abs(), ALU * 1000.0 * a * ALPHA_ALU * 30.0, 1e-9);
        close(&format!("{kind} N"), n.abs(), 241.5, 1e-9);
        assert!(assumed(&r.structured_diagnostics).is_empty(), "{kind}: α stated, nothing assumed");
    }
    for kind in ["frame", "truss"] {
        let r = solve_3d(&fixed_3d(ALU, a, 1e-5, 1e-5, kind, json!({"dtUniform": 30.0, "dtGradientY": 0.0, "dtGradientZ": 0.0, "alpha": ALPHA_ALU}))).unwrap();
        close(&format!("3D {kind} N"), r.element_forces[0].n_start.abs(), 241.5, 1e-9);
        assert!(assumed(&r.structured_diagnostics).is_empty());
    }
}

#[test]
fn omitted_alpha_keeps_the_old_value_and_says_so() {
    let a = 0.005;
    let r = solve_2d(&fixed_2d(1, 5.0, ALU, a, 1e-5, "frame", json!({"dtUniform": 30.0, "dtGradient": 0.0}))).unwrap();
    close("N", r.element_forces[0].n_start.abs(), ALU * 1000.0 * a * 12e-6 * 30.0, 1e-12);
    assert_eq!(assumed(&r.structured_diagnostics), vec!["alpha".to_string()], "no depth warning without a gradient");
    let d = r.structured_diagnostics.iter().find(|x| x.code == DiagnosticCode::ThermalDefaultAssumed).unwrap();
    assert_eq!((d.severity, d.element_ids.clone()), (Severity::Warning, vec![1]));
    let r = solve_3d(&fixed_3d(ALU, a, 1e-5, 1e-5, "truss", json!({"dtUniform": 30.0, "dtGradientY": 0.0, "dtGradientZ": 0.0}))).unwrap();
    close("3D N", r.element_forces[0].n_start.abs(), 126.0, 1e-12);
    assert_eq!(assumed(&r.structured_diagnostics), vec!["alpha".to_string()]);
}

// ─── Gradient: M = E·I·α·ΔT_g / h with the section's real depth ─────────────────────

#[test]
fn steel_ipe_gradient_uses_its_real_depth() {
    let given = json!({"dtUniform": 0.0, "dtGradient": 20.0, "alpha": 12e-6, "depth": IPE_H});
    let r = solve_2d(&fixed_2d(1, 6.0, STEEL, IPE_A, IPE_I_STRONG, "frame", given)).unwrap();
    // 200 GPa · 8356 cm⁴ · 12e-6 · 20 / 0.300 m = 13.370 kN·m.
    let m = STEEL * 1000.0 * IPE_I_STRONG * 12e-6 * 20.0 / IPE_H;
    close("M", r.element_forces[0].m_start.abs(), m, 1e-9);
    close("M", m, 13.3696, 1e-5);
    close("M constant", r.element_forces[0].m_end.abs(), m, 1e-9);
    assert!(assumed(&r.structured_diagnostics).is_empty());

    // Without the depth: √(12·I/A) = 0.4317 m, the moment 30.5 % low, and a warning.
    let omitted = json!({"dtUniform": 0.0, "dtGradient": 20.0, "alpha": 12e-6});
    let r = solve_2d(&fixed_2d(1, 6.0, STEEL, IPE_A, IPE_I_STRONG, "frame", omitted)).unwrap();
    let h_eq = (12.0 * IPE_I_STRONG / IPE_A).sqrt();
    close("h_eq", h_eq, 0.43172, 1e-4);
    close("M fallback", r.element_forces[0].m_start.abs(), STEEL * 1000.0 * IPE_I_STRONG * 12e-6 * 20.0 / h_eq, 1e-9);
    assert_eq!(assumed(&r.structured_diagnostics), vec!["depth".to_string()]);
}

#[test]
fn aluminium_member_gradient_uses_both_alpha_and_depth() {
    // A 100×100×5 aluminium square tube: A = 19.0 cm², I = 285.9 cm⁴, depth 0.100 m.
    let (a, i, h) = (19.0e-4, 285.9e-8, 0.100);
    let r = solve_2d(&fixed_2d(1, 4.0, ALU, a, i, "frame", json!({"dtUniform": 0.0, "dtGradient": 25.0, "alpha": ALPHA_ALU, "depth": h}))).unwrap();
    let m = ALU * 1000.0 * i * ALPHA_ALU * 25.0 / h;
    close("M", r.element_forces[0].m_start.abs(), m, 1e-9);
    close("M", m, 1.15075, 1e-4);
}

#[test]
fn space_gradients_use_their_own_depths() {
    // IPE 300 along X: strong axis bent by the z gradient (Iy, depth 0.300), weak axis by the
    // y gradient (Iz, flange width 0.150).
    let t = json!({"dtUniform": 10.0, "dtGradientY": 15.0, "dtGradientZ": 20.0, "alpha": 12e-6, "depthY": IPE_B, "depthZ": IPE_H});
    let r = solve_3d(&fixed_3d(STEEL, IPE_A, IPE_I_STRONG, IPE_I_WEAK, "frame", t)).unwrap();
    let f = &r.element_forces[0];
    let e = STEEL * 1000.0;
    close("N", f.n_start.abs(), e * IPE_A * 12e-6 * 10.0, 1e-9);
    close("My", f.my_start.abs(), e * IPE_I_STRONG * 12e-6 * 20.0 / IPE_H, 1e-9);
    close("Mz", f.mz_start.abs(), e * IPE_I_WEAK * 12e-6 * 15.0 / IPE_B, 1e-9);
    assert!(assumed(&r.structured_diagnostics).is_empty());

    // One depth missing: that gradient falls back and the result says so.
    let t = json!({"dtUniform": 0.0, "dtGradientY": 15.0, "dtGradientZ": 20.0, "alpha": 12e-6, "depthZ": IPE_H});
    let r = solve_3d(&fixed_3d(STEEL, IPE_A, IPE_I_STRONG, IPE_I_WEAK, "frame", t)).unwrap();
    let hy = (12.0 * IPE_I_WEAK / IPE_A).sqrt();
    close("Mz fallback", r.element_forces[0].mz_start.abs(), e * IPE_I_WEAK * 12e-6 * 15.0 / hy, 1e-9);
    assert_eq!(assumed(&r.structured_diagnostics), vec!["depth".to_string()]);
}

// ─── The stated α and depth reach every path ──────────────────────────────────

/// α·ΔT and ΔT_g/h are what the load means: a load with (α, h) solves as one with the default
/// α and h_eq and the temperatures scaled by α/α₀ and h_eq/h — the compensation the web sent
/// before. Checked through each path that assembles thermal loads.
fn scaled_2d(n: usize, kind: &str) -> (SolverInput, SolverInput) {
    let (a, i, h) = (IPE_A, IPE_I_STRONG, IPE_H);
    let h_eq = (12.0 * i / a).sqrt();
    let k = ALPHA_ALU / 12e-6;
    let given = fixed_2d(n, 6.0, ALU, a, i, kind, json!({"dtUniform": 20.0, "dtGradient": 15.0, "alpha": ALPHA_ALU, "depth": h}));
    let scaled = fixed_2d(n, 6.0, ALU, a, i, kind, json!({"dtUniform": 20.0 * k, "dtGradient": 15.0 * k * h_eq / h}));
    (given, scaled)
}

fn same_forces(what: &str, a: &AnalysisResults, b: &AnalysisResults) {
    for (x, y) in a.element_forces.iter().zip(&b.element_forces) {
        for (p, q) in [(x.n_start, y.n_start), (x.m_start, y.m_start), (x.m_end, y.m_end), (x.v_start, y.v_start)] {
            assert!((p - q).abs() <= 1e-9 * p.abs().max(q.abs()).max(1.0), "{what} element {}: {p} vs {q}", x.element_id);
        }
    }
    for (x, y) in a.reactions.iter().zip(&b.reactions) {
        assert!((x.rx - y.rx).abs() <= 1e-9 * x.rx.abs().max(1.0) && (x.my - y.my).abs() <= 1e-9 * x.my.abs().max(1.0), "{what} reactions");
    }
}

#[test]
fn every_2d_path_honours_alpha_and_depth() {
    // Dense (1 member) and sparse (40 members, more than SPARSE_THRESHOLD free DOFs).
    for n in [1, 40] {
        let (g, s) = scaled_2d(n, "frame");
        same_forces(&format!("linear n={n}"), &solve_2d(&g).unwrap(), &solve_2d(&s).unwrap());
    }
    // A truss bar (its gradient does nothing; its α does).
    let (tg, ts) = scaled_2d(1, "truss");
    same_forces("truss", &solve_2d(&tg).unwrap(), &solve_2d(&ts).unwrap());
    let (g, s) = scaled_2d(4, "frame");
    // Load-case path.
    let pg = prepare_static_2d(&g).unwrap().solve_loads(&g.loads).unwrap();
    let ps = prepare_static_2d(&s).unwrap().solve_loads(&s.loads).unwrap();
    same_forces("prepared", &pg, &ps);
    // P-Delta: the thermal compression enters the geometric stiffness with the stated α.
    let mut gl = g.clone();
    let mut sl = s.clone();
    for m in [&mut gl, &mut sl] {
        m.loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -5.0, my: 0.0 }));
    }
    let (rg, rs) = (solve_pdelta_2d(&gl, 30, 1e-10).unwrap(), solve_pdelta_2d(&sl, 30, 1e-10).unwrap());
    same_forces("pdelta", &rg.results, &rs.results);
    // Corotational refuses thermal loads outright (it would drop them), stated α or not.
    assert!(solve_corotational_2d(&gl, 50, 1e-10, 4, false).unwrap_err().contains("thermal"));
}

#[test]
fn every_3d_path_honours_alpha_and_depths() {
    let (a, iy, iz) = (IPE_A, IPE_I_STRONG, IPE_I_WEAK);
    let k = ALPHA_ALU / 12e-6;
    let (hy_eq, hz_eq) = ((12.0 * iz / a).sqrt(), (12.0 * iy / a).sqrt());
    let g = fixed_3d(ALU, a, iy, iz, "frame", json!({"dtUniform": 20.0, "dtGradientY": 10.0, "dtGradientZ": 15.0, "alpha": ALPHA_ALU, "depthY": IPE_B, "depthZ": IPE_H}));
    let s = fixed_3d(ALU, a, iy, iz, "frame", json!({"dtUniform": 20.0 * k, "dtGradientY": 10.0 * k * hy_eq / IPE_B, "dtGradientZ": 15.0 * k * hz_eq / IPE_H}));
    let (rg, rs) = (solve_3d(&g).unwrap(), solve_3d(&s).unwrap());
    let (x, y) = (&rg.element_forces[0], &rs.element_forces[0]);
    for (p, q) in [(x.n_start, y.n_start), (x.my_start, y.my_start), (x.mz_start, y.mz_start)] {
        close("3D linear", p, q, 1e-9);
    }
    let (pg, ps) = (solve_pdelta_3d(&g, 30, 1e-10).unwrap(), solve_pdelta_3d(&s, 30, 1e-10).unwrap());
    close("3D pdelta N", pg.results.element_forces[0].n_start, ps.results.element_forces[0].n_start, 1e-9);
    close("3D pdelta My", pg.results.element_forces[0].my_start, ps.results.element_forces[0].my_start, 1e-9);
}

// ─── The independent re-assembly reads the same fields ───────────────────────────────

#[test]
fn the_end_to_end_certificate_agrees_with_stated_alpha_and_depth() {
    let (g, _) = scaled_2d(3, "frame");
    let r = solve_2d(&g).unwrap();
    match end_to_end_2d(&g, &g.loads, &r) {
        EndToEnd::Certified { f_discrepancy, .. } => assert!(f_discrepancy < 1e-9, "f discrepancy {f_discrepancy}"),
        other => panic!("2D not certified: {other:?}"),
    }
    let g = fixed_3d(ALU, IPE_A, IPE_I_STRONG, IPE_I_WEAK, "frame", json!({"dtUniform": 20.0, "dtGradientY": 10.0, "dtGradientZ": 15.0, "alpha": ALPHA_ALU, "depthY": IPE_B, "depthZ": IPE_H}));
    let r = solve_3d(&g).unwrap();
    match end_to_end_3d(&g, &g.loads, &r) {
        EndToEnd::Certified { f_discrepancy, .. } => assert!(f_discrepancy < 1e-9, "f discrepancy {f_discrepancy}"),
        other => panic!("3D not certified: {other:?}"),
    }
}

/// The re-assembly is not fooled by a result solved without the stated α: a 2D solve that
/// ignored `alpha` does not satisfy the model as written.
#[test]
fn the_end_to_end_certificate_rejects_a_result_that_ignores_alpha() {
    // Pinned at the far end, so the gradient turns it by an amount that depends on α.
    let (mut g, _) = scaled_2d(3, "frame");
    g.supports.get_mut("2").unwrap().support_type = "pinned".into();
    let mut wrong = g.clone();
    for l in &mut wrong.loads {
        if let SolverLoad::Thermal(t) = l {
            t.alpha = None;
        }
    }
    let r = solve_2d(&wrong).unwrap();
    // The engine's own assembly of `g` agrees (f_discrepancy 0), and the bound it certifies for
    // this result is as large as the error α = 12e-6 makes (the displacements nearly double).
    match end_to_end_2d(&g, &g.loads, &r) {
        EndToEnd::Certified { rel_bound, f_discrepancy, .. } => {
            assert!(f_discrepancy < 1e-12, "{f_discrepancy}");
            assert!(rel_bound > 0.4, "a result for α = 12e-6 certified close for α = 23e-6: {rel_bound}");
        }
        _ => {}
    }
}

// ─── Inputs ───────────────────────────────────────────────────────────────────────────

#[test]
fn implausible_alpha_or_depth_is_rejected() {
    for bad in [json!({"alpha": 12.0}), json!({"alpha": -1e-5}), json!({"depth": 0.0}), json!({"depth": -0.3})] {
        let mut t = json!({"dtUniform": 10.0, "dtGradient": 5.0});
        for (k, v) in bad.as_object().unwrap() {
            t[k] = v.clone();
        }
        let e = solve_2d(&fixed_2d(1, 5.0, STEEL, 0.01, 1e-4, "frame", t.clone())).unwrap_err();
        assert!(e.contains("Thermal load on element 1"), "{t}: {e}");
    }
    let e = solve_3d(&fixed_3d(STEEL, 0.01, 1e-4, 1e-4, "frame", json!({"dtUniform": 0.0, "dtGradientY": 1.0, "dtGradientZ": 0.0, "depthY": -1.0}))).unwrap_err();
    assert!(e.contains("depthY"), "{e}");
}

#[test]
fn a_load_without_the_new_fields_serializes_as_before() {
    let t = SolverThermalLoad { element_id: 1, dt_uniform: 1.0, dt_gradient: 2.0, alpha: None, depth: None };
    assert_eq!(serde_json::to_value(&t).unwrap(), json!({"elementId": 1, "dtUniform": 1.0, "dtGradient": 2.0}));
    let t = SolverThermalLoad3D { element_id: 1, dt_uniform: 1.0, dt_gradient_y: 2.0, dt_gradient_z: 3.0, alpha: Some(1e-5), depth_y: None, depth_z: Some(0.3) };
    assert_eq!(serde_json::to_value(&t).unwrap(), json!({"elementId": 1, "dtUniform": 1.0, "dtGradientY": 2.0, "dtGradientZ": 3.0, "alpha": 1e-5, "depthZ": 0.3}));
}

/// A load set solved on a prepared model (load cases, WASM load sessions) checks the thermal
/// properties as a full solve does: an α of 12 or a zero depth is refused, not solved (Codex
/// review of #407).
#[test]
fn prepared_solves_refuse_invalid_thermal_properties() {
    use dedaliano_engine::solver::linear::prepare_static_3d;
    let model = fixed_2d(2, 4.0, 200_000.0, 0.01, 1e-4, "frame", json!({"dtUniform": 0.0, "dtGradient": 0.0}));
    let unloaded = SolverInput { loads: vec![], ..model };
    let prepared = prepare_static_2d(&unloaded).unwrap();
    for (alpha, depth) in [(Some(12.0), None), (None, Some(0.0)), (Some(-1e-5), None)] {
        let load = SolverLoad::Thermal(SolverThermalLoad { element_id: 1, dt_uniform: 10.0, dt_gradient: 5.0, alpha, depth });
        assert!(prepared.solve_loads(&[load]).is_err(), "2D alpha {alpha:?} depth {depth:?} solved");
    }
    let model = fixed_3d(200_000.0, 0.01, 1e-4, 1e-4, "frame", json!({"dtUniform": 0.0, "dtGradientY": 0.0, "dtGradientZ": 0.0}));
    let unloaded = SolverInput3D { loads: vec![], ..model };
    let prepared = prepare_static_3d(&unloaded).unwrap();
    for (alpha, dy, dz) in [(Some(12.0), None, None), (None, Some(0.0), None), (None, None, Some(-0.3))] {
        let load = SolverLoad3D::Thermal(SolverThermalLoad3D { element_id: 1, dt_uniform: 10.0, dt_gradient_y: 5.0, dt_gradient_z: 5.0, alpha, depth_y: dy, depth_z: dz });
        assert!(prepared.solve_loads(&[load]).is_err(), "3D alpha {alpha:?} depths {dy:?} {dz:?} solved");
    }
}
