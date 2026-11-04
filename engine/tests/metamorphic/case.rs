//! A test case: a model plus every dimensioned analysis parameter the
//! analyses derive their inputs from, so that a transform of the case
//! transforms everything consistently.

use dedaliano_engine::metamorphic::relabel::Relabel;
use dedaliano_engine::metamorphic::transform::{transform_2d, transform_3d, Iso2, Iso3};
use dedaliano_engine::metamorphic::units::{scale_2d, scale_3d, scale_densities, Units};
use dedaliano_engine::types::*;
use std::collections::{HashMap, HashSet};

/// Dimensioned analysis parameters (all scale with the units).
#[derive(Clone, Debug)]
pub struct Params {
    /// Yield stress for plastic / nonlinear material analyses (MPa-like).
    pub fy: f64,
    /// Time step (s).
    pub dt: f64,
    /// Harmonic excitation frequencies (Hz).
    pub freqs: Vec<f64>,
    /// Moving-load axle weight (kN) and moving step (m).
    pub axle: f64,
    pub step: f64,
    /// Three-component ground acceleration amplitude (m/s²).
    pub ground: [f64; 3],
    /// Excitation axis of a spectral analysis (0 = X, 1 = Y, 2 = Z).
    pub axis: usize,
}

impl Default for Params {
    fn default() -> Self {
        Params { fy: 250.0, dt: 0.002, freqs: vec![0.0, 0.7, 2.3], axle: 50.0, step: 0.5, ground: [1.0, 0.6, 0.3], axis: 0 }
    }
}

