//! Superconvergent patch recovery (Zienkiewicz & Zhu 1992), on shells.
//!
//! For every node, the elements around it are split into patches that may share a smooth
//! stress field: same family, material and thickness, and normals within `CREASE_ANGLE_DEG` of
//! each other (a fold, a wall–slab junction or a change of section is a legitimate stress
//! discontinuity and is never smoothed across). Over each patch a polynomial is fitted by least
//! squares to the element stresses at their integration points — in the patch's tangent-plane
//! coordinates (s, t), times (1, ζ) through the thickness for shells; in (s, t, w) for
//! solid-shells — separately for each component of the global stress tensor, so elements with
//! different local axes are compared in one frame. The fit evaluated at the node is the
//! recovered nodal value for that patch's elements.
//!
//! Degree: linear for the bilinear and linear families, quadratic for MITC9. A patch with too
//! few or too nearly coplanar samples falls back to a lower degree, ultimately to the patch
//! average.

use std::collections::HashMap;

use super::samples::{cross3, dot, norm3, sub, ElemSamples, Family};

/// Normals of neighbouring elements more than this far apart are treated as a fold.
pub const CREASE_ANGLE_DEG: f64 = 30.0;

/// Recovered value at an element node: σ*(ζ) = a0 + a1·ζ (global tensor components, with ζ in
/// that element's own orientation; a1 = 0 for solid-shells).
pub type NodeValue = ([f64; 6], [f64; 6]);

/// A recovery patch: the node, and its elements as (element index, local node index,
/// orientation sign relative to the patch's seed).
pub type Patch = (usize, Vec<(usize, usize, f64)>);

/// The recovery patches of every node: the elements around it split by family, material,
/// thickness and normals within `CREASE_ANGLE_DEG` of the patch's first element. The one
/// definition of a patch: recovery fits over these, and an element alone in all of its patches
/// has nothing to be compared with (`isolated`).
pub fn patches(elems: &[ElemSamples]) -> Vec<Patch> {
    let mut incidence: HashMap<usize, Vec<(usize, usize)>> = HashMap::new();
    for (ei, e) in elems.iter().enumerate() {
        for (li, &n) in e.nodes.iter().enumerate() {
            incidence.entry(n).or_default().push((ei, li));
        }
    }
    let cos_crease = CREASE_ANGLE_DEG.to_radians().cos();
    let mut node_ids: Vec<usize> = incidence.keys().copied().collect();
    node_ids.sort_unstable();
    let mut out = Vec::new();
    for nid in node_ids {
        let mut groups: Vec<(usize, Vec<(usize, usize, f64)>)> = Vec::new();
        for &(ei, li) in &incidence[&nid] {
            let e = &elems[ei];
            let slot = groups.iter_mut().find(|(seed, _)| {
                let s = &elems[*seed];
                s.group_key() == e.group_key() && dot(&s.normal, &e.normal).abs() >= cos_crease
            });
            match slot {
                Some((seed, members)) => {
                    let sign = if dot(&elems[*seed].normal, &e.normal) >= 0.0 { 1.0 } else { -1.0 };
                    members.push((ei, li, sign));
                }
                None => groups.push((ei, vec![(ei, li, 1.0)])),
            }
        }
        out.extend(groups.into_iter().map(|(_, m)| (nid, m)));
    }
    out
}

/// Per element: whether it is alone in every recovery patch it belongs to (its "recovered"
/// field is then its own, and its indicator says nothing).
pub fn isolated(elems: &[ElemSamples], patches: &[Patch]) -> Vec<bool> {
    let mut alone = vec![true; elems.len()];
    for (_, members) in patches {
        if members.len() > 1 {
            for &(ei, _, _) in members {
                alone[ei] = false;
            }
        }
    }
    alone
}

/// Recover nodal stresses over `patches`; `out[e][i]` belongs to node `elems[e].nodes[i]`.
pub fn recover(elems: &[ElemSamples], coords: &HashMap<usize, [f64; 3]>, patches: &[Patch]) -> Vec<Vec<NodeValue>> {
    let mut out: Vec<Vec<NodeValue>> = elems.iter().map(|e| vec![([0.0; 6], [0.0; 6]); e.nodes.len()]).collect();
    for (nid, members) in patches {
        let Some(xn) = coords.get(nid) else { continue };
        let family = elems[members[0].0].family;
        let (a0, a1) = fit_patch(elems, members, xn, family);
        for &(ei, li, sign) in members {
            out[ei][li] = (a0, a1.map(|v| v * sign));
        }
    }
    out
}

