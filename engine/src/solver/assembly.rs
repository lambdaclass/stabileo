use crate::types::*;
use crate::element::*;
use crate::linalg::*;
use crate::linalg::sparse::CscMatrix;
use super::dof::DofNumbering;

/// Assembly result: global stiffness matrix and force vector.
pub struct AssemblyResult {
    pub k: Vec<f64>,       // n_total × n_total stiffness matrix
    pub f: Vec<f64>,       // n_total force vector
    pub max_diag_k: f64,   // Maximum diagonal element (for artificial stiffness)
    pub artificial_dofs: Vec<usize>, // DOFs with artificial stiffness added
}

/// Assemble global stiffness matrix and force vector for 2D.
pub fn assemble_2d(input: &SolverInput, dof_num: &DofNumbering) -> AssemblyResult {
    let n = dof_num.n_total;
    let mut k_global = vec![0.0; n * n];
    let mut f_global = vec![0.0; n];

    // Assemble element stiffness matrices
    for elem in input.elements.values() {
        let node_i = input.nodes.values().find(|n| n.id == elem.node_i).unwrap();
        let node_j = input.nodes.values().find(|n| n.id == elem.node_j).unwrap();
        let mat = input.materials.values().find(|m| m.id == elem.material_id).unwrap();
        let sec = input.sections.values().find(|s| s.id == elem.section_id).unwrap();

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0; // MPa → kN/m²

        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);

        if elem.elem_type == "truss" {
            // Truss: assemble directly in global coordinates
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
        } else {
            // Frame element
            let k_local = frame_local_stiffness_2d(
                e, sec.a, sec.iz, l, elem.hinge_start, elem.hinge_end,
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

    // Assemble nodal loads
    for load in &input.loads {
        if let SolverLoad::Nodal(nl) = load {
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 0)) {
                f_global[d] += nl.fx;
            }
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 1)) {
                f_global[d] += nl.fy;
            }
            if dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(nl.node_id, 2)) {
                    f_global[d] += nl.mz;
                }
            }
        }
    }

    // Add spring stiffness to diagonal
    for sup in input.supports.values() {
        if let Some(kx) = sup.kx {
            if kx > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                    k_global[d * n + d] += kx;
                }
            }
        }
        if let Some(ky) = sup.ky {
            if ky > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                    k_global[d * n + d] += ky;
                }
            }
        }
        if let Some(kz) = sup.kz {
            if kz > 0.0 && dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                    k_global[d * n + d] += kz;
                }
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
            if sup.support_type == "fixed" || sup.support_type == "guidedX" {
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
    }

    AssemblyResult {
        k: k_global,
        f: f_global,
        max_diag_k: max_diag,
        artificial_dofs,
    }
}

fn assemble_element_loads_2d(
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
                adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end);

                // Transform to global and add
                let fef_global = transform_force(&fef, t, 6);
                for (i, &dof) in elem_dofs.iter().enumerate() {
                    f_global[dof] += fef_global[i];
                }
            }
            SolverLoad::PointOnElement(pl) if pl.element_id == elem.id => {
                let px = pl.px.unwrap_or(0.0);
                let mz = pl.mz.unwrap_or(0.0);
                let mut fef = fef_point_load_2d(pl.p, px, mz, pl.a, l);

                adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end);

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

                adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end);

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

    for elem in input.elements.values() {
        let node_i = input.nodes.values().find(|n| n.id == elem.node_i).unwrap();
        let node_j = input.nodes.values().find(|n| n.id == elem.node_j).unwrap();
        let mat = input.materials.values().find(|m| m.id == elem.material_id).unwrap();
        let sec = input.sections.values().find(|s| s.id == elem.section_id).unwrap();

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        let e = mat.e * 1000.0;
        let g = e / (2.0 * (1.0 + mat.nu));

        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);

        if elem.elem_type == "truss" {
            // 3D truss: direct global assembly
            let ea_l = e * sec.a / l;
            let dir = [dx / l, dy / l, dz / l];
            let _truss_dofs_per_node = 3.min(dof_num.dofs_per_node);

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
                                k_global[da * n + db] += sign * ea_l * dir[i] * dir[j];
                            }
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

            let k_local = frame_local_stiffness_3d(
                e, sec.a, sec.iy, sec.iz, sec.j, l, g,
                elem.hinge_start, elem.hinge_end,
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
            assemble_element_loads_3d(input, elem, &t, l, &elem_dofs, &mut f_global);
        }
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
    }

    let mut max_diag = 0.0f64;
    for i in 0..n {
        max_diag = max_diag.max(k_global[i * n + i].abs());
    }

    AssemblyResult {
        k: k_global,
        f: f_global,
        max_diag_k: max_diag,
        artificial_dofs: Vec::new(),
    }
}

