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
    StaticReduction,
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
    Entry { id: "SH-MITC4-CONVERGENCE", issue: 810, mode: Mode::Warn, message: "MITC4 shell benchmarks show excessive stiffness and error increasing with mesh refinement. The affected subset is unresolved; independently verify shell response before design" },
    Entry { id: "NL-DYNAMIC-GAPS", issue: 370, mode: Mode::Warn, message: "Material nonlinear analysis may continue after an unconverged increment. Beam dynamic models omit bending rotary inertia. Independently verify convergence and deep-member dynamic response" },
    Entry { id: "PL-3D-INVARIANCE", issue: 758, mode: Mode::Warn, message: "3D plastic collapse of curved beams has shown numbering-dependent factors. Independently verify the collapse factor" },
    Entry { id: "ORPHAN-SOFT-ROTATION", issue: 1496, mode: Mode::Warn, message: "A node rotation with real but very small stiffness, compared with another rotation at the same node, was held by an artificial spring, so that rotation and the forces it carries can be far too small. Do not use this result for design until this warning clears" },
    Entry { id: "NUM-INVARIANCE", issue: 762, mode: Mode::Warn, message: "Near-singular models can change accuracy or mechanism classification with units and orientation. Existing conditioning or stability diagnostics indicate a near-singular solve; independently verify stability before design" },
    Entry { id: "CERT-MECHANISM", issue: 458, mode: Mode::Warn, message: "An assembled-level certificate can certify an artificial or unstiffened rotation. Verify mechanisms independently; a small algebraic error bound does not establish structural stability" },
    Entry { id: "PD-SPAN-AXIAL", issue: 1329, mode: Mode::Warn, message: "P-Delta builds each member's geometric stiffness from its mean axial force, so compression that varies along a member under axial span loads can understate the second-order amplification. Subdivide the loaded members and check that the results converge" },
    Entry { id: "NL-3", issue: 426, mode: Mode::Warn, message: "A member's end turns more than 0.02 rad against its chord in this 3D co-rotational analysis. Its end forces omit a finite-rotation term whose error grows about as half that rotation times the end moments; split the most deformed members into shorter ones until this warning clears" },
    Entry { id: "NL-5", issue: 428, mode: Mode::Warn, message: NL_MATERIAL },
    Entry { id: "SH-MITC4-DISTORTION", issue: 798, mode: Mode::Refuse, message: "Results withheld: distorted MITC4 quadrilaterals can be about ten times too stiff in membrane bending. Remesh with rectangular elements and check mesh convergence" },
    Entry { id: "SH-WARPED-MITC4", issue: 1057, mode: Mode::Refuse, message: WARPED_MITC4 },
    Entry { id: "SH-WARPED-MITC9", issue: 1057, mode: Mode::Refuse, message: WARPED_MITC9 },
    Entry { id: "PL-2D-INVARIANCE", issue: 758, mode: Mode::Refuse, message: "Results withheld: the 2D plastic collapse factor can change by up to 4.6 times with numbering, member direction or units. Use an independently verified collapse analysis" },
    Entry { id: "BU-ACCURACY", issue: 818, mode: Mode::Warn, message: "3D buckling factors can be unconservatively high due to eigenproblem accuracy. Independently verify the critical factor before design" },
    Entry { id: "BU-UNRESOLVED-MODE", issue: 982, mode: Mode::Warn, message: "These buckling modes are not resolved: round-off in the axial forces can change their geometric work by more than 1 %, usually because members with no resolvable compression drive them. Their load factors are unreliable and must not be used without independent verification" },
    Entry { id: "BU-BOUND", issue: 741, mode: Mode::Refuse, message: "Results withheld: the computed buckling factor lies outside its certified bounds. Neither the displayed factor nor the certificate may be used for design" },
    Entry { id: "SP-17", issue: 419, mode: Mode::Warn, message: "Anisotropic connector transverse axes are not user-orientable and can change abruptly with direction. Independently verify the spring directions before using these results" },
    Entry { id: "FR-5", issue: 408, mode: Mode::Warn, message: "Warping members share one warping degree of freedom at a joint. Full warping transmission may over-restrain the real connection; verify its detailing and warping restraint independently" },
    Entry { id: "SP-14", issue: 417, mode: Mode::Warn, message: "Outside the cable analysis, cable elements can carry compression as truss bars. Verify cable tensions and use a tension-only cable analysis for slackening" },
    Entry { id: "NL-13", issue: 432, mode: Mode::Warn, message: "Contact analysis can freeze a chattering gap while reporting convergence. Verify the contact state and equilibrium independently" },
    Entry { id: "HARM-TRUNCATION", issue: 1434, mode: Mode::Warn, message: "Harmonic response by modal superposition at frequencies near or above the first omitted mode: the omitted modes are not corrected there, and amplitude and phase can be wrong by large factors. Do not use these frequencies for design; independently verify them with a direct solve" },
    Entry { id: "MD-ORTHOGONALITY", issue: 759, mode: Mode::Warn, message: "3D modal analysis can return non-orthogonal or duplicate modes. Effective masses, response-spectrum combinations and harmonic responses by modal superposition may be wrong, by large factors; independently verify the modal basis" },
    Entry { id: "TH-RECIPROCITY", issue: 760, mode: Mode::Warn, message: "Linear time history has failed reciprocity checks by up to a factor of 33. The affected input class is not yet isolated; independently verify this response before design" },
    Entry { id: "LIN-SMALL-DISPLACEMENT", issue: 1446, mode: Mode::Warn, message: "A rotation or a member's relative displacement exceeds 0.1 rad, the small-displacement screening limit of linear analysis: at that angle the terms first-order theory drops, such as the chord shortening 1 − cos θ ≈ 0.5 %, may no longer be negligible. Check that the change of geometry is acceptable: a support, spring or release may leave part of the model nearly free; otherwise use a nonlinear analysis" },
    Entry { id: "LIN-SECOND-ORDER", issue: 1551, mode: Mode::Warn, message: "Axial compression is a significant fraction of the critical load: second-order effects may amplify these linear displacements and moments by more than 10 % (N/Ncr > 0.075, CIRSOC 301 Appendix 7). Run a P-Delta or second-order analysis before using these moments for design" },
    Entry { id: "LIN-SECOND-ORDER-NEAR", issue: 1551, mode: Mode::Warn, message: "Axial compression is near the second-order limit (N/Ncr above 0.047, the limit 0.075 over the largest CIRSOC 301 load factor 1.6): a combination that factors this case up may pass it. Check the combinations with a P-Delta or second-order analysis" },
    Entry { id: "LIN-SECOND-ORDER-UNBOUNDED", issue: 1551, mode: Mode::Warn, message: "Members are in compression and the critical load could not be bounded from the members alone, so it is unknown whether second-order effects amplify these linear displacements and moments by more than 10 %. Run a P-Delta or second-order analysis before using these moments for design" },
    Entry { id: "RC-NM-PAIRING", issue: 1316, mode: Mode::Warn, message: "This CIRSOC 201 column check pairs the axial force of one combination with the moment of another, which can be unconservative below the balance point. Check the column under each named combination" },
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

pub fn refuse_contained<T: serde::Serialize + ?Sized>(own: &[StructuredDiagnostic], result: &T) -> Result<(), String> {
    refuse(own)?;
    refuse(&crate::result_sites::known_issues(result))
}

/// Whether `error` is a known-issue refusal from `refuse`, rather than invalid input.
pub fn is_refusal(error: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(error).ok()
        .and_then(|v| v.get("structuredDiagnostics").and_then(|d| d.as_array()).cloned())
        .is_some_and(|ds| ds.iter().any(|d| d["code"] == "known_issue" && d["severity"] == "error"))
}

/// Keep diagnostic-bearing failures intact when an ordinary solver failure has a fallback.
pub fn optional_solve<T>(result: Result<T, String>) -> Result<Option<T>, String> {
    match result {
        Ok(value) => Ok(Some(value)),
        Err(error) => {
            let diagnostic_error = serde_json::from_str::<serde_json::Value>(&error).ok()
                .and_then(|v| v.get("structuredDiagnostics").and_then(|d| d.as_array()).map(|d| !d.is_empty()))
                .unwrap_or(false);
            if diagnostic_error { Err(error) } else { Ok(None) }
        }
    }
}

pub fn contextual_error(error: String, context: String) -> String {
    if optional_solve::<()>(Err(error.clone())).is_err() { error }
    else { format!("{context}: {error}") }
}

pub fn buckling_bound(computed: f64, lower: f64, upper: Option<f64>) -> Result<(), String> {
    let inside = computed.is_finite() && lower.is_finite() && computed >= lower
        && upper.is_none_or(|bound| bound.is_finite() && bound >= lower && computed <= bound);
    if !inside {
        refuse(&[diagnostic("BU-BOUND")])
    } else {
        Ok(())
    }
}

const WARPED_MITC4: &str = "Results withheld: the twist of these MITC4 shells is beyond the measured 5 % accuracy band. On twisted (warped) surfaces MITC4 can be too flexible by more than 5 %, up to about twice as flexible, and refining the mesh does not reduce the error. Model the twisted region with curved-shell elements";
const WARPED_MITC9: &str = "Results withheld: the twist of these MITC9 shells is beyond the measured 5 % accuracy band. On twisted (warped) surfaces MITC9 can be too flexible by more than 5 %, up to about 2.5 times as flexible, and refining the mesh does not reduce the error. Model the twisted region with curved-shell elements";

/// Twist curvature × thickness (warn, refuse): measured over-flexibility about 1.5 % and 5 % (#1057).
pub const WARPED_MITC4_TWIST: (f64, f64) = (0.009, 0.016);
pub const WARPED_MITC9_TWIST: (f64, f64) = (0.0035, 0.0065);

/// A collapsed element or an invalid thickness is not measured: input validation refuses it by name.
fn measured(id: usize, kappa: f64, thickness: f64) -> Option<(usize, f64)> {
    (kappa.is_finite() && thickness.is_finite() && thickness > 0.0).then_some((id, kappa * thickness))
}

