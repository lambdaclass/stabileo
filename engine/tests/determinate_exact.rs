//! Statically determinate structures: solver forces vs. exact equilibrium.
//!
//! In a statically determinate structure the member forces and reactions follow
//! from equilibrium alone — no stiffness, no material, no compatibility. Solving
//! the equilibrium equations in EXACT rational arithmetic (integer coordinates
//! and loads) therefore gives reference values that do not trust K, the DOF
//! numbering, the assembly, the factorisation or the force recovery. The
//! solver, which goes through all of them, must reproduce them to round-off for
//! any E, A, I. A wrong entry in K changes the displacements but, in a
//! determinate structure, not the forces — so what this checks is the whole
//! chain assembly → solve → recovery, plus K's consistency with equilibrium
//! (K·u must be in equilibrium with the loads for the recovered forces to be).
//!
//! Families:
//! - Random 2D trusses grown by Henneberg type-I steps (each new node attached
//!   by two non-collinear bars) on a pin + roller base: always determinate and
//!   rigid. Method of joints over ℚ with force densities t = N/L as unknowns
//!   (so every coefficient is an integer).
//! - Random 2D frame chains (broken-line cantilevers and simply supported
//!   broken-line beams) with nodal forces and moments: section forces from cut
//!   sums, exact in ℚ.

#[path = "common/mod.rs"]
mod common;

use common::make_input;
use dedaliano_engine::solver::linear::solve_2d;
use dedaliano_engine::types::*;

// ─── exact rationals over i128 ──────────────────────────────────────────────

/// Reduced fraction with positive denominator. Every operation is checked: an
/// overflow panics instead of wrapping, so a passing test is exact.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Q {
    n: i128,
    d: i128,
}

fn gcd(mut a: i128, mut b: i128) -> i128 {
    a = a.abs();
    b = b.abs();
    while b != 0 {
        let t = a % b;
        a = b;
        b = t;
    }
    a
}

impl Q {
    const ZERO: Q = Q { n: 0, d: 1 };
    fn int(n: i64) -> Q {
        Q { n: n as i128, d: 1 }
    }
    fn new(n: i128, d: i128) -> Q {
        assert!(d != 0, "division by zero");
        let g = gcd(n, d).max(1);
        let s = if d < 0 { -1 } else { 1 };
        Q { n: s * n / g, d: s * d / g }
    }
    fn add(self, o: Q) -> Q {
        let g = gcd(self.d, o.d);
        let l = self.d / g;
        let n = self.n.checked_mul(o.d / g).unwrap().checked_add(o.n.checked_mul(l).unwrap()).unwrap();
        Q::new(n, l.checked_mul(o.d).unwrap())
    }
    fn neg(self) -> Q {
        Q { n: -self.n, d: self.d }
    }
    fn sub(self, o: Q) -> Q {
        self.add(o.neg())
    }
    fn mul(self, o: Q) -> Q {
        let g1 = gcd(self.n, o.d).max(1);
        let g2 = gcd(o.n, self.d).max(1);
        Q::new(
            (self.n / g1).checked_mul(o.n / g2).unwrap(),
            (self.d / g2).checked_mul(o.d / g1).unwrap(),
        )
    }
    fn div(self, o: Q) -> Q {
        assert!(o.n != 0);
        self.mul(Q::new(o.d, o.n))
    }
    fn is_zero(self) -> bool {
        self.n == 0
    }
    fn f(self) -> f64 {
        self.n as f64 / self.d as f64
    }
}

/// Solve A·x = b exactly; None if A is singular.
fn solve_exact(mut a: Vec<Vec<Q>>, mut b: Vec<Q>) -> Option<Vec<Q>> {
    let n = b.len();
    for c in 0..n {
        let p = (c..n).find(|&r| !a[r][c].is_zero())?;
        a.swap(c, p);
        b.swap(c, p);
        for r in 0..n {
            if r != c && !a[r][c].is_zero() {
                let f = a[r][c].div(a[c][c]);
                for k in c..n {
                    a[r][k] = a[r][k].sub(f.mul(a[c][k]));
                }
                b[r] = b[r].sub(f.mul(b[c]));
            }
        }
    }
    Some((0..n).map(|i| b[i].div(a[i][i])).collect())
}

