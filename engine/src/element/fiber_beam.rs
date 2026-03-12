/// Fiber beam-column element for distributed nonlinear analysis.
///
/// Each cross-section is discretized into fibers, each with its own material
/// constitutive law. Section response is obtained by integrating fiber
/// contributions numerically.
///
/// Integration uses Gauss-Lobatto quadrature along element length
/// (includes endpoints, critical for capturing end-section plasticity).
///
/// References:
///   - Spacone, Filippou & Taucer (1996): fiber beam-column formulation
///   - OpenSees: force-based beam-column implementation
use serde::{Serialize, Deserialize};

// ==================== Material Models ====================

/// Uniaxial material constitutive model for fibers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum FiberMaterial {
    /// Bilinear steel with kinematic hardening (Prager model)
    #[serde(rename = "steel_bilinear")]
    SteelBilinear {
        /// Young's modulus (MPa)
        e: f64,
        /// Yield stress (MPa)
        fy: f64,
        /// Post-yield stiffness ratio (E_h / E, typically 0.01-0.03)
        #[serde(default = "default_hardening")]
        hardening_ratio: f64,
    },
    /// Hognestad parabolic concrete model
    #[serde(rename = "concrete_hognestad")]
    ConcreteHognestad {
        /// Compressive strength f'c (MPa, positive value)
        fc: f64,
        /// Strain at peak stress (typically 0.002)
        #[serde(default = "default_eps_c0")]
        eps_c0: f64,
        /// Ultimate strain (typically 0.003-0.005)
        #[serde(default = "default_eps_cu")]
        eps_cu: f64,
        /// Tensile strength (MPa), 0 for no tension
        #[serde(default)]
        ft: f64,
    },
    /// Elastic material (for validation)
    #[serde(rename = "elastic")]
    Elastic {
        e: f64,
    },
}

fn default_hardening() -> f64 { 0.01 }
fn default_eps_c0() -> f64 { 0.002 }
fn default_eps_cu() -> f64 { 0.004 }

/// Per-fiber material state (mutable during analysis).
#[derive(Debug, Clone)]
pub struct FiberMaterialState {
    pub strain: f64,
    pub stress: f64,
    pub tangent: f64,
    // Steel state
    pub plastic_strain: f64,
    pub back_stress: f64,
    // Concrete state
    pub cracked: bool,
    pub max_compression_strain: f64,
}

impl FiberMaterialState {
    pub fn new() -> Self {
        FiberMaterialState {
            strain: 0.0,
            stress: 0.0,
            tangent: 0.0,
            plastic_strain: 0.0,
            back_stress: 0.0,
            cracked: false,
            max_compression_strain: 0.0,
        }
    }
}

/// Compute stress and tangent for a material at given strain.
pub fn material_response(
    mat: &FiberMaterial,
    strain: f64,
    state: &mut FiberMaterialState,
) -> (f64, f64) {
    match mat {
        FiberMaterial::SteelBilinear { e, fy, hardening_ratio } => {
            steel_bilinear_response(*e, *fy, *hardening_ratio, strain, state)
        }
        FiberMaterial::ConcreteHognestad { fc, eps_c0, eps_cu, ft } => {
            concrete_hognestad_response(*fc, *eps_c0, *eps_cu, *ft, strain, state)
        }
        FiberMaterial::Elastic { e } => {
            state.strain = strain;
            state.stress = *e * strain;
            state.tangent = *e;
            (state.stress, state.tangent)
        }
    }
}

/// Bilinear kinematic hardening steel.
fn steel_bilinear_response(
    e: f64,
    fy: f64,
    alpha: f64,
    strain: f64,
    state: &mut FiberMaterialState,
) -> (f64, f64) {
    state.strain = strain;
    let e_h = alpha * e;
    // Trial stress (elastic predictor)
    let xi = strain - state.plastic_strain;
    let sigma_trial = e * xi - state.back_stress;

    if sigma_trial.abs() <= fy {
        // Elastic
        state.stress = sigma_trial + state.back_stress;
        // Actually: stress = E * (strain - plastic_strain)
        state.stress = e * (strain - state.plastic_strain);
        state.tangent = e;
    } else {
        // Plastic correction
        let d_eps_p = (sigma_trial.abs() - fy) / (e + e_h);
        let sign = sigma_trial.signum();
        state.plastic_strain += sign * d_eps_p;
        state.back_stress += sign * e_h * d_eps_p;
        state.stress = e * (strain - state.plastic_strain);
        state.tangent = e * e_h / (e + e_h); // Consistent tangent
    }

    (state.stress, state.tangent)
}

