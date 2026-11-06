use risers_gay_neto_2014::input::{self, ElementInput, Input};
use risers_gay_neto_2014::model::{Model, State};
use risers_gay_neto_2014::{TUTORIAL01, TUTORIAL16};
use serde_json::{json, Value};

const DIR: &str = env!("CARGO_MANIFEST_DIR");

fn csv(name: &str) -> Vec<Vec<f64>> {
    std::fs::read_to_string(format!("{DIR}/reference-results/{name}"))
        .unwrap()
        .lines()
        .skip(1)
        .map(|l| l.split(',').map(|v| v.parse().unwrap()).collect())
        .collect()
}

struct Check<'a> {
    metric: &'a str,
    source: &'a str,
    reference: Value,
    ours: Value,
    observed: f64,
    tolerance: f64,
    why: &'a str,
}

fn check(c: Check) -> Value {
    json!({
        "metric": c.metric,
        "source": c.source,
        "reference": c.reference,
        "ours": c.ours,
        "observed": c.observed,
        "tolerance": c.tolerance,
        "rationale": c.why,
        "passed": c.observed <= c.tolerance,
    })
}

fn cantilever(elements: usize) -> Input {
    let mut inp = input::parse(TUTORIAL01).unwrap();
    inp.nodes = (0..=2 * elements)
        .map(|k| (k + 1, [0.0, 0.0, k as f64 / (2 * elements) as f64]))
        .collect();
    let template = inp.elements[0].clone();
    inp.elements = (0..elements)
        .map(|e| ElementInput {
            nodes: [2 * e + 1, 2 * e + 2, 2 * e + 3],
            ..template.clone()
        })
        .collect();
    inp.node_sets.insert(2, vec![2 * elements + 1]);
    inp
}

/// Tip of the planar extensible, shearable rod under the same dead tip force, by shooting.
fn reissner_tip(p: f64, ea: f64, ga: f64, ei: f64) -> (f64, f64) {
    let integrate = |z_tip: f64| {
        let steps = 20_000;
        let h = 1.0 / steps as f64;
        let f = |y: [f64; 3]| {
            let (s, c) = y[0].sin_cos();
            let (eps, gam) = (p * s / ea, p * c / ga);
            [
                p * (z_tip - y[2]) / ei,
                (1.0 + eps) * s + gam * c,
                (1.0 + eps) * c - gam * s,
            ]
        };
        let mut y = [0.0; 3];
        for _ in 0..steps {
            let k1 = f(y);
            let k2 = f(std::array::from_fn(|i| y[i] + 0.5 * h * k1[i]));
            let k3 = f(std::array::from_fn(|i| y[i] + 0.5 * h * k2[i]));
            let k4 = f(std::array::from_fn(|i| y[i] + h * k3[i]));
            y = std::array::from_fn(|i| {
                y[i] + h / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i])
            });
        }
        y
    };
    let (mut a, mut b) = (0.3, 0.5);
    let (mut fa, mut fb) = (integrate(a)[2] - a, integrate(b)[2] - b);
    for _ in 0..60 {
        if (b - a).abs() < 1e-15 {
            break;
        }
        let c = b - fb * (b - a) / (fb - fa);
        (a, fa) = (b, fb);
        b = c;
        fb = integrate(b)[2] - b;
    }
    let y = integrate(b);
    (y[1], y[2])
}

