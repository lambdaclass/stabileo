use crate::model::{Structure, ElementData, Element, Load, DistributedLoad, PointLoad};
use super::dof::DofNumbering;
use super::sparse::SparseMatrix;

/// Assembles global stiffness matrix and load vector
pub struct Assembler<'a> {
    structure: &'a Structure,
    dof_num: &'a DofNumbering,
}

impl<'a> Assembler<'a> {
    pub fn new(structure: &'a Structure, dof_num: &'a DofNumbering) -> Self {
        Self { structure, dof_num }
    }

    /// Assemble global stiffness matrix K and load vector F
    pub fn assemble(&self) -> Result<(SparseMatrix, Vec<f64>), String> {
        let n = self.dof_num.total_dofs();
        let mut triplets: Vec<(usize, usize, f64)> = Vec::new();
        let mut f_global = vec![0.0; n];

        // Assemble element stiffness matrices
        for elem in self.structure.elements.values() {
            match elem {
                ElementData::Frame(frame) => {
                    self.assemble_frame(frame.id, &mut triplets, &mut f_global)?;
                }
                ElementData::Truss(truss) => {
                    self.assemble_truss(truss.id, &mut triplets)?;
                }
            }
        }

        // Assemble nodal loads
        for load in &self.structure.loads {
            match load {
                Load::Nodal(nodal) => {
                    self.assemble_nodal_load(nodal, &mut f_global);
                }
                Load::Distributed(dist) => {
                    self.assemble_distributed_load(dist, &mut f_global)?;
                }
                Load::Point(point) => {
                    self.assemble_point_load(point, &mut f_global)?;
                }
            }
        }

        let k_global = SparseMatrix::from_triplets(n, n, &triplets);
        Ok((k_global, f_global))
    }

    fn assemble_frame(
        &self,
        elem_id: usize,
        triplets: &mut Vec<(usize, usize, f64)>,
        _f_global: &mut [f64],
    ) -> Result<(), String> {
        let elem = self.structure.get_element(elem_id)
            .ok_or_else(|| format!("Element {} not found", elem_id))?;

        let frame = elem.as_frame()
            .ok_or_else(|| format!("Element {} is not a frame", elem_id))?;

        let (ni, nj) = frame.node_ids();
        let node_i = self.structure.get_node(ni)
            .ok_or_else(|| format!("Node {} not found", ni))?;
        let node_j = self.structure.get_node(nj)
            .ok_or_else(|| format!("Node {} not found", nj))?;

        let mat = self.structure.get_material(frame.material_id)
            .ok_or_else(|| format!("Material {} not found", frame.material_id))?;
        let sec = self.structure.get_section(frame.section_id)
            .ok_or_else(|| format!("Section {} not found", frame.section_id))?;

        let l = node_i.distance_to(node_j);
        let angle = node_i.angle_to(node_j);
        let cos = angle.cos();
        let sin = angle.sin();

        // E in MPa = N/mm² → convert to kN/m² = E * 1000
        let e_kn_m2 = mat.e * 1000.0;

        // Local stiffness matrix (6x6)
        let k_local = frame.local_stiffness(e_kn_m2, sec.a, sec.iz, l);

        // Transformation matrix (6x6)
        let t = frame.transformation_matrix(cos, sin);

        // Global stiffness: K_global = T^T * K_local * T
        let k_global = transform_matrix(&k_local, &t);

        // Get global DOF indices
        let dofs = self.dof_num.element_dofs(ni, nj);

        // Add to triplets
        for (i, &di) in dofs.iter().enumerate() {
            for (j, &dj) in dofs.iter().enumerate() {
                let val = k_global[i][j];
                if val.abs() > 1e-14 {
                    triplets.push((di, dj, val));
                }
            }
        }

        Ok(())
    }

    fn assemble_truss(
        &self,
        elem_id: usize,
        triplets: &mut Vec<(usize, usize, f64)>,
    ) -> Result<(), String> {
        let elem = self.structure.get_element(elem_id)
            .ok_or_else(|| format!("Element {} not found", elem_id))?;

        let truss = elem.as_truss()
            .ok_or_else(|| format!("Element {} is not a truss", elem_id))?;

        let (ni, nj) = truss.node_ids();
        let node_i = self.structure.get_node(ni)
            .ok_or_else(|| format!("Node {} not found", ni))?;
        let node_j = self.structure.get_node(nj)
            .ok_or_else(|| format!("Node {} not found", nj))?;

        let mat = self.structure.get_material(truss.material_id)
            .ok_or_else(|| format!("Material {} not found", truss.material_id))?;
        let sec = self.structure.get_section(truss.section_id)
            .ok_or_else(|| format!("Section {} not found", truss.section_id))?;

        let l = node_i.distance_to(node_j);
        let angle = node_i.angle_to(node_j);
        let cos = angle.cos();
        let sin = angle.sin();

        let e_kn_m2 = mat.e * 1000.0;

        // For truss, we can directly compute global stiffness matrix
        // K = (EA/L) * [c² cs -c² -cs; cs s² -cs -s²; -c² -cs c² cs; -cs -s² cs s²]
        let k = e_kn_m2 * sec.a / l;
        let c2 = cos * cos;
        let s2 = sin * sin;
        let cs = cos * sin;

        let k_global = vec![
            vec![k * c2, k * cs, -k * c2, -k * cs],
            vec![k * cs, k * s2, -k * cs, -k * s2],
            vec![-k * c2, -k * cs, k * c2, k * cs],
            vec![-k * cs, -k * s2, k * cs, k * s2],
        ];

        // Get global DOF indices (only 2 per node for truss)
        let dofs_i = vec![
            self.dof_num.global_dof(ni, 0).unwrap(),
            self.dof_num.global_dof(ni, 1).unwrap(),
        ];
        let dofs_j = vec![
            self.dof_num.global_dof(nj, 0).unwrap(),
            self.dof_num.global_dof(nj, 1).unwrap(),
        ];
        let dofs = [dofs_i, dofs_j].concat();

        for (i, &di) in dofs.iter().enumerate() {
            for (j, &dj) in dofs.iter().enumerate() {
                let val = k_global[i][j];
                if val.abs() > 1e-14 {
                    triplets.push((di, dj, val));
                }
            }
        }

        Ok(())
    }

