use dedaliano_engine::solver::linear::{
    prepare_static_2d, prepare_static_2d_dense_reference, prepare_static_3d,
};
use dedaliano_engine::types::*;

const E: f64 = 1234.0;
const A: f64 = 0.03;
const IY: f64 = 0.0002;
const IZ: f64 = 0.0003;
const J: f64 = 0.0004;
const NU: f64 = 0.25;
const L: f64 = 6.0;
const P: [f64; 6] = [2.0, -3.0, 5.0, 0.7, -0.9, 1.1];
const Q: [f64; 3] = [0.4, -0.6, 0.8];
const BASE: [f64; 6] = [0.002, -0.003, 0.004, -0.0005, 0.0006, -0.0007];

fn close(actual: f64, expected: f64, scale: f64) {
    let tolerance = 1e-9 * scale;
    assert!(
        actual.is_finite() && (actual - expected).abs() <= tolerance,
        "actual {actual:.16e}, expected {expected:.16e}, tolerance {tolerance:.3e}"
    );
}

fn cantilever_3d(count: usize, method: &str) -> SolverInput3D {
    let mut input: SolverInput3D = serde_json::from_value(serde_json::json!({
        "nodes": {}, "materials": {"1": {"id": 1, "e": E, "nu": NU}},
        "sections": {"1": {"id": 1, "a": A, "iy": IY, "iz": IZ, "j": J}},
        "elements": {}, "supports": {"1": {"nodeId": 1,
            "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true,
            "dx": BASE[0], "dy": BASE[1], "dz": BASE[2],
            "drx": BASE[3], "dry": BASE[4], "drz": BASE[5]}},
        "loads": [], "solverOptions": {"method": method, "preconditioner": "ic0", "tolerance": 1e-12}
    })).unwrap();
    for i in 0..=count {
        let id = i + 1;
        input.nodes.insert(
            id.to_string(),
            SolverNode3D {
                id,
                x: L * i as f64 / count as f64,
                y: 0.0,
                z: 0.0,
            },
        );
    }
    for id in 1..=count {
        input.elements.insert(
            id.to_string(),
            serde_json::from_value(serde_json::json!({
                "id": id, "type": "frame", "nodeI": id, "nodeJ": id + 1,
                "materialId": 1, "sectionId": 1, "localYx": 0.0, "localYy": 1.0, "localYz": 0.0
            }))
            .unwrap(),
        );
        input
            .loads
            .push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
                element_id: id,
                q_xi: Q[0],
                q_xj: Q[0],
                q_yi: Q[1],
                q_yj: Q[1],
                q_zi: Q[2],
                q_zj: Q[2],
                a: None,
                b: None,
            }));
    }
    input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: count + 1,
        fx: P[0],
        fy: P[1],
        fz: P[2],
        mx: P[3],
        my: P[4],
        mz: P[5],
        bw: None,
    }));
    input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 1,
        fx: -0.3,
        fy: 0.5,
        fz: -0.7,
        mx: 0.2,
        my: -0.4,
        mz: 0.6,
        bw: None,
    }));
    input
}

