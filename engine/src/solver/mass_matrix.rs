use crate::types::*;
use crate::linalg::*;
use std::collections::HashMap;
use super::dof::DofNumbering;

/// Assemble consistent mass matrix for 2D structure.
/// densities: materialId → density in kg/m³
pub fn assemble_mass_matrix_2d(
    input: &SolverInput,
    dof_num: &DofNumbering,
    densities: &HashMap<String, f64>,
) -> Vec<f64> {
    let n = dof_num.n_total;
    let mut m_global = vec![0.0; n * n];

    let node_by_id: HashMap<usize, &SolverNode> = input.nodes.values().map(|n| (n.id, n)).collect();
    let section_by_id: HashMap<usize, &SolverSection> = input.sections.values().map(|s| (s.id, s)).collect();

    for elem in input.elements.values() {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let sec = section_by_id[&elem.section_id];

        let density = densities.get(&elem.material_id.to_string()).copied().unwrap_or(0.0);
        if density <= 0.0 {
            continue;
        }

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;

        // rho*A in consistent units: density is kg/m³, A is m²
        // Mass = rho*A*L in kg. Convert to kN·s²/m (tonnes): divide by 1000
        let rho_a = density * sec.a / 1000.0; // tonnes/m

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            // Consistent truss mass: rhoAL/6 * [[2,1],[1,2]] per direction
            let m_local = truss_consistent_mass(rho_a, l);
            let truss_dofs = [
                dof_num.global_dof(elem.node_i, 0).unwrap(),
                dof_num.global_dof(elem.node_i, 1).unwrap(),
                dof_num.global_dof(elem.node_j, 0).unwrap(),
                dof_num.global_dof(elem.node_j, 1).unwrap(),
            ];
            for i in 0..4 {
                for j in 0..4 {
                    m_global[truss_dofs[i] * n + truss_dofs[j]] += m_local[i * 4 + j];
                }
            }
        } else {
            let m_local = frame_consistent_mass(rho_a, l, elem.hinge_start, elem.hinge_end);
            let t = crate::element::frame_transform_2d(cos, sin);
            let m_glob = transform_stiffness(&m_local, &t, 6);

            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let ndof = elem_dofs.len();
            for i in 0..ndof {
                for j in 0..ndof {
                    m_global[elem_dofs[i] * n + elem_dofs[j]] += m_glob[i * ndof + j];
                }
            }
        }
    }

    m_global
}

/// Consistent mass matrix for 2D frame element (6×6 local).
/// rho_a: mass per unit length (tonnes/m = kN·s²/m²)
fn frame_consistent_mass(rho_a: f64, l: f64, hinge_start: bool, hinge_end: bool) -> Vec<f64> {
    let m = rho_a * l / 420.0;
    let mut mat = vec![0.0; 36];

    if !hinge_start && !hinge_end {
        // Standard consistent mass (no hinges)
        // Axial: [140, 0, 0, 70, 0, 0; ...]
        mat[0 * 6 + 0] = 140.0 * m;
        mat[0 * 6 + 3] = 70.0 * m;
        mat[3 * 6 + 0] = 70.0 * m;
        mat[3 * 6 + 3] = 140.0 * m;

        // Transverse:
        mat[1 * 6 + 1] = 156.0 * m;
        mat[1 * 6 + 2] = 22.0 * l * m;
        mat[1 * 6 + 4] = 54.0 * m;
        mat[1 * 6 + 5] = -13.0 * l * m;

        mat[2 * 6 + 1] = 22.0 * l * m;
        mat[2 * 6 + 2] = 4.0 * l * l * m;
        mat[2 * 6 + 4] = 13.0 * l * m;
        mat[2 * 6 + 5] = -3.0 * l * l * m;

        mat[4 * 6 + 1] = 54.0 * m;
        mat[4 * 6 + 2] = 13.0 * l * m;
        mat[4 * 6 + 4] = 156.0 * m;
        mat[4 * 6 + 5] = -22.0 * l * m;

        mat[5 * 6 + 1] = -13.0 * l * m;
        mat[5 * 6 + 2] = -3.0 * l * l * m;
        mat[5 * 6 + 4] = -22.0 * l * m;
        mat[5 * 6 + 5] = 4.0 * l * l * m;
    } else {
        // Simplified: lumped mass for hinged elements
        let total_mass = rho_a * l;
        let half = total_mass / 2.0;
        mat[0 * 6 + 0] = half;
        mat[1 * 6 + 1] = half;
        mat[3 * 6 + 3] = half;
        mat[4 * 6 + 4] = half;
    }

    mat
}

