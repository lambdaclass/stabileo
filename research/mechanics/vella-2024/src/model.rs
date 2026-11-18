use dedaliano_engine::solver::corotational::assemble_corotational_public;
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::types::{Displacement, SolverInput};
use serde_json::json;

/// A strip of unit length, bending stiffness and mass per length, clamped at both ends, in
/// `n` production co-rotational frame elements. `slenderness` is L/h; the axial stiffness is
/// the rectangular section's, EA·L²/EI = 12 (L/h)².
#[derive(Clone, Copy, Debug)]
pub struct Strip {
    pub n: usize,
    pub alpha: f64,
    pub slenderness: f64,
}

/// A clamp setting: end-shortening ΔL/L shared between the two ends, how much of it the left
/// end carries (½ for a symmetric setting), and a vertical load at the midpoint (downwards
/// positive, in EI/L²).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Clamps {
    pub left: f64,
    pub right: f64,
    pub load: f64,
}

impl Clamps {
    pub fn symmetric(shortening: f64) -> Self {
        Clamps { left: 0.5 * shortening, right: 0.5 * shortening, load: 0.0 }
    }
    pub fn shortening(&self) -> f64 {
        self.left + self.right
    }
}

pub const DOFS: usize = 3;

impl Strip {
    pub fn axial_stiffness(&self) -> f64 {
        12.0 * self.slenderness * self.slenderness
    }

    pub fn mid(&self) -> usize {
        self.n / 2
    }

    /// The production model; the engine's `ry` is the anticlockwise tangent angle, so the left
    /// clamp tilts upwards with +α and the right one with −α.
    pub fn input(&self, clamps: Clamps, angle: f64, right_slides: bool) -> SolverInput {
        self.input_with(clamps, angle, right_slides, 1.0)
    }

    /// The model with E (hence EI and EA) multiplied by `stiffness` and the midpoint load with
    /// it, so that equilibrium shapes are unchanged.
    pub fn input_with(&self, clamps: Clamps, angle: f64, right_slides: bool, stiffness: f64) -> SolverInput {
        let n = self.n;
        let mut nodes = serde_json::Map::new();
        let mut elements = serde_json::Map::new();
        for i in 0..=n {
            nodes.insert(i.to_string(), json!({"id": i, "x": i as f64 / n as f64, "z": 0.0}));
            if i < n {
                elements.insert(
                    i.to_string(),
                    json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 0, "sectionId": 0}),
                );
            }
        }
        let right = if right_slides {
            json!({"id": 1, "nodeId": n, "type": "guidedX", "dz": 0.0, "dry": -angle})
        } else {
            json!({"id": 1, "nodeId": n, "type": "fixed", "dx": -clamps.right, "dz": 0.0, "dry": -angle})
        };
        let loads = if clamps.load != 0.0 {
            vec![json!({"type": "nodal", "data": {"nodeId": self.mid(), "fx": 0.0, "fz": -clamps.load * stiffness, "my": 0.0}})]
        } else {
            vec![]
        };
        serde_json::from_value(json!({
            "nodes": nodes,
            "elements": elements,
            "materials": {"0": {"id": 0, "e": 0.001 * stiffness, "nu": 0.3}},
            "sections": {"0": {"id": 0, "a": self.axial_stiffness(), "iz": 1.0}},
            "supports": {
                "0": {"id": 0, "nodeId": 0, "type": "fixed", "dx": clamps.left, "dz": 0.0, "dry": angle},
                "1": right
            },
            "loads": loads
        }))
        .expect("the strip model is valid")
    }
}

/// Node-major displacement vector [ux0, uz0, θ0, ux1, …]; θ is the anticlockwise tangent angle.
pub fn to_vector(n: usize, displacements: &[Displacement]) -> Vec<f64> {
    let mut q = vec![0.0; DOFS * (n + 1)];
    for d in displacements {
        q[DOFS * d.node_id] = d.ux;
        q[DOFS * d.node_id + 1] = d.uz;
        q[DOFS * d.node_id + 2] = d.ry;
    }
    q
}

pub fn to_displacements(q: &[f64]) -> Vec<Displacement> {
    q.chunks(DOFS)
        .enumerate()
        .map(|(i, c)| Displacement { node_id: i, ux: c[0], uz: c[1], ry: c[2] })
        .collect()
}

/// Internal forces and tangent of the production co-rotational elements, node-major.
pub struct Assembler {
    input: SolverInput,
    dofs: DofNumbering,
    index: Vec<usize>,
    u: Vec<f64>,
    f: Vec<f64>,
    k: Vec<f64>,
}

impl Assembler {
    pub fn new(strip: &Strip) -> Self {
        let input = strip.input(Clamps::symmetric(0.0), 0.0, false);
        let dofs = DofNumbering::build_2d(&input);
        let size = DOFS * (strip.n + 1);
        let index = (0..size).map(|i| dofs.map[&(i / DOFS, i % DOFS)]).collect();
        let total = dofs.n_total;
        Assembler { input, dofs, index, u: vec![0.0; total], f: vec![0.0; total], k: vec![0.0; total * total] }
    }

    pub fn size(&self) -> usize {
        self.index.len()
    }

    /// Fills `force` with f_int(q) and calls `entry(i, j, K_ij)` for every non-zero of the
    /// tangent's band (|i − j| < 2·DOFS).
    pub fn assemble(&mut self, q: &[f64], force: &mut [f64], mut entry: impl FnMut(usize, usize, f64)) {
        let total = self.dofs.n_total;
        for (i, &g) in self.index.iter().enumerate() {
            self.u[g] = q[i];
        }
        self.f.iter_mut().for_each(|v| *v = 0.0);
        self.k.iter_mut().for_each(|v| *v = 0.0);
        assemble_corotational_public(&self.input, &self.dofs, &self.u, &mut self.f, &mut self.k);
        let size = self.size();
        for i in 0..size {
            force[i] = self.f[self.index[i]];
            let lo = i.saturating_sub(2 * DOFS - 1);
            let hi = (i + 2 * DOFS).min(size);
            for j in lo..hi {
                let v = self.k[self.index[i] * total + self.index[j]];
                if v != 0.0 {
                    entry(i, j, v);
                }
            }
        }
    }

    /// The dense node-major tangent and internal force at q.
    pub fn dense(&mut self, q: &[f64]) -> (Vec<f64>, Vec<f64>) {
        let size = self.size();
        let mut force = vec![0.0; size];
        let mut k = vec![0.0; size * size];
        self.assemble(q, &mut force, |i, j, v| k[i * size + j] = v);
        (force, k)
    }
}

/// Consistent mass of linearly interpolated centreline positions, ρA = 1: per element
/// (h/6)[[2, 1], [1, 2]] on each translation. It does not depend on the configuration, so the
/// kinetic energy is exact for that interpolation under any rotation. Rotary inertia, absent
/// from the paper's beam equation (S2), is neglected.
pub fn mass_band(n: usize) -> Vec<(usize, usize, f64)> {
    let h = 1.0 / n as f64;
    let mut m = vec![];
    for e in 0..n {
        for d in 0..2 {
            let a = DOFS * e + d;
            let b = DOFS * (e + 1) + d;
            m.push((a, a, h / 3.0));
            m.push((b, b, h / 3.0));
            m.push((a, b, h / 6.0));
            m.push((b, a, h / 6.0));
        }
    }
    m
}
