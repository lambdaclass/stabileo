use crate::{case::Case2, corpus};
use dedaliano_engine::metamorphic::{transform::Iso2, Rng};
use dedaliano_engine::solver::pdelta;

fn rigid_control() -> Case2 {
    let mut c = corpus::fuzz_case_2d(20754, 18);
    c.s.supports.get_mut("3").unwrap().kx = None;
    c.name.push_str("-rigid-control");
    c
}

#[test]
fn rotated_rigid_control_keeps_its_pdelta_equilibrium() {
    let c = rigid_control();
    let seed = 20754 ^ crate::checks2::hash("fuzz_rich_2d/20772") ^ crate::checks2::hash("P-Delta");
    let mut rng = Rng::new(seed);
    let iso = Iso2::rotation(rng.range(0.1, 6.2))
        .translated(rng.range(-50.0, 50.0), rng.range(-50.0, 50.0));
    assert!(c.iso(&iso).is_err());
    let q = Iso2::rotation(std::f64::consts::FRAC_PI_2 * (1 + rng.below(3)) as f64)
        .translated(rng.range(-50.0, 50.0), rng.range(-50.0, 50.0));
    let tc = c.iso(&q).unwrap();
    let base = pdelta::solve_pdelta_2d(&c.s, 100, 1e-12).unwrap();
    let got = pdelta::solve_pdelta_2d(&tc.s, 100, 1e-12).unwrap();
    assert!(base.converged);
    assert!(
        got.converged,
        "rotated equilibrium did not converge in {} iterations",
        got.iterations
    );
    assert!(!pdelta::solve_pdelta_2d(&tc.s, 1, 1e-12).unwrap().converged);
    let certified =
        dedaliano_engine::certify::pdelta::certify_pdelta_2d(&tc.s, 100, 1e-12).unwrap();
    assert!(certified.results.converged);
    assert!(got.iterations > 1);
    assert!(
        !pdelta::solve_pdelta_2d(&tc.s, got.iterations - 1, 1e-12)
            .unwrap()
            .converged
    );
    assert!(
        pdelta::solve_pdelta_2d(&tc.s, got.iterations, 1e-12)
            .unwrap()
            .converged
    );
    let expected = crate::response::static_2d(&base.results).iso2(&q).unwrap();
    let actual = crate::response::static_2d(&got.results);
    let cond = dedaliano_engine::metamorphic::conditioning::of_2d(&tc.s).unwrap();
    let comparison = crate::analysis_accuracy::compare(
        &actual,
        &expected,
        cond.lchar,
        crate::checks2::rel_for("P-Delta", 1e-10, &cond),
        crate::checks2::load_floor_2d(&tc.s, cond.lchar),
        cond.compliance(),
    )
    .unwrap();
    assert!(comparison.values > 0 && comparison.refusals == 0);
    if let Ok(path) = std::env::var("FLIP_RIGID_CASES") {
        std::fs::write(
            path,
            serde_json::to_string(&json!([{"input":c.s},{"input":tc.s}])).unwrap(),
        )
        .unwrap();
    }
}

use dedaliano_engine::{
    metamorphic::{
        planes::{embed_2d, Plane},
        units::Units,
    },
    solver::{corotational, linear},
    types::*,
};
use serde_json::{json, Value};

fn close(actual: f64, expected: f64, scale: f64) {
    assert!(
        actual.is_finite() && (actual - expected).abs() <= 1e-10 * scale,
        "{actual:e} != {expected:e} (scale {scale:e})"
    );
}

