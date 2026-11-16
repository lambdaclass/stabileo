use dedaliano_engine::types::*;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Displacement {
    node_id: usize,
    ux: f64,
    #[serde(rename = "uz", alias = "uy")]
    uz: f64,
    #[serde(rename = "ry", alias = "rz")]
    ry: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Reaction {
    node_id: usize,
    rx: f64,
    #[serde(rename = "rz", alias = "ry")]
    rz: f64,
    #[serde(rename = "my", alias = "mz")]
    my: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PointLoadInfo {
    a: f64,
    p: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    px: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "my", alias = "mz")]
    my: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DistributedLoadInfo {
    #[serde(rename = "qI")]
    q_i: f64,
    #[serde(rename = "qJ")]
    q_j: f64,
    a: f64,
    b: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ElementForces {
    element_id: usize,
    n_start: f64,
    n_end: f64,
    v_start: f64,
    v_end: f64,
    m_start: f64,
    m_end: f64,
    length: f64,
    #[serde(rename = "qI")]
    q_i: f64,
    #[serde(rename = "qJ")]
    q_j: f64,
    point_loads: Vec<PointLoadInfo>,
    distributed_loads: Vec<DistributedLoadInfo>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    distributed_loads_x: Vec<DistributedLoadInfo>,
    #[serde(default)]
    hinge_start: bool,
    #[serde(default)]
    hinge_end: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalysisResults<'a> {
    displacements: Vec<Displacement>,
    reactions: Vec<Reaction>,
    element_forces: Vec<ElementForces>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    constraint_forces: &'a Vec<ConstraintForce>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    diagnostics: &'a Vec<AssemblyDiagnostic>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    solver_diagnostics: &'a Vec<SolverDiagnostic>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    structured_diagnostics: &'a Vec<StructuredDiagnostic>,
    #[serde(skip_serializing_if = "Option::is_none")]
    equilibrium: &'a Option<EquilibriumSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result_summary: &'a Option<ResultSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    solver_run_meta: &'a Option<SolverRunMeta>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Displacement3D {
    node_id: usize,
    ux: f64,
    uy: f64,
    uz: f64,
    rx: f64,
    ry: f64,
    rz: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    warping: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Reaction3D {
    node_id: usize,
    fx: f64,
    fy: f64,
    fz: f64,
    mx: f64,
    my: f64,
    mz: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    bimoment: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PointLoadInfo3D {
    a: f64,
    p: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ElementForces3D {
    element_id: usize,
    length: f64,
    n_start: f64,
    n_end: f64,
    vy_start: f64,
    vy_end: f64,
    vz_start: f64,
    vz_end: f64,
    mx_start: f64,
    mx_end: f64,
    my_start: f64,
    my_end: f64,
    mz_start: f64,
    mz_end: f64,
    #[serde(default)]
    release_my_start: bool,
    #[serde(default)]
    release_my_end: bool,
    #[serde(default)]
    release_mz_start: bool,
    #[serde(default)]
    release_mz_end: bool,
    #[serde(default)]
    release_t_start: bool,
    #[serde(default)]
    release_t_end: bool,
    #[serde(rename = "qYI")]
    q_yi: f64,
    #[serde(rename = "qYJ")]
    q_yj: f64,
    distributed_loads_y: Vec<DistributedLoadInfo>,
    point_loads_y: Vec<PointLoadInfo3D>,
    #[serde(rename = "qZI")]
    q_zi: f64,
    #[serde(rename = "qZJ")]
    q_zj: f64,
    distributed_loads_z: Vec<DistributedLoadInfo>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    distributed_loads_x: Vec<DistributedLoadInfo>,
    point_loads_z: Vec<PointLoadInfo3D>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    bimoment_start: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    bimoment_end: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalysisResults3D<'a> {
    displacements: Vec<Displacement3D>,
    reactions: Vec<Reaction3D>,
    element_forces: Vec<ElementForces3D>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    plate_stresses: &'a Vec<PlateStress>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    quad_stresses: &'a Vec<QuadStress>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    quad_nodal_stresses: &'a Vec<QuadNodalStress>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    constraint_forces: &'a Vec<ConstraintForce>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    diagnostics: &'a Vec<AssemblyDiagnostic>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    solver_diagnostics: &'a Vec<SolverDiagnostic>,
    #[serde(skip_serializing_if = "Option::is_none")]
    timings: &'a Option<SolveTimings>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    structured_diagnostics: &'a Vec<StructuredDiagnostic>,
    #[serde(skip_serializing_if = "Option::is_none")]
    equilibrium: &'a Option<EquilibriumSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result_summary: &'a Option<ResultSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    solver_run_meta: &'a Option<SolverRunMeta>,
}

fn point(p: &dedaliano_engine::types::PointLoadInfo) -> PointLoadInfo {
    PointLoadInfo { a: p.a, p: p.p, px: p.px, my: p.my }
}

fn dist(d: &dedaliano_engine::types::DistributedLoadInfo) -> DistributedLoadInfo {
    DistributedLoadInfo { q_i: d.q_i, q_j: d.q_j, a: d.a, b: d.b }
}

fn point3(p: &dedaliano_engine::types::PointLoadInfo3D) -> PointLoadInfo3D {
    PointLoadInfo3D { a: p.a, p: p.p }
}

pub fn displacements(v: &[dedaliano_engine::types::Displacement]) -> String {
    serde_json::to_string(&v.iter().map(|d| Displacement { node_id: d.node_id, ux: d.ux, uz: d.uz, ry: d.ry }).collect::<Vec<_>>()).unwrap()
}

pub fn reactions(v: &[dedaliano_engine::types::Reaction]) -> String {
    serde_json::to_string(&v.iter().map(|r| Reaction { node_id: r.node_id, rx: r.rx, rz: r.rz, my: r.my }).collect::<Vec<_>>()).unwrap()
}

fn forces(f: &dedaliano_engine::types::ElementForces) -> ElementForces {
    ElementForces {
        element_id: f.element_id,
        n_start: f.n_start,
        n_end: f.n_end,
        v_start: f.v_start,
        v_end: f.v_end,
        m_start: f.m_start,
        m_end: f.m_end,
        length: f.length,
        q_i: f.q_i,
        q_j: f.q_j,
        point_loads: f.point_loads.iter().map(point).collect(),
        distributed_loads: f.distributed_loads.iter().map(dist).collect(),
        distributed_loads_x: f.distributed_loads_x.iter().map(dist).collect(),
        hinge_start: f.hinge_start,
        hinge_end: f.hinge_end,
    }
}

pub fn element_forces(v: &[dedaliano_engine::types::ElementForces]) -> String {
    serde_json::to_string(&v.iter().map(forces).collect::<Vec<_>>()).unwrap()
}

pub fn results(r: &dedaliano_engine::types::AnalysisResults) -> String {
    serde_json::to_string(&AnalysisResults {
        displacements: r.displacements.iter().map(|d| Displacement { node_id: d.node_id, ux: d.ux, uz: d.uz, ry: d.ry }).collect(),
        reactions: r.reactions.iter().map(|x| Reaction { node_id: x.node_id, rx: x.rx, rz: x.rz, my: x.my }).collect(),
        element_forces: r.element_forces.iter().map(forces).collect(),
        constraint_forces: &r.constraint_forces,
        diagnostics: &r.diagnostics,
        solver_diagnostics: &r.solver_diagnostics,
        structured_diagnostics: &r.structured_diagnostics,
        equilibrium: &r.equilibrium,
        result_summary: &r.result_summary,
        solver_run_meta: &r.solver_run_meta,
    })
    .unwrap()
}

fn disp3(d: &dedaliano_engine::types::Displacement3D) -> Displacement3D {
    Displacement3D { node_id: d.node_id, ux: d.ux, uy: d.uy, uz: d.uz, rx: d.rx, ry: d.ry, rz: d.rz, warping: d.warping }
}

fn reac3(r: &dedaliano_engine::types::Reaction3D) -> Reaction3D {
    Reaction3D { node_id: r.node_id, fx: r.fx, fy: r.fy, fz: r.fz, mx: r.mx, my: r.my, mz: r.mz, bimoment: r.bimoment }
}

fn forces3(f: &dedaliano_engine::types::ElementForces3D) -> ElementForces3D {
    ElementForces3D {
        element_id: f.element_id,
        length: f.length,
        n_start: f.n_start,
        n_end: f.n_end,
        vy_start: f.vy_start,
        vy_end: f.vy_end,
        vz_start: f.vz_start,
        vz_end: f.vz_end,
        mx_start: f.mx_start,
        mx_end: f.mx_end,
        my_start: f.my_start,
        my_end: f.my_end,
        mz_start: f.mz_start,
        mz_end: f.mz_end,
        release_my_start: f.release_my_start,
        release_my_end: f.release_my_end,
        release_mz_start: f.release_mz_start,
        release_mz_end: f.release_mz_end,
        release_t_start: f.release_t_start,
        release_t_end: f.release_t_end,
        q_yi: f.q_yi,
        q_yj: f.q_yj,
        distributed_loads_y: f.distributed_loads_y.iter().map(dist).collect(),
        point_loads_y: f.point_loads_y.iter().map(point3).collect(),
        q_zi: f.q_zi,
        q_zj: f.q_zj,
        distributed_loads_z: f.distributed_loads_z.iter().map(dist).collect(),
        distributed_loads_x: f.distributed_loads_x.iter().map(dist).collect(),
        point_loads_z: f.point_loads_z.iter().map(point3).collect(),
        bimoment_start: f.bimoment_start,
        bimoment_end: f.bimoment_end,
    }
}

pub fn displacements_3d(v: &[dedaliano_engine::types::Displacement3D]) -> String {
    serde_json::to_string(&v.iter().map(disp3).collect::<Vec<_>>()).unwrap()
}

pub fn reactions_3d(v: &[dedaliano_engine::types::Reaction3D]) -> String {
    serde_json::to_string(&v.iter().map(reac3).collect::<Vec<_>>()).unwrap()
}

pub fn element_forces_3d(v: &[dedaliano_engine::types::ElementForces3D]) -> String {
    serde_json::to_string(&v.iter().map(forces3).collect::<Vec<_>>()).unwrap()
}

pub fn results_3d(r: &dedaliano_engine::types::AnalysisResults3D) -> String {
    serde_json::to_string(&AnalysisResults3D {
        displacements: r.displacements.iter().map(disp3).collect(),
        reactions: r.reactions.iter().map(reac3).collect(),
        element_forces: r.element_forces.iter().map(forces3).collect(),
        plate_stresses: &r.plate_stresses,
        quad_stresses: &r.quad_stresses,
        quad_nodal_stresses: &r.quad_nodal_stresses,
        constraint_forces: &r.constraint_forces,
        diagnostics: &r.diagnostics,
        solver_diagnostics: &r.solver_diagnostics,
        timings: &r.timings,
        structured_diagnostics: &r.structured_diagnostics,
        equilibrium: &r.equilibrium,
        result_summary: &r.result_summary,
        solver_run_meta: &r.solver_run_meta,
    })
    .unwrap()
}
