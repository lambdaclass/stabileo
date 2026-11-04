//! The re-assembled model as an interval system, its kinematics
//! `u = C q + p`, and the end-to-end certificate.
//!
//! DOFs are `(node id, local dof)` pairs numbered by this module (nodes by
//! id, then local dof); nothing is taken from `solver::dof`.

use std::collections::{BTreeMap, HashMap};

use super::ia::*;
use crate::certify::sparse::certify_lambda_min_lower;
use crate::linalg::sparse::CscMatrix;

/// One stiffness entry: its enclosure and Σ|contribution| (an f64 upper
/// bound, the scale the agreement check measures discrepancies against).
#[derive(Clone, Copy, Debug)]
pub struct Entry {
    pub v: I,
    pub scale: f64,
}

/// `u_i = Σ_a C_ia q_a + p_i`.
#[derive(Clone, Debug)]
pub struct Row {
    pub terms: Vec<(usize, I)>,
    pub p: I,
}

/// How to read the solver's value of parameter q from its displacements.
#[derive(Clone, Debug)]
pub enum Owner {
    /// q = u_i.
    Dof(usize),
    /// q ≈ (d·u_S)/(d·d) over the DOFs S (a tangent direction at an
    /// inclined support). Any q̃ is a valid candidate; this only makes it good.
    Dir(Vec<usize>, Vec<f64>),
}

pub struct Model {
    /// (node id, local dof) of each DOF.
    pub keys: Vec<(usize, usize)>,
    pub index: HashMap<(usize, usize), usize>,
    /// Upper and lower triangles both stored (same enclosure on both sides).
    pub k: Vec<BTreeMap<usize, Entry>>,
    pub f: Vec<Option<Entry>>,
    /// Kinematics, filled by `Kinematics`; `None` until then.
    pub rows: Vec<Row>,
    pub owners: Vec<Owner>,
    /// Element (and spring) matrices in global axes, for the residual.
    pub elems: Vec<ElemRec>,
}

/// An element's global-axis matrix over `dofs`, and the rigid-body motion it
/// annihilates (springs to ground have none).
pub struct ElemRec {
    pub dofs: Vec<usize>,
    pub k: Vec<Option<I>>,
    pub rigid: Option<Rigid>,
}

/// DOF layout `[i translations, i rotations, j translations, j rotations]`
/// of a two-node element, the node offset `Δ = x_j − x_i`, and the
/// handedness `s = det R` of its local frame: the element matrix `Tᵀ k T`
/// annihilates the motions `u_i = t`, `u_j = t + s·θ × Δ`, rotations `θ`
/// (`k` annihilates the local rigid motions, and `R(θ × Δ) = det R ·
/// (Rθ) × (RΔ)` for orthogonal `R`).
pub struct Rigid {
    pub ntrans: usize,
    pub nrot: usize,
    pub delta: Vec<I>,
    pub handed: f64,
}

impl Model {
    pub fn new(node_ids: &[usize], dpn: usize) -> Self {
        let mut keys = Vec::with_capacity(node_ids.len() * dpn);
        let mut sorted = node_ids.to_vec();
        sorted.sort_unstable();
        sorted.dedup();
        for &n in &sorted {
            for d in 0..dpn {
                keys.push((n, d));
            }
        }
        let index = keys.iter().enumerate().map(|(i, &k)| (k, i)).collect();
        let n = keys.len();
        Model { keys, index, k: vec![BTreeMap::new(); n], f: vec![None; n], rows: Vec::new(), owners: Vec::new(), elems: Vec::new() }
    }

    pub fn n(&self) -> usize {
        self.keys.len()
    }

    pub fn dof(&self, node: usize, local: usize) -> Option<usize> {
        self.index.get(&(node, local)).copied()
    }

    /// Add `v` to K_ij and K_ji (i ≠ j) or K_ii.
    fn add_k(&mut self, i: usize, j: usize, v: I) {
        let s = v.mag();
        let mut put = |a: usize, b: usize| {
            let e = self.k[a].entry(b).or_insert(Entry { v: I::ZERO, scale: 0.0 });
            if e.scale == 0.0 && e.v == I::ZERO {
                e.v = v;
            } else {
                e.v = e.v + v;
            }
            e.scale = (e.scale + s).next_up();
        };
        put(i, j);
        if i != j {
            put(j, i);
        }
    }

