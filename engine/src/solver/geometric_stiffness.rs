use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly::{rotate_inclined_free_block, InclinedFrame, InclinedTransformData, InclinedTransformData2D};

/// The (α, ΔT) of each element's uniform thermal loads, so its free thermal strain is α·ΔT.
///
/// The P-Delta iteration reads a member's axial force back from its
/// displacements, EA·Δu/L. That is the whole force only when nothing but the
/// nodes strains the member: a uniform temperature change adds a free strain
/// αΔT, and the force is EA·(Δu/L − αΔT). A heated member between restraints
/// does not lengthen at all, so without this term its compression −EAαΔT never
/// reached the geometric stiffness.
///
/// α is each load's own (`SolverThermalLoad::alpha`, the engine default when it states none).
/// When an element's loads all share one α, the pair is (α, ΣΔT), as the load assembly sums
/// them; when they differ, (1, Σα·ΔT), the same strain.
fn combine_thermal(dt: &mut std::collections::HashMap<usize, (f64, f64)>, id: usize, alpha: f64, dt_uniform: f64) {
    match dt.get_mut(&id) {
        None => { dt.insert(id, (alpha, dt_uniform)); }
        Some(e) if e.0 == alpha => e.1 += dt_uniform,
        Some(e) => *e = (1.0, e.0 * e.1 + alpha * dt_uniform),
    }
}

/// See [`combine_thermal`]: plane.
fn uniform_dt_2d(input: &SolverInput) -> std::collections::HashMap<usize, (f64, f64)> {
    let mut dt = std::collections::HashMap::new();
    for load in &input.loads {
        if let SolverLoad::Thermal(tl) = load {
            combine_thermal(&mut dt, tl.element_id, tl.alpha(), tl.dt_uniform);
        }
    }
    dt
}

/// See [`combine_thermal`]: space.
fn uniform_dt_3d(input: &SolverInput3D) -> std::collections::HashMap<usize, (f64, f64)> {
    let mut dt = std::collections::HashMap::new();
    for load in &input.loads {
        if let SolverLoad3D::Thermal(tl) = load {
            combine_thermal(&mut dt, tl.element_id, tl.alpha(), tl.dt_uniform);
        }
    }
    dt
}

/// Maps 12-DOF element indices to 14-DOF positions, skipping warping DOFs 6 and 13.
const DOF_MAP_12_TO_14: [usize; 12] = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];

/// Triplet accumulator for geometric-stiffness assembly: keeps only the
/// free×free block (buckling solves on free DOFs) and converts to a
/// lower-triangle CSC. Replaces the previous dense n×n build, which was
/// O(n²) memory on the one path (buckling) whose eigensolver is sparse.
pub struct KgTriplets {
    nf: usize,
    rows: Vec<usize>,
    cols: Vec<usize>,
    vals: Vec<f64>,
}

impl KgTriplets {
    pub fn new(nf: usize) -> Self {
        KgTriplets { nf, rows: Vec::new(), cols: Vec::new(), vals: Vec::new() }
    }

    /// Collected over all `n` DOFs: rotate into the inclined-support frames,
    /// then keep the `nf` free block (see `rotate_inclined_free_block`).
    pub(crate) fn rotate_inclined<T: InclinedFrame>(mut self, its: &[T], nf: usize) -> Self {
        rotate_inclined_free_block(&mut self.rows, &mut self.cols, &mut self.vals, its, nf);
        self.nf = nf;
        self
    }

    /// Add one contribution. Element matrices are symmetric, so callers emit
    /// each unordered local pair once (lower triangle); from_triplets sums
    /// contributions of elements sharing a DOF pair.
    #[inline]
    pub fn add(&mut self, i: usize, j: usize, v: f64) {
        if i < self.nf && j < self.nf {
            self.rows.push(i);
            self.cols.push(j);
            self.vals.push(v);
        }
    }

    /// Lower-triangle CSC of the free block (duplicates summed).
    ///
    /// Drops entries below 1e-30, matching `CscMatrix::from_dense_symmetric`,
    /// which is what produced this matrix before it was assembled from
    /// triplets. Without the filter every emitted pair becomes a structural
    /// nonzero, and element Kg is nonzero only on translational DOFs: a quad
    /// emits 300 pairs of which about 78 are nonzero, a quad9 emits 1485 of
    /// which about 378 are. The resulting CSC stored roughly 4x the real
    /// nonzeros of a shell model, and that is paid on every Lanczos iteration
    /// through `sym_mat_vec` and quadratically through `reduce_sparse` on the
    /// constrained path — eroding the O(nnz) win this assembly exists for.
    pub fn into_csc(self) -> CscMatrix {
        let mut k = CscMatrix::from_triplets(self.nf, &self.rows, &self.cols, &self.vals);
        k.drop_below_threshold(1e-30);
        k
    }
}

/// Condense the bending plane `d` = (v1, θ1, v2, θ2) of an n×n local Kg for its released
/// rotations: Kg ← Tᵀ·Kg·T, where θ = T·(v1, θ1, v2, θ2) is the identity with each released
/// rotation's row replaced by its elastic (Euler–Bernoulli) map, the rotation that makes its end
/// moment vanish. `s` is the sign of the rotation DOF (θz = v', θy = −w'). With both ends
/// released both rotations follow the chord, which leaves the string stiffness P/L.
///
/// T acts on the whole matrix (identity outside the plane), so the entries that couple the
/// plane to other DOFs — the shear-centre coupling of the twist with v and w — are mapped too.
fn condense_kg_plane(kg: &mut [f64], n: usize, d: [usize; 4], s: f64, l: f64, rel_i: bool, rel_j: bool) {
    if !rel_i && !rel_j { return; }
    let mut t = [[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0], [0.0, 0.0, 1.0, 0.0], [0.0, 0.0, 0.0, 1.0]];
    let chord = s / l;
    let half = 1.5 * s / l;
    match (rel_i, rel_j) {
        (true, true) => { t[1] = [-chord, 0.0, chord, 0.0]; t[3] = [-chord, 0.0, chord, 0.0]; }
        (true, false) => { t[1] = [-half, 0.0, half, -0.5]; }
        (false, true) => { t[3] = [-half, -0.5, half, 0.0]; }
        (false, false) => unreachable!(),
    }
    // Kg·T: only the plane columns change, column d[b] ← Σ_a Kg[:, d[a]]·t[a][b].
    for i in 0..n {
        let row: [f64; 4] = std::array::from_fn(|a| kg[i * n + d[a]]);
        for b in 0..4 {
            kg[i * n + d[b]] = (0..4).map(|a| row[a] * t[a][b]).sum();
        }
    }
    // Tᵀ·(Kg·T): only the plane rows change.
    for j in 0..n {
        let col: [f64; 4] = std::array::from_fn(|a| kg[d[a] * n + j]);
        for b in 0..4 {
            kg[d[b] * n + j] = (0..4).map(|a| t[a][b] * col[a]).sum();
        }
    }
}

