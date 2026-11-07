//! Maxwell–Betti with rotations; each side's tolerance is `rel` times the field it is read from, never a mixed translation/rotation scale.

use crate::response::Resp;
use crate::tally::Verdict;

pub struct Pair<'a> {
    pub a: usize,
    pub b: usize,
    pub force_a: &'a [f64],
    pub moment_a: &'a [f64],
    pub moment_b: &'a [f64],
    pub rotation: &'static str,
}

pub struct Solves {
    pub force_a: Resp,
    pub moment_a: Resp,
    pub moment_b: Resp,
    pub zero: Option<Resp>,
}

fn step<'t>(tag: &'t str, base: &str) -> Option<&'t str> {
    if tag == base {
        return Some("");
    }
    tag.strip_prefix(base).filter(|s| s.starts_with("_t"))
}

fn scale(r: &Resp, base: &str) -> f64 {
    r.0.iter().filter(|i| step(&i.tag, base).is_some()).flat_map(|i| i.v.iter()).fold(0.0, |m, x| m.max(x.abs()))
}

pub fn has_rotations(r: &Resp, rotation: &str) -> bool {
    r.0.iter().any(|i| step(&i.tag, rotation).is_some())
}

fn project(s: &Solves, r: &Resp, node: usize, tag: &str, dir: &[f64]) -> Option<f64> {
    let v = r.node_vec(node, tag)?;
    let z = match &s.zero {
        Some(z) => z.node_vec(node, tag)?,
        None => vec![0.0; v.len()],
    };
    (v.len() == dir.len() && z.len() == v.len()).then(|| v.iter().zip(&z).zip(dir).map(|((x, x0), d)| (x - x0) * d).sum())
}

pub fn check(p: &Pair, s: &Solves, rel: f64) -> Verdict {
    let (z_u, z_r) = s.zero.as_ref().map_or((0.0, 0.0), |z| (scale(z, "u"), scale(z, p.rotation)));
    let mut rows: Vec<(String, f64, f64, f64)> = Vec::new();
    for it in s.force_a.0.iter().filter(|i| i.node == Some(p.b)) {
        let Some(t) = step(&it.tag, p.rotation) else { continue };
        let lhs = project(s, &s.force_a, p.b, &it.tag, p.moment_b);
        let rhs = project(s, &s.moment_b, p.a, &format!("u{t}"), p.force_a);
        let what = format!("θ(n{}←F n{}) vs u(n{}←M n{}) {}", p.b, p.a, p.a, p.b, it.tag);
        let (Some(l), Some(r)) = (lhs, rhs) else { return Verdict::Fail(format!("{what}: a side is missing or malformed")) };
        let tol = rel * (scale(&s.force_a, p.rotation) + scale(&s.moment_b, "u") + z_u + z_r);
        rows.push((what, l, r, tol));
    }
    for it in s.moment_a.0.iter().filter(|i| i.node == Some(p.b)) {
        if step(&it.tag, p.rotation).is_none() {
            continue;
        }
        let lhs = project(s, &s.moment_a, p.b, &it.tag, p.moment_b);
        let rhs = project(s, &s.moment_b, p.a, &it.tag, p.moment_a);
        let what = format!("θ(n{}←M n{}) vs θ(n{}←M n{}) {}", p.b, p.a, p.a, p.b, it.tag);
        let (Some(l), Some(r)) = (lhs, rhs) else { return Verdict::Fail(format!("{what}: a side is missing or malformed")) };
        let tol = rel * (scale(&s.moment_a, p.rotation) + scale(&s.moment_b, p.rotation) + 2.0 * z_r);
        rows.push((what, l, r, tol));
    }
    let force_rows = rows.iter().filter(|r| r.0.contains("←F")).count();
    if force_rows == 0 || 2 * force_rows != rows.len() {
        return Verdict::Fail(format!("rotations at n{} missing from a unit-force or unit-moment response ({force_rows} of {} identities)", p.b, rows.len()));
    }
    let mut worst: f64 = 0.0;
    for (what, l, r, tol) in rows {
        let tol = tol + f64::MIN_POSITIVE;
        if ![l, r, tol].iter().all(|x| x.is_finite()) || !((l - r).abs() <= tol) {
            return Verdict::Fail(format!("{what}: {l:.10e} vs {r:.10e}, |diff| {:.3e} > tol {tol:.3e}", (l - r).abs()));
        }
        worst = worst.max((l - r).abs() / tol);
    }
    Verdict::Pass(worst)
}