fn check_cantilever_3d(count: usize, method: &str) {
    let input = cantilever_3d(count, method);
    let prepared = prepare_static_3d(&input).unwrap();
    for multiplier in [1.0, -0.75] {
        let mut loads = input.loads.clone();
        for load in &mut loads {
            match load {
                SolverLoad3D::Nodal(n) => {
                    n.fx *= multiplier;
                    n.fy *= multiplier;
                    n.fz *= multiplier;
                    n.mx *= multiplier;
                    n.my *= multiplier;
                    n.mz *= multiplier;
                }
                SolverLoad3D::Distributed(d) => {
                    d.q_xi *= multiplier;
                    d.q_xj *= multiplier;
                    d.q_yi *= multiplier;
                    d.q_yj *= multiplier;
                    d.q_zi *= multiplier;
                    d.q_zj *= multiplier;
                }
                _ => unreachable!(),
            }
        }
        let result = prepared.solve_loads(&loads).unwrap();
        assert_eq!(result.displacements.len(), input.nodes.len());
        assert_eq!(result.element_forces.len(), input.elements.len());
        assert_eq!(result.reactions.len(), input.supports.len());
        let e = E * 1000.0;
        let g = e / (2.0 * (1.0 + NU));
        for d in &result.displacements {
            let x = input.nodes[&d.node_id.to_string()].x;
            let transverse = |p: f64, q: f64, m: f64, inertia: f64| {
                multiplier
                    * (p * x * x * (3.0 * L - x) / 6.0
                        + q * x * x * (6.0 * L * L - 4.0 * L * x + x * x) / 24.0
                        + m * x * x / 2.0)
                    / (e * inertia)
            };
            let rotation = |p: f64, q: f64, m: f64, inertia: f64| {
                multiplier
                    * (p * x * (2.0 * L - x) / 2.0
                        + q * x * (3.0 * L * L - 3.0 * L * x + x * x) / 6.0
                        + m * x)
                    / (e * inertia)
            };
            close(
                d.ux,
                BASE[0] + multiplier * (P[0] * x + Q[0] * (L * x - x * x / 2.0)) / (e * A),
                0.01,
            );
            close(
                d.uy,
                BASE[1] + BASE[5] * x + transverse(P[1], Q[1], P[5], IZ),
                1.0,
            );
            close(
                d.uz,
                BASE[2] - BASE[4] * x + transverse(P[2], Q[2], -P[4], IY),
                1.0,
            );
            close(d.rx, BASE[3] + multiplier * P[3] * x / (g * J), 0.1);
            close(d.ry, BASE[4] - rotation(P[2], Q[2], -P[4], IY), 1.0);
            close(d.rz, BASE[5] + rotation(P[1], Q[1], P[5], IZ), 1.0);
        }
        let r = &result.reactions[0];
        for (actual, expected) in [
            (r.fx, -P[0] - Q[0] * L + 0.3),
            (r.fy, -P[1] - Q[1] * L - 0.5),
            (r.fz, -P[2] - Q[2] * L + 0.7),
            (r.mx, -P[3] - 0.2),
            (r.my, -P[4] + P[2] * L + Q[2] * L * L / 2.0 + 0.4),
            (r.mz, -P[5] - P[1] * L - Q[1] * L * L / 2.0 - 0.6),
        ] {
            close(actual, multiplier * expected, 100.0);
        }
        for f in &result.element_forces {
            for (x, n, vy, vz, mx, my, mz) in [
                (
                    input.nodes[&f.element_id.to_string()].x,
                    f.n_start,
                    f.vy_start,
                    f.vz_start,
                    f.mx_start,
                    f.my_start,
                    f.mz_start,
                ),
                (
                    input.nodes[&(f.element_id + 1).to_string()].x,
                    f.n_end,
                    f.vy_end,
                    f.vz_end,
                    f.mx_end,
                    f.my_end,
                    f.mz_end,
                ),
            ] {
                let remaining = L - x;
                for (actual, expected) in [
                    (n, P[0] + Q[0] * remaining),
                    (vy, -P[1] - Q[1] * remaining),
                    (vz, -P[2] - Q[2] * remaining),
                    (mx, -P[3]),
                    (
                        my,
                        -P[4] + P[2] * remaining + Q[2] * remaining * remaining / 2.0,
                    ),
                    (
                        mz,
                        -P[5] - P[1] * remaining - Q[1] * remaining * remaining / 2.0,
                    ),
                ] {
                    close(actual, multiplier * expected, 100.0);
                }
            }
        }
    }
}

#[test]
fn cantilever_3d_dense_closed_form() {
    check_cantilever_3d(1, "direct");
}

#[test]
fn cantilever_3d_sparse_closed_form() {
    check_cantilever_3d(12, "direct");
}

#[test]
fn cantilever_3d_pcg_closed_form() {
    check_cantilever_3d(12, "pcg");
}

