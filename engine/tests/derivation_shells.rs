//! Checks written while documenting the shell and plate family (docs/solver/shells.md).
//!
//! Each `sh*` test pins a statement of the document. Tests named after a discrepancy
//! (SH-n) demonstrate it: FIXED ones are regression tests (they failed before the fix),
//! OPEN ones are `#[ignore]`d with the question they raise.

use dedaliano_engine::element::curved_shell::{
    compute_element_directors, curved_shell_consistent_mass, curved_shell_pressure_load, curved_shell_stiffness,
    curved_shell_stiffness_covariant, curved_shell_stiffness_no_ans, curved_shell_stresses, curved_shell_nodal_von_mises,
};
use dedaliano_engine::element::quad::{
    mitc4_local_stiffness, quad_geometric_stiffness, quad_pressure_load,
};
use dedaliano_engine::element::quad9::{
    mitc9_local_stiffness, quad9_nodal_von_mises, quad9_stress_at_nodes, quad9_stresses, quad9_transform_3d,
};
use dedaliano_engine::element::{
    plate_geometric_stiffness, plate_local_stiffness, plate_local_stiffness_thick,
    plate_stress_at_nodes_thermal, plate_stress_recovery,
};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::geometric_stiffness::{
    add_curved_shell_geometric_stiffness_3d, add_plate_geometric_stiffness_3d,
    add_quad9_geometric_stiffness_3d, add_quad_geometric_stiffness_3d, KgTriplets,
};
use dedaliano_engine::solver::linear::solve_3d;
use dedaliano_engine::solver::mass_matrix::{assemble_mass_matrix_3d, assemble_mass_matrix_3d_sparse};
use dedaliano_engine::types::*;
use std::collections::HashMap;

const E_MPA: f64 = 200_000.0;
const E: f64 = E_MPA * 1000.0; // kN/m², what the elements receive

// ───────────────────────────── helpers ─────────────────────────────

fn empty() -> SolverInput3D {
    SolverInput3D {
        nodes: HashMap::new(), materials: HashMap::new(), sections: HashMap::new(), elements: HashMap::new(),
        supports: HashMap::new(), loads: vec![], constraints: vec![], left_hand: None, plates: HashMap::new(),
        quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![], connectors: HashMap::new(), solver_options: None,
        masses: Default::default(),
    }
}

fn with_nodes(nu: f64, pts: &[[f64; 3]]) -> SolverInput3D {
    let mut s = empty();
    s.materials.insert("1".into(), SolverMaterial { id: 1, e: E_MPA, nu });
    for (i, p) in pts.iter().enumerate() {
        s.nodes.insert((i + 1).to_string(), SolverNode3D { id: i + 1, x: p[0], y: p[1], z: p[2] });
    }
    s
}

fn fix(s: &mut SolverInput3D, node_id: usize) {
    s.supports.insert(node_id.to_string(), SolverSupport3D {
        node_id, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None, dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None, rw: None, kw: None, normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
    });
}

fn nodal(s: &mut SolverInput3D, node_id: usize, fz: f64) {
    s.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id, fx: 0.0, fy: 0.0, fz, mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
}

fn thermal(element_id: usize, dt_uniform: f64, dt_gradient: f64) -> SolverPlateThermalLoad {
    SolverPlateThermalLoad { element_id, dt_uniform, dt_gradient, alpha: Some(1e-5) }
}

fn mat_vec(k: &[f64], u: &[f64]) -> Vec<f64> {
    let n = u.len();
    (0..n).map(|i| (0..n).map(|j| k[i * n + j] * u[j]).sum()).collect()
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

fn max_abs(v: &[f64]) -> f64 {
    v.iter().fold(0.0f64, |m, x| m.max(x.abs()))
}

/// Tᵀ·K·T (u_local = T·u_global).
fn to_global(k: &[f64], t: &[f64], n: usize) -> Vec<f64> {
    let mut kt = vec![0.0; n * n];
    for i in 0..n {
        for m in 0..n {
            let kim = k[i * n + m];
            if kim != 0.0 {
                for j in 0..n {
                    kt[i * n + j] += kim * t[m * n + j];
                }
            }
        }
    }
    let mut out = vec![0.0; n * n];
    for m in 0..n {
        for i in 0..n {
            let tmi = t[m * n + i];
            if tmi != 0.0 {
                for j in 0..n {
                    out[i * n + j] += tmi * kt[m * n + j];
                }
            }
        }
    }
    out
}

/// Six rigid motions (6 DOFs per node) about an arbitrary point.
fn rigid_modes(nodes: &[[f64; 3]]) -> Vec<Vec<f64>> {
    let x0 = [0.37, -1.21, 0.83];
    let n = nodes.len() * 6;
    let mut modes = Vec::new();
    for a in 0..3 {
        let mut r = vec![0.0; n];
        for i in 0..nodes.len() {
            r[i * 6 + a] = 1.0;
        }
        modes.push(r);
    }
    for a in 0..3 {
        let mut w = [0.0; 3];
        w[a] = 1.0;
        let mut r = vec![0.0; n];
        for (i, p) in nodes.iter().enumerate() {
            let d = [p[0] - x0[0], p[1] - x0[1], p[2] - x0[2]];
            let u = [w[1] * d[2] - w[2] * d[1], w[2] * d[0] - w[0] * d[2], w[0] * d[1] - w[1] * d[0]];
            for b in 0..3 {
                r[i * 6 + b] = u[b];
                r[i * 6 + 3 + b] = w[b];
            }
        }
        modes.push(r);
    }
    modes
}

/// Worst ‖K·r‖∞ / (‖K‖max·‖r‖∞) over the six rigid motions.
fn rigid_residual(k: &[f64], nodes: &[[f64; 3]]) -> f64 {
    let kmax = max_abs(k);
    rigid_modes(nodes)
        .iter()
        .map(|r| max_abs(&mat_vec(k, r)) / (kmax * max_abs(r)))
        .fold(0.0, f64::max)
}

const FLAT_SQUARE: [[f64; 3]; 4] = [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 1.0, 0.0], [0.0, 1.0, 0.0]];
const EZ_DIRS: [[f64; 3]; 4] = [[0.0, 0.0, 1.0]; 4];

// ───────────────────── SH-1: DKMT thick-plate add-on ─────────────────────

/// SH-1 (OPEN). `plate_local_stiffness_thick` adds α·Ks to the DKT stiffness with
/// γxz = w,x − θy, γyz = w,y + θx. With the model's right-handed rotations
/// (θx = w,y, θy = −w,x) a rigid tilt w = y, θx = 1 gives γyz = 2, not 0, so the
/// "thick" triangle resists a rigid rotation. It is also stiffer than DKT, while its
/// docstring promises shear flexibility. Not called by any solver path.
#[test]
#[ignore = "open question SH-1: DKMT shear B uses the wrong rotation signs and adds stiffness instead of flexibility"]
fn sh1_dkmt_thick_triangle_annihilates_rigid_motions() {
    let c = [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.3, 0.9, 0.0]];
    let k = plate_local_stiffness_thick(&c, E, 0.3, 0.2, 5.0 / 6.0);
    let res = rigid_residual(&k, &c);
    assert!(res < 1e-10, "DKMT triangle: K·r ≠ 0 for a rigid motion, relative residual {res:.3e}");
}

/// Control for SH-1: the DKT+CST triangle itself annihilates the rigid motions.
#[test]
fn sh_dkt_triangle_annihilates_rigid_motions() {
    let c = [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.3, 0.9, 0.0]];
    let k = plate_local_stiffness(&c, E, 0.3, 0.2);
    assert!(rigid_residual(&k, &c) < 1e-10);
}

// ───────────────────── SH-2: curved-shell drilling magnitude ─────────────────────

/// SH-2 (FIXED). The drilling penalty must be γ·∫(θn − ωn)² dA with γ = G·t/1000 in every
/// shell. The curved shell integrated it over the volume (dV = dA·h) with γ already
/// carrying t, giving G·h²/1000 — dimensionally a different quantity, unit-dependent, and
/// h times the flat MITC4 value. On a flat square with normal directors the two
/// elements' drilling diagonals must now agree exactly.
#[test]
fn sh2_curved_shell_drilling_penalty_matches_flat_mitc4() {
    for &h in &[0.05, 0.3, 2.0] {
        let kc = curved_shell_stiffness(&FLAT_SQUARE, &EZ_DIRS, E, 0.3, h);
        let kv = curved_shell_stiffness_covariant(&FLAT_SQUARE, &EZ_DIRS, E, 0.3, h);
        let kf = mitc4_local_stiffness(&FLAT_SQUARE, E, 0.3, h);
        for node in 0..4 {
            let d = node * 6 + 5;
            let (c, v, f) = (kc[d * 24 + d], kv[d * 24 + d], kf[d * 24 + d]);
            assert!((c / f - 1.0).abs() < 1e-12, "h = {h}: curved drilling {c:e} vs MITC4 {f:e} (ratio {})", c / f);
            assert!((v / f - 1.0).abs() < 1e-12, "h = {h}: covariant drilling {v:e} vs MITC4 {f:e}");
        }
    }
}