/// Section data the torsional part of a 3D frame member's geometric stiffness needs.
///
/// With a constant axial force P (tension positive) and the twist θ taken about the shear
/// centre S = (y0, z0) (coordinates from the centroid, local axes), a fibre at (y, z) moves
/// transversely by v_S − (z − z0)θ and w_S + (y − y0)θ. The second-order work of the uniform
/// stress P/A over the section is then
///
/// ½∫P·[v_S'² + w_S'² + r0²·θ'² + 2·z0·v_S'·θ' − 2·y0·w_S'·θ'] dx,  r0² = (Iy + Iz)/A + y0² + z0²
///
/// (Trahair, *Flexural-Torsional Buckling of Structures*, §3.3; McGuire, Gallagher & Ziemian,
/// *Matrix Structural Analysis*, 2nd ed., §8.4 and eq. 9.18). The r0² term is the Wagner
/// term: without it the eigenproblem has no twist entries and torsional (cruciforms, short
/// open sections) and flexural-torsional (channels, tees, angles) buckling are never found.
/// The member's transverse DOFs are read as the shear-centre displacements, the usual
/// thin-walled beam convention; the elastic stiffness, uncoupled in those coordinates, is the
/// same either way.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct KgSection {
    /// r0² = (Iy + Iz)/A + y0² + z0², the polar radius of gyration about the shear centre squared.
    pub r0_sq: f64,
    /// Shear-centre coordinates from the centroid, local y and z.
    pub y0: f64,
    pub z0: f64,
}

impl KgSection {
    pub fn from_section(sec: &SolverSection3D) -> Self {
        let y0 = sec.shear_center_y.unwrap_or(0.0);
        let z0 = sec.shear_center_z.unwrap_or(0.0);
        let r0_sq = if sec.a > 0.0 { (sec.iy + sec.iz) / sec.a } else { 0.0 } + y0 * y0 + z0 * z0;
        KgSection { r0_sq, y0, z0 }
    }
}

/// The consistent cubic-Hermite matrix ∫N'ᵀN' dx = 1/(30L)·[36, 3L, −36, 3L; …] on (q1, q1', q2, q2').
fn hermite_kg_block(l: f64) -> [[f64; 4]; 4] {
    let c = 1.0 / (30.0 * l);
    [
        [36.0 * c, 3.0 * l * c, -36.0 * c, 3.0 * l * c],
        [3.0 * l * c, 4.0 * l * l * c, -3.0 * l * c, -l * l * c],
        [-36.0 * c, -3.0 * l * c, 36.0 * c, -3.0 * l * c],
        [3.0 * l * c, -l * l * c, -3.0 * l * c, 4.0 * l * l * c],
    ]
}

/// Adds `v` at (i, j) and (j, i) (once on the diagonal).
fn add_sym(kg: &mut [f64], n: usize, i: usize, j: usize, v: f64) {
    kg[i * n + j] += v;
    if i != j {
        kg[j * n + i] += v;
    }
}

/// The local geometric stiffness of a 3D frame member (12×12, Przemieniecki) under an axial force
/// `p`, tension positive, condensed for the member's end releases.
///
/// The consistent Kg belongs to a member whose four end rotations are all its own. A released
/// rotation is not: the elastic stiffness condenses it out (`add_bending_block`), and the
/// geometric one has to follow, or it adds −4·P·L/30 to a rotation nothing else holds. On a
/// building whose braces and beams are pinned at their ends that made K + Kg indefinite at a tenth
/// of the load. The condensation uses the elastic map of the released rotation, from the
/// Euler–Bernoulli block: with one end released, θ_r = s·(3/2L)·(v_far − v_near)·(±1) − θ_other/2;
/// with both, both rotations follow the chord, which leaves the string stiffness P/L.
///
/// Torsion (see [`KgSection`]): the twist of this element is linear, as in its elastic
/// stiffness, so the Wagner term is P·r0²/L·[1, −1; −1, 1] on (θx1, θx2) and the shear-centre
/// coupling P·z0·∫v'θ' − P·y0·∫w'θ' involves only the end translations (∫N_rot' dx = 0).
/// A torsion release at either end, which removes the member's torsional stiffness, removes
/// these terms too.
pub fn frame_kg_local_3d(p: f64, l: f64, hinge: &crate::element::Hinge3D, sec: &KgSection) -> Vec<f64> {
    let coeff = p / (30.0 * l);
    let mut kg_local = vec![0.0; 144];
    // Y-Z bending plane (v, θz at each node): DOFs 1,5,7,11
    let yz = [(1,1,36.0), (1,5,3.0*l), (1,7,-36.0), (1,11,3.0*l),
               (5,1,3.0*l), (5,5,4.0*l*l), (5,7,-3.0*l), (5,11,-l*l),
               (7,1,-36.0), (7,5,-3.0*l), (7,7,36.0), (7,11,-3.0*l),
               (11,1,3.0*l), (11,5,-l*l), (11,7,-3.0*l), (11,11,4.0*l*l)];
    for &(r, c, val) in &yz { kg_local[r * 12 + c] = val * coeff; }
    // X-Z bending plane (w, θy at each node): DOFs 2,4,8,10
    // Same magnitudes, but θy coupling signs flip (θy = -dw/dx convention)
    let xz = [(2,2,36.0), (2,4,-3.0*l), (2,8,-36.0), (2,10,-3.0*l),
               (4,2,-3.0*l), (4,4,4.0*l*l), (4,8,3.0*l), (4,10,-l*l),
               (8,2,-36.0), (8,4,3.0*l), (8,8,36.0), (8,10,3.0*l),
               (10,2,-3.0*l), (10,4,-l*l), (10,8,3.0*l), (10,10,4.0*l*l)];
    for &(r, c, val) in &xz { kg_local[r * 12 + c] = val * coeff; }

    if !hinge.release_t_start && !hinge.release_t_end {
        // Wagner term on the linear twist.
        let w = p * sec.r0_sq / l;
        add_sym(&mut kg_local, 12, 3, 3, w);
        add_sym(&mut kg_local, 12, 9, 9, w);
        add_sym(&mut kg_local, 12, 3, 9, -w);
        // Shear-centre coupling: P·z0·(v2 − v1)(θ2 − θ1)/L − P·y0·(w2 − w1)(θ2 − θ1)/L.
        for (dv, k) in [((1usize, 7usize), p * sec.z0 / l), ((2, 8), -p * sec.y0 / l)] {
            if k != 0.0 {
                add_sym(&mut kg_local, 12, dv.0, 3, k);
                add_sym(&mut kg_local, 12, dv.0, 9, -k);
                add_sym(&mut kg_local, 12, dv.1, 3, -k);
                add_sym(&mut kg_local, 12, dv.1, 9, k);
            }
        }
    }

    // (v1, θ1, v2, θ2) of each plane, the sign s of its rotation (θz = v', θy = −w') and its
    // releases.
    let planes = [
        ([1usize, 5, 7, 11], 1.0, hinge.release_mz_start, hinge.release_mz_end),
        ([2usize, 4, 8, 10], -1.0, hinge.release_my_start, hinge.release_my_end),
    ];
    for (d, s, rel_i, rel_j) in planes {
        condense_kg_plane(&mut kg_local, 12, d, s, l, rel_i, rel_j);
    }
    kg_local
}