    pub fn add_f(&mut self, i: usize, v: I) {
        let s = v.mag();
        self.f[i] = Some(match self.f[i] {
            Some(e) => Entry { v: e.v + v, scale: (e.scale + s).next_up() },
            None => Entry { v, scale: s },
        });
    }

    /// Scatter an element (global-axis matrix over `dofs`, upper triangle
    /// used) and its load vector.
    pub fn scatter(&mut self, dofs: &[usize], k: &[Option<I>], f: &[Option<I>], rigid: Option<Rigid>) {
        let m = dofs.len();
        let mut sym = vec![None; m * m];
        for a in 0..m {
            for b in a..m {
                if let Some(v) = k[a * m + b] {
                    self.add_k(dofs[a], dofs[b], v);
                    sym[a * m + b] = Some(v);
                    sym[b * m + a] = Some(v);
                }
            }
            if let Some(v) = f[a] {
                self.add_f(dofs[a], v);
            }
        }
        self.elems.push(ElemRec { dofs: dofs.to_vec(), k: sym, rigid });
    }

    /// A spring (symmetric `k` over `dofs`, row-major) to ground.
    pub fn spring(&mut self, dofs: &[usize], k: Vec<I>) {
        let k: Vec<Option<I>> = k.into_iter().map(Some).collect();
        self.scatter(dofs, &k, &vec![None; dofs.len()], None);
    }
}

/// A block of an element's local DOFs and the matching global DOFs, with
/// `local = R · global` (R: rows = local axes in global components).
pub struct Block {
    pub local: Vec<usize>,
    pub global: Vec<usize>,
    /// `None` = identity.
    pub r: Option<Vec<Vec<I>>>,
}

/// Global-axis element matrix (over the concatenated `global` DOFs of the
/// blocks) `Tᵀ k T` and load `Tᵀ f`, blockwise: a block pair whose local
/// sub-matrix is structurally zero stays structurally zero.
pub fn to_global(k: &super::element::LMat, f: &super::element::LVec, blocks: &[Block]) -> (Vec<usize>, Vec<Option<I>>, Vec<Option<I>>) {
    let dofs: Vec<usize> = blocks.iter().flat_map(|b| b.global.iter().copied()).collect();
    let m = dofs.len();
    let mut kg = vec![None; m * m];
    let mut fg = vec![None; m];
    let mut off = Vec::with_capacity(blocks.len());
    let mut o = 0;
    for b in blocks {
        off.push(o);
        o += b.global.len();
    }
    // R[a][p] for block (local a, global p)
    let r_at = |b: &Block, a: usize, p: usize| -> Option<I> {
        match &b.r {
            None => (a == p).then_some(c(1.0)),
            Some(r) => Some(r[a][p]),
        }
    };
    for (bi, bA) in blocks.iter().enumerate() {
        for (bj, bB) in blocks.iter().enumerate() {
            let any = bA.local.iter().any(|&a| bB.local.iter().any(|&b| k.get(a, b).is_some()));
            if !any {
                continue;
            }
            for p in 0..bA.global.len() {
                for q in 0..bB.global.len() {
                    let mut acc: Option<I> = None;
                    for (ai, &a) in bA.local.iter().enumerate() {
                        let Some(rap) = r_at(bA, ai, p) else { continue };
                        for (bk, &b) in bB.local.iter().enumerate() {
                            let Some(kab) = k.get(a, b) else { continue };
                            let Some(rbq) = r_at(bB, bk, q) else { continue };
                            let t = if bA.r.is_none() && bB.r.is_none() { kab } else { rap * kab * rbq };
                            acc = Some(match acc {
                                Some(x) => x + t,
                                None => t,
                            });
                        }
                    }
                    kg[(off[bi] + p) * m + off[bj] + q] = Some(acc.unwrap_or(I::ZERO));
                }
            }
        }
        for p in 0..bA.global.len() {
            let mut acc: Option<I> = None;
            for (ai, &a) in bA.local.iter().enumerate() {
                let Some(fa) = f[a] else { continue };
                let Some(rap) = r_at(bA, ai, p) else { continue };
                let t = if bA.r.is_none() { fa } else { rap * fa };
                acc = Some(match acc {
                    Some(x) => x + t,
                    None => t,
                });
            }
            fg[off[bi] + p] = acc;
        }
    }
    (dofs, kg, fg)
}

