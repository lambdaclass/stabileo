//! The paper's double-mass von Mises truss at leading order in α (SM §V–VII): the energy (S52)
//! with the constants (S54)–(S57) and the equations of motion (S74)–(S75).
use serde::Serialize;

#[derive(Clone, Copy, Debug, Serialize)]
pub struct Toy {
    pub beta: f64,
    pub l0c: f64,
    pub a1: f64,
    pub a2: f64,
    pub a3: f64,
    pub a4: f64,
    pub b1: f64,
    pub b2: f64,
    pub b3: f64,
    pub b4: f64,
}

impl Toy {
    /// β = 0.110, L₀C = 0.655 (SM p. 20 [SM p. 14]).
    pub fn paper() -> Self {
        Toy::new(0.110, 0.655)
    }

    pub fn new(beta: f64, l0c: f64) -> Self {
        let c = 2.0 + l0c;
        Toy {
            beta,
            l0c,
            a1: 2.0 * beta / 3.0,
            a2: 4.0 * beta / 3.0,
            a3: 2.0 * c / 3.0,
            a4: 2.0 / 3.0,
            b1: (2.0 + l0c * c) * beta / (3.0 * l0c * l0c),
            b2: c * c / (6.0 * l0c),
            b3: c / (6.0 * l0c),
            b4: c * c / (24.0 * l0c * l0c),
        }
    }

    /// ∂Ũ/∂ψ_S at ψ_A = 0 (S60).
    fn gradient(&self, psi: f64, mu: f64) -> f64 {
        -self.a1 + (self.a2 - self.a3 * mu) * psi + self.a4 * psi.powi(3)
    }

    pub fn f(&self, psi: f64, mu: f64) -> f64 {
        self.b1 - self.b2 * mu + self.b3 * psi * psi
    }

    /// The saddle-node (S65): µ*vM and ψ*_S.
    pub fn fold(&self) -> (f64, f64) {
        let mu = self.a2 / self.a3 + 1.5 / self.a3 * (2.0 * self.a1 * self.a1 * self.a4).cbrt();
        (mu, -(self.a1 / (2.0 * self.a4)).cbrt())
    }

    /// The natural (largest) or inverted (smallest) root of (S60).
    pub fn equilibrium(&self, mu: f64, inverted: bool) -> Option<f64> {
        let (_, psi_fold) = self.fold();
        let (lo, hi) = if inverted { (-10.0, psi_fold) } else { (0.0, 10.0) };
        let (g_lo, g_hi) = (self.gradient(lo, mu), self.gradient(hi, mu));
        if g_lo.signum() == g_hi.signum() {
            return None;
        }
        let (mut a, mut b) = (lo, hi);
        for _ in 0..200 {
            let m = 0.5 * (a + b);
            if self.gradient(m, mu).signum() == g_lo.signum() { a = m } else { b = m }
        }
        Some(0.5 * (a + b))
    }

    /// µ_A^vM: where f vanishes on the inverted branch.
    pub fn mu_a(&self) -> f64 {
        let (fold, _) = self.fold();
        let g = |mu: f64| self.f(self.equilibrium(mu, true).unwrap(), mu);
        let (mut a, mut b) = (fold + 1e-9, 5.0);
        for _ in 0..200 {
            let m = 0.5 * (a + b);
            if g(m) < 0.0 { a = m } else { b = m }
        }
        0.5 * (a + b)
    }

    /// Angular frequencies about the natural state in units of α√(k/m), the inverse of the time
    /// scale of (S72) (printed ω/t_osc in (S78)–(S80)), from (S73)–(S75): ω_S² = ½ ∂²Ũ/∂ψ_S²,
    /// ω_A² = 2 f.
    pub fn frequencies(&self, mu: f64) -> (f64, f64) {
        let psi = self.equilibrium(mu, false).unwrap();
        let s = 0.5 * (self.a2 - self.a3 * mu + 3.0 * self.a4 * psi * psi);
        let a = 2.0 * self.f(psi, mu);
        (s.sqrt(), a.sqrt())
    }

    /// t_osc = 2π/ω with ω the lower natural frequency at µ = ¼ (S80), in units of √(m/k)/α.
    pub fn t_osc(&self) -> f64 {
        let (s, a) = self.frequencies(0.25);
        2.0 * std::f64::consts::PI / s.min(a)
    }

    /// Integrates (S74)–(S75) (RK4, τ in periods) from the inverted equilibrium at µ_i with its
    /// quasi-static velocity, µ = µ_i − rate·τ, until ψ_S settles past the natural side.
    /// Returns the least value of f(ψ_S; µ) met and max |ψ_A|/|ψ_A(0)|.
    pub fn run(&self, rate: f64, psi_a0: f64, phase: f64) -> (f64, f64) {
        let t = self.t_osc();
        let k = t * t;
        let mu_i = self.fold().0 + 0.6;
        let psi0 = self.equilibrium(mu_i, true).unwrap();
        let dmu = 1e-6;
        let slope = (self.equilibrium(mu_i + dmu, true).unwrap() - self.equilibrium(mu_i - dmu, true).unwrap()) / (2.0 * dmu);
        let omega_a = (2.0 * self.f(psi0, mu_i)).sqrt() * t;
        let mut y = [psi0, -rate * slope, psi_a0 * phase.cos(), -psi_a0 * omega_a * phase.sin()];
        let rhs = |tau: f64, y: &[f64; 4]| {
            let mu = mu_i - rate * tau;
            let (s, ds, a, da) = (y[0], y[1], y[2], y[3]);
            [
                ds,
                k * (0.5 * self.a1 - 0.5 * (self.a2 - self.a3 * mu) * s - 0.5 * self.a4 * s.powi(3) - 0.5 * self.b3 * s * a * a),
                da,
                k * (-2.0 * self.f(s, mu) * a - 2.0 * self.b4 * a.powi(3)),
            ]
        };
        let h = 1e-3;
        let mut tau = 0.0;
        let mut least = f64::INFINITY;
        let mut peak: f64 = psi_a0.abs();
        let mut after = f64::INFINITY;
        while tau < after {
            let k1 = rhs(tau, &y);
            let s2: [f64; 4] = std::array::from_fn(|i| y[i] + 0.5 * h * k1[i]);
            let k2 = rhs(tau + 0.5 * h, &s2);
            let s3: [f64; 4] = std::array::from_fn(|i| y[i] + 0.5 * h * k2[i]);
            let k3 = rhs(tau + 0.5 * h, &s3);
            let s4: [f64; 4] = std::array::from_fn(|i| y[i] + h * k3[i]);
            let k4 = rhs(tau + h, &s4);
            for i in 0..4 {
                y[i] += h / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
            }
            tau += h;
            let mu = mu_i - rate * tau;
            least = least.min(self.f(y[0], mu));
            peak = peak.max(y[2].abs());
            if after.is_infinite() && y[0] > 0.0 {
                after = tau + 1.0;
            }
            if tau > 1e5 {
                break;
            }
        }
        (least, peak / psi_a0.abs())
    }

    /// The rate at which the trajectory just grazes f = 0 (bisection on the sign of min f).
    pub fn critical_rate(&self) -> f64 {
        let (mut slow, mut fast) = (0.01f64, 1.0f64);
        for _ in 0..40 {
            let m = (slow * fast).sqrt();
            if self.run(m, 1e-9, 0.0).0 < 0.0 { slow = m } else { fast = m }
        }
        (slow * fast).sqrt()
    }
}
