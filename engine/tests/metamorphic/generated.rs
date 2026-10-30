use crate::{
    ana2, ana3,
    case::{Case2, Case3},
    checks2, checks3,
    tally::Tally,
};
use dedaliano_engine::metamorphic::Rng;
use serde_json::{json, Value};
use std::cell::Cell;

thread_local! { static STRICT: Cell<bool> = const { Cell::new(false) }; }

pub fn strict() -> bool {
    STRICT.with(Cell::get)
}

pub(crate) fn model(seed: u64, spatial: bool) -> Value {
    let mut rng = Rng::new(seed);
    let l = rng.range(1.5, 3.0);
    let a = rng.range(0.015, 0.025);
    let iz = rng.range(1.5e-4, 3e-4);
    let mut v = json!({
        "nodes": {
            "1": {"id":1,"x":0.0,"z":0.0},
            "2": {"id":2,"x":l,"z":0.0},
            "3": {"id":3,"x":2.0*l,"z":0.0}
        },
        "elements": {
            "1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1},
            "2": {"id":2,"type":"frame","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":1}
        },
        "materials": {"1":{"id":1,"e":rng.range(180000.0,220000.0),"nu":0.3}},
        "sections": {"1":{"id":1,"a":a,"iz":iz,"iy":iz*0.63,"j":iz*0.4}},
        "supports": {"1":{"id":1,"nodeId":1,"type":"fixed"}},
        "loads": [
            {"type":"nodal","data":{"nodeId":2,"fx":-0.1,"fz":-0.15,"my":0.03}},
            {"type":"nodal","data":{"nodeId":3,"fx":-0.2,"fz":-0.3,"my":0.02}}
        ]
    });
    if spatial {
        for n in v["nodes"].as_object_mut().unwrap().values_mut() {
            n["y"] = json!(0.0);
        }
        v["supports"]["1"] =
            json!({"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true});
        for load in v["loads"].as_array_mut().unwrap() {
            load["data"]["fy"] = json!(0.07);
            load["data"]["mx"] = json!(0.01);
            load["data"]["mz"] = json!(0.04);
        }
    }
    v
}

pub(crate) struct Strict(bool);

impl Strict {
    pub(crate) fn enter() -> Self {
        Self(STRICT.with(|s| s.replace(true)))
    }
}

impl Drop for Strict {
    fn drop(&mut self) {
        STRICT.with(|s| s.set(self.0));
    }
}

fn sweep(count: u64, only: Option<&str>) {
    let _strict = Strict::enter();
    let inv3: Vec<_> = crate::INV_3D
        .iter()
        .copied()
        .chain(["reflection"])
        .collect();
    let start = std::time::Instant::now();
    let t2 = Tally::default();
    let t3 = Tally::default();
    let mut a2 = ana2::rows();
    let mut a3 = ana3::rows();
    a2.push(ana2::Ana2 {
        name: "Winkler (active)",
        law: ana2::Law::Linear,
        axis_bound: false,
        iter_tol: 0.0,
        full_static: false,
        run: foundation_2d,
    });
    a3.push(ana3::Ana3 {
        name: "Winkler (active)",
        law: ana2::Law::Linear,
        motion: ana3::Motion::Any,
        iter_tol: 0.0,
        full_static: false,
        run: foundation_3d,
    });
    a2.push(ana2::Ana2 {
        name: "contact (active gap)",
        law: ana2::Law::Nonlinear,
        axis_bound: true,
        iter_tol: 1e-10,
        full_static: false,
        run: gap_2d,
    });
    a3.push(ana3::Ana3 {
        name: "contact (active gap)",
        law: ana2::Law::Nonlinear,
        motion: ana3::Motion::AxisPerm,
        iter_tol: 1e-10,
        full_static: false,
        run: gap_3d,
    });
    a2.retain(|a| only.map_or(true, |name| a.name == name));
    a3.retain(|a| only.map_or(true, |name| a.name == name));
    assert!(
        !a2.is_empty() || !a3.is_empty(),
        "unknown generated analysis: {only:?}"
    );
    for k in 0..count {
        let before = t2.failures().len() + t3.failures().len();
        let seed = crate::seed().wrapping_add(k);
        let c2 = Case2::new(
            format!("generated/{seed}/2d"),
            serde_json::from_value(model(seed, false)).unwrap(),
        );
        let c3 = Case3::new(
            format!("generated/{seed}/3d"),
            serde_json::from_value(model(seed, true)).unwrap(),
        );
        for a in &a2 {
            let invs: Vec<_> = crate::INV_2D
                .iter()
                .copied()
                .filter(|inv| {
                    if a.name == "contact (active gap)" {
                        return ["units", "relabel", "reversal"].contains(inv);
                    }
                    if only.is_none()
                        && a.name == "corotational"
                        && ["rotation", "mirror"].contains(inv)
                    {
                        t2.record(
                            a.name,
                            inv,
                            &c2.name,
                            crate::tally::Verdict::Ignored("ignored(#761)"),
                        );
                        false
                    } else {
                        true
                    }
                })
                .collect();
            checks2::check_case(
                &checks2::Ctx {
                    tally: &t2,
                    rng_seed: seed,
                },
                &c2,
                std::slice::from_ref(a),
                &invs,
            );
        }
        for a in &a3 {
            let invs: Vec<_> = crate::INV_3D
                .iter()
                .copied()
                .filter(|inv| {
                    if a.name == "contact (active gap)" {
                        return ["units", "relabel", "reversal"].contains(inv);
                    }
                    if only.is_none() && a.name == "corotational" && *inv == "rotation" {
                        t3.record(
                            a.name,
                            inv,
                            &c3.name,
                            crate::tally::Verdict::Ignored("ignored(#761)"),
                        );
                        false
                    } else {
                        true
                    }
                })
                .collect();
            checks3::check_case(
                &checks3::Ctx {
                    tally: &t3,
                    rng_seed: seed,
                },
                &c3,
                std::slice::from_ref(a),
                &invs,
            );
            t3.record(a.name, "reflection", &c3.name, reflection_3d(a, &c3));
        }
        if t2.failures().len() + t3.failures().len() > before {
            if let Ok(dir) = std::env::var("METAMORPHIC_REPORT_DIR") {
                std::fs::create_dir_all(&dir).unwrap();
                for (dim, spatial) in [("2d", false), ("3d", true)] {
                    std::fs::write(
                        format!("{dir}/seed-{seed}-{dim}.json"),
                        serde_json::to_string_pretty(&model(seed, spatial)).unwrap(),
                    )
                    .unwrap();
                }
            }
            eprintln!(
                "Reproducer seed={seed}\n2D={}\n3D={}",
                model(seed, false),
                model(seed, true)
            );
        }
    }
    println!(
        "generated 2D\n{}",
        crate::render(
            &t2,
            &a2.iter().map(|a| a.name).collect::<Vec<_>>(),
            crate::INV_2D
        )
    );
    println!(
        "generated 3D\n{}",
        crate::render(&t3, &a3.iter().map(|a| a.name).collect::<Vec<_>>(), &inv3)
    );
    println!("generated sweep: {count} seeds, {:?}", start.elapsed());
    println!("{}{}", t2.report(), t3.report());
    if let Ok(dir) = std::env::var("METAMORPHIC_REPORT_DIR") {
        std::fs::create_dir_all(&dir).unwrap();
        for (dim, tally, names, invs) in [
            (
                "2d",
                &t2,
                a2.iter().map(|a| a.name).collect::<Vec<_>>(),
                crate::INV_2D,
            ),
            (
                "3d",
                &t3,
                a3.iter().map(|a| a.name).collect::<Vec<_>>(),
                &inv3,
            ),
        ] {
            std::fs::write(
                format!("{dir}/generated_{dim}.md"),
                crate::render(tally, &names, invs) + &tally.report(),
            )
            .unwrap();
        }
    }
    assert_coverage(
        &t2,
        &a2.iter().map(|a| a.name).collect::<Vec<_>>(),
        false,
        count,
        only,
    );
    assert_coverage(
        &t3,
        &a3.iter().map(|a| a.name).collect::<Vec<_>>(),
        true,
        count,
        only,
    );
    let failures: Vec<_> = t2.failures().into_iter().chain(t3.failures()).collect();
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn generated_fast() {
    sweep(128, None);
}

#[test]
#[ignore = "large deterministic seed sweep"]
fn metamorphic_nightly_generated() {
    sweep(4096, crate::only().as_deref());
}

fn foundation_2d(c: &Case2) -> Result<crate::response::Resp, String> {
    use dedaliano_engine::solver::winkler::*;
    let springs =
        c.s.elements
            .values()
            .map(|e| {
                let sec = &c.s.sections[&e.section_id.to_string()];
                let mat = &c.s.materials[&e.material_id.to_string()];
                FoundationSpring {
                    element_id: e.id,
                    kf: mat.e * 1000.0 * sec.iz / sec.a.powi(2) * 1e-3,
                }
            })
            .collect();
    Ok(crate::response::static_2d(&solve_winkler_2d(
        &WinklerInput {
            solver: c.s.clone(),
            foundation_springs: springs,
        },
    )?))
}

fn foundation_3d(c: &Case3) -> Result<crate::response::Resp, String> {
    use dedaliano_engine::solver::winkler::*;
    let springs =
        c.s.elements
            .values()
            .map(|e| {
                let sec = &c.s.sections[&e.section_id.to_string()];
                let mat = &c.s.materials[&e.material_id.to_string()];
                let k = mat.e * 1000.0 * sec.iz / sec.a.powi(2) * 1e-3;
                FoundationSpring3D {
                    element_id: e.id,
                    ky: Some(k),
                    kz: Some(k * 0.7),
                }
            })
            .collect();
    Ok(crate::response::static_3d(&solve_winkler_3d(
        &WinklerInput3D {
            solver: c.s.clone(),
            foundation_springs: springs,
        },
    )?))
}

#[test]
#[ignore = "safety #761"]
fn corotational_rigid_motion_reproducer() {
    use dedaliano_engine::metamorphic::transform::{Iso2, Iso3};
    use dedaliano_engine::solver::corotational;
    let mut failures = Vec::new();
    for spatial in [false, true] {
        let mut v = model(20261020, spatial);
        v["nodes"].as_object_mut().unwrap().remove("3");
        v["elements"].as_object_mut().unwrap().remove("2");
        v["loads"].as_array_mut().unwrap().pop();
        if spatial {
            let c = Case3::new("minimal", serde_json::from_value(v).unwrap());
            let base = corotational::solve_corotational_3d(&c.s, 100, 1e-10, 4, false).unwrap();
            for x in [0.0] {
                let tc = c
                    .iso(&Iso3::from_euler(0.3, 0.7, 1.1).translated([x, x, x]))
                    .unwrap();
                let got = corotational::solve_corotational_3d(&tc.s, 100, 1e-10, 4, false).unwrap();
                assert!(base.converged);
                if !got.converged {
                    failures.push("3D rotation");
                }
            }
        } else {
            let c = Case2::new("minimal", serde_json::from_value(v).unwrap());
            let base = corotational::solve_corotational_2d(&c.s, 100, 1e-10, 4, false).unwrap();
            for x in [0.0] {
                let tc = c.iso(&Iso2::rotation(0.7).translated(x, x)).unwrap();
                let got = corotational::solve_corotational_2d(&tc.s, 100, 1e-10, 4, false).unwrap();
                assert!(base.converged);
                if !got.converged {
                    failures.push("2D rotation");
                }
            }
        }
    }
    assert!(failures.is_empty(), "safety #761: {failures:?}");
}

#[test]
#[ignore = "safety #761"]
fn generated_corotational_rigid_motions() {
    sweep(128, Some("corotational"));
}

fn gap_2d(c: &Case2) -> Result<crate::response::Resp, String> {
    use dedaliano_engine::solver::contact;
    let support = c.s.supports.values().next().unwrap().node_id;
    let sec = c.s.sections.values().next().unwrap();
    let e = c.s.materials.values().next().unwrap().e;
    let input: contact::ContactInput = serde_json::from_value(json!({
        "solver": c.s, "tolerance": 1e-10,
        "gapElements": [{"id":1,"nodeI":support,"nodeJ":c.probes.last().unwrap(),"direction":0,
            "initialGap":sec.a.sqrt()*1e-8,"stiffness":e*1000.0*sec.a.sqrt()}]
    }))
    .unwrap();
    let r = contact::solve_contact_2d(&input)?;
    if !r.converged || r.gap_status.len() != 1 || r.gap_status[0].status != "closed" {
        return Err(format!("active contact not exercised: {:?}", r.gap_status));
    }
    let base = dedaliano_engine::solver::linear::solve_2d(&c.s)?;
    let node = *c.probes.last().unwrap();
    let base_ux = base
        .displacements
        .iter()
        .find(|d| d.node_id == node)
        .unwrap()
        .ux;
    let active_ux = r
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == node)
        .unwrap()
        .ux;
    if !gap_changes_displacement(base_ux, active_ux, r.gap_status[0].force) {
        return Err("active gap has no physical effect".into());
    }
    Ok(crate::response::static_2d(&r.results))
}

fn gap_3d(c: &Case3) -> Result<crate::response::Resp, String> {
    use dedaliano_engine::solver::contact;
    let support = c.s.supports.values().next().unwrap().node_id;
    let sec = c.s.sections.values().next().unwrap();
    let e = c.s.materials.values().next().unwrap().e;
    let input: contact::ContactInput3D = serde_json::from_value(json!({
        "solver": c.s, "tolerance": 1e-10,
        "gapElements": [{"id":1,"nodeI":support,"nodeJ":c.probes.last().unwrap(),"direction":0,
            "initialGap":sec.a.sqrt()*1e-8,"stiffness":e*1000.0*sec.a.sqrt()}]
    }))
    .unwrap();
    let r = contact::solve_contact_3d(&input)?;
    if !r.converged || r.gap_status.len() != 1 || r.gap_status[0].status != "closed" {
        return Err(format!("active contact not exercised: {:?}", r.gap_status));
    }
    let base = dedaliano_engine::solver::linear::solve_3d(&c.s)?;
    let node = *c.probes.last().unwrap();
    let base_ux = base
        .displacements
        .iter()
        .find(|d| d.node_id == node)
        .unwrap()
        .ux;
    let active_ux = r
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == node)
        .unwrap()
        .ux;
    if !gap_changes_displacement(base_ux, active_ux, r.gap_status[0].force) {
        return Err("active gap has no physical effect".into());
    }
    Ok(crate::response::static_3d(&r.results))
}

#[test]
fn independent_mass_and_time_units() {
    use dedaliano_engine::metamorphic::{compare::compare_with_floor, units::Units};
    let u = Units {
        length: 0.2,
        force: 3.0,
        time: 7.0,
    };
    for seed in 0..8 {
        let c2 = Case2::new(
            "independent units",
            serde_json::from_value(model(seed, false)).unwrap(),
        );
        let c3 = Case3::new(
            "independent units",
            serde_json::from_value(model(seed, true)).unwrap(),
        );
        for a in ana2::rows()
            .into_iter()
            .filter(|a| ["modal", "time history", "harmonic"].contains(&a.name))
        {
            let expected = (a.run)(&c2).unwrap().units(&u);
            let tc = c2.units(&u);
            let got = (a.run)(&tc).unwrap();
            compare_with_floor(&got.flat(), &expected.flat(), 1.0, 1e-9, 0.0)
                .unwrap_or_else(|e| panic!("2d {} seed={seed}: {e}", a.name));
        }
        for a in ana3::rows()
            .into_iter()
            .filter(|a| ["modal", "time history", "harmonic"].contains(&a.name))
        {
            let expected = (a.run)(&c3).unwrap().units(&u);
            let tc = c3.units(&u);
            let got = (a.run)(&tc).unwrap();
            compare_with_floor(&got.flat(), &expected.flat(), 1.0, 1e-9, 0.0)
                .unwrap_or_else(|e| panic!("3d {} seed={seed}: {e}", a.name));
        }
    }
}

fn reflection_3d(a: &ana3::Ana3, c: &Case3) -> crate::tally::Verdict {
    use crate::{response::Kind, tally::Verdict};
    use dedaliano_engine::{
        element::compute_local_axes_3d, metamorphic::compare::compare_with_floor,
        types::SolverLoad3D,
    };
    if a.motion == ana3::Motion::AboutZ || a.name == "contact (active gap)" {
        return Verdict::NotApplicable;
    }
    let check = || -> Result<(), String> {
        let mut expected = checks3::run(a, c)?;
        let mut tc = c.clone();
        for n in tc.s.nodes.values_mut() {
            (n.x, n.y, n.z) = (-n.x, -n.y, -n.z);
        }
        for (key, e) in &c.s.elements {
            let i = &c.s.nodes[&e.node_i.to_string()];
            let j = &c.s.nodes[&e.node_j.to_string()];
            let (_, y, _) = compute_local_axes_3d(
                i.x,
                i.y,
                i.z,
                j.x,
                j.y,
                j.z,
                e.local_yx,
                e.local_yy,
                e.local_yz,
                e.roll_angle,
                false,
            );
            let te = tc.s.elements.get_mut(key).unwrap();
            (te.local_yx, te.local_yy, te.local_yz, te.roll_angle) =
                (Some(-y[0]), Some(-y[1]), Some(-y[2]), None);
        }
        for l in &mut tc.s.loads {
            if let SolverLoad3D::Nodal(n) = l {
                (n.fx, n.fy, n.fz) = (-n.fx, -n.fy, -n.fz);
            }
        }
        tc.p.ground = tc.p.ground.map(|x| -x);
        for it in &mut expected.0 {
            match (&it.kind, it.tag.as_str()) {
                (Kind::V3(d), _)
                    if *d == crate::response::Dim::NONE || *d == crate::response::Dim::MOMENT => {}
                (Kind::V3(_), _) => it.v.iter_mut().for_each(|x| *x = -*x),
                (Kind::Local(_, _), "V") if it.v.len() == 4 => {
                    it.v[2..].iter_mut().for_each(|x| *x = -*x)
                }
                (Kind::Local(_, _), "M") if it.v.len() == 6 => {
                    it.v[..4].iter_mut().for_each(|x| *x = -*x)
                }
                _ => {}
            }
        }
        let got = checks3::run(a, &tc)?;
        let cond = dedaliano_engine::metamorphic::conditioning::of_3d(&c.s)?;
        let rel = checks2::rel_for(a.name, a.iter_tol, &cond);
        compare_with_floor(
            &got.flat(),
            &expected.flat(),
            cond.lchar,
            rel,
            checks3::load_floor_3d(&c.s, cond.lchar),
        )?;
        Ok(())
    };
    match check() {
        Ok(()) => Verdict::Pass(0.0),
        Err(e) => Verdict::Fail(e),
    }
}

const MATRIX_2D: &[(&str, &str)] = &[
    ("linear", "PPPPPPPP---"),
    ("linear (dense reference)", "PPPPPPPP-P-"),
    ("linear (sparse path)", "PPPPPPPP-P-"),
    ("linear (PCG)", "PPPPPPPP-P-"),
    ("constrained", "PPPPPPPP-P-"),
    ("certified linear", "PPPPPPPP-P-"),
    ("load combinations", "PPPPPPPP-P-"),
    ("staged (one stage)", "PPPPPPPP-P-"),
    ("staged (loads in two stages)", "PPPPPPP--P-"),
    ("Winkler (no foundation)", "PPPPPPPP-P-"),
    ("contact (no gaps)", "PPPPPPP--P-"),
    ("SSI (no soil springs)", "PPPPPPP--P-"),
    ("creep & shrinkage (t = t0)", "PPPPPPP--P-"),
    ("P-Delta", "PPPPP------"),
    ("corotational", "IIPPP------"),
    ("material nonlinear", "PPPPP------"),
    ("fiber nonlinear", "PPPPP------"),
    ("cable solver", "-PPPP------"),
    ("modal", "PPPPP-----P"),
    ("certified modal", "PPPPP------"),
    ("buckling", "PPPPPP-----"),
    ("time history", "PPPPPPP----"),
    ("spectral", "-PPPP------"),
    ("harmonic", "PPPPPPP----"),
    ("plastic collapse", "PPPPPP-----"),
    ("kinematic check", "PPPPP------"),
    ("moving loads", "-PPPP------"),
    ("influence line", "-PPPP------"),
    ("Winkler (active)", "PPPPPPP----"),
    ("contact (active gap)", "--PPP------"),
];

const MATRIX_3D: &[(&str, &str)] = &[
    ("linear", "PPPPPPP---P"),
    ("linear (sparse path)", "PPPPPPP-P-P"),
    ("linear (PCG)", "PPPPPPP-P-P"),
    ("constrained", "PPPPPPP-P-P"),
    ("certified linear", "PPPPPPP-P-P"),
    ("load combinations", "PPPPPPP-P-P"),
    ("staged (one stage)", "PPPPPPP-P-P"),
    ("staged (loads in two stages)", "PPPPPP--P-P"),
    ("Winkler (no foundation)", "PPPPPPP-P-P"),
    ("contact (no gaps)", "PPPPPP--P-P"),
    ("SSI (no soil springs)", "PPPPPP--P-P"),
    ("creep & shrinkage (t = t0)", "PPPPPP--P-P"),
    ("P-Delta", "PPPP------P"),
    ("corotational", "IPPP------P"),
    ("material nonlinear", "PPPP------P"),
    ("fiber nonlinear", "PPPP------P"),
    ("cable solver", "PPPP-------"),
    ("modal", "PPPP-----PP"),
    ("certified modal", "PPPP------P"),
    ("buckling", "PPPPP-----P"),
    ("time history", "PPPPPP----P"),
    ("time history (ground motion)", "PPPP------P"),
    ("spectral", "PPPP------P"),
    ("harmonic", "PPPPPP----P"),
    ("plastic collapse", "PPPPP-----P"),
    ("kinematic check", "PPPP------P"),
    ("moving loads", "PPPP-------"),
    ("influence line", "PPPP-------"),
    ("Winkler (active)", "PPPPPP----P"),
    ("contact (active gap)", "-PPP-------"),
];

fn assert_coverage(t: &Tally, names: &[&str], spatial: bool, count: u64, only: Option<&str>) {
    let matrix = if spatial { MATRIX_3D } else { MATRIX_2D };
    let invs: Vec<_> = if spatial {
        crate::INV_3D
            .iter()
            .copied()
            .chain(["reflection"])
            .collect()
    } else {
        crate::INV_2D.to_vec()
    };
    let expected: Vec<_> = matrix
        .iter()
        .filter(|(name, _)| only.map_or(true, |only| *name == only))
        .collect();
    let actual: std::collections::BTreeSet<_> = names.iter().copied().collect();
    assert_eq!(actual.len(), names.len(), "duplicate adapters");
    assert_eq!(
        actual,
        expected.iter().map(|(name, _)| *name).collect(),
        "adapter/matrix mismatch"
    );
    let cells = t.cells.lock().unwrap();
    for (name, mask) in expected {
        assert_eq!(mask.len(), invs.len());
        for (inv, expected) in invs.iter().zip(mask.chars()) {
            let cell = cells
                .get(&(name.to_string(), inv.to_string()))
                .cloned()
                .unwrap_or_default();
            assert_eq!(
                cell.refused + cell.unrep + cell.inconclusive,
                0,
                "coverage lost: {name} × {inv}: {cell:?}"
            );
            if expected == 'I' && only.is_none() {
                assert_eq!(
                    cell.ignored.iter().copied().collect::<Vec<_>>(),
                    vec!["ignored(#761)"]
                );
                assert_eq!(cell.pass + cell.fails.len(), 0);
            } else {
                assert!(cell.ignored.is_empty(), "unexpected ignore: {name} × {inv}");
                assert_eq!(
                    cell.pass + cell.fails.len(),
                    if expected == '-' { 0 } else { count as usize },
                    "coverage lost: {name} × {inv}"
                );
            }
        }
    }
}

#[derive(Clone)]
pub(crate) struct ResponseShape {
    pub nodes: Vec<usize>,
    pub supports: Vec<usize>,
    pub elements: Vec<usize>,
    pub path: Vec<usize>,
    pub probe: Option<usize>,
    pub frequencies: usize,
    pub spatial: bool,
    pub reference: crate::response::Resp,
}

impl ResponseShape {
    pub(crate) fn of_2d(c: &Case2) -> Self {
        Self {
            nodes: c.s.nodes.values().map(|n| n.id).collect(),
            supports: c.s.supports.values().map(|s| s.node_id).collect(),
            elements: c.s.elements.values().map(|e| e.id).collect(),
            path: c.path.clone().unwrap_or_default(),
            probe: c.probes.first().copied(),
            frequencies: c.p.freqs.len(),
            spatial: false,
            reference: Default::default(),
        }
    }
    pub(crate) fn of_3d(c: &Case3) -> Self {
        Self {
            nodes: c.s.nodes.values().map(|n| n.id).collect(),
            supports: c.s.supports.values().map(|s| s.node_id).collect(),
            elements: c.s.elements.values().map(|e| e.id).collect(),
            path: c.path.clone().unwrap_or_default(),
            probe: c.probes.first().copied(),
            frequencies: c.p.freqs.len(),
            spatial: true,
            reference: Default::default(),
        }
    }
}

fn harmonic_reference(
    r: crate::response::Resp,
    probe: Option<usize>,
    frequencies: &[f64],
) -> Result<crate::response::Resp, String> {
    use crate::response::{Dim, Kind, Resp};
    let u = r
        .node_vec(probe.ok_or("missing probe")?, "u")
        .ok_or("missing static displacement")?;
    let mut reference = Resp::default();
    for (k, _) in frequencies.iter().enumerate().filter(|(_, f)| **f == 0.0) {
        let kind = if u.len() == 3 {
            Kind::V3(Dim::LEN)
        } else {
            Kind::V2(Dim::LEN)
        };
        reference.push(probe, None, &format!("H_re{k}"), kind.clone(), u.to_vec());
        reference.push(probe, None, &format!("H_im{k}"), kind, vec![0.0; u.len()]);
    }
    Ok(reference)
}

fn reference_2d(name: &str, c: &Case2) -> Result<crate::response::Resp, String> {
    use crate::response::{Dim, Kind, Resp};
    use dedaliano_engine::{
        postprocess::influence,
        solver::{linear, modal},
        types::*,
    };
    match name {
        "modal" | "certified modal" => {
            Ok(ana2::modal_resp(&modal::solve_modal_2d(&c.s, &c.dens, 6)?))
        }
        "harmonic" => harmonic_reference(
            crate::response::static_2d(&linear::solve_2d(&c.s)?),
            c.probes.first().copied(),
            &c.p.freqs,
        ),
        "influence line" => {
            let path = c.path.as_ref().ok_or("missing path")?;
            let mut s = c.s.clone();
            for support in s.supports.values_mut() {
                support.dx = None;
                support.dz = None;
                support.dry = None;
            }
            let mut reference = Resp::default();
            for &id in path {
                let e =
                    c.s.elements
                        .get(&id.to_string())
                        .ok_or("missing path element")?;
                for (t, node_id) in [(0, e.node_i), (1000, e.node_j)] {
                    s.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
                        node_id,
                        fx: 0.0,
                        fz: -1.0,
                        my: 0.0,
                    })];
                    let result = linear::solve_2d(&s)?;
                    let value = influence::extract_value("M", None, Some(path[1]), 0.5, &result);
                    reference.push(
                        None,
                        Some(id),
                        &format!("IL_t{t:04}"),
                        Kind::Local(Dim::LEN, true),
                        vec![value],
                    );
                }
            }
            Ok(reference)
        }
        _ => Ok(Resp::default()),
    }
}

