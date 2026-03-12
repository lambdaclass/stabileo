use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;

/// Maps 12-DOF element indices to 14-DOF positions, skipping warping DOFs 6 and 13.
const DOF_MAP_12_TO_14: [usize; 12] = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];

/// Add geometric stiffness to the global stiffness matrix based on current axial forces.
/// Used by P-Delta and Buckling analyses.
pub fn add_geometric_stiffness_2d(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u: &[f64],
    k_global: &mut [f64],
) {
    let n = dof_num.n_total;
    let node_by_id: std::collections::HashMap<usize, &SolverNode> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = input.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection> = input.sections.values().map(|s| (s.id, s)).collect();

    for elem in input.elements.values() {
        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            // Truss geometric stiffness
            add_truss_kg_2d(&node_by_id, &mat_by_id, &sec_by_id, dof_num, elem, u, k_global, n);
            continue;
        }

        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0;

        // Get current axial force from displacements
        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
        let u_global: Vec<f64> = elem_dofs.iter().map(|&d| u[d]).collect();
        let t = crate::element::frame_transform_2d(cos, sin);
        let u_local = transform_displacement(&u_global, &t, 6);

        // Axial deformation → axial force
        let axial_force = e * sec.a / l * (u_local[3] - u_local[0]);

        // Geometric stiffness matrix (Przemieniecki formulation)
        let p = axial_force;
        let coeff = p / (30.0 * l);

        // Local geometric stiffness (transverse DOFs: v1, θ1, v2, θ2 → indices 1,2,4,5)
        let mut k_g_local = vec![0.0; 36]; // 6×6
        k_g_local[1 * 6 + 1] = 36.0 * coeff;
        k_g_local[1 * 6 + 2] = 3.0 * l * coeff;
        k_g_local[1 * 6 + 4] = -36.0 * coeff;
        k_g_local[1 * 6 + 5] = 3.0 * l * coeff;

        k_g_local[2 * 6 + 1] = 3.0 * l * coeff;
        k_g_local[2 * 6 + 2] = 4.0 * l * l * coeff;
        k_g_local[2 * 6 + 4] = -3.0 * l * coeff;
        k_g_local[2 * 6 + 5] = -l * l * coeff;

        k_g_local[4 * 6 + 1] = -36.0 * coeff;
        k_g_local[4 * 6 + 2] = -3.0 * l * coeff;
        k_g_local[4 * 6 + 4] = 36.0 * coeff;
        k_g_local[4 * 6 + 5] = -3.0 * l * coeff;

        k_g_local[5 * 6 + 1] = 3.0 * l * coeff;
        k_g_local[5 * 6 + 2] = -l * l * coeff;
        k_g_local[5 * 6 + 4] = -3.0 * l * coeff;
        k_g_local[5 * 6 + 5] = 4.0 * l * l * coeff;

        // Transform to global
        let k_g_global = transform_stiffness(&k_g_local, &t, 6);

        // Add to global matrix
        let ndof = elem_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_global[elem_dofs[i] * n + elem_dofs[j]] += k_g_global[i * ndof + j];
            }
        }
    }
}