fn cantilever_2d(count: usize, method: &str) -> SolverInput {
    let mut input: SolverInput = serde_json::from_value(serde_json::json!({
        "nodes": {}, "materials": {"1": {"id": 1, "e": E, "nu": NU}},
        "sections": {"1": {"id": 1, "a": A, "iz": IZ}},
        "elements": {}, "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed", "dx": BASE[0], "dz": BASE[2], "dry": BASE[5]}},
        "loads": [], "solverOptions": {"method": method, "preconditioner": "ic0", "tolerance": 1e-12}
    })).unwrap();
    for i in 0..=count {
        let id = i + 1;
        input.nodes.insert(
            id.to_string(),
            SolverNode {
                id,
                x: L * i as f64 / count as f64,
                z: 0.0,
            },
        );
    }
    for id in 1..=count {
        input.elements.insert(
            id.to_string(),
            SolverElement {
                id,
                elem_type: "frame".into(),
                node_i: id,
                node_j: id + 1,
                material_id: 1,
                section_id: 1,
                hinge_start: false,
                hinge_end: false,
            },
        );
        input
            .loads
            .push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: id,
                q_i: Q[1],
                q_j: Q[1],
                a: None,
                b: None,
            }));
    }
    input.loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: count + 1,
        fx: P[0],
        fz: P[1],
        my: P[5],
    }));
    input.loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: 1,
        fx: -0.3,
        fz: 0.5,
        my: 0.6,
    }));
    input
}

fn check_cantilever_2d(count: usize, method: &str, dense_reference: bool) {
    let input = cantilever_2d(count, method);
    let prepared = if dense_reference {
        prepare_static_2d_dense_reference(&input)
    } else {
        prepare_static_2d(&input)
    }
    .unwrap();
    let result = prepared.solve_loads(&input.loads).unwrap();
    assert_eq!(result.displacements.len(), input.nodes.len());
    assert_eq!(result.element_forces.len(), input.elements.len());
    assert_eq!(result.reactions.len(), input.supports.len());
    let e = E * 1000.0;
    for d in &result.displacements {
        let x = input.nodes[&d.node_id.to_string()].x;
        close(d.ux, BASE[0] + P[0] * x / (e * A), 0.01);
        close(
            d.uz,
            BASE[2]
                + BASE[5] * x
                + (P[1] * x * x * (3.0 * L - x) / 6.0
                    + Q[1] * x * x * (6.0 * L * L - 4.0 * L * x + x * x) / 24.0
                    + P[5] * x * x / 2.0)
                    / (e * IZ),
            1.0,
        );
        close(
            d.ry,
            BASE[5]
                + (P[1] * x * (2.0 * L - x) / 2.0
                    + Q[1] * x * (3.0 * L * L - 3.0 * L * x + x * x) / 6.0
                    + P[5] * x)
                    / (e * IZ),
            1.0,
        );
    }
    let r = &result.reactions[0];
    close(r.rx, -P[0] + 0.3, 100.0);
    close(r.rz, -P[1] - Q[1] * L - 0.5, 100.0);
    close(r.my, -P[5] - P[1] * L - Q[1] * L * L / 2.0 - 0.6, 100.0);
    for f in &result.element_forces {
        for (x, n, v, m) in [
            (
                input.nodes[&f.element_id.to_string()].x,
                f.n_start,
                f.v_start,
                f.m_start,
            ),
            (
                input.nodes[&(f.element_id + 1).to_string()].x,
                f.n_end,
                f.v_end,
                f.m_end,
            ),
        ] {
            let remaining = L - x;
            close(n, P[0], 100.0);
            close(v, -P[1] - Q[1] * remaining, 100.0);
            close(
                m,
                -P[5] - P[1] * remaining - Q[1] * remaining * remaining / 2.0,
                100.0,
            );
        }
    }
}

#[test]
fn cantilever_2d_dense_closed_form() {
    check_cantilever_2d(1, "direct", false);
}

#[test]
fn cantilever_2d_dense_reference_closed_form() {
    check_cantilever_2d(22, "direct", true);
}

#[test]
fn cantilever_2d_sparse_closed_form() {
    check_cantilever_2d(22, "direct", false);
}

#[test]
fn cantilever_2d_pcg_closed_form() {
    check_cantilever_2d(22, "pcg", false);
}

fn fixed_members() -> SolverInput3D {
    let mut input = cantilever_3d(2, "direct");
    input.loads.clear();
    input.supports.clear();
    input.nodes.clear();
    for id in 1..=4 {
        input.nodes.insert(
            id.to_string(),
            SolverNode3D {
                id,
                x: if id % 2 == 1 { 0.0 } else { L },
                y: if id <= 2 { 0.0 } else { 2.0 },
                z: 0.0,
            },
        );
        input.supports.insert(id.to_string(), serde_json::from_value(serde_json::json!({
            "nodeId": id, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true, "rw": true
        })).unwrap());
    }
    let mut warping = input.sections["1"].clone();
    warping.id = 2;
    warping.cw = Some(0.00001);
    input.sections.insert("2".into(), warping);
    input.elements.get_mut("1").unwrap().section_id = 2;
    let second = input.elements.get_mut("2").unwrap();
    second.node_i = 3;
    second.node_j = 4;
    input
}

