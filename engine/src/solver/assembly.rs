use crate::types::*;
use crate::element::*;
use crate::linalg::*;
use crate::linalg::sparse::CscMatrix;
use super::dof::DofNumbering;

/// Maps 12-DOF element indices to 14-DOF positions, skipping warping DOFs 6 and 13.
const DOF_MAP_12_TO_14: [usize; 12] = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];

/// Assembly result: global stiffness matrix and force vector.
pub struct AssemblyResult {
    pub k: Vec<f64>,       // n_total × n_total stiffness matrix
    pub f: Vec<f64>,       // n_total force vector
    pub max_diag_k: f64,   // Maximum diagonal element (for artificial stiffness)
    pub artificial_dofs: Vec<usize>, // DOFs with artificial stiffness added
    pub inclined_transforms: Vec<InclinedTransformData>, // Data for reversing 3D inclined support rotations
    pub inclined_transforms_2d: Vec<InclinedTransformData2D>, // Data for reversing 2D inclined support rotations
    pub diagnostics: Vec<crate::types::AssemblyDiagnostic>, // Element quality warnings
}

/// Data needed to reverse the inclined support rotation after solving (3D).
pub struct InclinedTransformData {
    pub node_id: usize,
    pub dofs: [usize; 3],        // Global DOF indices for ux, uy, uz
    pub r: [[f64; 3]; 3],        // Rotation matrix (rows = local axes)
}

/// Data needed to reverse the 2D inclined support rotation after solving.
pub struct InclinedTransformData2D {
    pub node_id: usize,
    pub dofs: [usize; 2],        // Global DOF indices for ux, uz
    pub r: [[f64; 2]; 2],        // 2×2 rotation matrix
}

/// Build 2×2 rotation matrix for 2D inclined support at angle θ.
///
/// Convention: θ is measured from the Z axis toward the X axis.
/// The restrained (normal) direction has unit vector (sin θ, cos θ) in global (x, z).
///   At θ=0: restrained direction = (0, 1) = Z → rollerX behavior (free in X)
///   At θ=π/2: restrained direction = (1, 0) = X → rollerZ behavior (free in Z)
///
/// The rotation maps global (x, z) to local (tangent, normal):
///   local[0] = tangent (free)   = -cos(θ) * x + sin(θ) * z
///   local[1] = normal (restrained) = sin(θ) * x + cos(θ) * z
///
/// This ensures DOF local_dof=1 (uz slot, restrained for inclinedRoller) corresponds
/// to the normal direction.
///
/// R = [[-cos θ,  sin θ],
///      [ sin θ,  cos θ]]
pub fn inclined_rotation_matrix_2d(theta: f64) -> [[f64; 2]; 2] {
    let c = theta.cos();
    let s = theta.sin();
    [[-c, s], [s, c]]
}

/// Apply 2D inclined support rotation to K and F at the given translational DOFs.
/// Rotates rows/columns of K and entries of F using 2×2 R.
fn apply_inclined_transform_2d(k: &mut [f64], f: &mut [f64], n: usize,
                               dofs: &[usize; 2], r: &[[f64; 2]; 2]) {
    // Rotate columns: for each row i, K[i, dofs] = K[i, dofs_orig] * R^T
    for i in 0..n {
        let mut vals = [0.0; 2];
        for a in 0..2 {
            vals[a] = k[i * n + dofs[a]];
        }
        for a in 0..2 {
            let mut sum = 0.0;
            for b in 0..2 {
                sum += vals[b] * r[a][b]; // R^T[b][a] = R[a][b]
            }
            k[i * n + dofs[a]] = sum;
        }
    }
    // Rotate rows: for each col j, K[dofs, j] = R * K[dofs_orig, j]
    for j in 0..n {
        let mut vals = [0.0; 2];
        for a in 0..2 {
            vals[a] = k[dofs[a] * n + j];
        }
        for a in 0..2 {
            let mut sum = 0.0;
            for b in 0..2 {
                sum += r[a][b] * vals[b];
            }
            k[dofs[a] * n + j] = sum;
        }
    }
    // Rotate force: F[dofs] = R * F[dofs_orig]
    let mut fv = [0.0; 2];
    for a in 0..2 {
        fv[a] = f[dofs[a]];
    }
    for a in 0..2 {
        let mut sum = 0.0;
        for b in 0..2 {
            sum += r[a][b] * fv[b];
        }
        f[dofs[a]] = sum;
    }
}

/// Reverse 2D inclined rotation on displacement vector: u_global = R^T * u_rotated
pub fn reverse_inclined_transform_2d(u: &mut [f64], dofs: &[usize; 2], r: &[[f64; 2]; 2]) {
    let mut vals = [0.0; 2];
    for a in 0..2 {
        vals[a] = u[dofs[a]];
    }
    for a in 0..2 {
        let mut sum = 0.0;
        for b in 0..2 {
            sum += r[b][a] * vals[b]; // R^T[a][b] = R[b][a]
        }
        u[dofs[a]] = sum;
    }
}

/// Build rotation matrix that maps global to local frame where ê₁ = normal.
pub fn inclined_rotation_matrix(nx: f64, ny: f64, nz: f64) -> [[f64; 3]; 3] {
    let n_len = (nx * nx + ny * ny + nz * nz).sqrt();
    let e1 = [nx / n_len, ny / n_len, nz / n_len];
    // Choose reference vector not parallel to e1
    let ref_v = if e1[0].abs() < 0.9 { [1.0, 0.0, 0.0] } else { [0.0, 1.0, 0.0] };
    // e3 = e1 × ref, then normalize
    let mut e3 = [
        e1[1] * ref_v[2] - e1[2] * ref_v[1],
        e1[2] * ref_v[0] - e1[0] * ref_v[2],
        e1[0] * ref_v[1] - e1[1] * ref_v[0],
    ];
    let e3_len = (e3[0] * e3[0] + e3[1] * e3[1] + e3[2] * e3[2]).sqrt();
    e3[0] /= e3_len; e3[1] /= e3_len; e3[2] /= e3_len;
    // e2 = e3 × e1
    let e2 = [
        e3[1] * e1[2] - e3[2] * e1[1],
        e3[2] * e1[0] - e3[0] * e1[2],
        e3[0] * e1[1] - e3[1] * e1[0],
    ];
    [e1, e2, e3] // rows of R
}

/// Apply inclined support rotation to K and F at the given translational DOFs.
/// Rotates rows/columns of K and entries of F using R.
fn apply_inclined_transform(k: &mut [f64], f: &mut [f64], n: usize,
                            dofs: &[usize; 3], r: &[[f64; 3]; 3]) {
    // Rotate columns: for each row i, K[i, dofs] = K[i, dofs_orig] * R^T
    for i in 0..n {
        let mut vals = [0.0; 3];
        for a in 0..3 {
            vals[a] = k[i * n + dofs[a]];
        }
        for a in 0..3 {
            let mut sum = 0.0;
            for b in 0..3 {
                sum += vals[b] * r[a][b]; // R^T[b][a] = R[a][b]
            }
            k[i * n + dofs[a]] = sum;
        }
    }
    // Rotate rows: for each col j, K[dofs, j] = R * K[dofs_orig, j]
    for j in 0..n {
        let mut vals = [0.0; 3];
        for a in 0..3 {
            vals[a] = k[dofs[a] * n + j];
        }
        for a in 0..3 {
            let mut sum = 0.0;
            for b in 0..3 {
                sum += r[a][b] * vals[b];
            }
            k[dofs[a] * n + j] = sum;
        }
    }
    // Rotate force: F[dofs] = R * F[dofs_orig]
    let mut fv = [0.0; 3];
    for a in 0..3 {
        fv[a] = f[dofs[a]];
    }
    for a in 0..3 {
        let mut sum = 0.0;
        for b in 0..3 {
            sum += r[a][b] * fv[b];
        }
        f[dofs[a]] = sum;
    }
}

/// Reverse inclined rotation on displacement vector: u_global = R^T * u_rotated
pub fn reverse_inclined_transform(u: &mut [f64], dofs: &[usize; 3], r: &[[f64; 3]; 3]) {
    let mut vals = [0.0; 3];
    for a in 0..3 {
        vals[a] = u[dofs[a]];
    }
    for a in 0..3 {
        let mut sum = 0.0;
        for b in 0..3 {
            sum += r[b][a] * vals[b]; // R^T[a][b] = R[b][a]
        }
        u[dofs[a]] = sum;
    }
}