fn add_truss_kg_2d(
    node_by_id: &std::collections::HashMap<usize, &SolverNode>,
    mat_by_id: &std::collections::HashMap<usize, &SolverMaterial>,
    sec_by_id: &std::collections::HashMap<usize, &SolverSection>,
    dof_num: &DofNumbering,
    elem: &SolverElement,
    u: &[f64],
    k_global: &mut [f64],
    n: usize,
) {
    let node_i = node_by_id[&elem.node_i];
    let node_j = node_by_id[&elem.node_j];
    let mat = mat_by_id[&elem.material_id];
    let sec = sec_by_id[&elem.section_id];

    let dx = node_j.x - node_i.x;
    let dy = node_j.y - node_i.y;
    let l = (dx * dx + dy * dy).sqrt();
    let cos = dx / l;
    let sin = dy / l;
    let e = mat.e * 1000.0;

    let ui = [
        dof_num.global_dof(elem.node_i, 0).map(|d| u[d]).unwrap_or(0.0),
        dof_num.global_dof(elem.node_i, 1).map(|d| u[d]).unwrap_or(0.0),
    ];
    let uj = [
        dof_num.global_dof(elem.node_j, 0).map(|d| u[d]).unwrap_or(0.0),
        dof_num.global_dof(elem.node_j, 1).map(|d| u[d]).unwrap_or(0.0),
    ];
    let delta = (uj[0] - ui[0]) * cos + (uj[1] - ui[1]) * sin;
    let axial_force = e * sec.a / l * delta;

    // Truss geometric stiffness in global: P/L * [[s²,-cs,-s²,cs],[-cs,c²,cs,-c²],...]
    // where c=cos, s=sin
    let p_over_l = axial_force / l;
    let cc = cos * cos;
    let ss = sin * sin;
    let cs = cos * sin;

    // 4×4 matrix for DOFs: [ux_i, uy_i, ux_j, uy_j]
    let k_g = [
        ss * p_over_l, -cs * p_over_l, -ss * p_over_l, cs * p_over_l,
        -cs * p_over_l, cc * p_over_l, cs * p_over_l, -cc * p_over_l,
        -ss * p_over_l, cs * p_over_l, ss * p_over_l, -cs * p_over_l,
        cs * p_over_l, -cc * p_over_l, -cs * p_over_l, cc * p_over_l,
    ];

    let truss_dofs = [
        dof_num.global_dof(elem.node_i, 0).unwrap(),
        dof_num.global_dof(elem.node_i, 1).unwrap(),
        dof_num.global_dof(elem.node_j, 0).unwrap(),
        dof_num.global_dof(elem.node_j, 1).unwrap(),
    ];

    for i in 0..4 {
        for j in 0..4 {
            k_global[truss_dofs[i] * n + truss_dofs[j]] += k_g[i * 4 + j];
        }
    }
}

/// Build geometric stiffness matrix from element forces (no displacement needed).
/// Used by buckling analysis which already has element forces from linear solve.
pub fn build_kg_from_forces_2d(
    input: &SolverInput,
    dof_num: &DofNumbering,
    element_forces: &[ElementForces],
) -> Vec<f64> {
    let n = dof_num.n_total;
    let mut k_g = vec![0.0; n * n];
    let elem_by_id: std::collections::HashMap<usize, &SolverElement> = input.elements.values().map(|e| (e.id, e)).collect();
    let node_by_id: std::collections::HashMap<usize, &SolverNode> = input.nodes.values().map(|n| (n.id, n)).collect();

    for ef in element_forces {
        let elem = elem_by_id[&ef.element_id];
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;

        // Use average axial force (negative = compression)
        let axial_force = (ef.n_start + ef.n_end) / 2.0;

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let p_over_l = axial_force / l;
            let cc = cos * cos;
            let ss = sin * sin;
            let cs = cos * sin;
            let kg_local = [
                ss * p_over_l, -cs * p_over_l, -ss * p_over_l, cs * p_over_l,
                -cs * p_over_l, cc * p_over_l, cs * p_over_l, -cc * p_over_l,
                -ss * p_over_l, cs * p_over_l, ss * p_over_l, -cs * p_over_l,
                cs * p_over_l, -cc * p_over_l, -cs * p_over_l, cc * p_over_l,
            ];
            let truss_dofs = [
                dof_num.global_dof(elem.node_i, 0).unwrap(),
                dof_num.global_dof(elem.node_i, 1).unwrap(),
                dof_num.global_dof(elem.node_j, 0).unwrap(),
                dof_num.global_dof(elem.node_j, 1).unwrap(),
            ];
            for i in 0..4 {
                for j in 0..4 {
                    k_g[truss_dofs[i] * n + truss_dofs[j]] += kg_local[i * 4 + j];
                }
            }
        } else {
            let t = crate::element::frame_transform_2d(cos, sin);
            let p = axial_force;
            let coeff = p / (30.0 * l);

            let mut kg_local = vec![0.0; 36];
            kg_local[1 * 6 + 1] = 36.0 * coeff;
            kg_local[1 * 6 + 2] = 3.0 * l * coeff;
            kg_local[1 * 6 + 4] = -36.0 * coeff;
            kg_local[1 * 6 + 5] = 3.0 * l * coeff;
            kg_local[2 * 6 + 1] = 3.0 * l * coeff;
            kg_local[2 * 6 + 2] = 4.0 * l * l * coeff;
            kg_local[2 * 6 + 4] = -3.0 * l * coeff;
            kg_local[2 * 6 + 5] = -l * l * coeff;
            kg_local[4 * 6 + 1] = -36.0 * coeff;
            kg_local[4 * 6 + 2] = -3.0 * l * coeff;
            kg_local[4 * 6 + 4] = 36.0 * coeff;
            kg_local[4 * 6 + 5] = -3.0 * l * coeff;
            kg_local[5 * 6 + 1] = 3.0 * l * coeff;
            kg_local[5 * 6 + 2] = -l * l * coeff;
            kg_local[5 * 6 + 4] = -3.0 * l * coeff;
            kg_local[5 * 6 + 5] = 4.0 * l * l * coeff;

            let kg_global = transform_stiffness(&kg_local, &t, 6);
            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let ndof = elem_dofs.len();
            for i in 0..ndof {
                for j in 0..ndof {
                    k_g[elem_dofs[i] * n + elem_dofs[j]] += kg_global[i * ndof + j];
                }
            }
        }
    }
    k_g
}