struct Lcg(u64);
impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0 >> 20
    }
    /// Uniform integer in [lo, hi].
    fn i(&mut self, lo: i64, hi: i64) -> i64 {
        lo + (self.next() % ((hi - lo + 1) as u64)) as i64
    }
}

fn nodal(node_id: usize, fx: f64, fz: f64, my: f64) -> SolverLoad {
    SolverLoad::Nodal(SolverNodalLoad { node_id, fx, fz, my })
}

/// |a − b| ≤ tol·scale, with a readable failure.
fn close(a: f64, b: f64, scale: f64, what: &str) {
    assert!(
        (a - b).abs() <= 1e-9 * scale,
        "{what}: solver {a:.12e} vs exact {b:.12e} (scale {scale:.3e})"
    );
}

// ─── trusses ────────────────────────────────────────────────────────────────

struct Truss {
    pts: Vec<(i64, i64)>,
    bars: Vec<(usize, usize)>,
    loads: Vec<(i64, i64)>,
}

fn random_truss(g: &mut Lcg, n_nodes: usize) -> Truss {
    let mut pts = vec![(0, 0), (g.i(2, 6), g.i(-2, 2))];
    let mut bars = vec![(0, 1)];
    while pts.len() < n_nodes {
        let p = (g.i(-3, 9), g.i(-4, 6));
        if pts.contains(&p) {
            continue;
        }
        let a = g.i(0, pts.len() as i64 - 1) as usize;
        let b = g.i(0, pts.len() as i64 - 1) as usize;
        if a == b {
            continue;
        }
        let (u, v) = ((pts[a].0 - p.0, pts[a].1 - p.1), (pts[b].0 - p.0, pts[b].1 - p.1));
        if u.0 * v.1 - u.1 * v.0 == 0 {
            continue; // collinear: the new node would be a mechanism
        }
        let k = pts.len();
        pts.push(p);
        bars.push((a, k));
        bars.push((b, k));
    }
    let loads = (0..n_nodes).map(|_| if g.i(0, 2) == 0 { (0, 0) } else { (g.i(-20, 20), g.i(-20, 20)) }).collect();
    Truss { pts, bars, loads }
}

/// Exact bar force densities t = N/L (tension positive) and reactions
/// [R0x, R0z, R1z] by the method of joints.
fn truss_exact(t: &Truss) -> (Vec<Q>, [Q; 3]) {
    let nn = t.pts.len();
    let nb = t.bars.len();
    let nu = nb + 3;
    assert_eq!(2 * nn, nu, "not statically determinate");
    let mut a = vec![vec![Q::ZERO; nu]; nu];
    let mut rhs = vec![Q::ZERO; nu];
    for (b, &(i, j)) in t.bars.iter().enumerate() {
        let d = (t.pts[j].0 - t.pts[i].0, t.pts[j].1 - t.pts[i].1);
        // Tension pulls node i towards j and j towards i.
        a[2 * i][b] = Q::int(d.0);
        a[2 * i + 1][b] = Q::int(d.1);
        a[2 * j][b] = Q::int(-d.0);
        a[2 * j + 1][b] = Q::int(-d.1);
    }
    a[0][nb] = Q::int(1); // R0x
    a[1][nb + 1] = Q::int(1); // R0z
    a[3][nb + 2] = Q::int(1); // R1z (roller)
    for k in 0..nn {
        rhs[2 * k] = Q::int(-t.loads[k].0);
        rhs[2 * k + 1] = Q::int(-t.loads[k].1);
    }
    let x = solve_exact(a, rhs).expect("Henneberg truss must be rigid");
    (x[..nb].to_vec(), [x[nb], x[nb + 1], x[nb + 2]])
}

