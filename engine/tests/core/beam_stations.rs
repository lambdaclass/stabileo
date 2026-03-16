use crate::common::*;
use dedaliano_engine::types::*;
use dedaliano_engine::solver::linear::solve_2d;
use dedaliano_engine::postprocess::beam_stations::*;
use dedaliano_engine::postprocess::diagrams::compute_diagram_value_at;

// ==================== Integration: Full Solve → Station Extraction ====================

/// End-to-end: solve a 2-span continuous beam, build station input from solver
/// results with two load combinations, verify station extraction produces
/// correct forces and governing values.
#[test]
fn test_full_solve_to_station_extraction() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 12.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX"), (3, 3, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
        })],
    );
    let results_dead = solve_2d(&input).unwrap();

    let input_live = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 12.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX"), (3, 3, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -20.0, q_j: -20.0, a: None, b: None,
        })],
    );
    let results_live = solve_2d(&input_live).unwrap();

    let station_input = BeamStationInput {
        members: vec![
            BeamMemberInfo { element_id: 1, section_id: 1, material_id: 1, length: 6.0, label: None },
            BeamMemberInfo { element_id: 2, section_id: 1, material_id: 1, length: 6.0, label: None },
        ],
        combinations: vec![
            LabeledResults {
                combo_id: 1, combo_name: Some("Dead".to_string()),
                results: results_dead.clone(),
            },
            LabeledResults {
                combo_id: 2, combo_name: Some("Dead+Live".to_string()),
                results: results_live.clone(),
            },
        ],
        num_stations: Some(11),
    };

    let result = extract_beam_stations(&station_input);

    assert_eq!(result.num_members, 2);
    assert_eq!(result.num_combinations, 2);
    assert_eq!(result.num_stations_per_member, 11);
    assert_eq!(result.stations.len(), 22);

    // combo_name propagated
    for s in result.stations.iter().filter(|s| s.member_id == 1) {
        assert_eq!(s.combo_forces.len(), 2);
        assert_eq!(s.combo_forces[0].combo_name.as_deref(), Some("Dead"));
        assert_eq!(s.combo_forces[1].combo_name.as_deref(), Some("Dead+Live"));
    }

    // Verify station forces match direct diagram evaluation
    let ef_dead = results_dead.element_forces.iter().find(|ef| ef.element_id == 1).unwrap();
    let ef_live = results_live.element_forces.iter().find(|ef| ef.element_id == 1).unwrap();

    for s in result.stations.iter().filter(|s| s.member_id == 1) {
        let expected_m_dead = compute_diagram_value_at("moment", s.t, ef_dead);
        let expected_v_dead = compute_diagram_value_at("shear", s.t, ef_dead);
        let expected_n_dead = compute_diagram_value_at("axial", s.t, ef_dead);

        let cf_dead = s.combo_forces.iter().find(|cf| cf.combo_id == 1).unwrap();
        assert!((cf_dead.m - expected_m_dead).abs() < 1e-10,
            "Station {} t={}: m mismatch {} vs {}", s.station_index, s.t, cf_dead.m, expected_m_dead);
        assert!((cf_dead.v - expected_v_dead).abs() < 1e-10);
        assert!((cf_dead.n - expected_n_dead).abs() < 1e-10);

        let expected_m_live = compute_diagram_value_at("moment", s.t, ef_live);
        let cf_live = s.combo_forces.iter().find(|cf| cf.combo_id == 2).unwrap();
        assert!((cf_live.m - expected_m_live).abs() < 1e-10);
    }

    // Governing: combo 2 (double load) should produce larger absolute moment
    let midspan = result.stations.iter()
        .find(|s| s.member_id == 1 && s.station_index == 5).unwrap();
    let m_dead = midspan.combo_forces.iter().find(|cf| cf.combo_id == 1).unwrap().m;
    let m_live = midspan.combo_forces.iter().find(|cf| cf.combo_id == 2).unwrap().m;
    assert!(m_live.abs() > m_dead.abs(), "Live moment should be larger: {} vs {}", m_live, m_dead);

    // sign_convention present in result
    assert_eq!(&result.sign_convention.axial, "positive = tension");
}

