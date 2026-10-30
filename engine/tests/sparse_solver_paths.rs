//! Large-model solve paths of the linear static solver (#339): models with at
//! least 64 free DOFs that force each path of `prepare_static_2d_impl` /
//! `PreparedStatic2D::solve_loads` and of `prepare_static_3d` /
//! `PreparedStatic3D::solve_loads_*` — sparse Cholesky, its dense-LU
//! fallbacks, the 3D diagonal-shift ladder, PCG with each preconditioner and
//! each fallback — and check the displacements and reactions against an
//! independent reference (a dense Lagrange-multiplier solve written here,
//! closed forms, or the same structure on the small dense path), and the exact
//! structured diagnostics each path emits.

use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::linear::{
    prepare_static_2d, prepare_static_2d_dense_reference, prepare_static_3d, solve_2d, solve_3d,
};
use dedaliano_engine::types::*;
use serde_json::{json, Value};

const SINGULAR: &str = "Singular stiffness matrix — structure is a mechanism";

// ==================== 2D model builder ====================

/// E in MPa as the engine takes it; stiffness uses E·1000 (kN/m²).
const E_MPA: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

#[derive(Clone, Default)]
struct M2 {
    nodes: Vec<(usize, f64, f64)>,
    /// (id, type, i, j, hinge_start, hinge_end)
    elems: Vec<(usize, &'static str, usize, usize, bool, bool)>,
    sups: Vec<Value>,
    loads: Vec<Value>,
    connectors: Vec<Value>,
    e: Option<f64>,
    opts: Option<Value>,
}

impl M2 {
    fn node(&mut self, x: f64, z: f64) -> usize {
        let id = self.nodes.len() + 1;
        self.nodes.push((id, x, z));
        id
    }
    fn elem(&mut self, t: &'static str, i: usize, j: usize) -> usize {
        let id = self.elems.len() + 1;
        self.elems.push((id, t, i, j, false, false));
        id
    }
    fn sup(&mut self, node: usize, t: &str, extra: Value) {
        let mut s = json!({ "id": self.sups.len() + 1, "nodeId": node, "type": t });
        for (k, v) in extra.as_object().unwrap() {
            s[k] = v.clone();
        }
        self.sups.push(s);
    }
    fn load(&mut self, node: usize, fx: f64, fz: f64, my: f64) {
        self.loads.push(json!({ "type": "nodal", "data": { "nodeId": node, "fx": fx, "fz": fz, "my": my } }));
    }
    fn input(&self) -> SolverInput {
        let e = self.e.unwrap_or(E_MPA);
        let nodes: serde_json::Map<String, Value> = self
            .nodes
            .iter()
            .map(|&(id, x, z)| (id.to_string(), json!({ "id": id, "x": x, "z": z })))
            .collect();
        let elems: serde_json::Map<String, Value> = self
            .elems
            .iter()
            .map(|&(id, t, i, j, hs, he)| {
                (id.to_string(), json!({ "id": id, "type": t, "nodeI": i, "nodeJ": j, "materialId": 1, "sectionId": 1, "hingeStart": hs, "hingeEnd": he }))
            })
            .collect();
        let sups: serde_json::Map<String, Value> =
            self.sups.iter().map(|s| (s["id"].to_string(), s.clone())).collect();
        let conns: serde_json::Map<String, Value> =
            self.connectors.iter().map(|c| (c["id"].to_string(), c.clone())).collect();
        let mut v = json!({
            "nodes": nodes,
            "materials": { "1": { "id": 1, "e": e, "nu": 0.3 } },
            "sections": { "1": { "id": 1, "a": A, "iz": IZ } },
            "elements": elems,
            "supports": sups,
            "loads": self.loads,
            "connectors": conns,
        });
        if let Some(o) = &self.opts {
            v["solverOptions"] = o.clone();
        }
        serde_json::from_value(v).unwrap()
    }
}

/// Two-storey, `bays`-bay portal frame, each member split into `seg`
/// segments, offset from the origin (x from 2, z from 1) so the
/// characteristic length is a genuine diagonal. Supports: fixed, pinned, a
/// rollerX with a settlement, an inclined roller and an elastic spring
/// support, one at each column base. Nodal loads at the floor nodes.
/// Returns the builder and the ids of the column-base nodes.
fn portal(bays: usize, seg: usize) -> (M2, Vec<usize>) {
    let mut m = M2::default();
    let (x0, z0, w, h) = (2.0, 1.0, 4.0, 3.0);
    // grid nodes (column lines × levels)
    let mut grid = vec![vec![0usize; 3]; bays + 1];
    for (c, col) in grid.iter_mut().enumerate() {
        for (l, g) in col.iter_mut().enumerate() {
            *g = m.node(x0 + c as f64 * w, z0 + l as f64 * h);
        }
    }
    let member = |m: &mut M2, a: usize, b: usize| {
        let (_, xa, za) = m.nodes[a - 1];
        let (_, xb, zb) = m.nodes[b - 1];
        let mut prev = a;
        for k in 1..seg {
            let t = k as f64 / seg as f64;
            let n = m.node(xa + t * (xb - xa), za + t * (zb - za));
            m.elem("frame", prev, n);
            prev = n;
        }
        m.elem("frame", prev, b);
    };
    for c in 0..=bays {
        for l in 0..2 {
            member(&mut m, grid[c][l], grid[c][l + 1]);
        }
    }
    for c in 0..bays {
        for l in 1..3 {
            member(&mut m, grid[c][l], grid[c + 1][l]);
        }
    }
    let bases: Vec<usize> = grid.iter().map(|col| col[0]).collect();
    let kinds = ["fixed", "pinned", "rollerX", "inclinedRoller", "spring"];
    for (c, &b) in bases.iter().enumerate() {
        match kinds[c % kinds.len()] {
            "rollerX" => m.sup(b, "rollerX", json!({ "dz": -0.004 })),
            "inclinedRoller" => m.sup(b, "inclinedRoller", json!({ "angle": 0.5 })),
            "spring" => m.sup(b, "spring", json!({ "kx": 4.0e4, "ky": 9.0e4, "kz": 2.0e4 })),
            k => m.sup(b, k, json!({})),
        }
    }
    for c in 0..=bays {
        m.load(grid[c][1], 30.0 + 5.0 * c as f64, -80.0, 4.0);
        m.load(grid[c][2], 15.0, -120.0 - 10.0 * c as f64, -6.0);
    }
    (m, bases)
}

// ==================== Independent 2D reference ====================

/// Sign of the engine's rotation `ry` relative to the counter-clockwise
/// rotation (x toward z) the reference element is written in.
const RY_SIGN: f64 = 1.0;

struct Ref2D {
    /// node id → (ux, uz, ry)
    disp: std::collections::HashMap<usize, [f64; 3]>,
    /// node id → (rx, rz, my)
    reac: std::collections::HashMap<usize, [f64; 3]>,
    /// node id → 3×3 diagonal block of the reference K (global frame)
    kdiag: std::collections::HashMap<usize, [[f64; 3]; 3]>,
}

/// Dense reference solve of an `M2` model built from frames, trusses, nodal
/// loads, rigid supports (prescribed values included), inclined rollers and
/// springs: Euler-Bernoulli element matrices written out here, every support
/// as a Lagrange-multiplier constraint (no free/restrained partition), and
/// Gaussian elimination with partial pivoting. Hinges and connectors are not
/// modelled (those tests use closed forms).
fn reference_2d(m: &M2) -> Ref2D {
    let e = m.e.unwrap_or(E_MPA) * 1000.0;
    let idx: std::collections::HashMap<usize, usize> =
        m.nodes.iter().enumerate().map(|(k, n)| (n.0, k)).collect();
    let nd = 3 * m.nodes.len();
    // constraints: (dof coefficients, rhs)
    let mut cons: Vec<(Vec<(usize, f64)>, f64)> = Vec::new();
    let mut k = vec![0.0; nd * nd];
    let mut f = vec![0.0; nd];
    for &(_, t, i, j, hs, he) in &m.elems {
        assert!(!hs && !he, "reference_2d does not model hinges");
        let (_, xi, zi) = m.nodes[idx[&i]];
        let (_, xj, zj) = m.nodes[idx[&j]];
        let l = ((xj - xi).powi(2) + (zj - zi).powi(2)).sqrt();
        let (c, s) = ((xj - xi) / l, (zj - zi) / l);
        let ea = e * A / l;
        let ei = if t == "frame" { e * IZ } else { 0.0 };
        let (k1, k2, k3, k4) = (12.0 * ei / l.powi(3), 6.0 * ei / l.powi(2), 4.0 * ei / l, 2.0 * ei / l);
        let kl = [
            [ea, 0.0, 0.0, -ea, 0.0, 0.0],
            [0.0, k1, k2, 0.0, -k1, k2],
            [0.0, k2, k3, 0.0, -k2, k4],
            [-ea, 0.0, 0.0, ea, 0.0, 0.0],
            [0.0, -k1, -k2, 0.0, k1, -k2],
            [0.0, k2, k4, 0.0, -k2, k3],
        ];
        let mut tr = [[0.0; 6]; 6];
        for b in 0..2 {
            let o = 3 * b;
            tr[o][o] = c;
            tr[o][o + 1] = s;
            tr[o + 1][o] = -s;
            tr[o + 1][o + 1] = c;
            tr[o + 2][o + 2] = 1.0;
        }
        let dofs: Vec<usize> = (0..3).map(|d| 3 * idx[&i] + d).chain((0..3).map(|d| 3 * idx[&j] + d)).collect();
        for p in 0..6 {
            for q in 0..6 {
                let mut v = 0.0;
                for a in 0..6 {
                    for b in 0..6 {
                        v += tr[a][p] * kl[a][b] * tr[b][q];
                    }
                }
                k[dofs[p] * nd + dofs[q]] += v;
            }
        }
    }
    // Axial-only connectors: a spring of stiffness kAxial along the connector.
    for cn in &m.connectors {
        for key in ["kShear", "kMoment"] {
            assert_eq!(cn.get(key).and_then(|v| v.as_f64()).unwrap_or(0.0), 0.0, "reference_2d models axial connectors only");
        }
        let ka = cn["kAxial"].as_f64().unwrap();
        let (i, j) = (idx[&(cn["nodeI"].as_u64().unwrap() as usize)], idx[&(cn["nodeJ"].as_u64().unwrap() as usize)]);
        let (_, xi, zi) = m.nodes[i];
        let (_, xj, zj) = m.nodes[j];
        let l = ((xj - xi).powi(2) + (zj - zi).powi(2)).sqrt();
        let g = [-(xj - xi) / l, -(zj - zi) / l, (xj - xi) / l, (zj - zi) / l];
        let dofs = [3 * i, 3 * i + 1, 3 * j, 3 * j + 1];
        for p in 0..4 {
            for q in 0..4 {
                k[dofs[p] * nd + dofs[q]] += ka * g[p] * g[q];
            }
        }
    }
    // An all-truss model has no rotation DOFs: hold the reference's at zero.
    let has_frame = m.elems.iter().any(|e| e.1 == "frame");
    if !has_frame {
        for n in 0..m.nodes.len() {
            cons.push((vec![(3 * n + 2, 1.0)], 0.0));
        }
    }
    let gv = |s: &Value, key: &str| s.get(key).and_then(|v| v.as_f64());
    let mut springs: Vec<(usize, [f64; 3])> = Vec::new();
    for s in &m.sups {
        let n = idx[&(s["nodeId"].as_u64().unwrap() as usize)];
        let d = |q: usize| 3 * n + q;
        let t = s["type"].as_str().unwrap();
        let (dx, dz, dry) = (gv(s, "dx").unwrap_or(0.0), gv(s, "dz").unwrap_or(0.0), gv(s, "dry").unwrap_or(0.0));
        match t {
            "fixed" => {
                cons.push((vec![(d(0), 1.0)], dx));
                cons.push((vec![(d(1), 1.0)], dz));
                cons.push((vec![(d(2), RY_SIGN)], dry));
            }
            "pinned" => {
                cons.push((vec![(d(0), 1.0)], dx));
                cons.push((vec![(d(1), 1.0)], dz));
            }
            "rollerX" => cons.push((vec![(d(1), 1.0)], dz)),
            "inclinedRoller" => {
                let th = gv(s, "angle").unwrap();
                // restrained direction (sin θ, cos θ)
                cons.push((vec![(d(0), th.sin()), (d(1), th.cos())], dx * th.sin() + dz * th.cos()));
            }
            "spring" => {
                let ks = [gv(s, "kx").unwrap_or(0.0), gv(s, "ky").unwrap_or(0.0), gv(s, "kz").unwrap_or(0.0)];
                for q in 0..3 {
                    k[d(q) * nd + d(q)] += ks[q];
                }
                springs.push((n, ks));
            }
            other => panic!("reference_2d: support type {other}"),
        }
    }
    for l in &m.loads {
        let dta = &l["data"];
        let n = idx[&(dta["nodeId"].as_u64().unwrap() as usize)];
        f[3 * n] += dta["fx"].as_f64().unwrap();
        f[3 * n + 1] += dta["fz"].as_f64().unwrap();
        f[3 * n + 2] += RY_SIGN * dta["my"].as_f64().unwrap();
    }
    let mut kdiag = std::collections::HashMap::new();
    for (id, &n) in &idx {
        let kn = |a: usize, b: usize| k[(3 * n + a) * nd + 3 * n + b];
        kdiag.insert(*id, [[kn(0, 0), kn(0, 1), kn(0, 2)], [kn(1, 0), kn(1, 1), kn(1, 2)], [kn(2, 0), kn(2, 1), kn(2, 2)]]);
    }
    // augmented system [K Cᵀ; C 0] [u; λ] = [f; d]
    let nc = cons.len();
    let na = nd + nc;
    let mut a = vec![0.0; na * na];
    let mut b = vec![0.0; na];
    for r in 0..nd {
        a[r * na..r * na + nd].copy_from_slice(&k[r * nd..r * nd + nd]);
        b[r] = f[r];
    }
    for (ci, (coef, rhs)) in cons.iter().enumerate() {
        for &(d, v) in coef {
            a[(nd + ci) * na + d] = v;
            a[d * na + nd + ci] = v;
        }
        b[nd + ci] = *rhs;
    }
    let x = gauss(a, b, na);
    let mut disp = std::collections::HashMap::new();
    for (id, &n) in &idx {
        disp.insert(*id, [x[3 * n], x[3 * n + 1], RY_SIGN * x[3 * n + 2]]);
    }
    // reaction on the structure = −Cᵀλ (in the reference rotation sense)
    let mut rv = vec![0.0; nd];
    for (ci, (coef, _)) in cons.iter().enumerate() {
        for &(d, v) in coef {
            rv[d] -= v * x[nd + ci];
        }
    }
    let mut reac = std::collections::HashMap::new();
    if !has_frame {
        for d in disp.values_mut() {
            d[2] = 0.0;
        }
    }
    for s in &m.sups {
        let id = s["nodeId"].as_u64().unwrap() as usize;
        let n = idx[&id];
        let mut r = [rv[3 * n], rv[3 * n + 1], if has_frame { RY_SIGN * rv[3 * n + 2] } else { 0.0 }];
        if let Some((_, ks)) = springs.iter().find(|(sn, _)| *sn == n) {
            let u = &disp[&id];
            for q in 0..3 {
                r[q] = -ks[q] * u[q];
            }
        }
        reac.insert(id, r);
    }
    Ref2D { disp, reac, kdiag }
}

/// Gaussian elimination with partial pivoting (dense, row-major).
fn gauss(mut a: Vec<f64>, mut b: Vec<f64>, n: usize) -> Vec<f64> {
    for col in 0..n {
        let p = (col..n).max_by(|&r, &s| a[r * n + col].abs().total_cmp(&a[s * n + col].abs())).unwrap();
        assert!(a[p * n + col].abs() > 0.0, "reference system singular");
        if p != col {
            for c in 0..n {
                a.swap(p * n + c, col * n + c);
            }
            b.swap(p, col);
        }
        let piv = a[col * n + col];
        for r in col + 1..n {
            let fct = a[r * n + col] / piv;
            if fct != 0.0 {
                for c in col..n {
                    a[r * n + c] -= fct * a[col * n + c];
                }
                b[r] -= fct * b[col];
            }
        }
    }
    let mut x = vec![0.0; n];
    for r in (0..n).rev() {
        let mut s = b[r];
        for c in r + 1..n {
            s -= a[r * n + c] * x[c];
        }
        x[r] = s / a[r * n + r];
    }
    x
}

/// Max relative difference of displacements and reactions against the
/// reference, scaled by the largest magnitude of each quantity.
fn assert_matches_reference_2d(r: &AnalysisResults, rf: &Ref2D, tol: f64, label: &str) {
    let scale = |v: Vec<f64>| v.iter().fold(0.0f64, |a, b| a.max(b.abs())).max(1e-9);
    let su = scale(rf.disp.values().flat_map(|d| [d[0], d[1]]).collect());
    let sr = scale(rf.disp.values().map(|d| d[2]).collect());
    assert_eq!(r.displacements.len(), rf.disp.len(), "{label}: displacement count");
    for d in &r.displacements {
        let e = rf.disp[&d.node_id];
        for (got, want, s, what) in [(d.ux, e[0], su, "ux"), (d.uz, e[1], su, "uz"), (d.ry, e[2], sr, "ry")] {
            assert!((got - want).abs() <= tol * s, "{label}: node {} {what} = {got:e}, reference {want:e}", d.node_id);
        }
    }
    let sf = scale(rf.reac.values().flat_map(|x| [x[0], x[1]]).collect());
    let sm = scale(rf.reac.values().map(|x| x[2]).collect());
    assert_eq!(r.reactions.len(), rf.reac.len(), "{label}: reaction count");
    for x in &r.reactions {
        let e = rf.reac[&x.node_id];
        for (got, want, s, what) in [(x.rx, e[0], sf, "rx"), (x.rz, e[1], sf, "rz"), (x.my, e[2], sm, "my")] {
            assert!((got - want).abs() <= tol * s, "{label}: reaction node {} {what} = {got:e}, reference {want:e}", x.node_id);
        }
    }
}

fn path_2d(r: &AnalysisResults) -> &str {
    &r.solver_run_meta.as_ref().unwrap().solver_path
}

fn codes(d: &[StructuredDiagnostic]) -> Vec<DiagnosticCode> {
    d.iter().map(|x| x.code).collect()
}

fn diag(r: &[StructuredDiagnostic], c: DiagnosticCode) -> &StructuredDiagnostic {
    let v: Vec<_> = r.iter().filter(|d| d.code == c).collect();
    assert_eq!(v.len(), 1, "expected exactly one {c:?} in {:?}", codes(r));
    v[0]
}

// ==================== 2D scenarios ====================

/// The full support mix (fixed, pinned, settled rollerX, inclined roller,
/// spring) on a 4-bay, 2-storey frame with members in `seg` segments:
/// 200 free DOFs at seg = 4, 45 at seg = 1 (small dense path).
fn mixed(seg: usize) -> M2 {
    portal(4, seg).0
}

/// Adds the indefinite but non-singular gadget: free nodes P, Q on springs
/// (kx = ky = kz = k) joined by a horizontal axial connector of stiffness −k.
/// Their x block is [[0, k], [k, 0]] (eigenvalues ±k): Cholesky fails on the
/// zero pivot, LU solves it, and both x diagonals are exactly zero. Loads
/// fx = 10 on P and −4 on Q give u_Q = 10/k, u_P = −4/k. Returns (P, Q).
fn add_gadget(m: &mut M2, k: f64) -> (usize, usize) {
    let p = m.node(5.0, 2.0);
    let q = m.node(6.0, 2.0);
    for n in [p, q] {
        m.sup(n, "spring", json!({ "kx": k, "ky": k, "kz": k }));
    }
    let id = m.connectors.len() + 1;
    m.connectors.push(json!({ "id": id, "nodeI": p, "nodeJ": q, "kAxial": -k }));
    m.load(p, 10.0, 0.0, 0.0);
    m.load(q, -4.0, 0.0, 0.0);
    (p, q)
}

/// Adds a free node held only by springs of stiffness `k` (decoupled from
/// the structure), loaded by a moment `my`: it sets the minimum diagonal of
/// K_ff, and its rotation is my/k.
fn add_floating(m: &mut M2, k: f64, my: f64) -> usize {
    let n = m.node(4.0, 1.5);
    m.sup(n, "spring", json!({ "kx": k, "ky": k, "kz": k }));
    m.load(n, 0.0, 0.0, my);
    n
}

/// Truss chain of 65 bars on springs at every node (diagonally dominant:
/// strict IC(0) and MIC factor it).
fn truss_chain() -> M2 {
    let mut m = M2::default();
    let mut prev = m.node(1.0, 0.5);
    for k in 1..=65 {
        let n = m.node(1.0 + 0.5 * k as f64, 0.5);
        m.elem("truss", prev, n);
        prev = n;
    }
    for n in 1..=66 {
        m.sup(n, "spring", json!({ "kx": 4e6, "ky": 4e6 }));
        m.load(n, 10.0 + n as f64, -3.0, 0.0);
    }
    m
}

// ==================== 2D path runner and checks ====================

#[derive(Clone, Copy, Debug)]
enum Path2 {
    /// No solver options: sparse (nf ≥ 64) or dense (nf < 64) direct.
    Default,
    /// `prepare_static_2d_dense_reference`: dense assembly, sparse Cholesky of
    /// the dense K_ff for nf ≥ 64, dense LU when Cholesky fails.
    DenseRef,
    /// Explicit PCG with this preconditioner (tolerance 1e-12).
    Pcg(&'static str),
    /// Explicit PCG capped at one iteration: always falls back to direct.
    PcgMaxit1,
}

fn with_opts(m: &M2, o: Value) -> M2 {
    let mut mm = m.clone();
    mm.opts = Some(o);
    mm
}

fn solve_path_2d(m: &M2, p: Path2) -> Result<AnalysisResults, String> {
    match p {
        Path2::Default => solve_2d(&m.input()),
        Path2::DenseRef => {
            let i = m.input();
            let prepared = prepare_static_2d_dense_reference(&i)?;
            prepared.solve_loads(&i.loads)
        }
        Path2::Pcg(pc) => solve_2d(&with_opts(m, json!({ "method": "pcg", "preconditioner": pc, "tolerance": 1e-12 })).input()),
        Path2::PcgMaxit1 => solve_2d(&with_opts(m, json!({ "method": "pcg", "maxIterations": 1 })).input()),
    }
}

use DiagnosticCode as C;

/// What the reference predicts for the conditioning and displacement checks.
struct Expect2 {
    nf: usize,
    ratio: f64,
    near_zero: Vec<usize>,
    max_translation: f64,
    char_length: f64,
}

fn expect_2d(m: &M2, rf: &Ref2D) -> Expect2 {
    let input = m.input();
    let dn = DofNumbering::build_2d(&input);
    let nf = dn.n_free;
    let incl: std::collections::HashMap<usize, f64> = m
        .sups
        .iter()
        .filter(|s| s["type"] == "inclinedRoller")
        .map(|s| (s["nodeId"].as_u64().unwrap() as usize, s["angle"].as_f64().unwrap()))
        .collect();
    let mut diag = vec![0.0; nf];
    let mut max_translation = 0.0f64;
    for (&(node, local), &g) in &dn.map {
        if g >= nf {
            continue;
        }
        let kd = rf.kdiag[&node];
        let u = rf.disp[&node];
        let (d, t) = match (incl.get(&node), local) {
            (Some(&th), 0) => {
                let t = [th.cos(), -th.sin()];
                let mut d = 0.0;
                for a in 0..2 {
                    for b in 0..2 {
                        d += t[a] * kd[a][b] * t[b];
                    }
                }
                (d, (t[0] * u[0] + t[1] * u[1]).abs())
            }
            (Some(_), l) if l < 2 => panic!("inclined roller: local DOF {l} free"),
            _ => (kd[local][local], if local < 2 { u[local].abs() } else { 0.0 }),
        };
        diag[g] = d;
        max_translation = max_translation.max(t);
    }
    let maxd = diag.iter().fold(0.0f64, |a, d| a.max(d.abs()));
    let thr = maxd * 1e-12;
    let near_zero: Vec<usize> = (0..nf).filter(|&g| diag[g].abs() <= thr).collect();
    let mind = diag.iter().map(|d| d.abs()).filter(|&d| d > thr).fold(f64::MAX, f64::min);
    let (mut x0, mut x1, mut z0, mut z1) = (f64::MAX, f64::MIN, f64::MAX, f64::MIN);
    for &(_, x, z) in &m.nodes {
        x0 = x0.min(x);
        x1 = x1.max(x);
        z0 = z0.min(z);
        z1 = z1.max(z);
    }
    let char_length = ((x1 - x0).powi(2) + (z1 - z0).powi(2)).sqrt().max(1.0);
    Expect2 { nf, ratio: maxd / mind, near_zero, max_translation, char_length }
}

fn close(got: f64, want: f64, rel: f64) -> bool {
    (got - want).abs() <= rel * want.abs().max(1e-300)
}

/// Checks one 2D result against the reference and the exact diagnostics:
/// `pre` are the pre-solve gate codes, `head` the path's own codes (solver
/// path, fallbacks); the conditioning, displacement and residual codes that
/// follow are predicted from the reference.
#[allow(clippy::too_many_arguments)]
fn check_2d(
    label: &str,
    r: &AnalysisResults,
    m: &M2,
    rf: &Ref2D,
    path: &str,
    pre: &[C],
    head: &[C],
    ref_tol: f64,
    resid_max: f64,
) {
    let ex = expect_2d(m, rf);
    let nf = ex.nf;
    let meta = r.solver_run_meta.as_ref().unwrap();
    assert_eq!(meta.solver_path, path, "{label}: solver path");
    assert_eq!(meta.n_free_dofs, nf, "{label}: n_free_dofs");
    assert_matches_reference_2d(r, rf, ref_tol, label);

    let sd = solver_diagnostics_with_self_checks(&r.structured_diagnostics);
    let pre_got: Vec<C> = sd.iter().filter(|d| d.phase.as_deref() == Some("pre_solve")).map(|d| d.code).collect();
    assert_eq!(pre_got, pre, "{label}: pre-solve diagnostics");
    let tail: Vec<&StructuredDiagnostic> = sd.iter().copied().filter(|d| d.phase.as_deref() != Some("pre_solve")).collect();
    let excessive = ex.max_translation > 1000.0 * ex.char_length;
    let high = ex.ratio > 1e8;
    let mut want: Vec<C> = head.to_vec();
    if excessive {
        want.push(C::ExcessiveDisplacement);
    }
    if high {
        want.push(C::HighDiagonalRatio);
    }
    if !ex.near_zero.is_empty() {
        want.push(C::NearZeroDiagonal);
    }
    want.push(C::ResidualOk);
    assert_eq!(tail.iter().map(|d| d.code).collect::<Vec<_>>(), want, "{label}: diagnostics {:#?}", tail);

    let lu_msg = "Cholesky factorization failed — LU fallback succeeded but model may be unstable (not positive-definite)";
    for d in &tail {
        let ph = d.phase.as_deref();
        match d.code {
            C::SparseCholesky => {
                assert_eq!(d.message, format!("Sparse Cholesky solver ({nf} free DOFs)"), "{label}");
                assert_eq!((d.severity, ph), (Severity::Info, Some("solve")), "{label}");
            }
            C::DenseLu => {
                assert_eq!(d.message, format!("Dense solver ({nf} free DOFs)"), "{label}");
                assert_eq!((d.severity, ph), (Severity::Info, Some("solve")), "{label}");
            }
            C::CholeskyFailedLuFallback => {
                assert_eq!(d.message, lu_msg, "{label}");
                assert_eq!((d.severity, ph), (Severity::Warning, Some("solve")), "{label}");
            }
            C::PcgFallbackDirect => {
                assert_eq!(d.message, format!("PCG failed verification, fell back to direct solver ({nf} free DOFs)"), "{label}");
                assert_eq!((d.severity, ph), (Severity::Warning, Some("solve")), "{label}");
            }
            C::PcgSolve => {
                let pc = path.strip_prefix("pcg_").unwrap();
                let legacy = r.solver_diagnostics.last().unwrap();
                assert_eq!(legacy.message, d.message, "{label}: both channels name the same PCG run");
                assert_eq!((legacy.category.as_str(), legacy.severity.as_str()), ("solver_path", "info"), "{label}");
                let its: usize = d
                    .message
                    .strip_prefix(&format!("PCG solver ({pc} preconditioner, "))
                    .and_then(|t| t.strip_suffix(&format!(" iterations, {nf} free DOFs)")))
                    .unwrap_or_else(|| panic!("{label}: {}", d.message))
                    .parse()
                    .unwrap();
                assert!(its >= 1, "{label}");
                assert_eq!((d.severity, ph), (Severity::Info, Some("solve")), "{label}");
            }
            C::StiffnessNotPositiveDefinite => {
                assert_eq!((d.severity, ph), (Severity::Warning, Some("factorization")), "{label}");
            }
            C::ExcessiveDisplacement => {
                let v = d.value.unwrap();
                assert!(close(v, ex.max_translation, 1e-6), "{label}: max displacement {v:e}, reference {:e}", ex.max_translation);
                assert!(close(d.threshold.unwrap(), 1000.0 * ex.char_length, 1e-12), "{label}: threshold {:?}", d.threshold);
                assert_eq!(
                    d.message,
                    format!(
                        "Maximum displacement {:.2e} exceeds 1000× characteristic length {:.2e} — likely mechanism or instability",
                        v, ex.char_length
                    ),
                    "{label}"
                );
                assert_eq!((d.severity, ph), (Severity::Warning, Some("solve")), "{label}");
            }
            C::HighDiagonalRatio => {
                let v = d.value.unwrap();
                assert!(close(v, ex.ratio, 1e-9), "{label}: diagonal ratio {v:e}, reference {:e}", ex.ratio);
                assert_eq!(d.threshold, Some(1e8), "{label}");
                assert_eq!(d.message, format!("High diagonal ratio {:.2e}", v), "{label}");
                assert_eq!((d.severity, ph), (Severity::Warning, Some("conditioning")), "{label}");
            }
            C::NearZeroDiagonal => {
                assert_eq!(d.dof_indices, ex.near_zero, "{label}: near-zero DOFs");
                assert_eq!(d.message, format!("{} near-zero diagonal entries", ex.near_zero.len()), "{label}");
                assert_eq!((d.severity, ph), (Severity::Warning, Some("conditioning")), "{label}");
            }
            C::ResidualOk => {
                let v = d.value.unwrap();
                assert!(v > 0.0 && v <= resid_max, "{label}: residual {v:e} (max {resid_max:e})");
                assert_eq!(d.threshold, Some(1e-6), "{label}");
                assert_eq!(d.message, format!("Residual {:.2e} ({} free DOFs)", v, nf), "{label}");
                assert_eq!((d.severity, ph), (Severity::Info, Some("solve")), "{label}");
                let eq = r.equilibrium.as_ref().unwrap();
                assert_eq!(eq.relative_residual, v, "{label}: equilibrium carries the same residual");
                assert!(eq.residual_ok, "{label}: equilibrium {eq:?}");
            }
            other => panic!("{label}: unexpected {other:?}"),
        }
    }
}

fn not_pd_message(r: &AnalysisResults) -> &str {
    &diag(&r.structured_diagnostics, C::StiffnessNotPositiveDefinite).message
}

// ==================== 2D tests ====================

/// Sparse Cholesky (default and on the dense assembly), PCG with each
/// preconditioner that factors this pattern, and PCG falling back to sparse
/// Cholesky, on the full support mix with a settlement: displacements and
/// reactions match the reference, diagnostics are exactly the path's.
#[test]
fn spd_frame_every_2d_path_matches_reference() {
    let m = mixed(4);
    let rf = reference_2d(&m);
    assert_eq!(expect_2d(&m, &rf).nf, 200);
    let sc = [C::SparseCholesky];
    for (p, path, head, tol, res) in [
        (Path2::Default, "sparse_cholesky", &sc[..], 1e-9, 1e-12),
        (Path2::DenseRef, "sparse_cholesky", &sc[..], 1e-9, 1e-12),
        (Path2::Pcg("ics"), "pcg_ics", &[C::PcgSolve][..], 1e-7, 1e-11),
        (Path2::Pcg("ssor"), "pcg_ssor", &[C::PcgSolve][..], 1e-7, 1e-11),
        (Path2::Pcg("jacobi"), "pcg_jacobi", &[C::PcgSolve][..], 1e-7, 1e-11),
        (Path2::Pcg("none"), "pcg_none", &[C::PcgSolve][..], 1e-7, 1e-11),
        (Path2::PcgMaxit1, "pcg_fallback_sparse_cholesky", &[C::PcgFallbackDirect, C::SparseCholesky][..], 1e-9, 1e-12),
    ] {
        let r = solve_path_2d(&m, p).unwrap();
        check_2d(&format!("{p:?}"), &r, &m, &rf, path, &[], head, tol, res);
    }
    // Explicit strict IC(0) and MIC do not factor this pattern: they degrade
    // to Jacobi with warnings in the legacy channel.
    for pc in ["ic0", "mic"] {
        let r = solve_path_2d(&m, Path2::Pcg(pc)).unwrap();
        check_2d(pc, &r, &m, &rf, "pcg_jacobi", &[], &[C::PcgSolve], 1e-7, 1e-11);
        let msgs: Vec<&str> = r.solver_diagnostics.iter().map(|d| d.message.as_str()).collect();
        assert_eq!(msgs[0], format!("Preconditioner '{pc}' failed to build (non-SPD pivot or zero diagonal), degrading"));
        assert_eq!(msgs[1], "Preconditioner degraded to 'jacobi'");
    }
    // The fallback's legacy channel: the last PCG failure, then the direct solve.
    let r = solve_path_2d(&m, Path2::PcgMaxit1).unwrap();
    let n = r.solver_diagnostics.len();
    let fb = &r.solver_diagnostics[n - 2];
    assert_eq!((fb.category.as_str(), fb.severity.as_str()), ("fallback", "warning"));
    assert!(fb.message.ends_with(", falling back to direct solver"), "{}", fb.message);
    let last = &r.solver_diagnostics[n - 1];
    assert_eq!(
        (last.category.as_str(), last.severity.as_str(), last.message.as_str()),
        ("solver_path", "info", "Sparse Cholesky solver (200 free DOFs)")
    );
}

/// The same prepared structure solved for a second load set 10⁴ times
/// larger: the factorization is reused, the result still matches the
/// reference, and the residual stays relative (≤ 1e-12 although ‖f‖ ~ 1e6).
#[test]
fn prepared_2d_paths_reuse_the_factor_for_a_second_load_set() {
    let m = mixed(4);
    let mut big = m.clone();
    for l in big.loads.iter_mut() {
        for k in ["fx", "fz", "my"] {
            let v = l["data"][k].as_f64().unwrap();
            l["data"][k] = json!(v * 1e4);
        }
    }
    let rf = reference_2d(&m);
    let rf_big = reference_2d(&big);
    let big_loads = big.input().loads;
    for p in [Path2::Default, Path2::DenseRef, Path2::Pcg("ics")] {
        let mm = match p {
            Path2::Pcg(pc) => with_opts(&m, json!({ "method": "pcg", "preconditioner": pc, "tolerance": 1e-12 })),
            _ => m.clone(),
        };
        let i = mm.input();
        let prepared = match p {
            Path2::DenseRef => prepare_static_2d_dense_reference(&i).unwrap(),
            _ => prepare_static_2d(&i).unwrap(),
        };
        let (path, head, tol, res) = match p {
            Path2::Pcg(_) => ("pcg_ics", C::PcgSolve, 1e-7, 1e-11),
            _ => ("sparse_cholesky", C::SparseCholesky, 1e-9, 1e-12),
        };
        let r1 = prepared.solve_loads(&i.loads).unwrap();
        check_2d(&format!("{p:?} case 1"), &r1, &mm, &rf, path, &[], &[head], tol, res);
        let r2 = prepared.solve_loads(&big_loads).unwrap();
        check_2d(&format!("{p:?} case 2"), &r2, &big, &rf_big, path, &[], &[head], tol, res);
    }
}

/// A diagonally dominant truss chain: strict IC(0), MIC and shifted IC all
/// factor it, so each preconditioner is the one reported.
#[test]
fn truss_chain_runs_pcg_with_ic0_mic_and_ics() {
    let m = truss_chain();
    let rf = reference_2d(&m);
    // the gates flag every truss-only node
    let pre = vec![C::InstabilityRisk; 66];
    for pc in ["ic0", "mic", "ics"] {
        let r = solve_path_2d(&m, Path2::Pcg(pc)).unwrap();
        check_2d(pc, &r, &m, &rf, &format!("pcg_{pc}"), &pre, &[C::PcgSolve], 1e-8, 1e-11);
    }
    let r = solve_path_2d(&m, Path2::Default).unwrap();
    check_2d("direct", &r, &m, &rf, "sparse_cholesky", &pre, &[C::SparseCholesky], 1e-9, 1e-12);
}

/// Below 64 free DOFs the same frame takes the dense Cholesky path.
#[test]
fn small_frame_takes_the_dense_path() {
    let m = mixed(1);
    let rf = reference_2d(&m);
    assert!(expect_2d(&m, &rf).nf < 64);
    for p in [Path2::Default, Path2::DenseRef] {
        let r = solve_path_2d(&m, p).unwrap();
        check_2d(&format!("{p:?}"), &r, &m, &rf, "dense_lu", &[], &[C::DenseLu], 1e-9, 1e-12);
    }
}

/// Solver options choose the path: omitted, "direct" and "auto" below
/// 1000 free DOFs stay on sparse Cholesky; "auto" from 1000 free DOFs and
/// "pcg" at any size take PCG. Both give the same answer.
#[test]
fn solver_options_dispatch_2d() {
    let small = mixed(4);
    let rf = reference_2d(&small);
    for o in [json!({ "method": "auto" }), json!({ "method": "direct" })] {
        let mm = with_opts(&small, o.clone());
        let r = solve_2d(&mm.input()).unwrap();
        check_2d(&o.to_string(), &r, &mm, &rf, "sparse_cholesky", &[], &[C::SparseCholesky], 1e-9, 1e-12);
    }
    let big = mixed(20);
    let nf = DofNumbering::build_2d(&big.input()).n_free;
    assert!(nf >= 1000, "nf {nf}");
    let direct = solve_2d(&big.input()).unwrap();
    assert_eq!(path_2d(&direct), "sparse_cholesky");
    let d2 = solve_2d(&with_opts(&big, json!({ "method": "direct" })).input()).unwrap();
    assert_eq!(path_2d(&d2), "sparse_cholesky");
    // "auto" at nf ≥ 1000 goes down the PCG branch (here PCG does not reach
    // 1e-12 and the branch's direct fallback answers).
    let auto = solve_2d(&with_opts(&big, json!({ "method": "auto", "tolerance": 1e-12 })).input()).unwrap();
    assert_eq!(path_2d(&auto), "pcg_fallback_sparse_cholesky");
    let umax = direct.displacements.iter().fold(0.0f64, |a, d| a.max(d.ux.abs()).max(d.uz.abs()));
    for (a, b) in direct.displacements.iter().zip(&auto.displacements) {
        assert_eq!(a.node_id, b.node_id);
        assert!((a.ux - b.ux).abs() < 1e-7 * umax && (a.uz - b.uz).abs() < 1e-7 * umax);
    }
}

/// Indefinite, non-singular K_ff (the connector gadget): sparse Cholesky
/// fails and every path solves by dense LU, reporting it; the zero diagonals
/// are named. The gadget is decoupled, so the frame matches the reference
/// and u_Q = 10/k, u_P = −4/k with spring reactions −k·u.
#[test]
fn indefinite_stiffness_falls_back_to_dense_lu_on_every_2d_path() {
    for seg in [4, 1] {
        let mut m = mixed(seg);
        let (p, q) = add_gadget(&mut m, 1e6);
        let rf = reference_2d(&m);
        // closed form for the gadget (independent of the reference solve)
        assert!(close(rf.disp[&q][0], 1e-5, 1e-9) && close(rf.disp[&p][0], -4e-6, 1e-9));
        assert!(close(rf.reac[&q][0], -10.0, 1e-9) && close(rf.reac[&p][0], 4.0, 1e-9));
        let lu = [C::StiffnessNotPositiveDefinite, C::DenseLu, C::CholeskyFailedLuFallback];
        let paths: Vec<(Path2, &[C])> = if seg == 4 {
            vec![
                (Path2::Default, &lu[..]),
                (Path2::DenseRef, &lu[..]),
                (Path2::Pcg("ics"), &[C::StiffnessNotPositiveDefinite, C::PcgFallbackDirect, C::CholeskyFailedLuFallback][..]),
                (Path2::Pcg("jacobi"), &[C::StiffnessNotPositiveDefinite, C::PcgFallbackDirect, C::CholeskyFailedLuFallback][..]),
            ]
        } else {
            vec![(Path2::Default, &lu[..])]
        };
        for (path, head) in paths {
            let label = format!("seg {seg} {path:?}");
            let r = solve_path_2d(&m, path).unwrap();
            check_2d(&label, &r, &m, &rf, "dense_lu", &[], head, 1e-9, 1e-12);
            let why = match (seg, path) {
                (4, Path2::Default) | (4, Path2::Pcg(_)) => "sparse Cholesky failed; solved by dense LU",
                _ => "Cholesky failed; solved by dense LU",
            };
            assert!(not_pd_message(&r).contains(&format!("({why})")), "{label}: {}", not_pd_message(&r));
            if let Path2::Pcg(_) = path {
                // PCG is never tried on a matrix unshifted Cholesky cannot verify
                assert_eq!(r.solver_diagnostics.len(), 1, "{label}: {:?}", r.solver_diagnostics);
                let d = &r.solver_diagnostics[0];
                assert_eq!((d.category.as_str(), d.severity.as_str()), ("fallback", "warning"));
                assert_eq!(d.message, "Unshifted Cholesky could not verify structural stability; using the direct solver chain instead of PCG");
            }
        }
    }
}

/// A spring-held free node of stiffness 1e-2 sets the diagonal ratio above
/// 1e8 (HighDiagonalRatio, value = max/min diagonal of the reference) on
/// every path; its moment gives a rotation (my/k = 1e5) far above 1000× the
/// characteristic length while every translation is small, so only
/// translations count as excessive displacement.
#[test]
fn high_diagonal_ratio_and_rotation_only_node_on_every_2d_path() {
    for (seg, gadget) in [(4, false), (4, true), (1, false), (1, true)] {
        let mut m = mixed(seg);
        let f = add_floating(&mut m, 1e-2, 1e3);
        if gadget {
            add_gadget(&mut m, 1e6);
        }
        let rf = reference_2d(&m);
        assert!(close(rf.disp[&f][2], 1e5, 1e-9));
        let ex = expect_2d(&m, &rf);
        assert!(ex.ratio > 1e8 && ex.ratio < 1e12 && ex.max_translation < 1000.0 * ex.char_length);
        let lu = [C::StiffnessNotPositiveDefinite, C::DenseLu, C::CholeskyFailedLuFallback];
        let pcg_lu = [C::StiffnessNotPositiveDefinite, C::PcgFallbackDirect, C::CholeskyFailedLuFallback];
        let runs: Vec<(Path2, &str, &[C])> = match (seg, gadget) {
            (4, false) => vec![
                (Path2::Default, "sparse_cholesky", &[C::SparseCholesky][..]),
                (Path2::DenseRef, "sparse_cholesky", &[C::SparseCholesky][..]),
                (Path2::Pcg("ics"), "pcg_ics", &[C::PcgSolve][..]),
                (Path2::PcgMaxit1, "pcg_fallback_sparse_cholesky", &[C::PcgFallbackDirect, C::SparseCholesky][..]),
            ],
            (4, true) => vec![
                (Path2::Default, "dense_lu", &lu[..]),
                (Path2::DenseRef, "dense_lu", &lu[..]),
                (Path2::Pcg("ics"), "dense_lu", &pcg_lu[..]),
            ],
            (_, false) => vec![(Path2::Default, "dense_lu", &[C::DenseLu][..])],
            (_, true) => vec![(Path2::Default, "dense_lu", &lu[..])],
        };
        for (p, path, head) in runs {
            let r = solve_path_2d(&m, p).unwrap();
            let tol = if matches!(p, Path2::Pcg(_)) { 1e-7 } else { 1e-9 };
            let res = if matches!(p, Path2::Pcg(_)) { 1e-11 } else { 1e-12 };
            check_2d(&format!("seg {seg} gadget {gadget} {p:?}"), &r, &m, &rf, path, &[C::DisconnectedNode], head, tol, res);
        }
    }
}

/// A very soft frame (E = 1e-3 MPa): translations far above 1000× the
/// characteristic length (the diagonal of the bounding box) are reported with
/// the exact maximum and threshold, on every path.
#[test]
fn excessive_displacement_on_every_2d_path() {
    for (seg, gadget) in [(4, false), (4, true), (1, false), (1, true)] {
        let mut m = mixed(seg);
        m.e = Some(1e-3);
        if gadget {
            add_gadget(&mut m, 1.0);
        }
        let rf = reference_2d(&m);
        let ex = expect_2d(&m, &rf);
        assert!(ex.max_translation > 1000.0 * ex.char_length);
        let lu = [C::StiffnessNotPositiveDefinite, C::DenseLu, C::CholeskyFailedLuFallback];
        let pcg_lu = [C::StiffnessNotPositiveDefinite, C::PcgFallbackDirect, C::CholeskyFailedLuFallback];
        let runs: Vec<(Path2, &str, &[C])> = match (seg, gadget) {
            (4, false) => vec![
                (Path2::Default, "sparse_cholesky", &[C::SparseCholesky][..]),
                (Path2::DenseRef, "sparse_cholesky", &[C::SparseCholesky][..]),
                (Path2::Pcg("ics"), "pcg_ics", &[C::PcgSolve][..]),
                (Path2::PcgMaxit1, "pcg_fallback_sparse_cholesky", &[C::PcgFallbackDirect, C::SparseCholesky][..]),
            ],
            (4, true) => vec![
                (Path2::Default, "dense_lu", &lu[..]),
                (Path2::DenseRef, "dense_lu", &lu[..]),
                (Path2::Pcg("ics"), "dense_lu", &pcg_lu[..]),
            ],
            (_, false) => vec![(Path2::Default, "dense_lu", &[C::DenseLu][..])],
            (_, true) => vec![(Path2::Default, "dense_lu", &lu[..])],
        };
        for (p, path, head) in runs {
            let r = solve_path_2d(&m, p).unwrap();
            let tol = if matches!(p, Path2::Pcg(_)) { 1e-7 } else { 1e-9 };
            check_2d(&format!("soft seg {seg} gadget {gadget} {p:?}"), &r, &m, &rf, path, &[], head, tol, 1e-10);
        }
    }
}

/// Runs of the frame on each path family: large sparse (seg 4) through
/// default, dense-reference, PCG and PCG-fallback; small dense (seg 1); and,
/// with the gadget, the dense-LU fallbacks.
fn all_2d_variants(base: impl Fn(usize) -> M2) -> Vec<(String, M2, Path2)> {
    let mut v = Vec::new();
    for p in [Path2::Default, Path2::DenseRef, Path2::Pcg("ics"), Path2::PcgMaxit1] {
        v.push((format!("large {p:?}"), base(4), p));
    }
    v.push(("small Default".into(), base(1), Path2::Default));
    for p in [Path2::Default, Path2::DenseRef, Path2::Pcg("ics")] {
        let mut m = base(4);
        add_gadget(&mut m, 1e6);
        v.push((format!("gadget {p:?}"), m, p));
    }
    let mut m = base(1);
    add_gadget(&mut m, 1e6);
    v.push(("small gadget Default".into(), m, Path2::Default));
    v
}

/// Loads so large that the displacements are finite but K·u overflows: the
/// residual is NaN and every path reports ResidualHigh (and keeps the
/// solution, legacy 2D semantics). Loads that overflow the displacements
/// themselves are refused as a mechanism by every path, after a successful
/// prepare.
#[test]
fn overflowing_loads_on_every_2d_path() {
    let scaled = |seg: usize, e: f64, fz: f64| {
        let mut m = mixed(seg);
        m.e = Some(e);
        for l in m.loads.iter_mut() {
            l["data"]["fz"] = json!(fz);
        }
        m
    };
    for (label, m, p) in all_2d_variants(|seg| scaled(seg, E_MPA, -3e304)) {
        let r = solve_path_2d(&m, p).unwrap_or_else(|e| panic!("{label}: {e}"));
        let nf = r.solver_run_meta.as_ref().unwrap().n_free_dofs;
        let d = r.structured_diagnostics.iter().rev().find(|d| !d.phase.as_deref().unwrap_or("").starts_with("self_check:")).unwrap();
        assert_eq!((d.code, d.severity, d.phase.as_deref()), (C::ResidualHigh, Severity::Warning, Some("solve")), "{label}");
        assert!(d.value.unwrap().is_nan(), "{label}: {:?}", d.value);
        assert_eq!(d.threshold, Some(1e-6), "{label}");
        assert_eq!(d.message, format!("Residual NaN exceeds tolerance ({nf} free DOFs)"), "{label}");
        assert!(!r.equilibrium.as_ref().unwrap().residual_ok, "{label}");
        assert!(r.displacements.iter().all(|x| x.ux.is_finite() && x.uz.is_finite()), "{label}");
        diag(&r.structured_diagnostics, C::ExcessiveDisplacement);
    }
    for (label, m, p) in all_2d_variants(|seg| scaled(seg, 1e-3, -1e306)) {
        let i = m.input();
        assert!(prepare_static_2d(&i).is_ok(), "{label}: prepare");
        assert_eq!(solve_path_2d(&m, p).err().as_deref(), Some(SINGULAR), "{label}");
    }
}

/// A floor joint with every member end hinged gets artificial rotational
/// stiffness 1e-10·max diag: the frame still solves (the diagonal ratio is
/// exactly 1e10) and balances its loads, and a nodal moment at that joint,
/// which nothing can carry, is refused before the solve, on every path.
#[test]
fn all_hinged_joint_on_every_2d_path() {
    let hinged = |seg: usize, my: f64| {
        let mut m = mixed(seg);
        for l in m.loads.iter_mut() {
            l["data"]["my"] = json!(0.0);
        }
        let j = 2; // column line 0, first floor
        for e in m.elems.iter_mut() {
            if e.2 == j {
                e.4 = true;
            }
            if e.3 == j {
                e.5 = true;
            }
        }
        m.load(j, 0.0, 0.0, my);
        m
    };
    for (label, m, p) in all_2d_variants(|seg| hinged(seg, 0.0)) {
        let r = solve_path_2d(&m, p).unwrap_or_else(|e| panic!("{label}: {e}"));
        let hd = diag(&r.structured_diagnostics, C::HighDiagonalRatio);
        assert!(close(hd.value.unwrap(), 1e10, 1e-9), "{label}: {:?}", hd.value);
        // global force equilibrium from the reported reactions (springs and
        // the inclined roller included)
        let input = m.input();
        let (mut fx, mut fz) = (0.0, 0.0);
        for l in &input.loads {
            if let SolverLoad::Nodal(n) = l {
                fx += n.fx;
                fz += n.fz;
            }
        }
        let rx: f64 = r.reactions.iter().map(|x| x.rx).sum();
        let rz: f64 = r.reactions.iter().map(|x| x.rz).sum();
        assert!((rx + fx).abs() < 1e-6 * fz.abs() && (rz + fz).abs() < 1e-6 * fz.abs(), "{label}: ΣR = ({rx}, {rz}), ΣF = ({fx}, {fz})");
    }
    for my in [1e-3, 1.0] {
        for (label, m, p) in all_2d_variants(|seg| hinged(seg, my)) {
            let e = solve_path_2d(&m, p).err().unwrap_or_else(|| panic!("{label}: solved"));
            assert!(e.contains("Nodal moment at node 2 is not supported"), "{label}: {e}");
        }
    }
}

/// Straight beam of `n` frame elements (0.5 m each, from x = 1) on rollerX
/// supports at both ends: a horizontal rigid-body mechanism.
fn rolling_beam(n: usize) -> M2 {
    let mut m = M2::default();
    let mut prev = m.node(1.0, 0.0);
    for k in 1..=n {
        let nn = m.node(1.0 + 0.5 * k as f64, 0.0);
        m.elem("frame", prev, nn);
        prev = nn;
    }
    m.sup(1, "rollerX", json!({}));
    m.sup(prev, "rollerX", json!({}));
    m.load(3, 0.0, -1.0, 0.0);
    m
}

/// A genuine mechanism is refused on every path: at prepare by the direct
/// paths (Cholesky and LU both fail), at solve by PCG (whose stability check
/// is lazy).
#[test]
fn mechanism_is_refused_on_every_2d_path() {
    let large = rolling_beam(40);
    for p in [Path2::Default, Path2::DenseRef] {
        let i = large.input();
        let prep = if matches!(p, Path2::DenseRef) { prepare_static_2d_dense_reference(&i) } else { prepare_static_2d(&i) };
        assert_eq!(prep.err().as_deref(), Some(SINGULAR), "{p:?}");
    }
    for p in [Path2::Pcg("ics"), Path2::PcgMaxit1] {
        let mm = match p {
            Path2::Pcg(pc) => with_opts(&large, json!({ "method": "pcg", "preconditioner": pc })),
            _ => with_opts(&large, json!({ "method": "pcg", "maxIterations": 1 })),
        };
        let i = mm.input();
        let prepared = prepare_static_2d(&i).unwrap();
        assert_eq!(prepared.solve_loads(&i.loads).err().as_deref(), Some(SINGULAR), "{p:?}");
    }
    assert_eq!(solve_2d(&rolling_beam(10).input()).err().as_deref(), Some(SINGULAR), "small");
}

/// Every DOF restrained (nf = 0): reactions are K·u_r − F, with a settlement
/// and rotation imposed (closed form 12EIδ/L³, 6EIδ/L² through the
/// reference) and without (reactions = −F).
#[test]
fn fully_restrained_2d() {
    for settle in [true, false] {
        let mut m = M2::default();
        let a = m.node(1.0, 1.0);
        let b = m.node(4.0, 1.0);
        let c = m.node(4.0, 3.0);
        m.elem("frame", a, b);
        m.elem("frame", b, c);
        m.sup(a, "fixed", json!({}));
        m.sup(b, "fixed", if settle { json!({ "dz": -0.01, "dry": 0.002 }) } else { json!({}) });
        m.sup(c, "fixed", if settle { json!({ "dx": 0.003 }) } else { json!({}) });
        m.load(b, 3.0, -7.0, 2.0);
        m.load(c, -1.0, 0.0, 0.0);
        let rf = reference_2d(&m);
        if settle {
            let ei = E_MPA * 1000.0 * IZ;
            // member a–b (L = 3): end shear 12EIδ/L³ − 6EIθ/L², δ = −0.01, θ = 0.002
            let (l, d, t): (f64, f64, f64) = (3.0, -0.01, 0.002);
            let (v1, v2) = (12.0 * ei * d / l.powi(3), 6.0 * ei * t / l.powi(2));
            let got = rf.reac[&a][1].abs();
            assert!(close(got, (v1 + v2).abs(), 1e-9) || close(got, (v1 - v2).abs(), 1e-9), "{got} vs 12EIδ/L³ ± 6EIθ/L²");
        } else {
            for (got, want) in rf.reac[&b].iter().zip([-3.0, 7.0, -2.0]) {
                assert!(close(*got, want, 1e-12));
            }
        }
        for p in [Path2::Default, Path2::DenseRef] {
            let r = solve_path_2d(&m, p).unwrap();
            assert_eq!(path_2d(&r), "fully_restrained");
            assert_matches_reference_2d(&r, &rf, 1e-9, &format!("settle {settle} {p:?}"));
            let d = r.structured_diagnostics.iter().rev().find(|d| !d.phase.as_deref().unwrap_or("").starts_with("self_check:")).unwrap();
            assert_eq!((d.code, d.message.as_str()), (C::ResidualOk, "Fully restrained model (0 free DOFs, 9 restrained)"));
        }
    }
}

// ==================== 3D model builder ====================

const IY3: f64 = 1e-4;
const IZ3: f64 = 6e-5;
const J3: f64 = 3e-5;

#[derive(Clone, Default)]
struct M3 {
    nodes: Vec<(usize, f64, f64, f64)>,
    elems: Vec<(usize, usize, usize)>,
    sups: Vec<Value>,
    loads: Vec<Value>,
    connectors: Vec<Value>,
    e: Option<f64>,
    opts: Option<Value>,
}

impl M3 {
    fn node(&mut self, x: f64, y: f64, z: f64) -> usize {
        let id = self.nodes.len() + 1;
        self.nodes.push((id, x, y, z));
        id
    }
    fn elem(&mut self, i: usize, j: usize) {
        let id = self.elems.len() + 1;
        self.elems.push((id, i, j));
    }
    /// Member a–b split into `seg` frame elements.
    fn member(&mut self, a: usize, b: usize, seg: usize) {
        let (_, xa, ya, za) = self.nodes[a - 1];
        let (_, xb, yb, zb) = self.nodes[b - 1];
        let mut prev = a;
        for k in 1..seg {
            let t = k as f64 / seg as f64;
            let n = self.node(xa + t * (xb - xa), ya + t * (yb - ya), za + t * (zb - za));
            self.elem(prev, n);
            prev = n;
        }
        self.elem(prev, b);
    }
    /// Support with restraint flags [rx, ry, rz, rrx, rry, rrz] and extra fields.
    fn sup(&mut self, node: usize, r: [bool; 6], extra: Value) {
        let mut s = json!({ "nodeId": node, "rx": r[0], "ry": r[1], "rz": r[2], "rrx": r[3], "rry": r[4], "rrz": r[5] });
        for (k, v) in extra.as_object().unwrap() {
            s[k] = v.clone();
        }
        self.sups.push(s);
    }
    fn load(&mut self, node: usize, f: [f64; 6]) {
        self.loads.push(json!({ "type": "nodal", "data": { "nodeId": node, "fx": f[0], "fy": f[1], "fz": f[2], "mx": f[3], "my": f[4], "mz": f[5] } }));
    }
    fn input(&self) -> SolverInput3D {
        let e = self.e.unwrap_or(E_MPA);
        let nodes: serde_json::Map<String, Value> = self
            .nodes
            .iter()
            .map(|&(id, x, y, z)| (id.to_string(), json!({ "id": id, "x": x, "y": y, "z": z })))
            .collect();
        let elems: serde_json::Map<String, Value> = self
            .elems
            .iter()
            .map(|&(id, i, j)| (id.to_string(), json!({ "id": id, "type": "frame", "nodeI": i, "nodeJ": j, "materialId": 1, "sectionId": 1 })))
            .collect();
        let sups: serde_json::Map<String, Value> =
            self.sups.iter().enumerate().map(|(k, s)| ((k + 1).to_string(), s.clone())).collect();
        let conns: serde_json::Map<String, Value> =
            self.connectors.iter().map(|c| (c["id"].to_string(), c.clone())).collect();
        let mut v = json!({
            "nodes": nodes,
            "materials": { "1": { "id": 1, "e": e, "nu": 0.3 } },
            "sections": { "1": { "id": 1, "a": A, "iy": IY3, "iz": IZ3, "j": J3 } },
            "elements": elems,
            "supports": sups,
            "loads": self.loads,
            "connectors": conns,
        });
        if let Some(o) = &self.opts {
            v["solverOptions"] = o.clone();
        }
        serde_json::from_value(v).unwrap()
    }
}

/// One-storey space frame on a 4 × 3 plan, offset from the origin: four
/// columns, four top beams and a diagonal brace, each in `seg` elements.
/// Corner nodes are 1–8 (bases 1–4) whatever `seg` is, so `seg = 1` (48
/// DOFs, the dense path) is the exact nodal reference for `seg ≥ 2` (sparse):
/// prismatic Euler-Bernoulli members under nodal loads are nodally exact.
/// Bases: fixed with a settlement, pinned, six springs, and an inclined
/// roller (normal (0.3, 0.4, 0.866)).
fn frame3(seg: usize) -> M3 {
    let mut m = M3::default();
    let plan = [(2.0, 1.0), (6.0, 1.0), (6.0, 4.0), (2.0, 4.0)];
    for &(x, y) in &plan {
        m.node(x, y, 0.5);
    }
    for &(x, y) in &plan {
        m.node(x, y, 3.5);
    }
    for c in 0..4 {
        m.member(c + 1, c + 5, seg);
    }
    for c in 0..4 {
        m.member(c + 5, (c + 1) % 4 + 5, seg);
    }
    m.member(1, 7, seg);
    m.sup(1, [true; 6], json!({ "dz": -0.003 }));
    m.sup(2, [true, true, true, false, false, false], json!({}));
    m.sup(3, [false; 6], json!({ "kx": 5e4, "ky": 6e4, "kz": 7e4, "krx": 3e3, "kry": 2e3, "krz": 4e3 }));
    m.sup(4, [false, false, false, true, true, true], json!({ "isInclined": true, "normalX": 0.3, "normalY": 0.4, "normalZ": 0.866 }));
    m.load(5, [20.0, 5.0, -60.0, 1.0, 0.0, 2.0]);
    m.load(6, [10.0, -8.0, -80.0, 0.0, -3.0, 0.0]);
    m.load(7, [0.0, 12.0, -70.0, 0.0, 0.0, -1.5]);
    m.load(8, [15.0, 0.0, -50.0, 2.5, 0.0, 0.0]);
    m
}

fn path_3d(r: &AnalysisResults3D) -> &str {
    &r.solver_run_meta.as_ref().unwrap().solver_path
}

#[allow(dead_code)]
fn show3(label: &str, r: Result<AnalysisResults3D, String>) {
    match r {
        Ok(r) => {
            println!("== {label}: path {} nf {}", path_3d(&r), r.solver_run_meta.as_ref().unwrap().n_free_dofs);
            for d in &r.structured_diagnostics {
                println!("   {:?} {:?} {} {:?} {:?} {:?} {:?}", d.code, d.severity, d.message, d.phase, d.value, d.threshold, d.dof_indices);
            }
            for d in &r.solver_diagnostics {
                println!("   [legacy] {} {} {}", d.category, d.severity, d.message);
            }
            if let Some(t) = &r.timings {
                println!("   timings nnz_kff {} nnz_l {} pert {} maxp {} pcg {:?} {:?}", t.nnz_kff, t.nnz_l, t.pivot_perturbations, t.max_perturbation, t.pcg_iterations, t.pcg_final_residual);
            }
        }
        Err(e) => println!("== {label}: ERR {e}"),
    }
}

#[allow(dead_code)]
fn run_all3(label: &str, m: &M3) {
    show3(&format!("{label}/default"), solve_3d(&m.input()));
    for o in [json!({ "method": "pcg" }), json!({ "method": "pcg", "preconditioner": "ic0" }), json!({ "method": "pcg", "preconditioner": "jacobi" }), json!({ "method": "pcg", "maxIterations": 1 })] {
        let mut mm = m.clone();
        mm.opts = Some(o.clone());
        show3(&format!("{label}/{o}"), solve_3d(&mm.input()));
    }
}

/// Small indefinite gadget for the 3D shift ladder: free node A on springs
/// c in every DOF but x, tied along x to a fixed node by an axial connector
/// of stiffness −ε·c (A.x diagonal −ε·c; c dominates max diag). A is loaded
/// by fy = 50 only (u_A.y = 50/c, u_A.x = 0). Returns A.
fn add_shift_gadget(m: &mut M3, eps: f64, c: f64) -> usize {
    let a = m.node(4.0, 2.0, 2.0);
    let f = m.node(5.0, 2.0, 2.0);
    m.sup(a, [false; 6], json!({ "ky": c, "kz": c, "krx": c, "kry": c, "krz": c }));
    m.sup(f, [true; 6], json!({}));
    let id = m.connectors.len() + 1;
    m.connectors.push(json!({ "id": id, "nodeI": a, "nodeJ": f, "kAxial": -eps * c }));
    m.load(a, [0.0, 50.0, 0.0, 0.0, 0.0, 0.0]);
    a
}

/// 3D twin of the 2D gadget: free P, Q on springs (kx = k, others 1e5)
/// joined by an axial connector −k along x: x block [[0, k], [k, 0]], whose
/// −k eigenvalue no shift up to 10·max diag can lift when k ≫ max diag.
/// fx = 10 on P, −4 on Q: u_Q = 10/k, u_P = −4/k. Returns (P, Q).
fn add_gadget3(m: &mut M3, k: f64) -> (usize, usize) {
    let p = m.node(3.0, 2.0, 2.0);
    let q = m.node(4.0, 2.0, 2.0);
    for n in [p, q] {
        m.sup(n, [false; 6], json!({ "kx": k, "ky": 1e5, "kz": 1e5, "krx": 1e5, "kry": 1e5, "krz": 1e5 }));
    }
    let id = m.connectors.len() + 1;
    m.connectors.push(json!({ "id": id, "nodeI": p, "nodeJ": q, "kAxial": -k }));
    m.load(p, [10.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    m.load(q, [-4.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    (p, q)
}

/// Id of the node `add_floating3` added (the node at (3, 3, 1)).
fn floating_id(m: &M3) -> usize {
    m.nodes.iter().find(|n| (n.1, n.2, n.3) == (3.0, 3.0, 1.0)).unwrap().0
}

/// Free node on translational springs `kt` and rotational springs `kr`,
/// loaded by a moment mx (rotation mx/kr, no translation). Returns it.
fn add_floating3(m: &mut M3, kt: f64, kr: f64, mx: f64) -> usize {
    let n = m.node(3.0, 3.0, 1.0);
    m.sup(n, [false; 6], json!({ "kx": kt, "ky": kt, "kz": kt, "krx": kr, "kry": kr, "krz": kr }));
    m.load(n, [0.0, 0.0, 0.0, mx, 0.0, 0.0]);
    n
}


// ==================== 3D path runner and checks ====================

#[derive(Clone, Copy, Debug)]
enum Path3 {
    Default,
    Pcg(&'static str),
    PcgMaxit1,
}

fn with_opts3(m: &M3, o: Value) -> M3 {
    let mut mm = m.clone();
    mm.opts = Some(o);
    mm
}

fn solve_path_3d(m: &M3, p: Path3) -> Result<AnalysisResults3D, String> {
    match p {
        Path3::Default => solve_3d(&m.input()),
        Path3::Pcg(pc) => solve_3d(&with_opts3(m, json!({ "method": "pcg", "preconditioner": pc, "tolerance": 1e-12 })).input()),
        Path3::PcgMaxit1 => solve_3d(&with_opts3(m, json!({ "method": "pcg", "maxIterations": 1 })).input()),
    }
}

/// Global equilibrium of the reported reactions (springs, inclined supports
/// and connector anchors included) with the nodal loads: forces and moments
/// about the origin.
fn assert_equilibrium_3d(r: &AnalysisResults3D, m: &M3, rel: f64, label: &str) {
    let pos: std::collections::HashMap<usize, [f64; 3]> = m.nodes.iter().map(|&(id, x, y, z)| (id, [x, y, z])).collect();
    let mut sum = [0.0f64; 6];
    let mut scale = 0.0f64;
    let add = |p: [f64; 3], f: [f64; 6], sum: &mut [f64; 6]| {
        for k in 0..3 {
            sum[k] += f[k];
        }
        sum[3] += p[1] * f[2] - p[2] * f[1] + f[3];
        sum[4] += p[2] * f[0] - p[0] * f[2] + f[4];
        sum[5] += p[0] * f[1] - p[1] * f[0] + f[5];
    };
    for l in &m.loads {
        let d = &l["data"];
        let f = ["fx", "fy", "fz", "mx", "my", "mz"].map(|k| d[k].as_f64().unwrap());
        scale = f.iter().fold(scale, |a, b| a.max(b.abs()));
        add(pos[&(d["nodeId"].as_u64().unwrap() as usize)], f, &mut sum);
    }
    for x in &r.reactions {
        add(pos[&x.node_id], [x.fx, x.fy, x.fz, x.mx, x.my, x.mz], &mut sum);
    }
    for (k, v) in sum.iter().enumerate() {
        assert!(v.abs() <= rel * scale, "{label}: equilibrium component {k} = {v:e}");
    }
}

/// Corner displacements (nodes 1–8) and base reactions against the coarse
/// dense solve of the same frame.
fn assert_matches_coarse(r: &AnalysisResults3D, coarse: &AnalysisResults3D, tol: f64, label: &str) {
    let d6 = |d: &Displacement3D| [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
    let r6 = |x: &Reaction3D| [x.fx, x.fy, x.fz, x.mx, x.my, x.mz];
    let su = coarse.displacements.iter().filter(|d| d.node_id <= 8).flat_map(|d| d6(d)[..3].to_vec()).fold(0.0f64, |a, b| a.max(b.abs()));
    let sr = coarse.displacements.iter().filter(|d| d.node_id <= 8).flat_map(|d| d6(d)[3..].to_vec()).fold(0.0f64, |a, b| a.max(b.abs()));
    for c in coarse.displacements.iter().filter(|d| d.node_id <= 8) {
        let f = r.displacements.iter().find(|d| d.node_id == c.node_id).unwrap();
        for k in 0..6 {
            let s = if k < 3 { su } else { sr };
            assert!((d6(f)[k] - d6(c)[k]).abs() <= tol * s, "{label}: node {} dof {k}: {:e} vs coarse {:e}", c.node_id, d6(f)[k], d6(c)[k]);
        }
    }
    let sf = coarse.reactions.iter().filter(|x| x.node_id <= 4).flat_map(|x| r6(x).to_vec()).fold(0.0f64, |a, b| a.max(b.abs()));
    for c in coarse.reactions.iter().filter(|x| x.node_id <= 4) {
        let f = r.reactions.iter().find(|x| x.node_id == c.node_id).unwrap();
        for k in 0..6 {
            assert!((r6(f)[k] - r6(c)[k]).abs() <= tol * sf, "{label}: reaction {} comp {k}: {:e} vs coarse {:e}", c.node_id, r6(f)[k], r6(c)[k]);
        }
    }
}

/// Exact diagnostics of a 3D result: `want` lists the codes after the
/// pre-solve gate ones, in order. Each is checked for its message, severity,
/// value and threshold; `shift` is the expected regularization shift,
/// `near_zero` the expected near-zero DOFs, `res_max` bounds the residual.
fn check_3d(label: &str, r: &AnalysisResults3D, m: &M3, path: &str, want: &[C], shift: f64, near_zero: &[usize], res_max: f64) {
    let input = m.input();
    let dn = DofNumbering::build_3d(&input);
    let nf = dn.n_free;
    let meta = r.solver_run_meta.as_ref().unwrap();
    assert_eq!(meta.solver_path, path, "{label}: path");
    assert_eq!(meta.n_free_dofs, nf, "{label}");
    // a regularized solve keeps the residual refinement left (≤ 1e-6)
    let refined = want.contains(&C::DiagonalRegularization) && !want.contains(&C::SparseFallbackDenseLu);
    assert_equilibrium_3d(r, m, if refined { 1e-3 } else { 1e-9 }, label);
    let tail: Vec<&StructuredDiagnostic> = solver_diagnostics_with_self_checks(&r.structured_diagnostics).into_iter().filter(|d| d.phase.as_deref() != Some("pre_solve")).collect();
    assert_eq!(tail.iter().map(|d| d.code).collect::<Vec<_>>(), want, "{label}: {:#?}", tail);
    let dense = path == "dense_lu";
    let pcg_ok = path.starts_with("pcg_") && path != "pcg_fallback_sparse_cholesky";
    let lu_prepared = want.contains(&C::CholeskyFailedLuFallback) && !dense;
    let res_label = if dense {
        "Dense solver"
    } else if pcg_ok {
        "PCG"
    } else if want.contains(&C::SparseFallbackDenseLu) {
        "Dense LU fallback"
    } else {
        "Sparse Cholesky"
    };
    // expected maximum free translation (inclined supports excluded)
    // (an inclined support's free DOFs are tangential components in its own
    // frame: bounded by the tangential displacement magnitude)
    let incl: Vec<usize> = m.sups.iter().filter(|s| s["isInclined"] == true).map(|s| s["nodeId"].as_u64().unwrap() as usize).collect();
    let mut umax = 0.0f64;
    let mut umax_incl = 0.0f64;
    for (&(node, local), &g) in &dn.map {
        if g < nf && local < 3 {
            let d = r.displacements.iter().find(|d| d.node_id == node).unwrap();
            if let Some(s) = incl.contains(&node).then(|| m.sups.iter().find(|s| s["nodeId"] == node).unwrap()) {
                let nv = ["normalX", "normalY", "normalZ"].map(|k| s[k].as_f64().unwrap());
                let nl = (nv[0] * nv[0] + nv[1] * nv[1] + nv[2] * nv[2]).sqrt();
                let un = (d.ux * nv[0] + d.uy * nv[1] + d.uz * nv[2]) / nl;
                let t = [d.ux - un * nv[0] / nl, d.uy - un * nv[1] / nl, d.uz - un * nv[2] / nl];
                umax_incl = umax_incl.max((t[0] * t[0] + t[1] * t[1] + t[2] * t[2]).sqrt());
            } else {
                umax = umax.max([d.ux, d.uy, d.uz][local].abs());
            }
        }
    }
    let (mut lo, mut hi) = ([f64::MAX; 3], [f64::MIN; 3]);
    for &(_, x, y, z) in &m.nodes {
        for (k, v) in [x, y, z].into_iter().enumerate() {
            lo[k] = lo[k].min(v);
            hi[k] = hi[k].max(v);
        }
    }
    let cl = ((hi[0] - lo[0]).powi(2) + (hi[1] - lo[1]).powi(2) + (hi[2] - lo[2]).powi(2)).sqrt().max(1.0);
    let lu_msg = "Cholesky factorization failed — LU fallback succeeded but model may be unstable (not positive-definite)";
    let t = r.timings.as_ref();
    if let Some(t) = t {
        assert_eq!(t.n_free, nf, "{label}");
        assert!(t.total_ms >= t.assembly_ms + t.conditioning_ms + t.symbolic_ms + t.numeric_ms, "{label}: timings {t:?}");
        let regularized = want.contains(&C::DiagonalRegularization);
        assert_eq!(t.pivot_perturbations, if regularized { nf } else { 0 }, "{label}");
        assert_eq!(t.max_perturbation, if regularized { shift } else { 0.0 }, "{label}");
        assert_eq!(t.pcg_iterations.is_some(), pcg_ok, "{label}");
    } else {
        assert!(dense, "{label}: sparse paths report timings");
    }
    for (k, d) in tail.iter().enumerate() {
        let ph = d.phase.as_deref();
        let sev = (d.severity, ph);
        match d.code {
            C::StiffnessNotPositiveDefinite => assert_eq!(sev, (Severity::Warning, Some("factorization")), "{label}"),
            C::DenseLu => {
                assert_eq!(d.message, format!("Dense solver ({nf} free DOFs)"), "{label}");
                assert_eq!(sev, (Severity::Info, Some("solve")), "{label}");
            }
            C::SparseCholesky => {
                assert_eq!(d.message, format!("Sparse Cholesky solver ({nf} free DOFs, nnz(L)={})", t.unwrap().nnz_l), "{label}");
                assert_eq!(sev, (Severity::Info, Some("solve")), "{label}");
            }
            C::SparseFallbackDenseLu => {
                let why = if lu_prepared { "failed" } else { "residual too large" };
                assert_eq!(d.message, format!("Sparse Cholesky {why}, fell back to dense LU ({nf} free DOFs)"), "{label}");
                assert_eq!(sev, (Severity::Warning, Some("solve")), "{label}");
            }
            C::CholeskyFailedLuFallback => {
                assert_eq!(d.message, lu_msg, "{label}");
                assert_eq!(sev, (Severity::Warning, Some("solve")), "{label}");
            }
            C::PcgFallbackDirect => {
                assert_eq!(d.message, format!("PCG failed verification, fell back to direct solver ({nf} free DOFs)"), "{label}");
                assert_eq!(sev, (Severity::Warning, Some("solve")), "{label}");
            }
            C::PcgSolve => {
                let pc = path.strip_prefix("pcg_").unwrap();
                let its: usize = d
                    .message
                    .strip_prefix(&format!("PCG solver ({pc} preconditioner, "))
                    .and_then(|x| x.strip_suffix(&format!(" iterations, {nf} free DOFs)")))
                    .unwrap_or_else(|| panic!("{label}: {}", d.message))
                    .parse()
                    .unwrap();
                assert_eq!(t.unwrap().pcg_iterations, Some(its), "{label}");
                let legacy = r.solver_diagnostics.last().unwrap();
                assert_eq!((legacy.message.as_str(), legacy.severity.as_str()), (d.message.as_str(), "info"), "{label}");
                assert_eq!(sev, (Severity::Info, Some("solve")), "{label}");
            }
            C::SparseFillRatio => {
                let t = t.unwrap();
                let fr = t.nnz_l as f64 / t.nnz_kff as f64;
                assert_eq!((d.value, d.threshold), (Some(fr), Some(20.0)), "{label}");
                assert_eq!(d.message, format!("Sparse fill ratio: {:.1}x (nnz(K_ff)={}, nnz(L)={})", fr, t.nnz_kff, t.nnz_l), "{label}");
                let s = if fr > 20.0 { Severity::Warning } else { Severity::Info };
                assert_eq!(sev, (s, Some("factorization")), "{label}");
            }
            C::DiagonalRegularization => {
                assert_eq!((d.value, d.threshold), (Some(shift), Some(0.0)), "{label}");
                assert_eq!(d.message, format!("Regularized K_ff with diagonal shift {:.2e}", shift), "{label}");
                assert_eq!(sev, (Severity::Info, Some("factorization")), "{label}");
            }
            C::HighDiagonalRatio | C::ExtremelyHighDiagonalRatio => {
                let v = d.value.unwrap();
                let (name, thr, suffix) = if d.code == C::HighDiagonalRatio {
                    ("High diagonal ratio", 1e8, " — potential conditioning issues")
                } else {
                    ("Extremely high diagonal ratio", 1e12, " — matrix is likely ill-conditioned")
                };
                assert!(v > thr && (d.code == C::ExtremelyHighDiagonalRatio || v <= 1e12), "{label}: ratio {v:e}");
                assert_eq!(d.threshold, Some(thr), "{label}");
                let sfx = if dense || lu_prepared { "" } else { suffix };
                assert_eq!(d.message, format!("{name} {v:.2e}{sfx}"), "{label}");
                assert_eq!(sev, (Severity::Warning, Some("conditioning")), "{label}");
            }
            C::NearZeroDiagonal => {
                assert_eq!(d.dof_indices, near_zero, "{label}");
                assert_eq!(d.message, format!("{} near-zero diagonal entries", near_zero.len()), "{label}");
                assert_eq!(sev, (Severity::Warning, Some("conditioning")), "{label}");
            }
            C::ExcessiveDisplacement => {
                let v = d.value.unwrap();
                assert!(close(v, umax, 1e-12) || (v > umax && v <= umax_incl * (1.0 + 1e-12)), "{label}: max displacement {v:e}, expected {umax:e} (inclined ≤ {umax_incl:e})");
                assert!(close(d.threshold.unwrap(), 1000.0 * cl, 1e-12), "{label}: threshold {:?}", d.threshold);
                assert_eq!(
                    d.message,
                    format!("Maximum displacement {v:.2e} exceeds 1000× characteristic length {cl:.2e} — likely mechanism or instability"),
                    "{label}"
                );
                assert_eq!(sev, (Severity::Warning, Some("solve")), "{label}");
            }
            C::ResidualOk => {
                assert_eq!(k, tail.len() - 1, "{label}: residual comes last");
                let v = d.value.unwrap();
                assert!(v > 0.0 && v <= res_max, "{label}: residual {v:e} (max {res_max:e})");
                assert_eq!(d.threshold, Some(1e-6), "{label}");
                let msg = if dense { format!("Dense solver residual {v:.2e} ({nf} free DOFs)") } else { format!("{res_label} ({nf} free DOFs, residual {v:.2e})") };
                assert_eq!(d.message, msg, "{label}");
                assert_eq!(sev, (Severity::Info, Some("solve")), "{label}");
                assert_eq!(r.equilibrium.as_ref().unwrap().relative_residual, v, "{label}");
                if pcg_ok {
                    assert_eq!(t.unwrap().pcg_final_residual, Some(v), "{label}");
                }
            }
            other => panic!("{label}: unexpected {other:?}"),
        }
    }
    // uniqueness of the excessive-displacement decision
    if umax_incl <= 1000.0 * cl {
        assert_eq!(want.contains(&C::ExcessiveDisplacement), umax > 1000.0 * cl, "{label}: max translation {umax:e}");
    }
}

fn not_pd_message3(r: &AnalysisResults3D) -> &str {
    let v: Vec<_> = r.structured_diagnostics.iter().filter(|d| d.code == C::StiffnessNotPositiveDefinite).collect();
    assert_eq!(v.len(), 1);
    &v[0].message
}

fn legacy3(r: &AnalysisResults3D) -> Vec<(String, String, String)> {
    r.solver_diagnostics.iter().map(|d| (d.category.clone(), d.severity.clone(), d.message.clone())).collect()
}

fn lg(c: &str, s: &str, m: &str) -> (String, String, String) {
    (c.to_string(), s.to_string(), m.to_string())
}

// ==================== 3D tests ====================

/// Sparse Cholesky, PCG with each preconditioner and the PCG fallback on the
/// space frame (every support kind, a settlement, a brace), against the
/// coarse dense solve (itself checked by equilibrium and the dense path's
/// diagnostics).
#[test]
fn spd_space_frame_every_3d_path_matches_coarse_reference() {
    let coarse_m = frame3(1);
    let coarse = solve_3d(&coarse_m.input()).unwrap();
    check_3d("coarse", &coarse, &coarse_m, "dense_lu", &[C::DenseLu, C::ResidualOk], 0.0, &[], 1e-13);
    assert_eq!(legacy3(&coarse), vec![lg("solver_path", "info", "Dense solver (35 free DOFs)")]);
    let m = frame3(3);
    let sc = [C::SparseCholesky, C::SparseFillRatio, C::ResidualOk];
    let pcg = [C::PcgSolve, C::ResidualOk];
    for (p, path, want, tol, res) in [
        (Path3::Default, "sparse_cholesky", &sc[..], 1e-9, 1e-13),
        (Path3::Pcg("ics"), "pcg_ics", &pcg[..], 1e-7, 1e-11),
        (Path3::Pcg("ic0"), "pcg_ic0", &pcg[..], 1e-7, 1e-11),
        // MIC does not factor this pattern and degrades to Jacobi
        (Path3::Pcg("mic"), "pcg_jacobi", &pcg[..], 1e-7, 1e-11),
        (Path3::Pcg("ssor"), "pcg_ssor", &pcg[..], 1e-7, 1e-11),
        (Path3::Pcg("jacobi"), "pcg_jacobi", &pcg[..], 1e-7, 1e-11),
        (Path3::Pcg("none"), "pcg_none", &pcg[..], 1e-7, 1e-11),
        (Path3::PcgMaxit1, "pcg_fallback_sparse_cholesky", &[C::PcgFallbackDirect, C::SparseCholesky, C::SparseFillRatio, C::ResidualOk][..], 1e-9, 1e-13),
    ] {
        let label = format!("{p:?}");
        let r = solve_path_3d(&m, p).unwrap();
        check_3d(&label, &r, &m, path, want, 0.0, &[], res);
        assert_matches_coarse(&r, &coarse, tol, &label);
    }
    let r = solve_path_3d(&m, Path3::Default).unwrap();
    assert_eq!(legacy3(&r), vec![lg("solver_path", "info", "Sparse Cholesky solver (143 free DOFs)")]);
    let r = solve_path_3d(&m, Path3::PcgMaxit1).unwrap();
    let l = legacy3(&r);
    assert_eq!(l.last().unwrap(), &lg("solver_path", "info", "Sparse Cholesky solver (143 free DOFs)"));
    assert_eq!((l[l.len() - 2].0.as_str(), l[l.len() - 2].1.as_str()), ("fallback", "warning"));
}

/// Closed form on the sparse and PCG paths: a 20-element cantilever along x
/// with a tip load and torque deflects PL³/3EI about each axis and twists
/// TL/GJ (exact for Euler-Bernoulli elements).
#[test]
fn cantilever_closed_form_3d() {
    let mut m = M3::default();
    let n = 20;
    let len = 5.0;
    let mut prev = m.node(1.0, 1.0, 1.0);
    for k in 1..=n {
        let nn = m.node(1.0 + len * k as f64 / n as f64, 1.0, 1.0);
        m.elem(prev, nn);
        prev = nn;
    }
    m.sup(1, [true; 6], json!({}));
    let (py, pz, t) = (3.0, -5.0, 2.0);
    m.load(prev, [0.0, py, pz, t, 0.0, 0.0]);
    let e = E_MPA * 1000.0;
    let g = e / 2.6;
    for p in [Path3::Default, Path3::Pcg("ics"), Path3::PcgMaxit1] {
        let r = solve_path_3d(&m, p).unwrap();
        let d = r.displacements.iter().find(|d| d.node_id == prev).unwrap();
        let tol = if matches!(p, Path3::Pcg(_)) { 1e-7 } else { 1e-10 };
        assert!(close(d.uy, py * len.powi(3) / (3.0 * e * IZ3), tol), "{p:?}: uy {}", d.uy);
        assert!(close(d.uz, pz * len.powi(3) / (3.0 * e * IY3), tol), "{p:?}: uz {}", d.uz);
        assert!(close(d.rx, t * len / (g * J3), tol), "{p:?}: rx {}", d.rx);
        let rr = &r.reactions[0];
        assert!(close(rr.fy, -py, 1e-9) && close(rr.fz, -pz, 1e-9) && close(rr.mx, -t, 1e-9), "{p:?}: {rr:?}");
    }
}

/// The same prepared 3D structure solved for a second load set 10⁴ times
/// larger reuses its factor (sparse) or its cached stability check (PCG).
#[test]
fn prepared_3d_paths_reuse_the_factor_for_a_second_load_set() {
    let scale = |m: &M3, f: f64| {
        let mut b = m.clone();
        for l in b.loads.iter_mut() {
            for k in ["fx", "fy", "fz", "mx", "my", "mz"] {
                let v = l["data"][k].as_f64().unwrap();
                l["data"][k] = json!(v * f);
            }
        }
        b
    };
    let coarse = solve_3d(&frame3(1).input()).unwrap();
    let coarse_big = solve_3d(&scale(&frame3(1), 1e4).input()).unwrap();
    for (o, path, want, tol, res) in [
        (None, "sparse_cholesky", vec![C::SparseCholesky, C::SparseFillRatio, C::ResidualOk], 1e-9, 1e-13),
        (Some(json!({ "method": "pcg", "tolerance": 1e-12 })), "pcg_ics", vec![C::PcgSolve, C::ResidualOk], 1e-7, 1e-11),
    ] {
        let mut m = frame3(3);
        m.opts = o;
        let big = scale(&m, 1e4);
        let i = m.input();
        let prepared = prepare_static_3d(&i).unwrap();
        let r1 = prepared.solve_loads(&i.loads).unwrap();
        check_3d("case 1", &r1, &m, path, &want, 0.0, &[], res);
        assert_matches_coarse(&r1, &coarse, tol, "case 1");
        let r2 = prepared.solve_loads(&big.input().loads).unwrap();
        check_3d("case 2", &r2, &big, path, &want, 0.0, &[], res);
        assert_matches_coarse(&r2, &coarse_big, tol, "case 2");
    }
}

/// Options choose the 3D path: "auto" and "direct" stay direct below 1000
/// free DOFs; "auto" from 1000 takes the PCG branch.
#[test]
fn solver_options_dispatch_3d() {
    let m = frame3(3);
    for o in [json!({ "method": "auto" }), json!({ "method": "direct" })] {
        let r = solve_3d(&with_opts3(&m, o.clone()).input()).unwrap();
        assert_eq!(path_3d(&r), "sparse_cholesky", "{o}");
    }
    let big = frame3(30);
    let nf = DofNumbering::build_3d(&big.input()).n_free;
    assert!(nf >= 1000, "nf {nf}");
    let direct = solve_3d(&with_opts3(&big, json!({ "method": "direct" })).input()).unwrap();
    assert_eq!(path_3d(&direct), "sparse_cholesky");
    let auto = solve_3d(&with_opts3(&big, json!({ "method": "auto" })).input()).unwrap();
    assert!(path_3d(&auto).starts_with("pcg_"), "{}", path_3d(&auto));
    let umax = direct.displacements.iter().fold(0.0f64, |a, d| a.max(d.ux.abs()).max(d.uy.abs()).max(d.uz.abs()));
    for (a, b) in direct.displacements.iter().zip(&auto.displacements) {
        assert_eq!(a.node_id, b.node_id);
        for (x, y) in [(a.ux, b.ux), (a.uy, b.uy), (a.uz, b.uz)] {
            assert!((x - y).abs() < 1e-5 * umax, "{x} vs {y}");
        }
    }
}

/// A small negative stiffness (−0.5e-6·c, c the largest diagonal) breaks
/// unshifted Cholesky; the first shift of the ladder, 1e-6·c, factors K_ff
/// and iterative refinement recovers the unshifted solution. Sparse path and
/// PCG (whose stability check refuses a shifted factor) both report the
/// shift; the coarse dense path solves by LU. The gadget is unloaded along
/// x and decoupled: u_A = (0, 50/c, 0).
#[test]
fn diagonal_shift_regularization_3d() {
    let c = 1e8;
    let mut cm = frame3(1);
    add_shift_gadget(&mut cm, 0.5e-6, c);
    let coarse = solve_3d(&cm.input()).unwrap();
    check_3d("coarse", &coarse, &cm, "dense_lu", &[C::StiffnessNotPositiveDefinite, C::DenseLu, C::CholeskyFailedLuFallback, C::ResidualOk], 0.0, &[], 1e-13);
    assert!(not_pd_message3(&coarse).contains("(Cholesky failed; solved by dense LU)"));
    let mut m = frame3(3);
    let a = add_shift_gadget(&mut m, 0.5e-6, c);
    let shift = 1e-6 * c;
    let reg = format!("Regularized K_ff with diagonal shift {shift:.2e} (drilling DOF stabilization)");
    for (p, path, want) in [
        (Path3::Default, "sparse_cholesky", vec![C::StiffnessNotPositiveDefinite, C::SparseCholesky, C::SparseFillRatio, C::DiagonalRegularization, C::ResidualOk]),
        (Path3::Pcg("ics"), "pcg_fallback_sparse_cholesky", vec![C::StiffnessNotPositiveDefinite, C::PcgFallbackDirect, C::SparseCholesky, C::SparseFillRatio, C::DiagonalRegularization, C::ResidualOk]),
    ] {
        let label = format!("{p:?}");
        let r = solve_path_3d(&m, p).unwrap();
        check_3d(&label, &r, &m, path, &want, shift, &[], 1e-6);
        let balance = r.structured_diagnostics.iter().find(|d| d.phase.as_deref() == Some("self_check:static_balance")).unwrap();
        assert_eq!(balance.severity, Severity::Warning);
        assert!(balance.value.unwrap() >= balance.threshold.unwrap());
        assert!(not_pd_message3(&r).contains(&format!("(Cholesky needed a diagonal shift of {shift:.2e})")), "{label}");
        // Refinement stops at the 1e-6 residual check, which on this
        // conditioning still leaves ~3e-4 relative error in the rotations.
        assert_matches_coarse(&r, &coarse, 1e-3, &label);
        let d = r.displacements.iter().find(|d| d.node_id == a).unwrap();
        assert!(d.ux.abs() < 1e-9 && close(d.uy, 50.0 / c, 1e-3), "{label}: {d:?}");
        let mut l = legacy3(&r);
        if matches!(p, Path3::Pcg(_)) {
            assert_eq!(l.remove(0), lg("fallback", "warning", "Unshifted Cholesky could not verify structural stability; using the direct solver chain instead of PCG"));
        }
        assert_eq!(l, vec![lg("solver_path", "info", &reg), lg("solver_path", "info", "Sparse Cholesky solver (149 free DOFs)")], "{label}");
    }
}

/// A larger negative stiffness (−0.5e-2·c) walks the ladder to the shift
/// 1e-2·c, too large for refinement to undo: the residual check rejects the
/// shifted solution and the dense LU of the unshifted K_ff answers, exactly.
#[test]
fn shift_ladder_then_residual_fallback_to_dense_lu_3d() {
    let c = 1e8;
    let mut cm = frame3(1);
    add_shift_gadget(&mut cm, 0.5e-2, c);
    let coarse = solve_3d(&cm.input()).unwrap();
    let mut m = frame3(3);
    let a = add_shift_gadget(&mut m, 0.5e-2, c);
    let shift = 1e-2 * c;
    for (p, want) in [
        (Path3::Default, vec![C::StiffnessNotPositiveDefinite, C::SparseFallbackDenseLu, C::SparseFillRatio, C::DiagonalRegularization, C::ResidualOk]),
        (Path3::Pcg("ics"), vec![C::StiffnessNotPositiveDefinite, C::PcgFallbackDirect, C::SparseFallbackDenseLu, C::DiagonalRegularization, C::ResidualOk]),
    ] {
        let label = format!("{p:?}");
        let r = solve_path_3d(&m, p).unwrap();
        check_3d(&label, &r, &m, "sparse_fallback_dense_lu", &want, shift, &[], 1e-12);
        assert!(not_pd_message3(&r).contains(&format!("(Cholesky needed a diagonal shift of {shift:.2e})")), "{label}");
        assert_matches_coarse(&r, &coarse, 1e-9, &label);
        let d = r.displacements.iter().find(|d| d.node_id == a).unwrap();
        assert!(d.ux.abs() < 1e-12 && close(d.uy, 50.0 / c, 1e-9), "{label}: {d:?}");
        let l = legacy3(&r);
        let n = l.len();
        assert_eq!(l[n - 2], lg("solver_path", "info", &format!("Regularized K_ff with diagonal shift {shift:.2e} (drilling DOF stabilization)")), "{label}");
        assert_eq!((l[n - 1].0.as_str(), l[n - 1].1.as_str()), ("fallback", "warning"), "{label}");
        let rejected: f64 = l[n - 1]
            .2
            .strip_prefix("Sparse Cholesky residual too large (")
            .and_then(|x| x.strip_suffix("), fell back to dense LU"))
            .unwrap()
            .parse()
            .unwrap();
        assert!(rejected >= 1e-6, "{label}: rejected residual {rejected}");
    }
}

/// An eigenvalue −k far below −10·max diag: every shift of the ladder fails.
/// The sparse path solves by dense LU at prepare, PCG by its lazy dense LU;
/// the coarse dense path by LU, naming the two zero diagonals. u_Q = 10/k,
/// u_P = −4/k, spring reactions −k·u.
#[test]
fn every_shift_fails_dense_lu_3d() {
    let k = 1e12;
    let mut cm = frame3(1);
    let (cp, cq) = add_gadget3(&mut cm, k);
    let coarse = solve_3d(&cm.input()).unwrap();
    let cdn = DofNumbering::build_3d(&cm.input());
    let nz = vec![cdn.map[&(cp, 0)], cdn.map[&(cq, 0)]];
    check_3d(
        "coarse",
        &coarse,
        &cm,
        "dense_lu",
        &[C::StiffnessNotPositiveDefinite, C::DenseLu, C::CholeskyFailedLuFallback, C::NearZeroDiagonal, C::ResidualOk],
        0.0,
        &nz,
        1e-13,
    );
    let mut m = frame3(3);
    let (p, q) = add_gadget3(&mut m, k);
    for (pp, want) in [
        (Path3::Default, vec![C::StiffnessNotPositiveDefinite, C::SparseFallbackDenseLu, C::CholeskyFailedLuFallback, C::ResidualOk]),
        (Path3::Pcg("ics"), vec![C::StiffnessNotPositiveDefinite, C::PcgFallbackDirect, C::SparseFallbackDenseLu, C::ResidualOk]),
    ] {
        let label = format!("{pp:?}");
        let r = solve_path_3d(&m, pp).unwrap();
        check_3d(&label, &r, &m, "sparse_fallback_dense_lu", &want, 0.0, &[], 1e-12);
        assert!(not_pd_message3(&r).contains("(sparse Cholesky failed even with a diagonal shift; solved by dense LU)"), "{label}");
        assert_matches_coarse(&r, &coarse, 1e-9, &label);
        let u = |n: usize| r.displacements.iter().find(|d| d.node_id == n).unwrap().ux;
        assert!(close(u(q), 10.0 / k, 1e-6) && close(u(p), -4.0 / k, 1e-6), "{label}");
        let rx = |n: usize| r.reactions.iter().find(|x| x.node_id == n).unwrap().fx;
        assert!(close(rx(q), -10.0, 1e-6) && close(rx(p), 4.0, 1e-6), "{label}");
        let l = legacy3(&r);
        assert!(l.contains(&lg("fallback", "warning", "Sparse Cholesky failed even with regularization, fell back to dense LU")), "{label}: {l:?}");
    }
}

/// One run of a 3D variant: model, path option, expected solver path, the
/// path's own leading codes, how the remaining codes are ordered, and the
/// regularization shift it reports (0 if none).
struct Run3 {
    label: String,
    m: M3,
    p: Path3,
    path: &'static str,
    head: Vec<C>,
    kind: Kind3,
    shift: f64,
    near_zero: Vec<usize>,
}

#[derive(Clone, Copy, PartialEq)]
enum Kind3 {
    /// dense path: head, excessive, conditioning, near-zero, residual
    Dense,
    /// sparse / PCG with a factorization: head, fill, conditioning, shift, excessive, residual
    Factored,
    /// PCG converged or a PCG-side dense LU: head, conditioning, shift, excessive, residual
    NoFill,
    /// prepare-time dense LU: head, excessive, conditioning, residual
    PreparedLu,
}

/// The frame (modified by `f`) on every 3D path family: dense (coarse),
/// sparse, PCG, PCG fallback, the shift ladder with refinement (G1 small),
/// the ladder with the residual fallback (G1 large), every shift failing
/// (G2) on the sparse and PCG paths, and G2 on the dense path.
fn variants3(f: impl Fn(&mut M3), pcg_path: &'static str, with_shifted: bool) -> Vec<Run3> {
    let c = 1e8;
    let mut v = Vec::new();
    let base = |seg: usize| {
        let mut m = frame3(seg);
        f(&mut m);
        m
    };
    let run = |label: &str, m: M3, p: Path3, path: &'static str, head: Vec<C>, kind: Kind3, shift: f64| Run3 {
        label: label.to_string(),
        m,
        p,
        path,
        head,
        kind,
        shift,
        near_zero: vec![],
    };
    use C::*;
    v.push(run("coarse", base(1), Path3::Default, "dense_lu", vec![DenseLu], Kind3::Dense, 0.0));
    v.push(run("sparse", base(3), Path3::Default, "sparse_cholesky", vec![SparseCholesky], Kind3::Factored, 0.0));
    if pcg_path == "pcg_fallback_sparse_cholesky" {
        v.push(run("pcg", base(3), Path3::Pcg("ics"), pcg_path, vec![PcgFallbackDirect, SparseCholesky], Kind3::Factored, 0.0));
    } else {
        v.push(run("pcg", base(3), Path3::Pcg("ics"), pcg_path, vec![PcgSolve], Kind3::NoFill, 0.0));
    }
    v.push(run("pcg maxit 1", base(3), Path3::PcgMaxit1, "pcg_fallback_sparse_cholesky", vec![PcgFallbackDirect, SparseCholesky], Kind3::Factored, 0.0));
    let g1 = |eps: f64| {
        let mut m = base(3);
        add_shift_gadget(&mut m, eps, c);
        m
    };
    if with_shifted {
    v.push(run("shifted", g1(0.5e-6), Path3::Default, "sparse_cholesky", vec![StiffnessNotPositiveDefinite, SparseCholesky], Kind3::Factored, 1e-6 * c));
    v.push(run(
        "shifted pcg",
        g1(0.5e-6),
        Path3::Pcg("ics"),
        "pcg_fallback_sparse_cholesky",
        vec![StiffnessNotPositiveDefinite, PcgFallbackDirect, SparseCholesky],
        Kind3::Factored,
        1e-6 * c,
    ));
    }
    v.push(run("ladder", g1(0.5e-2), Path3::Default, "sparse_fallback_dense_lu", vec![StiffnessNotPositiveDefinite, SparseFallbackDenseLu], Kind3::Factored, 1e-2 * c));
    v.push(run(
        "ladder pcg",
        g1(0.5e-2),
        Path3::Pcg("ics"),
        "sparse_fallback_dense_lu",
        vec![StiffnessNotPositiveDefinite, PcgFallbackDirect, SparseFallbackDenseLu],
        Kind3::NoFill,
        1e-2 * c,
    ));
    let g2 = |seg: usize| {
        let mut m = base(seg);
        add_gadget3(&mut m, 1e12);
        m
    };
    v.push(run(
        "all shifts fail",
        g2(3),
        Path3::Default,
        "sparse_fallback_dense_lu",
        vec![StiffnessNotPositiveDefinite, SparseFallbackDenseLu, CholeskyFailedLuFallback],
        Kind3::PreparedLu,
        0.0,
    ));
    v.push(run(
        "all shifts fail pcg",
        g2(3),
        Path3::Pcg("ics"),
        "sparse_fallback_dense_lu",
        vec![StiffnessNotPositiveDefinite, PcgFallbackDirect, SparseFallbackDenseLu],
        Kind3::NoFill,
        0.0,
    ));
    let cm = g2(1);
    if 6 * cm.nodes.len() >= 64 {
        return v; // no longer on the dense path
    }
    let dn = DofNumbering::build_3d(&cm.input());
    let (pn, qn) = (cm.nodes.len() - 1, cm.nodes.len());
    let mut r = run("coarse gadget", cm, Path3::Default, "dense_lu", vec![StiffnessNotPositiveDefinite, DenseLu, CholeskyFailedLuFallback], Kind3::Dense, 0.0);
    r.near_zero = vec![dn.map[&(pn, 0)], dn.map[&(qn, 0)]];
    v.push(r);
    v
}

fn want3(run: &Run3, cond: Option<C>, excessive: bool) -> Vec<C> {
    let mut w = run.head.clone();
    let reg = run.shift > 0.0;
    match run.kind {
        Kind3::Dense => {
            w.extend(excessive.then_some(C::ExcessiveDisplacement));
            w.extend(cond);
            if !run.near_zero.is_empty() {
                w.push(C::NearZeroDiagonal);
            }
        }
        Kind3::Factored | Kind3::NoFill => {
            if run.kind == Kind3::Factored {
                w.push(C::SparseFillRatio);
            }
            w.extend(cond);
            w.extend(reg.then_some(C::DiagonalRegularization));
            w.extend(excessive.then_some(C::ExcessiveDisplacement));
        }
        Kind3::PreparedLu => {
            w.extend(excessive.then_some(C::ExcessiveDisplacement));
            w.extend(cond);
        }
    }
    w.push(C::ResidualOk);
    w
}

/// A free node on springs sets the minimum diagonal: translational springs
/// 1e-3 give a ratio in (1e8, 1e12] (HighDiagonalRatio), 1e-7 above 1e12
/// (ExtremelyHighDiagonalRatio); max diag / ratio is the spring on every
/// path. Its moment turns it by 1e6 rad (far above 1000× the characteristic
/// length) while no translation is large: only translations are excessive.
#[test]
fn diagonal_ratio_and_rotation_only_node_on_every_3d_path() {
    for (kt, cond, pcg_path) in [(1e-3, C::HighDiagonalRatio, "pcg_ics"), (1e-7, C::ExtremelyHighDiagonalRatio, "pcg_ics")] {
        // (a soft spring node defeats refinement: no "shifted" variants)
        for mut run in variants3(|m| { add_floating3(m, kt, 1e-3, 1e3); }, pcg_path, false) {
            let label = format!("kt {kt:e} {}", run.label);
            let r = solve_path_3d(&run.m, run.p).unwrap_or_else(|e| panic!("{label}: {e}"));
            let mut cond = cond;
            if run.kind == Kind3::Dense && kt < 1e-6 {
                // the dense check counts a diagonal ≤ 1e-12·max as near-zero
                // (so its ratio never exceeds 1e12): the three springs are
                // named and the rotational springs set the ratio
                let n = floating_id(&run.m);
                let dn = DofNumbering::build_3d(&run.m.input());
                run.near_zero = (0..3).map(|k| dn.map[&(n, k)]).collect();
                run.near_zero.sort();
                cond = C::HighDiagonalRatio;
            }
            check_3d(&label, &r, &run.m, run.path, &want3(&run, Some(cond), false), run.shift, &run.near_zero, 1e-9);
            let v = r.structured_diagnostics.iter().find(|d| d.code == cond).unwrap().value.unwrap();
            // ratio = max diagonal / spring: 2EA/l = 4e6 on the fine frame
            // (1 m column segments), c = 1e8 with the ladder gadget
            let want_max = match run.label.as_str() {
                "coarse" => None,
                "ladder" | "ladder pcg" => Some(1e8),
                _ => Some(2.0 * E_MPA * 1000.0 * A / 1.0),
            };
            if let (Some(w), false) = (want_max, run.kind == Kind3::Dense) {
                assert!(close(v * kt, w, 1e-9), "{label}: ratio {v:e}");
            }
            let rx = r.displacements.iter().find(|d| d.node_id == floating_id(&run.m)).unwrap().rx;
            assert!(close(rx, 1e6, 1e-6), "{label}: floating rotation {rx}");
        }
    }
}

/// A very soft frame (E = 1e-3 MPa) on every 3D path: translations far
/// above 1000× the characteristic length (bounding-box diagonal), reported
/// with the exact maximum and threshold; the soft members also push the
/// diagonal ratio above 1e8.
#[test]
fn excessive_displacement_on_every_3d_path() {
    // (the ladder gadget's springs of 1e8 against these soft members make the
    // ratio 5e11: equilibrium of its LU answer is only good to ~5%, so those
    // runs are in the conditioning test instead)
    for run in variants3(|m| m.e = Some(1e-3), "pcg_ics", false).into_iter().filter(|r| !r.label.starts_with("ladder")) {
        let r = solve_path_3d(&run.m, run.p).unwrap_or_else(|e| panic!("{}: {e}", run.label));
        check_3d(&run.label, &r, &run.m, run.path, &want3(&run, Some(C::HighDiagonalRatio), true), run.shift, &run.near_zero, 1e-11);
    }
}

/// Loads so large that K·u overflows: the 3D sparse paths reject the NaN
/// residual and fall back to dense LU, whose residual is NaN too — reported
/// as ResidualHigh; loads that overflow u itself are refused as a mechanism
/// (after a successful prepare) on every path.
#[test]
fn overflowing_loads_on_every_3d_path() {
    let huge = |f: f64, e: f64| {
        move |m: &mut M3| {
            m.e = Some(e);
            for l in m.loads.iter_mut() {
                l["data"]["fz"] = json!(-f);
            }
        }
    };
    for run in variants3(huge(1e305, E_MPA), "pcg_ics", true) {
        let label = &run.label;
        let r = solve_path_3d(&run.m, run.p).unwrap_or_else(|e| panic!("{label}: {e}"));
        let nf = r.solver_run_meta.as_ref().unwrap().n_free_dofs;
        let dense = run.kind == Kind3::Dense;
        assert_eq!(path_3d(&r), if dense { "dense_lu" } else { "sparse_fallback_dense_lu" }, "{label}");
        let d = r.structured_diagnostics.iter().rev().find(|d| !d.phase.as_deref().unwrap_or("").starts_with("self_check:")).unwrap();
        assert_eq!((d.code, d.severity, d.phase.as_deref()), (C::ResidualHigh, Severity::Warning, Some("solve")), "{label}");
        assert!(d.value.unwrap().is_nan(), "{label}");
        assert_eq!(d.threshold, Some(1e-6), "{label}");
        let msg = if dense { format!("Dense solver residual NaN exceeds tolerance ({nf} free DOFs)") } else { "Dense LU fallback residual NaN exceeds tolerance".to_string() };
        assert_eq!(d.message, msg, "{label}");
        assert!(!r.equilibrium.as_ref().unwrap().residual_ok, "{label}");
        assert!(r.displacements.iter().all(|x| x.ux.is_finite() && x.uz.is_finite()), "{label}");
        if !dense && run.kind != Kind3::PreparedLu && !run.label.contains("all shifts") {
            let l = legacy3(&r);
            assert!(l.contains(&lg("fallback", "warning", "Sparse Cholesky residual too large (NaN), fell back to dense LU")), "{label}: {l:?}");
        }
    }
    for run in variants3(huge(1e306, 1e-3), "pcg_ics", true) {
        assert!(prepare_static_3d(&run.m.input()).is_ok(), "{}: prepare", run.label);
        assert_eq!(solve_path_3d(&run.m, run.p).err().as_deref(), Some(SINGULAR), "{}", run.label);
    }
}

/// A beam along x restrained in translation only at both ends: free to spin
/// about its axis. The shift ladder factors the singular K_ff (and warns);
/// a load that does not excite the spin is solved (midspan deflection
/// PL³/48EI), a torque that does is refused as a mechanism once the dense LU
/// of the unshifted K_ff fails. The small dense path refuses at prepare.
#[test]
fn spinning_beam_mechanism_3d() {
    let beam = |n: usize, torque: f64| {
        let mut m = M3::default();
        let len = 5.0;
        let mut prev = m.node(1.0, 1.0, 1.0);
        for k in 1..=n {
            let nn = m.node(1.0 + len * k as f64 / n as f64, 1.0, 1.0);
            m.elem(prev, nn);
            prev = nn;
        }
        m.sup(1, [true, true, true, false, false, false], json!({}));
        m.sup(prev, [true, true, true, false, false, false], json!({}));
        m.load(n / 2 + 1, [0.0, 4.0, 0.0, torque, 0.0, 0.0]);
        m
    };
    let m = beam(20, 0.0);
    for p in [Path3::Default, Path3::Pcg("ics")] {
        let r = solve_path_3d(&m, p).unwrap();
        let tail: Vec<C> = solver_diagnostics_with_self_checks(&r.structured_diagnostics).into_iter().filter(|d| d.phase.as_deref() != Some("pre_solve")).map(|d| d.code).collect();
        assert!(tail.contains(&C::StiffnessNotPositiveDefinite) && tail.contains(&C::DiagonalRegularization), "{p:?}: {tail:?}");
        let uy = r.displacements.iter().find(|d| d.node_id == 11).unwrap().uy;
        let want = 4.0 * 5.0f64.powi(3) / (48.0 * E_MPA * 1000.0 * IZ3);
        assert!(close(uy, want, 1e-6), "{p:?}: uy {uy}, PL³/48EI {want}");
    }
    let m = beam(20, 1.0);
    for p in [Path3::Default, Path3::Pcg("ics"), Path3::PcgMaxit1] {
        assert!(prepare_static_3d(&with_opts3(&m, json!({ "method": "pcg" })).input()).is_ok());
        assert_eq!(solve_path_3d(&m, p).err().as_deref(), Some(SINGULAR), "{p:?}");
    }
    assert_eq!(solve_3d(&beam(2, 1.0).input()).err().as_deref(), Some(SINGULAR), "small");
}

/// Every DOF restrained (nf = 0): reactions K·u_r − F (equal and opposite
/// end forces for an imposed settlement) or −F.
#[test]
fn fully_restrained_3d() {
    for settle in [true, false] {
        let mut m = M3::default();
        let a = m.node(1.0, 1.0, 1.0);
        let b = m.node(4.0, 1.0, 1.0);
        m.elem(a, b);
        m.sup(a, [true; 6], json!({}));
        m.sup(b, [true; 6], if settle { json!({ "dz": -0.01 }) } else { json!({}) });
        m.load(b, [3.0, -7.0, 2.0, 0.5, 0.0, 0.0]);
        let r = solve_3d(&m.input()).unwrap();
        assert_eq!(path_3d(&r), "fully_restrained");
        assert_equilibrium_3d(&r, &m, 1e-9, "fully restrained");
        let rb = r.reactions.iter().find(|x| x.node_id == b).unwrap();
        if settle {
            let ei = E_MPA * 1000.0 * IY3;
            let v = 12.0 * ei * 0.01 / 27.0;
            assert!(close(rb.fz.abs(), v + if rb.fz > 0.0 { 2.0 } else { -2.0 }, 1e-9) || close((rb.fz + 2.0).abs(), v, 1e-9), "fz {}", rb.fz);
        } else {
            assert!(close(rb.fx, -3.0, 1e-12) && close(rb.fy, 7.0, 1e-12) && close(rb.fz, -2.0, 1e-12) && close(rb.mx, -0.5, 1e-12));
        }
        let d = r.structured_diagnostics.iter().rev().find(|d| !d.phase.as_deref().unwrap_or("").starts_with("self_check:")).unwrap();
        assert_eq!((d.code, d.message.as_str()), (C::ResidualOk, "Fully restrained model (0 free DOFs, 12 restrained)"));
    }
}

/// Cubic lattice of frame members, `k` nodes per edge, fixed at the base.
fn lattice3(k: usize) -> M3 {
    let mut m = M3::default();
    let id = |i: usize, j: usize, l: usize| 1 + i + k * (j + k * l);
    for l in 0..k {
        for j in 0..k {
            for i in 0..k {
                m.node(i as f64, j as f64, l as f64);
            }
        }
    }
    for l in 0..k {
        for j in 0..k {
            for i in 0..k {
                if i + 1 < k { m.elem(id(i, j, l), id(i + 1, j, l)); }
                if j + 1 < k { m.elem(id(i, j, l), id(i, j + 1, l)); }
                if l + 1 < k { m.elem(id(i, j, l), id(i, j, l + 1)); }
            }
        }
    }
    for j in 0..k {
        for i in 0..k {
            m.sup(id(i, j, 0), [true; 6], json!({}));
        }
    }
    m.load(id(k - 1, k - 1, k - 1), [1.0, 2.0, -3.0, 0.0, 0.0, 0.0]);
    m
}

/// A cubic lattice (7 nodes per edge) fills its Cholesky factor more than
/// 20× K_ff: the fill-ratio diagnostic turns into a warning, on the sparse
/// path and on the PCG fallback; the answer balances the load.
#[test]
fn heavy_fill_lattice_warns_3d() {
    let m = lattice3(7);
    for (p, path, want) in [
        (Path3::Default, "sparse_cholesky", vec![C::SparseCholesky, C::SparseFillRatio, C::ResidualOk]),
        (Path3::PcgMaxit1, "pcg_fallback_sparse_cholesky", vec![C::PcgFallbackDirect, C::SparseCholesky, C::SparseFillRatio, C::ResidualOk]),
    ] {
        let r = solve_path_3d(&m, p).unwrap();
        let t = r.timings.as_ref().unwrap();
        assert!(t.nnz_l as f64 > 20.0 * t.nnz_kff as f64, "fill {}", t.nnz_l as f64 / t.nnz_kff as f64);
        check_3d(&format!("{p:?}"), &r, &m, path, &want, 0.0, &[], 1e-12);
        assert_eq!(diag_3d(&r, C::SparseFillRatio).severity, Severity::Warning);
    }
}

fn diag_3d(r: &AnalysisResults3D, c: C) -> &StructuredDiagnostic {
    diag(&r.structured_diagnostics, c)
}

fn solver_diagnostics_with_self_checks(ds: &[StructuredDiagnostic]) -> Vec<&StructuredDiagnostic> {
    let checks: Vec<_> = ds.iter().filter(|d| d.phase.as_deref().unwrap_or("").starts_with("self_check:")).collect();
    assert_eq!(checks.len(), 2);
    assert_eq!(checks[0].phase.as_deref(), Some("self_check:static_residual"));
    assert_eq!(checks[1].phase.as_deref(), Some("self_check:static_balance"));
    let regularized = ds.iter().any(|d| d.code == C::DiagonalRegularization);
    for check in checks {
        let value = check.value.unwrap();
        let warning = regularized && check.phase.as_deref() == Some("self_check:static_balance") && value >= 1e-6;
        assert_eq!(check.severity, if warning { Severity::Warning } else { Severity::Info }, "{}", check.message);
        assert!(value.is_finite());
        assert!(value < if warning { 1e-3 } else { 1e-6 });
    }
    ds.iter().filter(|d| !d.phase.as_deref().unwrap_or("").starts_with("self_check:")).collect()
}

#[test]
fn self_checks_settlement_only_dense_fallback_3d() {
    let mut model = frame3(3);
    add_gadget3(&mut model, 1e12);
    model.loads.clear();
    let result = solve_3d(&model.input()).unwrap();
    assert_eq!(path_3d(&result), "sparse_fallback_dense_lu");
    solver_diagnostics_with_self_checks(&result.structured_diagnostics);
    assert!(result.displacements.iter().any(|d| d.uz.abs() > 1e-6));
}
