use crate::model::{mass_band, Assembler, Strip, DOFS};
use dedaliano_engine::linalg::{cholesky_decompose, jacobi_eigen, lower_triangular_inverse, lu_apply, lu_factor, mat_mul};
use serde::Serialize;

/// Lowest eigenvalues of the tangent on the free DOFs, split by the left–right mirror of the
/// strip, and the lowest squared frequencies of K φ = ω² M φ with the rotations condensed out
/// (no rotary inertia).
#[derive(Clone, Debug, Default, Serialize)]
pub struct Spectrum {
    pub unresolved_signs: Vec<&'static str>,
    pub stiffness_symmetric: f64,
    pub stiffness_antisymmetric: f64,
    pub omega2_symmetric: f64,
    pub omega2_antisymmetric: f64,
}

/// A basis vector of one mirror subspace: (node-major index, weight) pairs.
type Basis = Vec<Vec<(usize, f64)>>;

/// Mirror sign of each DOF under x → L − x: ux and θ change sign, uz does not.
fn mirror_sign(d: usize) -> f64 {
    if d == 1 { 1.0 } else { -1.0 }
}

/// Bases of the symmetric (+1) and antisymmetric (−1) subspaces of the free DOFs, translations
/// first, then rotations; the second number is how many translations there are.
pub fn mirror_basis(n: usize, parity: f64) -> (Basis, usize) {
    let mut translations: Basis = vec![];
    let mut rotations: Basis = vec![];
    let r = std::f64::consts::FRAC_1_SQRT_2;
    for i in 1..=n / 2 {
        let j = n - i;
        for d in 0..DOFS {
            let s = mirror_sign(d) * parity;
            let v = if i == j {
                if s > 0.0 { vec![(DOFS * i + d, 1.0)] } else { continue }
            } else {
                vec![(DOFS * i + d, r), (DOFS * j + d, s * r)]
            };
            if d == 2 { rotations.push(v) } else { translations.push(v) }
        }
    }
    let t = translations.len();
    translations.extend(rotations);
    (translations, t)
}

pub fn project(k: &[f64], size: usize, basis: &Basis) -> Vec<f64> {
    let m = basis.len();
    let mut out = vec![0.0; m * m];
    for (a, u) in basis.iter().enumerate() {
        for (b, v) in basis.iter().enumerate() {
            let mut s = 0.0;
            for &(i, wi) in u {
                for &(j, wj) in v {
                    s += wi * wj * k[i * size + j];
                }
            }
            out[a * m + b] = s;
        }
    }
    out
}

/// Lowest eigenvalue and eigenvector of a symmetric matrix.
fn lowest(a: &[f64], m: usize) -> (f64, Vec<f64>) {
    let e = jacobi_eigen(a, m, 200);
    let j = (0..m).min_by(|&x, &y| e.values[x].total_cmp(&e.values[y])).unwrap();
    (e.values[j], (0..m).map(|i| e.vectors[i * m + j]).collect())
}

/// K_tt − K_tr K_rr⁻¹ K_rt, and the map from translations to the condensed rotations.
fn condense(k: &[f64], m: usize, t: usize) -> (Vec<f64>, Vec<f64>) {
    let r = m - t;
    let mut krr: Vec<f64> = (0..r * r).map(|x| k[(t + x / r) * m + t + x % r]).collect();
    let piv = lu_factor(&mut krr, r).expect("rotational stiffness is regular");
    let mut solved = vec![0.0; r * t];
    for c in 0..t {
        let col: Vec<f64> = (0..r).map(|i| k[(t + i) * m + c]).collect();
        let x = lu_apply(&krr, &piv, &col, r).expect("finite");
        for i in 0..r {
            solved[i * t + c] = x[i];
        }
    }
    let mut out = vec![0.0; t * t];
    for a in 0..t {
        for b in 0..t {
            let mut s = k[a * m + b];
            for i in 0..r {
                s -= k[a * m + t + i] * solved[i * t + b];
            }
            out[a * t + b] = s;
        }
    }
    (out, solved.iter().map(|v| -v).collect())
}

/// Lowest ω² and its mode (translations, then the condensed rotations) of one subspace.
pub fn frequency(k_sub: &[f64], m_sub: &[f64], m: usize, t: usize) -> (f64, Vec<f64>) {
    let (kc, rot) = condense(k_sub, m, t);
    let mut l: Vec<f64> = (0..t * t).map(|x| m_sub[(x / t) * m + x % t]).collect();
    assert!(cholesky_decompose(&mut l, t), "mass is positive definite");
    for i in 0..t {
        for j in i + 1..t {
            l[i * t + j] = 0.0;
        }
    }
    let li = lower_triangular_inverse(&l, t);
    let lt: Vec<f64> = (0..t * t).map(|x| li[(x % t) * t + x / t]).collect();
    let a = mat_mul(&mat_mul(&li, &kc, t), &lt, t);
    let (w2, y) = lowest(&a, t);
    let x: Vec<f64> = (0..t).map(|i| (i..t).map(|p| li[p * t + i] * y[p]).sum()).collect();
    let r = m - t;
    let mut mode = x.clone();
    for i in 0..r {
        mode.push((0..t).map(|c| rot[i * t + c] * x[c]).sum());
    }
    (w2, mode)
}

