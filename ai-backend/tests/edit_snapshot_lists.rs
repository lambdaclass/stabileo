use dedaliano_backend::capabilities::{
    actions::BuildAction, edit_executor::apply_edit, generators::execute_action,
};
use dedaliano_backend::error::AppError;
use serde_json::{json, Value};

fn frame(three_d: bool) -> Value {
    let action = if three_d {
        BuildAction::CreateMultiStoryFrame3d {
            n_bays_x: 1,
            n_bays_z: 1,
            n_floors: 1,
            bay_width: 5.0,
            floor_height: 3.0,
            q_beam: Some(-10.0),
            h_lateral: None,
            base_support: None,
            beam_section: None,
            column_section: None,
        }
    } else {
        BuildAction::CreatePortalFrame {
            width: 6.0,
            height: 4.0,
            q_beam: Some(-10.0),
            h_lateral: None,
            base_support: None,
            beam_section: None,
            column_section: None,
        }
    };
    execute_action(&action).unwrap()
}

fn load_actions(snapshot: &Value) -> [BuildAction; 3] {
    [
        BuildAction::AddNodalLoad {
            node_id: snapshot["nodes"][0][0].as_u64().unwrap() as u32,
            fx: Some(1.0),
            fz: None,
            my: None,
        },
        BuildAction::AddLateralLoads { h: 1.0 },
        BuildAction::AddDistributedLoad {
            element_id: snapshot["elements"][0][0].as_u64().unwrap() as u32,
            q: -1.0,
        },
    ]
}

#[test]
fn load_additions_create_missing_lists_in_both_dimensions() {
    for three_d in [false, true] {
        let mut snapshot = frame(three_d);
        snapshot.as_object_mut().unwrap().remove("loads");
        for action in load_actions(&snapshot) {
            let result = apply_edit(&action, &snapshot).unwrap();
            let loads = result["loads"].as_array().unwrap();
            assert_eq!(loads.len(), 1, "{action:?}, three_d={three_d}");
            let expected_type = match (&action, three_d) {
                (BuildAction::AddDistributedLoad { .. }, true) => "distributed3d",
                (BuildAction::AddDistributedLoad { .. }, false) => "distributed",
                (_, true) => "nodal3d",
                (_, false) => "nodal",
            };
            assert_eq!(loads[0]["type"], expected_type);
            for key in ["nodes", "elements", "supports", "materials", "sections"] {
                assert_eq!(result[key], snapshot[key]);
            }
            assert!(snapshot.get("loads").is_none());
        }
    }
}

#[test]
fn load_additions_preserve_existing_loads_in_both_dimensions() {
    for three_d in [false, true] {
        let snapshot = frame(three_d);
        let original = snapshot["loads"].as_array().unwrap();
        assert!(!original.is_empty());
        for action in load_actions(&snapshot) {
            let result = apply_edit(&action, &snapshot).unwrap();
            let loads = result["loads"].as_array().unwrap();
            assert_eq!(loads.len(), original.len() + 1);
            assert_eq!(&loads[..original.len()], original);
            let new_id = &loads.last().unwrap()["data"]["id"];
            assert!(original.iter().all(|load| &load["data"]["id"] != new_id));
        }
    }
}

#[test]
fn malformed_lists_are_bad_requests_without_discarding_data() {
    for key in [
        "nodes",
        "elements",
        "supports",
        "sections",
        "materials",
        "loads",
    ] {
        for invalid in [
            json!(null),
            json!(5),
            json!("list"),
            json!(false),
            json!({"existing": [1, 2]}),
        ] {
            let mut snapshot = frame(false);
            let action = load_actions(&snapshot).into_iter().last().unwrap();
            snapshot[key] = invalid;
            let original = snapshot.clone();
            assert!(
                matches!(apply_edit(&action, &snapshot), Err(AppError::BadRequest(message)) if message.contains(key)),
                "key={key}, snapshot={snapshot}"
            );
            assert_eq!(snapshot, original);
        }
    }
}

#[test]
fn changing_one_section_rejects_a_malformed_section_collection() {
    let mut snapshot = frame(false);
    let mut sections = serde_json::Map::new();
    for section in snapshot["sections"].as_array().unwrap() {
        sections.insert(section[0].to_string(), section[1].clone());
    }
    snapshot["sections"] = Value::Object(sections);
    let action = BuildAction::ChangeSection {
        section: "IPE 300".into(),
        element_ids: Some(vec![snapshot["elements"][0][0].as_u64().unwrap() as u32]),
        element_filter: None,
    };
    assert!(
        matches!(apply_edit(&action, &snapshot), Err(AppError::BadRequest(message)) if message.contains("sections"))
    );
}

#[test]
fn deleting_from_a_missing_load_list_is_still_a_bad_request() {
    let mut snapshot = frame(false);
    snapshot.as_object_mut().unwrap().remove("loads");
    assert!(matches!(
        apply_edit(&BuildAction::DeleteLoad { load_id: 1 }, &snapshot),
        Err(AppError::BadRequest(_))
    ));
}

#[test]
fn non_object_snapshots_are_bad_requests() {
    for snapshot in [
        json!(null),
        json!(5),
        json!("snapshot"),
        json!(false),
        json!([]),
    ] {
        assert!(matches!(
            apply_edit(&BuildAction::SetAllBeamLoads { q: -1.0 }, &snapshot),
            Err(AppError::BadRequest(_))
        ));
    }
}