fn tutorial01() -> Vec<Value> {
    let model = Model::from_input(&input::parse(TUTORIAL01).unwrap()).unwrap();
    let mut history = vec![];
    model.run(1, |s, _| history.push((s.t, s.x[10]))).unwrap();
    let figure = csv("tutorial01_tip_history.csv");
    let mut worst: f64 = 0.0;
    for row in &figure[1..] {
        let (_, x) = history
            .iter()
            .find(|(t, _)| (t - row[0]).abs() < 1e-9)
            .unwrap();
        worst = worst.max((x[0] - row[1]).abs()).max((x[2] - row[2]).abs());
    }
    let (young, nu) = (1e7, 0.3);
    let a = 0.01;
    let (tip_x, tip_z) = reissner_tip(
        1000.0,
        young * a,
        young / (2.0 * (1.0 + nu)) * a,
        young * 1e-4 / 12.0,
    );
    let tip = history.last().unwrap().1;
    let fine = Model::from_input(&cantilever(40)).unwrap();
    let fine_tip = fine.run(1, |_, _| {}).unwrap().x[80];
    let err = |p: [f64; 3]| (p[0] - tip_x).abs().max((p[2] - tip_z).abs());
    let end = figure.last().unwrap();
    vec![
        check(Check {
            metric: "T1 tip X and Z at t = 0.1 … 1.0 vs reference Figure 1-6 [m, max abs]",
            source: "figure",
            reference: json!([end[1], end[2]]),
            ours: json!([tip[0], tip[2]]),
            observed: worst,
            tolerance: 1e-3,
            why: "0.1% of the 1 m span: the figure's vector polyline and the reference run's 1e-4 convergence tolerance",
        }),
        check(Check {
            metric: "T1 tip at t = 1, 5 elements vs Reissner rod boundary-value solution [m, max abs]",
            source: "exact",
            reference: json!([tip_x, tip_z]),
            ours: json!([tip[0], tip[2]]),
            observed: err(tip),
            tolerance: 1e-3,
            why: "discretization error of the tutorial's 5-element mesh, same bound as the figure check",
        }),
        check(Check {
            metric: "T1 tip at t = 1, 40 elements vs Reissner rod boundary-value solution [m, max abs]",
            source: "exact",
            reference: json!([tip_x, tip_z]),
            ours: json!([fine_tip[0], fine_tip[2]]),
            observed: err(fine_tip),
            tolerance: 1e-6,
            why: "refinement must converge to the independent rod solution (RK4, 20 000 steps)",
        }),
    ]
}

struct Catenary {
    a: f64,
    w: f64,
    h: f64,
    ea: f64,
}

impl Catenary {
    fn at(&self, s: f64) -> (f64, f64) {
        let r = s / self.a;
        (
            self.a * r.asinh() + self.h * s / self.ea,
            self.a * ((1.0 + r * r).sqrt() - 1.0) + self.w * s * s / (2.0 * self.ea),
        )
    }
}