#[test]
fn random_determinate_trusses_match_exact_equilibrium() {
    let mut g = Lcg(2024);
    for case in 0..60 {
        let n_nodes = 3 + (case % 7);
        let t = random_truss(&mut g, n_nodes);
        let (dens, reac) = truss_exact(&t);

        // Wildly different member stiffnesses: forces must not depend on them.
        let secs: Vec<(usize, f64, f64)> =
            (0..t.bars.len()).map(|b| (b + 1, 1e-4 * 10f64.powi((b % 4) as i32), 1e-6)).collect();
        let input = make_input(
            t.pts.iter().enumerate().map(|(k, p)| (k + 1, p.0 as f64, p.1 as f64)).collect(),
            vec![(1, 200_000.0, 0.3)],
            secs,
            t.bars.iter().enumerate().map(|(b, &(i, j))| (b + 1, "truss", i + 1, j + 1, 1, b + 1, false, false)).collect(),
            vec![(1, 1, "pinned"), (2, 2, "rollerX")],
            t.loads
                .iter()
                .enumerate()
                .filter(|(_, l)| l.0 != 0 || l.1 != 0)
                .map(|(k, l)| nodal(k + 1, l.0 as f64, l.1 as f64, 0.0))
                .collect(),
        );
        let res = solve_2d(&input).unwrap_or_else(|e| panic!("case {case}: solve failed: {e}"));

        let exact_n: Vec<f64> = t
            .bars
            .iter()
            .zip(&dens)
            .map(|(&(i, j), q)| {
                let d = ((t.pts[j].0 - t.pts[i].0) as f64, (t.pts[j].1 - t.pts[i].1) as f64);
                q.f() * d.0.hypot(d.1)
            })
            .collect();
        let scale = exact_n.iter().chain(reac.iter().map(|q| q.f()).collect::<Vec<_>>().iter()).fold(1.0_f64, |m, v| m.max(v.abs()));
        for (b, n) in exact_n.iter().enumerate() {
            let ef = res.element_forces.iter().find(|f| f.element_id == b + 1).unwrap();
            close(ef.n_start, *n, scale, &format!("case {case} bar {} N", b + 1));
            close(ef.n_end, *n, scale, &format!("case {case} bar {} N end", b + 1));
        }
        let r1 = res.reactions.iter().find(|r| r.node_id == 1).unwrap();
        let r2 = res.reactions.iter().find(|r| r.node_id == 2).unwrap();
        close(r1.rx, reac[0].f(), scale, &format!("case {case} R1x"));
        close(r1.rz, reac[1].f(), scale, &format!("case {case} R1z"));
        close(r2.rz, reac[2].f(), scale, &format!("case {case} R2z"));
    }
}

// ─── frame chains ───────────────────────────────────────────────────────────

/// Moment about c of force f applied at p, positive from +x towards +z
/// (counter-clockwise in the x–z drawing plane, the 2D rotation DOF's sense).
fn moment(p: (i64, i64), c: (i64, i64), f: (Q, Q)) -> Q {
    Q::int(p.0 - c.0).mul(f.1).sub(Q::int(p.1 - c.1).mul(f.0))
}