/// Assemble global stiffness matrix and force vector for 2D.
pub fn assemble_2d(input: &SolverInput, dof_num: &DofNumbering) -> AssemblyResult {
    let n = dof_num.n_total;
    let mut k_global = vec![0.0; n * n];
    let mut f_global = vec![0.0; n];

    // Pre-build O(1) lookup maps
    let node_map: std::collections::HashMap<usize, &SolverNode> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection> =
        input.sections.values().map(|s| (s.id, s)).collect();

    // Assemble element stiffness matrices
    for elem in input.elements.values() {
        let node_i = node_map[&elem.node_i];
        let node_j = node_map[&elem.node_j];
        let mat = mat_map[&elem.material_id];
        let sec = sec_map[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0; // MPa → kN/m²

        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            // Truss/Cable: assemble directly in global coordinates
            let k_elem = truss_global_stiffness_2d(e, sec.a, l, cos, sin);
            let ndof = 4; // 2 per node for truss
            let truss_dofs = [
                dof_num.global_dof(elem.node_i, 0).unwrap(),
                dof_num.global_dof(elem.node_i, 1).unwrap(),
                dof_num.global_dof(elem.node_j, 0).unwrap(),
                dof_num.global_dof(elem.node_j, 1).unwrap(),
            ];
            for i in 0..ndof {
                for j in 0..ndof {
                    k_global[truss_dofs[i] * n + truss_dofs[j]] += k_elem[i * ndof + j];
                }
            }

            // Assemble thermal FEF for 2D truss elements.
            // Convention matches fef_thermal_2d: node I gets -fx, node J gets +fx (local axial).
            // Transform to global: node I gets -fx*[cos, sin], node J gets +fx*[cos, sin].
            for load in &input.loads {
                if let SolverLoad::Thermal(tl) = load {
                    if tl.element_id == elem.id {
                        let alpha = 12e-6; // Steel default
                        let fx = e * sec.a * alpha * tl.dt_uniform;
                        f_global[truss_dofs[0]] += -fx * cos;  // node I, x
                        f_global[truss_dofs[1]] += -fx * sin;  // node I, z
                        f_global[truss_dofs[2]] +=  fx * cos;  // node J, x
                        f_global[truss_dofs[3]] +=  fx * sin;  // node J, z
                    }
                }
            }
        } else {
            // Frame element
            let phi = if let Some(as_y) = sec.as_y {
                let g = e / (2.0 * (1.0 + mat.nu));
                12.0 * e * sec.iz / (g * as_y * l * l)
            } else {
                0.0
            };
            let k_local = frame_local_stiffness_2d(
                e, sec.a, sec.iz, l, elem.hinge_start, elem.hinge_end, phi,
            );
            let t = frame_transform_2d(cos, sin);
            let k_glob = transform_stiffness(&k_local, &t, 6);

            let ndof = elem_dofs.len();
            for i in 0..ndof {
                for j in 0..ndof {
                    k_global[elem_dofs[i] * n + elem_dofs[j]] += k_glob[i * ndof + j];
                }
            }

            // Assemble element loads (FEF)
            assemble_element_loads_2d(
                input, elem, &k_local, &t, l, e, sec, node_i, &elem_dofs, &mut f_global,
            );
        }
    }

    // Assemble connector elements
    if !input.connectors.is_empty() {
        crate::element::connector::assemble_connectors_2d(
            &input.connectors, &input.nodes, dof_num, &mut k_global, n,
        );
    }

    // Assemble nodal loads
    for load in &input.loads {
        if let SolverLoad::Nodal(nl) = load {
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 0)) {
                f_global[d] += nl.fx;
            }
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 1)) {
                f_global[d] += nl.fz;
            }
            if dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(nl.node_id, 2)) {
                    f_global[d] += nl.my;
                }
            }
        }
    }

    // Add spring stiffness (with rotation support for springs with angle)
    for sup in input.supports.values() {
        let kx_val = sup.kx.unwrap_or(0.0);
        let ky_val = sup.ky.unwrap_or(0.0);  // ky maps to vertical (uz) in 2D
        let kz_val = sup.kz.unwrap_or(0.0);  // rotational spring

        if sup.support_type == "spring" {
            if let Some(angle) = sup.angle {
                if angle.abs() > 1e-15 && (kx_val > 0.0 || ky_val > 0.0) {
                    // Rotated spring: K_global = R^T * diag(kx, ky) * R
                    let c = angle.cos();
                    let s = angle.sin();
                    let k_xx = kx_val * c * c + ky_val * s * s;
                    let k_zz = kx_val * s * s + ky_val * c * c;
                    let k_xz = (kx_val - ky_val) * s * c;

                    if let (Some(&dx), Some(&dz)) = (
                        dof_num.map.get(&(sup.node_id, 0)),
                        dof_num.map.get(&(sup.node_id, 1)),
                    ) {
                        k_global[dx * n + dx] += k_xx;
                        k_global[dz * n + dz] += k_zz;
                        k_global[dx * n + dz] += k_xz;
                        k_global[dz * n + dx] += k_xz;
                    }
                } else {
                    // No rotation or zero angle: standard diagonal assembly
                    if kx_val > 0.0 {
                        if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                            k_global[d * n + d] += kx_val;
                        }
                    }
                    if ky_val > 0.0 {
                        if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                            k_global[d * n + d] += ky_val;
                        }
                    }
                }
            } else {
                // No angle: standard diagonal assembly
                if kx_val > 0.0 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                        k_global[d * n + d] += kx_val;
                    }
                }
                if ky_val > 0.0 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                        k_global[d * n + d] += ky_val;
                    }
                }
            }
        } else {
            // Non-spring supports: standard diagonal assembly
            if kx_val > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                    k_global[d * n + d] += kx_val;
                }
            }
            if ky_val > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                    k_global[d * n + d] += ky_val;
                }
            }
        }
        // Rotational spring stiffness (kz in 2D SolverSupport = rotational ry stiffness)
        if kz_val > 0.0 && dof_num.dofs_per_node >= 3 {
            if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                k_global[d * n + d] += kz_val;
            }
        }
    }

    // Find max diagonal
    let mut max_diag = 0.0f64;
    for i in 0..n {
        max_diag = max_diag.max(k_global[i * n + i].abs());
    }

    // Add artificial rotational stiffness at nodes where ALL connected frame
    // elements are hinged at that node — prevents singular matrix.
    let mut artificial_dofs = Vec::new();
    if dof_num.dofs_per_node >= 3 {
        let artificial_k = if max_diag > 0.0 { max_diag * 1e-10 } else { 1e-6 };

        let mut node_hinge_count: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();
        let mut node_frame_count: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();
        for elem in input.elements.values() {
            if elem.elem_type != "frame" { continue; }
            *node_frame_count.entry(elem.node_i).or_insert(0) += 1;
            *node_frame_count.entry(elem.node_j).or_insert(0) += 1;
            if elem.hinge_start {
                *node_hinge_count.entry(elem.node_i).or_insert(0) += 1;
            }
            if elem.hinge_end {
                *node_hinge_count.entry(elem.node_j).or_insert(0) += 1;
            }
        }

        // Nodes with rotational restraint from supports
        let mut rot_restrained: std::collections::HashSet<usize> = std::collections::HashSet::new();
        for sup in input.supports.values() {
            if sup.support_type == "fixed" || sup.support_type == "guidedX" || sup.support_type == "guidedY" {
                rot_restrained.insert(sup.node_id);
            }
            if sup.support_type == "spring" {
                if sup.kz.unwrap_or(0.0) > 0.0 {
                    rot_restrained.insert(sup.node_id);
                }
            }
        }

        for (&node_id, &hinges) in &node_hinge_count {
            let frames = *node_frame_count.get(&node_id).unwrap_or(&0);
            if hinges >= frames && frames >= 1 && !rot_restrained.contains(&node_id) {
                if let Some(&idx) = dof_num.map.get(&(node_id, 2)) {
                    if idx < dof_num.n_free {
                        k_global[idx * n + idx] += artificial_k;
                        artificial_dofs.push(idx);
                    }
                }
            }
        }

        // Topology-agnostic orphan-ROTATION-DOF guard: any free *rotation* DOF
        // whose row+col in K_global is identically zero gets artificial stiffness
        // so the linear solver doesn't trip on a singular matrix. Restricted to
        // rotation DOFs (local_dof=2 in 2D) so a truly floating node (translation
        // DOFs all-zero) still surfaces as a singular-matrix error.
        let nf = dof_num.n_free;
        let already: std::collections::HashSet<usize> = artificial_dofs.iter().copied().collect();
        let orphan_tol = if max_diag > 0.0 { max_diag * 1e-12 } else { 1e-14 };
        let mut idx_to_local: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();
        for (&(_, ld), &idx) in &dof_num.map {
            if idx < nf {
                idx_to_local.insert(idx, ld);
            }
        }
        for i in 0..nf {
            if already.contains(&i) { continue; }
            if idx_to_local.get(&i).copied() != Some(2) { continue; }
            let mut all_zero = true;
            for j in 0..n {
                if k_global[i * n + j].abs() > orphan_tol
                    || k_global[j * n + i].abs() > orphan_tol
                {
                    all_zero = false;
                    break;
                }
            }
            if all_zero {
                k_global[i * n + i] += artificial_k;
                artificial_dofs.push(i);
            }
        }
    }

    // Apply 2D inclined support transformations
    let mut inclined_transforms_2d = Vec::new();
    for sup in input.supports.values() {
        if sup.support_type == "inclinedRoller" {
            if let Some(theta) = sup.angle {
                // Only apply transform for non-trivial angles
                // At angle=0, inclinedRoller already behaves as rollerX (restrain uz)
                // because the DOF numbering restrains local_dof=1 (uz).
                // But we still need the transform for any angle, including 0,
                // to ensure the "restrained uz" is in the rotated frame.
                let r = inclined_rotation_matrix_2d(theta);
                if let (Some(&d0), Some(&d1)) = (
                    dof_num.map.get(&(sup.node_id, 0)),
                    dof_num.map.get(&(sup.node_id, 1)),
                ) {
                    let dofs = [d0, d1];
                    apply_inclined_transform_2d(&mut k_global, &mut f_global, n, &dofs, &r);
                    inclined_transforms_2d.push(InclinedTransformData2D {
                        node_id: sup.node_id,
                        dofs,
                        r,
                    });
                }
            }
        }
    }

    AssemblyResult {
        k: k_global,
        f: f_global,
        max_diag_k: max_diag,
        artificial_dofs,
        inclined_transforms: Vec::new(),
        inclined_transforms_2d,
        diagnostics: Vec::new(),
    }
}

pub fn assemble_element_loads_2d(
    input: &SolverInput,
    elem: &SolverElement,
    _k_local: &[f64],
    t: &[f64],
    l: f64,
    e: f64,
    sec: &SolverSection,
    _node_i: &SolverNode,
    elem_dofs: &[usize],
    f_global: &mut [f64],
) {
    for load in &input.loads {
        match load {
            SolverLoad::Distributed(dl) if dl.element_id == elem.id => {
                let a = dl.a.unwrap_or(0.0);
                let b = dl.b.unwrap_or(l);
                let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);

                let mut fef = if is_full {
                    let f = fef_distributed_2d(dl.q_i, dl.q_j, l);
                    f
                } else {
                    fef_partial_distributed_2d(dl.q_i, dl.q_j, a, b, l)
                };

                // Adjust for hinges
                adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end, 0.0);

                // Transform to global and add
                let fef_global = transform_force(&fef, t, 6);
                for (i, &dof) in elem_dofs.iter().enumerate() {
                    f_global[dof] += fef_global[i];
                }
            }
            SolverLoad::PointOnElement(pl) if pl.element_id == elem.id => {
                let px = pl.px.unwrap_or(0.0);
                let mz = pl.my.unwrap_or(0.0);
                let mut fef = fef_point_load_2d(pl.p, px, mz, pl.a, l);

                adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end, 0.0);

                let fef_global = transform_force(&fef, t, 6);
                for (i, &dof) in elem_dofs.iter().enumerate() {
                    f_global[dof] += fef_global[i];
                }
            }
            SolverLoad::Thermal(tl) if tl.element_id == elem.id => {
                let alpha = 12e-6; // Steel default
                let h = if sec.a > 1e-15 { (12.0 * sec.iz / sec.a).sqrt() } else { 0.1 };
                let mut fef = fef_thermal_2d(
                    e, sec.a, sec.iz, l,
                    tl.dt_uniform, tl.dt_gradient, alpha, h,
                );

                adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end, 0.0);

                let fef_global = transform_force(&fef, t, 6);
                for (i, &dof) in elem_dofs.iter().enumerate() {
                    f_global[dof] += fef_global[i];
                }
            }
            _ => {}
        }
    }
}

