use serde::{Deserialize, Serialize};

/// Element type enumeration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ElementType {
    Frame2D,
    Truss2D,
}

/// Base element trait
pub trait Element {
    fn element_type(&self) -> ElementType;
    fn node_ids(&self) -> (usize, usize);
    fn material_id(&self) -> usize;
    fn section_id(&self) -> usize;
    fn dofs_per_node(&self) -> usize;

    /// Compute local stiffness matrix
    fn local_stiffness(&self, e: f64, a: f64, iz: f64, l: f64) -> Vec<Vec<f64>>;

    /// Compute transformation matrix from local to global coordinates
    fn transformation_matrix(&self, cos: f64, sin: f64) -> Vec<Vec<f64>>;
}

/// Frame element in 2D (beam/column)
/// 3 DOFs per node: ux, uy, rz
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Frame2D {
    pub id: usize,
    pub node_i: usize,
    pub node_j: usize,
    pub material_id: usize,
    pub section_id: usize,
    /// Local releases: (start_moment, end_moment)
    pub hinges: (bool, bool),
}

impl Frame2D {
    pub fn new(id: usize, node_i: usize, node_j: usize, material_id: usize, section_id: usize) -> Self {
        Self {
            id,
            node_i,
            node_j,
            material_id,
            section_id,
            hinges: (false, false),
        }
    }

    pub fn with_hinge_start(mut self) -> Self {
        self.hinges.0 = true;
        self
    }

    pub fn with_hinge_end(mut self) -> Self {
        self.hinges.1 = true;
        self
    }
}

impl Element for Frame2D {
    fn element_type(&self) -> ElementType {
        ElementType::Frame2D
    }

    fn node_ids(&self) -> (usize, usize) {
        (self.node_i, self.node_j)
    }

    fn material_id(&self) -> usize {
        self.material_id
    }

    fn section_id(&self) -> usize {
        self.section_id
    }

    fn dofs_per_node(&self) -> usize {
        3 // ux, uy, rz
    }

    /// Local stiffness matrix for frame element (6x6)
    /// DOFs: [u1, v1, θ1, u2, v2, θ2]
    fn local_stiffness(&self, e: f64, a: f64, iz: f64, l: f64) -> Vec<Vec<f64>> {
        let ea_l = e * a / l;
        let ei_l = e * iz / l;
        let ei_l2 = ei_l / l;
        let ei_l3 = ei_l2 / l;

        // Standard frame stiffness matrix (without hinges)
        let mut k = vec![vec![0.0; 6]; 6];

        // Axial terms
        k[0][0] = ea_l;
        k[0][3] = -ea_l;
        k[3][0] = -ea_l;
        k[3][3] = ea_l;

        // Flexural terms (no hinges)
        if !self.hinges.0 && !self.hinges.1 {
            // Standard beam
            k[1][1] = 12.0 * ei_l3;
            k[1][2] = 6.0 * ei_l2;
            k[1][4] = -12.0 * ei_l3;
            k[1][5] = 6.0 * ei_l2;

            k[2][1] = 6.0 * ei_l2;
            k[2][2] = 4.0 * ei_l;
            k[2][4] = -6.0 * ei_l2;
            k[2][5] = 2.0 * ei_l;

            k[4][1] = -12.0 * ei_l3;
            k[4][2] = -6.0 * ei_l2;
            k[4][4] = 12.0 * ei_l3;
            k[4][5] = -6.0 * ei_l2;

            k[5][1] = 6.0 * ei_l2;
            k[5][2] = 2.0 * ei_l;
            k[5][4] = -6.0 * ei_l2;
            k[5][5] = 4.0 * ei_l;
        } else if self.hinges.0 && !self.hinges.1 {
            // Hinge at start
            k[1][1] = 3.0 * ei_l3;
            k[1][4] = -3.0 * ei_l3;
            k[1][5] = 3.0 * ei_l2;

            k[4][1] = -3.0 * ei_l3;
            k[4][4] = 3.0 * ei_l3;
            k[4][5] = -3.0 * ei_l2;

            k[5][1] = 3.0 * ei_l2;
            k[5][4] = -3.0 * ei_l2;
            k[5][5] = 3.0 * ei_l;
        } else if !self.hinges.0 && self.hinges.1 {
            // Hinge at end
            k[1][1] = 3.0 * ei_l3;
            k[1][2] = 3.0 * ei_l2;
            k[1][4] = -3.0 * ei_l3;

            k[2][1] = 3.0 * ei_l2;
            k[2][2] = 3.0 * ei_l;
            k[2][4] = -3.0 * ei_l2;

            k[4][1] = -3.0 * ei_l3;
            k[4][2] = -3.0 * ei_l2;
            k[4][4] = 3.0 * ei_l3;
        }
        // Both hinges: only axial stiffness (already set above)

        k
    }

