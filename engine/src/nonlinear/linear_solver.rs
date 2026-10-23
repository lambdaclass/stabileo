//! The tangent system on the free DOFs: sparse assembly and a robust
//! factorization policy.
//!
//! Policy (the default every strategy uses):
//! 1. A symmetric tangent is factored by sparse LDLᵀ, which also counts its
//!    negative eigenvalues (Sylvester's inertia): the stability information
//!    the driver uses to see limit and bifurcation points.
//! 2. If LDLᵀ meets a tiny pivot (an ordering it cannot factor without
//!    pivoting), or the tangent is not symmetric (the 3D co-rotational
//!    tangent away from equilibrium), sparse LU with threshold partial
//!    pivoting. It gives the determinant's sign, not the inertia.
//! 3. Every solve takes one step of iterative refinement against the
//!    assembled matrix.
//!
//! The sparsity pattern comes from the elements' DOFs once; its symbolic
//! analysis (fill-reducing ordering, elimination tree) is reused for every
//! factorization of the analysis, and each element's slots in the matrix are
//! computed once, so assembly is a scatter with no search.

use std::cell::Cell;
use std::rc::Rc;

use super::model::NonlinearModel;
use super::sparse::{ldlt_numeric, ldlt_symbolic, lu_numeric, LdltFactor, LdltSymbolic, LuFactor, SparseMatrix, SparsePattern};

const NONE: usize = usize::MAX;

/// Which factorization solved the system.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FactorMethod {
    Ldlt,
    Lu,
}

pub(crate) enum FactorKind {
    Ldlt(LdltFactor),
    /// `near_singular`: the tangent was symmetric and LDLᵀ refused a tiny
    /// pivot, which on a stable path happens at a critical point.
    Lu { f: LuFactor, near_singular: bool },
}

/// A factorization of S·K·S, S = diag(1/√|K_ii|): the symmetric
/// equilibration that makes the pivot tests independent of units and of the
/// spread of stiffnesses (EA/L next to EI/L³). A congruence: the inertia and
/// the determinant's sign are K's.
pub(crate) struct Factor {
    kind: FactorKind,
    scale: Vec<f64>,
}

impl Factor {
    pub fn method(&self) -> FactorMethod {
        match &self.kind {
            FactorKind::Ldlt(_) => FactorMethod::Ldlt,
            FactorKind::Lu { .. } => FactorMethod::Lu,
        }
    }

    /// Whether LDLᵀ refused this symmetric tangent for a tiny pivot.
    pub fn near_singular(&self) -> bool {
        matches!(self.kind, FactorKind::Lu { near_singular: true, .. })
    }

    /// Number of negative eigenvalues, when the factorization knows it.
    pub fn negative_eigenvalues(&self) -> Option<usize> {
        match &self.kind {
            FactorKind::Ldlt(f) => Some(f.inertia().0),
            FactorKind::Lu { .. } => None,
        }
    }

    pub fn det_sign(&self) -> i8 {
        match &self.kind {
            FactorKind::Ldlt(f) => {
                let (neg, zero, _) = f.inertia();
                if zero > 0 { 0 } else if neg % 2 == 0 { 1 } else { -1 }
            }
            FactorKind::Lu { f, .. } => f.det_sign(),
        }
    }

    fn raw_solve(&self, b: &[f64]) -> Vec<f64> {
        let sb: Vec<f64> = b.iter().zip(&self.scale).map(|(x, s)| x * s).collect();
        let y = match &self.kind {
            FactorKind::Ldlt(f) => f.solve(&sb),
            FactorKind::Lu { f, .. } => f.solve(&sb),
        };
        y.iter().zip(&self.scale).map(|(x, s)| x * s).collect()
    }
}

pub(crate) struct TangentSystem {
    /// free[i] = global DOF of free index i.
    pub free: Vec<usize>,
    matrix: SparseMatrix,
    /// Per element, row-major over its DOFs: the slot of each (a, b) pair in
    /// `matrix.values`, or NONE where either DOF is restrained.
    slots: Vec<Vec<usize>>,
    symbolic: Rc<LdltSymbolic>,
    /// Fill-reducing column order for LU (perm[new] = old): the LDLᵀ's AMD.
    lu_order: Vec<usize>,
    factorizations: Cell<usize>,
}

