//! Model features an analysis does not implement, refused by name.
//!
//! Every analysis builds its own matrices, and several were written for a
//! subset of the model: a connector, a prescribed support displacement or an
//! inclined support that one of them does not assemble used to be dropped
//! without a word, and the analysis answered for a different structure. An
//! analysis that cannot honour a feature now says so at its entry point,
//! naming the feature and where it is in the model. The support of every
//! (feature, analysis) pair is tested in `tests/feature_matrix.rs` and listed
//! in `docs/verification/FEATURE_MATRIX.md`.

use crate::types::*;

/// A model feature some analysis may not implement.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Feature {
    /// Connector (spring) elements.
    Connectors,
    /// Prescribed support displacements (settlements, imposed rotations).
    PrescribedDisplacements,
    /// Inclined supports (2D `inclinedRoller`, 3D `isInclined`).
    InclinedSupports,
    /// Members with a shear area (Timoshenko shear deformation).
    ShearDeformation,
    /// Member end releases (hinges).
    MomentReleases,
    /// Rotational support springs.
    RotationalSprings,
    /// Support springs of any kind.
    SupportSprings,
    /// Constraints (rigid links, diaphragms, EqualDOF, MPCs).
    Constraints,
    /// Warping (7th DOF) members.
    Warping,
    /// Shell elements (plates, quads, quad9, solid and curved shells).
    Shells,
    /// Curved beams.
    CurvedBeams,
    /// Thermal loads.
    ThermalLoads,
    /// Thermal loads on plates, quad9 and curved shells (whose geometric
    /// stiffness is computed from the total strain).
    ShellThermalNonQuad,
}

impl Feature {
    fn describe(self) -> &'static str {
        match self {
            Feature::Connectors => "connector elements",
            Feature::PrescribedDisplacements => "prescribed support displacements",
            Feature::InclinedSupports => "inclined supports",
            Feature::ShearDeformation => "shear deformation (Timoshenko shear areas)",
            Feature::MomentReleases => "member end releases (hinges)",
            Feature::RotationalSprings => "rotational support springs",
            Feature::SupportSprings => "support springs",
            Feature::Constraints => "constraints (rigid links, diaphragms, EqualDOF, MPCs)",
            Feature::Warping => "warping members",
            Feature::Shells => "shell elements",
            Feature::CurvedBeams => "curved beams",
            Feature::ThermalLoads => "thermal loads",
            Feature::ShellThermalNonQuad => "thermal loads on plates, quad9 or curved shells",
        }
    }
}

fn nonzero(v: Option<f64>) -> bool {
    v.is_some_and(|x| x != 0.0)
}

fn sorted<T: Clone, K: Ord>(items: impl Iterator<Item = T>, key: impl Fn(&T) -> K) -> Vec<T> {
    let mut v: Vec<T> = items.collect();
    v.sort_by_key(|x| key(x));
    v
}

/// Where a feature occurs in a 2D model (a short list of ids), or `None`.
fn find_2d(input: &SolverInput, f: Feature) -> Option<String> {
    let found: Vec<String> = match f {
        Feature::Connectors => sorted(input.connectors.values(), |c| c.id).iter().map(|c| format!("connector {}", c.id)).collect(),
        Feature::PrescribedDisplacements => sorted(input.supports.values(), |s| s.id)
            .iter()
            .filter(|s| nonzero(s.dx) || nonzero(s.dz) || nonzero(s.dry))
            .map(|s| format!("support {} (node {})", s.id, s.node_id))
            .collect(),
        Feature::InclinedSupports => sorted(input.supports.values(), |s| s.id)
            .iter()
            .filter(|s| s.support_type == "inclinedRoller")
            .map(|s| format!("support {} (node {})", s.id, s.node_id))
            .collect(),
        Feature::ShearDeformation => {
            let secs: std::collections::HashSet<usize> =
                input.sections.values().filter(|s| s.as_y.is_some_and(|a| a > 0.0)).map(|s| s.id).collect();
            sorted(input.elements.values(), |e| e.id)
                .iter()
                .filter(|e| e.elem_type == "frame" && secs.contains(&e.section_id))
                .map(|e| format!("member {}", e.id))
                .collect()
        }
        Feature::MomentReleases => sorted(input.elements.values(), |e| e.id)
            .iter()
            .filter(|e| e.elem_type == "frame" && (e.hinge_start || e.hinge_end))
            .map(|e| format!("member {}", e.id))
            .collect(),
        Feature::RotationalSprings => sorted(input.supports.values(), |s| s.id)
            .iter()
            .filter(|s| s.kz.is_some_and(|k| k > 0.0))
            .map(|s| format!("support {} (node {})", s.id, s.node_id))
            .collect(),
        Feature::SupportSprings => sorted(input.supports.values(), |s| s.id)
            .iter()
            .filter(|s| [s.kx, s.ky, s.kz].into_iter().any(|k| k.is_some_and(|k| k > 0.0)))
            .map(|s| format!("support {} (node {})", s.id, s.node_id))
            .collect(),
        Feature::Constraints => (0..input.constraints.len()).map(|i| format!("constraint {}", i + 1)).collect(),
        Feature::ThermalLoads => input
            .loads
            .iter()
            .filter_map(|l| if let SolverLoad::Thermal(t) = l { Some(format!("member {}", t.element_id)) } else { None })
            .collect(),
        Feature::Warping | Feature::Shells | Feature::CurvedBeams | Feature::ShellThermalNonQuad => vec![],
    };
    summarize(found)
}

