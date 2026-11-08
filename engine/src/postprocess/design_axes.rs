//! A section's strong axis is local y (`Iy`, docs/solver/frames.md §2.3): it
//! carries `My` with `Vz`, and the weak axis carries `Mz` with `Vy`. A 2D member
//! bends about its strong axis.

use super::beam_stations::StationComboForces3D;
use super::diagrams_3d::evaluate_diagram_3d_at;
use crate::certify::stations::StationBound3D;
use crate::types::ElementForces3D;

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct AxisDemand {
    pub n: f64,
    pub m_strong: f64,
    pub v_strong: f64,
    pub m_weak: f64,
    pub v_weak: f64,
    pub torsion: f64,
}

impl AxisDemand {
    pub const NAN: Self = Self {
        n: f64::NAN,
        m_strong: f64::NAN,
        v_strong: f64::NAN,
        m_weak: f64::NAN,
        v_weak: f64::NAN,
        torsion: f64::NAN,
    };

    pub fn is_finite(&self) -> bool {
        self.n.is_finite()
            && self.m_strong.is_finite()
            && self.v_strong.is_finite()
            && self.m_weak.is_finite()
            && self.v_weak.is_finite()
            && self.torsion.is_finite()
    }

    pub fn plane_2d(n: f64, m: f64, v: f64) -> Self {
        Self { n, m_strong: m, v_strong: v, m_weak: 0.0, v_weak: 0.0, torsion: 0.0 }
    }

    pub fn station_3d(f: &StationComboForces3D) -> Self {
        Self { n: f.n, m_strong: f.my, v_strong: f.vz, m_weak: f.mz, v_weak: f.vy, torsion: f.torsion }
    }

    pub fn diagram_3d(ef: &ElementForces3D, t: f64) -> Self {
        Self {
            n: evaluate_diagram_3d_at(ef, "axial", t),
            m_strong: evaluate_diagram_3d_at(ef, "momentY", t),
            v_strong: evaluate_diagram_3d_at(ef, "shearZ", t),
            m_weak: evaluate_diagram_3d_at(ef, "momentZ", t),
            v_weak: evaluate_diagram_3d_at(ef, "shearY", t),
            torsion: evaluate_diagram_3d_at(ef, "torsion", t),
        }
    }

    pub fn bound_3d(s: &StationBound3D) -> Self {
        Self {
            n: s.axial,
            m_strong: s.moment_y,
            v_strong: s.shear_z,
            m_weak: s.moment_z,
            v_weak: s.shear_y,
            torsion: s.torsion,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strong_axis_is_my_with_vz_and_weak_axis_is_mz_with_vy() {
        let f = StationComboForces3D { combo_id: 1, combo_name: None, n: 1.0, vy: 2.0, vz: 3.0, my: 4.0, mz: 5.0, torsion: 6.0 };
        assert_eq!(
            AxisDemand::station_3d(&f),
            AxisDemand { n: 1.0, m_strong: 4.0, v_strong: 3.0, m_weak: 5.0, v_weak: 2.0, torsion: 6.0 }
        );
        let s = StationBound3D {
            element_id: 1, axial: 1.0, shear_y: 2.0, shear_z: 3.0, torsion: 6.0, moment_y: 4.0, moment_z: 5.0, gaps: None,
        };
        assert_eq!(AxisDemand::bound_3d(&s), AxisDemand::station_3d(&f));
    }
}