// ---------------- kinematics ----------------

/// Builder for `u = C q + p`: supports, inclined supports, constraints.
pub struct Kinematics {
    n: usize,
    /// Prescribed value of each restrained DOF.
    fixed: HashMap<usize, I>,
    /// Inclined groups: (translation DOFs, tangent basis vectors, particular p).
    inclined: Vec<(Vec<usize>, Vec<Vec<I>>, Vec<I>)>,
    /// Constraint equations u_s = Σ c·u_m.
    eqs: Vec<(usize, Vec<(usize, I)>)>,
}

impl Kinematics {
    pub fn new(n: usize) -> Self {
        Kinematics { n, fixed: HashMap::new(), inclined: Vec::new(), eqs: Vec::new() }
    }

    pub fn fix(&mut self, dof: usize, value: I) {
        self.fixed.insert(dof, value);
    }

    pub fn is_fixed(&self, dof: usize) -> bool {
        self.fixed.contains_key(&dof)
    }

    pub fn is_inclined(&self, dof: usize) -> bool {
        self.inclined.iter().any(|(d, _, _)| d.contains(&dof))
    }

    pub fn incline(&mut self, dofs: Vec<usize>, tangents: Vec<Vec<I>>, p: Vec<I>) {
        self.inclined.push((dofs, tangents, p));
    }

    pub fn equation(&mut self, slave: usize, masters: Vec<(usize, I)>) {
        self.eqs.push((slave, masters));
    }

    pub fn has_slave(&self, dof: usize) -> bool {
        self.eqs.iter().any(|(s, _)| *s == dof)
    }

    /// Resolve into rows and owners. Err for constraint configurations this
    /// checker does not cover (slaves on supports or inclined nodes, a DOF
    /// slave twice, circular constraints).
    pub fn build(self, model: &mut Model) -> Result<(), String> {
        let n = self.n;
        let mut rows: Vec<Option<Row>> = vec![None; n];
        let mut owners = Vec::new();
        let mut slave_eq: HashMap<usize, usize> = HashMap::new();
        for (e, (s, _)) in self.eqs.iter().enumerate() {
            if self.fixed.contains_key(s) {
                return Err(format!("unsupported: a constraint's slave DOF {:?} is restrained by a support", model.keys[*s]));
            }
            if self.is_inclined(*s) {
                return Err(format!("unsupported: a constraint's slave DOF {:?} is on an inclined support", model.keys[*s]));
            }
            if slave_eq.insert(*s, e).is_some() {
                return Err(format!("unsupported: DOF {:?} is the slave of two constraints", model.keys[*s]));
            }
        }
        for (dofs, tangents, p) in &self.inclined {
            let first_q = owners.len();
            for t in tangents {
                owners.push(Owner::Dir(dofs.clone(), t.iter().map(|&x| mid(x)).collect()));
            }
            for (k, &d) in dofs.iter().enumerate() {
                let terms = tangents.iter().enumerate().map(|(ti, t)| (first_q + ti, t[k])).collect();
                rows[d] = Some(Row { terms, p: p[k] });
            }
        }
        for i in 0..n {
            if rows[i].is_some() || slave_eq.contains_key(&i) {
                continue;
            }
            rows[i] = Some(match self.fixed.get(&i) {
                Some(&v) => Row { terms: Vec::new(), p: v },
                None => {
                    owners.push(Owner::Dof(i));
                    Row { terms: vec![(owners.len() - 1, c(1.0))], p: I::ZERO }
                }
            });
        }
        // Slaves by substitution, depth-first with cycle detection.
        let mut state = vec![0u8; n]; // 0 = unvisited, 1 = in progress, 2 = done
        fn resolve(
            s: usize,
            eqs: &[(usize, Vec<(usize, I)>)],
            slave_eq: &HashMap<usize, usize>,
            rows: &mut Vec<Option<Row>>,
            state: &mut Vec<u8>,
        ) -> Result<(), String> {
            if rows[s].is_some() {
                return Ok(());
            }
            if state[s] == 1 {
                return Err("unsupported: circular constraints".into());
            }
            state[s] = 1;
            let e = slave_eq[&s];
            let mut acc: BTreeMap<usize, I> = BTreeMap::new();
            let mut p = I::ZERO;
            for &(m, coef) in &eqs[e].1 {
                if m == s {
                    return Err("unsupported: a constraint's slave appears among its masters".into());
                }
                resolve(m, eqs, slave_eq, rows, state)?;
                let row = rows[m].as_ref().expect("resolved");
                for &(q, v) in &row.terms {
                    let t = coef * v;
                    acc.entry(q).and_modify(|x| *x = *x + t).or_insert(t);
                }
                if row.p != I::ZERO {
                    p = p + coef * row.p;
                }
            }
            state[s] = 2;
            rows[s] = Some(Row { terms: acc.into_iter().collect(), p });
            Ok(())
        }
        let slaves: Vec<usize> = slave_eq.keys().copied().collect();
        for s in slaves {
            resolve(s, &self.eqs, &slave_eq, &mut rows, &mut state)?;
        }
        model.rows = rows.into_iter().map(|r| r.expect("every DOF has a row")).collect();
        model.owners = owners;
        Ok(())
    }
}