// ───────────────────── SH-3: curved-shell ANS on skewed elements ─────────────────────

/// Strain energy ½·uᵀKu of the field w = x (all else zero): a constant transverse shear
/// γxz = 1, which every element must represent exactly. Exact: ½·κ·G·h·A.
fn constant_shear_energy(k: &[f64], coords: &[[f64; 3]; 4]) -> f64 {
    let mut u = vec![0.0; 24];
    for i in 0..4 {
        u[i * 6 + 2] = coords[i][0];
    }
    0.5 * dot(&u, &mat_vec(k, &u))
}

/// SH-3 (FIXED). The MITC4 tying in the curved shell maps the tied covariant shears to the
/// local frame with (ĝα·e1)/(|gα||g3|), which is the contravariant gᵅ·e1 only when g1 ⊥ g2.
/// On a skewed element a constant transverse shear then read γ = 1 + cos²φ instead of 1
/// (the element was too stiff in shear). The flat MITC4 uses J⁻¹ and was always right.
#[test]
fn sh3_curved_shell_ans_reproduces_constant_shear_on_a_skewed_element() {
    let (nu, h) = (0.3, 0.1);
    let g = E / (2.0 * (1.0 + nu));
    // Parallelogram, 60° corner angle, area 2·(1.5·sin60°·...) computed below.
    let c = [[0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [2.75, 1.299038105676658, 0.0], [0.75, 1.299038105676658, 0.0]];
    let area = 2.0 * 1.299038105676658;
    let exact = 0.5 * (5.0 / 6.0) * g * h * area;
    let flat = constant_shear_energy(&mitc4_local_stiffness(&c, E, nu, h), &c);
    let no_ans = constant_shear_energy(&curved_shell_stiffness_no_ans(&c, &EZ_DIRS, E, nu, h), &c);
    let ans = constant_shear_energy(&curved_shell_stiffness(&c, &EZ_DIRS, E, nu, h), &c);
    let cov = constant_shear_energy(&curved_shell_stiffness_covariant(&c, &EZ_DIRS, E, nu, h), &c);
    assert!((flat / exact - 1.0).abs() < 1e-10, "MITC4 {flat} vs exact {exact}");
    assert!((no_ans / exact - 1.0).abs() < 1e-10, "curved (no ANS) {no_ans} vs exact {exact}");
    assert!((ans / exact - 1.0).abs() < 1e-10, "curved (ANS) {ans} vs exact {exact}: ratio {}", ans / exact);
    assert!((cov / exact - 1.0).abs() < 1e-10, "curved covariant (ANS) {cov} vs exact {exact}: ratio {}", cov / exact);
}

// ───────────────────── SH-4: rotary inertia axes in assembled mass ─────────────────────

/// Rotational 3×3 block (global rx, ry, rz) of node 1 in the assembled mass.
fn rot_block(input: &SolverInput3D, sparse: bool) -> [[f64; 3]; 3] {
    let dof = DofNumbering::build_3d(input);
    let dens: HashMap<String, f64> = [("1".to_string(), 7850.0)].into_iter().collect();
    let (m, n) = if sparse {
        let csc = assemble_mass_matrix_3d_sparse(input, &dof, &dens);
        (csc.to_dense_symmetric(), dof.n_free)
    } else {
        (assemble_mass_matrix_3d(input, &dof, &dens), dof.n_total)
    };
    let d: Vec<usize> = (3..6).map(|k| dof.global_dof(1, k).unwrap()).collect();
    std::array::from_fn(|a| std::array::from_fn(|b| m[d[a] * n + d[b]]))
}

/// A wall in the global XZ plane: its normal is ±Y, so the rotary inertia ρt³/12 belongs
/// to the in-plane rotations rx and rz and none to ry (the drilling rotation).
fn assert_wall_rotary_inertia(name: &str, b: [[f64; 3]; 3]) {
    let scale = b[0][0].abs().max(b[2][2].abs());
    assert!(scale > 0.0, "{name}: no rotary inertia at all: {b:?}");
    assert!(b[1][1].abs() < 1e-9 * scale, "{name}: rotary inertia on the normal (drilling) axis: {b:?}");
    assert!((b[0][0] / b[2][2] - 1.0).abs() < 1e-9, "{name}: in-plane rotary inertias differ: {b:?}");
}

/// SH-4 (FIXED). Quad and quad9 masses were scattered into the global matrix without the
/// local→global rotation; their translational blocks are isotropic (invariant) but the
/// rotary block diag(ρt³/12, ρt³/12, 0) is local, so a wall got inertia about its own
/// normal and none about one in-plane axis. The curved shell put it on global rx, ry.
#[test]
fn sh4_wall_rotary_inertia_is_about_in_plane_axes() {
    let wall = [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 0.0, 1.0], [0.0, 0.0, 1.0]];
    for sparse in [false, true] {
        let mut s = with_nodes(0.3, &wall);
        s.quads.insert("1".into(), SolverQuadElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: 0.2 });
        assert_wall_rotary_inertia(&format!("MITC4 sparse={sparse}"), rot_block(&s, sparse));

        let mut s = with_nodes(0.3, &wall);
        s.curved_shells.insert("1".into(), SolverCurvedShellElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: 0.2, normals: None });
        assert_wall_rotary_inertia(&format!("curved shell sparse={sparse}"), rot_block(&s, sparse));

        let mut pts = wall.to_vec();
        pts.extend([[0.5, 0.0, 0.0], [1.0, 0.0, 0.5], [0.5, 0.0, 1.0], [0.0, 0.0, 0.5], [0.5, 0.0, 0.5]]);
        let mut s = with_nodes(0.3, &pts);
        s.quad9s.insert("1".into(), SolverQuad9Element { id: 1, nodes: [1, 2, 3, 4, 5, 6, 7, 8, 9], material_id: 1, thickness: 0.2 });
        assert_wall_rotary_inertia(&format!("MITC9 sparse={sparse}"), rot_block(&s, sparse));
    }
}

/// The curved shell's rotary inertia on a horizontal element is unchanged by the SH-4 fix:
/// ρh³/12·∫NᵢNⱼ on rx and ry, nothing on rz.
#[test]
fn sh4_curved_shell_mass_horizontal_unchanged() {
    let (rho, h) = (7.85, 0.2);
    let m = curved_shell_consistent_mass(&FLAT_SQUARE, &EZ_DIRS, rho, h);
    let i00 = 1.0 / 9.0; // ∫N0² over the unit square
    let expect = rho * h * h * h / 12.0 * i00;
    assert!((m[3 * 24 + 3] / expect - 1.0).abs() < 1e-12);
    assert!((m[4 * 24 + 4] / expect - 1.0).abs() < 1e-12);
    assert!(m[5 * 24 + 5].abs() < 1e-15);
    assert!((m[0] / (rho * h * i00) - 1.0).abs() < 1e-12);
}

// ───────────────────── SH-5: geometric stiffness from mechanical strain ─────────────────────

/// Kg (dense, free DOFs = all DOFs) of `input` at the free thermal expansion u = ε·x.
fn kg_at_free_expansion(input: &SolverInput3D, eps: f64, adder: fn(&SolverInput3D, &DofNumbering, &[f64], &mut KgTriplets)) -> Vec<f64> {
    let dof = DofNumbering::build_3d(input);
    let mut u = vec![0.0; dof.n_total];
    for nd in input.nodes.values() {
        let p = [nd.x, nd.y, nd.z];
        for k in 0..3 {
            u[dof.global_dof(nd.id, k).unwrap()] = eps * p[k];
        }
    }
    let mut kg = KgTriplets::new(dof.n_free);
    adder(input, &dof, &u, &mut kg);
    kg.into_csc().to_dense_symmetric()
}