/// Hognestad parabolic concrete model.
fn concrete_hognestad_response(
    fc: f64,
    eps_c0: f64,
    eps_cu: f64,
    ft: f64,
    strain: f64,
    state: &mut FiberMaterialState,
) -> (f64, f64) {
    state.strain = strain;

    // Convention: compression negative
    if strain <= -eps_cu {
        // Crushed
        state.stress = 0.0;
        state.tangent = 1e-6; // Small residual stiffness
    } else if strain <= 0.0 {
        // Compression
        let eps = (-strain).min(eps_cu);
        state.max_compression_strain = state.max_compression_strain.min(strain);

        if eps <= eps_c0 {
            // Hognestad parabola: σ = fc * [2(ε/ε₀) - (ε/ε₀)²]
            let r = eps / eps_c0;
            state.stress = -fc * (2.0 * r - r * r);
            state.tangent = -fc / eps_c0 * (2.0 - 2.0 * r); // -fc/eps_c0 * 2*(1-r)
            // Tangent should be negative since we're in compression
            // Actually, dσ/dε: with ε negative, σ negative
            state.tangent = fc * (2.0 - 2.0 * r) / eps_c0; // positive tangent modulus
        } else {
            // Linear descending branch
            let slope = fc / (eps_cu - eps_c0);
            let sigma = fc * (1.0 - (eps - eps_c0) / (eps_cu - eps_c0));
            state.stress = -sigma.max(0.0);
            state.tangent = slope;
        }
    } else {
        // Tension
        if ft > 0.0 && !state.cracked {
            let eps_cr = ft / (2.0 * fc / eps_c0);
            if strain <= eps_cr {
                state.stress = (2.0 * fc / eps_c0) * strain;
                state.tangent = 2.0 * fc / eps_c0;
            } else {
                state.cracked = true;
                state.stress = 0.0;
                state.tangent = 1e-6;
            }
        } else {
            state.cracked = true;
            state.stress = 0.0;
            state.tangent = 1e-6;
        }
    }

    (state.stress, state.tangent)
}

// ==================== Fiber Section ====================

/// Individual fiber in a cross-section.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Fiber {
    /// Y-coordinate from centroid (m)
    pub y: f64,
    /// Z-coordinate from centroid (m) (for 3D; 0 for 2D)
    #[serde(default)]
    pub z: f64,
    /// Tributary area (m²)
    pub area: f64,
    /// Material index (into FiberSectionDef.materials)
    pub material_idx: usize,
}

/// Fiber section definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FiberSectionDef {
    pub fibers: Vec<Fiber>,
    pub materials: Vec<FiberMaterial>,
}

/// Per-section integration point state.
#[derive(Debug, Clone)]
pub struct SectionState {
    pub fiber_states: Vec<FiberMaterialState>,
}

impl SectionState {
    pub fn new(n_fibers: usize) -> Self {
        SectionState {
            fiber_states: (0..n_fibers).map(|_| FiberMaterialState::new()).collect(),
        }
    }
}

