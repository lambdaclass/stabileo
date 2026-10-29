//! Known issues that can give a wrong result, contained until they are fixed (roadmap Release
//! safety item 7, #447; the triage is docs/verification/DERIVATION_TRIAGE.md).
//!
//! Each entry is a finding with a stable id (its code in the derivation review), the issue that
//! tracks it, a test on the input saying whether this result is affected, and a message. Every
//! solver entry point it concerns attaches a `KnownIssue` warning to the results it affects: the
//! id in `phase`, the issue number in `value`, the affected elements in `element_ids`. The web
//! translates the message by id. The fix of a finding removes its entry in the same pull request,
//! and the tests below fail while an entry names a fixed demonstration.

use crate::types::*;

/// The analyses the entries distinguish.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Analysis {
    /// The linear static solve and everything built on it in the same call.
    Linear,
    MaterialNonlinear,
    Cable,
    Ssi,
    Plastic,
    Modal,
    TimeHistory,
    Contact,
    Fiber,
    Corotational,
    Buckling,
    Harmonic,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode { Warn, Refuse }

pub struct Entry {
    pub id: &'static str,
    pub issue: u32,
    pub mode: Mode,
    pub message: &'static str,
}

pub const ENTRIES: &[Entry] = &[
    Entry { id: "NL-DYNAMIC-GAPS", issue: 370, mode: Mode::Warn, message: "Material nonlinear analysis may continue after an unconverged increment. Beam dynamic models omit bending rotary inertia. Independently verify convergence and deep-member dynamic response" },
    Entry { id: "PL-3D-INVARIANCE", issue: 758, mode: Mode::Warn, message: "3D plastic collapse of curved beams has shown numbering-dependent factors. Independently verify the collapse factor" },
    Entry { id: "NUM-INVARIANCE", issue: 762, mode: Mode::Warn, message: "Near-singular models can change accuracy or mechanism classification with units and orientation. Existing conditioning or stability diagnostics indicate a near-singular solve; independently verify stability before design" },
    Entry { id: "CERT-MECHANISM", issue: 458, mode: Mode::Warn, message: "An assembled-level certificate can certify an artificial or unstiffened rotation. Verify mechanisms independently; a small algebraic error bound does not establish structural stability" },
    Entry { id: "BU-SPAN-COMPRESSION", issue: 456, mode: Mode::Warn, message: "3D buckling can miss compression between member ends under span loads. Independently check the axial-force distribution and buckling factor" },
    Entry { id: "AC-PLANE-MAPPING", issue: 466, mode: Mode::Warn, message: "2D constraints assume the original model lies in the X-Z plane. Constraints converted from another plane may be wrong; use the 3D solve or independently verify the mapping" },

    Entry { id: "NL-5", issue: 428, mode: Mode::Warn, message: NL_MATERIAL },
    Entry { id: "SH-GLOBAL-STRESS", issue: 757, mode: Mode::Refuse, message: "Results withheld: solid-shell stress recovery drops out-of-plane global components. A solid shell outside the global X-Y plane can report almost zero stress under substantial load" },
    Entry { id: "SH-MITC4-DISTORTION", issue: 798, mode: Mode::Refuse, message: "Results withheld: distorted MITC4 quadrilaterals can be about ten times too stiff in membrane bending. Remesh with rectangular elements and check mesh convergence" },
    Entry { id: "PL-2D-INVARIANCE", issue: 758, mode: Mode::Refuse, message: "Results withheld: the 2D plastic collapse factor can change by up to 4.6 times with numbering, member direction or units. Use an independently verified collapse analysis" },
    Entry { id: "BU-BOUND", issue: 741, mode: Mode::Refuse, message: "Results withheld: the computed buckling factor lies outside its certified bounds. Neither the displayed factor nor the certificate may be used for design" },
    Entry { id: "SP-17", issue: 419, mode: Mode::Warn, message: "Anisotropic connector transverse axes are not user-orientable and can change abruptly with direction. Independently verify the spring directions before using these results" },
    Entry { id: "FR-5", issue: 408, mode: Mode::Warn, message: "Warping members share one warping degree of freedom at a joint. Full warping transmission may over-restrain the real connection; verify its detailing and warping restraint independently" },
    Entry { id: "SP-14", issue: 417, mode: Mode::Warn, message: "Outside the cable analysis, cable elements can carry compression as truss bars. Verify cable tensions and use a tension-only cable analysis for slackening" },
    Entry { id: "NL-3", issue: 426, mode: Mode::Warn, message: "Large non-coaxial rotations in 3D co-rotational analysis use additive rotation vectors and may converge to the wrong equilibrium. Independently verify large-rotation results" },
    Entry { id: "NL-13", issue: 432, mode: Mode::Warn, message: "Contact analysis can freeze a chattering gap while reporting convergence. Verify the contact state and equilibrium independently" },
    Entry { id: "NL-17", issue: 433, mode: Mode::Warn, message: "Fiber analysis can return an unconverged iterate without its load factor. Do not use a non-converged result for design" },
    Entry { id: "MD-ORTHOGONALITY", issue: 759, mode: Mode::Warn, message: "3D modal analysis can return non-orthogonal or duplicate modes. Effective masses and response-spectrum combinations may be wrong; independently verify the modal basis" },
    Entry { id: "TH-RECIPROCITY", issue: 760, mode: Mode::Warn, message: "Linear time history has failed reciprocity checks by up to a factor of 33. The affected input class is not yet isolated; independently verify this response before design" },
];

