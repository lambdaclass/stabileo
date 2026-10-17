/// Connector elements: zero-length or finite-length spring/dashpot between two nodes.
///
/// Assembles into global K as a 2-node element with user-specified stiffness
/// along each DOF direction. Useful for modeling bearings, isolators, gaps, etc.

use crate::types::{ConnectorElement, SolverInput, SolverInput3D, SolverNode, SolverNode3D};
use crate::solver::dof::DofNumbering;
use std::collections::HashMap;

/// Build the 2D connector element stiffness matrix (6×6 for frame-DOF nodes).
///
/// The connector acts along the line between nodes i and j. If the nodes
/// coincide (zero-length), it acts in the global coordinate system.
///
/// Stiffness values:
///   k_axial  — along the connector axis
///   k_shear  — perpendicular to axis (in-plane)
///   k_moment — rotational spring about Z
pub fn connector_stiffness_2d(
    k_axial: f64,
    k_shear: f64,
    k_moment: f64,
    cos: f64,
    sin: f64,
) -> [f64; 36] {
    // Local stiffness: spring between DOFs of nodes i and j.
    // k_local = [ K_ii  -K_ii ]
    //           [-K_ii   K_ii ]
    // where K_ii = diag(k_axial, k_shear, k_moment) in local coords.
    //
    // Transform to global: K_global = T^T * K_local * T

    let c = cos;
    let s = sin;

    // Stiffness components in global coords
    let kxx = k_axial * c * c + k_shear * s * s;
    let kyy = k_axial * s * s + k_shear * c * c;
    let kxy = (k_axial - k_shear) * c * s;
    let krz = k_moment;

    // 6×6 matrix: [node_i(ux,uy,rz), node_j(ux,uy,rz)]
    let mut k = [0.0; 36];

    // K_ii block (top-left 3×3)
    k[0 * 6 + 0] = kxx;
    k[0 * 6 + 1] = kxy;
    k[1 * 6 + 0] = kxy;
    k[1 * 6 + 1] = kyy;
    k[2 * 6 + 2] = krz;

    // K_jj block (bottom-right 3×3) — same as K_ii
    k[3 * 6 + 3] = kxx;
    k[3 * 6 + 4] = kxy;
    k[4 * 6 + 3] = kxy;
    k[4 * 6 + 4] = kyy;
    k[5 * 6 + 5] = krz;

    // K_ij and K_ji blocks (off-diagonal, negative)
    k[0 * 6 + 3] = -kxx;
    k[0 * 6 + 4] = -kxy;
    k[1 * 6 + 3] = -kxy;
    k[1 * 6 + 4] = -kyy;
    k[2 * 6 + 5] = -krz;

    k[3 * 6 + 0] = -kxx;
    k[3 * 6 + 1] = -kxy;
    k[4 * 6 + 0] = -kxy;
    k[4 * 6 + 1] = -kyy;
    k[5 * 6 + 2] = -krz;

    k
}

