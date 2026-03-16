use crate::common::*;
use dedaliano_engine::types::*;
use dedaliano_engine::solver::linear::solve_3d;
use dedaliano_engine::postprocess::beam_stations::*;
use dedaliano_engine::postprocess::diagrams_3d::evaluate_diagram_3d_at;

// Material/section constants
const E: f64 = 200_000.0; // MPa (steel)
const NU: f64 = 0.3;
const A: f64 = 0.01;   // m²
const IY: f64 = 1e-4;  // m⁴
const IZ: f64 = 1e-4;  // m⁴
const J: f64 = 1.5e-4;  // m⁴

// ==================== Integration: Full Solve → 3D Station Extraction ====================

/// End-to-end: solve a 2-span continuous beam in 3D, build station input from solver
/// results with two load combinations, verify station extraction produces
/// correct forces and governing values for all 6 force components.
#[test]
fn test_full_solve_to_station_extraction_3d() {
    // 2-span continuous beam along X: nodes at x=0, 6, 12
    // Gravity load (Y direction) on span 1 only, two combos (dead, dead+live)
    let input_dead = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 6.0, 0.0, 0.0), (3, 12.0, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![
            (1, "frame", 1, 2, 1, 1),
            (2, "frame", 2, 3, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, true, true, true]),   // fixed
            (2, vec![false, true, true, false, false, false]), // roller Y+Z at node 2
            (3, vec![false, true, true, false, false, false]), // roller Y+Z at node 3
        ],
        vec![SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: 1,
            q_yi: -10.0, q_yj: -10.0,
            q_zi: 0.0, q_zj: 0.0,
            a: None, b: None,
        })],
    );
    let results_dead = solve_3d(&input_dead).unwrap();

    let input_live = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 6.0, 0.0, 0.0), (3, 12.0, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![
            (1, "frame", 1, 2, 1, 1),
            (2, "frame", 2, 3, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, true, true, true]),
            (2, vec![false, true, true, false, false, false]),
            (3, vec![false, true, true, false, false, false]),
        ],
        vec![SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: 1,
            q_yi: -20.0, q_yj: -20.0,
            q_zi: 0.0, q_zj: 0.0,
            a: None, b: None,
        })],
    );
    let results_live = solve_3d(&input_live).unwrap();

    let station_input = BeamStationInput3D {
        members: vec![
            BeamMemberInfo { element_id: 1, section_id: 1, material_id: 1, length: 6.0, label: None },
            BeamMemberInfo { element_id: 2, section_id: 1, material_id: 1, length: 6.0, label: None },
        ],
        combinations: vec![
            LabeledResults3D {
                combo_id: 1, combo_name: Some("Dead".to_string()),
                results: results_dead.clone(),
            },
            LabeledResults3D {
                combo_id: 2, combo_name: Some("Dead+Live".to_string()),
                results: results_live.clone(),
            },
        ],
        num_stations: Some(11),
    };

    let result = extract_beam_stations_3d(&station_input);

    // Structure checks
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
        let expected_mz_dead = evaluate_diagram_3d_at(ef_dead, "momentZ", s.t);
        let expected_vy_dead = evaluate_diagram_3d_at(ef_dead, "shearY", s.t);
        let expected_n_dead = evaluate_diagram_3d_at(ef_dead, "axial", s.t);

        let cf_dead = s.combo_forces.iter().find(|cf| cf.combo_id == 1).unwrap();
        assert!((cf_dead.mz - expected_mz_dead).abs() < 1e-10,
            "Station {} t={}: mz mismatch {} vs {}", s.station_index, s.t, cf_dead.mz, expected_mz_dead);
        assert!((cf_dead.vy - expected_vy_dead).abs() < 1e-10,
            "Station {} t={}: vy mismatch {} vs {}", s.station_index, s.t, cf_dead.vy, expected_vy_dead);
        assert!((cf_dead.n - expected_n_dead).abs() < 1e-10,
            "Station {} t={}: n mismatch {} vs {}", s.station_index, s.t, cf_dead.n, expected_n_dead);

        // Out-of-plane forces should be zero (load is in Y only)
        assert!(cf_dead.vz.abs() < 1e-10, "vz should be zero for Y-only load");
        assert!(cf_dead.my.abs() < 1e-10, "my should be zero for Y-only load");
        assert!(cf_dead.torsion.abs() < 1e-10, "torsion should be zero for Y-only load");

        // Live combo should have larger forces
        let expected_mz_live = evaluate_diagram_3d_at(ef_live, "momentZ", s.t);
        let cf_live = s.combo_forces.iter().find(|cf| cf.combo_id == 2).unwrap();
        assert!((cf_live.mz - expected_mz_live).abs() < 1e-10);
    }

    // Governing: combo 2 should produce larger absolute moment_z
    let midspan = result.stations.iter()
        .find(|s| s.member_id == 1 && s.station_index == 5).unwrap();
    let mz_dead = midspan.combo_forces.iter().find(|cf| cf.combo_id == 1).unwrap().mz;
    let mz_live = midspan.combo_forces.iter().find(|cf| cf.combo_id == 2).unwrap().mz;
    assert!(mz_live.abs() > mz_dead.abs(),
        "Live moment_z should be larger: {} vs {}", mz_live, mz_dead);

    // sign_convention present
    assert_eq!(&result.sign_convention.axial, "positive = tension");
    assert_eq!(&result.sign_convention.torsion, "positive = right-hand rule about local x");
}