/// SH-5 (FIXED). A free thermal expansion is stress-free and must carry no geometric
/// stiffness. The quad already took Kg from the mechanical strain; the DKT triangle, the
/// MITC9 and the curved shell took it from the total strain, so a heated, unrestrained
/// slab was stiffened (or, cooled, softened) in P-Delta and buckling by its own expansion.
#[test]
fn sh5_free_thermal_expansion_carries_no_geometric_stiffness() {
    let (nu, t, dt) = (0.3, 0.2, 20.0);
    let eps = 1e-5 * dt;
    let n_th = E * eps * t / (1.0 - nu);
    let tri = [[0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [0.5, 1.5, 0.0]];
    let reference = max_abs(&plate_geometric_stiffness(&tri, n_th, n_th, 0.0));

    let mut s = with_nodes(nu, &tri);
    s.plates.insert("1".into(), SolverPlateElement { id: 1, nodes: [1, 2, 3], material_id: 1, thickness: t });
    s.loads.push(SolverLoad3D::PlateThermal(thermal(1, dt, 0.0)));
    let kg = kg_at_free_expansion(&s, eps, add_plate_geometric_stiffness_3d);
    assert!(max_abs(&kg) < 1e-9 * reference, "DKT: Kg {:e} vs Kg(N_th) {reference:e}", max_abs(&kg));

    let quad = [[0.0, 0.0, 0.0], [2.0, 0.1, 0.0], [2.2, 1.5, 0.0], [-0.1, 1.2, 0.0]];
    let reference = max_abs(&quad_geometric_stiffness(&quad, n_th, n_th, 0.0));
    let mut s = with_nodes(nu, &quad);
    s.quads.insert("1".into(), SolverQuadElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: t });
    s.loads.push(SolverLoad3D::QuadThermal(thermal(1, dt, 0.0)));
    let kg = kg_at_free_expansion(&s, eps, add_quad_geometric_stiffness_3d);
    assert!(max_abs(&kg) < 1e-9 * reference, "MITC4: Kg {:e} vs Kg(N_th) {reference:e}", max_abs(&kg));

    let mut s = with_nodes(nu, &quad);
    s.curved_shells.insert("1".into(), SolverCurvedShellElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: t, normals: None });
    s.loads.push(SolverLoad3D::CurvedShellThermal(thermal(1, dt, 0.0)));
    let kg = kg_at_free_expansion(&s, eps, add_curved_shell_geometric_stiffness_3d);
    assert!(max_abs(&kg) < 1e-9 * reference, "curved shell: Kg {:e} vs Kg(N_th) {reference:e}", max_abs(&kg));

    let q9 = [[0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [2.0, 1.5, 0.0], [0.0, 1.5, 0.0], [1.0, 0.0, 0.0], [2.0, 0.75, 0.0], [1.0, 1.5, 0.0], [0.0, 0.75, 0.0], [1.0, 0.75, 0.0]];
    let mut s = with_nodes(nu, &q9);
    s.quad9s.insert("1".into(), SolverQuad9Element { id: 1, nodes: [1, 2, 3, 4, 5, 6, 7, 8, 9], material_id: 1, thickness: t });
    s.loads.push(SolverLoad3D::Quad9Thermal(thermal(1, dt, 0.0)));
    let kg = kg_at_free_expansion(&s, eps, add_quad9_geometric_stiffness_3d);
    assert!(max_abs(&kg) < 1e-9 * reference, "MITC9: Kg {:e} vs Kg(N_th) {reference:e}", max_abs(&kg));
}

// ───────────────────── SH-6: curved-shell moment recovery ─────────────────────

/// SH-6 (FIXED). `curved_shell_stresses` returned mx = my = mxy = 0 whatever the
/// displacement (only the mid-surface membrane stresses were computed), and the solver
/// reported those zeros as the element's moments. A flat curved-shell element in pure
/// bending (θy = κx, w = −κx²/2) must report |mx| = D·κ.
#[test]
fn sh6_curved_shell_reports_bending_moments() {
    let (nu, h, kappa) = (0.3, 0.1, 1e-3);
    let mut u = [0.0; 24];
    for i in 0..4 {
        let x = FLAT_SQUARE[i][0];
        u[i * 6 + 2] = -0.5 * kappa * x * x;
        u[i * 6 + 4] = kappa * x;
    }
    let s = curved_shell_stresses(&FLAT_SQUARE, &EZ_DIRS, &u, E, nu, h, 0.0, 0.0, 0.0);
    let d = E * h.powi(3) / (12.0 * (1.0 - nu * nu));
    assert!(s.mx.abs() > 0.5 * d * kappa, "mx = {} for D·κ = {}", s.mx, d * kappa);
    // The flat curved shell reports what the flat MITC4 reports, sign included.
    let mut ul = [0.0; 24];
    ul.copy_from_slice(&u);
    let q = dedaliano_engine::element::quad::quad_stresses(&FLAT_SQUARE, &ul, E, nu, h, 0.0, 0.0, 0.0);
    for (name, c, m) in [("mx", s.mx, q.mx), ("my", s.my, q.my), ("mxy", s.mxy, q.mxy)] {
        assert!((c - m).abs() <= 1e-6 * (d * kappa), "{name}: curved {c} vs MITC4 {m}");
    }
    // A twisting field, w = κ·x·y (θx = ∂w/∂y, θy = −∂w/∂x): the twisting moment too.
    let mut t = [0.0; 24];
    for i in 0..4 {
        let (x, y) = (FLAT_SQUARE[i][0], FLAT_SQUARE[i][1]);
        t[i * 6 + 2] = kappa * x * y;
        t[i * 6 + 3] = kappa * x;
        t[i * 6 + 4] = -kappa * y;
    }
    let st = curved_shell_stresses(&FLAT_SQUARE, &EZ_DIRS, &t, E, nu, h, 0.0, 0.0, 0.0);
    let qt = dedaliano_engine::element::quad::quad_stresses(&FLAT_SQUARE, &t, E, nu, h, 0.0, 0.0, 0.0);
    assert!(qt.mxy.abs() > 0.1 * d * kappa, "the twisting field twists: MITC4 mxy {}", qt.mxy);
    for (name, c, m) in [("mx", st.mx, qt.mx), ("my", st.my, qt.my), ("mxy", st.mxy, qt.mxy)] {
        assert!((c - m).abs() <= 1e-6 * (d * kappa), "twist {name}: curved {c} vs MITC4 {m}");
    }
}

/// SH-6 (FIXED), the advisory's case (SA-2026-013). A cantilever strip of curved shells,
/// 4 m × 1 m × 0.2 m, clamped at x = 0, 10 kN down at the tip: statics gives the moment
/// P·(L − x)/b at each element centre, 35 kN·m/m at the root element (x = 0.5 m). It was
/// reported as 0.
#[test]
fn sh6_curved_shell_cantilever_reports_the_static_moment() {
    let mut pts = vec![];
    for j in 0..2 {
        for i in 0..5 {
            pts.push([i as f64, j as f64, 0.0]);
        }
    }
    let mut s = with_nodes(0.3, &pts);
    for i in 0..4 {
        let id = i + 1;
        s.curved_shells.insert(id.to_string(), SolverCurvedShellElement { id, nodes: [i + 1, i + 2, i + 7, i + 6], material_id: 1, thickness: 0.2, normals: None });
    }
    fix(&mut s, 1);
    fix(&mut s, 6);
    nodal(&mut s, 5, -5.0);
    nodal(&mut s, 10, -5.0);
    let r = solve_3d(&s).unwrap();
    for q in &r.quad_stresses {
        let x = q.element_id as f64 - 0.5;
        let m = 10.0 * (4.0 - x);
        assert!((q.mx.abs() - m).abs() < 0.02 * m, "element {}: mx = {} vs statics {m}", q.element_id, q.mx);
        assert!(q.my.abs() < 0.35 * m, "element {}: my = {}", q.element_id, q.my);
    }
    eprintln!("root element: {:?}", r.quad_stresses.iter().find(|q| q.element_id == 1).unwrap());
}