// ---------------- the certificate ----------------

/// Outcome of the end-to-end check of one solve.
pub struct E2eBound {
    pub abs_bound: f64,
    pub rel_bound: f64,
    pub mu: f64,
    pub residual_norm: f64,
    pub c_norm: f64,
    pub mismatch_norm: f64,
    /// DOFs left out of the bound: nothing stiffens them (truss-only or
    /// fully released rotations), so the model leaves them undetermined.
    pub excluded: Vec<(usize, usize)>,
    pub n_params: usize,
    /// ‖ũ‖₂ over the DOFs bounded (rounded down).
    pub u_norm: f64,
}

#[inline]
fn up(x: f64) -> f64 {
    x.next_up()
}

/// Sum of squares → norm, rounded up.
fn norm_up(sumsq: f64) -> f64 {
    up(sumsq.sqrt())
}

/// Certify `ũ` (by DOF) against the exact model `model`.
pub fn certify(model: &Model, u: &[f64]) -> Result<E2eBound, String> {
    let n = model.n();
    if u.len() != n || model.rows.len() != n {
        return Err("internal: dimension mismatch".into());
    }
    if !u.iter().all(|x| x.is_finite()) {
        return Err("non-finite displacement in solver output".into());
    }
    let nq = model.owners.len();
    // Columns of C.
    let mut ccols: Vec<Vec<(usize, I)>> = vec![Vec::new(); nq];
    for (i, r) in model.rows.iter().enumerate() {
        for &(q, v) in &r.terms {
            ccols[q].push((i, v));
        }
    }
    // KC (row i → q → value), only for rows with stiffness.
    let mut kc: Vec<BTreeMap<usize, I>> = vec![BTreeMap::new(); n];
    for i in 0..n {
        for (&j, e) in &model.k[i] {
            for &(q, cv) in &model.rows[j].terms {
                let t = e.v * cv;
                kc[i].entry(q).and_modify(|x| *x = *x + t).or_insert(t);
            }
        }
    }
    // A = Cᵀ K C
    let mut a_rows: Vec<BTreeMap<usize, I>> = vec![BTreeMap::new(); nq];
    for qa in 0..nq {
        for &(i, cia) in &ccols[qa] {
            for (&qb, &v) in &kc[i] {
                let t = cia * v;
                a_rows[qa].entry(qb).and_modify(|x| *x = *x + t).or_insert(t);
            }
        }
    }
    // Orphan parameters: A row structurally empty.
    let orphan: Vec<bool> = a_rows.iter().map(|r| r.is_empty()).collect();
    let mut excluded_dof = vec![false; n];
    for qa in 0..nq {
        if !orphan[qa] {
            continue;
        }
        // The load on the parameter is the reduced load (Cᵀf)_a: loads that
        // balance through it (opposite moments on one node, or on two
        // rotations tied together) leave the model solvable. (K p adds
        // nothing: every row of K in this column's support is empty.)
        let mut b: Option<I> = None;
        for &(i, cia) in &ccols[qa] {
            excluded_dof[i] = true;
            if let Some(e) = model.f[i] {
                let t = cia * e.v;
                b = Some(match b {
                    Some(x) => x + t,
                    None => t,
                });
            }
        }
        let Some(b) = b else { continue };
        let at = model.keys[ccols[qa][0].0];
        if !b.is_finite() || b.lo > 0.0 || b.hi < 0.0 {
            return Err(format!(
                "a load acts on DOF {at:?}, which nothing stiffens: the model has no solution (net load {b:?})"
            ));
        }
        if b != I::ZERO {
            return Err(format!(
                "the net load on DOF {at:?}, which nothing stiffens, is zero only within rounding ({b:?}): \
                 whether the model has a solution is not decided"
            ));
        }
    }
    let kept: Vec<usize> = (0..nq).filter(|&q| !orphan[q]).collect();
    let mut newq = vec![usize::MAX; nq];
    for (k, &q) in kept.iter().enumerate() {
        newq[q] = k;
    }
    let m = kept.len();
    // q̃ from the owners.
    let mut qt = vec![0.0; nq];
    for (q, o) in model.owners.iter().enumerate() {
        qt[q] = match o {
            Owner::Dof(i) => u[*i],
            Owner::Dir(dofs, d) => {
                let num: f64 = dofs.iter().zip(d).map(|(&i, &di)| di * u[i]).sum();
                let den: f64 = d.iter().map(|x| x * x).sum();
                if den > 0.0 { num / den } else { 0.0 }
            }
        };
        if orphan[q] {
            qt[q] = 0.0;
        }
    }
    // w = C q̃ + p over every DOF.
    // (A unit coefficient with no offset gives the exact point q̃.)
    let w: Vec<I> = model
        .rows
        .iter()
        .map(|r| {
            let mut acc: Option<I> = (r.p != I::ZERO).then_some(r.p);
            for &(q, v) in &r.terms {
                if orphan[q] || qt[q] == 0.0 {
                    continue;
                }
                let t = if v == c(1.0) { c(qt[q]) } else { v * c(qt[q]) };
                acc = Some(match acc {
                    Some(a) => a + t,
                    None => t,
                });
            }
            acc.unwrap_or(I::ZERO)
        })
        .collect();
    // r_full = f − K w, element by element: K_e w_e = K_e (w_e − ρ_e) for
    // the rigid-body motion ρ_e that matches node i (exact: K_e annihilates
    // it), so a stiff short member contributes its small deformation times
    // its stiffness rather than its displacement times its stiffness.
    let mut r_q = vec![I::ZERO; m];
    let mut rf: Vec<I> = model.f.iter().map(|e| e.map(|e| e.v).unwrap_or(I::ZERO)).collect();
    for el in &model.elems {
        let md = el.dofs.len();
        let mut v: Vec<I> = el.dofs.iter().map(|&d| w[d]).collect();
        if let Some(rg) = &el.rigid {
            let (nt, nr) = (rg.ntrans, rg.nrot);
            let t: Vec<I> = (0..nt).map(|a| v[a]).collect();
            let th: Vec<I> = (0..nr).map(|a| v[nt + a]).collect();
            // rigid translation at node j: t + θ × Δ
            let at_j: Vec<I> = match (nt, nr) {
                (2, 1) => vec![t[0] - th[0] * rg.delta[1], t[1] + th[0] * rg.delta[0]],
                (3, 3) => {
                    let cr = cross(&[th[0], th[1], th[2]], &[rg.delta[0], rg.delta[1], rg.delta[2]]);
                    let s = c(rg.handed);
                    vec![t[0] + s * cr[0], t[1] + s * cr[1], t[2] + s * cr[2]]
                }
                _ => t.clone(),
            };
            for a in 0..nt + nr {
                v[a] = I::ZERO;
            }
            for a in 0..nt {
                v[nt + nr + a] = v[nt + nr + a] - at_j[a];
            }
            for a in 0..nr {
                v[2 * nt + nr + a] = v[2 * nt + nr + a] - th[a];
            }
        }
        for a in 0..md {
            let mut acc: Option<I> = None;
            for b in 0..md {
                if let Some(kab) = el.k[a * md + b] {
                    if v[b] != I::ZERO {
                        let t = kab * v[b];
                        acc = Some(match acc {
                            Some(x) => x + t,
                            None => t,
                        });
                    }
                }
            }
            if let Some(x) = acc {
                rf[el.dofs[a]] = rf[el.dofs[a]] - x;
            }
        }
    }
    // Tripwire: the plain residual f − K w encloses the same exact values, so
    // the two enclosures must intersect (a wrong rigid motion would not).
    for i in 0..n {
        let mut plain = model.f[i].map(|e| e.v).unwrap_or(I::ZERO);
        for (&j, e) in &model.k[i] {
            plain = plain - e.v * w[j];
        }
        if plain.is_finite() && rf[i].is_finite() && (plain.hi < rf[i].lo || rf[i].hi < plain.lo) {
            return Err(format!("internal: element-wise residual inconsistent at DOF {:?}", model.keys[i]));
        }
    }
    let rf: Vec<Option<I>> = rf.into_iter().map(Some).collect();
    for &q in &kept {
        let mut acc = I::ZERO;
        for &(i, v) in &ccols[q] {
            acc = acc + v * rf[i].expect("computed");
        }
        r_q[newq[q]] = acc;
    }
    let mut rho2 = 0.0f64;
    for r in &r_q {
        if !r.is_finite() {
            return Err("non-finite residual".into());
        }
        let mg = r.mag();
        rho2 = up(rho2 + up(mg * mg));
    }
    let rho = norm_up(rho2);
    // λ_min(A) ≥ μ > 0 by Gram residual + Gershgorin on the interval A.
    let mu = if m == 0 {
        f64::INFINITY
    } else {
        let mut col_ptr = vec![0usize; m + 1];
        let mut row_idx = Vec::new();
        let mut values = Vec::new();
        let mut vals = Vec::new();
        // column b holds rows a ≥ b
        let mut lower: Vec<Vec<(usize, I)>> = vec![Vec::new(); m];
        for &qa in &kept {
            for (&qb, &v) in &a_rows[qa] {
                if orphan[qb] {
                    return Err("internal: orphan parameter coupled".into());
                }
                let (a, b) = (newq[qa], newq[qb]);
                if a >= b {
                    lower[b].push((a, v));
                }
            }
        }
        for b in 0..m {
            lower[b].sort_by_key(|x| x.0);
            for &(a, v) in &lower[b] {
                row_idx.push(a);
                values.push(mid(v));
                vals.push(v);
            }
            col_ptr[b + 1] = row_idx.len();
        }
        let csc = CscMatrix { n: m, col_ptr, row_idx, values };
        certify_lambda_min_lower(&csc, &vals)?
    };
    let e_q = if m == 0 { 0.0 } else { up(rho / mu) };
    if !e_q.is_finite() {
        return Err("non-finite parameter error bound".into());
    }
    // ‖C x‖₂ ≤ √g ‖x‖₂ with g ≥ every row sum of |CᵀC| (Gershgorin on
    // g I − CᵀC; Lean `vnorm_mulVec_le_of_rows`), over kept columns and
    // non-excluded rows.
    let mut ctc: Vec<BTreeMap<usize, I>> = vec![BTreeMap::new(); m];
    for (i, r) in model.rows.iter().enumerate() {
        if excluded_dof[i] {
            continue;
        }
        for &(q, v) in &r.terms {
            let a = newq[q];
            for &(q2, v2) in &r.terms {
                let b = newq[q2];
                let t = v * v2;
                ctc[a].entry(b).and_modify(|x| *x = *x + t).or_insert(t);
            }
        }
    }
    let gers = ctc.iter().map(|r| r.values().fold(0.0, |acc, v| up(acc + v.mag()))).fold(0.0, f64::max);
    let c_norm = norm_up(gers);
    // ‖C q̃ + p − ũ‖₂ over non-excluded DOFs.
    let mut d2 = 0.0f64;
    let mut u2 = 0.0f64;
    let mut excluded = Vec::new();
    for i in 0..n {
        if excluded_dof[i] {
            excluded.push(model.keys[i]);
            continue;
        }
        let d = w[i] - c(u[i]);
        if !d.is_finite() {
            return Err("non-finite kinematic mismatch".into());
        }
        let mg = d.mag();
        d2 = up(d2 + up(mg * mg));
        u2 = (u2 + u[i] * u[i]).next_down().max(0.0);
    }
    let mismatch = norm_up(d2);
    let abs_bound = up(up(c_norm * e_q) + mismatch);
    if !abs_bound.is_finite() {
        return Err("non-finite bound".into());
    }
    let unorm = u2.sqrt().next_down().max(0.0);
    let rel_bound = if abs_bound == 0.0 {
        0.0
    } else if unorm > 0.0 {
        up(abs_bound / unorm)
    } else {
        f64::INFINITY
    };
    Ok(E2eBound {
        abs_bound,
        rel_bound,
        mu: if m == 0 { 0.0 } else { mu },
        residual_norm: rho,
        c_norm,
        mismatch_norm: mismatch,
        excluded,
        n_params: m,
        u_norm: unorm,
    })
}