fn reference_3d(name: &str, c: &Case3) -> Result<crate::response::Resp, String> {
    use crate::response::{Dim, Kind, Resp};
    use dedaliano_engine::{
        postprocess::influence,
        solver::{linear, modal},
        types::*,
    };
    match name {
        "modal" | "certified modal" => Ok(ana3::modal_resp_3d(&modal::solve_modal_3d(
            &c.s, &c.dens, 6,
        )?)),
        "harmonic" => harmonic_reference(
            crate::response::static_3d(&linear::solve_3d(&c.s)?),
            c.probes.first().copied(),
            &c.p.freqs,
        ),
        "influence line" => {
            let path = c.path.as_ref().ok_or("missing path")?;
            let mut s = c.s.clone();
            for support in s.supports.values_mut() {
                support.dx = None;
                support.dy = None;
                support.dz = None;
                support.drx = None;
                support.dry = None;
                support.drz = None;
            }
            let mut reference = Resp::default();
            for &id in path {
                let e =
                    c.s.elements
                        .get(&id.to_string())
                        .ok_or("missing path element")?;
                for (t, node_id) in [(0, e.node_i), (1000, e.node_j)] {
                    s.loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                        node_id,
                        fx: 0.0,
                        fy: 0.0,
                        fz: -1.0,
                        mx: 0.0,
                        my: 0.0,
                        mz: 0.0,
                        bw: None,
                    })];
                    let result = linear::solve_3d(&s)?;
                    let value =
                        influence::extract_value_3d("My_diag", None, Some(path[1]), 0.5, &result);
                    reference.push(
                        None,
                        Some(id),
                        &format!("IL_t{t:04}"),
                        Kind::Local(Dim::LEN, false),
                        vec![value],
                    );
                }
            }
            Ok(reference)
        }
        _ => Ok(Resp::default()),
    }
}

