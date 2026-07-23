/// Bit-for-bit parity tests for the prepared (factorization-reuse) multi-case solver.
///
/// For each model, results from `solve_multi_case_*` (assemble + factorize once,
/// rebuild only the load vector per case) are compared against the legacy
/// behavior: one full `solve_*` per case, combined manually with
/// `combine_results*`. All f64 comparisons are exact (`==`) — the new path is
/// required to reproduce the per-case path bit-for-bit.
///
/// Coverage: 2D dense, 2D sparse (nf >= 64), 3D dense, 3D sparse with shell
/// quads; distributed / nodal / point-on-element / thermal loads, prescribed
/// support displacements, and a 1-case multi-case ≡ single solve check.

use dedaliano_engine::postprocess::combinations::*;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::load_cases::*;
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ==================== Comparison helpers (exact, bit-for-bit) ====================

fn assert_f64_eq(a: f64, b: f64, what: &str) {
    assert!(a == b, "mismatch at {}: {} vs {} (diff {:e})", what, a, b, (a - b).abs());
}

fn assert_results_eq(a: &AnalysisResults, b: &AnalysisResults, ctx: &str) {
    assert_eq!(a.displacements.len(), b.displacements.len(), "{}: displacement count", ctx);
    for (da, db) in a.displacements.iter().zip(&b.displacements) {
        assert_eq!(da.node_id, db.node_id, "{}: disp node_id", ctx);
        assert_f64_eq(da.ux, db.ux, &format!("{} disp node {} ux", ctx, da.node_id));
        assert_f64_eq(da.uz, db.uz, &format!("{} disp node {} uz", ctx, da.node_id));
        assert_f64_eq(da.ry, db.ry, &format!("{} disp node {} ry", ctx, da.node_id));
    }
    assert_eq!(a.reactions.len(), b.reactions.len(), "{}: reaction count", ctx);
    for (ra, rb) in a.reactions.iter().zip(&b.reactions) {
        assert_eq!(ra.node_id, rb.node_id, "{}: reaction node_id", ctx);
        assert_f64_eq(ra.rx, rb.rx, &format!("{} reaction node {} rx", ctx, ra.node_id));
        assert_f64_eq(ra.rz, rb.rz, &format!("{} reaction node {} rz", ctx, ra.node_id));
        assert_f64_eq(ra.my, rb.my, &format!("{} reaction node {} my", ctx, ra.node_id));
    }
    assert_eq!(a.element_forces.len(), b.element_forces.len(), "{}: element_forces count", ctx);
    for (ea, eb) in a.element_forces.iter().zip(&b.element_forces) {
        assert_eq!(ea.element_id, eb.element_id, "{}: ef element_id", ctx);
        let c = format!("{} ef {}", ctx, ea.element_id);
        assert_f64_eq(ea.n_start, eb.n_start, &format!("{} n_start", c));
        assert_f64_eq(ea.n_end, eb.n_end, &format!("{} n_end", c));
        assert_f64_eq(ea.v_start, eb.v_start, &format!("{} v_start", c));
        assert_f64_eq(ea.v_end, eb.v_end, &format!("{} v_end", c));
        assert_f64_eq(ea.m_start, eb.m_start, &format!("{} m_start", c));
        assert_f64_eq(ea.m_end, eb.m_end, &format!("{} m_end", c));
        assert_f64_eq(ea.length, eb.length, &format!("{} length", c));
        assert_f64_eq(ea.q_i, eb.q_i, &format!("{} q_i", c));
        assert_f64_eq(ea.q_j, eb.q_j, &format!("{} q_j", c));
        assert_eq!(ea.hinge_start, eb.hinge_start, "{} hinge_start", c);
        assert_eq!(ea.hinge_end, eb.hinge_end, "{} hinge_end", c);
        assert_eq!(ea.point_loads.len(), eb.point_loads.len(), "{} point_loads len", c);
        for (pa, pb) in ea.point_loads.iter().zip(&eb.point_loads) {
            assert_f64_eq(pa.a, pb.a, &format!("{} pl a", c));
            assert_f64_eq(pa.p, pb.p, &format!("{} pl p", c));
        }
        assert_eq!(ea.distributed_loads.len(), eb.distributed_loads.len(), "{} dist_loads len", c);
        for (dla, dlb) in ea.distributed_loads.iter().zip(&eb.distributed_loads) {
            assert_f64_eq(dla.q_i, dlb.q_i, &format!("{} dl q_i", c));
            assert_f64_eq(dla.q_j, dlb.q_j, &format!("{} dl q_j", c));
            assert_f64_eq(dla.a, dlb.a, &format!("{} dl a", c));
            assert_f64_eq(dla.b, dlb.b, &format!("{} dl b", c));
        }
    }
}

