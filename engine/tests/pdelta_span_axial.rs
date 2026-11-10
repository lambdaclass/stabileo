use crate::common::make_input;
use dedaliano_engine::solver::pdelta::{solve_pdelta_2d, solve_pdelta_3d};
use dedaliano_engine::types::*;
use serde_json::json;

const L: f64 = 4.0;
const E: f64 = 200_000.0;
const I: f64 = 1e-4;
const EI: f64 = E * 1000.0 * I;
const P: f64 = 3_000.0;
const F: f64 = 1.0;

fn close(got: f64, want: f64, relative: f64) {
    assert!(
        (got - want).abs() <= relative * want.abs().max(1e-8),
        "got {got:.12}, reference {want:.12}, relative error {}",
        (got / want - 1.0).abs()
    );
}

fn shoot(alpha: f64, force: f64, initial: f64, steps: usize) -> [f64; 3] {
    let h = 1.0 / steps as f64;
    let rhs = |x: f64, y: [f64; 3]| [y[1], -alpha * x * y[0] - force, y[0]];
    let add = |a: [f64; 3], b: [f64; 3], s: f64| std::array::from_fn(|i| a[i] + s * b[i]);
    let mut y = [0.0, initial, 0.0];
    for j in 0..steps {
        let x = j as f64 * h;
        let k1 = rhs(x, y);
        let k2 = rhs(x + h / 2.0, add(y, k1, h / 2.0));
        let k3 = rhs(x + h / 2.0, add(y, k2, h / 2.0));
        let k4 = rhs(x + h, add(y, k3, h));
        y = std::array::from_fn(|i| y[i] + h * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]) / 6.0);
    }
    y
}

fn continuum(steps: usize) -> (f64, f64, f64) {
    let alpha = P * L * L / EI;
    let a = shoot(alpha, 1.0, 0.0, steps);
    let b = shoot(alpha, 0.0, 1.0, steps);
    let initial = -a[1] / b[1];
    let mut lo = 0.0;
    let mut hi = 5.0;
    for _ in 0..50 {
        let mid = (lo + hi) / 2.0;
        if shoot(mid, 0.0, 1.0, steps)[1] > 0.0 {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    (
        (a[2] + initial * b[2]) * F * L.powi(3) / EI,
        initial * F * L,
        (lo + hi) / 2.0,
    )
}

fn ritz(compression: impl Fn(f64) -> f64) -> (f64, f64, f64) {
    let elastic = [
        [12.0, 6.0 * L, -12.0, 6.0 * L],
        [6.0 * L, 4.0 * L * L, -6.0 * L, 2.0 * L * L],
        [-12.0, -6.0 * L, 12.0, -6.0 * L],
        [6.0 * L, 2.0 * L * L, -6.0 * L, 4.0 * L * L],
    ];
    let mut k = elastic.map(|r| r.map(|v| v * EI / L.powi(3)));
    let steps = 8192;
    for j in 0..=steps {
        let t = j as f64 / steps as f64;
        let weight = if j == 0 || j == steps {
            1.0
        } else if j % 2 == 0 {
            2.0
        } else {
            4.0
        };
        let d = [
            (6.0 * t * t - 6.0 * t) / L,
            1.0 - 4.0 * t + 3.0 * t * t,
            (6.0 * t - 6.0 * t * t) / L,
            3.0 * t * t - 2.0 * t,
        ];
        for a in 0..4 {
            for b in 0..4 {
                k[a][b] -= weight * L / (3.0 * steps as f64) * compression(t) * d[a] * d[b];
            }
        }
    }
    let det = k[2][2] * k[3][3] - k[2][3] * k[3][2];
    let v = F * k[3][3] / det;
    let theta = -F * k[3][2] / det;
    (v, theta, k[1][2] * v + k[1][3] * theta)
}

fn input_2d(n: usize, point: bool, angle: f64) -> SolverInput {
    assert!(!point || n == 1);
    let (c, s) = (angle.cos(), angle.sin());
    let h = L / n as f64;
    let mut loads: Vec<_> = (1..=n)
        .filter_map(|id| {
            if point {
                (id == 1).then(|| {
                    SolverLoad::PointOnElement(SolverPointLoadOnElement {
                        element_id: id,
                        a: L / 2.0,
                        p: 0.0,
                        px: Some(P),
                        my: None,
                    })
                })
            } else {
                Some(SolverLoad::AxialDistributed(SolverAxialDistributedLoad {
                    element_id: id,
                    q_i: P / L,
                    q_j: P / L,
                    a: None,
                    b: None,
                }))
            }
        })
        .collect();
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: -P * c - F * s,
        fz: -P * s + F * c,
        my: 0.0,
    }));
    make_input(
        (0..=n)
            .map(|i| (i + 1, i as f64 * h * c, i as f64 * h * s))
            .collect(),
        vec![(1, E, 0.3)],
        vec![(1, 0.01, I)],
        (1..=n)
            .map(|i| (i, "frame", i, i + 1, 1, 1, false, false))
            .collect(),
        vec![(1, 1, "fixed")],
        loads,
    )
}

