pub mod arch;
pub mod lp;
pub mod run;
#[cfg(target_arch = "wasm32")]
mod wasm;

pub use arch::{Arch, Weights};
use arch::Block;
use lp::LpError;
use serde::Serialize;

/// Affine in z = (Fx₀, Fy₀, M₀, λ): coefficients, then the constant.
type Affine = [f64; 5];

fn lin(a: &Affine, b: &Affine, sa: f64, sb: f64) -> Affine {
    std::array::from_fn(|i| sa * a[i] + sb * b[i])
}

/// A vertical downward load λ·`p` at abscissa `x`, applied to block `block`.
#[derive(Debug, Clone, Copy)]
pub struct PointLoad {
    pub block: usize,
    pub x: f64,
    pub p: f64,
}

/// What the joints carry, in units of the total weight W and the radius r: per joint the force
/// the left part exerts on the right part (Fx, Fy) and its moment M about the joint mid-point.
struct Chain {
    fx: Vec<Affine>,
    fy: Vec<Affine>,
    m: Vec<Affine>,
    normal: Vec<[f64; 2]>,
    half: f64,
}

fn chain(arch: &Arch, load: Option<&PointLoad>) -> Chain {
    let (w_tot, r) = (arch.total_weight(), arch.r);
    let blocks = arch.blocks();
    let joints: Vec<_> = (0..=arch.n).map(|j| arch.joint(j)).collect();
    let mut fx = vec![[1.0, 0.0, 0.0, 0.0, 0.0]];
    let mut fy = vec![[0.0, 1.0, 0.0, 0.0, 0.0]];
    let mut m = vec![[0.0, 0.0, 1.0, 0.0, 0.0]];
    for (k, b) in blocks.iter().enumerate() {
        let (cl, cr) = (joints[k].mid, joints[k + 1].mid);
        let (cl, cr) = ([cl[0] / r, cl[1] / r], [cr[0] / r, cr[1] / r]);
        let mut gy = [0.0, 0.0, 0.0, 0.0, -b.weight / w_tot];
        let mut gm = [0.0, 0.0, 0.0, 0.0, -b.xg / r * b.weight / w_tot];
        if let Some(l) = load.filter(|l| l.block == k) {
            gy[3] -= l.p / w_tot;
            gm[3] -= l.x / r * l.p / w_tot;
        }
        let nfx = fx[k];
        let nfy = lin(&fy[k], &gy, 1.0, 1.0);
        let cross_l = lin(&fy[k], &fx[k], cl[0], -cl[1]);
        let cross_r = lin(&nfy, &nfx, cr[0], -cr[1]);
        let nm = lin(&lin(&m[k], &cross_l, 1.0, 1.0), &lin(&cross_r, &gm, -1.0, 1.0), 1.0, 1.0);
        fx.push(nfx);
        fy.push(nfy);
        m.push(nm);
    }
    Chain { fx, fy, m, normal: joints.iter().map(|j| j.normal).collect(), half: arch.t / (2.0 * r) }
}

impl Chain {
    fn n(&self, j: usize) -> Affine {
        lin(&self.fx[j], &self.fy[j], self.normal[j][0], self.normal[j][1])
    }
}

fn eval(a: &Affine, z: &[f64; 4]) -> f64 {
    a[..4].iter().zip(z).map(|(c, v)| c * v).sum::<f64>() + a[4]
}

/// One equilibrium state of the arch: the joint forces, and where they cross each joint.
#[derive(Debug, Clone, Serialize)]
pub struct State {
    /// Outward eccentricity of the resultant at each joint, in units of r (+ towards the extrados).
    pub e: Vec<f64>,
    /// Normal force at each joint, in units of W.
    pub n: Vec<f64>,
    /// Horizontal thrust Fx₀ and vertical reaction Fy₀ at the left springing, in units of W.
    pub h: f64,
    pub v: f64,
    pub lambda: f64,
    /// Largest violation of the joint conditions, in units of W (≤ 0 means admissible).
    pub s: f64,
}