impl Params {
    fn units(&self, u: &Units) -> Params {
        Params {
            fy: self.fy * u.stress(),
            dt: self.dt * u.time,
            freqs: self.freqs.iter().map(|f| f * u.frequency()).collect(),
            axle: self.axle * u.force,
            step: self.step * u.length,
            ground: self.ground.map(|g| g * u.accel()),
            axis: self.axis,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Case2 {
    pub name: String,
    pub s: SolverInput,
    pub dens: HashMap<String, f64>,
    pub p: Params,
    /// Response nodes for analyses that report one node (harmonic).
    pub probes: Vec<usize>,
    /// Member path for moving loads and influence lines.
    pub path: Option<Vec<usize>>,
}

#[derive(Clone, Debug)]
pub struct Case3 {
    pub name: String,
    pub s: SolverInput3D,
    pub dens: HashMap<String, f64>,
    pub p: Params,
    pub probes: Vec<usize>,
    pub path: Option<Vec<usize>>,
}

pub fn default_densities(mats: impl Iterator<Item = usize>) -> HashMap<String, f64> {
    mats.map(|id| (id.to_string(), 7850.0)).collect()
}

impl Case2 {
    pub fn new(name: impl Into<String>, s: SolverInput) -> Self {
        let dens = default_densities(s.materials.values().map(|m| m.id));
        let probes = probes_2d(&s);
        let path = path_2d(&s);
        Case2 { name: name.into(), s, dens, p: Params::default(), probes, path }
    }
    pub fn iso(&self, iso: &Iso2) -> Result<Case2, String> {
        let s = transform_2d(&self.s, iso).map_err(|e| e.to_string())?;
        Ok(Case2 { s, ..self.clone() })
    }
    pub fn relabel(&self, rl: &Relabel, seed: u64) -> Case2 {
        Case2 {
            name: self.name.clone(),
            s: rl.apply_2d(&self.s, seed),
            dens: rl.material_keyed(&self.dens),
            p: self.p.clone(),
            probes: self.probes.iter().map(|&n| rl.n(n)).collect(),
            path: self.path.as_ref().map(|p| p.iter().map(|&e| rl.e(e)).collect()),
        }
    }
    pub fn units(&self, u: &Units) -> Case2 {
        Case2 { s: scale_2d(&self.s, u), dens: scale_densities(&self.dens, u), p: self.p.units(u), ..self.clone() }
    }
    pub fn with_loads(&self, loads: Vec<SolverLoad>) -> Case2 {
        let mut c = self.clone();
        c.s.loads = loads;
        c
    }
}

impl Case3 {
    pub fn new(name: impl Into<String>, s: SolverInput3D) -> Self {
        let s = dedaliano_engine::solver::linear::expand_curved_beams_3d(&s);
        let dens = default_densities(s.materials.values().map(|m| m.id));
        let probes = probes_3d(&s);
        let path = path_3d(&s);
        Case3 { name: name.into(), s, dens, p: Params::default(), probes, path }
    }
    pub fn iso(&self, iso: &Iso3) -> Result<Case3, String> {
        let s = transform_3d(&self.s, iso).map_err(|e| e.to_string())?;
        let mut p = self.p.clone();
        p.ground = iso.apply_vec(self.p.ground);
        let mut e = [0.0; 3];
        e[self.p.axis] = 1.0;
        let d = iso.apply_vec(e);
        if let Some(j) = (0..3).find(|&j| (d[j].abs() - 1.0).abs() < 1e-12) {
            p.axis = j;
        }
        Ok(Case3 { s, p, ..self.clone() })
    }
    pub fn relabel(&self, rl: &Relabel, seed: u64) -> Case3 {
        Case3 {
            name: self.name.clone(),
            s: rl.apply_3d(&self.s, seed),
            dens: rl.material_keyed(&self.dens),
            p: self.p.clone(),
            probes: self.probes.iter().map(|&n| rl.n(n)).collect(),
            path: self.path.as_ref().map(|p| p.iter().map(|&e| rl.e(e)).collect()),
        }
    }
    pub fn units(&self, u: &Units) -> Case3 {
        Case3 { s: scale_3d(&self.s, u), dens: scale_densities(&self.dens, u), p: self.p.units(u), ..self.clone() }
    }
    pub fn with_loads(&self, loads: Vec<SolverLoad3D>) -> Case3 {
        let mut c = self.clone();
        c.s.loads = loads;
        c
    }
}

// ==================== probes and paths ====================

fn supported_2d(s: &SolverInput) -> HashSet<usize> {
    s.supports.values().filter(|x| x.support_type != "spring").map(|x| x.node_id).collect()
}

/// Up to three unsupported nodes, spread over the sorted id list.
fn probes_2d(s: &SolverInput) -> Vec<usize> {
    let sup = supported_2d(s);
    let mut ids: Vec<usize> = s.nodes.values().map(|n| n.id).filter(|id| !sup.contains(id)).collect();
    ids.sort_unstable();
    spread(&ids)
}

fn probes_3d(s: &SolverInput3D) -> Vec<usize> {
    let sup: HashSet<usize> = s.supports.values().map(|x| x.node_id).collect();
    let mut ids: Vec<usize> = s.nodes.values().map(|n| n.id).filter(|id| !sup.contains(id)).collect();
    ids.sort_unstable();
    spread(&ids)
}

fn spread(ids: &[usize]) -> Vec<usize> {
    if ids.len() <= 3 {
        return ids.to_vec();
    }
    vec![ids[ids.len() / 4], ids[ids.len() / 2], ids[3 * ids.len() / 4]]
}

/// The longest chain of near-horizontal frame members joined end to end
/// (a deck), each traversed from node_i to node_j, at least two members.
fn path_2d(s: &SolverInput) -> Option<Vec<usize>> {
    let pos = |id: usize| s.nodes.get(&id.to_string()).map(|n| (n.x, n.z));
    let mut horiz: Vec<&SolverElement> = s
        .elements
        .values()
        .filter(|e| e.elem_type == "frame")
        .filter(|e| match (pos(e.node_i), pos(e.node_j)) {
            (Some(a), Some(b)) => {
                let (dx, dz) = (b.0 - a.0, b.1 - a.1);
                dx > 0.0 && dz.abs() < 0.2 * dx
            }
            _ => false,
        })
        .collect();
    horiz.sort_by_key(|e| e.id);
    chain(horiz.iter().map(|e| (e.id, e.node_i, e.node_j)).collect())
}

fn path_3d(s: &SolverInput3D) -> Option<Vec<usize>> {
    let pos = |id: usize| s.nodes.get(&id.to_string()).map(|n| [n.x, n.y, n.z]);
    let mut horiz: Vec<&SolverElement3D> = s
        .elements
        .values()
        .filter(|e| e.elem_type == "frame")
        .filter(|e| match (pos(e.node_i), pos(e.node_j)) {
            (Some(a), Some(b)) => {
                let d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
                d[0] > 0.0 && d[1].abs() < 1e-9 * d[0].max(1.0) && d[2].abs() < 0.2 * d[0]
            }
            _ => false,
        })
        .collect();
    horiz.sort_by_key(|e| e.id);
    chain(horiz.iter().map(|e| (e.id, e.node_i, e.node_j)).collect())
}

fn chain(es: Vec<(usize, usize, usize)>) -> Option<Vec<usize>> {
    let mut best: Vec<usize> = Vec::new();
    for &(id0, _, j0) in &es {
        let mut c = vec![id0];
        let mut at = j0;
        while let Some(&(id, _, j)) = es.iter().find(|(id, i, _)| *i == at && !c.contains(id)) {
            c.push(id);
            at = j;
            if c.len() > 12 {
                break;
            }
        }
        if c.len() > best.len() {
            best = c;
        }
    }
    (best.len() >= 2).then_some(best)
}

// ==================== sparse-path padding ====================

/// The model plus a far-away independent fixed cantilever of 30 members, so
/// that the free DOF count crosses the sparse threshold. Returns the padded
/// model and the original node / element ids (to drop the padding from the
/// response).
pub fn pad_2d(s: &SolverInput) -> (SolverInput, HashSet<usize>, HashSet<usize>) {
    let mut m = s.clone();
    let nodes: HashSet<usize> = s.nodes.values().map(|n| n.id).collect();
    let elems: HashSet<usize> = s.elements.values().map(|e| e.id).collect();
    let n0 = nodes.iter().max().copied().unwrap_or(0) + 1;
    let e0 = elems.iter().max().copied().unwrap_or(0) + 1;
    let mat = s.materials.values().map(|x| x.id).min().unwrap_or(1);
    let sec = s.sections.values().map(|x| x.id).min().unwrap_or(1);
    let x0 = s.nodes.values().map(|n| n.x.abs() + n.z.abs()).fold(0.0, f64::max) * 3.0 + 100.0;
    for k in 0..=30 {
        m.nodes.insert((n0 + k).to_string(), SolverNode { id: n0 + k, x: x0, z: 0.2 * k as f64 });
    }
    for k in 0..30 {
        m.elements.insert(
            (e0 + k).to_string(),
            SolverElement { id: e0 + k, elem_type: "frame".into(), node_i: n0 + k, node_j: n0 + k + 1, material_id: mat, section_id: sec, hinge_start: false, hinge_end: false },
        );
    }
    let sid = s.supports.values().map(|x| x.id).max().unwrap_or(0) + 1;
    m.supports.insert(
        sid.to_string(),
        SolverSupport { id: sid, node_id: n0, support_type: "fixed".into(), kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None },
    );
    (m, nodes, elems)
}

pub fn pad_3d(s: &SolverInput3D) -> (SolverInput3D, HashSet<usize>, HashSet<usize>) {
    let mut m = s.clone();
    let nodes: HashSet<usize> = s.nodes.values().map(|n| n.id).collect();
    let elems: HashSet<usize> = s.elements.values().map(|e| e.id).collect();
    let n0 = nodes.iter().max().copied().unwrap_or(0) + 1;
    let e0 = elems.iter().max().copied().unwrap_or(0) + 1;
    let mat = s.materials.values().map(|x| x.id).min().unwrap_or(1);
    let sec = s.sections.values().map(|x| x.id).min().unwrap_or(1);
    let x0 = s.nodes.values().map(|n| n.x.abs() + n.y.abs() + n.z.abs()).fold(0.0, f64::max) * 3.0 + 100.0;
    for k in 0..=12 {
        m.nodes.insert((n0 + k).to_string(), SolverNode3D { id: n0 + k, x: x0, y: 0.0, z: 0.25 * k as f64 });
    }
    for k in 0..12 {
        let mut e = s.elements.values().next().cloned().unwrap_or_else(|| serde_json::from_value(serde_json::json!({
            "id": 0, "type": "frame", "nodeI": 0, "nodeJ": 0, "materialId": mat, "sectionId": sec
        })).unwrap());
        e.id = e0 + k;
        e.elem_type = "frame".into();
        (e.node_i, e.node_j, e.material_id, e.section_id) = (n0 + k, n0 + k + 1, mat, sec);
        (e.release_my_start, e.release_my_end, e.release_mz_start, e.release_mz_end, e.release_t_start, e.release_t_end) = (false, false, false, false, false, false);
        (e.local_yx, e.local_yy, e.local_yz, e.roll_angle) = (None, None, None, None);
        m.elements.insert(e.id.to_string(), e);
    }
    let sup: SolverSupport3D = serde_json::from_value(serde_json::json!({
        "nodeId": n0, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true
    }))
    .unwrap();
    m.supports.insert(format!("pad{n0}"), sup);
    (m, nodes, elems)
}