pub fn diagnostic(id: &str) -> StructuredDiagnostic {
    let entry = ENTRIES.iter().find(|e| e.id == id).expect("registered containment id");
    let severity = match entry.mode { Mode::Warn => Severity::Warning, Mode::Refuse => Severity::Error };
    let mut d = StructuredDiagnostic::global(DiagnosticCode::KnownIssue, severity,
        format!("{} (known issue #{}, {})", entry.message, entry.issue, entry.id));
    d.phase = Some(entry.id.to_string());
    d.value = Some(entry.issue as f64);
    d
}

pub fn refuse(diagnostics: &[StructuredDiagnostic]) -> Result<(), String> {
    match diagnostics.iter().find(|d| d.code == DiagnosticCode::KnownIssue && d.severity == Severity::Error) {
        Some(d) => Err(serde_json::json!({"message": d.message, "structuredDiagnostics": diagnostics}).to_string()),
        None => Ok(()),
    }
}

pub fn buckling_bound(computed: f64, lower: f64, upper: Option<f64>) -> Result<(), String> {
    if computed < lower || upper.is_some_and(|bound| computed > bound) {
        refuse(&[diagnostic("BU-BOUND")])
    } else {
        Ok(())
    }
}

const NL_MATERIAL: &str = "Material-nonlinear results are approximate: the model is a whole-member secant rather than plasticity, so the response jumps at first yield (NL-5). Check the collapse load factor with plastic collapse";
const THERMAL_ALPHA: &str = "These temperature loads state no coefficient of thermal expansion, so α = 12·10⁻⁶ /°C (steel's) was assumed; for another material the thermal forces scale with its real α (concrete about 10·10⁻⁶, aluminium 23·10⁻⁶): give the load its material's `alpha`";
const THERMAL_DEPTH: &str = "These temperature gradients state no section depth, so the depth of the section's equivalent solid rectangle, √(12·I/A), was assumed; that is exact only for a solid rectangle (an I section or a tube is shallower than that rectangle, so its gradient moment came out too low, by about 30 % for an IPE): give the load the section's real depth";

/// A frame thermal load solved with a default the input did not state (FR-4, #407 fixed the
/// fixed α and depth: a load now carries them). Not a defect, but a result built on a guess
/// the reader should see: code `ThermalDefaultAssumed`, the default in `phase`.
fn assumed(phase: &str, message: &str, elements: Vec<usize>) -> StructuredDiagnostic {
    let mut d = StructuredDiagnostic::global(DiagnosticCode::ThermalDefaultAssumed, Severity::Warning, message.to_string());
    d.phase = Some(phase.to_string());
    d.element_kind = Some(ElementKind::Frame);
    d.with_elements(elements)
}

