use crate::types::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::diagrams::compute_diagram_value_at;
use super::diagrams_3d::evaluate_diagram_3d_at;

fn default_schema_version() -> u32 { 1 }

// ==================== Sign Convention Metadata ====================

/// Describes the local-axis and sign conventions used for station forces.
/// Included in every result payload so the product layer can interpret
/// values without implicit assumptions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignConvention2D {
    pub local_x: String,
    pub axial: String,
    pub shear: String,
    pub moment: String,
    pub station_x: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignConvention3D {
    pub local_x: String,
    pub local_yz: String,
    pub axial: String,
    pub shear_y: String,
    pub shear_z: String,
    pub moment_z: String,
    pub moment_y: String,
    pub torsion: String,
    pub station_x: String,
}

fn sign_convention_2d() -> SignConvention2D {
    SignConvention2D {
        local_x: "node_i to node_j".into(),
        axial: "positive = tension".into(),
        shear: "positive = clockwise rotation of left segment".into(),
        moment: "positive = sagging (tension on bottom fiber); solver uses f = K*u - FEF".into(),
        station_x: "metres from node_i along member axis".into(),
    }
}

fn sign_convention_3d() -> SignConvention3D {
    SignConvention3D {
        local_x: "node_i to node_j".into(),
        local_yz: "per element orientation node or default rule".into(),
        axial: "positive = tension".into(),
        shear_y: "positive = shear in local +y".into(),
        shear_z: "positive = shear in local +z".into(),
        moment_z: "positive = sagging in x-y plane (bending about local z)".into(),
        moment_y: "positive = sagging in x-z plane (bending about local y)".into(),
        torsion: "positive = right-hand rule about local x".into(),
        station_x: "metres from node_i along member axis".into(),
    }
}