/// Build 3D geometric stiffness matrix from element forces.
pub fn build_kg_from_forces_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    element_forces: &[ElementForces3D],
) -> Vec<f64> {
    let n = dof_num.n_total;
    let mut k_g = vec![0.0; n * n];
    let left_hand = input.left_hand.unwrap_or(false);
    let elem_by_id: std::collections::HashMap<usize, &SolverElement3D> = input.elements.values().map(|e| (e.id, e)).collect();
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();

    for ef in element_forces {
        let elem = elem_by_id[&ef.element_id];
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();

        let axial_force = (ef.n_start + ef.n_end) / 2.0;

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            // 3D truss Kg: P/L * [[G,-G],[-G,G]] where G_ij = δ_ij - dir_i*dir_j
            let dir = [dx / l, dy / l, dz / l];
            let p_over_l = axial_force / l;
            let mut kg_local = [0.0; 36]; // 6×6 (3 DOFs per node)
            for i in 0..3 {
                for j in 0..3 {
                    let g = if i == j { 1.0 } else { 0.0 } - dir[i] * dir[j];
                    let val = p_over_l * g;
                    kg_local[i * 6 + j] = val;         // II block
                    kg_local[(i+3) * 6 + (j+3)] = val; // JJ block
                    kg_local[i * 6 + (j+3)] = -val;    // IJ block
                    kg_local[(i+3) * 6 + j] = -val;    // JI block
                }
            }
            let truss_dofs: Vec<usize> = (0..3).map(|i| dof_num.global_dof(elem.node_i, i).unwrap())
                .chain((0..3).map(|i| dof_num.global_dof(elem.node_j, i).unwrap()))
                .collect();
            for i in 0..6 {
                for j in 0..6 {
                    k_g[truss_dofs[i] * n + truss_dofs[j]] += kg_local[i * 6 + j];
                }
            }
        } else {
            // 3D frame Kg (Przemieniecki): P/(30L) coefficient
            let (ex, ey, ez) = crate::element::compute_local_axes_3d(
                node_i.x, node_i.y, node_i.z,
                node_j.x, node_j.y, node_j.z,
                elem.local_yx, elem.local_yy, elem.local_yz,
                elem.roll_angle, left_hand,
            );
            let t = crate::element::frame_transform_3d(&ex, &ey, &ez);

            let p = axial_force;
            let coeff = p / (30.0 * l);

            // 12×12 local Kg — transverse DOFs only
            // Y-Z plane (DOFs 1,5,7,11): same as 2D transverse
            // X-Z plane (DOFs 2,4,8,10): same coefficients, sign flips on θy coupling
            let mut kg_local = vec![0.0; 144];

            // Y-Z bending plane (v, θz at each node): DOFs 1,5,7,11
            let yz = [(1,1,36.0), (1,5,3.0*l), (1,7,-36.0), (1,11,3.0*l),
                       (5,1,3.0*l), (5,5,4.0*l*l), (5,7,-3.0*l), (5,11,-l*l),
                       (7,1,-36.0), (7,5,-3.0*l), (7,7,36.0), (7,11,-3.0*l),
                       (11,1,3.0*l), (11,5,-l*l), (11,7,-3.0*l), (11,11,4.0*l*l)];
            for &(r, c, val) in &yz {
                kg_local[r * 12 + c] = val * coeff;
            }

            // X-Z bending plane (w, θy at each node): DOFs 2,4,8,10
            // Same magnitudes, but θy coupling signs flip (θy = -dw/dx convention)
            let xz = [(2,2,36.0), (2,4,-3.0*l), (2,8,-36.0), (2,10,-3.0*l),
                       (4,2,-3.0*l), (4,4,4.0*l*l), (4,8,3.0*l), (4,10,-l*l),
                       (8,2,-36.0), (8,4,3.0*l), (8,8,36.0), (8,10,3.0*l),
                       (10,2,-3.0*l), (10,4,-l*l), (10,8,3.0*l), (10,10,4.0*l*l)];
            for &(r, c, val) in &xz {
                kg_local[r * 12 + c] = val * coeff;
            }

            // Transform to global: Kg_global = T^T * Kg_local * T
            let kg_global = transform_stiffness(&kg_local, &t, 12);
            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let ndof = elem_dofs.len();
            for i in 0..ndof {
                for j in 0..ndof {
                    k_g[elem_dofs[i] * n + elem_dofs[j]] += kg_global[i * ndof + j];
                }
            }
        }
    }
    // Add quad shell geometric stiffness (from membrane stress resultants)
    // Requires displacement vector to compute stresses
    // Note: quad_stresses are computed from linear solution displacements
    // For buckling, we recompute stresses here from the linear solution
    k_g
}