/// Assemble global stiffness matrix and force vector for 3D.
pub fn assemble_3d(input: &SolverInput3D, dof_num: &DofNumbering) -> AssemblyResult {
    let n = dof_num.n_total;
    let mut k_global = vec![0.0; n * n];
    let mut f_global = vec![0.0; n];
    let left_hand = input.left_hand.unwrap_or(false);

    // Pre-build O(1) lookup maps
    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection3D> =
        input.sections.values().map(|s| (s.id, s)).collect();
    let plate_map: std::collections::HashMap<usize, &SolverPlateElement> =
        input.plates.values().map(|p| (p.id, p)).collect();
    let quad_map: std::collections::HashMap<usize, &SolverQuadElement> =
        input.quads.values().map(|q| (q.id, q)).collect();

    // Sort elements for deterministic assembly (HashMap iteration order is randomized)
    let mut sorted_dense_elems: Vec<&SolverElement3D> = input.elements.values().collect();
    sorted_dense_elems.sort_by_key(|e| e.id);
    for elem in sorted_dense_elems {
        let node_i = node_map[&elem.node_i];
        let node_j = node_map[&elem.node_j];
        let mat = mat_map[&elem.material_id];
        let sec = sec_map[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        let e = mat.e * 1000.0;
        let g = e / (2.0 * (1.0 + mat.nu));

        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            // 3D truss/cable: direct global assembly using extracted function
            let ea_l = e * sec.a / l;
            let dir = [dx / l, dy / l, dz / l];
            scatter_truss_3d(&mut k_global, n, ea_l, &dir, elem.node_i, elem.node_j, &dof_num.map);

            // Assemble thermal FEF for truss elements
            let dpn = dof_num.dofs_per_node;
            for load in &input.loads {
                if let SolverLoad3D::Thermal(tl) = load {
                    if tl.element_id == elem.id {
                        let alpha = 12e-6; // Steel default
                        let fx = e * sec.a * alpha * tl.dt_uniform;
                        // Equivalent nodal loads: node I ← -fx along axis, node J ← +fx along axis
                        for k in 0..3 {
                            f_global[elem_dofs[k]]       += -fx * dir[k]; // node I
                            f_global[elem_dofs[dpn + k]] +=  fx * dir[k]; // node J
                        }
                    }
                }
            }
        } else {
            // 3D frame element
            let (ex, ey, ez) = compute_local_axes_3d(
                node_i.x, node_i.y, node_i.z,
                node_j.x, node_j.y, node_j.z,
                elem.local_yx, elem.local_yy, elem.local_yz,
                elem.roll_angle,
                left_hand,
            );

            let has_cw = sec.cw.map_or(false, |cw| cw > 0.0);

            // Compute Timoshenko shear parameters for each bending plane
            let (phi_y, phi_z) = if sec.as_y.is_some() || sec.as_z.is_some() {
                let l2 = l * l;
                let py = sec.as_y.map(|ay| 12.0 * e * sec.iy / (g * ay * l2)).unwrap_or(0.0);
                let pz = sec.as_z.map(|az| 12.0 * e * sec.iz / (g * az * l2)).unwrap_or(0.0);
                (py, pz)
            } else {
                (0.0, 0.0)
            };

            if has_cw && dof_num.dofs_per_node >= 7 {
                // Warping element: 14×14 stiffness
                let k_local = frame_local_stiffness_3d_warping(
                    e, sec.a, sec.iy, sec.iz, sec.j, sec.cw.unwrap(), l, g,
                    elem.hinge_start, elem.hinge_end, phi_y, phi_z,
                );
                let t = frame_transform_3d_warping(&ex, &ey, &ez);
                let k_glob = transform_stiffness(&k_local, &t, 14);

                let ndof = elem_dofs.len();
                for i in 0..ndof {
                    for j in 0..ndof {
                        k_global[elem_dofs[i] * n + elem_dofs[j]] += k_glob[i * ndof + j];
                    }
                }

                // Assemble element loads with 14-DOF transform
                assemble_element_loads_3d_warping(input, elem, &t, l, e, sec, &elem_dofs, &mut f_global, phi_y, phi_z);
            } else if dof_num.dofs_per_node >= 7 {
                // Non-warping element in a warping model: 12×12 math mapped via DOF_MAP_12_TO_14
                let k_local = frame_local_stiffness_3d(
                    e, sec.a, sec.iy, sec.iz, sec.j, l, g,
                    elem.hinge_start, elem.hinge_end, phi_y, phi_z,
                );
                let t = frame_transform_3d(&ex, &ey, &ez);
                let k_glob = transform_stiffness(&k_local, &t, 12);

                for i in 0..12 {
                    for j in 0..12 {
                        let gi = elem_dofs[DOF_MAP_12_TO_14[i]];
                        let gj = elem_dofs[DOF_MAP_12_TO_14[j]];
                        k_global[gi * n + gj] += k_glob[i * 12 + j];
                    }
                }

                // Assemble element loads with 12-DOF transform, mapped to 14-DOF space
                assemble_element_loads_3d_mapped(input, elem, &t, l, e, sec, &elem_dofs, &mut f_global, phi_y, phi_z);
            } else {
                // Standard 6-DOF-per-node path
                let k_local = frame_local_stiffness_3d(
                    e, sec.a, sec.iy, sec.iz, sec.j, l, g,
                    elem.hinge_start, elem.hinge_end, phi_y, phi_z,
                );
                let t = frame_transform_3d(&ex, &ey, &ez);
                let k_glob = transform_stiffness(&k_local, &t, 12);

                let ndof = elem_dofs.len();
                for i in 0..ndof {
                    for j in 0..ndof {
                        k_global[elem_dofs[i] * n + elem_dofs[j]] += k_glob[i * ndof + j];
                    }
                }

                // Assemble 3D element loads
                assemble_element_loads_3d(input, elem, &t, l, e, sec, &elem_dofs, &mut f_global, phi_y, phi_z);
            }
        }
    }

    // Assemble plate element stiffness matrices (sorted for determinism)
    let mut sorted_dense_plates: Vec<&SolverPlateElement> = input.plates.values().collect();
    sorted_dense_plates.sort_by_key(|p| p.id);
    for plate in sorted_dense_plates {
        let mat = mat_map[&plate.material_id];
        let e = mat.e * 1000.0; // MPa → kN/m²
        let nu = mat.nu;

        let n0 = node_map[&plate.nodes[0]];
        let n1 = node_map[&plate.nodes[1]];
        let n2 = node_map[&plate.nodes[2]];
        let coords = [
            [n0.x, n0.y, n0.z],
            [n1.x, n1.y, n1.z],
            [n2.x, n2.y, n2.z],
        ];

        let k_local = crate::element::plate_local_stiffness(&coords, e, nu, plate.thickness);
        let t_plate = crate::element::plate_transform_3d(&coords);
        let k_glob = transform_stiffness(&k_local, &t_plate, 18);

        let plate_dofs = dof_num.plate_element_dofs(&plate.nodes);
        let ndof = plate_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_global[plate_dofs[i] * n + plate_dofs[j]] += k_glob[i * ndof + j];
            }
        }
    }

    // Assemble quad (MITC4 shell) element stiffness matrices (sorted for determinism)
    let mut sorted_dense_quads: Vec<&SolverQuadElement> = input.quads.values().collect();
    sorted_dense_quads.sort_by_key(|q| q.id);
    for quad in sorted_dense_quads {
        let mat = mat_map[&quad.material_id];
        let e = mat.e * 1000.0; // MPa → kN/m²
        let nu = mat.nu;

        let n0 = node_map[&quad.nodes[0]];
        let n1 = node_map[&quad.nodes[1]];
        let n2 = node_map[&quad.nodes[2]];
        let n3 = node_map[&quad.nodes[3]];
        let coords = [
            [n0.x, n0.y, n0.z],
            [n1.x, n1.y, n1.z],
            [n2.x, n2.y, n2.z],
            [n3.x, n3.y, n3.z],
        ];

        let k_local = crate::element::quad::mitc4_local_stiffness(&coords, e, nu, quad.thickness);
        let t_quad = crate::element::quad::quad_transform_3d(&coords);
        let k_glob = transform_stiffness(&k_local, &t_quad, 24);

        let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
        let ndof = quad_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_global[quad_dofs[i] * n + quad_dofs[j]] += k_glob[i * ndof + j];
            }
        }
    }

    // Assemble quad9 (MITC9 shell) element stiffness matrices (sorted for determinism)
    let mut sorted_dense_q9s: Vec<&SolverQuad9Element> = input.quad9s.values().collect();
    sorted_dense_q9s.sort_by_key(|q| q.id);
    for quad9 in sorted_dense_q9s {
        let mat = mat_map[&quad9.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let coords = quad9_coords(&node_map, quad9);
        let k_local = crate::element::quad9::mitc9_local_stiffness(&coords, e, nu, quad9.thickness);
        let t_q9 = crate::element::quad9::quad9_transform_3d(&coords);
        let k_glob = transform_stiffness(&k_local, &t_q9, 54);
        let q9_dofs = dof_num.quad9_element_dofs(&quad9.nodes);
        let ndof = q9_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_global[q9_dofs[i] * n + q9_dofs[j]] += k_glob[i * ndof + j];
            }
        }
    }

    // Assemble solid-shell element stiffness matrices (sorted for determinism)
    let mut sorted_dense_ss: Vec<&SolverSolidShellElement> = input.solid_shells.values().collect();
    sorted_dense_ss.sort_by_key(|s| s.id);
    for ss in sorted_dense_ss {
        let mat = mat_map[&ss.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let coords = solid_shell_coords(&node_map, ss);
        let k_elem = crate::element::solid_shell::solid_shell_stiffness(&coords, e, nu);
        let ss_dofs = dof_num.solid_shell_element_dofs(&ss.nodes);
        let ndof = ss_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_global[ss_dofs[i] * n + ss_dofs[j]] += k_elem[i * ndof + j];
            }
        }
    }

    // Assemble curved shell element stiffness matrices (degenerated continuum, sorted for determinism)
    let mut sorted_dense_cs: Vec<&SolverCurvedShellElement> = input.curved_shells.values().collect();
    sorted_dense_cs.sort_by_key(|c| c.id);
    for cs in sorted_dense_cs {
        let mat = mat_map[&cs.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let coords = curved_shell_coords(&node_map, cs);
        let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
        let k_elem = crate::element::curved_shell::curved_shell_stiffness(&coords, &dirs, e, nu, cs.thickness);
        // No transform needed — stiffness is directly in global coordinates
        let cs_dofs = dof_num.quad_element_dofs(&cs.nodes);
        let ndof = cs_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_global[cs_dofs[i] * n + cs_dofs[j]] += k_elem[i * ndof + j];
            }
        }
    }

    // Assemble 3D connector elements
    if !input.connectors.is_empty() {
        crate::element::connector::assemble_connectors_3d(
            &input.connectors, &input.nodes, dof_num, &mut k_global, n,
        );
    }

    // Assemble 3D nodal loads
    for load in &input.loads {
        if let SolverLoad3D::Nodal(nl) = load {
            let forces = [nl.fx, nl.fy, nl.fz, nl.mx, nl.my, nl.mz];
            for (i, &f) in forces.iter().enumerate() {
                if i < dof_num.dofs_per_node {
                    if let Some(&d) = dof_num.map.get(&(nl.node_id, i)) {
                        f_global[d] += f;
                    }
                }
            }
            // Bimoment load (warping DOF 6)
            if let Some(bw) = nl.bw {
                if bw.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(nl.node_id, 6)) {
                        f_global[d] += bw;
                    }
                }
            }
        }
        // Standalone bimoment load (warping DOF 6)
        if let SolverLoad3D::Bimoment(bl) = load {
            if bl.bimoment.abs() > 1e-15 {
                if let Some(&d) = dof_num.map.get(&(bl.node_id, 6)) {
                    f_global[d] += bl.bimoment;
                }
            }
        }
        // Pressure loads on plate elements
        if let SolverLoad3D::Pressure(pl) = load {
            if let Some(&plate) = plate_map.get(&pl.element_id) {
                let n0 = node_map[&plate.nodes[0]];
                let n1 = node_map[&plate.nodes[1]];
                let n2 = node_map[&plate.nodes[2]];
                let coords = [
                    [n0.x, n0.y, n0.z],
                    [n1.x, n1.y, n1.z],
                    [n2.x, n2.y, n2.z],
                ];
                let f_press = crate::element::plate_pressure_load(&coords, pl.pressure);
                let plate_dofs = dof_num.plate_element_dofs(&plate.nodes);
                for (i, &dof) in plate_dofs.iter().enumerate() {
                    if i < f_press.len() {
                        f_global[dof] += f_press[i];
                    }
                }
            }
        }
        // Plate thermal loads
        if let SolverLoad3D::PlateThermal(tl) = load {
            if let Some(&plate) = plate_map.get(&tl.element_id) {
                let n0 = node_map[&plate.nodes[0]];
                let n1 = node_map[&plate.nodes[1]];
                let n2 = node_map[&plate.nodes[2]];
                let coords = [
                    [n0.x, n0.y, n0.z],
                    [n1.x, n1.y, n1.z],
                    [n2.x, n2.y, n2.z],
                ];
                let mat = mat_map[&plate.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let alpha = tl.alpha.unwrap_or(12e-6);
                let f_th = crate::element::plate_thermal_load(
                    &coords, e, nu, plate.thickness, alpha,
                    tl.dt_uniform, tl.dt_gradient,
                );
                let plate_dofs = dof_num.plate_element_dofs(&plate.nodes);
                for (i, &dof) in plate_dofs.iter().enumerate() {
                    if i < f_th.len() {
                        f_global[dof] += f_th[i];
                    }
                }
            }
        }
        // Quad pressure loads
        if let SolverLoad3D::QuadPressure(pl) = load {
            if let Some(&quad) = quad_map.get(&pl.element_id) {
                let n0 = node_map[&quad.nodes[0]];
                let n1 = node_map[&quad.nodes[1]];
                let n2 = node_map[&quad.nodes[2]];
                let n3 = node_map[&quad.nodes[3]];
                let coords = [
                    [n0.x, n0.y, n0.z],
                    [n1.x, n1.y, n1.z],
                    [n2.x, n2.y, n2.z],
                    [n3.x, n3.y, n3.z],
                ];
                let f_press = crate::element::quad::quad_pressure_load(&coords, pl.pressure);
                let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
                for (i, &dof) in quad_dofs.iter().enumerate() {
                    if i < f_press.len() {
                        f_global[dof] += f_press[i];
                    }
                }
            }
        }
        // Quad thermal loads
        if let SolverLoad3D::QuadThermal(tl) = load {
            if let Some(&quad) = quad_map.get(&tl.element_id) {
                let mat = mat_map[&quad.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let alpha = tl.alpha.unwrap_or(1.2e-5);
                let n0 = node_map[&quad.nodes[0]];
                let n1 = node_map[&quad.nodes[1]];
                let n2 = node_map[&quad.nodes[2]];
                let n3 = node_map[&quad.nodes[3]];
                let coords = [
                    [n0.x, n0.y, n0.z],
                    [n1.x, n1.y, n1.z],
                    [n2.x, n2.y, n2.z],
                    [n3.x, n3.y, n3.z],
                ];
                let f_th = crate::element::quad::quad_thermal_load(
                    &coords, e, nu, quad.thickness, alpha,
                    tl.dt_uniform, tl.dt_gradient,
                );
                let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
                for (i, &dof) in quad_dofs.iter().enumerate() {
                    if i < f_th.len() {
                        f_global[dof] += f_th[i];
                    }
                }
            }
        }
        // Quad self-weight loads
        if let SolverLoad3D::QuadSelfWeight(sw) = load {
            if let Some(&quad) = quad_map.get(&sw.element_id) {
                let n0 = node_map[&quad.nodes[0]];
                let n1 = node_map[&quad.nodes[1]];
                let n2 = node_map[&quad.nodes[2]];
                let n3 = node_map[&quad.nodes[3]];
                let coords = [
                    [n0.x, n0.y, n0.z],
                    [n1.x, n1.y, n1.z],
                    [n2.x, n2.y, n2.z],
                    [n3.x, n3.y, n3.z],
                ];
                let f_sw_local = crate::element::quad::quad_self_weight_load(
                    &coords, sw.density, quad.thickness, sw.gx, sw.gy, sw.gz,
                );
                let t_quad = crate::element::quad::quad_transform_3d(&coords);
                let f_sw = crate::linalg::transform_force(&f_sw_local, &t_quad, 24);
                let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
                for (i, &dof) in quad_dofs.iter().enumerate() {
                    if i < f_sw.len() {
                        f_global[dof] += f_sw[i];
                    }
                }
            }
        }
        // Quad edge loads
        if let SolverLoad3D::QuadEdge(el) = load {
            if let Some(&quad) = quad_map.get(&el.element_id) {
                let n0 = node_map[&quad.nodes[0]];
                let n1 = node_map[&quad.nodes[1]];
                let n2 = node_map[&quad.nodes[2]];
                let n3 = node_map[&quad.nodes[3]];
                let coords = [
                    [n0.x, n0.y, n0.z],
                    [n1.x, n1.y, n1.z],
                    [n2.x, n2.y, n2.z],
                    [n3.x, n3.y, n3.z],
                ];
                let f_edge = crate::element::quad::quad_edge_load(&coords, el.edge, el.qn, el.qt);
                let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
                for (i, &dof) in quad_dofs.iter().enumerate() {
                    if i < f_edge.len() {
                        f_global[dof] += f_edge[i];
                    }
                }
            }
        }
    }

    // Quad9 (MITC9) load dispatch — dense path
    let quad9_map: std::collections::HashMap<usize, &SolverQuad9Element> =
        input.quad9s.values().map(|q| (q.id, q)).collect();
    for load in &input.loads {
        if let SolverLoad3D::Quad9Pressure(pl) = load {
            if let Some(&q9) = quad9_map.get(&pl.element_id) {
                let coords = quad9_coords(&node_map, q9);
                let f_p = crate::element::quad9::quad9_pressure_load(&coords, pl.pressure);
                let dofs = dof_num.quad9_element_dofs(&q9.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_p.len() { f_global[dof] += f_p[i]; }
                }
            }
        }
        if let SolverLoad3D::Quad9Thermal(tl) = load {
            if let Some(&q9) = quad9_map.get(&tl.element_id) {
                let mat = mat_map[&q9.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let alpha = tl.alpha.unwrap_or(1.2e-5);
                let coords = quad9_coords(&node_map, q9);
                let f_th = crate::element::quad9::quad9_thermal_load(
                    &coords, e, nu, q9.thickness, alpha, tl.dt_uniform, tl.dt_gradient,
                );
                let dofs = dof_num.quad9_element_dofs(&q9.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_th.len() { f_global[dof] += f_th[i]; }
                }
            }
        }
        if let SolverLoad3D::Quad9SelfWeight(sw) = load {
            if let Some(&q9) = quad9_map.get(&sw.element_id) {
                let coords = quad9_coords(&node_map, q9);
                let f_sw_local = crate::element::quad9::quad9_self_weight_load(
                    &coords, sw.density, q9.thickness, sw.gx, sw.gy, sw.gz,
                );
                let t_q9 = crate::element::quad9::quad9_transform_3d(&coords);
                let f_sw = crate::linalg::transform_force(&f_sw_local, &t_q9, 54);
                let dofs = dof_num.quad9_element_dofs(&q9.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_sw.len() { f_global[dof] += f_sw[i]; }
                }
            }
        }
        if let SolverLoad3D::Quad9Edge(el) = load {
            if let Some(&q9) = quad9_map.get(&el.element_id) {
                let coords = quad9_coords(&node_map, q9);
                let f_edge = crate::element::quad9::quad9_edge_load(&coords, el.edge, el.qn, el.qt);
                let dofs = dof_num.quad9_element_dofs(&q9.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_edge.len() { f_global[dof] += f_edge[i]; }
                }
            }
        }
    }

    // Solid-shell load dispatch — dense path
    let ss_map: std::collections::HashMap<usize, &SolverSolidShellElement> =
        input.solid_shells.values().map(|s| (s.id, s)).collect();
    for load in &input.loads {
        if let SolverLoad3D::SolidShellPressure(pl) = load {
            if let Some(&ss) = ss_map.get(&pl.element_id) {
                let coords = solid_shell_coords(&node_map, ss);
                let f_p = crate::element::solid_shell::solid_shell_pressure_load(&coords, pl.pressure);
                let dofs = dof_num.solid_shell_element_dofs(&ss.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_p.len() { f_global[dof] += f_p[i]; }
                }
            }
        }
        if let SolverLoad3D::SolidShellSelfWeight(sw) = load {
            if let Some(&ss) = ss_map.get(&sw.element_id) {
                let coords = solid_shell_coords(&node_map, ss);
                let f_sw = crate::element::solid_shell::solid_shell_self_weight_load(
                    &coords, sw.density, sw.gx, sw.gy, sw.gz,
                );
                let dofs = dof_num.solid_shell_element_dofs(&ss.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_sw.len() { f_global[dof] += f_sw[i]; }
                }
            }
        }
    }

    // Curved shell load dispatch — dense path
    let cs_map: std::collections::HashMap<usize, &SolverCurvedShellElement> =
        input.curved_shells.values().map(|s| (s.id, s)).collect();
    for load in &input.loads {
        if let SolverLoad3D::CurvedShellPressure(pl) = load {
            if let Some(&cs) = cs_map.get(&pl.element_id) {
                let coords = curved_shell_coords(&node_map, cs);
                let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
                let f_p = crate::element::curved_shell::curved_shell_pressure_load(&coords, &dirs, cs.thickness, pl.pressure);
                let dofs = dof_num.quad_element_dofs(&cs.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_p.len() { f_global[dof] += f_p[i]; }
                }
            }
        }
        if let SolverLoad3D::CurvedShellThermal(tl) = load {
            if let Some(&cs) = cs_map.get(&tl.element_id) {
                let mat = mat_map[&cs.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let alpha = tl.alpha.unwrap_or(1.2e-5);
                let coords = curved_shell_coords(&node_map, cs);
                let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
                let f_th = crate::element::curved_shell::curved_shell_thermal_load(
                    &coords, &dirs, e, nu, cs.thickness, alpha, tl.dt_uniform, tl.dt_gradient,
                );
                let dofs = dof_num.quad_element_dofs(&cs.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_th.len() { f_global[dof] += f_th[i]; }
                }
            }
        }
        if let SolverLoad3D::CurvedShellSelfWeight(sw) = load {
            if let Some(&cs) = cs_map.get(&sw.element_id) {
                let coords = curved_shell_coords(&node_map, cs);
                let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
                let f_sw = crate::element::curved_shell::curved_shell_self_weight_load(
                    &coords, &dirs, sw.density, cs.thickness, sw.gx, sw.gy, sw.gz,
                );
                let dofs = dof_num.quad_element_dofs(&cs.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_sw.len() { f_global[dof] += f_sw[i]; }
                }
            }
        }
        if let SolverLoad3D::CurvedShellEdge(el) = load {
            if let Some(&cs) = cs_map.get(&el.element_id) {
                let coords = curved_shell_coords(&node_map, cs);
                let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
                let f_e = crate::element::curved_shell::curved_shell_edge_load(
                    &coords, &dirs, cs.thickness, el.edge, el.qn, el.qt,
                );
                let dofs = dof_num.quad_element_dofs(&cs.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_e.len() { f_global[dof] += f_e[i]; }
                }
            }
        }
    }

    // Add 3D spring stiffness
    for sup in input.supports.values() {
        let springs = [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz];
        for (i, ks) in springs.iter().enumerate() {
            if let Some(k) = ks {
                if *k > 0.0 && i < dof_num.dofs_per_node {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                        k_global[d * n + d] += k;
                    }
                }
            }
        }
        // Warping spring (DOF 6)
        if dof_num.dofs_per_node >= 7 {
            if let Some(kw) = sup.kw {
                if kw > 0.0 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, 6)) {
                        k_global[d * n + d] += kw;
                    }
                }
            }
        }
    }

    let mut max_diag = 0.0f64;
    for i in 0..n {
        max_diag = max_diag.max(k_global[i * n + i].abs());
    }

    // Add artificial stiffness at warping DOFs for nodes with no warping stiffness.
    // This prevents a singular matrix when some elements lack warping.
    let mut artificial_dofs_3d = Vec::new();
    if dof_num.dofs_per_node >= 7 {
        let artificial_k = if max_diag > 0.0 { max_diag * 1e-10 } else { 1e-6 };
        for &node_id in &dof_num.node_order {
            if let Some(&d) = dof_num.map.get(&(node_id, 6)) {
                if d < dof_num.n_free && k_global[d * n + d].abs() < 1e-20 {
                    k_global[d * n + d] += artificial_k;
                    artificial_dofs_3d.push(d);
                }
            }
        }
    }

    // Apply inclined support transformations
    let mut inclined_transforms = Vec::new();
    for sup in input.supports.values() {
        if sup.is_inclined.unwrap_or(false) {
            if let (Some(nx), Some(ny), Some(nz)) = (sup.normal_x, sup.normal_y, sup.normal_z) {
                let n_len = (nx * nx + ny * ny + nz * nz).sqrt();
                if n_len > 1e-12 {
                    let r = inclined_rotation_matrix(nx, ny, nz);
                    if let (Some(&d0), Some(&d1), Some(&d2)) = (
                        dof_num.map.get(&(sup.node_id, 0)),
                        dof_num.map.get(&(sup.node_id, 1)),
                        dof_num.map.get(&(sup.node_id, 2)),
                    ) {
                        let dofs = [d0, d1, d2];
                        apply_inclined_transform(&mut k_global, &mut f_global, n, &dofs, &r);
                        inclined_transforms.push(InclinedTransformData {
                            node_id: sup.node_id,
                            dofs,
                            r,
                        });
                    }
                }
            }
        }
    }

    // Element quality diagnostics
    let mut diagnostics = Vec::new();

    for plate in input.plates.values() {
        let n0 = node_map[&plate.nodes[0]];
        let n1 = node_map[&plate.nodes[1]];
        let n2 = node_map[&plate.nodes[2]];
        let coords = [
            [n0.x, n0.y, n0.z],
            [n1.x, n1.y, n1.z],
            [n2.x, n2.y, n2.z],
        ];
        let (aspect_ratio, _skew, min_angle) = crate::element::plate_element_quality(&coords);
        if aspect_ratio > 10.0 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: plate.id,
                element_type: "plate".into(),
                metric: "aspect_ratio".into(),
                value: aspect_ratio,
                threshold: 10.0,
                message: format!("Plate {} aspect ratio {:.1} exceeds 10", plate.id, aspect_ratio),
            });
        }
        if min_angle < 10.0 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: plate.id,
                element_type: "plate".into(),
                metric: "min_angle".into(),
                value: min_angle,
                threshold: 10.0,
                message: format!("Plate {} min angle {:.1}° below 10°", plate.id, min_angle),
            });
        }
    }

    for quad in input.quads.values() {
        let qn0 = node_map[&quad.nodes[0]];
        let qn1 = node_map[&quad.nodes[1]];
        let qn2 = node_map[&quad.nodes[2]];
        let qn3 = node_map[&quad.nodes[3]];
        let coords = [
            [qn0.x, qn0.y, qn0.z],
            [qn1.x, qn1.y, qn1.z],
            [qn2.x, qn2.y, qn2.z],
            [qn3.x, qn3.y, qn3.z],
        ];
        let qm = crate::element::quad::quad_quality_metrics(&coords);
        let (_, _, has_neg_j) = crate::element::quad::quad_check_jacobian(&coords);
        if has_neg_j {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id,
                element_type: "quad".into(),
                metric: "negative_jacobian".into(),
                value: -1.0,
                threshold: 0.0,
                message: format!("Quad {} has negative Jacobian determinant (inverted element)", quad.id),
            });
        }
        if qm.aspect_ratio > 10.0 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id,
                element_type: "quad".into(),
                metric: "aspect_ratio".into(),
                value: qm.aspect_ratio,
                threshold: 10.0,
                message: format!("Quad {} aspect ratio {:.1} exceeds 10", quad.id, qm.aspect_ratio),
            });
        }
        if qm.warping > 0.01 && qm.warping <= 0.1 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id,
                element_type: "quad".into(),
                metric: "warping_moderate".into(),
                value: qm.warping,
                threshold: 0.01,
                message: format!("Quad {} moderate warping {:.3} (0.01-0.1 range)", quad.id, qm.warping),
            });
        }
        if qm.warping > 0.1 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id,
                element_type: "quad".into(),
                metric: "warping".into(),
                value: qm.warping,
                threshold: 0.1,
                message: format!("Quad {} warping {:.3} exceeds 0.1", quad.id, qm.warping),
            });
        }
        if qm.jacobian_ratio < 0.1 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id,
                element_type: "quad".into(),
                metric: "jacobian_ratio".into(),
                value: qm.jacobian_ratio,
                threshold: 0.1,
                message: format!("Quad {} jacobian ratio {:.3} below 0.1", quad.id, qm.jacobian_ratio),
            });
        }
    }

    // Quad9 diagnostics (dense path)
    for q9 in input.quad9s.values() {
        let coords = quad9_coords(&node_map, q9);
        let (_, _, has_neg_j) = crate::element::quad9::quad9_check_jacobian(&coords);
        if has_neg_j {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: q9.id, element_type: "quad9".into(), metric: "negative_jacobian".into(),
                value: -1.0, threshold: 0.0,
                message: format!("Quad9 {} has negative Jacobian determinant (inverted element)", q9.id),
            });
        }
    }

    AssemblyResult {
        k: k_global,
        f: f_global,
        max_diag_k: max_diag,
        artificial_dofs: artificial_dofs_3d,
        inclined_transforms,
        inclined_transforms_2d: Vec::new(),
        diagnostics,
    }
}