fn assemble_element_loads_3d(
    input: &SolverInput3D,
    elem: &SolverElement3D,
    t: &[f64],
    l: f64,
    elem_dofs: &[usize],
    f_global: &mut [f64],
) {
    for load in &input.loads {
        match load {
            SolverLoad3D::Distributed(dl) if dl.element_id == elem.id => {
                let fef = fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l);
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

                let fef_global = transform_force(&fef, t, 12);
                for (i, &dof) in elem_dofs.iter().enumerate() {
                    f_global[dof] += fef_global[i];
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

    for elem in input.elements.values() {
        let node_i = input.nodes.values().find(|n| n.id == elem.node_i).unwrap();
        let node_j = input.nodes.values().find(|n| n.id == elem.node_j).unwrap();
        let mat = input.materials.values().find(|m| m.id == elem.material_id).unwrap();
        let sec = input.sections.values().find(|s| s.id == elem.section_id).unwrap();

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0;

        if elem.elem_type == "truss" {
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
        } else {
            let k_local = frame_local_stiffness_2d(e, sec.a, sec.iz, l, elem.hinge_start, elem.hinge_end);
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

    // Nodal loads
    for load in &input.loads {
        if let SolverLoad::Nodal(nl) = load {
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 0)) { f_global[d] += nl.fx; }
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 1)) { f_global[d] += nl.fy; }
            if dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(nl.node_id, 2)) { f_global[d] += nl.mz; }
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
            if sup.support_type == "fixed" || sup.support_type == "guidedX" { rot_restrained.insert(sup.node_id); }
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

/// Assemble sparse Kff for 3D. Returns CSC lower-triangle of the free-DOF block.
pub fn assemble_sparse_3d(input: &SolverInput3D, dof_num: &DofNumbering) -> SparseAssemblyResult {
    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let mut f_global = vec![0.0; n];
    let left_hand = input.left_hand.unwrap_or(false);

    let mut trip_rows = Vec::new();
    let mut trip_cols = Vec::new();
    let mut trip_vals = Vec::new();
    let mut max_diag = 0.0f64;
    let mut diag_vals = vec![0.0f64; nf];

    for elem in input.elements.values() {
        let node_i = input.nodes.values().find(|n| n.id == elem.node_i).unwrap();
        let node_j = input.nodes.values().find(|n| n.id == elem.node_j).unwrap();
        let mat = input.materials.values().find(|m| m.id == elem.material_id).unwrap();
        let sec = input.sections.values().find(|s| s.id == elem.section_id).unwrap();

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        let e = mat.e * 1000.0;
        let g = e / (2.0 * (1.0 + mat.nu));

        if elem.elem_type == "truss" {
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
                                if da < nf && db < nf && da >= db {
                                    let val = sign * ea_l * dir[i] * dir[j];
                                    trip_rows.push(da); trip_cols.push(db); trip_vals.push(val);
                                    if da == db { diag_vals[da] += val; }
                                }
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
            let k_local = frame_local_stiffness_3d(e, sec.a, sec.iy, sec.iz, sec.j, l, g, elem.hinge_start, elem.hinge_end);
            let t = frame_transform_3d(&ex, &ey, &ez);
            let k_glob = transform_stiffness(&k_local, &t, 12);
            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let ndof = elem_dofs.len();

            for i in 0..ndof {
                if elem_dofs[i] >= nf { continue; }
                for j in 0..ndof {
                    if elem_dofs[j] >= nf { continue; }
                    let gi = elem_dofs[i];
                    let gj = elem_dofs[j];
                    if gi >= gj {
                        trip_rows.push(gi); trip_cols.push(gj); trip_vals.push(k_glob[i * ndof + j]);
                    }
                }
                diag_vals[elem_dofs[i]] += k_glob[i * ndof + i];
            }

            assemble_element_loads_3d(input, elem, &t, l, &elem_dofs, &mut f_global);
        }
    }

    // 3D nodal loads
    for load in &input.loads {
        if let SolverLoad3D::Nodal(nl) = load {
            let forces = [nl.fx, nl.fy, nl.fz, nl.mx, nl.my, nl.mz];
            for (i, &f) in forces.iter().enumerate() {
                if i < dof_num.dofs_per_node {
                    if let Some(&d) = dof_num.map.get(&(nl.node_id, i)) { f_global[d] += f; }
                }
            }
        }
    }

    // 3D spring stiffness
    for sup in input.supports.values() {
        let springs = [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz];
        for (i, ks) in springs.iter().enumerate() {
            if let Some(k) = ks {
                if *k > 0.0 && i < dof_num.dofs_per_node {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                        if d < nf {
                            trip_rows.push(d); trip_cols.push(d); trip_vals.push(*k);
                            diag_vals[d] += *k;
                        }
                    }
                }
            }
        }
    }

    for d in &diag_vals[..nf] { max_diag = max_diag.max(d.abs()); }

    let k_ff = CscMatrix::from_triplets(nf, &trip_rows, &trip_cols, &trip_vals);
    SparseAssemblyResult { k_ff, f: f_global, max_diag_k: max_diag, artificial_dofs: Vec::new() }
}
