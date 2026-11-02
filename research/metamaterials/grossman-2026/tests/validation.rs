//! Every claim of the README as a named check with a stated tolerance. Part A: independent checks
//! (exact lattice results, energy, symmetry, the production engine). Part B: the paper's
//! published values (reference-results/). The checks are written to target/VALIDATION.json,
//! which must equal the committed VALIDATION.json.

use std::f64::consts::PI;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use springs_grossman_2026::engine_model;
use springs_grossman_2026::experiment::{run_periodic, run_strip, NetworkSpec, PeriodicSpec, StripSpec};
use springs_grossman_2026::lattice::LatticeKind;
use springs_grossman_2026::moduli;
use springs_grossman_2026::network::{Network, SpringLaw};
use springs_grossman_2026::paper;
use springs_grossman_2026::solve;

fn dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct Check {
    category: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source: Option<String>,
    name: String,
    metric: String,
    tolerance: f64,
    observed: f64,
    passed: bool,
}

#[derive(Default)]
struct Checks(Vec<Check>);

impl Checks {
    fn at_most(&mut self, name: &str, metric: &str, observed: f64, tolerance: f64) {
        assert!(observed.is_finite() && tolerance.is_finite() && observed >= 0.0 && tolerance >= 0.0);
        self.0.push(Check { category: "independent".into(), source: None, name: name.into(), metric: metric.into(), tolerance, observed, passed: observed <= tolerance });
    }
}

fn spec(lattice: LatticeKind) -> NetworkSpec {
    NetworkSpec { lattice, eta: 0.0, keep: 1.0, seed: 0, spring_law: SpringLaw::Hookean, k: 1.0, prestress: 0.0 }
}

fn tri(phi: f64, psi: f64) -> LatticeKind {
    LatticeKind::Triangular { phi, psi }
}

fn periodic(s: NetworkSpec, n: usize) -> springs_grossman_2026::experiment::PeriodicResult {
    run_periodic(&PeriodicSpec { network: s, n1: n, n2: n, strain: [0.0; 3] }).unwrap()
}

fn max_diff(a: &[[f64; 3]; 3], b: &[[f64; 3]; 3]) -> f64 {
    finite_max(a.iter().flatten().zip(b.iter().flatten()).map(|(a, b)| (a - b).abs()))
}

fn finite_max(values: impl IntoIterator<Item = f64>) -> f64 {
    values.into_iter().fold(0.0, |m, v| {
        assert!(v.is_finite(), "non-finite validation value");
        if v > m { v } else { m }
    })
}

fn finite_min(a: f64, b: f64) -> f64 {
    assert!(a.is_finite() && b.is_finite());
    if a < b { a } else { b }
}

fn inside_error_bar(mean: f64, lo: f64, hi: f64) -> bool {
    assert!(mean.is_finite() && lo.is_finite() && hi.is_finite());
    mean >= lo - 0.003 && mean <= hi + 0.003
}

// Only computed observations receive a bounded cross-platform roundoff allowance.
// Labels, declared tolerances and pass/fail are exact: noise must never hide a failed check.
fn records_match(a: &[Check], b: &[Check]) -> bool {
    a.len() == b.len() && a.iter().zip(b).all(|(a, b)| {
        a.category == b.category && a.source == b.source && a.name == b.name && a.metric == b.metric
            && a.tolerance == b.tolerance && a.passed == b.passed
            && a.observed.is_finite() && b.observed.is_finite()
            && (a.observed - b.observed).abs() <= 1e-12 + 1e-8 * a.observed.abs().max(b.observed.abs())
    })
}

/// Affine (Cauchy-Born) stiffness of a Bravais lattice with bonds `bonds` and cell area `area`:
/// C = sum k L^2 n n n n / area, in (exx, eyy, exy) with tensor shear.
fn cauchy_born(bonds: &[([f64; 2], f64)], area: f64) -> [[f64; 3]; 3] {
    let mut c = [[0.0; 3]; 3];
    for &(r, k) in bonds {
        let l2 = r[0] * r[0] + r[1] * r[1];
        // Affine bond extension per strain component: n . (E r) = (rx^2, ry^2, 2 rx ry) / L.
        let g = [r[0] * r[0] / l2.sqrt(), r[1] * r[1] / l2.sqrt(), 2.0 * r[0] * r[1] / l2.sqrt()];
        for i in 0..3 {
            for j in 0..3 {
                c[i][j] += k * g[i] * g[j] / area;
            }
        }
    }
    c
}