/// The defaults warnings of a set of frame thermal loads, as (element, α stated, depths
/// missing for a non-zero gradient).
fn thermal_defaults(loads: impl Iterator<Item = (usize, bool, bool)>) -> Vec<StructuredDiagnostic> {
    let (mut no_alpha, mut no_depth) = (Vec::new(), Vec::new());
    for (id, alpha_missing, depth_missing) in loads {
        if alpha_missing && !no_alpha.contains(&id) { no_alpha.push(id); }
        if depth_missing && !no_depth.contains(&id) { no_depth.push(id); }
    }
    let mut out = Vec::new();
    if !no_alpha.is_empty() { out.push(assumed("alpha", THERMAL_ALPHA, no_alpha)); }
    if !no_depth.is_empty() { out.push(assumed("depth", THERMAL_DEPTH, no_depth)); }
    out
}

/// The warnings an analysis carries whatever the model (the solver itself is affected).
pub fn for_analysis(analysis: Analysis) -> Vec<StructuredDiagnostic> {
    match analysis {
        Analysis::MaterialNonlinear => vec![diagnostic("NL-5")],
        Analysis::TimeHistory => vec![diagnostic("TH-RECIPROCITY")],
        Analysis::Contact => vec![diagnostic("NL-13")],
        Analysis::Fiber => vec![diagnostic("NL-17")],
        _ => vec![],
    }
}

/// The warnings a 2D load set carries: frame temperature loads solved with an assumed α or
/// section depth (a load that states both, or changes no temperature, carries none).
pub fn loads_2d(loads: &[SolverLoad]) -> Vec<StructuredDiagnostic> {
    thermal_defaults(loads.iter().filter_map(|l| match l {
        SolverLoad::Thermal(t) => Some((
            t.element_id,
            t.alpha.is_none() && (t.dt_uniform != 0.0 || t.dt_gradient != 0.0),
            t.depth.is_none() && t.dt_gradient != 0.0,
        )),
        _ => None,
    }))
}

/// The warnings a 3D load set carries: as [`loads_2d`], a depth per gradient.
pub fn loads_3d(loads: &[SolverLoad3D]) -> Vec<StructuredDiagnostic> {
    thermal_defaults(loads.iter().filter_map(|l| match l {
        SolverLoad3D::Thermal(t) => Some((
            t.element_id,
            t.alpha.is_none() && (t.dt_uniform != 0.0 || t.dt_gradient_y != 0.0 || t.dt_gradient_z != 0.0),
            (t.depth_y.is_none() && t.dt_gradient_y != 0.0) || (t.depth_z.is_none() && t.dt_gradient_z != 0.0),
        )),
        _ => None,
    }))
}

pub fn sparse_conditioning(k: &crate::linalg::sparse::CscMatrix) -> Option<StructuredDiagnostic> {
    let mut diagonals = vec![0.0f64; k.n];
    for j in 0..k.n {
        for p in k.col_ptr[j]..k.col_ptr[j+1] {
            if k.row_idx[p] == j { diagonals[j] = k.values[p].abs(); }
        }
    }
    let max = diagonals.iter().copied().fold(0.0f64, f64::max);
    let min = diagonals.iter().copied().fold(f64::INFINITY, f64::min);
    (max > 0.0 && (min <= max * 1e-12 || max / min > 1e8)).then(|| diagnostic("NUM-INVARIANCE"))
}

pub fn conditioning(report: &crate::solver::conditioning::ConditioningReport) -> Option<StructuredDiagnostic> {
    (report.diagonal_ratio > 1e8 || !report.near_zero_dofs.is_empty()).then(|| diagnostic("NUM-INVARIANCE"))
}