/// JSON round-trip: serialize input → deserialize → extract → serialize result → deserialize.
#[test]
fn test_json_round_trip() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -50.0, mz: 0.0 })],
    );
    let results = solve_2d(&input).unwrap();

    let station_input = BeamStationInput {
        members: vec![BeamMemberInfo {
            element_id: 1, section_id: 1, material_id: 1, length: 4.0, label: None,
        }],
        combinations: vec![LabeledResults {
            combo_id: 1, combo_name: Some("ULS".to_string()), results,
        }],
        num_stations: Some(5),
    };

    let json_in = serde_json::to_string(&station_input).unwrap();
    let parsed_input: BeamStationInput = serde_json::from_str(&json_in).unwrap();
    assert_eq!(parsed_input.members.len(), 1);

    let result = extract_beam_stations(&parsed_input);
    let json_out = serde_json::to_string(&result).unwrap();
    let parsed_result: BeamStationResult = serde_json::from_str(&json_out).unwrap();

    assert_eq!(parsed_result.stations.len(), 5);
    assert_eq!(parsed_result.num_stations_per_member, 5);

    // camelCase keys
    assert!(json_out.contains("\"stationX\""));
    assert!(json_out.contains("\"comboForces\""));
    assert!(json_out.contains("\"comboName\""));
    assert!(json_out.contains("\"posCombo\""));
    assert!(json_out.contains("\"negValue\""));
    assert!(json_out.contains("\"memberId\""));
    assert!(json_out.contains("\"sectionId\""));
    assert!(json_out.contains("\"signConvention\""));
}

/// Snapshot: stable serialized output for a simple cantilever.
/// If this test breaks, the product team's deserialization code may also break.
#[test]
fn test_snapshot_stable_output() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -50.0, mz: 0.0 })],
    );
    let results = solve_2d(&input).unwrap();

    let station_input = BeamStationInput {
        members: vec![BeamMemberInfo {
            element_id: 1, section_id: 1, material_id: 1, length: 4.0, label: None,
        }],
        combinations: vec![LabeledResults {
            combo_id: 1, combo_name: None, results,
        }],
        num_stations: Some(3),
    };

    let result = extract_beam_stations(&station_input);
    assert_eq!(result.stations.len(), 3);

    // Station 0 (t=0, fixed end)
    let s0 = &result.stations[0];
    assert_eq!(s0.member_id, 1);
    assert_eq!(s0.station_index, 0);
    assert!((s0.t).abs() < 1e-15);
    assert!((s0.station_x).abs() < 1e-15);
    let cf0 = &s0.combo_forces[0];
    assert_eq!(cf0.combo_id, 1);
    assert!((cf0.v - 50.0).abs() < 1.0, "V at fixed end: {}", cf0.v);

    // Station 2 (t=1.0, free end)
    let s2 = &result.stations[2];
    assert!((s2.t - 1.0).abs() < 1e-15);
    assert!((s2.station_x - 4.0).abs() < 1e-10);
    let cf2 = &s2.combo_forces[0];
    assert!(cf2.m.abs() < 1.0, "M at free end: {}", cf2.m);

    // Governing present (1 combo) — unwrap to verify Some
    let gov_v = s0.governing.shear.as_ref().expect("governing shear should be Some");
    assert_eq!(gov_v.pos_combo, 1);
    let gov_m = s0.governing.moment.as_ref().expect("governing moment should be Some");
    assert_eq!(gov_m.neg_combo, 1);

    // JSON field names are stable
    let json = serde_json::to_string(&result).unwrap();
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert!(v.get("stations").is_some());
    assert!(v.get("numMembers").is_some());
    assert!(v.get("numCombinations").is_some());
    assert!(v.get("numStationsPerMember").is_some());
    assert!(v.get("signConvention").is_some());

    let st = &v["stations"][0];
    for key in &["memberId", "stationIndex", "t", "stationX", "sectionId",
                 "materialId", "comboForces", "governing"] {
        assert!(st.get(*key).is_some(), "Missing key: {}", key);
    }

    // Governing keys present when data exists
    let gov = &st["governing"];
    for key in &["moment", "shear", "axial"] {
        assert!(gov.get(*key).is_some(), "Missing governing key: {}", key);
        let entry = &gov[*key];
        for ekey in &["posCombo", "posValue", "negCombo", "negValue"] {
            assert!(entry.get(*ekey).is_some(), "Missing {}.{}", key, ekey);
        }
    }
}

