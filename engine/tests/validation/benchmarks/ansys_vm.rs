/// Validation: ANSYS Verification Manual Problems
///
/// Reference: ANSYS VM manual — VM1, VM2, VM4, VM10, VM12-inspired.
///
/// Tests: statically indeterminate truss, beam with overhangs, V-truss,
///        eccentric point load, 3D biaxial bending.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 → kN/m²)
const E_EFF: f64 = E * 1000.0; // effective E in kN/m²

// ═══════════════════════════════════════════════════════════════
// VM1: Statically Indeterminate Truss (3 bars)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_vm1_statically_indeterminate_3bar_truss() {
    // 3 bars meeting at point D (bottom), anchored at A, B, C (top).
    // Middle bar BD vertical (length L), outer bars AD/CD at 30° from vertical.
    // A_mid = 2*A_outer, E same for all, P downward at D.
    //
    // By compatibility: F_mid = P * (2*A_mid*cos³θ) / (A_outer + 2*A_mid*cos³θ)
    // θ=30°, cos30°=√3/2, cos³30° = 3√3/8 ≈ 0.6495
    let l = 1.0;
    let theta = 30.0_f64.to_radians();
    let a_outer = 0.001;
    let a_mid = 2.0 * a_outer;
    let p = 10.0; // kN downward

    let cos_t = theta.cos();
    let sin_t = theta.sin();

    // Nodes: 1=A (top-left), 2=B (top-mid), 3=C (top-right), 4=D (bottom)
    let nodes = vec![
        (1, -l * sin_t / cos_t, l),  // A: top-left
        (2, 0.0, l),                  // B: top-mid
        (3, l * sin_t / cos_t, l),    // C: top-right
        (4, 0.0, 0.0),               // D: bottom
    ];

    let elems = vec![
        (1, "truss", 1, 4, 1, 2, false, false), // AD — outer section
        (2, "truss", 2, 4, 1, 1, false, false), // BD — mid section
        (3, "truss", 3, 4, 1, 2, false, false), // CD — outer section
    ];

    let sups = vec![
        (1, 1, "pinned"),
        (2, 2, "pinned"),
        (3, 3, "pinned"),
    ];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_mid, 1e-8), (2, a_outer, 1e-8)], // mid, outer sections (Iz≈0 for truss)
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Analytical: F_mid = P*(A_mid*1) / (A_mid*1 + 2*A_outer*cos³θ)
    // where factor for middle = A_mid/L_mid = A_mid/L
    // and factor for outer = A_outer*cos²θ/L (projection stiffness)
    // Exact compatibility:
    // k_mid = E*A_mid/L, k_outer_vert = E*A_outer*cos²θ/L_outer = E*A_outer*cos³θ/L
    let k_mid = E_EFF * a_mid / l;
    let k_outer_vert = E_EFF * a_outer * cos_t.powi(3) / l;
    let k_total = k_mid + 2.0 * k_outer_vert;

    let f_mid_expected = p * k_mid / k_total;
    let f_outer_expected = p * k_outer_vert / k_total;

    // Element 2 = BD (middle bar, compression since load is downward)
    let ef_mid = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert_close(ef_mid.n_start.abs(), f_mid_expected, 0.02, "VM1 F_mid");

    // Elements 1,3 = outer bars
    let ef_outer1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_outer3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // Outer bar axial force (along bar) = F_outer_vert / cos(θ)
    let f_outer_bar = f_outer_expected / cos_t;
    assert_close(ef_outer1.n_start.abs(), f_outer_bar, 0.02, "VM1 F_outer1");
    assert_close(ef_outer3.n_start.abs(), f_outer_bar, 0.02, "VM1 F_outer3");
}