// #458: an artificial rotational spring at an all-hinged node can carry
// a nodal moment or participate in a rigid arm without real rotational stiffness.
fn all_hinged_demand_2d(input: &SolverInput, loads: &[SolverLoad]) -> bool {
    input.nodes.values().any(|n| {
        let incident: Vec<_> = input.elements.values()
            .filter(|e| e.node_i == n.id || e.node_j == n.id).collect();
        !input.supports.values().any(|s| s.node_id == n.id &&
            (crate::solver::dof::is_dof_restrained_2d(s, 2) || s.kz.unwrap_or(0.0) > 0.0))
        && !incident.is_empty() && incident.iter().all(|e|
            e.elem_type != "frame" || (if e.node_i == n.id { e.hinge_start } else { e.hinge_end }))
        && (loads.iter().any(|l| matches!(l, SolverLoad::Nodal(l) if l.node_id == n.id && l.my != 0.0))
            || input.constraints.iter().any(|c| matches!(c, Constraint::RigidLink(c)
                if c.master_node == n.id || c.slave_node == n.id)))
    })
}

/// Inspect recovered membrane stress variation, in element-local axes, without
/// changing the displacement or stress recovery used for the returned numbers.
/// Uniform extension and pure transverse bending remain warnings on distorted meshes.
pub fn membrane_bending_3d(input: &SolverInput3D, loads: &[SolverLoad3D], result: &AnalysisResults3D) -> Result<(), String> {
    let distorted = model_3d(input).into_iter().find(|d| d.phase.as_deref() == Some("SH-MITC4-DISTORTION"));
    let Some(mut finding) = distorted else { return Ok(()) };
    let mut affected = Vec::new();
    for id in &finding.element_ids {
        let Some(q) = input.quads.values().find(|q| q.id == *id) else { continue };
        let coords = q.nodes.map(|id| { let n = &input.nodes[&id.to_string()]; [n.x,n.y,n.z] });
        let mut u = Vec::new();
        for id in q.nodes {
            let Some(d) = result.displacements.iter().find(|d| d.node_id == id) else { continue };
            u.extend([d.ux,d.uy,d.uz,d.rx,d.ry,d.rz]);
        }
        if u.len() != 24 { continue }
        let transform = crate::element::quad::quad_transform_3d(&coords);
        let local: [f64;24] = crate::linalg::transform_displacement(&u, &transform, 24).try_into().unwrap();
        let m = &input.materials[&q.material_id.to_string()];
        let (mut thermal, mut gradient) = (0.0, 0.0);
        for load in loads {
            if let SolverLoad3D::QuadThermal(t) = load {
                if t.element_id == q.id {
                    thermal += t.alpha.unwrap_or(1.2e-5) * t.dt_uniform;
                    gradient += t.alpha.unwrap_or(1.2e-5) * t.dt_gradient;
                }
            }
        }
        let stresses = crate::element::quad::quad_stress_at_nodes(&coords, &local, m.e * 1000.0, m.nu, q.thickness, 1.0, thermal, gradient);
        let mut variation = 0.0f64;
        let mut magnitude = 0.0f64;
        let mut bending = 0.0f64;
        for component in [|s: &QuadNodalStress| s.sigma_xx, |s: &QuadNodalStress| s.sigma_yy] {
            let lo = stresses.iter().map(component).fold(f64::INFINITY, f64::min);
            let hi = stresses.iter().map(component).fold(f64::NEG_INFINITY, f64::max);
            if lo < 0.0 && hi > 0.0 { variation = variation.max(2.0 * (-lo).min(hi)); }
            magnitude = magnitude.max(lo.abs()).max(hi.abs());
        }
        for s in &stresses {
            bending = bending.max(6.0 * s.mx.abs().max(s.my.abs()).max(s.mxy.abs()) / q.thickness.powi(2));
        }
        if variation > 0.5 * magnitude && variation > bending && variation > m.e * 1000.0 * 1e-12 {
            affected.push(*id);
        }
    }
    if affected.is_empty() { return Ok(()) }
    finding = diagnostic("SH-MITC4-DISTORTION").with_elements(affected);
    finding.element_kind = Some(ElementKind::Quad);
    refuse(&[finding])
}

