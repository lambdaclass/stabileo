//! The finite-element stress field of every shell-type element, sampled at its integration
//! points through the thickness, in one representation the recovery can work with.
//!
//! Each element family already has its own stress recovery (the one the results report). This
//! module only reads it at the integration points and expresses it as plane stress in the
//! element's local frame there, so a smoothed field can be fitted across elements of a patch and
//! compared back point by point.
//!
//! * DKT (plates): constant CST membrane stress plus the linear DKT moment field, read at the
//!   vertices (`plate_stress_at_nodes`) and interpolated linearly, which reproduces it exactly.
//! * MITC4 (quads) and MITC9 (quad9s): the Gauss values extrapolated to the nodes
//!   (`quad_stress_at_nodes`, `quad9_stress_at_nodes`), interpolated back to the Gauss points,
//!   which reproduces the Gauss values exactly.
//! * Membrane stress and moments become stresses at ζ = ±1/√3 through the thickness,
//!   σ(ζ) = σ_m − 6·M·ζ/t² (moments are sagging-positive: tension at the bottom face), which
//!   integrates the membrane-plus-bending energy exactly with two points.
//! * Curved shells and solid-shells sample their own 2×2×2 points
//!   (`curved_shell_stress_samples`, `solid_shell_inplane_samples`).
//!
//! Transverse shear is not sampled in any family (see `docs/verification/DISCRETIZATION.md`).

use std::collections::HashMap;

use crate::element::ShellStressSample;
use crate::types::*;

/// The element families the estimator covers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Family {
    Plate,
    Quad,
    Quad9,
    CurvedShell,
    SolidShell,
}

impl Family {
    pub fn name(self) -> &'static str {
        match self {
            Family::Plate => "plate",
            Family::Quad => "quad",
            Family::Quad9 => "quad9",
            Family::CurvedShell => "curvedShell",
            Family::SolidShell => "solidShell",
        }
    }

    /// Polynomial degree of the recovered field fitted over a patch.
    pub fn recovery_degree(self) -> usize {
        if self == Family::Quad9 { 2 } else { 1 }
    }

    /// Whether ζ (through the thickness) is a natural coordinate of the samples that the
    /// element's nodes do not carry (shell elements), as opposed to a solid whose nodes sit on
    /// the faces.
    pub fn is_shell(self) -> bool {
        self != Family::SolidShell
    }
}

/// One sample: position, frame, plane stress, weight, and the element shape functions there.
#[derive(Debug, Clone)]
pub struct Sample {
    /// In-plane natural coordinates of the point (the pairs at ±ζ share them).
    pub xi: f64,
    pub eta: f64,
    pub zeta: f64,
    pub pos: [f64; 3],
    pub frame: [[f64; 3]; 3],
    pub sigma: [f64; 3],
    pub weight: f64,
    /// Element shape functions at the sample (one per element node).
    pub shape: Vec<f64>,
}

/// The sampled stress field of one element.
#[derive(Debug, Clone)]
pub struct ElemSamples {
    pub family: Family,
    pub id: usize,
    pub nodes: Vec<usize>,
    pub material_id: usize,
    /// Shell thickness (0 for solid-shells, whose thickness is their geometry).
    pub thickness: f64,
    pub e: f64,
    pub nu: f64,
    /// Unit normal at the element centre.
    pub normal: [f64; 3],
    pub samples: Vec<Sample>,
}

impl ElemSamples {
    /// Recovery groups never mix families, materials or thicknesses: the stress field is
    /// legitimately discontinuous between them.
    pub fn group_key(&self) -> (Family, usize, u64) {
        (self.family, self.material_id, self.thickness.to_bits())
    }
}

/// Global symmetric tensor (xx, yy, zz, xy, yz, xz) of a local plane stress.
pub fn to_global(frame: &[[f64; 3]; 3], s: &[f64; 3]) -> [f64; 6] {
    let (e1, e2) = (&frame[0], &frame[1]);
    let t = |a: usize, b: usize| {
        s[0] * e1[a] * e1[b] + s[1] * e2[a] * e2[b] + s[2] * (e1[a] * e2[b] + e2[a] * e1[b])
    };
    [t(0, 0), t(1, 1), t(2, 2), t(0, 1), t(1, 2), t(0, 2)]
}