fn triangular_bonds(phi: f64, psi: f64, law: SpringLaw) -> (Vec<([f64; 2], f64)>, f64) {
    let v1 = [1.0, 0.0];
    let v2 = [phi / 2.0, psi * 3f64.sqrt() / 2.0];
    let v3 = [1.0 - phi / 2.0, -psi * 3f64.sqrt() / 2.0];
    let k = |r: [f64; 2]| match law {
        SpringLaw::Hookean => 1.0,
        SpringLaw::EqualWeight => 1.0 / (r[0] * r[0] + r[1] * r[1]),
    };
    (vec![(v1, k(v1)), (v2, k(v2)), (v3, k(v3))], v2[1])
}

/// Energy of a periodic network whose cell and nodes are mapped by x -> (I + E) x (E symmetric
/// from (exx, eyy, exy)), relaxed nonlinearly: an independent route to e^T C e / 2.
fn relaxed_energy(net: &Network, pos: &[[f64; 2]], e: [f64; 3]) -> f64 {
    let map = |p: [f64; 2]| [p[0] + e[0] * p[0] + e[2] * p[1], p[1] + e[2] * p[0] + e[1] * p[1]];
    let mut m = net.clone();
    let c = m.cell.unwrap();
    m.cell = Some([map(c[0]), map(c[1])]);
    let start: Vec<[f64; 2]> = pos.iter().map(|&p| map(p)).collect();
    // Hold one node: removes the translation mode.
    let mut held = vec![false; pos.len()];
    held[0] = true;
    let r = solve::relax(&m, &start, &held, 1e-13, 100).unwrap();
    r.energy
}