fn state(c: &Chain, z: [f64; 4], s: f64) -> State {
    let joints = c.fx.len();
    let n: Vec<f64> = (0..joints).map(|j| eval(&c.n(j), &z)).collect();
    let e = (0..joints)
        .map(|j| {
            let m = eval(&c.m[j], &z);
            if n[j] > 1e-12 { -m / n[j] } else if m < 0.0 { 1e3 } else { -1e3 }
        })
        .collect();
    State { e, n, h: z[0], v: z[1], lambda: z[3], s }
}

/// The equilibrium state that violates the joint conditions least: minimise s subject to
/// n ≥ −s and |M| ≤ (n + s)·t/2 at every joint, with the load multiplier fixed.
pub fn least_violation(arch: &Arch, load: Option<&PointLoad>, lambda: f64) -> Result<State, LpError> {
    let c = chain(arch, load);
    let mut a = vec![];
    let mut b = vec![];
    let mut row = |g: Affine, s: f64| {
        a.push(vec![g[0], g[1], g[2], -s]);
        b.push(-(g[4] + g[3] * lambda));
    };
    for j in 0..c.fx.len() {
        let n = c.n(j);
        row(lin(&n, &n, -1.0, 0.0), 1.0);
        row(lin(&c.m[j], &n, 1.0, -c.half), c.half);
        row(lin(&c.m[j], &n, -1.0, -c.half), c.half);
    }
    a.push(vec![0.0, 0.0, 0.0, -1.0]);
    b.push(1.0);
    let x = lp::minimise(&[0.0, 0.0, 0.0, 1.0], &a, &b)?;
    Ok(state(&c, [x[0], x[1], x[2], lambda], x[3]))
}

