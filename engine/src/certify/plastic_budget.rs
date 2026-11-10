use serde::Serialize;

pub const MAX_ENGINE_LP_BYTES: usize = 1 << 30;
pub const MAX_ENGINE_INITIAL_PIVOT_CELLS: usize = 1 << 31;
pub(crate) const SIMPLEX_PIVOTS_PER_COLUMN: usize = 50;

#[derive(Debug, Clone, Copy, Serialize)]
pub struct PlasticLpWork {
    pub equilibrium_equations: usize,
    pub force_variables: usize,
    pub initial_halfspaces: usize,
    pub max_halfspaces: usize,
    pub max_solves: usize,
}

impl PlasticLpWork {
    pub fn max_tableau_cells(self) -> usize {
        let rows = self.force_variables.saturating_add(1);
        rows.saturating_mul(self.max_halfspaces.saturating_add(rows).saturating_add(1))
    }

    pub fn equilibrium_cells(self) -> usize {
        self.equilibrium_equations
            .saturating_mul(self.force_variables.saturating_add(1))
    }

    pub fn max_dense_bytes(self) -> usize {
        self.max_tableau_cells()
            .saturating_mul(std::mem::size_of::<f64>())
            .max(
                self.equilibrium_cells()
                    .saturating_mul(std::mem::size_of::<super::exact::Q>()),
            )
    }

    pub fn initial_pivot_cells(self) -> usize {
        let rows = self.force_variables.saturating_add(1);
        let columns = self.initial_halfspaces.saturating_add(rows);
        rows.saturating_mul(columns.saturating_add(1))
            .saturating_mul(
                columns
                    .saturating_mul(2 * SIMPLEX_PIVOTS_PER_COLUMN)
                    .saturating_add(rows),
            )
    }

    pub fn check_engine_budget(self) -> Result<(), String> {
        if self.max_dense_bytes() > MAX_ENGINE_LP_BYTES
            || self.initial_pivot_cells() > MAX_ENGINE_INITIAL_PIVOT_CELLS
        {
            return Err(format!("exact plastic LP resource budget exceeded ({} force variables, {} possible yield halfspaces); reduce members or load intervals", self.force_variables, self.max_halfspaces));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "known wrong result: #1888"]
    fn overlapping_exact_and_float_blocks_are_added_to_the_tableau() {
        let work = PlasticLpWork { equilibrium_equations: 84, force_variables: 144, initial_halfspaces: 384, max_halfspaces: 6144, max_solves: 61 };
        let overlapping = work.max_tableau_cells() * std::mem::size_of::<f64>()
            + work.equilibrium_cells() * (std::mem::size_of::<super::super::exact::Q>() + std::mem::size_of::<f64>());
        assert!(work.max_dense_bytes() >= overlapping);
    }

    #[test]
    #[ignore = "known wrong result: #1888"]
    fn small_grid_storage_is_admitted_despite_the_pivot_counter() {
        let work = PlasticLpWork { equilibrium_equations: 84, force_variables: 144, initial_halfspaces: 384, max_halfspaces: 6144, max_solves: 61 };
        assert!(work.initial_pivot_cells() > 1 << 31);
        assert!(work.max_dense_bytes() < MAX_ENGINE_LP_BYTES);
        assert!(work.check_engine_budget().is_ok());
    }

    #[test]
    #[ignore = "known wrong result: #1888"]
    fn refusal_names_the_exceeded_storage_quantity_and_limit() {
        let work = PlasticLpWork { equilibrium_equations: 0, force_variables: usize::MAX, initial_halfspaces: 0, max_halfspaces: 0, max_solves: 1 };
        let reason = work.check_engine_budget().unwrap_err();
        assert!(reason.contains("dense storage bytes"));
        assert!(reason.contains(&MAX_ENGINE_LP_BYTES.to_string()));
    }
}
