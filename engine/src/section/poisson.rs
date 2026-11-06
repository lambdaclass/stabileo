//! Generic scalar Poisson solver on a triangulated cross-section.
//!
//! Solves
//!
//! ```text
//!     -div( grad u ) = f            in  Omega
//!                  u = u_D          on  Gamma_D   (Dirichlet)
//!         du/dn      = g            on  Gamma_N   (Neumann)
//! ```
//!
//! with continuous linear (P1) triangles.
//!
//! # Why this layer is deliberately generic
//!
//! Both stress components that remain after this checkpoint reduce to this same
//! equation on the same mesh, with different data:
//!
//! * Saint-Venant torsion, Prandtl form: `f = 2`, `u = 0` on the outer boundary
//!   and `u = const_i` on each hole loop.
//! * Saint-Venant torsion, warping form: `f = 0` with a pure-Neumann boundary
//!   condition `du/dn = z*n_y - y*n_z` — hence the null-space handling below.
//! * Transverse shear: a further pair of Poisson problems with different source
//!   and Neumann data.
//!
//! Baking any one of those into the assembler would mean writing it three
//! times. Nothing torsion- or shear-specific belongs in this file.
//!
//! # Discretization
//!
//! For P1 triangles the gradient is constant per element, so the element
//! stiffness is exact:
//!
//! ```text
//!     K^e_ij = A_e * ( grad phi_i . grad phi_j )
//! ```
//!
//! with `grad phi_i = [b_i, c_i] / (2 A_e)`. The source term uses the exact
//! integral of a linear function over a triangle, `A/3` per node, which is the
//! consistent P1 load vector for element-wise constant `f`. Neumann data is
//! integrated along boundary edges with the exact linear rule, `L/2` per node.
//!
//! # Convergence
//!
//! P1 elements are second-order accurate in the L2 norm of the field and
//! first-order in the gradient. The tests measure both observed rates against
//! manufactured solutions; that is the evidence that the assembly is right, not
//! merely that it runs.

use serde::{Deserialize, Serialize};

use super::mesh::SectionMesh;
use crate::linalg::lu::lu_solve;
use crate::linalg::sparse::CscMatrix;

/// Boundary condition applied to a mesh boundary loop.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum LoopBc {
    /// `u = value` on every node of the loop.
    Dirichlet { value: f64 },
    /// `du/dn = value` along the loop. `value = 0.0` is the natural condition
    /// and needs no assembly contribution.
    Neumann { value: f64 },
    /// `du/dn` supplied per boundary edge by the caller, indexed by the edge's
    /// position in `SectionMesh::boundary_edges`.
    NeumannPerEdge,
}

/// How the assembled system is solved.
///
/// The production path is sparse. `Dense` exists only so tests can check the
/// sparse result against a direct factorisation on small meshes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SolveStrategy {
    /// Sparse Cholesky over the free degrees of freedom. Default.
    Sparse,
    /// Dense LU. O(n^3) — small reference systems only.
    Dense,
}

impl Default for SolveStrategy {
    fn default() -> Self {
        SolveStrategy::Sparse
    }
}

/// A scalar Poisson problem posed on a section mesh.
#[derive(Debug, Clone)]
pub struct PoissonProblem<'a> {
    pub mesh: &'a SectionMesh,
    /// Source term `f`, one constant per triangle. Empty means `f = 0`.
    pub source: Vec<f64>,
    /// Boundary condition per loop id (`0` = outer, `1..` = holes).
    pub loop_bcs: Vec<LoopBc>,
    /// Per-edge Neumann data, parallel to `mesh.boundary_edges`. Only read for
    /// loops whose BC is `NeumannPerEdge`.
    pub edge_flux: Vec<f64>,
    /// Extra Dirichlet pins as `(node, value)`. Used to remove the constant
    /// null mode of a pure-Neumann problem when the caller prefers pinning to
    /// the zero-mean constraint.
    pub pins: Vec<(usize, f64)>,
    /// Gauge a pure-Neumann problem by `integral(u) = 0`.
    ///
    /// The sparse path implements this as pin-then-normalise rather than as a
    /// Lagrange multiplier: a multiplier makes the system a symmetric INDEFINITE
    /// saddle point, and Cholesky is only valid for positive definite systems.
    /// Pinning one node keeps the reduced system SPD, and shifting the result so
    /// its integral vanishes afterwards lands on exactly the same solution —
    /// the two differ only by the constant that the gauge removes, and the
    /// gradients (the physically meaningful output) are identical either way.
    pub zero_mean: bool,
    /// Solver strategy. Defaults to sparse.
    pub strategy: SolveStrategy,
}

impl<'a> PoissonProblem<'a> {
    pub fn new(mesh: &'a SectionMesh) -> Self {
        Self {
            mesh,
            source: Vec::new(),
            loop_bcs: Vec::new(),
            edge_flux: Vec::new(),
            pins: Vec::new(),
            zero_mean: false,
            strategy: SolveStrategy::Sparse,
        }
    }
}

/// Solution of a [`PoissonProblem`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PoissonSolution {
    /// Field value at each mesh node.
    pub u: Vec<f64>,
    /// Constant gradient `[du/dy, du/dz]` per triangle.
    pub grad: Vec<[f64; 2]>,
    /// `||K u - F||_inf` over the free equations — a direct check that the
    /// linear system was actually solved, independent of the physics.
    pub residual: f64,
}

impl PoissonSolution {
    /// Integrate the field over the domain (exact for P1).
    pub fn integrate(&self, mesh: &SectionMesh) -> f64 {
        let mut acc = 0.0;
        for &t in &mesh.triangles {
            let a = mesh.triangle_area(t);
            acc += a * (self.u[t[0]] + self.u[t[1]] + self.u[t[2]]) / 3.0;
        }
        acc
    }

    /// Integrate an element-wise function of the constant gradient.
    pub fn integrate_grad<F: Fn([f64; 2], [f64; 2]) -> f64>(&self, mesh: &SectionMesh, f: F) -> f64 {
        let mut acc = 0.0;
        for (e, &t) in mesh.triangles.iter().enumerate() {
            let a = mesh.triangle_area(t);
            let c = [
                (mesh.nodes[t[0]][0] + mesh.nodes[t[1]][0] + mesh.nodes[t[2]][0]) / 3.0,
                (mesh.nodes[t[0]][1] + mesh.nodes[t[1]][1] + mesh.nodes[t[2]][1]) / 3.0,
            ];
            acc += a * f(self.grad[e], c);
        }
        acc
    }

