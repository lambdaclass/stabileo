//! Models: what the driver assembles and moves.

use super::element::Element;

/// What a DOF measures: arc-length constraints and step norms weigh
/// translations, not rotations, so that metres and radians never add.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DofKind {
    Translation,
    Rotation,
}

/// Receives each element's tangent during assembly: (element, its DOFs, k_e).
pub type TangentSink<'a> = dyn FnMut(usize, &[usize], &[f64]) + 'a;

/// A model as the driver sees it. The model owns its trial configuration and
/// its committed one; the driver only sends increments.
pub trait NonlinearModel {
    fn n_dofs(&self) -> usize;
    fn is_fixed(&self, dof: usize) -> bool;
    fn dof_kind(&self, dof: usize) -> DofKind;
    /// F, the load the driver scales by λ.
    fn reference_load(&self) -> &[f64];
    /// The DOFs of each element, in assembly order: the sparsity pattern.
    fn element_dofs(&self) -> Vec<Vec<usize>>;
    /// Evaluates every element at the trial configuration from its committed
    /// state: adds its internal force into `f_int` and hands its tangent
    /// (row-major, dofs × dofs) to `add_tangent(element, dofs, k_e)`.
    fn assemble(&mut self, f_int: &mut [f64], add_tangent: &mut TangentSink<'_>) -> Result<(), String>;
    /// Moves the trial configuration by `du` (zero at restrained DOFs).
    /// Translations add; in 3D a rotation increment δθ is spatial:
    /// R ← exp(δθ)·R. `increment(−du)` undoes `increment(du)`.
    fn increment(&mut self, du: &[f64]);
    /// Trial displacements; rotations as rotation vectors.
    fn displacements(&self) -> Vec<f64>;
    /// Accepts the trial configuration and every element's trial state.
    fn commit(&mut self);
    /// Returns to the committed configuration and states.
    fn revert(&mut self);
    /// A length typical of the model (its bounding-box diagonal): the scale
    /// that puts moments and forces in one norm.
    fn characteristic_length(&self) -> f64;
}

/// A 2D model: nodes carry three DOFs, (ux, uz, θ), numbered `3·node + k`.
pub struct Model2D {
    nodes: Vec<[f64; 2]>,
    fixed: Vec<bool>,
    load: Vec<f64>,
    elements: Vec<Box<dyn Element>>,
    u: Vec<f64>,
    u_committed: Vec<f64>,
}

impl Default for Model2D {
    fn default() -> Self {
        Self::new()
    }
}

impl Model2D {
    pub fn new() -> Self {
        Model2D { nodes: Vec::new(), fixed: Vec::new(), load: Vec::new(), elements: Vec::new(), u: Vec::new(), u_committed: Vec::new() }
    }

    pub fn add_node(&mut self, x: f64, z: f64) -> usize {
        self.nodes.push([x, z]);
        self.fixed.extend([false; 3]);
        self.load.extend([0.0; 3]);
        self.u.extend([0.0; 3]);
        self.u_committed.extend([0.0; 3]);
        self.nodes.len() - 1
    }

    pub fn coords(&self, node: usize) -> [f64; 2] {
        self.nodes[node]
    }

    /// Global DOF `k` (0 = ux, 1 = uz, 2 = θ) of `node`.
    pub fn dof(&self, node: usize, k: usize) -> usize {
        3 * node + k
    }

    /// The six DOFs of a frame from `i` to `j`.
    pub fn frame_dofs(&self, i: usize, j: usize) -> [usize; 6] {
        [3 * i, 3 * i + 1, 3 * i + 2, 3 * j, 3 * j + 1, 3 * j + 2]
    }

    /// The four translational DOFs of a truss from `i` to `j`.
    pub fn truss_dofs(&self, i: usize, j: usize) -> [usize; 4] {
        [3 * i, 3 * i + 1, 3 * j, 3 * j + 1]
    }

    /// Restrains (ux, uz, θ) where `true`.
    pub fn fix(&mut self, node: usize, restrained: [bool; 3]) {
        for (f, r) in self.fixed[3 * node..3 * node + 3].iter_mut().zip(restrained) {
            *f |= r;
        }
    }

    /// Adds (Fx, Fz, M) to the reference load, which the driver scales by λ.
    pub fn add_load(&mut self, node: usize, load: [f64; 3]) {
        for (f, l) in self.load[3 * node..3 * node + 3].iter_mut().zip(load) {
            *f += l;
        }
    }

    pub fn add_element(&mut self, e: Box<dyn Element>) {
        self.elements.push(e);
    }

    pub fn elements(&self) -> &[Box<dyn Element>] {
        &self.elements
    }
}

impl NonlinearModel for Model2D {
    fn n_dofs(&self) -> usize {
        self.fixed.len()
    }
    fn is_fixed(&self, dof: usize) -> bool {
        self.fixed[dof]
    }
    fn dof_kind(&self, dof: usize) -> DofKind {
        if dof % 3 == 2 { DofKind::Rotation } else { DofKind::Translation }
    }
    fn reference_load(&self) -> &[f64] {
        &self.load
    }
    fn element_dofs(&self) -> Vec<Vec<usize>> {
        self.elements.iter().map(|e| e.dofs().to_vec()).collect()
    }
    fn assemble(&mut self, f_int: &mut [f64], add_tangent: &mut TangentSink<'_>) -> Result<(), String> {
        let mut ue = Vec::new();
        for (ei, e) in self.elements.iter_mut().enumerate() {
            ue.clear();
            ue.extend(e.dofs().iter().map(|&d| self.u[d]));
            e.update(&ue).map_err(|m| format!("element {ei}: {m}"))?;
            for (&d, &f) in e.dofs().iter().zip(e.internal_force()) {
                f_int[d] += f;
            }
            add_tangent(ei, e.dofs(), e.tangent());
        }
        Ok(())
    }
    fn increment(&mut self, du: &[f64]) {
        for (u, d) in self.u.iter_mut().zip(du) {
            *u += d;
        }
    }
    fn displacements(&self) -> Vec<f64> {
        self.u.clone()
    }
    fn commit(&mut self) {
        self.u_committed.clone_from(&self.u);
        self.elements.iter_mut().for_each(|e| e.commit());
    }
    fn revert(&mut self) {
        self.u.clone_from(&self.u_committed);
        self.elements.iter_mut().for_each(|e| e.revert());
    }
    fn characteristic_length(&self) -> f64 {
        let (mut lo, mut hi) = ([f64::INFINITY; 2], [f64::NEG_INFINITY; 2]);
        for p in &self.nodes {
            for k in 0..2 {
                lo[k] = lo[k].min(p[k]);
                hi[k] = hi[k].max(p[k]);
            }
        }
        let d = ((hi[0] - lo[0]).powi(2) + (hi[1] - lo[1]).powi(2)).sqrt();
        if d.is_finite() && d > 0.0 { d } else { 1.0 }
    }
}
