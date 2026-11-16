use crate::{ana2, ana3, case::{Case2, Case3}};
use dedaliano_engine::{metamorphic::planes::{embed_2d, Plane}, solver::stability::{self, Reason}, types::SolverInput};

#[test]
fn oblique_truss_mechanisms_keep_their_refusals_across_entry_points() {
    let fixtures: serde_json::Value = serde_json::from_str(include_str!("../fixtures/cause-c-replay.json")).unwrap();
    let original: SolverInput = serde_json::from_value(fixtures["1095"].clone()).unwrap();
    let analyses = ["linear", "linear (WASM typed path)", "linear (dense reference)", "linear (load session)", "linear (sparse path)", "linear (PCG)", "constrained", "certified linear", "load combinations", "staged (one stage)", "staged (loads in two stages)", "creep & shrinkage (t = t0)", "P-Delta", "modal", "certified modal"];
    for held in [false, true] {
        let mut solver = original.clone();
        if held { solver.elements.get_mut("2").unwrap().elem_type = "frame".into(); }
        let verdict = stability::of_2d(&solver).unwrap();
        assert_eq!(verdict.reason, if held { Reason::Resolved } else { Reason::FreeTranslation }, "{verdict:?}");
        if !held { assert_eq!(verdict.mode_nodes, vec![3]); }
        let case = Case2::new("translation rank", solver.clone());
        for row in ana2::rows().into_iter().filter(|a| analyses.contains(&a.name)) {
            let result = (row.run)(&case);
            assert_eq!(result.is_ok(), held, "2D {} held={held}: {result:?}", row.name);
            if !held { assert!(result.unwrap_err().contains("mechanism"), "{}", row.name); }
        }
        for plane in Plane::ALL {
            let solver = embed_2d(&solver, plane).unwrap();
            let verdict = stability::of_3d(&solver).unwrap();
            assert_eq!(verdict.reason, if held { Reason::Resolved } else { Reason::FreeTranslation }, "{plane:?}: {verdict:?}");
            if !held { assert_eq!(verdict.mode_nodes, vec![3]); }
            let case = Case3::new("translation rank", solver);
            for row in ana3::rows().into_iter().filter(|a| analyses.contains(&a.name)) {
                let result = (row.run)(&case);
                assert_eq!(result.is_ok(), held, "3D {plane:?} {} held={held}: {result:?}", row.name);
                if !held { assert!(result.unwrap_err().contains("mechanism"), "{}", row.name); }
            }
        }
    }
}