fn tip_reference(s: &SolverInput, nonlinear: bool, geometric: bool) -> [f64; 3] {
    assert_eq!(s.elements.len(), 1);
    let ni = &s.nodes["1"];
    let nj = &s.nodes["2"];
    let length = (nj.x - ni.x).hypot(nj.z - ni.z);
    let c = (nj.x - ni.x) / length;
    let sn = (nj.z - ni.z) / length;
    let SolverLoad::Nodal(load) = &s.loads[0] else {
        panic!("nodal load")
    };
    let p = c * load.fx + sn * load.fz;
    let q = -sn * load.fx + c * load.fz;
    let ea = 1000.0 * s.materials["1"].e * s.sections["1"].a;
    let ei = 1000.0 * s.materials["1"].e * s.sections["1"].iz;
    let (u, v, r) = if nonlinear {
        let balance = |beta: f64| {
            let (sb, cb) = beta.sin_cos();
            let n = p * cb + q * sb;
            let shear = -p * sb + q * cb;
            let deformed = length * (1.0 + n / ea);
            beta - length * (shear * deformed + 1.5 * load.my) / (3.0 * ei)
        };
        let (mut lo, mut hi) = (-0.1, 0.1);
        assert!(balance(lo) < 0.0 && balance(hi) > 0.0);
        for _ in 0..100 {
            let mid = (lo + hi) / 2.0;
            if balance(mid) > 0.0 {
                hi = mid;
            } else {
                lo = mid;
            }
        }
        let beta = (lo + hi) / 2.0;
        let (sb, cb) = beta.sin_cos();
        let extension = length * (p * cb + q * sb) / ea;
        (
            extension * cb - 2.0 * length * (beta / 2.0).sin().powi(2),
            (length + extension) * sb,
            1.5 * beta + load.my * length / (4.0 * ei),
        )
    } else {
        let n = if geometric { p } else { 0.0 };
        let a = 12.0 * ei / length.powi(3) + 6.0 * n / (5.0 * length);
        let b = -6.0 * ei / length.powi(2) - n / 10.0;
        let d = 4.0 * ei / length + 2.0 * n * length / 15.0;
        let determinant = a * d - b * b;
        assert!(determinant > 0.0);
        (
            p * length / ea,
            (d * q - b * load.my) / determinant,
            (a * load.my - b * q) / determinant,
        )
    };
    [c * u - sn * v, sn * u + c * v, r]
}

fn check_tip_2d(s: &SolverInput, r: &AnalysisResults, expected: [f64; 3]) {
    assert_eq!(r.displacements.len(), s.nodes.len());
    let tip = r.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let length = (s.nodes["2"].x - s.nodes["1"].x).hypot(s.nodes["2"].z - s.nodes["1"].z);
    let scale = expected[0]
        .hypot(expected[1])
        .max(length * expected[2].abs());
    assert!(scale > 0.0);
    for (a, e) in [tip.ux, tip.uz, length * tip.ry].into_iter().zip([
        expected[0],
        expected[1],
        length * expected[2],
    ]) {
        close(a, e, scale);
    }
}

fn expected_3d(expected: [f64; 3], plane: Plane) -> Value {
    let u = plane.point(expected[0], expected[1]);
    let r = plane.normal().map(|v| v * expected[2]);
    json!({"nodeId":2,"ux":u[0],"uy":u[1],"uz":u[2],"rx":r[0],"ry":r[1],"rz":r[2]})
}

fn check_tip_3d(s: &SolverInput, result: &AnalysisResults3D, expected: [f64; 3], plane: Plane) {
    let tip = result
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap();
    let e = expected_3d(expected, plane);
    let length = (s.nodes["2"].x - s.nodes["1"].x).hypot(s.nodes["2"].z - s.nodes["1"].z);
    let scale = expected[0]
        .hypot(expected[1])
        .max(length * expected[2].abs());
    for (key, value) in [
        ("ux", tip.ux),
        ("uy", tip.uy),
        ("uz", tip.uz),
        ("rx", tip.rx * length),
        ("ry", tip.ry * length),
        ("rz", tip.rz * length),
    ] {
        close(
            value,
            e[key].as_f64().unwrap() * if key.starts_with('r') { length } else { 1.0 },
            scale,
        );
    }
}

fn minimal_761() -> SolverInput {
    let mut v = crate::generated::model(20261020, false);
    v["nodes"].as_object_mut().unwrap().remove("3");
    v["elements"].as_object_mut().unwrap().remove("2");
    v["loads"].as_array_mut().unwrap().pop();
    serde_json::from_value(v).unwrap()
}

