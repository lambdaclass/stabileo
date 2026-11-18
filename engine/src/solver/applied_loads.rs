use crate::types::*;
use std::collections::HashMap;

pub(super) fn plane(input: &SolverInput, loads: &[SolverLoad]) -> Vec<Vec<f64>> {
    let canonical_loads = super::member_loads::plane(input, loads);
    let loads = canonical_loads.as_ref();

    let nodes: HashMap<_, _> = input.nodes.values().map(|n| (n.id, n)).collect();
    let elements: HashMap<_, _> = input.elements.values().map(|e| (e.id, e)).collect();
    loads
        .iter()
        .filter_map(|load| {
            let (id, qi, qj, a, b, point, axial) = match load {
                SolverLoad::Nodal(n) => return Some(vec![n.fx, n.fz]),
                SolverLoad::Distributed(d) => (d.element_id, d.q_i, d.q_j, d.a, d.b, None, false),
                SolverLoad::AxialDistributed(d) => {
                    (d.element_id, d.q_i, d.q_j, d.a, d.b, None, true)
                }
                SolverLoad::PointOnElement(p) => (
                    p.element_id,
                    0.0,
                    0.0,
                    None,
                    None,
                    Some((p.px.unwrap_or(0.0), p.p)),
                    false,
                ),
                SolverLoad::Thermal(_) => return None,
            };
            let e = elements[&id];
            let i = nodes[&e.node_i];
            let j = nodes[&e.node_j];
            let dx = j.x - i.x;
            let dz = j.z - i.z;
            let l = dx.hypot(dz);
            let total =
                crate::element::distributed_resultant(qi, qj, a.unwrap_or(0.0), b.unwrap_or(l));
            let (px, py) = point.unwrap_or(if axial { (total, 0.0) } else { (0.0, total) });
            Some(vec![(dx / l) * px - (dz / l) * py, (dz / l) * px + (dx / l) * py])
        })
        .collect()
}

pub(super) fn space(input: &SolverInput3D, loads: &[SolverLoad3D]) -> Vec<Vec<f64>> {
    let canonical_loads = super::member_loads::space(input, loads);
    let loads = canonical_loads.as_ref();

    let nodes: HashMap<_, _> = input.nodes.values().map(|n| (n.id, n)).collect();
    let elements: HashMap<_, _> = input.elements.values().map(|e| (e.id, e)).collect();
    let mut out = Vec::new();
    let surface = Surfaces::new(input);
    for load in loads {
        let (id, force) = match load {
            SolverLoad3D::Nodal(n) => {
                out.push(vec![n.fx, n.fy, n.fz]);
                continue;
            }
            SolverLoad3D::Distributed(d) => {
                let e = elements[&d.element_id];
                let i = nodes[&e.node_i];
                let j = nodes[&e.node_j];
                let l = (j.x - i.x).hypot(j.y - i.y).hypot(j.z - i.z);
                let (a, b) = (d.a.unwrap_or(0.0), d.b.unwrap_or(l));
                (
                    d.element_id,
                    [
                        crate::element::distributed_resultant(d.q_xi, d.q_xj, a, b),
                        crate::element::distributed_resultant(d.q_yi, d.q_yj, a, b),
                        crate::element::distributed_resultant(d.q_zi, d.q_zj, a, b),
                    ],
                )
            }
            SolverLoad3D::PointOnElement(p) => (p.element_id, [p.px, p.py, p.pz]),
            SolverLoad3D::Thermal(_) | SolverLoad3D::Bimoment(_) => continue,
            _ => {
                out.extend(surface.forces(load));
                continue;
            }
        };
        let e = elements[&id];
        let i = nodes[&e.node_i];
        let j = nodes[&e.node_j];
        let (ex, ey, ez) = crate::element::compute_local_axes_3d(
            i.x,
            i.y,
            i.z,
            j.x,
            j.y,
            j.z,
            e.local_yx,
            e.local_yy,
            e.local_yz,
            e.roll_angle,
            input.left_hand.unwrap_or(false),
        );
        out.push(
            (0..3)
                .map(|k| ex[k] * force[0] + ey[k] * force[1] + ez[k] * force[2])
                .collect(),
        );
    }

    out
}