/// When no combo has forces for a member, governing should be null/absent in JSON,
/// not phantom infinities.
#[test]
fn test_no_data_governing_absent_in_json() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -50.0, mz: 0.0 })],
    );
    let results = solve_2d(&input).unwrap();

    // Member 99 doesn't exist in the results
    let station_input = BeamStationInput {
        members: vec![BeamMemberInfo {
            element_id: 99, section_id: 1, material_id: 1, length: 4.0, label: None,
        }],
        combinations: vec![LabeledResults {
            combo_id: 1, combo_name: None, results,
        }],
        num_stations: Some(2),
    };

    let result = extract_beam_stations(&station_input);

    // combo_forces empty, governing None
    for s in &result.stations {
        assert!(s.combo_forces.is_empty());
        assert!(s.governing.moment.is_none());
        assert!(s.governing.shear.is_none());
        assert!(s.governing.axial.is_none());
    }

    // JSON: governing fields should be absent (skip_serializing_if)
    let json = serde_json::to_string(&result).unwrap();
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    let gov = &v["stations"][0]["governing"];
    assert!(gov.get("moment").is_none(), "moment should be absent");
    assert!(gov.get("shear").is_none(), "shear should be absent");
    assert!(gov.get("axial").is_none(), "axial should be absent");
}

// ==================== Grouped Snapshot Test ====================

/// Snapshot: verify the serialized JSON shape of the grouped 2D output.
/// If this test breaks, the product team's deserialization code may also break.
#[test]
fn test_grouped_snapshot_stable_output() {
    // 2-span continuous beam: 3 nodes, 2 elements, 2 combos
    let input_d = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 12.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX"), (3, 3, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
        })],
    );
    let results_d = solve_2d(&input_d).unwrap();

    let input_l = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 12.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX"), (3, 3, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -20.0, q_j: -20.0, a: None, b: None,
        })],
    );
    let results_l = solve_2d(&input_l).unwrap();

    let station_input = BeamStationInput {
        members: vec![
            BeamMemberInfo { element_id: 1, section_id: 1, material_id: 1, length: 6.0, label: None },
            BeamMemberInfo { element_id: 2, section_id: 1, material_id: 1, length: 6.0, label: None },
        ],
        combinations: vec![
            LabeledResults { combo_id: 1, combo_name: Some("D".into()), results: results_d },
            LabeledResults { combo_id: 2, combo_name: Some("D+L".into()), results: results_l },
        ],
        num_stations: Some(5),
    };

    let grouped = extract_beam_stations_grouped(&station_input);
    let v = serde_json::to_value(&grouped).unwrap();

    // Top-level keys
    assert!(v.get("members").is_some(), "Missing top-level 'members'");
    assert!(v.get("numCombinations").is_some(), "Missing 'numCombinations'");
    assert!(v.get("numStationsPerMember").is_some(), "Missing 'numStationsPerMember'");
    assert!(v.get("signConvention").is_some(), "Missing 'signConvention'");

    let members = v["members"].as_array().unwrap();
    assert_eq!(members.len(), 2);

    // Each member: expected keys
    for m in members {
        for key in &["memberId", "sectionId", "materialId", "length", "stations", "memberGoverning"] {
            assert!(m.get(*key).is_some(), "Missing member key: {}", key);
        }

        // Each station: expected keys
        let stations = m["stations"].as_array().unwrap();
        assert!(!stations.is_empty());
        for st in stations {
            for key in &["stationIndex", "t", "stationX", "comboForces"] {
                assert!(st.get(*key).is_some(), "Missing station key: {}", key);
            }
            // Each comboForces entry
            let cfs = st["comboForces"].as_array().unwrap();
            for cf in cfs {
                for key in &["comboId", "n", "v", "m"] {
                    assert!(cf.get(*key).is_some(), "Missing comboForces key: {}", key);
                }
            }
        }

        // memberGoverning: moment/shear/axial each with pos/neg combo, value, stationIndex
        let gov = &m["memberGoverning"];
        for gov_key in &["moment", "shear", "axial"] {
            if let Some(entry) = gov.get(*gov_key) {
                for field in &["posCombo", "posValue", "posStationIndex",
                               "negCombo", "negValue", "negStationIndex"] {
                    assert!(entry.get(*field).is_some(),
                        "Missing memberGoverning.{}.{}", gov_key, field);
                }
            }
        }
    }

    // Member 1 has load → memberGoverning.moment should exist
    let gov1 = &members[0]["memberGoverning"];
    assert!(gov1.get("moment").is_some(), "Member 1 should have governing moment");
    assert!(gov1.get("shear").is_some(), "Member 1 should have governing shear");
}