/// Build the 3D connector element stiffness matrix (12×12 for 6-DOF nodes).
pub fn connector_stiffness_3d(
    k_axial: f64,
    k_shear_y: f64,
    k_shear_z: f64,
    k_torsion: f64,
    k_bend_y: f64,
    k_bend_z: f64,
    dir: [f64; 3],  // unit direction from node_i to node_j (or [1,0,0] for zero-length)
) -> [f64; 144] {
    // Build local-to-global rotation from direction vector
    // Local x = dir, local y and z are perpendicular
    let (lx, ly, lz) = (dir[0], dir[1], dir[2]);

    // Choose a reference vector not parallel to dir
    let ref_vec = if lx.abs() < 0.9 { [1.0, 0.0, 0.0] } else { [0.0, 1.0, 0.0] };

    // local_y = ref × dir (normalized)
    let mut yy = [
        ref_vec[1] * lz - ref_vec[2] * ly,
        ref_vec[2] * lx - ref_vec[0] * lz,
        ref_vec[0] * ly - ref_vec[1] * lx,
    ];
    let yn = (yy[0] * yy[0] + yy[1] * yy[1] + yy[2] * yy[2]).sqrt();
    if yn > 1e-15 {
        yy[0] /= yn; yy[1] /= yn; yy[2] /= yn;
    }

    // local_z = dir × local_y
    let zz = [
        ly * yy[2] - lz * yy[1],
        lz * yy[0] - lx * yy[2],
        lx * yy[1] - ly * yy[0],
    ];

    // Rotation matrix R (3×3): rows are local x, y, z in global components
    let r = [
        [lx, ly, lz],
        [yy[0], yy[1], yy[2]],
        [zz[0], zz[1], zz[2]],
    ];

    // Local diagonal stiffness for one node: [k_axial, k_shear_y, k_shear_z, k_torsion, k_bend_y, k_bend_z]
    let kd = [k_axial, k_shear_y, k_shear_z, k_torsion, k_bend_y, k_bend_z];

    // Transform: K_global_block = R^T * diag(k) * R for translation and rotation blocks
    // Build 6×6 global block for node pair
    let mut kg = [[0.0f64; 6]; 6];

    // Translation block (3×3): R^T * diag(kd[0..3]) * R
    for i in 0..3 {
        for j in 0..3 {
            let mut s = 0.0;
            for p in 0..3 {
                s += r[p][i] * kd[p] * r[p][j];
            }
            kg[i][j] = s;
        }
    }

    // Rotation block (3×3): R^T * diag(kd[3..6]) * R
    for i in 0..3 {
        for j in 0..3 {
            let mut s = 0.0;
            for p in 0..3 {
                s += r[p][i] * kd[3 + p] * r[p][j];
            }
            kg[3 + i][3 + j] = s;
        }
    }

    // Assemble 12×12: [K_ii, -K_ii; -K_ii, K_ii]
    let mut k = [0.0; 144];
    for i in 0..6 {
        for j in 0..6 {
            let v = kg[i][j];
            k[i * 12 + j] = v;           // K_ii
            k[(6 + i) * 12 + (6 + j)] = v;  // K_jj
            k[i * 12 + (6 + j)] = -v;    // K_ij
            k[(6 + i) * 12 + j] = -v;    // K_ji
        }
    }

    k
}

/// Below this length a connector joins coincident nodes and acts in global axes.
pub const ZERO_LENGTH: f64 = 1e-15;

/// Global DOF of each local DOF of a connector (`per_node` per node: 3 in 2D,
/// 6 in 3D), `None` where the node has no such DOF.
///
/// The connector matrices used to be scattered through `element_dofs`, which
/// lists only the DOFs a node has: in an all-truss model (two DOFs per node in
/// 2D, three in 3D) or a 3D model with warping (seven) the matrix rows no
/// longer lined up with the DOFs, and a horizontal connector between two free
/// truss nodes pushed its far node vertically.
fn connector_dofs(dof_num: &DofNumbering, node_i: usize, node_j: usize, per_node: usize) -> Vec<Option<usize>> {
    (0..2 * per_node)
        .map(|a| {
            let node = if a < per_node { node_i } else { node_j };
            dof_num.map.get(&(node, a % per_node)).copied()
        })
        .collect()
}

fn entries(ke: &[f64], dofs: &[Option<usize>]) -> Vec<(usize, usize, f64)> {
    let m = dofs.len();
    let mut out = Vec::new();
    for a in 0..m {
        let Some(gi) = dofs[a] else { continue };
        for b in 0..m {
            let Some(gj) = dofs[b] else { continue };
            let v = ke[a * m + b];
            if v != 0.0 {
                out.push((gi, gj, v));
            }
        }
    }
    out
}

/// Chord of a 2D connector: (length, cos, sin), global x for a zero-length one.
fn chord_2d(ni: &SolverNode, nj: &SolverNode) -> (f64, f64, f64) {
    let (dx, dz) = (nj.x - ni.x, nj.z - ni.z);
    let l = (dx * dx + dz * dz).sqrt();
    if l > ZERO_LENGTH { (l, dx / l, dz / l) } else { (l, 1.0, 0.0) }
}

/// Chord of a 3D connector: (length, unit direction), global x for a zero-length one.
fn chord_3d(ni: &SolverNode3D, nj: &SolverNode3D) -> (f64, [f64; 3]) {
    let d = [nj.x - ni.x, nj.y - ni.y, nj.z - ni.z];
    let l = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
    if l > ZERO_LENGTH { (l, [d[0] / l, d[1] / l, d[2] / l]) } else { (l, [1.0, 0.0, 0.0]) }
}