// ==================== 2D Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeamMemberInfo {
    pub element_id: usize,
    pub section_id: usize,
    pub material_id: usize,
    pub length: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabeledResults {
    pub combo_id: usize,
    #[serde(default)]
    pub combo_name: Option<String>,
    pub results: AnalysisResults,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeamStationInput {
    pub members: Vec<BeamMemberInfo>,
    pub combinations: Vec<LabeledResults>,
    #[serde(default)]
    pub num_stations: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationComboForces {
    pub combo_id: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub combo_name: Option<String>,
    pub n: f64,
    pub v: f64,
    pub m: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoverningEntry {
    pub pos_combo: usize,
    pub pos_value: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pos_combo_name: Option<String>,
    pub neg_combo: usize,
    pub neg_value: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub neg_combo_name: Option<String>,
}

/// Builder that accumulates updates and only produces a GoverningEntry
/// if at least one combo contributed data. Prevents emitting infinities
/// and phantom combo_id=0 when no combos have forces for a member.
struct GoverningBuilder {
    pos_combo: usize,
    pos_value: f64,
    pos_combo_name: Option<String>,
    neg_combo: usize,
    neg_value: f64,
    neg_combo_name: Option<String>,
    has_data: bool,
}

impl GoverningBuilder {
    fn new() -> Self {
        Self {
            pos_combo: 0,
            pos_value: f64::NEG_INFINITY,
            pos_combo_name: None,
            neg_combo: 0,
            neg_value: f64::INFINITY,
            neg_combo_name: None,
            has_data: false,
        }
    }

    fn update(&mut self, combo_id: usize, value: f64, combo_name: Option<&str>) {
        self.has_data = true;
        if value > self.pos_value {
            self.pos_value = value;
            self.pos_combo = combo_id;
            self.pos_combo_name = combo_name.map(|s| s.to_string());
        }
        if value < self.neg_value {
            self.neg_value = value;
            self.neg_combo = combo_id;
            self.neg_combo_name = combo_name.map(|s| s.to_string());
        }
    }

    fn finish(self) -> Option<GoverningEntry> {
        if self.has_data {
            Some(GoverningEntry {
                pos_combo: self.pos_combo,
                pos_value: self.pos_value,
                pos_combo_name: self.pos_combo_name,
                neg_combo: self.neg_combo,
                neg_value: self.neg_value,
                neg_combo_name: self.neg_combo_name,
            })
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoverningInfo {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub moment: Option<GoverningEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shear: Option<GoverningEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub axial: Option<GoverningEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeamStation {
    pub member_id: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub station_index: usize,
    pub t: f64,
    pub station_x: f64,
    pub section_id: usize,
    pub material_id: usize,
    pub combo_forces: Vec<StationComboForces>,
    pub governing: GoverningInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeamStationResult {
    /// Schema version for payload evolution safety.
    ///
    /// # Evolution rules
    /// - Adding new Optional fields: does NOT bump version (backwards compatible)
    /// - Removing fields, renaming fields, changing types: MUST bump version
    /// - Downstream consumers should check `schema_version` and handle unknown versions gracefully
    /// - Version history:
    ///   - v1: initial stable schema (2026-03-16)
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub stations: Vec<BeamStation>,
    pub num_members: usize,
    pub num_combinations: usize,
    pub num_stations_per_member: usize,
    pub sign_convention: SignConvention2D,
}

// ==================== 3D Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationComboForces3D {
    pub combo_id: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub combo_name: Option<String>,
    pub n: f64,
    pub vy: f64,
    pub vz: f64,
    pub my: f64,
    pub mz: f64,
    pub torsion: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoverningInfo3D {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub axial: Option<GoverningEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shear_y: Option<GoverningEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shear_z: Option<GoverningEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub moment_y: Option<GoverningEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub moment_z: Option<GoverningEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub torsion: Option<GoverningEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeamStation3D {
    pub member_id: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub station_index: usize,
    pub t: f64,
    pub station_x: f64,
    pub section_id: usize,
    pub material_id: usize,
    pub combo_forces: Vec<StationComboForces3D>,
    pub governing: GoverningInfo3D,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabeledResults3D {
    pub combo_id: usize,
    #[serde(default)]
    pub combo_name: Option<String>,
    pub results: AnalysisResults3D,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeamStationInput3D {
    pub members: Vec<BeamMemberInfo>,
    pub combinations: Vec<LabeledResults3D>,
    #[serde(default)]
    pub num_stations: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeamStationResult3D {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub stations: Vec<BeamStation3D>,
    pub num_members: usize,
    pub num_combinations: usize,
    pub num_stations_per_member: usize,
    pub sign_convention: SignConvention3D,
}

// ==================== 2D Extraction ====================

const DEFAULT_NUM_STATIONS: usize = 11;

pub fn extract_beam_stations(input: &BeamStationInput) -> BeamStationResult {
    let n_stations = input.num_stations.unwrap_or(DEFAULT_NUM_STATIONS).max(2);

    // Build element_id → index maps per combination (once)
    let ef_indices: Vec<HashMap<usize, usize>> = input
        .combinations
        .iter()
        .map(|combo| {
            combo
                .results
                .element_forces
                .iter()
                .enumerate()
                .map(|(i, ef)| (ef.element_id, i))
                .collect()
        })
        .collect();

    let mut stations = Vec::with_capacity(input.members.len() * n_stations);

    for member in &input.members {
        for s_idx in 0..n_stations {
            let t = s_idx as f64 / (n_stations - 1) as f64;
            let station_x = t * member.length;

            let mut gov_moment = GoverningBuilder::new();
            let mut gov_shear = GoverningBuilder::new();
            let mut gov_axial = GoverningBuilder::new();
            let mut combo_forces = Vec::with_capacity(input.combinations.len());

            for (c_idx, combo) in input.combinations.iter().enumerate() {
                let ef_idx = match ef_indices[c_idx].get(&member.element_id) {
                    Some(&idx) => idx,
                    None => continue,
                };
                let ef = &combo.results.element_forces[ef_idx];

                let m = compute_diagram_value_at("moment", t, ef);
                let v = compute_diagram_value_at("shear", t, ef);
                let n = compute_diagram_value_at("axial", t, ef);

                gov_moment.update(combo.combo_id, m, combo.combo_name.as_deref());
                gov_shear.update(combo.combo_id, v, combo.combo_name.as_deref());
                gov_axial.update(combo.combo_id, n, combo.combo_name.as_deref());

                combo_forces.push(StationComboForces {
                    combo_id: combo.combo_id,
                    combo_name: combo.combo_name.clone(),
                    n,
                    v,
                    m,
                });
            }

            stations.push(BeamStation {
                member_id: member.element_id,
                label: member.label.clone(),
                station_index: s_idx,
                t,
                station_x,
                section_id: member.section_id,
                material_id: member.material_id,
                combo_forces,
                governing: GoverningInfo {
                    moment: gov_moment.finish(),
                    shear: gov_shear.finish(),
                    axial: gov_axial.finish(),
                },
            });
        }
    }

    BeamStationResult {
        schema_version: 1,
        stations,
        num_members: input.members.len(),
        num_combinations: input.combinations.len(),
        num_stations_per_member: n_stations,
        sign_convention: sign_convention_2d(),
    }
}

// ==================== 3D Extraction ====================

pub fn extract_beam_stations_3d(input: &BeamStationInput3D) -> BeamStationResult3D {
    let n_stations = input.num_stations.unwrap_or(DEFAULT_NUM_STATIONS).max(2);

    let ef_indices: Vec<HashMap<usize, usize>> = input
        .combinations
        .iter()
        .map(|combo| {
            combo
                .results
                .element_forces
                .iter()
                .enumerate()
                .map(|(i, ef)| (ef.element_id, i))
                .collect()
        })
        .collect();

    let mut stations = Vec::with_capacity(input.members.len() * n_stations);

    for member in &input.members {
        for s_idx in 0..n_stations {
            let t = s_idx as f64 / (n_stations - 1) as f64;
            let station_x = t * member.length;

            let mut gov_axial = GoverningBuilder::new();
            let mut gov_shear_y = GoverningBuilder::new();
            let mut gov_shear_z = GoverningBuilder::new();
            let mut gov_moment_y = GoverningBuilder::new();
            let mut gov_moment_z = GoverningBuilder::new();
            let mut gov_torsion = GoverningBuilder::new();
            let mut combo_forces = Vec::with_capacity(input.combinations.len());

            for (c_idx, combo) in input.combinations.iter().enumerate() {
                let ef_idx = match ef_indices[c_idx].get(&member.element_id) {
                    Some(&idx) => idx,
                    None => continue,
                };
                let ef = &combo.results.element_forces[ef_idx];

                let n = evaluate_diagram_3d_at(ef, "axial", t);
                let vy = evaluate_diagram_3d_at(ef, "shearY", t);
                let vz = evaluate_diagram_3d_at(ef, "shearZ", t);
                let my = evaluate_diagram_3d_at(ef, "momentY", t);
                let mz = evaluate_diagram_3d_at(ef, "momentZ", t);
                let torsion = evaluate_diagram_3d_at(ef, "torsion", t);

                gov_axial.update(combo.combo_id, n, combo.combo_name.as_deref());
                gov_shear_y.update(combo.combo_id, vy, combo.combo_name.as_deref());
                gov_shear_z.update(combo.combo_id, vz, combo.combo_name.as_deref());
                gov_moment_y.update(combo.combo_id, my, combo.combo_name.as_deref());
                gov_moment_z.update(combo.combo_id, mz, combo.combo_name.as_deref());
                gov_torsion.update(combo.combo_id, torsion, combo.combo_name.as_deref());

                combo_forces.push(StationComboForces3D {
                    combo_id: combo.combo_id,
                    combo_name: combo.combo_name.clone(),
                    n,
                    vy,
                    vz,
                    my,
                    mz,
                    torsion,
                });
            }

            stations.push(BeamStation3D {
                member_id: member.element_id,
                label: member.label.clone(),
                station_index: s_idx,
                t,
                station_x,
                section_id: member.section_id,
                material_id: member.material_id,
                combo_forces,
                governing: GoverningInfo3D {
                    axial: gov_axial.finish(),
                    shear_y: gov_shear_y.finish(),
                    shear_z: gov_shear_z.finish(),
                    moment_y: gov_moment_y.finish(),
                    moment_z: gov_moment_z.finish(),
                    torsion: gov_torsion.finish(),
                },
            });
        }
    }

    BeamStationResult3D {
        schema_version: 1,
        stations,
        num_members: input.members.len(),
        num_combinations: input.combinations.len(),
        num_stations_per_member: n_stations,
        sign_convention: sign_convention_3d(),
    }
}

// ==================== Grouped-by-Member Convenience Layer ====================

/// Per-member governing summary: the worst pos/neg across ALL stations for
/// that member. Saves the frontend from scanning station arrays.
/// Each entry also carries `station_index` so the product layer knows
/// exactly which station produced the governing value.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberGoverningEntry {
    pub pos_combo: usize,
    pub pos_value: f64,
    pub pos_station_index: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pos_combo_name: Option<String>,
    pub neg_combo: usize,
    pub neg_value: f64,
    pub neg_station_index: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub neg_combo_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberGoverning {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub moment: Option<MemberGoverningEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shear: Option<MemberGoverningEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub axial: Option<MemberGoverningEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberGoverning3D {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub axial: Option<MemberGoverningEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shear_y: Option<MemberGoverningEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shear_z: Option<MemberGoverningEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub moment_y: Option<MemberGoverningEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub moment_z: Option<MemberGoverningEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub torsion: Option<MemberGoverningEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberStationGroup {
    pub member_id: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub section_id: usize,
    pub material_id: usize,
    pub length: f64,
    pub stations: Vec<BeamStation>,
    pub member_governing: MemberGoverning,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupedBeamStationResult {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub members: Vec<MemberStationGroup>,
    pub num_combinations: usize,
    pub num_stations_per_member: usize,
    pub sign_convention: SignConvention2D,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberStationGroup3D {
    pub member_id: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub section_id: usize,
    pub material_id: usize,
    pub length: f64,
    pub stations: Vec<BeamStation3D>,
    pub member_governing: MemberGoverning3D,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupedBeamStationResult3D {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub members: Vec<MemberStationGroup3D>,
    pub num_combinations: usize,
    pub num_stations_per_member: usize,
    pub sign_convention: SignConvention3D,
}

struct MemberGovBuilder {
    pos_combo: usize,
    pos_value: f64,
    pos_station: usize,
    pos_combo_name: Option<String>,
    neg_combo: usize,
    neg_value: f64,
    neg_station: usize,
    neg_combo_name: Option<String>,
    has_data: bool,
}

impl MemberGovBuilder {
    fn new() -> Self {
        Self {
            pos_combo: 0, pos_value: f64::NEG_INFINITY, pos_station: 0, pos_combo_name: None,
            neg_combo: 0, neg_value: f64::INFINITY, neg_station: 0, neg_combo_name: None,
            has_data: false,
        }
    }

    fn feed(&mut self, entry: &GoverningEntry, station_index: usize) {
        self.has_data = true;
        if entry.pos_value > self.pos_value {
            self.pos_value = entry.pos_value;
            self.pos_combo = entry.pos_combo;
            self.pos_station = station_index;
            self.pos_combo_name = entry.pos_combo_name.clone();
        }
        if entry.neg_value < self.neg_value {
            self.neg_value = entry.neg_value;
            self.neg_combo = entry.neg_combo;
            self.neg_station = station_index;
            self.neg_combo_name = entry.neg_combo_name.clone();
        }
    }

    fn finish(self) -> Option<MemberGoverningEntry> {
        if self.has_data {
            Some(MemberGoverningEntry {
                pos_combo: self.pos_combo,
                pos_value: self.pos_value,
                pos_station_index: self.pos_station,
                pos_combo_name: self.pos_combo_name,
                neg_combo: self.neg_combo,
                neg_value: self.neg_value,
                neg_station_index: self.neg_station,
                neg_combo_name: self.neg_combo_name,
            })
        } else {
            None
        }
    }
}

/// Group a flat station result by member, computing member-level governing summaries.
pub fn group_by_member(flat: &BeamStationResult, members: &[BeamMemberInfo]) -> GroupedBeamStationResult {
    let mut groups = Vec::with_capacity(members.len());

    for member in members {
        let member_stations: Vec<&BeamStation> = flat.stations.iter()
            .filter(|s| s.member_id == member.element_id)
            .collect();

        let mut gov_m = MemberGovBuilder::new();
        let mut gov_v = MemberGovBuilder::new();
        let mut gov_n = MemberGovBuilder::new();

        for s in &member_stations {
            if let Some(ref e) = s.governing.moment { gov_m.feed(e, s.station_index); }
            if let Some(ref e) = s.governing.shear { gov_v.feed(e, s.station_index); }
            if let Some(ref e) = s.governing.axial { gov_n.feed(e, s.station_index); }
        }

        groups.push(MemberStationGroup {
            member_id: member.element_id,
            label: member.label.clone(),
            section_id: member.section_id,
            material_id: member.material_id,
            length: member.length,
            stations: member_stations.into_iter().cloned().collect(),
            member_governing: MemberGoverning {
                moment: gov_m.finish(),
                shear: gov_v.finish(),
                axial: gov_n.finish(),
            },
        });
    }

    GroupedBeamStationResult {
        schema_version: 1,
        members: groups,
        num_combinations: flat.num_combinations,
        num_stations_per_member: flat.num_stations_per_member,
        sign_convention: sign_convention_2d(),
    }
}

/// Group a flat 3D station result by member, computing member-level governing summaries.
pub fn group_by_member_3d(flat: &BeamStationResult3D, members: &[BeamMemberInfo]) -> GroupedBeamStationResult3D {
    let mut groups = Vec::with_capacity(members.len());

    for member in members {
        let member_stations: Vec<&BeamStation3D> = flat.stations.iter()
            .filter(|s| s.member_id == member.element_id)
            .collect();

        let mut gov_axial = MemberGovBuilder::new();
        let mut gov_vy = MemberGovBuilder::new();
        let mut gov_vz = MemberGovBuilder::new();
        let mut gov_my = MemberGovBuilder::new();
        let mut gov_mz = MemberGovBuilder::new();
        let mut gov_tor = MemberGovBuilder::new();

        for s in &member_stations {
            if let Some(ref e) = s.governing.axial { gov_axial.feed(e, s.station_index); }
            if let Some(ref e) = s.governing.shear_y { gov_vy.feed(e, s.station_index); }
            if let Some(ref e) = s.governing.shear_z { gov_vz.feed(e, s.station_index); }
            if let Some(ref e) = s.governing.moment_y { gov_my.feed(e, s.station_index); }
            if let Some(ref e) = s.governing.moment_z { gov_mz.feed(e, s.station_index); }
            if let Some(ref e) = s.governing.torsion { gov_tor.feed(e, s.station_index); }
        }

        groups.push(MemberStationGroup3D {
            member_id: member.element_id,
            label: member.label.clone(),
            section_id: member.section_id,
            material_id: member.material_id,
            length: member.length,
            stations: member_stations.into_iter().cloned().collect(),
            member_governing: MemberGoverning3D {
                axial: gov_axial.finish(),
                shear_y: gov_vy.finish(),
                shear_z: gov_vz.finish(),
                moment_y: gov_my.finish(),
                moment_z: gov_mz.finish(),
                torsion: gov_tor.finish(),
            },
        });
    }

    GroupedBeamStationResult3D {
        schema_version: 1,
        members: groups,
        num_combinations: flat.num_combinations,
        num_stations_per_member: flat.num_stations_per_member,
        sign_convention: sign_convention_3d(),
    }
}

/// One-shot: extract + group in a single call.
pub fn extract_beam_stations_grouped(input: &BeamStationInput) -> GroupedBeamStationResult {
    let flat = extract_beam_stations(input);
    group_by_member(&flat, &input.members)
}

/// One-shot 3D: extract + group in a single call.
pub fn extract_beam_stations_grouped_3d(input: &BeamStationInput3D) -> GroupedBeamStationResult3D {
    let flat = extract_beam_stations_3d(input);
    group_by_member_3d(&flat, &input.members)
}

// ==================== Tests ====================

#[cfg(test)]
mod tests {
    use super::*;

    fn make_ss_udl_ef(element_id: usize) -> ElementForces {
        ElementForces {
            element_id,
            length: 6.0,
            n_start: 0.0, n_end: 0.0,
            v_start: 30.0, v_end: -30.0,
            m_start: 0.0, m_end: 0.0,
            q_i: -10.0, q_j: -10.0,
            point_loads: vec![], distributed_loads: vec![],
            hinge_start: false, hinge_end: false,
        }
    }

    fn make_member(element_id: usize, length: f64) -> BeamMemberInfo {
        BeamMemberInfo { element_id, section_id: 1, material_id: 1, length, label: None }
    }

    fn make_results(efs: Vec<ElementForces>) -> AnalysisResults {
        AnalysisResults {
            displacements: vec![], reactions: vec![], element_forces: efs,
            constraint_forces: vec![], diagnostics: vec![], solver_diagnostics: vec![], structured_diagnostics: vec![], equilibrium: None, result_summary: None, solver_run_meta: None,
        }
    }

    #[test]
    fn endpoint_parity() {
        let ef = make_ss_udl_ef(1);
        let input = BeamStationInput {
            members: vec![make_member(1, 6.0)],
            combinations: vec![LabeledResults {
                combo_id: 1, combo_name: None,
                results: make_results(vec![ef.clone()]),
            }],
            num_stations: Some(11),
        };

        let result = extract_beam_stations(&input);
        assert_eq!(result.stations.len(), 11);

        let s0 = &result.stations[0];
        assert_eq!(s0.station_index, 0);
        assert!((s0.t).abs() < 1e-12);
        let cf0 = &s0.combo_forces[0];
        assert!((cf0.m - ef.m_start).abs() < 1e-10);
        assert!((cf0.v - ef.v_start).abs() < 1e-10);
        assert!((cf0.n - ef.n_start).abs() < 1e-10);

        let s_last = result.stations.last().unwrap();
        assert!((s_last.t - 1.0).abs() < 1e-12);
        let cf1 = &s_last.combo_forces[0];
        assert!((cf1.v - ef.v_end).abs() < 1e-10);
        assert!((cf1.m - ef.m_end).abs() < 1e-10);
    }

    #[test]
    fn midspan_udl_moment() {
        let ef = make_ss_udl_ef(1);
        let input = BeamStationInput {
            members: vec![make_member(1, 6.0)],
            combinations: vec![LabeledResults {
                combo_id: 1, combo_name: None,
                results: make_results(vec![ef]),
            }],
            num_stations: Some(11),
        };

        let result = extract_beam_stations(&input);
        let s_mid = &result.stations[5];
        assert!((s_mid.t - 0.5).abs() < 1e-12);
        let m_mid = s_mid.combo_forces[0].m;
        assert!((m_mid - (-45.0)).abs() < 0.1, "M_mid = {}", m_mid);
    }

    #[test]
    fn governing_combo_split() {
        let ef0 = ElementForces {
            element_id: 1, length: 4.0,
            n_start: 0.0, n_end: 0.0,
            v_start: 5.0, v_end: -5.0,
            m_start: -100.0, m_end: 100.0,
            q_i: 0.0, q_j: 0.0,
            point_loads: vec![], distributed_loads: vec![],
            hinge_start: false, hinge_end: false,
        };
        let ef1 = ElementForces {
            element_id: 1, length: 4.0,
            n_start: 0.0, n_end: 0.0,
            v_start: 200.0, v_end: -200.0,
            m_start: -10.0, m_end: 10.0,
            q_i: 0.0, q_j: 0.0,
            point_loads: vec![], distributed_loads: vec![],
            hinge_start: false, hinge_end: false,
        };

        let input = BeamStationInput {
            members: vec![make_member(1, 4.0)],
            combinations: vec![
                LabeledResults { combo_id: 10, combo_name: None, results: make_results(vec![ef0]) },
                LabeledResults { combo_id: 20, combo_name: None, results: make_results(vec![ef1]) },
            ],
            num_stations: Some(2),
        };

        let result = extract_beam_stations(&input);
        let s1 = &result.stations[1];
        let gov_m = s1.governing.moment.as_ref().unwrap();
        let gov_v = s1.governing.shear.as_ref().unwrap();
        assert_eq!(gov_m.pos_combo, 10);
        assert_eq!(gov_v.pos_combo, 20);
    }

    #[test]
    fn station_count_configurable() {
        let ef = make_ss_udl_ef(1);
        let input = BeamStationInput {
            members: vec![make_member(1, 6.0)],
            combinations: vec![LabeledResults {
                combo_id: 1, combo_name: None,
                results: make_results(vec![ef]),
            }],
            num_stations: Some(5),
        };

        let result = extract_beam_stations(&input);
        assert_eq!(result.num_stations_per_member, 5);
        assert_eq!(result.stations.len(), 5);
        let ts: Vec<f64> = result.stations.iter().map(|s| s.t).collect();
        assert!((ts[0] - 0.0).abs() < 1e-12);
        assert!((ts[1] - 0.25).abs() < 1e-12);
        assert!((ts[2] - 0.5).abs() < 1e-12);
        assert!((ts[3] - 0.75).abs() < 1e-12);
        assert!((ts[4] - 1.0).abs() < 1e-12);
    }

    #[test]
    fn missing_element_skipped() {
        let ef1 = make_ss_udl_ef(1);
        let ef2 = ElementForces {
            element_id: 99, length: 6.0,
            n_start: 0.0, n_end: 0.0, v_start: 0.0, v_end: 0.0,
            m_start: 0.0, m_end: 0.0, q_i: 0.0, q_j: 0.0,
            point_loads: vec![], distributed_loads: vec![],
            hinge_start: false, hinge_end: false,
        };

        let input = BeamStationInput {
            members: vec![make_member(1, 6.0)],
            combinations: vec![
                LabeledResults { combo_id: 1, combo_name: None, results: make_results(vec![ef1]) },
                LabeledResults { combo_id: 2, combo_name: None, results: make_results(vec![ef2]) },
            ],
            num_stations: Some(3),
        };

        let result = extract_beam_stations(&input);
        for s in &result.stations {
            assert_eq!(s.combo_forces.len(), 1);
            assert_eq!(s.combo_forces[0].combo_id, 1);
            // Governing should still exist (1 combo contributed)
            assert!(s.governing.moment.is_some());
            assert!(s.governing.shear.is_some());
            assert!(s.governing.axial.is_some());
        }
    }

    #[test]
    fn no_data_governing_is_none() {
        // Member 1 exists, but no combo has forces for it
        let ef_other = ElementForces {
            element_id: 99, length: 6.0,
            n_start: 0.0, n_end: 0.0, v_start: 0.0, v_end: 0.0,
            m_start: 0.0, m_end: 0.0, q_i: 0.0, q_j: 0.0,
            point_loads: vec![], distributed_loads: vec![],
            hinge_start: false, hinge_end: false,
        };

        let input = BeamStationInput {
            members: vec![make_member(1, 6.0)],
            combinations: vec![
                LabeledResults { combo_id: 1, combo_name: None, results: make_results(vec![ef_other]) },
            ],
            num_stations: Some(3),
        };

        let result = extract_beam_stations(&input);
        for s in &result.stations {
            assert!(s.combo_forces.is_empty());
            assert!(s.governing.moment.is_none());
            assert!(s.governing.shear.is_none());
            assert!(s.governing.axial.is_none());
        }

        // JSON should omit the governing fields entirely (skip_serializing_if)
        let json = serde_json::to_string(&result).unwrap();
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        let gov = &v["stations"][0]["governing"];
        assert!(gov.get("moment").is_none(), "moment should be absent, got {:?}", gov);
        assert!(gov.get("shear").is_none());
        assert!(gov.get("axial").is_none());
    }

    #[test]
    fn combo_name_propagated() {
        let ef = make_ss_udl_ef(1);
        let input = BeamStationInput {
            members: vec![make_member(1, 6.0)],
            combinations: vec![LabeledResults {
                combo_id: 1,
                combo_name: Some("1.35D+1.50L".to_string()),
                results: make_results(vec![ef]),
            }],
            num_stations: Some(2),
        };

        let result = extract_beam_stations(&input);
        let cf = &result.stations[0].combo_forces[0];
        assert_eq!(cf.combo_name.as_deref(), Some("1.35D+1.50L"));
    }

    #[test]
    fn governing_combo_name_propagated() {
        // Two combos with names: combo 10 has large moment, combo 20 has large shear
        let ef0 = ElementForces {
            element_id: 1, length: 4.0,
            n_start: 0.0, n_end: 0.0,
            v_start: 5.0, v_end: -5.0,
            m_start: -100.0, m_end: 100.0,
            q_i: 0.0, q_j: 0.0,
            point_loads: vec![], distributed_loads: vec![],
            hinge_start: false, hinge_end: false,
        };
        let ef1 = ElementForces {
            element_id: 1, length: 4.0,
            n_start: 0.0, n_end: 0.0,
            v_start: 200.0, v_end: -200.0,
            m_start: -10.0, m_end: 10.0,
            q_i: 0.0, q_j: 0.0,
            point_loads: vec![], distributed_loads: vec![],
            hinge_start: false, hinge_end: false,
        };

        let input = BeamStationInput {
            members: vec![make_member(1, 4.0)],
            combinations: vec![
                LabeledResults { combo_id: 10, combo_name: Some("1.35D".into()), results: make_results(vec![ef0]) },
                LabeledResults { combo_id: 20, combo_name: Some("1.50L".into()), results: make_results(vec![ef1]) },
            ],
            num_stations: Some(2),
        };

        let result = extract_beam_stations(&input);
        let s1 = &result.stations[1]; // t=1.0

        // Governing moment pos should come from combo 10 (m_end=100 > 10)
        let gov_m = s1.governing.moment.as_ref().unwrap();
        assert_eq!(gov_m.pos_combo, 10);
        assert_eq!(gov_m.pos_combo_name.as_deref(), Some("1.35D"));

        // Governing moment neg should come from combo 20 (m_end=10 < 100, but at t=0: -100 < -10)
        // At t=0: combo 10 m=-100, combo 20 m=-10 → neg = combo 10
        let s0 = &result.stations[0];
        let gov_m0 = s0.governing.moment.as_ref().unwrap();
        assert_eq!(gov_m0.neg_combo, 10);
        assert_eq!(gov_m0.neg_combo_name.as_deref(), Some("1.35D"));

        // Shear is constant along element (no distributed loads), so v = v_start everywhere.
        // combo 10: v_start=5, combo 20: v_start=200 → pos=combo 20, neg=combo 10
        let gov_v = s1.governing.shear.as_ref().unwrap();
        assert_eq!(gov_v.pos_combo, 20);
        assert_eq!(gov_v.pos_combo_name.as_deref(), Some("1.50L"));
        assert_eq!(gov_v.neg_combo, 10);
        assert_eq!(gov_v.neg_combo_name.as_deref(), Some("1.35D"));

        // Verify member-level governing also propagates names
        // Moment at t=0: combo10=-100, combo20=-10; at t=1: combo10=-120, combo20=-810
        // Member pos moment = -10 (combo 20), member neg moment = -810 (combo 20)
        let grouped = extract_beam_stations_grouped(&input);
        let g = &grouped.members[0];
        let mg_m = g.member_governing.moment.as_ref().unwrap();
        assert_eq!(mg_m.pos_combo_name.as_deref(), Some("1.50L"));
        assert_eq!(mg_m.neg_combo_name.as_deref(), Some("1.50L"));
        // Shear pos = 200 (combo 20), shear neg = 5 (combo 10)
        let mg_v = g.member_governing.shear.as_ref().unwrap();
        assert_eq!(mg_v.pos_combo_name.as_deref(), Some("1.50L"));
        assert_eq!(mg_v.neg_combo_name.as_deref(), Some("1.35D"));
    }

    #[test]
    fn governing_combo_name_none_when_absent() {
        let ef = make_ss_udl_ef(1);
        let input = BeamStationInput {
            members: vec![make_member(1, 6.0)],
            combinations: vec![LabeledResults {
                combo_id: 1, combo_name: None,
                results: make_results(vec![ef]),
            }],
            num_stations: Some(2),
        };

        let result = extract_beam_stations(&input);
        let gov_m = result.stations[0].governing.moment.as_ref().unwrap();
        assert!(gov_m.pos_combo_name.is_none());
        assert!(gov_m.neg_combo_name.is_none());

        // JSON should omit the name fields
        let json = serde_json::to_string(&result).unwrap();
        assert!(!json.contains("posComboName"));
        assert!(!json.contains("negComboName"));

        // Member-level governing should also have None
        let grouped = extract_beam_stations_grouped(&input);
        let mg = grouped.members[0].member_governing.moment.as_ref().unwrap();
        assert!(mg.pos_combo_name.is_none());
        assert!(mg.neg_combo_name.is_none());
    }

    #[test]
    fn sign_convention_present() {
        let ef = make_ss_udl_ef(1);
        let input = BeamStationInput {
            members: vec![make_member(1, 6.0)],
            combinations: vec![LabeledResults {
                combo_id: 1, combo_name: None,
                results: make_results(vec![ef]),
            }],
            num_stations: Some(2),
        };

        let result = extract_beam_stations(&input);
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("signConvention"));
        assert!(json.contains("positive = tension"));
    }

    #[test]
    fn determinism() {
        let ef = make_ss_udl_ef(1);
        let input = BeamStationInput {
            members: vec![make_member(1, 6.0)],
            combinations: vec![LabeledResults {
                combo_id: 1, combo_name: None,
                results: make_results(vec![ef]),
            }],
            num_stations: Some(11),
        };

        let r1 = extract_beam_stations(&input);
        let r2 = extract_beam_stations(&input);

        assert_eq!(r1.stations.len(), r2.stations.len());
        for (a, b) in r1.stations.iter().zip(r2.stations.iter()) {
            assert_eq!(a.member_id, b.member_id);
            assert_eq!(a.station_index, b.station_index);
            assert!((a.t - b.t).abs() < 1e-15);
            for (ca, cb) in a.combo_forces.iter().zip(b.combo_forces.iter()) {
                assert_eq!(ca.combo_id, cb.combo_id);
                assert!((ca.m - cb.m).abs() < 1e-15);
                assert!((ca.v - cb.v).abs() < 1e-15);
                assert!((ca.n - cb.n).abs() < 1e-15);
            }
        }
    }

    #[test]
    fn test_3d_endpoint_parity() {
        let ef = ElementForces3D {
            element_id: 1, length: 5.0,
            n_start: 10.0, n_end: -10.0,
            vy_start: 20.0, vy_end: -20.0,
            vz_start: 15.0, vz_end: -15.0,
            mx_start: 5.0, mx_end: -5.0,
            my_start: 30.0, my_end: -30.0,
            mz_start: 40.0, mz_end: -40.0,
            hinge_start: false, hinge_end: false,
            q_yi: 0.0, q_yj: 0.0,
            distributed_loads_y: vec![], point_loads_y: vec![],
            q_zi: 0.0, q_zj: 0.0,
            distributed_loads_z: vec![], point_loads_z: vec![],
            bimoment_start: None, bimoment_end: None,
        };

        let results3d = AnalysisResults3D {
            displacements: vec![], reactions: vec![],
            element_forces: vec![ef.clone()],
            plate_stresses: vec![], quad_stresses: vec![],
            quad_nodal_stresses: vec![], constraint_forces: vec![],
            diagnostics: vec![], solver_diagnostics: vec![], timings: None,
            structured_diagnostics: vec![], equilibrium: None, result_summary: None, solver_run_meta: None,
        };

        let input = BeamStationInput3D {
            members: vec![make_member(1, 5.0)],
            combinations: vec![LabeledResults3D {
                combo_id: 1, combo_name: None, results: results3d,
            }],
            num_stations: Some(2),
        };

        let result = extract_beam_stations_3d(&input);
        assert_eq!(result.stations.len(), 2);

        let s0 = &result.stations[0];
        let cf0 = &s0.combo_forces[0];
        assert!((cf0.n - ef.n_start).abs() < 1e-10);
        assert!((cf0.vy - ef.vy_start).abs() < 1e-10);
        assert!((cf0.vz - ef.vz_start).abs() < 1e-10);
        assert!((cf0.mz - ef.mz_start).abs() < 1e-10);
        assert!((cf0.my - ef.my_start).abs() < 1e-10);
        assert!((cf0.torsion - ef.mx_start).abs() < 1e-10);

        // 3D sign convention present
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("signConvention"));
        assert!(json.contains("shearY"));
    }

    #[test]
    fn envelope_cross_check() {
        let ef_a = ElementForces {
            element_id: 1, length: 4.0,
            n_start: 5.0, n_end: 5.0,
            v_start: -25.0, v_end: 25.0,
            m_start: 50.0, m_end: 150.0,
            q_i: 0.0, q_j: 0.0,
            point_loads: vec![], distributed_loads: vec![],
            hinge_start: false, hinge_end: false,
        };
        let ef_b = ElementForces {
            element_id: 1, length: 4.0,
            n_start: -3.0, n_end: -3.0,
            v_start: 20.0, v_end: -20.0,
            m_start: -40.0, m_end: -120.0,
            q_i: 0.0, q_j: 0.0,
            point_loads: vec![], distributed_loads: vec![],
            hinge_start: false, hinge_end: false,
        };

        let input = BeamStationInput {
            members: vec![make_member(1, 4.0)],
            combinations: vec![
                LabeledResults { combo_id: 1, combo_name: None, results: make_results(vec![ef_a]) },
                LabeledResults { combo_id: 2, combo_name: None, results: make_results(vec![ef_b]) },
            ],
            num_stations: Some(2),
        };

        let result = extract_beam_stations(&input);

        let s0 = &result.stations[0];
        let gov_m0 = s0.governing.moment.as_ref().unwrap();
        assert_eq!(gov_m0.pos_combo, 1);
        assert!((gov_m0.pos_value - 50.0).abs() < 1e-10);
        assert_eq!(gov_m0.neg_combo, 2);
        assert!((gov_m0.neg_value - (-40.0)).abs() < 1e-10);

        let s1 = &result.stations[1];
        let gov_m1 = s1.governing.moment.as_ref().unwrap();
        assert_eq!(gov_m1.pos_combo, 1);
        assert!((gov_m1.pos_value - 150.0).abs() < 1e-10);
        assert_eq!(gov_m1.neg_combo, 2);
        assert!((gov_m1.neg_value - (-120.0)).abs() < 1e-10);
    }

    // ==================== Grouped-by-Member Tests ====================

    #[test]
    fn grouped_basic_shape() {
        let ef1 = make_ss_udl_ef(1);
        let ef2 = make_ss_udl_ef(2);
        let input = BeamStationInput {
            members: vec![make_member(1, 6.0), make_member(2, 6.0)],
            combinations: vec![LabeledResults {
                combo_id: 1, combo_name: Some("DL".into()),
                results: make_results(vec![ef1, ef2]),
            }],
            num_stations: Some(5),
        };

        let grouped = extract_beam_stations_grouped(&input);
        assert_eq!(grouped.members.len(), 2);
        assert_eq!(grouped.num_stations_per_member, 5);

        let g1 = &grouped.members[0];
        assert_eq!(g1.member_id, 1);
        assert_eq!(g1.section_id, 1);
        assert_eq!(g1.length, 6.0);
        assert_eq!(g1.stations.len(), 5);

        let g2 = &grouped.members[1];
        assert_eq!(g2.member_id, 2);
        assert_eq!(g2.stations.len(), 5);
    }

    #[test]
    fn grouped_member_governing_picks_worst_station() {
        // Cantilever-like: m_start=50, v_start=-25 → m grows along span
        // At t=0: m=50, at t=1: m=50-(-25)*4=150
        let ef = ElementForces {
            element_id: 1, length: 4.0,
            n_start: 5.0, n_end: 5.0,
            v_start: -25.0, v_end: 25.0,
            m_start: 50.0, m_end: 150.0,
            q_i: 0.0, q_j: 0.0,
            point_loads: vec![], distributed_loads: vec![],
            hinge_start: false, hinge_end: false,
        };

        let input = BeamStationInput {
            members: vec![make_member(1, 4.0)],
            combinations: vec![LabeledResults {
                combo_id: 1, combo_name: None,
                results: make_results(vec![ef]),
            }],
            num_stations: Some(3), // t=0.0, 0.5, 1.0
        };

        let grouped = extract_beam_stations_grouped(&input);
        let g = &grouped.members[0];
        let gov_m = g.member_governing.moment.as_ref().unwrap();

        // Max positive moment is at t=1 (station_index=2), value=150
        assert_eq!(gov_m.pos_station_index, 2);
        assert!((gov_m.pos_value - 150.0).abs() < 1e-10);
        assert_eq!(gov_m.pos_combo, 1);

        // Min moment is at t=0 (station_index=0), value=50 (still positive, but smallest)
        assert_eq!(gov_m.neg_station_index, 0);
        assert!((gov_m.neg_value - 50.0).abs() < 1e-10);
    }

    #[test]
    fn grouped_no_data_member_governing_none() {
        let ef_other = ElementForces {
            element_id: 99, length: 6.0,
            n_start: 0.0, n_end: 0.0, v_start: 0.0, v_end: 0.0,
            m_start: 0.0, m_end: 0.0, q_i: 0.0, q_j: 0.0,
            point_loads: vec![], distributed_loads: vec![],
            hinge_start: false, hinge_end: false,
        };

        let input = BeamStationInput {
            members: vec![make_member(1, 6.0)],
            combinations: vec![
                LabeledResults { combo_id: 1, combo_name: None, results: make_results(vec![ef_other]) },
            ],
            num_stations: Some(3),
        };

        let grouped = extract_beam_stations_grouped(&input);
        let g = &grouped.members[0];
        assert!(g.member_governing.moment.is_none());
        assert!(g.member_governing.shear.is_none());
        assert!(g.member_governing.axial.is_none());
    }

    #[test]
    fn grouped_multi_combo_governing_cross_member() {
        // 2 members, 2 combos: combo 1 has large positive M on member 1, combo 2 has large V on member 2
        // m(t) = m_start - v_start * t * L, so m(0)=200, m(1)=200 - 5*4=180 → both positive
        let ef1_c1 = ElementForces {
            element_id: 1, length: 4.0,
            n_start: 0.0, n_end: 0.0,
            v_start: 5.0, v_end: -5.0,
            m_start: 200.0, m_end: 180.0,
            q_i: 0.0, q_j: 0.0,
            point_loads: vec![], distributed_loads: vec![],
            hinge_start: false, hinge_end: false,
        };
        let ef2_c1 = ElementForces {
            element_id: 2, length: 4.0,
            n_start: 0.0, n_end: 0.0,
            v_start: 3.0, v_end: -3.0,
            m_start: -10.0, m_end: 10.0,
            q_i: 0.0, q_j: 0.0,
            point_loads: vec![], distributed_loads: vec![],
            hinge_start: false, hinge_end: false,
        };
        let ef1_c2 = ElementForces {
            element_id: 1, length: 4.0,
            n_start: 0.0, n_end: 0.0,
            v_start: 2.0, v_end: -2.0,
            m_start: -5.0, m_end: 5.0,
            q_i: 0.0, q_j: 0.0,
            point_loads: vec![], distributed_loads: vec![],
            hinge_start: false, hinge_end: false,
        };
        let ef2_c2 = ElementForces {
            element_id: 2, length: 4.0,
            n_start: 0.0, n_end: 0.0,
            v_start: 300.0, v_end: -300.0,
            m_start: -20.0, m_end: 20.0,
            q_i: 0.0, q_j: 0.0,
            point_loads: vec![], distributed_loads: vec![],
            hinge_start: false, hinge_end: false,
        };

        let input = BeamStationInput {
            members: vec![make_member(1, 4.0), make_member(2, 4.0)],
            combinations: vec![
                LabeledResults { combo_id: 1, combo_name: None, results: make_results(vec![ef1_c1, ef2_c1]) },
                LabeledResults { combo_id: 2, combo_name: None, results: make_results(vec![ef1_c2, ef2_c2]) },
            ],
            num_stations: Some(2),
        };

        let grouped = extract_beam_stations_grouped(&input);

        // Member 1: governing moment from combo 1
        let g1 = &grouped.members[0];
        let gov_m1 = g1.member_governing.moment.as_ref().unwrap();
        assert_eq!(gov_m1.pos_combo, 1);

        // Member 2: governing shear from combo 2
        let g2 = &grouped.members[1];
        let gov_v2 = g2.member_governing.shear.as_ref().unwrap();
        assert_eq!(gov_v2.pos_combo, 2);
        assert!((gov_v2.pos_value - 300.0).abs() < 1e-10);
    }

    #[test]
    fn grouped_json_schema() {
        let ef = make_ss_udl_ef(1);
        let input = BeamStationInput {
            members: vec![make_member(1, 6.0)],
            combinations: vec![LabeledResults {
                combo_id: 1, combo_name: None,
                results: make_results(vec![ef]),
            }],
            num_stations: Some(3),
        };

        let grouped = extract_beam_stations_grouped(&input);
        let json = serde_json::to_string(&grouped).unwrap();
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();

        // Top-level
        assert!(v.get("members").is_some());
        assert!(v.get("numCombinations").is_some());
        assert!(v.get("numStationsPerMember").is_some());
        assert!(v.get("signConvention").is_some());

        // Member group
        let m = &v["members"][0];
        for key in &["memberId", "sectionId", "materialId", "length", "stations", "memberGoverning"] {
            assert!(m.get(*key).is_some(), "Missing key: {}", key);
        }

        // Member governing
        let mg = &m["memberGoverning"];
        for key in &["moment", "shear", "axial"] {
            assert!(mg.get(*key).is_some(), "Missing memberGoverning.{}", key);
            let e = &mg[*key];
            for ekey in &["posCombo", "posValue", "posStationIndex", "negCombo", "negValue", "negStationIndex"] {
                assert!(e.get(*ekey).is_some(), "Missing {}.{}", key, ekey);
            }
        }
    }
}
