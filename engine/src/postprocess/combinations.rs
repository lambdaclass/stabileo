use crate::types::*;
use crate::postprocess::diagrams::compute_diagram_value_at;
use crate::postprocess::diagrams_3d::evaluate_diagram_3d_at;
use serde::{Deserialize, Serialize};

// ==================== Input Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombinationFactor {
    pub case_id: usize,
    pub factor: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombinationInput {
    pub factors: Vec<CombinationFactor>,
    pub cases: Vec<CaseEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseEntry {
    pub case_id: usize,
    pub results: AnalysisResults,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombinationInput3D {
    pub factors: Vec<CombinationFactor>,
    pub cases: Vec<CaseEntry3D>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseEntry3D {
    pub case_id: usize,
    pub results: AnalysisResults3D,
}

// ==================== Envelope Output Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementEnvelopeDiagram {
    pub element_id: usize,
    pub t_positions: Vec<f64>,
    pub pos_values: Vec<f64>,
    pub neg_values: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvelopeDiagramData {
    pub kind: String,
    pub elements: Vec<ElementEnvelopeDiagram>,
    pub global_max: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullEnvelope {
    pub moment: EnvelopeDiagramData,
    pub shear: EnvelopeDiagramData,
    pub axial: EnvelopeDiagramData,
    pub max_abs_results: AnalysisResults,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullEnvelope3D {
    pub moment_y: EnvelopeDiagramData,
    pub moment_z: EnvelopeDiagramData,
    pub shear_y: EnvelopeDiagramData,
    pub shear_z: EnvelopeDiagramData,
    pub axial: EnvelopeDiagramData,
    pub torsion: EnvelopeDiagramData,
    #[serde(rename = "maxAbsResults3D")]
    pub max_abs_results_3d: AnalysisResults3D,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvelopeInput {
    pub results: Vec<AnalysisResults>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvelopeInput3D {
    pub results: Vec<AnalysisResults3D>,
}

const N_POINTS: usize = 21;

// ==================== 2D Combination ====================

/// Linearly combine AnalysisResults from multiple load cases.
pub fn combine_results(input: &CombinationInput) -> Option<AnalysisResults> {
    let template = input.cases.first()?;
    let tr = &template.results;

    let mut displacements: Vec<Displacement> = tr.displacements.iter()
        .map(|d| Displacement { node_id: d.node_id, ux: 0.0, uy: 0.0, rz: 0.0 })
        .collect();
    let mut reactions: Vec<Reaction> = tr.reactions.iter()
        .map(|r| Reaction { node_id: r.node_id, rx: 0.0, ry: 0.0, mz: 0.0 })
        .collect();
    let mut element_forces: Vec<ElementForces> = tr.element_forces.iter()
        .map(|f| ElementForces {
            element_id: f.element_id,
            n_start: 0.0, n_end: 0.0, v_start: 0.0, v_end: 0.0, m_start: 0.0, m_end: 0.0,
            length: f.length, q_i: 0.0, q_j: 0.0,
            point_loads: Vec::new(),
            distributed_loads: Vec::new(),
            hinge_start: f.hinge_start, hinge_end: f.hinge_end,
        })
        .collect();

    for cf in &input.factors {
        let case = input.cases.iter().find(|c| c.case_id == cf.case_id);
        let r = match case {
            Some(c) => &c.results,
            None => continue,
        };
        let f = cf.factor;

        for (i, d) in r.displacements.iter().enumerate() {
            if i < displacements.len() {
                displacements[i].ux += f * d.ux;
                displacements[i].uy += f * d.uy;
                displacements[i].rz += f * d.rz;
            }
        }
        for (i, rx) in r.reactions.iter().enumerate() {
            if i < reactions.len() {
                reactions[i].rx += f * rx.rx;
                reactions[i].ry += f * rx.ry;
                reactions[i].mz += f * rx.mz;
            }
        }
        for (i, ef) in r.element_forces.iter().enumerate() {
            if i < element_forces.len() {
                let out = &mut element_forces[i];
                out.n_start += f * ef.n_start;
                out.n_end += f * ef.n_end;
                out.v_start += f * ef.v_start;
                out.v_end += f * ef.v_end;
                out.m_start += f * ef.m_start;
                out.m_end += f * ef.m_end;
                out.q_i += f * ef.q_i;
                out.q_j += f * ef.q_j;
                for dl in &ef.distributed_loads {
                    out.distributed_loads.push(DistributedLoadInfo {
                        q_i: dl.q_i * f, q_j: dl.q_j * f, a: dl.a, b: dl.b,
                    });
                }
            }
        }
    }

    Some(AnalysisResults { displacements, reactions, element_forces, constraint_forces: vec![], diagnostics: vec![] })
}

// ==================== 2D Envelope ====================

/// Compute pointwise envelope from multiple results.
pub fn compute_envelope(results: &[AnalysisResults]) -> Option<FullEnvelope> {
    let first = results.first()?;

    // maxAbsResults
    let mut displacements = first.displacements.clone();
    let mut reactions = first.reactions.clone();
    let mut element_forces = first.element_forces.clone();

    for r in results.iter().skip(1) {
        for (i, d) in r.displacements.iter().enumerate() {
            if i < displacements.len() {
                if d.ux.abs() > displacements[i].ux.abs() { displacements[i].ux = d.ux; }
                if d.uy.abs() > displacements[i].uy.abs() { displacements[i].uy = d.uy; }
                if d.rz.abs() > displacements[i].rz.abs() { displacements[i].rz = d.rz; }
            }
        }
        for (i, rx) in r.reactions.iter().enumerate() {
            if i < reactions.len() {
                if rx.rx.abs() > reactions[i].rx.abs() { reactions[i].rx = rx.rx; }
                if rx.ry.abs() > reactions[i].ry.abs() { reactions[i].ry = rx.ry; }
                if rx.mz.abs() > reactions[i].mz.abs() { reactions[i].mz = rx.mz; }
            }
        }
        for (i, ef) in r.element_forces.iter().enumerate() {
            if i < element_forces.len() {
                if ef.n_start.abs() > element_forces[i].n_start.abs() { element_forces[i].n_start = ef.n_start; }
                if ef.n_end.abs() > element_forces[i].n_end.abs() { element_forces[i].n_end = ef.n_end; }
                if ef.v_start.abs() > element_forces[i].v_start.abs() { element_forces[i].v_start = ef.v_start; }
                if ef.v_end.abs() > element_forces[i].v_end.abs() { element_forces[i].v_end = ef.v_end; }
                if ef.m_start.abs() > element_forces[i].m_start.abs() { element_forces[i].m_start = ef.m_start; }
                if ef.m_end.abs() > element_forces[i].m_end.abs() { element_forces[i].m_end = ef.m_end; }
            }
        }
    }

    let max_abs_results = AnalysisResults { displacements, reactions, element_forces, constraint_forces: vec![], diagnostics: vec![] };

    fn compute_env_diagram(kind: &str, results: &[AnalysisResults]) -> EnvelopeDiagramData {
        let first = &results[0];
        let mut elements = Vec::new();
        let mut global_max = 0.0f64;

        for (e_idx, _ef) in first.element_forces.iter().enumerate() {
            let elem_id = first.element_forces[e_idx].element_id;
            let mut t_positions = Vec::new();
            let mut pos_values = Vec::new();
            let mut neg_values = Vec::new();

            for j in 0..N_POINTS {
                let t = j as f64 / (N_POINTS - 1) as f64;
                t_positions.push(t);
                let mut max_pos = 0.0f64;
                let mut max_neg = 0.0f64;

                for res in results {
                    if e_idx >= res.element_forces.len() { continue; }
                    let val = compute_diagram_value_at(kind, t, &res.element_forces[e_idx]);
                    if val > max_pos { max_pos = val; }
                    if val < max_neg { max_neg = val; }
                }

                pos_values.push(max_pos);
                neg_values.push(max_neg);
                global_max = global_max.max(max_pos.abs()).max(max_neg.abs());
            }

            elements.push(ElementEnvelopeDiagram { element_id: elem_id, t_positions, pos_values, neg_values });
        }

        EnvelopeDiagramData { kind: kind.to_string(), elements, global_max }
    }

    Some(FullEnvelope {
        moment: compute_env_diagram("moment", results),
        shear: compute_env_diagram("shear", results),
        axial: compute_env_diagram("axial", results),
        max_abs_results,
    })
}

// ==================== 3D Combination ====================

/// Linearly combine 3D results.
pub fn combine_results_3d(input: &CombinationInput3D) -> Option<AnalysisResults3D> {
    let template = input.cases.first()?;
    let tr = &template.results;

    let mut displacements: Vec<Displacement3D> = tr.displacements.iter()
        .map(|d| Displacement3D { node_id: d.node_id, ux: 0.0, uy: 0.0, uz: 0.0, rx: 0.0, ry: 0.0, rz: 0.0, warping: None })
        .collect();
    let mut reactions: Vec<Reaction3D> = tr.reactions.iter()
        .map(|r| Reaction3D { node_id: r.node_id, fx: 0.0, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bimoment: None })
        .collect();
    let mut element_forces: Vec<ElementForces3D> = tr.element_forces.iter()
        .map(|f| ElementForces3D {
            element_id: f.element_id, length: f.length,
            n_start: 0.0, n_end: 0.0,
            vy_start: 0.0, vy_end: 0.0, vz_start: 0.0, vz_end: 0.0,
            mx_start: 0.0, mx_end: 0.0, my_start: 0.0, my_end: 0.0, mz_start: 0.0, mz_end: 0.0,
            hinge_start: f.hinge_start, hinge_end: f.hinge_end,
            q_yi: 0.0, q_yj: 0.0, q_zi: 0.0, q_zj: 0.0,
            distributed_loads_y: Vec::new(), point_loads_y: Vec::new(),
            distributed_loads_z: Vec::new(), point_loads_z: Vec::new(), bimoment_start: None, bimoment_end: None })
        .collect();

    for cf in &input.factors {
        let case = input.cases.iter().find(|c| c.case_id == cf.case_id);
        let r = match case { Some(c) => &c.results, None => continue };
        let f = cf.factor;

        for (i, d) in r.displacements.iter().enumerate() {
            if i < displacements.len() {
                displacements[i].ux += f * d.ux;
                displacements[i].uy += f * d.uy;
                displacements[i].uz += f * d.uz;
                displacements[i].rx += f * d.rx;
                displacements[i].ry += f * d.ry;
                displacements[i].rz += f * d.rz;
            }
        }
        for (i, rx) in r.reactions.iter().enumerate() {
            if i < reactions.len() {
                reactions[i].fx += f * rx.fx;
                reactions[i].fy += f * rx.fy;
                reactions[i].fz += f * rx.fz;
                reactions[i].mx += f * rx.mx;
                reactions[i].my += f * rx.my;
                reactions[i].mz += f * rx.mz;
            }
        }
        for (i, ef) in r.element_forces.iter().enumerate() {
            if i < element_forces.len() {
                let out = &mut element_forces[i];
                out.n_start += f * ef.n_start;
                out.n_end += f * ef.n_end;
                out.vy_start += f * ef.vy_start;
                out.vy_end += f * ef.vy_end;
                out.vz_start += f * ef.vz_start;
                out.vz_end += f * ef.vz_end;
                out.mx_start += f * ef.mx_start;
                out.mx_end += f * ef.mx_end;
                out.my_start += f * ef.my_start;
                out.my_end += f * ef.my_end;
                out.mz_start += f * ef.mz_start;
                out.mz_end += f * ef.mz_end;
                out.q_yi += f * ef.q_yi;
                out.q_yj += f * ef.q_yj;
                out.q_zi += f * ef.q_zi;
                out.q_zj += f * ef.q_zj;
                for dl in &ef.distributed_loads_y {
                    out.distributed_loads_y.push(DistributedLoadInfo { q_i: dl.q_i * f, q_j: dl.q_j * f, a: dl.a, b: dl.b });
                }
                for dl in &ef.distributed_loads_z {
                    out.distributed_loads_z.push(DistributedLoadInfo { q_i: dl.q_i * f, q_j: dl.q_j * f, a: dl.a, b: dl.b });
                }
                for pl in &ef.point_loads_y {
                    out.point_loads_y.push(PointLoadInfo3D { a: pl.a, p: pl.p * f });
                }
                for pl in &ef.point_loads_z {
                    out.point_loads_z.push(PointLoadInfo3D { a: pl.a, p: pl.p * f });
                }
            }
        }
    }

    Some(AnalysisResults3D { displacements, reactions, element_forces, plate_stresses: vec![], quad_stresses: vec![], quad_nodal_stresses: vec![], constraint_forces: vec![], diagnostics: vec![] })
}

// ==================== 3D Envelope ====================

/// Compute pointwise 3D envelope.
pub fn compute_envelope_3d(results: &[AnalysisResults3D]) -> Option<FullEnvelope3D> {
    let first = results.first()?;

    // maxAbsResults3D
    let mut displacements = first.displacements.clone();
    let mut reactions = first.reactions.clone();
    let mut element_forces = first.element_forces.clone();

    for r in results.iter().skip(1) {
        for (i, d) in r.displacements.iter().enumerate() {
            if i < displacements.len() {
                if d.ux.abs() > displacements[i].ux.abs() { displacements[i].ux = d.ux; }
                if d.uy.abs() > displacements[i].uy.abs() { displacements[i].uy = d.uy; }
                if d.uz.abs() > displacements[i].uz.abs() { displacements[i].uz = d.uz; }
                if d.rx.abs() > displacements[i].rx.abs() { displacements[i].rx = d.rx; }
                if d.ry.abs() > displacements[i].ry.abs() { displacements[i].ry = d.ry; }
                if d.rz.abs() > displacements[i].rz.abs() { displacements[i].rz = d.rz; }
            }
        }
        for (i, rx) in r.reactions.iter().enumerate() {
            if i < reactions.len() {
                if rx.fx.abs() > reactions[i].fx.abs() { reactions[i].fx = rx.fx; }
                if rx.fy.abs() > reactions[i].fy.abs() { reactions[i].fy = rx.fy; }
                if rx.fz.abs() > reactions[i].fz.abs() { reactions[i].fz = rx.fz; }
                if rx.mx.abs() > reactions[i].mx.abs() { reactions[i].mx = rx.mx; }
                if rx.my.abs() > reactions[i].my.abs() { reactions[i].my = rx.my; }
                if rx.mz.abs() > reactions[i].mz.abs() { reactions[i].mz = rx.mz; }
            }
        }
        for (i, ef) in r.element_forces.iter().enumerate() {
            if i < element_forces.len() {
                let o = &mut element_forces[i];
                if ef.n_start.abs() > o.n_start.abs() { o.n_start = ef.n_start; }
                if ef.n_end.abs() > o.n_end.abs() { o.n_end = ef.n_end; }
                if ef.vy_start.abs() > o.vy_start.abs() { o.vy_start = ef.vy_start; }
                if ef.vy_end.abs() > o.vy_end.abs() { o.vy_end = ef.vy_end; }
                if ef.vz_start.abs() > o.vz_start.abs() { o.vz_start = ef.vz_start; }
                if ef.vz_end.abs() > o.vz_end.abs() { o.vz_end = ef.vz_end; }
                if ef.mx_start.abs() > o.mx_start.abs() { o.mx_start = ef.mx_start; }
                if ef.mx_end.abs() > o.mx_end.abs() { o.mx_end = ef.mx_end; }
                if ef.my_start.abs() > o.my_start.abs() { o.my_start = ef.my_start; }
                if ef.my_end.abs() > o.my_end.abs() { o.my_end = ef.my_end; }
                if ef.mz_start.abs() > o.mz_start.abs() { o.mz_start = ef.mz_start; }
                if ef.mz_end.abs() > o.mz_end.abs() { o.mz_end = ef.mz_end; }
            }
        }
    }

    let max_abs_results_3d = AnalysisResults3D { displacements, reactions, element_forces, plate_stresses: vec![], quad_stresses: vec![], quad_nodal_stresses: vec![], constraint_forces: vec![], diagnostics: vec![] };

    fn compute_env_3d(kind: &str, results: &[AnalysisResults3D]) -> EnvelopeDiagramData {
        let first = &results[0];
        let mut elements = Vec::new();
        let mut global_max = 0.0f64;

        for (e_idx, _) in first.element_forces.iter().enumerate() {
            let elem_id = first.element_forces[e_idx].element_id;
            let mut t_positions = Vec::new();
            let mut pos_values = Vec::new();
            let mut neg_values = Vec::new();

            for j in 0..N_POINTS {
                let t = j as f64 / (N_POINTS - 1) as f64;
                t_positions.push(t);
                let mut max_pos = 0.0f64;
                let mut max_neg = 0.0f64;

                for res in results {
                    if e_idx >= res.element_forces.len() { continue; }
                    let val = evaluate_diagram_3d_at(&res.element_forces[e_idx], kind, t);
                    if val > max_pos { max_pos = val; }
                    if val < max_neg { max_neg = val; }
                }

                pos_values.push(max_pos);
                neg_values.push(max_neg);
                global_max = global_max.max(max_pos.abs()).max(max_neg.abs());
            }

            elements.push(ElementEnvelopeDiagram { element_id: elem_id, t_positions, pos_values, neg_values });
        }

        EnvelopeDiagramData { kind: kind.to_string(), elements, global_max }
    }

    Some(FullEnvelope3D {
        moment_y: compute_env_3d("momentY", results),
        moment_z: compute_env_3d("momentZ", results),
        shear_y: compute_env_3d("shearY", results),
        shear_z: compute_env_3d("shearZ", results),
        axial: compute_env_3d("axial", results),
        torsion: compute_env_3d("torsion", results),
        max_abs_results_3d,
    })
}