fn assert_results_3d_eq(a: &AnalysisResults3D, b: &AnalysisResults3D, ctx: &str) {
    assert_eq!(a.displacements.len(), b.displacements.len(), "{}: displacement count", ctx);
    for (da, db) in a.displacements.iter().zip(&b.displacements) {
        assert_eq!(da.node_id, db.node_id, "{}: disp node_id", ctx);
        let c = format!("{} disp node {}", ctx, da.node_id);
        assert_f64_eq(da.ux, db.ux, &format!("{} ux", c));
        assert_f64_eq(da.uy, db.uy, &format!("{} uy", c));
        assert_f64_eq(da.uz, db.uz, &format!("{} uz", c));
        assert_f64_eq(da.rx, db.rx, &format!("{} rx", c));
        assert_f64_eq(da.ry, db.ry, &format!("{} ry", c));
        assert_f64_eq(da.rz, db.rz, &format!("{} rz", c));
        assert_eq!(da.warping, db.warping, "{} warping", c);
    }
    assert_eq!(a.reactions.len(), b.reactions.len(), "{}: reaction count", ctx);
    for (ra, rb) in a.reactions.iter().zip(&b.reactions) {
        assert_eq!(ra.node_id, rb.node_id, "{}: reaction node_id", ctx);
        let c = format!("{} reaction node {}", ctx, ra.node_id);
        assert_f64_eq(ra.fx, rb.fx, &format!("{} fx", c));
        assert_f64_eq(ra.fy, rb.fy, &format!("{} fy", c));
        assert_f64_eq(ra.fz, rb.fz, &format!("{} fz", c));
        assert_f64_eq(ra.mx, rb.mx, &format!("{} mx", c));
        assert_f64_eq(ra.my, rb.my, &format!("{} my", c));
        assert_f64_eq(ra.mz, rb.mz, &format!("{} mz", c));
        assert_eq!(ra.bimoment, rb.bimoment, "{} bimoment", c);
    }
    assert_eq!(a.element_forces.len(), b.element_forces.len(), "{}: element_forces count", ctx);
    for (ea, eb) in a.element_forces.iter().zip(&b.element_forces) {
        assert_eq!(ea.element_id, eb.element_id, "{}: ef element_id", ctx);
        let c = format!("{} ef {}", ctx, ea.element_id);
        assert_f64_eq(ea.length, eb.length, &format!("{} length", c));
        assert_f64_eq(ea.n_start, eb.n_start, &format!("{} n_start", c));
        assert_f64_eq(ea.n_end, eb.n_end, &format!("{} n_end", c));
        assert_f64_eq(ea.vy_start, eb.vy_start, &format!("{} vy_start", c));
        assert_f64_eq(ea.vy_end, eb.vy_end, &format!("{} vy_end", c));
        assert_f64_eq(ea.vz_start, eb.vz_start, &format!("{} vz_start", c));
        assert_f64_eq(ea.vz_end, eb.vz_end, &format!("{} vz_end", c));
        assert_f64_eq(ea.mx_start, eb.mx_start, &format!("{} mx_start", c));
        assert_f64_eq(ea.mx_end, eb.mx_end, &format!("{} mx_end", c));
        assert_f64_eq(ea.my_start, eb.my_start, &format!("{} my_start", c));
        assert_f64_eq(ea.my_end, eb.my_end, &format!("{} my_end", c));
        assert_f64_eq(ea.mz_start, eb.mz_start, &format!("{} mz_start", c));
        assert_f64_eq(ea.mz_end, eb.mz_end, &format!("{} mz_end", c));
        assert_f64_eq(ea.q_yi, eb.q_yi, &format!("{} q_yi", c));
        assert_f64_eq(ea.q_yj, eb.q_yj, &format!("{} q_yj", c));
        assert_f64_eq(ea.q_zi, eb.q_zi, &format!("{} q_zi", c));
        assert_f64_eq(ea.q_zj, eb.q_zj, &format!("{} q_zj", c));
        assert_eq!(ea.distributed_loads_y.len(), eb.distributed_loads_y.len(), "{} dly len", c);
        for (x, y) in ea.distributed_loads_y.iter().zip(&eb.distributed_loads_y) {
            assert_f64_eq(x.q_i, y.q_i, &format!("{} dly q_i", c));
            assert_f64_eq(x.q_j, y.q_j, &format!("{} dly q_j", c));
            assert_f64_eq(x.a, y.a, &format!("{} dly a", c));
            assert_f64_eq(x.b, y.b, &format!("{} dly b", c));
        }
        assert_eq!(ea.distributed_loads_z.len(), eb.distributed_loads_z.len(), "{} dlz len", c);
        for (x, y) in ea.distributed_loads_z.iter().zip(&eb.distributed_loads_z) {
            assert_f64_eq(x.q_i, y.q_i, &format!("{} dlz q_i", c));
            assert_f64_eq(x.q_j, y.q_j, &format!("{} dlz q_j", c));
            assert_f64_eq(x.a, y.a, &format!("{} dlz a", c));
            assert_f64_eq(x.b, y.b, &format!("{} dlz b", c));
        }
        assert_eq!(ea.point_loads_y.len(), eb.point_loads_y.len(), "{} ply len", c);
        for (x, y) in ea.point_loads_y.iter().zip(&eb.point_loads_y) {
            assert_f64_eq(x.a, y.a, &format!("{} ply a", c));
            assert_f64_eq(x.p, y.p, &format!("{} ply p", c));
        }
        assert_eq!(ea.point_loads_z.len(), eb.point_loads_z.len(), "{} plz len", c);
        for (x, y) in ea.point_loads_z.iter().zip(&eb.point_loads_z) {
            assert_f64_eq(x.a, y.a, &format!("{} plz a", c));
            assert_f64_eq(x.p, y.p, &format!("{} plz p", c));
        }
    }
    assert_eq!(a.quad_stresses.len(), b.quad_stresses.len(), "{}: quad_stresses count", ctx);
    for (qa, qb) in a.quad_stresses.iter().zip(&b.quad_stresses) {
        assert_eq!(qa.element_id, qb.element_id, "{}: qs element_id", ctx);
        let c = format!("{} qs {}", ctx, qa.element_id);
        assert_f64_eq(qa.sigma_xx, qb.sigma_xx, &format!("{} sigma_xx", c));
        assert_f64_eq(qa.sigma_yy, qb.sigma_yy, &format!("{} sigma_yy", c));
        assert_f64_eq(qa.tau_xy, qb.tau_xy, &format!("{} tau_xy", c));
        assert_f64_eq(qa.von_mises, qb.von_mises, &format!("{} von_mises", c));
    }
}