/// In-plane components (σ11, σ22, σ12) of a global symmetric tensor in a local frame.
pub fn to_local(frame: &[[f64; 3]; 3], g: &[f64; 6]) -> [f64; 3] {
    let m = [[g[0], g[3], g[5]], [g[3], g[1], g[4]], [g[5], g[4], g[2]]];
    let q = |a: &[f64; 3], b: &[f64; 3]| {
        let mut acc = 0.0;
        for p in 0..3 {
            for r in 0..3 {
                acc += a[p] * m[p][r] * b[r];
            }
        }
        acc
    };
    [q(&frame[0], &frame[0]), q(&frame[1], &frame[1]), q(&frame[0], &frame[1])]
}

/// Plane-stress complementary energy density ×2: σᵀ C⁻¹ σ.
pub fn energy_density(s: &[f64; 3], e: f64, nu: f64) -> f64 {
    (s[0] * s[0] + s[1] * s[1] - 2.0 * nu * s[0] * s[1] + 2.0 * (1.0 + nu) * s[2] * s[2]) / e
}

type ThermalMap = HashMap<(Family, usize), (f64, f64, f64)>;

fn thermal_map(loads: &[SolverLoad3D]) -> ThermalMap {
    let mut m = HashMap::new();
    for load in loads {
        let (fam, tl) = match load {
            SolverLoad3D::PlateThermal(tl) => (Family::Plate, tl),
            SolverLoad3D::QuadThermal(tl) => (Family::Quad, tl),
            SolverLoad3D::Quad9Thermal(tl) => (Family::Quad9, tl),
            SolverLoad3D::CurvedShellThermal(tl) => (Family::CurvedShell, tl),
            _ => continue,
        };
        // Summed as free strains, (1, Σα·ΔTu, Σα·ΔTg), as the load vector sums them (SH-11):
        // an insert kept only the last thermal load on an element.
        let a = tl.alpha.unwrap_or(1.2e-5);
        let e = m.entry((fam, tl.element_id)).or_insert((1.0, 0.0, 0.0));
        e.1 += a * tl.dt_uniform;
        e.2 += a * tl.dt_gradient;
    }
    m
}

fn cross(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

fn norm(a: &[f64; 3]) -> f64 {
    (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]).sqrt()
}

/// Stresses at ζ = ±1/√3 from membrane stress and sagging-positive moments.
fn through_thickness(sm: [f64; 3], m: [f64; 3], t: f64) -> [(f64, [f64; 3]); 2] {
    let g = 1.0 / 3.0_f64.sqrt();
    let k = 6.0 / (t * t);
    [-g, g].map(|z| (z, [sm[0] - k * m[0] * z, sm[1] - k * m[1] * z, sm[2] - k * m[2] * z]))
}

/// Area element |x,ξ × x,η| of a mapping with the given shape-function derivatives.
fn area_element(coords: &[[f64; 3]], dxi: &[f64], deta: &[f64]) -> f64 {
    let mut a = [0.0; 3];
    let mut b = [0.0; 3];
    for i in 0..coords.len() {
        for k in 0..3 {
            a[k] += dxi[i] * coords[i][k];
            b[k] += deta[i] * coords[i][k];
        }
    }
    norm(&cross(&a, &b))
}

fn bilinear(xi: f64, eta: f64) -> ([f64; 4], [f64; 4], [f64; 4]) {
    let n = [
        0.25 * (1.0 - xi) * (1.0 - eta),
        0.25 * (1.0 + xi) * (1.0 - eta),
        0.25 * (1.0 + xi) * (1.0 + eta),
        0.25 * (1.0 - xi) * (1.0 + eta),
    ];
    let dxi = [-0.25 * (1.0 - eta), 0.25 * (1.0 - eta), 0.25 * (1.0 + eta), -0.25 * (1.0 + eta)];
    let deta = [-0.25 * (1.0 - xi), -0.25 * (1.0 + xi), 0.25 * (1.0 + xi), 0.25 * (1.0 - xi)];
    (n, dxi, deta)
}