fn part_a(c: &mut Checks) {
    // A1. Equilateral triangular lattice: B = sqrt(3)/2 k, G = sqrt(3)/4 k, nu = 1/3, isotropic.
    let r = periodic(spec(tri(1.0, 1.0)), 8);
    let (b, g) = (3f64.sqrt() / 2.0, 3f64.sqrt() / 4.0);
    c.at_most("triangular lattice: bulk modulus = sqrt(3)/2 k", "relative difference", (r.isotropic.bulk - b).abs() / b, 1e-10);
    c.at_most("triangular lattice: shear modulus = sqrt(3)/4 k", "relative difference", (r.isotropic.shear - g).abs() / g, 1e-10);
    c.at_most("triangular lattice: Poisson's ratio = 1/3", "absolute difference", (r.isotropic.poisson - 1.0 / 3.0).abs(), 1e-10);
    c.at_most("triangular lattice: isotropic", "max |C - C_iso| / (B + G)", r.anisotropy, 1e-10);
    c.at_most("triangular lattice: no nonaffine displacement", "nonaffinity", r.nonaffinity_shear, 1e-18);

    // A2. Any Bravais lattice: the relaxed stiffness equals the affine (Cauchy-Born) one, for
    // both spring laws, and the Cauchy relation C12 = C33 / 4 holds.
    let mut worst: f64 = 0.0;
    let mut worst_cauchy: f64 = 0.0;
    for (phi, psi) in [(2.0, 2.0), (3.0, 0.9), (1.5, 1.0), (1.0, 0.5), (2.0, 0.5), (3.0, 2.0), (0.7, 1.3)] {
        for law in [SpringLaw::Hookean, SpringLaw::EqualWeight] {
            let mut s = spec(tri(phi, psi));
            s.spring_law = law;
            let r = periodic(s, 6);
            let (bonds, area) = triangular_bonds(phi, psi, law);
            let cb = cauchy_born(&bonds, area);
            let scale = finite_max(r.c.iter().flatten().map(|v| v.abs()));
            worst = finite_max([worst, max_diff(&r.c, &cb) / scale]);
            worst_cauchy = finite_max([worst_cauchy, (r.c[0][1] - r.c[2][2] / 4.0).abs() / scale]);
        }
    }
    c.at_most("Bravais triangular lattices (7 shapes, 2 spring laws): periodic stiffness = Cauchy-Born", "max relative difference", worst, 1e-9);
    c.at_most("Bravais triangular lattices: Cauchy relation C12 = C66", "max relative difference", worst_cauchy, 1e-9);

    // A3. Square lattice: no shear stiffness without diagonals; C11 = 1, C12 = 0.
    let r = periodic(spec(LatticeKind::Square { diagonals: false }), 6);
    c.at_most("square lattice: zero shear modulus (floppy)", "|C33|", r.c[2][2].abs(), 1e-8);
    c.at_most("square lattice: C11 = C22 = k, C12 = 0", "max difference", finite_max([(r.c[0][0] - 1.0).abs(), (r.c[1][1] - 1.0).abs(), r.c[0][1].abs()]), 1e-9);

    // A4. Square lattice in tension (rest lengths shortened by s): shear stiffness from the
    // initial-tension term only, C33 = 2 t with t = k s / (1 - s)... for unit k and rest (1 - s): t = k s.
    let s = 0.05;
    let mut sp = spec(LatticeKind::Square { diagonals: false });
    sp.prestress = s;
    let r = periodic(sp, 6);
    c.at_most("square lattice under tension t: C33 = 2 t (stress stiffening)", "relative difference", (r.c[2][2] - 2.0 * s).abs() / (2.0 * s), 1e-9);

    // A5. Energy: e^T C e A / 2 equals the nonlinear spring energy of the relaxed network under a
    // small affine cell strain (foam, prestress-free and prestressed).
    for (label, eta, pre) in [("foam eta = 0.3", 0.3, 0.0), ("foam eta = 0.3 in tension", 0.3, 0.02)] {
        let mut sp = spec(tri(1.0, 1.0));
        sp.eta = eta;
        sp.seed = 7;
        sp.prestress = pre;
        let net = sp.periodic(6, 6).unwrap();
        let held = vec![false; net.nodes.len()];
        let base = if pre == 0.0 { net.nodes.clone() } else { solve::relax(&net, &net.nodes, &held, 1e-13, 100).unwrap().positions };
        let resp = solve::periodic_response(&net, &base).unwrap();
        let area = net.area().unwrap();
        let e0 = relaxed_energy(&net, &base, [0.0; 3]);
        let mut worst: f64 = 0.0;
        for dir in [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0], [0.6, -0.3, 0.5]] {
            let curvature = |h: f64| {
                let ep = [h * dir[0], h * dir[1], h * dir[2]];
                let em = [-ep[0], -ep[1], -ep[2]];
                (relaxed_energy(&net, &base, ep) + relaxed_energy(&net, &base, em) - 2.0 * e0) / (h * h)
            };
            let d2 = (4.0 * curvature(0.005) - curvature(0.01)) / 3.0;
            let mut q = 0.0;
            for i in 0..3 {
                for j in 0..3 {
                    q += dir[i] * resp.c[i][j] * dir[j];
                }
            }
            worst = finite_max([worst, (d2 - q * area).abs() / (q * area)]);
        }
        c.at_most(&format!("{label}: e^T C e A equals the second difference of the relaxed nonlinear energy"), "max relative difference", worst, 1e-5);
    }

    // A6. Frame invariance: rotating the network rotates C; B and G do not change.
    let mut sp = spec(tri(1.0, 1.0));
    sp.eta = 0.35;
    sp.seed = 3;
    let net = sp.periodic(6, 6).unwrap();
    let base = solve::periodic_response(&net, &net.nodes).unwrap();
    let a = 0.4f64;
    let rot = |p: [f64; 2]| [a.cos() * p[0] - a.sin() * p[1], a.sin() * p[0] + a.cos() * p[1]];
    let mut rn = net.clone();
    rn.nodes = net.nodes.iter().map(|&p| rot(p)).collect();
    let cell = net.cell.unwrap();
    rn.cell = Some([rot(cell[0]), rot(cell[1])]);
    let turned = solve::periodic_response(&rn, &rn.nodes).unwrap();
    let expect = moduli::rotate(&turned.c, a);
    let scale = finite_max(base.c.iter().flatten().map(|v| v.abs()));
    c.at_most("frame invariance: C of the rotated foam is C rotated", "max relative difference", max_diff(&expect, &base.c) / scale, 1e-9);

    // A7. Rigidity percolation (random bond dilution of the triangular lattice, z = 6 p): well
    // below the Maxwell count z = 4 every sample is floppy, well above it every sample is rigid.
    let mut floppy: f64 = 0.0;
    let mut rigid = f64::MAX;
    for seed in 0..5 {
        let mut lo = spec(tri(1.0, 1.0));
        lo.keep = 0.5;
        lo.seed = seed;
        floppy = finite_max([floppy, periodic(lo, 20).isotropic.shear.abs()]);
        let mut hi = spec(tri(1.0, 1.0));
        hi.keep = 0.9;
        hi.seed = seed;
        rigid = finite_min(rigid, periodic(hi, 20).isotropic.shear);
    }
    c.at_most("dilution z = 3 (5 samples, 20 x 20): shear modulus vanishes", "max G / k", floppy, 1e-6);
    c.at_most("dilution z = 5.4 (5 samples, 20 x 20): every shear modulus at least 0.1 k", "max(0, 0.1 - min G / k)", (0.1 - rigid).max(0.0), 0.0);

    // A8. Strip: our assembly against the production engine's 2D truss solve (same model).
    let mut fs = spec(tri(1.0, 1.0));
    fs.eta = 0.3;
    fs.seed = 11;
    let strip = run_strip(&StripSpec { network: fs, width: 13.0, height: 52.0, theta: 0.0, clamp_band: 0.5, strain: 0.01 }).unwrap();
    let (ue, fe) = engine_model::solve_with_engine(&strip).unwrap();
    assert_eq!(strip.displacement.len(), ue.len());
    assert_eq!(strip.force.len(), fe.len());
    let umax = finite_max(strip.displacement.iter().flatten().map(|v| v.abs()));
    let du = finite_max(strip.displacement.iter().flatten().zip(ue.iter().flatten()).map(|(a, b)| (a - b).abs()));
    let fmax = finite_max(strip.force.iter().map(|v| v.abs()));
    let df = finite_max(strip.force.iter().zip(&fe).map(|(a, b)| (a - b).abs()));
    c.at_most("foam strip (eta 0.3): displacements equal the production engine's solve_2d", "max |du| / max |u|", du / umax, 1e-8);
    c.at_most("foam strip (eta 0.3): bond forces equal the engine's axial forces", "max |dN| / max |N|", df / fmax, 1e-8);

    // A9. Strip protocol against the exact periodic value. The free edges bias the reading by
    // O(1 / width): the paper's 13 x 52 strip of the equilateral lattice reads nu = 0.371, and the
    // Richardson extrapolation of the 26 x 104 and 52 x 208 strips recovers 1/3.
    let nu_strip = |w: f64| {
        run_strip(&StripSpec { network: spec(tri(1.0, 1.0)), width: w, height: 4.0 * w, theta: 0.0, clamp_band: 0.5, strain: 0.01 }).unwrap().poisson
    };
    let (n13, n26, n52) = (nu_strip(13.0), nu_strip(26.0), nu_strip(52.0));
    c.at_most("equilateral strip 13 x 52 (paper's protocol): finite-size bias of nu", "nu - 1/3", n13 - 1.0 / 3.0, 0.05);
    c.at_most("equilateral strips 26 x 104 and 52 x 208: Richardson extrapolation of nu = 1/3", "absolute difference", (2.0 * n52 - n26 - 1.0 / 3.0).abs(), 0.005);
}