pub(crate) fn validate_2d(name: &str, r: &crate::response::Resp, c: &Case2) -> Result<(), String> {
    let mut shape = ResponseShape::of_2d(c);
    shape.reference = reference_2d(name, c)?;
    validate_response(name, r, &shape)
}

pub(crate) fn validate_3d(name: &str, r: &crate::response::Resp, c: &Case3) -> Result<(), String> {
    let mut shape = ResponseShape::of_3d(c);
    shape.reference = reference_3d(name, c)?;
    validate_response(name, r, &shape)
}

pub(crate) fn validate_response(
    name: &str,
    r: &crate::response::Resp,
    shape: &ResponseShape,
) -> Result<(), String> {
    use std::collections::BTreeMap;
    let mut actual = BTreeMap::new();
    for i in &r.0 {
        if i.v.is_empty()
            || i.v.iter().any(|v| !v.is_finite())
            || actual
                .insert((i.node, i.elem, i.tag.clone()), i.v.len())
                .is_some()
        {
            return Err(format!("{name}: empty, nonfinite or duplicate response"));
        }
    }
    let mut expected = BTreeMap::new();
    let mut add = |node, elem, tag: String, width| {
        expected.insert((node, elem, tag), width);
    };
    let w = if shape.spatial { 3 } else { 2 };
    let rw = if shape.spatial { 3 } else { 1 };
    let rot = if shape.spatial { "r" } else { "ry" };
    match name {
        "time history" | "time history (ground motion)" => {
            for &n in &shape.nodes {
                for k in 0..=60 {
                    add(Some(n), None, format!("u_t{k:03}"), w);
                    if name == "time history" {
                        add(Some(n), None, format!("{rot}_t{k:03}"), rw);
                    }
                }
            }
        }
        "modal" | "certified modal" => {
            add(None, None, "total_mass".into(), 1);
            for k in 0..6 {
                add(None, None, format!("f{k:02}"), 1);
            }
            for item in &shape.reference.0 {
                if item.tag.starts_with("meff") {
                    add(
                        None,
                        None,
                        item.tag.clone(),
                        if shape.spatial { 6 } else { 3 },
                    );
                }
            }
        }
        "buckling" => {
            for k in 0..3 {
                add(None, None, format!("lambda{k}"), 1);
            }
        }
        "harmonic" => {
            for k in 0..shape.frequencies {
                for part in ["re", "im"] {
                    add(shape.probe, None, format!("H_{part}{k}"), w);
                }
            }
        }
        "plastic collapse" => add(None, None, "collapse_factor".into(), 1),
        "kinematic check" => {
            for tag in ["mechanisms", "degree", "solvable"] {
                add(None, None, tag.into(), 1);
            }
        }
        "moving loads" => {
            for &e in &shape.elements {
                for tag in if shape.spatial {
                    vec!["N", "My", "Mz", "Vy", "Vz"]
                } else {
                    vec!["N", "M", "V"]
                } {
                    add(None, Some(e), tag.into(), 2);
                }
            }
        }
        "influence line" => {
            for &e in &shape.path {
                for k in 0..=4 {
                    add(None, Some(e), format!("IL_t{:04}", k * 250), 1);
                }
            }
        }
        _ => {
            for &n in &shape.nodes {
                add(Some(n), None, "u".into(), w);
                if name != "spectral" {
                    add(Some(n), None, rot.into(), rw);
                }
            }
            if name == "spectral" {
                add(None, None, "base_shear".into(), 1);
                if !shape.spatial {
                    for &e in &shape.elements {
                        for tag in ["N", "V", "M"] {
                            add(None, Some(e), tag.into(), 1);
                        }
                    }
                }
            } else if !["staged (loads in two stages)", "creep & shrinkage (t = t0)"]
                .contains(&name)
            {
                for &n in shape
                    .supports
                    .iter()
                    .filter(|_| !["SSI (no soil springs)", "fiber nonlinear"].contains(&name))
                {
                    add(Some(n), None, "R".into(), w);
                    add(Some(n), None, "RM".into(), rw);
                }
                for &e in &shape.elements {
                    for (tag, width) in [
                        ("N", 2),
                        ("V", if shape.spatial { 4 } else { 2 }),
                        ("M", if shape.spatial { 6 } else { 2 }),
                    ] {
                        add(None, Some(e), tag.into(), width);
                    }
                }
            }
        }
    }
    if actual.is_empty() || actual != expected {
        return Err(format!(
            "{name}: response shape mismatch: expected {expected:?}, got {actual:?}"
        ));
    }
    if matches!(name, "modal" | "certified modal") {
        let frequencies: Vec<_> =
            r.0.iter()
                .filter(|i| i.tag.starts_with('f'))
                .map(|i| i.v[0])
                .collect();
        if r.0
            .iter()
            .any(|i| (i.tag == "total_mass" || i.tag.starts_with('f')) && i.v[0] <= 0.0)
            || frequencies.windows(2).any(|f| f[1] < f[0])
        {
            return Err(format!(
                "{name}: nonpositive mass/frequency or unordered modes"
            ));
        }
    }
    if name == "influence line" && !shape.reference.0.iter().any(|i| i.v[0] != 0.0) {
        return Err("influence line: no independently nonzero ordinate".into());
    }
    let scale = shape
        .reference
        .0
        .iter()
        .flat_map(|i| &i.v)
        .fold(0.0_f64, |a, b| a.max(b.abs()));
    for expected in &shape.reference.0 {
        let got =
            r.0.iter()
                .find(|i| (i.node, i.elem, &i.tag) == (expected.node, expected.elem, &expected.tag))
                .ok_or_else(|| format!("{name}: missing reference entry {}", expected.tag))?;
        let local_scale = expected
            .v
            .iter()
            .fold(expected.floor, |a, b| a.max(b.abs()));
        let scale = if name == "harmonic" || name == "influence line" {
            scale
        } else {
            local_scale
        };
        if expected.v.iter().any(|v| !v.is_finite())
            || got
                .v
                .iter()
                .zip(&expected.v)
                .any(|(a, b)| (a - b).abs() > 1e-10 * scale)
        {
            return Err(format!(
                "{name}: reference mismatch {}: {:?} != {:?}",
                expected.tag, got.v, expected.v
            ));
        }
    }
    Ok(())
}