#[test]
fn corrected_cantilevers_match_independent_element_equilibria() {
    let issue_971: SolverInput =
        serde_json::from_str(include_str!("../metamorphic_corpus/nightly/issue-971.json")).unwrap();
    let mut calls = Vec::new();
    for (issue, base, analysis) in [
        (761, minimal_761(), "corotational"),
        (971, issue_971, "P-Delta"),
    ] {
        let base = Case2::new(format!("independent-{issue}"), base);
        for (l, f) in [(1.0, 1.0), (1e-3, 1e3), (25.0, 1e-2), (0.3048, 4.448)] {
            let c = base.units(&Units::froude(l, f));
            for iso in [
                Iso2::rotation(0.0),
                Iso2::rotation(0.7).translated(3.0, -2.0),
                Iso2::mirror_line(0.7),
            ] {
                let c = c.iso(&iso).unwrap();
                let s = &c.s;
                let expected = tip_reference(s, issue == 761, issue == 971);
                let linear_expected = tip_reference(s, false, false);
                check_tip_2d(s, &linear::solve_2d(s).unwrap(), linear_expected);
                let got = if issue == 761 {
                    let r = corotational::solve_corotational_2d(s, 100, 1e-10, 4, false).unwrap();
                    assert!(r.converged);
                    r.results
                } else {
                    let r = pdelta::solve_pdelta_2d(s, 100, 1e-12).unwrap();
                    assert!(r.converged && r.is_stable);
                    r.results
                };
                check_tip_2d(s, &got, expected);
                if issue == 971 {
                    let certified =
                        dedaliano_engine::certify::pdelta::certify_pdelta_2d(s, 100, 1e-12)
                            .unwrap();
                    assert!(certified.results.converged);
                    check_tip_2d(s, &certified.results.results, expected);
                    calls.push(json!({"api":"certify_pdelta_2d","input":s,"expected":expected}));
                }
                let exported = if issue == 761 {
                    dedaliano_engine::solve_corotational_2d(
                        &serde_json::to_string(s).unwrap(),
                        100,
                        1e-10,
                        4,
                    )
                    .unwrap()
                } else {
                    dedaliano_engine::solve_pdelta_2d(
                        &serde_json::to_string(s).unwrap(),
                        100,
                        1e-12,
                    )
                    .unwrap()
                };
                let exported: Value = serde_json::from_str(&exported).unwrap();
                assert_eq!(exported["converged"], true);
                check_tip_2d(
                    s,
                    &serde_json::from_value(exported["results"].clone()).unwrap(),
                    expected,
                );
                calls.push(json!({"api":"solve_2d","input":s,"expected":linear_expected}));
                calls.push(json!({"api":if issue == 761 {"solve_corotational_2d"} else {"solve_pdelta_2d"},"input":s,"expected":expected,"length":l,"issue":issue}));
                for plane in Plane::ALL {
                    let spatial = embed_2d(s, plane).unwrap();
                    check_tip_3d(
                        s,
                        &linear::solve_3d(&spatial).unwrap(),
                        linear_expected,
                        plane,
                    );
                    let got = if issue == 761 {
                        let r = corotational::solve_corotational_3d(&spatial, 100, 1e-10, 4, false)
                            .unwrap();
                        assert!(r.converged);
                        r.results
                    } else {
                        let r = pdelta::solve_pdelta_3d(&spatial, 100, 1e-12).unwrap();
                        assert!(r.converged && r.is_stable);
                        r.results
                    };
                    check_tip_3d(s, &got, expected, plane);
                    if issue == 971 {
                        let certified = dedaliano_engine::certify::pdelta::certify_pdelta_3d(
                            &spatial, 100, 1e-12,
                        )
                        .unwrap();
                        assert!(certified.results.converged);
                        check_tip_3d(s, &certified.results.results, expected, plane);
                        calls.push(json!({"api":"certify_pdelta_3d","input":spatial,"expected3d":expected_3d(expected,plane)}));
                    }
                    calls.push(json!({"api":"solve_3d","input":spatial,"expected3d":expected_3d(linear_expected,plane)}));
                    calls.push(json!({"api":if issue == 761 {"solve_corotational_3d"} else {"solve_pdelta_3d"},"input":spatial,"expected3d":expected_3d(expected,plane),"length":l,"issue":issue}));
                }
            }
        }
        eprintln!(
            "#{issue} {analysis}: independent reference completed in 2D and all three 3D planes"
        );
    }
    if let Ok(path) = std::env::var("FLIP_WASM_CASES") {
        std::fs::write(path, serde_json::to_string(&calls).unwrap()).unwrap();
    }
}