/// Global stiffness entries (row, column, value) of every 2D connector, in id order.
pub fn connector_entries_2d(input: &SolverInput, dof_num: &DofNumbering) -> Vec<(usize, usize, f64)> {
    let nodes: HashMap<usize, &SolverNode> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mut conns: Vec<&ConnectorElement> = input.connectors.values().collect();
    conns.sort_by_key(|c| c.id);
    let mut out = Vec::new();
    for c in conns {
        let (Some(ni), Some(nj)) = (nodes.get(&c.node_i), nodes.get(&c.node_j)) else { continue };
        let (_, cos, sin) = chord_2d(ni, nj);
        let ke = connector_stiffness_2d(c.k_axial, c.k_shear, c.k_moment, cos, sin);
        out.extend(entries(&ke, &connector_dofs(dof_num, c.node_i, c.node_j, 3)));
    }
    out
}

/// Global stiffness entries (row, column, value) of every 3D connector, in id order.
pub fn connector_entries_3d(input: &SolverInput3D, dof_num: &DofNumbering) -> Vec<(usize, usize, f64)> {
    let nodes: HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mut conns: Vec<&ConnectorElement> = input.connectors.values().collect();
    conns.sort_by_key(|c| c.id);
    let mut out = Vec::new();
    for c in conns {
        let (Some(ni), Some(nj)) = (nodes.get(&c.node_i), nodes.get(&c.node_j)) else { continue };
        out.extend(one_connector_entries_3d(c, ni, nj, dof_num));
    }
    out
}

/// Global stiffness entries of one 3D connector between nodes `ni`, `nj`.
pub fn one_connector_entries_3d(c: &ConnectorElement, ni: &SolverNode3D, nj: &SolverNode3D, dof_num: &DofNumbering) -> Vec<(usize, usize, f64)> {
    let (_, dir) = chord_3d(ni, nj);
    let ke = connector_stiffness_3d(c.k_axial, c.k_shear, c.k_shear_z, c.k_moment, c.k_bend_y, c.k_bend_z, dir);
    entries(&ke, &connector_dofs(dof_num, c.node_i, c.node_j, 6))
}

/// Assemble 2D connector elements into an existing global stiffness matrix.
pub fn assemble_connectors_2d(input: &SolverInput, dof_num: &DofNumbering, k_global: &mut [f64], n: usize) {
    for (i, j, v) in connector_entries_2d(input, dof_num) {
        k_global[i * n + j] += v;
    }
}

/// Assemble 3D connector elements into an existing global stiffness matrix.
pub fn assemble_connectors_3d(input: &SolverInput3D, dof_num: &DofNumbering, k_global: &mut [f64], n: usize) {
    for (i, j, v) in connector_entries_3d(input, dof_num) {
        k_global[i * n + j] += v;
    }
}

// ==================== Large displacements ====================
//
// A zero-length connector is a set of springs in global axes between two
// coincident nodes: linear at any displacement. A finite-length connector's
// axial spring acts along the current chord, N = k·(L − L0), like a truss bar
// (with the string stiffness N/L across it), and in 2D its rotational spring
// acts on the relative rotation, which is exact in the plane. A shear spring
// across a finite-length connector has no large-displacement definition (the
// chord rotates with the nodes, so the shear direction is not fixed), and the
// linear connector does not balance the moment of its shear force over its
// length either; in 3D the rotational springs of a finite-length connector
// would need its frame to follow the nodes. Those are refused by name.

/// Refuse what a co-rotational analysis cannot follow through large displacements.
pub fn refuse_for_corotational_2d(input: &SolverInput, analysis: &str) -> Result<(), String> {
    let nodes: HashMap<usize, &SolverNode> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mut bad: Vec<usize> = input
        .connectors
        .values()
        .filter(|c| {
            let finite = match (nodes.get(&c.node_i), nodes.get(&c.node_j)) {
                (Some(a), Some(b)) => chord_2d(a, b).0 > ZERO_LENGTH,
                _ => false,
            };
            finite && c.k_shear != 0.0
        })
        .map(|c| c.id)
        .collect();
    bad.sort();
    if bad.is_empty() {
        return Ok(());
    }
    Err(format!(
        "{analysis} does not support the shear stiffness of a connector with length (connector {}): \
         across a chord that rotates it has no large-displacement definition. Use a zero-length \
         connector, or model the link with members.",
        bad.iter().map(|i| i.to_string()).collect::<Vec<_>>().join(", connector ")
    ))
}