fn foundation_changed(base: &crate::response::Resp, active: &crate::response::Resp) -> bool {
    let mut norm = 0.0_f64;
    let mut delta = 0.0_f64;
    for item in base.0.iter().filter(|i| i.tag == "u") {
        let Some(got) = active.node_vec(item.node.unwrap(), "u") else {
            return false;
        };
        if got.len() != item.v.len() {
            return false;
        }
        for (a, b) in item.v.iter().zip(got) {
            norm = norm.max(a.abs());
            delta = delta.max((a - b).abs());
        }
    }
    norm > 0.0 && delta > norm * 0.01
}

fn foundation_axial_reference(r: &crate::response::Resp, length: f64, ea: f64) -> bool {
    [(2, -0.3 * length / ea), (3, -0.5 * length / ea)]
        .into_iter()
        .all(|(node, expected)| {
            r.node_vec(node, "u").is_some_and(|u| {
                u[0].is_finite() && (u[0] - expected).abs() <= 1e-10 * expected.abs()
            })
        })
}

#[test]
fn active_foundation_changes_displacements() {
    for seed in 0..128 {
        let c2 = Case2::new(
            "foundation",
            serde_json::from_value(model(seed, false)).unwrap(),
        );
        let c3 = Case3::new(
            "foundation",
            serde_json::from_value(model(seed, true)).unwrap(),
        );
        let a2 = ana2::rows()
            .into_iter()
            .find(|a| a.name == "Winkler (no foundation)")
            .unwrap();
        let a3 = ana3::rows()
            .into_iter()
            .find(|a| a.name == "Winkler (no foundation)")
            .unwrap();
        for (base, active) in [
            ((a2.run)(&c2).unwrap(), foundation_2d(&c2).unwrap()),
            ((a3.run)(&c3).unwrap(), foundation_3d(&c3).unwrap()),
        ] {
            let length = c2.s.nodes["2"].x;
            let ea = c2.s.materials["1"].e * 1000.0 * c2.s.sections["1"].a;
            assert!(foundation_axial_reference(&active, length, ea));
            let mut zeroed = active.clone();
            for item in &mut zeroed.0 {
                item.v.fill(0.0);
            }
            assert!(!foundation_axial_reference(&zeroed, length, ea));
            assert!(
                foundation_changed(&base, &active),
                "foundation ignored: seed={seed}"
            );
            assert!(
                !foundation_changed(&base, &base),
                "bypassed foundation must be rejected"
            );
        }
    }
}