/// The local geometric stiffness (14×14) of a 3D frame member with warping DOFs
/// [u1, v1, w1, θx1, θy1, θz1, φ'1, u2, v2, w2, θx2, θy2, θz2, φ'2], the counterpart of
/// `frame_local_stiffness_3d_warping`.
///
/// The bending blocks are those of [`frame_kg_local_3d`]. The twist is the cubic Hermite
/// interpolant of (θx1, φ'1, θx2, φ'2), as in the elastic torsion-warping block, so the Wagner
/// term is P·r0²·H and the shear-centre coupling P·z0·(v-plane)ᵀH(twist) − P·y0·(w-plane)ᵀH(twist),
/// H = ∫N'ᵀN' dx the consistent Hermite block, with the w-plane rotations entering as −θy.
/// This element finds P_T = (GJ + π²ECw/L²)/r0² of a member whose warping is restrained.
pub fn frame_kg_local_3d_warping(p: f64, l: f64, hinge: &crate::element::Hinge3D, sec: &KgSection) -> Vec<f64> {
    const N: usize = 14;
    let mut kg = vec![0.0; N * N];
    // The uncondensed bending blocks (no releases, no torsion terms).
    let bending = frame_kg_local_3d(p, l, &crate::element::Hinge3D::default(), &KgSection::default());
    for i in 0..12 {
        for j in 0..12 {
            kg[DOF_MAP_12_TO_14[i] * N + DOF_MAP_12_TO_14[j]] = bending[i * 12 + j];
        }
    }
    if !hinge.release_t_start && !hinge.release_t_end {
        let h = hermite_kg_block(l);
        let twist = [3usize, 6, 10, 13];
        for a in 0..4 {
            for b in 0..4 {
                kg[twist[a] * N + twist[b]] += p * sec.r0_sq * h[a][b];
            }
        }
        // (DOFs, sign of each DOF in the Hermite interpolant, coefficient).
        let planes = [
            ([1usize, 5, 8, 12], [1.0, 1.0, 1.0, 1.0], p * sec.z0),
            ([2usize, 4, 9, 11], [1.0, -1.0, 1.0, -1.0], -p * sec.y0),
        ];
        for (d, sg, k) in planes {
            if k == 0.0 {
                continue;
            }
            for a in 0..4 {
                for b in 0..4 {
                    let v = k * sg[a] * h[a][b];
                    kg[d[a] * N + twist[b]] += v;
                    kg[twist[b] * N + d[a]] += v;
                }
            }
        }
    }
    let planes = [
        ([1usize, 5, 8, 12], 1.0, hinge.release_mz_start, hinge.release_mz_end),
        ([2usize, 4, 9, 11], -1.0, hinge.release_my_start, hinge.release_my_end),
    ];
    for (d, s, rel_i, rel_j) in planes {
        condense_kg_plane(&mut kg, N, d, s, l, rel_i, rel_j);
    }
    kg
}

/// The global geometric stiffness of a 3D frame member under axial force `p` and the global
/// DOFs its rows scatter to: the 14×14 warping element (cubic twist) when the section has a
/// warping constant and the model numbers warping DOFs, otherwise the 12×12 element
/// (scattered past the warping DOFs on a 7-DOF model). Every frame Kg path — buckling,
/// P-Delta, the certificates, the public helpers — goes through here.
fn frame_kg_global_3d(
    p: f64,
    l: f64,
    elem: &SolverElement3D,
    sec: &SolverSection3D,
    axes: (&[f64; 3], &[f64; 3], &[f64; 3]),
    dof_num: &DofNumbering,
) -> (Vec<usize>, Vec<f64>) {
    let (kg_local, t, dofs) = frame_kg_local_and_transform_3d(p, l, elem, sec, axes, dof_num);
    let nd = dofs.len();
    (dofs, transform_stiffness(&kg_local, &t, nd))
}

/// (local Kg, transformation, global DOFs) of [`frame_kg_global_3d`].
fn frame_kg_local_and_transform_3d(
    p: f64,
    l: f64,
    elem: &SolverElement3D,
    sec: &SolverSection3D,
    (ex, ey, ez): (&[f64; 3], &[f64; 3], &[f64; 3]),
    dof_num: &DofNumbering,
) -> (Vec<f64>, Vec<f64>, Vec<usize>) {
    let hinge = crate::element::Hinge3D::from_elem(elem);
    let ks = KgSection::from_section(sec);
    let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
    if dof_num.dofs_per_node >= 7 && sec.cw.is_some_and(|cw| cw > 0.0) {
        let t = crate::element::frame_transform_3d_warping(ex, ey, ez);
        (frame_kg_local_3d_warping(p, l, &hinge, &ks), t, elem_dofs)
    } else {
        let t = crate::element::frame_transform_3d(ex, ey, ez);
        let dofs = if dof_num.dofs_per_node >= 7 {
            DOF_MAP_12_TO_14.iter().map(|&i| elem_dofs[i]).collect()
        } else {
            elem_dofs
        };
        (frame_kg_local_3d(p, l, &hinge, &ks), t, dofs)
    }
}

/// Add geometric stiffness to the global stiffness matrix based on current axial forces.
/// Used by P-Delta and Buckling analyses.
pub fn add_geometric_stiffness_2d(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u: &[f64],
    k_global: &mut [f64],
) {
    let n = dof_num.n_total;
    emit_geometric_stiffness_2d(input, dof_num, u, &mut |gi, gj, v| k_global[gi * n + gj] += v);
}