fn check_fixed_member_loads(case: &str, warping: bool) {
    let mut input = fixed_members();
    if !warping {
        input.sections.get_mut("2").unwrap().cw = None;
    }
    let prepared = prepare_static_3d(&input).unwrap();
    let mut loads = Vec::new();
    for id in 1..=2 {
        let factor = if id == 1 { 1.0 } else { -0.7 };
        loads.push(match case {
            "distributed" => SolverLoad3D::Distributed(SolverDistributedLoad3D {
                element_id: id,
                q_xi: factor * Q[0],
                q_xj: factor * Q[0],
                q_yi: factor * Q[1],
                q_yj: factor * Q[1],
                q_zi: factor * Q[2],
                q_zj: factor * Q[2],
                a: None,
                b: None,
            }),
            "point" => SolverLoad3D::PointOnElement(SolverPointLoad3D {
                element_id: id,
                a: L / 3.0,
                px: factor * P[0],
                py: factor * P[1],
                pz: factor * P[2],
            }),
            "thermal" => SolverLoad3D::Thermal(SolverThermalLoad3D {
                element_id: id,
                dt_uniform: factor * 7.0,
                dt_gradient_y: factor * 3.0,
                dt_gradient_z: factor * -5.0,
                alpha: Some(0.000013),
                depth_y: Some(0.3),
                depth_z: Some(0.2),
            }),
            _ => unreachable!(),
        });
    }
    let result = prepared.solve_loads(&loads).unwrap();
    assert_eq!(result.displacements.len(), input.nodes.len());
    assert_eq!(result.element_forces.len(), input.elements.len());
    assert_eq!(result.reactions.len(), input.supports.len());
    for r in &result.reactions {
        let factor = if r.node_id <= 2 { 1.0 } else { -0.7 };
        let start = r.node_id % 2 == 1;
        let expected = match case {
            "distributed" => [
                -Q[0] * L / 2.0,
                -Q[1] * L / 2.0,
                -Q[2] * L / 2.0,
                0.0,
                if start {
                    Q[2] * L * L / 12.0
                } else {
                    -Q[2] * L * L / 12.0
                },
                if start {
                    -Q[1] * L * L / 12.0
                } else {
                    Q[1] * L * L / 12.0
                },
            ],
            "point" => {
                let a = L / 3.0;
                let b = L - a;
                let share = if start {
                    b * b * (L + 2.0 * a) / L.powi(3)
                } else {
                    a * a * (L + 2.0 * b) / L.powi(3)
                };
                let moment = if start {
                    a * b * b / (L * L)
                } else {
                    -a * a * b / (L * L)
                };
                [
                    -P[0] * if start { b / L } else { a / L },
                    -P[1] * share,
                    -P[2] * share,
                    0.0,
                    P[2] * moment,
                    -P[1] * moment,
                ]
            }
            "thermal" => {
                let sign = if start { 1.0 } else { -1.0 };
                let e_alpha = E * 1000.0 * 0.000013;
                [
                    sign * e_alpha * A * 7.0,
                    0.0,
                    0.0,
                    0.0,
                    sign * e_alpha * IY * -5.0 / 0.2,
                    sign * e_alpha * IZ * 3.0 / 0.3,
                ]
            }
            _ => unreachable!(),
        };
        for (actual, reference) in [r.fx, r.fy, r.fz, r.mx, r.my, r.mz]
            .into_iter()
            .zip(expected)
        {
            close(actual, factor * reference, 100.0);
        }
        close(r.bimoment.unwrap_or(0.0), 0.0, 1.0);
    }
}

#[test]
fn fixed_warping_and_mapped_distributed_reactions() {
    check_fixed_member_loads("distributed", true);
}

#[test]
fn fixed_warping_and_mapped_point_reactions() {
    check_fixed_member_loads("point", true);
}

#[test]
fn fixed_warping_and_mapped_thermal_reactions() {
    check_fixed_member_loads("thermal", true);
    check_fixed_member_loads("thermal", false);
}