#[test]
fn response_shape_rejects_missing_data() {
    let _strict = Strict::enter();
    let c2 = Case2::new("shape", serde_json::from_value(model(1, false)).unwrap());
    let c3 = Case3::new("shape", serde_json::from_value(model(1, true)).unwrap());
    for (shape, responses) in [
        (
            ResponseShape::of_2d(&c2),
            ana2::rows()
                .into_iter()
                .map(|a| (a.name, (a.run)(&c2).unwrap()))
                .collect::<Vec<_>>(),
        ),
        (
            ResponseShape::of_3d(&c3),
            ana3::rows()
                .into_iter()
                .map(|a| (a.name, (a.run)(&c3).unwrap()))
                .collect::<Vec<_>>(),
        ),
    ] {
        for (name, response) in responses {
            let shape = ResponseShape {
                reference: if shape.spatial {
                    reference_3d(name, &c3)
                } else {
                    reference_2d(name, &c2)
                }
                .unwrap(),
                ..shape.clone()
            };
            validate_response(name, &response, &shape).unwrap();
            assert!(validate_response(name, &crate::response::Resp::default(), &shape).is_err());
            for k in 0..response.0.len() {
                let mut bad = response.clone();
                bad.0.remove(k);
                assert!(
                    validate_response(name, &bad, &shape).is_err(),
                    "{name}: missing item {k}"
                );
                let mut bad = response.clone();
                bad.0[k].v.push(0.0);
                assert!(
                    validate_response(name, &bad, &shape).is_err(),
                    "{name}: wrong width {k}"
                );
            }
            let mut bad = response.clone();
            bad.0.retain(|i| !["R", "RM"].contains(&i.tag.as_str()));
            if bad.0.len() != response.0.len() {
                assert!(validate_response(name, &bad, &shape).is_err());
            }
        }
    }
}