fn warped(id: &str, kind: ElementKind, (warn_at, refuse_at): (f64, f64), twists: impl Iterator<Item = (usize, f64)>, warning: &str) -> Option<StructuredDiagnostic> {
    let mut affected: Vec<(usize, f64)> = twists.filter(|(_, kt)| *kt > warn_at).collect();
    if affected.is_empty() { return None }
    affected.sort_by_key(|(id, _)| *id);
    let withheld = affected.iter().any(|(_, kt)| *kt > refuse_at);
    let mut d = diagnostic(id).with_elements(affected.into_iter().map(|(id, _)| id).collect());
    d.element_kind = Some(kind);
    if !withheld {
        d.severity = Severity::Warning;
        d.message = format!("{warning} (known issue #1057, {id})");
    }
    Some(d)
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

pub fn sparse_stiffness_conditioning(k: &crate::linalg::sparse::CscMatrix) -> Option<StructuredDiagnostic> {
    if k.n == 0 { return None; }
    if let Some(d) = sparse_conditioning(k) { return Some(d); }
    let symbolic = std::rc::Rc::new(crate::linalg::symbolic_cholesky(k));
    let factor = crate::linalg::numeric_cholesky(&symbolic, k);
    sparse_factor_conditioning(k, factor.as_ref())
}

pub fn sparse_factor_conditioning(
    k: &crate::linalg::sparse::CscMatrix,
    factor: Option<&crate::linalg::sparse_chol::NumericCholesky>,
) -> Option<StructuredDiagnostic> {
    if k.n == 0 { return None; }
    sparse_conditioning(k).or_else(|| {
        factor.map_or(true, |factor| crate::solver::definiteness::sparse_pivot_check(factor, k).is_some())
            .then(|| diagnostic("NUM-INVARIANCE"))
    })
}

pub fn dense_stiffness_conditioning(k: &[f64], n: usize) -> Option<StructuredDiagnostic> {
    if n == 0 { return None; }
    if let Some(d) = dense_conditioning(k, n) { return Some(d); }
    let mut factor = k.to_vec();
    let success = crate::linalg::cholesky_decompose(&mut factor, n);
    dense_factor_conditioning(k, n, success.then_some(factor.as_slice()))
}

pub fn dense_factor_conditioning(k: &[f64], n: usize, factor: Option<&[f64]>) -> Option<StructuredDiagnostic> {
    if n == 0 { return None; }
    dense_conditioning(k, n).or_else(|| {
        factor.map_or(true, |factor| crate::solver::definiteness::dense_pivot_check(factor, k, n).is_some())
            .then(|| diagnostic("NUM-INVARIANCE"))
    })
}

pub fn dense_conditioning(k: &[f64], n: usize) -> Option<StructuredDiagnostic> {
    conditioning(&crate::solver::conditioning::check_conditioning(k, n))
}

pub fn conditioning(report: &crate::solver::conditioning::ConditioningReport) -> Option<StructuredDiagnostic> {
    (report.diagonal_ratio > 1e8 || !report.near_zero_dofs.is_empty()).then(|| diagnostic("NUM-INVARIANCE"))
}

fn axial_span_loads_2d(loads: &[SolverLoad]) -> bool {
    loads.iter().any(|l| match l {
        SolverLoad::AxialDistributed(q) => q.q_i != 0.0 || q.q_j != 0.0,
        SolverLoad::PointOnElement(p) => p.px.is_some_and(|px| px != 0.0),
        _ => false,
    })
}

pub fn pdelta_span_axial_2d(loads: &[SolverLoad]) -> Vec<StructuredDiagnostic> {
    if axial_span_loads_2d(loads) { vec![diagnostic("PD-SPAN-AXIAL")] } else { vec![] }
}

pub fn pdelta_span_axial_3d(loads: &[SolverLoad3D]) -> Vec<StructuredDiagnostic> {
    if loads.iter().any(|l| matches!(l, SolverLoad3D::Distributed(q) if q.q_xi != 0.0 || q.q_xj != 0.0)) { vec![diagnostic("PD-SPAN-AXIAL")] } else { vec![] }
}

pub fn refuse_distorted(known_model: &[StructuredDiagnostic]) -> Result<(), String> {
    let Some(distorted) = known_model.iter().find(|d| d.phase.as_deref() == Some("SH-MITC4-DISTORTION")) else { return Ok(()) };
    let mut finding = diagnostic("SH-MITC4-DISTORTION").with_elements(distorted.element_ids.clone());
    finding.element_kind = distorted.element_kind.clone();
    refuse(&[finding])
}

pub struct RotationDemand2D {
    unrestrained: std::collections::HashSet<usize>,
    rigid_demand: bool,
}

impl RotationDemand2D {
    pub fn new(input: &SolverInput) -> Self {
        let mut unrestrained = std::collections::HashSet::new();
        let mut stiff = std::collections::HashSet::new();
        for e in input.elements.values() {
            for (node, released) in [(e.node_i, e.hinge_start), (e.node_j, e.hinge_end)] {
                unrestrained.insert(node);
                if e.elem_type == "frame" && !released { stiff.insert(node); }
            }
        }
        for s in input.supports.values() {
            if crate::solver::dof::is_dof_restrained_2d(s, 2) || s.kz.unwrap_or(0.0) > 0.0 {
                stiff.insert(s.node_id);
            }
        }
        let mut adjacent = std::collections::HashMap::<usize, Vec<usize>>::new();
        for c in input.connectors.values().filter(|c| c.k_moment > 0.0) {
            adjacent.entry(c.node_i).or_default().push(c.node_j);
            adjacent.entry(c.node_j).or_default().push(c.node_i);
        }
        let mut pending: Vec<_> = stiff.iter().copied().collect();
        while let Some(node) = pending.pop() {
            for other in adjacent.get(&node).into_iter().flatten() {
                if stiff.insert(*other) { pending.push(*other); }
            }
        }
        unrestrained.extend(input.nodes.values().map(|n| n.id));
        unrestrained.retain(|id| !stiff.contains(id));
        let rigid_demand = input.constraints.iter().any(|c| matches!(c, Constraint::RigidLink(c)
            if unrestrained.contains(&c.master_node) || unrestrained.contains(&c.slave_node)));
        Self { unrestrained, rigid_demand }
    }

    pub fn demanded(&self, loads: &[SolverLoad]) -> bool {
        self.rigid_demand || loads.iter().any(|l| matches!(l, SolverLoad::Nodal(l)
            if l.my != 0.0 && self.unrestrained.contains(&l.node_id)))
    }
}

fn all_hinged_demand_2d(input: &SolverInput, loads: &[SolverLoad]) -> bool {
    let demanded = loads.iter().any(|l| matches!(l, SolverLoad::Nodal(l) if l.my != 0.0))
        || input.constraints.iter().any(|c| matches!(c, Constraint::RigidLink(_)));
    demanded && RotationDemand2D::new(input).demanded(loads)
}

pub struct MembraneBendingGuard {
    model_diagnostics: Vec<StructuredDiagnostic>,
    elements: Vec<MembraneElement>,
}

struct MembraneElement {
    id: usize,
    nodes: [usize; 4],
    coords: [[f64; 3]; 4],
    transform: Vec<f64>,
    e: f64,
    nu: f64,
    thickness: f64,
}

impl MembraneBendingGuard {
    pub fn new(input: &SolverInput3D) -> Self {
        Self::for_analysis(input, Analysis::Linear)
    }

    pub(crate) fn for_analysis(input: &SolverInput3D, analysis: Analysis) -> Self {
        let distorted = model_3d(input).into_iter().find(|d| d.phase.as_deref() == Some("SH-MITC4-DISTORTION"));
        let ids: std::collections::HashSet<_> = distorted.into_iter().flat_map(|d| d.element_ids).collect();
        let mut elements = Vec::new();
        for q in input.quads.values().filter(|q| ids.contains(&q.id)) {
            let coords = q.nodes.map(|id| { let n = &input.nodes[&id.to_string()]; [n.x,n.y,n.z] });
            let m = &input.materials[&q.material_id.to_string()];
            elements.push(MembraneElement { id: q.id, nodes: q.nodes, coords,
                transform: crate::element::quad::quad_transform_3d(&coords).to_vec(),
                e: m.e * 1000.0, nu: m.nu, thickness: q.thickness });
        }
        elements.sort_by_key(|q| q.id);
        Self { elements, model_diagnostics: for_3d(input, analysis) }
    }

    pub fn check(&self, loads: &[SolverLoad3D], result: &AnalysisResults3D) -> Result<(), String> {
        refuse(&self.model_diagnostics)?;
        if self.elements.is_empty() { return Ok(()) }
        let displacements: std::collections::HashMap<_, _> = result.displacements.iter().map(|d| (d.node_id, d)).collect();
        self.check_field(loads, |id| displacements.get(&id).map(|d| [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz]))
    }

    pub fn is_empty(&self) -> bool {
        self.elements.is_empty()
    }

    pub fn check_field(&self, loads: &[SolverLoad3D], displacement: impl Fn(usize) -> Option<[f64; 6]>) -> Result<(), String> {
        refuse(&self.model_diagnostics)?;
        if self.elements.is_empty() { return Ok(()) }
        let mut thermal = std::collections::HashMap::<usize, (f64, f64)>::new();
        for load in loads {
            if let SolverLoad3D::QuadThermal(t) = load {
                let entry = thermal.entry(t.element_id).or_default();
                entry.0 += t.alpha.unwrap_or(1.2e-5) * t.dt_uniform;
                entry.1 += t.alpha.unwrap_or(1.2e-5) * t.dt_gradient;
            }
        }
        let mut affected = Vec::new();
        for q in &self.elements {
            let mut u = Vec::with_capacity(24);
            for id in q.nodes {
                let Some(d) = displacement(id) else { continue };
                u.extend(d);
            }
            if u.len() != 24 || u.iter().any(|v| !v.is_finite()) { affected.push(q.id); continue }
            let local: [f64;24] = crate::linalg::transform_displacement(&u, &q.transform, 24).try_into().unwrap();
            let (thermal, gradient) = thermal.get(&q.id).copied().unwrap_or_default();
            let stresses = crate::element::quad::quad_stress_at_nodes(&q.coords, &local, q.e, q.nu, q.thickness, 1.0, thermal, gradient);
            let mean = |k: usize| (0..4).map(|n| u[6 * n + k]).sum::<f64>() / 4.0;
            let spread = (0..3).map(|k| { let m = mean(k); (0..4).map(|n| (u[6 * n + k] - m).abs()).fold(0.0f64, f64::max) }).fold(0.0f64, f64::max);
            let size = (0..4).flat_map(|a| (0..4).map(move |b| (a, b))).map(|(a, b)| (0..3).map(|k| (q.coords[a][k] - q.coords[b][k]).powi(2)).sum::<f64>().sqrt()).fold(0.0f64, f64::max);
            let round_off = 1e-13 * q.e * spread / size;
            let bends = [|s: &QuadNodalStress| s.sigma_xx, |s: &QuadNodalStress| s.sigma_yy].into_iter().any(|component| {
                let values: Vec<f64> = stresses.iter().map(component).collect();
                if values.iter().any(|v| !v.is_finite()) { return true }
                let lo = values.iter().copied().fold(f64::INFINITY, f64::min);
                let hi = values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
                hi - lo > 1e-9 * lo.abs().max(hi.abs()) && hi - lo > round_off
            });
            if bends { affected.push(q.id); }
        }
        affected.sort_unstable();
        if affected.is_empty() { return Ok(()) }
        let mut finding = diagnostic("SH-MITC4-DISTORTION").with_elements(affected);
        finding.element_kind = Some(ElementKind::Quad);
        refuse(&[finding])
    }
}

pub fn membrane_bending_3d(input: &SolverInput3D, loads: &[SolverLoad3D], result: &AnalysisResults3D) -> Result<(), String> {
    MembraneBendingGuard::new(input).check(loads, result)
}

pub fn model_3d(input: &SolverInput3D) -> Vec<StructuredDiagnostic> {
    let mut out = Vec::new();
    if !input.quads.is_empty() {
        let mut ids: Vec<_> = input.quads.values().map(|q| q.id).collect();
        ids.sort_unstable();
        let mut d = diagnostic("SH-MITC4-CONVERGENCE").with_elements(ids);
        d.element_kind = Some(ElementKind::Quad);
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
    let point = |id: &usize| input.nodes.get(&id.to_string()).map(|n| [n.x, n.y, n.z]);
    out.extend(warped("SH-WARPED-MITC4", ElementKind::Quad, WARPED_MITC4_TWIST, input.quads.values().filter_map(|e| {
        let p: Vec<_> = e.nodes.iter().map(point).collect::<Option<_>>()?;
        measured(e.id, crate::element::quad::quad_twist_curvature(&[p[0], p[1], p[2], p[3]]), e.thickness)
    }), "MITC4 shells on twisted (warped) surfaces can be about 1.5 to 5 % too flexible, and refining the mesh does not reduce the error. Verify the twisted region with curved-shell elements"));
    out.extend(warped("SH-WARPED-MITC9", ElementKind::Quad9, WARPED_MITC9_TWIST, input.quad9s.values().filter_map(|e| {
        let p: Vec<_> = e.nodes.iter().map(point).collect::<Option<_>>()?;
        measured(e.id, crate::element::quad9::quad9_twist_curvature(&std::array::from_fn(|i| p[i])), e.thickness)
    }), "MITC9 shells on twisted (warped) surfaces can be about 1.5 to 5 % too flexible, and refining the mesh does not reduce the error. Verify the twisted region with curved-shell elements"));
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

    if analysis == Analysis::Buckling { out.push(diagnostic("BU-ACCURACY")); }

    if analysis == Analysis::MaterialNonlinear || (matches!(analysis, Analysis::Modal | Analysis::TimeHistory | Analysis::Harmonic) && (!input.curved_beams.is_empty() || input.elements.values().any(|e| e.elem_type == "frame"))) {
        out.push(diagnostic("NL-DYNAMIC-GAPS"));
    }
    if analysis == Analysis::Plastic && !input.curved_beams.is_empty() { out.push(diagnostic("PL-3D-INVARIANCE")); }
    if analysis == Analysis::Modal { out.push(diagnostic("MD-ORTHOGONALITY")); }
    if analysis != Analysis::Cable && input.elements.values().any(|e| e.elem_type == "cable") {
        out.push(diagnostic("SP-14"));
    }
    out.extend(model_3d(input));
    out.extend(loads_3d(&input.loads));
    out
}

/// 3D co-rotational end moments skip the differential of the rotation logarithm, a relative error of about half a member's natural rotation.
pub const NL3_NATURAL_ROTATION: f64 = 0.02;

/// A 3D co-rotational member whose ends turn more than [`NL3_NATURAL_ROTATION`] against its chord.
pub fn corotational_natural_rotation() -> StructuredDiagnostic {
    diagnostic("NL-3")
}

/// The screening limit for a rotation, and member chord rotation |Δu|/L, in linear analysis: at
/// 0.1 rad the chord shortening 1 − cos θ ≈ θ²/2 = 0.5 % that first-order theory drops may no longer
/// be negligible. Past it the result calls for checking geometric validity, not for rejection.
pub const SMALL_DISPLACEMENT_LIMIT: f64 = 0.1;

fn beyond_small_displacement(v: f64) -> bool {
    !(v.abs() <= SMALL_DISPLACEMENT_LIMIT)
}

pub(crate) fn small_displacement(mut nodes: Vec<usize>, mut elements: Vec<usize>) -> Option<StructuredDiagnostic> {
    if nodes.is_empty() && elements.is_empty() {
        return None;
    }
    nodes.sort_unstable();
    nodes.dedup();
    elements.sort_unstable();
    elements.dedup();
    let mut d = diagnostic("LIN-SMALL-DISPLACEMENT");
    d.threshold = Some(SMALL_DISPLACEMENT_LIMIT);
    if !elements.is_empty() {
        d.element_kind = Some(ElementKind::Frame);
    }
    d.node_ids = nodes;
    d.element_ids = elements;
    Some(d)
}

fn beyond_chords(chords: &[MemberChord]) -> Vec<usize> {
    chords.iter().filter(|c| beyond_small_displacement(c.chord.iter().map(|v| v * v).sum::<f64>().sqrt())).map(|c| c.element_id).collect()
}

/// Nodes whose rotation, two-node members whose chord rotation |Δu|/L, and frame members whose
/// section rotation inside the span exceed [`SMALL_DISPLACEMENT_LIMIT`], with every member's chord
/// and span for combinations. Each member is judged against its own length, so a large part
/// elsewhere in the model does not hide a small one.
pub fn small_displacement_2d(input: &SolverInput, loads: &[SolverLoad], r: &AnalysisResults) -> (Option<StructuredDiagnostic>, Vec<MemberChord>, Vec<MemberSpan>) {
    let u: std::collections::HashMap<usize, (f64, f64)> = r.displacements.iter().map(|d| (d.node_id, (d.ux, d.uz))).collect();
    let at: std::collections::HashMap<usize, &SolverNode> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mut chords = Vec::new();
    for e in crate::ordered::values(&input.elements) {
        let (Some(a), Some(b)) = (at.get(&e.node_i), at.get(&e.node_j)) else { continue };
        let (ua, ub) = (u.get(&e.node_i).copied().unwrap_or((0.0, 0.0)), u.get(&e.node_j).copied().unwrap_or((0.0, 0.0)));
        let length = (b.x - a.x).hypot(b.z - a.z);
        if length > 0.0 {
            chords.push(MemberChord { element_id: e.id, chord: [(ub.0 - ua.0) / length, 0.0, (ub.1 - ua.1) / length] });
        }
    }
    let spans = member_spans_2d(input, loads);
    let mut elements = beyond_chords(&chords);
    elements.extend(span_rotations_2d(&spans, r));
    (small_displacement(rotated_nodes_2d(r), elements), chords, spans)
}

pub(crate) fn rotated_nodes_2d(r: &AnalysisResults) -> Vec<usize> {
    r.displacements.iter().filter(|d| beyond_small_displacement(d.ry)).map(|d| d.node_id).collect()
}

pub(crate) fn rotated_nodes_3d(r: &AnalysisResults3D) -> Vec<usize> {
    r.displacements.iter().filter(|d| beyond_small_displacement((d.rx * d.rx + d.ry * d.ry + d.rz * d.rz).sqrt())).map(|d| d.node_id).collect()
}

/// A combination's warning: its own node rotations, its member chords summed from the factored
/// chords of its cases, and its members' span rotations from its own displacements and span
/// loads (`span_rotations` over the members its cases recorded, with the factored sum of their
/// thermal curvatures). Each check runs when every case
/// recorded what it needs; when a case lacks either record, the member warnings of every case are
/// carried as well, and the combination records only what is complete.
pub(crate) fn combined_small_displacement<'a>(
    nodes: Vec<usize>,
    cases: impl Iterator<Item = (f64, Option<&'a ResultSummary>)>,
    carried: &[StructuredDiagnostic],
    span_rotations: impl FnOnce(&[MemberSpan]) -> Vec<usize>,
) -> (Option<StructuredDiagnostic>, Option<Vec<MemberChord>>, Option<Vec<MemberSpan>>) {
    let mut summed: Option<std::collections::BTreeMap<usize, [f64; 3]>> = Some(std::collections::BTreeMap::new());
    let mut spans: Option<Option<&Vec<MemberSpan>>> = Some(None);
    let mut curvature: std::collections::BTreeMap<usize, [f64; 2]> = std::collections::BTreeMap::new();
    for (factor, summary) in cases {
        match (summary.and_then(|s| s.member_chords.as_ref()), summed.as_mut()) {
            (Some(chords), Some(sum)) => {
                for c in chords {
                    let entry = sum.entry(c.element_id).or_insert([0.0; 3]);
                    for (s, v) in entry.iter_mut().zip(c.chord) {
                        *s += factor * v;
                    }
                }
            }
            (None, _) => summed = None,
            _ => {}
        }
        match (summary.and_then(|s| s.member_spans.as_ref()), spans.as_mut()) {
            (Some(own), Some(first)) => {
                first.get_or_insert(own);
                for span in own {
                    let sum = curvature.entry(span.element_id).or_insert([0.0; 2]);
                    for (s, k) in sum.iter_mut().zip(span.curvature) {
                        *s += factor * k;
                    }
                }
            }
            (None, _) => spans = None,
            _ => {}
        }
    }
    let chords: Option<Vec<MemberChord>> = summed.map(|s| s.into_iter().map(|(element_id, chord)| MemberChord { element_id, chord }).collect());
    let spans: Option<Vec<MemberSpan>> = spans.map(|s| {
        let mut spans = s.cloned().unwrap_or_default();
        for span in &mut spans {
            span.curvature = curvature.get(&span.element_id).copied().unwrap_or([0.0; 2]);
        }
        spans
    });
    let mut elements = Vec::new();
    if chords.is_none() || spans.is_none() {
        elements.extend(carried.iter().filter(|d| d.phase.as_deref() == Some("LIN-SMALL-DISPLACEMENT")).flat_map(|d| d.element_ids.iter().copied()));
    }
    if let Some(chords) = &chords {
        elements.extend(beyond_chords(chords));
    }
    if let Some(spans) = &spans {
        elements.extend(span_rotations(spans));
    }
    (small_displacement(nodes, elements), chords, spans)
}

/// [`small_displacement_2d`] in 3D: the norm of each node's rotation vector, the chord of every
/// two-node member, and the rotation vector inside each frame member's span.
pub fn small_displacement_3d(input: &SolverInput3D, loads: &[SolverLoad3D], r: &AnalysisResults3D) -> (Option<StructuredDiagnostic>, Vec<MemberChord>, Vec<MemberSpan>) {
    let u: std::collections::HashMap<usize, [f64; 3]> = r.displacements.iter().map(|d| (d.node_id, [d.ux, d.uy, d.uz])).collect();
    let at: std::collections::HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mut chords = Vec::new();
    for e in crate::ordered::values(&input.elements) {
        let (Some(a), Some(b)) = (at.get(&e.node_i), at.get(&e.node_j)) else { continue };
        let (ua, ub) = (u.get(&e.node_i).copied().unwrap_or([0.0; 3]), u.get(&e.node_j).copied().unwrap_or([0.0; 3]));
        let length = ((b.x - a.x).powi(2) + (b.y - a.y).powi(2) + (b.z - a.z).powi(2)).sqrt();
        if length > 0.0 {
            chords.push(MemberChord { element_id: e.id, chord: [(ub[0] - ua[0]) / length, (ub[1] - ua[1]) / length, (ub[2] - ua[2]) / length] });
        }
    }
    let spans = member_spans_3d(input, loads);
    let mut elements = beyond_chords(&chords);
    elements.extend(span_rotations_3d(&spans, r));
    (small_displacement(rotated_nodes_3d(r), elements), chords, spans)
}

const SPAN_STATIONS: usize = 64;

/// The real roots in (0, 1) of the cubic `c[0] + c[1]·t + c[2]·t² + c[3]·t³`: the interval is
/// split where the cubic turns, so each piece holds at most one root.
fn cubic_roots_in_unit(c: [f64; 4]) -> Vec<f64> {
    let p = |t: f64| ((c[3] * t + c[2]) * t + c[1]) * t + c[0];
    let (qa, qb, qc) = (3.0 * c[3], 2.0 * c[2], c[1]);
    let mut cuts = vec![0.0, 1.0];
    let disc = qb * qb - 4.0 * qa * qc;
    if disc >= 0.0 {
        let q = -0.5 * (qb + qb.signum() * disc.sqrt());
        if q != 0.0 {
            cuts.extend([q / qa, qc / q]);
        } else if qa != 0.0 {
            cuts.push(0.0);
        }
    }
    cuts.retain(|t| (0.0..=1.0).contains(t));
    cuts.sort_by(f64::total_cmp);
    let mut roots = Vec::new();
    for w in cuts.windows(2) {
        let (mut lo, mut hi) = (w[0], w[1]);
        let (plo, phi) = (p(lo), p(hi));
        if !(plo * phi <= 0.0) || plo == phi {
            continue;
        }
        for _ in 0..80 {
            let mid = 0.5 * (lo + hi);
            if (p(mid) <= 0.0) == (plo <= 0.0) { lo = mid } else { hi = mid }
        }
        roots.push(0.5 * (lo + hi));
    }
    roots
}

/// The largest rotation along a member, its bending planes' section rotations ψ and axis slopes
/// ψ − V/(G·As), and a twist interpolated between `twist`, bounded on each interval between
/// [`SPAN_STATIONS`] stations and the load positions. Between them a plane's moment M is a cubic,
/// so the zeros of M and of M/EI − M''/(G·As), where ψ and the slope are extreme, are found
/// exactly, and the slope is taken on both sides of a point load; the interval's value is the norm
/// of each part's own largest magnitude on it, which the rotation vector cannot exceed.
fn largest_span_rotation(l: f64, planes: &[crate::postprocess::diagrams::SpanRotation], twist: (f64, f64)) -> f64 {
    let mut stations: Vec<f64> = (0..=SPAN_STATIONS).map(|k| l * k as f64 / SPAN_STATIONS as f64).chain(planes.iter().flat_map(|p| p.breaks().iter().copied())).collect();
    stations.sort_by(f64::total_cmp);
    stations.dedup();
    let nodes: [f64; 4] = std::array::from_fn(|k| 0.5 * (1.0 - ((2 * k + 1) as f64 * std::f64::consts::PI / 8.0).cos()));
    let mut worst = 0.0f64;
    for w in stations.windows(2) {
        let (a, b) = (w[0], w[1]);
        let mut sum = (twist.0 + (twist.1 - twist.0) * a / l).abs().max((twist.0 + (twist.1 - twist.0) * b / l).abs()).powi(2);
        for p in planes {
            let m = nodes.map(|t| p.moment(a + (b - a) * t));
            let mut c = [0.0; 4];
            for (k, &tk) in nodes.iter().enumerate() {
                let others: Vec<f64> = nodes.iter().enumerate().filter(|&(j, _)| j != k).map(|(_, &t)| t).collect();
                let scale = m[k] / others.iter().map(|&t| tk - t).product::<f64>();
                let (r0, r1, r2) = (others[0], others[1], others[2]);
                c[0] -= scale * r0 * r1 * r2;
                c[1] += scale * (r0 * r1 + r0 * r2 + r1 * r2);
                c[2] -= scale * (r0 + r1 + r2);
                c[3] += scale;
            }
            let (h, f, ei) = (b - a, p.shear_flexibility(), p.ei());
            let turn = |t: f64| {
                let psi = p.at(a + h * t);
                let axis = psi - f * (c[1] + (2.0 * c[2] + 3.0 * c[3] * t) * t) / h;
                nan_max(psi.abs(), axis.abs())
            };
            let mut at = vec![0.0, 1.0];
            at.extend(cubic_roots_in_unit(c));
            if f != 0.0 {
                at.extend(cubic_roots_in_unit([c[0] / ei - 2.0 * f * c[2] / (h * h), c[1] / ei - 6.0 * f * c[3] / (h * h), c[2] / ei, c[3] / ei]));
            }
            let largest = at.into_iter().map(turn).fold(0.0, nan_max);
            sum += largest * largest;
        }
        worst = nan_max(worst, sum.sqrt());
    }
    worst
}

fn nan_max(x: f64, y: f64) -> f64 {
    if x.is_nan() || y.is_nan() { f64::NAN } else { x.max(y) }
}

fn member_spans_2d(input: &SolverInput, loads: &[SolverLoad]) -> Vec<MemberSpan> {
    let at: std::collections::HashMap<usize, &SolverNode> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mut out = Vec::new();
    for e in crate::ordered::values(&input.elements).filter(|e| e.elem_type == "frame") {
        let (Some(a), Some(b)) = (at.get(&e.node_i), at.get(&e.node_j)) else { continue };
        let (Some(mat), Some(sec)) = (input.materials.values().find(|m| m.id == e.material_id), input.sections.values().find(|s| s.id == e.section_id)) else { continue };
        let length = (b.x - a.x).hypot(b.z - a.z);
        let e_mod = mat.e * 1000.0;
        if !(length > 0.0 && e_mod * sec.iz > 0.0) {
            continue;
        }
        let (cos, sin) = ((b.x - a.x) / length, (b.z - a.z) / length);
        let shear = sec.as_y.filter(|&s| s > 0.0).map_or(0.0, |s| 2.0 * (1.0 + mat.nu) / (e_mod * s));
        let curvature = loads.iter().map(|l| match l {
            SolverLoad::Thermal(t) if t.element_id == e.id => THERMAL_CURVATURE_2D * t.alpha() * t.dt_gradient / t.depth(sec.a, sec.iz),
            _ => 0.0,
        }).sum();
        out.push(MemberSpan { element_id: e.id, nodes: [e.node_i, e.node_j], length, axes: [[cos, 0.0, sin], [-sin, 0.0, cos], [0.0, 1.0, 0.0]], ei: [e_mod * sec.iz, 0.0], shear_flexibility: [shear, 0.0], curvature: [curvature, 0.0] });
    }
    out
}

fn member_spans_3d(input: &SolverInput3D, loads: &[SolverLoad3D]) -> Vec<MemberSpan> {
    let at: std::collections::HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();
    let left_hand = input.left_hand.unwrap_or(false);
    let mut out = Vec::new();
    for e in crate::ordered::values(&input.elements).filter(|e| e.elem_type == "frame") {
        let (Some(a), Some(b)) = (at.get(&e.node_i), at.get(&e.node_j)) else { continue };
        let (Some(mat), Some(sec)) = (input.materials.values().find(|m| m.id == e.material_id), input.sections.values().find(|s| s.id == e.section_id)) else { continue };
        let length = ((b.x - a.x).powi(2) + (b.y - a.y).powi(2) + (b.z - a.z).powi(2)).sqrt();
        let (e_mod, g) = (mat.e * 1000.0, mat.e * 1000.0 / (2.0 * (1.0 + mat.nu)));
        if !(length > 0.0 && e_mod * sec.iy > 0.0 && e_mod * sec.iz > 0.0) {
            continue;
        }
        let (ex, ey, ez) = crate::element::compute_local_axes_3d(a.x, a.y, a.z, b.x, b.y, b.z, e.local_yx, e.local_yy, e.local_yz, e.roll_angle, left_hand);
        let shear = |area: Option<f64>| area.filter(|&s| s > 0.0).map_or(0.0, |s| 1.0 / (g * s));
        let mut curvature = [0.0; 2];
        for l in loads {
            if let SolverLoad3D::Thermal(t) = l {
                if t.element_id == e.id {
                    curvature[0] += THERMAL_CURVATURE_3D[0] * t.alpha() * t.dt_gradient_y / t.depth_y(sec.a, sec.iz);
                    curvature[1] += THERMAL_CURVATURE_3D[1] * t.alpha() * t.dt_gradient_z / t.depth_z(sec.a, sec.iy);
                }
            }
        }
        out.push(MemberSpan { element_id: e.id, nodes: [e.node_i, e.node_j], length, axes: [ex, ey, ez], ei: [e_mod * sec.iz, e_mod * sec.iy], shear_flexibility: [shear(sec.as_z), shear(sec.as_y)], curvature });
    }
    out
}

const THERMAL_CURVATURE_2D: f64 = 1.0;
const THERMAL_CURVATURE_3D: [f64; 2] = [1.0, -1.0];

fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// Frame members whose section rotation inside the span exceeds [`SMALL_DISPLACEMENT_LIMIT`]:
/// a member held at both ends can turn far between them under a span load.
pub(crate) fn span_rotations_2d(spans: &[MemberSpan], r: &AnalysisResults) -> Vec<usize> {
    span_planes_2d(spans, r).into_iter().filter(|(_, length, plane)| beyond_small_displacement(largest_span_rotation(*length, std::slice::from_ref(plane), (0.0, 0.0)))).map(|(id, _, _)| id).collect()
}

fn span_planes_2d(spans: &[MemberSpan], r: &AnalysisResults) -> Vec<(usize, f64, crate::postprocess::diagrams::SpanRotation)> {
    use crate::postprocess::diagrams::SpanRotation;
    let u: std::collections::HashMap<usize, &Displacement> = r.displacements.iter().map(|d| (d.node_id, d)).collect();
    let forces: std::collections::HashMap<usize, &ElementForces> = r.element_forces.iter().map(|f| (f.element_id, f)).collect();
    let mut out = Vec::new();
    for span in spans {
        let Some(ef) = forces.get(&span.element_id) else { continue };
        let end = |id: usize| u.get(&id).map_or((0.0, 0.0), |d| (dot(span.axes[1], [d.ux, 0.0, d.uz]), d.ry));
        let ((v_i, r_i), (v_j, r_j)) = (end(span.nodes[0]), end(span.nodes[1]));
        let mut dist: Vec<(f64, f64, f64, f64)> = ef.distributed_loads.iter().map(|d| (d.q_i, d.q_j, d.a, d.b)).collect();
        if dist.is_empty() && (ef.q_i.abs() > 1e-10 || ef.q_j.abs() > 1e-10) {
            dist.push((ef.q_i, ef.q_j, 0.0, span.length));
        }
        let points = ef.point_loads.iter().map(|p| (p.a, p.p)).collect();
        let couples = ef.point_loads.iter().filter_map(|p| p.my.map(|m| (p.a, m))).collect();
        out.push((span.element_id, span.length, SpanRotation::new(span.length, span.ei[0], span.shear_flexibility[0], v_i, r_i, v_j, r_j, ef.hinge_start, ef.hinge_end, points, dist, couples, span.curvature[0])));
    }
    out
}

/// [`span_rotations_2d`] in 3D: both bending planes, in the axes the app's 3D deformed shape uses, and the
/// twist, judged together as the norm of the rotation vector.
pub(crate) fn span_rotations_3d(spans: &[MemberSpan], r: &AnalysisResults3D) -> Vec<usize> {
    span_planes_3d(spans, r).into_iter().filter(|(_, length, planes, twist)| beyond_small_displacement(largest_span_rotation(*length, planes, *twist))).map(|(id, ..)| id).collect()
}

type SpanPlanes3D = (usize, f64, [crate::postprocess::diagrams::SpanRotation; 2], (f64, f64));

fn span_planes_3d(spans: &[MemberSpan], r: &AnalysisResults3D) -> Vec<SpanPlanes3D> {
    use crate::postprocess::diagrams::SpanRotation;
    let u: std::collections::HashMap<usize, &Displacement3D> = r.displacements.iter().map(|d| (d.node_id, d)).collect();
    let forces: std::collections::HashMap<usize, &ElementForces3D> = r.element_forces.iter().map(|f| (f.element_id, f)).collect();
    let mut out = Vec::new();
    for span in spans {
        let Some(ef) = forces.get(&span.element_id) else { continue };
        let [ex, ey, ez] = span.axes;
        let end = |id: usize| {
            let (t, r) = u.get(&id).map_or(([0.0; 3], [0.0; 3]), |d| ([d.ux, d.uy, d.uz], [d.rx, d.ry, d.rz]));
            ([dot(ey, t), dot(ez, t)], [dot(ex, r), dot(ey, r), dot(ez, r)])
        };
        let ((ti, ri), (tj, rj)) = (end(span.nodes[0]), end(span.nodes[1]));
        let loads = |dist: &[DistributedLoadInfo], q: (f64, f64), points: &[PointLoadInfo3D]| {
            let mut d: Vec<(f64, f64, f64, f64)> = dist.iter().map(|d| (d.q_i, d.q_j, d.a, d.b)).collect();
            if d.is_empty() && (q.0.abs() > 1e-10 || q.1.abs() > 1e-10) {
                d.push((q.0, q.1, 0.0, span.length));
            }
            (points.iter().map(|p| (p.a, p.p)).collect(), d)
        };
        let (py, dy) = loads(&ef.distributed_loads_y, (ef.q_yi, ef.q_yj), &ef.point_loads_y);
        let (pz, dz) = loads(&ef.distributed_loads_z, (ef.q_zi, ef.q_zj), &ef.point_loads_z);
        let planes = [
            SpanRotation::new(span.length, span.ei[0], span.shear_flexibility[0], ti[0], ri[2], tj[0], rj[2], ef.release_mz_start, ef.release_mz_end, py, dy, Vec::new(), span.curvature[0]),
            SpanRotation::new(span.length, span.ei[1], span.shear_flexibility[1], ti[1], -ri[1], tj[1], -rj[1], ef.release_my_start, ef.release_my_end, pz, dz, Vec::new(), span.curvature[1]),
        ];
        let twist = match (ef.release_t_start, ef.release_t_end) {
            (false, false) => (ri[0], rj[0]),
            (true, false) => (rj[0], rj[0]),
            (false, true) => (ri[0], ri[0]),
            (true, true) => (0.0, 0.0),
        };
        out.push((span.element_id, span.length, planes, twist));
    }
    out
}

/// The second-order screening limit of a linear result, N/Ncr = 0.07483: the largest ratio at which
/// the worst elastic moment amplification, sec((π/2)·√(N/Ncr)) under a uniform moment, stays within
/// 1.1, the ratio of second- to first-order effects up to which CIRSOC 301 Appendix 7 §7.2 treats
/// them as small. The displacement amplification 1/(1 − N/Ncr) is lower.
pub const SECOND_ORDER_RATIO: f64 = 0.074_83;

/// The largest single load factor of CIRSOC 301 B.2: a case within this factor of the limit can pass
/// it in a combination.
pub const SECOND_ORDER_NEAR_FACTOR: f64 = 1.6;

pub(crate) struct ScreenBar {
    pub id: usize,
    pub ends: [usize; 2],
    pub frame: bool,
    pub hinged: [bool; 2],
    pub ei_min: f64,
    pub compression: f64,
}

pub(crate) struct ScreenModel {
    pub bars: Vec<ScreenBar>,
    pub position: std::collections::HashMap<usize, [f64; 3]>,
    pub supported: std::collections::HashSet<usize>,
    pub braced: std::collections::HashSet<usize>,
    pub clamped: std::collections::HashSet<usize>,
    pub other_parts: bool,
}

/// A member with no bound of its own is let off only when its compression is under this fraction of
/// its pinned-pinned Euler load, π²·E·I_min/L², so that round-off in a member carrying nothing does
/// not flag the frame; no force elsewhere in the model can raise it. A let-off member still enters
/// the recorded ratio, scaled so that a combination factoring it past this fraction warns.
const COMPRESSED: f64 = 1e-9;

fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn norm(v: [f64; 3]) -> f64 {
    (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt()
}

/// Frame members as the physical members they belong to: chains of collinear frame elements
/// through nodes no other element, support or hinge touches. Each chain is its element indices.
fn member_chains(m: &ScreenModel) -> Vec<Vec<usize>> {
    let mut at: std::collections::HashMap<usize, Vec<usize>> = std::collections::HashMap::new();
    for (i, b) in m.bars.iter().enumerate() {
        for n in b.ends {
            at.entry(n).or_default().push(i);
        }
    }
    let passes = |node: usize| -> Option<(usize, usize)> {
        let here = at.get(&node)?;
        if here.len() != 2 || m.supported.contains(&node) { return None; }
        let (i, j) = (here[0], here[1]);
        let (a, b) = (&m.bars[i], &m.bars[j]);
        if !a.frame || !b.frame || i == j { return None; }
        let hinged = |bar: &ScreenBar| bar.ends.iter().zip(bar.hinged).any(|(&n, h)| n == node && h);
        if hinged(a) || hinged(b) { return None; }
        let p = |bar: &ScreenBar| { let other = if bar.ends[0] == node { bar.ends[1] } else { bar.ends[0] }; m.position.get(&other).copied() };
        let (pa, pb, here) = (p(a)?, p(b)?, *m.position.get(&node)?);
        let (u, v) = (sub(pa, here), sub(pb, here));
        let cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (norm(u) * norm(v));
        (cos < -1.0 + 1e-9).then_some((i, j))
    };
    let mut seen = vec![false; m.bars.len()];
    let mut chains = Vec::new();
    for start in 0..m.bars.len() {
        if seen[start] || !m.bars[start].frame { continue; }
        let mut chain = vec![start];
        seen[start] = true;
        for side in 0..2 {
            let (mut bar, mut node) = (start, m.bars[start].ends[side]);
            while let Some((i, j)) = passes(node) {
                let next = if i == bar { j } else { i };
                if seen[next] { break; }
                seen[next] = true;
                chain.push(next);
                node = if m.bars[next].ends[0] == node { m.bars[next].ends[1] } else { m.bars[next].ends[0] };
                bar = next;
            }
        }
        chains.push(chain);
    }
    chains
}

fn chain_ends(m: &ScreenModel, chain: &[usize]) -> Vec<usize> {
    let mut count: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();
    for &i in chain {
        for n in m.bars[i].ends { *count.entry(n).or_default() += 1; }
    }
    let mut ends: Vec<usize> = count.into_iter().filter(|&(_, c)| c == 1).map(|(n, _)| n).collect();
    ends.sort_unstable();
    ends
}

/// A linear result's second-order screen (#1551). The K = 2 and K = 1 bounds hold for the frame
/// only because the clamp or both braces are supports: restraint from other members does not count.
pub(crate) fn second_order(m: &ScreenModel) -> (Vec<StructuredDiagnostic>, f64) {
    if !m.bars.iter().any(|b| b.compression > 0.0) { return (Vec::new(), 0.0); }
    let length = |b: &ScreenBar| match (m.position.get(&b.ends[0]), m.position.get(&b.ends[1])) {
        (Some(&a), Some(&c)) => norm(sub(c, a)),
        _ => f64::NAN,
    };
    let braced = |chain: &[usize]| { let ends = chain_ends(m, chain); ends.len() == 2 && ends.iter().all(|n| m.braced.contains(n)) };
    let clamped = |chain: &[usize]| chain.iter().any(|&i| {
        let b = &m.bars[i];
        (0..2).any(|k| m.clamped.contains(&b.ends[k]) && !b.hinged[k])
    });
    let euler = |bars: &[usize]| {
        let l: f64 = bars.iter().map(|&i| length(&m.bars[i])).sum();
        std::f64::consts::PI.powi(2) * bars.iter().map(|&i| m.bars[i].ei_min).fold(f64::INFINITY, f64::min) / l.powi(2)
    };
    let let_off = |bars: &[usize], n: f64| { let e = euler(bars); (n <= COMPRESSED * e).then(|| SECOND_ORDER_RATIO * n / (COMPRESSED * e)) };
    let (mut over, mut near, mut largest, mut unbounded) = (Vec::new(), Vec::new(), 0.0_f64, m.other_parts);
    let mut unbound = |bars: &[usize], n: f64, largest: &mut f64| match let_off(bars, n) {
        Some(r) => *largest = largest.max(r),
        None => unbounded = true,
    };
    for i in 0..m.bars.len() {
        let b = &m.bars[i];
        if !b.frame && b.compression > 0.0 && !b.ends.iter().all(|n| m.braced.contains(n)) { unbound(&[i], b.compression, &mut largest); }
    }
    for chain in member_chains(m) {
        let n = chain.iter().map(|&i| m.bars[i].compression).fold(0.0, f64::max);
        if n <= 0.0 { continue; }
        let k = if clamped(&chain) { 2.0 } else if braced(&chain) { 1.0 } else { unbound(&chain, n, &mut largest); continue };
        let ratio = n * k * k / euler(&chain);
        let ids = chain.iter().map(|&i| m.bars[i].id);
        largest = if ratio.is_nan() { f64::INFINITY } else { largest.max(ratio) };
        if !(ratio <= SECOND_ORDER_RATIO) {
            over.extend(ids);
        } else if ratio * SECOND_ORDER_NEAR_FACTOR > SECOND_ORDER_RATIO {
            near.extend(ids);
        }
    }
    let mut found: Vec<StructuredDiagnostic> = [("LIN-SECOND-ORDER", over), ("LIN-SECOND-ORDER-NEAR", near)].into_iter().filter_map(|(id, e)| on_elements(id, e)).collect();
    if unbounded { found.push(whole_frame("LIN-SECOND-ORDER-UNBOUNDED")); }
    (found, largest)
}

fn whole_frame(id: &str) -> StructuredDiagnostic {
    let mut d = diagnostic(id);
    d.threshold = Some(SECOND_ORDER_RATIO);
    d
}

fn on_elements(id: &str, mut elements: Vec<usize>) -> Option<StructuredDiagnostic> {
    if elements.is_empty() { return None; }
    elements.sort_unstable();
    elements.dedup();
    let mut d = whole_frame(id);
    d.element_kind = Some(ElementKind::Frame);
    d.element_ids = elements;
    Some(d)
}

pub(crate) fn is_second_order(d: &StructuredDiagnostic) -> bool {
    d.code == DiagnosticCode::KnownIssue && matches!(d.phase.as_deref(), Some("LIN-SECOND-ORDER" | "LIN-SECOND-ORDER-NEAR" | "LIN-SECOND-ORDER-UNBOUNDED"))
}

/// A combination's screen. `ratio` is Σ|factor|·(the case's largest N/Ncr), a bound on every
/// bounded member's N/Ncr in the combination when no factor is negative; None when a compressed
/// case carries no ratio. The members a case flagged stay flagged; an unbounded case, a negative
/// factor, which can turn a case's tension into compression, or a missing ratio leaves the
/// combination unbounded.
pub(crate) fn combined_second_order<'a>(cases: impl Iterator<Item = &'a StructuredDiagnostic>, reversed: bool, ratio: Option<f64>) -> Vec<StructuredDiagnostic> {
    let mut elements = Vec::new();
    let mut unbounded = reversed || ratio.is_none();
    for d in cases {
        match d.phase.as_deref() {
            Some("LIN-SECOND-ORDER") => elements.extend(d.element_ids.iter().copied()),
            Some("LIN-SECOND-ORDER-UNBOUNDED") => unbounded = true,
            _ => {}
        }
    }
    let mut found: Vec<StructuredDiagnostic> = match ratio {
        Some(r) if !(r <= SECOND_ORDER_RATIO) => vec![whole_frame("LIN-SECOND-ORDER")],
        _ => on_elements("LIN-SECOND-ORDER", elements).into_iter().collect(),
    };
    if unbounded { found.push(whole_frame("LIN-SECOND-ORDER-UNBOUNDED")); }
    found
}

/// [`combined_second_order`]'s ratio: each case's |factor| times its screened ratio.
pub(crate) fn combined_ratio<'a>(cases: impl Iterator<Item = (f64, Option<&'a ResultSummary>, bool)>) -> Option<f64> {
    let mut total = 0.0;
    for (factor, summary, compressed) in cases {
        match summary.and_then(|s| s.second_order_ratio) {
            Some(r) => total += factor.abs() * r,
            None if compressed => return None,
            None => {}
        }
    }
    Some(total)
}

