//! Plane-stress materials: the law at one layer of a shell.
//!
//! Vectors are (σxx, σyy, σxy) and (εxx, εyy, γxy), with the engineering
//! shear strain γ = 2ε. Matrices are 3×3, row-major.

/// One material point under plane stress. Same trial/commit/revert contract
/// as [`super::UniaxialMaterial`].
pub trait PlaneStressMaterial: Send {
    fn set_trial_strain(&mut self, strain: [f64; 3]) -> Result<(), String>;
    fn stress(&self) -> [f64; 3];
    fn tangent(&self) -> [f64; 9];
    fn commit(&mut self);
    fn revert(&mut self);
    fn boxed_clone(&self) -> Box<dyn PlaneStressMaterial>;
}

impl Clone for Box<dyn PlaneStressMaterial> {
    fn clone(&self) -> Self {
        self.boxed_clone()
    }
}

fn elastic_matrix(e: f64, nu: f64) -> [f64; 9] {
    let c = e / (1.0 - nu * nu);
    [c, c * nu, 0.0, c * nu, c, 0.0, 0.0, 0.0, c * (1.0 - nu) / 2.0]
}

fn compliance(e: f64, nu: f64) -> [f64; 9] {
    [1.0 / e, -nu / e, 0.0, -nu / e, 1.0 / e, 0.0, 0.0, 0.0, 2.0 * (1.0 + nu) / e]
}

/// The von Mises projection for plane stress: σᵀPσ = (2/3)·σ_eq².
const P: [f64; 9] = [2.0 / 3.0, -1.0 / 3.0, 0.0, -1.0 / 3.0, 2.0 / 3.0, 0.0, 0.0, 0.0, 2.0];

fn mv(a: &[f64; 9], x: &[f64; 3]) -> [f64; 3] {
    [
        a[0] * x[0] + a[1] * x[1] + a[2] * x[2],
        a[3] * x[0] + a[4] * x[1] + a[5] * x[2],
        a[6] * x[0] + a[7] * x[1] + a[8] * x[2],
    ]
}

fn dot(a: &[f64; 3], b: &[f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn inv3(a: &[f64; 9]) -> Option<[f64; 9]> {
    let det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6])
        + a[2] * (a[3] * a[7] - a[4] * a[6]);
    if !det.is_finite() || det.abs() < 1e-300 {
        return None;
    }
    let d = 1.0 / det;
    Some([
        (a[4] * a[8] - a[5] * a[7]) * d,
        (a[2] * a[7] - a[1] * a[8]) * d,
        (a[1] * a[5] - a[2] * a[4]) * d,
        (a[5] * a[6] - a[3] * a[8]) * d,
        (a[0] * a[8] - a[2] * a[6]) * d,
        (a[2] * a[3] - a[0] * a[5]) * d,
        (a[3] * a[7] - a[4] * a[6]) * d,
        (a[1] * a[6] - a[0] * a[7]) * d,
        (a[0] * a[4] - a[1] * a[3]) * d,
    ])
}

/// Linear elastic, isotropic.
#[derive(Debug, Clone)]
pub struct PlaneStressElastic {
    c: [f64; 9],
    strain: [f64; 3],
}

impl PlaneStressElastic {
    pub fn new(e: f64, nu: f64) -> Self {
        PlaneStressElastic { c: elastic_matrix(e, nu), strain: [0.0; 3] }
    }
}

