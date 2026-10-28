//! Assembly and solution on the engine's sparse Cholesky.
//!
//! Every quantity here is the linear response about an equilibrium state. Each bond contributes
//! the 2 x 2 tangent S = k n n^T + (t / L)(I - n n^T) (material plus initial-tension term, t the
//! bond tension, L its length, n its direction) acting on the change d of the bond vector; the
//! energy to second order is sum_e d_e^T S_e d_e / 2.
//!
//! Floppy (zero-energy) modes make the stiffness singular. They are handled by factoring
//! K + delta I with delta = 1e-10 times the largest diagonal entry. Any load that the network
//! must carry is orthogonal to the floppy modes (for E = |R u + G e|^2 / 2, K = R^T R and the
//! strain coupling R^T G both vanish on the null space of R), so the regularised solution
//! converges to the pseudo-inverse one as delta -> 0; `tests/properties.rs` checks the size of
//! that error.

use std::rc::Rc;

use dedaliano_engine::linalg::{numeric_cholesky, sparse_cholesky_solve, symbolic_cholesky, CscMatrix};
use serde::Serialize;

use crate::network::Network;

pub const REGULARISATION: f64 = 1e-10;
pub const REFINEMENT_STEPS: usize = 3;

/// Tangent of each bond at positions `pos`: (S, tension, unit direction, length).
pub fn bond_tangents(net: &Network, pos: &[[f64; 2]]) -> Vec<([[f64; 2]; 2], f64, [f64; 2], f64)> {
    net.bonds
        .iter()
        .map(|e| {
            let d = net.bond_vector(pos, e);
            let l = d[0].hypot(d[1]);
            let n = [d[0] / l, d[1] / l];
            let t = e.k * (l - e.rest);
            let g = t / l;
            let mut s = [[0.0; 2]; 2];
            for i in 0..2 {
                for j in 0..2 {
                    let id = if i == j { 1.0 } else { 0.0 };
                    s[i][j] = e.k * n[i] * n[j] + g * (id - n[i] * n[j]);
                }
            }
            (s, t, n, l)
        })
        .collect()
}

/// Symmetric matrix over the free degrees of freedom (two per free node), from bond blocks.
struct System {
    dof: Vec<usize>, // node -> first dof, or usize::MAX when the node is held
    n: usize,
    rows: Vec<usize>,
    cols: Vec<usize>,
    vals: Vec<f64>,
}

impl System {
    fn new(n_nodes: usize, held: &[bool]) -> System {
        let mut dof = vec![usize::MAX; n_nodes];
        let mut n = 0;
        for (i, d) in dof.iter_mut().enumerate() {
            if !held.get(i).copied().unwrap_or(false) {
                *d = n;
                n += 2;
            }
        }
        System { dof, n, rows: Vec::new(), cols: Vec::new(), vals: Vec::new() }
    }

    fn push(&mut self, r: usize, c: usize, v: f64) {
        if r >= c {
            self.rows.push(r);
            self.cols.push(c);
            self.vals.push(v);
        }
    }

    /// Add the block [[S, -S], [-S, S]] of bond a-b.
    fn add_bond(&mut self, a: usize, b: usize, s: &[[f64; 2]; 2]) {
        let ends = [(self.dof[a], 1.0), (self.dof[b], -1.0)];
        let ends2 = [(self.dof[a], 1.0), (self.dof[b], -1.0)];
        for &(da, sa) in &ends {
            if da == usize::MAX {
                continue;
            }
            for &(db, sb) in &ends2 {
                if db == usize::MAX {
                    continue;
                }
                for i in 0..2 {
                    for j in 0..2 {
                        self.push(da + i, db + j, sa * sb * s[i][j]);
                    }
                }
            }
        }
    }

    /// Factor K + delta I and solve for each right-hand side.
    fn solve(&self, rhs: &[Vec<f64>]) -> Result<Vec<Vec<f64>>, String> {
        if self.n == 0 {
            return Ok(rhs.iter().map(|_| Vec::new()).collect());
        }
        let mut rows = self.rows.clone();
        let mut cols = self.cols.clone();
        let mut vals = self.vals.clone();
        let mut diag = vec![0.0; self.n];
        for k in 0..rows.len() {
            if rows[k] == cols[k] {
                diag[rows[k]] += vals[k];
            }
        }
        let dmax = diag.iter().cloned().fold(0.0f64, f64::max).max(1e-300);
        for i in 0..self.n {
            rows.push(i);
            cols.push(i);
            vals.push(REGULARISATION * dmax);
        }
        let m = CscMatrix::from_triplets(self.n, &rows, &cols, &vals);
        let k = CscMatrix::from_triplets(self.n, &self.rows, &self.cols, &self.vals);
        let sym = Rc::new(symbolic_cholesky(&m));
        let f = numeric_cholesky(&sym, &m).ok_or("stiffness is not positive semi-definite (compressed bonds?)")?;
        // Iterative refinement against the unshifted K: each step multiplies the shift's error by
        // delta / (lambda + delta) on the non-floppy modes and adds nothing on the floppy ones
        // (the residual of a load orthogonal to them stays orthogonal).
        Ok(rhs
            .iter()
            .map(|b| {
                let mut x = sparse_cholesky_solve(&f, b);
                for _ in 0..REFINEMENT_STEPS {
                    let kx = k.sym_mat_vec(&x);
                    let r: Vec<f64> = b.iter().zip(&kx).map(|(bi, ki)| bi - ki).collect();
                    let dx = sparse_cholesky_solve(&f, &r);
                    x.iter_mut().zip(&dx).for_each(|(xi, di)| *xi += di);
                }
                x
            })
            .collect())
    }
}

