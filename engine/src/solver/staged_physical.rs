use super::{stage_loads_2d, DofNumbering};
use crate::linalg::CscMatrix;
use crate::types::{ConstructionStage, SolverInput, SolverInput3D};

pub(super) enum StageModel<'a> {
    Plane(&'a SolverInput, &'a ConstructionStage),
    Space(&'a SolverInput3D),
}

struct PhysicalStageStiffness(CscMatrix);

pub(in crate::solver) struct PhysicalStageResidual(Vec<f64>);

impl PhysicalStageResidual {
    pub(in crate::solver) fn as_slice(&self) -> &[f64] {
        &self.0
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
    fn residual(self, applied: &[f64], u: &[f64]) -> PhysicalStageResidual {
        assert_eq!(applied.len(), self.0.n);
        assert_eq!(u.len(), self.0.n);
        PhysicalStageResidual(
            self.0
                .sym_mat_vec(u)
                .iter()
                .zip(applied)
                .map(|(ku, f)| ku - f)
                .collect(),
        )
    }
}

pub(super) fn recover(
    model: StageModel<'_>,
    dof: &DofNumbering,
    u: &[f64],
) -> PhysicalStageResidual {
    let (stiffness, applied) = assemble_physical_stiffness(model, dof);
    stiffness.residual(&applied, u)
}