#[test]
fn coverage_rejects_vacuous_cells() {
    for spatial in [false, true] {
        let t = Tally::default();
        t.record(
            "linear",
            "rotation",
            "mutation",
            crate::tally::Verdict::NotApplicable,
        );
        assert!(std::panic::catch_unwind(|| assert_coverage(
            &t,
            &["linear"],
            spatial,
            1,
            Some("linear")
        ))
        .is_err());
    }
}

fn gap_changes_displacement(base: f64, active: f64, force: f64) -> bool {
    base < 0.0
        && active < 0.0
        && active.abs() < base.abs() * 0.99
        && force.is_finite()
        && force < 0.0
}

#[test]
fn active_gap_changes_displacements() {
    for seed in 0..128 {
        let c2 = Case2::new("gap", serde_json::from_value(model(seed, false)).unwrap());
        let c3 = Case3::new("gap", serde_json::from_value(model(seed, true)).unwrap());
        gap_2d(&c2).unwrap();
        gap_3d(&c3).unwrap();
    }
    assert!(!gap_changes_displacement(-1.0, -1.0, -1.0));
    assert!(!gap_changes_displacement(-1.0, -0.5, 0.0));
    assert!(!gap_changes_displacement(-1.0, -1.5, -1.0));
}

#[test]
fn coverage_rejects_missing_or_renamed_adapters() {
    for spatial in [false, true] {
        let matrix = if spatial { MATRIX_3D } else { MATRIX_2D };
        let names: Vec<_> = matrix.iter().map(|(n, _)| *n).collect();
        for renamed in [false, true] {
            let mut bad = names.clone();
            if renamed {
                bad[0] = "renamed";
            } else {
                bad.remove(0);
            }
            assert!(std::panic::catch_unwind(|| assert_coverage(
                &Tally::default(),
                &bad,
                spatial,
                0,
                None
            ))
            .is_err());
        }
        assert_coverage(&Tally::default(), &["linear"], spatial, 0, Some("linear"));
    }
}

