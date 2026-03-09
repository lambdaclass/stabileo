/// Cable/catenary element formulations.
///
/// References:
///   - Irvine, "Cable Structures" (1981), MIT Press
///   - Ernst, "Der E-Modul von Seilen" (1965), Der Stahlbau 34(11)
///   - Gimsing & Georgakis, "Cable Supported Bridges" 3rd Ed.
///   - EN 1993-1-11:2006 Tension components
/// Exact catenary ordinate y(x) for a cable spanning from (0,0) to (L,h)
/// under self-weight w per unit horizontal length.
///
/// y(x) = (H/w) * [cosh(w*(x - x0)/H) - cosh(w*x0/H)]
///
/// where x0 is the parameter satisfying the end condition y(L) = h.
/// Returns (y, dy_dx) at position x.
pub fn catenary_ordinate(h_thrust: f64, w: f64, l: f64, h: f64, x: f64) -> (f64, f64) {
    if w.abs() < 1e-15 || h_thrust.abs() < 1e-15 {
        // Degenerate: straight line
        let t = x / l;
        return (h * t, h / l);
    }

    let a = h_thrust / w; // catenary parameter

    // x0 from end condition: h = a * [cosh(w*(L-x0)/H) - cosh(w*x0/H)]
    // Use Newton-Raphson to solve for x0
    let mut x0 = l / 2.0; // initial guess (symmetric)

    for _ in 0..50 {
        let arg1 = (l - x0) / a;
        let arg2 = x0 / a;
        let f_val = a * (arg1.cosh() - arg2.cosh()) - h;
        let f_deriv = -arg1.sinh() - arg2.sinh(); // d/dx0
        if f_deriv.abs() < 1e-30 {
            break;
        }
        let dx0 = f_val / f_deriv;
        x0 -= dx0;
        if dx0.abs() < 1e-12 {
            break;
        }
    }

    let y = a * ((x - x0) / a).cosh() - a * ((-x0) / a).cosh();
    let dy_dx = ((x - x0) / a).sinh();

    (y, dy_dx)
}

/// Parabolic cable ordinate (approximate, valid when sag/span < 1/8).
///
/// y(x) = h*x/L + 4*f*x*(L-x)/L²
///
/// where f = wL²/(8H) is the midspan sag below chord.
pub fn parabolic_ordinate(h_thrust: f64, w: f64, l: f64, h: f64, x: f64) -> (f64, f64) {
    if h_thrust.abs() < 1e-15 {
        let t = x / l;
        return (h * t, h / l);
    }

    let f_sag = w * l * l / (8.0 * h_thrust);
    let y = h * x / l + 4.0 * f_sag * x * (l - x) / (l * l);
    let dy_dx = h / l + 4.0 * f_sag * (l - 2.0 * x) / (l * l);

    (y, dy_dx)
}

/// Midspan sag for a cable under uniform load w with horizontal thrust H.
///
/// f = wL²/(8H)  (parabolic approximation)
pub fn cable_sag(w: f64, l: f64, h_thrust: f64) -> f64 {
    if h_thrust.abs() < 1e-15 {
        return f64::INFINITY;
    }
    w * l * l / (8.0 * h_thrust)
}

/// Horizontal thrust from sag and load.
///
/// H = wL²/(8f)
pub fn cable_thrust(w: f64, l: f64, sag: f64) -> f64 {
    if sag.abs() < 1e-15 {
        return f64::INFINITY;
    }
    w * l * l / (8.0 * sag)
}

/// Cable unstretched length (parabolic approximation).
///
/// S ≈ L * [1 + 8(f/L)²/3 - 32(f/L)⁴/5 + ...]
/// For small sag: S ≈ L + 8f²/(3L)
pub fn cable_length_parabolic(l: f64, sag: f64) -> f64 {
    let ratio = sag / l;
    l * (1.0 + 8.0 * ratio * ratio / 3.0 - 32.0 * ratio.powi(4) / 5.0)
}

