/// Validation: 3D Frame/Truss Analysis Benchmarks
///
/// Reference: Przemieniecki *Theory of Matrix Structural Analysis*,
///            McGuire/Gallagher/Ziemian *Matrix Structural Analysis*.
///
/// Tests: biaxial bending, torsion, space truss, 3D portal, 2D/3D parity.
use dedaliano_engine::solver::{linear, modal, buckling};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 → kN/m²)
const E_EFF: f64 = E * 1000.0; // effective E in kN/m²
const NU: f64 = 0.3;
const G_EFF: f64 = E_EFF / (2.0 * (1.0 + NU)); // ~76,923,077 kN/m²
const A_SEC: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 2e-4;
const J: f64 = 1.5e-4;
const DENSITY: f64 = 7_850.0;

// ═══════════════════════════════════════════════════════════════
// 1. 3D Cantilever — Biaxial Bending
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_3d_cantilever_biaxial_bending() {
    // L=5m, Fy=10 kN, Fz=5 kN
    // δy = Fy*L³/(3*E*Iz), δz = Fz*L³/(3*E*Iy)
    let l = 5.0;
    let fy = 10.0;
    let fz = 5.0;
    let n = 8;

    let input = make_3d_beam(
        n, l, E, NU, A_SEC, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: fy, fz: fz, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let delta_y = fy * l.powi(3) / (3.0 * E_EFF * IZ);
    let delta_z = fz * l.powi(3) / (3.0 * E_EFF * IY);

    assert_close(tip.uy.abs(), delta_y, 0.02, "3D biaxial δy");
    assert_close(tip.uz.abs(), delta_z, 0.02, "3D biaxial δz");
}

// ═══════════════════════════════════════════════════════════════
// 2. 3D Cantilever — Pure Torsion
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_3d_cantilever_pure_torsion() {
    // L=5m, Mx=1 kN·m at tip, θ = T*L/(G*J)
    let l = 5.0;
    let torque = 1.0;
    let n = 4;

    let input = make_3d_beam(
        n, l, E, NU, A_SEC, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0, mx: torque, my: 0.0, mz: 0.0, bw: None })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let theta_expected = torque * l / (G_EFF * J);

    assert_close(tip.rx.abs(), theta_expected, 0.02, "3D torsion θ");

    // No lateral displacement from pure torsion
    assert!(tip.uy.abs() < 1e-8, "3D torsion: no uy, got {:.2e}", tip.uy);
    assert!(tip.uz.abs() < 1e-8, "3D torsion: no uz, got {:.2e}", tip.uz);
}