fn supported_response(
    r: &crate::response::Resp,
    expected: &crate::response::Resp,
    l: f64,
    force: f64,
    compliance: [f64; 2],
) -> Result<(), String> {
    assert!(r.1.is_empty() && expected.1.is_empty());
    let report = dedaliano_engine::metamorphic::compare::compare_with_compliance(
        &r.flat(),
        &expected.flat(),
        l,
        1e-10,
        force,
        compliance,
    )?;
    assert!(report.values > 0 && report.refusals == 0);
    Ok(())
}

#[test]
fn supported_nodal_load_mirrors_keep_the_exact_zero_strain_answer() {
    let s: SolverInput = serde_json::from_str(include_str!(
        "../metamorphic_corpus/nightly/issue-1100.json"
    ))
    .unwrap();
    let base = Case2::new("random-11-input", s);
    let mut calls = Vec::new();
    for (length, force) in [(1.0, 1.0), (1e-3, 1e3), (25.0, 1e-2), (0.3048, 4.448)] {
        let c = base.units(&Units::froude(length, force));
        let mut mirrors = vec![
            Iso2::rotation(0.0),
            Iso2::mirror_line(0.7),
            Iso2::rotation(0.7).translated(3.0, -2.0),
        ];
        for analysis in ["P-Delta", "fiber nonlinear"] {
            let mut rng =
                Rng::new(20759 ^ crate::checks2::hash(&base.name) ^ crate::checks2::hash(analysis));
            rng.range(0.1, 6.2);
            rng.range(-50.0, 50.0);
            rng.range(-50.0, 50.0);
            rng.below(3);
            rng.range(-50.0, 50.0);
            rng.range(-50.0, 50.0);
            mirrors.push(
                Iso2::mirror_line(rng.range(0.0, 3.1))
                    .translated(rng.range(-50.0, 50.0), rng.range(-50.0, 50.0)),
            );
        }
        for iso in mirrors {
            let c = c.iso(&iso).unwrap();
            let mut expected = linear::solve_2d(&c.s).unwrap();
            let SolverLoad::Nodal(load) = &c.s.loads[0] else {
                panic!("nodal")
            };
            let span =
                (c.s.nodes["2"].x - c.s.nodes["1"].x).hypot(c.s.nodes["2"].z - c.s.nodes["1"].z);
            let ei = 1000.0 * c.s.materials["1"].e * c.s.sections["1"].iz;
            let compliance = [span.powi(3) / ei, span / ei];
            for d in &expected.displacements {
                close(d.ux, 0.0, force * compliance[0]);
                close(d.uz, 0.0, force * compliance[0]);
                close(d.ry, 0.0, force * compliance[1]);
            }
            let reaction = expected
                .reactions
                .iter()
                .find(|r| r.node_id == load.node_id)
                .unwrap();
            close(reaction.rx, -load.fx, load.fx.hypot(load.fz));
            close(reaction.rz, -load.fz, load.fx.hypot(load.fz));
            for d in &mut expected.displacements {
                d.ux = 0.0;
                d.uz = 0.0;
                d.ry = 0.0;
            }
            let reference = crate::response::static_2d(&expected);
            for a in crate::ana2::rows().into_iter().filter(|a| {
                ["linear", "P-Delta", "fiber nonlinear", "corotational"].contains(&a.name)
            }) {
                let r = (a.run)(&c).unwrap();
                supported_response(&r, &reference, length, force, compliance).unwrap();
                let mut wrong = r.clone();
                let displacement = wrong.0.iter_mut().find(|i| i.tag == "u").unwrap();
                displacement.v[0] = length * 1e-10;
                assert!(supported_response(&wrong, &reference, length, force, compliance).is_err());
            }
            let sections: std::collections::HashMap<_, _> = c
                .s
                .sections
                .values()
                .map(|section| {
                    let (b, h) = crate::ana2::rect(section.a, section.iz);
                    (
                        section.id.to_string(),
                        crate::ana2::rect_fibers(b, h, 40, 1, crate::ana2::mat_e(&c.s, section.id)),
                    )
                })
                .collect();
            calls.push(json!({"input":c.s,"dimension":2,"fiberInput":{"solver":c.s,"fiberSections":sections,"nIntegrationPoints":5,"maxIter":60,"tolerance":1e-10,"nIncrements":2,"modifiedNr":false}}));
        }
        for plane in Plane::ALL {
            let spatial = embed_2d(&c.s, plane).unwrap();
            let c = crate::case::Case3::new("supported-1100", spatial);
            let span = (base.s.nodes["2"].x - base.s.nodes["1"].x) * length;
            let ei =
                1000.0 * base.s.materials["1"].e * base.s.sections["1"].iz * force * length.powi(2);
            let compliance = [span.powi(3) / ei, span / ei];
            let reference = crate::response::static_3d(&linear::solve_3d(&c.s).unwrap());
            for a in crate::ana3::rows().into_iter().filter(|a| {
                ["linear", "P-Delta", "fiber nonlinear", "corotational"].contains(&a.name)
            }) {
                supported_response(&(a.run)(&c).unwrap(), &reference, length, force, compliance)
                    .unwrap();
            }
            let sections: std::collections::HashMap<_, _> =
                c.s.sections
                    .values()
                    .map(|section| {
                        let (b, h) = crate::ana3::rect3(section);
                        (
                            section.id.to_string(),
                            crate::ana3::rect_fibers(b, h, 12, 12, c.s.materials["1"].e),
                        )
                    })
                    .collect();
            calls.push(json!({"input":c.s,"dimension":3,"fiberInput":{"solver":c.s,"fiberSections":sections,"nIntegrationPoints":5,"maxIter":60,"tolerance":1e-10,"nIncrements":2,"modifiedNr":false}}));
        }
    }
    if let Ok(path) = std::env::var("FLIP_SUPPORTED_CASES") {
        std::fs::write(path, serde_json::to_string(&calls).unwrap()).unwrap();
    }
}

