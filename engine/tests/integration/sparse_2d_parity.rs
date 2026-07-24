/// Parity tests for the triplet sparse 2D assembly path (nf >= 64): new
/// `assemble_stiffness_sparse_2d` + sparse Cholesky route vs the legacy dense
/// assembly path (`prepare_static_2d_dense_reference`, which keeps the
/// pre-change dense K_ff + CSC conversion behavior).
///
/// Tolerance: relative 1e-8. Exact `==` is NOT achievable here: the triplet
/// assembler sums duplicate contributions in CSC-sorted order (vs element
/// order in the dense scatter), the factorization sees a different roundoff
/// history, and reactions use the cross-block `sym_mat_vec` formulation
/// instead of dense K_rf/K_rr block matvecs. The agreement is mathematical
/// identity up to floating-point reassociation.
///
/// Modal frequency parity uses relative 1e-6: the sparse shift-invert Lanczos
/// (sparse Cholesky operator) and the dense shift-invert Lanczos (dense
/// Cholesky operator) converge to the same eigenvalues within Lanczos
/// tolerance but with different roundoff histories.

use dedaliano_engine::linalg::{extract_submatrix, lanczos_generalized_eigen};
use dedaliano_engine::solver::assembly::assemble_2d;
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::linear::{prepare_static_2d_dense_reference, solve_2d};
use dedaliano_engine::solver::mass_matrix::assemble_mass_matrix_2d;
use dedaliano_engine::solver::modal::solve_modal_2d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

const REL_TOL: f64 = 1e-8;
const REL_TOL_FREQ: f64 = 1e-6;

fn assert_close(a: f64, b: f64, what: &str) {
    let tol = REL_TOL * a.abs().max(b.abs()).max(1.0);
    assert!(
        (a - b).abs() <= tol,
        "mismatch at {}: {} vs {} (rel diff {:e}, tol {:e})",
        what, a, b, (a - b).abs() / a.abs().max(b.abs()).max(1e-30), tol
    );
}

fn assert_results_close(a: &AnalysisResults, b: &AnalysisResults, ctx: &str) {
    assert_eq!(a.displacements.len(), b.displacements.len(), "{}: disp count", ctx);
    for (da, db) in a.displacements.iter().zip(&b.displacements) {
        assert_eq!(da.node_id, db.node_id);
        assert_close(da.ux, db.ux, &format!("{} disp n{} ux", ctx, da.node_id));
        assert_close(da.uz, db.uz, &format!("{} disp n{} uz", ctx, da.node_id));
        assert_close(da.ry, db.ry, &format!("{} disp n{} ry", ctx, da.node_id));
    }
    assert_eq!(a.reactions.len(), b.reactions.len(), "{}: reaction count", ctx);
    for (ra, rb) in a.reactions.iter().zip(&b.reactions) {
        assert_eq!(ra.node_id, rb.node_id);
        assert_close(ra.rx, rb.rx, &format!("{} reac n{} rx", ctx, ra.node_id));
        assert_close(ra.rz, rb.rz, &format!("{} reac n{} rz", ctx, ra.node_id));
        assert_close(ra.my, rb.my, &format!("{} reac n{} my", ctx, ra.node_id));
    }
    assert_eq!(a.element_forces.len(), b.element_forces.len(), "{}: ef count", ctx);
    for (ea, eb) in a.element_forces.iter().zip(&b.element_forces) {
        assert_eq!(ea.element_id, eb.element_id);
        let c = format!("{} ef{}", ctx, ea.element_id);
        assert_close(ea.n_start, eb.n_start, &format!("{} n_start", c));
        assert_close(ea.n_end, eb.n_end, &format!("{} n_end", c));
        assert_close(ea.v_start, eb.v_start, &format!("{} v_start", c));
        assert_close(ea.v_end, eb.v_end, &format!("{} v_end", c));
        assert_close(ea.m_start, eb.m_start, &format!("{} m_start", c));
        assert_close(ea.m_end, eb.m_end, &format!("{} m_end", c));
    }
}

// ==================== Model builders ====================

fn sup_2d(id: usize, node_id: usize, kind: &str) -> SolverSupport {
    SolverSupport {
        id, node_id, support_type: kind.to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    }
}