/// The largest load multiplier with an admissible thrust line (the static theorem).
pub fn collapse(arch: &Arch, load: &PointLoad) -> Result<State, LpError> {
    let c = chain(arch, Some(load));
    let mut a = vec![];
    let mut b = vec![];
    for j in 0..c.fx.len() {
        let n = c.n(j);
        for g in [lin(&n, &n, -1.0, 0.0), lin(&c.m[j], &n, 1.0, -c.half), lin(&c.m[j], &n, -1.0, -c.half)] {
            a.push(g[..4].to_vec());
            b.push(-g[4]);
        }
    }
    a.push(vec![0.0, 0.0, 0.0, -1.0]);
    b.push(0.0);
    let x = lp::minimise(&[0.0, 0.0, 0.0, -1.0], &a, &b)?;
    Ok(state(&c, [x[0], x[1], x[2], x[3]], 0.0))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Intrados,
    Extrados,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct Hinge {
    pub joint: usize,
    pub side: Side,
}

/// Joints where the resultant reaches a face: those within `tol`·t/2 of it that no neighbour on
/// the same face exceeds. A flat contact, where neighbouring joints reach the face equally,
/// keeps every joint of it, as `reference/arch_limit.py` does.
pub fn hinges(arch: &Arch, e: &[f64], tol: f64) -> Vec<Hinge> {
    let half = arch.t / (2.0 * arch.r);
    let mut out = vec![];
    for (j, &ej) in e.iter().enumerate() {
        let near = [j.wrapping_sub(1), j + 1].into_iter().filter(|&i| i < e.len() && e[i].signum() == ej.signum());
        if near.into_iter().any(|i| e[i].abs() > ej.abs()) {
            continue;
        }
        if (ej.abs() - half).abs() <= tol * half {
            out.push(Hinge { joint: j, side: if ej > 0.0 { Side::Extrados } else { Side::Intrados } });
        }
    }
    out
}

/// The hinges a mechanism can form: a flat contact (neighbouring joints on the same face)
/// counts once, at the joint closest to the face, the first of an exact tie.
pub fn mechanism_hinges(hinges: &[Hinge], e: &[f64]) -> Vec<Hinge> {
    let mut out: Vec<Hinge> = vec![];
    for h in hinges {
        match out.last_mut() {
            Some(last) if last.side == h.side && last.joint + 1 == h.joint => {
                if e[h.joint].abs() > e[last.joint].abs() {
                    *last = *h;
                }
            }
            _ => out.push(*h),
        }
    }
    out
}

#[derive(Debug, Clone, Serialize)]
pub struct Bisection {
    pub t: f64,
    pub feasible: bool,
    pub state: State,
}

#[derive(Debug, Clone, Serialize)]
pub struct LeastThickness {
    /// t/r at the least thickness (the upper end of the final bracket).
    pub eta: f64,
    pub state: State,
    pub hinges: Vec<Hinge>,
    /// Haunch hinge angle from the crown, degrees: the vertex of the parabola through the
    /// eccentricities of the left-half joint closest to the intrados and its two neighbours.
    pub beta: f64,
    /// H/(w r) with w = γ t d.
    pub h: f64,
    pub steps: Vec<Bisection>,
}

/// The least thickness that admits a thrust line under self-weight: bisection on t/r, each step
/// a linear program.
pub fn least_thickness(alpha: f64, n: usize, weights: Weights, tolerance: f64) -> Result<LeastThickness, LpError> {
    let arch = |eta: f64| Arch { r: 1.0, t: eta, d: 1.0, gamma: 1.0, alpha, n, weights };
    let mut steps = vec![];
    let probe = |eta: f64, steps: &mut Vec<Bisection>| -> Result<bool, LpError> {
        let state = least_violation(&arch(eta), None, 0.0)?;
        let feasible = state.s <= 0.0;
        steps.push(Bisection { t: eta, feasible, state });
        Ok(feasible)
    };
    let (mut lo, mut hi) = (0.0, 0.1);
    while !probe(hi, &mut steps)? {
        lo = hi;
        hi = (2.0 * hi).min(1.99);
        if lo >= 1.99 {
            return Err(LpError::Infeasible);
        }
    }
    let mut at_hi = steps.len() - 1;
    while hi - lo > tolerance * hi {
        let mid = (lo + hi) / 2.0;
        if probe(mid, &mut steps)? {
            hi = mid;
            at_hi = steps.len() - 1;
        } else {
            lo = mid;
        }
    }
    let a = arch(hi);
    let state = steps[at_hi].state.clone();
    let hinges = hinges(&a, &state.e, 1e-4);
    let jh = (1..=n).filter(|&j| a.phi(j) < std::f64::consts::FRAC_PI_2 - 1e-9)
        .min_by(|&i, &j| state.e[i].total_cmp(&state.e[j]));
    let beta = jh
        .map(|j| {
            let (em, e0, ep) = (state.e[j - 1], state.e[j], state.e[j + 1]);
            let curvature = em - 2.0 * e0 + ep;
            let shift = if curvature > 0.0 { (0.5 * (em - ep) / curvature).clamp(-0.5, 0.5) } else { 0.0 };
            90.0 - (a.phi(j) + shift * (a.phi(j + 1) - a.phi(j))).to_degrees()
        })
        .unwrap_or(f64::NAN);
    let h = state.h.abs() * 2.0 * alpha;
    Ok(LeastThickness { eta: hi, state, hinges, beta, h, steps })
}

/// A rigid body of a mechanism: blocks `from..to` turning at `omega` about `centre`.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct Body {
    pub from: usize,
    pub to: usize,
    pub centre: [f64; 2],
    pub omega: f64,
}

fn face(arch: &Arch, h: &Hinge) -> [f64; 2] {
    face_at(arch, h.joint, h.side)
}