pub fn both(first: Verdict, then: impl FnOnce() -> Verdict) -> Verdict {
    match first {
        Verdict::Pass(w) => match then() {
            Verdict::Pass(x) => Verdict::Pass(w.max(x)),
            Verdict::NotApplicable => Verdict::Pass(w),
            other => other,
        },
        Verdict::NotApplicable => then(),
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::response::{Dim, Kind};

    fn resp(entries: &[(usize, &str, Vec<f64>)]) -> Resp {
        let mut r = Resp::default();
        for (n, tag, v) in entries {
            let kind = if *tag == "u" { Kind::V2(Dim::LEN) } else { Kind::P2(Dim::NONE) };
            r.push(Some(*n), None, tag, kind, v.clone());
        }
        r
    }

    fn solves(zero_at_b: Vec<f64>, zero_u_at_a: Vec<f64>) -> Solves {
        Solves {
            force_a: resp(&[(1, "u", vec![1.0, 0.0]), (1, "ry", vec![0.2]), (2, "u", vec![0.5, 0.1]), (2, "ry", vec![0.3])]),
            moment_a: resp(&[(1, "u", vec![0.2, 0.0]), (1, "ry", vec![0.7]), (2, "u", vec![0.1, 0.0]), (2, "ry", vec![0.4])]),
            moment_b: resp(&[(1, "u", vec![0.3, 0.9]), (1, "ry", vec![0.4]), (2, "u", vec![0.0, 0.0]), (2, "ry", vec![0.8])]),
            zero: Some(resp(&[(1, "u", zero_u_at_a), (1, "ry", vec![0.0]), (2, "u", vec![0.0, 0.0]), (2, "ry", zero_at_b)])),
        }
    }

    fn pair() -> Pair<'static> {
        Pair { a: 1, b: 2, force_a: &[1.0, 0.0], moment_a: &[1.0], moment_b: &[1.0], rotation: "ry" }
    }

    #[test]
    fn a_reciprocal_response_passes() {
        assert!(matches!(check(&pair(), &solves(vec![0.0], vec![0.0, 0.0]), 1e-12), Verdict::Pass(_)));
    }

    #[test]
    fn a_nonreciprocal_response_fails() {
        let mut s = solves(vec![0.0], vec![0.0, 0.0]);
        s.moment_b = resp(&[(1, "u", vec![0.31, 0.9]), (1, "ry", vec![0.4]), (2, "u", vec![0.0, 0.0]), (2, "ry", vec![0.8])]);
        assert!(matches!(check(&pair(), &s, 1e-12), Verdict::Fail(_)));
    }

    #[test]
    fn a_nonreciprocal_moment_pair_fails() {
        let mut s = solves(vec![0.0], vec![0.0, 0.0]);
        s.moment_a = resp(&[(1, "u", vec![0.2, 0.0]), (1, "ry", vec![0.7]), (2, "u", vec![0.1, 0.0]), (2, "ry", vec![0.41])]);
        assert!(matches!(check(&pair(), &s, 1e-12), Verdict::Fail(_)));
    }

    #[test]
    fn a_nonfinite_response_fails() {
        for bad in [f64::INFINITY, f64::NEG_INFINITY, f64::NAN] {
            let mut s = solves(vec![0.0], vec![0.0, 0.0]);
            s.force_a = resp(&[(1, "u", vec![1.0, 0.0]), (1, "ry", vec![0.2]), (2, "u", vec![0.5, 0.1]), (2, "ry", vec![bad])]);
            s.moment_b = resp(&[(1, "u", vec![bad, 0.9]), (1, "ry", vec![0.4]), (2, "u", vec![0.0, 0.0]), (2, "ry", vec![0.8])]);
            assert!(matches!(check(&pair(), &s, 1e-12), Verdict::Fail(_)), "{bad}");
        }
    }

    #[test]
    fn an_empty_or_truncated_baseline_fails() {
        assert!(matches!(check(&pair(), &solves(vec![], vec![0.0, 0.0]), 1e-12), Verdict::Fail(_)));
        assert!(matches!(check(&pair(), &solves(vec![0.0], vec![0.0]), 1e-12), Verdict::Fail(_)));
        let mut s = solves(vec![0.0], vec![0.0, 0.0]);
        s.zero = Some(resp(&[(2, "ry", vec![0.0])]));
        assert!(matches!(check(&pair(), &s, 1e-12), Verdict::Fail(_)));
    }
}
