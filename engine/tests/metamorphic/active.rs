use crate::{
    ana2, ana3,
    case::{Case2, Case3},
    checks2, checks3,
    generated::model,
    tally::Tally,
};
use serde_json::json;

#[test]
fn taut_cable_invariance() {
    let _strict = crate::generated::Strict::enter();
    let t2 = Tally::default();
    let t3 = Tally::default();
    let a2: Vec<_> = ana2::rows()
        .into_iter()
        .filter(|a| a.name == "cable solver")
        .collect();
    let a3: Vec<_> = ana3::rows()
        .into_iter()
        .filter(|a| a.name == "cable solver")
        .collect();
    assert_cable_adapters(&a2.iter().map(|a| a.name).collect::<Vec<_>>());
    assert_cable_adapters(&a3.iter().map(|a| a.name).collect::<Vec<_>>());
    for seed in 0..16 {
        let mut v = model(seed, false);
        let l = v["nodes"]["2"]["x"].as_f64().unwrap();
        v["nodes"]["2"]["z"] = json!(-l);
        for e in v["elements"].as_object_mut().unwrap().values_mut() {
            e["type"] = json!("cable");
        }
        v["sections"]["1"]["a"] = json!(0.002);
        v["supports"]["2"] = json!({"id":2,"nodeId":3,"type":"fixed"});
        v["loads"] = json!([{"type":"nodal","data":{"nodeId":2,"fx":0.0,"fz":-100.0,"my":0.0}}]);
        let c2 = Case2::new(
            format!("taut-cable/{seed}/2d"),
            serde_json::from_value(v).unwrap(),
        );
        assert_loaded_cable(&(a2[0].run)(&c2).unwrap(), 2, 2);
        checks2::check_case(
            &checks2::Ctx {
                tally: &t2,
                rng_seed: seed,
            },
            &c2,
            &a2,
            &["mirror", "relabel", "reversal", "units"],
        );
        let mut v = model(seed, true);
        v["nodes"] = json!({
            "1":{"id":1,"x":l,"y":0.0,"z":l},
            "2":{"id":2,"x":-l/2.0,"y":l*3f64.sqrt()/2.0,"z":l},
            "3":{"id":3,"x":-l/2.0,"y":-l*3f64.sqrt()/2.0,"z":l},
            "4":{"id":4,"x":0.0,"y":0.0,"z":0.0}
        });
        v["elements"] = json!({});
        v["supports"] = json!({});
        for id in 1..=3 {
            v["elements"][id.to_string()] =
                json!({"id":id,"type":"cable","nodeI":id,"nodeJ":4,"materialId":1,"sectionId":1});
            v["supports"][id.to_string()] =
                json!({"nodeId":id,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true});
        }
        v["sections"]["1"]["a"] = json!(0.002);
        v["loads"] = json!([{"type":"nodal","data":{"nodeId":4,"fx":0.0,"fy":0.0,"fz":-100.0,"mx":0.0,"my":0.0,"mz":0.0}}]);
        let c3 = Case3::new(
            format!("taut-cable/{seed}/3d"),
            serde_json::from_value(v).unwrap(),
        );
        assert_loaded_cable(&(a3[0].run)(&c3).unwrap(), 3, 3);
        checks3::check_case(
            &checks3::Ctx {
                tally: &t3,
                rng_seed: seed,
            },
            &c3,
            &a3,
            &["rotation", "relabel", "reversal", "units"],
        );
    }
    assert_cable_cells(&t2, &["mirror", "relabel", "reversal", "units"]);
    assert_cable_cells(&t3, &["rotation", "relabel", "reversal", "units"]);
    crate::finish("active_cable_2d", &t2);
    crate::finish("active_cable_3d", &t3);
}