    /// L2 norm of `u - exact` over the domain, for convergence studies.
    pub fn l2_error<F: Fn(f64, f64) -> f64>(&self, mesh: &SectionMesh, exact: F) -> f64 {
        let mut acc = 0.0;
        for &t in &mesh.triangles {
            let a = mesh.triangle_area(t);
            // 3-point mid-edge rule: exact for quadratics, so the quadrature
            // does not pollute the P1 error being measured.
            for (i, j) in [(0usize, 1usize), (1, 2), (2, 0)] {
                let y = 0.5 * (mesh.nodes[t[i]][0] + mesh.nodes[t[j]][0]);
                let z = 0.5 * (mesh.nodes[t[i]][1] + mesh.nodes[t[j]][1]);
                let uh = 0.5 * (self.u[t[i]] + self.u[t[j]]);
                let d = uh - exact(y, z);
                acc += a / 3.0 * d * d;
            }
        }
        acc.sqrt()
    }

    /// L2 norm of `grad u - exact_grad` over the domain.
    pub fn h1_error<F: Fn(f64, f64) -> [f64; 2]>(&self, mesh: &SectionMesh, exact: F) -> f64 {
        let mut acc = 0.0;
        for (e, &t) in mesh.triangles.iter().enumerate() {
            let a = mesh.triangle_area(t);
            let c = [
                (mesh.nodes[t[0]][0] + mesh.nodes[t[1]][0] + mesh.nodes[t[2]][0]) / 3.0,
                (mesh.nodes[t[0]][1] + mesh.nodes[t[1]][1] + mesh.nodes[t[2]][1]) / 3.0,
            ];
            let g = exact(c[0], c[1]);
            let dy = self.grad[e][0] - g[0];
            let dz = self.grad[e][1] - g[1];
            acc += a * (dy * dy + dz * dz);
        }
        acc.sqrt()
    }
}

/// Per-element P1 shape-function gradient coefficients and area.
fn element_geometry(mesh: &SectionMesh, t: [usize; 3]) -> ([f64; 3], [f64; 3], f64) {
    let p = [mesh.nodes[t[0]], mesh.nodes[t[1]], mesh.nodes[t[2]]];
    let b = [p[1][1] - p[2][1], p[2][1] - p[0][1], p[0][1] - p[1][1]];
    let c = [p[2][0] - p[1][0], p[0][0] - p[2][0], p[1][0] - p[0][0]];
    let area = 0.5 * ((p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1]));
    (b, c, area)
}

/// The factored reduced system, strategy-dependent.
enum Factor {
    Sparse(crate::linalg::sparse_chol::NumericCholesky),
    /// Reduced matrix, row-major. The dense path is a reference for small
    /// test systems, so the LU runs per solve on a clone rather than being
    /// stored pre-factored.
    Dense(Vec<f64>),
}

/// A Poisson problem assembled and factored once, solvable for many
/// right-hand sides.
///
/// Torsion with holes solves `k+1` systems that differ only in their Dirichlet
/// values, and shear solves two that differ only in the source — but the
/// constrained node set, and therefore the reduced matrix, is identical across
/// all of them. Both callers were paying a full assembly and factorization per
/// right-hand side; this type exists so they factor once. The dominant cost of
/// a sparse solve is the numeric factorization, so the saving is roughly a
/// factor of two for shear and of `k+1` for a section with `k` holes.
pub struct FactoredPoisson<'a> {
    mesh: &'a SectionMesh,
    /// Full-system triplets, kept so a solve can rebuild the right-hand side
    /// for new Dirichlet data and measure the residual against the original
    /// (unreduced) system.
    rows: Vec<usize>,
    cols: Vec<usize>,
    vals: Vec<f64>,
    /// Load-vector contribution of the Neumann data, baked at factor time.
    neumann_f: Vec<f64>,
    /// Which loops are Dirichlet. The constrained node SET is fixed for the
    /// life of this factor; only the prescribed values may vary per solve.
    dirichlet_loop: Vec<bool>,
    pins: Vec<(usize, f64)>,
    /// True when the factored problem was pure Neumann and node 0 was pinned
    /// as the gauge (see `solve_poisson`'s discussion of pin-then-normalise).
    gauge_pin: bool,
    zero_mean: bool,
    free_index: Vec<usize>,
    free_nodes: Vec<usize>,
    factor: Factor,
}