// ==================== Legacy per-case reference path ====================

fn reference_2d(input: &MultiCaseInput) -> (Vec<AnalysisResults>, Vec<(String, AnalysisResults)>) {
    let mut cases = Vec::new();
    let mut case_map: HashMap<String, usize> = HashMap::new();
    for (idx, lc) in input.load_cases.iter().enumerate() {
        let case_input = SolverInput {
            nodes: input.solver.nodes.clone(),
            materials: input.solver.materials.clone(),
            sections: input.solver.sections.clone(),
            elements: input.solver.elements.clone(),
            supports: input.solver.supports.clone(),
            loads: lc.loads.clone(),
            constraints: vec![],
            connectors: HashMap::new(),
        };
        cases.push(solve_2d(&case_input).expect("reference solve_2d failed"));
        case_map.insert(lc.name.clone(), idx);
    }
    let mut combos = Vec::new();
    for combo in &input.combinations {
        let factors: Vec<CombinationFactor> = combo.factors.iter()
            .filter_map(|(name, &factor)| case_map.get(name)
                .map(|&idx| CombinationFactor { case_id: idx, factor }))
            .collect();
        let cases: Vec<CaseEntry> = cases.iter().enumerate()
            .map(|(idx, r)| CaseEntry { case_id: idx, results: r.clone() })
            .collect();
        let combined = combine_results(&CombinationInput { factors, cases }).unwrap();
        combos.push((combo.name.clone(), combined));
    }
    (cases, combos)
}