/// Consistent mass matrix for 2D truss element (4×4 global).
fn truss_consistent_mass(rho_a: f64, l: f64) -> [f64; 16] {
    let m = rho_a * l / 6.0;
    let mut mat = [0.0; 16];
    // [[2,0,1,0],[0,2,0,1],[1,0,2,0],[0,1,0,2]] * m
    mat[0 * 4 + 0] = 2.0 * m;
    mat[0 * 4 + 2] = 1.0 * m;
    mat[1 * 4 + 1] = 2.0 * m;
    mat[1 * 4 + 3] = 1.0 * m;
    mat[2 * 4 + 0] = 1.0 * m;
    mat[2 * 4 + 2] = 2.0 * m;
    mat[3 * 4 + 1] = 1.0 * m;
    mat[3 * 4 + 3] = 2.0 * m;
    mat
}

/// Assemble consistent mass matrix for 3D structure.
pub fn assemble_mass_matrix_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    densities: &HashMap<String, f64>,
) -> Vec<f64> {
    let n = dof_num.n_total;
    let mut m_global = vec![0.0; n * n];
    let left_hand = input.left_hand.unwrap_or(false);

    let node_by_id: HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();
    let section_by_id: HashMap<usize, &SolverSection3D> = input.sections.values().map(|s| (s.id, s)).collect();

    /// Maps 12-DOF element indices to 14-DOF positions, skipping warping DOFs 6 and 13.
    const DOF_MAP_12_TO_14: [usize; 12] = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];

    for elem in input.elements.values() {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let sec = section_by_id[&elem.section_id];

        let density = densities.get(&elem.material_id.to_string()).copied().unwrap_or(0.0);
        if density <= 0.0 { continue; }

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        let rho_a = density * sec.a / 1000.0; // tonnes/m

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            // 3D truss: M = ρAL/6 * [[2I₃, I₃],[I₃, 2I₃]]
            let m = rho_a * l / 6.0;
            let truss_dofs: Vec<usize> = (0..3).map(|i| dof_num.global_dof(elem.node_i, i).unwrap())
                .chain((0..3).map(|i| dof_num.global_dof(elem.node_j, i).unwrap()))
                .collect();
            for i in 0..3 {
                m_global[truss_dofs[i] * n + truss_dofs[i]] += 2.0 * m;
                m_global[truss_dofs[i+3] * n + truss_dofs[i+3]] += 2.0 * m;
                m_global[truss_dofs[i] * n + truss_dofs[i+3]] += m;
                m_global[truss_dofs[i+3] * n + truss_dofs[i]] += m;
            }
        } else {
            let m_local = frame_consistent_mass_3d(rho_a, sec.a, sec.iy, sec.iz, l,
                elem.hinge_start, elem.hinge_end);

            let (ex, ey, ez) = crate::element::compute_local_axes_3d(
                node_i.x, node_i.y, node_i.z,
                node_j.x, node_j.y, node_j.z,
                elem.local_yx, elem.local_yy, elem.local_yz,
                elem.roll_angle, left_hand,
            );

            if dof_num.dofs_per_node >= 7 {
                // Warping model: embed 12×12 mass into 14-DOF space
                let t = crate::element::frame_transform_3d(&ex, &ey, &ez);
                let m_glob = transform_stiffness(&m_local, &t, 12);
                let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);

                for i in 0..12 {
                    for j in 0..12 {
                        let gi = elem_dofs[DOF_MAP_12_TO_14[i]];
                        let gj = elem_dofs[DOF_MAP_12_TO_14[j]];
                        m_global[gi * n + gj] += m_glob[i * 12 + j];
                    }
                }

                // Warping mass: lumped polar mass moment at warping DOFs.
                // For thin-walled open sections, warping inertia ≈ ρ*(Iy+Iz)*L/2 per node.
                // This is approximate but includes warping participation in modal analysis.
                if let Some(cw) = sec.cw {
                    if cw > 0.0 {
                        let ip = sec.iy + sec.iz; // polar second moment (approx)
                        let m_warp = density * ip * l / (2.0 * 1000.0); // tonnes·m
                        let w_dof_i = elem_dofs[6];   // warping DOF node I
                        let w_dof_j = elem_dofs[13];  // warping DOF node J
                        m_global[w_dof_i * n + w_dof_i] += m_warp;
                        m_global[w_dof_j * n + w_dof_j] += m_warp;
                    }
                }
            } else {
                let t = crate::element::frame_transform_3d(&ex, &ey, &ez);
                let m_glob = transform_stiffness(&m_local, &t, 12);

                let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
                let ndof = elem_dofs.len();
                for i in 0..ndof {
                    for j in 0..ndof {
                        m_global[elem_dofs[i] * n + elem_dofs[j]] += m_glob[i * ndof + j];
                    }
                }
            }
        }
    }

    // Assemble plate element masses
    for plate in input.plates.values() {
        let density = densities.get(&plate.material_id.to_string()).copied().unwrap_or(0.0);
        if density <= 0.0 { continue; }

        let node_1 = node_by_id[&plate.nodes[0]];
        let node_2 = node_by_id[&plate.nodes[1]];
        let node_3 = node_by_id[&plate.nodes[2]];

        let coords = [
            [node_1.x, node_1.y, node_1.z],
            [node_2.x, node_2.y, node_2.z],
            [node_3.x, node_3.y, node_3.z],
        ];

        // density is in kg/m³, divide by 1000 to get tonnes/m³ (consistent with kN units)
        let m_local = crate::element::plate::plate_consistent_mass(&coords, density / 1000.0, plate.thickness);

        // Plate mass is lumped (diagonal), no rotation needed — assemble directly
        let mut plate_dofs = Vec::with_capacity(18);
        for &node_id in &plate.nodes {
            for dof_idx in 0..6 {
                plate_dofs.push(dof_num.global_dof(node_id, dof_idx).unwrap());
            }
        }

        for i in 0..18 {
            for j in 0..18 {
                let val = m_local[i * 18 + j];
                if val.abs() > 1e-30 {
                    m_global[plate_dofs[i] * n + plate_dofs[j]] += val;
                }
            }
        }
    }

    // Assemble quad (MITC4 shell) element masses
    for quad in input.quads.values() {
        let density = densities.get(&quad.material_id.to_string()).copied().unwrap_or(0.0);
        if density <= 0.0 { continue; }

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

        // density is in kg/m³, divide by 1000 to get tonnes/m³ (consistent with kN units)
        let m_local = crate::element::quad::quad_consistent_mass(&coords, density / 1000.0, quad.thickness);

        let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
        for i in 0..24 {
            for j in 0..24 {
                let val = m_local[i * 24 + j];
                if val.abs() > 1e-30 {
                    m_global[quad_dofs[i] * n + quad_dofs[j]] += val;
                }
            }
        }
    }

    // Assemble quad9 (MITC9 shell) element masses
    for quad9 in input.quad9s.values() {
        let density = densities.get(&quad9.material_id.to_string()).copied().unwrap_or(0.0);
        if density <= 0.0 { continue; }

        let mut coords = [[0.0f64; 3]; 9];
        for (i, &nid) in quad9.nodes.iter().enumerate() {
            let nd = node_by_id[&nid];
            coords[i] = [nd.x, nd.y, nd.z];
        }

        let m_local = crate::element::quad9::quad9_consistent_mass(&coords, density / 1000.0, quad9.thickness);

        let q9_dofs = dof_num.quad9_element_dofs(&quad9.nodes);
        for i in 0..54 {
            for j in 0..54 {
                let val = m_local[i * 54 + j];
                if val.abs() > 1e-30 {
                    m_global[q9_dofs[i] * n + q9_dofs[j]] += val;
                }
            }
        }
    }

    // Assemble solid-shell element masses
    for ss in input.solid_shells.values() {
        let density = densities.get(&ss.material_id.to_string()).copied().unwrap_or(0.0);
        if density <= 0.0 { continue; }

        let mut coords = [[0.0f64; 3]; 8];
        for (i, &nid) in ss.nodes.iter().enumerate() {
            let nd = node_by_id[&nid];
            coords[i] = [nd.x, nd.y, nd.z];
        }

        // density is in kg/m³, divide by 1000 to get tonnes/m³ (consistent with kN units)
        let m_local = crate::element::solid_shell::solid_shell_consistent_mass(&coords, density / 1000.0);

        let ss_dofs = dof_num.solid_shell_element_dofs(&ss.nodes);
        for i in 0..24 {
            for j in 0..24 {
                let val = m_local[i * 24 + j];
                if val.abs() > 1e-30 {
                    m_global[ss_dofs[i] * n + ss_dofs[j]] += val;
                }
            }
        }
    }

    // Assemble curved shell element masses
    for cs in input.curved_shells.values() {
        let density = densities.get(&cs.material_id.to_string()).copied().unwrap_or(0.0);
        if density <= 0.0 { continue; }

        let mut coords = [[0.0f64; 3]; 4];
        for (i, &nid) in cs.nodes.iter().enumerate() {
            let nd = node_by_id[&nid];
            coords[i] = [nd.x, nd.y, nd.z];
        }
        let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));

        let m_local = crate::element::curved_shell::curved_shell_consistent_mass(&coords, &dirs, density / 1000.0, cs.thickness);

        let cs_dofs = dof_num.quad_element_dofs(&cs.nodes);
        for i in 0..24 {
            for j in 0..24 {
                let val = m_local[i * 24 + j];
                if val.abs() > 1e-30 {
                    m_global[cs_dofs[i] * n + cs_dofs[j]] += val;
                }
            }
        }
    }

    m_global
}