/// Each 2D element's mean axial force (tension positive) at displacements `u`:
/// EA·(δ/L − α·ΔT), the force the geometric stiffness is built from. Under an
/// axial span load N varies along the member and its end values can both be zero
/// while the member is in compression; δ/L is the mean of N/EA over the length.
pub(crate) fn mean_axial_forces_2d(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u: &[f64],
) -> std::collections::HashMap<usize, f64> {
    let node_by_id: std::collections::HashMap<usize, &SolverNode> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection> = crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();
    let dt_by_elem = uniform_dt_2d(input);
    let at = |node: usize, i: usize| dof_num.global_dof(node, i).map(|d| u[d]).unwrap_or(0.0);
    let mut out = std::collections::HashMap::new();
    for elem in crate::ordered::values(&input.elements) {
        let (Some(ni), Some(nj)) = (node_by_id.get(&elem.node_i), node_by_id.get(&elem.node_j)) else { continue };
        let (Some(mat), Some(sec)) = (mat_by_id.get(&elem.material_id), sec_by_id.get(&elem.section_id)) else { continue };
        let (dx, dz) = (nj.x - ni.x, nj.z - ni.z);
        let l = (dx * dx + dz * dz).sqrt();
        if l < 1e-15 {
            continue;
        }
        let (c, s) = (dx / l, dz / l);
        let delta = (at(elem.node_j, 0) - at(elem.node_i, 0)) * c + (at(elem.node_j, 1) - at(elem.node_i, 1)) * s;
        let (alpha, dt) = dt_by_elem.get(&elem.id).copied().unwrap_or((DEFAULT_FRAME_THERMAL_ALPHA, 0.0));
        out.insert(elem.id, mat.e * 1000.0 * sec.a * (delta / l - alpha * dt));
    }
    out
}

/// The 2D geometric stiffness of every element, emitted entry by entry: the
/// sparse P-Delta tangent collects it as triplets instead of a dense matrix.
/// Mirrors `emit_geometric_stiffness_3d`.
pub(crate) fn emit_geometric_stiffness_2d(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u: &[f64],
    emit: &mut dyn FnMut(usize, usize, f64),
) {
    let node_by_id: std::collections::HashMap<usize, &SolverNode> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection> = crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();
    let dt_by_elem = uniform_dt_2d(input);

    for elem in crate::ordered::values(&input.elements) {
        let (alpha, dt) = dt_by_elem.get(&elem.id).copied().unwrap_or((DEFAULT_FRAME_THERMAL_ALPHA, 0.0));
        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            // Truss geometric stiffness
            add_truss_kg_2d(&node_by_id, &mat_by_id, &sec_by_id, dof_num, elem, u, (alpha, dt), emit);
            continue;
        }

        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0;

        // Get current axial force from displacements
        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
        let u_global: Vec<f64> = elem_dofs.iter().map(|&d| u[d]).collect();
        let t = crate::element::frame_transform_2d(cos, sin);
        let u_local = transform_displacement(&u_global, &t, 6);

        // Axial deformation, less the free thermal strain → axial force
        let axial_force = e * sec.a * ((u_local[3] - u_local[0]) / l - alpha * dt);

        let k_g_global = frame_kg_global_2d(axial_force, l, &t, elem);

        // Add to global matrix
        let ndof = elem_dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                emit(elem_dofs[i], elem_dofs[j], k_g_global[i * ndof + j]);
            }
        }
    }
}

/// Local 6×6 geometric stiffness of a plane frame member under axial force
/// `p` (tension positive), Przemieniecki: the cubic-Hermite work ½∫P·v'² dx
/// over the transverse DOFs (v1, θ1, v2, θ2 → indices 1, 2, 4, 5), condensed
/// for the member's hinges as in [`frame_kg_local_3d`]. (It used to ignore
/// them: a hinged rotation got −4·P·L/30 that nothing but the solver's
/// artificial rotational stiffness held, and a frame with a pin-ended member
/// buckled at λ ≈ 1e-6.)
#[allow(clippy::identity_op, clippy::erasing_op)]
pub fn frame_kg_local_2d(p: f64, l: f64, hinge_start: bool, hinge_end: bool) -> Vec<f64> {
    let coeff = p / (30.0 * l);
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
    condense_kg_plane(&mut k_g_local, 6, [1, 2, 4, 5], 1.0, l, hinge_start, hinge_end);
    k_g_local
}

/// Global 6×6 geometric stiffness of a plane frame member under axial force
/// `p` (tension positive), with `t` its 6×6 transformation.
fn frame_kg_global_2d(p: f64, l: f64, t: &[f64], elem: &SolverElement) -> Vec<f64> {
    transform_stiffness(&frame_kg_local_2d(p, l, elem.hinge_start, elem.hinge_end), t, 6)
}

fn mat_vec(k: &[f64], u: &[f64]) -> Vec<f64> {
    let n = u.len();
    (0..n).map(|i| (0..n).map(|j| k[i * n + j] * u[j]).sum()).collect()
}

/// Each frame member's geometric end forces Kg_e(N)·u_e in its local axes at
/// the displacements `u`, with the axial force and Kg of
/// `emit_geometric_stiffness_2d`: (element id, local [f_I; f_J]). Added to the
/// elastic end forces they are the forces of the member P-Delta solved.
pub(crate) fn frame_geometric_end_forces_2d(input: &SolverInput, dof_num: &DofNumbering, u: &[f64]) -> Vec<(usize, Vec<f64>)> {
    let node_by_id: std::collections::HashMap<usize, &SolverNode> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection> = crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();
    let dt_by_elem = uniform_dt_2d(input);
    let mut out = Vec::new();
    for elem in crate::ordered::values(&input.elements) {
        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            continue;
        }
        let (ni, nj) = (node_by_id[&elem.node_i], node_by_id[&elem.node_j]);
        let (dx, dy) = (nj.x - ni.x, nj.z - ni.z);
        let l = (dx * dx + dy * dy).sqrt();
        let t = crate::element::frame_transform_2d(dx / l, dy / l);
        let u_global: Vec<f64> = dof_num.element_dofs(elem.node_i, elem.node_j).iter().map(|&d| u[d]).collect();
        let u_local = transform_displacement(&u_global, &t, 6);
        let (alpha, dt) = dt_by_elem.get(&elem.id).copied().unwrap_or((DEFAULT_FRAME_THERMAL_ALPHA, 0.0));
        let e = mat_by_id[&elem.material_id].e * 1000.0;
        let axial_force = e * sec_by_id[&elem.section_id].a * ((u_local[3] - u_local[0]) / l - alpha * dt);
        out.push((elem.id, mat_vec(&frame_kg_local_2d(axial_force, l, elem.hinge_start, elem.hinge_end), &u_local)));
    }
    out
}

