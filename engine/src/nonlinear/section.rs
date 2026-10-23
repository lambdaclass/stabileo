//! Sections: materials integrated over a cross-section.

use super::material::UniaxialMaterial;

/// One fiber: its distance `y` from the reference axis along the section's
/// local transverse axis, its area and its material.
#[derive(Clone)]
pub struct Fiber2D {
    pub y: f64,
    pub area: f64,
    pub material: Box<dyn UniaxialMaterial>,
}

/// A 2D fiber section under axial strain ε₀ and curvature κ: fiber strain
/// ε = ε₀ − y·κ, N = Σσ·A, M = −Σσ·y·A (so that M = EI·κ when elastic, and
/// a positive κ compresses the fibers at y > 0).
#[derive(Clone)]
pub struct FiberSection2D {
    pub fibers: Vec<Fiber2D>,
}

impl FiberSection2D {
    pub fn new(fibers: Vec<Fiber2D>) -> Self {
        FiberSection2D { fibers }
    }

    /// A b×h rectangle in `n` layers, centred on the reference axis.
    pub fn rectangle(b: f64, h: f64, n: usize, material: &dyn UniaxialMaterial) -> Self {
        let dy = h / n as f64;
        let fibers = (0..n)
            .map(|i| Fiber2D {
                y: -h / 2.0 + (i as f64 + 0.5) * dy,
                area: b * dy,
                material: material.boxed_clone(),
            })
            .collect();
        FiberSection2D { fibers }
    }

    /// Trial resultants (N, M) and their tangent [[∂N/∂ε₀, ∂N/∂κ], [∂M/∂ε₀, ∂M/∂κ]].
    pub fn update(&mut self, eps0: f64, kappa: f64) -> ([f64; 2], [f64; 4]) {
        let (mut n, mut m) = (0.0, 0.0);
        let (mut k11, mut k12, mut k22) = (0.0, 0.0, 0.0);
        for f in &mut self.fibers {
            f.material.set_trial_strain(eps0 - f.y * kappa);
            let s = f.material.stress() * f.area;
            let et = f.material.tangent() * f.area;
            n += s;
            m -= s * f.y;
            k11 += et;
            k12 -= et * f.y;
            k22 += et * f.y * f.y;
        }
        ([n, m], [k11, k12, k12, k22])
    }

    pub fn commit(&mut self) {
        for f in &mut self.fibers {
            f.material.commit();
        }
    }

    pub fn revert(&mut self) {
        for f in &mut self.fibers {
            f.material.revert();
        }
    }
}