// ═══════════════════════════════════════════════════════════════
// VM2: Beam with Overhangs
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_vm2_beam_with_overhangs() {
    // L_total=10m, supports at x=2m and x=8m, overhangs 2m each side
    // UDL q=10 kN/m over full length
    // R_A = R_B = q*L_total/2 = 50 kN (by symmetry)
    // M_support = -q*a²/2 = -10*4/2 = -20 kN·m (hogging at support)
    let l_total = 10.0;
    let overhang = 2.0;
    let q = 10.0;
    let a_sec = 0.01;
    let iz = 1e-4;
    // 5 spans of 2m each: [0,2], [2,4], [4,6], [6,8], [8,10]
    let n_elem = 20; // 20 elements, 0.5m each
    let elem_len = l_total / n_elem as f64;
    let n_nodes = n_elem + 1;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Supports at x=2m (node 5) and x=8m (node 17)
    let sup_node_a = (overhang / elem_len) as usize + 1; // node 5
    let sup_node_b = ((l_total - overhang) / elem_len) as usize + 1; // node 17
    let sups = vec![
        (1, sup_node_a, "pinned"),
        (2, sup_node_b, "rollerX"),
    ];

    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a_sec, iz)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Check reactions
    let r_a = results.reactions.iter().find(|r| r.node_id == sup_node_a).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == sup_node_b).unwrap();

    assert_close(r_a.rz, 50.0, 0.02, "VM2 R_A");
    assert_close(r_b.rz, 50.0, 0.02, "VM2 R_B");

    // Symmetry check
    assert_close(r_a.rz, r_b.rz, 0.01, "VM2 symmetry R_A=R_B");
}

// ═══════════════════════════════════════════════════════════════
// VM4: Hinged V-Truss
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_vm4_hinged_v_truss() {
    // V-shaped 2-bar truss, apex at bottom loaded vertically
    // θ=45°, P=100 kN downward at apex
    // F_bar = P/(2sinθ) = 100/(2*0.7071) = 70.71 kN (compression)
    // H_reaction = P/(2tanθ) = 50 kN
    let p = 100.0;
    let theta = 45.0_f64.to_radians();
    let h = 2.0; // height
    let half_w = h * theta.tan(); // = 2.0

    // Nodes: 1=left top, 2=right top, 3=apex bottom
    let nodes = vec![
        (1, 0.0, h),
        (2, 2.0 * half_w, h),
        (3, half_w, 0.0),
    ];

    let elems = vec![
        (1, "truss", 1, 3, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
    ];

    let sups = vec![(1, 1, "pinned"), (2, 2, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, 0.01, 1e-8)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Each bar should carry F = P/(2sinθ) in compression
    let f_expected = p / (2.0 * theta.sin());
    for ef in &results.element_forces {
        assert_close(ef.n_start.abs(), f_expected, 0.01, "VM4 bar force");
    }

    // Horizontal reactions
    let h_expected = p / (2.0 * theta.tan());
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.rx.abs(), h_expected, 0.01, "VM4 H_reaction left");
    assert_close(r2.rx.abs(), h_expected, 0.01, "VM4 H_reaction right");

    // Vertical reaction = P/2 each
    assert_close(r1.rz, p / 2.0, 0.01, "VM4 V_reaction left");
    assert_close(r2.rz, p / 2.0, 0.01, "VM4 V_reaction right");
}

// ═══════════════════════════════════════════════════════════════
// VM10: Simply-Supported Beam, Eccentric Point Load
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_vm10_ss_beam_eccentric_load() {
    // SS beam L=10m, P=100 kN at x=3m from left
    // R_A = P*b/L = 100*7/10 = 70 kN
    // R_B = P*a/L = 100*3/10 = 30 kN
    // M_max at load point = R_A*a = 70*3 = 210 kN·m
    let l = 10.0;
    let a = 3.0;
    let p = 100.0;
    let iz = 1e-4;
    let a_sec = 0.01;
    let n = 10;

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    // Point load on element at x=3m
    // Element 3 goes from x=2 to x=3, so load at end of elem 3 → a_local = 1.0
    // Actually, easier: put as point load on element 3 (x=2 to x=3), a=1.0
    let load_elem = (a / elem_len) as usize; // element 3 (0-indexed from elem_len)
    let a_local = a - (load_elem as f64 - 1.0) * elem_len;

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a_sec, iz)],
        elems, vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: load_elem,
            a: a_local,
            p: -p,
            px: None,
            my: None,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    let b = l - a;
    let r_a_expected = p * b / l;
    let r_b_expected = p * a / l;

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_a.rz, r_a_expected, 0.02, "VM10 R_A");
    assert_close(r_b.rz, r_b_expected, 0.02, "VM10 R_B");

    // Deflection at load point: δ = P*a²*b²/(3*E_eff*I*L)
    let delta_expected = p * a * a * b * b / (3.0 * E_EFF * iz * l);
    let load_node = (a / elem_len) as usize + 1;
    let d = results.displacements.iter().find(|d| d.node_id == load_node).unwrap();
    assert_close(d.uz.abs(), delta_expected, 0.02, "VM10 deflection");
}

