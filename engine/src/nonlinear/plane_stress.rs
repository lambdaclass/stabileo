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

/// Isotropic hardening: the yield stress as a function of the equivalent
/// plastic strain α.
#[derive(Debug, Clone, PartialEq)]
pub enum Hardening {
    /// σ_y(α) = σ_y0 + H·α.
    Linear { fy: f64, h: f64 },
    /// Piecewise linear through (α, σ_y) points, starting at α = 0 with α
    /// increasing; flat (perfectly plastic) beyond the last point.
    Table(Vec<(f64, f64)>),
}

impl Hardening {
    fn validate(&self) -> Result<(), String> {
        match self {
            Hardening::Linear { fy, h } => {
                if !(fy.is_finite() && *fy > 0.0 && h.is_finite()) {
                    return Err("linear hardening needs a positive yield stress and a finite slope".into());
                }
            }
            Hardening::Table(points) => {
                let ok = !points.is_empty()
                    && points[0].0 == 0.0
                    && points[0].1 > 0.0
                    && points.iter().all(|(a, s)| a.is_finite() && s.is_finite())
                    && points.windows(2).all(|w| w[1].0 > w[0].0);
                if !ok {
                    return Err("a hardening table starts at α = 0 with a positive yield stress, α strictly increasing".into());
                }
            }
        }
        Ok(())
    }