fn span_length(a: Option<f64>, b: Option<f64>, length: Option<f64>) -> f64 {
    let length = length.unwrap_or(f64::INFINITY);
    (b.unwrap_or(length) - a.unwrap_or(0.0)).abs()
}

/// The largest compression along a member, bounded from its end forces and its axial span loads:
/// a span load can compress the interior while both ends read zero.
fn compression(n_start: f64, n_end: f64, span: Option<&f64>) -> f64 {
    (-n_start).max(-n_end).max(0.0) + span.copied().unwrap_or(0.0)
}

/// [`second_order`] for a 2D result.
pub fn second_order_2d(input: &SolverInput, loads: &[SolverLoad], r: &AnalysisResults) -> (Vec<StructuredDiagnostic>, f64) {
    let mut span: std::collections::HashMap<usize, f64> = std::collections::HashMap::new();
    for load in loads {
        let (id, total) = match load {
            SolverLoad::PointOnElement(p) => (p.element_id, p.px.unwrap_or(0.0).abs()),
            SolverLoad::AxialDistributed(q) => (q.element_id, q.q_i.abs().max(q.q_j.abs()) * span_length(q.a, q.b, r.element_forces.iter().find(|f| f.element_id == q.element_id).map(|f| f.length))),
            _ => continue,
        };
        *span.entry(id).or_default() += total;
    }
    let n: std::collections::HashMap<usize, f64> = r.element_forces.iter().map(|f| (f.element_id, compression(f.n_start, f.n_end, span.get(&f.element_id)))).collect();
    let bars = crate::ordered::values(&input.elements).map(|e| {
        let ei = input.materials.values().find(|m| m.id == e.material_id).zip(input.sections.values().find(|s| s.id == e.section_id))
            .map_or(f64::NAN, |(m, s)| m.e * 1000.0 * s.iz);
        ScreenBar { id: e.id, ends: [e.node_i, e.node_j], frame: e.elem_type == "frame", hinged: [e.hinge_start, e.hinge_end], ei_min: ei, compression: n.get(&e.id).copied().unwrap_or(0.0) }
    }).collect();
    let square = |s: &&crate::types::SolverSupport| s.angle.is_none_or(|a| a == 0.0);
    let model = ScreenModel {
        bars,
        position: input.nodes.values().map(|n| (n.id, [n.x, 0.0, n.z])).collect(),
        supported: input.supports.values().map(|s| s.node_id).collect(),
        braced: input.supports.values().filter(square).filter(|s| matches!(s.support_type.as_str(), "fixed" | "pinned")).map(|s| s.node_id).collect(),
        clamped: input.supports.values().filter(square).filter(|s| s.support_type == "fixed").map(|s| s.node_id).collect(),
        other_parts: !input.constraints.is_empty() || !input.connectors.is_empty(),
    };
    second_order(&model)
}