/// Add quad geometric stiffness to a pre-built Kg matrix, given displacements.
/// Used by P-delta and other displacement-based geometric stiffness computations.
pub fn add_quad_geometric_stiffness_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    k_g: &mut [f64],
) {
    let n = dof_num.n_total;
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = input.materials.values().map(|m| (m.id, m)).collect();
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();

    for quad in input.quads.values() {
        let mat = mat_by_id[&quad.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;

        let n0 = node_by_id[&quad.nodes[0]];
        let n1 = node_by_id[&quad.nodes[1]];
        let n2 = node_by_id[&quad.nodes[2]];
        let n3 = node_by_id[&quad.nodes[3]];
        let coords = [
            [n0.x, n0.y, n0.z],
            [n1.x, n1.y, n1.z],
            [n2.x, n2.y, n2.z],
            [n3.x, n3.y, n3.z],
        ];

        // Get element displacements
        let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
        let u_global: Vec<f64> = quad_dofs.iter().map(|&d| u[d]).collect();
        let t_quad = crate::element::quad::quad_transform_3d(&coords);
        let u_local_vec = transform_displacement(&u_global, &t_quad, 24);
        let mut u_local = [0.0; 24];
        u_local.copy_from_slice(&u_local_vec);

        // Compute membrane stress resultants (force/length = stress × thickness)
        let s = crate::element::quad::quad_stresses(&coords, &u_local, e, nu, quad.thickness);
        let nxx = s.sigma_xx * quad.thickness;
        let nyy = s.sigma_yy * quad.thickness;
        let nxy = s.tau_xy * quad.thickness;

        // Build local geometric stiffness
        let kg_local = crate::element::quad::quad_geometric_stiffness(&coords, nxx, nyy, nxy);
        let kg_global = transform_stiffness(&kg_local, &t_quad, 24);

        let ndof = quad_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_g[quad_dofs[i] * n + quad_dofs[j]] += kg_global[i * ndof + j];
            }
        }
    }
}

