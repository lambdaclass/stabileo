use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly::*;
use super::geometric_stiffness::build_kg_from_forces_2d;

/// Buckling analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucklingResult {
    pub modes: Vec<BucklingMode>,
    pub n_dof: usize,
    pub element_data: Vec<ElementBucklingData>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucklingMode {
    pub load_factor: f64,
    pub displacements: Vec<Displacement>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementBucklingData {
    pub element_id: usize,
    pub axial_force: f64,
    pub critical_force: f64,
    pub k_effective: f64,
    pub effective_length: f64,
    pub length: f64,
    pub slenderness: f64,
}

/// Solve 2D buckling analysis.
/// Solves K·φ = λ·(-Kg)·φ where Kg is from linear axial forces.
pub fn solve_buckling_2d(
    input: &SolverInput,
    num_modes: usize,
) -> Result<BucklingResult, String> {
    // 1. Linear solve to get axial forces
    let linear = super::linear::solve_2d(input)?;
    let dof_num = DofNumbering::build_2d(input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 {
        return Err("No free DOFs".into());
    }

    // 2. Build geometric stiffness from linear axial forces
    let kg_full = build_kg_from_forces_2d(input, &dof_num, &linear.element_forces);

    // 3. Extract free-DOF submatrices
    let free_idx: Vec<usize> = (0..nf).collect();
    let asm = assemble_2d(input, &dof_num);
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);

    // Negate Kg (we solve K·φ = λ·(-Kg)·φ for positive eigenvalues)
    let kg_ff_raw = extract_submatrix(&kg_full, n, &free_idx, &free_idx);
    let mut neg_kg_ff = vec![0.0; nf * nf];
    for i in 0..nf * nf {
        neg_kg_ff[i] = -kg_ff_raw[i];
    }

    // Check if any element is in compression
    let has_compression = linear.element_forces.iter().any(|ef| {
        (ef.n_start + ef.n_end) / 2.0 < -1e-6
    });
    if !has_compression {
        return Err("No compressed elements — buckling not applicable".into());
    }

    // 4. Solve generalized eigenvalue: (-Kg)·φ = μ·K·φ  (K is SPD)
    //    Then λ = 1/μ are the critical load factors.
    //    We swap A=-Kg, B=K because K is SPD (required for Cholesky).
    //    Use dense solver: buckling needs all eigenvalues to find positive μ values.
    let result = solve_generalized_eigen(&neg_kg_ff, &k_ff, nf, 200)
        .ok_or_else(|| "Eigenvalue decomposition failed — stiffness matrix issue".to_string())?;

    // 5. Extract positive μ values → λ = 1/μ (critical load factors)
    //    μ are sorted ascending; we want positive μ → smallest λ = 1/largest_μ.
    let num_modes = num_modes.min(nf);
    let mut mode_pairs: Vec<(f64, usize)> = Vec::new();
    for (idx, &mu) in result.values.iter().enumerate() {
        if mu > 1e-12 {
            let lambda = 1.0 / mu;
            mode_pairs.push((lambda, idx));
        }
    }
    // Sort by ascending load factor (smallest λ first)
    mode_pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

    let mut modes = Vec::new();
    for &(lambda, idx) in mode_pairs.iter().take(num_modes) {
        let mut u_mode = vec![0.0; n];
        let mut max_disp = 0.0f64;
        for i in 0..nf {
            u_mode[i] = result.vectors[i * nf + idx];
            max_disp = max_disp.max(u_mode[i].abs());
        }
        if max_disp > 1e-20 {
            for i in 0..nf {
                u_mode[i] /= max_disp;
            }
        }

        let displacements = super::linear::build_displacements_2d(&dof_num, &u_mode);
        modes.push(BucklingMode {
            load_factor: lambda,
            displacements,
        });
    }

    if modes.is_empty() {
        return Err("No positive buckling load factors found".into());
    }

    // 6. Per-element buckling data
    let lambda_cr = modes[0].load_factor;
    let mut element_data = Vec::new();
    for ef in &linear.element_forces {
        let n_avg = (ef.n_start + ef.n_end) / 2.0;
        if n_avg >= -1e-6 {
            continue; // Skip tension elements
        }
        let elem = input.elements.values().find(|e| e.id == ef.element_id).unwrap();
        let sec = input.sections.values().find(|s| s.id == elem.section_id).unwrap();
        let l = ef.length;
        let pcr = lambda_cr * n_avg.abs();
        let r = if sec.a > 1e-20 { (sec.iz / sec.a).sqrt() } else { 0.0 };
        let k_eff = if pcr > 1e-6 && r > 1e-12 {
            let le = std::f64::consts::PI * (input.materials.values()
                .find(|m| m.id == elem.material_id).unwrap().e * 1000.0
                * sec.iz / pcr).sqrt();
            le / l
        } else {
            1.0
        };
        let le = k_eff * l;
        let slenderness = if r > 1e-12 { le / r } else { 0.0 };

        element_data.push(ElementBucklingData {
            element_id: ef.element_id,
            axial_force: n_avg,
            critical_force: pcr,
            k_effective: k_eff,
            effective_length: le,
            length: l,
            slenderness,
        });
    }

    Ok(BucklingResult {
        modes,
        n_dof: nf,
        element_data,
    })
}