// ==================== Design Demands Integration Tests ====================

/// End-to-end: solve → grouped stations → steel demands.
/// Verifies extract_steel_demands_2d produces non-empty, sensible results.
#[test]
fn test_steel_demands_integration() {
    use dedaliano_engine::postprocess::design_demands::{extract_steel_demands_2d, DemandStrategy};

    let input_d = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 12.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX"), (3, 3, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
        })],
    );
    let results_d = solve_2d(&input_d).unwrap();

    let input_l = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 12.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX"), (3, 3, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -20.0, q_j: -20.0, a: None, b: None,
        })],
    );
    let results_l = solve_2d(&input_l).unwrap();

    let station_input = BeamStationInput {
        members: vec![
            BeamMemberInfo { element_id: 1, section_id: 1, material_id: 1, length: 6.0, label: None },
            BeamMemberInfo { element_id: 2, section_id: 1, material_id: 1, length: 6.0, label: None },
        ],
        combinations: vec![
            LabeledResults { combo_id: 1, combo_name: Some("D".into()), results: results_d },
            LabeledResults { combo_id: 2, combo_name: Some("D+L".into()), results: results_l },
        ],
        num_stations: Some(11),
    };

    let grouped = extract_beam_stations_grouped(&station_input);
    let demands = extract_steel_demands_2d(&grouped, DemandStrategy::MaxAbsMoment);

    // Non-empty: one per member
    assert_eq!(demands.len(), 2, "Should have one demand per member");

    // Correct element IDs
    assert_eq!(demands[0].element_id, 1);
    assert_eq!(demands[1].element_id, 2);

    // Fields are sensible (not NaN)
    for d in &demands {
        assert!(!d.n.is_nan(), "n should not be NaN for element {}", d.element_id);
        assert!(!d.my.is_nan(), "my should not be NaN for element {}", d.element_id);
        assert!(d.vy.is_some(), "vy should be Some for 2D");
        assert!(!d.vy.unwrap().is_nan(), "vy should not be NaN");
        assert!(d.mz.is_none(), "mz should be None for 2D demands");
    }

    // Member 1 has load, so moment should be nonzero
    assert!(demands[0].my.abs() > 1e-6, "Member 1 moment should be nonzero: {}", demands[0].my);

    // JSON round-trip: verify key field names
    let json_val = serde_json::to_value(&demands).unwrap();
    let arr = json_val.as_array().unwrap();
    for item in arr {
        for key in &["elementId", "n", "my"] {
            assert!(item.get(*key).is_some(), "Missing steel demand key: {}", key);
        }
    }
}