pub fn model_3d(input: &SolverInput3D) -> Vec<StructuredDiagnostic> {
    let mut out = Vec::new();
    let mut shells = Vec::new();
    for e in input.solid_shells.values() {
        let points: Option<Vec<_>> = e.nodes.iter().map(|id| input.nodes.get(&id.to_string())).collect();
        let affected = points.is_none_or(|p| {
            p[..4].iter().any(|n| n.z != p[0].z) || p[4..].iter().any(|n| n.z != p[4].z)
        });
        if affected { shells.push(e.id); }
    }
    shells.sort_unstable();
    if !shells.is_empty() {
        let mut d = diagnostic("SH-GLOBAL-STRESS").with_elements(shells);
        d.element_kind = Some(ElementKind::SolidShell);
        out.push(d);
    }
    let mut quads = Vec::new();
    for e in input.quads.values() {
        let points: Option<Vec<_>> = e.nodes.iter().map(|id| input.nodes.get(&id.to_string()).map(|n| [n.x, n.y, n.z])).collect();
        let affected = points.is_none_or(|p| {
            let q = crate::element::quad::quad_quality_metrics(&[p[0], p[1], p[2], p[3]]);
            !q.max_skew.is_finite() || !q.jacobian_ratio.is_finite()
                || q.max_skew > 10.0 || q.jacobian_ratio < 0.9 || q.warping > 0.01
        });
        if affected { quads.push(e.id); }
    }
    quads.sort_unstable();
    if !quads.is_empty() {
        let mut d = diagnostic("SH-MITC4-DISTORTION").with_elements(quads);
        d.severity = Severity::Warning;
        d.message = "Distorted MITC4 elements can lock in membrane bending. Verify mesh convergence; significant membrane bending results are withheld (known issue #798, SH-MITC4-DISTORTION)".into();
        d.element_kind = Some(ElementKind::Quad);
        out.push(d);
    }
    if input.connectors.values().any(|c| c.k_shear != c.k_shear_z || c.k_bend_y != c.k_bend_z) {
        out.push(diagnostic("SP-17"));
    }
    let mut joints = std::collections::HashSet::new();
    for e in input.elements.values().filter(|e| input.sections.get(&e.section_id.to_string()).is_some_and(|s| s.cw.is_some_and(|cw| cw > 0.0))) {
        if !joints.insert(e.node_i) || !joints.insert(e.node_j) {
            out.push(diagnostic("FR-5"));
            break;
        }
    }
    out
}

/// The known-issue warnings that apply to a 2D result of `analysis` on `input`.
pub fn for_2d(input: &SolverInput, analysis: Analysis) -> Vec<StructuredDiagnostic> {
    for_2d_loads(input, &input.loads, analysis)
}

/// Prepared load cases may differ from the model used to build the factorization.
pub fn for_2d_loads(input: &SolverInput, loads: &[SolverLoad], analysis: Analysis) -> Vec<StructuredDiagnostic> {
    let mut out = for_analysis(analysis);

    if !input.constraints.is_empty() { out.push(diagnostic("AC-PLANE-MAPPING")); }
    if all_hinged_demand_2d(input, loads) {
        out.push(diagnostic("CERT-MECHANISM"));
    }
    if analysis == Analysis::MaterialNonlinear || (matches!(analysis, Analysis::Modal | Analysis::TimeHistory | Analysis::Harmonic) && input.elements.values().any(|e| e.elem_type == "frame")) {
        out.push(diagnostic("NL-DYNAMIC-GAPS"));
    }
    if analysis == Analysis::Plastic { out.push(diagnostic("PL-2D-INVARIANCE")); }
    if analysis != Analysis::Cable && input.elements.values().any(|e| e.elem_type == "cable") {
        out.push(diagnostic("SP-14"));
    }
    out.extend(loads_2d(loads));
    out
}

