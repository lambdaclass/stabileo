//! Relations Cb (CIRSOC 301 Ec. F.1-1) must satisfy between a moment diagram and its transforms:
//! scaling the moments by a power of two or reversing their sign leaves every output bit-identical;
//! reading the segment back to front leaves Cb equal to rounding; refining the stations of a linear
//! diagram leaves Cb equal to rounding.

use dedaliano_engine::metamorphic::Rng;
use dedaliano_engine::postprocess::cirsoc301_inputs::*;

const SEEDS: std::ops::Range<u64> = 0..400;
const SHAPES: [&str; 5] = ["I", "H", "RHS", "CHS", "rect"];

fn random_diagram(rng: &mut Rng) -> Vec<StationMoment> {
    let n = 3 + rng.below(30);
    let (a, b, c, d) = (rng.range(-300.0, 300.0), rng.range(-300.0, 300.0), rng.range(-300.0, 300.0), rng.range(-300.0, 300.0));
    let mut s: Vec<StationMoment> = (0..n)
        .map(|i| { let t = i as f64 / (n - 1) as f64; StationMoment { t, m: a + b * t + c * t * t + d * t * t * t } })
        .collect();
    rng.shuffle(&mut s);
    s
}

fn gradient(stations: Vec<StationMoment>, shape: &str, t_start: f64, t_end: f64) -> MomentGradient {
    moment_gradient(&MomentGradientInput {
        stations, t_start, t_end, shape: Some(shape.into()), cantilever_free_end: false,
    })
    .unwrap()
}

fn segment(rng: &mut Rng) -> (f64, f64) {
    if rng.below(2) == 0 { return (0.0, 1.0) }
    let w = rng.range(0.2, 1.0);
    let s = rng.range(0.0, 1.0 - w);
    (s, s + w)
}

#[test]
fn metamorphic_pr_cb_scaling_and_sign() {
    for seed in SEEDS {
        let mut rng = Rng::new(seed);
        let s = random_diagram(&mut rng);
        let shape = SHAPES[rng.below(SHAPES.len())];
        let (t0, t1) = segment(&mut rng);
        let base = gradient(s.clone(), shape, t0, t1);
        let k = [0.25, 2.0, 1024.0][rng.below(3)];
        let scaled = gradient(s.iter().map(|p| StationMoment { t: p.t, m: k * p.m }).collect(), shape, t0, t1);
        assert_eq!(scaled.cb.to_bits(), base.cb.to_bits(), "seed {seed}: scale {k}");
        assert_eq!((scaled.m_max, scaled.m_a, scaled.m_b, scaled.m_c), (k * base.m_max, k * base.m_a, k * base.m_b, k * base.m_c), "seed {seed}");
        let negated = gradient(s.iter().map(|p| StationMoment { t: p.t, m: -p.m }).collect(), shape, t0, t1);
        assert_eq!(negated, base, "seed {seed}: sign");
    }
}

#[test]
fn metamorphic_pr_cb_reversed_segment() {
    for seed in SEEDS {
        let mut rng = Rng::new(seed);
        let s = random_diagram(&mut rng);
        let shape = SHAPES[rng.below(SHAPES.len())];
        let base = gradient(s.clone(), shape, 0.0, 1.0);
        let reversed = gradient(s.iter().map(|p| StationMoment { t: 1.0 - p.t, m: p.m }).collect(), shape, 0.0, 1.0);
        assert_eq!(reversed.basis, base.basis, "seed {seed}");
        assert!((reversed.cb - base.cb).abs() <= 1e-12 * base.cb, "seed {seed}: {} against {}", reversed.cb, base.cb);
        assert!((reversed.m_a - base.m_c).abs() <= 1e-9 * base.m_max.max(1.0), "seed {seed}");
    }
}

#[test]
fn metamorphic_pr_cb_linear_diagram_refined() {
    for seed in SEEDS {
        let mut rng = Rng::new(seed);
        let (a, b) = (rng.range(-300.0, 300.0), rng.range(-300.0, 300.0));
        let line = |n: usize| (0..n).map(|i| { let t = i as f64 / (n - 1) as f64; StationMoment { t, m: a + b * t } }).collect::<Vec<_>>();
        let coarse = gradient(line(3), "I", 0.0, 1.0);
        let fine = gradient(line(3 + rng.below(60)), "I", 0.0, 1.0);
        assert!((fine.cb - coarse.cb).abs() <= 1e-9 * coarse.cb, "seed {seed}: {} against {}", fine.cb, coarse.cb);
    }
}

#[test]
fn metamorphic_pr_section_constants_scale_with_size() {
    for seed in SEEDS {
        let mut rng = Rng::new(seed);
        let h = rng.range(0.08, 1.0);
        let b = h * rng.range(0.25, 1.0);
        let tf = h * rng.range(0.01, 0.08);
        let tw = tf * rng.range(0.4, 1.0);
        let iz = b.powi(3) * tf / 6.0;
        let shape = ["I", "H", "U"][rng.below(3)];
        let at = |l: f64| section_constants(&SectionConstantsInput {
            shape: Some(shape.into()), b: Some(l * b), h: Some(l * h), tw: Some(l * tw), tf: Some(l * tf), iz: Some(l.powi(4) * iz),
            ..Default::default()
        }).unwrap();
        let (one, l) = (at(1.0), [0.5, 2.0, 1000.0 / 1024.0][rng.below(3)]);
        let k = at(l);
        let close = |a: f64, b: f64| (a - b).abs() <= 1e-14 * b.abs();
        assert!(close(k.j, l.powi(4) * one.j), "seed {seed}: J");
        assert!(close(k.cw.unwrap(), l.powi(6) * one.cw.unwrap()), "seed {seed}: Cw");
        if shape == "U" {
            assert!(close(k.c.unwrap(), one.c.unwrap()), "seed {seed}: c");
            assert!(close(k.sy.unwrap(), l.powi(3) * one.sy.unwrap()), "seed {seed}: Sy");
        }
    }
}