fn face_at(arch: &Arch, joint: usize, side: Side) -> [f64; 2] {
    let j = arch.joint(joint);
    let s = if side == Side::Extrados { 0.5 } else { -0.5 } * arch.t;
    [j.mid[0] + s * j.outward[0], j.mid[1] + s * j.outward[1]]
}

fn cross(a: [f64; 2], b: [f64; 2]) -> f64 {
    a[0] * b[1] - a[1] * b[0]
}

fn sub(a: [f64; 2], b: [f64; 2]) -> [f64; 2] {
    [a[0] - b[0], a[1] - b[1]]
}

fn dot(a: [f64; 2], b: [f64; 2]) -> f64 {
    a[0] * b[0] + a[1] * b[1]
}

/// The blocks and the intrados and extrados points of every joint, computed once for an arch.
struct Kinematics {
    blocks: Vec<Block>,
    faces: Vec<[[f64; 2]; 2]>,
    r: f64,
}

impl Kinematics {
    fn new(arch: &Arch) -> Self {
        let faces = (0..=arch.n).map(|j| [face_at(arch, j, Side::Intrados), face_at(arch, j, Side::Extrados)]).collect();
        Kinematics { blocks: arch.blocks(), faces, r: arch.r }
    }

    fn face(&self, h: &Hinge) -> [f64; 2] {
        self.faces[h.joint][usize::from(h.side == Side::Extrados)]
    }

    fn four_hinge(&self, h: &[Hinge; 4]) -> Option<[Body; 3]> {
        let p: [[f64; 2]; 4] = std::array::from_fn(|i| self.face(&h[i]));
        let (d1, d2) = (sub(p[1], p[0]), sub(p[2], p[3]));
        let den = cross(d1, d2);
        if den.abs() < 1e-12 {
            return None;
        }
        let u = cross(sub(p[3], p[0]), d2) / den;
        let ic = [p[0][0] + u * d1[0], p[0][1] + u * d1[1]];
        let wa = 1.0;
        let bd = dot(sub(p[1], ic), d1);
        let cd = dot(sub(p[2], p[3]), d2);
        if bd.abs() < 1e-14 || cd.abs() < 1e-14 {
            return None;
        }
        let wb = wa * dot(d1, d1) / bd;
        let wc = wb * dot(sub(p[2], ic), d2) / cd;
        Some([
            Body { from: h[0].joint, to: h[1].joint, centre: p[0], omega: wa },
            Body { from: h[1].joint, to: h[2].joint, centre: ic, omega: wb },
            Body { from: h[2].joint, to: h[3].joint, centre: p[3], omega: wc },
        ])
    }

    fn work(&self, bodies: &[Body], load: &PointLoad) -> (f64, f64) {
        let mut dead = 0.0;
        let mut live = 0.0;
        for b in bodies {
            for (k, blk) in self.blocks.iter().enumerate().take(b.to).skip(b.from) {
                dead -= blk.weight * b.omega * (blk.xg - b.centre[0]);
                if load.block == k {
                    live -= load.p * b.omega * (load.x - b.centre[0]);
                }
            }
        }
        (dead, live)
    }

    fn multiplier(&self, h: &[Hinge; 4], load: &PointLoad) -> Option<(f64, [Body; 3])> {
        if h.windows(2).any(|w| w[0].side == w[1].side || w[0].joint >= w[1].joint) {
            return None;
        }
        let mut bodies = self.four_hinge(h)?;
        let (dead, live) = self.work(&bodies, load);
        if live.abs() <= 1e-12 * load.p * self.r {
            return None;
        }
        let sgn = live.signum();
        let w = [bodies[0].omega, bodies[1].omega, bodies[2].omega];
        let rel = [w[0], w[1] - w[0], w[2] - w[1], -w[2]];
        let opens = |side: Side| if side == Side::Extrados { 1.0 } else { -1.0 };
        if rel.iter().zip(h).any(|(r, x)| sgn * r * opens(x.side) <= 1e-12) {
            return None;
        }
        for b in bodies.iter_mut() {
            b.omega *= sgn;
        }
        let lambda = -(sgn * dead) / (sgn * live);
        (lambda >= 0.0).then_some((lambda, bodies))
    }
}