fn reference_3d(input: &MultiCaseInput3D) -> (Vec<AnalysisResults3D>, Vec<(String, AnalysisResults3D)>) {
    let mut cases = Vec::new();
    let mut case_map: HashMap<String, usize> = HashMap::new();
    for (idx, lc) in input.load_cases.iter().enumerate() {
        let case_input = SolverInput3D {
            nodes: input.solver.nodes.clone(),
            materials: input.solver.materials.clone(),
            sections: input.solver.sections.clone(),
            elements: input.solver.elements.clone(),
            supports: input.solver.supports.clone(),
            loads: lc.loads.clone(),
            left_hand: input.solver.left_hand,
            plates: input.solver.plates.clone(),
            quads: input.solver.quads.clone(),
            quad9s: input.solver.quad9s.clone(),
            solid_shells: input.solver.solid_shells.clone(),
            curved_shells: input.solver.curved_shells.clone(),
            curved_beams: input.solver.curved_beams.clone(),
            constraints: input.solver.constraints.clone(),
            connectors: HashMap::new(),
        };
        cases.push(solve_3d(&case_input).expect("reference solve_3d failed"));
        case_map.insert(lc.name.clone(), idx);
    }
    let mut combos = Vec::new();
    for combo in &input.combinations {
        let factors: Vec<CombinationFactor> = combo.factors.iter()
            .filter_map(|(name, &factor)| case_map.get(name)
                .map(|&idx| CombinationFactor { case_id: idx, factor }))
            .collect();
        let cases: Vec<CaseEntry3D> = cases.iter().enumerate()
            .map(|(idx, r)| CaseEntry3D { case_id: idx, results: r.clone() })
            .collect();
        let combined = combine_results_3d(&CombinationInput3D { factors, cases }).unwrap();
        combos.push((combo.name.clone(), combined));
    }
    (cases, combos)
}

// ==================== Model builders ====================

fn sup_2d(id: usize, node_id: usize, kind: &str) -> SolverSupport {
    SolverSupport {
        id, node_id, support_type: kind.to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    }
}

/// 2D three-span beam (dense path, nf < 64) with a prescribed-displacement
/// support and an inclined roller (exercises the 2D inclined transform path).
fn make_frame_2d_dense() -> SolverInput {
    let mut nodes = HashMap::new();
    for (id, x) in [(1, 0.0), (2, 3.0), (3, 7.0), (4, 10.0)] {
        nodes.insert(id.to_string(), SolverNode { id, x, z: 0.0 });
    }
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200e6, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.05, iz: 1.0e-4, as_y: None });

    let mut elements = HashMap::new();
    for (id, ni, nj) in [(1, 1, 2), (2, 2, 3), (3, 3, 4)] {
        elements.insert(id.to_string(), SolverElement {
            id, elem_type: "frame".to_string(),
            node_i: ni, node_j: nj,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), sup_2d(1, 1, "pinned"));
    supports.insert("2".to_string(), sup_2d(2, 4, "rollerX"));
    // Prescribed settlement at node 4 (K_fr·u_r coupling exercised per case)
    let mut s4 = sup_2d(3, 4, "rollerX");
    s4.dz = Some(-0.005);
    supports.insert("3".to_string(), s4);
    // Inclined roller at node 2 with prescribed displacement along the normal
    let mut s2 = sup_2d(4, 2, "inclinedRoller");
    s2.angle = Some(0.35);
    s2.dx = Some(0.002);
    s2.dz = Some(-0.001);
    supports.insert("4".to_string(), s2);

    SolverInput {
        nodes, materials, sections, elements, supports,
        loads: vec![], constraints: vec![], connectors: HashMap::new(),
    }
}

/// 2D 30-element continuous beam (sparse path, nf = 89 >= 64).
fn make_beam_2d_sparse() -> SolverInput {
    let n_elem = 30;
    let mut nodes = HashMap::new();
    for i in 0..=n_elem {
        let id = i + 1;
        nodes.insert(id.to_string(), SolverNode { id, x: i as f64 * 0.5, z: 0.0 });
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
            hinge_start: false, hinge_end: false,
        });
    }

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), sup_2d(1, 1, "pinned"));
    supports.insert("2".to_string(), sup_2d(2, 16, "rollerX"));
    supports.insert("3".to_string(), sup_2d(3, 31, "rollerX"));

    SolverInput {
        nodes, materials, sections, elements, supports,
        loads: vec![], constraints: vec![], connectors: HashMap::new(),
    }
}

fn sup_3d(node_id: usize, all_fixed: bool) -> SolverSupport3D {
    SolverSupport3D {
        node_id,
        rx: all_fixed, ry: all_fixed, rz: all_fixed,
        rrx: all_fixed, rry: all_fixed, rrz: all_fixed,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
    }
}

fn frame_elem_3d(id: usize, ni: usize, nj: usize) -> SolverElement3D {
    SolverElement3D {
        id, elem_type: "frame".to_string(),
        node_i: ni, node_j: nj,
        material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false,
        release_mz_start: false, release_mz_end: false,
        release_t_start: false, release_t_end: false,
        local_yx: None, local_yy: None, local_yz: None,
        roll_angle: None,
    }
}