/// Check every member of a chain 1–2–…–n against exact cut sums, where
/// `ext[k]` = (Fx, Fz, M) is the total external action at node k (applied loads
/// plus, at the far end, any reaction), all exact.
fn check_chain(case: &str, pts: &[(i64, i64)], ext: &[(Q, Q, Q)], res: &AnalysisResults) {
    let n = pts.len();
    let mut rows = Vec::new();
    for m in 0..n - 1 {
        let (i, j) = (m, m + 1);
        // Resultant of everything beyond the member (nodes ≥ j).
        let (mut px, mut pz) = (Q::ZERO, Q::ZERO);
        let (mut mi, mut mj) = (Q::ZERO, Q::ZERO);
        for k in j..n {
            px = px.add(ext[k].0);
            pz = pz.add(ext[k].1);
            mi = mi.add(ext[k].2).add(moment(pts[k], pts[i], (ext[k].0, ext[k].1)));
            mj = mj.add(ext[k].2).add(moment(pts[k], pts[j], (ext[k].0, ext[k].1)));
        }
        let (dx, dz) = (pts[j].0 - pts[i].0, pts[j].1 - pts[i].1);
        let l = (dx as f64).hypot(dz as f64);
        // Member end forces (on the member, local axes x along i→j, y = x rotated
        // +90°): at j the far part pushes with +P, at i the support side with −P.
        // ElementForces: n = −f_i,x = f_j,x; v = f_i,y = −f_j,y; m_start = f_i,θ,
        // m_end = −f_j,θ.
        let p_axial_l = Q::int(dx).mul(px).add(Q::int(dz).mul(pz)); // (P·e)·L
        let p_trans_l = Q::int(-dz).mul(px).add(Q::int(dx).mul(pz)); // (P·n)·L
        let exp_n = p_axial_l.f() / l;
        let exp_v = -p_trans_l.f() / l;
        let exp_m_start = mi.neg().f();
        let exp_m_end = mj.neg().f();
        rows.push((m + 1, exp_n, exp_v, exp_m_start, exp_m_end));
    }
    let scale = rows.iter().fold(1.0_f64, |s, r| s.max(r.1.abs()).max(r.2.abs()).max(r.3.abs()).max(r.4.abs()));
    for (id, en, ev, ems, eme) in rows {
        let ef = res.element_forces.iter().find(|f| f.element_id == id).unwrap();
        close(ef.n_start, en, scale, &format!("{case} member {id} N start"));
        close(ef.n_end, en, scale, &format!("{case} member {id} N end"));
        close(ef.v_start, ev, scale, &format!("{case} member {id} V start"));
        close(ef.v_end, ev, scale, &format!("{case} member {id} V end"));
        close(ef.m_start, ems, scale, &format!("{case} member {id} M start"));
        close(ef.m_end, eme, scale, &format!("{case} member {id} M end"));
    }
}

fn random_chain(g: &mut Lcg, n: usize, monotone_x: bool) -> Vec<(i64, i64)> {
    let mut pts = vec![(0, 0)];
    while pts.len() < n {
        let last = *pts.last().unwrap();
        let step = if monotone_x { (g.i(1, 4), g.i(-3, 3)) } else { (g.i(-4, 4), g.i(-4, 4)) };
        if step == (0, 0) {
            continue;
        }
        pts.push((last.0 + step.0, last.1 + step.1));
    }
    pts
}

fn random_nodal_loads(g: &mut Lcg, n: usize) -> Vec<(i64, i64, i64)> {
    (0..n).map(|_| if g.i(0, 1) == 0 { (0, 0, 0) } else { (g.i(-30, 30), g.i(-30, 30), g.i(-50, 50)) }).collect()
}

fn frame_input(pts: &[(i64, i64)], loads: &[(i64, i64, i64)], sups: Vec<(usize, usize, &str)>, g: &mut Lcg) -> SolverInput {
    frame_input_hinged(pts, loads, sups, None, g)
}