/// [`second_order`] for a 3D result: I_min is the lesser of Iy and Iz.
pub fn second_order_3d(input: &SolverInput3D, loads: &[SolverLoad3D], r: &AnalysisResults3D) -> (Vec<StructuredDiagnostic>, f64) {
    let mut span: std::collections::HashMap<usize, f64> = std::collections::HashMap::new();
    for load in loads {
        if let SolverLoad3D::Distributed(q) = load {
            let length = r.element_forces.iter().find(|f| f.element_id == q.element_id).map(|f| f.length);
            *span.entry(q.element_id).or_default() += q.q_xi.abs().max(q.q_xj.abs()) * span_length(q.a, q.b, length);
        }
    }
    let n: std::collections::HashMap<usize, f64> = r.element_forces.iter().map(|f| (f.element_id, compression(f.n_start, f.n_end, span.get(&f.element_id)))).collect();
    let bars = crate::ordered::values(&input.elements).map(|e| {
        let ei = input.materials.values().find(|m| m.id == e.material_id).zip(input.sections.values().find(|s| s.id == e.section_id))
            .map_or(f64::NAN, |(m, s)| m.e * 1000.0 * s.iy.min(s.iz));
        let hinged = [e.release_my_start || e.release_mz_start, e.release_my_end || e.release_mz_end];
        ScreenBar { id: e.id, ends: [e.node_i, e.node_j], frame: e.elem_type == "frame", hinged, ei_min: ei, compression: n.get(&e.id).copied().unwrap_or(0.0) }
    }).collect();
    let held = |s: &&crate::types::SolverSupport3D| s.rx && s.ry && s.rz && [s.kx, s.ky, s.kz].iter().all(Option::is_none) && s.is_inclined != Some(true);
    let model = ScreenModel {
        bars,
        position: input.nodes.values().map(|n| (n.id, [n.x, n.y, n.z])).collect(),
        supported: input.supports.values().map(|s| s.node_id).collect(),
        braced: input.supports.values().filter(held).map(|s| s.node_id).collect(),
        clamped: input.supports.values().filter(held).filter(|s| s.rrx && s.rry && s.rrz && [s.krx, s.kry, s.krz].iter().all(Option::is_none)).map(|s| s.node_id).collect(),
        other_parts: !input.constraints.is_empty() || !input.connectors.is_empty() || !input.plates.is_empty() || !input.quads.is_empty()
            || !input.quad9s.is_empty() || !input.solid_shells.is_empty() || !input.curved_shells.is_empty() || !input.curved_beams.is_empty(),
    };
    second_order(&model)
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
            ("TH-RECIPROCITY", Analysis::TimeHistory, false),
            ("MD-ORTHOGONALITY", Analysis::Modal, true),
            ("BU-ACCURACY", Analysis::Buckling, true),
        ] {
            let diagnostics = |a| if space { for_3d(&input3(), a) } else { for_2d(&input2(), a) };
            assert!(has(&diagnostics(analysis), id), "{id}");
            assert!(!has(&diagnostics(Analysis::Linear), id), "{id}");
        }
        let mut trusses = input2();
        for e in trusses.elements.values_mut() { e.elem_type = "truss".into(); }
        for analysis in [Analysis::Modal, Analysis::TimeHistory, Analysis::Harmonic] {
            assert!(has(&for_2d(&input2(), analysis), "NL-DYNAMIC-GAPS"));
            assert!(!has(&for_2d(&trusses, analysis), "NL-DYNAMIC-GAPS"));
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
        let issue_757 = |ds: &[StructuredDiagnostic]| ds.iter().any(|d| d.code == DiagnosticCode::KnownIssue && d.value == Some(757.0));
        assert!(!issue_757(&model_3d(&input)));
        input.nodes.get_mut("12").unwrap().z = 0.2;
        input.nodes.get_mut("13").unwrap().z = 0.2;
        input.nodes.get_mut("16").unwrap().z = 0.3;
        input.nodes.get_mut("17").unwrap().z = 0.3;
        assert!(!issue_757(&model_3d(&input)));
        assert!(refuse(&model_3d(&input)).is_ok());
        match crate::solver::linear::solve_3d(&input) {
            Ok(solved) => assert!(!issue_757(&solved.structured_diagnostics)),
            Err(error) => assert!(!error.contains("#757"), "{error}"),
        }
        input.solid_shells.clear();
        input.nodes.get_mut("12").unwrap().z = 0.0;
        input.nodes.get_mut("13").unwrap().z = 0.0;
        input.quads.insert("8".into(), SolverQuadElement { id: 8, nodes: [10,11,12,13], material_id: 1, thickness: 0.1 });
        assert!(!has(&model_3d(&input), "SH-MITC4-DISTORTION"));
        assert!(has(&model_3d(&input), "SH-MITC4-CONVERGENCE"));
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
    }

    #[test]
    fn known_issues_refusal_preserves_structured_identity() {
        assert!(buckling_bound(2.0, 1.99, Some(2.01)).is_ok());
        assert!(buckling_bound(2.02, 1.99, Some(2.01)).unwrap_err().contains("#741"));
        assert!(buckling_bound(1.98, 1.99, Some(2.01)).is_err());
        assert!(buckling_bound(2.0, 1.99, None).is_ok());
        for (computed, lower, upper) in [(f64::NAN, 1.99, Some(2.01)), (2.0, f64::NAN, Some(2.01)), (2.0, 1.99, Some(f64::NAN)),
            (f64::NAN, 1.99, None), (f64::INFINITY, 1.99, None), (2.0, f64::NEG_INFINITY, Some(2.01)), (2.0, 1.99, Some(f64::INFINITY)),
            (2.0, 2.01, Some(1.99))] {
            assert!(buckling_bound(computed, lower, upper).unwrap_err().contains("#741"), "{computed} {lower} {upper:?}");
        }
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
        for line in ledger.lines().filter(|l| l.starts_with("| #") && l.split('|').nth(3).is_some_and(|modes| modes.contains("WARN") || modes.contains("REFUSE"))) {
            for number in line.split('|').nth(1).unwrap().split(',') {
                contained.insert(number.trim().trim_start_matches('#').parse::<u32>().unwrap());
            }
        }
        let registered: std::collections::BTreeSet<_> = ENTRIES.iter().map(|e| e.issue).collect();
        assert_eq!(registered, contained);
        for e in ENTRIES {
            let row = ledger.lines().find(|line| line.starts_with(&format!("| #{} |", e.issue))).unwrap();
            let cells: Vec<_> = row.split('|').map(str::trim).collect();
            let ids: Vec<_> = cells[2].split(" / ").map(|id| id.trim_matches('`')).collect();
            let modes: Vec<_> = cells[3].split(" / ").collect();
            let index = ids.iter().position(|id| *id == e.id).expect("id belongs to its issue row");
            let expected = match e.mode { Mode::Warn => "WARN", Mode::Refuse => "REFUSE" };
            if ids.len() == modes.len() { assert_eq!(modes[index], expected, "{}", e.id); }
            else { assert_eq!(ids.len(), 1); assert!(modes.contains(&expected), "{}", e.id); }
        }
    }
}