fn section_3d() -> SolverSection3D {
    SolverSection3D {
        id: 1, name: None, a: 0.09,
        iy: 6.75e-4, iz: 6.75e-4, j: 1.0e-3,
        cw: None, as_y: None, as_z: None,
    }
}

/// 3D dense model (nf = 6 < 64): one quad plate on a fixed frame column.
fn make_mixed_3d_dense() -> SolverInput3D {
    let mut nodes = HashMap::new();
    // Quad nodes (slab at z = 3)
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 3.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 4.0, y: 0.0, z: 3.0 });
    nodes.insert("3".to_string(), SolverNode3D { id: 3, x: 4.0, y: 4.0, z: 3.0 });
    nodes.insert("4".to_string(), SolverNode3D { id: 4, x: 0.0, y: 4.0, z: 3.0 });
    // Column base
    nodes.insert("5".to_string(), SolverNode3D { id: 5, x: 0.0, y: 0.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 30_000.0, nu: 0.2 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), section_3d());

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), frame_elem_3d(1, 5, 1));

    let mut quads = HashMap::new();
    quads.insert("1".to_string(), SolverQuadElement {
        id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: 0.2,
    });

    let mut supports = HashMap::new();
    supports.insert("2".to_string(), sup_3d(2, true));
    supports.insert("3".to_string(), sup_3d(3, true));
    supports.insert("4".to_string(), sup_3d(4, true));
    let mut s5 = sup_3d(5, true);
    s5.dz = Some(-0.004); // prescribed settlement at the column base
    supports.insert("5".to_string(), s5);

    SolverInput3D {
        nodes, materials, sections, elements, supports,
        loads: vec![],
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads, quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

/// 3D sparse model (nf = 150 >= 64): 4×4 quad slab on 4 fixed frame columns.
fn make_frame_slab_3d_sparse() -> SolverInput3D {
    let nx = 4;
    let ny = 4;
    let lx = 8.0;
    let ly = 8.0;
    let slab_z = 3.0;

    let mut nodes = HashMap::new();
    let mut nid = 1;
    // Slab grid nodes
    let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
    for i in 0..=nx {
        for j in 0..=ny {
            let x = (i as f64 / nx as f64) * lx;
            let y = (j as f64 / ny as f64) * ly;
            nodes.insert(nid.to_string(), SolverNode3D { id: nid, x, y, z: slab_z });
            grid[i][j] = nid;
            nid += 1;
        }
    }
    // Column base nodes
    let base_xy = [(0.0, 0.0), (lx, 0.0), (lx, ly), (0.0, ly)];
    let mut base_ids = Vec::new();
    for &(x, y) in &base_xy {
        nodes.insert(nid.to_string(), SolverNode3D { id: nid, x, y, z: 0.0 });
        base_ids.push(nid);
        nid += 1;
    }

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 30_000.0, nu: 0.2 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), section_3d());

    // Frame columns at the slab corners
    let corner_nodes = [grid[0][0], grid[nx][0], grid[nx][ny], grid[0][ny]];
    let mut elements = HashMap::new();
    let mut eid = 1;
    for (&base, &top) in base_ids.iter().zip(corner_nodes.iter()) {
        elements.insert(eid.to_string(), frame_elem_3d(eid, base, top));
        eid += 1;
    }
    let n_frames = eid - 1;

    // Quad slab
    let mut quads = HashMap::new();
    let mut qid = 1000;
    for i in 0..nx {
        for j in 0..ny {
            quads.insert(qid.to_string(), SolverQuadElement {
                id: qid,
                nodes: [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]],
                material_id: 1,
                thickness: 0.2,
            });
            qid += 1;
        }
    }
    let n_quads = qid - 1000;

    let mut supports = HashMap::new();
    for (k, &base) in base_ids.iter().enumerate() {
        let mut s = sup_3d(base, true);
        if k == 0 {
            s.dz = Some(-0.006); // prescribed settlement at one base
            s.drx = Some(0.002);
        }
        supports.insert(base.to_string(), s);
    }

    // sanity for the test author
    assert_eq!(n_frames, 4);
    assert_eq!(n_quads, 16);

    SolverInput3D {
        nodes, materials, sections, elements, supports,
        loads: vec![],
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads, quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

// ==================== 2D tests ====================

#[test]
fn parity_2d_dense_multi_case() {
    let input = MultiCaseInput {
        solver: make_frame_2d_dense(),
        load_cases: vec![
            LoadCase {
                name: "Dead".to_string(),
                loads: vec![
                    SolverLoad::Distributed(SolverDistributedLoad {
                        element_id: 1, q_i: -5.0, q_j: -5.0, a: None, b: None,
                    }),
                    SolverLoad::Distributed(SolverDistributedLoad {
                        element_id: 2, q_i: -5.0, q_j: -3.0, a: None, b: None,
                    }),
                    SolverLoad::Distributed(SolverDistributedLoad {
                        element_id: 3, q_i: -4.0, q_j: -4.0, a: Some(0.5), b: Some(2.5),
                    }),
                ],
            },
            LoadCase {
                name: "Live".to_string(),
                loads: vec![
                    SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -20.0, my: 0.0 }),
                    SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -10.0, my: 3.0 }),
                    SolverLoad::PointOnElement(SolverPointLoadOnElement {
                        element_id: 2, a: 2.0, p: -15.0, px: None, my: None,
                    }),
                ],
            },
            LoadCase {
                name: "Thermal".to_string(),
                loads: vec![
                    SolverLoad::Thermal(SolverThermalLoad {
                        element_id: 1, dt_uniform: 15.0, dt_gradient: 8.0,
                    }),
                    SolverLoad::Thermal(SolverThermalLoad {
                        element_id: 3, dt_uniform: -10.0, dt_gradient: 0.0,
                    }),
                ],
            },
            LoadCase {
                name: "Wind".to_string(),
                loads: vec![
                    SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 8.0, fz: 0.0, my: 0.0 }),
                ],
            },
        ],
        combinations: vec![
            CombinationDef {
                name: "1.2D + 1.6L".to_string(),
                factors: [("Dead", 1.2), ("Live", 1.6)].iter()
                    .map(|(n, f)| (n.to_string(), *f)).collect(),
            },
            CombinationDef {
                name: "D + T + W".to_string(),
                factors: [("Dead", 1.0), ("Thermal", 1.0), ("Wind", 1.0)].iter()
                    .map(|(n, f)| (n.to_string(), *f)).collect(),
            },
        ],
    };

    let multi = solve_multi_case_2d(&input).unwrap();
    let (ref_cases, ref_combos) = reference_2d(&input);

    assert_eq!(multi.case_results.len(), ref_cases.len());
    for (mc, rc) in multi.case_results.iter().zip(&ref_cases) {
        assert_results_eq(&mc.results, rc, &format!("case '{}'", mc.name));
    }
    assert_eq!(multi.combination_results.len(), ref_combos.len());
    for (mc, (name, rc)) in multi.combination_results.iter().zip(&ref_combos) {
        assert_eq!(&mc.name, name);
        assert_results_eq(&mc.results, rc, &format!("combo '{}'", mc.name));
    }
}

