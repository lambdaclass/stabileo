use serde::{Deserialize, Serialize};

/// Load types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Load {
    Nodal(NodalLoad),
    Distributed(DistributedLoad),
    Point(PointLoad),
}

/// Nodal load (forces and moments applied directly to nodes)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodalLoad {
    pub id: usize,
    pub node_id: usize,
    /// Force in X direction (kN)
    pub fx: f64,
    /// Force in Y direction (kN)
    pub fy: f64,
    /// Moment about Z axis (kN·m)
    pub mz: f64,
    /// Load case ID
    pub load_case: usize,
}

impl NodalLoad {
    pub fn new(id: usize, node_id: usize, fx: f64, fy: f64, mz: f64) -> Self {
        Self {
            id,
            node_id,
            fx,
            fy,
            mz,
            load_case: 1,
        }
    }

    pub fn with_load_case(mut self, case: usize) -> Self {
        self.load_case = case;
        self
    }

    pub fn force(id: usize, node_id: usize, fx: f64, fy: f64) -> Self {
        Self::new(id, node_id, fx, fy, 0.0)
    }

    pub fn moment(id: usize, node_id: usize, mz: f64) -> Self {
        Self::new(id, node_id, 0.0, 0.0, mz)
    }
}

/// Distributed load on element (uniform or trapezoidal)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DistributedLoad {
    pub id: usize,
    pub element_id: usize,
    /// Load intensity at start (kN/m) - perpendicular to element (+ = left side)
    pub q_start: f64,
    /// Load intensity at end (kN/m)
    pub q_end: f64,
    /// Axial distributed load (kN/m) - along element axis
    pub qx: f64,
    /// Is load in global coordinates?
    pub global: bool,
    /// Load case ID
    pub load_case: usize,
}

impl DistributedLoad {
    pub fn uniform(id: usize, element_id: usize, q: f64) -> Self {
        Self {
            id,
            element_id,
            q_start: q,
            q_end: q,
            qx: 0.0,
            global: false,
            load_case: 1,
        }
    }

    pub fn trapezoidal(id: usize, element_id: usize, q_start: f64, q_end: f64) -> Self {
        Self {
            id,
            element_id,
            q_start,
            q_end,
            qx: 0.0,
            global: false,
            load_case: 1,
        }
    }

    pub fn with_load_case(mut self, case: usize) -> Self {
        self.load_case = case;
        self
    }

    pub fn in_global_coords(mut self) -> Self {
        self.global = true;
        self
    }

    /// Compute equivalent nodal loads for uniform load
    /// Returns (Fi, Mi, Fj, Mj) - reactions at fixed ends
    pub fn fixed_end_forces(&self, l: f64) -> (f64, f64, f64, f64) {
        if (self.q_start - self.q_end).abs() < 1e-10 {
            // Uniform load
            let q = self.q_start;
            let v = q * l / 2.0;
            let m = q * l * l / 12.0;
            (v, m, v, -m)
        } else {
            // Trapezoidal load - decompose into uniform + triangular
            let q_avg = (self.q_start + self.q_end) / 2.0;
            let q_tri = (self.q_end - self.q_start) / 2.0;

            // Uniform part
            let v_uni = q_avg * l / 2.0;
            let m_uni = q_avg * l * l / 12.0;

            // Triangular part (increasing from start to end)
            let v_tri_i = q_tri * l * 3.0 / 20.0;
            let v_tri_j = q_tri * l * 7.0 / 20.0;
            let m_tri_i = q_tri * l * l / 30.0;
            let m_tri_j = -q_tri * l * l / 20.0;

            (
                v_uni + v_tri_i,
                m_uni + m_tri_i,
                v_uni + v_tri_j,
                -m_uni + m_tri_j,
            )
        }
    }
}

/// Point load on element
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PointLoad {
    pub id: usize,
    pub element_id: usize,
    /// Distance from start node (m)
    pub a: f64,
    /// Force perpendicular to element (kN)
    pub p: f64,
    /// Force along element axis (kN)
    pub px: f64,
    /// Concentrated moment (kN·m)
    pub m: f64,
    /// Is load in global coordinates?
    pub global: bool,
    /// Load case ID
    pub load_case: usize,
}

impl PointLoad {
    pub fn new(id: usize, element_id: usize, a: f64, p: f64) -> Self {
        Self {
            id,
            element_id,
            a,
            p,
            px: 0.0,
            m: 0.0,
            global: false,
            load_case: 1,
        }
    }

    pub fn with_moment(mut self, m: f64) -> Self {
        self.m = m;
        self
    }

    pub fn with_load_case(mut self, case: usize) -> Self {
        self.load_case = case;
        self
    }

    /// Compute equivalent nodal loads for point load
    /// Returns (Vi, Mi, Vj, Mj) - fixed end reactions
    pub fn fixed_end_forces(&self, l: f64) -> (f64, f64, f64, f64) {
        let a = self.a;
        let b = l - a;
        let l2 = l * l;
        let l3 = l2 * l;

        // Point force
        let vi_p = self.p * b * b * (3.0 * a + b) / l3;
        let mi_p = self.p * a * b * b / l2;
        let vj_p = self.p * a * a * (a + 3.0 * b) / l3;
        let mj_p = -self.p * a * a * b / l2;

        // Concentrated moment
        let vi_m = 6.0 * self.m * a * b / l3;
        let mi_m = self.m * b * (2.0 * a - b) / l2;
        let vj_m = -6.0 * self.m * a * b / l3;
        let mj_m = self.m * a * (2.0 * b - a) / l2;

        (vi_p + vi_m, mi_p + mi_m, vj_p + vj_m, mj_p + mj_m)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_uniform_load_fem() {
        let load = DistributedLoad::uniform(1, 1, 10.0);
        let (vi, mi, vj, mj) = load.fixed_end_forces(6.0);

        // qL/2 = 30, qL²/12 = 30
        assert!((vi - 30.0).abs() < 1e-10);
        assert!((mi - 30.0).abs() < 1e-10);
        assert!((vj - 30.0).abs() < 1e-10);
        assert!((mj - (-30.0)).abs() < 1e-10);
    }

    #[test]
    fn test_point_load_center() {
        let load = PointLoad::new(1, 1, 3.0, 100.0); // P at center of L=6m beam
        let (vi, mi, vj, mj) = load.fixed_end_forces(6.0);

        // At center: V = P/2, M = PL/8
        assert!((vi - 50.0).abs() < 1e-10);
        assert!((vj - 50.0).abs() < 1e-10);
        assert!((mi - 75.0).abs() < 1e-10);
        assert!((mj - (-75.0)).abs() < 1e-10);
    }
}