/// Add plate (DKT triangle) geometric stiffness to a pre-built Kg matrix, given displacements.
/// Mirrors `add_quad_geometric_stiffness_3d` but for triangular plate elements.
pub fn add_plate_geometric_stiffness_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    k_g: &mut [f64],
) {
    let n = dof_num.n_total;
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = input.materials.values().map(|m| (m.id, m)).collect();
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();

    for plate in input.plates.values() {
        let mat = mat_by_id[&plate.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;

        let n0 = node_by_id[&plate.nodes[0]];
        let n1 = node_by_id[&plate.nodes[1]];
        let n2 = node_by_id[&plate.nodes[2]];
        let coords = [
            [n0.x, n0.y, n0.z],
            [n1.x, n1.y, n1.z],
            [n2.x, n2.y, n2.z],
        ];

        // Get element displacements
        let plate_dofs = dof_num.plate_element_dofs(&plate.nodes);
        let u_global: Vec<f64> = plate_dofs.iter().map(|&d| u[d]).collect();
        let t_plate = crate::element::plate_transform_3d(&coords);
        let u_local_vec = transform_displacement(&u_global, &t_plate, 18);

        // Compute membrane stress resultants via plate stress recovery
        let s = crate::element::plate_stress_recovery(&coords, e, nu, plate.thickness, &u_local_vec);
        let nxx = s.sigma_xx * plate.thickness;
        let nyy = s.sigma_yy * plate.thickness;
        let nxy = s.tau_xy * plate.thickness;

        // Build local geometric stiffness and transform to global
        let kg_local = crate::element::plate_geometric_stiffness(&coords, nxx, nyy, nxy);
        let kg_global = transform_stiffness(&kg_local, &t_plate, 18);

        let ndof = plate_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_g[plate_dofs[i] * n + plate_dofs[j]] += kg_global[i * ndof + j];
            }
        }
    }
}

/// Add quad9 (MITC9) geometric stiffness to a pre-built Kg matrix, given displacements.
pub fn add_quad9_geometric_stiffness_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    k_g: &mut [f64],
) {
    let n = dof_num.n_total;
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = input.materials.values().map(|m| (m.id, m)).collect();
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();

    for quad9 in input.quad9s.values() {
        let mat = mat_by_id[&quad9.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;

        let mut coords = [[0.0f64; 3]; 9];
        for (i, &nid) in quad9.nodes.iter().enumerate() {
            let nd = node_by_id[&nid];
            coords[i] = [nd.x, nd.y, nd.z];
        }

        // Get element displacements
        let q9_dofs = dof_num.quad9_element_dofs(&quad9.nodes);
        let u_global: Vec<f64> = q9_dofs.iter().map(|&d| u[d]).collect();
        let t_q9 = crate::element::quad9::quad9_transform_3d(&coords);
        let u_local_vec = transform_displacement(&u_global, &t_q9, 54);
        let mut u_local = [0.0; 54];
        u_local.copy_from_slice(&u_local_vec);

        // Compute membrane stress resultants (force/length = stress × thickness)
        let s = crate::element::quad9::quad9_stresses(&coords, &u_local, e, nu, quad9.thickness);
        let nxx = s.sigma_xx * quad9.thickness;
        let nyy = s.sigma_yy * quad9.thickness;
        let nxy = s.tau_xy * quad9.thickness;

        // Build local geometric stiffness
        let kg_local = crate::element::quad9::quad9_geometric_stiffness(&coords, nxx, nyy, nxy);
        let kg_global = transform_stiffness(&kg_local, &t_q9, 54);

        let ndof = q9_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_g[q9_dofs[i] * n + q9_dofs[j]] += kg_global[i * ndof + j];
            }
        }
    }
}

