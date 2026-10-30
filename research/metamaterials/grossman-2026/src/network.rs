//! A network of Hookean springs, E = sum_e k_e (l_e - rest_e)^2 / 2 (paper Eq. 3), periodic or
//! finite, and the operations that turn a lattice into the paper's disordered networks.

use serde::{Deserialize, Serialize};

use crate::rng::Rng;

/// Spring `a`-`b`. In a periodic network the far end is node `b` translated by
/// shift[0] * cell[0] + shift[1] * cell[1].
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct Bond {
    pub a: usize,
    pub b: usize,
    pub shift: [i32; 2],
    pub k: f64,
    pub rest: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Network {
    pub nodes: Vec<[f64; 2]>,
    pub bonds: Vec<Bond>,
    /// Periodic cell vectors, or None for a finite sample.
    pub cell: Option<[[f64; 2]; 2]>,
}

/// How spring constants are chosen.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SpringLaw {
    /// k_e = k (times the lattice's stiffness factor): equal Hookean springs, the setting of the
    /// paper's Eq. (3) and of its foam networks ("all the springs have the same spring constant").
    Hookean,
    /// k_e = k / rest_e^2: every bond weighted equally in the affine elastic tensor. The paper's
    /// closed form for ordered lattices (Supplemental Eq. 9) coincides with this choice.
    EqualWeight,
}

impl Network {
    /// Vector from node a to the (image of) node b, for given node positions.
    pub fn bond_vector(&self, pos: &[[f64; 2]], e: &Bond) -> [f64; 2] {
        let (pa, pb) = (pos[e.a], pos[e.b]);
        let mut d = [pb[0] - pa[0], pb[1] - pa[1]];
        if let Some(c) = self.cell {
            for k in 0..2 {
                d[k] += e.shift[0] as f64 * c[0][k] + e.shift[1] as f64 * c[1][k];
            }
        }
        d
    }

    pub fn length(&self, pos: &[[f64; 2]], e: &Bond) -> f64 {
        let d = self.bond_vector(pos, e);
        d[0].hypot(d[1])
    }

    /// Rest lengths := current lengths, so the network is stress free as built.
    pub fn rest_from_geometry(&mut self) {
        for i in 0..self.bonds.len() {
            let l = self.length(&self.nodes, &self.bonds[i]);
            self.bonds[i].rest = l;
        }
    }

    /// Area of the periodic cell (None for a finite network).
    pub fn area(&self) -> Option<f64> {
        self.cell.map(|c| (c[0][0] * c[1][1] - c[0][1] * c[1][0]).abs())
    }

    /// The paper's foam-like disorder (Sec. II C 2 and V A): move every node by `eta` in a
    /// uniformly random direction and make the new distances the rest lengths.
    pub fn perturb(&mut self, eta: f64, seed: u64) {
        let mut rng = Rng::new(seed);
        for p in &mut self.nodes {
            let t = 2.0 * std::f64::consts::PI * rng.uniform();
            p[0] += eta * t.cos();
            p[1] += eta * t.sin();
        }
        self.rest_from_geometry();
    }

    /// Keep each bond independently with probability `p` (random bond dilution).
    pub fn dilute(&mut self, p: f64, seed: u64) {
        if p >= 1.0 {
            return;
        }
        let mut rng = Rng::new(seed ^ 0xD1_1A7E);
        self.bonds.retain(|_| rng.uniform() < p);
    }

    /// Multiply each bond's stiffness factor by k, or by k / rest^2.
    pub fn set_springs(&mut self, law: SpringLaw, k: f64) {
        for e in &mut self.bonds {
            e.k *= match law {
                SpringLaw::Hookean => k,
                SpringLaw::EqualWeight => k / (e.rest * e.rest),
            };
        }
    }

    /// Shorten every rest length by the factor (1 - s): s > 0 puts the bonds in tension.
    pub fn prestress(&mut self, s: f64) {
        for e in &mut self.bonds {
            e.rest *= 1.0 - s;
        }
    }

    /// Mean coordination number 2 N_bonds / N_nodes.
    pub fn coordination(&self) -> f64 {
        if self.nodes.is_empty() {
            return 0.0;
        }
        2.0 * self.bonds.len() as f64 / self.nodes.len() as f64
    }

    /// Mean rest length.
    pub fn mean_rest(&self) -> f64 {
        if self.bonds.is_empty() {
            return 0.0;
        }
        self.bonds.iter().map(|e| e.rest).sum::<f64>() / self.bonds.len() as f64
    }

    /// Spring energy at the given positions (paper Eq. 3).
    pub fn energy(&self, pos: &[[f64; 2]]) -> f64 {
        self.bonds
            .iter()
            .map(|e| {
                let d = self.length(pos, e) - e.rest;
                0.5 * e.k * d * d
            })
            .sum()
    }
}
