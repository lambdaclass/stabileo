use crate::model::{Structure, Element, ElementData};
use crate::results::ElementForces;
use super::dof::DofNumbering;

/// Post-processor for computing internal forces from displacements
pub struct PostProcessor<'a> {
    structure: &'a Structure,
    dof_num: &'a DofNumbering,
    displacements: &'a [f64],
}

impl<'a> PostProcessor<'a> {
    pub fn new(structure: &'a Structure, dof_num: &'a DofNumbering, displacements: &'a [f64]) -> Self {
        Self {
            structure,
            dof_num,
            displacements,
        }
    }

    /// Compute internal forces for all elements
    pub fn compute_internal_forces(&self) -> Vec<ElementForces> {
        self.structure
            .elements
            .values()
            .filter_map(|elem| self.compute_element_forces(elem))
            .collect()
    }

    fn compute_element_forces(&self, elem: &ElementData) -> Option<ElementForces> {
        match elem {
            ElementData::Frame(frame) => self.compute_frame_forces(frame),
            ElementData::Truss(truss) => self.compute_truss_forces(truss),
        }
    }

    fn compute_frame_forces(&self, frame: &crate::model::Frame2D) -> Option<ElementForces> {
        let (ni, nj) = frame.node_ids();
        let node_i = self.structure.get_node(ni)?;
        let node_j = self.structure.get_node(nj)?;

        let mat = self.structure.get_material(frame.material_id)?;
        let sec = self.structure.get_section(frame.section_id)?;

        let l = node_i.distance_to(node_j);
        let angle = node_i.angle_to(node_j);
        let cos = angle.cos();
        let sin = angle.sin();

        // Get global displacements
        let u_global = [
            self.dof_num.get_displacement(self.displacements, ni, 0),
            self.dof_num.get_displacement(self.displacements, ni, 1),
            self.dof_num.get_displacement(self.displacements, ni, 2),
            self.dof_num.get_displacement(self.displacements, nj, 0),
            self.dof_num.get_displacement(self.displacements, nj, 1),
            self.dof_num.get_displacement(self.displacements, nj, 2),
        ];

        // Transform to local coordinates
        let t = frame.transformation_matrix(cos, sin);
        let u_local = transform_vector(&t, &u_global);

        // Compute local forces: F_local = K_local * u_local
        let e_kn_m2 = mat.e * 1000.0;
        let k_local = frame.local_stiffness(e_kn_m2, sec.a, sec.iz, l);

        let mut f_local = vec![0.0; 6];
        for i in 0..6 {
            for j in 0..6 {
                f_local[i] += k_local[i][j] * u_local[j];
            }
        }

        // Add fixed-end forces from element loads
        self.add_element_fixed_end_forces(frame.id, l, &mut f_local);

        // Extract internal forces
        // Convention: positive N = tension, positive M = bottom fiber in tension
        // At start (i): N_i = -f_local[0], V_i = f_local[1], M_i = f_local[2]
        // At end (j):   N_j = f_local[3],  V_j = -f_local[4], M_j = -f_local[5]

        let n_i = -f_local[0]; // Axial force at i
        let v_i = f_local[1];  // Shear force at i
        let m_i = f_local[2];  // Moment at i

        let n_j = f_local[3];  // Axial force at j
        let v_j = -f_local[4]; // Shear force at j
        let m_j = -f_local[5]; // Moment at j

        Some(ElementForces {
            element_id: frame.id,
            n_start: n_i,
            n_end: n_j,
            v_start: v_i,
            v_end: v_j,
            m_start: m_i,
            m_end: m_j,
            length: l,
        })
    }

    fn compute_truss_forces(&self, truss: &crate::model::Truss2D) -> Option<ElementForces> {
        let (ni, nj) = truss.node_ids();
        let node_i = self.structure.get_node(ni)?;
        let node_j = self.structure.get_node(nj)?;

        let mat = self.structure.get_material(truss.material_id)?;
        let sec = self.structure.get_section(truss.section_id)?;

        let l = node_i.distance_to(node_j);
        let angle = node_i.angle_to(node_j);
        let cos = angle.cos();
        let sin = angle.sin();

        // Get global displacements (only 2 DOFs per node for truss)
        let ui_x = self.dof_num.get_displacement(self.displacements, ni, 0);
        let ui_y = self.dof_num.get_displacement(self.displacements, ni, 1);
        let uj_x = self.dof_num.get_displacement(self.displacements, nj, 0);
        let uj_y = self.dof_num.get_displacement(self.displacements, nj, 1);

        // Axial deformation in local coordinates
        // u_local = (uj - ui) · direction = (uj_x - ui_x)*cos + (uj_y - ui_y)*sin
        let delta = (uj_x - ui_x) * cos + (uj_y - ui_y) * sin;

        // Axial force N = EA/L * delta
        let e_kn_m2 = mat.e * 1000.0;
        let n = e_kn_m2 * sec.a * delta / l;

        Some(ElementForces {
            element_id: truss.id,
            n_start: n,
            n_end: n,
            v_start: 0.0,
            v_end: 0.0,
            m_start: 0.0,
            m_end: 0.0,
            length: l,
        })
    }

    fn add_element_fixed_end_forces(&self, elem_id: usize, l: f64, f_local: &mut [f64]) {
        use crate::model::Load;

        for load in &self.structure.loads {
            match load {
                Load::Distributed(dist) if dist.element_id == elem_id => {
                    let (vi, mi, vj, mj) = dist.fixed_end_forces(l);
                    // Subtract consistent nodal loads: F_member = K*u - F_consistent
                    // (fixed-end member forces are the negative of consistent nodal loads)
                    f_local[1] -= vi;
                    f_local[2] -= mi;
                    f_local[4] -= vj;
                    f_local[5] -= mj;
                }
                Load::Point(point) if point.element_id == elem_id => {
                    let (vi, mi, vj, mj) = point.fixed_end_forces(l);
                    f_local[1] -= vi;
                    f_local[2] -= mi;
                    f_local[4] -= vj;
                    f_local[5] -= mj;
                }
                _ => {}
            }
        }
    }
}

/// Transform global displacement vector to local: u_local = T * u_global
fn transform_vector(t: &[Vec<f64>], u_global: &[f64]) -> Vec<f64> {
    let n = u_global.len();
    let mut u_local = vec![0.0; n];
    for i in 0..n {
        for j in 0..n {
            u_local[i] += t[i][j] * u_global[j];
        }
    }
    u_local
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transform_vector_identity() {
        let t = vec![
            vec![1.0, 0.0, 0.0],
            vec![0.0, 1.0, 0.0],
            vec![0.0, 0.0, 1.0],
        ];
        let u = vec![1.0, 2.0, 3.0];
        let result = transform_vector(&t, &u);
        assert_eq!(result, u);
    }
}