pub fn with_sparse_factor_conditioning(
    k: &crate::linalg::CscMatrix,
    solve: impl FnOnce(&mut dyn FnMut(Option<&crate::linalg::sparse_chol::NumericCholesky>)) -> Option<crate::linalg::EigenResult>,
) -> (Option<crate::linalg::EigenResult>, Option<StructuredDiagnostic>) {
    let mut observed = None;
    let result = solve(&mut |factor| observed = Some(sparse_factor_conditioning(k, factor)));
    (result, observed.unwrap_or_else(|| sparse_stiffness_conditioning(k)))
}

#[cfg(test)]
mod span_tests {
    use super::*;

    fn span_frame_2d() -> SolverInput {
        serde_json::from_value(serde_json::json!({
            "nodes": {"1": {"id":1,"x":0,"z":0}, "2": {"id":2,"x":3,"z":4}, "3": {"id":3,"x":7,"z":4}, "4": {"id":4,"x":10,"z":2}},
            "materials": {"1": {"id":1,"e":200000,"nu":0.3}},
            "sections": {"1": {"id":1,"a":0.01,"iz":0.0001}, "2": {"id":2,"a":0.01,"iz":0.0002,"asY":0.004}},
            "elements": {
                "1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1},
                "2": {"id":2,"type":"frame","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":2},
                "3": {"id":3,"type":"frame","nodeI":3,"nodeJ":4,"materialId":1,"sectionId":1,"hingeStart":true}
            },
            "supports": {"1": {"id":1,"nodeId":1,"type":"fixed"}, "2": {"id":2,"nodeId":4,"type":"pinned"}},
            "loads": [
                {"type":"distributed","data":{"elementId":1,"qI":-3,"qJ":-7,"a":1,"b":4}},
                {"type":"pointOnElement","data":{"elementId":2,"a":1.5,"p":-5,"my":4}},
                {"type":"distributed","data":{"elementId":2,"qI":2,"qJ":2}},
                {"type":"pointOnElement","data":{"elementId":3,"a":2,"p":6}}
            ]
        })).unwrap()
    }