/// Compute section response given section deformations.
///
/// For 2D: deformations = [ε₀, κ] (axial strain at centroid, curvature)
/// Returns: ([N, M], 2×2 tangent stiffness)
pub fn section_response_2d(
    section: &FiberSectionDef,
    deformations: &[f64; 2],
    state: &mut SectionState,
) -> ([f64; 2], [f64; 4]) {
    let eps_0 = deformations[0]; // Axial strain at centroid
    let kappa = deformations[1]; // Curvature

    let mut n = 0.0; // Axial force
    let mut m = 0.0; // Bending moment

    // Tangent stiffness: [EA, ES; ES, EI] where S = Σ E_t * A * y
    let mut ea = 0.0;
    let mut es = 0.0;
    let mut ei = 0.0;

    for (i, fiber) in section.fibers.iter().enumerate() {
        let eps = eps_0 + kappa * fiber.y; // Strain = ε₀ + κ*y
        let mat = &section.materials[fiber.material_idx];
        let (sigma, e_tan) = material_response(mat, eps, &mut state.fiber_states[i]);

        n += sigma * fiber.area;
        m += sigma * fiber.area * fiber.y;

        ea += e_tan * fiber.area;
        es += e_tan * fiber.area * fiber.y;
        ei += e_tan * fiber.area * fiber.y * fiber.y;
    }

    // Convert stresses from MPa to kN/m²: MPa = 1000 kN/m²
    let scale = 1000.0;
    ([n * scale, m * scale], [ea * scale, es * scale, es * scale, ei * scale])
}

// ==================== Gauss-Lobatto Integration ====================

/// Gauss-Lobatto quadrature points and weights on [0, L].
pub fn gauss_lobatto_points(n_points: usize, l: f64) -> Vec<(f64, f64)> {
    let (xi, w) = match n_points {
        2 => (
            vec![-1.0, 1.0],
            vec![1.0, 1.0],
        ),
        3 => (
            vec![-1.0, 0.0, 1.0],
            vec![1.0 / 3.0, 4.0 / 3.0, 1.0 / 3.0],
        ),
        4 => (
            vec![-1.0, -1.0 / 5.0_f64.sqrt(), 1.0 / 5.0_f64.sqrt(), 1.0],
            vec![1.0 / 6.0, 5.0 / 6.0, 5.0 / 6.0, 1.0 / 6.0],
        ),
        5 => (
            vec![-1.0, -(3.0 / 7.0_f64).sqrt(), 0.0, (3.0 / 7.0_f64).sqrt(), 1.0],
            vec![1.0 / 10.0, 49.0 / 90.0, 32.0 / 45.0, 49.0 / 90.0, 1.0 / 10.0],
        ),
        _ => {
            // Default to 3-point
            return gauss_lobatto_points(3, l);
        }
    };

    // Map from [-1,1] to [0,L]
    xi.iter().zip(w.iter())
        .map(|(&x, &weight)| {
            let pos = (x + 1.0) / 2.0 * l;
            let scaled_w = weight * l / 2.0;
            (pos, scaled_w)
        })
        .collect()
}

// ==================== Fiber Element Response ====================

/// B-matrix for 2D beam: maps element DOFs [u1, v1, θ1, u2, v2, θ2]
/// to section deformations [ε₀, κ] at position x along element.
fn b_matrix_2d(x: f64, l: f64) -> [f64; 12] {
    // ε₀ = du/dx ≈ (-u1 + u2)/L (constant axial strain)
    // κ = d²v/dx² from Hermite cubics
    // For Hermite cubics: v(x) = H1*v1 + H2*θ1 + H3*v2 + H4*θ2
    // κ = d²v/dx² = H1''*v1 + H2''*θ1 + H3''*v2 + H4''*θ2
    let xi = x / l;
    // H1'' = (12*xi - 6)/L²
    // H2'' = (6*xi - 4)/L
    // H3'' = (-12*xi + 6)/L²
    // H4'' = (6*xi - 2)/L

    // B = [ dN/dx for axial ; d²N/dx² for bending ]
    // Row 0: axial  [du1, dv1, dθ1, du2, dv2, dθ2]
    // Row 1: bending [du1, dv1, dθ1, du2, dv2, dθ2]
    let mut b = [0.0; 12]; // 2 × 6 row-major

    // Axial: ε₀ = -1/L * u1 + 1/L * u2
    b[0] = -1.0 / l; // ∂ε₀/∂u1
    b[3] = 1.0 / l;  // ∂ε₀/∂u2

    // Bending: κ = d²v/dx²
    b[6 + 1] = (12.0 * xi - 6.0) / (l * l);      // ∂κ/∂v1
    b[6 + 2] = (6.0 * xi - 4.0) / l;               // ∂κ/∂θ1
    b[6 + 4] = (-12.0 * xi + 6.0) / (l * l);       // ∂κ/∂v2
    b[6 + 5] = (6.0 * xi - 2.0) / l;               // ∂κ/∂θ2

    b
}

