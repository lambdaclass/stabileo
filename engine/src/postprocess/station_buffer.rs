//! Compact station forces for the verification consumer. The report API retains its
//! grouped stations and governing summaries; this path transfers only forces it uses.
use super::diagrams_3d::evaluate_diagram_3d_at;
use crate::types::ElementForces3D;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationBufferMember {
    element_id: usize,
    length: f64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationBufferCombo {
    combo_id: usize,
    element_forces: Vec<ElementForces3D>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationBufferInput {
    members: Vec<StationBufferMember>,
    combinations: Vec<StationBufferCombo>,
    num_stations: usize,
}

/// Wire v1: [version, member count, station count], then per member
/// [id, length, combo count], then per combo [id, (n, vy, vz, my, mz, torsion)*stations].
/// Input order is retained, including missing-force members (zero combos). Force
/// duplicates retain the last record, matching the grouped station extractor.
pub fn extract(input: &StationBufferInput) -> Vec<f64> {
    let count = input.num_stations.max(2);
    let indices: Vec<HashMap<usize, &ElementForces3D>> = input
        .combinations
        .iter()
        .map(|c| {
            c.element_forces
                .iter()
                .map(|ef| (ef.element_id, ef))
                .collect()
        })
        .collect();
    let mut output = vec![1.0, input.members.len() as f64, count as f64];
    for member in &input.members {
        output.extend([member.element_id as f64, member.length, 0.0]);
        let combo_count = output.len() - 1;
        for (combo, index) in input.combinations.iter().zip(&indices) {
            let Some(ef) = index.get(&member.element_id) else {
                continue;
            };
            output[combo_count] += 1.0;
            output.push(combo.combo_id as f64);
            for station in 0..count {
                let t = station as f64 / (count - 1) as f64;
                for component in ["axial", "shearY", "shearZ", "momentY", "momentZ", "torsion"] {
                    output.push(evaluate_diagram_3d_at(ef, component, t));
                }
            }
        }
    }
    output
}
