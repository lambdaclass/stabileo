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
    pub inclined_transforms: Vec<InclinedTransformData>, // Data for reversing inclined support rotations
}

/// Data needed to reverse the inclined support rotation after solving.
pub struct InclinedTransformData {
    pub node_id: usize,
    pub dofs: [usize; 3],        // Global DOF indices for ux, uy, uz
    pub r: [[f64; 3]; 3],        // Rotation matrix (rows = local axes)
}

/// Build rotation matrix that maps global to local frame where ê₁ = normal.
fn inclined_rotation_matrix(nx: f64, ny: f64, nz: f64) -> [[f64; 3]; 3] {
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
        let dy = node_j.y - node_i.y;
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
    }

    AssemblyResult {
        k: k_global,
        f: f_global,
        max_diag_k: max_diag,
        artificial_dofs,
        inclined_transforms: Vec::new(),
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

    for elem in input.elements.values() {
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
                assemble_element_loads_3d_warping(input, elem, &t, l, e, sec, &elem_dofs, &mut f_global);
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
                assemble_element_loads_3d_mapped(input, elem, &t, l, e, sec, &elem_dofs, &mut f_global);
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
                assemble_element_loads_3d(input, elem, &t, l, e, sec, &elem_dofs, &mut f_global);
            }
        }
    }

    // Assemble plate element stiffness matrices
    for plate in input.plates.values() {
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

    // Assemble quad (MITC4 shell) element stiffness matrices
    for quad in input.quads.values() {
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

    AssemblyResult {
        k: k_global,
        f: f_global,
        max_diag_k: max_diag,
        artificial_dofs: artificial_dofs_3d,
        inclined_transforms,
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
) {
    for load in &input.loads {
        match load {
            SolverLoad3D::Distributed(dl) if dl.element_id == elem.id => {
                let a = dl.a.unwrap_or(0.0);
                let b = dl.b.unwrap_or(l);
                let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);

                let fef = if is_full {
                    fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l)
                } else {
                    fef_partial_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, a, b, l)
                };
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
            SolverLoad3D::Thermal(tl) if tl.element_id == elem.id => {
                let alpha = 12e-6; // Steel default
                let hy = if sec.a > 1e-15 { (12.0 * sec.iz / sec.a).sqrt() } else { 0.1 };
                let hz = if sec.a > 1e-15 { (12.0 * sec.iy / sec.a).sqrt() } else { 0.1 };
                let fef = fef_thermal_3d(
                    e, sec.a, sec.iy, sec.iz, l,
                    tl.dt_uniform, tl.dt_gradient_y, tl.dt_gradient_z,
                    alpha, hy, hz,
                );
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
) {
    for load in &input.loads {
        match load {
            SolverLoad3D::Distributed(dl) if dl.element_id == elem.id => {
                let a = dl.a.unwrap_or(0.0);
                let b = dl.b.unwrap_or(l);
                let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);

                let fef12 = if is_full {
                    fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l)
                } else {
                    fef_partial_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, a, b, l)
                };
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
                let fef12 = fef_thermal_3d(
                    e, sec.a, sec.iy, sec.iz, l,
                    tl.dt_uniform, tl.dt_gradient_y, tl.dt_gradient_z,
                    alpha, hy, hz,
                );
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
) {
    for load in &input.loads {
        match load {
            SolverLoad3D::Distributed(dl) if dl.element_id == elem.id => {
                let a = dl.a.unwrap_or(0.0);
                let b = dl.b.unwrap_or(l);
                let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);

                let fef = if is_full {
                    fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l)
                } else {
                    fef_partial_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, a, b, l)
                };
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
                let fef_global = transform_force(&fef, t12, 12);
                for i in 0..12 {
                    f_global[elem_dofs[DOF_MAP_12_TO_14[i]]] += fef_global[i];
                }
            }
            SolverLoad3D::Thermal(tl) if tl.element_id == elem.id => {
                let alpha = 12e-6;
                let hy = if sec.a > 1e-15 { (12.0 * sec.iz / sec.a).sqrt() } else { 0.1 };
                let hz = if sec.a > 1e-15 { (12.0 * sec.iy / sec.a).sqrt() } else { 0.1 };
                let fef = fef_thermal_3d(
                    e, sec.a, sec.iy, sec.iz, l,
                    tl.dt_uniform, tl.dt_gradient_y, tl.dt_gradient_z,
                    alpha, hy, hz,
                );
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
        let dy = node_j.y - node_i.y;
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
        let dy = nj.y - ni.y;
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

    // Pre-build O(1) lookup maps
    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection3D> =
        input.sections.values().map(|s| (s.id, s)).collect();

    for elem in input.elements.values() {
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
            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let has_cw = sec.cw.map_or(false, |cw| cw > 0.0);

            if has_cw && dof_num.dofs_per_node >= 7 {
                let k_local = frame_local_stiffness_3d_warping(
                    e, sec.a, sec.iy, sec.iz, sec.j, sec.cw.unwrap(), l, g,
                    elem.hinge_start, elem.hinge_end, 0.0, 0.0,
                );
                let t = frame_transform_3d_warping(&ex, &ey, &ez);
                let k_glob = transform_stiffness(&k_local, &t, 14);
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
                assemble_element_loads_3d_warping(input, elem, &t, l, e, sec, &elem_dofs, &mut f_global);
            } else if dof_num.dofs_per_node >= 7 {
                let k_local = frame_local_stiffness_3d(e, sec.a, sec.iy, sec.iz, sec.j, l, g, elem.hinge_start, elem.hinge_end, 0.0, 0.0);
                let t = frame_transform_3d(&ex, &ey, &ez);
                let k_glob = transform_stiffness(&k_local, &t, 12);

                for i in 0..12 {
                    let gi = elem_dofs[DOF_MAP_12_TO_14[i]];
                    if gi >= nf { continue; }
                    for j in 0..12 {
                        let gj = elem_dofs[DOF_MAP_12_TO_14[j]];
                        if gj >= nf { continue; }
                        if gi >= gj {
                            trip_rows.push(gi); trip_cols.push(gj); trip_vals.push(k_glob[i * 12 + j]);
                        }
                    }
                    diag_vals[gi] += k_glob[i * 12 + i];
                }
                assemble_element_loads_3d_mapped(input, elem, &t, l, e, sec, &elem_dofs, &mut f_global);
            } else {
                let k_local = frame_local_stiffness_3d(e, sec.a, sec.iy, sec.iz, sec.j, l, g, elem.hinge_start, elem.hinge_end, 0.0, 0.0);
                let t = frame_transform_3d(&ex, &ey, &ez);
                let k_glob = transform_stiffness(&k_local, &t, 12);
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
                assemble_element_loads_3d(input, elem, &t, l, e, sec, &elem_dofs, &mut f_global);
            }
        }
    }

    // 3D connector elements (sparse path)
    for conn in input.connectors.values() {
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
            if dofs[i] >= nf { continue; }
            for j in 0..ndof {
                if dofs[j] >= nf { continue; }
                let gi = dofs[i];
                let gj = dofs[j];
                if gi >= gj {
                    trip_rows.push(gi); trip_cols.push(gj); trip_vals.push(ke[i * 12 + j]);
                }
            }
            diag_vals[dofs[i]] += ke[i * 12 + i];
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
            // Bimoment load (warping DOF 6)
            if let Some(bw) = nl.bw {
                if bw.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(nl.node_id, 6)) {
                        f_global[d] += bw;
                    }
                }
            }
        }
        // Standalone bimoment load (warping DOF 6) — sparse path
        if let SolverLoad3D::Bimoment(bl) = load {
            if bl.bimoment.abs() > 1e-15 {
                if let Some(&d) = dof_num.map.get(&(bl.node_id, 6)) {
                    f_global[d] += bl.bimoment;
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
        // Warping spring (DOF 6)
        if dof_num.dofs_per_node >= 7 {
            if let Some(kw) = sup.kw {
                if kw > 0.0 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, 6)) {
                        if d < nf {
                            trip_rows.push(d); trip_cols.push(d); trip_vals.push(kw);
                            diag_vals[d] += kw;
                        }
                    }
                }
            }
        }
    }

    for d in &diag_vals[..nf] { max_diag = max_diag.max(d.abs()); }

    // Artificial stiffness at floating warping DOFs in sparse path
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

    let k_ff = CscMatrix::from_triplets(nf, &trip_rows, &trip_cols, &trip_vals);
    SparseAssemblyResult { k_ff, f: f_global, max_diag_k: max_diag, artificial_dofs: artificial_dofs_3d }
}