/// The known-issue warnings that apply to a 3D result of `analysis` on `input`.
pub fn for_3d(input: &SolverInput3D, analysis: Analysis) -> Vec<StructuredDiagnostic> {
    let mut out = for_analysis(analysis);

    if analysis == Analysis::Buckling && input.loads.iter().any(|l| matches!(l, SolverLoad3D::Distributed(_) | SolverLoad3D::PointOnElement(_))) {
        out.push(diagnostic("BU-SPAN-COMPRESSION"));
    }

    if analysis == Analysis::MaterialNonlinear || (matches!(analysis, Analysis::Modal | Analysis::TimeHistory | Analysis::Harmonic) && input.elements.values().any(|e| e.elem_type == "frame")) {
        out.push(diagnostic("NL-DYNAMIC-GAPS"));
    }
    if analysis == Analysis::Plastic && !input.curved_beams.is_empty() { out.push(diagnostic("PL-3D-INVARIANCE")); }
    if analysis == Analysis::Modal { out.push(diagnostic("MD-ORTHOGONALITY")); }
    if analysis == Analysis::Corotational { out.push(diagnostic("NL-3")); }
    if analysis != Analysis::Cable && input.elements.values().any(|e| e.elem_type == "cable") {
        out.push(diagnostic("SP-14"));
    }
    out.extend(model_3d(input));
    out.extend(loads_3d(&input.loads));
    out
}

/// Add warnings to a result's diagnostics, once each: a path that already attached a finding
/// (a prepared solve under the solve that called it) does not repeat it.
pub fn attach(target: &mut Vec<StructuredDiagnostic>, new: Vec<StructuredDiagnostic>) {
    for d in new {
        let seen = target.iter().any(|t| t.code == d.code && t.phase == d.phase);
        if !seen {
            target.push(d);
        }
    }
    if target.iter().any(|d| matches!(d.code,
        DiagnosticCode::HighDiagonalRatio | DiagnosticCode::ExtremelyHighDiagonalRatio |
        DiagnosticCode::NearZeroDiagonal | DiagnosticCode::StiffnessNotPositiveDefinite |
        DiagnosticCode::CholeskyFailedLuFallback | DiagnosticCode::ExcessiveDisplacement))
        && !target.iter().any(|d| d.phase.as_deref() == Some("NUM-INVARIANCE")) {
        target.push(diagnostic("NUM-INVARIANCE"));
    }

}



#[cfg(test)]
mod tests {
    use super::*;