/// SH-6 (FIXED), thermal part. Stresses and moments come from the mechanical strain
/// ε − α·(ΔT + ζ·ΔTg/2). A free curved shell under a temperature load (uniform, gradient,
/// two loads on one element) is stress-free; the recovery kept the free strain and
/// reported σ = E·α·ΔT/(1−ν) and the matching moment for unrestrained expansion.
/// A flat element reaches the free state exactly. Where the directors vary (the cylinder's
/// radial normals, a twisted element) the inextensible directors cannot follow a free
/// expansion exactly, so one element keeps a discretization residual (0.5 to 2 % of the
/// restrained value here; on the cylinder it shrinks ≈ angle² for ΔT with the element); it is
/// held under 5 % of the restrained value, which the recovery reported in full before.
#[test]
fn sh6_free_heated_curved_shell_is_stress_free() {
    let (nu, t) = (0.3, 0.2);
    let scale = E * 1e-5 * 20.0 / (1.0 - nu);
    let m_scale = scale * t * t / 6.0;
    // A flat element; a cylindrical patch (R = 3, the nodes on the cylinder at angles 0 and
    // 0.1, with the cylinder's radial normals as directors, so the directors vary and the
    // Jacobian depends on ζ); a twisted (saddle) element with its computed nodal directors.
    let r = 3.0f64;
    let cyl = |a: f64, y: f64| [r * a.sin(), y, r * (1.0 - a.cos())];
    let radial = |a: f64| [-a.sin(), 0.0, a.cos()];
    let flat = [[0.0, 0.0, 0.0], [2.0, 0.1, 0.0], [2.2, 1.5, 0.0], [-0.1, 1.2, 0.0]];
    let curved = [cyl(0.0, 0.0), cyl(0.1, 0.0), cyl(0.1, 1.5), cyl(0.0, 1.5)];
    let cyl_dirs = [radial(0.0), radial(0.1), radial(0.1), radial(0.0)];
    let twisted = [[0.0, 0.0, 0.0], [2.0, 0.0, 0.3], [2.0, 1.5, 0.0], [0.0, 1.5, 0.3]];
    for (name, pts, normals) in [("flat", flat, None), ("cylindrical", curved, Some(cyl_dirs)), ("twisted", twisted, None)] {
        if name == "twisted" {
            let d = compute_element_directors(&pts);
            assert!((0..3).map(|k| (d[0][k] - d[1][k]).abs()).sum::<f64>() > 0.05, "the twisted element's directors vary: {d:?}");
        }
        for loads in [vec![(20.0, 0.0)], vec![(0.0, 20.0)], vec![(10.0, 5.0), (10.0, 5.0)]] {
            let mut s = with_nodes(nu, &pts);
            s.curved_shells.insert("1".into(), SolverCurvedShellElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: t, normals });
            fix(&mut s, 1);
            for &(du, dg) in &loads {
                s.loads.push(SolverLoad3D::CurvedShellThermal(thermal(1, du, dg)));
            }
            let res = solve_3d(&s).unwrap();
            let q = &res.quad_stresses[0];
            let tol = if name == "flat" { 1e-6 } else { 0.05 };
            for v in [q.sigma_xx, q.sigma_yy, q.tau_xy, q.von_mises] {
                assert!(v.abs() < tol * scale, "{name} {loads:?}: σ {q:?} (scale {scale})");
            }
            for v in [q.mx, q.my, q.mxy] {
                assert!(v.abs() < tol * m_scale, "{name} {loads:?}: m {q:?} (scale {m_scale})");
            }
            for v in &q.nodal_von_mises {
                assert!(v.abs() < tol * scale, "{name} {loads:?}: nodal σvm {v}");
            }
        }
    }
}

/// SH-6 (FIXED), thermal part. Fully restrained, the element reports the thermal stress
/// −E·α·ΔT/(1−ν) and the restrained gradient moment, the values the flat MITC4 reports;
/// and a partly restrained flat mesh of curved shells reports the stresses and moments of
/// the same mesh of MITC4s.
#[test]
fn sh6_restrained_heated_curved_shell_matches_mitc4() {
    let (nu, h, alpha, du, dg) = (0.3, 0.2, 1e-5, 20.0, 10.0);
    let u0 = [0.0; 24];
    let c = curved_shell_stresses(&FLAT_SQUARE, &EZ_DIRS, &u0, E, nu, h, alpha, du, dg);
    let q = dedaliano_engine::element::quad::quad_stresses(&FLAT_SQUARE, &u0, E, nu, h, alpha, du, dg);
    let s_th = -E * alpha * du / (1.0 - nu);
    let m_th = E * h * h * alpha * dg / (12.0 * (1.0 - nu));
    assert!((c.sigma_xx - s_th).abs() < 1e-9 * s_th.abs() && (c.sigma_yy - s_th).abs() < 1e-9 * s_th.abs(), "{c:?}");
    assert!(c.tau_xy.abs() < 1e-9 * s_th.abs(), "{c:?}");
    assert!((c.mx.abs() - m_th).abs() < 1e-9 * m_th && (c.my.abs() - m_th).abs() < 1e-9 * m_th, "{c:?} vs |m| {m_th}");
    for (name, a, b, sc) in [("σxx", c.sigma_xx, q.sigma_xx, s_th.abs()), ("σyy", c.sigma_yy, q.sigma_yy, s_th.abs()),
        ("mx", c.mx, q.mx, m_th), ("my", c.my, q.my, m_th), ("mxy", c.mxy, q.mxy, m_th)] {
        assert!((a - b).abs() < 1e-9 * sc, "restrained {name}: curved {a} vs MITC4 {b}");
    }
    let vm = curved_shell_nodal_von_mises(&FLAT_SQUARE, &EZ_DIRS, &u0, E, nu, h, alpha, du);
    for v in vm {
        assert!((v - s_th.abs()).abs() < 1e-9 * s_th.abs(), "restrained nodal σvm {v} vs {}", s_th.abs());
    }

    // A 2×2 flat mesh, one edge clamped and every node on a y-roller, heated: curved shells
    // vs MITC4. Membrane: ε_yy = 0, σ_xx = 0, so σ_yy = −E·α·ΔT exactly for both.
    let mut pts = vec![];
    for j in 0..3 {
        for i in 0..3 {
            pts.push([i as f64, 0.75 * j as f64, 0.0]);
        }
    }
    let elems = [[1, 2, 5, 4], [2, 3, 6, 5], [4, 5, 8, 7], [5, 6, 9, 8]];
    let build = |curved: bool| {
        let mut s = with_nodes(nu, &pts);
        for (k, n) in elems.iter().enumerate() {
            let id = k + 1;
            if curved {
                s.curved_shells.insert(id.to_string(), SolverCurvedShellElement { id, nodes: *n, material_id: 1, thickness: h, normals: None });
                s.loads.push(SolverLoad3D::CurvedShellThermal(thermal(id, du, dg)));
            } else {
                s.quads.insert(id.to_string(), SolverQuadElement { id, nodes: *n, material_id: 1, thickness: h });
                s.loads.push(SolverLoad3D::QuadThermal(thermal(id, du, dg)));
            }
        }
        for n in 1..=9 {
            fix(&mut s, n);
            if ![1, 4, 7].contains(&n) {
                let sup = s.supports.get_mut(&n.to_string()).unwrap();
                (sup.rx, sup.rz, sup.rrx, sup.rry, sup.rrz) = (false, false, false, false, false);
            }
        }
        solve_3d(&s).unwrap()
    };
    let (rc, rq) = (build(true), build(false));
    let by_id = |r: &AnalysisResults3D, id: usize| r.quad_stresses.iter().find(|q| q.element_id == id).unwrap().clone();
    for id in 1..=4 {
        let (a, b) = (by_id(&rc, id), by_id(&rq, id));
        let s_y = -E * alpha * du;
        for (name, x, y, sc) in [("σxx", a.sigma_xx, 0.0, s_th.abs()), ("σyy", a.sigma_yy, s_y, s_th.abs()),
            ("τxy", a.tau_xy, 0.0, s_th.abs()), ("MITC4 σyy", b.sigma_yy, s_y, s_th.abs()),
            ("mx", a.mx, b.mx, m_th), ("my", a.my, b.my, m_th), ("mxy", a.mxy, b.mxy, m_th)] {
            assert!((x - y).abs() < 1e-6 * sc, "mesh element {id} {name}: curved {x} vs {y}\n curved {a:?}\n MITC4 {b:?}");
        }
    }
    let my_max = rc.quad_stresses.iter().map(|q| q.my.abs()).fold(0.0, f64::max);
    assert!(my_max > 0.1 * m_th, "the clamped edge restrains the gradient: max |my| {my_max}");
}

/// A shell load names an element of its own family: a `quadThermal` on a curved shell's id
/// was accepted (the id existed, as a curved shell) and dropped by the quad assembly, so the
/// shell was analysed unheated. Refused now; the curved shell's own load applies.
#[test]
fn shell_loads_must_name_their_own_family() {
    let pts = [[0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [2.0, 1.5, 0.0], [0.0, 1.5, 0.0]];
    let mut s = with_nodes(0.3, &pts);
    s.curved_shells.insert("1".into(), SolverCurvedShellElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: 0.2, normals: None });
    fix(&mut s, 1);
    let mut wrong = s.clone();
    wrong.loads.push(SolverLoad3D::QuadThermal(thermal(1, 20.0, 0.0)));
    let err = solve_3d(&wrong).err().expect("a quad load on a curved shell is refused");
    assert!(err.contains("Quad thermal load: element 1"), "{err}");
    s.loads.push(SolverLoad3D::CurvedShellThermal(thermal(1, 20.0, 0.0)));
    let r = solve_3d(&s).unwrap();
    let ux = r.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    assert!((ux - 1e-5 * 20.0 * 2.0).abs() < 1e-9, "the heated curved shell expands: ux = {ux}");
}

