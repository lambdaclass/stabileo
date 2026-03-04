use serde::{Deserialize, Serialize};

/// Cross-section properties
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Section {
    pub id: usize,
    pub name: String,
    /// Cross-sectional area (m²)
    pub a: f64,
    /// Moment of inertia about strong axis (m⁴)
    pub iz: f64,
    /// Section modulus (m³) - optional, computed from iz/y_max
    pub wz: Option<f64>,
    /// Height (m) - for visualization
    pub h: Option<f64>,
    /// Width (m) - for visualization
    pub b: Option<f64>,
}

impl Section {
    pub fn new(id: usize, name: &str, a: f64, iz: f64) -> Self {
        Self {
            id,
            name: name.to_string(),
            a,
            iz,
            wz: None,
            h: None,
            b: None,
        }
    }

    /// Create rectangular section
    /// b: width (m), h: height (m)
    pub fn rectangular(id: usize, name: &str, b: f64, h: f64) -> Self {
        let a = b * h;
        let iz = b * h.powi(3) / 12.0;
        let wz = b * h.powi(2) / 6.0;
        Self {
            id,
            name: name.to_string(),
            a,
            iz,
            wz: Some(wz),
            h: Some(h),
            b: Some(b),
        }
    }

    /// Create circular section
    /// d: diameter (m)
    pub fn circular(id: usize, name: &str, d: f64) -> Self {
        let r = d / 2.0;
        let a = std::f64::consts::PI * r.powi(2);
        let iz = std::f64::consts::PI * r.powi(4) / 4.0;
        let wz = std::f64::consts::PI * r.powi(3) / 4.0;
        Self {
            id,
            name: name.to_string(),
            a,
            iz,
            wz: Some(wz),
            h: Some(d),
            b: Some(d),
        }
    }

    /// Create I-section (simplified: ignoring fillets)
    /// bf: flange width, tf: flange thickness, hw: web height, tw: web thickness
    pub fn i_section(id: usize, name: &str, bf: f64, tf: f64, hw: f64, tw: f64) -> Self {
        let h = hw + 2.0 * tf;
        // Area = 2*flange + web
        let a = 2.0 * bf * tf + hw * tw;
        // I = I_flanges + I_web (parallel axis theorem for flanges)
        let d = (hw + tf) / 2.0; // distance from centroid to flange centroid
        let i_flanges = 2.0 * (bf * tf.powi(3) / 12.0 + bf * tf * d.powi(2));
        let i_web = tw * hw.powi(3) / 12.0;
        let iz = i_flanges + i_web;
        let wz = iz / (h / 2.0);
        Self {
            id,
            name: name.to_string(),
            a,
            iz,
            wz: Some(wz),
            h: Some(h),
            b: Some(bf),
        }
    }

    /// Radius of gyration r = sqrt(I/A)
    pub fn radius_of_gyration(&self) -> f64 {
        (self.iz / self.a).sqrt()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rectangular() {
        // 0.3m x 0.5m beam
        let sec = Section::rectangular(1, "Beam 30x50", 0.3, 0.5);
        assert!((sec.a - 0.15).abs() < 1e-10);
        assert!((sec.iz - 0.003125).abs() < 1e-10); // 0.3 * 0.5³ / 12
    }

    #[test]
    fn test_circular() {
        let sec = Section::circular(1, "Pipe", 0.2);
        let expected_a = std::f64::consts::PI * 0.01; // π * 0.1²
        assert!((sec.a - expected_a).abs() < 1e-10);
    }
}
