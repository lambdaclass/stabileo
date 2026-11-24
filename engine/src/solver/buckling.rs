use std::collections::HashMap;
use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly::*;
use super::geometric_stiffness::{
    emit_buckling_geometric_stiffness_2d, emit_buckling_geometric_stiffness_3d, geometric_stiffness_terms_2d, geometric_stiffness_terms_3d,
    span_axial_geometric_stiffness_2d, span_axial_geometric_stiffness_3d, GeometricState, KgTriplets,
};
use super::constraints::{FreeConstraintSystem, MasterMotion};

/// Buckling analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucklingResult {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
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

/// The matrices of the 2D linear buckling problem K·φ = λ·(−Kg)·φ: the linear
/// solution whose axial forces define Kg, the sparse free-DOF K, and −Kg.
///
/// Each member's Kg takes its axial force from its elongation in the linear
/// solution, EA·(δ/L − αΔT) — the mean of N along the member, which is what
/// the geometric stiffness integrates (∫N·φ'ᵀφ' dx with N constant). The end
/// average (N_start + N_end)/2 used before is the mean only while N is linear,
/// so an axial point load or a partial axial load on a member gave the wrong
/// load factor (3× on a truss in `opensees_differential_regressions`). It is
/// also the force the P-Delta iteration uses.
/// Shared by `solve_buckling_2d` and the buckling certificate (public, hidden,
/// for the assembly-path oracle in tests/assembly_paths.rs). K and Kg are
/// in the inclined-roller frames of `inclined_transforms_2d` (φ too, until
/// rotated back with `reverse_inclined_transform_2d`).
#[doc(hidden)]
pub struct BucklingSystem2D {
    pub linear: AnalysisResults,
    pub dof_num: DofNumbering,
    pub k_ff: CscMatrix,
    pub neg_kg_csc: CscMatrix,
    pub neg_kg_round_off_csc: Option<CscMatrix>,
    pub inclined_transforms_2d: Vec<InclinedTransformData2D>,
    pub cs: Option<FreeConstraintSystem>,
    /// Each element's mean axial force at the linear solution; Kg is built from it and `span_axial`.
    pub mean_n: HashMap<usize, f64>,
    pub span_axial: Vec<(usize, Vec<usize>, Vec<f64>)>,
    /// Per member, the round-off of `mean_n` that decides whether it contributes Kg (as `coupled_round_off`).
    pub axial_noise: HashMap<usize, f64>,
}

#[doc(hidden)]
pub fn buckling_system_2d(input: &SolverInput) -> Result<BucklingSystem2D, String> {
    super::linear::validate_input_2d_for_analysis(input, crate::known_issues::Analysis::Buckling)?;
    // 1. Linear solve to get axial forces
    let linear = super::linear::solve_2d(input)?;
    let dof_num = DofNumbering::build_2d(input);
    let nf = dof_num.n_free;

    if nf == 0 {
        return Err(crate::refusal::no_free_dofs());
    }

    // Global-axes displacements of the linear solution (its results are
    // reported in global axes, also at inclined rollers).
    let mut u = vec![0.0; dof_num.n_total];
    for d in &linear.displacements {
        for (i, v) in [d.ux, d.uz, d.ry].into_iter().enumerate() {
            if let Some(&dof) = dof_num.map.get(&(d.node_id, i)) {
                u[dof] = v;
            }
        }
    }

    // The mean force Kg is built from, not the end average: under an axial
    // span load both end forces can be 0 with the member compressed.
    let mean_n = super::geometric_stiffness::mean_axial_forces_2d(input, &dof_num, &u);
    let SparseAssemblyResult { k_ff, inclined_transforms_2d, .. } = assemble_sparse_2d(input, &dof_num);
    let cs = FreeConstraintSystem::build_2d(input, &dof_num)?;
    let member_dofs: Vec<(usize, Vec<usize>)> = crate::ordered::values(&input.elements)
        .map(|e| (e.id, dof_num.element_dofs(e.node_i, e.node_j)))
        .collect();
    let inclined_dofs: Vec<&[usize]> = inclined_transforms_2d.iter().map(|it| it.dofs.as_slice()).collect();
    let axial_noise = coupled_round_off(&k_ff, cs.as_ref(), &member_dofs, &inclined_dofs, &axial_force_round_off_2d(input, &linear));
    let resolvable = |id: &usize, n: f64| n < -axial_noise.get(id).copied().unwrap_or(0.0);
    if !mean_n.values().any(|&n| n < 0.0) {
        return Err(crate::refusal::no_compressed_elements());
    }
    if !mean_n.iter().any(|(id, &n)| resolvable(id, n)) {
        let (id, n) = mean_n.iter().min_by(|a, b| a.1.total_cmp(b.1).then(a.0.cmp(b.0))).map(|(id, n)| (*id, *n)).unwrap_or((0, 0.0));
        return Err(format!(
            "Buckling not determinable: every axial compression is within round-off (largest {:.3e} kN in element {id}, resolvable beyond {:.3e} kN)",
            -n, axial_noise.get(&id).copied().unwrap_or(0.0)
        ));
    }

    // 4. Build geometric stiffness at the linear solution (sparse free block;
    //    the eigensolver below is sparse, so a dense n×n Kg was pure waste), in
    //    the same inclined frames as K: collected over all DOFs when there are
    //    inclined rollers, then rotated and cut to the free block. Negate it in
    //    place — we solve K·φ = λ·(-Kg)·φ for positive eigenvalues, and nothing
    //    reads the un-negated Kg.
    let span_axial = span_axial_geometric_stiffness_2d(input, &dof_num);
    let resolved = GeometricState::Resolved { mean_n: &mean_n, noise: &axial_noise };
    let round_off = GeometricState::RoundOffAtCompression { mean_n: &mean_n, noise: &axial_noise };
    let assemble = |parts: &[GeometricState<'_>]| {
        let mut kg = KgTriplets::new(if inclined_transforms_2d.is_empty() { nf } else { dof_num.n_total });
        for &which in parts {
            emit_buckling_geometric_stiffness_2d(input, &dof_num, &u, which, &mut |i, j, v| if i >= j { kg.add(i, j, v) });
        }
        for (_, dofs, g) in &span_axial {
            for (a, &i) in dofs.iter().enumerate() {
                for (b, &j) in dofs.iter().enumerate() {
                    if i >= j { kg.add(i, j, g[a * dofs.len() + b]) }
                }
            }
        }
        if !inclined_transforms_2d.is_empty() {
            kg = kg.rotate_inclined(&inclined_transforms_2d, nf);
        }
        let mut kg_csc = kg.into_csc();
        for v in kg_csc.values.iter_mut() {
            *v = -*v;
        }
        kg_csc
    };
    let neg_kg_csc = assemble(&[resolved]);
    let neg_kg_round_off_csc = has_round_off_member(&mean_n, &axial_noise).then(|| assemble(&[resolved, round_off]));
    Ok(BucklingSystem2D { linear, dof_num, k_ff, neg_kg_csc, neg_kg_round_off_csc, inclined_transforms_2d, cs, mean_n, span_axial, axial_noise })
}