    #[test]
    fn a_member_span_rotation_follows_the_solved_moment_and_end_rotations_1506() {
        let input = span_frame_2d();
        let r = crate::solver::linear::solve_2d(&input).unwrap();
        let ry = |id: usize| r.displacements.iter().find(|d| d.node_id == id).unwrap().ry;
        let planes = span_planes_2d(&member_spans_2d(&input, &input.loads), &r);
        assert_eq!(planes.iter().map(|p| p.0).collect::<Vec<_>>(), vec![1, 2, 3]);
        for (id, l, plane) in &planes {
            let ef = r.element_forces.iter().find(|f| f.element_id == *id).unwrap();
            let e = &input.elements[&id.to_string()];
            for k in 0..=40 {
                let t = k as f64 / 40.0;
                let diagram = crate::postprocess::diagrams::compute_diagram_value_at("moment", t, ef);
                assert!((plane.moment(t * l) + diagram).abs() < 1e-9 * (1.0 + diagram.abs()), "element {id} t {t}: {} vs {diagram}", plane.moment(t * l));
            }
            if !e.hinge_start {
                assert!((plane.at(0.0) - ry(e.node_i)).abs() < 1e-12, "element {id}");
            }
            assert!((plane.at(*l) - ry(e.node_j)).abs() < 1e-9 * ry(e.node_j).abs().max(1e-12), "element {id}: {} vs {}", plane.at(*l), ry(e.node_j));
        }
    }