/// The discretization-error samples sum the thermal loads on an element as the load vector
/// does (SH-11): they kept only the last one, so two ΔT = 10 loads on a free shell left a
/// spurious E·α·10/(1−ν) in every sample, read as discretization error.
#[test]
fn discretization_samples_sum_the_thermal_loads_on_a_free_shell() {
    use dedaliano_engine::postprocess::discretization::samples::sample_elements;
    let pts = [[0.0, 0.0, 0.0], [2.0, 0.1, 0.0], [2.2, 1.5, 0.0], [-0.1, 1.2, 0.0]];
    let scale = E * 1e-5 * 20.0 / 0.7;
    for curved in [false, true] {
        let mut s = with_nodes(0.3, &pts);
        if curved {
            s.curved_shells.insert("1".into(), SolverCurvedShellElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: 0.2, normals: None });
            s.loads.push(SolverLoad3D::CurvedShellThermal(thermal(1, 10.0, 5.0)));
            s.loads.push(SolverLoad3D::CurvedShellThermal(thermal(1, 10.0, 5.0)));
        } else {
            s.quads.insert("1".into(), SolverQuadElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: 0.2 });
            s.loads.push(SolverLoad3D::QuadThermal(thermal(1, 10.0, 5.0)));
            s.loads.push(SolverLoad3D::QuadThermal(thermal(1, 10.0, 5.0)));
        }
        fix(&mut s, 1);
        let r = solve_3d(&s).unwrap();
        for el in sample_elements(&s, &r).unwrap() {
            for smp in &el.samples {
                for v in smp.sigma {
                    assert!(v.abs() < 1e-6 * scale, "curved {curved}: sample σ {:?}", smp.sigma);
                }
            }
        }
    }
}

// ───────────────────── SH-7: curved (non-planar) MITC9 ─────────────────────

/// SH-7 (FIXED, #411). The MITC9 projects its nine nodes onto the plane normal to the
/// corner-diagonal `ez` and had no rigid-link (warping) correction, unlike the MITC4. With
/// the midside and centre nodes off that plane (any curved 9-node shell) a rigid rotation
/// about an in-plane axis strained the flat element: relative K·r residual 0.11 on this
/// cylindrical patch. Each node is now tied to its projection by a rigid link (K ← WᵀKW).
#[test]
fn sh7_curved_mitc9_annihilates_rigid_motions() {
    let s = 0.2; // sag of a cylindrical patch, curvature along x
    let c: [[f64; 3]; 9] = [
        [0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [2.0, 2.0, 0.0], [0.0, 2.0, 0.0],
        [1.0, 0.0, s], [2.0, 1.0, 0.0], [1.0, 2.0, s], [0.0, 1.0, 0.0], [1.0, 1.0, s],
    ];
    let k = to_global(&mitc9_local_stiffness(&c, E, 0.3, 0.05), &quad9_transform_3d(&c), 54);
    let res = rigid_residual(&k, &c);
    assert!(res < 1e-10, "curved MITC9: K·r ≠ 0 for a rigid motion, relative residual {res:.3e}");
}

/// A doubly curved, distorted nine-node patch with warped (non-coplanar) corners, tilted
/// out of every coordinate plane: all six rigid motions are annihilated.
const WARPED_Q9: [[f64; 3]; 9] = [
    [0.0, 0.0, 0.05], [2.1, 0.2, -0.04], [2.3, 1.9, 0.06], [-0.1, 1.7, -0.03],
    [1.05, 0.05, 0.22], [2.25, 1.0, 0.18], [1.1, 1.85, 0.25], [-0.05, 0.85, 0.15], [1.0, 0.95, 0.35],
];

fn tilt(c: &[[f64; 3]; 9]) -> [[f64; 3]; 9] {
    // A fixed rotation (about (1, 2, 3), 0.7 rad), so that no axis is special.
    let a = { let n = (1.0f64 + 4.0 + 9.0).sqrt(); [1.0 / n, 2.0 / n, 3.0 / n] };
    let (sn, cs) = 0.7f64.sin_cos();
    c.map(|p| {
        let d = a[0] * p[0] + a[1] * p[1] + a[2] * p[2];
        let x = [a[1] * p[2] - a[2] * p[1], a[2] * p[0] - a[0] * p[2], a[0] * p[1] - a[1] * p[0]];
        std::array::from_fn(|k| p[k] * cs + x[k] * sn + a[k] * d * (1.0 - cs))
    })
}

#[test]
fn sh7_warped_doubly_curved_mitc9_annihilates_rigid_motions() {
    let c = tilt(&WARPED_Q9);
    let k = to_global(&mitc9_local_stiffness(&c, E, 0.3, 0.05), &quad9_transform_3d(&c), 54);
    let res = rigid_residual(&k, &c);
    assert!(res < 1e-10, "warped MITC9: relative residual {res:.3e}");
}

/// The stress recovery sees the same rigid-link-corrected displacements as the stiffness: a
/// rigid motion of a curved MITC9 reports no membrane stress and no moment, at the centroid
/// and at the nodes. Before the fix a 1 mrad rotation of this patch reported a membrane
/// stress of 107 MPa (steel, E = 200 GPa).
#[test]
fn sh7_curved_mitc9_rigid_motion_is_stress_free() {
    let c = tilt(&WARPED_Q9);
    let t = quad9_transform_3d(&c);
    let (nu, h) = (0.3, 0.05);
    for (m, r) in rigid_modes(&c).iter().enumerate() {
        let r: Vec<f64> = r.iter().map(|v| 1e-3 * v).collect();
        let ul: Vec<f64> = (0..54).map(|i| (0..54).map(|j| t[i * 54 + j] * r[j]).sum()).collect();
        let sc = quad9_stresses(&c, &ul, E, nu, h, 0.0, 0.0, 0.0);
        let mut v = vec![sc.sigma_xx, sc.sigma_yy, sc.tau_xy, sc.mx / (h * h), sc.my / (h * h), sc.mxy / (h * h)];
        for ns in quad9_stress_at_nodes(&c, &ul, E, nu, h, 0.0, 0.0, 0.0) {
            v.extend([ns.sigma_xx, ns.sigma_yy, ns.tau_xy, ns.mx / (h * h), ns.my / (h * h), ns.mxy / (h * h)]);
        }
        v.extend(quad9_nodal_von_mises(&c, &ul, E, nu, h, 0.0, 0.0));
        let worst = max_abs(&v);
        assert!(worst < 1e-9 * E * 1e-3, "rigid mode {m}: stress {worst:e} (scale E·1e-3 = {:e})", E * 1e-3);
    }
}

// ───────────────────── SH-9: solid-shell Poisson thickness locking ─────────────────────

/// Solid-shell cantilever strip (nx × 2 elements, L = 4, b = 0.6, t = 0.1), fixed at x = 0,
/// total tip load p (−z). Returns the tip deflection at the strip's centre line.
fn solid_shell_strip_tip(nu: f64, p: f64) -> f64 {
    let (l, b, t, nx, ny) = (4.0, 0.6, 0.1, 8usize, 2usize);
    let bot = |i: usize, j: usize| 1000 + i * (ny + 1) + j;
    let top = |i: usize, j: usize| 2000 + i * (ny + 1) + j;
    let mut s = empty();
    s.materials.insert("1".into(), SolverMaterial { id: 1, e: E_MPA, nu });
    for i in 0..=nx {
        for j in 0..=ny {
            let (x, y) = (l * i as f64 / nx as f64, b * (j as f64 / ny as f64 - 0.5));
            s.nodes.insert(bot(i, j).to_string(), SolverNode3D { id: bot(i, j), x, y, z: -t / 2.0 });
            s.nodes.insert(top(i, j).to_string(), SolverNode3D { id: top(i, j), x, y, z: t / 2.0 });
        }
    }
    for j in 0..=ny {
        fix(&mut s, bot(0, j));
        fix(&mut s, top(0, j));
    }
    let mut id = 1;
    for i in 0..nx {
        for j in 0..ny {
            let q = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)];
            let nodes = [bot(q[0].0, q[0].1), bot(q[1].0, q[1].1), bot(q[2].0, q[2].1), bot(q[3].0, q[3].1),
                         top(q[0].0, q[0].1), top(q[1].0, q[1].1), top(q[2].0, q[2].1), top(q[3].0, q[3].1)];
            s.solid_shells.insert(id.to_string(), SolverSolidShellElement { id, nodes, material_id: 1 });
            id += 1;
        }
    }
    let w = [0.25, 0.5, 0.25];
    for j in 0..=ny {
        nodal(&mut s, bot(nx, j), -p * w[j] / 2.0);
        nodal(&mut s, top(nx, j), -p * w[j] / 2.0);
    }
    let r = solve_3d(&s).unwrap();
    r.displacements.iter().find(|d| d.node_id == bot(nx, 1)).unwrap().uz
}

/// SH-9 (OPEN). The solid shell assumes a thickness strain constant through the thickness
/// (ANS tying at ζ = 0, no EAS), with the full 3D constitutive law. In bending the
/// thickness stress cannot vanish, and the strip is too stiff by up to
/// (1−ν)/((1+ν)(1−2ν))·(1−ν²) ≈ 1.22 at ν = 0.3 (Poisson thickness locking). A
/// narrow strip must deflect at least as much as a plate strip in cylindrical bending,
/// P·L³·(1−ν²)/(3·E·I).
#[test]
#[ignore = "open question SH-9: solid shell has Poisson thickness locking for nu > 0 (no EAS on the thickness strain)"]
fn sh9_solid_shell_strip_does_not_poisson_lock() {
    let nu = 0.3;
    let ei = E * 0.6 * 0.1f64.powi(3) / 12.0;
    let plate_bound = -2.0 * 4.0f64.powi(3) * (1.0 - nu * nu) / (3.0 * ei);
    let tip = solid_shell_strip_tip(nu, 2.0);
    assert!(tip / plate_bound > 0.98, "tip {tip:e} vs cylindrical-bending bound {plate_bound:e}: ratio {}", tip / plate_bound);
}

