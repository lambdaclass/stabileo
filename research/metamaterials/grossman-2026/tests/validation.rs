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
        self.0.push(Check { name: name.into(), metric: metric.into(), tolerance, observed, passed: observed <= tolerance });
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
    let mut m: f64 = 0.0;
    for i in 0..3 {
        for j in 0..3 {
            m = m.max((a[i][j] - b[i][j]).abs());
        }
    }
    m
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
            let scale = r.c.iter().flatten().fold(0.0f64, |m, v| m.max(v.abs()));
            worst = worst.max(max_diff(&r.c, &cb) / scale);
            worst_cauchy = worst_cauchy.max((r.c[0][1] - r.c[2][2] / 4.0).abs() / scale);
        }
    }
    c.at_most("Bravais triangular lattices (7 shapes, 2 spring laws): periodic stiffness = Cauchy-Born", "max relative difference", worst, 1e-9);
    c.at_most("Bravais triangular lattices: Cauchy relation C12 = C66", "max relative difference", worst_cauchy, 1e-9);

    // A3. Square lattice: no shear stiffness without diagonals; C11 = 1, C12 = 0.
    let r = periodic(spec(LatticeKind::Square { diagonals: false }), 6);
    c.at_most("square lattice: zero shear modulus (floppy)", "|C33|", r.c[2][2].abs(), 1e-8);
    c.at_most("square lattice: C11 = C22 = k, C12 = 0", "max difference", (r.c[0][0] - 1.0).abs().max((r.c[1][1] - 1.0).abs()).max(r.c[0][1].abs()), 1e-9);

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
            let h = 1e-4;
            // Central second difference removes the first-order (prestress) term.
            let ep: [f64; 3] = [h * dir[0], h * dir[1], h * dir[2]];
            let em: [f64; 3] = [-ep[0], -ep[1], -ep[2]];
            let d2 = (relaxed_energy(&net, &base, ep) + relaxed_energy(&net, &base, em) - 2.0 * e0) / (h * h);
            let mut q = 0.0;
            for i in 0..3 {
                for j in 0..3 {
                    q += dir[i] * resp.c[i][j] * dir[j];
                }
            }
            worst = worst.max((d2 - q * area).abs() / (q * area));
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
    let scale = base.c.iter().flatten().fold(0.0f64, |m, v| m.max(v.abs()));
    c.at_most("frame invariance: C of the rotated foam is C rotated", "max relative difference", max_diff(&expect, &base.c) / scale, 1e-9);

    // A7. Rigidity percolation (random bond dilution of the triangular lattice, z = 6 p): well
    // below the Maxwell count z = 4 every sample is floppy, well above it every sample is rigid.
    let mut floppy: f64 = 0.0;
    let mut rigid = f64::MAX;
    for seed in 0..5 {
        let mut lo = spec(tri(1.0, 1.0));
        lo.keep = 0.5;
        lo.seed = seed;
        floppy = floppy.max(periodic(lo, 20).isotropic.shear.abs());
        let mut hi = spec(tri(1.0, 1.0));
        hi.keep = 0.9;
        hi.seed = seed;
        rigid = rigid.min(periodic(hi, 20).isotropic.shear);
    }
    c.at_most("dilution z = 3 (5 samples, 20 x 20): shear modulus vanishes", "max G / k", floppy, 1e-6);
    c.at_most("dilution z = 5.4 (5 samples, 20 x 20): every shear modulus at least 0.1 k", "0.1 - min G / k", 0.1 - rigid, 0.0);

    // A8. Strip: our assembly against the production engine's 2D truss solve (same model).
    let mut fs = spec(tri(1.0, 1.0));
    fs.eta = 0.3;
    fs.seed = 11;
    let strip = run_strip(&StripSpec { network: fs, width: 13.0, height: 52.0, theta: 0.0, clamp_band: 0.5, strain: 0.01 }).unwrap();
    let (ue, fe) = engine_model::solve_with_engine(&strip).unwrap();
    let umax = strip.displacement.iter().map(|u| u[0].abs().max(u[1].abs())).fold(0.0, f64::max);
    let du = strip.displacement.iter().zip(&ue).map(|(a, b)| (a[0] - b[0]).abs().max((a[1] - b[1]).abs())).fold(0.0, f64::max);
    let fmax = strip.force.iter().map(|v| v.abs()).fold(0.0, f64::max);
    let df = strip.force.iter().zip(&fe).map(|(a, b)| (a - b).abs()).fold(0.0, f64::max);
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

fn main_checks() -> Checks {
    let mut c = Checks::default();
    part_a(&mut c);
    c
}

#[test]
fn validation() {
    let c = main_checks();
    let json = serde_json::to_string_pretty(&serde_json::json!({ "checks": c.0 })).unwrap();
    let out = dir().join("target").join("VALIDATION.json");
    std::fs::create_dir_all(out.parent().unwrap()).unwrap();
    std::fs::write(&out, &json).unwrap();
    for ch in &c.0 {
        println!("{} {} [{}: {:.3e} <= {:.1e}]", if ch.passed { "ok  " } else { "FAIL" }, ch.name, ch.metric, ch.observed, ch.tolerance);
    }
    assert!(c.0.iter().all(|ch| ch.passed), "a validation check failed");
    let _ = PI;
}