/// Where a feature occurs in a 3D model (a short list of ids), or `None`.
fn find_3d(input: &SolverInput3D, f: Feature) -> Option<String> {
    let found: Vec<String> = match f {
        Feature::Connectors => sorted(input.connectors.values(), |c| c.id).iter().map(|c| format!("connector {}", c.id)).collect(),
        Feature::PrescribedDisplacements => sorted(input.supports.values(), |s| s.node_id)
            .iter()
            .filter(|s| [s.dx, s.dy, s.dz, s.drx, s.dry, s.drz].into_iter().any(nonzero))
            .map(|s| format!("support at node {}", s.node_id))
            .collect(),
        Feature::InclinedSupports => sorted(input.supports.values(), |s| s.node_id)
            .iter()
            .filter(|s| s.is_inclined.unwrap_or(false))
            .map(|s| format!("support at node {}", s.node_id))
            .collect(),
        Feature::ShearDeformation => {
            let secs: std::collections::HashSet<usize> = input
                .sections
                .values()
                .filter(|s| s.as_y.is_some_and(|a| a > 0.0) || s.as_z.is_some_and(|a| a > 0.0))
                .map(|s| s.id)
                .collect();
            sorted(input.elements.values(), |e| e.id)
                .iter()
                .filter(|e| e.elem_type != "truss" && e.elem_type != "cable" && secs.contains(&e.section_id))
                .map(|e| format!("member {}", e.id))
                .collect()
        }
        Feature::MomentReleases => sorted(input.elements.values(), |e| e.id)
            .iter()
            .filter(|e| {
                e.elem_type != "truss"
                    && e.elem_type != "cable"
                    && (e.release_my_start || e.release_my_end || e.release_mz_start || e.release_mz_end || e.release_t_start || e.release_t_end)
            })
            .map(|e| format!("member {}", e.id))
            .collect(),
        Feature::RotationalSprings => sorted(input.supports.values(), |s| s.node_id)
            .iter()
            .filter(|s| [s.krx, s.kry, s.krz].into_iter().any(|k| k.is_some_and(|k| k > 0.0)))
            .map(|s| format!("support at node {}", s.node_id))
            .collect(),
        Feature::SupportSprings => sorted(input.supports.values(), |s| s.node_id)
            .iter()
            .filter(|s| [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz, s.kw].into_iter().any(|k| k.is_some_and(|k| k > 0.0)))
            .map(|s| format!("support at node {}", s.node_id))
            .collect(),
        Feature::Constraints => (0..input.constraints.len()).map(|i| format!("constraint {}", i + 1)).collect(),
        Feature::Warping => {
            let secs: std::collections::HashSet<usize> =
                input.sections.values().filter(|s| s.cw.is_some_and(|c| c > 0.0)).map(|s| s.id).collect();
            sorted(input.elements.values(), |e| e.id)
                .iter()
                .filter(|e| secs.contains(&e.section_id))
                .map(|e| format!("member {}", e.id))
                .collect()
        }
        Feature::Shells => {
            let mut v: Vec<String> = Vec::new();
            v.extend(sorted(input.plates.values(), |p| p.id).iter().map(|p| format!("plate {}", p.id)));
            v.extend(sorted(input.quads.values(), |p| p.id).iter().map(|p| format!("quad {}", p.id)));
            v.extend(sorted(input.quad9s.values(), |p| p.id).iter().map(|p| format!("quad9 {}", p.id)));
            v.extend(sorted(input.solid_shells.values(), |p| p.id).iter().map(|p| format!("solid shell {}", p.id)));
            v.extend(sorted(input.curved_shells.values(), |p| p.id).iter().map(|p| format!("curved shell {}", p.id)));
            v
        }
        Feature::CurvedBeams => (0..input.curved_beams.len()).map(|i| format!("curved beam {}", i + 1)).collect(),
        Feature::ShellThermalNonQuad => input
            .loads
            .iter()
            .filter_map(|l| match l {
                SolverLoad3D::PlateThermal(t) | SolverLoad3D::Quad9Thermal(t) | SolverLoad3D::CurvedShellThermal(t) => {
                    Some(format!("shell {}", t.element_id))
                }
                _ => None,
            })
            .collect(),
        Feature::ThermalLoads => input
            .loads
            .iter()
            .filter_map(|l| match l {
                SolverLoad3D::Thermal(t) => Some(format!("member {}", t.element_id)),
                SolverLoad3D::PlateThermal(t) | SolverLoad3D::QuadThermal(t) | SolverLoad3D::Quad9Thermal(t) | SolverLoad3D::CurvedShellThermal(t) => {
                    Some(format!("shell {}", t.element_id))
                }
                _ => None,
            })
            .collect(),
    };
    summarize(found)
}

fn summarize(found: Vec<String>) -> Option<String> {
    match found.len() {
        0 => None,
        1..=3 => Some(found.join(", ")),
        n => Some(format!("{}, … ({} in all)", found[..3].join(", "), n)),
    }
}

fn refusal(analysis: &str, f: Feature, at: &str) -> String {
    format!(
        "{analysis} does not support {} ({at}); it would solve the model without them. \
         Remove them or use an analysis that supports them.",
        f.describe()
    )
}

/// Refuse a 2D model that uses any of `unsupported` in `analysis`.
pub fn refuse_2d(input: &SolverInput, analysis: &str, unsupported: &[Feature]) -> Result<(), String> {
    for &f in unsupported {
        if let Some(at) = find_2d(input, f) {
            return Err(refusal(analysis, f, &at));
        }
    }
    Ok(())
}

/// Refuse a 3D model that uses any of `unsupported` in `analysis`.
pub fn refuse_3d(input: &SolverInput3D, analysis: &str, unsupported: &[Feature]) -> Result<(), String> {
    for &f in unsupported {
        if let Some(at) = find_3d(input, f) {
            return Err(refusal(analysis, f, &at));
        }
    }
    Ok(())
}