/// Add solid-shell geometric stiffness to a pre-built Kg matrix, given displacements.
pub fn add_solid_shell_geometric_stiffness_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    k_g: &mut [f64],
) {
    let n = dof_num.n_total;
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = input.materials.values().map(|m| (m.id, m)).collect();
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();

    for ss in input.solid_shells.values() {
        let mat = mat_by_id[&ss.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;

        let mut coords = [[0.0f64; 3]; 8];
        for (i, &nid) in ss.nodes.iter().enumerate() {
            let nd = node_by_id[&nid];
            coords[i] = [nd.x, nd.y, nd.z];
        }

        let ss_dofs = dof_num.solid_shell_element_dofs(&ss.nodes);
        let u_elem: Vec<f64> = ss_dofs.iter().map(|&d| u[d]).collect();

        // Compute average stress at centroid
        let stress = crate::element::solid_shell::solid_shell_avg_stress(&coords, &u_elem, e, nu);

        // Build geometric stiffness
        let kg_elem = crate::element::solid_shell::solid_shell_geometric_stiffness(&coords, &stress);

        let ndof = ss_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_g[ss_dofs[i] * n + ss_dofs[j]] += kg_elem[i * ndof + j];
            }
        }
    }
}

/// Add curved shell geometric stiffness to a pre-built Kg matrix.
pub fn add_curved_shell_geometric_stiffness_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    k_g: &mut [f64],
) {
    let n = dof_num.n_total;
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = input.materials.values().map(|m| (m.id, m)).collect();
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();

    for cs in input.curved_shells.values() {
        let mat = mat_by_id[&cs.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;

        let mut coords = [[0.0; 3]; 4];
        for (i, &nid) in cs.nodes.iter().enumerate() {
            let n = node_by_id[&nid];
            coords[i] = [n.x, n.y, n.z];
        }
        let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));

        let cs_dofs = dof_num.quad_element_dofs(&cs.nodes);
        let u_elem: Vec<f64> = cs_dofs.iter().map(|&d| u[d]).collect();
        let mut u_arr = [0.0; 24];
        u_arr.copy_from_slice(&u_elem);

        let s = crate::element::curved_shell::curved_shell_stresses(&coords, &dirs, &u_arr, e, nu, cs.thickness);
        let nxx = s.sigma_xx * cs.thickness;
        let nyy = s.sigma_yy * cs.thickness;
        let nxy = s.tau_xy * cs.thickness;

        let kg_elem = crate::element::curved_shell::curved_shell_geometric_stiffness(&coords, &dirs, cs.thickness, nxx, nyy, nxy);

        let ndof = cs_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_g[cs_dofs[i] * n + cs_dofs[j]] += kg_elem[i * ndof + j];
            }
        }
    }
}