/// Coupling of a bond vector to the macroscopic strain e = (exx, eyy, exy) (tensor shear):
/// the affine change of the bond vector r is E r = G(r) e.
fn strain_map(r: [f64; 2]) -> [[f64; 3]; 2] {
    [[r[0], 0.0, r[1]], [0.0, r[1], r[0]]]
}

#[derive(Clone, Debug, Serialize)]
pub struct Relaxation {
    pub positions: Vec<[f64; 2]>,
    pub iterations: usize,
    /// Largest net force on a free node after relaxation.
    pub residual: f64,
    pub energy: f64,
}

/// Newton relaxation of the free nodes to mechanical equilibrium (nonlinear spring energy, cell
/// fixed), with backtracking on the energy. Needed only when the rest lengths are not the
/// built lengths (prestress); a stress-free network is returned unchanged.
pub fn relax(net: &Network, start: &[[f64; 2]], held: &[bool], tol: f64, max_iter: usize) -> Result<Relaxation, String> {
    let mut pos = start.to_vec();
    let kmax = net.bonds.iter().map(|e| e.k).fold(0.0f64, f64::max).max(1e-300);
    let force = |pos: &[[f64; 2]]| -> Vec<[f64; 2]> {
        let mut f = vec![[0.0; 2]; pos.len()];
        for e in &net.bonds {
            let d = net.bond_vector(pos, e);
            let l = d[0].hypot(d[1]);
            let t = e.k * (l - e.rest);
            for k in 0..2 {
                let c = t * d[k] / l;
                f[e.a][k] += c;
                f[e.b][k] -= c;
            }
        }
        f
    };
    let residual = |f: &[[f64; 2]]| -> f64 {
        f.iter().enumerate().filter(|(i, _)| !held.get(*i).copied().unwrap_or(false)).map(|(_, v)| v[0].abs().max(v[1].abs())).fold(0.0, f64::max)
    };
    let mut iterations = 0;
    loop {
        let f = force(&pos);
        let r = residual(&f);
        if r <= tol * kmax || iterations >= max_iter {
            if r > tol * kmax {
                return Err(format!("relaxation did not converge: residual {r:.3e} after {iterations} iterations"));
            }
            let energy = net.energy(&pos);
            return Ok(Relaxation { positions: pos, iterations, residual: r, energy });
        }
        let mut sys = System::new(pos.len(), held);
        for (e, (s, _, _, _)) in net.bonds.iter().zip(bond_tangents(net, &pos)) {
            // Compressed bonds make the tangent indefinite; keep only the material part for them
            // in the Newton matrix (a modified Newton step; equilibrium is still exact).
            let s = if s[0][0] + s[1][1] < 0.0 { [[0.0; 2]; 2] } else { s };
            sys.add_bond(e.a, e.b, &s);
        }
        let mut rhs = vec![0.0; sys.n];
        for (i, fi) in f.iter().enumerate() {
            if sys.dof[i] != usize::MAX {
                rhs[sys.dof[i]] = fi[0];
                rhs[sys.dof[i] + 1] = fi[1];
            }
        }
        let du = sys.solve(&[rhs])?.remove(0);
        let e0 = net.energy(&pos);
        let mut step = 1.0;
        let mut accepted = false;
        for _ in 0..40 {
            let mut trial = pos.clone();
            for (i, p) in trial.iter_mut().enumerate() {
                if sys.dof[i] != usize::MAX {
                    p[0] += step * du[sys.dof[i]];
                    p[1] += step * du[sys.dof[i] + 1];
                }
            }
            if net.energy(&trial) <= e0 + 1e-14 * e0.abs().max(1e-300) {
                pos = trial;
                accepted = true;
                break;
            }
            step *= 0.5;
        }
        if !accepted {
            return Err("relaxation line search failed".into());
        }
        iterations += 1;
    }
}

/// Linear response of a periodic network to macroscopic strain.
#[derive(Clone, Debug, Serialize)]
pub struct PeriodicResponse {
    /// Effective stiffness in (exx, eyy, exy) with tensor shear: energy per area = e^T C e / 2.
    pub c: [[f64; 3]; 3],
    /// The affine-only stiffness (no relaxation), for comparison.
    pub c_affine: [[f64; 3]; 3],
    /// Nonaffine displacement of every node per unit strain component, mean removed:
    /// u[node][component] = [ux, uy].
    pub u: Vec<[[f64; 2]; 3]>,
    pub area: f64,
}