/// 3D twin of [`refuse_for_corotational_2d`]: a connector with length may carry
/// only its axial stiffness.
pub fn refuse_for_corotational_3d(input: &SolverInput3D, analysis: &str) -> Result<(), String> {
    let nodes: HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mut bad: Vec<usize> = input
        .connectors
        .values()
        .filter(|c| {
            let finite = match (nodes.get(&c.node_i), nodes.get(&c.node_j)) {
                (Some(a), Some(b)) => chord_3d(a, b).0 > ZERO_LENGTH,
                _ => false,
            };
            finite && [c.k_shear, c.k_shear_z, c.k_moment, c.k_bend_y, c.k_bend_z].iter().any(|&k| k != 0.0)
        })
        .map(|c| c.id)
        .collect();
    bad.sort();
    if bad.is_empty() {
        return Ok(());
    }
    Err(format!(
        "{analysis} does not support shear, torsional or bending stiffness on a connector with \
         length (connector {}): its axes would have to follow the rotating nodes. Use a \
         zero-length connector or an axial-only one, or model the link with members.",
        bad.iter().map(|i| i.to_string()).collect::<Vec<_>>().join(", connector ")
    ))
}

/// Axial spring along the current chord between translational DOFs `ti`, `tj`
/// (`dim` each): internal force and tangent, as a co-rotational truss bar.
fn corotational_axial(
    k: f64,
    l0: f64,
    x0: &[f64],
    ti: &[usize],
    tj: &[usize],
    u: &[f64],
    f_int: &mut [f64],
    scatter: &mut impl FnMut(usize, usize, f64),
) {
    let dim = ti.len();
    let d: Vec<f64> = (0..dim).map(|m| x0[m] + u[tj[m]] - u[ti[m]]).collect();
    let l = d.iter().map(|v| v * v).sum::<f64>().sqrt();
    if l <= ZERO_LENGTH {
        return;
    }
    let e: Vec<f64> = d.iter().map(|v| v / l).collect();
    let du: Vec<f64> = (0..dim).map(|m| u[tj[m]] - u[ti[m]]).collect();
    let n = k * crate::solver::corotational::elongation(x0, &du, l0, l);
    let dofs: Vec<usize> = ti.iter().chain(tj.iter()).copied().collect();
    let r: Vec<f64> = (0..2 * dim).map(|a| if a < dim { -e[a] } else { e[a - dim] }).collect();
    for a in 0..2 * dim {
        f_int[dofs[a]] += n * r[a];
    }
    for a in 0..2 * dim {
        for b in 0..2 * dim {
            let sign = if (a < dim) == (b < dim) { 1.0 } else { -1.0 };
            let z = if a % dim == b % dim { sign } else { 0.0 };
            scatter(dofs[a], dofs[b], k * r[a] * r[b] + n / l * (z - r[a] * r[b]));
        }
    }
}

fn all_dofs(dofs: &[Option<usize>]) -> Option<Vec<usize>> {
    dofs.iter().copied().collect()
}

/// Co-rotational internal forces and tangent of every 2D connector, at the
/// true global displacements `u` (see the section comment above).
pub fn corotational_connectors_2d(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u: &[f64],
    f_int: &mut [f64],
    scatter: &mut impl FnMut(usize, usize, f64),
) {
    let nodes: HashMap<usize, &SolverNode> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mut conns: Vec<&ConnectorElement> = input.connectors.values().collect();
    conns.sort_by_key(|c| c.id);
    for c in conns {
        let (Some(ni), Some(nj)) = (nodes.get(&c.node_i), nodes.get(&c.node_j)) else { continue };
        let (l0, cos, sin) = chord_2d(ni, nj);
        let dofs = connector_dofs(dof_num, c.node_i, c.node_j, 3);
        if l0 <= ZERO_LENGTH {
            let ke = connector_stiffness_2d(c.k_axial, c.k_shear, c.k_moment, cos, sin);
            for (i, j, v) in entries(&ke, &dofs) {
                scatter(i, j, v);
                f_int[i] += v * u[j];
            }
            continue;
        }
        if c.k_axial != 0.0 {
            if let (Some(ti), Some(tj)) = (all_dofs(&dofs[0..2]), all_dofs(&dofs[3..5])) {
                corotational_axial(c.k_axial, l0, &[nj.x - ni.x, nj.z - ni.z], &ti, &tj, u, f_int, scatter);
            }
        }
        if c.k_moment != 0.0 {
            if let (Some(ri), Some(rj)) = (dofs[2], dofs[5]) {
                let m = c.k_moment * (u[rj] - u[ri]);
                f_int[ri] -= m;
                f_int[rj] += m;
                for (a, b, v) in [(ri, ri, 1.0), (rj, rj, 1.0), (ri, rj, -1.0), (rj, ri, -1.0)] {
                    scatter(a, b, v * c.k_moment);
                }
            }
        }
    }
}

