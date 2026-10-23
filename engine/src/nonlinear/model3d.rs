//! A 3D model: six DOFs per node, (ux, uy, uz, θx, θy, θz), numbered
//! `6·node + k`. Each node keeps its rotation as a matrix, updated
//! multiplicatively; the rotation DOFs the driver sees are spatial
//! increments.

use super::model::{DofKind, NonlinearModel, TangentSink};
use super::rotation::{exp, log, mat_mul, Mat3, IDENTITY};

/// A node's trial state, as elements read it.
#[derive(Debug, Clone, Copy)]
pub struct NodeState3D {
    /// Undeformed position.
    pub x0: [f64; 3],
    pub u: [f64; 3],
    /// Total rotation from the undeformed configuration.
    pub r: Mat3,
}

impl NodeState3D {
    pub fn position(&self) -> [f64; 3] {
        [self.x0[0] + self.u[0], self.x0[1] + self.u[1], self.x0[2] + self.u[2]]
    }
}

/// An element of a 3D model. Same trial/commit/revert contract as the 2D
/// [`super::Element`]; its DOFs are the 6 of each node, in `nodes()` order,
/// and its tangent is with respect to translations and spatial rotation
/// increments.
pub trait Element3D: Send {
    fn nodes(&self) -> &[usize];
    fn update(&mut self, states: &[NodeState3D]) -> Result<(), String>;
    fn internal_force(&self) -> &[f64];
    fn tangent(&self) -> &[f64];
    fn commit(&mut self);
    fn revert(&mut self);
}

pub struct Model3D {
    x0: Vec<[f64; 3]>,
    fixed: Vec<bool>,
    load: Vec<f64>,
    elements: Vec<Box<dyn Element3D>>,
    trial: Vec<NodeState3D>,
    committed: Vec<NodeState3D>,
}

impl Default for Model3D {
    fn default() -> Self {
        Self::new()
    }
}

impl Model3D {
    pub fn new() -> Self {
        Model3D { x0: Vec::new(), fixed: Vec::new(), load: Vec::new(), elements: Vec::new(), trial: Vec::new(), committed: Vec::new() }
    }

    pub fn add_node(&mut self, x: [f64; 3]) -> usize {
        self.x0.push(x);
        self.fixed.extend([false; 6]);
        self.load.extend([0.0; 6]);
        let s = NodeState3D { x0: x, u: [0.0; 3], r: IDENTITY };
        self.trial.push(s);
        self.committed.push(s);
        self.x0.len() - 1
    }

    pub fn coords(&self, node: usize) -> [f64; 3] {
        self.x0[node]
    }

    /// Global DOF `k` (0..3 translations, 3..6 rotations) of `node`.
    pub fn dof(&self, node: usize, k: usize) -> usize {
        6 * node + k
    }

    /// Restrains (ux, uy, uz, θx, θy, θz) where `true`.
    pub fn fix(&mut self, node: usize, restrained: [bool; 6]) {
        for (f, r) in self.fixed[6 * node..6 * node + 6].iter_mut().zip(restrained) {
            *f |= r;
        }
    }

    /// Adds (Fx, Fy, Fz, Mx, My, Mz) to the reference load. Moments are
    /// about fixed global axes (conservative only for small rotations of the
    /// loaded node, as in every code that applies nodal moments this way).
    pub fn add_load(&mut self, node: usize, load: [f64; 6]) {
        for (f, l) in self.load[6 * node..6 * node + 6].iter_mut().zip(load) {
            *f += l;
        }
    }

    pub fn add_element(&mut self, e: Box<dyn Element3D>) {
        self.elements.push(e);
    }

    /// The trial rotation of `node`.
    pub fn rotation(&self, node: usize) -> Mat3 {
        self.trial[node].r
    }
}

impl NonlinearModel for Model3D {
    fn n_dofs(&self) -> usize {
        self.fixed.len()
    }
    fn is_fixed(&self, dof: usize) -> bool {
        self.fixed[dof]
    }
    fn dof_kind(&self, dof: usize) -> DofKind {
        if dof % 6 >= 3 { DofKind::Rotation } else { DofKind::Translation }
    }
    fn reference_load(&self) -> &[f64] {
        &self.load
    }
    fn element_dofs(&self) -> Vec<Vec<usize>> {
        self.elements.iter().map(|e| e.nodes().iter().flat_map(|&n| 6 * n..6 * n + 6).collect()).collect()
    }
    fn assemble(&mut self, f_int: &mut [f64], add_tangent: &mut TangentSink<'_>) -> Result<(), String> {
        let mut states = Vec::new();
        let mut dofs = Vec::new();
        for (ei, e) in self.elements.iter_mut().enumerate() {
            states.clear();
            states.extend(e.nodes().iter().map(|&n| self.trial[n]));
            e.update(&states).map_err(|m| format!("element {ei}: {m}"))?;
            dofs.clear();
            dofs.extend(e.nodes().iter().flat_map(|&n| 6 * n..6 * n + 6));
            for (&d, &f) in dofs.iter().zip(e.internal_force()) {
                f_int[d] += f;
            }
            add_tangent(ei, &dofs, e.tangent());
        }
        Ok(())
    }
    fn increment(&mut self, du: &[f64]) {
        for (n, s) in self.trial.iter_mut().enumerate() {
            let d = &du[6 * n..6 * n + 6];
            for (u, du) in s.u.iter_mut().zip(d) {
                *u += du;
            }
            if d[3] != 0.0 || d[4] != 0.0 || d[5] != 0.0 {
                s.r = mat_mul(&exp([d[3], d[4], d[5]]), &s.r);
            }
        }
    }
    fn displacements(&self) -> Vec<f64> {
        let mut out = Vec::with_capacity(self.fixed.len());
        for s in &self.trial {
            out.extend(s.u);
            out.extend(log(&s.r));
        }
        out
    }
    fn commit(&mut self) {
        self.committed.clone_from(&self.trial);
        self.elements.iter_mut().for_each(|e| e.commit());
    }
    fn revert(&mut self) {
        self.trial.clone_from(&self.committed);
        self.elements.iter_mut().for_each(|e| e.revert());
    }
    fn characteristic_length(&self) -> f64 {
        let (mut lo, mut hi) = ([f64::INFINITY; 3], [f64::NEG_INFINITY; 3]);
        for p in &self.x0 {
            for k in 0..3 {
                lo[k] = lo[k].min(p[k]);
                hi[k] = hi[k].max(p[k]);
            }
        }
        let d = (0..3).map(|k| (hi[k] - lo[k]).powi(2)).sum::<f64>().sqrt();
        if d.is_finite() && d > 0.0 { d } else { 1.0 }
    }
}