impl TangentSystem {
    pub fn new(model: &dyn NonlinearModel) -> Self {
        let n = model.n_dofs();
        let free: Vec<usize> = (0..n).filter(|&d| !model.is_fixed(d)).collect();
        let mut index = vec![NONE; n];
        for (i, &d) in free.iter().enumerate() {
            index[d] = i;
        }
        let element_dofs = model.element_dofs();
        let groups: Vec<Vec<usize>> =
            element_dofs.iter().map(|dofs| dofs.iter().map(|&d| index[d]).filter(|&i| i != NONE).collect()).collect();
        let pattern = Rc::new(SparsePattern::from_groups(free.len(), &groups));
        let slots = element_dofs
            .iter()
            .map(|dofs| {
                let mut s = Vec::with_capacity(dofs.len() * dofs.len());
                for &a in dofs {
                    for &b in dofs {
                        let (ia, ib) = (index[a], index[b]);
                        s.push(if ia == NONE || ib == NONE { NONE } else { pattern.position(ia, ib).unwrap_or(NONE) });
                    }
                }
                s
            })
            .collect();
        let symbolic = Rc::new(ldlt_symbolic(&pattern));
        let lu_order = symbolic.perm.clone();
        TangentSystem { free, matrix: SparseMatrix::zeros(pattern), slots, symbolic, lu_order, factorizations: Cell::new(0) }
    }

    pub fn clear(&mut self) {
        self.matrix.values.iter_mut().for_each(|v| *v = 0.0);
    }

    pub fn add(&mut self, element: usize, ke: &[f64]) {
        for (&slot, &k) in self.slots[element].iter().zip(ke) {
            if slot != NONE {
                self.matrix.values[slot] += k;
            }
        }
    }

    pub fn norm_inf(&self) -> f64 {
        self.matrix.max_abs_row_sum()
    }

    pub fn is_finite(&self) -> bool {
        self.matrix.values.iter().all(|v| v.is_finite())
    }

    /// The default policy: LDLᵀ when symmetric, LU otherwise or when LDLᵀ
    /// meets a tiny pivot. `Err` when both fail.
    pub fn factorizations(&self) -> usize {
        self.factorizations.get()
    }

    pub fn factor(&self) -> Result<Factor, String> {
        self.factorizations.set(self.factorizations.get() + 1);
        if self.free.is_empty() {
            return Err("no free DOFs".into());
        }
        let scale = self.equilibration();
        let mut scaled = self.matrix.clone();
        let p = scaled.pattern.clone();
        for j in 0..p.n {
            for k in p.col_ptr[j]..p.col_ptr[j + 1] {
                scaled.values[k] *= scale[p.row_idx[k]] * scale[j];
            }
        }
        let symmetric = scaled.is_symmetric(1e-10);
        if symmetric {
            if let Ok(f) = ldlt_numeric(&self.symbolic, &scaled, 1e-13) {
                return Ok(Factor { kind: FactorKind::Ldlt(f), scale });
            }
        }
        lu_numeric(&scaled, &self.lu_order, 0.5)
            .map(|f| Factor { kind: FactorKind::Lu { f, near_singular: symmetric }, scale })
            .map_err(|e| format!("the tangent stiffness is singular ({e})"))
    }

    /// 1/√|K_ii|, or 1 where the diagonal vanishes.
    fn equilibration(&self) -> Vec<f64> {
        let p = &self.matrix.pattern;
        (0..p.n)
            .map(|j| {
                let d = p.position(j, j).map_or(0.0, |k| self.matrix.values[k].abs());
                if d > 0.0 && d.is_finite() { 1.0 / d.sqrt() } else { 1.0 }
            })
            .collect()
    }

    /// y = K·x with the assembled tangent.
    pub fn mat_vec(&self, x: &[f64]) -> Vec<f64> {
        self.matrix.mat_vec(x)
    }

    /// The full-length vector (zeros at restrained DOFs) of a free-DOF one.
    pub fn scatter(&self, x: &[f64], n: usize) -> Vec<f64> {
        let mut v = vec![0.0; n];
        for (&d, &xi) in self.free.iter().zip(x) {
            v[d] = xi;
        }
        v
    }

    /// The number of negative eigenvalues of the symmetric part (K + Kᵀ)/2,
    /// when K's relative asymmetry is at most `tol`: the stability of a
    /// tangent whose asymmetry is a by-product of the rotation
    /// parametrization. `None` when K is further from symmetric, or the
    /// symmetric part cannot be factored.
    pub fn near_symmetric_inertia(&self, tol: f64) -> Option<usize> {
        let p = &self.matrix.pattern;
        let max = self.matrix.values.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        let scale = self.equilibration();
        let mut sym = self.matrix.clone();
        for j in 0..p.n {
            for k in p.col_ptr[j]..p.col_ptr[j + 1] {
                let i = p.row_idx[k];
                let t = p.position(j, i).map_or(0.0, |q| self.matrix.values[q]);
                if (self.matrix.values[k] - t).abs() > tol * max {
                    return None;
                }
                sym.values[k] = 0.5 * (self.matrix.values[k] + t) * scale[i] * scale[j];
            }
        }
        ldlt_numeric(&self.symbolic, &sym, 1e-13).ok().map(|f| f.inertia().0)
    }

