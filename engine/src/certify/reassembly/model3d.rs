//! Re-assembly of a 3D model (`SolverInput3D`) from its JSON fields.
//!
//! Conventions of the 3D model (the meaning of the input): DOFs (ux, uy, uz,
//! rx, ry, rz), translations only when the model has no frame member; member
//! local x from i to j; local axes from the reference vector
//! (`localYx/y/z`: local z ∥ x × ref, local y = z × x) or, by default, local
//! z = global Z made perpendicular to x (global X for members with
//! |x·Z| > 0.999); then the roll angle (degrees, about local x:
//! y' = cos·y + sin·z, z' = −sin·y + cos·z), then `leftHand` negates local y.
//! E in MPa (×1000), G = E/(2(1+ν)); shear area `asY` pairs with Iy (bending
//! in the local x–z plane), `asZ` with Iz; `θy = −dw/dx`. Thermal: α = the load's
//! `alpha`, else 12e-6; depths h_y = `depthY`, else √(12·Iz/A), h_z = `depthZ`,
//! else √(12·Iy/A); `dtGradientY` gives θz-curvature
//! +α·Δt/h_y, `dtGradientZ` θy-curvature +α·Δt/h_z. Member loads in local
//! axes. Inclined supports restrain the translation along their normal.

use std::collections::HashMap;

use super::element::*;
use super::ia::*;
use super::model2d::{check_member_load_ids, linear_mpc, missing_dof_load, thermal_moment};
use super::system::*;
use crate::types::*;

const ALPHA: f64 = 12e-6;

fn iabs(x: I) -> I {
    if x.lo >= 0.0 {
        x
    } else if x.hi <= 0.0 {
        -x
    } else {
        I::new(0.0, x.lo.abs().max(x.hi.abs()))
    }
}

/// Local axes (ex, ey, ez) of a member, as the model defines them.
pub(super) fn local_axes(
    xi: &V3,
    xj: &V3,
    el: &SolverElement3D,
    left_hand: bool,
) -> Result<(V3, V3, V3), String> {
    let d = sub3(xj, xi);
    let ex = unit3(&d);
    if !finite3(&ex) {
        return Err(format!("element {}: zero or ambiguous length", el.id));
    }
    let explicit = match (el.local_yx, el.local_yy, el.local_yz) {
        (Some(a), Some(b), Some(cc)) => {
            let v = [inp(a), inp(b), inp(cc)];
            let mag = norm3(&v);
            match decide_gt(mag, 1e-10) {
                Some(true) => Some([v[0].div(mag), v[1].div(mag), v[2].div(mag)]),
                Some(false) => None,
                None => return Err(format!("element {}: reference vector length ambiguous", el.id)),
            }
        }
        _ => None,
    };
    let (mut ey, mut ez) = match explicit {
        Some(r) => {
            let raw = cross(&ex, &r);
            let m = norm3(&raw);
            let fallback = if m.lo >= 1e-10 {
                false
            } else if m.hi < 1e-10 {
                true
            } else {
                return Err(format!("element {}: reference vector parallel to the axis at rounding level", el.id));
            };
            let ez = if fallback {
                let ax = iabs(ex[0]);
                let fb = if certainly_lt(ax, 0.9) {
                    v3([1.0, 0.0, 0.0])
                } else if ax.lo >= 0.9 {
                    v3([0.0, 1.0, 0.0])
                } else {
                    return Err(format!("element {}: fallback axis ambiguous", el.id));
                };
                unit3(&cross(&ex, &fb))
            } else {
                [raw[0].div(m), raw[1].div(m), raw[2].div(m)]
            };
            (cross(&ez, &ex), ez)
        }
        None => {
            let up = match decide_gt(iabs(ex[2]), 0.999) {
                Some(true) => v3([1.0, 0.0, 0.0]),
                Some(false) => v3([0.0, 0.0, 1.0]),
                None => return Err(format!("element {}: vertical-member switch ambiguous", el.id)),
            };
            let ez0 = unit3(&sub3(&up, &smul3(dot(&ex, &up), &ex)));
            (cross(&ez0, &ex), ez0)
        }
    };
    if let Some(deg) = el.roll_angle {
        let ang = (inp(deg) * pi()).div(c(180.0));
        let (s, co) = sin_cos(ang).ok_or_else(|| format!("element {}: roll angle out of range", el.id))?;
        let ny = add3(&smul3(co, &ey), &smul3(s, &ez));
        let nz = add3(&smul3(-s, &ey), &smul3(co, &ez));
        ey = ny;
        ez = nz;
    }
    if left_hand {
        ey = neg3(&ey);
    }
    if !(finite3(&ey) && finite3(&ez)) {
        return Err(format!("element {}: local axes not finite", el.id));
    }
    Ok((ex, ey, ez))
}