/// Exact catenary length.
///
/// S = (H/w) * sinh(wL/H)  (for level cable)
/// For inclined: S = √(h² + (2*a*sinh(wL/(2H)))²)  where a = H/w
pub fn cable_length_catenary(h_thrust: f64, w: f64, l: f64, h: f64) -> f64 {
    if w.abs() < 1e-15 {
        return (l * l + h * h).sqrt();
    }
    let a = h_thrust / w;
    // General formula: integrate sqrt(1 + y'²) dx from 0 to L
    // For catenary: y' = sinh((x-x0)/a), so sqrt(1+y'²) = cosh((x-x0)/a)
    // S = a * [sinh((L-x0)/a) - sinh(-x0/a)]

    // First solve for x0 (same as in catenary_ordinate)
    let mut x0 = l / 2.0;
    for _ in 0..50 {
        let arg1 = (l - x0) / a;
        let arg2 = x0 / a;
        let f_val = a * (arg1.cosh() - arg2.cosh()) - h;
        let f_deriv = -arg1.sinh() - arg2.sinh();
        if f_deriv.abs() < 1e-30 {
            break;
        }
        let dx0 = f_val / f_deriv;
        x0 -= dx0;
        if dx0.abs() < 1e-12 {
            break;
        }
    }

    a * ((l - x0) / a).sinh() - a * ((-x0) / a).sinh()
}

/// Ernst equivalent elastic modulus for a cable.
///
/// Accounts for sag effect on apparent axial stiffness.
/// E_eq = E / [1 + (γ·L_h)²·E·A / (12·T³)]
///
/// where γ = w (weight per unit horizontal length), L_h = horizontal span,
/// T = cable tension, E = Young's modulus, A = cross-section area.
///
/// Ref: Ernst (1965), also Gimsing Ch. 3.
pub fn ernst_equivalent_modulus(e: f64, a: f64, w: f64, l_h: f64, tension: f64) -> f64 {
    if tension.abs() < 1e-15 {
        return 0.0;
    }
    let wl = w * l_h;
    let denominator = 1.0 + wl * wl * e * a / (12.0 * tension * tension * tension);
    e / denominator
}

/// Cable tangent modulus for incremental analysis.
///
/// E_tan = E / [1 + (γ·L_h)²·E·A / (12·σ³·A³)]
///
/// This is the derivative of the Ernst formula at current tension.
pub fn ernst_tangent_modulus(e: f64, a: f64, w: f64, l_h: f64, tension: f64) -> f64 {
    if tension.abs() < 1e-15 {
        return 0.0;
    }
    let wl = w * l_h;
    let alpha = wl * wl * e * a / (12.0 * tension.powi(3));
    let denom = (1.0 + alpha) * (1.0 + alpha);
    e * (1.0 + alpha * (1.0 - 3.0 * alpha / (1.0 + alpha))) / denom
}

/// 2D cable global stiffness matrix (4×4) using Ernst equivalent modulus.
///
/// Same as truss but with E_eq replacing E. The cable has no bending stiffness.
/// DOFs: [ux_i, uy_i, ux_j, uy_j]
pub fn cable_global_stiffness_2d(
    e_eq: f64,
    a: f64,
    l: f64,
    cos: f64,
    sin: f64,
) -> Vec<f64> {
    let ea_l = e_eq * a / l;
    let c2 = cos * cos;
    let s2 = sin * sin;
    let cs = cos * sin;

    vec![
        ea_l * c2,  ea_l * cs, -ea_l * c2, -ea_l * cs,
        ea_l * cs,  ea_l * s2, -ea_l * cs, -ea_l * s2,
       -ea_l * c2, -ea_l * cs,  ea_l * c2,  ea_l * cs,
       -ea_l * cs, -ea_l * s2,  ea_l * cs,  ea_l * s2,
    ]
}

/// 3D cable global stiffness matrix (6×6) using Ernst equivalent modulus.
///
/// DOFs: [ux_i, uy_i, uz_i, ux_j, uy_j, uz_j]
pub fn cable_global_stiffness_3d(
    e_eq: f64,
    a: f64,
    l: f64,
    dx: f64,
    dy: f64,
    dz: f64,
) -> Vec<f64> {
    let ea_l = e_eq * a / l;
    let dir = [dx / l, dy / l, dz / l];
    let mut k = vec![0.0; 36];

    for i in 0..3 {
        for j in 0..3 {
            let val = ea_l * dir[i] * dir[j];
            k[(i) * 6 + (j)] = val;
            k[(i) * 6 + (j + 3)] = -val;
            k[(i + 3) * 6 + (j)] = -val;
            k[(i + 3) * 6 + (j + 3)] = val;
        }
    }

    k
}

/// Self-weight per unit horizontal length for a cable.
///
/// w = ρ * A * g  (kN/m if ρ in t/m³, A in m², g ≈ 9.81 m/s²)
/// Note: For inclined cables, this is per unit *chord* length.
pub fn cable_self_weight(density: f64, area: f64) -> f64 {
    density * area * 9.80665
}

