//! One experiment, described as JSON (used by the WASM page, the `reproduce` binary and the
//! tests): build a network, relax it if prestressed, and compute its linear response.

use serde::{Deserialize, Serialize};

use crate::lattice::LatticeKind;
use crate::moduli::{self, Isotropic};
use crate::network::{Network, SpringLaw};
use crate::solve::{self, Relaxation};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NetworkSpec {
    pub lattice: LatticeKind,
    /// Foam-like disorder: every node moved by `eta` (lattice-spacing units) in a random direction.
    #[serde(default)]
    pub eta: f64,
    /// Fraction of bonds kept (random dilution); 1 keeps all.
    #[serde(default = "one")]
    pub keep: f64,
    #[serde(default)]
    pub seed: u64,
    #[serde(default = "hookean")]
    pub spring_law: SpringLaw,
    /// Spring constant scale.
    #[serde(default = "one")]
    pub k: f64,
    /// Rest lengths shortened by this fraction (tension when positive), then relaxed.
    #[serde(default)]
    pub prestress: f64,
}

fn one() -> f64 {
    1.0
}
fn hookean() -> SpringLaw {
    SpringLaw::Hookean
}

/// Limits for the browser; native runs can call the library directly.
pub const MAX_NODES: usize = 60_000;
pub const MAX_BONDS: usize = 240_000;

impl NetworkSpec {
    fn check(&self) -> Result<(), String> {
        if !(self.eta >= 0.0 && self.eta <= 0.5) {
            return Err("eta must be in [0, 0.5]".into());
        }
        if !(self.keep > 0.0 && self.keep <= 1.0) {
            return Err("keep must be in (0, 1]".into());
        }
        if !(self.k > 0.0 && self.k.is_finite()) {
            return Err("k must be positive".into());
        }
        if !(self.prestress > -0.2 && self.prestress < 0.5) {
            return Err("prestress must be in (-0.2, 0.5)".into());
        }
        Ok(())
    }

    /// Apply disorder, dilution, spring law and prestress to a freshly built network.
    fn finish(&self, mut net: Network) -> Result<Network, String> {
        if net.nodes.len() > MAX_NODES {
            return Err(format!("{} nodes; the limit is {MAX_NODES}", net.nodes.len()));
        }
        if self.eta > 0.0 {
            net.perturb(self.eta, self.seed);
        }
        net.dilute(self.keep, self.seed);
        net.set_springs(self.spring_law, self.k);
        if self.prestress != 0.0 {
            net.prestress(self.prestress);
        }
        Ok(net)
    }

    pub fn periodic(&self, n1: usize, n2: usize) -> Result<Network, String> {
        self.check()?;
        let cell = self.lattice.cell()?;
        let cells = n1.checked_mul(n2).ok_or("periodic dimensions overflow")?;
        let nodes = cells.checked_mul(cell.basis.len()).ok_or("periodic node count overflow")?;
        let bonds = cells.checked_mul(cell.bonds.len()).ok_or("periodic bond count overflow")?;
        if nodes > MAX_NODES || bonds > MAX_BONDS {
            return Err(format!("network exceeds limits ({MAX_NODES} nodes, {MAX_BONDS} bonds)"));
        }
        self.finish(cell.periodic(n1, n2)?)
    }

