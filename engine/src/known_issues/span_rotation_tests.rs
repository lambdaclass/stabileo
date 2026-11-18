use super::{largest_span_rotation, nan_max, SPAN_STATIONS};
use crate::postprocess::diagrams::SpanRotation;

#[test]
fn bounded_roots_match_the_original_bisection_bits() {
    let mut state = 123456789u64;
    let mut cases = vec![[0.0; 4], [-0.18, 1.46, -3.2, 2.0], [0.24, -1.0, 1.0, 0.0], [0.0, -0.0, 1.0, -1.0]];
    for _ in 0..2000 {
        cases.push(std::array::from_fn(|_| {
            state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
            (state >> 11) as f64 / (1u64 << 53) as f64 * 2.0 - 1.0
        }));
    }
    for c in cases {
        for scale in [1e-200, 1.0, 1e200, -1.0] {
            let c = c.map(|v| v * scale);
            let expected: Vec<_> = cubic_roots_in_unit(c).into_iter().map(f64::to_bits).collect();
            let actual: Vec<_> = super::cubic_roots_in_unit(c).into_iter().map(f64::to_bits).collect();
            assert_eq!(actual, expected, "{c:?}");
        }
    }
    for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        for i in 0..4 {
            let mut c = [0.1, -0.75, 0.0, 1.0];
            c[i] = value;
            assert_eq!(super::cubic_roots_in_unit(c).into_iter().map(f64::to_bits).collect::<Vec<_>>(), cubic_roots_in_unit(c).into_iter().map(f64::to_bits).collect::<Vec<_>>());
        }
    }
}

#[test]
fn prepared_interpolation_matches_reference_bits_for_mixed_loads() {
    for seed in 1..=12 {
        for scale in [1e-100, 1.0, 1e100] {
            let l = 0.5 + seed as f64 * 0.37;
            let plane = |axis: usize| {
                let sign = if (seed + axis) % 2 == 0 { 1.0 } else { -1.0 };
                SpanRotation::new(
                    l, (2.0e4 + axis as f64 * 7.0e3) * scale,
                    if seed % 3 == 0 { 0.0 } else { 1e-5 / scale },
                    0.001, -0.003 * sign, 0.007, 0.004 * sign,
                    seed % 2 == 0, seed % 4 == 0,
                    vec![(0.173 * l, -7.0 * scale), (0.721 * l, 11.0 * scale)],
                    vec![(3.0 * scale, -5.0 * scale, 0.113 * l, 0.829 * l)],
                    vec![(0.467 * l, sign * 2.0 * scale)],
                    sign * 0.002,
                )
            };
            let planes = [plane(0), plane(1)];
            for count in [1, 2] {
                let twist = (-0.007, 0.013);
                let expected = reference_span_rotation(l, &planes[..count], twist);
                let actual = largest_span_rotation(l, &planes[..count], twist);
                assert_eq!(actual.to_bits(), expected.to_bits(), "seed={seed}, scale={scale}, planes={count}");
            }
        }
    }
}

#[test]
fn prepared_interpolation_preserves_limit_and_nonfinite_outcomes() {
    let limit = super::SMALL_DISPLACEMENT_LIMIT;
    for rotation in [0.0, -0.0, limit - 1e-14, limit, limit + 1e-14, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let plane = SpanRotation::new(2.0, 3e4, 0.0, 0.0, rotation, 2.0 * rotation, rotation,
            false, false, vec![], vec![], vec![], 0.0);
        let planes = std::slice::from_ref(&plane);
        let expected = reference_span_rotation(2.0, planes, (0.0, 0.0));
        let actual = largest_span_rotation(2.0, planes, (0.0, 0.0));
        if expected.is_nan() { assert!(actual.is_nan()); } else { assert_eq!(actual.to_bits(), expected.to_bits()); }
    }
    for (rotation, refused) in [
        (0.0, false), (-0.0, false),
        (limit.next_down(), false), (limit, false), (limit.next_up(), true),
        (-limit.next_down(), false), (-limit, false), (-limit.next_up(), true),
        (f64::NAN, true), (f64::INFINITY, true), (f64::NEG_INFINITY, true),
    ] {
        assert_eq!(super::beyond_small_displacement(rotation), refused, "rotation={rotation}");
        let measured = largest_span_rotation(2.0, &[], (rotation, rotation));
        assert_eq!(super::beyond_small_displacement(measured), refused, "input={rotation}, measured={measured}");
    }
}