fn input_3d(n: usize, plane: usize, point: bool) -> SolverInput3D {
    assert!(!point || n == 1);
    let h = L / n as f64;
    let nodes: serde_json::Map<String, _> = (0..=n)
        .map(|i| {
            (
                (i + 1).to_string(),
                json!({"id": i + 1, "x": i as f64 * h, "y": 0, "z": 0}),
            )
        })
        .collect();
    let elements: serde_json::Map<String, _> = (1..=n).map(|i| (i.to_string(), json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 1, "sectionId": 1}))).collect();
    let mut loads: Vec<_> = (1..=n).filter_map(|id| {
        if point {
            (id == 1).then(|| json!({"type": "pointOnElement", "data": {"elementId": id, "a": L / 2.0, "px": P, "py": 0, "pz": 0}}))
        } else {
            Some(json!({"type": "distributed", "data": {"elementId": id, "qXI": P / L, "qXJ": P / L, "qYI": 0, "qYJ": 0, "qZI": 0, "qZJ": 0}}))
        }
    }).collect();
    loads.push(json!({"type": "nodal", "data": {"nodeId": n + 1, "fx": -P, "fy": if plane == 1 { F } else { 0.0 }, "fz": if plane == 2 { F } else { 0.0 }, "mx": 0, "my": 0, "mz": 0}}));
    serde_json::from_value(json!({
        "nodes": nodes, "elements": elements, "loads": loads,
        "materials": {"1": {"id": 1, "e": E, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": I, "iz": I, "j": 1e-4}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}}
    })).unwrap()
}

#[test]
fn varying_compression_2d_matches_independent_ritz_and_shooting() {
    let exact = continuum(1024);
    let finer = continuum(2048);
    close(exact.0, finer.0, 1e-10);
    close(exact.1, finer.1, 1e-10);
    close(exact.2, finer.2, 1e-10);
    let one = ritz(|t| P * t);
    println!("reference: displacement {}, base moment {}, critical P {}, B2-style {}; one-element Ritz {:?}", exact.0, exact.1, exact.2 * EI / L.powi(2), 1.0 / (1.0 - P * L.powi(2) / EI / exact.2), one);
    let mut rows = Vec::new();
    for angle in [0.0, 0.4] {
        for n in [1, 8, 32] {
            let pd = solve_pdelta_2d(&input_2d(n, false, angle), 30, 1e-10).unwrap();
            assert!(pd.converged && pd.is_stable);
            let d = pd
                .results
                .displacements
                .iter()
                .find(|d| d.node_id == n + 1)
                .unwrap();
            let v = -angle.sin() * d.ux + angle.cos() * d.uz;
            let moment = pd
                .results
                .element_forces
                .iter()
                .find(|f| f.element_id == 1)
                .unwrap()
                .m_start;
            println!(
                "2D n={n} angle={angle}: displacement {v}, moment {moment}, B2 {}",
                pd.b2_factor
            );
            rows.push((n, v, moment));

            if angle == 0.0 {
                close(pd.b2_factor, v / (F * L.powi(3) / (3.0 * EI)), 1e-8);
            }
            let tip = pd
                .results
                .element_forces
                .iter()
                .find(|f| f.element_id == n)
                .unwrap();
            assert!(tip.m_end.abs() < 1e-8, "free end moment {}", tip.m_end);
        }
    }
    for (n, v, moment) in rows {
        close(
            v,
            if n == 1 { one.0 } else { exact.0 },
            if n == 1 { 1e-9 } else { 1e-4 },
        );
        close(
            moment,
            if n == 1 { one.2 } else { -exact.1 },
            if n == 1 { 1e-9 } else { 1e-4 },
        );
    }
}

#[test]
fn varying_compression_3d_matches_independent_ritz_and_shooting_in_both_planes() {
    let exact = continuum(1024);
    let one = ritz(|t| P * t);
    let mut rows = Vec::new();
    for plane in [1, 2] {
        for n in [1, 8, 16] {
            let pd = solve_pdelta_3d(&input_3d(n, plane, false), 30, 1e-10).unwrap();
            assert!(pd.converged && pd.is_stable);
            let d = pd
                .results
                .displacements
                .iter()
                .find(|d| d.node_id == n + 1)
                .unwrap();
            let v = if plane == 1 { d.uy } else { d.uz };
            let base = pd
                .results
                .element_forces
                .iter()
                .find(|f| f.element_id == 1)
                .unwrap();
            let moment = if plane == 1 {
                base.mz_start
            } else {
                -base.my_start
            };
            println!(
                "3D n={n} plane={plane}: displacement {v}, moment {moment}, B2 {}",
                pd.b2_factor
            );
            rows.push((n, v, moment));

            close(pd.b2_factor, v / (F * L.powi(3) / (3.0 * EI)), 1e-8);
            let tip = pd
                .results
                .element_forces
                .iter()
                .find(|f| f.element_id == n)
                .unwrap();
            assert!(
                tip.my_end.abs() < 1e-8 && tip.mz_end.abs() < 1e-8,
                "free end moments {}, {}",
                tip.my_end,
                tip.mz_end
            );
        }
    }
    for (n, v, moment) in rows {
        close(
            v,
            if n == 1 { one.0 } else { exact.0 },
            if n == 1 { 1e-9 } else { 1e-4 },
        );
        close(
            moment,
            if n == 1 { one.2 } else { -exact.1 },
            if n == 1 { 1e-9 } else { 1e-4 },
        );
    }
}

#[test]
fn axial_point_load_2d_and_3d_use_the_piecewise_force() {
    let one = ritz(|t| {
        if t > 0.5 {
            P
        } else if t == 0.5 {
            P / 2.0
        } else {
            0.0
        }
    });
    let pd = solve_pdelta_2d(&input_2d(1, true, 0.0), 30, 1e-10).unwrap();
    let d = pd
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap();
    close(d.uz, one.0, 1e-9);
    close(pd.results.element_forces[0].m_end.abs(), 0.0, 1.0);
    for plane in [1, 2] {
        let pd = solve_pdelta_3d(&input_3d(1, plane, true), 30, 1e-10).unwrap();
        let d = pd
            .results
            .displacements
            .iter()
            .find(|d| d.node_id == 2)
            .unwrap();
        close(if plane == 1 { d.uy } else { d.uz }, one.0, 1e-9);
    }
}

#[test]
fn varying_compression_near_critical_matches_shooting_stability() {
    let critical = continuum(1024).2 * EI / L.powi(2);
    for ratio in [0.98, 1.02] {
        let scale = ratio * critical / P;
        let mut input = input_2d(1, false, 0.0);
        for load in &mut input.loads {
            match load {
                SolverLoad::AxialDistributed(q) => {
                    q.q_i *= scale;
                    q.q_j *= scale;
                }
                SolverLoad::Nodal(p) => p.fx *= scale,
                _ => {}
            }
        }
        let pd = solve_pdelta_2d(&input, 30, 1e-10).unwrap();
        assert_eq!(
            pd.is_stable,
            ratio < 1.0,
            "2D at {ratio} of the shooting critical load"
        );
        let mut input = input_3d(1, 1, false);
        for load in &mut input.loads {
            match load {
                SolverLoad3D::Distributed(q) => {
                    q.q_xi *= scale;
                    q.q_xj *= scale;
                }
                SolverLoad3D::Nodal(p) => p.fx *= scale,
                _ => {}
            }
        }
        let pd = solve_pdelta_3d(&input, 30, 1e-10).unwrap();
        assert_eq!(
            pd.is_stable,
            ratio < 1.0,
            "3D at {ratio} of the shooting critical load"
        );
    }
}

#[test]
fn certificates_bound_the_corrected_span_force_model() {
    use dedaliano_engine::certify::pdelta::{certify_pdelta_2d, certify_pdelta_3d};
    let want = ritz(|t| P * t).0;
    let pd = certify_pdelta_2d(&input_2d(1, false, 0.0), 30, 1e-10).unwrap();
    let bound = pd
        .certificate
        .abs_bound()
        .expect("the corrected model is certified");
    assert!(bound < 1e-8, "{:#?}", pd.certificate);
    let d = pd
        .results
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap();
    assert!((d.uz - want).abs() <= bound + 1e-14);
    for plane in [1, 2] {
        let pd = certify_pdelta_3d(&input_3d(1, plane, false), 30, 1e-10).unwrap();
        let bound = pd
            .certificate
            .abs_bound()
            .expect("the corrected model is certified");
        assert!(bound < 1e-8, "{:#?}", pd.certificate);
        let d = pd
            .results
            .results
            .displacements
            .iter()
            .find(|d| d.node_id == 2)
            .unwrap();
        assert!((if plane == 1 { d.uy } else { d.uz } - want).abs() <= bound + 1e-14);
    }
}

#[test]
fn span_force_response_is_invariant_under_reversal_and_load_splitting() {
    for n in [1, 32] {
        let input = input_2d(n, false, 0.4);
        let reference = solve_pdelta_2d(&input, 30, 1e-10).unwrap();
        let mut changed = input.clone();
        for elem in changed.elements.values_mut() {
            std::mem::swap(&mut elem.node_i, &mut elem.node_j);
        }
        let mut split = Vec::new();
        for load in &mut changed.loads {
            if let SolverLoad::AxialDistributed(q) = load {
                q.q_i *= -0.5;
                q.q_j *= -0.5;
                split.push(load.clone());
            }
        }
        changed.loads.extend(split);
        let got = solve_pdelta_2d(&changed, 30, 1e-10).unwrap();
        assert!(reference.converged && got.converged && got.is_stable);
        for a in &reference.results.displacements {
            let b = got
                .results
                .displacements
                .iter()
                .find(|b| b.node_id == a.node_id)
                .unwrap();
            for (x, y) in [(a.ux, b.ux), (a.uz, b.uz), (a.ry, b.ry)] {
                close(x, y, 1e-7);
            }
        }
    }
    for n in [1, 16] {
        let input = input_3d(n, 1, false);
        let reference = solve_pdelta_3d(&input, 30, 1e-10).unwrap();
        let mut changed = input.clone();
        for elem in changed.elements.values_mut() {
            std::mem::swap(&mut elem.node_i, &mut elem.node_j);
        }
        let mut split = Vec::new();
        for load in &mut changed.loads {
            if let SolverLoad3D::Distributed(q) = load {
                q.q_xi *= -0.5;
                q.q_xj *= -0.5;
                split.push(load.clone());
            }
        }
        changed.loads.extend(split);
        let got = solve_pdelta_3d(&changed, 30, 1e-10).unwrap();
        assert!(reference.converged && got.converged && got.is_stable);
        for a in &reference.results.displacements {
            let b = got
                .results
                .displacements
                .iter()
                .find(|b| b.node_id == a.node_id)
                .unwrap();
            for (x, y) in [
                (a.ux, b.ux),
                (a.uy, b.uy),
                (a.uz, b.uz),
                (a.rx, b.rx),
                (a.ry, b.ry),
                (a.rz, b.rz),
            ] {
                close(x, y, 1e-7);
            }
        }
    }
}

#[test]
fn trapezoidal_and_partial_axial_span_loads_match_independent_ritz() {
    for partial in [false, true] {
        let want = ritz(|t| {
            if partial {
                P * (t - 0.25).clamp(0.0, 0.5)
            } else {
                P * t * t
            }
        });
        let mut input = input_2d(1, false, 0.0);
        for load in &mut input.loads {
            match load {
                SolverLoad::AxialDistributed(q) => {
                    if partial {
                        q.a = Some(L / 4.0);
                        q.b = Some(3.0 * L / 4.0);
                    } else {
                        q.q_i = 0.0;
                        q.q_j = 2.0 * P / L;
                    }
                }
                SolverLoad::Nodal(p) if partial => p.fx = -P / 2.0,
                _ => {}
            }
        }
        let pd = solve_pdelta_2d(&input, 30, 1e-10).unwrap();
        assert!(pd.converged && pd.is_stable);
        close(
            pd.results
                .displacements
                .iter()
                .find(|d| d.node_id == 2)
                .unwrap()
                .uz,
            want.0,
            1e-9,
        );
        close(pd.results.element_forces[0].m_start, want.2, 1e-9);
        close(pd.results.reactions[0].my, want.2, 1e-9);
        for plane in [1, 2] {
            let mut input = input_3d(1, plane, false);
            for load in &mut input.loads {
                match load {
                    SolverLoad3D::Distributed(q) => {
                        if partial {
                            q.a = Some(L / 4.0);
                            q.b = Some(3.0 * L / 4.0);
                        } else {
                            q.q_xi = 0.0;
                            q.q_xj = 2.0 * P / L;
                        }
                    }
                    SolverLoad3D::Nodal(p) if partial => p.fx = -P / 2.0,
                    _ => {}
                }
            }
            let pd = solve_pdelta_3d(&input, 30, 1e-10).unwrap();
            assert!(pd.converged && pd.is_stable);
            let d = pd
                .results
                .displacements
                .iter()
                .find(|d| d.node_id == 2)
                .unwrap();
            close(if plane == 1 { d.uy } else { d.uz }, want.0, 1e-9);
            let f = &pd.results.element_forces[0];
            close(
                if plane == 1 { f.mz_start } else { f.my_start },
                if plane == 1 { want.2 } else { -want.2 },
                1e-9,
            );
        }
    }
}

fn independent_span_plane(point: bool, asymmetric: bool) -> [[f64; 2]; 2] {
    let steps = 8192;
    let mut out = [[0.0; 2]; 2];
    for j in 0..=steps {
        let t = j as f64 / steps as f64;
        let weight = if j == 0 || j == steps {
            1.0
        } else if j % 2 == 0 {
            2.0
        } else {
            4.0
        };
        let location = if asymmetric { 0.25 } else { 0.5 };
        let compression = if point {
            if t < location {
                0.0
            } else if t == location {
                P / 2.0
            } else {
                P
            }
        } else if asymmetric {
            P * (t + t * t) / 2.0
        } else {
            P * t
        };
        let d = [(6.0 * t - 6.0 * t * t) / L, 3.0 * t * t - 2.0 * t];
        for a in 0..2 {
            for b in 0..2 {
                out[a][b] -= weight * L / (3.0 * steps as f64) * compression * d[a] * d[b];
            }
        }
    }
    out
}

fn check_force_and_displacement_kg_2d(point: bool, asymmetric: bool) {
    use dedaliano_engine::solver::{dof::DofNumbering, geometric_stiffness::*, linear::solve_2d};
    {
        let mut input = input_2d(1, point, 0.0);
        if asymmetric {
            for load in &mut input.loads {
                match load {
                    SolverLoad::PointOnElement(p) => p.a = L / 4.0,
                    SolverLoad::AxialDistributed(q) => {
                        q.q_i = P / (2.0 * L);
                        q.q_j = 3.0 * P / (2.0 * L);
                    }
                    _ => {}
                }
            }
        }
        let dofs = DofNumbering::build_2d(&input);
        let linear = solve_2d(&input).unwrap();
        let mut u = vec![0.0; dofs.n_total];
        for d in &linear.displacements {
            for (i, value) in [d.ux, d.uz, d.ry].into_iter().enumerate() {
                if let Some(k) = dofs.global_dof(d.node_id, i) {
                    u[k] = value;
                }
            }
        }
        let mut dense = vec![0.0; dofs.n_total * dofs.n_total];
        add_geometric_stiffness_2d(&input, &dofs, &u, &mut dense);
        let force = build_kg_from_forces_2d(&input, &dofs, &linear.element_forces, &[])
            .into_csc()
            .to_dense_symmetric();
        let want = independent_span_plane(point, asymmetric);
        let plane = [
            dofs.global_dof(2, 1).unwrap(),
            dofs.global_dof(2, 2).unwrap(),
        ];
        for a in 0..2 {
            for b in 0..2 {
                let scale = P * L;
                assert!(
                    (dense[plane[a] * dofs.n_total + plane[b]] - want[a][b]).abs() <= 1e-10 * scale,
                    "point {point}, asymmetric {asymmetric}, ({a},{b}): displacement {}, independent {}",
                    dense[plane[a] * dofs.n_total + plane[b]], want[a][b]
                );
                assert!(
                    (force[plane[a] * dofs.n_free + plane[b]] - want[a][b]).abs() <= 1e-10 * scale,
                    "point {point}, ({a},{b}): force {}, independent {}",
                    force[plane[a] * dofs.n_free + plane[b]],
                    want[a][b]
                );
            }
        }
    }
}

fn check_force_and_displacement_kg_3d(point: bool, asymmetric: bool) {
    use dedaliano_engine::solver::{dof::DofNumbering, geometric_stiffness::*, linear::solve_3d};
    {
        let mut input = input_3d(1, 1, point);
        if asymmetric {
            for load in &mut input.loads {
                match load {
                    SolverLoad3D::PointOnElement(p) => p.a = L / 4.0,
                    SolverLoad3D::Distributed(q) => {
                        q.q_xi = P / (2.0 * L);
                        q.q_xj = 3.0 * P / (2.0 * L);
                    }
                    _ => {}
                }
            }
        }
        let dofs = DofNumbering::build_3d(&input);
        let linear = solve_3d(&input).unwrap();
        let mut u = vec![0.0; dofs.n_total];
        for d in &linear.displacements {
            for (i, value) in [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz].into_iter().enumerate() {
                if let Some(k) = dofs.global_dof(d.node_id, i) {
                    u[k] = value;
                }
            }
        }
        let mut dense = vec![0.0; dofs.n_total * dofs.n_total];
        add_geometric_stiffness_3d(&input, &dofs, &u, &mut dense);
        let force = build_kg_from_forces_3d(&input, &dofs, &linear.element_forces)
            .into_csc()
            .to_dense_symmetric();
        let want = independent_span_plane(point, asymmetric);
        for (trans, rot, sign) in [(1, 5, 1.0), (2, 4, -1.0)] {
            let plane = [
                dofs.global_dof(2, trans).unwrap(),
                dofs.global_dof(2, rot).unwrap(),
            ];
            for a in 0..2 {
                for b in 0..2 {
                    let expected = want[a][b] * if a == b { 1.0 } else { sign };
                    assert!(
                        (dense[plane[a] * dofs.n_total + plane[b]] - expected).abs() <= 1e-10 * P * L,
                        "point {point}, asymmetric {asymmetric}, plane {trans}, ({a},{b}): displacement {}, independent {expected}",
                        dense[plane[a] * dofs.n_total + plane[b]]
                    );
                    assert!(
                        (force[plane[a] * dofs.n_free + plane[b]] - expected).abs()
                            <= 1e-10 * P * L,
                        "point {point}, plane {trans}, ({a},{b}): force {}, independent {expected}",
                        force[plane[a] * dofs.n_free + plane[b]]
                    );
                }
            }
        }
    }
}

#[test]
fn force_kg_2d_integrates_span_loads_like_displacement_assembly() {
    for point in [false, true] {
        check_force_and_displacement_kg_2d(point, false);
    }
}

#[test]
fn force_kg_3d_integrates_span_loads_in_both_bending_planes() {
    for point in [false, true] {
        check_force_and_displacement_kg_3d(point, false);
    }
}

#[test]
fn force_and_displacement_kg_2d_off_centre_point_matches_independent_integral() {
    check_force_and_displacement_kg_2d(true, true);
}

#[test]
fn force_and_displacement_kg_2d_trapezoidal_matches_independent_integral() {
    check_force_and_displacement_kg_2d(false, true);
}

#[test]
fn force_and_displacement_kg_3d_off_centre_point_matches_independent_integral() {
    check_force_and_displacement_kg_3d(true, true);
}

#[test]
fn force_and_displacement_kg_3d_trapezoidal_matches_independent_integral() {
    check_force_and_displacement_kg_3d(false, true);
}