impl PlaneStressMaterial for PlaneStressElastic {
    fn set_trial_strain(&mut self, strain: [f64; 3]) -> Result<(), String> {
        self.strain = strain;
        Ok(())
    }
    fn stress(&self) -> [f64; 3] {
        mv(&self.c, &self.strain)
    }
    fn tangent(&self) -> [f64; 9] {
        self.c
    }
    fn commit(&mut self) {}
    fn revert(&mut self) {}
    fn boxed_clone(&self) -> Box<dyn PlaneStressMaterial> {
        Box::new(self.clone())
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct J2State {
    plastic_strain: [f64; 3],
    /// Equivalent plastic strain.
    alpha: f64,
}

/// Von Mises (J2) plasticity in plane stress, linear isotropic hardening:
/// σ_y(α) = σ_y0 + H·α. Closest-point return mapping in the plane-stress
/// subspace (Simo & Taylor 1986; Simo & Hughes, *Computational Inelasticity*,
/// §3.4), with its consistent tangent.
///
/// With `fy` and E/1000 for `h` this is EN 1993-1-5 Annex C's plate law.
#[derive(Debug, Clone)]
pub struct PlaneStressJ2 {
    e: f64,
    nu: f64,
    fy: f64,
    h: f64,
    committed: J2State,
    trial: J2State,
    stress: [f64; 3],
    tangent: [f64; 9],
}

impl PlaneStressJ2 {
    pub fn new(e: f64, nu: f64, fy: f64, h: f64) -> Self {
        PlaneStressJ2 {
            e,
            nu,
            fy,
            h,
            committed: J2State::default(),
            trial: J2State::default(),
            stress: [0.0; 3],
            tangent: elastic_matrix(e, nu),
        }
    }

    /// Equivalent plastic strain of the trial state.
    pub fn equivalent_plastic_strain(&self) -> f64 {
        self.trial.alpha
    }

    fn kappa(&self, alpha: f64) -> f64 {
        self.fy + self.h * alpha
    }
}

impl PlaneStressMaterial for PlaneStressJ2 {
    fn set_trial_strain(&mut self, strain: [f64; 3]) -> Result<(), String> {
        let n = self.committed;
        let c = elastic_matrix(self.e, self.nu);
        let elastic_strain = [
            strain[0] - n.plastic_strain[0],
            strain[1] - n.plastic_strain[1],
            strain[2] - n.plastic_strain[2],
        ];
        let sigma_tr = mv(&c, &elastic_strain);
        let xi_tr = dot(&sigma_tr, &mv(&P, &sigma_tr));
        let k_n = self.kappa(n.alpha);
        if 0.5 * xi_tr - k_n * k_n / 3.0 <= 1e-12 * k_n * k_n {
            self.trial = n;
            self.stress = sigma_tr;
            self.tangent = c;
            return Ok(());
        }

        // σ(Δγ) = Ξ(Δγ)·(ε − εp_n), Ξ = (C⁻¹ + Δγ·P)⁻¹; solve the consistency
        // condition g(Δγ) = ½·σᵀPσ − ⅓·κ(α)² = 0 for Δγ ≥ 0 by Newton.
        let cinv = compliance(self.e, self.nu);
        let sqrt23 = (2.0f64 / 3.0).sqrt();
        let stress_at = |dg: f64| -> Option<([f64; 3], [f64; 9], f64)> {
            let mut m = cinv;
            for i in 0..9 {
                m[i] += dg * P[i];
            }
            let xi_m = inv3(&m)?;
            let s = mv(&xi_m, &elastic_strain);
            let xi = dot(&s, &mv(&P, &s));
            Some((s, xi_m, xi))
        };
        let mut dg = 0.0;
        let mut converged = false;
        for _ in 0..60 {
            let (s, xi_m, xi) = stress_at(dg).ok_or("J2 return mapping: singular Ξ")?;
            let alpha = n.alpha + sqrt23 * dg * xi.sqrt();
            let kappa = self.kappa(alpha);
            let g = 0.5 * xi - kappa * kappa / 3.0;
            if g.abs() <= 1e-12 * k_n * k_n {
                converged = true;
                break;
            }
            // dξ/dΔγ = −2·σᵀPΞPσ
            let ps = mv(&P, &s);
            let d = dot(&ps, &mv(&xi_m, &ps));
            let dxi = -2.0 * d;
            let dalpha = sqrt23 * (xi.sqrt() + dg * dxi / (2.0 * xi.sqrt().max(1e-300)));
            let dg_dg = 0.5 * dxi - 2.0 / 3.0 * kappa * self.h * dalpha;
            if dg_dg == 0.0 || !dg_dg.is_finite() {
                break;
            }
            let next = dg - g / dg_dg;
            dg = if next < 0.0 { 0.5 * dg } else { next };
        }
        if !converged {
            return Err("J2 return mapping did not converge".into());
        }

        let (s, xi_m, xi) = stress_at(dg).ok_or("J2 return mapping: singular Ξ")?;
        let root = xi.sqrt();
        let alpha = n.alpha + sqrt23 * dg * root;
        let kappa = self.kappa(alpha);
        let ps = mv(&P, &s);
        let mut plastic_strain = n.plastic_strain;
        for i in 0..3 {
            plastic_strain[i] += dg * ps[i];
        }

        // Consistent tangent: C_ep = Ξ − n·nᵀ / (σᵀPΞPσ + a₂/a₁), n = ΞPσ,
        // a₁ = 1 − (2/3)√(2/3)·κ·H·Δγ/√ξ, a₂ = (2/3)√(2/3)·κ·H·√ξ.
        let nvec = mv(&xi_m, &ps);
        let d = dot(&ps, &nvec);
        let a1 = 1.0 - 2.0 / 3.0 * sqrt23 * kappa * self.h * dg / root;
        let a2 = 2.0 / 3.0 * sqrt23 * kappa * self.h * root;
        let denom = d + a2 / a1;
        let mut ct = xi_m;
        for i in 0..3 {
            for j in 0..3 {
                ct[3 * i + j] -= nvec[i] * nvec[j] / denom;
            }
        }

        self.trial = J2State { plastic_strain, alpha };
        self.stress = s;
        self.tangent = ct;
        Ok(())
    }
    fn stress(&self) -> [f64; 3] {
        self.stress
    }
    fn tangent(&self) -> [f64; 9] {
        self.tangent
    }
    fn commit(&mut self) {
        self.committed = self.trial;
    }
    fn revert(&mut self) {
        self.trial = self.committed;
    }
    fn boxed_clone(&self) -> Box<dyn PlaneStressMaterial> {
        Box::new(self.clone())
    }
}