/// Velocities of the three-body mechanism on four hinges (the body between the first two turns
/// about the first, the last about the fourth, the middle about the intersection of the lines
/// through its hinges), with ω = 1 on the first body; None when the lines are parallel.
pub fn four_hinge(arch: &Arch, h: &[Hinge; 4]) -> Option<[Body; 3]> {
    Kinematics::new(arch).four_hinge(h)
}

/// The admissible load multiplier of one four-hinge mechanism with alternating faces in joint
/// order, or None when the faces do not alternate, the load does no work or a hinge would open
/// on the wrong face.
pub fn mechanism_multiplier(arch: &Arch, h: &[Hinge; 4], load: &PointLoad) -> Option<(f64, [Body; 3])> {
    Kinematics::new(arch).multiplier(h, load)
}

/// The upper bound: the smallest multiplier over every admissible four-hinge mechanism.
pub fn kinematic(arch: &Arch, load: &PointLoad) -> Option<(f64, [Hinge; 4])> {
    let n = arch.n;
    let kin = Kinematics::new(arch);
    let mut best: Option<(f64, [Hinge; 4])> = None;
    for a in 0..=n {
        for b in a + 1..=n {
            for c in b + 1..=n {
                for d in c + 1..=n {
                    for first in [Side::Extrados, Side::Intrados] {
                        let other = if first == Side::Extrados { Side::Intrados } else { Side::Extrados };
                        let h = [
                            Hinge { joint: a, side: first },
                            Hinge { joint: b, side: other },
                            Hinge { joint: c, side: first },
                            Hinge { joint: d, side: other },
                        ];
                        if let Some((lambda, _)) = kin.multiplier(&h, load) {
                            if best.is_none_or(|(l, _)| lambda < l) {
                                best = Some((lambda, h));
                            }
                        }
                    }
                }
            }
        }
    }
    best
}

/// The symmetric five-hinge mechanism of the least thickness (springings, haunches, crown):
/// the outer bodies turn about the springing hinges, the inner ones about the points where the
/// lines springing–haunch meet the horizontal through the crown hinge, so the crown drops.
pub fn five_hinge(arch: &Arch, h: &[Hinge; 5]) -> Option<[Body; 4]> {
    let p: Vec<[f64; 2]> = h.iter().map(|x| face(arch, x)).collect();
    let mut bodies = vec![];
    for (s, hh, sign) in [(p[0], p[1], 1.0), (p[4], p[3], -1.0)] {
        let d = sub(hh, s);
        if d[1].abs() < 1e-12 {
            return None;
        }
        let u = (p[2][1] - s[1]) / d[1];
        let ic = [s[0] + u * d[0], s[1] + u * d[1]];
        let wb = dot(d, d) / dot(sub(hh, ic), d);
        bodies.push((s, ic, sign, wb));
    }
    let (s0, ic0, _, wb0) = bodies[0];
    let sgn = if wb0 * (p[2][0] - ic0[0]) < 0.0 { 1.0 } else { -1.0 };
    let (s1, ic1, _, wb1) = bodies[1];
    let v0 = sgn * wb0 * (p[2][0] - ic0[0]);
    let v1 = wb1 * (p[2][0] - ic1[0]);
    if v1.abs() < 1e-14 {
        return None;
    }
    let k = v0 / v1;
    Some([
        Body { from: h[0].joint, to: h[1].joint, centre: s0, omega: sgn },
        Body { from: h[1].joint, to: h[2].joint, centre: ic0, omega: sgn * wb0 },
        Body { from: h[2].joint, to: h[3].joint, centre: ic1, omega: k * wb1 },
        Body { from: h[3].joint, to: h[4].joint, centre: s1, omega: k },
    ])
}