/// Assemble and factor a Poisson problem, keeping everything needed to solve
/// it again for different data. See [`FactoredPoisson`].
pub fn factor_poisson<'a>(problem: &PoissonProblem<'a>) -> Result<FactoredPoisson<'a>, String> {
    let mesh = problem.mesh;
    let n = mesh.nodes.len();
    if n == 0 {
        return Err("Mesh has no nodes".into());
    }
    if !problem.source.is_empty() && problem.source.len() != mesh.triangles.len() {
        return Err("source must have one value per triangle (or be empty)".into());
    }
    if problem.loop_bcs.len() != mesh.loop_count {
        return Err(format!(
            "expected {} boundary conditions (one per loop), got {}",
            mesh.loop_count,
            problem.loop_bcs.len()
        ));
    }

    // ── Assemble stiffness triplets ───────────────────────────────
    let mut rows: Vec<usize> = Vec::with_capacity(mesh.triangles.len() * 9);
    let mut cols: Vec<usize> = Vec::with_capacity(mesh.triangles.len() * 9);
    let mut vals: Vec<f64> = Vec::with_capacity(mesh.triangles.len() * 9);

    for (e, &t) in mesh.triangles.iter().enumerate() {
        let (b, c, area) = element_geometry(mesh, t);
        if area <= 0.0 {
            return Err(format!("Element {e} has non-positive area — mesh is invalid"));
        }
        let scale = 1.0 / (4.0 * area);
        for i in 0..3 {
            for j in 0..3 {
                rows.push(t[i]);
                cols.push(t[j]);
                vals.push(scale * (b[i] * b[j] + c[i] * c[j]));
            }
        }
    }

    // ── Neumann contributions along boundary edges ────────────────
    // Baked into a load vector once; the pure-Neumann compatibility check in
    // `solve` recovers the flux integral as this vector's sum (each edge adds
    // g*len/2 to each of its two nodes).
    let mut neumann_f = vec![0.0f64; n];
    for (idx, edge) in mesh.boundary_edges.iter().enumerate() {
        let bc = &problem.loop_bcs[edge.loop_id.min(problem.loop_bcs.len() - 1)];
        let g = match bc {
            LoopBc::Neumann { value } => *value,
            LoopBc::NeumannPerEdge => *problem.edge_flux.get(idx).unwrap_or(&0.0),
            LoopBc::Dirichlet { .. } => continue,
        };
        if g == 0.0 {
            continue;
        }
        let pa = mesh.nodes[edge.a];
        let pb = mesh.nodes[edge.b];
        let len = ((pb[0] - pa[0]).powi(2) + (pb[1] - pa[1]).powi(2)).sqrt();
        neumann_f[edge.a] += g * len / 2.0;
        neumann_f[edge.b] += g * len / 2.0;
    }

    // ── The constrained node set ──────────────────────────────────
    let dirichlet_loop: Vec<bool> = problem
        .loop_bcs
        .iter()
        .map(|bc| matches!(bc, LoopBc::Dirichlet { .. }))
        .collect();
    let mut any_dirichlet = dirichlet_loop.iter().any(|&d| d);
    for &(node, _) in &problem.pins {
        if node >= n {
            return Err(format!("pin references node {node} outside the mesh"));
        }
        any_dirichlet = true;
    }

    // A pure-Neumann problem is gauged by pinning node 0 and normalising the
    // mean afterwards — see solve_poisson for why this is a pin and not a
    // Lagrange multiplier (Cholesky needs SPD). The compatibility check itself
    // is per-source, so it runs in `solve`, not here.
    let gauge_pin = !any_dirichlet;
    if gauge_pin && !problem.zero_mean {
        return Err(
            "Pure-Neumann problem with no constraint: the solution is only defined up to a \
             constant. Set `zero_mean` or supply a pin."
                .into(),
        );
    }

    // ── Reduced system over the free DOFs ─────────────────────────
    let mut is_fixed = vec![false; n];
    for (loop_id, &is_d) in dirichlet_loop.iter().enumerate() {
        if is_d {
            for edge in mesh.boundary_edges.iter().filter(|e| e.loop_id == loop_id) {
                is_fixed[edge.a] = true;
                is_fixed[edge.b] = true;
            }
        }
    }
    for &(node, _) in &problem.pins {
        is_fixed[node] = true;
    }
    if gauge_pin {
        is_fixed[0] = true;
    }

    let mut free_index = vec![usize::MAX; n];
    let mut free_nodes: Vec<usize> = Vec::with_capacity(n);
    for i in 0..n {
        if !is_fixed[i] {
            free_index[i] = free_nodes.len();
            free_nodes.push(i);
        }
    }
    let nf = free_nodes.len();
    if nf == 0 {
        return Err("Every node is prescribed — nothing to solve".into());
    }

    let mut r_rows: Vec<usize> = Vec::with_capacity(vals.len());
    let mut r_cols: Vec<usize> = Vec::with_capacity(vals.len());
    let mut r_vals: Vec<f64> = Vec::with_capacity(vals.len());
    for k in 0..vals.len() {
        if !is_fixed[rows[k]] && !is_fixed[cols[k]] {
            r_rows.push(free_index[rows[k]]);
            r_cols.push(free_index[cols[k]]);
            r_vals.push(vals[k]);
        }
    }

    let factor = match problem.strategy {
        SolveStrategy::Sparse => {
            // CscMatrix stores the LOWER TRIANGLE ONLY for symmetric systems
            // (see linalg::sparse). The reduced stiffness is symmetric, so the
            // upper entries are dropped rather than duplicated — passing the
            // full matrix double-counts every off-diagonal and the
            // factorisation fails as not positive definite.
            let (mut lr, mut lc, mut lv) = (
                Vec::with_capacity(r_vals.len()),
                Vec::with_capacity(r_vals.len()),
                Vec::with_capacity(r_vals.len()),
            );
            for k in 0..r_vals.len() {
                if r_rows[k] >= r_cols[k] {
                    lr.push(r_rows[k]);
                    lc.push(r_cols[k]);
                    lv.push(r_vals[k]);
                }
            }
            let a = CscMatrix::from_triplets(nf, &lr, &lc, &lv);
            let sym = std::rc::Rc::new(crate::linalg::sparse_chol::symbolic_cholesky(&a));
            Factor::Sparse(
                crate::linalg::sparse_chol::numeric_cholesky(&sym, &a).ok_or(
                    "Sparse Cholesky failed: the reduced system is not positive definite. \
                     Check that the mesh is connected and that boundary data is well posed.",
                )?,
            )
        }
        SolveStrategy::Dense => {
            let mut dense = vec![0.0f64; nf * nf];
            for k in 0..r_vals.len() {
                dense[r_rows[k] * nf + r_cols[k]] += r_vals[k];
            }
            Factor::Dense(dense)
        }
    };

    Ok(FactoredPoisson {
        mesh,
        rows,
        cols,
        vals,
        neumann_f,
        dirichlet_loop,
        pins: problem.pins.clone(),
        gauge_pin,
        zero_mean: problem.zero_mean,
        free_index,
        free_nodes,
        factor,
    })
}