/// `hinge_end_of`: member id whose end J is a hinge (an internal moment release).
fn frame_input_hinged(
    pts: &[(i64, i64)],
    loads: &[(i64, i64, i64)],
    sups: Vec<(usize, usize, &str)>,
    hinge_end_of: Option<usize>,
    g: &mut Lcg,
) -> SolverInput {
    let n = pts.len();
    make_input(
        pts.iter().enumerate().map(|(k, p)| (k + 1, p.0 as f64, p.1 as f64)).collect(),
        vec![(1, 30_000.0, 0.2)],
        // Varied sections: determinate forces must not depend on them.
        (0..n - 1).map(|m| (m + 1, 0.01 * (1 + g.i(0, 9)) as f64, 1e-4 * (1 + g.i(0, 99)) as f64)).collect(),
        (0..n - 1).map(|m| (m + 1, "frame", m + 1, m + 2, 1, m + 1, false, hinge_end_of == Some(m + 1))).collect(),
        sups,
        loads
            .iter()
            .enumerate()
            .filter(|(_, l)| **l != (0, 0, 0))
            .map(|(k, l)| nodal(k + 1, l.0 as f64, l.1 as f64, l.2 as f64))
            .collect(),
    )
}

#[test]
fn random_cantilever_chains_match_exact_cut_sums() {
    let mut g = Lcg(77);
    for case in 0..60 {
        let n = 2 + case % 7;
        let pts = random_chain(&mut g, n, false);
        let loads = random_nodal_loads(&mut g, n);
        let input = frame_input(&pts, &loads, vec![(1, 1, "fixed")], &mut g);
        let res = solve_2d(&input).unwrap_or_else(|e| panic!("cantilever {case}: {e}"));
        let ext: Vec<(Q, Q, Q)> = loads.iter().map(|l| (Q::int(l.0), Q::int(l.1), Q::int(l.2))).collect();
        check_chain(&format!("cantilever {case}"), &pts, &ext, &res);

        // Fixed-end reaction = −(resultant of all loads), exactly.
        let (mut fx, mut fz, mut m0) = (Q::ZERO, Q::ZERO, Q::ZERO);
        for (k, e) in ext.iter().enumerate() {
            fx = fx.add(e.0);
            fz = fz.add(e.1);
            m0 = m0.add(e.2).add(moment(pts[k], pts[0], (e.0, e.1)));
        }
        let r = res.reactions.iter().find(|r| r.node_id == 1).unwrap();
        let scale = 1.0_f64.max(m0.f().abs()).max(fx.f().abs()).max(fz.f().abs());
        close(r.rx, fx.neg().f(), scale, &format!("cantilever {case} Rx"));
        close(r.rz, fz.neg().f(), scale, &format!("cantilever {case} Rz"));
        close(r.my, m0.neg().f(), scale, &format!("cantilever {case} M"));
    }
}

#[test]
fn random_simply_supported_chains_match_exact_cut_sums() {
    let mut g = Lcg(31337);
    for case in 0..60 {
        let n = 2 + case % 7;
        let pts = random_chain(&mut g, n, true); // x strictly increasing: span ≠ 0
        let loads = random_nodal_loads(&mut g, n);
        let input = frame_input(&pts, &loads, vec![(1, 1, "pinned"), (2, n, "rollerX")], &mut g);
        let res = solve_2d(&input).unwrap_or_else(|e| panic!("simply supported {case}: {e}"));

        // Roller reaction (vertical) from moment equilibrium about node 1.
        let mut ext: Vec<(Q, Q, Q)> = loads.iter().map(|l| (Q::int(l.0), Q::int(l.1), Q::int(l.2))).collect();
        let mut m0 = Q::ZERO;
        for (k, e) in ext.iter().enumerate() {
            m0 = m0.add(e.2).add(moment(pts[k], pts[0], (e.0, e.1)));
        }
        let rz_end = m0.neg().div(Q::int(pts[n - 1].0 - pts[0].0));
        ext[n - 1].1 = ext[n - 1].1.add(rz_end);
        check_chain(&format!("simply supported {case}"), &pts, &ext, &res);

        let (mut fx, mut fz) = (Q::ZERO, Q::ZERO);
        for e in &ext {
            fx = fx.add(e.0);
            fz = fz.add(e.1);
        }
        let r1 = res.reactions.iter().find(|r| r.node_id == 1).unwrap();
        let rn = res.reactions.iter().find(|r| r.node_id == n).unwrap();
        let scale = 1.0_f64.max(rz_end.f().abs()).max(fx.f().abs()).max(fz.f().abs());
        close(rn.rz, rz_end.f(), scale, &format!("simply supported {case} roller"));
        close(r1.rx, fx.neg().f(), scale, &format!("simply supported {case} R1x"));
        close(r1.rz, fz.neg().f(), scale, &format!("simply supported {case} R1z"));
    }
}

