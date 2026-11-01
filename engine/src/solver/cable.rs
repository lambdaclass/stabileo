/// Nonlinear cable analysis solver.
///
/// Handles mixed cable-frame structures with:
/// - Ernst equivalent modulus for cable elements
/// - Tension-only behavior (zero stiffness in compression)
/// - Iterative modified stiffness with sag-dependent updates
///
/// Cable elements are identified by elem_type == "cable". They use the
/// same node/material/section definitions as trusses but with modified
/// stiffness formulation.
///
/// References:
///   - Irvine, "Cable Structures" (1981)
///   - Ernst, "Der E-Modul von Seilen" (1965)
///   - Buchholdt, "An Introduction to Cable Roof Structures" (1999)

use std::collections::HashMap;
use crate::types::*;
use crate::element;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly;
use super::linear;
use super::constraints::FreeConstraintSystem;
use super::sparse_tangent::{SparseSymbolicCache, tangent_free_sparse_triplets, solve_tangent_sparse};

/// Result of a cable analysis.
#[derive(Debug, Clone)]
pub struct CableAnalysisResult2D {
    pub results: AnalysisResults,
    pub iterations: usize,
    pub converged: bool,
    pub cable_forces: Vec<CableElementResult>,
    /// As `CableAnalysisResult3D::self_weight_tension`.
    pub self_weight_tension: Vec<(usize, f64)>,
}

/// Result of a 3D cable analysis.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CableAnalysisResult3D {
    pub results: AnalysisResults3D,
    pub iterations: usize,
    pub converged: bool,
    pub cable_forces: Vec<CableElementResult>,
    /// Per cable given no pretension and with weight, the tension its own weight gives it with
    /// the chord as its unstressed length, kN (`self_weight_warning`).
    #[serde(skip)]
    pub self_weight_tension: Vec<(usize, f64)>,
}

/// Per-cable-element results.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CableElementResult {
    pub element_id: usize,
    pub tension: f64,
    pub horizontal_thrust: f64,
    pub sag: f64,
    pub ernst_modulus: f64,
    pub unstretched_length: f64,
}

/// Precomputed cable element geometry.
struct CableGeom {
    elem_id: usize,
    node_i_id: usize,
    node_j_id: usize,
    l0: f64,
    /// The unstressed length: the chord `l0` unless a pretension was given (`unstressed_length`).
    lu: f64,
    /// Whether the reader gave the pretension (no self-weight warning then).
    pretensioned: bool,
    dx: f64,
    dy: f64,
    cos_a: f64,
    sin_a: f64,
    ea: f64,
    /// Young's modulus, kN/m².
    e: f64,
    w: f64, // self-weight per unit length (kN/m)
}

/// 3D cable element geometry.
struct CableGeom3D {
    elem_id: usize,
    node_i_id: usize,
    node_j_id: usize,
    l0: f64,
    /// The unstressed length: the chord `l0` unless a pretension was given (`unstressed_length`).
    lu: f64,
    /// Whether the reader gave the pretension (no self-weight warning then).
    pretensioned: bool,
    dx: f64,
    dy: f64,
    dz: f64,
    dir: [f64; 3],
    ea: f64,
    /// Young's modulus, kN/m².
    e: f64,
    w: f64,
}

/// The share of a cable's tension above which `self_weight_warning` warns that its own weight
/// gave most of it (#527).
pub const SELF_WEIGHT_SHARE: f64 = 0.25;

/// A cable's unstressed length: its chord `l0`, or with a pretension `t` given, the length at
/// which the chord law gives `t` on the drawn chord under the cable's own weight `w` (kN/m) over
/// the horizontal projection `l_h`: ε = t/EA − (w·l_h)²/(24 t²), L = l0/(1 + ε).
fn unstressed_length(id: usize, l0: f64, ea: f64, w: f64, l_h: f64, t: Option<f64>) -> Result<f64, String> {
    let Some(t) = t else { return Ok(l0) };
    if !(t.is_finite() && t > 0.0) {
        return Err(format!("Cable {id}: the pretension must be a positive force in kN, not {t}"));
    }
    let wl = w * l_h;
    let eps = t / ea - wl * wl / (24.0 * t * t);
    if !(eps.is_finite() && 1.0 + eps > 0.0) {
        return Err(format!("Cable {id}: a pretension of {t} kN gives no unstressed length (too low for its weight)"));
    }
    Ok(l0 / (1.0 + eps))
}

/// A cable whose own weight gives it a large share of its tension (#527). Drawn as its chord, a
/// cable with weight hangs at T₀³ = EA·(w·l_h)²/24 under nothing else and never goes slack: a
/// heavy member typed as a cable (a rolled section, say) reports a tension that is mostly that.
/// Warned, with the cables and their largest share, when T₀ is over `SELF_WEIGHT_SHARE` of the
/// tension: give a pretension, or make it a truss member.
fn self_weight_warning(forces: &[CableElementResult], t0: &[(usize, f64)]) -> Option<StructuredDiagnostic> {
    let mut ids = Vec::new();
    let mut worst: f64 = 0.0;
    for &(id, t) in t0 {
        let Some(f) = forces.iter().find(|f| f.element_id == id) else { continue };
        if f.tension > 0.0 && t > SELF_WEIGHT_SHARE * f.tension {
            ids.push(id);
            worst = worst.max(t / f.tension);
        }
    }
    if ids.is_empty() {
        return None;
    }
    let mut d = StructuredDiagnostic::global(
        DiagnosticCode::CableSelfWeightTension,
        Severity::Warning,
        format!(
            "Up to {:.0} % of these cables' tension comes from their own weight with the drawn chord as their unstressed length, which keeps them taut whatever the loads: give each its pretension, or make it a truss member if it is not a cable",
            100.0 * worst.min(1.0)
        ),
    );
    d.value = Some(worst);
    d.threshold = Some(SELF_WEIGHT_SHARE);
    Some(d.with_elements(ids))
}