impl FactoredPoisson<'_> {
    /// Solve for one right-hand side: `source` per triangle (same contract as
    /// [`PoissonProblem::source`], empty means zero) and `dirichlet` carrying
    /// the value prescribed on each Dirichlet loop, indexed by loop id.
    ///
    /// The constrained node SET was fixed at factor time — only the values
    /// may vary here.
    pub fn solve(&self, source: &[f64], dirichlet: &[f64]) -> Result<PoissonSolution, String> {
        let mesh = self.mesh;
        let n = mesh.nodes.len();
        if !source.is_empty() && source.len() != mesh.triangles.len() {
            return Err("source must have one value per triangle (or be empty)".into());
        }
        if self.dirichlet_loop.iter().any(|&d| d) && dirichlet.len() < self.dirichlet_loop.len() {
            // A missing value silently defaulting to zero would prescribe the
            // wrong boundary without any sign of it — wrong numbers, not an
            // error, which is the worst outcome a solver can produce.
            return Err(format!(
                "dirichlet must carry one value per loop ({}), got {}",
                self.dirichlet_loop.len(),
                dirichlet.len()
            ));
        }

        // ── Right-hand side: source + baked Neumann data ──────────
        let mut f = self.neumann_f.clone();
        for (e, &t) in mesh.triangles.iter().enumerate() {
            let fe = source.get(e).copied().unwrap_or(0.0);
            if fe != 0.0 {
                let area = mesh.triangle_area(t);
                for i in 0..3 {
                    f[t[i]] += fe * area / 3.0;
                }
            }
        }

        // ── Prescribed values on the factored pattern ─────────────
        let mut fixed: Vec<Option<f64>> = vec![None; n];
        for (loop_id, &is_d) in self.dirichlet_loop.iter().enumerate() {
            if is_d {
                let value = dirichlet.get(loop_id).copied().unwrap_or(0.0);
                for edge in mesh.boundary_edges.iter().filter(|e| e.loop_id == loop_id) {
                    fixed[edge.a] = Some(value);
                    fixed[edge.b] = Some(value);
                }
            }
        }
        for &(node, value) in &self.pins {
            fixed[node] = Some(value);
        }
        if self.gauge_pin {
            // Compatibility: a pure-Neumann problem is solvable only if the
            // data balances. Integrating -lap(u) = f over the domain and
            // applying the divergence theorem gives
            // integral(f) + boundary_integral(g) = 0; the boundary integral
            // was baked into `neumann_f`, whose sum IS that integral (each
            // edge contributed g*len/2 to each of its two nodes).
            let source_integral: f64 = mesh
                .triangles
                .iter()
                .enumerate()
                .map(|(e, &t)| source.get(e).copied().unwrap_or(0.0) * mesh.triangle_area(t))
                .sum();
            let flux_integral: f64 = self.neumann_f.iter().sum();
            let scale = mesh.area().max(1e-300);
            let imbalance = (source_integral + flux_integral).abs() / scale;
            if imbalance > 1e-6 {
                return Err(format!(
                    "Pure-Neumann data is incompatible: integral(f) + boundary integral(g) = {:.3e} \
                     per unit area, which must vanish for a solution to exist",
                    imbalance
                ));
            }
            fixed[0] = Some(0.0);
        }

        let mut rhs: Vec<f64> = self.free_nodes.iter().map(|&i| f[i]).collect();
        for k in 0..self.vals.len() {
            // Only free-fixed pairs contribute; free-free is in the factor and
            // rows of prescribed equations are dropped — same reduction as at
            // factor time.
            if self.free_index[self.rows[k]] != usize::MAX {
                if let Some(uj) = fixed[self.cols[k]] {
                    rhs[self.free_index[self.rows[k]]] -= self.vals[k] * uj;
                }
            }
        }

        let u_free = match &self.factor {
            Factor::Sparse(fact) => crate::linalg::sparse_chol::sparse_cholesky_solve(fact, &rhs),
            Factor::Dense(dense) => {
                let nf = self.free_nodes.len();
                let mut m = dense.clone();
                lu_solve(&mut m, &mut rhs, nf).ok_or("Dense reference system is singular")?
            }
        };

        let mut u = vec![0.0f64; n];
        for i in 0..n {
            u[i] = match fixed[i] {
                Some(v) => v,
                None => u_free[self.free_index[i]],
            };
        }

        // ── Residual over the free equations, from the original system ──
        let mut ku = vec![0.0f64; n];
        for k in 0..self.vals.len() {
            ku[self.rows[k]] += self.vals[k] * u[self.cols[k]];
        }
        let mut residual: f64 = 0.0;
        for &i in &self.free_nodes {
            residual = residual.max((ku[i] - f[i]).abs());
        }

        let mut solution = PoissonSolution {
            u,
            grad: Vec::new(),
            residual,
        };

        // ── Apply the zero-mean gauge ────────────────────────────
        if self.zero_mean {
            let total = mesh.area();
            if total > 1e-300 {
                let shift = solution.integrate(mesh) / total;
                for v in solution.u.iter_mut() {
                    *v -= shift;
                }
            }
        }

        solution.grad = mesh
            .triangles
            .iter()
            .map(|&t| {
                let (b, c, area) = element_geometry(mesh, t);
                let s = 1.0 / (2.0 * area);
                [
                    s * (b[0] * solution.u[t[0]] + b[1] * solution.u[t[1]] + b[2] * solution.u[t[2]]),
                    s * (c[0] * solution.u[t[0]] + c[1] * solution.u[t[1]] + c[2] * solution.u[t[2]]),
                ]
            })
            .collect();

        Ok(solution)
    }
}