pub(super) fn build(input: &SolverInput3D, loads: &[SolverLoad3D]) -> Result<Model, String> {
    if !input.plates.is_empty()
        || !input.quads.is_empty()
        || !input.quad9s.is_empty()
        || !input.solid_shells.is_empty()
        || !input.curved_shells.is_empty()
    {
        return Err("out of scope: shell and solid elements".into());
    }
    if !input.curved_beams.is_empty() {
        return Err("out of scope: curved beams".into());
    }
    if !input.connectors.is_empty() {
        return Err("out of scope: connector elements".into());
    }
    let has_frame = input.elements.values().any(|e| e.elem_type == "frame");
    let dpn = if has_frame { 6 } else { 3 };
    let left_hand = input.left_hand.unwrap_or(false);
    let node_ids: Vec<usize> = input.nodes.values().map(|n| n.id).collect();
    let nodes: HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();
    if nodes.len() != input.nodes.len() {
        return Err("duplicate node ids".into());
    }
    let mats: HashMap<usize, &SolverMaterial> = input.materials.values().map(|m| (m.id, m)).collect();
    let secs: HashMap<usize, &SolverSection3D> = input.sections.values().map(|s| (s.id, s)).collect();
    let mut model = Model::new(&node_ids, dpn);
    let pos = |n: &SolverNode3D| -> V3 { [inp(n.x), inp(n.y), inp(n.z)] };

    let mut by_elem: HashMap<usize, Vec<&SolverLoad3D>> = HashMap::new();
    for ld in loads {
        let id = match ld {
            SolverLoad3D::Distributed(d) => d.element_id,
            SolverLoad3D::PointOnElement(p) => p.element_id,
            SolverLoad3D::Thermal(t) => t.element_id,
            SolverLoad3D::Nodal(n) => {
                if n.bw.is_some_and(|b| b != 0.0) {
                    return Err("out of scope: bimoment (warping) loads".into());
                }
                continue;
            }
            SolverLoad3D::Bimoment(b) => {
                if b.bimoment != 0.0 {
                    return Err("out of scope: bimoment (warping) loads".into());
                }
                continue;
            }
            _ => return Err("out of scope: shell or solid loads".into()),
        };
        by_elem.entry(id).or_default().push(ld);
    }

    let members: std::collections::HashSet<usize> = input.elements.values().map(|e| e.id).collect();
    check_member_load_ids(by_elem.keys().copied(), &members)?;
    let mut elems: Vec<&SolverElement3D> = input.elements.values().collect();
    elems.sort_by_key(|e| e.id);
    for el in elems {
        let ni = nodes.get(&el.node_i).ok_or("element references a missing node")?;
        let nj = nodes.get(&el.node_j).ok_or("element references a missing node")?;
        let mat = mats.get(&el.material_id).ok_or("missing material")?;
        let sec = secs.get(&el.section_id).ok_or("missing section")?;
        let is_frame = el.elem_type == "frame";
        if !is_frame && el.elem_type != "truss" && el.elem_type != "cable" {
            return Err(format!("out of scope: element type '{}'", el.elem_type));
        }
        if is_frame && sec.cw.is_some_and(|cw| cw > 0.0) {
            return Err("out of scope: warping torsion (sections with Cw)".into());
        }
        let (xi, xj) = (pos(ni), pos(nj));
        let l = norm3(&sub3(&xj, &xi));
        if !certainly_gt(l, 0.0) {
            return Err(format!("element {}: length not certainly positive", el.id));
        }
        let el_loads = by_elem.get(&el.id).map(|v| v.as_slice()).unwrap_or(&[]);
        let needs_axes = is_frame
            || el_loads.iter().any(|ld| match ld {
                SolverLoad3D::Distributed(d) => d.q_yi != 0.0 || d.q_yj != 0.0 || d.q_zi != 0.0 || d.q_zj != 0.0,
                SolverLoad3D::PointOnElement(p) => p.py != 0.0 || p.pz != 0.0,
                _ => false,
            });
        let (ex, ey, ez) = if needs_axes {
            local_axes(&xi, &xj, el, left_hand)?
        } else {
            let ex = unit3(&sub3(&xj, &xi));
            (ex, ex, ex) // ey/ez unused: no transverse stiffness or load
        };
        let e = c(1000.0) * inp(mat.e);
        let nu = inp(mat.nu);
        let g = e.div(c(2.0) * (c(1.0) + nu));
        let area = inp(sec.a);
        let (iy, iz, jt) = (inp(sec.iy), inp(sec.iz), inp(sec.j));
        let mut k = LMat::zeros(12);
        let mut f: LVec = vec![None; 12];
        place_axial(&mut k, 0, 6, (e * area).div(l));
        let plane_of = |i: I, as_: Option<f64>| -> Result<Plane, String> {
            let shear_flex = match as_ {
                Some(a) => {
                    let a = inp(a);
                    if !certainly_gt(a, 0.0) {
                        return Err(format!("element {}: shear area not certainly positive", el.id));
                    }
                    l.div(g * a)
                }
                None => I::ZERO,
            };
            let ei = e * i;
            let phi = if shear_flex == I::ZERO { I::ZERO } else { (c(12.0) * ei * shear_flex).div(l * l.square()) };
            Ok(Plane { ei, shear_flex, phi })
        };
        // (local DOFs, rotation sign, released start, released end, plane)
        let mut planes: Vec<([usize; 4], f64, bool, bool, Plane)> = Vec::new();
        let mut bend_y = false; // y-plane (v, θz) carries bending
        let mut bend_z = false;
        if is_frame {
            if !el.release_t_start && !el.release_t_end {
                place_axial(&mut k, 3, 9, (g * jt).div(l));
            }
            let pz = plane_of(iz, sec.as_z)?;
            let py = plane_of(iy, sec.as_y)?;
            planes.push(([1, 5, 7, 11], 1.0, el.release_mz_start, el.release_mz_end, pz));
            planes.push(([2, 4, 8, 10], -1.0, el.release_my_start, el.release_my_end, py));
            for (idx, s, rs, re, p) in &planes {
                if *rs && *re {
                    continue;
                }
                let b = bending4(p, l).ok_or_else(|| format!("element {}: bending stiffness not finite", el.id))?;
                place_bending(&mut k, *idx, &b, *s);
                if idx[0] == 1 {
                    bend_y = true;
                } else {
                    bend_z = true;
                }
            }
        }
        let (shape_y, shape_z) = {
            let sh = |bends: bool, p: Option<&Plane>| if bends { iie_shapes(p.unwrap().phi, l) } else { lever_shapes(l) };
            (sh(bend_y, planes.first().map(|x| &x.4)), sh(bend_z, planes.get(1).map(|x| &x.4)))
        };
        for ld in el_loads {
            match ld {
                SolverLoad3D::Distributed(dl) => {
                    let a = dl.a.map(inp).unwrap_or(I::ZERO);
                    let b = dl.b.map(inp).unwrap_or(l);
                    if dl.q_xi != 0.0 || dl.q_xj != 0.0 {
                        let ax = axial_dist_enl(l, a, b, inp(dl.q_xi), inp(dl.q_xj));
                        lvec_add(&mut f, 0, ax[0]);
                        lvec_add(&mut f, 6, ax[1]);
                    }
                    if dl.q_yi != 0.0 || dl.q_yj != 0.0 {
                        let v = dist_enl(&shape_y.0, l, a, b, inp(dl.q_yi), inp(dl.q_yj));
                        place_enl(&mut f, [1, 5, 7, 11], &v, 1.0);
                    }
                    if dl.q_zi != 0.0 || dl.q_zj != 0.0 {
                        let v = dist_enl(&shape_z.0, l, a, b, inp(dl.q_zi), inp(dl.q_zj));
                        place_enl(&mut f, [2, 4, 8, 10], &v, -1.0);
                    }
                }
                SolverLoad3D::PointOnElement(pl) => {
                    let a = inp(pl.a);
                    if pl.py != 0.0 {
                        let v = point_enl(&shape_y.0, &shape_y.1, l, a, inp(pl.py), I::ZERO);
                        place_enl(&mut f, [1, 5, 7, 11], &v, 1.0);
                    }
                    if pl.pz != 0.0 {
                        let v = point_enl(&shape_z.0, &shape_z.1, l, a, inp(pl.pz), I::ZERO);
                        place_enl(&mut f, [2, 4, 8, 10], &v, -1.0);
                    }
                }
                SolverLoad3D::Thermal(tl) => {
                    let alpha = tl.alpha.map(inp).unwrap_or_else(|| dec(ALPHA));
                    let n = e * area * alpha * inp(tl.dt_uniform);
                    lvec_add(&mut f, 0, -n);
                    lvec_add(&mut f, 6, n);
                    if is_frame && tl.dt_gradient_y != 0.0 && sec.iz != 0.0 {
                        let m = thermal_moment(e, iz, area, alpha, inp(tl.dt_gradient_y), tl.depth_y.map(inp), el.id)?;
                        lvec_add(&mut f, 5, -m);
                        lvec_add(&mut f, 11, m);
                    }
                    if is_frame && tl.dt_gradient_z != 0.0 && sec.iy != 0.0 {
                        let m = thermal_moment(e, iy, area, alpha, inp(tl.dt_gradient_z), tl.depth_z.map(inp), el.id)?;
                        lvec_add(&mut f, 4, -m);
                        lvec_add(&mut f, 10, m);
                    }
                }
                _ => {}
            }
        }
        // Releases: condense, or drop the moments of a plane that carries none.
        for (idx, _, rs, re, _) in &planes {
            if *rs && *re {
                f[idx[1]] = None;
                f[idx[3]] = None;
                continue;
            }
            if *rs {
                condense(&mut k, Some(&mut f), idx[1]).map_err(|e| format!("element {}: {e}", el.id))?;
            }
            if *re {
                condense(&mut k, Some(&mut f), idx[3]).map_err(|e| format!("element {}: {e}", el.id))?;
            }
        }
        if !is_frame {
            for i in [3, 4, 5, 9, 10, 11] {
                f[i] = None;
            }
        }
        let r = vec![ex.to_vec(), ey.to_vec(), ez.to_vec()];
        let gd = |n: usize, d: usize| model.dof(n, d).expect("node dof");
        let mut blocks = Vec::new();
        for (node, base) in [(el.node_i, 0usize), (el.node_j, 6usize)] {
            blocks.push(Block { local: vec![base, base + 1, base + 2], global: vec![gd(node, 0), gd(node, 1), gd(node, 2)], r: Some(r.clone()) });
            if dpn == 6 {
                blocks.push(Block {
                    local: vec![base + 3, base + 4, base + 5],
                    global: vec![gd(node, 3), gd(node, 4), gd(node, 5)],
                    r: Some(r.clone()),
                });
            }
        }
        let (dofs, kg, fg) = to_global(&k, &f, &blocks);
        let rigid = Rigid { ntrans: 3, nrot: if dpn == 6 { 3 } else { 0 }, delta: sub3(&xj, &xi).to_vec(), handed: if left_hand && needs_axes { -1.0 } else { 1.0 } };
        model.scatter(&dofs, &kg, &fg, Some(rigid));
    }

    for ld in loads {
        if let SolverLoad3D::Nodal(nl) = ld {
            for (d, v) in [nl.fx, nl.fy, nl.fz, nl.mx, nl.my, nl.mz].into_iter().enumerate() {
                if v != 0.0 {
                    let i = model.dof(nl.node_id, d).ok_or_else(|| missing_dof_load(&model, nl.node_id, d))?;
                    model.add_f(i, inp(v));
                }
            }
        }
    }

    let mut kin = Kinematics::new(model.n());
    supports(input, &mut model, &mut kin, dpn)?;
    constraints(input, &model, &mut kin, dpn)?;
    kin.build(&mut model)?;
    Ok(model)
}

