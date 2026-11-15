use crate::case::{Case2, Case3};
use crate::tally::Tally;

fn holds(issue:u32, seed:u64, wanted:&[(&str,&str)]) {
    let text=std::fs::read_to_string(format!("{}/tests/metamorphic_corpus/nightly/issue-{issue}.json",env!("CARGO_MANIFEST_DIR"))).unwrap();
    let value:serde_json::Value=serde_json::from_str(&text).unwrap();
    let name=value["_nightly_name"].as_str().unwrap_or("replay").to_owned();
    let densities=value.get("_nightly_dens").cloned();
    let t=Tally::default();
    match crate::corpus::parse(&text).unwrap() {
        crate::corpus::Model::D2(s)=>{
            let mut c=Case2::new(name,s);
            if let Some(d)=densities {c.dens=serde_json::from_value(d).unwrap();}
            let rows:Vec<_>=crate::ana2::rows().into_iter().filter(|a|wanted.iter().any(|w|w.0==a.name)).collect();
            crate::checks2::check_case(&crate::checks2::Ctx{tally:&t,rng_seed:seed},&c,&rows,crate::INV_2D);
        },
        crate::corpus::Model::D3(s)=>{
            let mut c=Case3::new(name,s);
            if let Some(d)=densities {c.dens=serde_json::from_value(d).unwrap();}
            let rows:Vec<_>=crate::ana3::rows().into_iter().filter(|a|wanted.iter().any(|w|w.0==a.name)).collect();
            crate::checks3::check_case(&crate::checks3::Ctx{tally:&t,rng_seed:seed},&c,&rows,crate::INV_3D);
        },
    }
    let cells=t.cells.lock().unwrap();
    for &(analysis,invariant) in wanted {
        let c=cells.get(&(analysis.to_string(),invariant.to_string())).expect("comparison must run");
        assert!(c.fails.is_empty(),"#{issue}: {c:?}");
        assert!(c.pass>0,"#{issue}: comparison must pass: {c:?}");
    }
}

#[test]
fn audit_issue_1361_published_model() {
    holds(1361, 20761, &[("influence line", "units")]);
}

#[test]
fn audit_issue_1360_published_model() {
    holds(1360, 20761, &[("moving loads", "units")]);
}

#[test]
fn audit_issue_1280_published_model() {
    holds(1280, 2026110305390, &[("time history", "mirror")]);
}

#[test]
fn audit_issue_1279_published_model() {
    holds(1279, 2026110302874, &[("time history", "superposition")]);
}

#[test]
fn audit_issue_1277_published_model() {
    holds(1277, 2026110305390, &[("time history", "superposition")]);
}

#[test]
fn audit_issue_1271_published_model() {
    holds(1271, 2026110303425, &[("time history (ground motion)", "rotation")]);
}

#[test]
fn audit_issue_1270_published_model() {
    holds(1270, 2026110303425, &[("time history", "superposition")]);
}

#[test]
fn audit_issue_1269_published_model() {
    holds(1269, 2026110305390, &[("time history", "rotation")]);
}

#[test]
fn audit_issue_1212_published_model() {
    holds(1212, 2026110202027, &[("time history (ground motion)", "units")]);
}

#[test]
fn audit_issue_1210_published_model() {
    holds(1210, 2026110201877, &[("time history", "superposition")]);
}

#[test]
fn audit_issue_1208_published_model() {
    holds(1208, 2026110202027, &[("time history", "units")]);
}

#[test]
fn audit_issue_1207_published_model() {
    holds(1207, 2026110202027, &[("time history (ground motion)", "rotation")]);
}

#[test]
fn audit_issue_1205_published_model() {
    holds(1205, 2026110302735, &[("time history (ground motion)", "units")]);
}

#[test]
fn audit_issue_1196_published_model() {
    holds(1196, 2026110300429, &[("time history (ground motion)", "units")]);
}

#[test]
fn audit_issue_1009_published_model() {
    holds(1009, 20758, &[("time history", "reciprocity")]);
}

#[test]
fn audit_issue_969_published_model() {
    holds(969, 20760, &[("modal", "modal orthogonality")]);
}

#[test]
fn audit_issue_1272_published_model() {
    holds(1272, 2026110303871, &[("plastic collapse", "units")]);
}

#[test]
fn audit_issue_1265_published_model() {
    holds(1265, 20760, &[("harmonic", "units")]);
}

#[test]
fn audit_issue_1216_published_model() {
    holds(1216, 2026110204962, &[("harmonic", "rotation")]);
}

#[test]
fn audit_issue_1118_published_model() {
    holds(1118, 20759, &[("time history", "units")]);
}

#[test]
fn audit_issue_1117_published_model() {
    holds(1117, 2026110201645, &[("harmonic", "rotation")]);
}

#[test]
fn audit_issue_1115_published_model() {
    holds(1115, 2026110202157, &[("harmonic", "units")]);
}

#[test]
fn audit_issue_1102_published_model() {
    holds(1102, 20759, &[("time history", "units")]);
}

#[test]
fn audit_issue_994_published_model() {
    holds(994, 20758, &[("harmonic", "units")]);
}

#[test]
fn audit_issue_993_published_model() {
    holds(993, 20758, &[("linear (sparse path)", "units")]);
}

#[test]
fn audit_issue_960_published_model() {
    holds(960, 2026103105180, &[("harmonic", "units")]);
}

#[test]
fn audit_issue_954_published_model() {
    holds(954, 20757, &[("linear (PCG)", "relabel")]);
}