    /// σ_y(α) and dσ_y/dα (the slope of the segment α lies in).
    fn eval(&self, alpha: f64) -> (f64, f64) {
        match self {
            Hardening::Linear { fy, h } => (fy + h * alpha, *h),
            Hardening::Table(points) => {
                for w in points.windows(2) {
                    let ((a0, s0), (a1, s1)) = (w[0], w[1]);
                    if alpha < a1 {
                        let slope = (s1 - s0) / (a1 - a0);
                        return (s0 + slope * (alpha - a0), slope);
                    }
                }
                (points[points.len() - 1].1, 0.0)
            }
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct J2State {
    plastic_strain: [f64; 3],
    /// Back stress (σxx, σyy, σxy) of kinematic hardening.
    back_stress: [f64; 3],
    /// Equivalent plastic strain.
    alpha: f64,
}

fn mm(a: &[f64; 9], b: &[f64; 9]) -> [f64; 9] {
    let mut c = [0.0; 9];
    for i in 0..3 {
        for j in 0..3 {
            c[3 * i + j] = (0..3).map(|k| a[3 * i + k] * b[3 * k + j]).sum();
        }
    }
    c
}

/// diag(1, 1, ½): an engineering-shear strain vector to its stress-like
/// tensor components (Prager: β̇ = ⅔·H_k·ε̇ᵖ as tensors).
const D: [f64; 9] = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.5];

/// Von Mises (J2) plasticity in plane stress, with isotropic hardening
/// ([`Hardening`]: linear or tabulated) and linear kinematic hardening
/// (Prager, modulus H_k). Closest-point return mapping in the plane-stress
/// subspace (Simo & Taylor 1986; Simo & Hughes, *Computational Inelasticity*,
/// §3.4), with its consistent tangent.
///
/// With η = σ − β the relative stress, the return is
/// η = [I + Δγ·(C + ⅔·H_k·D)·P]⁻¹·η_trial, and Δγ solves
/// ½·ηᵀPη = ⅓·σ_y(α)² by Newton safeguarded with a bisection bracket (robust
/// for large increments and for the kinks of a table). A softening slope
/// with 3G + H ≤ 0 has no unique solution and is refused.
///
/// With `fy` and E/1000 for `h` this is EN 1993-1-5 Annex C's plate law.
#[derive(Debug, Clone)]
pub struct PlaneStressJ2 {
    e: f64,
    nu: f64,
    hardening: Hardening,
    kinematic: f64,
    committed: J2State,
    trial: J2State,
    stress: [f64; 3],
    tangent: [f64; 9],
}

impl PlaneStressJ2 {
    /// Linear isotropic hardening σ_y(α) = fy + h·α, no kinematic hardening.
    pub fn new(e: f64, nu: f64, fy: f64, h: f64) -> Self {
        Self::with_hardening(e, nu, Hardening::Linear { fy, h }, 0.0).expect("valid linear hardening")
    }

    /// Any isotropic hardening, plus linear kinematic hardening of modulus
    /// `kinematic` (0 for none).
    pub fn with_hardening(e: f64, nu: f64, hardening: Hardening, kinematic: f64) -> Result<Self, String> {
        hardening.validate()?;
        if !(e > 0.0 && (-1.0..0.5).contains(&nu) && kinematic.is_finite()) {
            return Err("J2 needs E > 0, −1 < ν < ½ and a finite kinematic modulus".into());
        }
        Ok(PlaneStressJ2 {
            e,
            nu,
            hardening,
            kinematic,
            committed: J2State::default(),
            trial: J2State::default(),
            stress: [0.0; 3],
            tangent: elastic_matrix(e, nu),
        })
    }

    /// Equivalent plastic strain of the trial state.
    pub fn equivalent_plastic_strain(&self) -> f64 {
        self.trial.alpha
    }

    /// Back stress of the trial state.
    pub fn back_stress(&self) -> [f64; 3] {
        self.trial.back_stress
    }

    fn refuse_softening(&self, slope: f64) -> Result<(), String> {
        let g = self.e / (2.0 * (1.0 + self.nu));
        if 3.0 * g + slope + self.kinematic <= 0.0 {
            return Err(format!("J2: softening slope {} with 3G = {} has no unique return", slope + self.kinematic, 3.0 * g));
        }
        Ok(())
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
        let eta_tr = [sigma_tr[0] - n.back_stress[0], sigma_tr[1] - n.back_stress[1], sigma_tr[2] - n.back_stress[2]];
        let xi_tr = dot(&eta_tr, &mv(&P, &eta_tr));
        let (k_n, _) = self.hardening.eval(n.alpha);
        if 0.5 * xi_tr - k_n * k_n / 3.0 <= 1e-12 * k_n * k_n {
            self.trial = n;
            self.stress = sigma_tr;
            self.tangent = c;
            return Ok(());
        }

        let hk = self.kinematic;
        let mut m = c;
        for i in 0..9 {
            m[i] += 2.0 / 3.0 * hk * D[i];
        }
        let mp = mm(&m, &P);
        let sqrt23 = (2.0f64 / 3.0).sqrt();
        // η(Δγ) = A⁻¹·η_trial, A = I + Δγ·M·P.
        let relative = |dg: f64| -> Option<([f64; 3], [f64; 9])> {
            let mut a = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
            for i in 0..9 {
                a[i] += dg * mp[i];
            }
            let ainv = inv3(&a)?;
            Some((mv(&ainv, &eta_tr), ainv))
        };
        // g(Δγ) = ½·ξ − ⅓·σ_y(α)² and g'(Δγ).
        let consistency = |dg: f64| -> Option<(f64, f64, f64)> {
            let (eta, ainv) = relative(dg)?;
            let pe = mv(&P, &eta);
            let xi = dot(&eta, &pe);
            let root = xi.sqrt();
            let alpha = n.alpha + sqrt23 * dg * root;
            let (kappa, slope) = self.hardening.eval(alpha);
            let g = 0.5 * xi - kappa * kappa / 3.0;
            let deta = mv(&ainv, &mv(&mp, &eta)).map(|x| -x);
            let dxi = 2.0 * dot(&pe, &deta);
            let dalpha = sqrt23 * (root + dg * dxi / (2.0 * root.max(1e-300)));
            Some((g, 0.5 * dxi - 2.0 / 3.0 * kappa * slope * dalpha, slope))
        };

        self.refuse_softening(self.hardening.eval(n.alpha).1)?;
        let tol = 1e-12 * k_n * k_n;
        let (mut lo, mut hi) = (0.0f64, f64::INFINITY);
        let mut dg = 0.0;
        let mut converged = false;
        for _ in 0..200 {
            let (g, dgdx, slope) = consistency(dg).ok_or("J2 return mapping: singular A")?;
            self.refuse_softening(slope)?;
            if g.abs() <= tol {
                converged = true;
                break;
            }
            if g > 0.0 { lo = dg } else { hi = dg }
            let newton = if dgdx != 0.0 && dgdx.is_finite() { dg - g / dgdx } else { f64::NAN };
            dg = if newton.is_finite() && newton > lo && newton < hi {
                newton
            } else if hi.is_finite() {
                0.5 * (lo + hi)
            } else {
                // No upper bracket yet: grow until g turns negative.
                (2.0 * lo).max(1e-12 / self.e)
            };
            if hi.is_finite() && hi - lo <= 1e-15 * hi {
                converged = true;
                break;
            }
        }
        if !converged {
            return Err("J2 return mapping did not converge".into());
        }

        let (eta, ainv) = relative(dg).ok_or("J2 return mapping: singular A")?;
        let pe = mv(&P, &eta);
        let root = dot(&eta, &pe).sqrt();
        let alpha = n.alpha + sqrt23 * dg * root;
        let (kappa, slope) = self.hardening.eval(alpha);
        self.refuse_softening(slope)?;
        let mut plastic_strain = n.plastic_strain;
        let mut back_stress = n.back_stress;
        let dpe = mv(&D, &pe);
        for i in 0..3 {
            plastic_strain[i] += dg * pe[i];
            back_stress[i] += 2.0 / 3.0 * hk * dg * dpe[i];
        }
        let stress = [eta[0] + back_stress[0], eta[1] + back_stress[1], eta[2] + back_stress[2]];

        // Consistent tangent (derived for combined hardening; it reduces to
        // Simo–Hughes' Ξ − n·nᵀ/(nᵀPη + a₂/a₁) without kinematic hardening):
        //   n = A⁻¹Pη, a₁ = 1 − ⅔√⅔·κκ'Δγ/s, a₂ = ⅔√⅔·κκ's, d = nᵀ·M·P·η,
        //   dΔγ = a₁·nᵀC·dε / (a₂ + a₁·d),
        //   dσ = B·A⁻¹·(C·dε − dΔγ·M·P·η) + ⅔H_k·dΔγ·D·P·η, B = I + ⅔H_kΔγ·D·P,
        // so C_ep = B·A⁻¹·C − (B·A⁻¹·M·P·η − ⅔H_k·D·P·η) ⊗ a₁·C·n / (a₂ + a₁·d).
        let nvec = mv(&ainv, &pe);
        let a1 = 1.0 - 2.0 / 3.0 * sqrt23 * kappa * slope * dg / root;
        let a2 = 2.0 / 3.0 * sqrt23 * kappa * slope * root;
        let mpe = mv(&mp, &eta);
        let d = dot(&nvec, &mpe);
        let mut b = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
        let dp = mm(&D, &P);
        for i in 0..9 {
            b[i] += 2.0 / 3.0 * hk * dg * dp[i];
        }
        let bainv = mm(&b, &ainv);
        let mut ct = mm(&bainv, &c);
        let left = {
            let x = mv(&bainv, &mpe);
            let y = mv(&D, &pe);
            [x[0] - 2.0 / 3.0 * hk * y[0], x[1] - 2.0 / 3.0 * hk * y[1], x[2] - 2.0 / 3.0 * hk * y[2]]
        };
        let right = mv(&c, &nvec).map(|x| a1 * x / (a2 + a1 * d));
        for i in 0..3 {
            for j in 0..3 {
                ct[3 * i + j] -= left[i] * right[j];
            }
        }

        self.trial = J2State { plastic_strain, back_stress, alpha };
        self.stress = stress;
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