// ---------------- agreement with the engine's assembly ----------------

/// The engine's assembled K and f, read back for comparison only.
pub struct EngineAssembly {
    /// (node, local) → engine equation index.
    pub map: HashMap<(usize, usize), usize>,
    /// Full symmetric K (both triangles).
    pub k: HashMap<(usize, usize), f64>,
    pub f: Vec<f64>,
    /// Rotated groups at inclined supports: engine DOFs and R (rows = local
    /// axes): the engine's K is Tᵀ-rotated there, `K_rot = T K T ᵀ`.
    pub rotations: Vec<(Vec<usize>, Vec<Vec<f64>>)>,
}

/// Largest discrepancy of the engine's K and f from the re-assembled
/// enclosures, relative to the scale of the entry.
pub struct Agreement {
    pub k_rel: f64,
    pub f_rel: f64,
    pub worst_k: Option<((usize, usize), (usize, usize), f64, I)>,
    pub worst_f: Option<((usize, usize), f64, I)>,
}

/// Compare (in global axes) the engine's assembly with the model.
pub fn agreement(model: &Model, eng: &EngineAssembly) -> Result<Agreement, String> {
    // A NaN would compare false both ways below and read as agreement.
    if let Some((&(i, j), v)) = eng.k.iter().find(|(_, v)| !v.is_finite()) {
        return Err(format!("non-finite entry {v} in the engine's K at ({i}, {j})"));
    }
    if let Some((i, v)) = eng.f.iter().enumerate().find(|(_, v)| !v.is_finite()) {
        return Err(format!("non-finite entry {v} in the engine's f at {i}"));
    }
    if eng.rotations.iter().any(|(_, r)| r.iter().flatten().any(|x| !x.is_finite())) {
        return Err("non-finite inclined-support rotation in the engine's assembly".into());
    }
    let n = model.n();
    let mut g = vec![usize::MAX; n];
    for i in 0..n {
        g[i] = *eng.map.get(&model.keys[i]).ok_or_else(|| format!("engine has no DOF {:?}", model.keys[i]))?;
    }
    // Rotation group of each engine DOF: (group index, position).
    let mut grp: HashMap<usize, (usize, usize)> = HashMap::new();
    for (gi, (dofs, _)) in eng.rotations.iter().enumerate() {
        for (p, &d) in dofs.iter().enumerate() {
            grp.insert(d, (gi, p));
        }
    }
    // Engine K in global axes: K_glob[x][y] = Σ_a Σ_b T[a][x] K_rot[a][b] T[b][y].
    let kget = |a: usize, b: usize| eng.k.get(&(a, b)).copied().unwrap_or(0.0);
    let comps = |x: usize| -> Vec<(usize, f64)> {
        match grp.get(&x) {
            None => vec![(x, 1.0)],
            Some(&(gi, p)) => {
                let (dofs, r) = &eng.rotations[gi];
                dofs.iter().enumerate().map(|(a, &d)| (d, r[a][p])).collect()
            }
        }
    };
    let kglob = |x: usize, y: usize| -> I {
        let (cx, cy) = (comps(x), comps(y));
        if cx.len() == 1 && cy.len() == 1 {
            return c(kget(cx[0].0, cy[0].0));
        }
        let mut acc = I::ZERO;
        for &(a, ta) in &cx {
            for &(b, tb) in &cy {
                let v = kget(a, b);
                if v != 0.0 {
                    acc = acc + c(ta) * c(v) * c(tb);
                }
            }
        }
        acc
    };
    let has_k: Vec<bool> = model.k.iter().map(|r| !r.is_empty()).collect();
    let diag_scale: Vec<f64> = (0..n).map(|i| model.k[i].get(&i).map(|e| e.scale).unwrap_or(0.0)).collect();
    // Pairs to compare: the model's pattern, plus the engine's (mapped back).
    let mut back: HashMap<usize, usize> = HashMap::new();
    for i in 0..n {
        back.insert(g[i], i);
    }
    let mut pairs: std::collections::HashSet<(usize, usize)> = std::collections::HashSet::new();
    for i in 0..n {
        for &j in model.k[i].keys() {
            pairs.insert((i, j));
        }
    }
    for &(a, b) in eng.k.keys() {
        // a rotated DOF spreads over its group
        for (x, _) in comps(a) {
            for (y, _) in comps(b) {
                if let (Some(&i), Some(&j)) = (back.get(&x), back.get(&y)) {
                    pairs.insert((i, j));
                }
            }
        }
    }
    let mut out = Agreement { k_rel: 0.0, f_rel: 0.0, worst_k: None, worst_f: None };
    for &(i, j) in &pairs {
        if i == j && !has_k[i] {
            // DOF nothing stiffens in the model: the engine may hold it with
            // an artificial spring, which is not part of the model. Its
            // couplings (0 in the model) are still compared.
            continue;
        }
        let refv = model.k[i].get(&j).map(|e| e.v).unwrap_or(I::ZERO);
        let sc = model.k[i].get(&j).map(|e| e.scale).unwrap_or(0.0).max((diag_scale[i] * diag_scale[j]).sqrt());
        let ev = kglob(g[i], g[j]);
        if !ev.is_finite() || !refv.is_finite() {
            return Err(format!("non-finite stiffness at {:?}–{:?} (engine {ev:?}, model {refv:?})", model.keys[i], model.keys[j]));
        }
        // distance between the engine value and the reference enclosure
        let dist = if ev.hi < refv.lo {
            refv.lo - ev.hi
        } else if ev.lo > refv.hi {
            ev.lo - refv.hi
        } else {
            0.0
        };
        let rel = if dist == 0.0 { 0.0 } else if sc > 0.0 { dist / sc } else { f64::INFINITY };
        if rel > out.k_rel {
            out.k_rel = rel;
            out.worst_k = Some((model.keys[i], model.keys[j], mid(ev), refv));
        }
    }
    // f in global axes: f_glob[x] = Σ_a T[a][x] f_rot[a].
    let mut node_scale: HashMap<usize, f64> = HashMap::new();
    for i in 0..n {
        let s = model.f[i].map(|e| e.scale).unwrap_or(0.0);
        let e = node_scale.entry(model.keys[i].0).or_insert(0.0);
        *e = e.max(s);
    }
    for i in 0..n {
        let x = g[i];
        let mut ev = I::ZERO;
        for (a, ta) in comps(x) {
            let v = eng.f.get(a).copied().unwrap_or(0.0);
            if v != 0.0 {
                ev = ev + if ta == 1.0 { c(v) } else { c(ta) * c(v) };
            }
        }
        let refv = model.f[i].map(|e| e.v).unwrap_or(I::ZERO);
        if !ev.is_finite() || !refv.is_finite() {
            return Err(format!("non-finite load at {:?} (engine {ev:?}, model {refv:?})", model.keys[i]));
        }
        let sc = node_scale[&model.keys[i].0];
        let dist = if ev.hi < refv.lo {
            refv.lo - ev.hi
        } else if ev.lo > refv.hi {
            ev.lo - refv.hi
        } else {
            0.0
        };
        let rel = if dist == 0.0 { 0.0 } else if sc > 0.0 { dist / sc } else { f64::INFINITY };
        if rel > out.f_rel {
            out.f_rel = rel;
            out.worst_f = Some((model.keys[i], mid(ev), refv));
        }
    }
    Ok(out)
}