/// 3D counterpart of `frame_geometric_end_forces_2d` (local [f_I; f_J], 12).
pub(crate) fn frame_geometric_end_forces_3d(input: &SolverInput3D, dof_num: &DofNumbering, u: &[f64]) -> Vec<(usize, Vec<f64>)> {
    let left_hand = input.left_hand.unwrap_or(false);
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection3D> = crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();
    let dt_by_elem = uniform_dt_3d(input);
    let mut out = Vec::new();
    for elem in crate::ordered::values(&input.elements) {
        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            continue;
        }
        let (ni, nj) = (node_by_id[&elem.node_i], node_by_id[&elem.node_j]);
        let l = ((nj.x - ni.x).powi(2) + (nj.y - ni.y).powi(2) + (nj.z - ni.z).powi(2)).sqrt();
        let (ex, ey, ez) = crate::element::compute_local_axes_3d(
            ni.x, ni.y, ni.z, nj.x, nj.y, nj.z,
            elem.local_yx, elem.local_yy, elem.local_yz, elem.roll_angle, left_hand,
        );
        let sec = sec_by_id[&elem.section_id];
        let t12 = crate::element::frame_transform_3d(&ex, &ey, &ez);
        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
        let u_12: Vec<f64> = if dof_num.dofs_per_node >= 7 {
            DOF_MAP_12_TO_14.iter().map(|&i| u[elem_dofs[i]]).collect()
        } else {
            elem_dofs.iter().map(|&d| u[d]).collect()
        };
        let u_local12 = transform_displacement(&u_12, &t12, 12);
        let (alpha, dt) = dt_by_elem.get(&elem.id).copied().unwrap_or((DEFAULT_FRAME_THERMAL_ALPHA, 0.0));
        let e = mat_by_id[&elem.material_id].e * 1000.0;
        let axial_force = e * sec.a * ((u_local12[6] - u_local12[0]) / l - alpha * dt);
        let (kg, t, dofs) = frame_kg_local_and_transform_3d(axial_force, l, elem, sec, (&ex, &ey, &ez), dof_num);
        let nd = dofs.len();
        let u_local = if nd == 12 {
            u_local12
        } else {
            let u_e: Vec<f64> = dofs.iter().map(|&d| u[d]).collect();
            transform_displacement(&u_e, &t, nd)
        };
        let f = mat_vec(&kg, &u_local);
        // Local [f_I; f_J] on the 12 non-warping DOFs (the bimoment has no slot in the forces).
        let f12 = if nd == 14 { DOF_MAP_12_TO_14.iter().map(|&i| f[i]).collect() } else { f };
        out.push((elem.id, f12));
    }
    out
}

/// Global 4×4 geometric stiffness of a plane truss member, `p_over_l` = P/L.
pub fn truss_kg_2d(p_over_l: f64, cos: f64, sin: f64) -> [f64; 16] {
    let cc = cos * cos;
    let ss = sin * sin;
    let cs = cos * sin;

    // 4×4 matrix for DOFs: [ux_i, uy_i, ux_j, uy_j]
    [
        ss * p_over_l, -cs * p_over_l, -ss * p_over_l, cs * p_over_l,
        -cs * p_over_l, cc * p_over_l, cs * p_over_l, -cc * p_over_l,
        -ss * p_over_l, cs * p_over_l, ss * p_over_l, -cs * p_over_l,
        cs * p_over_l, -cc * p_over_l, -cs * p_over_l, cc * p_over_l,
    ]
}

fn add_truss_kg_2d(
    node_by_id: &std::collections::HashMap<usize, &SolverNode>,
    mat_by_id: &std::collections::HashMap<usize, &SolverMaterial>,
    sec_by_id: &std::collections::HashMap<usize, &SolverSection>,
    dof_num: &DofNumbering,
    elem: &SolverElement,
    u: &[f64],
    (alpha, dt): (f64, f64),
    emit: &mut dyn FnMut(usize, usize, f64),
) {
    let node_i = node_by_id[&elem.node_i];
    let node_j = node_by_id[&elem.node_j];
    let mat = mat_by_id[&elem.material_id];
    let sec = sec_by_id[&elem.section_id];

    let dx = node_j.x - node_i.x;
    let dy = node_j.z - node_i.z;
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
    let axial_force = e * sec.a * (delta / l - alpha * dt);

    let k_g = truss_kg_2d(axial_force / l, cos, sin);

    let truss_dofs = [
        dof_num.global_dof(elem.node_i, 0).unwrap(),
        dof_num.global_dof(elem.node_i, 1).unwrap(),
        dof_num.global_dof(elem.node_j, 0).unwrap(),
        dof_num.global_dof(elem.node_j, 1).unwrap(),
    ];

    for i in 0..4 {
        for j in 0..4 {
            emit(truss_dofs[i], truss_dofs[j], k_g[i * 4 + j]);
        }
    }
}

/// Build geometric stiffness matrix from element forces (no displacement needed).
/// Used by buckling analysis which already has element forces from linear solve.
///
/// `inclined` are the inclined-roller rotations K was assembled with
/// (`inclined_transforms_2d`); Kg is rotated the same way so the pair stays
/// in one frame.
pub fn build_kg_from_forces_2d(
    input: &SolverInput,
    dof_num: &DofNumbering,
    element_forces: &[ElementForces],
    inclined: &[InclinedTransformData2D],
) -> KgTriplets {
    let nf = dof_num.n_free;
    // With inclined rollers, keep every DOF until the rotation is applied.
    let mut kg = KgTriplets::new(if inclined.is_empty() { nf } else { dof_num.n_total });
    let elem_by_id: std::collections::HashMap<usize, &SolverElement> = crate::ordered::values(&input.elements).map(|e| (e.id, e)).collect();
    let node_by_id: std::collections::HashMap<usize, &SolverNode> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();

    for ef in element_forces {
        let elem = elem_by_id[&ef.element_id];
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];

        let dx = node_j.x - node_i.x;
        let dy = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;

        // Use average axial force (negative = compression)
        let axial_force = (ef.n_start + ef.n_end) / 2.0;

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let kg_local = truss_kg_2d(axial_force / l, cos, sin);
            let truss_dofs = [
                dof_num.global_dof(elem.node_i, 0).unwrap(),
                dof_num.global_dof(elem.node_i, 1).unwrap(),
                dof_num.global_dof(elem.node_j, 0).unwrap(),
                dof_num.global_dof(elem.node_j, 1).unwrap(),
            ];
            for i in 0..4 {
                // Symmetric element matrix: emit each unordered pair once
                // (lower triangle); from_triplets sums across elements.
                for j in 0..=i {
                    kg.add(truss_dofs[i], truss_dofs[j], kg_local[i * 4 + j]);
                }
            }
        } else {
            let t = crate::element::frame_transform_2d(cos, sin);
            let kg_global = frame_kg_global_2d(axial_force, l, &t, elem);
            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let ndof = elem_dofs.len();
            for i in 0..ndof {
                for j in 0..=i {
                    kg.add(elem_dofs[i], elem_dofs[j], kg_global[i * ndof + j]);
                }
            }
        }
    }
    if inclined.is_empty() { kg } else { kg.rotate_inclined(inclined, nf) }
}