/// Compute fiber element tangent stiffness and internal force vector (2D).
///
/// Returns (f_elem[6], k_elem[36]) in local coordinates.
pub fn fiber_element_response_2d(
    u_local: &[f64; 6],
    l: f64,
    section: &FiberSectionDef,
    states: &mut Vec<SectionState>,
    n_ip: usize,
) -> ([f64; 6], Vec<f64>) {
    let points = gauss_lobatto_points(n_ip, l);
    let mut f_elem = [0.0; 6];
    let mut k_elem = vec![0.0; 36];

    for (ip, &(x, w)) in points.iter().enumerate() {
        // B matrix at this integration point
        let b = b_matrix_2d(x, l);

        // Section deformations: d = B * u_local
        let mut deform = [0.0; 2];
        for s in 0..2 {
            for d in 0..6 {
                deform[s] += b[s * 6 + d] * u_local[d];
            }
        }

        // Section response
        let (forces, tangent) = section_response_2d(section, &deform, &mut states[ip]);

        // f_elem += w * B^T * forces
        for d in 0..6 {
            for s in 0..2 {
                f_elem[d] += w * b[s * 6 + d] * forces[s];
            }
        }

        // k_elem += w * B^T * D * B
        for i in 0..6 {
            for j in 0..6 {
                let mut val = 0.0;
                for s in 0..2 {
                    for t in 0..2 {
                        val += b[s * 6 + i] * tangent[s * 2 + t] * b[t * 6 + j];
                    }
                }
                k_elem[i * 6 + j] += w * val;
            }
        }
    }

    (f_elem, k_elem)
}

// ==================== Simple Rectangular Section Helper ====================

/// Create a fiber section for a rectangular beam.
///
/// Discretizes into `n_layers` horizontal layers across the depth.
pub fn rectangular_fiber_section(
    b: f64,
    h: f64,
    n_layers: usize,
    material: FiberMaterial,
) -> FiberSectionDef {
    let dy = h / n_layers as f64;
    let area = b * dy;
    let mut fibers = Vec::with_capacity(n_layers);

    for i in 0..n_layers {
        let y = -h / 2.0 + dy / 2.0 + i as f64 * dy;
        fibers.push(Fiber {
            y,
            z: 0.0,
            area,
            material_idx: 0,
        });
    }

    FiberSectionDef {
        fibers,
        materials: vec![material],
    }
}

/// Create a fiber section for a steel W-shape (I-beam).
///
/// Discretizes flanges and web into fibers.
pub fn wide_flange_fiber_section(
    bf: f64,     // Flange width
    tf: f64,     // Flange thickness
    d: f64,      // Total depth
    tw: f64,     // Web thickness
    n_flange: usize,  // Fibers per flange
    n_web: usize,     // Fibers in web
    material: FiberMaterial,
) -> FiberSectionDef {
    let mut fibers = Vec::new();
    let hw = d - 2.0 * tf;

    // Bottom flange
    let dy_f = tf / n_flange as f64;
    for i in 0..n_flange {
        let y = -d / 2.0 + dy_f / 2.0 + i as f64 * dy_f;
        fibers.push(Fiber { y, z: 0.0, area: bf * dy_f, material_idx: 0 });
    }

    // Web
    let dy_w = hw / n_web as f64;
    for i in 0..n_web {
        let y = -hw / 2.0 + dy_w / 2.0 + i as f64 * dy_w;
        fibers.push(Fiber { y, z: 0.0, area: tw * dy_w, material_idx: 0 });
    }

    // Top flange
    for i in 0..n_flange {
        let y = d / 2.0 - tf + dy_f / 2.0 + i as f64 * dy_f;
        fibers.push(Fiber { y, z: 0.0, area: bf * dy_f, material_idx: 0 });
    }

    FiberSectionDef {
        fibers,
        materials: vec![material],
    }
}