fn read_json(rel: &str) -> serde_json::Value {
    serde_json::from_str(&std::fs::read_to_string(dir().join(rel)).unwrap()).unwrap()
}

fn part_b(c: &mut Checks) {
    // B1. Supplemental Eq. (9) is the affine result with equal-weight bonds (k_e = k / l_e^2).
    let mut worst: f64 = 0.0;
    for (phi, psi) in [(2.0, 2.0), (3.0, 0.9), (1.0, 1.0), (1.5, 1.0), (1.0, 0.5), (2.0, 0.5), (0.6, 1.4)] {
        let mut s = spec(tri(phi, psi));
        s.spring_law = SpringLaw::EqualWeight;
        let r = periodic(s, 4);
        for i in 0..=36 {
            let t = PI * i as f64 / 36.0;
            let ours = moduli::uniaxial(&r.c, PI / 2.0 - t).unwrap().1;
            worst = finite_max([worst, (ours - paper::ordered_poisson(phi, psi, t)).abs()]);
        }
    }
    c.at_most("Supplemental Eq. (9) = periodic network with equal-weight springs (7 lattices x 37 angles)", "max |nu difference|", worst, 1e-9);

    // B2. For equal Hookean springs (Eq. 3) the exact value differs: lattice (1, 0.5), theta = 0
    // gives nu = 1/6, Eq. (9) gives 8/27.
    let r = periodic(spec(tri(1.0, 0.5)), 4);
    let hook = moduli::uniaxial(&r.c, PI / 2.0).unwrap().1;
    c.at_most("lattice (1, 0.5), theta = 0, equal Hookean springs: exact nu = 1/6", "absolute difference", (hook - 1.0 / 6.0).abs(), 1e-12);
    c.at_most("lattice (1, 0.5), theta = 0: Supplemental Eq. (9) evaluates to 8/27", "absolute difference", (paper::ordered_poisson(1.0, 0.5, 0.0) - 8.0 / 27.0).abs(), 1e-12);

    // B3. Fig. 7 (vector data): the calculation line is the equal-weight Young's modulus times
    // the area of one triangle. Tolerance: line width plus axis calibration, about 0.5 % of the axis.
    let v = read_json("reference-results/paper_figures_vector.json");
    let mut s = spec(tri(3.0, 2.0));
    s.spring_law = SpringLaw::EqualWeight;
    let r = periodic(s, 4);
    let tri_area = 3f64.sqrt() / 2.0;
    let mut worst: f64 = 0.0;
    let points = v["fig7"]["calculation_line"].as_array().unwrap();
    assert_eq!(points.len(), 741);
    for (i, expected) in [(0, [0.00004, 0.14411]), (370, [1.4535, 0.56404]), (740, [3.14225, 0.14411])] {
        assert_eq!(points[i], serde_json::json!(expected));
    }
    for p in points {
        let (t, y) = (p[0].as_f64().unwrap(), p[1].as_f64().unwrap());
        let ours = moduli::uniaxial(&r.c, PI / 2.0 - t).unwrap().0 * tri_area;
        worst = finite_max([worst, (ours - y).abs()]);
    }
    c.at_most("Fig. 7 calculation line (741 points) = equal-weight Young's modulus x triangle area", "max |Y difference|", worst, 0.01);

    // B4. Eq. (23): honeycomb with soft centre springs. The error is O(k_radial).
    for (kr, tol) in [(1e-3, 5e-3), (1e-6, 1e-5)] {
        let mut worst: f64 = 0.0;
        for i in 1..20 {
            let l = 0.05 * i as f64;
            let r = periodic(spec(LatticeKind::Honeycomb { l, k_radial: kr }), 4);
            worst = finite_max([worst, (r.uniaxial_x.unwrap().1 - paper::honeycomb_poisson(l)).abs()]);
        }
        c.at_most(&format!("Eq. (23) honeycomb, k_radial = {kr:e} (l = 0.05 ... 0.95)"), "max |nu difference|", worst, tol);
    }

    let triangular = periodic(spec(tri(1.0, 1.0)), 4);
    let b0 = v["fig9"]["B"]["mean_line"][0][1].as_f64().unwrap();
    let g0 = v["fig9"]["G"]["mean_line"][0][1].as_f64().unwrap();
    c.at_most("Fig. 9 at eta = 0: B = sqrt(3)/2, G = sqrt(3)/4", "max absolute difference", finite_max([(b0 - triangular.isotropic.bulk).abs(), (g0 - triangular.isotropic.shear).abs()]), 5e-3);

    // B6. Foam: exact periodic moduli, 10 samples of 26 x 26 cells per eta, against the paper's
    // simulations (Fig. 5, digitised markers and error bars) and statements (p. 6).
    let text = std::fs::read_to_string(dir().join("reference-results/fig5_simulation_digitized.csv")).unwrap();
    let mut outside = 0;
    let mut means = Vec::new();
    for line in text.lines().skip(1) {
        let f: Vec<&str> = line.split(',').collect();
        let eta: f64 = f[0].parse().unwrap();
        let mut nus = Vec::new();
        for seed in 0..10 {
            let mut s = spec(tri(1.0, 1.0));
            s.eta = eta;
            s.seed = seed;
            nus.push(periodic(s, 26).isotropic.poisson);
        }
        let m = nus.iter().sum::<f64>() / nus.len() as f64;
        assert!(m.is_finite());
        means.push((eta, m));
        if f[4] == "up" {
            let (lo, hi): (f64, f64) = (f[2].parse().unwrap(), f[3].parse().unwrap());
            if !inside_error_bar(m, lo, hi) {
                outside += 1;
            }
        }
    }
    c.at_most("foam: cross-protocol comparison, periodic nu vs Fig. 5 clamped-strip error bars (eta 0 ... 0.45, 10 markers); not strip validation", "markers outside", outside as f64, 0.0);
    let cross = means.windows(2).find(|w| w[0].1 > 0.0 && w[1].1 <= 0.0).map(|w| w[0].0 + (w[1].0 - w[0].0) * w[0].1 / (w[0].1 - w[1].1)).unwrap_or(f64::NAN);
    c.at_most("foam: periodic zero crossing vs strip text eta = 0.46 (cross-protocol)", "|eta_0 - 0.46|", (cross - 0.46).abs(), 0.02);
    let mut nus = Vec::new();
    for seed in 0..10 {
        let mut s = spec(tri(1.0, 1.0));
        s.eta = 0.5;
        s.seed = seed;
        nus.push(periodic(s, 26).isotropic.poisson);
    }
    let m5 = nus.iter().sum::<f64>() / nus.len() as f64;
    assert!(m5.is_finite());
    c.at_most("foam: periodic ensemble regression at eta = 0.5 (10 seeds, recorded mean -0.147608233, sd 0.017861567)", "|mean nu - recorded mean|", (m5 + 0.14760823298376496).abs(), 0.017);
}