/// Biaxial bending: load in both Y and Z directions. Verify all 6 force components
/// are non-trivial and correctly extracted.
#[test]
fn test_biaxial_bending_station_extraction_3d() {
    // Cantilever with biaxial tip load
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true, true, true, true, true, true])], // fixed at node 1
        vec![
            SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: 2, fx: 10.0, fy: -50.0, fz: -30.0, mx: 5.0, my: 0.0, mz: 0.0, bw: None,
            }),
        ],
    );
    let results = solve_3d(&input).unwrap();

    let station_input = BeamStationInput3D {
        members: vec![BeamMemberInfo {
            element_id: 1, section_id: 1, material_id: 1, length: 4.0, label: None,
        }],
        combinations: vec![LabeledResults3D {
            combo_id: 1, combo_name: Some("ULS".to_string()), results: results.clone(),
        }],
        num_stations: Some(5),
    };

    let result = extract_beam_stations_3d(&station_input);
    assert_eq!(result.stations.len(), 5);

    // Station at fixed end (t=0): should have all 6 forces non-trivially
    let s0 = &result.stations[0];
    let cf = &s0.combo_forces[0];

    // Axial from fx=10
    assert!(cf.n.abs() > 1.0, "Axial should be non-trivial: {}", cf.n);
    // Shear Y from fy=-50
    assert!(cf.vy.abs() > 1.0, "Shear Y should be non-trivial: {}", cf.vy);
    // Shear Z from fz=-30
    assert!(cf.vz.abs() > 1.0, "Shear Z should be non-trivial: {}", cf.vz);
    // Moment Z from fy (bending in XY plane)
    assert!(cf.mz.abs() > 1.0, "Moment Z should be non-trivial: {}", cf.mz);
    // Moment Y from fz (bending in XZ plane)
    assert!(cf.my.abs() > 1.0, "Moment Y should be non-trivial: {}", cf.my);
    // Torsion from mx=5
    assert!(cf.torsion.abs() > 1.0, "Torsion should be non-trivial: {}", cf.torsion);

    // Station at free end (t=1.0): moment and shear should be ~zero
    let s_end = &result.stations[4];
    let cf_end = &s_end.combo_forces[0];
    assert!(cf_end.mz.abs() < 1.0, "M_z at free end should be ~0: {}", cf_end.mz);
    assert!(cf_end.my.abs() < 1.0, "M_y at free end should be ~0: {}", cf_end.my);

    // Governing: all 6 force types should be present
    let gov = &s0.governing;
    assert!(gov.axial.is_some(), "governing axial should be Some");
    assert!(gov.shear_y.is_some(), "governing shear_y should be Some");
    assert!(gov.shear_z.is_some(), "governing shear_z should be Some");
    assert!(gov.moment_y.is_some(), "governing moment_y should be Some");
    assert!(gov.moment_z.is_some(), "governing moment_z should be Some");
    assert!(gov.torsion.is_some(), "governing torsion should be Some");
}