#[test]
fn parity_2d_sparse_multi_case() {
    let input = MultiCaseInput {
        solver: make_beam_2d_sparse(),
        load_cases: vec![
            LoadCase {
                name: "Dead".to_string(),
                loads: (1..=30).map(|eid| SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: eid, q_i: -6.0, q_j: -6.0, a: None, b: None,
                })).collect(),
            },
            LoadCase {
                name: "Live".to_string(),
                loads: vec![
                    SolverLoad::Nodal(SolverNodalLoad { node_id: 8, fx: 0.0, fz: -25.0, my: 0.0 }),
                    SolverLoad::Nodal(SolverNodalLoad { node_id: 22, fx: 0.0, fz: -25.0, my: 0.0 }),
                    SolverLoad::PointOnElement(SolverPointLoadOnElement {
                        element_id: 20, a: 0.25, p: -12.0, px: Some(-2.0), my: None,
                    }),
                ],
            },
            LoadCase {
                name: "Thermal".to_string(),
                loads: vec![
                    SolverLoad::Thermal(SolverThermalLoad {
                        element_id: 5, dt_uniform: 20.0, dt_gradient: 12.0,
                    }),
                    SolverLoad::Thermal(SolverThermalLoad {
                        element_id: 25, dt_uniform: 0.0, dt_gradient: -15.0,
                    }),
                ],
            },
        ],
        combinations: vec![
            CombinationDef {
                name: "1.2D + 1.6L".to_string(),
                factors: [("Dead", 1.2), ("Live", 1.6)].iter()
                    .map(|(n, f)| (n.to_string(), *f)).collect(),
            },
            CombinationDef {
                name: "D + T".to_string(),
                factors: [("Dead", 1.0), ("Thermal", 1.0)].iter()
                    .map(|(n, f)| (n.to_string(), *f)).collect(),
            },
        ],
    };

    let multi = solve_multi_case_2d(&input).unwrap();
    // Confirm we are on the sparse path (nf = 89 >= 64)
    assert_eq!(
        multi.case_results[0].results.solver_run_meta.as_ref().unwrap().solver_path,
        "sparse_cholesky",
        "expected the sparse path for nf >= 64"
    );

    let (ref_cases, ref_combos) = reference_2d(&input);
    for (mc, rc) in multi.case_results.iter().zip(&ref_cases) {
        assert_results_eq(&mc.results, rc, &format!("case '{}'", mc.name));
    }
    for (mc, (name, rc)) in multi.combination_results.iter().zip(&ref_combos) {
        assert_eq!(&mc.name, name);
        assert_results_eq(&mc.results, rc, &format!("combo '{}'", mc.name));
    }
}