fn from_shell_samples(raw: Vec<ShellStressSample>, shape: impl Fn(f64, f64, f64) -> Vec<f64>) -> Vec<Sample> {
    raw.into_iter()
        .map(|s| Sample { xi: s.xi, eta: s.eta, zeta: s.zeta, pos: s.pos, frame: s.frame, sigma: s.sigma, weight: s.weight, shape: shape(s.xi, s.eta, s.zeta) })
        .collect()
}

/// Sample every shell-type element of a linear static solution.
pub fn sample_elements(input: &SolverInput3D, results: &AnalysisResults3D) -> Result<Vec<ElemSamples>, String> {
    let nodes: HashMap<usize, [f64; 3]> = input.nodes.values().map(|n| (n.id, [n.x, n.y, n.z])).collect();
    let mats: HashMap<usize, &SolverMaterial> = input.materials.values().map(|m| (m.id, m)).collect();
    let disp: HashMap<usize, [f64; 6]> = results
        .displacements
        .iter()
        .map(|d| (d.node_id, [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz]))
        .collect();
    let thermal = thermal_map(&input.loads);
    let coord = |id: usize| nodes.get(&id).copied().ok_or_else(|| format!("node {id} not found"));
    let u6 = |ids: &[usize]| -> Result<Vec<f64>, String> {
        let mut v = Vec::with_capacity(6 * ids.len());
        for id in ids {
            v.extend_from_slice(disp.get(id).ok_or_else(|| format!("no displacement for node {id}"))?);
        }
        Ok(v)
    };
    let material = |id: usize| -> Result<(f64, f64), String> {
        let m = mats.get(&id).ok_or_else(|| format!("material {id} not found"))?;
        Ok((m.e * 1000.0, m.nu))
    };
    let g = 1.0 / 3.0_f64.sqrt();
    let mut out = Vec::new();

    let mut plates: Vec<_> = input.plates.values().collect();
    plates.sort_by_key(|p| p.id);
    for p in plates {
        let (e, nu) = material(p.material_id)?;
        let c = [coord(p.nodes[0])?, coord(p.nodes[1])?, coord(p.nodes[2])?];
        let tr = crate::element::plate_transform_3d(&c);
        let ul = crate::linalg::transform_displacement(&u6(&p.nodes)?, &tr, 18);
        let mut nodal = crate::element::plate_stress_at_nodes(&c, e, nu, p.thickness, &ul);
        if let Some(&(alpha, dtu, dtg)) = thermal.get(&(Family::Plate, p.id)) {
            // As `plate_stress_recovery`: ε −= α·ΔT, κ −= α·ΔTg/t, moments sagging-positive.
            let ds = e / (1.0 - nu) * alpha * dtu;
            let dm = e * p.thickness.powi(3) / (12.0 * (1.0 - nu)) * alpha * dtg / p.thickness;
            for ns in nodal.iter_mut() {
                ns.sigma_xx -= ds;
                ns.sigma_yy -= ds;
                ns.mx += dm;
                ns.my += dm;
            }
        }
        let frame = [
            [tr[0], tr[1], tr[2]],
            [tr[18], tr[19], tr[20]],
            [tr[36], tr[37], tr[38]],
        ];
        let area = 0.5 * norm(&cross(&sub(&c[1], &c[0]), &sub(&c[2], &c[0])));
        let mut samples = Vec::with_capacity(6);
        for (l1, l2) in [(1.0 / 6.0, 1.0 / 6.0), (2.0 / 3.0, 1.0 / 6.0), (1.0 / 6.0, 2.0 / 3.0)] {
            let shape = vec![1.0 - l1 - l2, l1, l2];
            let mut sm = [0.0; 3];
            let mut m = [0.0; 3];
            let mut pos = [0.0; 3];
            for i in 0..3 {
                let ns = &nodal[i];
                for (k, v) in [ns.sigma_xx, ns.sigma_yy, ns.tau_xy].iter().enumerate() { sm[k] += shape[i] * v; }
                for (k, v) in [ns.mx, ns.my, ns.mxy].iter().enumerate() { m[k] += shape[i] * v; }
                for k in 0..3 { pos[k] += shape[i] * c[i][k]; }
            }
            for (zeta, sigma) in through_thickness(sm, m, p.thickness) {
                let pz = add(&pos, &scale(&frame[2], zeta * 0.5 * p.thickness));
                samples.push(Sample { xi: l1, eta: l2, zeta, pos: pz, frame, sigma, weight: area / 3.0 * 0.5 * p.thickness, shape: shape.clone() });
            }
        }
        out.push(ElemSamples {
            family: Family::Plate, id: p.id, nodes: p.nodes.to_vec(), material_id: p.material_id,
            thickness: p.thickness, e, nu, normal: frame[2], samples,
        });
    }

    let mut quads: Vec<_> = input.quads.values().collect();
    quads.sort_by_key(|q| q.id);
    for q in quads {
        let (e, nu) = material(q.material_id)?;
        let c = [coord(q.nodes[0])?, coord(q.nodes[1])?, coord(q.nodes[2])?, coord(q.nodes[3])?];
        let tr = crate::element::quad::quad_transform_3d(&c);
        let ul_v = crate::linalg::transform_displacement(&u6(&q.nodes)?, &tr, 24);
        let mut ul = [0.0; 24];
        ul.copy_from_slice(&ul_v);
        let (alpha, dtu, dtg) = thermal.get(&(Family::Quad, q.id)).copied().unwrap_or((0.0, 0.0, 0.0));
        let nodal = crate::element::quad::quad_stress_at_nodes(&c, &ul, e, nu, q.thickness, alpha, dtu, dtg);
        let frame = [[tr[0], tr[1], tr[2]], [tr[24], tr[25], tr[26]], [tr[48], tr[49], tr[50]]];
        let mut samples = Vec::with_capacity(8);
        for xi in [-g, g] {
            for eta in [-g, g] {
                let (n, dxi, deta) = bilinear(xi, eta);
                let da = area_element(&c, &dxi, &deta);
                let mut sm = [0.0; 3];
                let mut m = [0.0; 3];
                let mut pos = [0.0; 3];
                for i in 0..4 {
                    let ns = &nodal[i];
                    for (k, v) in [ns.sigma_xx, ns.sigma_yy, ns.tau_xy].iter().enumerate() { sm[k] += n[i] * v; }
                    for (k, v) in [ns.mx, ns.my, ns.mxy].iter().enumerate() { m[k] += n[i] * v; }
                    for k in 0..3 { pos[k] += n[i] * c[i][k]; }
                }
                for (zeta, sigma) in through_thickness(sm, m, q.thickness) {
                    let pz = add(&pos, &scale(&frame[2], zeta * 0.5 * q.thickness));
                    samples.push(Sample { xi, eta, zeta, pos: pz, frame, sigma, weight: da * 0.5 * q.thickness, shape: n.to_vec() });
                }
            }
        }
        out.push(ElemSamples {
            family: Family::Quad, id: q.id, nodes: q.nodes.to_vec(), material_id: q.material_id,
            thickness: q.thickness, e, nu, normal: frame[2], samples,
        });
    }

    let mut q9s: Vec<_> = input.quad9s.values().collect();
    q9s.sort_by_key(|q| q.id);
    let g3 = (0.6_f64).sqrt();
    for q in q9s {
        let (e, nu) = material(q.material_id)?;
        let mut c = [[0.0; 3]; 9];
        for (i, &nid) in q.nodes.iter().enumerate() { c[i] = coord(nid)?; }
        let tr = crate::element::quad9::quad9_transform_3d(&c);
        let ul = crate::linalg::transform_displacement(&u6(&q.nodes)?, &tr, 54);
        let (alpha, dtu, dtg) = thermal.get(&(Family::Quad9, q.id)).copied().unwrap_or((0.0, 0.0, 0.0));
        let nodal = crate::element::quad9::quad9_stress_at_nodes(&c, &ul, e, nu, q.thickness, alpha, dtu, dtg);
        let frame = [[tr[0], tr[1], tr[2]], [tr[54], tr[55], tr[56]], [tr[108], tr[109], tr[110]]];
        let mut samples = Vec::with_capacity(18);
        let w1 = [5.0 / 9.0, 8.0 / 9.0, 5.0 / 9.0];
        for (a, xi) in [-g3, 0.0, g3].into_iter().enumerate() {
            for (b, eta) in [-g3, 0.0, g3].into_iter().enumerate() {
                let n = crate::element::quad9::shape_functions_9(xi, eta);
                let (dxi, deta) = crate::element::quad9::shape_derivatives_9(xi, eta);
                let da = area_element(&c, &dxi, &deta) * w1[a] * w1[b];
                let mut sm = [0.0; 3];
                let mut m = [0.0; 3];
                let mut pos = [0.0; 3];
                for i in 0..9 {
                    let ns = &nodal[i];
                    for (k, v) in [ns.sigma_xx, ns.sigma_yy, ns.tau_xy].iter().enumerate() { sm[k] += n[i] * v; }
                    for (k, v) in [ns.mx, ns.my, ns.mxy].iter().enumerate() { m[k] += n[i] * v; }
                    for k in 0..3 { pos[k] += n[i] * c[i][k]; }
                }
                for (zeta, sigma) in through_thickness(sm, m, q.thickness) {
                    let pz = add(&pos, &scale(&frame[2], zeta * 0.5 * q.thickness));
                    samples.push(Sample { xi, eta, zeta, pos: pz, frame, sigma, weight: da * 0.5 * q.thickness, shape: n.to_vec() });
                }
            }
        }
        out.push(ElemSamples {
            family: Family::Quad9, id: q.id, nodes: q.nodes.to_vec(), material_id: q.material_id,
            thickness: q.thickness, e, nu, normal: frame[2], samples,
        });
    }

    let mut css: Vec<_> = input.curved_shells.values().collect();
    css.sort_by_key(|q| q.id);
    for cs in css {
        let (e, nu) = material(cs.material_id)?;
        let c = [coord(cs.nodes[0])?, coord(cs.nodes[1])?, coord(cs.nodes[2])?, coord(cs.nodes[3])?];
        let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&c));
        let (alpha, dtu, dtg) = thermal.get(&(Family::CurvedShell, cs.id)).copied().unwrap_or((0.0, 0.0, 0.0));
        let raw = crate::element::curved_shell::curved_shell_stress_samples(&c, &dirs, &u6(&cs.nodes)?, e, nu, cs.thickness, alpha, dtu, dtg);
        let normal = centre_normal(&raw);
        let samples = from_shell_samples(raw, |xi, eta, _| bilinear(xi, eta).0.to_vec());
        out.push(ElemSamples {
            family: Family::CurvedShell, id: cs.id, nodes: cs.nodes.to_vec(), material_id: cs.material_id,
            thickness: cs.thickness, e, nu, normal, samples,
        });
    }

    let mut sss: Vec<_> = input.solid_shells.values().collect();
    sss.sort_by_key(|q| q.id);
    for ss in sss {
        let (e, nu) = material(ss.material_id)?;
        let mut c = [[0.0; 3]; 8];
        let mut u = Vec::with_capacity(24);
        for (i, &nid) in ss.nodes.iter().enumerate() {
            c[i] = coord(nid)?;
            let d = disp.get(&nid).ok_or_else(|| format!("no displacement for node {nid}"))?;
            u.extend_from_slice(&d[..3]);
        }
        let raw = crate::element::solid_shell::solid_shell_inplane_samples(&c, &u, e, nu);
        let normal = centre_normal(&raw);
        let samples = from_shell_samples(raw, |xi, eta, zeta| crate::element::solid_shell::shape_functions_hex8(xi, eta, zeta).to_vec());
        out.push(ElemSamples {
            family: Family::SolidShell, id: ss.id, nodes: ss.nodes.to_vec(), material_id: ss.material_id,
            thickness: 0.0, e, nu, normal, samples,
        });
    }

    Ok(out)
}

fn centre_normal(raw: &[ShellStressSample]) -> [f64; 3] {
    let mut n = [0.0; 3];
    for s in raw {
        for k in 0..3 { n[k] += s.frame[2][k]; }
    }
    let l = norm(&n);
    if l > 0.0 { n.map(|v| v / l) } else { [0.0, 0.0, 1.0] }
}

pub fn sub(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
pub fn add(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] { [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
pub fn scale(a: &[f64; 3], s: f64) -> [f64; 3] { [a[0] * s, a[1] * s, a[2] * s] }
pub fn dot(a: &[f64; 3], b: &[f64; 3]) -> f64 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
pub fn cross3(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] { cross(a, b) }
pub fn norm3(a: &[f64; 3]) -> f64 { norm(a) }