/// JSON round-trip: 3D station results serialize and deserialize correctly.
#[test]
fn test_json_round_trip_3d() {
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true, true, true, true, true, true])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -50.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = solve_3d(&input).unwrap();

    let station_input = BeamStationInput3D {
        members: vec![BeamMemberInfo {
            element_id: 1, section_id: 1, material_id: 1, length: 4.0, label: None,
        }],
        combinations: vec![LabeledResults3D {
            combo_id: 1, combo_name: Some("ULS".to_string()), results,
        }],
        num_stations: Some(5),
    };

    let json_in = serde_json::to_string(&station_input).unwrap();
    let parsed_input: BeamStationInput3D = serde_json::from_str(&json_in).unwrap();
    assert_eq!(parsed_input.members.len(), 1);

    let result = extract_beam_stations_3d(&parsed_input);
    let json_out = serde_json::to_string(&result).unwrap();
    let parsed_result: BeamStationResult3D = serde_json::from_str(&json_out).unwrap();

    assert_eq!(parsed_result.stations.len(), 5);
    assert_eq!(parsed_result.num_stations_per_member, 5);

    // camelCase keys present
    assert!(json_out.contains("\"stationX\""));
    assert!(json_out.contains("\"comboForces\""));
    assert!(json_out.contains("\"comboName\""));
    assert!(json_out.contains("\"memberId\""));
    assert!(json_out.contains("\"sectionId\""));
    assert!(json_out.contains("\"signConvention\""));
    // 3D-specific fields
    assert!(json_out.contains("\"shearY\"") || json_out.contains("\"vy\""));
    assert!(json_out.contains("\"momentZ\"") || json_out.contains("\"mz\""));
}

/// Snapshot: stable serialized output for a 3D cantilever.
/// If this test breaks, product-layer deserialization may also break.
#[test]
fn test_snapshot_stable_output_3d() {
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true, true, true, true, true, true])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -50.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = solve_3d(&input).unwrap();

    let station_input = BeamStationInput3D {
        members: vec![BeamMemberInfo {
            element_id: 1, section_id: 1, material_id: 1, length: 4.0, label: None,
        }],
        combinations: vec![LabeledResults3D {
            combo_id: 1, combo_name: None, results,
        }],
        num_stations: Some(3),
    };

    let result = extract_beam_stations_3d(&station_input);
    assert_eq!(result.stations.len(), 3);

    // Station 0 (t=0, fixed end)
    let s0 = &result.stations[0];
    assert_eq!(s0.member_id, 1);
    assert_eq!(s0.station_index, 0);
    assert!(s0.t.abs() < 1e-15);
    assert!(s0.station_x.abs() < 1e-15);
    let cf0 = &s0.combo_forces[0];
    assert_eq!(cf0.combo_id, 1);
    assert!((cf0.vy - 50.0).abs() < 1.0, "V_y at fixed end: {}", cf0.vy);

    // Station 2 (t=1.0, free end)
    let s2 = &result.stations[2];
    assert!((s2.t - 1.0).abs() < 1e-15);
    assert!((s2.station_x - 4.0).abs() < 1e-10);
    let cf2 = &s2.combo_forces[0];
    assert!(cf2.mz.abs() < 1.0, "M_z at free end: {}", cf2.mz);

    // Governing present — all 6 force types (single combo)
    let gov = &s0.governing;
    assert!(gov.shear_y.is_some(), "governing shear_y should be Some");
    assert!(gov.moment_z.is_some(), "governing moment_z should be Some");
    let gov_vy = gov.shear_y.as_ref().unwrap();
    assert_eq!(gov_vy.pos_combo, 1);

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

    // 3D governing keys
    let gov_json = &st["governing"];
    for key in &["shearY", "shearZ", "momentY", "momentZ", "axial", "torsion"] {
        // Some may be None (skip_serializing_if), but shearY and momentZ must be present
        // for this load case
        if *key == "shearY" || *key == "momentZ" || *key == "axial" {
            assert!(gov_json.get(*key).is_some(), "Missing governing key: {}", key);
            let entry = &gov_json[*key];
            for ekey in &["posCombo", "posValue", "negCombo", "negValue"] {
                assert!(entry.get(*ekey).is_some(), "Missing {}.{}", key, ekey);
            }
        }
    }
}