#[test]
fn independent_cantilever_oracle_rejects_zero_and_reversed_answers() {
    let s = minimal_761();
    let expected = tip_reference(&s, true, false);
    let mut result = corotational::solve_corotational_2d(&s, 100, 1e-10, 4, false).unwrap();
    assert!(result.converged);
    check_tip_2d(&s, &result.results, expected);
    verify_planar_members(&s, &result.results).unwrap();
    for multiplier in [0.0, -1.0] {
        let tip = result
            .results
            .displacements
            .iter_mut()
            .find(|d| d.node_id == 2)
            .unwrap();
        tip.ux = multiplier * expected[0];
        tip.uz = multiplier * expected[1];
        tip.ry = multiplier * expected[2];
        assert!(std::panic::catch_unwind(|| check_tip_2d(&s, &result.results, expected)).is_err());
        assert!(verify_planar_members(&s, &result.results).is_err());
    }
}

#[test]
fn rolled_spatial_cantilever_rotation_satisfies_independent_member_equilibrium() {
    use dedaliano_engine::metamorphic::transform::Iso3;
    let s: SolverInput3D = serde_json::from_str(include_str!(
        "../metamorphic_corpus/feature_matrix/3d-local-axes--roll-angle--rolled-90--with.json"
    ))
    .unwrap();
    let c = crate::case::Case3::new(
        "feature_matrix/3d-local-axes--roll-angle--rolled-90--with",
        s,
    );
    let mut rng = Rng::new(
        20261105 ^ crate::checks2::hash(&c.name) ^ crate::checks2::hash("corotational") ^ 0x3d,
    );
    let t = [
        rng.range(-40.0, 40.0),
        rng.range(-40.0, 40.0),
        rng.range(-40.0, 40.0),
    ];
    let iso = if rng.f64() < 0.6 {
        Iso3::random(&mut rng)
    } else {
        Iso3::axis_permutation(1 + rng.below(23))
    }
    .translated(t);
    let mut calls = Vec::new();
    for iso in [
        Iso3::from_euler(0.0, 0.0, 0.0),
        iso,
        Iso3::axis_permutation(7),
    ] {
        let tc = c.iso(&iso).unwrap();
        let r = corotational::solve_corotational_3d(&tc.s, 100, 1e-10, 4, false).unwrap();
        assert!(r.converged);
        let angle = c.s.elements["1"].roll_angle.unwrap().to_radians();
        let axes = [
            [1.0, 0.0, 0.0],
            [0.0, angle.cos(), angle.sin()],
            [0.0, -angle.sin(), angle.cos()],
        ]
        .map(|v| std::array::from_fn(|i| (0..3).map(|j| iso.r[i][j] * v[j]).sum()));
        crate::roll_reference::verify(&tc.s, &r.results, axes).unwrap();
        let mut wrong = r.results.clone();
        for d in &mut wrong.displacements {
            d.ux = 0.0;
            d.uy = 0.0;
            d.uz = 0.0;
            d.rx = 0.0;
            d.ry = 0.0;
            d.rz = 0.0;
        }
        assert!(crate::roll_reference::verify(&tc.s, &wrong, axes).is_err());
        calls.push(json!({"input":tc.s,"reference":r.results}));
    }
    if let Ok(path) = std::env::var("FLIP_ROLL_CASES") {
        std::fs::write(path, serde_json::to_string(&calls).unwrap()).unwrap();
    }
}