/// Effective moduli of a periodic network at equilibrium positions `pos` (Lagrange multiplier
/// free formulation: the strain enters through the bond vectors, node fluctuations relax).
pub fn periodic_response(net: &Network, pos: &[[f64; 2]]) -> Result<PeriodicResponse, String> {
    let area = net.area().ok_or("periodic_response needs a periodic network")?;
    let n_nodes = pos.len();
    let mut sys = System::new(n_nodes, &[]);
    let mut kue = vec![vec![0.0; 2 * n_nodes]; 3];
    let mut kee = [[0.0; 3]; 3];
    for (e, (s, _, _, _)) in net.bonds.iter().zip(bond_tangents(net, pos)) {
        sys.add_bond(e.a, e.b, &s);
        let r = net.bond_vector(pos, e);
        let g = strain_map(r);
        // S G (2 x 3)
        let mut sg = [[0.0; 3]; 2];
        for i in 0..2 {
            for c in 0..3 {
                sg[i][c] = s[i][0] * g[0][c] + s[i][1] * g[1][c];
            }
        }
        for c in 0..3 {
            for i in 0..2 {
                kue[c][2 * e.b + i] += sg[i][c];
                kue[c][2 * e.a + i] -= sg[i][c];
            }
            for c2 in 0..3 {
                kee[c][c2] += g[0][c] * sg[0][c2] + g[1][c] * sg[1][c2];
            }
        }
    }
    let rhs: Vec<Vec<f64>> = kue.iter().map(|v| v.iter().map(|x| -x).collect()).collect();
    let sol = sys.solve(&rhs)?;
    let mut c = [[0.0; 3]; 3];
    let mut c_affine = [[0.0; 3]; 3];
    for a in 0..3 {
        for b in 0..3 {
            let mut v = kee[a][b];
            for k in 0..2 * n_nodes {
                v += kue[a][k] * sol[b][k];
            }
            c[a][b] = v / area;
            c_affine[a][b] = kee[a][b] / area;
        }
    }
    // Symmetrise (the two products differ only by rounding).
    for a in 0..3 {
        for b in 0..a {
            let m = 0.5 * (c[a][b] + c[b][a]);
            c[a][b] = m;
            c[b][a] = m;
        }
    }
    let mut u = vec![[[0.0; 2]; 3]; n_nodes];
    for comp in 0..3 {
        let mut mean = [0.0; 2];
        for i in 0..n_nodes {
            for k in 0..2 {
                mean[k] += sol[comp][2 * i + k] / n_nodes as f64;
            }
        }
        for i in 0..n_nodes {
            for k in 0..2 {
                u[i][comp][k] = sol[comp][2 * i + k] - mean[k];
            }
        }
    }
    Ok(PeriodicResponse { c, c_affine, u, area })
}

/// Linear response of a finite network with prescribed displacements on the `held` nodes.
#[derive(Clone, Debug, Serialize)]
pub struct FiniteResponse {
    /// Displacement of every node (prescribed ones included).
    pub u: Vec<[f64; 2]>,
    /// Axial force change of each bond (tension positive), k n . (u_b - u_a).
    pub force: Vec<f64>,
}

pub fn finite_response(net: &Network, pos: &[[f64; 2]], held: &[bool], prescribed: &[[f64; 2]]) -> Result<FiniteResponse, String> {
    if net.cell.is_some() {
        return Err("finite_response needs a finite network".into());
    }
    let tangents = bond_tangents(net, pos);
    let mut sys = System::new(pos.len(), held);
    let mut rhs = vec![0.0; sys.n];
    for (e, (s, _, _, _)) in net.bonds.iter().zip(&tangents) {
        sys.add_bond(e.a, e.b, s);
        // Move the prescribed displacements to the right-hand side.
        for (free, other, sign) in [(e.a, e.b, -1.0), (e.b, e.a, -1.0)] {
            let df = sys.dof[free];
            if df == usize::MAX || sys.dof[other] != usize::MAX {
                continue;
            }
            // force on free end from bond = S (u_other - u_free) ... coupling term K_fo u_o = -S u_o
            let uo = prescribed[other];
            for i in 0..2 {
                rhs[df + i] -= sign * (s[i][0] * uo[0] + s[i][1] * uo[1]);
            }
        }
    }
    let sol = sys.solve(&[rhs])?.remove(0);
    let mut u = vec![[0.0; 2]; pos.len()];
    for i in 0..pos.len() {
        if sys.dof[i] == usize::MAX {
            u[i] = prescribed[i];
        } else {
            u[i] = [sol[sys.dof[i]], sol[sys.dof[i] + 1]];
        }
    }
    let force = net
        .bonds
        .iter()
        .zip(&tangents)
        .map(|(e, (_, _, n, _))| e.k * (n[0] * (u[e.b][0] - u[e.a][0]) + n[1] * (u[e.b][1] - u[e.a][1])))
        .collect();
    Ok(FiniteResponse { u, force })
}