fn fit_patch(elems: &[ElemSamples], members: &[(usize, usize, f64)], xn: &[f64; 3], family: Family) -> NodeValue {
    let mut nsum = [0.0; 3];
    for &(ei, _, sign) in members {
        for k in 0..3 {
            nsum[k] += sign * elems[ei].normal[k];
        }
    }
    let nl = norm3(&nsum);
    let nc = if nl > 0.0 { nsum.map(|v| v / nl) } else { elems[members[0].0].normal };
    let helper = if nc[0].abs() < 0.9 { [1.0, 0.0, 0.0] } else { [0.0, 1.0, 0.0] };
    let t1 = {
        let c = cross3(&nc, &helper);
        let l = norm3(&c);
        c.map(|v| v / l)
    };
    let t2 = cross3(&nc, &t1);

    // (s, t, w, ζ', value) per sample.
    let mut pts: Vec<([f64; 4], [f64; 6])> = Vec::new();
    let mut h: f64 = 0.0;
    for &(ei, _, sign) in members {
        let e = &elems[ei];
        for s in &e.samples {
            let d = sub(&s.pos, xn);
            let (a, b, w) = (dot(&d, &t1), dot(&d, &t2), dot(&d, &nc));
            h = h.max((a * a + b * b + if family.is_shell() { 0.0 } else { w * w }).sqrt());
            pts.push(([a, b, w, sign * s.zeta], super::samples::to_global(&s.frame, &s.sigma)));
        }
    }
    let h = if h > 0.0 { h } else { 1.0 };
    for p in pts.iter_mut() {
        p.0[0] /= h;
        p.0[1] /= h;
        p.0[2] /= h;
    }

    let shell = family.is_shell();
    let degrees: &[usize] = if family.recovery_degree() == 2 { &[2, 1, 0] } else { &[1, 0] };
    for &deg in degrees {
        let basis = |c: &[f64; 4]| -> Vec<f64> {
            let (s, t, w, z) = (c[0], c[1], c[2], c[3]);
            let mut b = vec![1.0];
            if deg >= 1 {
                b.push(s);
                b.push(t);
                if !shell { b.push(w); }
            }
            if deg >= 2 {
                b.extend_from_slice(&[s * s, s * t, t * t]);
            }
            if shell {
                let n = b.len();
                for i in 0..n { b.push(b[i] * z); }
            }
            b
        };
        let nb = basis(&pts[0].0).len();
        if pts.len() < nb { continue; }
        let mut ata = vec![0.0; nb * nb];
        let mut atb = vec![[0.0; 6]; nb];
        for (c, v) in &pts {
            let b = basis(c);
            for i in 0..nb {
                for j in 0..nb {
                    ata[i * nb + j] += b[i] * b[j];
                }
                for k in 0..6 {
                    atb[i][k] += b[i] * v[k];
                }
            }
        }
        if let Some(x) = solve_spd(&mut ata, &mut atb, nb) {
            // Value at the node: s = t = w = 0. Coefficient 0 is the constant, and for shells
            // coefficient nb/2 is the ζ term of the constant.
            let a0 = x[0];
            let a1 = if shell { x[nb / 2] } else { [0.0; 6] };
            return (a0, a1);
        }
    }
    ([0.0; 6], [0.0; 6])
}

/// Gaussian elimination with partial pivoting on a small normal-equation system; None when
/// the system is numerically rank-deficient (the patch cannot support that degree).
fn solve_spd(a: &mut [f64], b: &mut [[f64; 6]], n: usize) -> Option<Vec<[f64; 6]>> {
    let scale = (0..n).map(|i| a[i * n + i].abs()).fold(0.0, f64::max);
    if !(scale > 0.0) { return None; }
    for col in 0..n {
        let piv = (col..n).max_by(|&i, &j| a[i * n + col].abs().total_cmp(&a[j * n + col].abs()))?;
        if a[piv * n + col].abs() <= 1e-10 * scale { return None; }
        if piv != col {
            for k in 0..n { a.swap(col * n + k, piv * n + k); }
            b.swap(col, piv);
        }
        for r in col + 1..n {
            let f = a[r * n + col] / a[col * n + col];
            if f == 0.0 { continue; }
            for k in col..n { a[r * n + k] -= f * a[col * n + k]; }
            let bc = b[col];
            for k in 0..6 { b[r][k] -= f * bc[k]; }
        }
    }
    let mut x = vec![[0.0; 6]; n];
    for r in (0..n).rev() {
        let mut v = b[r];
        for c in r + 1..n {
            for k in 0..6 { v[k] -= a[r * n + c] * x[c][k]; }
        }
        for k in 0..6 { x[r][k] = v[k] / a[r * n + r]; }
    }
    if x.iter().all(|r| r.iter().all(|v| v.is_finite())) { Some(x) } else { None }
}