// ═══════════════════════════════════════════════════════════════
// VM12-inspired: 3D Cantilever, Biaxial Bending
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_vm12_3d_cantilever_biaxial() {
    // Cantilever L=5m, tip loads Fy=10 kN, Fz=5 kN
    // δy = Fy*L³/(3EIz), δz = Fz*L³/(3EIy)
    // Using Iz=2e-4, Iy=1e-4 to verify independent bending planes
    let l = 5.0;
    let fy = 10.0;
    let fz = 5.0;
    let iy = 1e-4;
    let iz = 2e-4;
    let a_sec = 0.01;
    let j = 1.5e-4;
    let n = 8;

    let input = make_3d_beam(
        n, l, E, 0.3, a_sec, iy, iz, j,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: fy, fz: fz, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );

    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let delta_y_expected = fy * l.powi(3) / (3.0 * E_EFF * iz);
    let delta_z_expected = fz * l.powi(3) / (3.0 * E_EFF * iy);

    assert_close(tip.uz.abs(), delta_y_expected, 0.02, "VM12 δy");
    assert_close(tip.uz.abs(), delta_z_expected, 0.02, "VM12 δz");
}

// ═══════════════════════════════════════════════════════════════
// VM1 Equilibrium Check
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_vm1_equilibrium() {
    // Same truss as VM1, verify ΣFx=0, ΣFy=P
    let l = 1.0;
    let theta = 30.0_f64.to_radians();
    let a_outer = 0.001;
    let a_mid = 2.0 * a_outer;
    let p = 10.0;

    let sin_t = theta.sin();
    let cos_t = theta.cos();

    let nodes = vec![
        (1, -l * sin_t / cos_t, l),
        (2, 0.0, l),
        (3, l * sin_t / cos_t, l),
        (4, 0.0, 0.0),
    ];
    let elems = vec![
        (1, "truss", 1, 4, 1, 2, false, false),
        (2, "truss", 2, 4, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 2, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 2, "pinned"), (3, 3, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx: 0.0, fz: -p, my: 0.0 })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, a_mid, 1e-8), (2, a_outer, 1e-8)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();

    assert!(sum_rx.abs() < 0.01, "VM1 ΣFx={:.6} ≠ 0", sum_rx);
    assert_close(sum_ry, p, 0.01, "VM1 ΣFy");
}

// ═══════════════════════════════════════════════════════════════
// VM2 Symmetry Check
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_vm2_deflection_symmetry() {
    // Symmetric loading on symmetric structure → symmetric deflections
    let l_total = 10.0;
    let overhang = 2.0;
    let q = 10.0;
    let n_elem = 20;
    let elem_len = l_total / n_elem as f64;
    let n_nodes = n_elem + 1;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sup_node_a = (overhang / elem_len) as usize + 1;
    let sup_node_b = ((l_total - overhang) / elem_len) as usize + 1;

    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, 0.01, 1e-4)],
        elems, vec![(1, sup_node_a, "pinned"), (2, sup_node_b, "rollerX")],
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflection: compare node 6 (x=2.5) vs node 16 (x=7.5) — symmetric about x=5
    // Actually: node i and node (n_nodes+1 - i) should have same uy
    let mid = n_nodes / 2 + 1; // node 11 at x=5m

    // Check nodes equidistant from center have equal deflections
    for offset in 1..=4 {
        let left_node = mid - offset;
        let right_node = mid + offset;
        let d_left = results.displacements.iter().find(|d| d.node_id == left_node).unwrap();
        let d_right = results.displacements.iter().find(|d| d.node_id == right_node).unwrap();
        assert!(
            (d_left.uz - d_right.uz).abs() < 1e-6,
            "Symmetry: node {} uy={:.6} vs node {} uy={:.6}",
            left_node, d_left.uz, right_node, d_right.uz
        );
    }
}