/// Per member, the axial force that is round-off: 100 ε times the magnitudes N = EA·δ/L is
/// recovered from (δ = Σ (u_j − u_i)·e over global components) plus the member's own end forces
/// (N, V, M/L), whose round-off reaches N through the solve and the force recovery.
fn axial_force_round_off_2d(input: &SolverInput, linear: &AnalysisResults) -> HashMap<usize, f64> {
    let u: HashMap<usize, (f64, f64)> = linear.displacements.iter().map(|d| (d.node_id, (d.ux, d.uz))).collect();
    let end_forces: HashMap<usize, f64> = linear.element_forces.iter().map(|f| {
        let moments = if f.length > 0.0 { f.m_start.abs().max(f.m_end.abs()) / f.length } else { 0.0 };
        (f.element_id, f.n_start.abs().max(f.n_end.abs()).max(f.v_start.abs()).max(f.v_end.abs()).max(moments))
    }).collect();
    let nodes: HashMap<usize, &SolverNode> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mats: HashMap<usize, &SolverMaterial> = crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let secs: HashMap<usize, &SolverSection> = crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();
    let mut out = HashMap::new();
    for e in crate::ordered::values(&input.elements) {
        let (Some(a), Some(b)) = (nodes.get(&e.node_i), nodes.get(&e.node_j)) else { continue };
        let (Some(m), Some(s)) = (mats.get(&e.material_id), secs.get(&e.section_id)) else { continue };
        let l = (b.x - a.x).hypot(b.z - a.z);
        if l > 0.0 {
            let (cx, cz) = ((b.x - a.x) / l, (b.z - a.z) / l);
            let terms = |n: usize| u.get(&n).map_or(0.0, |&(ux, uz)| (ux * cx).abs() + (uz * cz).abs());
            let elongation = m.e * 1000.0 * s.a * (terms(e.node_i) + terms(e.node_j)) / l;
            out.insert(e.id, 100.0 * f64::EPSILON * (elongation + end_forces.get(&e.id).copied().unwrap_or(0.0)));
        }
    }
    out
}