fn main_checks() -> Checks {
    let mut c = Checks::default();
    part_a(&mut c);
    let independent = c.0.len();
    part_b(&mut c);
    for ch in &mut c.0[independent..] {
        if !ch.name.starts_with("lattice (1, 0.5), theta = 0") && !ch.name.starts_with("foam: periodic ensemble regression") {
            ch.category = "paper".into();
            ch.source = Some(format!("https://doi.org/10.1103/17sg-gzhl — {}", ch.name));
        }
    }
    c
}

#[test]
fn validation() {
    let c = main_checks();
    let published: Vec<Check> = c.0.iter().filter(|ch| ch.category == "paper").cloned().collect();
    for (file, checks) in [("VALIDATION.json", &c.0), ("PUBLISHED_COMPARISON.json", &published)] {
        let json = serde_json::to_string_pretty(&serde_json::json!({ "checks": checks })).unwrap();
        let out = dir().join("target").join(file);
        std::fs::create_dir_all(out.parent().unwrap()).unwrap();
        std::fs::write(&out, &json).unwrap();
    }
    for ch in &c.0 {
        println!("{} {} [{}: {:.3e} <= {:.1e}]", if ch.passed { "ok  " } else { "FAIL" }, ch.name, ch.metric, ch.observed, ch.tolerance);
    }
    assert!(c.0.iter().all(|ch| ch.passed), "a validation check failed");
    for (file, checks) in [("VALIDATION.json", &c.0), ("PUBLISHED_COMPARISON.json", &published)] {
        let committed = read_json(file);
        let committed: Vec<Check> = serde_json::from_value(committed["checks"].clone()).unwrap();
        assert!(records_match(&committed, checks), "{file} is stale: copy target/{file} over it");
    }
}