/// Consistent mass matrix for 3D frame element (12×12 local).
fn frame_consistent_mass_3d(rho_a: f64, a: f64, iy: f64, iz: f64, l: f64,
    hinge_start: bool, hinge_end: bool) -> Vec<f64> {
    let mut mat = vec![0.0; 144];

    if hinge_start || hinge_end {
        // Lumped mass for hinged elements
        let half = rho_a * l / 2.0;
        for i in 0..3 { // Translational DOFs only
            mat[i * 12 + i] = half;
            mat[(i + 6) * 12 + (i + 6)] = half;
        }
        return mat;
    }

    let m = rho_a * l / 420.0;

    // Axial (DOFs 0, 6)
    mat[0 * 12 + 0] = 140.0 * m;
    mat[0 * 12 + 6] = 70.0 * m;
    mat[6 * 12 + 0] = 70.0 * m;
    mat[6 * 12 + 6] = 140.0 * m;

    // Torsional rotary inertia (DOFs 3, 9): ρ·Ip·L/6 × [[2,1],[1,2]]
    // Ip ≈ Iy + Iz (polar moment approximation)
    let rho_ip = rho_a * (iy + iz) / a;
    let m_tor = rho_ip * l / 6.0;
    mat[3 * 12 + 3] = 2.0 * m_tor;
    mat[3 * 12 + 9] = m_tor;
    mat[9 * 12 + 3] = m_tor;
    mat[9 * 12 + 9] = 2.0 * m_tor;

    // Y-Z bending (DOFs 1, 5, 7, 11) — same as 2D transverse
    mat[1 * 12 + 1] = 156.0 * m;
    mat[1 * 12 + 5] = 22.0 * l * m;
    mat[1 * 12 + 7] = 54.0 * m;
    mat[1 * 12 + 11] = -13.0 * l * m;

    mat[5 * 12 + 1] = 22.0 * l * m;
    mat[5 * 12 + 5] = 4.0 * l * l * m;
    mat[5 * 12 + 7] = 13.0 * l * m;
    mat[5 * 12 + 11] = -3.0 * l * l * m;

    mat[7 * 12 + 1] = 54.0 * m;
    mat[7 * 12 + 5] = 13.0 * l * m;
    mat[7 * 12 + 7] = 156.0 * m;
    mat[7 * 12 + 11] = -22.0 * l * m;

    mat[11 * 12 + 1] = -13.0 * l * m;
    mat[11 * 12 + 5] = -3.0 * l * l * m;
    mat[11 * 12 + 7] = -22.0 * l * m;
    mat[11 * 12 + 11] = 4.0 * l * l * m;

    // X-Z bending (DOFs 2, 4, 8, 10) — same pattern, sign flip on θy coupling
    mat[2 * 12 + 2] = 156.0 * m;
    mat[2 * 12 + 4] = -22.0 * l * m;
    mat[2 * 12 + 8] = 54.0 * m;
    mat[2 * 12 + 10] = 13.0 * l * m;

    mat[4 * 12 + 2] = -22.0 * l * m;
    mat[4 * 12 + 4] = 4.0 * l * l * m;
    mat[4 * 12 + 8] = -13.0 * l * m;
    mat[4 * 12 + 10] = -3.0 * l * l * m;

    mat[8 * 12 + 2] = 54.0 * m;
    mat[8 * 12 + 4] = -13.0 * l * m;
    mat[8 * 12 + 8] = 156.0 * m;
    mat[8 * 12 + 10] = 22.0 * l * m;

    mat[10 * 12 + 2] = 13.0 * l * m;
    mat[10 * 12 + 4] = -3.0 * l * l * m;
    mat[10 * 12 + 8] = 22.0 * l * m;
    mat[10 * 12 + 10] = 4.0 * l * l * m;

    mat
}