fn tutorial16() -> (Vec<Value>, Value) {
    let inp = input::parse(TUTORIAL16).unwrap();
    let model = Model::from_input(&inp).unwrap();
    let state: State = model.run(3, |_, _| {}).unwrap();
    let ours = model.resultants(&state);
    let reference = csv("tutorial16_step3_resultants.csv");
    let (mut dm, mut dv) = (0.0_f64, 0.0_f64);
    for (row, (p, r)) in reference.iter().zip(&ours) {
        assert!(
            (row[0] - p[0]).abs() < 1e-3,
            "element order differs at x = {}",
            row[0]
        );
        dm = dm.max((row[1] - r[3]).abs());
        dv = dv.max((row[2] - r[1]).abs());
    }
    let min = |v: Vec<f64>| v.into_iter().fold(f64::INFINITY, f64::min);
    let ref_min = min(reference.iter().map(|r| r[1]).collect());
    let our_min = min(ours.iter().map(|(_, r)| r[3]).collect());
    let half_plateau = |xs: Vec<(f64, f64)>, plateau: f64| {
        let w = xs
            .windows(2)
            .find(|w| w[0].1 > 0.5 * plateau && w[1].1 <= 0.5 * plateau)
            .unwrap();
        w[0].0 + (0.5 * plateau - w[0].1) / (w[1].1 - w[0].1) * (w[1].0 - w[0].0)
    };
    let ref_tdp = half_plateau(
        reference
            .iter()
            .filter(|r| r[0] > 190.0)
            .map(|r| (r[0], r[1]))
            .collect(),
        ref_min,
    );
    let our_tdp = half_plateau(
        ours.iter()
            .filter(|(p, _)| p[0] > 190.0)
            .map(|(p, r)| (p[0], r[3]))
            .collect(),
        our_min,
    );

    let pipe = &inp.pipe_sections[&1];
    let (rho_w, _) = inp.ocean.unwrap();
    let w = (pipe.rho - rho_w * std::f64::consts::PI * pipe.de * pipe.de / 4.0) * 9.81;
    let horizontal = 1.0e6;
    let cat = Catenary {
        a: horizontal / w,
        w,
        h: horizontal,
        ea: pipe.ea,
    };
    let gaps = model.contact_gaps(&state);
    let last_touching = gaps
        .iter()
        .filter(|(n, g)| *g <= 0.0 && model.reference[*n][0] < 400.0)
        .map(|(n, _)| *n)
        .max()
        .unwrap();
    let ground = state.x[last_touching][2];
    let fairlead = state.x[268];
    let length = model.reference[268][0];
    let (mut lo, mut hi) = (0.0, length);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if cat.at(mid).1 < fairlead[2] - ground {
            lo = mid
        } else {
            hi = mid
        }
    }
    let suspended = lo;
    let tdp_analytic = length - suspended;
    let origin = fairlead[0] - cat.at(suspended).0;
    let mut shape: f64 = 0.0;
    for n in 0..269 {
        let s = model.reference[n][0] - tdp_analytic;
        if s > 10.0 {
            let (cx, cz) = cat.at(s);
            let (dx, dz) = (state.x[n][0] - origin - cx, state.x[n][2] - ground - cz);
            shape = shape.max((dx * dx + dz * dz).sqrt());
        }
    }
    let lambda = (pipe.ei / horizontal).sqrt();
    let peak = |v: Vec<f64>| {
        v.into_iter()
            .fold(0.0_f64, |a, b| if b.abs() > a.abs() { b } else { a })
    };
    let checks = vec![
        check(Check {
            metric: "T16 step 3: M(e1) per element vs reference Figure 16-12 data [N·m, max abs over 134 elements]",
            source: "giraffe",
            reference: json!(ref_min),
            ours: json!(our_min),
            observed: dm,
            tolerance: 0.1,
            why: "reference run converged to 1e-4 relative; 1e-4 of the 294 N·m plateau is 0.03 N·m, bound set at about 3 times that",
        }),
        check(Check {
            metric: "T16 step 3: V(e2) per element vs reference Figure 16-13 data [N, max abs over 134 elements]",
            source: "giraffe",
            reference: json!(peak(reference.iter().map(|r| r[2]).collect())),
            ours: json!(peak(ours.iter().map(|(_, r)| r[1]).collect())),
            observed: dv,
            tolerance: 0.1,
            why: "same convergence budget as the moment, applied to the 92 N peak",
        }),
        check(Check {
            metric: "T16 step 3: touchdown (moment at half its plateau) vs reference data [m]",
            source: "giraffe",
            reference: json!(ref_tdp),
            ours: json!(our_tdp),
            observed: (our_tdp - ref_tdp).abs(),
            tolerance: 0.05,
            why: "the transition crosses one 4.18 m element; 0.05 m is about 1% of it",
        }),
        check(Check {
            metric: "T16 step 3: touchdown, last node on the seabed vs elastic catenary [m of line]",
            source: "catenary",
            reference: json!(tdp_analytic),
            ours: json!(model.reference[last_touching][0]),
            observed: (model.reference[last_touching][0] - tdp_analytic).abs(),
            tolerance: 2.0 * lambda + 2.09,
            why: "bending boundary layer sqrt(EI/H) on each side, plus one node spacing in the refined zone",
        }),
        check(Check {
            metric: "T16 step 3: suspended shape vs elastic catenary hung from the computed fairlead [m, max distance]",
            source: "catenary",
            reference: Value::Null,
            ours: Value::Null,
            observed: shape,
            tolerance: 2.0 * lambda,
            why: "the cable solution ignores bending, which moves the line by about sqrt(EI/H) near the touchdown",
        }),
    ];
    let summary = json!({
        "fairlead": fairlead,
        "anchor_axial_force_N": ours[0].1[2],
        "moment_plateau_Nm": {"ours": our_min, "reference": ref_min},
        "touchdown_half_plateau_m": {"ours": our_tdp, "reference": ref_tdp},
        "touchdown_last_contact_node_m": model.reference[last_touching][0],
        "touchdown_elastic_catenary_m": tdp_analytic,
        "submerged_weight_N_per_m": w,
        "boundary_layer_m": lambda,
    });
    (checks, summary)
}

#[test]
fn validation() {
    let mut checks = tutorial01();
    let (t16, summary) = tutorial16();
    checks.extend(t16);
    let report = json!({
        "scope": "Tutorial 1 (static cantilever) and tutorial 16 steps 1-3 (self-weight and seabed contact, axial pull, fairlead lift). Agreement with the reference code is not experimental validation.",
        "checks": checks,
        "tutorial16": summary,
    });
    std::fs::write(
        format!("{DIR}/VALIDATION.json"),
        serde_json::to_string_pretty(&report).unwrap() + "\n",
    )
    .unwrap();
    for c in &checks {
        println!(
            "{}: {} (tol {})",
            c["metric"], c["observed"], c["tolerance"]
        );
    }
    assert!(checks.iter().all(|c| c["passed"] == true));
}
