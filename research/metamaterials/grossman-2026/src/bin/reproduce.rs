//! Compute every series that the README and the page compare with the paper and write them to
//! results/stabileo_results.json (deterministic: fixed seeds, no timing).
//!
//!   cargo run --release --bin reproduce [-- <out.json>]

use std::f64::consts::PI;

use serde_json::json;
use springs_grossman_2026::experiment::{run_periodic, run_strip, NetworkSpec, PeriodicSpec, StripSpec};
use springs_grossman_2026::lattice::LatticeKind;
use springs_grossman_2026::moduli;
use springs_grossman_2026::network::SpringLaw;
use springs_grossman_2026::paper;

pub const FOAM_ETAS: [f64; 12] = [0.0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.49, 0.5];
pub const FOAM_SEEDS: u64 = 10;
pub const FOAM_CELLS: usize = 26;

fn spec(lattice: LatticeKind) -> NetworkSpec {
    NetworkSpec { lattice, eta: 0.0, keep: 1.0, seed: 0, spring_law: SpringLaw::Hookean, k: 1.0, prestress: 0.0 }
}

fn mean_std(v: &[f64]) -> (f64, f64) {
    let n = v.len() as f64;
    let m = v.iter().sum::<f64>() / n;
    let s = (v.iter().map(|x| (x - m) * (x - m)).sum::<f64>() / (n - 1.0).max(1.0)).sqrt();
    (m, s)
}