/// Control for SH-9: at ν = 0 the same strip matches beam theory (no Poisson coupling).
#[test]
fn sh9_solid_shell_strip_matches_beam_at_zero_poisson() {
    let ei = E * 0.6 * 0.1f64.powi(3) / 12.0;
    let beam = -2.0 * 4.0f64.powi(3) / (3.0 * ei);
    let tip = solid_shell_strip_tip(0.0, 2.0);
    assert!((tip / beam - 1.0).abs() < 0.01, "tip {tip:e} vs PL³/3EI {beam:e}");
}

// ───────────────────── SH-10: plate nodal stresses and thermal strain ─────────────────────

/// SH-10 (FIXED). The DKT nodal stresses (which the solver reports as `nodal_von_mises`) were
/// computed from the total strain, while the centroid subtracted the thermal strain. A
/// free, heated triangle reported σ = E·α·ΔT/(1−ν) at its nodes and 0 at its centroid.
#[test]
fn sh10_free_heated_plate_has_zero_nodal_stress() {
    let tri = [[0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [0.5, 1.5, 0.0]];
    let mut s = with_nodes(0.3, &tri);
    s.plates.insert("1".into(), SolverPlateElement { id: 1, nodes: [1, 2, 3], material_id: 1, thickness: 0.2 });
    fix(&mut s, 1);
    s.loads.push(SolverLoad3D::PlateThermal(thermal(1, 20.0, 10.0)));
    let r = solve_3d(&s).unwrap();
    let ps = &r.plate_stresses[0];
    let scale = E * 1e-5 * 20.0 / 0.7;
    assert!(ps.von_mises.abs() < 1e-8 * scale, "centroid σvm = {}", ps.von_mises);
    assert_eq!(ps.nodal_von_mises.len(), 3);
    for v in &ps.nodal_von_mises {
        assert!(v.abs() < 1e-8 * scale, "nodal σvm = {v} for a stress-free plate (scale {scale})");
    }
    // The element routine agrees with the centroid one under a prescribed u.
    let u = [0.0; 18];
    let c = plate_stress_recovery(&tri, E, 0.3, 0.2, &u, 1e-5, 20.0, 10.0);
    for n in plate_stress_at_nodes_thermal(&tri, E, 0.3, 0.2, &u, 1e-5, 20.0, 10.0) {
        assert!((n.sigma_xx - c.sigma_xx).abs() < 1e-9 * scale);
        assert!((n.mx - c.mx).abs() < 1e-9 * scale);
    }
}

// ───────────────────── SH-11: several thermal loads on one element ─────────────────────

/// SH-11 (FIXED). The load vector sums every thermal load on an element, but the stress
/// recovery kept only the last one (HashMap insert). Two ΔT = 10 loads on a free element
/// expand it by α·20 and must leave it stress-free; the recovery subtracted α·10 and
/// reported E·α·10/(1−ν).
#[test]
fn sh11_two_thermal_loads_on_one_free_shell_leave_it_stress_free() {
    let quad = [[0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [2.0, 1.5, 0.0], [0.0, 1.5, 0.0]];
    let scale = E * 1e-5 * 20.0 / 0.7;

    let mut s = with_nodes(0.3, &quad);
    s.quads.insert("1".into(), SolverQuadElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: 0.2 });
    fix(&mut s, 1);
    s.loads.push(SolverLoad3D::QuadThermal(thermal(1, 10.0, 5.0)));
    s.loads.push(SolverLoad3D::QuadThermal(thermal(1, 10.0, 5.0)));
    let r = solve_3d(&s).unwrap();
    let q = &r.quad_stresses[0];
    for v in [q.sigma_xx, q.sigma_yy, q.tau_xy, q.mx, q.my, q.mxy, q.von_mises] {
        assert!(v.abs() < 1e-8 * scale, "MITC4 centroid: {q:?}");
    }
    for v in &q.nodal_von_mises {
        assert!(v.abs() < 1e-8 * scale, "MITC4 nodal σvm {v}");
    }
    for ns in &r.quad_nodal_stresses {
        for v in [ns.sigma_xx, ns.sigma_yy, ns.mx, ns.my] {
            assert!(v.abs() < 1e-8 * scale, "MITC4 nodal: {ns:?}");
        }
    }

    let tri = [[0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [0.5, 1.5, 0.0]];
    let mut s = with_nodes(0.3, &tri);
    s.plates.insert("1".into(), SolverPlateElement { id: 1, nodes: [1, 2, 3], material_id: 1, thickness: 0.2 });
    fix(&mut s, 1);
    s.loads.push(SolverLoad3D::PlateThermal(thermal(1, 10.0, 5.0)));
    s.loads.push(SolverLoad3D::PlateThermal(thermal(1, 10.0, 5.0)));
    let r = solve_3d(&s).unwrap();
    let p = &r.plate_stresses[0];
    for v in [p.sigma_xx, p.sigma_yy, p.tau_xy, p.mx, p.my, p.mxy] {
        assert!(v.abs() < 1e-8 * scale, "DKT centroid: {p:?}");
    }
}

// ───────────────────── verification: statements of the document ─────────────────────

/// Pressure on a warped flat MITC4: the resultant p·A_proj·ez equals p times the exact
/// vector area ½·d13×d24 of the bilinear surface, i.e. the curved shell's p∫(g1×g2)dξdη.
#[test]
fn sh_warped_quad_pressure_resultant_equals_vector_area() {
    let c = [[0.0, 0.0, 0.1], [2.0, 0.2, -0.15], [2.3, 1.7, 0.2], [-0.2, 1.4, -0.1]];
    let p = 3.0;
    let f_flat = quad_pressure_load(&c, p);
    let f_curved = curved_shell_pressure_load(&c, &EZ_DIRS, 0.1, p);
    let d13 = [c[2][0] - c[0][0], c[2][1] - c[0][1], c[2][2] - c[0][2]];
    let d24 = [c[3][0] - c[1][0], c[3][1] - c[1][1], c[3][2] - c[1][2]];
    let va = [
        0.5 * (d13[1] * d24[2] - d13[2] * d24[1]),
        0.5 * (d13[2] * d24[0] - d13[0] * d24[2]),
        0.5 * (d13[0] * d24[1] - d13[1] * d24[0]),
    ];
    for k in 0..3 {
        let rf: f64 = (0..4).map(|i| f_flat[i * 6 + k]).sum();
        let rc: f64 = (0..4).map(|i| f_curved[i * 6 + k]).sum();
        assert!((rf - p * va[k]).abs() < 1e-12, "flat resultant {k}: {rf} vs {}", p * va[k]);
        assert!((rc - p * va[k]).abs() < 1e-12, "curved resultant {k}: {rc} vs {}", p * va[k]);
    }
}

/// Element stiffness symmetry: every shell element matrix is symmetric to round-off.
#[test]
fn sh_shell_stiffnesses_are_symmetric() {
    let q = [[0.0, 0.0, 0.0], [2.0, 0.1, 0.05], [2.2, 1.5, -0.05], [-0.1, 1.2, 0.02]];
    let mats: Vec<(&str, Vec<f64>, usize)> = vec![
        ("DKT", plate_local_stiffness(&[q[0], q[1], q[2]], E, 0.3, 0.1), 18),
        ("MITC4", mitc4_local_stiffness(&q, E, 0.3, 0.1), 24),
        ("curved", curved_shell_stiffness(&q, &dedaliano_engine::element::curved_shell::compute_element_directors(&q), E, 0.3, 0.1), 24),
    ];
    for (name, k, n) in mats {
        let kmax = max_abs(&k);
        for i in 0..n {
            for j in 0..i {
                assert!((k[i * n + j] - k[j * n + i]).abs() <= 1e-13 * kmax, "{name} asymmetric at ({i},{j})");
            }
        }
    }
}

/// Thin-limit (L/t = 1000) cantilever strip, ν = 0, coarse 8×1 mesh: no shear locking.
/// Reference P·L³/(3·E·I) (the shear term is 1e-6 of it).
fn thin_strip_tip(kind: &str) -> f64 {
    let (l, b, t, nx) = (10.0, 1.0, 0.01, 8usize);
    let p = 1e-3;
    let mut s = empty();
    s.materials.insert("1".into(), SolverMaterial { id: 1, e: E_MPA, nu: 0.0 });
    let q9 = kind == "MITC9";
    let (cols, rows) = if q9 { (2 * nx + 1, 3) } else { (nx + 1, 2) };
    let id = |i: usize, j: usize| 1 + i * rows + j;
    for i in 0..cols {
        for j in 0..rows {
            let x = l * i as f64 / (cols - 1) as f64;
            let y = b * j as f64 / (rows - 1) as f64;
            s.nodes.insert(id(i, j).to_string(), SolverNode3D { id: id(i, j), x, y, z: 0.0 });
        }
    }
    for j in 0..rows {
        fix(&mut s, id(0, j));
    }
    let mut eid = 1;
    for e in 0..nx {
        match kind {
            "MITC9" => {
                let (i, j) = (2 * e, 0);
                let nodes = [id(i, j), id(i + 2, j), id(i + 2, j + 2), id(i, j + 2), id(i + 1, j), id(i + 2, j + 1), id(i + 1, j + 2), id(i, j + 1), id(i + 1, j + 1)];
                s.quad9s.insert(eid.to_string(), SolverQuad9Element { id: eid, nodes, material_id: 1, thickness: t });
            }
            "DKT" => {
                let n = [id(e, 0), id(e + 1, 0), id(e + 1, 1), id(e, 1)];
                s.plates.insert(eid.to_string(), SolverPlateElement { id: eid, nodes: [n[0], n[1], n[2]], material_id: 1, thickness: t });
                eid += 1;
                s.plates.insert(eid.to_string(), SolverPlateElement { id: eid, nodes: [n[0], n[2], n[3]], material_id: 1, thickness: t });
            }
            "MITC4" => {
                let nodes = [id(e, 0), id(e + 1, 0), id(e + 1, 1), id(e, 1)];
                s.quads.insert(eid.to_string(), SolverQuadElement { id: eid, nodes, material_id: 1, thickness: t });
            }
            _ => {
                let nodes = [id(e, 0), id(e + 1, 0), id(e + 1, 1), id(e, 1)];
                s.curved_shells.insert(eid.to_string(), SolverCurvedShellElement { id: eid, nodes, material_id: 1, thickness: t, normals: None });
            }
        }
        eid += 1;
    }
    let w: Vec<f64> = if q9 { vec![1.0 / 6.0, 4.0 / 6.0, 1.0 / 6.0] } else { vec![0.5, 0.5] };
    for j in 0..rows {
        nodal(&mut s, id(cols - 1, j), -p * w[j]);
    }
    let r = solve_3d(&s).unwrap();
    let tip: f64 = (0..rows).map(|j| r.displacements.iter().find(|d| d.node_id == id(cols - 1, j)).unwrap().uz).sum();
    let ei = E * b * t * t * t / 12.0;
    (tip / rows as f64) / (-p * l * l * l / (3.0 * ei))
}

#[test]
fn sh_thin_cantilever_strip_does_not_shear_lock() {
    for kind in ["MITC4", "MITC9", "DKT", "curved"] {
        let ratio = thin_strip_tip(kind);
        assert!(ratio > 0.95 && ratio < 1.02, "{kind}: tip / PL³/3EI = {ratio}");
    }
}

// ───────────────────── SH-12: curved-shell self-weight units ─────────────────────

/// SH-12 (FIXED). `SolverQuadSelfWeightLoad.density` is in kg/m³ and g in m/s²; the quad and
/// MITC9 divide ρ·g by 1000 to get kN. The curved shell did not, so its self-weight was
/// 1000 times too large. Total vertical load must be ρ·g·t·A/1000 for every shell family.
#[test]
fn sh12_self_weight_is_rho_g_t_area_in_kn_for_every_shell() {
    use dedaliano_engine::element::curved_shell::curved_shell_self_weight_load;
    use dedaliano_engine::element::quad::quad_self_weight_load;
    let (rho, t, g) = (2500.0, 0.2, -9.81);
    let expect = rho * g * t * 1.0 / 1000.0; // unit square
    let fq = quad_self_weight_load(&FLAT_SQUARE, rho, t, 0.0, 0.0, g);
    let fc = curved_shell_self_weight_load(&FLAT_SQUARE, &EZ_DIRS, rho, t, 0.0, 0.0, g);
    let sq: f64 = (0..4).map(|i| fq[i * 6 + 2]).sum();
    let sc: f64 = (0..4).map(|i| fc[i * 6 + 2]).sum();
    assert!((sq / expect - 1.0).abs() < 1e-12, "quad {sq} vs {expect}");
    assert!((sc / expect - 1.0).abs() < 1e-12, "curved shell {sc} vs {expect}");
}

/// SH-11 follow-up (review of #330). Quad and quad9 ids are family-local. When the thermal
/// loads were summed per element (SH-11), a quad and a quad9 with the same id shared one
/// entry, so each was corrected for both loads: two free, equally heated patches reported
/// E·α·ΔT/(1−ν) of fictitious compression. The map is keyed by (family, id).
#[test]
fn sh11_quad_and_quad9_with_the_same_id_keep_their_own_thermal_loads() {
    let pts = [
        // quad, nodes 1..4
        [0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [2.0, 1.5, 0.0], [0.0, 1.5, 0.0],
        // quad9, nodes 5..13 (corners, midsides 5-6, 6-7, 7-8, 8-5, centre), offset in x
        [5.0, 0.0, 0.0], [7.0, 0.0, 0.0], [7.0, 1.5, 0.0], [5.0, 1.5, 0.0],
        [6.0, 0.0, 0.0], [7.0, 0.75, 0.0], [6.0, 1.5, 0.0], [5.0, 0.75, 0.0], [6.0, 0.75, 0.0],
    ];
    let mut s = with_nodes(0.3, &pts);
    s.quads.insert("1".into(), SolverQuadElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: 0.2 });
    s.quad9s.insert("1".into(), SolverQuad9Element { id: 1, nodes: [5, 6, 7, 8, 9, 10, 11, 12, 13], material_id: 1, thickness: 0.2 });
    fix(&mut s, 1);
    fix(&mut s, 5);
    s.loads.push(SolverLoad3D::QuadThermal(thermal(1, 10.0, 5.0)));
    s.loads.push(SolverLoad3D::Quad9Thermal(thermal(1, 10.0, 5.0)));
    let r = solve_3d(&s).unwrap();
    let scale = E * 1e-5 * 10.0 / 0.7;
    assert!(!r.quad_stresses.is_empty());
    for q in &r.quad_stresses {
        for v in [q.sigma_xx, q.sigma_yy, q.tau_xy, q.mx, q.my, q.mxy, q.von_mises] {
            assert!(v.abs() < 1e-8 * scale, "centroid: {q:?}");
        }
        for v in &q.nodal_von_mises {
            assert!(v.abs() < 1e-8 * scale, "nodal σvm {v}");
        }
    }
    for ns in &r.quad_nodal_stresses {
        for v in [ns.sigma_xx, ns.sigma_yy, ns.mx, ns.my] {
            assert!(v.abs() < 1e-8 * scale, "nodal: {ns:?}");
        }
    }
}

// ───────────────────── shell mass: director spins and rotation invariance ─────────────────────

/// Rotation matrix about the unit axis `k` by angle `t` (Rodrigues).
fn rotation(k: [f64; 3], t: f64) -> [[f64; 3]; 3] {
    let n = (k[0] * k[0] + k[1] * k[1] + k[2] * k[2]).sqrt();
    let k = [k[0] / n, k[1] / n, k[2] / n];
    let (c, s) = (t.cos(), t.sin());
    std::array::from_fn(|a| std::array::from_fn(|b| {
        let kx = [[0.0, -k[2], k[1]], [k[2], 0.0, -k[0]], [-k[1], k[0], 0.0]];
        (if a == b { c } else { 0.0 }) + s * kx[a][b] + (1.0 - c) * k[a] * k[b]
    }))
}

fn rot_pt(r: &[[f64; 3]; 3], p: &[f64; 3]) -> [f64; 3] {
    std::array::from_fn(|a| r[a][0] * p[0] + r[a][1] * p[1] + r[a][2] * p[2])
}

/// ‖M_rot − T·M·Tᵀ‖ / ‖M‖ with T the block-diagonal rotation of every 3-vector of DOFs.
fn rotation_defect(m: &[f64], m_rot: &[f64], n: usize, r: &[[f64; 3]; 3]) -> f64 {
    let blk = |i: usize, j: usize| if i / 3 == j / 3 { r[i % 3][j % 3] } else { 0.0 };
    let mut worst = 0.0f64;
    let scale = m.iter().fold(0.0f64, |a, v| a.max(v.abs()));
    for i in 0..n {
        for j in 0..n {
            let mut v = 0.0;
            for a in (i / 3) * 3..(i / 3) * 3 + 3 {
                for b in (j / 3) * 3..(j / 3) * 3 + 3 {
                    v += blk(i, a) * m[a * n + b] * blk(j, b);
                }
            }
            worst = worst.max((m_rot[i * n + j] - v).abs());
        }
    }
    worst / scale
}

/// Review of #330. The curved shell's kinematics turn the director by θ × d_i, so a
/// rotation about the nodal director moves no material and must carry no inertia. The
/// rotary block used the Gauss-point surface normal and gave that spin positive mass
/// wherever the director differs from the local normal (here: node 0 of a quad with one
/// corner raised, director [0,0,1]). The block is now built from the nodal directors.
#[test]
fn sh4_curved_shell_director_spin_has_no_mass() {
    let coords = [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 1.0, 0.4], [0.0, 1.0, 0.0]];
    for dirs in [compute_element_directors(&coords), {
        // a genuinely curved patch with tilted directors
        let d = |v: [f64; 3]| { let n = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt(); [v[0] / n, v[1] / n, v[2] / n] };
        [d([-0.2, -0.1, 1.0]), d([0.3, -0.2, 1.0]), d([0.1, 0.25, 1.0]), d([-0.15, 0.2, 1.0])]
    }] {
        let m = curved_shell_consistent_mass(&coords, &dirs, 7.85, 0.2);
        let scale = m.iter().fold(0.0f64, |a, v| a.max(v.abs()));
        for i in 0..4 {
            let mut v = vec![0.0; 24];
            for a in 0..3 {
                v[i * 6 + 3 + a] = dirs[i][a];
            }
            let mv = mat_vec(&m, &v);
            assert!(max_abs(&mv) < 1e-13 * scale, "director spin at node {i} has inertia: {:?}", &mv);
        }
        // and the rotations about the two axes normal to the director do carry it
        for i in 0..4 {
            let r = i * 6 + 3;
            let tr = m[r * 24 + r] + m[(r + 1) * 24 + r + 1] + m[(r + 2) * 24 + r + 2];
            assert!(tr > 0.0);
        }
    }
}

/// Metamorphic: rotating a shell rigidly in space rotates its mass matrix with it,
/// M' = T·M·Tᵀ, for every shell family through the global assembly (element mass, its
/// local→global transformation and the rotary block).
#[test]
fn shell_mass_is_rotation_invariant() {
    let r = rotation([0.3, -0.7, 0.5], 0.9);
    let dens: HashMap<String, f64> = [("1".to_string(), 7850.0)].into_iter().collect();
    let quad = vec![[0.0, 0.0, 0.0], [2.0, 0.1, 0.0], [2.2, 1.5, 0.0], [-0.1, 1.4, 0.0]];
    let mut q9 = quad.clone();
    for (a, b) in [(0, 1), (1, 2), (2, 3), (3, 0)] {
        q9.push(std::array::from_fn(|k| 0.5 * (quad[a][k] + quad[b][k])));
    }
    q9.push(std::array::from_fn(|k| 0.25 * (0..4).map(|i| quad[i][k]).sum::<f64>()));
    let tri = vec![[0.0, 0.0, 0.0], [2.0, 0.1, 0.0], [0.4, 1.5, 0.0]];
    let curved = vec![[0.0, 0.0, 0.0], [2.0, 0.1, 0.2], [2.2, 1.5, -0.1], [-0.1, 1.4, 0.3]];
    let build = |family: usize, pts: &[[f64; 3]]| {
        let mut s = with_nodes(0.3, pts);
        match family {
            0 => { s.quads.insert("1".into(), SolverQuadElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: 0.2 }); }
            1 => { s.quad9s.insert("1".into(), SolverQuad9Element { id: 1, nodes: [1, 2, 3, 4, 5, 6, 7, 8, 9], material_id: 1, thickness: 0.2 }); }
            2 => { s.plates.insert("1".into(), SolverPlateElement { id: 1, nodes: [1, 2, 3], material_id: 1, thickness: 0.2 }); }
            _ => { s.curved_shells.insert("1".into(), SolverCurvedShellElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: 0.2, normals: None }); }
        }
        s
    };
    for (family, pts) in [(0, &quad), (1, &q9), (2, &tri), (3, &curved)] {
        let rotated: Vec<[f64; 3]> = pts.iter().map(|p| rot_pt(&r, p)).collect();
        let (s0, s1) = (build(family, pts), build(family, &rotated));
        let (d0, d1) = (DofNumbering::build_3d(&s0), DofNumbering::build_3d(&s1));
        let (m0, m1) = (assemble_mass_matrix_3d(&s0, &d0, &dens), assemble_mass_matrix_3d(&s1, &d1, &dens));
        // Reorder both into (node, dof) order.
        let nn = pts.len();
        let n = nn * 6;
        let order = |d: &DofNumbering| -> Vec<usize> {
            (1..=nn).flat_map(|node| (0..6).map(move |k| (node, k))).map(|(node, k)| d.global_dof(node, k).unwrap()).collect()
        };
        let (o0, o1) = (order(&d0), order(&d1));
        let pick = |m: &[f64], o: &[usize], nt: usize| -> Vec<f64> {
            (0..n * n).map(|ij| m[o[ij / n] * nt + o[ij % n]]).collect()
        };
        let a = pick(&m0, &o0, d0.n_total);
        let b = pick(&m1, &o1, d1.n_total);
        let defect = rotation_defect(&a, &b, n, &r);
        assert!(defect < 1e-12, "family {family}: mass not rotation invariant, defect {defect:e}");
    }
}