/// E_eq/E of a cable whose stiffness is assembled at `tension` on iteration `iter`: Ernst's
/// reduction for the sag of its own weight over the horizontal projection `l_h`, zero for a cable
/// that went slack on an earlier pass, one otherwise.
///
/// This is the TANGENT dT/dε of the chord law `element::cable_chord_tension` divided by EA, and
/// the iteration uses it only as one: each pass linearises T(ε) about the last state, with the
/// offset T_k − (E_eq/E)·EA·ε_k as a pair of nodal forces, so the converged state satisfies the
/// chord law itself. It used to be used as a secant from the stress-free chord, T = E_eq(T)·A·ε,
/// i.e. ε = T/EA + (w·l_h)²/(12T²) instead of T/EA − (w·l_h)²/(24T²), and an indeterminate system
/// gave its cables too little tension (SP-12, #416).
///
/// The same factor has to reach everything the stiffness produced. The tension used to be
/// EA·strain on displacements solved with E_eq·A, and the reactions and member forces came from
/// the stiffness with the full E: on a tripod hung under 120 kN, whose cables are statically
/// determinate at 50 kN, the cables reported 51.07 and a slack cable kept its full stiffness in the
/// reactions.
fn ernst_factor(w: f64, l_h: f64, ea: f64, tension: f64, iter: usize) -> f64 {
    if tension > 0.0 && w > 1e-15 {
        let wl = w * l_h;
        1.0 / (1.0 + wl * wl * ea / (12.0 * tension.powi(3)))
    } else if tension <= 0.0 && iter > 0 {
        0.0 // Slack cable: remove stiffness
    } else {
        1.0
    }
}

/// The horizontal projection of the chord, over which the cable's weight makes it sag: zero for a
/// vertical cable, which then follows the taut-string law (no sag term, slack when shortened).
fn horizontal_projection_2d(ci: &CableGeom) -> f64 {
    ci.dx.abs()
}

/// 3D twin of `horizontal_projection_2d` (the XY projection).
fn horizontal_projection_3d(ci: &CableGeom3D) -> f64 {
    (ci.dx * ci.dx + ci.dy * ci.dy).sqrt()
}

/// The correction (E_eq/E − 1)·EA/L that turns the full-E truss block of a cable into the one
/// its current factor gives, or `None` when there is none.
fn ernst_diff(factor: f64, ea: f64, l0: f64) -> Option<f64> {
    if (factor - 1.0).abs() > 1e-15 {
        Some((factor - 1.0) * ea / l0)
    } else {
        None
    }
}

/// Ernst equivalent-modulus correction for one 2D cable at the current
/// tension: `Some(diff)` = (E_eq/E − 1)·EA/L to add to the cable's 4×4
/// global stiffness block, or `None` when no correction applies this
/// iteration. Shared by the dense and sparse paths so both apply identical
/// corrections.
fn ernst_diff_2d(ci: &CableGeom, tension: f64, iter: usize) -> Option<f64> {
    ernst_diff(ernst_factor(ci.w, horizontal_projection_2d(ci), ci.ea, tension, iter), ci.ea, ci.l0)
}

/// 3D twin of `ernst_diff_2d` (horizontal projection for the sag term).
fn ernst_diff_3d(ci: &CableGeom3D, tension: f64, iter: usize) -> Option<f64> {
    ernst_diff(ernst_factor(ci.w, horizontal_projection_3d(ci), ci.ea, tension, iter), ci.ea, ci.l0)
}

/// A cable's raw DOFs and the coefficients c of its axial direction (+d at node i, −d at node j):
/// the cable's internal force on its DOFs is −c·T, and c·u = −(chord elongation).
///
/// The coefficients are in the solver's frame: at a node on an inclined support they are rotated
/// the way the assembly rotates that node's rows of K and f, so c·cᵀ·EA/L0 is exactly the cable's
/// block of the assembled (rotated) truss and c·T exactly the force it puts on the rotated DOFs.
fn cable_slots_2d(ci: &CableGeom, dof_num: &DofNumbering, inclined: &[assembly::InclinedTransformData2D]) -> ([usize; 4], [f64; 4]) {
    let dofs = [
        dof_num.global_dof(ci.node_i_id, 0).unwrap(),
        dof_num.global_dof(ci.node_i_id, 1).unwrap(),
        dof_num.global_dof(ci.node_j_id, 0).unwrap(),
        dof_num.global_dof(ci.node_j_id, 1).unwrap(),
    ];
    let mut coef = [ci.cos_a, ci.sin_a, -ci.cos_a, -ci.sin_a];
    for it in inclined {
        for a in 0..2 {
            if dofs[2 * a] == it.dofs[0] && dofs[2 * a + 1] == it.dofs[1] {
                let v = [coef[2 * a], coef[2 * a + 1]];
                for k in 0..2 {
                    coef[2 * a + k] = it.r[k][0] * v[0] + it.r[k][1] * v[1];
                }
            }
        }
    }
    (dofs, coef)
}

/// 3D twin of `cable_slots_2d`; a DOF the numbering does not have is `usize::MAX`.
fn cable_slots_3d(ci: &CableGeom3D, dof_num: &DofNumbering, inclined: &[assembly::InclinedTransformData]) -> ([usize; 6], [f64; 6]) {
    let mut dofs = [usize::MAX; 6];
    let mut coef = [0.0; 6];
    for a in 0..2 {
        let node = if a == 0 { ci.node_i_id } else { ci.node_j_id };
        let sign = if a == 0 { 1.0 } else { -1.0 };
        for i in 0..3 {
            coef[a * 3 + i] = sign * ci.dir[i];
            if let Some(&d) = dof_num.map.get(&(node, i)) { dofs[a * 3 + i] = d; }
        }
    }
    for it in inclined {
        for a in 0..2 {
            if (0..3).all(|k| dofs[3 * a + k] == it.dofs[k]) {
                let v = [coef[3 * a], coef[3 * a + 1], coef[3 * a + 2]];
                for k in 0..3 {
                    coef[3 * a + k] = it.r[k][0] * v[0] + it.r[k][1] * v[1] + it.r[k][2] * v[2];
                }
            }
        }
    }
    (dofs, coef)
}

/// Adds diff·c·cᵀ (a cable's tangent correction) to a dense n×n K at the cable's DOFs.
fn add_block_dense(k: &mut [f64], n: usize, dofs: &[usize], coef: &[f64], diff: f64) {
    for (p, &dp) in dofs.iter().enumerate() {
        if dp == usize::MAX { continue; }
        for (q, &dq) in dofs.iter().enumerate() {
            if dq == usize::MAX { continue; }
            k[dp * n + dq] += diff * coef[p] * coef[q];
        }
    }
}