/// Three-hinged broken-line arches/frames: pinned at both ends with one internal
/// hinge. Four reactions from three global equations plus M = 0 at the hinge,
/// solved exactly (cases where the hinge is collinear with the supports are
/// geometrically unstable and skipped).
#[test]
fn random_three_hinged_chains_match_exact_equilibrium() {
    let mut g = Lcg(4242);
    let mut checked = 0;
    for case in 0..80 {
        let n = 3 + case % 6;
        let pts = random_chain(&mut g, n, false);
        let h = g.i(1, n as i64 - 2) as usize; // internal node index (0-based)
        let loads = random_nodal_loads(&mut g, n);
        let ld: Vec<(Q, Q, Q)> = loads.iter().map(|l| (Q::int(l.0), Q::int(l.1), Q::int(l.2))).collect();
        // Unknowns [R1x, R1z, Rnx, Rnz].
        let (mut fx, mut fz, mut m1, mut mh) = (Q::ZERO, Q::ZERO, Q::ZERO, Q::ZERO);
        for (k, e) in ld.iter().enumerate() {
            fx = fx.add(e.0);
            fz = fz.add(e.1);
            m1 = m1.add(e.2).add(moment(pts[k], pts[0], (e.0, e.1)));
            // The release is at the end of the member ARRIVING at node h; a moment
            // applied at node h goes into the next member, so it lies beyond the cut.
            if k >= h {
                mh = mh.add(e.2).add(moment(pts[k], pts[h], (e.0, e.1)));
            }
        }
        let (pn, p1, ph) = (pts[n - 1], pts[0], pts[h]);
        let a = vec![
            vec![Q::int(1), Q::ZERO, Q::int(1), Q::ZERO],
            vec![Q::ZERO, Q::int(1), Q::ZERO, Q::int(1)],
            // Moment about node 1 of Rn.
            vec![Q::ZERO, Q::ZERO, Q::int(-(pn.1 - p1.1)), Q::int(pn.0 - p1.0)],
            // Moment about the hinge of everything beyond it (only Rn among reactions).
            vec![Q::ZERO, Q::ZERO, Q::int(-(pn.1 - ph.1)), Q::int(pn.0 - ph.0)],
        ];
        let Some(r) = solve_exact(a, vec![fx.neg(), fz.neg(), m1.neg(), mh.neg()]) else { continue };
        checked += 1;
        let input = frame_input_hinged(&pts, &loads, vec![(1, 1, "pinned"), (2, n, "pinned")], Some(h), &mut g);
        let res = solve_2d(&input).unwrap_or_else(|e| panic!("three-hinged {case}: {e}"));
        let mut ext = ld.clone();
        ext[n - 1].0 = ext[n - 1].0.add(r[2]);
        ext[n - 1].1 = ext[n - 1].1.add(r[3]);
        check_chain(&format!("three-hinged {case} (hinge at node {})", h + 1), &pts, &ext, &res);
        let r1 = res.reactions.iter().find(|x| x.node_id == 1).unwrap();
        let scale = r.iter().fold(1.0_f64, |m, q| m.max(q.f().abs()));
        close(r1.rx, r[0].f(), scale, &format!("three-hinged {case} R1x"));
        close(r1.rz, r[1].f(), scale, &format!("three-hinged {case} R1z"));
    }
    assert!(checked >= 50, "too few stable three-hinged cases: {checked}");
}