/// When no combo has forces for a 3D member, governing should be null/absent,
/// not phantom infinities.
#[test]
fn test_no_data_governing_absent_in_json_3d() {
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true, true, true, true, true, true])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -50.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = solve_3d(&input).unwrap();

    // Member 99 doesn't exist in the results
    let station_input = BeamStationInput3D {
        members: vec![BeamMemberInfo {
            element_id: 99, section_id: 1, material_id: 1, length: 4.0, label: None,
        }],
        combinations: vec![LabeledResults3D {
            combo_id: 1, combo_name: None, results,
        }],
        num_stations: Some(2),
    };

    let result = extract_beam_stations_3d(&station_input);

    // combo_forces empty, all governing None
    for s in &result.stations {
        assert!(s.combo_forces.is_empty());
        assert!(s.governing.axial.is_none());
        assert!(s.governing.shear_y.is_none());
        assert!(s.governing.shear_z.is_none());
        assert!(s.governing.moment_y.is_none());
        assert!(s.governing.moment_z.is_none());
        assert!(s.governing.torsion.is_none());
    }

    // JSON: all governing fields absent
    let json = serde_json::to_string(&result).unwrap();
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    let gov = &v["stations"][0]["governing"];
    for key in &["axial", "shearY", "shearZ", "momentY", "momentZ", "torsion"] {
        assert!(gov.get(*key).is_none(), "{} should be absent in JSON", key);
    }
}

// ==================== Grouped-by-Member 3D Integration Tests ====================

/// Full solve → grouped 3D extraction. Verifies member-level governing
/// summaries point to correct station and combo.
#[test]
fn test_grouped_full_solve_3d() {
    // 2-span continuous beam, gravity on span 1 only
    let input_d = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 6.0, 0.0, 0.0), (3, 12.0, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![
            (1, "frame", 1, 2, 1, 1),
            (2, "frame", 2, 3, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, true, true, true]),
            (2, vec![false, true, true, false, false, false]),
            (3, vec![false, true, true, false, false, false]),
        ],
        vec![SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: 1,
            q_yi: -10.0, q_yj: -10.0,
            q_zi: 0.0, q_zj: 0.0,
            a: None, b: None,
        })],
    );
    let results_d = solve_3d(&input_d).unwrap();

    let input_l = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 6.0, 0.0, 0.0), (3, 12.0, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![
            (1, "frame", 1, 2, 1, 1),
            (2, "frame", 2, 3, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, true, true, true]),
            (2, vec![false, true, true, false, false, false]),
            (3, vec![false, true, true, false, false, false]),
        ],
        vec![SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: 1,
            q_yi: -20.0, q_yj: -20.0,
            q_zi: 0.0, q_zj: 0.0,
            a: None, b: None,
        })],
    );
    let results_l = solve_3d(&input_l).unwrap();

    let station_input = BeamStationInput3D {
        members: vec![
            BeamMemberInfo { element_id: 1, section_id: 1, material_id: 1, length: 6.0, label: None },
            BeamMemberInfo { element_id: 2, section_id: 1, material_id: 1, length: 6.0, label: None },
        ],
        combinations: vec![
            LabeledResults3D { combo_id: 1, combo_name: Some("D".into()), results: results_d },
            LabeledResults3D { combo_id: 2, combo_name: Some("D+L".into()), results: results_l },
        ],
        num_stations: Some(11),
    };

    let grouped = extract_beam_stations_grouped_3d(&station_input);

    // Structure
    assert_eq!(grouped.members.len(), 2);
    assert_eq!(grouped.num_stations_per_member, 11);

    // Member 1: heavier combo should govern moment_z
    let g1 = &grouped.members[0];
    assert_eq!(g1.member_id, 1);
    assert_eq!(g1.stations.len(), 11);
    let gov_mz = g1.member_governing.moment_z.as_ref().expect("member 1 should have governing moment_z");
    assert_eq!(gov_mz.neg_combo, 2, "Heavier combo should govern neg moment_z");

    // Member 2: no load on span 2 but continuous beam transfers forces
    let g2 = &grouped.members[1];
    assert_eq!(g2.member_id, 2);
    assert!(g2.member_governing.moment_z.is_some(), "member 2 should have governing moment_z");

    // JSON round-trip
    let json = serde_json::to_string(&grouped).unwrap();
    let parsed: GroupedBeamStationResult3D = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed.members.len(), 2);
    assert!(json.contains("memberGoverning"));
    assert!(json.contains("posStationIndex"));
    assert!(json.contains("signConvention"));
    // 3D-specific governing keys
    assert!(json.contains("momentZ") || json.contains("moment_z"));
    assert!(json.contains("shearY") || json.contains("shear_y"));
}