fn loaded_cable_equilibrium(r: &crate::response::Resp, width: usize, members: usize) -> bool {
    let tensions: Vec<_> = r.0.iter().filter(|i| i.tag == "N").collect();
    if tensions.len() != members
        || tensions.iter().any(|i| {
            i.v.len() != 2 || i.v.iter().any(|v| !v.is_finite() || *v <= 0.0)
        })
    {
        return false;
    }
    let mut sum = vec![0.0; width];
    for reaction in r.0.iter().filter(|i| i.tag == "R") {
        if reaction.v.len() != width {
            return false;
        }
        for (sum, value) in sum.iter_mut().zip(&reaction.v) {
            *sum += value;
        }
    }
    sum[width - 1] -= 100.0;
    sum.iter().all(|v| v.is_finite() && v.abs() <= 100.0 * 1e-10)
}

fn assert_loaded_cable(r: &crate::response::Resp, width: usize, members: usize) {
    assert!(loaded_cable_equilibrium(r, width, members), "{r:?}");
    let mut zeroed = r.clone();
    for item in &mut zeroed.0 {
        item.v.fill(0.0);
    }
    assert!(!loaded_cable_equilibrium(&zeroed, width, members));
    let mut missing_reactions = r.clone();
    for item in missing_reactions.0.iter_mut().filter(|i| i.tag == "R") {
        item.v.fill(0.0);
    }
    assert!(!loaded_cable_equilibrium(&missing_reactions, width, members));
}

fn assert_cable_adapters(names: &[&str]) {
    assert_eq!(names, &["cable solver"]);
}

fn assert_cable_cells(t: &Tally, invs: &[&str]) {
    let cells = t.cells.lock().unwrap();
    assert_eq!(cells.len(), 4);
    for inv in invs {
        let c = cells
            .get(&("cable solver".into(), inv.to_string()))
            .expect("missing cable cell");
        assert_eq!(c.pass, 16, "active cable {inv}: {c:?}");
        assert_eq!(c.refused + c.unrep + c.inconclusive + c.fails.len(), 0);
        assert!(c.ignored.is_empty());
    }
}

#[test]
fn cable_coverage_rejects_missing_adapters_and_cells() {
    for names in [vec![], vec!["cable solver", "cable solver"]] {
        assert!(std::panic::catch_unwind(|| assert_cable_adapters(&names)).is_err());
    }
    assert!(std::panic::catch_unwind(|| assert_cable_cells(
        &Tally::default(),
        &["mirror", "relabel", "reversal", "units"]
    ))
    .is_err());
}

#[test]
fn cable_checks_reject_empty_responses() {
    let _strict = crate::generated::Strict::enter();
    let c2 = Case2::new(
        "empty cable",
        serde_json::from_value(model(1, false)).unwrap(),
    );
    let c3 = Case3::new(
        "empty cable",
        serde_json::from_value(model(1, true)).unwrap(),
    );
    let mut a2 = ana2::rows()
        .into_iter()
        .find(|a| a.name == "cable solver")
        .unwrap();
    let mut a3 = ana3::rows()
        .into_iter()
        .find(|a| a.name == "cable solver")
        .unwrap();
    a2.run = |_| Ok(crate::response::Resp::default());
    a3.run = |_| Ok(crate::response::Resp::default());
    let t2 = Tally::default();
    let t3 = Tally::default();
    checks2::check_case(
        &checks2::Ctx {
            tally: &t2,
            rng_seed: 1,
        },
        &c2,
        &[a2],
        &["mirror", "relabel", "reversal", "units"],
    );
    checks3::check_case(
        &checks3::Ctx {
            tally: &t3,
            rng_seed: 1,
        },
        &c3,
        &[a3],
        &["rotation", "relabel", "reversal", "units"],
    );
    for t in [&t2, &t3] {
        let cells = t.cells.lock().unwrap();
        assert_eq!(cells.len(), 4);
        for cell in cells.values() {
            assert_eq!(cell.pass, 0);
            assert_eq!(cell.fails.len(), 1);
        }
    }
}
