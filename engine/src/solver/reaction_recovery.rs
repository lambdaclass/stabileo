use super::{
    assembly::{InclinedTransformData, InclinedTransformData2D},
    constraints::FreeConstraintSystem,
    dof::DofNumbering,
    linear,
};
use crate::types::*;

pub(crate) struct RecoveredForces {
    restrained: Vec<f64>,
    pub constraint_forces: Vec<ConstraintForce>,
}

impl RecoveredForces {
    pub fn from_internal(
        internal: &[f64],
        applied: &[f64],
        dofs: &DofNumbering,
        cs: Option<&FreeConstraintSystem>,
    ) -> Self {
        assert_eq!(internal.len(), dofs.n_total);
        assert_eq!(applied.len(), dofs.n_total);
        let residual: Vec<f64> = internal.iter().zip(applied).map(|(i, e)| i - e).collect();
        Self::from_residual(&residual, dofs, cs)
    }

    pub fn from_residual(
        residual: &[f64],
        dofs: &DofNumbering,
        cs: Option<&FreeConstraintSystem>,
    ) -> Self {
        assert_eq!(residual.len(), dofs.n_total);
        let mut restrained = residual[dofs.n_free..].to_vec();
        let constraint_forces = cs.map_or_else(Vec::new, |cs| {
            let raw = cs.constraint_forces_from_residual(&residual[..dofs.n_free]);
            cs.add_restrained_master_forces(&raw, &mut restrained);
            cs.constraint_forces(&raw, dofs)
        });
        Self {
            restrained,
            constraint_forces,
        }
    }

    pub fn reactions_2d(
        &self,
        input: &SolverInput,
        dofs: &DofNumbering,
        u_global: &[f64],
        its: &[InclinedTransformData2D],
    ) -> Result<Vec<Reaction>, String> {
        check_restraints(dofs, crate::ordered::values(&input.supports).flat_map(|s| {
            super::support::support_dofs_2d(s).into_iter().enumerate().filter_map(move |(k, d)| d.restrained.then_some((s.node_id, k)))
        }))?;
        let mut r = linear::build_reactions_2d_inclined(
            input,
            dofs,
            &self.restrained,
            &[],
            dofs.n_free,
            u_global,
            its,
        );
        r.sort_by_key(|r| r.node_id);
        Ok(r)
    }

    pub fn reactions_3d(
        &self,
        input: &SolverInput3D,
        dofs: &DofNumbering,
        u_global: &[f64],
        its: &[InclinedTransformData],
    ) -> Result<Vec<Reaction3D>, String> {
        check_restraints(dofs, crate::ordered::values(&input.supports).flat_map(|s| {
            super::support::support_dofs_3d(s).into_iter().enumerate().filter_map(move |(k, d)| d.restrained.then_some((s.node_id, k)))
        }))?;
        let mut r = linear::build_reactions_3d_inclined(
            input,
            dofs,
            &self.restrained,
            &[],
            dofs.n_free,
            u_global,
            its,
        );
        r.sort_by_key(|r| r.node_id);
        Ok(r)
    }
}

pub(crate) fn unavailable(phase: &str, message: &str) -> StructuredDiagnostic {
    let mut d = StructuredDiagnostic::global(
        DiagnosticCode::ResultQuantityUnavailable,
        Severity::Warning,
        message.to_string(),
    );
    d.phase = Some(phase.to_string());
    d
}