/// Build 3D geometric stiffness matrix from element forces.
pub fn build_kg_from_forces_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    element_forces: &[ElementForces3D],
) -> KgTriplets {
    build_kg_from_forces_3d_keep(input, dof_num, element_forces, &[])
}

/// `build_kg_from_forces_3d`, over all DOFs when `inclined` (the rotations K
/// was assembled with) is not empty: the caller adds any surface Kg and then
/// rotates the whole with `KgTriplets::rotate_inclined`, so Kg and K share
/// the inclined-support frames.
pub(crate) fn build_kg_from_forces_3d_keep(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    element_forces: &[ElementForces3D],
    inclined: &[InclinedTransformData],
) -> KgTriplets {
    let mut kg = KgTriplets::new(if inclined.is_empty() { dof_num.n_free } else { dof_num.n_total });
    let left_hand = input.left_hand.unwrap_or(false);
    let elem_by_id: std::collections::HashMap<usize, &SolverElement3D> = crate::ordered::values(&input.elements).map(|e| (e.id, e)).collect();
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection3D> = crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

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
            let kg_local = truss_kg_3d(axial_force / l, &[dx / l, dy / l, dz / l]);
            let truss_dofs: Vec<usize> = (0..3).map(|i| dof_num.global_dof(elem.node_i, i).unwrap())
                .chain((0..3).map(|i| dof_num.global_dof(elem.node_j, i).unwrap()))
                .collect();
            for i in 0..6 {
                for j in 0..=i {
                    kg.add(truss_dofs[i], truss_dofs[j], kg_local[i * 6 + j]);
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
            // Bending blocks, Wagner term and shear-centre coupling, condensed for the
            // releases; 14×14 on warping members of a 7-DOF model, otherwise 12×12
            // scattered past the warping DOFs (a stride-14 index into a 12×12 matrix
            // used to walk off its end on 7-DOF models).
            let sec = sec_by_id[&elem.section_id];
            let (dofs, kg_global) = frame_kg_global_3d(axial_force, l, elem, sec, (&ex, &ey, &ez), dof_num);
            let nd = dofs.len();
            for i in 0..nd {
                for j in 0..=i {
                    kg.add(dofs[i], dofs[j], kg_global[i * nd + j]);
                }
            }
        }
    }
    // Note: shell geometric stiffness (quads, plates, quad9s, solid shells,
    // curved shells) is NOT built here — it needs the displacement vector to
    // compute membrane stresses. Callers add it separately via
    // add_*_geometric_stiffness_3d (see buckling.rs).
    kg
}

/// Which shell family a thermal load belongs to (element ids are per family).
#[derive(Clone, Copy, PartialEq)]
enum ShellFamily { Plate, Quad, Quad9, Curved }

/// The thermal loads on one shell, summed as free strains: returns (1, Σα·ΔT_uniform,
/// Σα·ΔT_gradient), the (α, ΔTu, ΔTg) triple every recovery routine multiplies out.
/// Summing ΔT with one α (the previous quad-only version) was exact only for equal α.
fn shell_thermal(input: &SolverInput3D, family: ShellFamily, id: usize) -> (f64, f64, f64) {
    let (mut eu, mut eg) = (0.0, 0.0);
    for l in &input.loads {
        let t = match (l, family) {
            (SolverLoad3D::PlateThermal(t), ShellFamily::Plate)
            | (SolverLoad3D::QuadThermal(t), ShellFamily::Quad)
            | (SolverLoad3D::Quad9Thermal(t), ShellFamily::Quad9)
            | (SolverLoad3D::CurvedShellThermal(t), ShellFamily::Curved) => t,
            _ => continue,
        };
        if t.element_id == id {
            let alpha = t.alpha.unwrap_or(12e-6);
            eu += alpha * t.dt_uniform;
            eg += alpha * t.dt_gradient;
        }
    }
    (1.0, eu, eg)
}

/// Add quad geometric stiffness to a pre-built Kg matrix, given displacements.
/// Used by P-delta and other displacement-based geometric stiffness computations.
pub fn add_quad_geometric_stiffness_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    kg: &mut KgTriplets,
) {
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();

    for quad in crate::ordered::values(&input.quads) {
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

        // Membrane stress resultants (force/length = stress × thickness), from
        // the mechanical strain: a free thermal expansion is stress-free and
        // carries no geometric stiffness. Taken as total strain, a heated,
        // unrestrained slab was stiffened in P-Delta by its own expansion.
        let (alpha, dtu, dtg) = shell_thermal(input, ShellFamily::Quad, quad.id);
        let s = crate::element::quad::quad_stresses(&coords, &u_local, e, nu, quad.thickness, alpha, dtu, dtg);
        let nxx = s.sigma_xx * quad.thickness;
        let nyy = s.sigma_yy * quad.thickness;
        let nxy = s.tau_xy * quad.thickness;

        // Build local geometric stiffness
        let kg_local = crate::element::quad::quad_geometric_stiffness(&coords, nxx, nyy, nxy);
        let kg_global = transform_stiffness(&kg_local, &t_quad, 24);

        let ndof = quad_dofs.len();
        for i in 0..ndof {
            for j in 0..=i {
                kg.add(quad_dofs[i], quad_dofs[j], kg_global[i * ndof + j]);
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
    kg: &mut KgTriplets,
) {
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();

    for plate in crate::ordered::values(&input.plates) {
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

        // Membrane resultants from the MECHANICAL strain, as for the quad: a free thermal
        // expansion is stress-free and carries no geometric stiffness. From the total
        // strain a heated, unrestrained slab was stiffened by its own expansion (SH-5).
        let (alpha, dtu, dtg) = shell_thermal(input, ShellFamily::Plate, plate.id);
        let s = crate::element::plate_stress_recovery(&coords, e, nu, plate.thickness, &u_local_vec, alpha, dtu, dtg);
        let nxx = s.sigma_xx * plate.thickness;
        let nyy = s.sigma_yy * plate.thickness;
        let nxy = s.tau_xy * plate.thickness;

        // Build local geometric stiffness and transform to global
        let kg_local = crate::element::plate_geometric_stiffness(&coords, nxx, nyy, nxy);
        let kg_global = transform_stiffness(&kg_local, &t_plate, 18);

        let ndof = plate_dofs.len();
        for i in 0..ndof {
            for j in 0..=i {
                kg.add(plate_dofs[i], plate_dofs[j], kg_global[i * ndof + j]);
            }
        }
    }
}

/// Add quad9 (MITC9) geometric stiffness to a pre-built Kg matrix, given displacements.
pub fn add_quad9_geometric_stiffness_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    kg: &mut KgTriplets,
) {
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();

    for quad9 in crate::ordered::values(&input.quad9s) {
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

        // Membrane resultants from the mechanical strain (SH-5), see the plate above.
        let (alpha, dtu, dtg) = shell_thermal(input, ShellFamily::Quad9, quad9.id);
        let s = crate::element::quad9::quad9_stresses(&coords, &u_local, e, nu, quad9.thickness, alpha, dtu, dtg);
        let nxx = s.sigma_xx * quad9.thickness;
        let nyy = s.sigma_yy * quad9.thickness;
        let nxy = s.tau_xy * quad9.thickness;

        // Build local geometric stiffness
        let kg_local = crate::element::quad9::quad9_geometric_stiffness(&coords, nxx, nyy, nxy);
        let kg_global = transform_stiffness(&kg_local, &t_q9, 54);

        let ndof = q9_dofs.len();
        for i in 0..ndof {
            for j in 0..=i {
                kg.add(q9_dofs[i], q9_dofs[j], kg_global[i * ndof + j]);
            }
        }
    }
}

/// Add solid-shell geometric stiffness to a pre-built Kg matrix, given displacements.
pub fn add_solid_shell_geometric_stiffness_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    kg: &mut KgTriplets,
) {
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();

    for ss in crate::ordered::values(&input.solid_shells) {
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
            for j in 0..=i {
                kg.add(ss_dofs[i], ss_dofs[j], kg_elem[i * ndof + j]);
            }
        }
    }
}