pub(super) fn replace(eq: &mut EquilibriumSummary, forces: Vec<Vec<f64>>) {
    let dimensions = forces.first().map_or(
        if eq.applied_force_sum.len() == 3 {
            2
        } else {
            3
        },
        Vec::len,
    );
    for k in 0..dimensions {
        let (mut sum, mut correction) = (0.0_f64, 0.0_f64);
        for force in &forces {
            let value = force[k];
            let next = sum + value;
            correction += if sum.abs() >= value.abs() {
                (sum - next) + value
            } else {
                (value - next) + sum
            };
            sum = next;
        }
        eq.applied_force_sum[k] = sum + correction;
    }
    eq.applied_force_components = forces.into_iter().flatten().collect();
    let force_imbalance = (0..dimensions)
        .map(|k| (eq.applied_force_sum[k] + eq.reaction_force_sum[k]).abs())
        .fold(0.0, f64::max);
    eq.max_imbalance = eq.max_imbalance.max(force_imbalance);
    let peak = eq.applied_force_sum[..dimensions]
        .iter()
        .chain(&eq.reaction_force_sum[..dimensions])
        .map(|v| v.abs())
        .fold(1.0, f64::max);
    eq.equilibrium_ok &= force_imbalance < 1e-6 * peak;
}

type V = [f64; 3];
fn sub(a: V, b: V) -> V {
    std::array::from_fn(|k| a[k] - b[k])
}
fn cross(a: V, b: V) -> V {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn dot(a: V, b: V) -> f64 {
    (0..3).map(|k| a[k] * b[k]).sum()
}
fn unit(a: V) -> V {
    let l = dot(a, a).sqrt();
    a.map(|v| v / l)
}
fn scaled(a: V, s: f64) -> Vec<f64> {
    a.map(|v| v * s).to_vec()
}
fn quad_derivatives(x: f64, y: f64) -> ([f64; 4], [f64; 4]) {
    (
        [
            -(1.0 - y) / 4.0,
            (1.0 - y) / 4.0,
            (1.0 + y) / 4.0,
            -(1.0 + y) / 4.0,
        ],
        [
            -(1.0 - x) / 4.0,
            -(1.0 + x) / 4.0,
            (1.0 + x) / 4.0,
            (1.0 - x) / 4.0,
        ],
    )
}
fn surface_normal<const N: usize>(coords: &[V; N], dx: [f64; N], dy: [f64; N]) -> V {
    let tangent = |d: [f64; N]| std::array::from_fn(|k| (0..N).map(|i| d[i] * coords[i][k]).sum());
    cross(tangent(dx), tangent(dy))
}
fn quadrature(high: bool) -> Vec<(f64, f64)> {
    if high {
        let g = (3.0_f64 / 5.0).sqrt();
        vec![(-g, 5.0 / 9.0), (0.0, 8.0 / 9.0), (g, 5.0 / 9.0)]
    } else {
        let g = 1.0 / 3.0_f64.sqrt();
        vec![(-g, 1.0), (g, 1.0)]
    }
}
fn normals<const N: usize>(coords: &[V; N], high: bool) -> Vec<(V, f64)> {
    let mut out = Vec::new();
    for (x, wx) in quadrature(high) {
        for (y, wy) in quadrature(high) {
            let normal = if high {
                let (dx, dy) = crate::element::quad9::shape_derivatives_9(x, y);
                let c: [V; 9] = std::array::from_fn(|i| coords[i]);
                surface_normal(&c, dx, dy)
            } else {
                let (dx, dy) = quad_derivatives(x, y);
                let c: [V; 4] = std::array::from_fn(|i| coords[i]);
                surface_normal(&c, dx, dy)
            };
            out.push((normal, wx * wy));
        }
    }
    out
}
struct Surfaces {
    quads: HashMap<usize, ([V; 4], f64)>,
    quad9s: HashMap<usize, ([V; 9], f64)>,
    curved: HashMap<usize, ([V; 4], f64, Option<[V; 4]>)>,
    solids: HashMap<usize, [V; 8]>,
    plates: HashMap<usize, [V; 3]>,
}
impl Surfaces {
    fn new(input: &SolverInput3D) -> Self {
        let nodes: HashMap<_, _> = input
            .nodes
            .values()
            .map(|n| (n.id, [n.x, n.y, n.z]))
            .collect();
        Self {
            quads: input
                .quads
                .values()
                .map(|e| (e.id, (e.nodes.map(|n| nodes[&n]), e.thickness)))
                .collect(),
            quad9s: input
                .quad9s
                .values()
                .map(|e| (e.id, (e.nodes.map(|n| nodes[&n]), e.thickness)))
                .collect(),
            curved: input
                .curved_shells
                .values()
                .map(|e| (e.id, (e.nodes.map(|n| nodes[&n]), e.thickness, e.normals)))
                .collect(),
            solids: input
                .solid_shells
                .values()
                .map(|e| (e.id, e.nodes.map(|n| nodes[&n])))
                .collect(),
            plates: input
                .plates
                .values()
                .map(|e| (e.id, e.nodes.map(|n| nodes[&n])))
                .collect(),
        }
    }
    fn flat<const N: usize>(
        &self,
        c: &[V; N],
        high: bool,
        pressure: f64,
        weight: Option<(f64, V)>,
    ) -> Vec<Vec<f64>> {
        let n = unit(cross(sub(c[2], c[0]), sub(c[3], c[1])));
        normals(c, high)
            .into_iter()
            .map(|(normal, w)| {
                let area = dot(normal, n).abs() * w;
                if let Some((mass, g)) = weight {
                    scaled(g, mass * area)
                } else {
                    scaled(n, pressure * area)
                }
            })
            .collect()
    }
    fn edge<const N: usize>(
        &self,
        c: &[V; N],
        edge: usize,
        qn: f64,
        qt: f64,
        dirs: Option<[V; 4]>,
    ) -> Vec<Vec<f64>> {
        let i = edge % 4;
        let j = (i + 1) % 4;
        let v = sub(c[j], c[i]);
        let l = dot(v, v).sqrt();
        let t = unit(v);
        if let Some(dirs) = dirs {
            quadrature(false)
                .into_iter()
                .map(|(s, w)| {
                    let u = (s + 1.0) / 2.0;
                    let d = std::array::from_fn(|k| (1.0 - u) * dirs[i][k] + u * dirs[j][k]);
                    let n = unit(cross(t, unit(d)));
                    (0..3)
                        .map(|k| (qn * n[k] + qt * t[k]) * l * w / 2.0)
                        .collect()
                })
                .collect()
        } else {
            let n = unit(cross(t, unit(cross(sub(c[2], c[0]), sub(c[3], c[1])))));
            vec![(0..3).map(|k| (qn * n[k] + qt * t[k]) * l).collect()]
        }
    }
    fn forces(&self, load: &SolverLoad3D) -> Vec<Vec<f64>> {
        match load {
            SolverLoad3D::Pressure(p) => {
                let c = self.plates[&p.element_id];
                vec![scaled(
                    cross(sub(c[1], c[0]), sub(c[2], c[0])),
                    p.pressure / 2.0,
                )]
            }
            SolverLoad3D::QuadPressure(p) => {
                self.flat(&self.quads[&p.element_id].0, false, p.pressure, None)
            }
            SolverLoad3D::Quad9Pressure(p) => {
                self.flat(&self.quad9s[&p.element_id].0, true, p.pressure, None)
            }
            SolverLoad3D::QuadSelfWeight(p) => {
                let (c, h) = &self.quads[&p.element_id];
                self.flat(
                    c,
                    false,
                    0.0,
                    Some((p.density / 1000.0 * h, [p.gx, p.gy, p.gz])),
                )
            }
            SolverLoad3D::Quad9SelfWeight(p) => {
                let (c, h) = &self.quad9s[&p.element_id];
                self.flat(
                    c,
                    true,
                    0.0,
                    Some((p.density / 1000.0 * h, [p.gx, p.gy, p.gz])),
                )
            }
            SolverLoad3D::CurvedShellPressure(p) => normals(&self.curved[&p.element_id].0, false)
                .into_iter()
                .map(|(n, w)| scaled(n, p.pressure * w))
                .collect(),
            SolverLoad3D::CurvedShellSelfWeight(p) => {
                let (c, h, _) = &self.curved[&p.element_id];
                normals(c, false)
                    .into_iter()
                    .map(|(n, w)| {
                        scaled(
                            [p.gx, p.gy, p.gz],
                            p.density / 1000.0 * h * dot(n, n).sqrt() * w,
                        )
                    })
                    .collect()
            }
            SolverLoad3D::SolidShellPressure(p) => {
                let c = self.solids[&p.element_id];
                let top = [c[4], c[5], c[6], c[7]];
                normals(&top, false)
                    .into_iter()
                    .map(|(n, w)| scaled(n, -p.pressure * w))
                    .collect()
            }
            SolverLoad3D::SolidShellSelfWeight(p) => {
                let c = self.solids[&p.element_id];
                crate::element::solid_shell::gauss_2x2x2()
                    .into_iter()
                    .map(|(x, y, z, w)| {
                        let d = crate::element::solid_shell::shape_derivatives_hex8(x, y, z);
                        let (_, _, det) = crate::element::solid_shell::jacobian_3d(&c, &d);
                        scaled([p.gx, p.gy, p.gz], p.density / 1000.0 * det.abs() * w)
                    })
                    .collect()
            }
            SolverLoad3D::QuadEdge(p) => {
                self.edge(&self.quads[&p.element_id].0, p.edge, p.qn, p.qt, None)
            }
            SolverLoad3D::Quad9Edge(p) => {
                self.edge(&self.quad9s[&p.element_id].0, p.edge, p.qn, p.qt, None)
            }
            SolverLoad3D::CurvedShellEdge(p) => {
                let (c, _, dirs) = &self.curved[&p.element_id];
                self.edge(
                    c,
                    p.edge,
                    p.qn,
                    p.qt,
                    Some(dirs.unwrap_or_else(|| {
                        crate::element::curved_shell::compute_element_directors(c)
                    })),
                )
            }
            SolverLoad3D::PlateThermal(_)
            | SolverLoad3D::QuadThermal(_)
            | SolverLoad3D::Quad9Thermal(_)
            | SolverLoad3D::CurvedShellThermal(_) => Vec::new(),
            SolverLoad3D::Nodal(_)
            | SolverLoad3D::Distributed(_)
            | SolverLoad3D::PointOnElement(_)
            | SolverLoad3D::Thermal(_)
            | SolverLoad3D::Bimoment(_) => unreachable!(),
        }
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issue_2222_independent_force_check_preserves_the_wrench_verdict() {
        for dimensions in [2, 3] {
            for imbalance in [0.0, 0.5e-6, 1e-6, 2e-6] {
                for prior_ok in [false, true] {
                    let mut eq = EquilibriumSummary {
                        relative_residual: 0.0, residual_ok: true,
                        applied_force_components: vec![],
                        applied_force_sum: vec![0.0; if dimensions == 2 {3} else {6}],
                        reaction_force_sum: vec![0.0; if dimensions == 2 {3} else {6}],
                        max_imbalance: 0.01, equilibrium_ok: prior_ok,
                    };
                    let mut force = vec![0.0; dimensions];
                    force[0] = imbalance;
                    replace(&mut eq, vec![force]);
                    assert_eq!(eq.equilibrium_ok, prior_ok && imbalance < 1e-6);
                    assert_eq!(eq.max_imbalance, 0.01);
                }
            }
        }
    }
    #[test]
    fn issue_2222_compensated_force_totals_keep_small_terms() {
        for dimensions in [2, 3] {
            for axis in 0..dimensions {
                for values in [[1e16, 1.0, -1e16], [-1e16, 1.0, 1e16], [1.0, 1e16, -1e16]] {
                    for imbalance in [0.0, 0.5e-6, 1e-6, 2e-6] {
                        let mut eq = EquilibriumSummary {
                            relative_residual: 0.0, residual_ok: true, applied_force_components: vec![],
                            applied_force_sum: vec![0.0; if dimensions == 2 { 3 } else { 6 }],
                            reaction_force_sum: vec![0.0; if dimensions == 2 { 3 } else { 6 }],
                            max_imbalance: 0.0, equilibrium_ok: true,
                        };
                        eq.reaction_force_sum[axis] = -1.0 + imbalance;
                        replace(&mut eq, values.into_iter().map(|v| {
                            let mut f = vec![0.0; dimensions]; f[axis] = v; f
                        }).collect());
                        assert_eq!(eq.applied_force_sum[axis], 1.0);
                        assert_eq!(eq.equilibrium_ok, (1.0 + (-1.0 + imbalance)).abs() < 1e-6);
                    }
                }
            }
        }
    }

}