fn reference_span_rotation(l: f64, planes: &[crate::postprocess::diagrams::SpanRotation], twist: (f64, f64)) -> f64 {
    let mut stations: Vec<f64> = (0..=SPAN_STATIONS).map(|k| l * k as f64 / SPAN_STATIONS as f64).chain(planes.iter().flat_map(|p| p.breaks().iter().copied())).collect();
    stations.sort_by(f64::total_cmp);
    stations.dedup();
    let nodes: [f64; 4] = std::array::from_fn(|k| 0.5 * (1.0 - ((2 * k + 1) as f64 * std::f64::consts::PI / 8.0).cos()));
    let mut worst = 0.0f64;
    for w in stations.windows(2) {
        let (a, b) = (w[0], w[1]);
        let twisted = (twist.0 + (twist.1 - twist.0) * a / l).abs().max((twist.0 + (twist.1 - twist.0) * b / l).abs()).powi(2);
        let (mut sections, mut axes) = (twisted, twisted);
        for p in planes {
            let m = nodes.map(|t| p.moment(a + (b - a) * t));
            let mut c = [0.0; 4];
            for (k, &tk) in nodes.iter().enumerate() {
                let others: Vec<f64> = nodes.iter().enumerate().filter(|&(j, _)| j != k).map(|(_, &t)| t).collect();
                let scale = m[k] / others.iter().map(|&t| tk - t).product::<f64>();
                let (r0, r1, r2) = (others[0], others[1], others[2]);
                c[0] -= scale * r0 * r1 * r2;
                c[1] += scale * (r0 * r1 + r0 * r2 + r1 * r2);
                c[2] -= scale * (r0 + r1 + r2);
                c[3] += scale;
            }
            let (h, f, ei) = (b - a, p.shear_flexibility(), p.ei());
            let thirds = [0.5 - 0.5 * 0.75f64.sqrt(), 0.5, 0.5 + 0.5 * 0.75f64.sqrt()];
            let v = thirds.map(|t| p.shear(a + h * t));
            let w = std::array::from_fn::<f64, 3, _>(|k| v[k] / thirds.iter().enumerate().filter(|&(j, _)| j != k).map(|(_, &t)| thirds[k] - t).product::<f64>());
            let s = [
                w[0] * thirds[1] * thirds[2] + w[1] * thirds[0] * thirds[2] + w[2] * thirds[0] * thirds[1],
                -(w[0] * (thirds[1] + thirds[2]) + w[1] * (thirds[0] + thirds[2]) + w[2] * (thirds[0] + thirds[1])),
                w[0] + w[1] + w[2],
            ];
            let turn = |t: f64| {
                let psi = p.at(a + h * t);
                (psi.abs(), (psi - f * (s[0] + (s[1] + s[2] * t) * t)).abs())
            };
            let mut at = vec![0.0, 1.0];
            at.extend(cubic_roots_in_unit(c));
            if f != 0.0 {
                at.extend(cubic_roots_in_unit([c[0] / ei - f * s[1] / h, c[1] / ei - 2.0 * f * s[2] / h, c[2] / ei, c[3] / ei]));
            }
            let (section, axis) = at.into_iter().map(turn).fold((0.0, 0.0), |(s, x), (ps, px)| (nan_max(s, ps), nan_max(x, px)));
            sections += section * section;
            axes += axis * axis;
        }
        worst = nan_max(worst, nan_max(sections.sqrt(), axes.sqrt()));
    }
    worst
}

fn cubic_roots_in_unit(c: [f64; 4]) -> Vec<f64> {
    let size = c.iter().map(|v| v.abs()).filter(|v| v.is_finite() && *v > 0.0).fold(0.0, f64::max);
    let c = if size > 0.0 { c.map(|v| v / size) } else { c };
    let p = |t: f64| ((c[3] * t + c[2]) * t + c[1]) * t + c[0];
    let (qa, qb, qc) = (3.0 * c[3], 2.0 * c[2], c[1]);
    let mut cuts = vec![0.0, 1.0];
    let disc = qb * qb - 4.0 * qa * qc;
    if disc >= 0.0 {
        let q = -0.5 * (qb + qb.signum() * disc.sqrt());
        if q != 0.0 {
            cuts.extend([q / qa, qc / q]);
        } else if qa != 0.0 {
            cuts.push(0.0);
        }
    }
    cuts.retain(|t| (0.0..=1.0).contains(t));
    cuts.sort_by(f64::total_cmp);
    let mut roots = Vec::new();
    for w in cuts.windows(2) {
        let (mut lo, mut hi) = (w[0], w[1]);
        let (plo, phi) = (p(lo), p(hi));
        if !(plo * phi <= 0.0) || plo == phi {
            continue;
        }
        for _ in 0..80 {
            let mid = 0.5 * (lo + hi);
            if (p(mid) <= 0.0) == (plo <= 0.0) { lo = mid } else { hi = mid }
        }
        roots.push(0.5 * (lo + hi));
    }
    roots
}