/// Add curved shell geometric stiffness to a pre-built Kg matrix.
pub fn add_curved_shell_geometric_stiffness_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    kg: &mut KgTriplets,
) {
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();

    for cs in crate::ordered::values(&input.curved_shells) {
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

        // Mechanical membrane strain at the mid-surface (SH-5): `curved_shell_stresses`
        // subtracts the free thermal strain α·ΔT_uniform (SH-6), which removes
        // E·α·ΔT/(1−ν) from σ11 and σ22 and nothing from σ12. The gradient has no
        // mid-surface part.
        let (alpha, eps_u, eps_g) = shell_thermal(input, ShellFamily::Curved, cs.id);
        let s = crate::element::curved_shell::curved_shell_stresses(&coords, &dirs, &u_arr, e, nu, cs.thickness, alpha, eps_u, eps_g);
        let nxx = s.sigma_xx * cs.thickness;
        let nyy = s.sigma_yy * cs.thickness;
        let nxy = s.tau_xy * cs.thickness;

        let kg_elem = crate::element::curved_shell::curved_shell_geometric_stiffness(&coords, &dirs, cs.thickness, nxx, nyy, nxy);

        let ndof = cs_dofs.len();
        for i in 0..ndof {
            for j in 0..=i {
                kg.add(cs_dofs[i], cs_dofs[j], kg_elem[i * ndof + j]);
            }
        }
    }
}

/// 6×6 geometric stiffness of a space truss member, `p_over_l` = P/L:
/// P/L·[[G, −G], [−G, G]] with G = I − d dᵀ.
/// Global 6×6 geometric stiffness of a space truss member, `p_over_l` = P/L,
/// `dir` its unit axis: (P/L)·[[G, −G], [−G, G]] with G = I − dir·dirᵀ.
pub fn truss_kg_3d(p_over_l: f64, dir: &[f64; 3]) -> [f64; 36] {
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
    kg_local
}

/// Add 3D geometric stiffness from current displacements.
pub fn add_geometric_stiffness_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    k_global: &mut [f64],
) {
    let n = dof_num.n_total;
    emit_geometric_stiffness_3d(input, dof_num, u, &mut |gi, gj, v| k_global[gi * n + gj] += v);
}