/// Lower-triangle triplets of diff·c·cᵀ on the free DOFs (the sparse twin of `add_block_dense`).
fn add_block_triplets(rows: &mut Vec<usize>, cols: &mut Vec<usize>, vals: &mut Vec<f64>, nf: usize, dofs: &[usize], coef: &[f64], diff: f64) {
    for p in 0..dofs.len() {
        for q in 0..=p {
            let (dp, dq) = (dofs[p], dofs[q]);
            if dp < nf && dq < nf {
                rows.push(dp);
                cols.push(dq);
                vals.push(diff * coef[p] * coef[q]);
            }
        }
    }
}

/// c·v over a cable's DOFs.
fn along(v: &[f64], dofs: &[usize], coef: &[f64]) -> f64 {
    dofs.iter().zip(coef).filter(|(d, _)| **d != usize::MAX).map(|(d, c)| c * v[*d]).sum()
}

/// v += c·s over a cable's DOFs.
fn add_along(v: &mut [f64], dofs: &[usize], coef: &[f64], s: f64) {
    for (d, c) in dofs.iter().zip(coef) {
        if *d != usize::MAX { v[*d] += c * s; }
    }
}

/// Solve K*u = F with Cholesky fallback to LU.
fn solve_system(k_ff: &[f64], f_f: &[f64], nf: usize) -> Result<Vec<f64>, String> {
    let mut k_work = k_ff.to_vec();
    match cholesky_solve(&mut k_work, f_f, nf) {
        Some(u) => Ok(u),
        None => {
            let mut k_work = k_ff.to_vec();
            let mut f_work = f_f.to_vec();
            lu_solve(&mut k_work, &mut f_work, nf)
                .ok_or_else(|| "Singular stiffness matrix — structure is a mechanism".to_string())
        }
    }
}

/// Solve a 2D structure containing cable elements.
///
/// Uses an iterative procedure:
/// 1. Assemble using standard assembly (cables treated as trusses)
/// 2. Modify cable stiffness entries using Ernst equivalent modulus
/// 3. Solve and extract cable tensions
/// 4. Repeat until cable tensions converge
///
/// `densities`: optional material densities (material_id string → kg/m³).
/// When provided, enables Ernst equivalent modulus correction for cable sag.
pub fn solve_cable_2d(
    input: &SolverInput,
    densities: &HashMap<String, f64>,
    max_iter: usize,
    tolerance: f64,
) -> Result<CableAnalysisResult2D, String> {
    solve_cable_2d_pretensioned(input, densities, &HashMap::new(), max_iter, tolerance)
}

/// `solve_cable_2d` with a pretension per cable (`pretension`: element id → kN): the tension each
/// one has on its drawn chord under its own weight alone, from which its unstressed length is set.
/// A cable not in the map is as long as its chord.
pub fn solve_cable_2d_pretensioned(
    input: &SolverInput,
    densities: &HashMap<String, f64>,
    pretension: &HashMap<String, f64>,
    max_iter: usize,
    tolerance: f64,
) -> Result<CableAnalysisResult2D, String> {
    let mut r = solve_cable_2d_inner(input, densities, pretension, max_iter, tolerance)?;
    r.results.structured_diagnostics.extend(self_weight_warning(&r.cable_forces, &r.self_weight_tension));
    crate::known_issues::attach(&mut r.results.structured_diagnostics, crate::known_issues::for_2d(input, crate::known_issues::Analysis::Cable));
    Ok(r)
}