    fn assemble_nodal_load(&self, load: &crate::model::NodalLoad, f_global: &mut [f64]) {
        if let Some(idx) = self.dof_num.global_dof(load.node_id, 0) {
            f_global[idx] += load.fx;
        }
        if let Some(idx) = self.dof_num.global_dof(load.node_id, 1) {
            f_global[idx] += load.fy;
        }
        if self.dof_num.dofs_per_node() >= 3 {
            if let Some(idx) = self.dof_num.global_dof(load.node_id, 2) {
                f_global[idx] += load.mz;
            }
        }
    }

    fn assemble_distributed_load(&self, load: &DistributedLoad, f_global: &mut [f64]) -> Result<(), String> {
        let elem = self.structure.get_element(load.element_id)
            .ok_or_else(|| format!("Element {} not found for load", load.element_id))?;

        let l = self.structure.element_length(load.element_id)
            .ok_or_else(|| format!("Could not compute length for element {}", load.element_id))?;

        let angle = self.structure.element_angle(load.element_id).unwrap_or(0.0);

        // Get fixed-end forces in local coordinates
        let (vi, mi, vj, mj) = load.fixed_end_forces(l);

        // Transform to global coordinates and add to load vector
        let (ni, nj) = elem.node_ids();
        let cos = angle.cos();
        let sin = angle.sin();

        // Equivalent nodal loads (negated fixed-end forces)
        // Local: perpendicular force V becomes Fx and Fy in global
        if let Some(idx) = self.dof_num.global_dof(ni, 0) {
            f_global[idx] += -vi * sin; // Fx_i
        }
        if let Some(idx) = self.dof_num.global_dof(ni, 1) {
            f_global[idx] += vi * cos; // Fy_i (if load is downward, cos < 0 for inclined)
        }
        if let Some(idx) = self.dof_num.global_dof(ni, 2) {
            f_global[idx] += mi; // Mz_i
        }

        if let Some(idx) = self.dof_num.global_dof(nj, 0) {
            f_global[idx] += -vj * sin;
        }
        if let Some(idx) = self.dof_num.global_dof(nj, 1) {
            f_global[idx] += vj * cos;
        }
        if let Some(idx) = self.dof_num.global_dof(nj, 2) {
            f_global[idx] += mj;
        }

        Ok(())
    }

    fn assemble_point_load(&self, load: &PointLoad, f_global: &mut [f64]) -> Result<(), String> {
        let elem = self.structure.get_element(load.element_id)
            .ok_or_else(|| format!("Element {} not found for load", load.element_id))?;

        let l = self.structure.element_length(load.element_id)
            .ok_or_else(|| format!("Could not compute length for element {}", load.element_id))?;

        let angle = self.structure.element_angle(load.element_id).unwrap_or(0.0);

        let (vi, mi, vj, mj) = load.fixed_end_forces(l);

        let (ni, nj) = elem.node_ids();
        let cos = angle.cos();
        let sin = angle.sin();

        if let Some(idx) = self.dof_num.global_dof(ni, 0) {
            f_global[idx] += -vi * sin;
        }
        if let Some(idx) = self.dof_num.global_dof(ni, 1) {
            f_global[idx] += vi * cos;
        }
        if let Some(idx) = self.dof_num.global_dof(ni, 2) {
            f_global[idx] += mi;
        }

        if let Some(idx) = self.dof_num.global_dof(nj, 0) {
            f_global[idx] += -vj * sin;
        }
        if let Some(idx) = self.dof_num.global_dof(nj, 1) {
            f_global[idx] += vj * cos;
        }
        if let Some(idx) = self.dof_num.global_dof(nj, 2) {
            f_global[idx] += mj;
        }

        Ok(())
    }
}

/// Transform local stiffness matrix to global: K_g = T^T * K_l * T
fn transform_matrix(k_local: &[Vec<f64>], t: &[Vec<f64>]) -> Vec<Vec<f64>> {
    let n = k_local.len();

    // First: temp = K_l * T
    let mut temp = vec![vec![0.0; n]; n];
    for i in 0..n {
        for j in 0..n {
            for k in 0..n {
                temp[i][j] += k_local[i][k] * t[k][j];
            }
        }
    }

    // Then: K_g = T^T * temp
    let mut k_global = vec![vec![0.0; n]; n];
    for i in 0..n {
        for j in 0..n {
            for k in 0..n {
                k_global[i][j] += t[k][i] * temp[k][j];
            }
        }
    }

    k_global
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transform_identity() {
        // Identity transformation should not change matrix
        let k = vec![
            vec![1.0, 2.0],
            vec![2.0, 3.0],
        ];
        let t = vec![
            vec![1.0, 0.0],
            vec![0.0, 1.0],
        ];
        let kg = transform_matrix(&k, &t);
        assert!((kg[0][0] - 1.0).abs() < 1e-10);
        assert!((kg[0][1] - 2.0).abs() < 1e-10);
    }
}