/// End-to-end: solve → grouped stations → RC demands.
/// Verifies extract_rc_demands_2d produces non-empty, sensible results.
#[test]
fn test_rc_demands_integration() {
    use dedaliano_engine::postprocess::design_demands::{extract_rc_demands_2d, DemandStrategy};

    let input_d = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 12.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX"), (3, 3, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
        })],
    );
    let results_d = solve_2d(&input_d).unwrap();

    let input_l = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 12.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX"), (3, 3, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -20.0, q_j: -20.0, a: None, b: None,
        })],
    );
    let results_l = solve_2d(&input_l).unwrap();

    let station_input = BeamStationInput {
        members: vec![
            BeamMemberInfo { element_id: 1, section_id: 1, material_id: 1, length: 6.0, label: None },
            BeamMemberInfo { element_id: 2, section_id: 1, material_id: 1, length: 6.0, label: None },
        ],
        combinations: vec![
            LabeledResults { combo_id: 1, combo_name: Some("D".into()), results: results_d },
            LabeledResults { combo_id: 2, combo_name: Some("D+L".into()), results: results_l },
        ],
        num_stations: Some(11),
    };

    let grouped = extract_beam_stations_grouped(&station_input);
    let demands = extract_rc_demands_2d(&grouped, DemandStrategy::MaxAbsMoment);

    // Non-empty: one per member
    assert_eq!(demands.len(), 2, "Should have one demand per member");

    // Correct element IDs
    assert_eq!(demands[0].element_id, 1);
    assert_eq!(demands[1].element_id, 2);

    // Fields are sensible (not NaN)
    for d in &demands {
        assert!(!d.mu.is_nan(), "mu should not be NaN for element {}", d.element_id);
        assert!(d.vu.is_some(), "vu should be Some for 2D");
        assert!(!d.vu.unwrap().is_nan(), "vu should not be NaN");
        assert!(d.nu.is_some(), "nu should be Some for 2D");
        assert!(!d.nu.unwrap().is_nan(), "nu should not be NaN");
    }

    // Member 1 has load, so moment should be nonzero
    assert!(demands[0].mu.abs() > 1e-6, "Member 1 mu should be nonzero: {}", demands[0].mu);

    // JSON round-trip: verify key field names
    let json_val = serde_json::to_value(&demands).unwrap();
    let arr = json_val.as_array().unwrap();
    for item in arr {
        for key in &["elementId", "mu"] {
            assert!(item.get(*key).is_some(), "Missing RC demand key: {}", key);
        }
    }
}

// ==================== Grouped-by-Member Integration Tests ====================

/// Full solve → grouped extraction. Verifies member-level governing
/// summaries point to the correct station and combo across a multi-span
/// beam with two load combinations.
#[test]
fn test_grouped_full_solve() {
    // 2-span continuous beam
    let input_d = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 12.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX"), (3, 3, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
        })],
    );
    let results_d = solve_2d(&input_d).unwrap();

    let input_l = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 12.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX"), (3, 3, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -20.0, q_j: -20.0, a: None, b: None,
        })],
    );
    let results_l = solve_2d(&input_l).unwrap();

    let station_input = BeamStationInput {
        members: vec![
            BeamMemberInfo { element_id: 1, section_id: 1, material_id: 1, length: 6.0, label: None },
            BeamMemberInfo { element_id: 2, section_id: 1, material_id: 1, length: 6.0, label: None },
        ],
        combinations: vec![
            LabeledResults { combo_id: 1, combo_name: Some("D".into()), results: results_d },
            LabeledResults { combo_id: 2, combo_name: Some("D+L".into()), results: results_l },
        ],
        num_stations: Some(11),
    };

    let grouped = extract_beam_stations_grouped(&station_input);

    // Structure
    assert_eq!(grouped.members.len(), 2);
    assert_eq!(grouped.num_stations_per_member, 11);

    // Member 1: load on span 1 → member_governing moment from combo 2 (heavier)
    let g1 = &grouped.members[0];
    assert_eq!(g1.member_id, 1);
    assert_eq!(g1.stations.len(), 11);
    let gov_m = g1.member_governing.moment.as_ref().expect("member 1 should have governing moment");
    // Combo 2 has double the load, so it should govern the most extreme moment
    // (both combos produce negative midspan moment; combo 2's is more negative)
    assert_eq!(gov_m.neg_combo, 2, "Heavier combo should govern neg moment");

    // Member 2: no load on span 2, but continuous beam still has forces
    // from span 1 load. Both combos should produce forces.
    let g2 = &grouped.members[1];
    assert_eq!(g2.member_id, 2);
    assert!(g2.member_governing.moment.is_some(), "member 2 should have governing data");

    // JSON round-trip
    let json = serde_json::to_string(&grouped).unwrap();
    let parsed: GroupedBeamStationResult = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed.members.len(), 2);
    assert!(json.contains("memberGoverning"));
    assert!(json.contains("posStationIndex"));
    assert!(json.contains("signConvention"));
}
