//! Unit cells of the lattices used by the paper and by the independent checks, and the two ways
//! a network is built from them: a periodic supercell, or a finite sample clipped from the
//! (possibly rotated) infinite lattice.

use serde::{Deserialize, Serialize};

use crate::network::{Bond, Network};

/// A lattice: two lattice vectors, the positions of the basis nodes in one cell, and the bonds,
/// each joining basis node `a` of cell (i, j) to basis node `b` of cell (i + s0, j + s1), with a
/// stiffness factor (1 for ordinary springs).
#[derive(Clone, Debug)]
pub struct UnitCell {
    pub a1: [f64; 2],
    pub a2: [f64; 2],
    pub basis: Vec<[f64; 2]>,
    pub bonds: Vec<CellBond>,
}

#[derive(Clone, Copy, Debug)]
pub struct CellBond {
    pub a: usize,
    pub b: usize,
    pub shift: [i32; 2],
    pub k_factor: f64,
}

fn cb(a: usize, b: usize, s0: i32, s1: i32, k_factor: f64) -> CellBond {
    CellBond { a, b, shift: [s0, s1], k_factor }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LatticeKind {
    /// Triangular Bravais lattice of the paper's Eq. (25): v1 = (1, 0), v2 = (phi/2, psi sqrt(3)/2),
    /// bonds v1, v2 and v1 - v2 (Supplemental Appendix C). phi = psi = 1 is equilateral.
    Triangular { phi: f64, psi: f64 },
    /// Honeycomb of unit edges whose two opposing vertices on the x axis are 2 l apart
    /// (paper Fig. 6, Eq. 23), each hexagon triangulated by a centre node joined to its six
    /// corners with springs `k_radial` times the edge stiffness.
    Honeycomb { l: f64, k_radial: f64 },
    /// Square lattice of unit spacing; `diagonals` adds both diagonals of every square.
    Square { diagonals: bool },
}

impl LatticeKind {
    pub fn cell(&self) -> Result<UnitCell, String> {
        match *self {
            LatticeKind::Triangular { phi, psi } => {
                if !(phi > 0.0 && psi > 0.0 && phi.is_finite() && psi.is_finite()) {
                    return Err("phi and psi must be positive".into());
                }
                Ok(UnitCell {
                    a1: [1.0, 0.0],
                    a2: [phi / 2.0, psi * 3f64.sqrt() / 2.0],
                    basis: vec![[0.0, 0.0]],
                    bonds: vec![cb(0, 0, 1, 0, 1.0), cb(0, 0, 0, 1, 1.0), cb(0, 0, 1, -1, 1.0)],
                })
            }
            LatticeKind::Honeycomb { l, k_radial } => {
                if !(l > 0.0 && l < 1.0) {
                    return Err("l must be in (0, 1)".into());
                }
                if !(k_radial >= 0.0 && k_radial.is_finite()) {
                    return Err("k_radial must be non-negative".into());
                }
                let h = (1.0 - (l - 0.5) * (l - 0.5)).sqrt();
                // Basis: centre O, upper-right corner T = (1/2, h), right corner R = (l, 0).
                // The hexagon of cell (i, j) has corners T, R, T(i, j-1), R(i-1, j), T(i-1, j), R(i-1, j+1).
                let (o, t, r) = (0, 1, 2);
                let mut bonds = vec![cb(t, r, 0, 0, 1.0), cb(r, t, 0, -1, 1.0), cb(t, r, -1, 1, 1.0)];
                if k_radial > 0.0 {
                    bonds.extend([
                        cb(o, t, 0, 0, k_radial),
                        cb(o, r, 0, 0, k_radial),
                        cb(o, t, 0, -1, k_radial),
                        cb(o, r, -1, 0, k_radial),
                        cb(o, t, -1, 0, k_radial),
                        cb(o, r, -1, 1, k_radial),
                    ]);
                }
                Ok(UnitCell { a1: [l + 0.5, h], a2: [0.0, 2.0 * h], basis: vec![[0.0, 0.0], [0.5, h], [l, 0.0]], bonds })
            }
            LatticeKind::Square { diagonals } => {
                let mut bonds = vec![cb(0, 0, 1, 0, 1.0), cb(0, 0, 0, 1, 1.0)];
                if diagonals {
                    bonds.extend([cb(0, 0, 1, 1, 1.0), cb(0, 0, 1, -1, 1.0)]);
                }
                Ok(UnitCell { a1: [1.0, 0.0], a2: [0.0, 1.0], basis: vec![[0.0, 0.0]], bonds })
            }
        }
    }
}

impl UnitCell {
    fn position(&self, i: i64, j: i64, b: usize) -> [f64; 2] {
        let p = self.basis[b];
        [p[0] + i as f64 * self.a1[0] + j as f64 * self.a2[0], p[1] + i as f64 * self.a1[1] + j as f64 * self.a2[1]]
    }

    /// Periodic supercell of n1 x n2 cells. Rest lengths equal the bond lengths (stress free);
    /// stiffness is `k_factor` (the spring law is applied afterwards by `Network::set_springs`).
    pub fn periodic(&self, n1: usize, n2: usize) -> Result<Network, String> {
        if n1 < 3 || n2 < 3 {
            return Err("a periodic supercell needs at least 3 x 3 cells".into());
        }
        let nb = self.basis.len();
        let id = |i: i64, j: i64, b: usize| -> (usize, [i32; 2]) {
            let (n1i, n2i) = (n1 as i64, n2 as i64);
            let (wi, si) = (i.rem_euclid(n1i), i.div_euclid(n1i));
            let (wj, sj) = (j.rem_euclid(n2i), j.div_euclid(n2i));
            (((wi + n1i * wj) as usize) * nb + b, [si as i32, sj as i32])
        };
        let node_count = n1.checked_mul(n2).and_then(|n| n.checked_mul(nb)).ok_or("periodic node count overflow")?;
        let bond_count = n1.checked_mul(n2).and_then(|n| n.checked_mul(self.bonds.len())).ok_or("periodic bond count overflow")?;
        let mut nodes = vec![[0.0; 2]; node_count];
        for j in 0..n2 as i64 {
            for i in 0..n1 as i64 {
                for b in 0..nb {
                    nodes[id(i, j, b).0] = self.position(i, j, b);
                }
            }
        }
        let mut bonds = Vec::with_capacity(bond_count);
        for j in 0..n2 as i64 {
            for i in 0..n1 as i64 {
                for c in &self.bonds {
                    let (a, sa) = id(i, j, c.a);
                    let (b, sb) = id(i + c.shift[0] as i64, j + c.shift[1] as i64, c.b);
                    debug_assert_eq!(sa, [0, 0]);
                    bonds.push(Bond { a, b, shift: sb, k: c.k_factor, rest: 0.0 });
                }
            }
        }
        let cell = [[n1 as f64 * self.a1[0], n1 as f64 * self.a1[1]], [n2 as f64 * self.a2[0], n2 as f64 * self.a2[1]]];
        let mut net = Network { nodes, bonds, cell: Some(cell) };
        net.rest_from_geometry();
        Ok(net)
    }

    /// The nodes of the lattice, rotated by `theta` about the origin, that fall in
    /// [0, width] x [0, height] (with a 1e-9 tolerance), and every bond whose two ends are kept.
    /// The paper builds its strips this way (Sec. V A: rotate the base vectors, then trim).
    pub fn clip(&self, width: f64, height: f64, theta: f64) -> Result<Network, String> {
        self.clip_bounded(width, height, theta, usize::MAX, usize::MAX)
    }

    /// Bound the candidate grid before allocation (conservative for rotated/clipped samples).
    pub fn clip_bounded(&self, width: f64, height: f64, theta: f64, max_nodes: usize, max_bonds: usize) -> Result<Network, String> {
        if !(width > 0.0 && height > 0.0 && width.is_finite() && height.is_finite() && theta.is_finite()) {
            return Err("strip dimensions must be finite and positive; angle must be finite".into());
        }
        let (c, s) = (theta.cos(), theta.sin());
        let rot = |p: [f64; 2]| [c * p[0] - s * p[1], s * p[0] + c * p[1]];
        // Range of cell indices: invert the lattice map on the corners of the rotated-back box,
        // padded by the cell's own extent.
        let inv = |p: [f64; 2]| {
            let det = self.a1[0] * self.a2[1] - self.a1[1] * self.a2[0];
            [(p[0] * self.a2[1] - p[1] * self.a2[0]) / det, (self.a1[0] * p[1] - self.a1[1] * p[0]) / det]
        };
        let back = |p: [f64; 2]| [c * p[0] + s * p[1], -s * p[0] + c * p[1]];
        let (mut lo, mut hi) = ([f64::MAX; 2], [f64::MIN; 2]);
        for q in [[0.0, 0.0], [width, 0.0], [0.0, height], [width, height]] {
            let f = inv(back(q));
            for k in 0..2 {
                lo[k] = lo[k].min(f[k]);
                hi[k] = hi[k].max(f[k]);
            }
        }
        if lo.iter().chain(hi.iter()).any(|v| !v.is_finite() || v.abs() > (i64::MAX / 4) as f64) {
            return Err("strip dimensions overflow".into());
        }
        let (i0, i1) = (lo[0].floor() as i64 - 2, hi[0].ceil() as i64 + 2);
        let (j0, j1) = (lo[1].floor() as i64 - 2, hi[1].ceil() as i64 + 2);
        let nb = self.basis.len();
        let ni = (i1 - i0 + 1) as usize;
        let nj = (j1 - j0 + 1) as usize;
        let candidates = ni.checked_mul(nj).ok_or("strip dimensions overflow")?;
        let nodes_bound = candidates.checked_mul(nb).ok_or("strip node count overflow")?;
        let bonds_bound = candidates.checked_mul(self.bonds.len()).ok_or("strip bond count overflow")?;
        if nodes_bound > max_nodes.min(4_000_000) || bonds_bound > max_bonds {
            return Err("strip candidate grid exceeds node or bond limits".into());
        }
        let tol = 1e-9;
        let mut index = vec![usize::MAX; ni * nj * nb];
        let mut nodes = Vec::new();
        for j in j0..=j1 {
            for i in i0..=i1 {
                for b in 0..nb {
                    let p = rot(self.position(i, j, b));
                    if p[0] >= -tol && p[0] <= width + tol && p[1] >= -tol && p[1] <= height + tol {
                        index[(((j - j0) as usize) * ni + (i - i0) as usize) * nb + b] = nodes.len();
                        nodes.push(p);
                    }
                }
            }
        }
        let at = |i: i64, j: i64, b: usize| -> usize {
            if i < i0 || i > i1 || j < j0 || j > j1 {
                return usize::MAX;
            }
            index[(((j - j0) as usize) * ni + (i - i0) as usize) * nb + b]
        };
        let mut bonds = Vec::new();
        for j in j0..=j1 {
            for i in i0..=i1 {
                for cbnd in &self.bonds {
                    let a = at(i, j, cbnd.a);
                    let b = at(i + cbnd.shift[0] as i64, j + cbnd.shift[1] as i64, cbnd.b);
                    if a != usize::MAX && b != usize::MAX {
                        bonds.push(Bond { a, b, shift: [0, 0], k: cbnd.k_factor, rest: 0.0 });
                    }
                }
            }
        }
        let mut net = Network { nodes, bonds, cell: None };
        net.rest_from_geometry();
        Ok(net)
    }
}