fn plain_3d(s: &SolverSupport3D) -> bool {
    !s.is_inclined.unwrap_or(false)
        && !s.rw.unwrap_or(false)
        && [s.normal_x, s.normal_y, s.normal_z].into_iter().all(|v| v.unwrap_or(0.0) == 0.0)
        && [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz, s.kw, s.dx, s.dy, s.dz, s.drx, s.dry, s.drz]
            .into_iter()
            .all(|v| v.unwrap_or(0.0) == 0.0)
}

/// Support fields the model would not use: refused, never dropped.
fn ignored_support_fields_3d(s: &SolverSupport3D, dpn: usize) -> Result<(), String> {
    let nz = |v: Option<f64>| v.unwrap_or(0.0) != 0.0;
    let node = s.node_id;
    if s.rw.unwrap_or(false) || nz(s.kw) {
        return Err(format!("out of scope: warping restraint at node {node}"));
    }
    let inclined = s.is_inclined.unwrap_or(false);
    if !inclined && [s.normal_x, s.normal_y, s.normal_z].into_iter().any(nz) {
        return Err(format!("unsupported: a normal on the support at node {node}, which is not inclined"));
    }
    if dpn < 6 && ([s.krx, s.kry, s.krz].into_iter().any(|k| k.unwrap_or(0.0) > 0.0) || [s.drx, s.dry, s.drz].into_iter().any(nz)) {
        return Err(format!("unsupported: a rotational spring or prescribed rotation at node {node} of a model without rotations"));
    }
    let flags = [s.rx, s.ry, s.rz, s.rrx, s.rry, s.rrz];
    let springs = [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz];
    let pres = [s.dx, s.dy, s.dz, s.drx, s.dry, s.drz];
    for d in 0..6 {
        let used = if inclined {
            // translations: projected on the normal; rotations: by their flags
            d < 3 || flags[d]
        } else {
            flags[d] && springs[d].unwrap_or(0.0) <= 0.0
        };
        if nz(pres[d]) && !used {
            return Err(format!("unsupported: a prescribed displacement on DOF {d} at node {node}, which its support leaves free"));
        }
    }
    Ok(())
}