    /// x = K⁻¹·b from `f` alone, for a factorization of an earlier tangent.
    pub fn solve_raw(&self, f: &Factor, b: &[f64]) -> Result<Vec<f64>, String> {
        let x = f.raw_solve(b);
        if x.iter().any(|v| !v.is_finite()) {
            return Err("non-finite solution of the tangent system".into());
        }
        Ok(x)
    }

    /// x = K⁻¹·b with one step of iterative refinement.
    pub fn solve(&self, f: &Factor, b: &[f64]) -> Result<Vec<f64>, String> {
        let mut x = f.raw_solve(b);
        let ax = self.matrix.mat_vec(&x);
        let r: Vec<f64> = b.iter().zip(&ax).map(|(bi, ai)| bi - ai).collect();
        let dx = f.raw_solve(&r);
        for (xi, d) in x.iter_mut().zip(&dx) {
            *xi += d;
        }
        if x.iter().any(|v| !v.is_finite()) {
            return Err("non-finite solution of the tangent system".into());
        }
        Ok(x)
    }
}

/// The bordered system of displacement control,
///
/// ```text
/// [ K   −F ] [δu]   [R ]
/// [ e_cᵀ  0 ] [δλ] = [δd]
/// ```
///
/// which stays nonsingular where K alone does not: at a plastic mechanism
/// (perfectly plastic hinges) or exactly at a limit point, as long as the
/// load and the control DOF engage the singular mode. Factored by LU; the
/// pattern and the slot of each entry are built once.
pub(crate) struct Bordered {
    pattern: Rc<SparsePattern>,
    /// Slot in the bordered matrix of each entry of K's values.
    k_slots: Vec<usize>,
    /// Slot of (n, c).
    row_c: usize,
    /// (slot of (i, n), F_i) for the nonzero load components.
    column_f: Vec<(usize, f64)>,
    order: Vec<usize>,
}

impl TangentSystem {
    pub fn bordered(&self, c: usize, f_free: &[f64]) -> Bordered {
        let n = self.free.len();
        let k = &self.matrix.pattern;
        let mut groups: Vec<Vec<usize>> = Vec::with_capacity(k.nnz() + 2);
        for j in 0..n {
            for &i in &k.row_idx[k.col_ptr[j]..k.col_ptr[j + 1]] {
                groups.push(vec![i, j]);
            }
        }
        groups.push(vec![c, n]);
        for (i, &f) in f_free.iter().enumerate() {
            if f != 0.0 {
                groups.push(vec![i, n]);
            }
        }
        let pattern = Rc::new(SparsePattern::from_groups(n + 1, &groups));
        let mut k_slots = Vec::with_capacity(k.nnz());
        for j in 0..n {
            for &i in &k.row_idx[k.col_ptr[j]..k.col_ptr[j + 1]] {
                k_slots.push(pattern.position(i, j).expect("K's entries are in the bordered pattern"));
            }
        }
        let row_c = pattern.position(n, c).expect("the constraint row is in the pattern");
        let column_f = f_free
            .iter()
            .enumerate()
            .filter(|(_, &f)| f != 0.0)
            .map(|(i, &f)| (pattern.position(i, n).expect("the load column is in the pattern"), f))
            .collect();
        let order = ldlt_symbolic(&pattern).perm;
        Bordered { pattern, k_slots, row_c, column_f, order }
    }

    /// (δu, δλ) from the bordered system at the assembled K.
    pub fn solve_bordered(&self, b: &Bordered, r: &[f64], dd: f64) -> Result<(Vec<f64>, f64), String> {
        let n = self.free.len();
        let mut a = SparseMatrix::zeros(b.pattern.clone());
        for (&slot, &v) in b.k_slots.iter().zip(&self.matrix.values) {
            a.values[slot] = v;
        }
        a.values[b.row_c] = 1.0;
        for &(slot, f) in &b.column_f {
            a.values[slot] = -f;
        }
        self.factorizations.set(self.factorizations.get() + 1);
        let lu = lu_numeric(&a, &b.order, 0.5).map_err(|e| format!("the bordered system is singular ({e})"))?;
        let mut rhs = r.to_vec();
        rhs.push(dd);
        let mut x = lu.solve(&rhs);
        let ax = a.mat_vec(&x);
        let res: Vec<f64> = rhs.iter().zip(&ax).map(|(p, q)| p - q).collect();
        for (xi, d) in x.iter_mut().zip(lu.solve(&res)) {
            *xi += d;
        }
        if x.iter().any(|v| !v.is_finite()) {
            return Err("non-finite solution of the bordered system".into());
        }
        let dl = x[n];
        x.truncate(n);
        Ok((x, dl))
    }
}