/// Number of negative eigenvalues of a symmetric matrix (Sylvester's inertia of an LDLᵀ
/// factorisation without pivoting; a vanishing pivot counts as negative).
pub fn negative_count(a: &[f64], m: usize) -> usize {
    let mut l = a.to_vec();
    let mut d = vec![0.0; m];
    let mut count = 0;
    for j in 0..m {
        let mut s = l[j * m + j];
        for k in 0..j {
            s -= l[j * m + k] * l[j * m + k] * d[k];
        }
        d[j] = s;
        if s <= 0.0 || s.is_nan() {
            count += 1;
        }
        let pivot = if s == 0.0 { f64::MIN_POSITIVE } else { s };
        for i in j + 1..m {
            let mut t = l[i * m + j];
            for k in 0..j {
                t -= l[i * m + k] * l[j * m + k] * d[k];
            }
            l[i * m + j] = t / pivot;
        }
    }
    count
}

/// Whether the tangent restricted to the symmetric (+1) or antisymmetric (−1) free DOFs is
/// positive definite.
pub fn mirror_stable(strip: &Strip, assembler: &mut Assembler, q: &[f64], parity: f64) -> bool {
    let size = assembler.size();
    let (_, k) = assembler.dense(q);
    let (basis, _) = mirror_basis(strip.n, parity);
    negative_count(&project(&k, size, &basis), basis.len()) == 0
}

/// Lowest eigenvalue of the tangent restricted to the antisymmetric free DOFs.
pub fn antisymmetric_stiffness(strip: &Strip, assembler: &mut Assembler, q: &[f64]) -> f64 {
    let size = assembler.size();
    let (_, k) = assembler.dense(q);
    let (basis, _) = mirror_basis(strip.n, -1.0);
    lowest(&project(&k, size, &basis), basis.len()).0
}

pub fn mass_dense(n: usize) -> Vec<f64> {
    let size = DOFS * (n + 1);
    let mut m = vec![0.0; size * size];
    for (i, j, v) in mass_band(n) {
        m[i * size + j] += v;
    }
    m
}

pub fn spectrum(strip: &Strip, assembler: &mut Assembler, q: &[f64]) -> Spectrum {
    let size = assembler.size();
    let (_, k) = assembler.dense(q);
    let mass = mass_dense(strip.n);
    let mut out = Spectrum::default();
    for parity in [1.0, -1.0] {
        let (basis, t) = mirror_basis(strip.n, parity);
        let ks = project(&k, size, &basis);
        let ms = project(&mass, size, &basis);
        let m = basis.len();
        let (stiffness, _) = lowest(&ks, m);
        let (w2, _) = frequency(&ks, &ms, m, t);
        if parity > 0.0 {
            out.stiffness_symmetric = stiffness;
            out.omega2_symmetric = w2;
        } else {
            out.stiffness_antisymmetric = stiffness;
            out.omega2_antisymmetric = w2;
        }
    }
    for (s, a, keys) in [
        (out.stiffness_symmetric, out.stiffness_antisymmetric, ["stiffness_symmetric", "stiffness_antisymmetric"]),
        (out.omega2_symmetric, out.omega2_antisymmetric, ["omega2_symmetric", "omega2_antisymmetric"]),
    ] {
        let band = 1e-8 + 1e-6 * s.abs().max(a.abs());
        for (value, key) in [s, a].into_iter().zip(keys) {
            if value.abs() <= band { out.unresolved_signs.push(key); }
        }
    }
    out
}

/// The lowest antisymmetric vibration mode at q as a node-major vector, scaled so the midpoint
/// rotation is one, and its ω².
pub fn antisymmetric_mode(strip: &Strip, assembler: &mut Assembler, q: &[f64]) -> (Vec<f64>, f64) {
    let size = assembler.size();
    let (_, k) = assembler.dense(q);
    let mass = mass_dense(strip.n);
    let (basis, t) = mirror_basis(strip.n, -1.0);
    let m = basis.len();
    let (w2, coords) = frequency(&project(&k, size, &basis), &project(&mass, size, &basis), m, t);
    let mut v = vec![0.0; size];
    for (c, b) in coords.iter().zip(&basis) {
        for &(i, w) in b {
            v[i] += c * w;
        }
    }
    let scale = v[DOFS * strip.mid() + 2];
    (v.iter().map(|x| x / scale).collect(), w2)
}