fn assemble_element_loads_3d(
    input: &SolverInput3D,
    elem: &SolverElement3D,
    t: &[f64],
    l: f64,
    e: f64,
    sec: &SolverSection3D,
    elem_dofs: &[usize],
    f_global: &mut [f64],
    phi_y: f64,
    phi_z: f64,
) {
    for load in &input.loads {
        match load {
            SolverLoad3D::Distributed(dl) if dl.element_id == elem.id => {
                let a = dl.a.unwrap_or(0.0);
                let b = dl.b.unwrap_or(l);
                let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);

                let mut fef = if is_full {
                    fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l)
                } else {
                    fef_partial_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, a, b, l)
                };
                adjust_fef_for_hinges_3d(&mut fef, l, elem.hinge_start, elem.hinge_end, phi_y, phi_z);
                let fef_global = transform_force(&fef, t, 12);
                for (i, &dof) in elem_dofs.iter().enumerate() {
                    f_global[dof] += fef_global[i];
                }
            }
            SolverLoad3D::PointOnElement(pl) if pl.element_id == elem.id => {
                // Y-direction point load
                let fef_y = fef_point_load_2d(pl.py, 0.0, 0.0, pl.a, l);
                let mut fef = [0.0; 12];
                fef[1] = fef_y[1];   // fy_i
                fef[5] = fef_y[2];   // mz_i
                fef[7] = fef_y[4];   // fy_j
                fef[11] = fef_y[5];  // mz_j

                // Z-direction point load
                let fef_z = fef_point_load_2d(pl.pz, 0.0, 0.0, pl.a, l);
                fef[2] = fef_z[1];    // fz_i
                fef[4] = -fef_z[2];   // my_i (negated for θy convention)
                fef[8] = fef_z[4];    // fz_j
                fef[10] = -fef_z[5];  // my_j

                adjust_fef_for_hinges_3d(&mut fef, l, elem.hinge_start, elem.hinge_end, phi_y, phi_z);
                let fef_global = transform_force(&fef, t, 12);
                for (i, &dof) in elem_dofs.iter().enumerate() {
                    f_global[dof] += fef_global[i];
                }
            }
            SolverLoad3D::Thermal(tl) if tl.element_id == elem.id => {
                let alpha = 12e-6; // Steel default
                let hy = if sec.a > 1e-15 { (12.0 * sec.iz / sec.a).sqrt() } else { 0.1 };
                let hz = if sec.a > 1e-15 { (12.0 * sec.iy / sec.a).sqrt() } else { 0.1 };
                let mut fef = fef_thermal_3d(
                    e, sec.a, sec.iy, sec.iz, l,
                    tl.dt_uniform, tl.dt_gradient_y, tl.dt_gradient_z,
                    alpha, hy, hz,
                );
                adjust_fef_for_hinges_3d(&mut fef, l, elem.hinge_start, elem.hinge_end, phi_y, phi_z);
                let fef_global = transform_force(&fef, t, 12);
                for (i, &dof) in elem_dofs.iter().enumerate() {
                    f_global[dof] += fef_global[i];
                }
            }
            _ => {}
        }
    }
}