    #[test]
    fn a_member_span_rotation_matches_the_fixed_ended_closed_form_1506() {
        use crate::postprocess::diagrams::SpanRotation;
        let (l, ei, q) = (2.0, 3.0e4, -9.0);
        let plane = SpanRotation::new(l, ei, 0.0, 0.0, 0.0, 0.0, 0.0, false, false, Vec::new(), vec![(q, q, 0.0, l)], Vec::new(), 0.0);
        for k in 0..=20 {
            let x = l * k as f64 / 20.0;
            let exact = q * x * (l - x) * (l - 2.0 * x) / (12.0 * ei);
            assert!((plane.at(x) - exact).abs() < 1e-15, "x {x}: {} vs {exact}", plane.at(x));
        }
        let largest = largest_span_rotation(l, std::slice::from_ref(&plane), (0.0, 0.0));
        let exact = q.abs() * l.powi(3) / (72.0 * 3f64.sqrt() * ei);
        assert!((largest - exact).abs() < 1e-12 * exact, "{largest} vs {exact}");
    }

    #[test]
    fn a_3d_member_span_rotation_follows_the_solved_moments_and_end_rotations_1506() {
        let input: SolverInput3D = serde_json::from_value(serde_json::json!({
            "nodes": {"1": {"id":1,"x":0,"y":0,"z":0}, "2": {"id":2,"x":3,"y":1,"z":4}, "3": {"id":3,"x":7,"y":-1,"z":4}},
            "materials": {"1": {"id":1,"e":200000,"nu":0.3}},
            "sections": {"1": {"id":1,"a":0.01,"iy":0.0001,"iz":0.0003,"j":0.00005}, "2": {"id":2,"a":0.01,"iy":0.0002,"iz":0.0001,"j":0.00005,"asY":0.004,"asZ":0.005}},
            "elements": {
                "1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1},
                "2": {"id":2,"type":"frame","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":2,"releaseMyEnd":true,"releaseMzEnd":true}
            },
            "supports": {"1": {"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}, "2": {"nodeId":3,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":false,"rrz":false}},
            "loads": [
                {"type":"distributed","data":{"elementId":1,"qYI":-3,"qYJ":-7,"qZI":2,"qZJ":5,"a":1,"b":4}},
                {"type":"pointOnElement","data":{"elementId":2,"a":1.5,"py":-5,"pz":4}},
                {"type":"distributed","data":{"elementId":2,"qYI":2,"qYJ":2,"qZI":-1,"qZJ":-1}},
                {"type":"nodal","data":{"nodeId":2,"fx":1,"fy":2,"fz":-3,"mx":0.5,"my":1,"mz":-2}}
            ]
        })).unwrap();
        let r = crate::solver::linear::solve_3d(&input).unwrap();
        let planes = span_planes_3d(&member_spans_3d(&input, &input.loads), &r);
        assert_eq!(planes.iter().map(|p| p.0).collect::<Vec<_>>(), vec![1, 2]);
        for (id, l, [y, z], _) in &planes {
            let ef = r.element_forces.iter().find(|f| f.element_id == *id).unwrap();
            let e = &input.elements[&id.to_string()];
            for k in 0..=40 {
                let t = k as f64 / 40.0;
                for (plane, kind) in [(y, "momentZ"), (z, "momentY")] {
                    let diagram = crate::postprocess::diagrams_3d::evaluate_diagram_3d_at(ef, kind, t);
                    assert!((plane.moment(t * l).abs() - diagram.abs()).abs() < 1e-9 * (1.0 + diagram.abs()), "element {id} {kind} t {t}: {} vs {diagram}", plane.moment(t * l));
                }
            }
            let (a, b) = (&input.nodes[&e.node_i.to_string()], &input.nodes[&e.node_j.to_string()]);
            let (_, ey, ez) = crate::element::compute_local_axes_3d(a.x, a.y, a.z, b.x, b.y, b.z, None, None, None, None, false);
            let rot = |id: usize| { let d = r.displacements.iter().find(|d| d.node_id == id).unwrap(); [d.rx, d.ry, d.rz] };
            let dot = |u: [f64; 3], v: [f64; 3]| u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
            assert!((y.at(0.0) - dot(ez, rot(e.node_i))).abs() < 1e-12 && (z.at(0.0) + dot(ey, rot(e.node_i))).abs() < 1e-12, "element {id}");
            if !e.release_mz_end {
                assert!((y.at(*l) - dot(ez, rot(e.node_j))).abs() < 1e-9 * dot(ez, rot(e.node_j)).abs().max(1e-12), "element {id}");
                assert!((z.at(*l) + dot(ey, rot(e.node_j))).abs() < 1e-9 * dot(ey, rot(e.node_j)).abs().max(1e-12), "element {id}");
            }
        }
    }

    fn dense_largest(l: f64, planes: &[crate::postprocess::diagrams::SpanRotation], twist: (f64, f64), from: f64, to: f64) -> f64 {
        let dx = 1e-7 * l;
        (0..=200_000).map(|k| from + (to - from) * k as f64 / 200_000.0).map(|x| {
            let t = twist.0 + (twist.1 - twist.0) * x / l;
            let turn = |p: &crate::postprocess::diagrams::SpanRotation| {
                let (lo, hi) = ((x - dx).max(0.0), (x + dx).min(l));
                p.at(x).abs().max(((p.deflection(hi) - p.deflection(lo)) / (hi - lo)).abs())
            };
            (t * t + planes.iter().map(|p| turn(p).powi(2)).sum::<f64>()).sqrt()
        }).fold(0.0, f64::max)
    }

    #[test]
    fn a_rotation_peak_between_two_moment_zeros_inside_one_interval_is_found_1506() {
        use crate::postprocess::diagrams::SpanRotation;
        for scale in [1.0, 1.0 + 1e-13, 1.0 - 3e-14, 0.999_999_9, 1.000_000_7] {
            let (q, h) = (1.6e7 * scale, 0.01);
            let c0 = q * h * h / 12.0;
            let plane = SpanRotation::new(1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, true, true, vec![(0.5, -q * h / 2.0), (0.5 + h, -q * h / 2.0)], vec![(q, q, 0.5, 0.5 + h)], vec![(0.5, -c0), (0.5 + h, c0)], 0.0);
            assert!(plane.moment(0.5 + 1e-9) > 0.0 && plane.moment(0.5 + h - 1e-9) > 0.0 && plane.moment(0.5 + h / 2.0) < 0.0, "the moment is positive at both ends of the interval and negative inside");
            let stations = (0..=SPAN_STATIONS).map(|k| k as f64 / SPAN_STATIONS as f64).chain([0.5 + h]);
            assert!(stations.map(|x| plane.at(x).abs()).fold(0.0, f64::max) < 0.1);
            let dense = dense_largest(1.0, std::slice::from_ref(&plane), (0.0, 0.0), 0.5, 0.5 + h);
            assert!(dense > 0.1, "{dense}");
            let largest = largest_span_rotation(1.0, std::slice::from_ref(&plane), (0.0, 0.0));
            assert!((largest - dense).abs() < 1e-6 * dense, "{scale}: {largest} vs {dense}");
        }
    }

    #[test]
    fn the_largest_span_rotation_bounds_the_rotation_vector_tightly_1506() {
        use crate::postprocess::diagrams::SpanRotation;
        let y = SpanRotation::new(3.0, 2e4, 0.0, 0.0, 0.0, 0.0, 0.0, false, false, Vec::new(), vec![(-4e5, -1e5, 0.0, 3.0)], Vec::new(), 0.0);
        let z = SpanRotation::new(3.0, 1e4, 2e-6, 0.01, 0.02, -0.03, 0.0, false, true, vec![(1.0, 3e4)], vec![(2e4, 2e4, 1.2, 2.7)], Vec::new(), 0.0);
        let planes = [y, z];
        let twist = (0.03, -0.05);
        let dense = dense_largest(3.0, &planes, twist, 0.0, 3.0);
        let largest = largest_span_rotation(3.0, &planes, twist);
        assert!(largest >= dense && largest <= dense * 1.01, "{largest} vs {dense}");
    }

    #[test]
    fn the_axis_slope_of_a_shear_flexible_span_is_its_deflection_slope_on_both_sides_of_a_load_1569() {
        use crate::postprocess::diagrams::SpanRotation;
        let (l, ei, f, p) = (1.0, 2e8, 1.0 / 76.923, -20.0);
        let plane = SpanRotation::new(l, ei, f, 0.0, 0.0, 0.0, 0.0, false, false, vec![(0.5, p)], Vec::new(), Vec::new(), 0.0);
        for x in [0.1, 0.3, 0.49, 0.51, 0.7, 0.9] {
            let numeric = (plane.deflection(x + 1e-6) - plane.deflection(x - 1e-6)) / 2e-6;
            assert!((numeric.abs() - 10.0 * f).abs() < 1e-6, "x {x}: {numeric}");
        }
        assert!(plane.at(0.25).abs() < 1e-6);
        let largest = largest_span_rotation(l, std::slice::from_ref(&plane), (0.0, 0.0));
        assert!((largest - 10.0 * f).abs() < 1e-6 * largest, "{largest}");
    }