    /// Transformation matrix T (6x6) for 2D frame
    fn transformation_matrix(&self, cos: f64, sin: f64) -> Vec<Vec<f64>> {
        let mut t = vec![vec![0.0; 6]; 6];

        // Rotation submatrix for each node
        t[0][0] = cos;
        t[0][1] = sin;
        t[1][0] = -sin;
        t[1][1] = cos;
        t[2][2] = 1.0;

        t[3][3] = cos;
        t[3][4] = sin;
        t[4][3] = -sin;
        t[4][4] = cos;
        t[5][5] = 1.0;

        t
    }
}

/// Truss element in 2D
/// 2 DOFs per node: ux, uy (no rotation)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Truss2D {
    pub id: usize,
    pub node_i: usize,
    pub node_j: usize,
    pub material_id: usize,
    pub section_id: usize,
}

impl Truss2D {
    pub fn new(id: usize, node_i: usize, node_j: usize, material_id: usize, section_id: usize) -> Self {
        Self {
            id,
            node_i,
            node_j,
            material_id,
            section_id,
        }
    }
}

impl Element for Truss2D {
    fn element_type(&self) -> ElementType {
        ElementType::Truss2D
    }

    fn node_ids(&self) -> (usize, usize) {
        (self.node_i, self.node_j)
    }

    fn material_id(&self) -> usize {
        self.material_id
    }

    fn section_id(&self) -> usize {
        self.section_id
    }

    fn dofs_per_node(&self) -> usize {
        2 // ux, uy
    }

    /// Local stiffness matrix for truss element (4x4)
    /// DOFs: [u1, v1, u2, v2] in local coordinates
    /// In local coords, only axial stiffness matters: k_local is simple
    fn local_stiffness(&self, e: f64, a: f64, _iz: f64, l: f64) -> Vec<Vec<f64>> {
        let k = e * a / l;
        vec![
            vec![k, 0.0, -k, 0.0],
            vec![0.0, 0.0, 0.0, 0.0],
            vec![-k, 0.0, k, 0.0],
            vec![0.0, 0.0, 0.0, 0.0],
        ]
    }

    /// Transformation matrix T (4x4) for 2D truss
    fn transformation_matrix(&self, cos: f64, sin: f64) -> Vec<Vec<f64>> {
        vec![
            vec![cos, sin, 0.0, 0.0],
            vec![-sin, cos, 0.0, 0.0],
            vec![0.0, 0.0, cos, sin],
            vec![0.0, 0.0, -sin, cos],
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frame_stiffness_symmetry() {
        let frame = Frame2D::new(1, 1, 2, 1, 1);
        let k = frame.local_stiffness(200000.0, 0.01, 0.0001, 5.0);

        // Check symmetry
        for i in 0..6 {
            for j in 0..6 {
                assert!((k[i][j] - k[j][i]).abs() < 1e-10,
                    "Matrix not symmetric at [{},{}]", i, j);
            }
        }
    }

    #[test]
    fn test_truss_stiffness() {
        let truss = Truss2D::new(1, 1, 2, 1, 1);
        let k = truss.local_stiffness(200000.0, 0.001, 0.0, 2.0);

        // EA/L = 200000 * 0.001 / 2 = 100
        assert!((k[0][0] - 100.0).abs() < 1e-10);
        assert!((k[0][2] - (-100.0)).abs() < 1e-10);
    }
}