    pub fn strip(&self, width: f64, height: f64, theta: f64) -> Result<Network, String> {
        self.check()?;
        self.finish(self.lattice.cell()?.clip_bounded(width, height, theta, MAX_NODES, MAX_BONDS)?)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PeriodicSpec {
    pub network: NetworkSpec,
    pub n1: usize,
    pub n2: usize,
    /// Macroscopic strain (exx, eyy, exy), tensor shear, for the displayed deformation.
    #[serde(default)]
    pub strain: [f64; 3],
}

#[derive(Clone, Debug, Serialize)]
pub struct PeriodicResult {
    pub nodes: Vec<[f64; 2]>,
    /// Bonds as (a, b, shift0, shift1).
    pub bonds: Vec<[i32; 4]>,
    pub cell: [[f64; 2]; 2],
    pub coordination: f64,
    pub c: [[f64; 3]; 3],
    pub c_affine: [[f64; 3]; 3],
    pub isotropic: Isotropic,
    pub isotropic_affine: Isotropic,
    /// (Young's modulus, Poisson's ratio) under uniaxial stress along x and along y.
    pub uniaxial_x: Option<(f64, f64)>,
    pub uniaxial_y: Option<(f64, f64)>,
    pub anisotropy: f64,
    /// Nonaffinity sum_i |U_i e|^2 / (N lbar^2 |e|^2), |e|^2 = exx^2 + eyy^2 + 2 exy^2 (U the
    /// nonaffine displacement per unit strain, lbar the mean rest length), under pure shear.
    pub nonaffinity_shear: f64,
    /// Same under the imposed strain (0 when the strain is zero).
    pub nonaffinity_imposed: f64,
    /// Displacement of each node under the imposed strain (affine plus nonaffine).
    pub displacement: Vec<[f64; 2]>,
    /// Bond tension under the imposed strain (prestress included).
    pub force: Vec<f64>,
    /// Bond tension of the reference (relaxed) state.
    pub prestress_force: Vec<f64>,
    pub relaxation: Option<RelaxationSummary>,
}

#[derive(Clone, Debug, Serialize)]
pub struct RelaxationSummary {
    pub iterations: usize,
    pub residual: f64,
    pub energy: f64,
}

impl From<&Relaxation> for RelaxationSummary {
    fn from(r: &Relaxation) -> Self {
        RelaxationSummary { iterations: r.iterations, residual: r.residual, energy: r.energy }
    }
}

fn relaxed(net: &Network, held: &[bool]) -> Result<(Vec<[f64; 2]>, Option<RelaxationSummary>), String> {
    let stressed = net.bonds.iter().any(|e| (net.length(&net.nodes, e) - e.rest).abs() > 1e-12 * e.rest);
    if !stressed {
        return Ok((net.nodes.clone(), None));
    }
    let r = solve::relax(net, &net.nodes, held, 1e-11, 200)?;
    let s = RelaxationSummary::from(&r);
    Ok((r.positions, Some(s)))
}

pub fn run_periodic(spec: &PeriodicSpec) -> Result<PeriodicResult, String> {
    let net = spec.network.periodic(spec.n1, spec.n2)?;
    let (pos, relaxation) = relaxed(&net, &[])?;
    let resp = solve::periodic_response(&net, &pos)?;
    let lbar = net.mean_rest().max(1e-300);
    let n = pos.len() as f64;
    let gamma = |e: [f64; 3]| -> f64 {
        let norm2 = e[0] * e[0] + e[1] * e[1] + 2.0 * e[2] * e[2];
        if norm2 == 0.0 {
            return 0.0;
        }
        let mut s = 0.0;
        for u in &resp.u {
            for k in 0..2 {
                let v = u[0][k] * e[0] + u[1][k] * e[1] + u[2][k] * e[2];
                s += v * v;
            }
        }
        s / (n * lbar * lbar * norm2)
    };
    let e = spec.strain;
    let displacement: Vec<[f64; 2]> = pos
        .iter()
        .zip(&resp.u)
        .map(|(x, u)| {
            let aff = [e[0] * x[0] + e[2] * x[1], e[2] * x[0] + e[1] * x[1]];
            [aff[0] + u[0][0] * e[0] + u[1][0] * e[1] + u[2][0] * e[2], aff[1] + u[0][1] * e[0] + u[1][1] * e[1] + u[2][1] * e[2]]
        })
        .collect();
    let tangents = solve::bond_tangents(&net, &pos);
    let prestress_force: Vec<f64> = tangents.iter().map(|t| t.1).collect();
    let force = net
        .bonds
        .iter()
        .zip(&tangents)
        .map(|(b, (_, t, nv, _))| {
            let r = net.bond_vector(&pos, b);
            let (ua, ub) = (displacement[b.a], displacement[b.b]);
            // Change of the bond vector: the image node moves with the strained cell too.
            let mut d = [ub[0] - ua[0], ub[1] - ua[1]];
            let shift = [r[0] - (pos[b.b][0] - pos[b.a][0]), r[1] - (pos[b.b][1] - pos[b.a][1])];
            d[0] += e[0] * shift[0] + e[2] * shift[1];
            d[1] += e[2] * shift[0] + e[1] * shift[1];
            t + b.k * (nv[0] * d[0] + nv[1] * d[1])
        })
        .collect();
    Ok(PeriodicResult {
        bonds: net.bonds.iter().map(|b| [b.a as i32, b.b as i32, b.shift[0], b.shift[1]]).collect(),
        cell: net.cell.expect("periodic"),
        coordination: net.coordination(),
        isotropic: moduli::isotropic(&resp.c),
        isotropic_affine: moduli::isotropic(&resp.c_affine),
        uniaxial_x: moduli::uniaxial(&resp.c, 0.0),
        uniaxial_y: moduli::uniaxial(&resp.c, std::f64::consts::FRAC_PI_2),
        anisotropy: moduli::anisotropy(&resp.c),
        nonaffinity_shear: gamma([0.0, 0.0, 1.0]),
        nonaffinity_imposed: gamma(e),
        c: resp.c,
        c_affine: resp.c_affine,
        displacement,
        force,
        prestress_force,
        relaxation,
        nodes: pos,
    })
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StripSpec {
    pub network: NetworkSpec,
    /// The paper's strip: 0 <= x <= 13, 0 <= y <= 52.
    pub width: f64,
    pub height: f64,
    /// Lattice orientation (paper Fig. 4: the pattern is rotated, the strip is not).
    #[serde(default)]
    pub theta: f64,
    /// Nodes within this distance of the bottom and top edges are held. Default 0.5.
    #[serde(default = "half")]
    pub clamp_band: f64,
    /// Imposed engineering strain along y: the top moves up by strain * height (paper: 0.01).
    pub strain: f64,
}

fn half() -> f64 {
    0.5
}

#[derive(Clone, Debug, Serialize)]
pub struct StripResult {
    pub nodes: Vec<[f64; 2]>,
    pub bonds: Vec<[usize; 2]>,
    pub held: Vec<bool>,
    /// Prescribed displacement of the held nodes (zero for the free ones).
    pub prescribed: Vec<[f64; 2]>,
    pub displacement: Vec<[f64; 2]>,
    /// Bond tension: prestress plus the linear change under the imposed strain.
    pub force: Vec<f64>,
    pub prestress_force: Vec<f64>,
    pub stiffness: Vec<f64>,
    pub rest: Vec<f64>,
    pub coordination: f64,
    /// The two nodes whose distance is measured (paper Sec. V A) and the resulting ratio.
    pub gauge: [usize; 2],
    pub poisson: f64,
    pub relaxation: Option<RelaxationSummary>,
}

impl StripResult {
    /// Axial bond forces across the partition y <= cut; valid without prestress.
    pub fn section_force_y(&self, cut: f64) -> f64 {
        assert!(self.prestress_force.iter().all(|f| f.abs() < 1e-12));
        self.bonds.iter().zip(&self.force).filter_map(|(b, force)| {
            let (a, b) = (self.nodes[b[0]], self.nodes[b[1]]);
            if (a[1] <= cut) == (b[1] <= cut) {
                return None;
            }
            Some(force * (b[1] - a[1]).abs() / (b[0] - a[0]).hypot(b[1] - a[1]))
        }).sum()
    }
}

pub fn run_strip(spec: &StripSpec) -> Result<StripResult, String> {
    let net = spec.network.strip(spec.width, spec.height, spec.theta)?;
    if net.nodes.len() < 4 {
        return Err("strip has fewer than 4 nodes".into());
    }
    let (ymin, ymax) = net.nodes.iter().fold((f64::MAX, f64::MIN), |(lo, hi), p| (lo.min(p[1]), hi.max(p[1])));
    let held: Vec<bool> = net.nodes.iter().map(|p| p[1] <= ymin + spec.clamp_band || p[1] >= ymax - spec.clamp_band).collect();
    let (pos, relaxation) = relaxed(&net, &held)?;
    let lift = spec.strain * spec.height;
    let prescribed: Vec<[f64; 2]> =
        pos.iter().zip(&held).map(|(p, &h)| if h && p[1] >= ymax - spec.clamp_band { [0.0, lift] } else { [0.0, 0.0] }).collect();
    let resp = solve::finite_response(&net, &pos, &held, &prescribed)?;
    let tangents = solve::bond_tangents(&net, &pos);
    let prestress_force: Vec<f64> = tangents.iter().map(|t| t.1).collect();
    let force = prestress_force.iter().zip(&resp.force).map(|(a, b)| a + b).collect();
    let closest = |q: [f64; 2]| -> usize {
        let mut best = (f64::MAX, 0);
        for (i, p) in pos.iter().enumerate() {
            let d = (p[0] - q[0]).powi(2) + (p[1] - q[1]).powi(2);
            if d < best.0 {
                best = (d, i);
            }
        }
        best.1
    };
    let mid = 0.5 * spec.height;
    let gauge = [closest([0.0, mid]), closest([spec.width, mid])];
    let dx0 = pos[gauge[1]][0] - pos[gauge[0]][0];
    let ddx = resp.u[gauge[1]][0] - resp.u[gauge[0]][0];
    let poisson = if resp.full_rank && spec.strain != 0.0 && dx0 != 0.0 { -(ddx / dx0) / spec.strain } else { f64::NAN };
    Ok(StripResult {
        bonds: net.bonds.iter().map(|b| [b.a, b.b]).collect(),
        stiffness: net.bonds.iter().map(|b| b.k).collect(),
        rest: net.bonds.iter().map(|b| b.rest).collect(),
        coordination: net.coordination(),
        held,
        prescribed,
        displacement: resp.u,
        force,
        prestress_force,
        gauge,
        poisson,
        relaxation,
        nodes: pos,
    })
}