    fn propped_thermal_2d(split: bool) -> (SolverInput, AnalysisResults) {
        let thermal = |id: usize| serde_json::json!({"type":"thermal","data":{"elementId":id,"dtUniform":0,"dtGradient":30,"alpha":1.2e-5,"depth":0.3}});
        let (nodes, elements, loads) = if split {
            (serde_json::json!({"1": {"id":1,"x":0,"z":0}, "2": {"id":2,"x":3,"z":1}, "3": {"id":3,"x":1.5,"z":0.5}}),
             serde_json::json!({"1": {"id":1,"type":"frame","nodeI":1,"nodeJ":3,"materialId":1,"sectionId":1}, "2": {"id":2,"type":"frame","nodeI":3,"nodeJ":2,"materialId":1,"sectionId":1,"hingeEnd":true}}),
             serde_json::json!([thermal(1), thermal(2)]))
        } else {
            (serde_json::json!({"1": {"id":1,"x":0,"z":0}, "2": {"id":2,"x":3,"z":1}}),
             serde_json::json!({"1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"hingeEnd":true}}),
             serde_json::json!([thermal(1)]))
        };
        let input: SolverInput = serde_json::from_value(serde_json::json!({
            "nodes": nodes, "materials": {"1": {"id":1,"e":200000,"nu":0.3}}, "sections": {"1": {"id":1,"a":0.01,"iz":1e-4}},
            "elements": elements, "supports": {"1": {"id":1,"nodeId":1,"type":"fixed"}, "2": {"id":2,"nodeId":2,"type":"fixed"}}, "loads": loads
        })).unwrap();
        let r = crate::solver::linear::solve_2d(&input).unwrap();
        (input, r)
    }

    #[test]
    fn a_thermal_curvature_at_a_hinge_follows_the_propped_closed_form_and_the_split_member_1569() {
        let (input, r) = propped_thermal_2d(false);
        let planes = span_planes_2d(&member_spans_2d(&input, &input.loads), &r);
        let (_, l, plane) = &planes[0];
        let kappa = 1.2e-5 * 30.0 / 0.3;
        let (split_input, split) = propped_thermal_2d(true);
        let mid = split.displacements.iter().find(|d| d.node_id == 3).unwrap().ry;
        assert!((plane.at(l / 2.0) - mid).abs() < 1e-12, "{} vs the split member's node {mid}", plane.at(l / 2.0));
        let sense = mid / (-kappa * l / 16.0);
        assert!((sense.abs() - 1.0).abs() < 1e-9, "the split member turns its middle node by κL/16: {mid}");
        for k in 0..=20 {
            let x = l * k as f64 / 20.0;
            let exact = sense * kappa * (-x / 2.0 + 3.0 * x * x / (4.0 * l));
            assert!((plane.at(x) - exact).abs() < 1e-12, "x {x}: {} vs {exact}", plane.at(x));
        }
        let halves = span_planes_2d(&member_spans_2d(&split_input, &split_input.loads), &split);
        assert!((halves[1].2.at(halves[1].1) - plane.at(*l)).abs() < 1e-12, "both models turn the hinge end alike");
    }

    fn propped_thermal_3d(split: bool, dy: f64, dz: f64) -> (SolverInput3D, AnalysisResults3D) {
        let thermal = |id: usize| serde_json::json!({"type":"thermal","data":{"elementId":id,"dtUniform":0,"dtGradientY":dy,"dtGradientZ":dz,"alpha":1.2e-5,"depthY":0.3,"depthZ":0.2}});
        let held = serde_json::json!({"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true});
        let mut a = held.clone(); a["nodeId"] = 1.into();
        let mut b = held; b["nodeId"] = 2.into();
        let (nodes, elements, loads) = if split {
            (serde_json::json!({"1": {"id":1,"x":0,"y":0,"z":0}, "2": {"id":2,"x":2,"y":1,"z":2}, "3": {"id":3,"x":1,"y":0.5,"z":1}}),
             serde_json::json!({"1": {"id":1,"type":"frame","nodeI":1,"nodeJ":3,"materialId":1,"sectionId":1}, "2": {"id":2,"type":"frame","nodeI":3,"nodeJ":2,"materialId":1,"sectionId":1,"releaseMyEnd":true,"releaseMzEnd":true}}),
             serde_json::json!([thermal(1), thermal(2)]))
        } else {
            (serde_json::json!({"1": {"id":1,"x":0,"y":0,"z":0}, "2": {"id":2,"x":2,"y":1,"z":2}}),
             serde_json::json!({"1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"releaseMyEnd":true,"releaseMzEnd":true}}),
             serde_json::json!([thermal(1)]))
        };
        let input: SolverInput3D = serde_json::from_value(serde_json::json!({
            "nodes": nodes, "materials": {"1": {"id":1,"e":200000,"nu":0.3}}, "sections": {"1": {"id":1,"a":0.01,"iy":2e-4,"iz":1e-4,"j":1e-4}},
            "elements": elements, "supports": {"1": a, "2": b}, "loads": loads
        })).unwrap();
        let r = crate::solver::linear::solve_3d(&input).unwrap();
        (input, r)
    }

    #[test]
    fn a_3d_thermal_curvature_at_a_release_follows_the_split_member_in_both_planes_1569() {
        for (dy, dz) in [(30.0, 0.0), (0.0, 30.0), (-20.0, 45.0)] {
            let (input, r) = propped_thermal_3d(false, dy, dz);
            let (_, l, [y, z], _) = &span_planes_3d(&member_spans_3d(&input, &input.loads), &r)[0];
            let (split_input, split) = propped_thermal_3d(true, dy, dz);
            let (_, _, [sy, sz], _) = &span_planes_3d(&member_spans_3d(&split_input, &split_input.loads), &split)[1];
            assert!((y.at(l / 2.0) - sy.at(0.0)).abs() < 1e-12 && (z.at(l / 2.0) - sz.at(0.0)).abs() < 1e-12, "dy {dy} dz {dz}: {} {} vs {} {}", y.at(l / 2.0), z.at(l / 2.0), sy.at(0.0), sz.at(0.0));
            let (ky, kz) = (1.2e-5 * dy / 0.3, 1.2e-5 * dz / 0.2);
            assert!((y.at(*l).abs() - ky.abs() * l / 4.0).abs() < 1e-12 && (z.at(*l).abs() - kz.abs() * l / 4.0).abs() < 1e-12, "dy {dy} dz {dz}");
            assert!((y.at(l / 2.0).abs() - ky.abs() * l / 16.0).abs() < 1e-12 && (z.at(l / 2.0).abs() - kz.abs() * l / 16.0).abs() < 1e-12, "dy {dy} dz {dz}");
        }
    }

    #[test]
    fn a_couple_at_a_released_end_turns_it_as_the_propped_closed_form_1569() {
        use crate::postprocess::diagrams::SpanRotation;
        let (l, ei, c) = (2.0, 3.0e4, 600.0);
        let exact = SpanRotation::new(l, ei, 0.0, 0.0, 0.0, 0.0, 0.0, false, true, Vec::new(), Vec::new(), vec![(l, c)], 0.0);
        let near = SpanRotation::new(l, ei, 0.0, 0.0, 0.0, 0.0, 0.0, false, true, Vec::new(), Vec::new(), vec![(l * (1.0 - 1e-12), c)], 0.0);
        assert!((exact.at(l).abs() - c * l / (4.0 * ei)).abs() < 1e-12, "{}", exact.at(l));
        for k in 0..=10 {
            let x = l * k as f64 / 10.0;
            assert!((exact.at(x) - near.at(x)).abs() < 1e-9 * c * l / ei, "x {x}: {} vs {}", exact.at(x), near.at(x));
        }
    }

    #[test]
    fn a_solved_couple_at_a_released_end_follows_the_solved_moment_1569() {
        let input: SolverInput = serde_json::from_value(serde_json::json!({
            "nodes": {"1": {"id":1,"x":0,"z":0}, "2": {"id":2,"x":2,"z":0}},
            "materials": {"1": {"id":1,"e":200000,"nu":0.3}}, "sections": {"1": {"id":1,"a":0.01,"iz":1e-4}},
            "elements": {"1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"hingeEnd":true}},
            "supports": {"1": {"id":1,"nodeId":1,"type":"fixed"}, "2": {"id":2,"nodeId":2,"type":"fixed"}},
            "loads": [{"type":"pointOnElement","data":{"elementId":1,"a":2.0,"p":0,"my":600}}]
        })).unwrap();
        let r = crate::solver::linear::solve_2d(&input).unwrap();
        let (_, l, plane) = &span_planes_2d(&member_spans_2d(&input, &input.loads), &r)[0];
        let ef = &r.element_forces[0];
        for k in 0..40 {
            let t = k as f64 / 40.0;
            let diagram = crate::postprocess::diagrams::compute_diagram_value_at("moment", t, ef);
            assert!((plane.moment(t * l) + diagram).abs() < 1e-9 * (1.0 + diagram.abs()), "t {t}: {} vs {diagram}", plane.moment(t * l));
        }
        assert!((plane.at(*l).abs() - 600.0 * l / (4.0 * 2e4)).abs() < 1e-12, "{}", plane.at(*l));
    }

    #[test]
    fn cubic_roots_without_a_quadratic_term_are_found_1569() {
        let roots = cubic_roots_in_unit([0.1, -0.75, 0.0, 1.0]);
        assert_eq!(roots.len(), 2, "{roots:?}");
        for r in roots {
            assert!((0.1 - 0.75 * r + r * r * r).abs() < 1e-12, "{r}");
        }
        let pair = cubic_roots_in_unit([-0.16, 0.84, 0.0, -1.0]);
        assert!(pair.len() == 2 && (pair[0] - 0.2).abs() < 1e-12 && (pair[1] - 0.8).abs() < 1e-12, "{pair:?}");
    }

    #[test]
    fn cubic_roots_in_the_unit_interval_include_both_of_a_close_pair_1506() {
        let roots = cubic_roots_in_unit([-0.18, 1.46, -3.2, 2.0]);
        let expected = [0.2, 0.5, 0.9];
        assert_eq!(roots.len(), 3, "{roots:?}");
        for (r, e) in roots.iter().zip(expected) {
            assert!((r - e).abs() < 1e-12, "{roots:?}");
        }
        let pair = cubic_roots_in_unit([0.24, -1.0, 1.0, 0.0]);
        assert!(pair.len() == 2 && (pair[0] - 0.4).abs() < 1e-12 && (pair[1] - 0.6).abs() < 1e-12, "{pair:?}");
        for tiny in [1e-16, -1e-16, 1e-300, 1e-8] {
            let nearly = cubic_roots_in_unit([0.16, -1.0, 1.0, tiny]);
            assert!(nearly.len() == 2 && (nearly[0] - 0.2).abs() < 1e-7 && (nearly[1] - 0.8).abs() < 1e-7, "{tiny:e}: {nearly:?}");
        }
    }
}