/// Compute total mass of 3D structure (in tonnes = kN·s²/m).
pub fn compute_total_mass_3d(
    input: &SolverInput3D,
    densities: &HashMap<String, f64>,
) -> f64 {
    let node_by_id: HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();
    let section_by_id: HashMap<usize, &SolverSection3D> = input.sections.values().map(|s| (s.id, s)).collect();

    let mut total = 0.0;
    for elem in input.elements.values() {
        let sec = section_by_id[&elem.section_id];
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let density = densities.get(&elem.material_id.to_string()).copied().unwrap_or(0.0);
        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        total += density * sec.a * l / 1000.0;
    }

    // Add plate masses
    for plate in input.plates.values() {
        let density = densities.get(&plate.material_id.to_string()).copied().unwrap_or(0.0);
        if density <= 0.0 { continue; }

        let node_1 = node_by_id[&plate.nodes[0]];
        let node_2 = node_by_id[&plate.nodes[1]];
        let node_3 = node_by_id[&plate.nodes[2]];

        let v1 = [node_2.x - node_1.x, node_2.y - node_1.y, node_2.z - node_1.z];
        let v2 = [node_3.x - node_1.x, node_3.y - node_1.y, node_3.z - node_1.z];
        let cross = [
            v1[1] * v2[2] - v1[2] * v2[1],
            v1[2] * v2[0] - v1[0] * v2[2],
            v1[0] * v2[1] - v1[1] * v2[0],
        ];
        let area = (cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]).sqrt() / 2.0;
        total += density * area * plate.thickness / 1000.0;
    }

    // Add quad (MITC4 shell) element masses
    for quad in input.quads.values() {
        let density = densities.get(&quad.material_id.to_string()).copied().unwrap_or(0.0);
        if density <= 0.0 { continue; }

        let n0 = node_by_id[&quad.nodes[0]];
        let n1 = node_by_id[&quad.nodes[1]];
        let n2 = node_by_id[&quad.nodes[2]];
        let n3 = node_by_id[&quad.nodes[3]];

        // Approximate quad area using two triangles (diagonal split)
        let tri1_v1 = [n1.x - n0.x, n1.y - n0.y, n1.z - n0.z];
        let tri1_v2 = [n3.x - n0.x, n3.y - n0.y, n3.z - n0.z];
        let c1 = [
            tri1_v1[1] * tri1_v2[2] - tri1_v1[2] * tri1_v2[1],
            tri1_v1[2] * tri1_v2[0] - tri1_v1[0] * tri1_v2[2],
            tri1_v1[0] * tri1_v2[1] - tri1_v1[1] * tri1_v2[0],
        ];
        let a1 = (c1[0] * c1[0] + c1[1] * c1[1] + c1[2] * c1[2]).sqrt() / 2.0;

        let tri2_v1 = [n1.x - n2.x, n1.y - n2.y, n1.z - n2.z];
        let tri2_v2 = [n3.x - n2.x, n3.y - n2.y, n3.z - n2.z];
        let c2 = [
            tri2_v1[1] * tri2_v2[2] - tri2_v1[2] * tri2_v2[1],
            tri2_v1[2] * tri2_v2[0] - tri2_v1[0] * tri2_v2[2],
            tri2_v1[0] * tri2_v2[1] - tri2_v1[1] * tri2_v2[0],
        ];
        let a2 = (c2[0] * c2[0] + c2[1] * c2[1] + c2[2] * c2[2]).sqrt() / 2.0;

        total += density * (a1 + a2) * quad.thickness / 1000.0;
    }

    // Add quad9 (MITC9 shell) element masses
    for quad9 in input.quad9s.values() {
        let density = densities.get(&quad9.material_id.to_string()).copied().unwrap_or(0.0);
        if density <= 0.0 { continue; }

        let n0 = node_by_id[&quad9.nodes[0]];
        let n1 = node_by_id[&quad9.nodes[1]];
        let n2 = node_by_id[&quad9.nodes[2]];
        let n3 = node_by_id[&quad9.nodes[3]];

        let tri1_v1 = [n1.x - n0.x, n1.y - n0.y, n1.z - n0.z];
        let tri1_v2 = [n3.x - n0.x, n3.y - n0.y, n3.z - n0.z];
        let c1 = [
            tri1_v1[1] * tri1_v2[2] - tri1_v1[2] * tri1_v2[1],
            tri1_v1[2] * tri1_v2[0] - tri1_v1[0] * tri1_v2[2],
            tri1_v1[0] * tri1_v2[1] - tri1_v1[1] * tri1_v2[0],
        ];
        let a1 = (c1[0] * c1[0] + c1[1] * c1[1] + c1[2] * c1[2]).sqrt() / 2.0;

        let tri2_v1 = [n1.x - n2.x, n1.y - n2.y, n1.z - n2.z];
        let tri2_v2 = [n3.x - n2.x, n3.y - n2.y, n3.z - n2.z];
        let c2 = [
            tri2_v1[1] * tri2_v2[2] - tri2_v1[2] * tri2_v2[1],
            tri2_v1[2] * tri2_v2[0] - tri2_v1[0] * tri2_v2[2],
            tri2_v1[0] * tri2_v2[1] - tri2_v1[1] * tri2_v2[0],
        ];
        let a2 = (c2[0] * c2[0] + c2[1] * c2[1] + c2[2] * c2[2]).sqrt() / 2.0;

        total += density * (a1 + a2) * quad9.thickness / 1000.0;
    }

    // Add solid-shell element masses (volumetric — no thickness field)
    for ss in input.solid_shells.values() {
        let density = densities.get(&ss.material_id.to_string()).copied().unwrap_or(0.0);
        if density <= 0.0 { continue; }

        let mut coords = [[0.0f64; 3]; 8];
        for (i, &nid) in ss.nodes.iter().enumerate() {
            let nd = node_by_id[&nid];
            coords[i] = [nd.x, nd.y, nd.z];
        }
        let vol = crate::element::solid_shell::solid_shell_volume(&coords);
        total += density * vol / 1000.0;
    }

    // Add curved shell element masses
    for cs in input.curved_shells.values() {
        let density = densities.get(&cs.material_id.to_string()).copied().unwrap_or(0.0);
        if density <= 0.0 { continue; }

        let n0 = node_by_id[&cs.nodes[0]];
        let n1 = node_by_id[&cs.nodes[1]];
        let n2 = node_by_id[&cs.nodes[2]];
        let n3 = node_by_id[&cs.nodes[3]];

        let tri1_v1 = [n1.x - n0.x, n1.y - n0.y, n1.z - n0.z];
        let tri1_v2 = [n3.x - n0.x, n3.y - n0.y, n3.z - n0.z];
        let c1 = [
            tri1_v1[1] * tri1_v2[2] - tri1_v1[2] * tri1_v2[1],
            tri1_v1[2] * tri1_v2[0] - tri1_v1[0] * tri1_v2[2],
            tri1_v1[0] * tri1_v2[1] - tri1_v1[1] * tri1_v2[0],
        ];
        let a1 = (c1[0] * c1[0] + c1[1] * c1[1] + c1[2] * c1[2]).sqrt() / 2.0;

        let tri2_v1 = [n1.x - n2.x, n1.y - n2.y, n1.z - n2.z];
        let tri2_v2 = [n3.x - n2.x, n3.y - n2.y, n3.z - n2.z];
        let c2 = [
            tri2_v1[1] * tri2_v2[2] - tri2_v1[2] * tri2_v2[1],
            tri2_v1[2] * tri2_v2[0] - tri2_v1[0] * tri2_v2[2],
            tri2_v1[0] * tri2_v2[1] - tri2_v1[1] * tri2_v2[0],
        ];
        let a2 = (c2[0] * c2[0] + c2[1] * c2[1] + c2[2] * c2[2]).sqrt() / 2.0;

        total += density * (a1 + a2) * cs.thickness / 1000.0;
    }

    total
}

/// Compute total mass of structure (in tonnes = kN·s²/m).
pub fn compute_total_mass(
    input: &SolverInput,
    densities: &HashMap<String, f64>,
) -> f64 {
    let node_by_id: HashMap<usize, &SolverNode> = input.nodes.values().map(|n| (n.id, n)).collect();
    let section_by_id: HashMap<usize, &SolverSection> = input.sections.values().map(|s| (s.id, s)).collect();

    let mut total = 0.0;
    for elem in input.elements.values() {
        let sec = section_by_id[&elem.section_id];
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let density = densities.get(&elem.material_id.to_string()).copied().unwrap_or(0.0);
        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let l = (dx * dx + dy * dy).sqrt();
        total += density * sec.a * l / 1000.0; // tonnes
    }
    total
}
