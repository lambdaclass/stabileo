use serde::Serialize;

pub const MAX_ENGINE_LP_BYTES: usize = 1 << 30;
pub const MAX_EXACT_BITS: u64 = 8192;
pub const MAX_EXACT_WORKSPACE_BYTES: usize = MAX_ENGINE_LP_BYTES / 2;
pub const EXACT_CELL_BYTES: usize = 2
    * (std::mem::size_of::<super::exact::Q>()
        + MAX_EXACT_BITS as usize / 8
        + 2 * std::mem::size_of::<usize>());
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
    pub fn initial(self) -> Self {
        Self { max_halfspaces: self.initial_halfspaces, ..self }
    }

    pub(crate) fn check_candidate(self, free_variables: usize, halfspaces: usize) -> Result<(), String> {
        let candidate = Self { max_halfspaces: halfspaces, ..self };
        candidate.check_engine_budget()?;
        candidate.check_candidate_workspace(free_variables)
    }

    pub fn max_tableau_cells(self) -> usize {
        let rows = self.force_variables.saturating_add(1);
        rows.saturating_mul(self.max_halfspaces.saturating_add(rows).saturating_add(1))
    }

    pub fn equilibrium_cells(self) -> usize {
        self.equilibrium_equations
            .saturating_mul(self.force_variables.saturating_add(1))
    }

    pub fn exact_workspace_bytes(self) -> usize {
        let width = self.force_variables.saturating_add(1);
        self.equilibrium_cells()
            .saturating_mul(2)
            .saturating_add(width.saturating_mul(width))
            .saturating_add(width.saturating_mul(4))
            .saturating_add(64)
            .saturating_mul(EXACT_CELL_BYTES)
    }

    pub fn max_dense_bytes(self) -> usize {
        let width = self.force_variables.saturating_add(1);
        self.max_tableau_cells()
            .saturating_mul(std::mem::size_of::<f64>())
            .saturating_add(self.exact_workspace_bytes())
            .saturating_add(
                self.equilibrium_cells()
                    .saturating_add(width.saturating_mul(width))
                    .saturating_mul(std::mem::size_of::<f64>()),
            )
    }

    pub fn check_candidate_workspace(self, free_variables: usize) -> Result<(), String> {
        let rows = free_variables.saturating_add(1);
        let cells = rows.saturating_mul(self.max_halfspaces.saturating_add(rows).saturating_add(1));
        let bytes = cells
            .saturating_mul(5)
            .saturating_add(rows.saturating_mul(rows).saturating_mul(2))
            .saturating_mul(std::mem::size_of::<f64>());
        let width = self.force_variables.saturating_add(1);
        let retained = self.exact_workspace_bytes().saturating_add(
            self.equilibrium_cells()
                .saturating_add(width.saturating_mul(width))
                .saturating_mul(std::mem::size_of::<f64>()),
        );
        let limit = MAX_ENGINE_LP_BYTES.saturating_sub(retained);
        if bytes > limit {
            return Err(format!(
                "exact plastic LP resource budget exceeded: simplex workspace bytes {bytes} > {limit} after reserving {retained} retained bytes"
            ));
        }
        Ok(())
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
        let bytes = self.max_dense_bytes();
        if bytes > MAX_ENGINE_LP_BYTES {
            return Err(format!("exact plastic LP resource budget exceeded: dense storage bytes {bytes} > {MAX_ENGINE_LP_BYTES}"));
        }
        let exact = self.exact_workspace_bytes();
        if exact > MAX_EXACT_WORKSPACE_BYTES {
            return Err(format!("exact plastic LP resource budget exceeded: exact workspace bytes {exact} > {MAX_EXACT_WORKSPACE_BYTES}"));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn individually_admissible_overlapping_blocks_cannot_exceed_the_total() {
        let work = PlasticLpWork {
            equilibrium_equations: 400,
            force_variables: 200,
            initial_halfspaces: 16,
            max_halfspaces: 400_000,
            max_solves: 1,
        };
        assert!(work.max_tableau_cells() * std::mem::size_of::<f64>() < MAX_ENGINE_LP_BYTES);
        assert!(work.exact_workspace_bytes() < MAX_EXACT_WORKSPACE_BYTES);
        assert!(work.max_dense_bytes() > MAX_ENGINE_LP_BYTES);
        assert!(work.check_engine_budget().is_err());
    }

    #[test]
    fn overlapping_exact_and_float_blocks_are_added_to_the_tableau() {
        let work = PlasticLpWork {
            equilibrium_equations: 84,
            force_variables: 144,
            initial_halfspaces: 384,
            max_halfspaces: 6144,
            max_solves: 61,
        };
        let overlapping = work.max_tableau_cells() * std::mem::size_of::<f64>()
            + work.equilibrium_cells()
                * (std::mem::size_of::<super::super::exact::Q>() + std::mem::size_of::<f64>());
        assert!(work.max_dense_bytes() >= overlapping);
    }

    #[test]
    fn small_grid_storage_is_admitted_despite_the_pivot_counter() {
        let work = PlasticLpWork {
            equilibrium_equations: 84,
            force_variables: 144,
            initial_halfspaces: 384,
            max_halfspaces: 6144,
            max_solves: 61,
        };
        assert!(work.initial_pivot_cells() > 1 << 31);
        assert!(work.max_dense_bytes() < MAX_ENGINE_LP_BYTES);
        assert!(work.check_engine_budget().is_ok());
    }

    #[test]
    fn refusal_names_the_exceeded_storage_quantity_and_limit() {
        let work = PlasticLpWork {
            equilibrium_equations: 0,
            force_variables: usize::MAX,
            initial_halfspaces: 0,
            max_halfspaces: 0,
            max_solves: 1,
        };
        let reason = work.check_engine_budget().unwrap_err();
        assert!(reason.contains("dense storage bytes"));
        assert!(reason.contains(&MAX_ENGINE_LP_BYTES.to_string()));
    }
    #[test]
    fn candidate_storage_limit_has_adjacent_admitted_and_refused_counts() {
        for free_variables in [0usize, 1, 12, 48] {
            let mut work = PlasticLpWork {
                equilibrium_equations: 12,
                force_variables: 48,
                initial_halfspaces: 32,
                max_halfspaces: 0,
                max_solves: 61,
            };
            assert!(work.check_candidate_workspace(free_variables).is_ok());
            let (mut lower, mut upper) = (0usize, MAX_ENGINE_LP_BYTES);
            while upper - lower > 1 {
                work.max_halfspaces = lower + (upper - lower) / 2;
                if work.check_candidate_workspace(free_variables).is_ok() {
                    lower = work.max_halfspaces;
                } else {
                    upper = work.max_halfspaces;
                }
            }
            work.max_halfspaces = lower;
            assert!(work.check_candidate_workspace(free_variables).is_ok());
            work.max_halfspaces = upper;
            assert!(work.check_candidate_workspace(free_variables).unwrap_err().contains("simplex workspace bytes"));
            assert_eq!(upper, lower + 1);
        }
    }

}
