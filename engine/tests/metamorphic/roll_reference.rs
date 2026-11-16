use dedaliano_engine::types::{AnalysisResults3D, SolverInput3D, SolverLoad3D};
type V = [f64; 3];
type Q = [f64; 4];
fn dot(a: V, b: V) -> f64 {
    a.into_iter().zip(b).map(|(a, b)| a * b).sum()
}
fn cross(a: V, b: V) -> V {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn add(a: V, b: V) -> V {
    std::array::from_fn(|i| a[i] + b[i])
}
fn scale(a: V, b: f64) -> V {
    a.map(|a| a * b)
}
fn conjugate(q: Q) -> Q {
    [q[0], -q[1], -q[2], -q[3]]
}
fn unit(q: Q) -> Q {
    let n = q.into_iter().fold(0.0, f64::hypot);
    q.map(|a| a / n)
}
fn product(a: Q, b: Q) -> Q {
    let av = [a[1], a[2], a[3]];
    let bv = [b[1], b[2], b[3]];
    let v = add(add(scale(bv, a[0]), scale(av, b[0])), cross(av, bv));
    [a[0] * b[0] - dot(av, bv), v[0], v[1], v[2]]
}
fn quaternion(v: V) -> Q {
    let n = dot(v, v).sqrt();
    let sinc = if n == 0.0 { 0.5 } else { (n / 2.0).sin() / n };
    [(n / 2.0).cos(), v[0] * sinc, v[1] * sinc, v[2] * sinc]
}
fn rotate(q: Q, v: V) -> V {
    let r = product(product(q, [0.0, v[0], v[1], v[2]]), conjugate(q));
    [r[1], r[2], r[3]]
}
fn logarithm(q: Q) -> V {
    let q = if q[0] < 0.0 { q.map(|x| -x) } else { q };
    let v = [q[1], q[2], q[3]];
    let n = dot(v, v).sqrt();
    scale(
        v,
        if n == 0.0 {
            2.0
        } else {
            2.0 * n.atan2(q[0]) / n
        },
    )
}

pub(crate) fn verify(s: &SolverInput3D, r: &AnalysisResults3D, axes: [V; 3]) -> Result<(), String> {
    let mut forces = std::collections::BTreeMap::<usize, V>::new();
    let mut moments = forces.clone();
    for element in s.elements.values() {
        assert_eq!(element.elem_type, "frame");
        let ni = &s.nodes[&element.node_i.to_string()];
        let nj = &s.nodes[&element.node_j.to_string()];
        let ui = r
            .displacements
            .iter()
            .find(|d| d.node_id == ni.id)
            .ok_or("missing node")?;
        let uj = r
            .displacements
            .iter()
            .find(|d| d.node_id == nj.id)
            .ok_or("missing node")?;
        let d0 = [nj.x - ni.x, nj.y - ni.y, nj.z - ni.z];
        let l0 = dot(d0, d0).sqrt();
        let du = [uj.ux - ui.ux, uj.uy - ui.uy, uj.uz - ui.uz];
        let chord = add(d0, du);
        let ln = dot(chord, chord).sqrt();
        let ex = scale(chord, 1.0 / ln);
        let qi = quaternion([ui.rx, ui.ry, ui.rz]);
        let qj = quaternion([uj.rx, uj.ry, uj.rz]);
        let qmean = unit(std::array::from_fn(|i| qi[i] + qj[i]));
        let emean = rotate(qmean, axes[0]);
        let turn = cross(emean, ex);
        let align = unit([1.0 + dot(emean, ex), turn[0], turn[1], turn[2]]);
        let qc = product(align, qmean);
        let current = axes.map(|a| rotate(qc, a));
        let natural = |q| {
            let v = logarithm(product(conjugate(qc), q));
            axes.map(|a| dot(a, v))
        };
        let ti = natural(qi);
        let tj = natural(qj);
        let section = &s.sections[&element.section_id.to_string()];
        let mat = &s.materials[&element.material_id.to_string()];
        let e = mat.e * 1000.0;
        let elongation = (2.0 * dot(d0, du) + dot(du, du)) / (ln + l0);
        let n = e * section.a / l0 * elongation;
        let torque = (e / (2.0 * (1.0 + mat.nu)) * section.j / l0
            + n * (section.iy + section.iz) / section.a / ln)
            * (tj[0] - ti[0]);
        let mi = [
            -torque,
            e * section.iy / l0 * (4.0 * ti[1] + 2.0 * tj[1]),
            e * section.iz / l0 * (4.0 * ti[2] + 2.0 * tj[2]),
        ];
        let mj = [
            torque,
            e * section.iy / l0 * (2.0 * ti[1] + 4.0 * tj[1]),
            e * section.iz / l0 * (2.0 * ti[2] + 4.0 * tj[2]),
        ];
        let local = [n, -(mi[2] + mj[2]) / ln, (mi[1] + mj[1]) / ln];
        let global = |v: V| (0..3).fold([0.0; 3], |sum, k| add(sum, scale(current[k], v[k])));
        let f = global(local);
        for (node, f, m) in [(ni.id, scale(f, -1.0), global(mi)), (nj.id, f, global(mj))] {
            *forces.entry(node).or_default() = add(*forces.get(&node).unwrap_or(&[0.0; 3]), f);
            *moments.entry(node).or_default() = add(*moments.get(&node).unwrap_or(&[0.0; 3]), m);
        }
    }
    let mut force_scale: f64 = 0.0;
    for load in &s.loads {
        let SolverLoad3D::Nodal(load) = load else {
            panic!("nodal")
        };
        let f = [load.fx, load.fy, load.fz];
        let m = [load.mx, load.my, load.mz];
        force_scale = force_scale.max(dot(f, f).sqrt());
        *forces.entry(load.node_id).or_default() = add(forces[&load.node_id], scale(f, -1.0));
        *moments.entry(load.node_id).or_default() = add(moments[&load.node_id], scale(m, -1.0));
    }
    for reaction in &r.reactions {
        *forces.entry(reaction.node_id).or_default() = add(
            forces[&reaction.node_id],
            scale([reaction.fx, reaction.fy, reaction.fz], -1.0),
        );
        *moments.entry(reaction.node_id).or_default() = add(
            moments[&reaction.node_id],
            scale([reaction.mx, reaction.my, reaction.mz], -1.0),
        );
    }
    let length = s
        .nodes
        .values()
        .flat_map(|a| {
            s.nodes
                .values()
                .map(move |b| (b.x - a.x).hypot(b.y - a.y).hypot(b.z - a.z))
        })
        .fold(0.0_f64, f64::max);
    for (family, scale) in [(&forces, force_scale), (&moments, force_scale * length)] {
        for (node, value) in family {
            if value
                .iter()
                .any(|v| !v.is_finite() || v.abs() > 1e-9 * scale)
            {
                return Err(format!(
                    "independent rolled member equilibrium at {node}: {value:?}, scale {scale}"
                ));
            }
        }
    }
    Ok(())
}