/// Assemble 3D element loads for warping elements (14-DOF transform).
fn assemble_element_loads_3d_warping(
    input: &SolverInput3D,
    elem: &SolverElement3D,
    t14: &[f64],
    l: f64,
    e: f64,
    sec: &SolverSection3D,
    elem_dofs: &[usize],
    f_global: &mut [f64],
    phi_y: f64,
    phi_z: f64,
) {
    for load in &input.loads {
        match load {
            SolverLoad3D::Distributed(dl) if dl.element_id == elem.id => {
                let a = dl.a.unwrap_or(0.0);
                let b = dl.b.unwrap_or(l);
                let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);

                let mut fef12 = if is_full {
                    fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l)
                } else {
                    fef_partial_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, a, b, l)
                };
                adjust_fef_for_hinges_3d(&mut fef12, l, elem.hinge_start, elem.hinge_end, phi_y, phi_z);
                let fef14 = expand_fef_12_to_14(&fef12);
                let fef_global = transform_force(&fef14, t14, 14);
                for (i, &dof) in elem_dofs.iter().enumerate() {
                    f_global[dof] += fef_global[i];
                }
            }
            SolverLoad3D::PointOnElement(pl) if pl.element_id == elem.id => {
                let fef_y = fef_point_load_2d(pl.py, 0.0, 0.0, pl.a, l);
                let mut fef12 = [0.0; 12];
                fef12[1] = fef_y[1]; fef12[5] = fef_y[2];
                fef12[7] = fef_y[4]; fef12[11] = fef_y[5];
                let fef_z = fef_point_load_2d(pl.pz, 0.0, 0.0, pl.a, l);
                fef12[2] = fef_z[1]; fef12[4] = -fef_z[2];
                fef12[8] = fef_z[4]; fef12[10] = -fef_z[5];
                adjust_fef_for_hinges_3d(&mut fef12, l, elem.hinge_start, elem.hinge_end, phi_y, phi_z);
                let fef14 = expand_fef_12_to_14(&fef12);
                let fef_global = transform_force(&fef14, t14, 14);
                for (i, &dof) in elem_dofs.iter().enumerate() {
                    f_global[dof] += fef_global[i];
                }
            }
            SolverLoad3D::Thermal(tl) if tl.element_id == elem.id => {
                let alpha = 12e-6;
                let hy = if sec.a > 1e-15 { (12.0 * sec.iz / sec.a).sqrt() } else { 0.1 };
                let hz = if sec.a > 1e-15 { (12.0 * sec.iy / sec.a).sqrt() } else { 0.1 };
                let mut fef12 = fef_thermal_3d(
                    e, sec.a, sec.iy, sec.iz, l,
                    tl.dt_uniform, tl.dt_gradient_y, tl.dt_gradient_z,
                    alpha, hy, hz,
                );
                adjust_fef_for_hinges_3d(&mut fef12, l, elem.hinge_start, elem.hinge_end, phi_y, phi_z);
                let fef14 = expand_fef_12_to_14(&fef12);
                let fef_global = transform_force(&fef14, t14, 14);
                for (i, &dof) in elem_dofs.iter().enumerate() {
                    f_global[dof] += fef_global[i];
                }
            }
            _ => {}
        }
    }
}

/// Assemble 3D element loads for non-warping elements in a warping model (12-DOF mapped to 14).
fn assemble_element_loads_3d_mapped(
    input: &SolverInput3D,
    elem: &SolverElement3D,
    t12: &[f64],
    l: f64,
    e: f64,
    sec: &SolverSection3D,
    elem_dofs: &[usize],
    f_global: &mut [f64],
    phi_y: f64,
    phi_z: f64,
) {
    for load in &input.loads {
        match load {
            SolverLoad3D::Distributed(dl) if dl.element_id == elem.id => {
                let a = dl.a.unwrap_or(0.0);
                let b = dl.b.unwrap_or(l);
                let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);

                let mut fef = if is_full {
                    fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l)
                } else {
                    fef_partial_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, a, b, l)
                };
                adjust_fef_for_hinges_3d(&mut fef, l, elem.hinge_start, elem.hinge_end, phi_y, phi_z);
                let fef_global = transform_force(&fef, t12, 12);
                for i in 0..12 {
                    f_global[elem_dofs[DOF_MAP_12_TO_14[i]]] += fef_global[i];
                }
            }
            SolverLoad3D::PointOnElement(pl) if pl.element_id == elem.id => {
                let fef_y = fef_point_load_2d(pl.py, 0.0, 0.0, pl.a, l);
                let mut fef = [0.0; 12];
                fef[1] = fef_y[1]; fef[5] = fef_y[2];
                fef[7] = fef_y[4]; fef[11] = fef_y[5];
                let fef_z = fef_point_load_2d(pl.pz, 0.0, 0.0, pl.a, l);
                fef[2] = fef_z[1]; fef[4] = -fef_z[2];
                fef[8] = fef_z[4]; fef[10] = -fef_z[5];
                adjust_fef_for_hinges_3d(&mut fef, l, elem.hinge_start, elem.hinge_end, phi_y, phi_z);
                let fef_global = transform_force(&fef, t12, 12);
                for i in 0..12 {
                    f_global[elem_dofs[DOF_MAP_12_TO_14[i]]] += fef_global[i];
                }
            }
            SolverLoad3D::Thermal(tl) if tl.element_id == elem.id => {
                let alpha = 12e-6;
                let hy = if sec.a > 1e-15 { (12.0 * sec.iz / sec.a).sqrt() } else { 0.1 };
                let hz = if sec.a > 1e-15 { (12.0 * sec.iy / sec.a).sqrt() } else { 0.1 };
                let mut fef = fef_thermal_3d(
                    e, sec.a, sec.iy, sec.iz, l,
                    tl.dt_uniform, tl.dt_gradient_y, tl.dt_gradient_z,
                    alpha, hy, hz,
                );
                adjust_fef_for_hinges_3d(&mut fef, l, elem.hinge_start, elem.hinge_end, phi_y, phi_z);
                let fef_global = transform_force(&fef, t12, 12);
                for i in 0..12 {
                    f_global[elem_dofs[DOF_MAP_12_TO_14[i]]] += fef_global[i];
                }
            }
            _ => {}
        }
    }
}

/// Sparse assembly result: CSC lower-triangle Kff + dense force vector.
pub struct SparseAssemblyResult {
    pub k_ff: CscMatrix,
    pub f: Vec<f64>,       // n_total force vector (same as dense)
    pub max_diag_k: f64,
    pub artificial_dofs: Vec<usize>,
}

/// Sparse 3D assembly result with full-K for reactions and inclined support data.
pub struct SparseAssemblyResult3D {
    pub k_ff: CscMatrix,
    pub k_full: Option<CscMatrix>,
    pub f: Vec<f64>,
    pub max_diag_k: f64,
    pub artificial_dofs: Vec<usize>,
    pub inclined_transforms: Vec<InclinedTransformData>,
    pub diagnostics: Vec<crate::types::AssemblyDiagnostic>,
}

/// Assemble sparse Kff for 2D. Returns CSC lower-triangle of the free-DOF block.
pub fn assemble_sparse_2d(input: &SolverInput, dof_num: &DofNumbering) -> SparseAssemblyResult {
    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let mut f_global = vec![0.0; n];

    let mut trip_rows = Vec::new();
    let mut trip_cols = Vec::new();
    let mut trip_vals = Vec::new();
    let mut max_diag = 0.0f64;
    let mut diag_vals = vec![0.0f64; nf];

    // Pre-build O(1) lookup maps
    let node_map: std::collections::HashMap<usize, &SolverNode> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection> =
        input.sections.values().map(|s| (s.id, s)).collect();

    for elem in input.elements.values() {
        let node_i = node_map[&elem.node_i];
        let node_j = node_map[&elem.node_j];
        let mat = mat_map[&elem.material_id];
        let sec = sec_map[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0;

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let k_elem = truss_global_stiffness_2d(e, sec.a, l, cos, sin);
            let truss_dofs = [
                dof_num.global_dof(elem.node_i, 0).unwrap(),
                dof_num.global_dof(elem.node_i, 1).unwrap(),
                dof_num.global_dof(elem.node_j, 0).unwrap(),
                dof_num.global_dof(elem.node_j, 1).unwrap(),
            ];
            for i in 0..4 {
                if truss_dofs[i] >= nf { continue; }
                for j in 0..4 {
                    if truss_dofs[j] >= nf { continue; }
                    let gi = truss_dofs[i];
                    let gj = truss_dofs[j];
                    if gi >= gj {
                        trip_rows.push(gi);
                        trip_cols.push(gj);
                        trip_vals.push(k_elem[i * 4 + j]);
                    }
                }
                diag_vals[truss_dofs[i]] += k_elem[i * 4 + i];
            }

            // Assemble thermal FEF for 2D truss elements (sparse path)
            for load in &input.loads {
                if let SolverLoad::Thermal(tl) = load {
                    if tl.element_id == elem.id {
                        let alpha = 12e-6;
                        let fx = e * sec.a * alpha * tl.dt_uniform;
                        f_global[truss_dofs[0]] += -fx * cos;
                        f_global[truss_dofs[1]] += -fx * sin;
                        f_global[truss_dofs[2]] +=  fx * cos;
                        f_global[truss_dofs[3]] +=  fx * sin;
                    }
                }
            }
        } else {
            let k_local = frame_local_stiffness_2d(e, sec.a, sec.iz, l, elem.hinge_start, elem.hinge_end, 0.0);
            let t = frame_transform_2d(cos, sin);
            let k_glob = transform_stiffness(&k_local, &t, 6);
            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let ndof = elem_dofs.len();

            for i in 0..ndof {
                if elem_dofs[i] >= nf { continue; }
                for j in 0..ndof {
                    if elem_dofs[j] >= nf { continue; }
                    let gi = elem_dofs[i];
                    let gj = elem_dofs[j];
                    if gi >= gj {
                        trip_rows.push(gi);
                        trip_cols.push(gj);
                        trip_vals.push(k_glob[i * ndof + j]);
                    }
                }
                diag_vals[elem_dofs[i]] += k_glob[i * ndof + i];
            }

            assemble_element_loads_2d(input, elem, &k_local, &t, l, e, sec, node_i, &elem_dofs, &mut f_global);
        }
    }

    // Connector elements (sparse path)
    for conn in input.connectors.values() {
        let node_map_2d: std::collections::HashMap<usize, &SolverNode> =
            input.nodes.values().map(|nd| (nd.id, nd)).collect();
        let ni = match node_map_2d.get(&conn.node_i) { Some(n) => n, None => continue };
        let nj = match node_map_2d.get(&conn.node_j) { Some(n) => n, None => continue };
        let dx = nj.x - ni.x;
        let dy = nj.z - ni.z;
        let l = (dx * dx + dy * dy).sqrt();
        let (cos, sin) = if l > 1e-15 { (dx / l, dy / l) } else { (1.0, 0.0) };
        let ke = crate::element::connector::connector_stiffness_2d(
            conn.k_axial, conn.k_shear, conn.k_moment, cos, sin,
        );
        let dofs = dof_num.element_dofs(conn.node_i, conn.node_j);
        let ndof = dofs.len();
        for i in 0..ndof {
            if dofs[i] >= nf { continue; }
            for j in 0..ndof {
                if dofs[j] >= nf { continue; }
                let gi = dofs[i];
                let gj = dofs[j];
                if gi >= gj {
                    trip_rows.push(gi);
                    trip_cols.push(gj);
                    trip_vals.push(ke[i * 6 + j]);
                }
            }
            diag_vals[dofs[i]] += ke[i * 6 + i];
        }
    }

    // Nodal loads
    for load in &input.loads {
        if let SolverLoad::Nodal(nl) = load {
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 0)) { f_global[d] += nl.fx; }
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 1)) { f_global[d] += nl.fz; }
            if dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(nl.node_id, 2)) { f_global[d] += nl.my; }
            }
        }
    }

    // Spring stiffness
    for sup in input.supports.values() {
        if let Some(kx) = sup.kx {
            if kx > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                    if d < nf { trip_rows.push(d); trip_cols.push(d); trip_vals.push(kx); diag_vals[d] += kx; }
                }
            }
        }
        if let Some(ky) = sup.ky {
            if ky > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                    if d < nf { trip_rows.push(d); trip_cols.push(d); trip_vals.push(ky); diag_vals[d] += ky; }
                }
            }
        }
        if let Some(kz) = sup.kz {
            if kz > 0.0 && dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                    if d < nf { trip_rows.push(d); trip_cols.push(d); trip_vals.push(kz); diag_vals[d] += kz; }
                }
            }
        }
    }

    for d in &diag_vals[..nf] { max_diag = max_diag.max(d.abs()); }

    // Artificial rotational stiffness
    let mut artificial_dofs = Vec::new();
    if dof_num.dofs_per_node >= 3 {
        let artificial_k = if max_diag > 0.0 { max_diag * 1e-10 } else { 1e-6 };
        let mut node_hinge_count: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();
        let mut node_frame_count: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();
        for elem in input.elements.values() {
            if elem.elem_type != "frame" { continue; }
            *node_frame_count.entry(elem.node_i).or_insert(0) += 1;
            *node_frame_count.entry(elem.node_j).or_insert(0) += 1;
            if elem.hinge_start { *node_hinge_count.entry(elem.node_i).or_insert(0) += 1; }
            if elem.hinge_end { *node_hinge_count.entry(elem.node_j).or_insert(0) += 1; }
        }
        let mut rot_restrained: std::collections::HashSet<usize> = std::collections::HashSet::new();
        for sup in input.supports.values() {
            if sup.support_type == "fixed" || sup.support_type == "guidedX" || sup.support_type == "guidedY" { rot_restrained.insert(sup.node_id); }
            if sup.support_type == "spring" && sup.kz.unwrap_or(0.0) > 0.0 { rot_restrained.insert(sup.node_id); }
        }
        for (&node_id, &hinges) in &node_hinge_count {
            let frames = *node_frame_count.get(&node_id).unwrap_or(&0);
            if hinges >= frames && frames >= 1 && !rot_restrained.contains(&node_id) {
                if let Some(&idx) = dof_num.map.get(&(node_id, 2)) {
                    if idx < nf {
                        trip_rows.push(idx); trip_cols.push(idx); trip_vals.push(artificial_k);
                        artificial_dofs.push(idx);
                    }
                }
            }
        }
    }

    let k_ff = CscMatrix::from_triplets(nf, &trip_rows, &trip_cols, &trip_vals);
    SparseAssemblyResult { k_ff, f: f_global, max_diag_k: max_diag, artificial_dofs }
}

