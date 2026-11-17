use super::{cubic_roots_in_unit, largest_span_rotation, nan_max, SPAN_STATIONS};
use crate::postprocess::diagrams::SpanRotation;

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
    for rotation in [0.0, -0.0, 0.1 - 1e-14, 0.1, 0.1 + 1e-14, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let plane = SpanRotation::new(2.0, 3e4, 0.0, 0.0, rotation, 2.0 * rotation, rotation,
            false, false, vec![], vec![], vec![], 0.0);
        let planes = std::slice::from_ref(&plane);
        let expected = reference_span_rotation(2.0, planes, (0.0, 0.0));
        let actual = largest_span_rotation(2.0, planes, (0.0, 0.0));
        if expected.is_nan() { assert!(actual.is_nan()); } else { assert_eq!(actual.to_bits(), expected.to_bits()); }
        assert_eq!(super::beyond_small_displacement(actual), super::beyond_small_displacement(expected));
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