/// Co-rotational internal forces and tangent of every 3D connector (zero-length:
/// all springs in global axes; with length: the axial spring only, the others
/// being refused by [`refuse_for_corotational_3d`]).
pub fn corotational_connectors_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    f_int: &mut [f64],
    scatter: &mut impl FnMut(usize, usize, f64),
) {
    let nodes: HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mut conns: Vec<&ConnectorElement> = input.connectors.values().collect();
    conns.sort_by_key(|c| c.id);
    for c in conns {
        let (Some(ni), Some(nj)) = (nodes.get(&c.node_i), nodes.get(&c.node_j)) else { continue };
        let (l0, dir) = chord_3d(ni, nj);
        let dofs = connector_dofs(dof_num, c.node_i, c.node_j, 6);
        if l0 <= ZERO_LENGTH {
            let ke = connector_stiffness_3d(c.k_axial, c.k_shear, c.k_shear_z, c.k_moment, c.k_bend_y, c.k_bend_z, dir);
            for (i, j, v) in entries(&ke, &dofs) {
                scatter(i, j, v);
                f_int[i] += v * u[j];
            }
            continue;
        }
        if c.k_axial != 0.0 {
            if let (Some(ti), Some(tj)) = (all_dofs(&dofs[0..3]), all_dofs(&dofs[6..9])) {
                corotational_axial(c.k_axial, l0, &[nj.x - ni.x, nj.y - ni.y, nj.z - ni.z], &ti, &tj, u, f_int, scatter);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_connector_2d_axial_only() {
        // Pure axial spring along X (cos=1, sin=0)
        let k = connector_stiffness_2d(100.0, 0.0, 0.0, 1.0, 0.0);
        // K_ii[0,0] = 100, K_jj[0,0] = 100, K_ij[0,0] = -100
        assert!((k[0 * 6 + 0] - 100.0).abs() < 1e-10);
        assert!((k[3 * 6 + 3] - 100.0).abs() < 1e-10);
        assert!((k[0 * 6 + 3] + 100.0).abs() < 1e-10);
        // No shear or moment terms
        assert!(k[1 * 6 + 1].abs() < 1e-10);
        assert!(k[2 * 6 + 2].abs() < 1e-10);
    }

    #[test]
    fn test_connector_2d_symmetry() {
        let k = connector_stiffness_2d(100.0, 50.0, 25.0, 0.6, 0.8);
        for i in 0..6 {
            for j in 0..6 {
                assert!(
                    (k[i * 6 + j] - k[j * 6 + i]).abs() < 1e-10,
                    "Asymmetry at ({},{}): {} vs {}", i, j, k[i * 6 + j], k[j * 6 + i]
                );
            }
        }
    }

    #[test]
    fn test_connector_3d_axial_only() {
        let k = connector_stiffness_3d(100.0, 0.0, 0.0, 0.0, 0.0, 0.0, [1.0, 0.0, 0.0]);
        // Axial along X: k[0,0] = 100
        assert!((k[0 * 12 + 0] - 100.0).abs() < 1e-10);
        assert!((k[6 * 12 + 6] - 100.0).abs() < 1e-10);
        assert!((k[0 * 12 + 6] + 100.0).abs() < 1e-10);
    }

    #[test]
    fn test_connector_3d_symmetry() {
        let k = connector_stiffness_3d(100.0, 50.0, 30.0, 10.0, 5.0, 3.0, [0.577, 0.577, 0.577]);
        for i in 0..12 {
            for j in 0..12 {
                assert!(
                    (k[i * 12 + j] - k[j * 12 + i]).abs() < 1e-8,
                    "Asymmetry at ({},{})", i, j
                );
            }
        }
    }
}