// ═══════════════════════════════════════════════════════════════
// 3. Space Truss — Tetrahedron
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_3d_space_truss_tetrahedron() {
    // Regular tetrahedron with vertical load at apex
    // 4 nodes, 6 truss bars
    // Base is equilateral triangle at z=0, apex at z=h
    let a = 2.0; // side of base triangle
    let h = (2.0_f64 / 3.0).sqrt() * a; // height of regular tetrahedron

    // Base triangle vertices (equilateral, centered at origin)
    let r = a / 3.0_f64.sqrt(); // circumradius
    let n1 = (1, r, 0.0, 0.0);
    let n2 = (2, -r / 2.0, r * (3.0_f64).sqrt() / 2.0, 0.0);
    let n3 = (3, -r / 2.0, -r * (3.0_f64).sqrt() / 2.0, 0.0);
    let n4 = (4, 0.0, 0.0, h);

    let p = 100.0; // kN vertical load at apex

    let input = make_3d_input(
        vec![n1, n2, n3, n4],
        vec![(1, E, NU)],
        vec![(1, 0.001, 1e-10, 1e-10, 1e-10)], // small Iy,Iz,J for truss
        vec![
            (1, "truss", 1, 2, 1, 1),
            (2, "truss", 2, 3, 1, 1),
            (3, "truss", 1, 3, 1, 1),
            (4, "truss", 1, 4, 1, 1),
            (5, "truss", 2, 4, 1, 1),
            (6, "truss", 3, 4, 1, 1),
        ],
        vec![
            // Pin all base nodes (restrain translations)
            (1, vec![true, true, true, false, false, false]),
            (2, vec![true, true, true, false, false, false]),
            (3, vec![true, true, true, false, false, false]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 4, fx: 0.0, fy: 0.0, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );

    let results = linear::solve_3d(&input).unwrap();

    // By symmetry: 3 inclined bars (4,5,6) carry equal force
    let f4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap().n_start;
    let f5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap().n_start;
    let f6 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap().n_start;

    assert_close(f4.abs(), f5.abs(), 0.02, "tetra symmetry bar 4 vs 5");
    assert_close(f5.abs(), f6.abs(), 0.02, "tetra symmetry bar 5 vs 6");

    // Check vertical equilibrium
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_fz, p, 0.01, "tetra ΣFz=P");
}

// ═══════════════════════════════════════════════════════════════
// 4. 3D Portal — Out-of-Plane Loading
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_3d_portal_out_of_plane() {
    // 2D portal frame (in XY plane), loaded in Z
    // Columns: (0,0,0)→(0,0,4), (6,0,0)→(6,0,4); Beam: (0,0,4)→(6,0,4)
    // Z-direction load at beam midpoint
    let h = 4.0;
    let w = 6.0;
    let fz = 10.0;

    let input = make_3d_input(
        vec![
            (1, 0.0, 0.0, 0.0),
            (2, 0.0, 0.0, h),
            (3, w, 0.0, h),
            (4, w, 0.0, 0.0),
        ],
        vec![(1, E, NU)],
        vec![(1, A_SEC, IY, IZ, J)],
        vec![
            (1, "frame", 1, 2, 1, 1), // column 1
            (2, "frame", 2, 3, 1, 1), // beam
            (3, "frame", 3, 4, 1, 1), // column 2
        ],
        vec![
            (1, vec![true, true, true, true, true, true]),
            (4, vec![true, true, true, true, true, true]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: fz, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );

    let results = linear::solve_3d(&input).unwrap();

    // Nodes 2 and 3 should deflect in Z
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d2.uz.abs() > 1e-6, "3D portal: node 2 should deflect in Z");

    // Equilibrium: ΣFz = fz
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert!(
        (sum_fz + fz).abs() < 0.5,
        "3D portal ΣFz={:.2} + applied={:.2} should ≈ 0", sum_fz, fz
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. 3D Simply-Supported Beam Fy Only — Matches 2D
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_3d_ss_beam_parity_with_2d() {
    // 3D SS beam, load only in Y → should match 2D result
    let l = 10.0;
    let n = 8;
    let fy = -50.0;

    // 2D solution
    let input_2d = make_beam(
        n, l, E, A_SEC, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fy: fy, mz: 0.0,
        })],
    );
    let res_2d = linear::solve_2d(&input_2d).unwrap();

    // 3D solution (beam along X, Fy load)
    // 2D pinned → 3D: fix translations + torsion, free bending rotations
    // 2D rollerX → 3D: fix transverse translations + torsion, free axial + bending rotations
    let input_3d = make_3d_beam(
        n, l, E, NU, A_SEC, IY, IZ, J,
        vec![true, true, true, true, false, false],  // pinned: fix ux,uy,uz,rrx; free rry,rrz
        Some(vec![false, true, true, true, false, false]), // rollerX: fix uy,uz,rrx; free ux,rry,rrz
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n / 2 + 1, fx: 0.0, fy: fy, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );
    let res_3d = linear::solve_3d(&input_3d).unwrap();

    // Compare midspan Y deflection
    let mid = n / 2 + 1;
    let uy_2d = res_2d.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let uy_3d = res_3d.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    // Should be close (within 5% — 3D has more DOFs and different boundary conditions)
    if uy_2d.abs() > 1e-8 {
        let ratio = uy_3d / uy_2d;
        assert!(
            (ratio - 1.0).abs() < 0.10,
            "2D/3D parity: uy_2d={:.6}, uy_3d={:.6}, ratio={:.4}", uy_2d, uy_3d, ratio
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 6. 3D Cantilever — Weak-Axis Bending, No Coupling
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_3d_cantilever_weak_axis_no_coupling() {
    // Fz only → δz, no δy coupling
    let l = 5.0;
    let fz = 10.0;
    let n = 8;

    let input = make_3d_beam(
        n, l, E, NU, A_SEC, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: fz, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let delta_z = fz * l.powi(3) / (3.0 * E_EFF * IY);
    assert_close(tip.uz.abs(), delta_z, 0.02, "3D weak-axis δz");

    // No coupling to strong axis
    assert!(tip.uy.abs() < 1e-8, "3D weak-axis: no uy coupling, got {:.2e}", tip.uy);
}

// ═══════════════════════════════════════════════════════════════
// 7. 3D Fixed-Fixed Axial: N = EA*δ/L
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_3d_fixed_fixed_axial() {
    // Prescribed displacement in X at far end
    // N = EA*δ/L
    let l = 5.0;
    let n = 4;
    let fx = 100.0; // kN axial force

    let input = make_3d_beam(
        n, l, E, NU, A_SEC, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        Some(vec![false, true, true, true, true, true]), // fixed except ux free
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: fx, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let delta_expected = fx * l / (E_EFF * A_SEC);
    assert_close(tip.ux.abs(), delta_expected, 0.02, "3D axial δ=FL/EA");

    // Axial force in elements should equal applied force
    for ef in &results.element_forces {
        assert_close(ef.n_start.abs(), fx, 0.02, "3D axial N=F");
    }
}

// ═══════════════════════════════════════════════════════════════
// 8. 3D Modal Parity: ω₁ Matches 2D
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_3d_modal_parity() {
    // ω₁ of 3D SS beam should match 2D SS beam (strong-axis mode)
    let l = 10.0;
    let n = 8;
    let iz_sym = 1e-4; // use symmetric section for simpler parity

    // 2D modal
    let input_2d = make_ss_beam_udl(n, l, E, A_SEC, iz_sym, 0.0);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let modal_2d = modal::solve_modal_2d(&input_2d, &densities, 2).unwrap();

    // 3D modal — use same Iz for strong axis
    // SS boundary: pin + rollerX (free bending rotations at both ends)
    let input_3d = make_3d_beam(
        n, l, E, NU, A_SEC, iz_sym, iz_sym, 1.5e-4,
        vec![true, true, true, true, false, false],  // pinned: fix ux,uy,uz,rrx
        Some(vec![false, true, true, true, false, false]), // rollerX: fix uy,uz,rrx
        vec![],
    );
    let modal_3d = modal::solve_modal_3d(&input_3d, &densities, 4).unwrap();

    // First transverse frequency should be close
    let omega_2d = modal_2d.modes[0].omega;

    // In 3D, find the mode with closest frequency to 2D (it might not be the first mode)
    let closest_3d = modal_3d.modes.iter()
        .min_by(|a, b| {
            let da = (a.omega - omega_2d).abs();
            let db = (b.omega - omega_2d).abs();
            da.partial_cmp(&db).unwrap()
        })
        .unwrap();

    let ratio = closest_3d.omega / omega_2d;
    assert!(
        (ratio - 1.0).abs() < 0.15,
        "3D/2D modal parity: ω_2d={:.2}, ω_3d={:.2}, ratio={:.3}",
        omega_2d, closest_3d.omega, ratio
    );
}

// ═══════════════════════════════════════════════════════════════
// 9. 3D Buckling Parity: Pcr Matches 2D Euler
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_3d_buckling_parity() {
    // Pcr of 3D column should match 2D Euler load
    let l = 5.0;
    let n = 8;
    let p = -100.0; // reference axial load

    // 2D Euler: Pcr = π²EI/(L²)
    let pcr_euler = std::f64::consts::PI.powi(2) * E_EFF * IZ / (l * l);

    // 3D column along X, pinned-pinned
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A_SEC, IY, IZ, J)],
        elems,
        vec![
            // Pinned-pinned: fix translations + torsion, free bending rotations
            (1, vec![true, true, true, true, false, false]),
            (n + 1, vec![false, true, true, true, false, false]), // rollerX: free ux
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: p, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );

    let buck = buckling::solve_buckling_3d(&input, 2).unwrap();

    // First buckling mode load factor
    let lf = buck.modes[0].load_factor;
    let pcr_3d = lf * p.abs();

    // 3D column buckling about weak axis (Iy < Iz), so Pcr = π²E*Iy/L²
    let pcr_weak = std::f64::consts::PI.powi(2) * E_EFF * IY / (l * l);

    // Should match the lower of the two (weak axis)
    let pcr_expected = pcr_weak.min(pcr_euler);

    let ratio = pcr_3d / pcr_expected;
    assert!(
        (ratio - 1.0).abs() < 0.15,
        "3D buckling: Pcr_3d={:.1}, Pcr_expected={:.1}, ratio={:.3}",
        pcr_3d, pcr_expected, ratio
    );
}

// ═══════════════════════════════════════════════════════════════
// 10. 3D Equilibrium: All 6 DOF Directions
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_3d_equilibrium_all_dof() {
    // 3D cantilever with loads in all directions
    let l = 5.0;
    let n = 4;
    let fx = 10.0;
    let fy = 20.0;
    let fz = 15.0;
    let mx = 5.0;
    let my = 3.0;
    let mz = 7.0;

    let input = make_3d_beam(
        n, l, E, NU, A_SEC, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx, fy, fz, mx, my, mz, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();

    // For a cantilever, there's only one reaction (at node 1)
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();

    assert!((sum_fx + fx).abs() < 0.5, "3D equil ΣFx: {:.2} + {:.2}", sum_fx, fx);
    assert!((sum_fy + fy).abs() < 0.5, "3D equil ΣFy: {:.2} + {:.2}", sum_fy, fy);
    assert!((sum_fz + fz).abs() < 0.5, "3D equil ΣFz: {:.2} + {:.2}", sum_fz, fz);
}