fn supports(input: &SolverInput3D, model: &mut Model, kin: &mut Kinematics, dpn: usize) -> Result<(), String> {
    let mut at: HashMap<usize, Vec<&SolverSupport3D>> = HashMap::new();
    for s in input.supports.values() {
        at.entry(s.node_id).or_default().push(s);
    }
    let mut nodes: Vec<usize> = at.keys().copied().collect();
    nodes.sort_unstable();
    for node in nodes {
        let sups = &at[&node];
        if model.dof(node, 0).is_none() {
            return Err(format!("support on missing node {node}"));
        }
        let node_dofs: Vec<Option<usize>> = (0..6).map(|d| model.dof(node, d)).collect();
        let dof = |d: usize| node_dofs[d];
        if sups.len() > 1 {
            if !sups.iter().all(|s| plain_3d(s)) {
                return Err(format!("unsupported: several supports on node {node}"));
            }
            for d in 0..dpn {
                if sups.iter().any(|s| [s.rx, s.ry, s.rz, s.rrx, s.rry, s.rrz][d]) {
                    kin.fix(dof(d).unwrap(), I::ZERO);
                }
            }
            continue;
        }
        let s = sups[0];
        ignored_support_fields_3d(s, dpn)?;
        let springs = [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz];
        for (d, k) in springs.iter().enumerate() {
            if let Some(k) = *k {
                if k < 0.0 {
                    return Err(format!("unsupported: negative spring at node {node}"));
                }
                if k > 0.0 && d < dpn {
                    let i = dof(d).unwrap();
                    model.spring(&[i], vec![inp(k)]);
                }
            }
        }
        let flags = [s.rx, s.ry, s.rz, s.rrx, s.rry, s.rrz];
        let pres = [s.dx, s.dy, s.dz, s.drx, s.dry, s.drz];
        if s.is_inclined.unwrap_or(false) {
            let (Some(nx), Some(ny), Some(nz)) = (s.normal_x, s.normal_y, s.normal_z) else {
                return Err(format!("inclined support on node {node} without a normal"));
            };
            let n = [inp(nx), inp(ny), inp(nz)];
            match decide_gt(norm3(&n), 1e-12) {
                Some(true) => {}
                _ => return Err(format!("inclined support on node {node}: normal not certainly non-zero")),
            }
            // Tangent plane spanned exactly by t1 = n × r, t2 = n × t1 (scaled
            // by f64 constants, which keeps the span exact).
            let nm = [mid(n[0]), mid(n[1]), mid(n[2])];
            let nn = (nm[0] * nm[0] + nm[1] * nm[1] + nm[2] * nm[2]).sqrt();
            let r = if (nm[0] / nn).abs() < 0.9 { v3([1.0, 0.0, 0.0]) } else { v3([0.0, 1.0, 0.0]) };
            let t1 = cross(&n, &r);
            let s1 = 1.0 / mid(norm3(&t1));
            let t1 = smul3(c(s1), &t1);
            let t2 = cross(&n, &t1);
            let s2 = 1.0 / mid(norm3(&t2));
            let t2 = smul3(c(s2), &t2);
            // Particular solution p = n (n·d)/(n·n): n·u = n·d.
            let dvec = [inp(s.dx.unwrap_or(0.0)), inp(s.dy.unwrap_or(0.0)), inp(s.dz.unwrap_or(0.0))];
            let lam = dot(&n, &dvec).div(dot(&n, &n));
            let p = smul3(lam, &n);
            kin.incline(
                vec![dof(0).unwrap(), dof(1).unwrap(), dof(2).unwrap()],
                vec![t1.to_vec(), t2.to_vec()],
                p.to_vec(),
            );
            for d in 3..dpn {
                if flags[d] {
                    kin.fix(dof(d).unwrap(), pres[d].map(inp).unwrap_or(I::ZERO));
                }
            }
            continue;
        }
        for d in 0..dpn {
            let spring = springs[d].unwrap_or(0.0) > 0.0;
            if flags[d] && !spring {
                kin.fix(dof(d).unwrap(), pres[d].map(inp).unwrap_or(I::ZERO));
            }
        }
    }
    Ok(())
}