/// Assemble and solve. Equivalent to [`factor_poisson`] followed by one
/// [`FactoredPoisson::solve`] with the problem's own data; callers with more
/// than one right-hand side on the same constrained set should factor once
/// instead.
///
/// Assembly is element-by-element into COO triplets; the reduced system over
/// the free degrees of freedom is then solved by sparse Cholesky. The stiffness
/// of a scalar Poisson problem is symmetric positive definite once at least one
/// value is prescribed, which is exactly the condition Cholesky needs — see
/// `PoissonProblem::zero_mean` for why the pure-Neumann gauge is a pin rather
/// than a Lagrange multiplier.
pub fn solve_poisson(problem: &PoissonProblem) -> Result<PoissonSolution, String> {
    let dirichlet: Vec<f64> = problem
        .loop_bcs
        .iter()
        .map(|bc| match bc {
            LoopBc::Dirichlet { value } => *value,
            _ => 0.0,
        })
        .collect();
    factor_poisson(problem)?.solve(&problem.source, &dirichlet)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::section::mesh::{mesh_section, MeshParams};
    use crate::section::SectionPolygon;

    fn poly(v: &[[f64; 2]]) -> SectionPolygon {
        SectionPolygon { vertices: v.to_vec(), material_id: 0, is_void: false }
    }
    fn void(v: &[[f64; 2]]) -> SectionPolygon {
        SectionPolygon { vertices: v.to_vec(), material_id: 0, is_void: true }
    }
    fn rect(y0: f64, z0: f64, y1: f64, z1: f64) -> SectionPolygon {
        poly(&[[y0, z0], [y1, z0], [y1, z1], [y0, z1]])
    }
    /// Equal-leg angle — concave, acute corner, narrow legs. The scaling study
    /// uses it so element growth reflects a real profile, not a trivial square.
    fn angle(l: f64, t: f64) -> SectionPolygon {
        poly(&[[0.0, 0.0], [l, 0.0], [l, t], [t, t], [t, l], [0.0, l]])
    }
    fn circle(r: f64, n: usize) -> SectionPolygon {
        poly(&(0..n)
            .map(|i| {
                let a = 2.0 * std::f64::consts::PI * (i as f64) / (n as f64);
                [r * a.cos(), r * a.sin()]
            })
            .collect::<Vec<_>>())
    }

    /// Observed convergence rate between two refinement levels, using the
    /// square root of the element count as a proxy for 1/h.
    fn rate(e_coarse: f64, e_fine: f64, n_coarse: usize, n_fine: usize) -> f64 {
        let h_ratio = ((n_fine as f64) / (n_coarse as f64)).sqrt();
        (e_coarse / e_fine).ln() / h_ratio.ln()
    }

    // ── Manufactured solution 1: u = y^2 - z^2 on a square ────────
    //
    // Harmonic, so f = 0 and the exact solution is imposed on the boundary.
    // A P1 solution is exact for linear fields only, so this measures real
    // discretization error rather than a trivially reproduced field.
    #[test]
    fn square_dirichlet_manufactured_solution_converges_at_the_p1_rate() {
        let exact = |y: f64, z: f64| y * y - z * z;
        let exact_grad = |y: f64, z: f64| [2.0 * y, -2.0 * z];

        let mut prev: Option<(f64, f64, usize)> = None;
        let mut rates_l2 = Vec::new();
        let mut rates_h1 = Vec::new();

        for &ma in &[8.0e-2, 2.0e-2, 5.0e-3] {
            let mesh = mesh_section(&[rect(-1.0, -1.0, 1.0, 1.0)], &MeshParams { max_area: ma, ..Default::default() }).unwrap();
            let mut p = PoissonProblem::new(&mesh);
            p.loop_bcs = vec![LoopBc::Dirichlet { value: 0.0 }];
            // Exact Dirichlet data node by node.
            p.pins = mesh
                .boundary_edges
                .iter()
                .flat_map(|e| [e.a, e.b])
                .map(|i| (i, exact(mesh.nodes[i][0], mesh.nodes[i][1])))
                .collect();
            let sol = solve_poisson(&p).unwrap();

            assert!(sol.residual < 1e-8, "residual {}", sol.residual);
            let l2 = sol.l2_error(&mesh, exact);
            let h1 = sol.h1_error(&mesh, exact_grad);
            if let Some((pl2, ph1, pn)) = prev {
                rates_l2.push(rate(pl2, l2, pn, mesh.triangles.len()));
                rates_h1.push(rate(ph1, h1, pn, mesh.triangles.len()));
            }
            prev = Some((l2, h1, mesh.triangles.len()));
        }

        let l2_rate = rates_l2.iter().sum::<f64>() / rates_l2.len() as f64;
        let h1_rate = rates_h1.iter().sum::<f64>() / rates_h1.len() as f64;
        // P1: O(h^2) in L2, O(h) in the gradient.
        assert!(l2_rate > 1.7, "L2 convergence rate {l2_rate:.2}, expected ~2");
        assert!(h1_rate > 0.85, "gradient convergence rate {h1_rate:.2}, expected ~1");
    }

    // ── Manufactured solution 2: non-zero source ─────────────────
    //
    // u = sin(pi y) sin(pi z) on the unit square, so f = 2 pi^2 u and u = 0 on
    // the boundary. Exercises the consistent load vector.
    #[test]
    fn square_with_source_term_converges() {
        use std::f64::consts::PI;
        let exact = |y: f64, z: f64| (PI * y).sin() * (PI * z).sin();

        let mut prev: Option<(f64, usize)> = None;
        let mut rates = Vec::new();
        for &ma in &[3.2e-2, 8.0e-3, 2.0e-3] {
            let mesh = mesh_section(&[rect(0.0, 0.0, 1.0, 1.0)], &MeshParams { max_area: ma, ..Default::default() }).unwrap();
            let mut p = PoissonProblem::new(&mesh);
            p.loop_bcs = vec![LoopBc::Dirichlet { value: 0.0 }];
            p.source = mesh
                .triangles
                .iter()
                .map(|&t| {
                    let cy = (mesh.nodes[t[0]][0] + mesh.nodes[t[1]][0] + mesh.nodes[t[2]][0]) / 3.0;
                    let cz = (mesh.nodes[t[0]][1] + mesh.nodes[t[1]][1] + mesh.nodes[t[2]][1]) / 3.0;
                    2.0 * PI * PI * exact(cy, cz)
                })
                .collect();
            let sol = solve_poisson(&p).unwrap();
            assert!(sol.residual < 1e-8, "residual {}", sol.residual);
            let l2 = sol.l2_error(&mesh, exact);
            if let Some((pl2, pn)) = prev {
                rates.push(rate(pl2, l2, pn, mesh.triangles.len()));
            }
            prev = Some((l2, mesh.triangles.len()));
        }
        let r = rates.iter().sum::<f64>() / rates.len() as f64;
        assert!(r > 1.6, "L2 rate {r:.2} for the sourced problem, expected ~2");
    }

    // ── Triangle domain ──────────────────────────────────────────
    #[test]
    fn triangular_domain_reproduces_a_linear_field_exactly() {
        // P1 spaces contain linear functions, so this must be exact to
        // round-off — a sharp check that assembly and BC handling are right.
        let exact = |y: f64, z: f64| 3.0 + 2.0 * y - 5.0 * z;
        let mesh = mesh_section(
            &[poly(&[[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]])],
            &MeshParams { max_area: 1e-2, ..Default::default() },
        )
        .unwrap();
        let mut p = PoissonProblem::new(&mesh);
        p.loop_bcs = vec![LoopBc::Dirichlet { value: 0.0 }];
        p.pins = mesh
            .boundary_edges
            .iter()
            .flat_map(|e| [e.a, e.b])
            .map(|i| (i, exact(mesh.nodes[i][0], mesh.nodes[i][1])))
            .collect();
        let sol = solve_poisson(&p).unwrap();
        assert!(sol.l2_error(&mesh, exact) < 1e-12, "linear field must be exact");
        for g in &sol.grad {
            assert!((g[0] - 2.0).abs() < 1e-9 && (g[1] + 5.0).abs() < 1e-9);
        }
    }

    // ── Circular domain with a known solution ────────────────────
    #[test]
    fn circle_with_unit_source_matches_the_analytic_solution() {
        // -lap(u) = 4, u = 0 on |x| = R  =>  u = R^2 - y^2 - z^2,
        // and integral(u) = pi R^4 / 2.
        let r = 1.0;
        let exact = |y: f64, z: f64| r * r - y * y - z * z;
        let mut prev: Option<(f64, usize)> = None;
        let mut rates = Vec::new();
        for &(nb, ma) in &[(48usize, 4.0e-2f64), (96, 1.0e-2), (192, 2.5e-3)] {
            let mesh = mesh_section(&[circle(r, nb)], &MeshParams { max_area: ma, ..Default::default() }).unwrap();
            let mut p = PoissonProblem::new(&mesh);
            p.loop_bcs = vec![LoopBc::Dirichlet { value: 0.0 }];
            p.source = vec![4.0; mesh.triangles.len()];
            let sol = solve_poisson(&p).unwrap();
            let l2 = sol.l2_error(&mesh, exact);
            if let Some((pl2, pn)) = prev {
                rates.push(rate(pl2, l2, pn, mesh.triangles.len()));
            }
            prev = Some((l2, mesh.triangles.len()));

            // Integral quantity — the shape every torsion constant takes.
            let integral = sol.integrate(&mesh);
            let exact_integral = std::f64::consts::PI * r.powi(4) / 2.0;
            let err = ((integral - exact_integral) / exact_integral).abs();
            assert!(err < 2e-2, "integral error {err:.3e} at maxArea={ma}");
        }
        let rr = rates.iter().sum::<f64>() / rates.len() as f64;
        assert!(rr > 1.3, "L2 rate {rr:.2} on the circle (boundary polygonization limits it)");
    }

    // ── Domain with a hole, per-loop Dirichlet values ────────────
    #[test]
    fn annulus_with_distinct_loop_values_matches_the_log_solution() {
        // lap(u) = 0 in an annulus with u = 0 outside and u = 1 on the hole is
        // u = ln(r_out/r) / ln(r_out/r_in) — the multiply-connected case the
        // torsion solver will need.
        let (ri, ro) = (0.4, 1.0);
        let exact = |y: f64, z: f64| {
            let r = (y * y + z * z).sqrt();
            (ro / r).ln() / (ro / ri).ln()
        };
        let mesh = mesh_section(
            &[circle(ro, 96), void(&circle(ri, 72).vertices)],
            &MeshParams { max_area: 1.2e-2, ..Default::default() },
        )
        .unwrap();
        assert_eq!(mesh.loop_count, 2);
        let mut p = PoissonProblem::new(&mesh);
        p.loop_bcs = vec![LoopBc::Dirichlet { value: 0.0 }, LoopBc::Dirichlet { value: 1.0 }];
        let sol = solve_poisson(&p).unwrap();
        assert!(sol.residual < 1e-8, "residual {}", sol.residual);
        let err = sol.l2_error(&mesh, exact);
        let norm = (std::f64::consts::PI * (ro * ro - ri * ri)).sqrt();
        assert!(err / norm < 2e-2, "relative L2 error {:.3e}", err / norm);
        // Values must respect both loops.
        assert!(sol.u.iter().cloned().fold(f64::MIN, f64::max) <= 1.0 + 1e-9);
        assert!(sol.u.iter().cloned().fold(f64::MAX, f64::min) >= -1e-9);
    }

    // ── Mixed Dirichlet / Neumann ────────────────────────────────
    #[test]
    fn mixed_boundary_conditions_reproduce_a_linear_field() {
        // u = z on the unit square: u = 0 pinned on the bottom, du/dn = 1 on
        // the top, zero flux on the sides. Linear, so P1 must be exact.
        let mesh = mesh_section(&[rect(0.0, 0.0, 1.0, 1.0)], &MeshParams { max_area: 1.6e-2, ..Default::default() }).unwrap();
        let mut p = PoissonProblem::new(&mesh);
        p.loop_bcs = vec![LoopBc::NeumannPerEdge];
        p.edge_flux = mesh
            .boundary_edges
            .iter()
            .map(|e| {
                let zm = 0.5 * (mesh.nodes[e.a][1] + mesh.nodes[e.b][1]);
                let ym = 0.5 * (mesh.nodes[e.a][0] + mesh.nodes[e.b][0]);
                // Top edge: outward normal +z, du/dn = 1. Sides: normal +/-y, du/dn = 0.
                if (zm - 1.0).abs() < 1e-12 && ym > 1e-12 && ym < 1.0 - 1e-12 { 1.0 } else { 0.0 }
            })
            .collect();
        // Dirichlet along the bottom edge only.
        p.pins = mesh
            .boundary_edges
            .iter()
            .flat_map(|e| [e.a, e.b])
            .filter(|&i| mesh.nodes[i][1].abs() < 1e-12)
            .map(|i| (i, 0.0))
            .collect();
        let sol = solve_poisson(&p).unwrap();
        assert!(sol.residual < 1e-8, "residual {}", sol.residual);
        assert!(sol.l2_error(&mesh, |_, z| z) < 1e-9, "mixed BC must reproduce u = z exactly");
    }

    // ── Pure Neumann and its null space ──────────────────────────
    #[test]
    fn pure_neumann_without_a_constraint_is_rejected() {
        let mesh = mesh_section(&[rect(0.0, 0.0, 1.0, 1.0)], &MeshParams { max_area: 2e-2, ..Default::default() }).unwrap();
        let mut p = PoissonProblem::new(&mesh);
        p.loop_bcs = vec![LoopBc::Neumann { value: 0.0 }];
        let err = solve_poisson(&p).expect_err("must not silently pick one of infinitely many solutions");
        assert!(err.contains("Pure-Neumann"), "unexpected error: {err}");
    }

    #[test]
    fn pure_neumann_with_zero_mean_recovers_the_compatible_solution() {
        // f = 0 with du/dn = (-z, -y).n is the boundary data of the warping
        // problem; on a square centred at the origin the compatible solution is
        // u = -y*z, fixed here by the zero-mean constraint (const = 0 by
        // symmetry).
        //
        // Note -y*z is BILINEAR, not linear, so P1 cannot reproduce it exactly.
        // The check is therefore convergence at the P1 rate, plus the two
        // properties that must hold exactly: the zero-mean constraint itself,
        // and a vanishing residual.
        let flux_for = |mesh: &SectionMesh| -> Vec<f64> {
            mesh.boundary_edges
                .iter()
                .map(|e| {
                    let (a, b) = (mesh.nodes[e.a], mesh.nodes[e.b]);
                    let (ym, zm) = (0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1]));
                    let (ny, nz) = if (ym - 0.5).abs() < 1e-9 {
                        (1.0, 0.0)
                    } else if (ym + 0.5).abs() < 1e-9 {
                        (-1.0, 0.0)
                    } else if (zm - 0.5).abs() < 1e-9 {
                        (0.0, 1.0)
                    } else {
                        (0.0, -1.0)
                    };
                    -zm * ny - ym * nz
                })
                .collect()
        };

        let mut prev: Option<(f64, usize)> = None;
        let mut rates = Vec::new();
        for &ma in &[2.4e-2, 6.0e-3, 1.5e-3] {
            let mesh = mesh_section(&[rect(-0.5, -0.5, 0.5, 0.5)], &MeshParams { max_area: ma, ..Default::default() }).unwrap();
            let mut p = PoissonProblem::new(&mesh);
            p.loop_bcs = vec![LoopBc::NeumannPerEdge];
            p.zero_mean = true;
            p.edge_flux = flux_for(&mesh);
            let sol = solve_poisson(&p).unwrap();

            assert!(sol.residual < 1e-7, "residual {}", sol.residual);
            assert!(sol.integrate(&mesh).abs() < 1e-9, "zero-mean constraint not satisfied");

            let l2 = sol.l2_error(&mesh, |y, z| -y * z);
            if let Some((pl2, pn)) = prev {
                rates.push(rate(pl2, l2, pn, mesh.triangles.len()));
            }
            prev = Some((l2, mesh.triangles.len()));
        }
        let r = rates.iter().sum::<f64>() / rates.len() as f64;
        assert!(r > 1.6, "pure-Neumann L2 rate {r:.2}, expected ~2 for P1");
    }

    #[test]
    fn pure_neumann_with_a_pin_matches_the_zero_mean_solution_up_to_a_constant() {
        let mesh = mesh_section(&[rect(-0.5, -0.5, 0.5, 0.5)], &MeshParams { max_area: 8e-3, ..Default::default() }).unwrap();
        let flux: Vec<f64> = mesh
            .boundary_edges
            .iter()
            .map(|e| {
                let (a, b) = (mesh.nodes[e.a], mesh.nodes[e.b]);
                let (ym, zm) = (0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1]));
                let (ny, nz) = if (ym - 0.5).abs() < 1e-12 {
                    (1.0, 0.0)
                } else if (ym + 0.5).abs() < 1e-12 {
                    (-1.0, 0.0)
                } else if (zm - 0.5).abs() < 1e-12 {
                    (0.0, 1.0)
                } else {
                    (0.0, -1.0)
                };
                -zm * ny - ym * nz
            })
            .collect();

        let mut a = PoissonProblem::new(&mesh);
        a.loop_bcs = vec![LoopBc::NeumannPerEdge];
        a.edge_flux = flux.clone();
        a.zero_mean = true;
        let sa = solve_poisson(&a).unwrap();

        let mut b = PoissonProblem::new(&mesh);
        b.loop_bcs = vec![LoopBc::NeumannPerEdge];
        b.edge_flux = flux;
        b.pins = vec![(0, 0.0)];
        let sb = solve_poisson(&b).unwrap();

        // Gradients are the physically meaningful output and must agree exactly.
        for (ga, gb) in sa.grad.iter().zip(sb.grad.iter()) {
            assert!((ga[0] - gb[0]).abs() < 1e-9 && (ga[1] - gb[1]).abs() < 1e-9);
        }
    }

    // ── Sparse production path ───────────────────────────────────

    #[test]
    fn sparse_and_dense_agree_on_small_systems() {
        // Same problem, both strategies. The sparse path is the production one;
        // the dense LU is kept solely as this reference.
        for &ma in &[3.0e-2, 1.0e-2] {
            let mesh = mesh_section(&[rect(0.0, 0.0, 1.0, 1.0)], &MeshParams { max_area: ma, ..Default::default() }).unwrap();
            let make = |strategy| {
                let mut p = PoissonProblem::new(&mesh);
                p.loop_bcs = vec![LoopBc::Dirichlet { value: 0.0 }];
                p.source = vec![4.0; mesh.triangles.len()];
                p.strategy = strategy;
                solve_poisson(&p).unwrap()
            };
            let sp = make(SolveStrategy::Sparse);
            let dn = make(SolveStrategy::Dense);
            let worst = sp.u.iter().zip(dn.u.iter()).map(|(a, b)| (a - b).abs()).fold(0.0, f64::max);
            let scale = dn.u.iter().fold(0.0f64, |m, v| m.max(v.abs())).max(1e-12);
            assert!(worst / scale < 1e-9, "sparse vs dense differ by {:.3e} (relative)", worst / scale);
            assert!(sp.residual < 1e-9 && dn.residual < 1e-9);
        }
    }

    #[test]
    fn sparse_and_dense_agree_on_a_multiply_connected_domain() {
        let mesh = mesh_section(
            &[circle(1.0, 64), void(&circle(0.4, 48).vertices)],
            &MeshParams { max_area: 2.0e-2, ..Default::default() },
        )
        .unwrap();
        let make = |strategy| {
            let mut p = PoissonProblem::new(&mesh);
            p.loop_bcs = vec![LoopBc::Dirichlet { value: 0.0 }, LoopBc::Dirichlet { value: 1.0 }];
            p.strategy = strategy;
            solve_poisson(&p).unwrap()
        };
        let sp = make(SolveStrategy::Sparse);
        let dn = make(SolveStrategy::Dense);
        let worst = sp.u.iter().zip(dn.u.iter()).map(|(a, b)| (a - b).abs()).fold(0.0, f64::max);
        assert!(worst < 1e-9, "sparse vs dense differ by {worst:.3e}");
    }

    #[test]
    #[ignore = "wall clock: runs alone in Engine Gates (make test.engine.gates)"]
    fn sparse_path_scales_better_than_cubically() {
        use std::time::Instant;
        // Three refinement levels on the angle profile — the geometry with the
        // narrow legs and the acute corner, so element counts grow realistically.
        let (l, t) = (0.100, 0.010);
        let mut rows: Vec<(usize, usize, f64, f64)> = Vec::new();
        let mut sizes = Vec::new();

        for &ma in &[8.0e-6, 2.0e-6, 5.0e-7] {
            let t0 = Instant::now();
            let mesh = mesh_section(&[angle(l, t)], &MeshParams { max_area: ma, ..Default::default() }).unwrap();
            let mesh_ms = t0.elapsed().as_secs_f64() * 1e3;

            let mut p = PoissonProblem::new(&mesh);
            p.loop_bcs = vec![LoopBc::Dirichlet { value: 0.0 }];
            p.source = vec![2.0; mesh.triangles.len()];

            let t1 = Instant::now();
            let sol = solve_poisson(&p).unwrap();
            let solve_ms = t1.elapsed().as_secs_f64() * 1e3;

            assert!(sol.residual < 1e-6, "residual {} at maxArea={ma}", sol.residual);
            println!(
                "  maxArea={:<9.1e} nodes={:<6} tris={:<6} mesh={:>7.1} ms  assemble+factor+solve={:>7.1} ms",
                ma, mesh.nodes.len(), mesh.triangles.len(), mesh_ms, solve_ms
            );
            rows.push((mesh.nodes.len(), mesh.triangles.len(), mesh_ms, solve_ms));
            sizes.push(mesh.nodes.len());
        }

        // Empirical exponent: t ~ n^k. Dense LU is k = 3. Sparse Cholesky on a
        // 2D mesh is theoretically ~n^1.5; the bar here is set at 2.5 so the
        // test measures the asymptotic class rather than machine noise.
        let (n0, _, _, s0) = rows[0];
        let (n2, _, _, s2) = rows[rows.len() - 1];
        let k = (s2.max(1e-3) / s0.max(1e-3)).ln() / ((n2 as f64) / (n0 as f64)).ln();
        println!("  observed exponent t ~ n^{k:.2} (dense LU would be 3.0)");
        crate::wall_clock::budget(k < 2.5, || format!("solve time scales as n^{k:.2} — that is dense-like, not sparse"));
        assert!(sizes[sizes.len() - 1] > 4 * sizes[0], "the three levels must actually differ in size");
    }

    #[test]
    fn rejects_incompatible_pure_neumann_data() {
        // A pure-Neumann problem is solvable only if integral(f) + boundary
        // integral(g) vanishes. Here f = 1 with zero flux, so no solution
        // exists; returning one anyway would be reporting a fiction.
        let mesh = mesh_section(&[rect(0.0, 0.0, 1.0, 1.0)], &MeshParams { max_area: 2e-2, ..Default::default() }).unwrap();
        let mut p = PoissonProblem::new(&mesh);
        p.loop_bcs = vec![LoopBc::Neumann { value: 0.0 }];
        p.source = vec![1.0; mesh.triangles.len()];
        p.zero_mean = true;
        let err = solve_poisson(&p).expect_err("incompatible data must be rejected");
        assert!(err.contains("incompatible"), "unexpected error: {err}");
    }

    #[test]
    fn accepts_compatible_pure_neumann_data() {
        // f = -2 over a unit square balanced by g = +0.5 on all four edges
        // (perimeter 4): integral(f) = -2, boundary integral(g) = +2.
        let mesh = mesh_section(&[rect(0.0, 0.0, 1.0, 1.0)], &MeshParams { max_area: 2e-2, ..Default::default() }).unwrap();
        let mut p = PoissonProblem::new(&mesh);
        p.loop_bcs = vec![LoopBc::Neumann { value: 0.5 }];
        p.source = vec![-2.0; mesh.triangles.len()];
        p.zero_mean = true;
        let sol = solve_poisson(&p).unwrap();
        assert!(sol.residual < 1e-8, "residual {}", sol.residual);
        assert!(sol.integrate(&mesh).abs() < 1e-9, "gauge not applied");
    }

    // ── Input validation ─────────────────────────────────────────
    #[test]
    fn rejects_malformed_problems() {
        let mesh = mesh_section(&[rect(0.0, 0.0, 1.0, 1.0)], &MeshParams { max_area: 5e-2, ..Default::default() }).unwrap();

        let mut p = PoissonProblem::new(&mesh);
        p.loop_bcs = vec![];
        assert!(solve_poisson(&p).is_err(), "missing BCs");

        let mut p = PoissonProblem::new(&mesh);
        p.loop_bcs = vec![LoopBc::Dirichlet { value: 0.0 }];
        p.source = vec![1.0; 3];
        assert!(solve_poisson(&p).is_err(), "wrong source length");

        let mut p = PoissonProblem::new(&mesh);
        p.loop_bcs = vec![LoopBc::Dirichlet { value: 0.0 }];
        p.pins = vec![(usize::MAX, 0.0)];
        assert!(solve_poisson(&p).is_err(), "out-of-range pin");
    }
}