fn main() {
    let out = std::env::args().nth(1).unwrap_or_else(|| concat!(env!("CARGO_MANIFEST_DIR"), "/results/stabileo_results.json").to_string());
    let tri1 = LatticeKind::Triangular { phi: 1.0, psi: 1.0 };

    // Foam: periodic (exact moduli of each sample) and the paper's strip protocol.
    let mut foam_periodic = Vec::new();
    let mut foam_strip = Vec::new();
    let mut y0 = 0.0;
    for &eta in &FOAM_ETAS {
        let (mut nu, mut b, mut g, mut y, mut gam, mut nus) = (vec![], vec![], vec![], vec![], vec![], vec![]);
        for seed in 0..FOAM_SEEDS {
            let mut s = spec(tri1.clone());
            s.eta = eta;
            s.seed = seed;
            let r = run_periodic(&PeriodicSpec { network: s.clone(), n1: FOAM_CELLS, n2: FOAM_CELLS, strain: [0.0; 3] }).unwrap();
            nu.push(r.isotropic.poisson);
            b.push(r.isotropic.bulk);
            g.push(r.isotropic.shear);
            y.push(r.isotropic.young);
            gam.push(r.nonaffinity_shear);
            let st = run_strip(&StripSpec { network: s, width: 13.0, height: 52.0, theta: 0.0, clamp_band: 0.5, strain: 0.01 }).unwrap();
            nus.push(st.poisson);
        }
        if eta == 0.0 {
            y0 = mean_std(&y).0;
        }
        let ms = |v: &[f64]| {
            let (m, s) = mean_std(v);
            json!({"mean": m, "std": s})
        };
        let yr: Vec<f64> = y.iter().map(|v| v / y0).collect();
        foam_periodic.push(json!({"eta": eta, "nu": ms(&nu), "bulk": ms(&b), "shear": ms(&g), "young_over_young0": ms(&yr), "nonaffinity_shear": ms(&gam)}));
        foam_strip.push(json!({"eta": eta, "nu": ms(&nus)}));
        eprintln!("foam eta {eta}: periodic nu {:.4}, strip nu {:.4}", mean_std(&nu).0, mean_std(&nus).0);
    }

    // Honeycomb: Eq. (23) against the periodic network, for the paper's k_radial = 1e-3 and smaller.
    let mut honey = Vec::new();
    for i in 1..20 {
        let l = 0.05 * i as f64;
        let mut row = json!({"l": l, "eq23": paper::honeycomb_poisson(l)});
        for kr in [1e-3, 1e-6] {
            let r = run_periodic(&PeriodicSpec { network: spec(LatticeKind::Honeycomb { l, k_radial: kr }), n1: 4, n2: 4, strain: [0.0; 3] }).unwrap();
            row[format!("nu_k{kr:e}")] = json!(r.uniaxial_x.map(|v| v.1));
        }
        honey.push(row);
    }

    // Ordered lattices: Supplemental Eq. (9) against the exact affine result for both spring laws.
    let mut ordered = Vec::new();
    for (phi, psi) in [(2.0, 2.0), (3.0, 0.9), (1.0, 1.0), (1.5, 1.0), (1.0, 0.5), (2.0, 0.5)] {
        let c_of = |law| {
            let mut s = spec(LatticeKind::Triangular { phi, psi });
            s.spring_law = law;
            run_periodic(&PeriodicSpec { network: s, n1: 4, n2: 4, strain: [0.0; 3] }).unwrap().c
        };
        let (ch, ce) = (c_of(SpringLaw::Hookean), c_of(SpringLaw::EqualWeight));
        let thetas: Vec<f64> = (0..=72).map(|i| PI * i as f64 / 72.0).collect();
        // The paper rotates the lattice by theta and pulls along y: load direction pi/2 - theta in the lattice frame.
        let nu = |c: &[[f64; 3]; 3], t: f64| moduli::uniaxial(c, PI / 2.0 - t).map(|v| v.1);
        ordered.push(json!({
            "phi": phi, "psi": psi, "theta": thetas,
            "eq9": thetas.iter().map(|&t| paper::ordered_poisson(phi, psi, t)).collect::<Vec<_>>(),
            "nu_equal_weight": thetas.iter().map(|&t| nu(&ce, t)).collect::<Vec<_>>(),
            "nu_hookean": thetas.iter().map(|&t| nu(&ch, t)).collect::<Vec<_>>(),
        }));
    }

    // Fig. 7: Young's modulus of the (3, 2) lattice against orientation, equal-weight springs,
    // times the area of one triangle (the paper's normalisation, see README).
    let mut s = spec(LatticeKind::Triangular { phi: 3.0, psi: 2.0 });
    s.spring_law = SpringLaw::EqualWeight;
    let c = run_periodic(&PeriodicSpec { network: s.clone(), n1: 4, n2: 4, strain: [0.0; 3] }).unwrap().c;
    let tri_area = 0.5 * 2.0 * 3f64.sqrt() / 2.0;
    let thetas: Vec<f64> = (0..=90).map(|i| PI * i as f64 / 90.0).collect();
    let fig7_theory: Vec<f64> = thetas.iter().map(|&t| moduli::uniaxial(&c, PI / 2.0 - t).unwrap().0 * tri_area).collect();
    // The paper's strip protocol for the same lattice: an effective Young's modulus from the
    // reaction of the top edge, F / (width * strain), times the triangle area.
    let fig7_strip: Vec<f64> = thetas
        .iter()
        .step_by(3)
        .map(|&t| {
            let st = run_strip(&StripSpec { network: s.clone(), width: 13.0, height: 52.0, theta: t, clamp_band: 0.5, strain: 0.01 }).unwrap();
            let fy = st.section_force_y(26.0);
            fy / (13.0 * 0.01) * tri_area
        })
        .collect();

    // Rigidity: moduli against coordination for random bond dilution of the triangular lattice.
    let mut dilution = Vec::new();
    for i in 0..=20 {
        let keep = 0.4 + 0.03 * i as f64;
        let (mut z, mut b, mut g) = (vec![], vec![], vec![]);
        for seed in 0..6 {
            let mut s = spec(tri1.clone());
            s.keep = keep.min(1.0);
            s.seed = seed;
            let r = run_periodic(&PeriodicSpec { network: s, n1: 24, n2: 24, strain: [0.0; 3] }).unwrap();
            z.push(r.coordination);
            b.push(r.isotropic.bulk);
            g.push(r.isotropic.shear);
        }
        dilution.push(json!({"keep": keep.min(1.0), "z": mean_std(&z).0, "bulk": mean_std(&b).0, "shear": mean_std(&g).0, "shear_min": g.iter().cloned().fold(f64::MAX, f64::min), "shear_max": g.iter().cloned().fold(f64::MIN, f64::max)}));
    }

    let doc = json!({
        "generated_by": "research/metamaterials/grossman-2026: cargo run --release --bin reproduce",
        "foam": {"cells": FOAM_CELLS, "seeds": FOAM_SEEDS, "periodic": foam_periodic, "strip_13x52": foam_strip},
        "honeycomb": honey,
        "ordered": ordered,
        "fig7": {"theta": thetas, "young_theory_equal_weight": fig7_theory, "theta_strip": thetas.iter().step_by(3).collect::<Vec<_>>(), "young_strip_equal_weight": fig7_strip},
        "dilution": dilution,
    });
    std::fs::create_dir_all(std::path::Path::new(&out).parent().unwrap()).unwrap();
    std::fs::write(&out, serde_json::to_string(&doc).unwrap()).unwrap();
    eprintln!("wrote {out}");
}