/// Each (global row, global column, value) of the frame, truss and cable geometric stiffness at
/// the displacements `u`, with the axial force taken as EA/L times the elongation.
pub(crate) fn emit_geometric_stiffness_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    emit: &mut dyn FnMut(usize, usize, f64),
) {
    let left_hand = input.left_hand.unwrap_or(false);
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection3D> = crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();
    let dt_by_elem = uniform_dt_3d(input);

    for elem in crate::ordered::values(&input.elements) {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        let e = mat.e * 1000.0;
        let (alpha, dt) = dt_by_elem.get(&elem.id).copied().unwrap_or((DEFAULT_FRAME_THERMAL_ALPHA, 0.0));

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let dir = [dx / l, dy / l, dz / l];
            let ui: Vec<f64> = (0..3).map(|i| dof_num.global_dof(elem.node_i, i).map(|d| u[d]).unwrap_or(0.0)).collect();
            let uj: Vec<f64> = (0..3).map(|i| dof_num.global_dof(elem.node_j, i).map(|d| u[d]).unwrap_or(0.0)).collect();
            let delta: f64 = (0..3).map(|i| (uj[i] - ui[i]) * dir[i]).sum();
            let axial_force = e * sec.a * (delta / l - alpha * dt);
            let kg_local = truss_kg_3d(axial_force / l, &dir);
            let truss_dofs: Vec<usize> = (0..3).map(|i| dof_num.global_dof(elem.node_i, i).unwrap())
                .chain((0..3).map(|i| dof_num.global_dof(elem.node_j, i).unwrap()))
                .collect();
            for i in 0..6 {
                for j in 0..6 {
                    emit(truss_dofs[i], truss_dofs[j], kg_local[i * 6 + j]);
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

            // Axial force from local displacements, less the free thermal strain
            let axial_force = e * sec.a * ((u_local[6] - u_local[0]) / l - alpha * dt);

            // Bending, Wagner and shear-centre terms (14×14 on warping members).
            let (dofs, kg_global) = frame_kg_global_3d(axial_force, l, elem, sec, (&ex, &ey, &ez), dof_num);
            let nd = dofs.len();
            for i in 0..nd {
                for j in 0..nd {
                    emit(dofs[i], dofs[j], kg_global[i * nd + j]);
                }
            }
        }
    }

    // Shells. Their geometric stiffness was assembled for buckling only:
    // P-Delta on a model with slabs or walls left their membrane forces out
    // of the tangent, so a compressed wall strip came back as its linear
    // solution (13% short of the amplified one at P = 0.13·P_cr).
    emit_shell_geometric_stiffness_3d(input, dof_num, u, emit);
}

/// One element's share of the P-Delta geometric stiffness in the affine form the
/// P-Delta certificate uses (`certify::pdelta`):
///
/// `K_G(u) = Σ_e N_e(u)·G_e`,  `N_e(u) = e·a·(δ_e(u)/l − alpha·dt)`,  `δ_e(u) = Σ c·u[dof]`.
///
/// `G_e` is the element's global geometric stiffness at unit axial force, computed
/// by the same element routine the P-Delta tangent uses (so `N·G_e` equals the
/// solver's element matrix up to rounding); all fields are the f64 values the
/// solver works with, taken as exact data by the certificate.
#[derive(Debug, Clone)]
pub struct KgAffineTerm {
    pub element_id: usize,
    /// Global DOFs of the rows/columns of `g`.
    pub dofs: Vec<usize>,
    /// `G_e`, row-major `dofs.len()²`.
    pub g: Vec<f64>,
    /// Elongation coefficients `(global dof, c)`; repeated DOFs are summed.
    pub elongation: Vec<(usize, f64)>,
    pub e: f64,
    pub a: f64,
    pub l: f64,
    pub alpha: f64,
    pub dt: f64,
}

/// Elongation coefficients `T[row_j] − T[row_i]` of an `nd`×`nd` transformation `t`
/// (row-major), on the global DOFs `dofs`. The two rows act on disjoint DOFs, so
/// each coefficient is an entry of `t` (no rounding).
fn elongation_from_rows(t: &[f64], nd: usize, row_i: usize, row_j: usize, dofs: &[usize]) -> Vec<(usize, f64)> {
    let mut out = Vec::new();
    for k in 0..nd {
        if t[row_j * nd + k] != 0.0 {
            out.push((dofs[k], t[row_j * nd + k]));
        }
        if t[row_i * nd + k] != 0.0 {
            out.push((dofs[k], -t[row_i * nd + k]));
        }
    }
    out
}

/// The affine terms of `emit_geometric_stiffness_2d` (frames, trusses, cables).
pub fn geometric_stiffness_terms_2d(input: &SolverInput, dof_num: &DofNumbering) -> Vec<KgAffineTerm> {
    let node_by_id: std::collections::HashMap<usize, &SolverNode> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection> = crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();
    let dt_by_elem = uniform_dt_2d(input);
    let mut terms = Vec::new();
    for elem in crate::ordered::values(&input.elements) {
        let (alpha, dt) = dt_by_elem.get(&elem.id).copied().unwrap_or((DEFAULT_FRAME_THERMAL_ALPHA, 0.0));
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];
        let dx = node_j.x - node_i.x;
        let dy = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0;
        let (dofs, g, elongation) = if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let dofs = vec![
                dof_num.global_dof(elem.node_i, 0).unwrap(),
                dof_num.global_dof(elem.node_i, 1).unwrap(),
                dof_num.global_dof(elem.node_j, 0).unwrap(),
                dof_num.global_dof(elem.node_j, 1).unwrap(),
            ];
            let elongation = vec![(dofs[0], -cos), (dofs[1], -sin), (dofs[2], cos), (dofs[3], sin)];
            (dofs, truss_kg_2d(1.0 / l, cos, sin).to_vec(), elongation)
        } else {
            let dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let t = crate::element::frame_transform_2d(cos, sin);
            let elongation = elongation_from_rows(&t, 6, 0, 3, &dofs);
            (dofs, frame_kg_global_2d(1.0, l, &t, elem), elongation)
        };
        terms.push(KgAffineTerm { element_id: elem.id, dofs, g, elongation, e, a: sec.a, l, alpha, dt });
    }
    terms
}

/// The geometric stiffness of every shell family under the membrane forces of
/// `u` (global axes), emitted as full symmetric entries over all DOFs.
fn emit_shell_geometric_stiffness_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    emit: &mut dyn FnMut(usize, usize, f64),
) {
    if input.plates.is_empty() && input.quads.is_empty() && input.quad9s.is_empty()
        && input.solid_shells.is_empty() && input.curved_shells.is_empty()
    {
        return;
    }
    // Every DOF is kept (the P-Delta reactions read the restrained rows).
    let mut kg = KgTriplets::new(dof_num.n_total);
    add_plate_geometric_stiffness_3d(input, dof_num, u, &mut kg);
    add_quad_geometric_stiffness_3d(input, dof_num, u, &mut kg);
    add_quad9_geometric_stiffness_3d(input, dof_num, u, &mut kg);
    add_solid_shell_geometric_stiffness_3d(input, dof_num, u, &mut kg);
    add_curved_shell_geometric_stiffness_3d(input, dof_num, u, &mut kg);
    // The adders emit each unordered pair once, lower triangle.
    for ((&i, &j), &v) in kg.rows.iter().zip(&kg.cols).zip(&kg.vals) {
        emit(i, j, v);
        if i != j {
            emit(j, i, v);
        }
    }
}

/// The affine terms of `emit_geometric_stiffness_3d` (frames, trusses, cables).
pub fn geometric_stiffness_terms_3d(input: &SolverInput3D, dof_num: &DofNumbering) -> Vec<KgAffineTerm> {
    let left_hand = input.left_hand.unwrap_or(false);
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> = crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection3D> = crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();
    let dt_by_elem = uniform_dt_3d(input);
    let mut terms = Vec::new();
    for elem in crate::ordered::values(&input.elements) {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];
        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        let e = mat.e * 1000.0;
        let (alpha, dt) = dt_by_elem.get(&elem.id).copied().unwrap_or((DEFAULT_FRAME_THERMAL_ALPHA, 0.0));
        let (dofs, g, elongation) = if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let dir = [dx / l, dy / l, dz / l];
            let dofs: Vec<usize> = (0..3)
                .map(|i| dof_num.global_dof(elem.node_i, i).unwrap())
                .chain((0..3).map(|i| dof_num.global_dof(elem.node_j, i).unwrap()))
                .collect();
            let elongation = (0..3).flat_map(|i| [(dofs[i], -dir[i]), (dofs[i + 3], dir[i])]).collect();
            (dofs, truss_kg_3d(1.0 / l, &dir).to_vec(), elongation)
        } else {
            let (ex, ey, ez) = crate::element::compute_local_axes_3d(
                node_i.x, node_i.y, node_i.z,
                node_j.x, node_j.y, node_j.z,
                elem.local_yx, elem.local_yy, elem.local_yz,
                elem.roll_angle, left_hand,
            );
            let t = crate::element::frame_transform_3d(&ex, &ey, &ez);
            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let dofs12: Vec<usize> = if dof_num.dofs_per_node >= 7 {
                DOF_MAP_12_TO_14.iter().map(|&i| elem_dofs[i]).collect()
            } else {
                elem_dofs
            };
            let elongation = elongation_from_rows(&t, 12, 0, 6, &dofs12);
            let (dofs, g) = frame_kg_global_3d(1.0, l, elem, sec, (&ex, &ey, &ez), dof_num);
            (dofs, g, elongation)
        };
        terms.push(KgAffineTerm { element_id: elem.id, dofs, g, elongation, e, a: sec.a, l, alpha, dt });
    }
    terms
}