// ==================== 3D tests ====================

#[test]
fn parity_3d_dense_multi_case() {
    let input = MultiCaseInput3D {
        solver: make_mixed_3d_dense(),
        load_cases: vec![
            LoadCase3D {
                name: "Gravity".to_string(),
                loads: vec![
                    SolverLoad3D::Nodal(SolverNodalLoad3D {
                        node_id: 1, fx: 0.0, fy: 0.0, fz: -30.0,
                        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
                    }),
                    SolverLoad3D::Distributed(SolverDistributedLoad3D {
                        element_id: 1, q_yi: -2.0, q_yj: -2.0, q_zi: 0.0, q_zj: 0.0,
                        a: None, b: None,
                    }),
                ],
            },
            LoadCase3D {
                name: "SlabPressure".to_string(),
                loads: vec![
                    SolverLoad3D::QuadPressure(SolverPressureLoad { element_id: 1, pressure: -3.0 }),
                ],
            },
            LoadCase3D {
                name: "Thermal".to_string(),
                loads: vec![
                    SolverLoad3D::Thermal(SolverThermalLoad3D {
                        element_id: 1, dt_uniform: 12.0, dt_gradient_y: 6.0, dt_gradient_z: 0.0,
                    }),
                    SolverLoad3D::QuadThermal(SolverPlateThermalLoad {
                        element_id: 1, dt_uniform: 10.0, dt_gradient: 5.0, alpha: None,
                    }),
                ],
            },
        ],
        combinations: vec![
            CombinationDef {
                name: "G + P".to_string(),
                factors: [("Gravity", 1.0), ("SlabPressure", 1.0)].iter()
                    .map(|(n, f)| (n.to_string(), *f)).collect(),
            },
            CombinationDef {
                name: "1.2G + 1.5P + 0.9T".to_string(),
                factors: [("Gravity", 1.2), ("SlabPressure", 1.5), ("Thermal", 0.9)].iter()
                    .map(|(n, f)| (n.to_string(), *f)).collect(),
            },
        ],
    };

    let multi = solve_multi_case_3d(&input).unwrap();
    assert_eq!(
        multi.case_results[0].results.solver_run_meta.as_ref().unwrap().solver_path,
        "dense_lu",
        "expected the dense path for nf < 64"
    );

    let (ref_cases, ref_combos) = reference_3d(&input);
    for (mc, rc) in multi.case_results.iter().zip(&ref_cases) {
        assert_results_3d_eq(&mc.results, rc, &format!("case '{}'", mc.name));
    }
    for (mc, (name, rc)) in multi.combination_results.iter().zip(&ref_combos) {
        assert_eq!(&mc.name, name);
        assert_results_3d_eq(&mc.results, rc, &format!("combo '{}'", mc.name));
    }
}

