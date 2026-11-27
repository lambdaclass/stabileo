use serde_json::Value;
use snap_symmetry_vella_2024::model::{Assembler, Clamps, Strip, DOFS};
use snap_symmetry_vella_2024::run::page;
use snap_symmetry_vella_2024::study::{default_settings, PHASES, RATES};
use snap_symmetry_vella_2024::toy::Toy;

fn study() -> Value {
    serde_json::from_str(include_str!("../reference-results/study.json")).unwrap()
}

#[test]
fn figure_2a_shortening_and_travel_follow_the_clamps_into_the_hold() {
    let study = study();
    let runs = study["dynamics"]["figure_2a"].as_array().unwrap();
    assert_eq!(runs.len(), 2);
    for run in runs {
        let accepted = run["trace"]["mu"].as_array().unwrap();
        let reported = run["paper_mu"].as_array().unwrap();
        assert!(accepted.len() >= 2);
        assert_eq!(reported.len(), accepted.len());
        for (i, (a, b)) in reported.iter().zip(accepted).enumerate() {
            assert_eq!(a, b, "shortening at sample {i}");
        }
        let travel = run["travel_mm"].as_array().unwrap();
        assert_eq!(travel.len(), accepted.len());
        assert_eq!(travel.last(), travel.iter().rev().nth(1));
    }
}

#[test]
fn each_one_clamp_rate_carries_the_maximum_of_the_seeded_phase_runs() {
    let study = study();
    let d = &study["dynamics"];
    let points = d["one_end"].as_array().unwrap();
    assert_eq!(points.len(), RATES.len());
    for (p, rate) in points.iter().zip(RATES) {
        assert_eq!(p["rate"], rate);
        let phases = p["phase_amplifications"].as_array().expect("individual phase runs");
        assert_eq!(phases.len(), PHASES);
        assert_eq!(p["amplification"], phases[0]);
        let maximum = phases.iter().map(|x| x.as_f64().unwrap()).reduce(f64::max).unwrap();
        assert_eq!(p["envelope"], maximum);
    }
    let p = points.iter().find(|p| p["rate"] == 0.04).unwrap();
    assert!(p["envelope"].as_f64().unwrap() > p["amplification"].as_f64().unwrap());
    let index = 3;
    let settings = snap_symmetry_vella_2024::dynamics::Settings {
        start: d["one_end_start"].as_f64().unwrap(), one_end: true, phase: std::f64::consts::TAU * index as f64 / PHASES as f64,
        rate: 0.04, ..default_settings()
    };
    let a = page(&settings, &mut |_| false).unwrap().outcome.jump().unwrap().amplification;
    assert!((p["phase_amplifications"][index].as_f64().unwrap() - a).abs() < 1e-6);
}

#[test]
fn straight_strip_assembles_unit_bending_and_the_rectangular_axial_rigidity() {
    let strip = Strip { n: 4, ..default_settings().strip() };
    let n = strip.n as f64;
    let mut assembler = Assembler::new(&strip);
    let size = assembler.size();
    let (_, k) = assembler.dense(&vec![0.0; size]);
    assert_eq!(k[2 * size + DOFS + 2], 2.0 * n);
    assert_eq!(k[DOFS], -strip.axial_stiffness() * n);
    for scale in [1.0, 2.0] {
        let clamps = Clamps { load: 3.0, ..Clamps::symmetric(0.0) };
        let model = strip.input_with(clamps, 0.0, false, scale);
        let e = dedaliano_engine::types::units::ModulusMPa::from_mpa(model.materials["0"].e).to_internal().in_kn_per_m2();
        assert_eq!(e * model.sections["0"].iz, scale);
        assert_eq!(e * model.sections["0"].a, scale * strip.axial_stiffness());
        assert_eq!(serde_json::to_value(model.loads).unwrap()[0]["data"]["fz"], -clamps.load * scale);
    }
}

#[test]
fn finite_seed_toy_trajectory_obeys_the_s52_potential_and_s73_masses() {
    let (least, amplification) = Toy::paper().run(0.1, 0.1, 0.0);
    assert!((amplification - 1.5421927447902124).abs() < 2e-6, "{amplification}");
    assert!((least + 0.01947399873410017).abs() < 1e-8, "{least}");
}