/// Compute cable tension at supports from horizontal thrust and cable angle.
///
/// T_i = H / cos(θ_i),  T_j = H / cos(θ_j)
/// where θ = atan(dy/dx) at each end.
pub fn cable_end_tensions(h_thrust: f64, slope_i: f64, slope_j: f64) -> (f64, f64) {
    let t_i = h_thrust * (1.0 + slope_i * slope_i).sqrt();
    let t_j = h_thrust * (1.0 + slope_j * slope_j).sqrt();
    (t_i, t_j)
}

/// Natural frequency of a taut cable (Hz).
///
/// f_n = (n / 2L) * √(T / (ρA))
///
/// Ref: Irvine (1981), Ch. 3
pub fn cable_natural_frequency(
    n_mode: usize,
    l: f64,
    tension: f64,
    density: f64,
    area: f64,
) -> f64 {
    let mass_per_length = density * area;
    if mass_per_length < 1e-15 || l < 1e-15 {
        return 0.0;
    }
    (n_mode as f64) / (2.0 * l) * (tension / mass_per_length).sqrt()
}

/// Irvine parameter λ² for cable dynamics.
///
/// λ² = (wL/H)² * (L_e / L) * (EA·L / H·L_e)
/// Simplified for flat cable: λ² = (wL)²·L / (H³·L_e/(EA))
///
/// Controls in-plane symmetric mode behavior.
/// λ² < 4π² → antisymmetric mode governs
/// λ² > 4π² → symmetric mode governs (crossover)
pub fn irvine_parameter(w: f64, l: f64, h_thrust: f64, e: f64, a: f64) -> f64 {
    if h_thrust.abs() < 1e-15 {
        return f64::INFINITY;
    }
    let wl_h = w * l / h_thrust;
    // Effective length ratio (≈1 for flat cables)
    let le_ratio = 1.0 + 8.0 * (cable_sag(w, l, h_thrust) / l).powi(2);
    wl_h * wl_h * e * a * l / (h_thrust * le_ratio)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cable_sag_thrust() {
        // w=10 kN/m, L=100m, H=1250 kN → f = 10*100²/(8*1250) = 10 m
        let f = cable_sag(10.0, 100.0, 1250.0);
        assert!((f - 10.0).abs() < 1e-10);

        // Reverse: H from sag
        let h = cable_thrust(10.0, 100.0, 10.0);
        assert!((h - 1250.0).abs() < 1e-10);
    }

    #[test]
    fn test_ernst_modulus() {
        // Steel cable: E=200000 MPa, A=0.005 m², w=0.5 kN/m, L=200m, T=500 kN
        let e_eq = ernst_equivalent_modulus(200_000.0, 0.005, 0.5, 200.0, 500.0);
        // (0.5*200)² * 200000 * 0.005 / (12 * 500³) = 10000 * 1000 / 1.5e9 = 0.00667
        // E_eq = 200000 / 1.00667 ≈ 198676
        assert!(e_eq < 200_000.0);
        assert!(e_eq > 190_000.0);

        // High tension → E_eq → E
        let e_eq_high = ernst_equivalent_modulus(200_000.0, 0.005, 0.5, 200.0, 50_000.0);
        assert!((e_eq_high - 200_000.0).abs() / 200_000.0 < 0.001);
    }

    #[test]
    fn test_cable_length() {
        // Level cable: L=100m, f=10m
        let s = cable_length_parabolic(100.0, 10.0);
        // S ≈ 100 + 8*100/(3*100) = 100 + 2.667 ≈ 102.667
        assert!((s - 102.667).abs() < 0.1);
    }

    #[test]
    fn test_parabolic_ordinate() {
        // Level cable: H=1250, w=10, L=100
        let (y_mid, _) = parabolic_ordinate(1250.0, 10.0, 100.0, 0.0, 50.0);
        // y(50) = 4*10*50*50/(100²) = 10.0 (sag at midspan)
        let f_sag = 10.0 * 100.0 * 100.0 / (8.0 * 1250.0);
        assert!((y_mid - f_sag).abs() < 1e-10);
    }

    #[test]
    fn test_cable_self_weight() {
        // Steel: ρ=7.85 t/m³, A=0.001 m²
        let w = cable_self_weight(7.85, 0.001);
        // w = 7.85 * 0.001 * 9.80665 ≈ 0.077
        assert!((w - 0.077).abs() < 0.001);
    }

    #[test]
    fn test_cable_frequency() {
        // L=50m, T=500 kN, ρA = 10 kg/m = 0.01 t/m
        let f1 = cable_natural_frequency(1, 50.0, 500.0, 0.01, 1.0);
        // f1 = 1/(2*50) * sqrt(500/0.01) = 0.01 * 223.6 = 2.236 Hz
        assert!((f1 - 2.236).abs() < 0.01);
    }
}