// ==================== 3D Fiber Section & Element ====================

/// Compute 3D section response given section deformations.
///
/// Deformations = [ε₀, κy, κz] (axial strain, curvature about Y, curvature about Z)
/// Returns: ([N, My, Mz], 3×3 tangent stiffness)
///
/// Fiber strain: ε = ε₀ + κy*z - κz*y
/// Torsion is handled elastically (GJ/L), not through fibers.
pub fn section_response_3d(
    section: &FiberSectionDef,
    deformations: &[f64; 3],
    state: &mut SectionState,
) -> ([f64; 3], [f64; 9]) {
    let eps_0 = deformations[0];
    let kappa_y = deformations[1];
    let kappa_z = deformations[2];

    let mut n = 0.0;
    let mut my = 0.0;
    let mut mz = 0.0;

    // Tangent: 3×3 [EA, ES_z, -ES_y; ES_z, EI_zz, -EI_yz; -ES_y, -EI_yz, EI_yy]
    let mut ea = 0.0;
    let mut es_y = 0.0;   // Σ E_t * A * y
    let mut es_z = 0.0;   // Σ E_t * A * z
    let mut ei_yy = 0.0;  // Σ E_t * A * y²
    let mut ei_zz = 0.0;  // Σ E_t * A * z²
    let mut ei_yz = 0.0;  // Σ E_t * A * y * z

    for (i, fiber) in section.fibers.iter().enumerate() {
        let eps = eps_0 + kappa_y * fiber.z - kappa_z * fiber.y;
        let mat = &section.materials[fiber.material_idx];
        let (sigma, e_tan) = material_response(mat, eps, &mut state.fiber_states[i]);

        let a = fiber.area;
        n += sigma * a;
        my += sigma * a * fiber.z;
        mz -= sigma * a * fiber.y;

        let et_a = e_tan * a;
        ea += et_a;
        es_y += et_a * fiber.y;
        es_z += et_a * fiber.z;
        ei_yy += et_a * fiber.y * fiber.y;
        ei_zz += et_a * fiber.z * fiber.z;
        ei_yz += et_a * fiber.y * fiber.z;
    }

    let scale = 1000.0; // MPa → kN/m²
    let forces = [n * scale, my * scale, mz * scale];
    let tangent = [
        ea * scale,    es_z * scale,   -es_y * scale,
        es_z * scale,  ei_zz * scale,  -ei_yz * scale,
        -es_y * scale, -ei_yz * scale,  ei_yy * scale,
    ];

    (forces, tangent)
}

/// B-matrix for 3D beam: maps element DOFs [u1,v1,w1,θx1,θy1,θz1, u2,v2,w2,θx2,θy2,θz2]
/// to section deformations [ε₀, κy, κz] at position x along element.
///
/// 3×12 matrix (row-major, stored as [36] array).
fn b_matrix_3d(x: f64, l: f64) -> [f64; 36] {
    let xi = x / l;
    let mut b = [0.0; 36]; // 3 rows × 12 cols

    // Row 0: Axial strain ε₀ = du/dx = (-u1 + u2)/L
    b[0] = -1.0 / l;  // ∂ε₀/∂u1
    b[6] = 1.0 / l;   // ∂ε₀/∂u2

    // Row 1: Curvature κy = d²w/dx² (bending about Y via w and θy)
    // w(x) uses Hermite cubics: w1, θy1, w2, θy2 → DOFs 2, 4, 8, 10
    // Note: θy = dw/dx with appropriate sign convention
    b[12 + 2] = (12.0 * xi - 6.0) / (l * l);      // ∂κy/∂w1
    b[12 + 4] = (6.0 * xi - 4.0) / l;               // ∂κy/∂θy1
    b[12 + 8] = (-12.0 * xi + 6.0) / (l * l);       // ∂κy/∂w2
    b[12 + 10] = (6.0 * xi - 2.0) / l;              // ∂κy/∂θy2

    // Row 2: Curvature κz = d²v/dx² (bending about Z via v and θz)
    // v(x) uses Hermite cubics: v1, θz1, v2, θz2 → DOFs 1, 5, 7, 11
    b[24 + 1] = (12.0 * xi - 6.0) / (l * l);      // ∂κz/∂v1
    b[24 + 5] = (6.0 * xi - 4.0) / l;               // ∂κz/∂θz1
    b[24 + 7] = (-12.0 * xi + 6.0) / (l * l);       // ∂κz/∂v2
    b[24 + 11] = (6.0 * xi - 2.0) / l;              // ∂κz/∂θz2

    b
}