/// Constraint equations with rigid-body kinematics u_s = u_m + θ_m × (x_s − x_m).
fn constraints(input: &SolverInput3D, model: &Model, kin: &mut Kinematics, dpn: usize) -> Result<(), String> {
    let nodes: HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();
    let off = |m: usize, s: usize| -> Result<V3, String> {
        let (a, b) = (nodes.get(&m).ok_or("constraint node missing")?, nodes.get(&s).ok_or("constraint node missing")?);
        let dd = |p: f64, q: f64| if p == q { I::ZERO } else { inp(q) - inp(p) };
        Ok([dd(a.x, b.x), dd(a.y, b.y), dd(a.z, b.z)])
    };
    let dof = |n: usize, d: usize| model.dof(n, d);
    // A DOF a constraint names must exist: never drop part of a constraint.
    let need = |n: usize, d: usize| dof(n, d).ok_or_else(|| format!("unsupported: a constraint names DOF {d} of node {n}, which the model does not have"));
    // Translation d of the slave: u_m,d + (θ × r)_d.
    let rigid = |m: usize, d: usize, r: &V3| -> Result<Vec<(usize, I)>, String> {
        let mut t = vec![(need(m, d)?, c(1.0))];
        // (θ × r)_x = θy rz − θz ry ; _y = θz rx − θx rz ; _z = θx ry − θy rx
        let terms: [(usize, I); 2] = match d {
            0 => [(4, r[2]), (5, -r[1])],
            1 => [(5, r[0]), (3, -r[2])],
            2 => [(3, r[1]), (4, -r[0])],
            _ => return Ok(t),
        };
        for (rd, coef) in terms {
            if coef == I::ZERO {
                continue;
            }
            let x = dof(m, rd).ok_or_else(|| format!("unsupported: a rigid offset from node {m}, which has no rotations in this model"))?;
            t.push((x, coef));
        }
        Ok(t)
    };
    for con in &input.constraints {
        match con {
            Constraint::RigidLink(rl) => {
                let dofs: Vec<usize> = if rl.dofs.is_empty() { (0..dpn.min(3)).collect() } else { rl.dofs.clone() };
                let r = off(rl.master_node, rl.slave_node)?;
                for d in dofs {
                    kin.equation(need(rl.slave_node, d)?, rigid(rl.master_node, d, &r)?);
                }
            }
            Constraint::Diaphragm(dia) => {
                // In-plane rigid motion: the plane's two translations follow
                // the master's translation and its rotation about the normal,
                // and the slave's rotation about the normal is the master's.
                if dpn != 6 {
                    return Err("unsupported: diaphragm in a model without rotations".into());
                }
                let ds: [usize; 2] = match dia.plane.as_str() {
                    "XZ" => [0, 2],
                    "YZ" => [1, 2],
                    _ => [0, 1],
                };
                for &sn in &dia.slave_nodes {
                    if sn == dia.master_node {
                        return Err("unsupported: diaphragm slave equal to its master".into());
                    }
                    let mut r = off(dia.master_node, sn)?;
                    // Only the in-plane offset enters (rotation about the normal).
                    let normal = 3 - ds[0] - ds[1];
                    r[normal] = I::ZERO;
                    for d in ds {
                        let mut t = vec![(need(dia.master_node, d)?, c(1.0))];
                        // rotation about the plane normal (DOF 3 + normal): (e_normal × r)_d
                        let e_n = {
                            let mut v = [I::ZERO; 3];
                            v[normal] = c(1.0);
                            v
                        };
                        let coef = cross(&e_n, &r)[d];
                        if coef != I::ZERO {
                            t.push((need(dia.master_node, 3 + normal)?, coef));
                        }
                        kin.equation(need(sn, d)?, t);
                    }
                    kin.equation(need(sn, 3 + normal)?, vec![(need(dia.master_node, 3 + normal)?, c(1.0))]);
                }
            }
            Constraint::EqualDOF(eq) => {
                for &d in &eq.dofs {
                    kin.equation(need(eq.slave_node, d)?, vec![(need(eq.master_node, d)?, c(1.0))]);
                }
            }
            Constraint::EccentricConnection(ec) => {
                let r = [inp(ec.offset_x), inp(ec.offset_y), inp(ec.offset_z)];
                for d in 0..dpn.min(6) {
                    if ec.releases.get(d).copied().unwrap_or(false) {
                        continue;
                    }
                    kin.equation(need(ec.slave_node, d)?, rigid(ec.master_node, d, &r)?);
                }
            }
            Constraint::LinearMPC(mpc) => linear_mpc(mpc, model, kin)?,
        }
    }
    Ok(())
}