#[test]
fn parity_3d_sparse_multi_case() {
    let input = MultiCaseInput3D {
        solver: make_frame_slab_3d_sparse(),
        load_cases: vec![
            LoadCase3D {
                name: "Gravity".to_string(),
                loads: vec![
                    SolverLoad3D::Nodal(SolverNodalLoad3D {
                        node_id: 13, fx: 0.0, fy: 0.0, fz: -40.0,
                        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
                    }),
                    SolverLoad3D::Distributed(SolverDistributedLoad3D {
                        element_id: 1, q_yi: -3.0, q_yj: -3.0, q_zi: 0.0, q_zj: 0.0,
                        a: None, b: None,
                    }),
                    SolverLoad3D::Distributed(SolverDistributedLoad3D {
                        element_id: 3, q_yi: 0.0, q_yj: 0.0, q_zi: -1.5, q_zj: -2.5,
                        a: Some(0.5), b: Some(2.0),
                    }),
                ],
            },
            LoadCase3D {
                name: "SlabPressure".to_string(),
                loads: (1000..1016).map(|qid| SolverLoad3D::QuadPressure(
                    SolverPressureLoad { element_id: qid, pressure: -2.5 },
                )).collect(),
            },
            LoadCase3D {
                name: "Thermal".to_string(),
                loads: vec![
                    SolverLoad3D::Thermal(SolverThermalLoad3D {
                        element_id: 2, dt_uniform: 18.0, dt_gradient_y: 4.0, dt_gradient_z: -3.0,
                    }),
                    SolverLoad3D::QuadThermal(SolverPlateThermalLoad {
                        element_id: 1006, dt_uniform: 15.0, dt_gradient: 6.0, alpha: None,
                    }),
                ],
            },
            LoadCase3D {
                name: "Wind".to_string(),
                loads: vec![
                    SolverLoad3D::Nodal(SolverNodalLoad3D {
                        node_id: 5, fx: 12.0, fy: 0.0, fz: 0.0,
                        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
                    }),
                    SolverLoad3D::PointOnElement(SolverPointLoad3D {
                        element_id: 4, a: 1.5, py: 8.0, pz: 0.0,
                    }),
                ],
            },
        ],
        combinations: vec![
            CombinationDef {
                name: "1.2G + 1.6P".to_string(),
                factors: [("Gravity", 1.2), ("SlabPressure", 1.6)].iter()
                    .map(|(n, f)| (n.to_string(), *f)).collect(),
            },
            CombinationDef {
                name: "G + P + T + W".to_string(),
                factors: [("Gravity", 1.0), ("SlabPressure", 1.0), ("Thermal", 1.0), ("Wind", 1.0)].iter()
                    .map(|(n, f)| (n.to_string(), *f)).collect(),
            },
        ],
    };

    let multi = solve_multi_case_3d(&input).unwrap();
    assert_eq!(
        multi.case_results[0].results.solver_run_meta.as_ref().unwrap().solver_path,
        "sparse_cholesky",
        "expected the sparse path for nf >= 64"
    );

    let (ref_cases, ref_combos) = reference_3d(&input);
    for (mc, rc) in multi.case_results.iter().zip(&ref_cases) {
        assert_results_3d_eq(&mc.results, rc, &format!("case '{}'", mc.name));
    }
    for (mc, (name, rc)) in multi.combination_results.iter().zip(&ref_combos) {
        assert_eq!(&mc.name, name);
        assert_results_3d_eq(&mc.results, rc, &format!("combo '{}'", mc.name));
    }
}

// ==================== Single-case ≡ single solve ====================

#[test]
fn single_case_2d_matches_single_solve() {
    let solver = make_frame_2d_dense();
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: -7.0, q_j: -5.0, a: None, b: None,
        }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -15.0, my: 2.0 }),
    ];

    let mut case_input = solver.clone();
    case_input.loads = loads.clone();
    let direct = solve_2d(&case_input).unwrap();

    let input = MultiCaseInput {
        solver,
        load_cases: vec![LoadCase { name: "Only".to_string(), loads }],
        combinations: vec![CombinationDef {
            name: "1.0 Only".to_string(),
            factors: [("Only".to_string(), 1.0)].into_iter().collect(),
        }],
    };
    let multi = solve_multi_case_2d(&input).unwrap();

    assert_eq!(multi.case_results.len(), 1);
    assert_results_eq(&multi.case_results[0].results, &direct, "single case");
}

#[test]
fn single_case_3d_matches_single_solve() {
    let solver = make_frame_slab_3d_sparse();
    let loads = vec![
        SolverLoad3D::QuadPressure(SolverPressureLoad { element_id: 1003, pressure: -4.0 }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 7, fx: 0.0, fy: 5.0, fz: -10.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let mut case_input = solver.clone();
    case_input.loads = loads.clone();
    let direct = solve_3d(&case_input).unwrap();

    let input = MultiCaseInput3D {
        solver,
        load_cases: vec![LoadCase3D { name: "Only".to_string(), loads }],
        combinations: vec![CombinationDef {
            name: "1.0 Only".to_string(),
            factors: [("Only".to_string(), 1.0)].into_iter().collect(),
        }],
    };
    let multi = solve_multi_case_3d(&input).unwrap();

    assert_eq!(multi.case_results.len(), 1);
    assert_results_3d_eq(&multi.case_results[0].results, &direct, "single case 3d");
}