fn solve_cable_2d_inner(
    input: &SolverInput,
    densities: &HashMap<String, f64>,
    pretension: &HashMap<String, f64>,
    max_iter: usize,
    tolerance: f64,
) -> Result<CableAnalysisResult2D, String> {
    // The same input checks as every other analysis (non-finite values,
    // dangling ids, unknown support types, ambiguous shared supports).
    linear::validate_input_2d(input)?;
    let dof_num = DofNumbering::build_2d(input);

    if dof_num.n_free == 0 {
        return Err("No free DOFs — all nodes are fully restrained".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_2d(&input, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Identify cable elements
    let has_cables = crate::ordered::values(&input.elements).any(|e| e.elem_type == "cable");

    if !has_cables {
        let results = linear::solve_2d(input)?;
        return Ok(CableAnalysisResult2D {
            results,
            iterations: 1,
            converged: true,
            cable_forces: Vec::new(),
            self_weight_tension: Vec::new(),
        });
    }

    // Build O(1) lookup maps by id
    let node_by_id: HashMap<usize, &SolverNode> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    // Precompute cable geometry
    let mut cables: Vec<CableGeom> = Vec::new();
    let mut cable_tensions: HashMap<usize, f64> = HashMap::new();
    // Per cable, the small-displacement chord strain d·(u_j − u_i)/L0 of the last solve: the
    // strain the assembled truss block sees, about which the chord law is linearised.
    let mut cable_eps_lin: HashMap<usize, f64> = HashMap::new();

    for elem in crate::ordered::values(&input.elements) {
        if elem.elem_type != "cable" {
            continue;
        }
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.z - node_i.z;
        let l0 = (dx * dx + dy * dy).sqrt();
        let e = mat.e * 1000.0;

        let density = densities.get(&elem.material_id.to_string())
            .copied().unwrap_or(0.0) / 1000.0; // kg/m³ → t/m³
        let w = element::cable_self_weight(density, sec.a);
        // Below this the sag term is round-off; the cable is a taut string.
        let w = if w > 1e-15 { w } else { 0.0 };

        let given = pretension.get(&elem.id.to_string()).copied();
        let lu = unstressed_length(elem.id, l0, e * sec.a, w, dx.abs(), given)?;
        cables.push(CableGeom {
            elem_id: elem.id,
            node_i_id: elem.node_i,
            node_j_id: elem.node_j,
            l0, lu, pretensioned: given.is_some(), dx, dy,
            cos_a: dx / l0,
            sin_a: dy / l0,
            ea: e * sec.a,
            e,
            w,
        });
        // The state the first pass linearises about: the undeformed chord, at the tension the
        // chord law gives it (the pretension given; otherwise zero without weight and, with
        // weight, the tension at which a cable as long as its chord hangs between its nodes).
        let ci = cables.last().unwrap();
        cable_tensions.insert(elem.id, element::cable_chord_tension(ci.ea, ci.w, horizontal_projection_2d(ci), (ci.l0 - ci.lu) / ci.lu));
        cable_eps_lin.insert(elem.id, 0.0);
    }

    // Dispatch dense vs sparse once per solve call (not per iteration).
    let use_sparse = ns >= linear::SPARSE_THRESHOLD;

    // Base assembly (treats cables as trusses with full E). Below the sparse
    // threshold this is the dense n×n assembly, byte-identical to the legacy
    // path; at or above it the base is assembled directly as CSC — k_ff for
    // the per-iteration solves and k_full for the reaction block — so no
    // dense n×n matrix is ever built.
    let dense_asm = if use_sparse {
        None
    } else {
        Some(assembly::assemble_2d(input, &dof_num))
    };
    let sparse_stiff = if use_sparse {
        Some(super::sparse_assembly::assemble_stiffness_sparse_2d(input, &dof_num))
    } else {
        None
    };
    let f_global = if let Some(ref s) = sparse_stiff {
        // Same load vector the dense assembly produces (same builder, same
        // inclined transforms — assemble_2d is exactly this composition).
        assembly::assemble_load_vector_2d(input, &input.loads, &dof_num, &s.inclined_transforms_2d)
    } else {
        dense_asm.as_ref().unwrap().f.clone()
    };
    let inclined_2d: &[assembly::InclinedTransformData2D] = if let Some(ref s) = sparse_stiff {
        &s.inclined_transforms_2d
    } else {
        &dense_asm.as_ref().unwrap().inclined_transforms_2d
    };

    // Base free×free triplets, cached once (sparse path only): each iteration
    // concatenates them with the Ernst correction triplets and rebuilds the
    // corrected CSC, so corrections never accumulate into the base.
    let mut base_tr: Vec<usize> = Vec::new();
    let mut base_tc: Vec<usize> = Vec::new();
    let mut base_tv: Vec<f64> = Vec::new();
    if let Some(ref s) = sparse_stiff {
        let k = &s.k_ff;
        base_tr.reserve(k.nnz());
        base_tc.reserve(k.nnz());
        base_tv.reserve(k.nnz());
        for j in 0..nf {
            for p in k.col_ptr[j]..k.col_ptr[j + 1] {
                base_tr.push(k.row_idx[p]);
                base_tc.push(j);
                base_tv.push(k.values[p]);
            }
        }
    }

    // Each cable's DOFs and solver-frame direction coefficients (fixed geometry).
    let slots: Vec<_> = cables.iter().map(|ci| cable_slots_2d(ci, &dof_num, inclined_2d)).collect();
    let mut u_full = vec![0.0; n];
    let mut converged = false;
    let mut total_iterations = 0;
    // Per cable, the E_eq/E its stiffness had in the last solve.
    let mut assembled_factor: HashMap<usize, f64> = HashMap::new();

    // Sparse symbolic Cholesky reused across iterations (the Ernst
    // correction changes values, not the pattern; the fingerprinted cache
    // rebuilds the symbolic if a value ever crosses exactly zero).
    let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;

    for iter in 0..max_iter {
        total_iterations = iter + 1;

        // Newton on the chord law. The assembled cable block is the tangent (E_eq/E)·EA/L0 at the
        // last tension T_k; the rest of T(ε) ≈ T_k + (E_eq/E)·EA·(ε − ε_k) goes to the right-hand
        // side as nodal forces. They are built from what the matrix actually produces (the base
        // truss with its full EA, rotated at inclined supports, plus the correction block as
        // assembled, both in the solver's frame), so at the fixed point the cables pull with
        // T(ε) exactly, whatever the tangent: c·(T_k − EA·ε_k) plus diff·c·(c·u_k).
        let mut f_cable = vec![0.0; n];
        let mut tangent: Vec<Option<f64>> = Vec::with_capacity(cables.len());
        for (ci, (dofs, coef)) in cables.iter().zip(&slots) {
            let diff = ernst_diff_2d(ci, cable_tensions[&ci.elem_id], iter);
            let mut s = cable_tensions[&ci.elem_id] - ci.ea * cable_eps_lin[&ci.elem_id];
            if let Some(diff) = diff {
                s += diff * along(&u_full, dofs, coef);
            }
            add_along(&mut f_cable, dofs, coef, s);
            tangent.push(diff);
        }
        let f_f: Vec<f64> = (0..nf).map(|i| f_global[i] + f_cable[i]).collect();

        let u_indep = if use_sparse {
            // Sparse path: rebuild the corrected CSC from the cached base
            // triplets plus the Ernst correction triplets — no dense matrix.
            let mut rows = base_tr.clone();
            let mut cols = base_tc.clone();
            let mut vals = base_tv.clone();
            for ((dofs, coef), diff) in slots.iter().zip(&tangent) {
                if let Some(diff) = *diff {
                    add_block_triplets(&mut rows, &mut cols, &mut vals, nf, dofs, coef, diff);
                }
            }
            let f_solve = if let Some(ref cs) = cs { cs.reduce_vector(&f_f) } else { f_f };
            let k_csc = tangent_free_sparse_triplets(&rows, &cols, &vals, nf, &cs);
            solve_tangent_sparse(&k_csc, &f_solve, &mut sparse_sym_cache)?
        } else {
            let mut k_global = dense_asm.as_ref().unwrap().k.clone();
            // The tangent correction (E_eq/E − 1)·EA/L0·c·cᵀ, in the solver's frame like the base.
            for ((dofs, coef), diff) in slots.iter().zip(&tangent) {
                if let Some(diff) = *diff {
                    add_block_dense(&mut k_global, n, dofs, coef, diff);
                }
            }
            let free_idx: Vec<usize> = (0..nf).collect();
            let k_ff = extract_submatrix(&k_global, n, &free_idx, &free_idx);
            let (k_solve, f_solve) = if let Some(ref cs) = cs {
                (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_f))
            } else {
                (k_ff, f_f)
            };
            solve_system(&k_solve, &f_solve, ns)?
        };
        let u_f = if let Some(ref cs) = cs {
            cs.expand_solution(&u_indep)
        } else {
            u_indep
        };

        for i in 0..nf {
            u_full[i] = u_f[i];
        }

        // Update cable tensions from deformed geometry.
        // Tension is a geometric (TRUE global) quantity, but u_full stores
        // inclined-support DOFs in the rotated (tangent, normal) support-local
        // frame — build a true-global scratch copy before using it here (and,
        // on the final iteration, this also becomes the basis for the
        // reported cable_forces tension below). Mirrors the reversal used
        // elsewhere in this file for reporting.
        let mut u_geom = u_full.clone();
        for it in inclined_2d {
            assembly::reverse_inclined_transform_2d(&mut u_geom, &it.dofs, &it.r);
        }

        let mut max_tension_change = 0.0_f64;
        let mut tension_scale = 0.0_f64;
        let mut reactivated = false;

        for ci in &cables {
            let u_xi = dof_num.global_dof(ci.node_i_id, 0).map(|d| u_geom[d]).unwrap_or(0.0);
            let u_yi = dof_num.global_dof(ci.node_i_id, 1).map(|d| u_geom[d]).unwrap_or(0.0);
            let u_xj = dof_num.global_dof(ci.node_j_id, 0).map(|d| u_geom[d]).unwrap_or(0.0);
            let u_yj = dof_num.global_dof(ci.node_j_id, 1).map(|d| u_geom[d]).unwrap_or(0.0);

            let dx_def = ci.dx + u_xj - u_xi;
            let dy_def = ci.dy + u_yj - u_yi;
            let l_def = (dx_def * dx_def + dy_def * dy_def).sqrt();

            let strain = (l_def - ci.lu) / ci.lu;
            let old_tension = cable_tensions[&ci.elem_id];
            // The modulus the displacements were solved with: the one this pass assembled.
            let factor = ernst_factor(ci.w, horizontal_projection_2d(ci), ci.ea, old_tension, iter);
            assembled_factor.insert(ci.elem_id, factor);
            // The chord law at the new chord. A slack cable (no weight, shortened chord) has
            // no assembled stiffness; positive strain gives it tension again, which forces
            // another pass with its stiffness restored before a result can converge.
            let tension = element::cable_chord_tension(ci.ea, ci.w, horizontal_projection_2d(ci), strain);
            let eps_lin = (ci.cos_a * (u_xj - u_xi) + ci.sin_a * (u_yj - u_yi)) / ci.l0;
            let old_eps_lin = cable_eps_lin.insert(ci.elem_id, eps_lin).unwrap_or(0.0);
            // The force the solved system gave the cable (its linearised law at the new strain):
            // at a solution it is the chord-law tension of the new chord.
            let t_sys = old_tension + factor * ci.ea * (eps_lin - old_eps_lin);
            let change = (tension - old_tension).abs().max((tension - t_sys).abs());
            max_tension_change = max_tension_change.max(change);
            tension_scale = tension_scale.max(old_tension.abs()).max(tension.abs());
            // A slack cable that takes tension again has to be solved with its stiffness back.
            if factor == 0.0 && tension > 0.0 {
                reactivated = true;
            }

            cable_tensions.insert(ci.elem_id, tension);
        }

        // Relative to the largest cable tension of the model, so a model of small forces is held
        // to the same tolerance as one of large forces.
        if !reactivated && max_tension_change <= tolerance * tension_scale && iter > 0 {
            converged = true;
            break;
        }
    }

    // Build results
    let nr = n - nf;
    let rest_idx: Vec<usize> = (nf..n).collect();
    let free_idx: Vec<usize> = (0..nf).collect();
    // Reactions use the BASE stiffness (same as the legacy dense path).
    let k_rf = if let Some(ref s) = sparse_stiff {
        // Same restrained×free block as the dense extract, from the full-K CSC.
        s.k_full.extract_block_dense(&rest_idx, &free_idx)
    } else {
        extract_submatrix(&dense_asm.as_ref().unwrap().k, n, &rest_idx, &free_idx)
    };
    let f_r = extract_subvec(&f_global, &rest_idx);
    let u_f: Vec<f64> = u_full[..nf].to_vec();
    let k_rf_uf = mat_vec_rect(&k_rf, &u_f, nr, nf);
    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = k_rf_uf[i] - f_r[i];
    }
    // The base block gives every cable the force EA·ε_lin of a full-E truss; the supports feel its
    // tension T instead: add −c·(T − EA·ε_lin) at the restrained DOFs (c in the solver's frame).
    let mut r_cable = vec![0.0; n];
    for (ci, (dofs, coef)) in cables.iter().zip(&slots) {
        add_along(&mut r_cable, dofs, coef, -(cable_tensions[&ci.elem_id] - ci.ea * cable_eps_lin[&ci.elem_id]));
    }
    for i in 0..nr {
        reactions_vec[i] += r_cable[nf + i];
    }

    // Reverse inclined transforms on displacements before building results —
    // mirrors linear::solve_2d so cable analysis reports reactions and
    // displacements in GLOBAL axes (reactions_vec/f_r stay in the rotated
    // frame; only u_full is reversed).
    for it in inclined_2d {
        assembly::reverse_inclined_transform_2d(&mut u_full, &it.dofs, &it.r);
    }

    let displacements = linear::build_displacements_2d(&dof_num, &u_full);
    let mut reactions = linear::build_reactions_2d_inclined(
        input, &dof_num, &reactions_vec, &f_r, nf, &u_full, inclined_2d,
    );
    reactions.sort_by_key(|r| r.node_id);

    let mut element_forces = linear::compute_internal_forces_2d(input, &dof_num, &u_full);
    element_forces.sort_by_key(|ef| ef.element_id);
    // A cable's axial force is its tension; the linear recovery would give it the full-E truss's.
    for ef in element_forces.iter_mut() {
        if let Some(&t) = cable_tensions.get(&ef.element_id) {
            ef.n_start = t;
            ef.n_end = t;
        }
    }

    // Compute constraint forces if constraints are active. Uses u_f/f_global
    // (pre-reversal, rotated-frame convention) — u_full has already been
    // reversed above for reporting, so it can no longer be sliced here.
    // The base K gives each cable EA·ε_lin; its force is T: K·u − (f − r_cable) on the free DOFs.
    let f_constraint: Vec<f64> = (0..nf).map(|i| f_global[i] - r_cable[i]).collect();
    let constraint_forces = if let Some(ref fcs) = cs {
        let raw = if let Some(ref s) = sparse_stiff {
            fcs.compute_constraint_forces_sparse(&s.k_ff, &u_f, &f_constraint)
        } else {
            let k_ff = extract_submatrix(&dense_asm.as_ref().unwrap().k, n, &free_idx, &free_idx);
            fcs.compute_constraint_forces(&k_ff, &u_f, &f_constraint)
        };
        fcs.constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    let results = AnalysisResults {
        displacements,
        reactions,
        element_forces,
        constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: vec![],
        equilibrium: None,
        result_summary: None, solver_run_meta: None,
    };

    // Cable-specific results
    let cable_forces = cables.iter().map(|ci| {
        let tension = cable_tensions[&ci.elem_id];
        let l_h = ci.dx.abs().max(1e-10);
        let h_thrust = tension * l_h / ci.l0;
        let sag = if h_thrust > 1e-10 && ci.w > 1e-15 {
            element::cable_sag(ci.w, l_h, h_thrust)
        } else {
            0.0
        };
        // E·E_eq/E, kN/m²: this used to be EA_eq (kN) with weight and EA/L (kN/m) without.
        let e_eq = ci.e * assembled_factor.get(&ci.elem_id).copied().unwrap_or(1.0);
        CableElementResult {
            element_id: ci.elem_id,
            tension,
            horizontal_thrust: h_thrust,
            sag,
            ernst_modulus: e_eq,
            unstretched_length: ci.lu,
        }
    }).collect();

    let self_weight_tension = cables.iter().filter(|c| !c.pretensioned && c.w > 0.0)
        .map(|c| (c.elem_id, element::cable_chord_tension(c.ea, c.w, horizontal_projection_2d(c), 0.0))).collect();
    Ok(CableAnalysisResult2D {
        results,
        iterations: total_iterations,
        converged,
        cable_forces,
        self_weight_tension,
    })
}

/// Solve a 3D structure containing cable elements.
pub fn solve_cable_3d(
    input: &SolverInput3D,
    densities: &HashMap<String, f64>,
    max_iter: usize,
    tolerance: f64,
) -> Result<CableAnalysisResult3D, String> {
    solve_cable_3d_pretensioned(input, densities, &HashMap::new(), max_iter, tolerance)
}

/// 3D twin of `solve_cable_2d_pretensioned`.
pub fn solve_cable_3d_pretensioned(
    input: &SolverInput3D,
    densities: &HashMap<String, f64>,
    pretension: &HashMap<String, f64>,
    max_iter: usize,
    tolerance: f64,
) -> Result<CableAnalysisResult3D, String> {
    let mut r = solve_cable_3d_inner(input, densities, pretension, max_iter, tolerance)?;
    crate::known_issues::membrane_bending_3d(input, &input.loads, &r.results)?;
    r.results.structured_diagnostics.extend(self_weight_warning(&r.cable_forces, &r.self_weight_tension));
    crate::known_issues::attach(&mut r.results.structured_diagnostics, crate::known_issues::for_3d(input, crate::known_issues::Analysis::Cable));
    Ok(r)
}

fn solve_cable_3d_inner(
    input: &SolverInput3D,
    densities: &HashMap<String, f64>,
    pretension: &HashMap<String, f64>,
    max_iter: usize,
    tolerance: f64,
) -> Result<CableAnalysisResult3D, String> {
    // Expand curved beams before DOF numbering and assembly.
    let input = &super::linear::expand_curved_beams_3d(input);
    linear::validate_input_3d(input)?;
    let dof_num = DofNumbering::build_3d(input);

    if dof_num.n_free == 0 {
        return Err("No free DOFs — all nodes are fully restrained".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_3d(&input, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    let has_cables = crate::ordered::values(&input.elements).any(|e| e.elem_type == "cable");

    if !has_cables {
        let results = linear::solve_3d(input)?;
        return Ok(CableAnalysisResult3D {
            results,
            iterations: 1,
            converged: true,
            cable_forces: Vec::new(),
            self_weight_tension: Vec::new(),
        });
    }

    // Build O(1) lookup maps by id
    let node_by_id: HashMap<usize, &SolverNode3D> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection3D> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    let mut cables: Vec<CableGeom3D> = Vec::new();
    let mut cable_tensions: HashMap<usize, f64> = HashMap::new();
    // Per cable, the small-displacement chord strain d·(u_j − u_i)/L0 of the last solve: the
    // strain the assembled truss block sees, about which the chord law is linearised.
    let mut cable_eps_lin: HashMap<usize, f64> = HashMap::new();

    for elem in crate::ordered::values(&input.elements) {
        if elem.elem_type != "cable" {
            continue;
        }
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l0 = (dx * dx + dy * dy + dz * dz).sqrt();
        let e = mat.e * 1000.0;

        let density = densities.get(&elem.material_id.to_string())
            .copied().unwrap_or(0.0) / 1000.0; // kg/m³ → t/m³
        let w = element::cable_self_weight(density, sec.a);
        // Below this the sag term is round-off; the cable is a taut string.
        let w = if w > 1e-15 { w } else { 0.0 };

        let given = pretension.get(&elem.id.to_string()).copied();
        let lu = unstressed_length(elem.id, l0, e * sec.a, w, (dx * dx + dy * dy).sqrt(), given)?;
        cables.push(CableGeom3D {
            elem_id: elem.id,
            node_i_id: elem.node_i,
            node_j_id: elem.node_j,
            l0, lu, pretensioned: given.is_some(), dx, dy, dz,
            dir: [dx / l0, dy / l0, dz / l0],
            ea: e * sec.a,
            e,
            w,
        });
        // The state the first pass linearises about: the undeformed chord, at the tension the
        // chord law gives it (the pretension given; otherwise zero without weight and, with
        // weight, the tension at which a cable as long as its chord hangs between its nodes).
        let ci = cables.last().unwrap();
        cable_tensions.insert(elem.id, element::cable_chord_tension(ci.ea, ci.w, horizontal_projection_3d(ci), (ci.l0 - ci.lu) / ci.lu));
        cable_eps_lin.insert(elem.id, 0.0);
    }

    // Dispatch dense vs sparse once per solve call (not per iteration).
    let use_sparse = ns >= linear::SPARSE_THRESHOLD;

    // Base assembly (cables as full-E trusses). Below the sparse threshold:
    // the legacy dense n×n path, unchanged. At or above it: CSC assembly —
    // k_ff for the per-iteration solves, k_full for the reaction block — so
    // no dense n×n matrix is ever built.
    let dense_asm = if use_sparse {
        None
    } else {
        Some(assembly::assemble_3d(input, &dof_num))
    };
    let sparse_asm = if use_sparse {
        Some(assembly::assemble_sparse_3d(input, &dof_num, true))
    } else {
        None
    };
    let f_global = if let Some(ref s) = sparse_asm {
        s.f.clone()
    } else {
        dense_asm.as_ref().unwrap().f.clone()
    };
    let inclined_3d: &[assembly::InclinedTransformData] = if let Some(ref s) = sparse_asm {
        &s.inclined_transforms
    } else {
        &dense_asm.as_ref().unwrap().inclined_transforms
    };

    // Base free×free triplets, cached once (sparse path only): each iteration
    // concatenates them with the Ernst correction triplets and rebuilds the
    // corrected CSC, so corrections never accumulate into the base.
    let mut base_tr: Vec<usize> = Vec::new();
    let mut base_tc: Vec<usize> = Vec::new();
    let mut base_tv: Vec<f64> = Vec::new();
    if let Some(ref s) = sparse_asm {
        let k = &s.k_ff;
        base_tr.reserve(k.nnz());
        base_tc.reserve(k.nnz());
        base_tv.reserve(k.nnz());
        for j in 0..nf {
            for p in k.col_ptr[j]..k.col_ptr[j + 1] {
                base_tr.push(k.row_idx[p]);
                base_tc.push(j);
                base_tv.push(k.values[p]);
            }
        }
    }

    // Each cable's DOFs and solver-frame direction coefficients (fixed geometry).
    let slots: Vec<_> = cables.iter().map(|ci| cable_slots_3d(ci, &dof_num, inclined_3d)).collect();
    let mut u_full = vec![0.0; n];
    let mut converged = false;
    let mut total_iterations = 0;
    // Per cable, the E_eq/E its stiffness had in the last solve.
    let mut assembled_factor: HashMap<usize, f64> = HashMap::new();

    // Sparse symbolic Cholesky reused across iterations (the Ernst
    // correction changes values, not the pattern; the fingerprinted cache
    // rebuilds the symbolic if a value ever crosses exactly zero).
    let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;

    for iter in 0..max_iter {
        total_iterations = iter + 1;

        // Newton on the chord law. The assembled cable block is the tangent (E_eq/E)·EA/L0 at the
        // last tension T_k; the rest of T(ε) ≈ T_k + (E_eq/E)·EA·(ε − ε_k) goes to the right-hand
        // side as nodal forces. They are built from what the matrix actually produces (the base
        // truss with its full EA, rotated at inclined supports, plus the correction block as
        // assembled, both in the solver's frame), so at the fixed point the cables pull with
        // T(ε) exactly, whatever the tangent: c·(T_k − EA·ε_k) plus diff·c·(c·u_k).
        let mut f_cable = vec![0.0; n];
        let mut tangent: Vec<Option<f64>> = Vec::with_capacity(cables.len());
        for (ci, (dofs, coef)) in cables.iter().zip(&slots) {
            let diff = ernst_diff_3d(ci, cable_tensions[&ci.elem_id], iter);
            let mut s = cable_tensions[&ci.elem_id] - ci.ea * cable_eps_lin[&ci.elem_id];
            if let Some(diff) = diff {
                s += diff * along(&u_full, dofs, coef);
            }
            add_along(&mut f_cable, dofs, coef, s);
            tangent.push(diff);
        }
        let f_f: Vec<f64> = (0..nf).map(|i| f_global[i] + f_cable[i]).collect();

        let u_indep = if use_sparse {
            // Sparse path: rebuild the corrected CSC from the cached base
            // triplets plus the Ernst correction triplets — no dense matrix.
            let mut rows = base_tr.clone();
            let mut cols = base_tc.clone();
            let mut vals = base_tv.clone();
            for ((dofs, coef), diff) in slots.iter().zip(&tangent) {
                if let Some(diff) = *diff {
                    add_block_triplets(&mut rows, &mut cols, &mut vals, nf, dofs, coef, diff);
                }
            }
            let f_solve = if let Some(ref cs) = cs { cs.reduce_vector(&f_f) } else { f_f };
            let k_csc = tangent_free_sparse_triplets(&rows, &cols, &vals, nf, &cs);
            solve_tangent_sparse(&k_csc, &f_solve, &mut sparse_sym_cache)?
        } else {
            let mut k_global = dense_asm.as_ref().unwrap().k.clone();
            // The tangent correction (E_eq/E − 1)·EA/L0·c·cᵀ, in the solver's frame like the base.
            for ((dofs, coef), diff) in slots.iter().zip(&tangent) {
                if let Some(diff) = *diff {
                    add_block_dense(&mut k_global, n, dofs, coef, diff);
                }
            }
            let free_idx: Vec<usize> = (0..nf).collect();
            let k_ff = extract_submatrix(&k_global, n, &free_idx, &free_idx);
            let (k_solve, f_solve) = if let Some(ref cs) = cs {
                (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_f))
            } else {
                (k_ff, f_f)
            };
            solve_system(&k_solve, &f_solve, ns)?
        };
        let u_f = if let Some(ref cs) = cs {
            cs.expand_solution(&u_indep)
        } else {
            u_indep
        };

        for i in 0..nf {
            u_full[i] = u_f[i];
        }

        // Tension is a geometric (TRUE global) quantity — build a true-global
        // scratch copy before using u_full here (and, on the final iteration,
        // as the basis for the reported cable_forces tension below). See the
        // 2D solver's identical comment.
        let mut u_geom = u_full.clone();
        for it in inclined_3d {
            assembly::reverse_inclined_transform(&mut u_geom, &it.dofs, &it.r);
        }

        let mut max_tension_change = 0.0_f64;
        let mut tension_scale = 0.0_f64;
        let mut reactivated = false;

        for ci in &cables {
            let u_i: Vec<f64> = (0..3).map(|d| {
                dof_num.global_dof(ci.node_i_id, d).map(|dd| u_geom[dd]).unwrap_or(0.0)
            }).collect();
            let u_j: Vec<f64> = (0..3).map(|d| {
                dof_num.global_dof(ci.node_j_id, d).map(|dd| u_geom[dd]).unwrap_or(0.0)
            }).collect();

            let dx_def = ci.dx + u_j[0] - u_i[0];
            let dy_def = ci.dy + u_j[1] - u_i[1];
            let dz_def = ci.dz + u_j[2] - u_i[2];
            let l_def = (dx_def * dx_def + dy_def * dy_def + dz_def * dz_def).sqrt();

            let strain = (l_def - ci.lu) / ci.lu;
            let old_tension = cable_tensions[&ci.elem_id];
            // The modulus the displacements were solved with: the one this pass assembled.
            let factor = ernst_factor(ci.w, horizontal_projection_3d(ci), ci.ea, old_tension, iter);
            assembled_factor.insert(ci.elem_id, factor);
            // The chord law at the new chord. A slack cable (no weight, shortened chord) has
            // no assembled stiffness; positive strain gives it tension again, which forces
            // another pass with its stiffness restored before a result can converge.
            let tension = element::cable_chord_tension(ci.ea, ci.w, horizontal_projection_3d(ci), strain);
            let eps_lin = (0..3).map(|d| ci.dir[d] * (u_j[d] - u_i[d])).sum::<f64>() / ci.l0;
            let old_eps_lin = cable_eps_lin.insert(ci.elem_id, eps_lin).unwrap_or(0.0);
            // The force the solved system gave the cable (its linearised law at the new strain):
            // at a solution it is the chord-law tension of the new chord.
            let t_sys = old_tension + factor * ci.ea * (eps_lin - old_eps_lin);
            let change = (tension - old_tension).abs().max((tension - t_sys).abs());
            max_tension_change = max_tension_change.max(change);
            tension_scale = tension_scale.max(old_tension.abs()).max(tension.abs());
            // A slack cable that takes tension again has to be solved with its stiffness back.
            if factor == 0.0 && tension > 0.0 {
                reactivated = true;
            }

            cable_tensions.insert(ci.elem_id, tension);
        }

        // Relative to the largest cable tension of the model, so a model of small forces is held
        // to the same tolerance as one of large forces.
        if !reactivated && max_tension_change <= tolerance * tension_scale && iter > 0 {
            converged = true;
            break;
        }
    }

    let nr = n - nf;
    let rest_idx: Vec<usize> = (nf..n).collect();
    let free_idx: Vec<usize> = (0..nf).collect();
    // Reactions use the BASE stiffness (same as the legacy dense path).
    let k_rf = if let Some(ref s) = sparse_asm {
        // Same restrained×free block as the dense extract, from the full-K CSC.
        s.k_full.as_ref().unwrap().extract_block_dense(&rest_idx, &free_idx)
    } else {
        extract_submatrix(&dense_asm.as_ref().unwrap().k, n, &rest_idx, &free_idx)
    };
    let f_r = extract_subvec(&f_global, &rest_idx);
    let u_f: Vec<f64> = u_full[..nf].to_vec();
    let k_rf_uf = mat_vec_rect(&k_rf, &u_f, nr, nf);
    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = k_rf_uf[i] - f_r[i];
    }
    // The base block gives every cable the force EA·ε_lin of a full-E truss; the supports feel its
    // tension T instead: add −c·(T − EA·ε_lin) at the restrained DOFs (c in the solver's frame).
    let mut r_cable = vec![0.0; n];
    for (ci, (dofs, coef)) in cables.iter().zip(&slots) {
        add_along(&mut r_cable, dofs, coef, -(cable_tensions[&ci.elem_id] - ci.ea * cable_eps_lin[&ci.elem_id]));
    }
    for i in 0..nr {
        reactions_vec[i] += r_cable[nf + i];
    }

    // Reverse inclined transforms on displacements before building results —
    // mirrors linear::solve_3d so cable analysis reports reactions and
    // displacements in GLOBAL axes.
    for it in inclined_3d {
        assembly::reverse_inclined_transform(&mut u_full, &it.dofs, &it.r);
    }

    let displacements = linear::build_displacements_3d(&dof_num, &u_full);
    let mut reactions = linear::build_reactions_3d_inclined(
        input, &dof_num, &reactions_vec, &f_r, nf, &u_full, inclined_3d,
    );
    reactions.sort_by_key(|r| r.node_id);

    let mut element_forces = linear::compute_internal_forces_3d(input, &dof_num, &u_full);
    element_forces.sort_by_key(|ef| ef.element_id);
    // A cable's axial force is its tension; the linear recovery would give it the full-E truss's.
    for ef in element_forces.iter_mut() {
        if let Some(&t) = cable_tensions.get(&ef.element_id) {
            ef.n_start = t;
            ef.n_end = t;
        }
    }

    // Compute constraint forces if constraints are active. Uses u_f/f_global
    // (pre-reversal, rotated-frame convention) — see 2D solve_cable for why.
    // The base K gives each cable EA·ε_lin; its force is T: K·u − (f − r_cable) on the free DOFs.
    let f_constraint: Vec<f64> = (0..nf).map(|i| f_global[i] - r_cable[i]).collect();
    let constraint_forces = if let Some(ref fcs) = cs {
        let raw = if let Some(ref s) = sparse_asm {
            fcs.compute_constraint_forces_sparse(&s.k_ff, &u_f, &f_constraint)
        } else {
            let k_ff = extract_submatrix(&dense_asm.as_ref().unwrap().k, n, &free_idx, &free_idx);
            fcs.compute_constraint_forces(&k_ff, &u_f, &f_constraint)
        };
        fcs.constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    let results = AnalysisResults3D {
        displacements,
        reactions,
        element_forces,
        plate_stresses: linear::compute_plate_stresses(input, &dof_num, &u_full, None),
        quad_stresses: linear::compute_quad_stresses(input, &dof_num, &u_full, None),
        quad_nodal_stresses: vec![],
        constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: vec![],
        equilibrium: None,
        timings: None,
        result_summary: None, solver_run_meta: None,
    };

    let cable_forces = cables.iter().map(|ci| {
        let tension = cable_tensions[&ci.elem_id];
        let l_h = (ci.dx * ci.dx + ci.dy * ci.dy).sqrt().max(1e-10);
        let h_thrust = tension * l_h / ci.l0;
        let sag = if h_thrust > 1e-10 && ci.w > 1e-15 {
            element::cable_sag(ci.w, l_h, h_thrust)
        } else {
            0.0
        };
        CableElementResult {
            element_id: ci.elem_id,
            tension,
            horizontal_thrust: h_thrust,
            sag,
            // kN/m²; this used to report EA/L.
            ernst_modulus: ci.e * assembled_factor.get(&ci.elem_id).copied().unwrap_or(1.0),
            unstretched_length: ci.lu,
        }
    }).collect();

    let self_weight_tension = cables.iter().filter(|c| !c.pretensioned && c.w > 0.0)
        .map(|c| (c.elem_id, element::cable_chord_tension(c.ea, c.w, horizontal_projection_3d(c), 0.0))).collect();
    Ok(CableAnalysisResult3D {
        results,
        iterations: total_iterations,
        converged,
        cable_forces,
        self_weight_tension,
    })
}