fn verify_planar_members(s: &SolverInput, r: &AnalysisResults) -> Result<(), String> {
    let mut balance: std::collections::BTreeMap<usize, [f64; 3]> =
        s.nodes.values().map(|n| (n.id, [0.0; 3])).collect();
    let mut scale: f64 = 0.0;
    let length = s
        .nodes
        .values()
        .flat_map(|a| s.nodes.values().map(move |b| (b.x - a.x).hypot(b.z - a.z)))
        .fold(0.0_f64, f64::max);
    for elem in s.elements.values() {
        let ni = &s.nodes[&elem.node_i.to_string()];
        let nj = &s.nodes[&elem.node_j.to_string()];
        let ui = r.displacements.iter().find(|d| d.node_id == ni.id).unwrap();
        let uj = r.displacements.iter().find(|d| d.node_id == nj.id).unwrap();
        let d = [nj.x - ni.x, nj.z - ni.z];
        let du = [uj.ux - ui.ux, uj.uz - ui.uz];
        let l0 = d[0].hypot(d[1]);
        let chord = [d[0] + du[0], d[1] + du[1]];
        let ln = chord[0].hypot(chord[1]);
        let beta = (d[0] * du[1] - d[1] * du[0]).atan2(l0 * l0 + d[0] * du[0] + d[1] * du[1]);
        let ti = ui.ry - beta;
        let tj = uj.ry - beta;
        let e = 1000.0 * s.materials[&elem.material_id.to_string()].e;
        let sec = &s.sections[&elem.section_id.to_string()];
        let n = e * sec.a / l0
            * (2.0 * (d[0] * du[0] + d[1] * du[1]) + du[0] * du[0] + du[1] * du[1])
            / (ln + l0);
        let mi = e * sec.iz / l0 * (4.0 * ti + 2.0 * tj);
        let mj = e * sec.iz / l0 * (2.0 * ti + 4.0 * tj);
        let shear = -(mi + mj) / ln;
        let f = [
            (n * chord[0] - shear * chord[1]) / ln,
            (n * chord[1] + shear * chord[0]) / ln,
        ];
        for (node, force) in [(ni.id, [-f[0], -f[1], mi]), (nj.id, [f[0], f[1], mj])] {
            for i in 0..3 {
                balance.get_mut(&node).unwrap()[i] += force[i];
            }
        }
    }
    for load in &s.loads {
        let SolverLoad::Nodal(load) = load else {
            panic!("nodal")
        };
        scale = scale.max(load.fx.hypot(load.fz).hypot(load.my / length));
        for (i, v) in [load.fx, load.fz, load.my].into_iter().enumerate() {
            balance.get_mut(&load.node_id).unwrap()[i] -= v;
        }
    }
    for reaction in &r.reactions {
        for (i, v) in [reaction.rx, reaction.rz, reaction.my]
            .into_iter()
            .enumerate()
        {
            balance.get_mut(&reaction.node_id).unwrap()[i] -= v;
        }
    }
    for (node, values) in balance {
        for (i, v) in values.into_iter().enumerate() {
            if !v.is_finite() || v.abs() > 1e-9 * scale * if i == 2 { length } else { 1.0 } {
                return Err(format!(
                    "independent 2D member equilibrium at {node}: {values:?}"
                ));
            }
        }
    }
    Ok(())
}

