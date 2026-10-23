//! A 2D model: nodes, their DOFs, supports, a reference load and elements.

use super::element::Element;

/// Nodes carry three DOFs, (ux, uz, θ), numbered `3·node + k`.
pub struct Model2D {
    nodes: Vec<[f64; 2]>,
    fixed: Vec<bool>,
    load: Vec<f64>,
    elements: Vec<Box<dyn Element>>,
}

impl Default for Model2D {
    fn default() -> Self {
        Self::new()
    }
}

impl Model2D {
    pub fn new() -> Self {
        Model2D { nodes: Vec::new(), fixed: Vec::new(), load: Vec::new(), elements: Vec::new() }
    }

    pub fn add_node(&mut self, x: f64, z: f64) -> usize {
        self.nodes.push([x, z]);
        self.fixed.extend([false; 3]);
        self.load.extend([0.0; 3]);
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

    pub fn n_dofs(&self) -> usize {
        self.fixed.len()
    }

    pub fn is_fixed(&self, dof: usize) -> bool {
        self.fixed[dof]
    }

    pub fn reference_load(&self) -> &[f64] {
        &self.load
    }

    pub fn elements(&self) -> &[Box<dyn Element>] {
        &self.elements
    }

    /// Evaluates every element at `u` and assembles the internal force and
    /// the tangent (dense, row-major n×n).
    pub(crate) fn assemble(&mut self, u: &[f64]) -> Result<(Vec<f64>, Vec<f64>), String> {
        let n = self.n_dofs();
        let mut f = vec![0.0; n];
        let mut k = vec![0.0; n * n];
        let mut ue = Vec::new();
        for (ei, e) in self.elements.iter_mut().enumerate() {
            ue.clear();
            ue.extend(e.dofs().iter().map(|&d| u[d]));
            e.update(&ue).map_err(|m| format!("element {ei}: {m}"))?;
            let dofs = e.dofs();
            let ne = dofs.len();
            let (fe, ke) = (e.internal_force(), e.tangent());
            for a in 0..ne {
                f[dofs[a]] += fe[a];
                for b in 0..ne {
                    k[dofs[a] * n + dofs[b]] += ke[a * ne + b];
                }
            }
        }
        if f.iter().chain(k.iter()).any(|x| !x.is_finite()) {
            return Err("non-finite internal force or tangent".into());
        }
        Ok((f, k))
    }

    pub(crate) fn commit(&mut self) {
        self.elements.iter_mut().for_each(|e| e.commit());
    }

    pub(crate) fn revert(&mut self) {
        self.elements.iter_mut().for_each(|e| e.revert());
    }
}
