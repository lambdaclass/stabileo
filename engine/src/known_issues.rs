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
}

fn hit(id: &str, issue: u32, message: &str) -> StructuredDiagnostic {
    let mut d = StructuredDiagnostic::global(DiagnosticCode::KnownIssue, Severity::Warning, format!("{message} (known issue #{issue}, {id}; being fixed)"));
    d.phase = Some(id.to_string());
    d.value = Some(issue as f64);
    d
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
        Analysis::MaterialNonlinear => vec![hit("NL-5", 428, NL_MATERIAL)],
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

const WARPED_SHELL: &str = "MITC4 and MITC9 shell elements on warped geometry are too flexible; use curved shells or flat elements";

/// Element warping ratio threshold (0.1%) beyond which MITC4/MITC9 shells are flagged
/// as non-conservatively over-flexible (#1057).
pub const WARPED_SHELL_THRESHOLD: f64 = 0.001;

fn quad_coords(nodes: &[usize; 4], xyz: &std::collections::HashMap<usize, [f64; 3]>) -> Option<[[f64; 3]; 4]> {
    let mut c = [[0.0; 3]; 4];
    for (i, &nid) in nodes.iter().enumerate() {
        c[i] = *xyz.get(&nid)?;
    }
    Some(c)
}

fn quad9_coords(nodes: &[usize; 9], xyz: &std::collections::HashMap<usize, [f64; 3]>) -> Option<[[f64; 3]; 9]> {
    let mut c = [[0.0; 3]; 9];
    for (i, &nid) in nodes.iter().enumerate() {
        c[i] = *xyz.get(&nid)?;
    }
    Some(c)
}

/// The warnings a 3D model carries whatever its loads: warped MITC4/MITC9 shells (#1057).
pub fn model_3d(input: &SolverInput3D) -> Vec<StructuredDiagnostic> {
    let mut out = Vec::new();
    let xyz: std::collections::HashMap<usize, [f64; 3]> = crate::ordered::values(&input.nodes)
        .map(|n| (n.id, [n.x, n.y, n.z]))
        .collect();

    let mut warped_quads = Vec::new();
    for q in crate::ordered::values(&input.quads) {
        if let Some(coords) = quad_coords(&q.nodes, &xyz) {
            if crate::element::quad::quad_quality_metrics(&coords).warping > WARPED_SHELL_THRESHOLD {
                warped_quads.push(q.id);
            }
        }
    }
    if !warped_quads.is_empty() {
        let mut d = hit("SH-WARP", 1057, WARPED_SHELL);
        d.element_ids = warped_quads;
        d.element_kind = Some(ElementKind::Quad);
        out.push(d);
    }

    let mut warped_quad9s = Vec::new();
    for q in crate::ordered::values(&input.quad9s) {
        if let Some(coords) = quad9_coords(&q.nodes, &xyz) {
            if crate::element::quad9::quad9_quality_metrics(&coords).warping > WARPED_SHELL_THRESHOLD {
                warped_quad9s.push(q.id);
            }
        }
    }
    if !warped_quad9s.is_empty() {
        let mut d = hit("SH-WARP", 1057, WARPED_SHELL);
        d.element_ids = warped_quad9s;
        d.element_kind = Some(ElementKind::Quad9);
        out.push(d);
    }

    out
}

/// The known-issue warnings that apply to a 2D result of `analysis` on `input`.
pub fn for_2d(input: &SolverInput, analysis: Analysis) -> Vec<StructuredDiagnostic> {
    let mut out = for_analysis(analysis);
    out.extend(loads_2d(&input.loads));
    out
}

/// The known-issue warnings that apply to a 3D result of `analysis` on `input`.
pub fn for_3d(input: &SolverInput3D, analysis: Analysis) -> Vec<StructuredDiagnostic> {
    let mut out = for_analysis(analysis);
    out.extend(model_3d(input));
    out.extend(loads_3d(&input.loads));
    out
}

/// Add warnings to a result's diagnostics, once each: a path that already attached a finding
/// (a prepared solve under the solve that called it) does not repeat it.
pub fn attach(target: &mut Vec<StructuredDiagnostic>, new: Vec<StructuredDiagnostic>) {
    for d in new {
        let seen = target.iter().any(|t| t.code == d.code && t.phase == d.phase && t.element_kind == d.element_kind);
        if !seen {
            target.push(d);
        }
    }
}