/// Apply inclined support rotation to COO triplets and force vector.
/// Equivalent to the dense `apply_inclined_transform` but operates on triplet arrays.
pub fn apply_inclined_transform_triplets(
    trip_rows: &mut Vec<usize>, trip_cols: &mut Vec<usize>, trip_vals: &mut Vec<f64>,
    f_global: &mut [f64], dofs: &[usize; 3], r: &[[f64; 3]; 3],
) {
    let dof_local: std::collections::HashMap<usize, usize> =
        dofs.iter().enumerate().map(|(i, &d)| (d, i)).collect();

    // Collect entries touching inclined DOFs, zero originals
    let mut block = [[0.0; 3]; 3];
    let mut cross_row: std::collections::HashMap<usize, [f64; 3]> = Default::default();
    let mut cross_col: std::collections::HashMap<usize, [f64; 3]> = Default::default();

    for idx in 0..trip_rows.len() {
        let ri = trip_rows[idx];
        let ci = trip_cols[idx];
        let v = trip_vals[idx];
        let r_loc = dof_local.get(&ri).copied();
        let c_loc = dof_local.get(&ci).copied();
        match (r_loc, c_loc) {
            (Some(a), Some(b)) => { block[a][b] += v; trip_vals[idx] = 0.0; }
            (Some(a), None)    => { cross_col.entry(ci).or_insert([0.0; 3])[a] += v; trip_vals[idx] = 0.0; }
            (None, Some(b))    => { cross_row.entry(ri).or_insert([0.0; 3])[b] += v; trip_vals[idx] = 0.0; }
            (None, None)       => {}
        }
    }

    // Rotated block: R * block * R^T
    for a in 0..3 {
        for b in 0..3 {
            let mut s = 0.0;
            for c in 0..3 { for d in 0..3 { s += r[a][c] * block[c][d] * r[b][d]; } }
            if s.abs() > 1e-30 {
                trip_rows.push(dofs[a]); trip_cols.push(dofs[b]); trip_vals.push(s);
            }
        }
    }
    // Cross-row: K'[i, dofs[a]] = sum_b K[i, dofs[b]] * R[a][b]
    for (&i, v3) in &cross_row {
        for a in 0..3 {
            let s: f64 = (0..3).map(|b| v3[b] * r[a][b]).sum();
            if s.abs() > 1e-30 {
                trip_rows.push(i); trip_cols.push(dofs[a]); trip_vals.push(s);
            }
        }
    }
    // Cross-col: K'[dofs[a], j] = sum_b R[a][b] * K[dofs[b], j]
    for (&j, v3) in &cross_col {
        for a in 0..3 {
            let s: f64 = (0..3).map(|b| r[a][b] * v3[b]).sum();
            if s.abs() > 1e-30 {
                trip_rows.push(dofs[a]); trip_cols.push(j); trip_vals.push(s);
            }
        }
    }
    // Rotate force: F'[dofs[a]] = sum_b R[a][b] * F[dofs[b]]
    let fv = [f_global[dofs[0]], f_global[dofs[1]], f_global[dofs[2]]];
    for a in 0..3 {
        f_global[dofs[a]] = r[a][0] * fv[0] + r[a][1] * fv[1] + r[a][2] * fv[2];
    }
}

