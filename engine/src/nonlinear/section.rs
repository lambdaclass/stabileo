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

/// One fiber of a 3D section: position (y, z) in the section's local axes,
/// area and material.
#[derive(Clone)]
pub struct Fiber3D {
    pub y: f64,
    pub z: f64,
    pub area: f64,
    pub material: Box<dyn UniaxialMaterial>,
}

/// A 3D fiber section under axial strain ε₀ and curvatures κ_y, κ_z: fiber
/// strain ε = ε₀ + z·κ_y − y·κ_z; N = Σσ·A, M_y = Σσ·z·A, M_z = −Σσ·y·A (so
/// that M = EI·κ about each axis when elastic). Torsion is the element's.
#[derive(Clone)]
pub struct FiberSection3D {
    pub fibers: Vec<Fiber3D>,
}

impl FiberSection3D {
    pub fn new(fibers: Vec<Fiber3D>) -> Self {
        FiberSection3D { fibers }
    }

    /// A rectangle `width` along local y by `depth` along local z, in
    /// `ny` × `nz` fibers, centred on the reference axis.
    pub fn rectangle(width: f64, depth: f64, ny: usize, nz: usize, material: &dyn UniaxialMaterial) -> Self {
        let (dy, dz) = (width / ny as f64, depth / nz as f64);
        let mut fibers = Vec::with_capacity(ny * nz);
        for i in 0..ny {
            for j in 0..nz {
                fibers.push(Fiber3D {
                    y: -width / 2.0 + (i as f64 + 0.5) * dy,
                    z: -depth / 2.0 + (j as f64 + 0.5) * dz,
                    area: dy * dz,
                    material: material.boxed_clone(),
                });
            }
        }
        FiberSection3D { fibers }
    }

    /// Trial resultants (N, M_y, M_z) and their 3×3 tangent with respect to
    /// (ε₀, κ_y, κ_z), row-major.
    pub fn update(&mut self, eps0: f64, ky: f64, kz: f64) -> ([f64; 3], [f64; 9]) {
        let mut s = [0.0; 3];
        let mut k = [0.0; 9];
        for f in &mut self.fibers {
            f.material.set_trial_strain(eps0 + f.z * ky - f.y * kz);
            let g = [1.0, f.z, -f.y];
            let sa = f.material.stress() * f.area;
            let ea = f.material.tangent() * f.area;
            for a in 0..3 {
                s[a] += sa * g[a];
                for b in 0..3 {
                    k[3 * a + b] += ea * g[a] * g[b];
                }
            }
        }
        (s, k)
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
