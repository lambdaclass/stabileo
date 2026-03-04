use serde::{Deserialize, Serialize};

/// Material properties
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Material {
    pub id: usize,
    pub name: String,
    /// Young's modulus (MPa)
    pub e: f64,
    /// Poisson's ratio
    pub nu: f64,
    /// Density (kN/m³)
    pub rho: f64,
}

impl Material {
    pub fn new(id: usize, name: &str, e: f64, nu: f64, rho: f64) -> Self {
        Self {
            id,
            name: name.to_string(),
            e,
            nu,
            rho,
        }
    }

    /// Shear modulus G = E / (2(1+ν))
    pub fn g(&self) -> f64 {
        self.e / (2.0 * (1.0 + self.nu))
    }

    /// Steel (default: A36/ASTM)
    pub fn steel(id: usize) -> Self {
        Self::new(id, "Steel A36", 200_000.0, 0.3, 78.5)
    }

    /// Concrete (default: H-25)
    pub fn concrete(id: usize) -> Self {
        // E = 4700 * sqrt(f'c) for f'c = 25 MPa
        Self::new(id, "Concrete H-25", 23_500.0, 0.2, 25.0)
    }

    /// Wood (default: pine)
    pub fn wood(id: usize) -> Self {
        Self::new(id, "Pine Wood", 12_000.0, 0.3, 6.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shear_modulus() {
        let steel = Material::steel(1);
        let g = steel.g();
        // G ≈ 76923 MPa for steel
        assert!((g - 76923.08).abs() < 1.0);
    }
}
