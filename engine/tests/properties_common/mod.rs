//! Shared helpers for the property-based (proptest) suites `properties_2d` and
//! `properties_3d`: result flattening, scale-aware comparison, and rotations.
#![allow(dead_code)]

use proptest::test_runner::{Config, FileFailurePersistence};

/// Proptest config: `cases` random models per property, no regression files
/// written into the source tree (failures are reproduced as plain `#[test]`s).
/// `PROPTEST_CASES` in the environment overrides `cases` (for soak runs).
pub fn config(cases: u32) -> Config {
    let cases = std::env::var("PROPTEST_CASES").ok().and_then(|v| v.parse().ok()).unwrap_or(cases);
    Config {
        cases,
        failure_persistence: Some(Box::new(FileFailurePersistence::Off)),
        max_shrink_iters: 2048,
        ..Config::default()
    }
}

/// Smallest pairwise distance between points (any dimension).
pub fn min_pair_dist(pts: &[Vec<f64>]) -> f64 {
    let mut m = f64::INFINITY;
    for i in 0..pts.len() {
        for j in (i + 1)..pts.len() {
            let d: f64 = pts[i].iter().zip(&pts[j]).map(|(a, b)| (a - b) * (a - b)).sum::<f64>().sqrt();
            m = m.min(d);
        }
    }
    m
}

/// A result set flattened into four physical families. Every comparison is made
/// per family because the families carry different units (m, rad, kN, kN·m).
#[derive(Debug, Clone, Default)]
pub struct Flat {
    /// Nodal translations (m).
    pub t: Vec<f64>,
    /// Nodal rotations (rad).
    pub r: Vec<f64>,
    /// Forces: reaction forces then member end forces N, V (kN).
    pub f: Vec<f64>,
    /// Moments: reaction moments then member end moments (kN·m).
    pub m: Vec<f64>,
}

fn maxabs(v: &[f64]) -> f64 {
    v.iter().fold(0.0f64, |a, &b| a.max(b.abs()))
}

impl Flat {
    pub fn scaled(&self, kt: f64, kr: f64, kf: f64, km: f64) -> Flat {
        Flat {
            t: self.t.iter().map(|x| x * kt).collect(),
            r: self.r.iter().map(|x| x * kr).collect(),
            f: self.f.iter().map(|x| x * kf).collect(),
            m: self.m.iter().map(|x| x * km).collect(),
        }
    }
    pub fn lin_comb(a: f64, x: &Flat, b: f64, y: &Flat) -> Flat {
        let c = |u: &[f64], v: &[f64]| u.iter().zip(v).map(|(p, q)| a * p + b * q).collect();
        Flat { t: c(&x.t, &y.t), r: c(&x.r, &y.r), f: c(&x.f, &y.f), m: c(&x.m, &y.m) }
    }
    /// |a·x| + |b·y| entrywise — the magnitude scale of a linear combination
    /// (so cancellation in the combination does not shrink the tolerance below
    /// the round-off actually carried by the two terms).
    pub fn abs_comb(a: f64, x: &Flat, b: f64, y: &Flat) -> Flat {
        let c = |u: &[f64], v: &[f64]| u.iter().zip(v).map(|(p, q)| (a * p).abs() + (b * q).abs()).collect();
        Flat { t: c(&x.t, &y.t), r: c(&x.r, &y.r), f: c(&x.f, &y.f), m: c(&x.m, &y.m) }
    }
}

/// Compare `actual` to `expected` family by family.
///
/// Tolerance: `rel * S` where `S` is the family's magnitude scale, taken from
/// `scale_src`. To avoid comparing pure round-off noise in a family that is
/// legitimately ~0 (e.g. rotations of a model whose loads produce almost pure
/// translation), each family scale is floored by the dimensionally consistent
/// scale of its sibling family using the model size `lchar` (m):
///   S_t = max(|t|, |r|·L),  S_r = max(|r|, |t|/L),
///   S_f = max(|f|, |m|/L),  S_m = max(|m|, |f|·L).
/// Linear solves of these well-posed, moderately conditioned models
/// (cond(K) ≲ 1e9) carry relative error ~1e-16·cond, so `rel` ≈ 1e-6 leaves
/// ample margin while still catching any genuine inconsistency (which shows up
/// at O(1) relative size).
pub fn compare(label: &str, actual: &Flat, expected: &Flat, scale_src: &Flat, lchar: f64, rel: f64) -> Result<(), String> {
    let (t, r, f, m) = (maxabs(&scale_src.t), maxabs(&scale_src.r), maxabs(&scale_src.f), maxabs(&scale_src.m));
    let st = t.max(r * lchar);
    let sr = r.max(t / lchar);
    let sf = f.max(m / lchar);
    let sm = m.max(f * lchar);
    let fams: [(&str, &Vec<f64>, &Vec<f64>, f64); 4] = [
        ("translation", &actual.t, &expected.t, st),
        ("rotation", &actual.r, &expected.r, sr),
        ("force", &actual.f, &expected.f, sf),
        ("moment", &actual.m, &expected.m, sm),
    ];
    for (name, a, e, s) in fams {
        if a.len() != e.len() {
            return Err(format!("{label}: {name} length mismatch {} vs {}", a.len(), e.len()));
        }
        let tol = rel * s + 1e-300;
        for (k, (x, y)) in a.iter().zip(e.iter()).enumerate() {
            if !x.is_finite() || (x - y).abs() > tol {
                return Err(format!(
                    "{label}: {name}[{k}] actual={x:.10e} expected={y:.10e} |diff|={:.3e} tol={tol:.3e} (scale {s:.3e})",
                    (x - y).abs()
                ));
            }
        }
    }
    Ok(())
}