pub(crate) fn verify_generated_corotational_equilibria(count: u64) {
    for k in 0..count {
        let seed = crate::seed().wrapping_add(k);
        let s: SolverInput = serde_json::from_value(crate::generated::model(seed, false)).unwrap();
        let r = corotational::solve_corotational_2d(&s, 100, 1e-10, 4, false).unwrap();
        assert!(r.converged);
        verify_planar_members(&s, &r.results).unwrap();
        let spatial: SolverInput3D =
            serde_json::from_value(crate::generated::model(seed, true)).unwrap();
        let r = corotational::solve_corotational_3d(&spatial, 100, 1e-10, 4, false).unwrap();
        assert!(r.converged);
        crate::roll_reference::verify(
            &spatial,
            &r.results,
            [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
        )
        .unwrap();
    }
}

fn r19_physical_cantilever(dim: usize) {
    let original: SolverInput = serde_json::from_str(include_str!("../metamorphic_corpus/nightly/issue-971.json")).unwrap();
    let base = Case2::new("r19-971", original);
    let mut calls = Vec::new();
    for (l, f) in [(1.0, 1.0), (1e-3, 1e3), (25.0, 1e-2), (0.3048, 4.448)] {
        for iso in [Iso2::rotation(0.0), Iso2::rotation(0.7).translated(3.0,-2.0), Iso2::mirror_line(0.7)] {
            let c = base.units(&Units::froude(l,f)).iso(&iso).unwrap();
            let expected = tip_reference(&c.s, false, true);
            for iterations in [0,100] {
                if dim == 2 {
                    let dofs = dedaliano_engine::solver::dof::DofNumbering::build_2d(&c.s);
                    for sparse in [false,true] {
                        let result = pdelta::solve_pdelta_2d_on(&c.s,&dofs,None,sparse,iterations,1e-12).unwrap();
                        let equilibrium = result.results.equilibrium.as_ref().unwrap();
                        eprintln!("r19 {dim}D sparse={sparse} iter={iterations} units={l:e}/{f:e} residual={:e}",equilibrium.relative_residual);
                        assert_eq!(equilibrium.residual_ok, iterations > 0);
                        assert_eq!(result.results.reactions.iter().all(|r|r.rx.is_finite() && r.rz.is_finite() && r.my.is_finite()), iterations > 0);
                        if iterations > 0 { check_tip_2d(&c.s,&result.results,expected); }
                    }
                } else {
                    for plane in Plane::ALL {
                        let spatial = embed_2d(&c.s,plane).unwrap();
                        let result = pdelta::solve_pdelta_3d(&spatial,iterations,1e-12).unwrap();
                        let equilibrium = result.results.equilibrium.as_ref().unwrap();
                        eprintln!("r19 {dim}D iter={iterations} units={l:e}/{f:e} residual={:e}",equilibrium.relative_residual);
                        assert_eq!(equilibrium.residual_ok, iterations > 0);
                        assert_eq!(result.results.reactions.iter().all(|r|[r.fx,r.fy,r.fz,r.mx,r.my,r.mz].iter().all(|v|v.is_finite())), iterations > 0);
                        if iterations > 0 { check_tip_3d(&c.s,&result.results,expected,plane); }
                    }
                }
            }
            calls.push(json!({"dim":dim,"model":c.s,"expected":expected}));
        }
    }
    if let Ok(prefix) = std::env::var("R19_CANTILEVERS") {
        std::fs::write(format!("{prefix}-{dim}.json"),serde_json::to_string(&calls).unwrap()).unwrap();
    }
}

#[test]
#[ignore = "known wrong result: #1952"]
fn issue_1952_r19_physical_cantilever_2d() { r19_physical_cantilever(2); }

#[test]
#[ignore = "known wrong result: #1952"]
fn issue_1952_r19_physical_cantilever_3d() { r19_physical_cantilever(3); }