/// Review of #330 (time history). With the rotary inertia rotated with the element (SH-4),
/// the massless drilling rotation of an oblique shell is a combination of θx, θy, θz while
/// every rotational diagonal of M is positive. The initial acceleration only removed
/// zero-diagonal DOFs, so on such a shell it fell back to diagonal lumping of all of M:
/// a 45°-rotated cantilever quad's initial acceleration was 25% off and M·a = f was violated.
/// Metamorphic check: rotating the model and its load rotates a(0), and M·a(0) = f(0).
#[test]
fn shell_time_history_initial_acceleration_is_rotation_invariant() {
    use dedaliano_engine::solver::time_integration::solve_time_history_3d_traced;
    let pts = [[0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [2.0, 1.0, 0.0], [0.0, 1.0, 0.0], [4.0, 0.0, 0.0], [4.0, 1.0, 0.0]];
    let force = [0.3, -0.5, 1.0];
    let run = |r: &[[f64; 3]; 3]| {
        let rotated: Vec<[f64; 3]> = pts.iter().map(|p| rot_pt(r, p)).collect();
        let mut s = with_nodes(0.3, &rotated);
        s.quads.insert("1".into(), SolverQuadElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: 0.2 });
        s.quads.insert("2".into(), SolverQuadElement { id: 2, nodes: [2, 5, 6, 3], material_id: 1, thickness: 0.2 });
        fix(&mut s, 1);
        fix(&mut s, 4);
        let f = rot_pt(r, &force);
        let input = TimeHistoryInput3D {
            solver: s.clone(), densities: [("1".to_string(), 7850.0)].into_iter().collect(),
            time_step: 1e-3, n_steps: 2, method: "newmark".into(), beta: 0.25, gamma: 0.5, alpha: None,
            damping_xi: None, ground_accel_x: None, ground_accel_y: None, ground_accel_z: None,
            force_history: Some(vec![TimeForceRecord3D { time: 0.0, loads: vec![
                SolverNodalLoad3D { node_id: 5, fx: f[0], fy: f[1], fz: f[2], mx: 0.0, my: 0.0, mz: 0.0, bw: None },
            ] }]),
        };
        let (_, tr) = solve_time_history_3d_traced(&input).unwrap();
        let dof = DofNumbering::build_3d(&s);
        let (a0, f0) = (tr.a[0].clone(), tr.f[0].clone());
        let ma = tr.m.sym_mat_vec(&a0);
        let fmax = max_abs(&f0);
        let res = ma.iter().zip(&f0).fold(0.0f64, |w, (x, y)| w.max((x - y).abs()));
        assert!(res < 1e-9 * fmax, "M·a(0) ≠ f(0): residual {res:e}");
        // global (node, 6) accelerations of the free nodes
        let nodes = [2usize, 3, 5, 6];
        nodes.iter().map(|&nd| std::array::from_fn::<f64, 6, _>(|k| a0[dof.global_dof(nd, k).unwrap()])).collect::<Vec<_>>()
    };
    let id = rotation([1.0, 0.0, 0.0], 0.0);
    let base = run(&id);
    let scale = base.iter().flat_map(|v| v[..3].iter()).fold(0.0f64, |w, x| w.max(x.abs()));
    for r in [rotation([1.0, 0.0, 0.0], std::f64::consts::FRAC_PI_4), rotation([0.3, -0.7, 0.5], 0.9)] {
        let got = run(&r);
        for (b, g) in base.iter().zip(&got) {
            let bt = rot_pt(&r, &[b[0], b[1], b[2]]);
            for k in 0..3 {
                assert!((g[k] - bt[k]).abs() < 1e-8 * scale, "translational a(0) not rotated: {g:?} vs {bt:?}");
            }
        }
    }
}