/// Assemble sparse K for 3D. Returns CSC of Kff (always) and full K (if `build_k_full` is true).
/// Collects all triplets for the full n×n K, then filters for Kff at the end.
pub fn assemble_sparse_3d(input: &SolverInput3D, dof_num: &DofNumbering, build_k_full: bool) -> SparseAssemblyResult3D {
    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let mut f_global = vec![0.0; n];
    let left_hand = input.left_hand.unwrap_or(false);

    let mut trip_rows = Vec::new();
    let mut trip_cols = Vec::new();
    let mut trip_vals = Vec::new();
    let mut max_diag = 0.0f64;
    let mut diag_vals = vec![0.0f64; nf];

    // Pre-build O(1) lookup maps
    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection3D> =
        input.sections.values().map(|s| (s.id, s)).collect();
    let plate_map: std::collections::HashMap<usize, &SolverPlateElement> =
        input.plates.values().map(|p| (p.id, p)).collect();
    let quad_map: std::collections::HashMap<usize, &SolverQuadElement> =
        input.quads.values().map(|q| (q.id, q)).collect();

    // Helper: scatter element stiffness into triplets (full K, lower triangle)
    macro_rules! scatter {
        ($k_glob:expr, $dofs:expr, $ndof:expr) => {
            for i in 0..$ndof {
                let gi = $dofs[i];
                for j in 0..$ndof {
                    let gj = $dofs[j];
                    if gi >= gj {
                        trip_rows.push(gi); trip_cols.push(gj); trip_vals.push($k_glob[i * $ndof + j]);
                    }
                }
                if gi < nf { diag_vals[gi] += $k_glob[i * $ndof + i]; }
            }
        };
    }

    // Frame and truss elements (sorted by ID for deterministic assembly)
    let mut sorted_elems: Vec<&SolverElement3D> = input.elements.values().collect();
    sorted_elems.sort_by_key(|e| e.id);
    for elem in sorted_elems {
        let node_i = node_map[&elem.node_i];
        let node_j = node_map[&elem.node_j];
        let mat = mat_map[&elem.material_id];
        let sec = sec_map[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        let e = mat.e * 1000.0;
        let g = e / (2.0 * (1.0 + mat.nu));

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let ea_l = e * sec.a / l;
            let dir = [dx / l, dy / l, dz / l];
            for a in 0..2 {
                for b in 0..2 {
                    let sign = if a == b { 1.0 } else { -1.0 };
                    let node_a = if a == 0 { elem.node_i } else { elem.node_j };
                    let node_b = if b == 0 { elem.node_i } else { elem.node_j };
                    for i in 0..3 {
                        for j in 0..3 {
                            if let (Some(&da), Some(&db)) = (
                                dof_num.map.get(&(node_a, i)),
                                dof_num.map.get(&(node_b, j)),
                            ) {
                                if da >= db {
                                    let val = sign * ea_l * dir[i] * dir[j];
                                    trip_rows.push(da); trip_cols.push(db); trip_vals.push(val);
                                }
                                if da == db && da < nf { diag_vals[da] += sign * ea_l * dir[i] * dir[j]; }
                            }
                        }
                    }
                }
            }
            // Assemble thermal FEF for truss elements
            for load in &input.loads {
                if let SolverLoad3D::Thermal(tl) = load {
                    if tl.element_id == elem.id {
                        let alpha = 12e-6;
                        let fx = e * sec.a * alpha * tl.dt_uniform;
                        for k in 0..3 {
                            if let Some(&d) = dof_num.map.get(&(elem.node_i, k)) {
                                f_global[d] += -fx * dir[k];
                            }
                            if let Some(&d) = dof_num.map.get(&(elem.node_j, k)) {
                                f_global[d] += fx * dir[k];
                            }
                        }
                    }
                }
            }
        } else {
            let (ex, ey, ez) = compute_local_axes_3d(
                node_i.x, node_i.y, node_i.z, node_j.x, node_j.y, node_j.z,
                elem.local_yx, elem.local_yy, elem.local_yz, elem.roll_angle, left_hand,
            );
            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let has_cw = sec.cw.map_or(false, |cw| cw > 0.0);

            let (phi_y, phi_z) = if sec.as_y.is_some() || sec.as_z.is_some() {
                let l2 = l * l;
                let py = sec.as_y.map(|ay| 12.0 * e * sec.iy / (g * ay * l2)).unwrap_or(0.0);
                let pz = sec.as_z.map(|az| 12.0 * e * sec.iz / (g * az * l2)).unwrap_or(0.0);
                (py, pz)
            } else {
                (0.0, 0.0)
            };

            if has_cw && dof_num.dofs_per_node >= 7 {
                let k_local = frame_local_stiffness_3d_warping(
                    e, sec.a, sec.iy, sec.iz, sec.j, sec.cw.unwrap(), l, g,
                    elem.hinge_start, elem.hinge_end, phi_y, phi_z,
                );
                let t = frame_transform_3d_warping(&ex, &ey, &ez);
                let k_glob = transform_stiffness(&k_local, &t, 14);
                let ndof = elem_dofs.len();
                scatter!(k_glob, elem_dofs, ndof);
                assemble_element_loads_3d_warping(input, elem, &t, l, e, sec, &elem_dofs, &mut f_global, phi_y, phi_z);
            } else if dof_num.dofs_per_node >= 7 {
                let k_local = frame_local_stiffness_3d(e, sec.a, sec.iy, sec.iz, sec.j, l, g,
                    elem.hinge_start, elem.hinge_end, phi_y, phi_z);
                let t = frame_transform_3d(&ex, &ey, &ez);
                let k_glob = transform_stiffness(&k_local, &t, 12);
                // Map 12-DOF to 14-DOF positions
                for i in 0..12 {
                    let gi = elem_dofs[DOF_MAP_12_TO_14[i]];
                    for j in 0..12 {
                        let gj = elem_dofs[DOF_MAP_12_TO_14[j]];
                        if gi >= gj {
                            trip_rows.push(gi); trip_cols.push(gj); trip_vals.push(k_glob[i * 12 + j]);
                        }
                    }
                    if gi < nf { diag_vals[gi] += k_glob[i * 12 + i]; }
                }
                assemble_element_loads_3d_mapped(input, elem, &t, l, e, sec, &elem_dofs, &mut f_global, phi_y, phi_z);
            } else {
                let k_local = frame_local_stiffness_3d(e, sec.a, sec.iy, sec.iz, sec.j, l, g,
                    elem.hinge_start, elem.hinge_end, phi_y, phi_z);
                let t = frame_transform_3d(&ex, &ey, &ez);
                let k_glob = transform_stiffness(&k_local, &t, 12);
                let ndof = elem_dofs.len();
                scatter!(k_glob, elem_dofs, ndof);
                assemble_element_loads_3d(input, elem, &t, l, e, sec, &elem_dofs, &mut f_global, phi_y, phi_z);
            }
        }
    }

    // Connector elements (sorted by ID for deterministic assembly)
    let mut sorted_conns: Vec<&crate::types::ConnectorElement> = input.connectors.values().collect();
    sorted_conns.sort_by_key(|c| c.id);
    for conn in sorted_conns {
        let ni = match node_map.get(&conn.node_i) { Some(n) => n, None => continue };
        let nj_node = match node_map.get(&conn.node_j) { Some(n) => n, None => continue };
        let dx = nj_node.x - ni.x;
        let dy = nj_node.y - ni.y;
        let dz = nj_node.z - ni.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        let dir = if l > 1e-15 { [dx / l, dy / l, dz / l] } else { [1.0, 0.0, 0.0] };
        let ke = crate::element::connector::connector_stiffness_3d(
            conn.k_axial, conn.k_shear, conn.k_shear_z,
            conn.k_moment, conn.k_bend_y, conn.k_bend_z, dir,
        );
        let dofs = dof_num.element_dofs(conn.node_i, conn.node_j);
        let ndof = dofs.len();
        for i in 0..ndof {
            let gi = dofs[i];
            for j in 0..ndof {
                let gj = dofs[j];
                if gi >= gj {
                    trip_rows.push(gi); trip_cols.push(gj); trip_vals.push(ke[i * 12 + j]);
                }
            }
            if gi < nf { diag_vals[gi] += ke[i * 12 + i]; }
        }
    }

    // Plate elements (DKT+CST, 18 DOFs per element, sorted for determinism)
    let mut sorted_plates: Vec<&SolverPlateElement> = input.plates.values().collect();
    sorted_plates.sort_by_key(|p| p.id);
    for plate in sorted_plates {
        let mat = mat_map[&plate.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let n0 = node_map[&plate.nodes[0]];
        let n1 = node_map[&plate.nodes[1]];
        let n2 = node_map[&plate.nodes[2]];
        let coords = [[n0.x, n0.y, n0.z], [n1.x, n1.y, n1.z], [n2.x, n2.y, n2.z]];
        let k_local = crate::element::plate_local_stiffness(&coords, e, nu, plate.thickness);
        let t_plate = crate::element::plate_transform_3d(&coords);
        let k_glob = transform_stiffness(&k_local, &t_plate, 18);
        let plate_dofs = dof_num.plate_element_dofs(&plate.nodes);
        let ndof = plate_dofs.len();
        scatter!(k_glob, plate_dofs, ndof);
    }

    // Quad elements (MITC4 shell, 24 DOFs per element, sorted for determinism)
    let mut sorted_quads: Vec<&SolverQuadElement> = input.quads.values().collect();
    sorted_quads.sort_by_key(|q| q.id);
    for quad in sorted_quads {
        let mat = mat_map[&quad.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let n0 = node_map[&quad.nodes[0]];
        let n1 = node_map[&quad.nodes[1]];
        let n2 = node_map[&quad.nodes[2]];
        let n3 = node_map[&quad.nodes[3]];
        let coords = [[n0.x, n0.y, n0.z], [n1.x, n1.y, n1.z], [n2.x, n2.y, n2.z], [n3.x, n3.y, n3.z]];
        let k_local = crate::element::quad::mitc4_local_stiffness(&coords, e, nu, quad.thickness);
        let t_quad = crate::element::quad::quad_transform_3d(&coords);
        let k_glob = transform_stiffness(&k_local, &t_quad, 24);
        let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
        let ndof = quad_dofs.len();
        scatter!(k_glob, quad_dofs, ndof);
    }

    // Quad9 elements (MITC9 shell, 54 DOFs per element, sorted for determinism)
    let mut sorted_q9s: Vec<&SolverQuad9Element> = input.quad9s.values().collect();
    sorted_q9s.sort_by_key(|q| q.id);
    for q9 in sorted_q9s {
        let mat = mat_map[&q9.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let coords = quad9_coords(&node_map, q9);
        let k_local = crate::element::quad9::mitc9_local_stiffness(&coords, e, nu, q9.thickness);
        let t_q9 = crate::element::quad9::quad9_transform_3d(&coords);
        let k_glob = transform_stiffness(&k_local, &t_q9, 54);
        let q9_dofs = dof_num.quad9_element_dofs(&q9.nodes);
        let ndof = q9_dofs.len();
        scatter!(k_glob, q9_dofs, ndof);
    }

    // Solid-shell elements (8 nodes × 3 DOFs = 24 DOFs per element, sorted for determinism)
    let mut sorted_ss: Vec<&SolverSolidShellElement> = input.solid_shells.values().collect();
    sorted_ss.sort_by_key(|s| s.id);
    for ss in sorted_ss {
        let mat = mat_map[&ss.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let coords = solid_shell_coords(&node_map, ss);
        let k_elem = crate::element::solid_shell::solid_shell_stiffness(&coords, e, nu);
        let ss_dofs = dof_num.solid_shell_element_dofs(&ss.nodes);
        let ndof = ss_dofs.len();
        scatter!(k_elem, ss_dofs, ndof);
    }

    // Curved shell elements (degenerated continuum, 4 nodes × 6 DOFs = 24 DOFs, sorted for determinism)
    let mut sorted_cs: Vec<&SolverCurvedShellElement> = input.curved_shells.values().collect();
    sorted_cs.sort_by_key(|c| c.id);
    for cs in sorted_cs {
        let mat = mat_map[&cs.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let coords = curved_shell_coords(&node_map, cs);
        let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
        let k_elem = crate::element::curved_shell::curved_shell_stiffness(&coords, &dirs, e, nu, cs.thickness);
        let cs_dofs = dof_num.quad_element_dofs(&cs.nodes);
        let ndof = cs_dofs.len();
        scatter!(k_elem, cs_dofs, ndof);
    }

    // All loads (nodal, bimoment, plate pressure/thermal, quad pressure/thermal/self-weight/edge)
    for load in &input.loads {
        if let SolverLoad3D::Nodal(nl) = load {
            let forces = [nl.fx, nl.fy, nl.fz, nl.mx, nl.my, nl.mz];
            for (i, &f) in forces.iter().enumerate() {
                if i < dof_num.dofs_per_node {
                    if let Some(&d) = dof_num.map.get(&(nl.node_id, i)) { f_global[d] += f; }
                }
            }
            if let Some(bw) = nl.bw {
                if bw.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(nl.node_id, 6)) { f_global[d] += bw; }
                }
            }
        }
        if let SolverLoad3D::Bimoment(bl) = load {
            if bl.bimoment.abs() > 1e-15 {
                if let Some(&d) = dof_num.map.get(&(bl.node_id, 6)) { f_global[d] += bl.bimoment; }
            }
        }
        if let SolverLoad3D::Pressure(pl) = load {
            if let Some(&plate) = plate_map.get(&pl.element_id) {
                let n0 = node_map[&plate.nodes[0]];
                let n1 = node_map[&plate.nodes[1]];
                let n2 = node_map[&plate.nodes[2]];
                let coords = [[n0.x, n0.y, n0.z], [n1.x, n1.y, n1.z], [n2.x, n2.y, n2.z]];
                let f_press = crate::element::plate_pressure_load(&coords, pl.pressure);
                let plate_dofs = dof_num.plate_element_dofs(&plate.nodes);
                for (i, &dof) in plate_dofs.iter().enumerate() {
                    if i < f_press.len() { f_global[dof] += f_press[i]; }
                }
            }
        }
        if let SolverLoad3D::PlateThermal(tl) = load {
            if let Some(&plate) = plate_map.get(&tl.element_id) {
                let n0 = node_map[&plate.nodes[0]];
                let n1 = node_map[&plate.nodes[1]];
                let n2 = node_map[&plate.nodes[2]];
                let coords = [[n0.x, n0.y, n0.z], [n1.x, n1.y, n1.z], [n2.x, n2.y, n2.z]];
                let mat = mat_map[&plate.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let alpha = tl.alpha.unwrap_or(12e-6);
                let f_th = crate::element::plate_thermal_load(
                    &coords, e, nu, plate.thickness, alpha, tl.dt_uniform, tl.dt_gradient,
                );
                let plate_dofs = dof_num.plate_element_dofs(&plate.nodes);
                for (i, &dof) in plate_dofs.iter().enumerate() {
                    if i < f_th.len() { f_global[dof] += f_th[i]; }
                }
            }
        }
        if let SolverLoad3D::QuadPressure(pl) = load {
            if let Some(&quad) = quad_map.get(&pl.element_id) {
                let coords = quad_coords(&node_map, quad);
                let f_press = crate::element::quad::quad_pressure_load(&coords, pl.pressure);
                let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
                for (i, &dof) in quad_dofs.iter().enumerate() {
                    if i < f_press.len() { f_global[dof] += f_press[i]; }
                }
            }
        }
        if let SolverLoad3D::QuadThermal(tl) = load {
            if let Some(&quad) = quad_map.get(&tl.element_id) {
                let mat = mat_map[&quad.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let alpha = tl.alpha.unwrap_or(1.2e-5);
                let coords = quad_coords(&node_map, quad);
                let f_th = crate::element::quad::quad_thermal_load(
                    &coords, e, nu, quad.thickness, alpha, tl.dt_uniform, tl.dt_gradient,
                );
                let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
                for (i, &dof) in quad_dofs.iter().enumerate() {
                    if i < f_th.len() { f_global[dof] += f_th[i]; }
                }
            }
        }
        if let SolverLoad3D::QuadSelfWeight(sw) = load {
            if let Some(&quad) = quad_map.get(&sw.element_id) {
                let coords = quad_coords(&node_map, quad);
                let f_sw_local = crate::element::quad::quad_self_weight_load(
                    &coords, sw.density, quad.thickness, sw.gx, sw.gy, sw.gz,
                );
                let t_quad = crate::element::quad::quad_transform_3d(&coords);
                let f_sw = crate::linalg::transform_force(&f_sw_local, &t_quad, 24);
                let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
                for (i, &dof) in quad_dofs.iter().enumerate() {
                    if i < f_sw.len() { f_global[dof] += f_sw[i]; }
                }
            }
        }
        if let SolverLoad3D::QuadEdge(el) = load {
            if let Some(&quad) = quad_map.get(&el.element_id) {
                let coords = quad_coords(&node_map, quad);
                let f_edge = crate::element::quad::quad_edge_load(&coords, el.edge, el.qn, el.qt);
                let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
                for (i, &dof) in quad_dofs.iter().enumerate() {
                    if i < f_edge.len() { f_global[dof] += f_edge[i]; }
                }
            }
        }
        // Quad9 (MITC9) load dispatch — sparse path
        if let SolverLoad3D::Quad9Pressure(pl) = load {
            if let Some(q9) = input.quad9s.values().find(|q| q.id == pl.element_id) {
                let coords = quad9_coords(&node_map, q9);
                let f_p = crate::element::quad9::quad9_pressure_load(&coords, pl.pressure);
                let dofs = dof_num.quad9_element_dofs(&q9.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_p.len() { f_global[dof] += f_p[i]; }
                }
            }
        }
        if let SolverLoad3D::Quad9Thermal(tl) = load {
            if let Some(q9) = input.quad9s.values().find(|q| q.id == tl.element_id) {
                let mat = mat_map[&q9.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let alpha = tl.alpha.unwrap_or(1.2e-5);
                let coords = quad9_coords(&node_map, q9);
                let f_th = crate::element::quad9::quad9_thermal_load(
                    &coords, e, nu, q9.thickness, alpha, tl.dt_uniform, tl.dt_gradient,
                );
                let dofs = dof_num.quad9_element_dofs(&q9.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_th.len() { f_global[dof] += f_th[i]; }
                }
            }
        }
        if let SolverLoad3D::Quad9SelfWeight(sw) = load {
            if let Some(q9) = input.quad9s.values().find(|q| q.id == sw.element_id) {
                let coords = quad9_coords(&node_map, q9);
                let f_sw_local = crate::element::quad9::quad9_self_weight_load(
                    &coords, sw.density, q9.thickness, sw.gx, sw.gy, sw.gz,
                );
                let t_q9 = crate::element::quad9::quad9_transform_3d(&coords);
                let f_sw = crate::linalg::transform_force(&f_sw_local, &t_q9, 54);
                let dofs = dof_num.quad9_element_dofs(&q9.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_sw.len() { f_global[dof] += f_sw[i]; }
                }
            }
        }
        if let SolverLoad3D::Quad9Edge(el) = load {
            if let Some(q9) = input.quad9s.values().find(|q| q.id == el.element_id) {
                let coords = quad9_coords(&node_map, q9);
                let f_edge = crate::element::quad9::quad9_edge_load(&coords, el.edge, el.qn, el.qt);
                let dofs = dof_num.quad9_element_dofs(&q9.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_edge.len() { f_global[dof] += f_edge[i]; }
                }
            }
        }
        // Solid-shell load dispatch — sparse path
        if let SolverLoad3D::SolidShellPressure(pl) = load {
            if let Some(ss) = input.solid_shells.values().find(|s| s.id == pl.element_id) {
                let coords = solid_shell_coords(&node_map, ss);
                let f_p = crate::element::solid_shell::solid_shell_pressure_load(&coords, pl.pressure);
                let dofs = dof_num.solid_shell_element_dofs(&ss.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_p.len() { f_global[dof] += f_p[i]; }
                }
            }
        }
        if let SolverLoad3D::SolidShellSelfWeight(sw) = load {
            if let Some(ss) = input.solid_shells.values().find(|s| s.id == sw.element_id) {
                let coords = solid_shell_coords(&node_map, ss);
                let f_sw = crate::element::solid_shell::solid_shell_self_weight_load(
                    &coords, sw.density, sw.gx, sw.gy, sw.gz,
                );
                let dofs = dof_num.solid_shell_element_dofs(&ss.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_sw.len() { f_global[dof] += f_sw[i]; }
                }
            }
        }
        // Curved shell loads (sparse path)
        if let SolverLoad3D::CurvedShellPressure(pl) = load {
            if let Some(cs) = input.curved_shells.values().find(|s| s.id == pl.element_id) {
                let coords = curved_shell_coords(&node_map, cs);
                let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
                let f_p = crate::element::curved_shell::curved_shell_pressure_load(&coords, &dirs, cs.thickness, pl.pressure);
                let dofs = dof_num.quad_element_dofs(&cs.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_p.len() { f_global[dof] += f_p[i]; }
                }
            }
        }
        if let SolverLoad3D::CurvedShellThermal(tl) = load {
            if let Some(cs) = input.curved_shells.values().find(|s| s.id == tl.element_id) {
                let mat = mat_map[&cs.material_id];
                let e = mat.e * 1000.0;
                let nu = mat.nu;
                let alpha = tl.alpha.unwrap_or(1.2e-5);
                let coords = curved_shell_coords(&node_map, cs);
                let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
                let f_th = crate::element::curved_shell::curved_shell_thermal_load(
                    &coords, &dirs, e, nu, cs.thickness, alpha, tl.dt_uniform, tl.dt_gradient,
                );
                let dofs = dof_num.quad_element_dofs(&cs.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_th.len() { f_global[dof] += f_th[i]; }
                }
            }
        }
        if let SolverLoad3D::CurvedShellSelfWeight(sw) = load {
            if let Some(cs) = input.curved_shells.values().find(|s| s.id == sw.element_id) {
                let coords = curved_shell_coords(&node_map, cs);
                let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
                let f_sw = crate::element::curved_shell::curved_shell_self_weight_load(
                    &coords, &dirs, sw.density, cs.thickness, sw.gx, sw.gy, sw.gz,
                );
                let dofs = dof_num.quad_element_dofs(&cs.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_sw.len() { f_global[dof] += f_sw[i]; }
                }
            }
        }
        if let SolverLoad3D::CurvedShellEdge(el) = load {
            if let Some(cs) = input.curved_shells.values().find(|s| s.id == el.element_id) {
                let coords = curved_shell_coords(&node_map, cs);
                let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
                let f_e = crate::element::curved_shell::curved_shell_edge_load(
                    &coords, &dirs, cs.thickness, el.edge, el.qn, el.qt,
                );
                let dofs = dof_num.quad_element_dofs(&cs.nodes);
                for (i, &dof) in dofs.iter().enumerate() {
                    if i < f_e.len() { f_global[dof] += f_e[i]; }
                }
            }
        }
    }

    // Spring stiffness
    for sup in input.supports.values() {
        let springs = [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz];
        for (i, ks) in springs.iter().enumerate() {
            if let Some(k) = ks {
                if *k > 0.0 && i < dof_num.dofs_per_node {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                        trip_rows.push(d); trip_cols.push(d); trip_vals.push(*k);
                        if d < nf { diag_vals[d] += *k; }
                    }
                }
            }
        }
        if dof_num.dofs_per_node >= 7 {
            if let Some(kw) = sup.kw {
                if kw > 0.0 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, 6)) {
                        trip_rows.push(d); trip_cols.push(d); trip_vals.push(kw);
                        if d < nf { diag_vals[d] += kw; }
                    }
                }
            }
        }
    }

    for d in &diag_vals[..nf] { max_diag = max_diag.max(d.abs()); }

    // Artificial stiffness at floating warping DOFs
    let mut artificial_dofs_3d = Vec::new();
    if dof_num.dofs_per_node >= 7 {
        let artificial_k = if max_diag > 0.0 { max_diag * 1e-10 } else { 1e-6 };
        for &node_id in &dof_num.node_order {
            if let Some(&d) = dof_num.map.get(&(node_id, 6)) {
                if d < nf && diag_vals[d].abs() < 1e-20 {
                    trip_rows.push(d); trip_cols.push(d); trip_vals.push(artificial_k);
                    artificial_dofs_3d.push(d);
                }
            }
        }
    }

    // Inclined support transforms (applied to triplets before CSC conversion)
    let mut inclined_transforms = Vec::new();
    for sup in input.supports.values() {
        if sup.is_inclined.unwrap_or(false) {
            if let (Some(nx), Some(ny), Some(nz)) = (sup.normal_x, sup.normal_y, sup.normal_z) {
                let n_len = (nx * nx + ny * ny + nz * nz).sqrt();
                if n_len > 1e-12 {
                    let r = inclined_rotation_matrix(nx, ny, nz);
                    if let (Some(&d0), Some(&d1), Some(&d2)) = (
                        dof_num.map.get(&(sup.node_id, 0)),
                        dof_num.map.get(&(sup.node_id, 1)),
                        dof_num.map.get(&(sup.node_id, 2)),
                    ) {
                        let dofs = [d0, d1, d2];
                        apply_inclined_transform_triplets(
                            &mut trip_rows, &mut trip_cols, &mut trip_vals,
                            &mut f_global, &dofs, &r,
                        );
                        inclined_transforms.push(InclinedTransformData { node_id: sup.node_id, dofs, r });
                    }
                }
            }
        }
    }

    // Compact zeroed-out triplets left by inclined support transforms
    if !inclined_transforms.is_empty() {
        let mut w = 0;
        for r in 0..trip_rows.len() {
            if trip_vals[r] != 0.0 {
                trip_rows[w] = trip_rows[r];
                trip_cols[w] = trip_cols[r];
                trip_vals[w] = trip_vals[r];
                w += 1;
            }
        }
        trip_rows.truncate(w);
        trip_cols.truncate(w);
        trip_vals.truncate(w);
    }

    // Element quality diagnostics
    let mut diagnostics = Vec::new();
    for plate in input.plates.values() {
        let n0 = node_map[&plate.nodes[0]];
        let n1 = node_map[&plate.nodes[1]];
        let n2 = node_map[&plate.nodes[2]];
        let coords = [[n0.x, n0.y, n0.z], [n1.x, n1.y, n1.z], [n2.x, n2.y, n2.z]];
        let (aspect_ratio, _skew, min_angle) = crate::element::plate_element_quality(&coords);
        if aspect_ratio > 10.0 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: plate.id, element_type: "plate".into(), metric: "aspect_ratio".into(),
                value: aspect_ratio, threshold: 10.0,
                message: format!("Plate {} aspect ratio {:.1} exceeds 10", plate.id, aspect_ratio),
            });
        }
        if min_angle < 10.0 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: plate.id, element_type: "plate".into(), metric: "min_angle".into(),
                value: min_angle, threshold: 10.0,
                message: format!("Plate {} min angle {:.1}° below 10°", plate.id, min_angle),
            });
        }
    }
    for quad in input.quads.values() {
        let qn0 = node_map[&quad.nodes[0]];
        let qn1 = node_map[&quad.nodes[1]];
        let qn2 = node_map[&quad.nodes[2]];
        let qn3 = node_map[&quad.nodes[3]];
        let coords = [[qn0.x, qn0.y, qn0.z], [qn1.x, qn1.y, qn1.z], [qn2.x, qn2.y, qn2.z], [qn3.x, qn3.y, qn3.z]];
        let qm = crate::element::quad::quad_quality_metrics(&coords);
        let (_, _, has_neg_j) = crate::element::quad::quad_check_jacobian(&coords);
        if has_neg_j {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id, element_type: "quad".into(), metric: "negative_jacobian".into(),
                value: -1.0, threshold: 0.0,
                message: format!("Quad {} has negative Jacobian determinant (inverted element)", quad.id),
            });
        }
        if qm.aspect_ratio > 10.0 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id, element_type: "quad".into(), metric: "aspect_ratio".into(),
                value: qm.aspect_ratio, threshold: 10.0,
                message: format!("Quad {} aspect ratio {:.1} exceeds 10", quad.id, qm.aspect_ratio),
            });
        }
        if qm.warping > 0.01 && qm.warping <= 0.1 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id, element_type: "quad".into(), metric: "warping_moderate".into(),
                value: qm.warping, threshold: 0.01,
                message: format!("Quad {} moderate warping {:.3} (0.01-0.1 range)", quad.id, qm.warping),
            });
        }
        if qm.warping > 0.1 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id, element_type: "quad".into(), metric: "warping".into(),
                value: qm.warping, threshold: 0.1,
                message: format!("Quad {} warping {:.3} exceeds 0.1", quad.id, qm.warping),
            });
        }
        if qm.jacobian_ratio < 0.1 {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: quad.id, element_type: "quad".into(), metric: "jacobian_ratio".into(),
                value: qm.jacobian_ratio, threshold: 0.1,
                message: format!("Quad {} jacobian ratio {:.3} below 0.1", quad.id, qm.jacobian_ratio),
            });
        }
    }

    // Quad9 diagnostics (sparse path)
    for q9 in input.quad9s.values() {
        let coords = quad9_coords(&node_map, q9);
        let (_, _, has_neg_j) = crate::element::quad9::quad9_check_jacobian(&coords);
        if has_neg_j {
            diagnostics.push(crate::types::AssemblyDiagnostic {
                element_id: q9.id, element_type: "quad9".into(), metric: "negative_jacobian".into(),
                value: -1.0, threshold: 0.0,
                message: format!("Quad9 {} has negative Jacobian determinant (inverted element)", q9.id),
            });
        }
    }

    // Build full-K CSC only if requested (linear solve needs it for reactions)
    let k_full = if build_k_full {
        Some(CscMatrix::from_triplets(n, &trip_rows, &trip_cols, &trip_vals))
    } else {
        None
    };

    // Filter triplets for Kff (free-free block)
    let mut ff_rows = Vec::new();
    let mut ff_cols = Vec::new();
    let mut ff_vals = Vec::new();
    for i in 0..trip_rows.len() {
        if trip_rows[i] < nf && trip_cols[i] < nf {
            ff_rows.push(trip_rows[i]); ff_cols.push(trip_cols[i]); ff_vals.push(trip_vals[i]);
        }
    }
    let mut k_ff = CscMatrix::from_triplets(nf, &ff_rows, &ff_cols, &ff_vals);
    // Drop tiny entries to match from_dense_symmetric behavior — prevents
    // spurious near-zero entries from making Cholesky succeed on singular matrices.
    k_ff.drop_below_threshold(1e-30);

    SparseAssemblyResult3D {
        k_ff, k_full, f: f_global, max_diag_k: max_diag,
        artificial_dofs: artificial_dofs_3d, inclined_transforms, diagnostics,
    }
}