/// Add 3D geometric stiffness from current displacements.
pub fn add_geometric_stiffness_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    k_global: &mut [f64],
) {
    let n = dof_num.n_total;
    let left_hand = input.left_hand.unwrap_or(false);
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = input.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection3D> = input.sections.values().map(|s| (s.id, s)).collect();

    for elem in input.elements.values() {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        let e = mat.e * 1000.0;

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let dir = [dx / l, dy / l, dz / l];
            let ui: Vec<f64> = (0..3).map(|i| dof_num.global_dof(elem.node_i, i).map(|d| u[d]).unwrap_or(0.0)).collect();
            let uj: Vec<f64> = (0..3).map(|i| dof_num.global_dof(elem.node_j, i).map(|d| u[d]).unwrap_or(0.0)).collect();
            let delta: f64 = (0..3).map(|i| (uj[i] - ui[i]) * dir[i]).sum();
            let axial_force = e * sec.a / l * delta;
            let p_over_l = axial_force / l;

            let mut kg_local = [0.0; 36];
            for i in 0..3 {
                for j in 0..3 {
                    let g = if i == j { 1.0 } else { 0.0 } - dir[i] * dir[j];
                    let val = p_over_l * g;
                    kg_local[i * 6 + j] = val;
                    kg_local[(i+3) * 6 + (j+3)] = val;
                    kg_local[i * 6 + (j+3)] = -val;
                    kg_local[(i+3) * 6 + j] = -val;
                }
            }
            let truss_dofs: Vec<usize> = (0..3).map(|i| dof_num.global_dof(elem.node_i, i).unwrap())
                .chain((0..3).map(|i| dof_num.global_dof(elem.node_j, i).unwrap()))
                .collect();
            for i in 0..6 {
                for j in 0..6 {
                    k_global[truss_dofs[i] * n + truss_dofs[j]] += kg_local[i * 6 + j];
                }
            }
        } else {
            let (ex, ey, ez) = crate::element::compute_local_axes_3d(
                node_i.x, node_i.y, node_i.z,
                node_j.x, node_j.y, node_j.z,
                elem.local_yx, elem.local_yy, elem.local_yz,
                elem.roll_angle, left_hand,
            );
            let t = crate::element::frame_transform_3d(&ex, &ey, &ez);
            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);

            // Extract displacements using 12-DOF mapping (skip warping DOFs if present)
            let u_12: Vec<f64> = if dof_num.dofs_per_node >= 7 {
                DOF_MAP_12_TO_14.iter().map(|&i| u[elem_dofs[i]]).collect()
            } else {
                elem_dofs.iter().map(|&d| u[d]).collect()
            };
            let u_local = transform_displacement(&u_12, &t, 12);

            // Axial force from local displacements
            let axial_force = e * sec.a / l * (u_local[6] - u_local[0]);

            let p = axial_force;
            let coeff = p / (30.0 * l);

            let mut kg_local = vec![0.0; 144];
            let yz = [(1,1,36.0), (1,5,3.0*l), (1,7,-36.0), (1,11,3.0*l),
                       (5,1,3.0*l), (5,5,4.0*l*l), (5,7,-3.0*l), (5,11,-l*l),
                       (7,1,-36.0), (7,5,-3.0*l), (7,7,36.0), (7,11,-3.0*l),
                       (11,1,3.0*l), (11,5,-l*l), (11,7,-3.0*l), (11,11,4.0*l*l)];
            for &(r, c, val) in &yz { kg_local[r * 12 + c] = val * coeff; }

            let xz = [(2,2,36.0), (2,4,-3.0*l), (2,8,-36.0), (2,10,-3.0*l),
                       (4,2,-3.0*l), (4,4,4.0*l*l), (4,8,3.0*l), (4,10,-l*l),
                       (8,2,-36.0), (8,4,3.0*l), (8,8,36.0), (8,10,3.0*l),
                       (10,2,-3.0*l), (10,4,-l*l), (10,8,3.0*l), (10,10,4.0*l*l)];
            for &(r, c, val) in &xz { kg_local[r * 12 + c] = val * coeff; }

            let kg_global = transform_stiffness(&kg_local, &t, 12);

            // Scatter into global K using proper DOF mapping
            if dof_num.dofs_per_node >= 7 {
                for i in 0..12 {
                    for j in 0..12 {
                        let gi = elem_dofs[DOF_MAP_12_TO_14[i]];
                        let gj = elem_dofs[DOF_MAP_12_TO_14[j]];
                        k_global[gi * n + gj] += kg_global[i * 12 + j];
                    }
                }
            } else {
                let ndof = elem_dofs.len();
                for i in 0..ndof {
                    for j in 0..ndof {
                        k_global[elem_dofs[i] * n + elem_dofs[j]] += kg_global[i * ndof + j];
                    }
                }
            }
        }
    }
}