    fn input2() -> SolverInput {
        serde_json::from_value(serde_json::json!({
            "nodes": {"1": {"id":1,"x":0,"z":0}, "2": {"id":2,"x":1,"z":0}},
            "elements": {"1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
            "materials": {"1": {"id":1,"e":200000,"nu":0.3}},
            "sections": {"1": {"id":1,"a":0.01,"iz":0.0001}},
            "supports": {"1": {"id":1,"nodeId":1,"type":"fixed"}}, "loads": []
        })).unwrap()
    }

    fn input3() -> SolverInput3D {
        let mut value = serde_json::to_value(input2()).unwrap();
        for element in value["elements"].as_object_mut().unwrap().values_mut() {
            element.as_object_mut().unwrap().remove("hingeStart");
            element.as_object_mut().unwrap().remove("hingeEnd");
        }
        for node in value["nodes"].as_object_mut().unwrap().values_mut() { node["y"] = 0.into(); }
        value["sections"]["1"]["iy"] = 0.0001.into();
        value["sections"]["1"]["j"] = 0.00001.into();
        value["supports"] = serde_json::json!({"1":{"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}});
        serde_json::from_value(value).unwrap()
    }

    fn has(ds: &[StructuredDiagnostic], id: &str) -> bool {
        ds.iter().any(|d| d.code == DiagnosticCode::KnownIssue && d.phase.as_deref() == Some(id))
    }

    #[test]
    fn known_issues_analysis_predicates_have_negative_controls() {
        for (id, analysis, space) in [
            ("NL-5", Analysis::MaterialNonlinear, false),
            ("NL-DYNAMIC-GAPS", Analysis::MaterialNonlinear, false),
            ("PL-2D-INVARIANCE", Analysis::Plastic, false),
            ("NL-13", Analysis::Contact, false),
            ("NL-17", Analysis::Fiber, false),
            ("TH-RECIPROCITY", Analysis::TimeHistory, false),
            ("MD-ORTHOGONALITY", Analysis::Modal, true),
            ("NL-3", Analysis::Corotational, true),
        ] {
            let diagnostics = |a| if space { for_3d(&input3(), a) } else { for_2d(&input2(), a) };
            assert!(has(&diagnostics(analysis), id), "{id}");
            assert!(!has(&diagnostics(Analysis::Linear), id), "{id}");
        }
    }

    #[test]
    fn known_issues_shell_predicates_have_geometric_controls() {
        let mut input = input3();
        for (i, [x, y, z]) in [[0.,0.,0.],[1.,0.,0.],[1.,1.,0.],[0.,1.,0.],[0.,0.,0.1],[1.,0.,0.1],[1.,1.,0.1],[0.,1.,0.1]].into_iter().enumerate() {
            let id = i + 10;
            input.nodes.insert(id.to_string(), SolverNode3D { id, x, y, z });
        }
        input.solid_shells.insert("7".into(), SolverSolidShellElement { id: 7, nodes: [10,11,12,13,14,15,16,17], material_id: 1 });
        assert!(!has(&model_3d(&input), "SH-GLOBAL-STRESS"));
        input.nodes.get_mut("12").unwrap().z = 0.2;
        input.nodes.get_mut("13").unwrap().z = 0.2;
        input.nodes.get_mut("16").unwrap().z = 0.3;
        input.nodes.get_mut("17").unwrap().z = 0.3;
        assert!(has(&model_3d(&input), "SH-GLOBAL-STRESS"));
        assert!(refuse(&model_3d(&input)).unwrap_err().contains("#757"));
        assert!(crate::solver::linear::solve_3d(&input).unwrap_err().contains("#757"));
        input.solid_shells.clear();
        input.nodes.get_mut("12").unwrap().z = 0.0;
        input.nodes.get_mut("13").unwrap().z = 0.0;
        input.quads.insert("8".into(), SolverQuadElement { id: 8, nodes: [10,11,12,13], material_id: 1, thickness: 0.1 });
        assert!(!has(&model_3d(&input), "SH-MITC4-DISTORTION"));
        input.nodes.get_mut("12").unwrap().x = 1.5;
        input.nodes.get_mut("13").unwrap().x = 0.5;
        assert!(has(&model_3d(&input), "SH-MITC4-DISTORTION"));
        assert!(refuse(&model_3d(&input)).is_ok());
    }

    #[test]
    fn known_issues_model_predicates_have_negative_controls() {
        let mut plane = input2();
        assert!(!has(&for_2d(&plane, Analysis::Linear), "NUM-INVARIANCE"));
        let mut empty = plane.clone();
        empty.nodes.clear();
        assert!(!has(&for_2d(&empty, Analysis::Linear), "NUM-INVARIANCE"));
        assert!(!has(&for_2d(&plane, Analysis::Linear), "CERT-MECHANISM"));
        plane.elements.get_mut("1").unwrap().hinge_start = true;
        assert!(!has(&for_2d(&plane, Analysis::Linear), "CERT-MECHANISM"));
        plane.loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 1, fx: 0.0, fz: 0.0, my: 1.0 }));
        assert!(!has(&for_2d(&plane, Analysis::Linear), "CERT-MECHANISM"), "a fixed support supplies the rotational restraint");
        plane.supports.get_mut("1").unwrap().support_type = "pinned".into();
        assert!(has(&for_2d(&plane, Analysis::Linear), "CERT-MECHANISM"));
        assert!(!has(&for_2d_loads(&plane, &[], Analysis::Linear), "CERT-MECHANISM"), "a different load case has no nodal moment");
        let mut unloaded = plane.clone();
        unloaded.loads.clear();
        assert!(has(&for_2d_loads(&unloaded, &plane.loads, Analysis::Linear), "CERT-MECHANISM"), "a prepared case adds the nodal moment");
        unloaded.constraints.push(Constraint::RigidLink(RigidLinkConstraint { master_node: 1, slave_node: 2, dofs: vec![] }));
        assert!(has(&for_2d(&unloaded, Analysis::Linear), "CERT-MECHANISM"), "an all-hinged node with a rigid arm is covered without nodal moment");
        unloaded.supports.get_mut("1").unwrap().kz = Some(1.0);
        assert!(!has(&for_2d(&unloaded, Analysis::Linear), "CERT-MECHANISM"), "a real rotational spring supplies stiffness");
        assert!(!has(&for_2d(&plane, Analysis::Linear), "AC-PLANE-MAPPING"));
        plane.constraints.push(Constraint::EqualDOF(EqualDOFConstraint { master_node: 1, slave_node: 2, dofs: vec![0] }));
        assert!(has(&for_2d(&plane, Analysis::Linear), "AC-PLANE-MAPPING"));
        assert!(!has(&for_2d(&plane, Analysis::Linear), "SP-14"));
        plane.elements.get_mut("1").unwrap().elem_type = "cable".into();
        assert!(has(&for_2d(&plane, Analysis::Linear), "SP-14"));
        assert!(!has(&for_2d(&plane, Analysis::Cable), "SP-14"));
        let mut space = input3();
        let connector: ConnectorElement = serde_json::from_value(serde_json::json!({"id":5,"nodeI":1,"nodeJ":2,"kShear":10,"kShearZ":10})).unwrap();
        space.connectors.insert("5".into(), connector);
        assert!(!has(&for_3d(&space, Analysis::Plastic), "PL-3D-INVARIANCE"));
        space.curved_beams.push(CurvedBeamInput { node_start: 1, node_mid: 2, node_end: 3, material_id: 1, section_id: 1, num_segments: 4, hinge_start: false, hinge_end: false });
        assert!(has(&for_3d(&space, Analysis::Plastic), "PL-3D-INVARIANCE"));
        assert!(!has(&model_3d(&space), "SP-17"));
        space.connectors.get_mut("5").unwrap().k_shear_z = 20.0;
        assert!(has(&model_3d(&space), "SP-17"));
        space.sections.get_mut("1").unwrap().cw = Some(1e-6);
        assert!(!has(&model_3d(&space), "FR-5"));
        let mut member = space.elements["1"].clone();
        member.id = 2;
        member.node_i = 2;
        member.node_j = 3;
        space.elements.insert("2".into(), member);
        assert!(has(&model_3d(&space), "FR-5"));
        assert!(!has(&for_3d(&space, Analysis::Buckling), "BU-SPAN-COMPRESSION"));
        space.loads.push(serde_json::from_value(serde_json::json!({"type":"distributed","data":{"elementId":1,"qYI":0,"qYJ":0,"qZI":-1,"qZJ":-1}})).unwrap());
        assert!(has(&for_3d(&space, Analysis::Buckling), "BU-SPAN-COMPRESSION"));
        assert!(!has(&for_3d(&space, Analysis::Linear), "BU-SPAN-COMPRESSION"));
    }

    #[test]
    fn known_issues_refusal_preserves_structured_identity() {
        assert!(buckling_bound(2.0, 1.99, Some(2.01)).is_ok());
        assert!(buckling_bound(2.02, 1.99, Some(2.01)).unwrap_err().contains("#741"));
        assert!(buckling_bound(1.98, 1.99, Some(2.01)).is_err());
        assert!(refuse(&[diagnostic("NL-5")]).is_ok());
        let encoded = refuse(&[diagnostic("BU-BOUND")]).unwrap_err();
        let value: serde_json::Value = serde_json::from_str(&encoded).unwrap();
        assert_eq!(value["structuredDiagnostics"][0]["code"], "known_issue");
        assert_eq!(value["structuredDiagnostics"][0]["value"], 741.0);
        assert_eq!(value["structuredDiagnostics"][0]["severity"], "error");
    }

    #[test]
    fn known_issues_registry_and_ledger_agree() {
        let ledger = include_str!("../../docs/verification/CONTAINMENT.md");
        let mut contained = std::collections::BTreeSet::new();
        for line in ledger.lines().filter(|l| l.starts_with("| #") && l.contains('`')) {
            contained.insert(line.split('|').nth(1).unwrap().trim().trim_start_matches('#').parse::<u32>().unwrap());
        }
        let registered: std::collections::BTreeSet<_> = ENTRIES.iter().map(|e| e.issue).collect();
        assert_eq!(registered, contained);
        for e in ENTRIES { assert!(ledger.contains(&format!("`{}`", e.id)), "{}", e.id); }
    }
}