fn corrupt_zero_load_response<const FAULT: usize>(
    mut response: crate::response::Resp,
) -> Result<crate::response::Resp, String> {
    match FAULT {
        0 => response.0.clear(),
        1 => {
            response.0.pop().unwrap();
        }
        2 => response.0[0].v[0] = f64::NAN,
        3 => return Err("zero-load adapter error".into()),
        4 => panic!("zero-load adapter panic"),
        _ => unreachable!(),
    }
    Ok(response)
}

#[test]
fn strict_2d_rejects_failed_zero_load_solves() {
    fn faulty<const FAULT: usize>(c: &Case2) -> Result<crate::response::Resp, String> {
        let a = ana2::rows()
            .into_iter()
            .find(|a| a.name == "linear")
            .unwrap();
        let response = (a.run)(c)?;
        if c.s.loads.is_empty() {
            corrupt_zero_load_response::<FAULT>(response)
        } else {
            Ok(response)
        }
    }
    let _strict = Strict::enter();
    let c = Case2::new(
        "zero-load",
        serde_json::from_value(model(1, false)).unwrap(),
    );
    let mut a = ana2::rows()
        .into_iter()
        .find(|a| a.name == "linear")
        .unwrap();
    let invariants = ["superposition", "reciprocity"];
    let t = Tally::default();
    checks2::check_case(
        &checks2::Ctx {
            tally: &t,
            rng_seed: 1,
        },
        &c,
        std::slice::from_ref(&a),
        &invariants,
    );
    for inv in invariants {
        assert_eq!(t.symbol(a.name, inv), "✓", "{}", t.report());
    }
    for run in [
        faulty::<0>,
        faulty::<1>,
        faulty::<2>,
        faulty::<3>,
        faulty::<4>,
    ] {
        a.run = run;
        let t = Tally::default();
        checks2::check_case(
            &checks2::Ctx {
                tally: &t,
                rng_seed: 1,
            },
            &c,
            std::slice::from_ref(&a),
            &invariants,
        );
        for inv in invariants {
            assert_eq!(t.symbol(a.name, inv), "✗", "{}", t.report());
        }
        assert!(
            t.failures().iter().all(|f| f.contains("zero-load solve:")),
            "{}",
            t.report()
        );
    }
}