pub(crate) fn balance_2d(
    input: &SolverInput,
    dofs: &DofNumbering,
    u: &[f64],
    f: &[f64],
    reactions: &[Reaction],
    its: &[InclinedTransformData2D],
    tolerance: f64,
) -> EquilibriumSummary {
    use super::fiber_nonlinear::{wrench_equilibrium, NodalWrench};
    let f = super::assembly::to_global(f, dofs.n_total, its);
    let at = |node, k| dofs.global_dof(node, k).map_or(0.0, |d| u[d]);
    let nodes: std::collections::HashMap<_, _> = crate::ordered::values(&input.nodes)
        .map(|n| (n.id, n))
        .collect();
    let position = |id| {
        let n = nodes[&id];
        [n.x + at(id, 0), 0.0, n.z + at(id, 1)]
    };
    let applied: Vec<_> = dofs
        .node_order
        .iter()
        .map(|&id| {
            let force = |k| dofs.global_dof(id, k).map_or(0.0, |d| f[d]);
            NodalWrench {
                r: position(id),
                f: [force(0), 0.0, force(1)],
                m: [0.0, -force(2), 0.0],
            }
        })
        .collect();
    let reacting: Vec<_> = reactions
        .iter()
        .map(|r| NodalWrench {
            r: position(r.node_id),
            f: [r.rx, 0.0, r.rz],
            m: [0.0, -r.my, 0.0],
        })
        .collect();
    let points: Vec<_> = applied.iter().map(|w| w.r).collect();
    let b = wrench_equilibrium(&points, &applied, &reacting, 0.0, tolerance, dofs.n_free);
    let mut summary = b.summary;
    summary.applied_force_sum = vec![b.applied[0], b.applied[2], -b.applied[4]];
    summary.reaction_force_sum = vec![b.reactions[0], b.reactions[2], -b.reactions[4]];
    summary
}

pub(crate) fn balance_3d(
    input: &SolverInput3D,
    dofs: &DofNumbering,
    u: &[f64],
    f: &[f64],
    reactions: &[Reaction3D],
    its: &[InclinedTransformData],
    tolerance: f64,
) -> EquilibriumSummary {
    use super::fiber_nonlinear::{wrench_equilibrium, NodalWrench};
    let f = super::assembly::to_global(f, dofs.n_total, its);
    let at = |node, k| dofs.global_dof(node, k).map_or(0.0, |d| u[d]);
    let nodes: std::collections::HashMap<_, _> = crate::ordered::values(&input.nodes)
        .map(|n| (n.id, n))
        .collect();
    let position = |id| {
        let n = nodes[&id];
        [n.x + at(id, 0), n.y + at(id, 1), n.z + at(id, 2)]
    };
    let applied: Vec<_> = dofs
        .node_order
        .iter()
        .map(|&id| {
            let force = |k| dofs.global_dof(id, k).map_or(0.0, |d| f[d]);
            NodalWrench {
                r: position(id),
                f: [force(0), force(1), force(2)],
                m: [force(3), force(4), force(5)],
            }
        })
        .collect();
    let reacting: Vec<_> = reactions
        .iter()
        .map(|r| NodalWrench {
            r: position(r.node_id),
            f: [r.fx, r.fy, r.fz],
            m: [r.mx, r.my, r.mz],
        })
        .collect();
    let points: Vec<_> = applied.iter().map(|w| w.r).collect();
    let b = wrench_equilibrium(&points, &applied, &reacting, 0.0, tolerance, dofs.n_free);
    let mut summary = b.summary;
    summary.applied_force_sum = b.applied.to_vec();
    summary.reaction_force_sum = b.reactions.to_vec();
    summary
}

fn check_restraints(dofs: &DofNumbering, required: impl Iterator<Item = (usize, usize)>) -> Result<(), String> {
    let required: std::collections::HashSet<_> = required.collect();
    let mut nodes: Vec<_> = dofs.map.iter().filter_map(|(&(node, k), &d)| ((d >= dofs.n_free) != required.contains(&(node, k))).then_some(node)).collect();
    nodes.sort_unstable();
    nodes.dedup();
    if nodes.is_empty() { return Ok(()); }
    let mut diagnostic = unavailable("reactions", "Results withheld: active support restraints differ from the DOFs used by the solve. Reactions, displacements and member forces cannot be recovered for this model. Rebuild the analysis with the requested supports.").with_nodes(nodes);
    diagnostic.severity = Severity::Error;
    Err(serde_json::json!({"message":diagnostic.message,"structuredDiagnostics":[diagnostic]}).to_string())
}