/// Compute 3D fiber element tangent stiffness and internal force vector.
///
/// Torsion is handled elastically: K_torsion = GJ/L standard stiffness on DOFs 3, 9.
/// Returns (f_elem[12], k_elem[144]) in local coordinates.
pub fn fiber_element_response_3d(
    u_local: &[f64; 12],
    l: f64,
    section: &FiberSectionDef,
    states: &mut Vec<SectionState>,
    n_ip: usize,
    gj: f64,
) -> ([f64; 12], Vec<f64>) {
    let points = gauss_lobatto_points(n_ip, l);
    let mut f_elem = [0.0; 12];
    let mut k_elem = vec![0.0; 144];

    let n_sec = 3; // Section deformation DOFs: ε₀, κy, κz

    for (ip, &(x, w)) in points.iter().enumerate() {
        let b = b_matrix_3d(x, l);

        // Section deformations: d = B * u_local
        let mut deform = [0.0; 3];
        for s in 0..n_sec {
            for d in 0..12 {
                deform[s] += b[s * 12 + d] * u_local[d];
            }
        }

        let (forces, tangent) = section_response_3d(section, &deform, &mut states[ip]);

        // f_elem += w * B^T * forces
        for d in 0..12 {
            for s in 0..n_sec {
                f_elem[d] += w * b[s * 12 + d] * forces[s];
            }
        }

        // k_elem += w * B^T * D * B
        for i in 0..12 {
            for j in 0..12 {
                let mut val = 0.0;
                for s in 0..n_sec {
                    for t in 0..n_sec {
                        val += b[s * 12 + i] * tangent[s * n_sec + t] * b[t * 12 + j];
                    }
                }
                k_elem[i * 12 + j] += w * val;
            }
        }
    }

    // Add elastic torsion: GJ/L on DOFs (3, 3), (3, 9), (9, 3), (9, 9)
    let gj_l = gj / l;
    k_elem[3 * 12 + 3] += gj_l;
    k_elem[3 * 12 + 9] += -gj_l;
    k_elem[9 * 12 + 3] += -gj_l;
    k_elem[9 * 12 + 9] += gj_l;

    // Torsional internal force: f = K_torsion * u_torsion
    f_elem[3] += gj_l * (u_local[3] - u_local[9]);
    f_elem[9] += gj_l * (u_local[9] - u_local[3]);

    (f_elem, k_elem)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_steel_bilinear_elastic() {
        let mat = FiberMaterial::SteelBilinear { e: 200_000.0, fy: 250.0, hardening_ratio: 0.01 };
        let mut state = FiberMaterialState::new();
        let eps = 0.001; // Below yield (fy/E = 250/200000 = 0.00125)
        let (sigma, e_tan) = material_response(&mat, eps, &mut state);
        assert!((sigma - 200.0).abs() < 1e-6, "σ = E*ε = 200 MPa, got {}", sigma);
        assert!((e_tan - 200_000.0).abs() < 1e-6);
    }

    #[test]
    fn test_steel_bilinear_yielded() {
        let mat = FiberMaterial::SteelBilinear { e: 200_000.0, fy: 250.0, hardening_ratio: 0.01 };
        let mut state = FiberMaterialState::new();
        let eps = 0.005; // Well beyond yield
        let (sigma, e_tan) = material_response(&mat, eps, &mut state);
        assert!(sigma > 250.0, "Should be above yield: σ = {}", sigma);
        assert!(e_tan < 200_000.0, "Tangent should be reduced: E_t = {}", e_tan);
    }

    #[test]
    fn test_concrete_compression() {
        let mat = FiberMaterial::ConcreteHognestad {
            fc: 30.0, eps_c0: 0.002, eps_cu: 0.004, ft: 0.0,
        };
        let mut state = FiberMaterialState::new();
        // At peak strain (negative = compression)
        let (sigma, _) = material_response(&mat, -0.002, &mut state);
        assert!((sigma - (-30.0)).abs() < 0.5, "At peak: σ should be ~-30 MPa, got {}", sigma);
    }

    #[test]
    fn test_elastic_fibers_reproduce_ea_ei() {
        // Rectangular section 0.2m × 0.4m, E = 200 GPa
        let b = 0.2;
        let h = 0.4;
        let e = 200_000.0;
        let n_layers = 20;

        let section = rectangular_fiber_section(b, h, n_layers, FiberMaterial::Elastic { e });
        let mut state = SectionState::new(section.fibers.len());

        // Pure axial: ε₀ = 0.001, κ = 0
        let ([n, m], [ea, _es1, _es2, ei]) = section_response_2d(
            &section, &[0.001, 0.0], &mut state,
        );

        let expected_ea = e * 1000.0 * b * h; // kN/m²  × m² = kN
        let expected_n = 0.001 * expected_ea;
        assert!((n - expected_n).abs() / expected_n.abs() < 0.01,
            "N: got {} expected {}", n, expected_n);
        assert!(m.abs() < expected_n.abs() * 0.01,
            "M should be ~0 for pure axial: {}", m);

        // Check tangent EA
        assert!((ea - expected_ea).abs() / expected_ea < 0.01,
            "EA: got {} expected {}", ea, expected_ea);

        // Check tangent EI
        let expected_ei = e * 1000.0 * b * h * h * h / 12.0;
        assert!((ei - expected_ei).abs() / expected_ei < 0.05,
            "EI: got {} expected {}", ei, expected_ei);
    }

    #[test]
    fn test_gauss_lobatto_3point() {
        let pts = gauss_lobatto_points(3, 10.0);
        assert_eq!(pts.len(), 3);
        assert!((pts[0].0 - 0.0).abs() < 1e-10, "First point at start");
        assert!((pts[2].0 - 10.0).abs() < 1e-10, "Last point at end");
        // Weights should sum to L
        let w_sum: f64 = pts.iter().map(|(_, w)| w).sum();
        assert!((w_sum - 10.0).abs() < 1e-10, "Weights sum: {}", w_sum);
    }

    #[test]
    fn test_fiber_element_elastic_stiffness() {
        // Elastic fiber element should reproduce standard frame stiffness
        let b = 0.2;
        let h = 0.4;
        let e = 200_000.0;
        let l = 5.0;

        let section = rectangular_fiber_section(b, h, 20, FiberMaterial::Elastic { e });
        let n_ip = 3;
        let mut states: Vec<SectionState> = (0..n_ip)
            .map(|_| SectionState::new(section.fibers.len()))
            .collect();

        // Zero displacement → zero forces
        let u_zero = [0.0; 6];
        let (f_zero, _k) = fiber_element_response_2d(&u_zero, l, &section, &mut states, n_ip);
        for &f in &f_zero {
            assert!(f.abs() < 1e-6, "Zero displacement should give zero force: {}", f);
        }

        // Small axial displacement
        let u_axial = [0.0, 0.0, 0.0, 0.001, 0.0, 0.0]; // u2 = 0.001m
        let mut states2: Vec<SectionState> = (0..n_ip)
            .map(|_| SectionState::new(section.fibers.len()))
            .collect();
        let (f_axial, _) = fiber_element_response_2d(&u_axial, l, &section, &mut states2, n_ip);

        // Expected: N = EA * Δu / L
        let ea = e * 1000.0 * b * h;
        let expected_n = ea * 0.001 / l;
        assert!(
            (f_axial[3] - expected_n).abs() / expected_n.abs() < 0.05,
            "Axial force: got {} expected {}", f_axial[3], expected_n
        );
    }
}