fn axial_force_round_off_3d(input: &SolverInput3D, dof_num: &DofNumbering, u: &[f64], linear: &AnalysisResults3D) -> HashMap<usize, f64> {
    let end_forces: HashMap<usize, f64> = linear.element_forces.iter().map(|f| {
        let moments = if f.length > 0.0 { f.my_start.abs().max(f.my_end.abs()).max(f.mz_start.abs()).max(f.mz_end.abs()) / f.length } else { 0.0 };
        (f.element_id, f.n_start.abs().max(f.n_end.abs()).max(f.vy_start.abs()).max(f.vy_end.abs()).max(f.vz_start.abs()).max(f.vz_end.abs()).max(moments))
    }).collect();
    let nodes: HashMap<usize, &SolverNode3D> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mats: HashMap<usize, &SolverMaterial> = crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let secs: HashMap<usize, &SolverSection3D> = crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();
    let at = |node: usize, i: usize| dof_num.global_dof(node, i).map(|d| u[d]).unwrap_or(0.0);
    let mut out = HashMap::new();
    for e in crate::ordered::values(&input.elements) {
        let (Some(a), Some(b)) = (nodes.get(&e.node_i), nodes.get(&e.node_j)) else { continue };
        let (Some(m), Some(s)) = (mats.get(&e.material_id), secs.get(&e.section_id)) else { continue };
        let d = [b.x - a.x, b.y - a.y, b.z - a.z];
        let l = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
        if l > 0.0 {
            let terms = |n: usize| (0..3).map(|i| (at(n, i) * d[i] / l).abs()).sum::<f64>();
            let elongation = m.e * 1000.0 * s.a * (terms(e.node_i) + terms(e.node_j)) / l;
            out.insert(e.id, 100.0 * f64::EPSILON * (elongation + end_forces.get(&e.id).copied().unwrap_or(0.0)));
        }
    }
    out
}

fn has_round_off_member(mean_n: &HashMap<usize, f64>, noise: &HashMap<usize, f64>) -> bool {
    mean_n.iter().any(|(id, n)| noise.get(id).is_some_and(|&e| e > 0.0 && n.abs() <= e))
}

pub(super) fn buckling_eigen(k: &CscMatrix, b: &CscMatrix, cs: Option<&FreeConstraintSystem>, count: usize) -> (Option<crate::linalg::EigenResult>, Option<StructuredDiagnostic>) {
    let pencil = crate::linalg::lanczos::BucklingPencil { k, b, transform: cs.map(|cs| cs.c_ff.buckling_transform()) };
    let Some(solver) = pencil.solver() else { return (None,None); };
    crate::known_issues::with_sparse_factor_conditioning(solver.stiffness(), |observe| solver.eigen_observed(count,observe))
}

fn critical_factor_bound(k: &CscMatrix, neg_kg: &CscMatrix, cs: Option<&FreeConstraintSystem>) -> Result<Option<f64>, String> {
    let result = buckling_eigen(k, neg_kg, cs, 1).0.ok_or_else(|| {
        "Buckling not determinable: the effect of the members whose axial force is within round-off could not be bounded".to_string()
    })?;
    let mu = result.values.iter().fold(0.0f64, |a, &mu| a.max(mu));
    Ok((mu > 0.0).then(|| 1.0 / mu))
}

fn refuse_round_off_buckling(lambda_round_off: Option<f64>, lambda_cr: f64, mean_n: &HashMap<usize, f64>, noise: &HashMap<usize, f64>) -> Result<(), String> {
    let Some(lambda) = lambda_round_off else { return Ok(()) };
    if lambda >= (1.0 - MODE_RESOLUTION) * lambda_cr {
        return Ok(());
    }
    let mut members: Vec<usize> = mean_n.iter().filter(|(id, n)| noise.get(id).is_some_and(|&e| e > 0.0 && n.abs() <= e)).map(|(id, _)| *id).collect();
    members.sort_unstable();
    let listed: Vec<String> = members.iter().map(|id| id.to_string()).collect();
    Err(format!(
        "Buckling not determinable: the axial forces of elements {} are within round-off, and as compressions of that size they could lower the critical factor from {lambda_cr:.6e} to {lambda:.6e}",
        listed.join(", ")
    ))
}

