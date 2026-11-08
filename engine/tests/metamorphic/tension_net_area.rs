//! Relations the effective net area of CIRSOC 301 §D.3 must satisfy between end connections: the
//! two legs of an equal-leg angle give bit-identical results; a back-to-back pair of an angle or
//! channel has exactly twice the An and Ae of one part; a longer connection never lowers Ae and a
//! larger hole never raises it; and every Ae lies in (0, An] with U in (0, 1].

use dedaliano_engine::metamorphic::Rng;
use dedaliano_engine::postprocess::tension_net_area::*;

const SEEDS: std::ops::Range<u64> = 0..400;

fn random_angle(rng: &mut Rng, equal: bool) -> NetAreaSection {
    let h = rng.range(0.04, 0.2);
    let b = if equal { h } else { rng.range(0.04, 0.2) };
    let t = rng.range(0.004, 0.2 * h.min(b));
    NetAreaSection { shape: Some("L".into()), a: Some(t * (h + b - t)), h: Some(h), b: Some(b), t: Some(t), ..Default::default() }
}

fn random_plated(rng: &mut Rng) -> NetAreaSection {
    let shape = ["I", "U", "T"][rng.below(3)];
    let h = rng.range(0.1, 0.6);
    let b = rng.range(0.05, 0.3);
    let tf = rng.range(0.005, 0.03);
    let tw = rng.range(0.004, tf);
    let web = if shape == "T" { h - tf } else { h - 2.0 * tf };
    let flanges = if shape == "T" { 1.0 } else { 2.0 };
    NetAreaSection { shape: Some(shape.into()), a: Some(flanges * b * tf + web * tw), h: Some(h), b: Some(b), tw: Some(tw), tf: Some(tf), ..Default::default() }
}

fn random_bolted(rng: &mut Rng, connected: Connected) -> EndConnection {
    EndConnection::Bolted {
        connected, diameter_mm: Some(16.0), hole_mm: Some([14.0, 18.0, 22.0, 24.0][rng.below(4)]),
        bolts_per_line: Some(2.0 + rng.below(5) as f64), lines: Some(1.0 + rng.below(2) as f64), web_lines: None,
        pitch_mm: Some(rng.range(30.0, 120.0)), stagger: None,
    }
}

#[test]
fn metamorphic_pr_net_area_equal_legs() {
    for seed in SEEDS {
        let mut rng = Rng::new(seed);
        let s = random_angle(&mut rng, true);
        let e = random_bolted(&mut rng, Connected::LegH);
        let EndConnection::Bolted { diameter_mm, hole_mm, bolts_per_line, lines, web_lines, pitch_mm, stagger, .. } = e.clone() else { unreachable!() };
        let other = EndConnection::Bolted { connected: Connected::LegB, diameter_mm, hole_mm, bolts_per_line, lines, web_lines, pitch_mm, stagger };
        assert_eq!(end_net_area(&s, &e), end_net_area(&s, &other), "seed {seed}");
    }
}

#[test]
fn metamorphic_pr_net_area_back_to_back_pair_doubles() {
    for seed in SEEDS {
        let mut rng = Rng::new(seed);
        let one = random_angle(&mut rng, false);
        let leg = if rng.below(2) == 0 { Connected::LegH } else { Connected::LegB };
        let e = random_bolted(&mut rng, leg);
        let pair = NetAreaSection {
            a: one.a.map(|a| 2.0 * a), arrangement: Some("doubleBack".into()), part: Some(Box::new(one.clone())), ..one.clone()
        };
        match (end_net_area(&one, &e), end_net_area(&pair, &e)) {
            (Ok(a), Ok(b)) => {
                assert_eq!((2.0 * a.an, 2.0 * a.ae, a.u, a.x_bar, a.clause), (b.an, b.ae, b.u, b.x_bar, b.clause), "seed {seed}");
            }
            (Err(a), Err(b)) => assert_eq!(a.code, b.code, "seed {seed}"),
            (a, b) => panic!("seed {seed}: {a:?} against {b:?}"),
        }
    }
}

#[test]
fn metamorphic_pr_net_area_monotone_and_bounded() {
    let mut checked = 0;
    for seed in SEEDS {
        let mut rng = Rng::new(seed);
        let s = if rng.below(2) == 0 { random_angle(&mut rng, false) } else { random_plated(&mut rng) };
        let kind = tension_geometry(&s).unwrap().kind;
        let options: Vec<Connected> = connected_options(kind).iter().copied().filter(|c| *c != Connected::All).collect();
        let c = options[rng.below(options.len())];
        let EndConnection::Bolted { diameter_mm, hole_mm, bolts_per_line, lines, pitch_mm, .. } = random_bolted(&mut rng, c) else { unreachable!() };
        let end = |nb: f64, hole: f64| EndConnection::Bolted {
            connected: c, diameter_mm, hole_mm: Some(hole), bolts_per_line: Some(nb), lines, web_lines: None, pitch_mm, stagger: None,
        };
        let (nb, hole) = (bolts_per_line.unwrap(), hole_mm.unwrap());
        let (Ok(base), Ok(longer), Ok(wider)) = (end_net_area(&s, &end(nb, hole)), end_net_area(&s, &end(nb + 1.0, hole)), end_net_area(&s, &end(nb, hole + 4.0))) else {
            continue;
        };
        assert!(longer.ae >= base.ae, "seed {seed}: {} < {}", longer.ae, base.ae);
        assert!(wider.ae <= base.ae, "seed {seed}: {} > {}", wider.ae, base.ae);
        for r in [&base, &longer, &wider] {
            assert!(r.ae > 0.0 && r.ae <= r.an && r.an <= r.ag, "seed {seed}: {r:?}");
            assert!(r.u > 0.0 && r.u <= 1.0, "seed {seed}: {r:?}");
        }
        checked += 1;
    }
    assert!(checked > 200, "{checked} of {} seeds resolved", SEEDS.end);
}