#[test]
#[should_panic(expected = "non-finite")]
fn nan_matrix_is_rejected() {
    let mut matrix = [[0.0; 3]; 3];
    matrix[1][2] = f64::NAN;
    max_diff(&matrix, &[[0.0; 3]; 3]);
}

#[test]
#[should_panic]
fn nan_mean_is_rejected() {
    inside_error_bar(f64::NAN, -0.1, 0.1);
}

#[test]
fn changed_records_are_rejected() {
    let mut checks = Checks::default();
    checks.at_most("example", "difference", 0.001, 0.01);
    let original = checks.0.clone();
    checks.0[0].observed = 0.002;
    assert!(!records_match(&original, &checks.0));
    checks.0 = original.clone();
    checks.0[0].metric = "another metric".into();
    assert!(!records_match(&original, &checks.0));
    checks.0 = original.clone();
    checks.0[0].observed += 1e-13;
    assert!(records_match(&original, &checks.0));
}

#[test]
fn record_comparison_covers_every_field_and_near_zero_noise() {
    let mut checks = Checks::default();
    checks.at_most("example", "difference", 0.0, 1e-9);
    let original = checks.0;
    let mut noisy = original.clone();
    noisy[0].observed = 5e-13;
    assert!(records_match(&original, &noisy));
    assert!(records_match(&noisy, &original));
    for field in ["category", "source", "name", "metric", "tolerance", "observed", "passed"] {
        let mut changed = serde_json::to_value(&original).unwrap();
        changed[0][field] = match field {
            "tolerance" => serde_json::json!(2e-9),
            "observed" => serde_json::json!(2e-12),
            "passed" => serde_json::json!(false),
            _ => serde_json::json!("changed"),
        };
        let changed: Vec<Check> = serde_json::from_value(changed).unwrap();
        assert!(!records_match(&original, &changed), "{field}");
    }
    for invalid in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        noisy[0].observed = invalid;
        assert!(!records_match(&original, &noisy));
    }
    assert!(!records_match(&original, &[]));
}