// ---------------- small vector algebra (3D) ----------------

pub type V3 = [f64; 3];

pub fn dot(a: &V3, b: &V3) -> f64 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
pub fn cross(a: &V3, b: &V3) -> V3 {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
pub fn norm(a: &V3) -> f64 { dot(a, a).sqrt() }
pub fn scale(a: &V3, k: f64) -> V3 { [a[0] * k, a[1] * k, a[2] * k] }
pub fn add(a: &V3, b: &V3) -> V3 { [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
pub fn sub(a: &V3, b: &V3) -> V3 { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
pub fn unit(a: &V3) -> V3 { scale(a, 1.0 / norm(a)) }

/// 3×3 rotation matrix (row-major) R = Rz(c)·Ry(b)·Rx(a). Proper (det = +1).
pub type M3 = [[f64; 3]; 3];
pub fn rot_xyz(a: f64, b: f64, c: f64) -> M3 {
    let (sa, ca) = a.sin_cos();
    let (sb, cb) = b.sin_cos();
    let (sc, cc) = c.sin_cos();
    let rx = [[1.0, 0.0, 0.0], [0.0, ca, -sa], [0.0, sa, ca]];
    let ry = [[cb, 0.0, sb], [0.0, 1.0, 0.0], [-sb, 0.0, cb]];
    let rz = [[cc, -sc, 0.0], [sc, cc, 0.0], [0.0, 0.0, 1.0]];
    matmul(&rz, &matmul(&ry, &rx))
}
pub fn matmul(a: &M3, b: &M3) -> M3 {
    let mut c = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            c[i][j] = (0..3).map(|k| a[i][k] * b[k][j]).sum();
        }
    }
    c
}
pub fn matvec(r: &M3, v: &V3) -> V3 {
    [dot(&r[0], v), dot(&r[1], v), dot(&r[2], v)]
}

thread_local! {
    static NIGHTLY_INPUTS: std::cell::RefCell<Vec<serde_json::Value>> = const { std::cell::RefCell::new(Vec::new()) };
}

/// Record the actual solver inputs, including transformed/combined load cases.
pub fn nightly_input<T: serde::Serialize>(input: &T) {
    if std::env::var_os("NIGHTLY_FINDINGS_DIR").is_some() {
        NIGHTLY_INPUTS.with(|v| v.borrow_mut().push(serde_json::to_value(input).unwrap()));
    }
}

/// Each failing shrink overwrites this property's previous candidate. The last
/// failing candidate is retained even if the enclosing job reaches its budget.
pub fn nightly_property<T: serde::Serialize>(base: &T, body: impl FnOnce() -> Result<(), proptest::test_runner::TestCaseError>) -> Result<(), proptest::test_runner::TestCaseError> {
    NIGHTLY_INPUTS.with(|v| v.borrow_mut().clear());
    let result = body();
    if let (Ok(dir), Err(proptest::test_runner::TestCaseError::Fail(reason))) = (std::env::var("NIGHTLY_FINDINGS_DIR"), &result) {
        let thread = std::thread::current();
        let test = thread.name().unwrap_or("property");
        let seed = std::env::var("PROPTEST_RNG_SEED").unwrap_or_default();
        let cases = std::env::var("PROPTEST_CASES").unwrap_or_default();
        let model = NIGHTLY_INPUTS.with(|v| serde_json::json!({"base": base, "solver_inputs": *v.borrow()}));
        let finding = serde_json::json!({
            "test": test, "seed": seed, "model": model, "details": reason.to_string(),
            "reduction": "last failing proptest shrink candidate; may be budget-limited (see property log)",
            "command": format!("PROPTEST_RNG_SEED={seed} PROPTEST_CASES={cases} cargo test --release --test certificates {test} -- --exact --nocapture")
        });
        std::fs::create_dir_all(&dir).unwrap();
        let path = std::path::Path::new(&dir).join(format!("{}.finding.json", test.replace("::", "-")));
        let temporary = path.with_extension("tmp");
        std::fs::write(&temporary, serde_json::to_vec_pretty(&finding).unwrap()).unwrap();
        std::fs::rename(temporary, path).unwrap();
    }
    result
}
