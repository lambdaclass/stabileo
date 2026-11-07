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
    let z = s.zero.as_ref().and_then(|z| z.node_vec(node, tag)).unwrap_or_else(|| vec![0.0; v.len()]);
    (v.len() == dir.len()).then(|| v.iter().zip(&z).zip(dir).map(|((x, x0), d)| (x - x0) * d).sum())
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
        if !((l - r).abs() <= tol) {
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
