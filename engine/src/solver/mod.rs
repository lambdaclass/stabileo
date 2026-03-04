mod dof;
mod assembly;
mod sparse;
mod lu;
mod postprocess;

pub use dof::DofNumbering;
pub use assembly::Assembler;
pub use sparse::SparseMatrix;
pub use lu::solve_lu;
pub use postprocess::PostProcessor;

use crate::model::Structure;
use crate::results::{AnalysisResults, Displacement, Reaction, ElementForces};

/// Main solver entry point
pub struct Solver {
    pub structure: Structure,
    dof_numbering: Option<DofNumbering>,
}

impl Solver {
    pub fn new(structure: Structure) -> Self {
        Self {
            structure,
            dof_numbering: None,
        }
    }

    /// Run linear static analysis
    pub fn solve(&mut self) -> Result<AnalysisResults, String> {
        // Validate structure
        self.structure.validate()?;

        // Number DOFs
        let dof_num = DofNumbering::new(&self.structure);
        let n_free = dof_num.free_dofs();
        let n_total = dof_num.total_dofs();

        if n_free == 0 {
            return Err("No free DOFs - structure is fully restrained".to_string());
        }

        // Assemble global stiffness matrix and load vector
        let assembler = Assembler::new(&self.structure, &dof_num);
        let (k_global, f_global) = assembler.assemble()?;

        // Extract free-free partition
        let k_ff = k_global.extract_submatrix(0, n_free, 0, n_free);
        let f_f: Vec<f64> = f_global[0..n_free].to_vec();

        // Solve K_ff * u_f = F_f
        let u_f = solve_lu(&k_ff, &f_f)?;

        // Build complete displacement vector
        let mut u_all = vec![0.0; n_total];
        for i in 0..n_free {
            u_all[i] = u_f[i];
        }
        // Restrained DOFs remain zero (or prescribed values if implemented)

        // Calculate reactions: R = K_rf * u_f - F_r
        let k_rf = k_global.extract_submatrix(n_free, n_total - n_free, 0, n_free);
        let mut reactions_vec = vec![0.0; n_total - n_free];
        for i in 0..reactions_vec.len() {
            let mut sum = 0.0;
            for j in 0..n_free {
                sum += k_rf.get(i, j) * u_f[j];
            }
            reactions_vec[i] = sum - f_global[n_free + i];
        }

        // Store DOF numbering for post-processing
        self.dof_numbering = Some(dof_num.clone());

        // Build results
        let mut results = AnalysisResults::new();

        // Convert displacements to node-based results
        for (&node_id, _node) in &self.structure.nodes {
            let ux = dof_num.get_displacement(&u_all, node_id, 0);
            let uy = dof_num.get_displacement(&u_all, node_id, 1);
            let rz = dof_num.get_displacement(&u_all, node_id, 2);
            results.displacements.push(Displacement {
                node_id,
                ux,
                uy,
                rz,
            });
        }

        // Convert reactions
        for support in self.structure.supports.values() {
            let rx = dof_num.get_reaction(&reactions_vec, support.node_id, 0, n_free);
            let ry = dof_num.get_reaction(&reactions_vec, support.node_id, 1, n_free);
            let mz = dof_num.get_reaction(&reactions_vec, support.node_id, 2, n_free);

            if rx.abs() > 1e-10 || ry.abs() > 1e-10 || mz.abs() > 1e-10 {
                results.reactions.push(Reaction {
                    node_id: support.node_id,
                    rx,
                    ry,
                    mz,
                });
            }
        }

        // Calculate internal forces
        let post = PostProcessor::new(&self.structure, &dof_num, &u_all);
        results.element_forces = post.compute_internal_forces();

        // Verify equilibrium
        results.verify_equilibrium(&self.structure)?;

        Ok(results)
    }
}