fn coupled_round_off(
    k_ff: &CscMatrix,
    cs: Option<&FreeConstraintSystem>,
    member_dofs: &[(usize, Vec<usize>)],
    inclined_dofs: &[&[usize]],
    own: &HashMap<usize, f64>,
) -> HashMap<usize, f64> {
    let n = k_ff.n;
    let mut parent: Vec<usize> = (0..n).collect();
    fn root(parent: &mut [usize], mut i: usize) -> usize {
        while parent[i] != i {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        i
    }
    let join = |parent: &mut Vec<usize>, a: usize, b: usize| {
        let (ra, rb) = (root(parent, a), root(parent, b));
        if ra != rb { parent[ra.max(rb)] = ra.min(rb) }
    };
    for j in 0..n {
        for &i in &k_ff.row_idx[k_ff.col_ptr[j]..k_ff.col_ptr[j + 1]] {
            if i < n { join(&mut parent, i, j) }
        }
    }
    for (_, dofs) in member_dofs {
        let free: Vec<usize> = dofs.iter().copied().filter(|&d| d < n).collect();
        for w in free.windows(2) { join(&mut parent, w[0], w[1]) }
    }
    for dofs in inclined_dofs {
        let free: Vec<usize> = dofs.iter().copied().filter(|&d| d < n).collect();
        for w in free.windows(2) { join(&mut parent, w[0], w[1]) }
    }
    if let Some(cs) = cs {
        for (a, b) in cs.coupled_free_dofs() {
            if a < n && b < n { join(&mut parent, a, b) }
        }
    }
    let component = |parent: &mut Vec<usize>, dofs: &[usize]| dofs.iter().find(|&&d| d < n).map(|&d| root(parent, d));
    let mut largest: HashMap<usize, f64> = HashMap::new();
    for (id, dofs) in member_dofs {
        if let Some(c) = component(&mut parent, dofs) {
            let s = largest.entry(c).or_insert(0.0);
            *s = s.max(own.get(id).copied().unwrap_or(0.0));
        }
    }
    let mut out = own.clone();
    for (id, dofs) in member_dofs {
        if let Some(bound) = component(&mut parent, dofs).and_then(|c| largest.get(&c)) {
            let e = out.entry(*id).or_insert(0.0);
            *e = e.max(*bound);
        }
    }
    out
}

const EIGENVALUE_ROUND_OFF: f64 = 100.0 * f64::EPSILON;

/// A mode is resolved when the round-off of the axial forces can move its geometric work by at most this fraction.
const MODE_RESOLUTION: f64 = 1e-2;

fn geometric_work_uncertainty(
    terms: &[super::geometric_stiffness::KgAffineTerm],
    span_axial: &[(usize, Vec<usize>, Vec<f64>)],
    mean_n: &HashMap<usize, f64>,
    noise: &HashMap<usize, f64>,
    phi: &[f64],
) -> (f64, f64, Vec<usize>) {
    let (mut work, mut uncertainty, mut drivers) = (0.0, 0.0, Vec::new());
    for (_, dofs, g) in span_axial {
        let m = dofs.len();
        for i in 0..m {
            for j in 0..m {
                work += phi[dofs[i]] * g[i * m + j] * phi[dofs[j]];
            }
        }
    }
    for t in terms {
        let m = t.dofs.len();
        let mut g = 0.0;
        for i in 0..m {
            for j in 0..m {
                g += phi[t.dofs[i]] * t.g[i * m + j] * phi[t.dofs[j]];
            }
        }
        let n = mean_n.get(&t.element_id).copied().unwrap_or(0.0);
        let e = noise.get(&t.element_id).copied().unwrap_or(0.0);
        if n.abs() > e {
            work += n * g;
            uncertainty += e * g.abs();
        } else {
            uncertainty += (n.abs() + e) * g.abs();
            if g != 0.0 {
                drivers.push(t.element_id);
            }
        }
    }
    (work, uncertainty, drivers)
}

/// Solve 2D buckling analysis.
/// Solves K·φ = λ·(-Kg)·φ where Kg is from linear axial forces.
pub fn solve_buckling_2d(
    input: &SolverInput,
    num_modes: usize,
) -> Result<BucklingResult, String> {
    // Build lookup maps for O(1) access by id
    let elem_by_id: HashMap<usize, &SolverElement> =
        crate::ordered::values(&input.elements).map(|e| (e.id, e)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    let BucklingSystem2D { linear, dof_num, k_ff, neg_kg_csc, neg_kg_round_off_csc, inclined_transforms_2d, cs, mean_n, span_axial, axial_noise } = buckling_system_2d(input)?;
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    // 5. Solve generalized eigenvalue: (-Kg)·φ = μ·K·φ  (K is SPD), sparse
    // shift-invert Lanczos in both branches; with constraints, K and -Kg are
    // reduced as sparse triple products first.
    let ns = cs.as_ref().map_or(nf, |cs| cs.n_free_indep);
    let mut structured_diagnostics = linear.structured_diagnostics.clone();
    crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::for_2d(input, crate::known_issues::Analysis::Buckling));
    let (result, conditioning) = buckling_eigen(&k_ff, &neg_kg_csc, cs.as_ref(), num_modes);
    crate::known_issues::attach(&mut structured_diagnostics, conditioning.into_iter().collect());
    let result = result.ok_or_else(|| crate::linalg::lanczos::eigen_failure_message(ns))?;

    let num_modes = num_modes.min(ns);
    let n_converged = result.values.len();
    let mu_floor = EIGENVALUE_ROUND_OFF * result.values.iter().fold(0.0f64, |a, &mu| a.max(mu));
    let mut mode_pairs: Vec<(f64, usize)> = Vec::new();
    for (idx, &mu) in result.values.iter().enumerate() {
        if mu > 1e-12 && mu > mu_floor {
            let lambda = 1.0 / mu;
            mode_pairs.push((lambda, idx));
        }
    }
    mode_pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

    let kg_terms = geometric_stiffness_terms_2d(input, &dof_num);
    let mut unresolved: Vec<(usize, f64)> = Vec::new();
    let mut unresolved_members: Vec<usize> = Vec::new();
    let mut modes = Vec::new();
    for &(lambda, idx) in mode_pairs.iter().take(num_modes) {
        let phi_s: Vec<f64> = (0..ns).map(|i| result.vectors[i * n_converged + idx]).collect();
        let phi_f = if let Some(ref cs) = cs {
            cs.expand_solution(&phi_s, MasterMotion::Homogeneous)
        } else {
            phi_s
        };

        let mut u_mode = vec![0.0; n];
        u_mode[..nf].copy_from_slice(&phi_f[..nf]);
        // Back to global axes at inclined rollers before normalizing, so the
        // max-component scale is the same as an unrotated model's.
        for it in &inclined_transforms_2d {
            reverse_inclined_transform_2d(&mut u_mode, &it.dofs, &it.r);
        }
        let max_disp = u_mode.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        if max_disp > 1e-20 {
            for v in u_mode.iter_mut() {
                *v /= max_disp;
            }
        }

        let (work, uncertainty, drivers) = geometric_work_uncertainty(&kg_terms, &span_axial, &mean_n, &axial_noise, &u_mode);
        if !(uncertainty <= MODE_RESOLUTION * work.abs()) {
            unresolved.push((modes.len() + 1, lambda));
            unresolved_members.extend(drivers);
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
    if let Some(bound) = &neg_kg_round_off_csc {
        refuse_round_off_buckling(critical_factor_bound(&k_ff, bound, cs.as_ref())?, modes[0].load_factor, &mean_n, &axial_noise)?;
    }

    if !unresolved.is_empty() {
        unresolved_members.sort_unstable();
        unresolved_members.dedup();
        let listed: Vec<String> = unresolved.iter().map(|(k, l)| format!("mode {k} (λ = {l:.3e})")).collect();
        let mut d = crate::known_issues::diagnostic("BU-UNRESOLVED-MODE").with_elements(unresolved_members);
        d.message = format!("{}: {}", d.message, listed.join(", "));
        crate::known_issues::attach(&mut structured_diagnostics, vec![d]);
    }

    // 6. Per-element buckling data
    let lambda_cr = modes[0].load_factor;
    let mut element_data = Vec::new();
    for ef in &linear.element_forces {
        let n_avg = mean_n.get(&ef.element_id).copied().unwrap_or((ef.n_start + ef.n_end) / 2.0);
        if n_avg >= -axial_noise.get(&ef.element_id).copied().unwrap_or(0.0) {
            continue;
        }
        let elem = elem_by_id[&ef.element_id];
        let sec = sec_by_id[&elem.section_id];
        let l = ef.length;
        let pcr = lambda_cr * n_avg.abs();
        let r = (sec.iz / sec.a).sqrt();
        if !(r.is_finite() && r > 1e-12) {
            return Err(format!("Section {}: buckling radius of gyration must be finite and > 1e-12", sec.id));
        }
        let k_eff = if pcr > 0.0 {
            let le = std::f64::consts::PI
                * (mat_by_id[&elem.material_id].e * 1000.0 * sec.iz / pcr).sqrt();
            le / l
        } else {
            1.0
        };
        let le = k_eff * l;
        let slenderness = le / r;

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

    let result = BucklingResult {
        structured_diagnostics,
        modes,
        n_dof: nf,
        element_data,
    };
    crate::boundary::require_finite(&result)?;
    Ok(result)
}

/// The matrices of the 3D linear buckling problem (see `BucklingSystem2D`),
/// including surface-element geometric stiffness. K and Kg are in the
/// inclined-support frames of `inclined_transforms`.
#[doc(hidden)]
pub struct BucklingSystem3D {
    pub linear: AnalysisResults3D,
    pub dof_num: DofNumbering,
    pub k_ff: CscMatrix,
    pub neg_kg_csc: CscMatrix,
    pub neg_kg_round_off_csc: Option<CscMatrix>,
    /// Inclined supports: K and −Kg are in each one's (normal, tangent) frame.
    pub inclined_transforms: Vec<InclinedTransformData>,
    pub cs: Option<FreeConstraintSystem>,
    /// Each member's mean axial force at the linear solution; Kg is built from it and `span_axial`.
    pub mean_n: HashMap<usize, f64>,
    pub span_axial: Vec<(usize, Vec<usize>, Vec<f64>)>,
    /// Per member, the round-off of `mean_n` that decides whether it contributes Kg (as `coupled_round_off`).
    pub axial_noise: HashMap<usize, f64>,
}

#[doc(hidden)]
pub fn buckling_system_3d(input: &SolverInput3D) -> Result<BucklingSystem3D, String> {
    super::feature_gates::refuse_3d(input, "Buckling analysis", &[super::feature_gates::Feature::ShellThermalNonQuad])?;
    // Curved beams become segments first: `solve_3d` returns the segments' forces, which
    // the unexpanded model has no elements for (an index panic).
    let expanded = (!input.curved_beams.is_empty()).then(|| super::linear::expand_curved_beams_3d(input));
    let input = expanded.as_ref().unwrap_or(input);
    let linear = super::linear::buckling_preload_3d(input)?;
    let dof_num = DofNumbering::build_3d(input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 { return Err(crate::refusal::no_free_dofs()); }

    let mut u_full = vec![0.0; n];
    for d in &linear.displacements {
        let vals = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
        for (i, &v) in vals.iter().enumerate() {
            if let Some(&dof) = dof_num.map.get(&(d.node_id, i)) {
                u_full[dof] = v;
            }
        }
    }
    let mean_n = super::geometric_stiffness::mean_axial_forces_3d(input, &dof_num, &u_full);
    let (span_axial, span_least) = span_axial_geometric_stiffness_3d(input, &dof_num);
    let compression = |id: &usize, n: f64| n + span_least.get(id).copied().unwrap_or(0.0).min(0.0);
    let SparseAssemblyResult3D { k_ff, inclined_transforms, .. } = assemble_sparse_3d(input, &dof_num, false);
    let cs = FreeConstraintSystem::build_3d(input, &dof_num)?;
    let sections: HashMap<usize, &SolverSection3D> = crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();
    let member_dofs: Vec<(usize, Vec<usize>)> = crate::ordered::values(&input.elements)
        .map(|e| (e.id, dof_num.coupled_member_dofs_3d(e, sections[&e.section_id])))
        .collect();
    let inclined_dofs: Vec<&[usize]> = inclined_transforms.iter().map(|it| it.dofs.as_slice()).collect();
    let axial_noise = coupled_round_off(&k_ff, cs.as_ref(), &member_dofs, &inclined_dofs, &axial_force_round_off_3d(input, &dof_num, &u_full, &linear));
    let resolvable = |id: &usize, n: f64| compression(id, n) < -axial_noise.get(id).copied().unwrap_or(0.0);
    let has_frame_compression = mean_n.iter().any(|(id, &n)| n < 0.0 || resolvable(id, n));
    let has_resolved_compression = mean_n.iter().any(|(id, &n)| resolvable(id, n));
    let not_determinable = || {
        let (id, n) = mean_n.iter().map(|(id, &n)| (*id, compression(id, n))).min_by(|a, b| a.1.total_cmp(&b.1).then(a.0.cmp(&b.0))).unwrap_or((0, 0.0));
        format!(
            "Buckling not determinable: every axial compression is within round-off (largest {:.3e} kN in element {id}, resolvable beyond {:.3e} kN)",
            -n, axial_noise.get(&id).copied().unwrap_or(0.0)
        )
    };
    let has_surfaces = !input.quads.is_empty()
        || !input.plates.is_empty()
        || !input.quad9s.is_empty()
        || !input.solid_shells.is_empty()
        || !input.curved_shells.is_empty();

    if !has_frame_compression && !has_surfaces {
        return Err(crate::refusal::no_compressed_elements());
    }
    if has_frame_compression && !has_resolved_compression && !has_surfaces {
        return Err(not_determinable());
    }

    // K (the linear path's, rotated into the inclined-support frames) first:
    // Kg is collected over all DOFs when there are inclined supports and
    // rotated the same way once the surfaces are in.

    let resolved = GeometricState::Resolved { mean_n: &mean_n, noise: &axial_noise };
    let round_off = GeometricState::RoundOffAtCompression { mean_n: &mean_n, noise: &axial_noise };
    let assemble = |parts: &[GeometricState<'_>]| {
        let mut kg = KgTriplets::new(if inclined_transforms.is_empty() { nf } else { n });
        for &which in parts {
            emit_buckling_geometric_stiffness_3d(input, &dof_num, &u_full, which, &mut |i, j, v| if i >= j { kg.add(i, j, v) });
        }
        for (_, dofs, g) in &span_axial {
            for (a, &i) in dofs.iter().enumerate() {
                for (b, &j) in dofs.iter().enumerate() {
                    if i >= j { kg.add(i, j, g[a * dofs.len() + b]) }
                }
            }
        }

        // `emit_geometric_stiffness_3d` includes every shell family's Kg (plates,
        // MITC4/9, solid and curved shells) off the same u_full since the feature
        // matrix PR made P-Delta use it; adding them here again doubled the shell
        // Kg and halved shell buckling factors.

        if !inclined_transforms.is_empty() {
            kg = kg.rotate_inclined(&inclined_transforms, nf);
        }

        // Negate Kg (we solve K·φ = λ·(-Kg)·φ for positive eigenvalues), in place:
        // Kg is not read again, and on a large shell model its values vector is the
        // single biggest allocation in this function.
        let mut kg_csc = kg.into_csc();
        for v in kg_csc.values.iter_mut() {
            *v = -*v;
        }
        kg_csc
    };
    let neg_kg_csc = assemble(&[resolved]);
    let neg_kg_round_off_csc = has_round_off_member(&mean_n, &axial_noise).then(|| assemble(&[resolved, round_off]));

    // The rest of the gate, now that -Kg exists: surfaces carry no axial force
    // to test, so the only way to know they contribute is to look at what they
    // assembled. `has_surfaces` spans every family including `curved_shells`,
    // whose Kg is built above like all the others — omitting it here turned away
    // a model made only of curved shells under pure compression, with a
    // populated -Kg, as "no compressed elements".
    let has_shell_kg = has_surfaces && neg_kg_csc.values.iter().any(|&v| v.abs() > 1e-15);
    if !has_frame_compression && !has_shell_kg {
        return Err(crate::refusal::no_compressed_elements());
    }
    if !has_resolved_compression && !has_shell_kg {
        return Err(not_determinable());
    }
    Ok(BucklingSystem3D { linear, dof_num, k_ff, neg_kg_csc, neg_kg_round_off_csc, inclined_transforms, cs, mean_n, span_axial, axial_noise })
}

/// 3D buckling analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucklingResult3D {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
    pub modes: Vec<BucklingMode3D>,
    pub n_dof: usize,
    pub element_data: Vec<ElementBucklingData3D>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucklingMode3D {
    pub load_factor: f64,
    pub displacements: Vec<Displacement3D>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementBucklingData3D {
    pub element_id: usize,
    pub axial_force: f64,
    pub critical_force: f64,
    pub k_effective: f64,
    pub effective_length: f64,
    pub length: f64,
    pub slenderness_y: f64,
    pub slenderness_z: f64,
}

/// Solve 3D buckling analysis.
pub fn solve_buckling_3d(
    input: &SolverInput3D,
    num_modes: usize,
) -> Result<BucklingResult3D, String> {
    // Curved beams are expanded into straight members, as every static path
    // does; left in place they were not part of the model at all.
    let expanded = (!input.curved_beams.is_empty()).then(|| super::linear::expand_curved_beams_3d(input));
    let input = expanded.as_ref().unwrap_or(input);
    // Build lookup maps for O(1) access by id
    let elem_by_id: HashMap<usize, &SolverElement3D> =
        crate::ordered::values(&input.elements).map(|e| (e.id, e)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection3D> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    let BucklingSystem3D { linear, dof_num, k_ff, neg_kg_csc, neg_kg_round_off_csc, inclined_transforms, cs, mean_n, axial_noise, .. } = buckling_system_3d(input)?;
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    // Solve eigenproblem: (-Kg)*φ = μ*K*φ, then λ = 1/μ. Sparse shift-invert
    // Lanczos in both branches; with constraints, K and -Kg are reduced as
    // sparse triple products first.
    let ns = cs.as_ref().map_or(nf, |cs| cs.n_free_indep);
    let mut structured_diagnostics = linear.structured_diagnostics.clone();
    crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::for_3d(input, crate::known_issues::Analysis::Buckling));
    let (result, conditioning) = buckling_eigen(&k_ff, &neg_kg_csc, cs.as_ref(), num_modes);
    crate::known_issues::attach(&mut structured_diagnostics, conditioning.into_iter().collect());
    let result = result.ok_or_else(|| crate::refusal::eigen_decomposition_failed(&crate::linalg::lanczos::eigen_failure_message(ns)))?;

    let num_modes = num_modes.min(ns);
    let n_converged = result.values.len();
    let mu_floor = EIGENVALUE_ROUND_OFF * result.values.iter().fold(0.0f64, |a, &mu| a.max(mu));
    let mut mode_pairs: Vec<(f64, usize)> = Vec::new();
    for (idx, &mu) in result.values.iter().enumerate() {
        if mu > 1e-12 && mu > mu_floor {
            mode_pairs.push((1.0 / mu, idx));
        }
    }
    mode_pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

    let kg_terms = geometric_stiffness_terms_3d(input, &dof_num);
    let mut unresolved: Vec<(usize, f64)> = Vec::new();
    let mut unresolved_members: Vec<usize> = Vec::new();
    let mut modes = Vec::new();
    for &(lambda, idx) in mode_pairs.iter().take(num_modes) {
        let phi_s: Vec<f64> = (0..ns).map(|i| result.vectors[i * n_converged + idx]).collect();
        let phi_f = if let Some(ref cs) = cs {
            cs.expand_solution(&phi_s, MasterMotion::Homogeneous)
        } else {
            phi_s
        };

        // Back to global axes at inclined supports before normalizing (as 2D).
        let mut u_mode = to_global(&phi_f[..nf], n, &inclined_transforms);
        let work = -neg_kg_csc.sym_mat_vec(&phi_f[..nf]).iter().zip(&phi_f[..nf]).map(|(a, b)| a * b).sum::<f64>();
        let (_, uncertainty, drivers) = geometric_work_uncertainty(&kg_terms, &[], &mean_n, &axial_noise, &u_mode);
        if !(uncertainty <= MODE_RESOLUTION * work.abs()) {
            unresolved.push((modes.len() + 1, lambda));
            unresolved_members.extend(drivers);
        }
        let max_disp = u_mode.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        if max_disp > 1e-20 {
            for v in u_mode.iter_mut() { *v /= max_disp; }
        }
        let displacements = super::linear::build_displacements_3d(&dof_num, &u_mode);
        modes.push(BucklingMode3D { load_factor: lambda, displacements });
    }

    if modes.is_empty() {
        return Err("No positive buckling load factors found".into());
    }
    if let Some(bound) = &neg_kg_round_off_csc {
        refuse_round_off_buckling(critical_factor_bound(&k_ff, bound, cs.as_ref())?, modes[0].load_factor, &mean_n, &axial_noise)?;
    }

    if !unresolved.is_empty() {
        unresolved_members.sort_unstable();
        unresolved_members.dedup();
        let listed: Vec<String> = unresolved.iter().map(|(k, l)| format!("mode {k} (λ = {l:.3e})")).collect();
        let mut d = crate::known_issues::diagnostic("BU-UNRESOLVED-MODE").with_elements(unresolved_members);
        d.message = format!("{}: {}", d.message, listed.join(", "));
        crate::known_issues::attach(&mut structured_diagnostics, vec![d]);
    }

    let lambda_cr = modes[0].load_factor;
    let mut element_data = Vec::new();
    for ef in &linear.element_forces {
        let n_avg = mean_n.get(&ef.element_id).copied().unwrap_or((ef.n_start + ef.n_end) / 2.0);
        if n_avg >= -axial_noise.get(&ef.element_id).copied().unwrap_or(0.0) { continue; }
        let elem = elem_by_id[&ef.element_id];
        let sec = sec_by_id[&elem.section_id];
        let mat = mat_by_id[&elem.material_id];
        let l = ef.length;
        let pcr = lambda_cr * n_avg.abs();
        let e = mat.e * 1000.0;

        let ry = (sec.iy / sec.a).sqrt();
        let rz = (sec.iz / sec.a).sqrt();
        if !(ry.is_finite() && ry > 1e-12 && rz.is_finite() && rz > 1e-12) {
            return Err(format!("Section {}: buckling radii of gyration must be finite and > 1e-12", sec.id));
        }
        let k_eff = if pcr > 0.0 {
            let le = std::f64::consts::PI * (e * sec.iy.min(sec.iz) / pcr).sqrt();
            le / l
        } else { 1.0 };
        let le = k_eff * l;
        let slenderness_y = le / ry;
        let slenderness_z = le / rz;

        element_data.push(ElementBucklingData3D {
            element_id: ef.element_id,
            axial_force: n_avg,
            critical_force: pcr,
            k_effective: k_eff,
            effective_length: le,
            length: l,
            slenderness_y,
            slenderness_z,
        });
    }

    let result = BucklingResult3D { structured_diagnostics, modes, n_dof: nf, element_data };
    crate::boundary::require_finite(&result)?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_mode_whose_geometric_work_comes_from_a_span_load_is_resolved() {
        let term = super::super::geometric_stiffness::KgAffineTerm {
            element_id: 1, dofs: vec![0, 1], g: vec![1.0, -1.0, -1.0, 1.0], elongation: vec![], e: 0.0, a: 0.0, l: 1.0, alpha: 0.0, dt: 0.0,
        };
        let span = vec![(1, vec![0, 1], vec![-2.0, 2.0, 2.0, -2.0])];
        let mean_n = HashMap::from([(1, 0.0)]);
        let noise = HashMap::from([(1, 1e-9)]);
        let phi = [1.0, -1.0];
        let (work, uncertainty, _) = geometric_work_uncertainty(&[term], &span, &mean_n, &noise, &phi);
        assert_eq!(work, -8.0);
        assert!(uncertainty <= MODE_RESOLUTION * work.abs(), "work {work}, uncertainty {uncertainty}");
    }

    #[test]
    fn a_member_left_out_at_its_bound_counts_twice_its_bound_and_is_tested_at_n_less_its_bound() {
        let term = super::super::geometric_stiffness::KgAffineTerm {
            element_id: 1, dofs: vec![0, 1], g: vec![1.0, -1.0, -1.0, 1.0], elongation: vec![], e: 0.0, a: 0.0, l: 1.0, alpha: 0.0, dt: 0.0,
        };
        let mean_n = HashMap::from([(1, -1e-9)]);
        let noise = HashMap::from([(1, 1e-9)]);
        let phi = [1.0, -1.0];
        let (work, uncertainty, drivers) = geometric_work_uncertainty(&[term], &[], &mean_n, &noise, &phi);
        assert_eq!((work, uncertainty, drivers), (0.0, 8e-9, vec![1]));
        let worst = super::super::geometric_stiffness::GeometricState::RoundOffAtCompression { mean_n: &mean_n, noise: &noise };
        assert_eq!(worst.axial_force(1), Some(Some(-2e-9)));
        let resolved = super::super::geometric_stiffness::GeometricState::Resolved { mean_n: &mean_n, noise: &noise };
        assert_eq!(resolved.axial_force(1), None);
    }
}