/// Helper to extract quad node coordinates.
fn quad_coords(node_map: &std::collections::HashMap<usize, &SolverNode3D>, quad: &SolverQuadElement) -> [[f64; 3]; 4] {
    let n0 = node_map[&quad.nodes[0]];
    let n1 = node_map[&quad.nodes[1]];
    let n2 = node_map[&quad.nodes[2]];
    let n3 = node_map[&quad.nodes[3]];
    [[n0.x, n0.y, n0.z], [n1.x, n1.y, n1.z], [n2.x, n2.y, n2.z], [n3.x, n3.y, n3.z]]
}

/// Helper to extract quad9 node coordinates.
fn quad9_coords(node_map: &std::collections::HashMap<usize, &SolverNode3D>, q9: &SolverQuad9Element) -> [[f64; 3]; 9] {
    let mut coords = [[0.0; 3]; 9];
    for (i, &nid) in q9.nodes.iter().enumerate() {
        let n = node_map[&nid];
        coords[i] = [n.x, n.y, n.z];
    }
    coords
}

/// Helper to extract solid-shell node coordinates.
fn solid_shell_coords(node_map: &std::collections::HashMap<usize, &SolverNode3D>, ss: &SolverSolidShellElement) -> [[f64; 3]; 8] {
    let mut coords = [[0.0; 3]; 8];
    for (i, &nid) in ss.nodes.iter().enumerate() {
        let n = node_map[&nid];
        coords[i] = [n.x, n.y, n.z];
    }
    coords
}

fn curved_shell_coords(node_map: &std::collections::HashMap<usize, &SolverNode3D>, cs: &SolverCurvedShellElement) -> [[f64; 3]; 4] {
    let mut coords = [[0.0; 3]; 4];
    for (i, &nid) in cs.nodes.iter().enumerate() {
        let n = node_map[&nid];
        coords[i] = [n.x, n.y, n.z];
    }
    coords
}
