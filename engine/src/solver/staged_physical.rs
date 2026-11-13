use super::{stage_loads_2d, DofNumbering};
use crate::linalg::CscMatrix;
use crate::types::{ConstructionStage, SolverInput, SolverInput3D};

pub(super) enum StageModel<'a> {
    Plane(&'a SolverInput, &'a ConstructionStage),
    Space(&'a SolverInput3D),
}

struct PhysicalStageStiffness(CscMatrix);

pub(in crate::solver) struct PhysicalStageResidual {
    residual: Vec<f64>,
    applied: Vec<f64>,
    model: super::super::reaction_recovery::ExpandedReactionModel,
}

impl PhysicalStageResidual {
    pub(in crate::solver) fn model(&self) -> &super::super::reaction_recovery::ExpandedReactionModel { &self.model }
    pub(super) fn equilibrium_ok(
        &self,
        metric: &super::super::convergence::EquilibriumMetric,
        dof: &DofNumbering,
        u: &[f64],
        cs: Option<&super::super::constraints::FreeConstraintSystem>,
    ) -> bool {
        let support_driven = u[dof.n_free..].iter().any(|v| *v != 0.0);
        let relative = metric.relative_residual(&self.residual, &self.applied, support_driven.then_some(1.0), cs);
        relative.is_finite() && relative < 1e-6
    }

    pub(in crate::solver) fn as_slice(&self) -> &[f64] {
        &self.residual
    }
}

fn assemble_physical_stiffness(
    model: StageModel<'_>,
    dof: &DofNumbering,
) -> (PhysicalStageStiffness, Vec<f64>) {
    super::super::assembly::physical_stiffness(|| {
        let (k, f) = match model {
            StageModel::Plane(input, stage) => {
                let stiffness =
                    super::super::sparse_assembly::assemble_stiffness_sparse_2d(input, dof);
                let loads = stage_loads_2d(input, stage);
                let f = super::super::assembly::assemble_load_vector_2d(
                    input,
                    &loads,
                    dof,
                    &stiffness.inclined_transforms_2d,
                );
                (stiffness.k_full, f)
            }
            StageModel::Space(input) => {
                let stiffness =
                    super::super::sparse_assembly::assemble_stiffness_sparse_3d_parallel(
                        input, dof, true,
                    );
                let f = super::super::sparse_assembly::assemble_load_vector_sparse_3d(
                    input,
                    &input.loads,
                    dof,
                    &stiffness.inclined_transforms,
                );
                (stiffness.k_full.unwrap(), f)
            }
        };
        (PhysicalStageStiffness(k), f)
    })
}

impl PhysicalStageStiffness {
    fn residual(self, applied: &[f64], u: &[f64], model: super::super::reaction_recovery::ExpandedReactionModel) -> PhysicalStageResidual {
        assert_eq!(applied.len(), self.0.n);
        assert_eq!(u.len(), self.0.n);
        PhysicalStageResidual {
            model,
            residual: self.0
                .sym_mat_vec(u)
                .iter()
                .zip(applied)
                .map(|(ku, f)| ku - f)
                .collect(),
            applied: applied.to_vec(),
        }
    }
}

pub(super) fn recover(
    model: StageModel<'_>,
    dof: &DofNumbering,
    u: &[f64],
) -> PhysicalStageResidual {
    let reactions = match &model {
        StageModel::Plane(input, _) => super::super::reaction_recovery::ExpandedReactionModel::plane(input),
        StageModel::Space(input) => super::super::reaction_recovery::ExpandedReactionModel::space(input),
    };
    let (stiffness, applied) = assemble_physical_stiffness(model, dof);
    stiffness.residual(&applied, u, reactions)
}