/// 8-story × 3-bay 2D frame (nf = 96): fixed bases, one inclined roller with
/// prescribed displacement, one angled spring, plain springs, internal hinges,
/// Timoshenko sections (as_y), prescribed settlements.
fn make_frame_2d_mixed() -> SolverInput {
    let (stories, bays) = (8usize, 3usize);
    let (h, w) = (3.0, 5.0);
    let cols = bays + 1;

    let mut nodes = HashMap::new();
    let mut nid = 1;
    for level in 0..=stories {
        for col in 0..=bays {
            nodes.insert(nid.to_string(), SolverNode {
                id: nid, x: col as f64 * w, z: level as f64 * h,
            });
            nid += 1;
        }
    }

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200e6, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.02, iz: 1.0e-4, as_y: Some(0.01) });

    let mut elements = HashMap::new();
    let mut eid = 1;
    // Columns
    for level in 0..stories {
        for col in 0..=bays {
            let ni = level * cols + col + 1;
            let nj = (level + 1) * cols + col + 1;
            elements.insert(eid.to_string(), SolverElement {
                id: eid, elem_type: "frame".to_string(),
                node_i: ni, node_j: nj,
                material_id: 1, section_id: 1,
                hinge_start: level == 2 && col == 1,
                hinge_end: level == 5 && col == 2,
            });
            eid += 1;
        }
    }
    // Beams
    for level in 1..=stories {
        for bay in 0..bays {
            let ni = level * cols + bay + 1;
            let nj = level * cols + bay + 2;
            elements.insert(eid.to_string(), SolverElement {
                id: eid, elem_type: "frame".to_string(),
                node_i: ni, node_j: nj,
                material_id: 1, section_id: 1,
                hinge_start: level == 3 && bay == 0,
                hinge_end: level == 6 && bay == 2,
            });
            eid += 1;
        }
    }

    let mut supports = HashMap::new();
    for col in 0..=bays {
        let mut s = sup_2d(100 + col, col + 1, "fixed");
        if col == 1 {
            s.dz = Some(-0.004); // prescribed settlement
        }
        if col == 2 {
            s.dry = Some(0.001); // prescribed rotation
        }
        supports.insert((100 + col).to_string(), s);
    }
    // Inclined roller with prescribed displacements at a mid-height corner node
    let mut inc = sup_2d(200, 4 * cols + 1, "inclinedRoller");
    inc.angle = Some(0.4);
    inc.dx = Some(0.002);
    inc.dz = Some(-0.001);
    supports.insert("200".to_string(), inc);
    // Angled spring at the roof corner
    let mut sp = sup_2d(201, stories * cols + 1, "spring");
    sp.kx = Some(5.0e3);
    sp.ky = Some(8.0e3);
    sp.angle = Some(0.25);
    supports.insert("201".to_string(), sp);
    // Plain springs at the other roof corner
    let mut sp2 = sup_2d(202, stories * cols + cols, "spring");
    sp2.kx = Some(3.0e3);
    sp2.kz = Some(1.0e3);
    supports.insert("202".to_string(), sp2);

    SolverInput {
        nodes, materials, sections, elements, supports,
        loads: vec![], constraints: vec![], connectors: HashMap::new(),
    }
}

/// 100-element continuous beam (nf = 299) with springs, hinges, settlement.
fn make_beam_2d_long() -> SolverInput {
    let n_elem = 100usize;
    let mut nodes = HashMap::new();
    for i in 0..=n_elem {
        nodes.insert((i + 1).to_string(), SolverNode { id: i + 1, x: i as f64 * 0.4, z: 0.0 });
    }
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200e6, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.04, iz: 8.0e-5, as_y: None });

    let mut elements = HashMap::new();
    for i in 1..=n_elem {
        elements.insert(i.to_string(), SolverElement {
            id: i, elem_type: "frame".to_string(),
            node_i: i, node_j: i + 1,
            material_id: 1, section_id: 1,
            hinge_start: i == 25,
            hinge_end: i == 75,
        });
    }

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), sup_2d(1, 1, "pinned"));
    let mut s50 = sup_2d(2, 50, "rollerX");
    s50.dz = Some(-0.006);
    supports.insert("2".to_string(), s50);
    supports.insert("3".to_string(), sup_2d(3, 101, "rollerX"));
    let mut sp = sup_2d(4, 30, "spring");
    sp.kx = Some(2.0e3);
    sp.ky = Some(4.0e3);
    sp.kz = Some(500.0);
    supports.insert("4".to_string(), sp);

    SolverInput {
        nodes, materials, sections, elements, supports,
        loads: vec![], constraints: vec![], connectors: HashMap::new(),
    }
}