#[test]
fn strict_3d_rejects_failed_zero_load_solves() {
    fn faulty<const FAULT: usize>(c: &Case3) -> Result<crate::response::Resp, String> {
        let a = ana3::rows()
            .into_iter()
            .find(|a| a.name == "linear")
            .unwrap();
        let response = (a.run)(c)?;
        if c.s.loads.is_empty() {
            corrupt_zero_load_response::<FAULT>(response)
        } else {
            Ok(response)
        }
    }
    let _strict = Strict::enter();
    let c = Case3::new("zero-load", serde_json::from_value(model(1, true)).unwrap());
    let mut a = ana3::rows()
        .into_iter()
        .find(|a| a.name == "linear")
        .unwrap();
    let invariants = ["superposition", "reciprocity"];
    let t = Tally::default();
    checks3::check_case(
        &checks3::Ctx {
            tally: &t,
            rng_seed: 1,
        },
        &c,
        std::slice::from_ref(&a),
        &invariants,
    );
    for inv in invariants {
        assert_eq!(t.symbol(a.name, inv), "✓", "{}", t.report());
    }
    for run in [
        faulty::<0>,
        faulty::<1>,
        faulty::<2>,
        faulty::<3>,
        faulty::<4>,
    ] {
        a.run = run;
        let t = Tally::default();
        checks3::check_case(
            &checks3::Ctx {
                tally: &t,
                rng_seed: 1,
            },
            &c,
            std::slice::from_ref(&a),
            &invariants,
        );
        for inv in invariants {
            assert_eq!(t.symbol(a.name, inv), "✗", "{}", t.report());
        }
        assert!(
            t.failures().iter().all(|f| f.contains("zero-load solve:")),
            "{}",
            t.report()
        );
    }
}

#[test]
fn absolute_oracles_reject_zeroed_adapters() {
    let _strict = Strict::enter();
    for seed in 0..4 {
        let c2 = Case2::new(
            "absolute",
            serde_json::from_value(model(seed, false)).unwrap(),
        );
        let c3 = Case3::new(
            "absolute",
            serde_json::from_value(model(seed, true)).unwrap(),
        );
        for name in ["modal", "certified modal", "harmonic", "influence line"] {
            let r2 = (ana2::rows()
                .into_iter()
                .find(|a| a.name == name)
                .unwrap()
                .run)(&c2)
            .unwrap();
            let r3 = (ana3::rows()
                .into_iter()
                .find(|a| a.name == name)
                .unwrap()
                .run)(&c3)
            .unwrap();
            for (response, spatial) in [(r2, false), (r3, true)] {
                let validate = |r: &crate::response::Resp| {
                    if spatial {
                        validate_3d(name, r, &c3)
                    } else {
                        validate_2d(name, r, &c2)
                    }
                };
                validate(&response).unwrap();
                let mut zeroed = response.clone();
                for item in &mut zeroed.0 {
                    item.v.fill(0.0);
                }
                assert!(validate(&zeroed).is_err(), "{name}, spatial={spatial}");
                if name.contains("modal") {
                    zeroed.0.retain(|i| !i.tag.starts_with("meff"));
                    assert!(validate(&zeroed).is_err());
                    for tag in ["total_mass", "f00"] {
                        let mut bad = response.clone();
                        bad.0.iter_mut().find(|i| i.tag == tag).unwrap().v[0] = 0.0;
                        assert!(validate(&bad).is_err());
                    }
                    let mut bad = response.clone();
                    for item in bad.0.iter_mut().filter(|i| i.tag.starts_with('f')) {
                        item.v[0] = 1.0;
                    }
                    bad.0.retain(|i| !i.tag.starts_with("meff"));
                    assert!(validate(&bad).is_err());
                }
                if name == "harmonic" {
                    let mut bad = response.clone();
                    let scale = bad
                        .0
                        .iter()
                        .flat_map(|i| &i.v)
                        .fold(0.0_f64, |a, b| a.max(b.abs()));
                    bad.0.iter_mut().find(|i| i.tag == "H_im0").unwrap().v[0] = scale;
                    assert!(validate(&bad).is_err());
                    let zero2 = c2.with_loads(vec![]);
                    let zero3 = c3.with_loads(vec![]);
                    if spatial {
                        validate_3d(name, &zeroed, &zero3)
                    } else {
                        validate_2d(name, &zeroed, &zero2)
                    }
                    .unwrap();
                }
            }
        }
    }
}

#[test]
fn absolute_oracles_reject_zeroed_adapter_runs() {
    fn zeroed<const ANALYSIS: usize>(mut r: crate::response::Resp) -> crate::response::Resp {
        for item in &mut r.0 {
            item.v.fill(0.0);
        }
        if ANALYSIS < 2 {
            r.0.retain(|i| !i.tag.starts_with("meff"));
        }
        r
    }
    const NAMES: [&str; 4] = ["modal", "certified modal", "harmonic", "influence line"];
    fn faulty2<const ANALYSIS: usize>(c: &Case2) -> Result<crate::response::Resp, String> {
        let a = ana2::rows()
            .into_iter()
            .find(|a| a.name == NAMES[ANALYSIS])
            .unwrap();
        Ok(zeroed::<ANALYSIS>((a.run)(c)?))
    }
    fn faulty3<const ANALYSIS: usize>(c: &Case3) -> Result<crate::response::Resp, String> {
        let a = ana3::rows()
            .into_iter()
            .find(|a| a.name == NAMES[ANALYSIS])
            .unwrap();
        Ok(zeroed::<ANALYSIS>((a.run)(c)?))
    }
    let _strict = Strict::enter();
    let c2 = Case2::new("zeroed", serde_json::from_value(model(1, false)).unwrap());
    let c3 = Case3::new("zeroed", serde_json::from_value(model(1, true)).unwrap());
    for (index, (run2, run3)) in [faulty2::<0>, faulty2::<1>, faulty2::<2>, faulty2::<3>]
        .into_iter()
        .zip([faulty3::<0>, faulty3::<1>, faulty3::<2>, faulty3::<3>])
        .enumerate()
    {
        let mut a2 = ana2::rows()
            .into_iter()
            .find(|a| a.name == NAMES[index])
            .unwrap();
        let mut a3 = ana3::rows()
            .into_iter()
            .find(|a| a.name == NAMES[index])
            .unwrap();
        a2.run = run2;
        a3.run = run3;
        let t2 = Tally::default();
        let t3 = Tally::default();
        checks2::check_case(
            &checks2::Ctx {
                tally: &t2,
                rng_seed: 1,
            },
            &c2,
            &[a2],
            &["relabel"],
        );
        checks3::check_case(
            &checks3::Ctx {
                tally: &t3,
                rng_seed: 1,
            },
            &c3,
            &[a3],
            &["relabel"],
        );
        for tally in [t2, t3] {
            assert_eq!(
                tally.symbol(NAMES[index], "relabel"),
                "✗",
                "{}",
                tally.report()
            );
        }
    }
}