fn mixed_loads() -> Vec<Vec<SolverLoad>> {
    vec![
        // Gravity: distributed on beams (ids 33..=56) + nodal
        (33..=56).map(|eid| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: eid, q_i: -8.0, q_j: -8.0, a: None, b: None,
        })).chain(vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 20, fx: 0.0, fz: -30.0, my: 0.0 }),
        ]).collect(),
        // Wind + partial distributed + thermal
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 33, fx: 15.0, fz: 0.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 25, fx: 10.0, fz: 0.0, my: 2.0 }),
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 40, q_i: -3.0, q_j: -5.0, a: Some(1.0), b: Some(3.5),
            }),
            SolverLoad::Thermal(SolverThermalLoad { element_id: 5, dt_uniform: 12.0, dt_gradient: 6.0 }),
        ],
        // Point-on-element
        vec![
            SolverLoad::PointOnElement(SolverPointLoadOnElement {
                element_id: 45, a: 2.5, p: -20.0, px: Some(-3.0), my: Some(1.0),
            }),
            SolverLoad::Thermal(SolverThermalLoad { element_id: 50, dt_uniform: -8.0, dt_gradient: 0.0 }),
        ],
    ]
}

// ==================== Solve parity ====================

#[test]
fn parity_sparse_2d_mixed_frame() {
    let base = make_frame_2d_mixed();
    let nf = DofNumbering::build_2d(&base).n_free;
    assert!(nf >= 64, "model must exercise the sparse path, nf = {}", nf);
    let legacy = prepare_static_2d_dense_reference(&base).unwrap();

    for (case, loads) in mixed_loads().into_iter().enumerate() {
        let mut input = base.clone();
        input.loads = loads.clone();
        let new = solve_2d(&input).unwrap();
        assert_eq!(
            new.solver_run_meta.as_ref().unwrap().solver_path, "sparse_cholesky",
            "expected the triplet sparse path"
        );
        let old = legacy.solve_loads(&loads).unwrap();
        assert_results_close(&new, &old, &format!("mixed frame case {}", case));
    }
}

#[test]
fn parity_sparse_2d_long_beam() {
    let base = make_beam_2d_long();
    assert!(DofNumbering::build_2d(&base).n_free >= 64);
    let legacy = prepare_static_2d_dense_reference(&base).unwrap();

    let load_sets: Vec<Vec<SolverLoad>> = vec![
        (1..=100).map(|eid| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: eid, q_i: -6.0, q_j: -6.0, a: None, b: None,
        })).collect(),
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 26, fx: 0.0, fz: -40.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 76, fx: 0.0, fz: -40.0, my: 0.0 }),
            SolverLoad::Thermal(SolverThermalLoad { element_id: 40, dt_uniform: 20.0, dt_gradient: 10.0 }),
        ],
        vec![
            SolverLoad::PointOnElement(SolverPointLoadOnElement {
                element_id: 60, a: 0.2, p: -25.0, px: None, my: None,
            }),
        ],
    ];

    for (case, loads) in load_sets.into_iter().enumerate() {
        let mut input = base.clone();
        input.loads = loads.clone();
        let new = solve_2d(&input).unwrap();
        assert_eq!(new.solver_run_meta.as_ref().unwrap().solver_path, "sparse_cholesky");
        let old = legacy.solve_loads(&loads).unwrap();
        assert_results_close(&new, &old, &format!("long beam case {}", case));
    }
}

// ==================== Modal parity ====================

#[test]
fn parity_modal_2d_frequencies() {
    let input = make_frame_2d_mixed();
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);
    let num_modes = 6;

    // New: sparse assembly + sparse shift-invert Lanczos
    let new = solve_modal_2d(&input, &densities, num_modes).unwrap();

    // Reference: dense assembly + dense Lanczos (previous behavior)
    let dof_num = DofNumbering::build_2d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;
    assert!(nf >= 64);
    let asm = assemble_2d(&input, &dof_num);
    let m_full = assemble_mass_matrix_2d(&input, &dof_num, &densities);
    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);
    let dense_result = lanczos_generalized_eigen(&k_ff, &m_ff, nf, num_modes, 0.0)
        .expect("dense eigen failed");
    let mut dense_freqs: Vec<f64> = dense_result.values.iter()
        .filter(|&&ev| ev > 1e-10)
        .map(|&ev| ev.sqrt() / (2.0 * std::f64::consts::PI))
        .collect();
    dense_freqs.sort_by(|a, b| a.partial_cmp(b).unwrap());

    assert_eq!(new.modes.len(), dense_freqs.len(), "mode count mismatch");
    assert!(!new.modes.is_empty());
    for (i, (m, &df)) in new.modes.iter().zip(&dense_freqs).enumerate() {
        let tol = REL_TOL_FREQ * df.abs().max(1.0);
        assert!(
            (m.frequency - df).abs() <= tol,
            "mode {} frequency mismatch: {} vs {} (rel diff {:e})",
            i, m.frequency, df,
            (m.frequency - df).abs() / df.abs().max(1e-30)
        );
    }
}
