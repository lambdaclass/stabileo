//! Gates: reactions, displacements, and equilibrium sums are reported in
//! GLOBAL axes on every analysis path, including inclined supports.

#[path = "common/mod.rs"]
mod common;

use dedaliano_engine::solver::{linear, corotational, material_nonlinear, reduction, cable, staged};
use dedaliano_engine::solver::winkler::{self, WinklerInput3D, FoundationSpring3D};
use dedaliano_engine::solver::reduction::GuyanInput;
use dedaliano_engine::solver::assembly::inclined_rotation_matrix_2d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// 2D triangle with a 45° inclined roller: nodes 1 (pin), 2 (inclined roller), 3 loaded.
fn inclined_model_2d(with_constraint: bool) -> SolverInput {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 6.0, z: 0.0 });
    nodes.insert("3".to_string(), SolverNode { id: 3, x: 3.0, z: 3.0 });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });
    let mut elements = HashMap::new();
    for (id, ni, nj) in [(1usize, 1usize, 2usize), (2, 2, 3), (3, 3, 1)] {
        elements.insert(id.to_string(), SolverElement {
            id, elem_type: "frame".to_string(), node_i: ni, node_j: nj,
            material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
        });
    }
    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    supports.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 2, support_type: "inclinedRoller".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: Some(45.0),
    });
    let mut constraints = vec![];
    if with_constraint {
        // An unrelated EqualDOF elsewhere forces the constrained solve path.
        // Node 1 (pinned) leaves ry free; node 2 (inclinedRoller) restrains
        // only the rotated normal DOF and also leaves ry free — tying these
        // two free rotations together forces solve_constrained_2d without
        // touching any restrained master DOF (that interacts with the
        // separate prescribed-displacement redistribution path, out of
        // scope here — this constraint exists only to force the constrained
        // path so the inclined-reactions bug is exercised).
        constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
            master_node: 1, slave_node: 2, dofs: vec![2], // tie ry (both free)
        }));
    }
    SolverInput {
        nodes, materials, sections, elements, supports,
        loads: vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 5.0, fz: -15.0, my: 0.0 })],
        constraints,
        connectors: HashMap::new(),
    }
}

fn assert_global_equilibrium(res: &AnalysisResults, fx_applied: f64, fz_applied: f64, label: &str) {
    let sum_rx: f64 = res.reactions.iter().map(|r| r.rx).sum();
    let sum_rz: f64 = res.reactions.iter().map(|r| r.rz).sum();
    assert!((sum_rx + fx_applied).abs() < 1e-6, "{label}: \u{3a3}Rx {} vs applied {}", sum_rx, fx_applied);
    assert!((sum_rz + fz_applied).abs() < 1e-6, "{label}: \u{3a3}Rz {} vs applied {}", sum_rz, fz_applied);
}

#[test]
fn linear_path_inclined_reactions_global() {
    // Baseline — already fixed by 25d55b1; guards against regression.
    let res = linear::solve_2d(&inclined_model_2d(false)).expect("solve");
    assert_global_equilibrium(&res, 5.0, -15.0, "linear");
}

#[test]
fn constrained_path_inclined_reactions_match_summary() {
    let res = linear::solve_2d(&inclined_model_2d(true)).expect("solve");
    assert_global_equilibrium(&res, 5.0, -15.0, "constrained");
    // Per-node reactions and the equilibrium summary must agree.
    let sum_rx: f64 = res.reactions.iter().map(|r| r.rx).sum();
    let sum_rz: f64 = res.reactions.iter().map(|r| r.rz).sum();
    let eq = res.equilibrium.as_ref().expect("equilibrium summary present");
    assert!((eq.reaction_force_sum[0] - sum_rx).abs() < 1e-6,
        "summary Rx {} vs per-node {}", eq.reaction_force_sum[0], sum_rx);
    assert!((eq.reaction_force_sum[1] - sum_rz).abs() < 1e-6,
        "summary Rz {} vs per-node {}", eq.reaction_force_sum[1], sum_rz);
}

// ── C4: specialized solver paths ───────────────────────────────────────────
//
// Same 45° inclined-roller triangle (or a minimal 3D lift), solved through
// each specialized path in its mildest configuration, asserting global
// equilibrium in GLOBAL axes.

fn assert_global_equilibrium_3d(reactions: &[Reaction3D], fx: f64, fy: f64, fz: f64, label: &str) {
    let sum_fx: f64 = reactions.iter().map(|r| r.fx).sum();
    let sum_fy: f64 = reactions.iter().map(|r| r.fy).sum();
    let sum_fz: f64 = reactions.iter().map(|r| r.fz).sum();
    assert!((sum_fx + fx).abs() < 1e-6, "{label}: \u{3a3}Fx {} vs applied {}", sum_fx, fx);
    assert!((sum_fy + fy).abs() < 1e-6, "{label}: \u{3a3}Fy {} vs applied {}", sum_fy, fy);
    assert!((sum_fz + fz).abs() < 1e-6, "{label}: \u{3a3}Fz {} vs applied {}", sum_fz, fz);
}

/// Same triangle, tiny load — geometric nonlinearity is negligible, so the
/// co-rotational answer should coincide with the linear solve.
fn inclined_model_2d_tiny_load() -> SolverInput {
    let mut model = inclined_model_2d(false);
    model.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0005, fz: -0.0015, my: 0.0,
    })];
    model
}

#[test]
fn corotational_path_inclined_reactions_global() {
    let model = inclined_model_2d_tiny_load();
    let result = corotational::solve_corotational_2d(&model, 30, 1e-6, 1, false)
        .expect("corotational solve");
    assert!(result.converged, "corotational should converge for a tiny elastic load, iters={}", result.iterations);
    assert_global_equilibrium(&result.results, 0.0005, -0.0015, "corotational");

    // Kinematic check, not just reporting: co-rotational's own tangent
    // stiffness assembly is hand-rolled (never reused assemble_2d's
    // rotation), so before the fix it silently restrained literal global Z
    // at node 2 instead of the true 45°-rotated normal direction — a
    // different physical problem that "ΣR + ΣF = 0" alone can't detect
    // (see task-C4-report.md). The normal-direction displacement component
    // (per assembly's inclined_rotation_matrix_2d convention: local[1] =
    // sin(θ)·ux + cos(θ)·uz) must be ≈0 in GLOBAL axes.
    let d2 = result.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let r = inclined_rotation_matrix_2d(45.0);
    let normal_component = r[1][0] * d2.ux + r[1][1] * d2.uz;
    // Relative check (not absolute): the whole problem is tiny by design,
    // so the normal component must be tiny RELATIVE to node 2's own
    // displacement magnitude, not just tiny in absolute terms.
    let characteristic = d2.ux.abs().max(d2.uz.abs()).max(1e-30);
    assert!(normal_component.abs() / characteristic < 1e-6,
        "node 2 should be restrained normal to the 45° incline, got normal-component={:.3e} \
         relative to characteristic displacement {:.3e} (ux={:.3e}, uz={:.3e})",
        normal_component, characteristic, d2.ux, d2.uz);
}

/// 3D two-span cantilever: node 1 fixed, node 2 mid (Winkler foundation
/// spring on the first span only), node 3 tip with a 45°-inclined roller
/// in the XY plane. The foundation spring is kept off the inclined-support
/// node/element so this test isolates the reporting bug from the separate
/// (out-of-scope) question of a foundation spring sharing DOFs with an
/// inclined-support rotation.
fn winkler_model_3d_inclined() -> WinklerInput3D {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 3.0, y: 0.0, z: 0.0 });
    nodes.insert("3".to_string(), SolverNode3D { id: 3, x: 6.0, y: 0.0, z: 0.0 });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.01, iy: 1e-4, iz: 1e-4, j: 5e-5, cw: None, as_y: None, as_z: None,
    });
    let mut elements = HashMap::new();
    for (id, ni, nj) in [(1usize, 1usize, 2usize), (2, 2, 3)] {
        elements.insert(id.to_string(), SolverElement3D {
            id, elem_type: "frame".to_string(), node_i: ni, node_j: nj,
            material_id: 1, section_id: 1,
            release_my_start: false, release_my_end: false,
            release_mz_start: false, release_mz_end: false,
            release_t_start: false, release_t_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
    }
    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport3D {
        node_id: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
    });
    let s = 1.0 / (2.0f64).sqrt();
    supports.insert("2".to_string(), SolverSupport3D {
        node_id: 3, rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: Some(s), normal_y: Some(s), normal_z: Some(0.0), is_inclined: Some(true),
        rw: None, kw: None,
    });
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx: 2.0, fy: -10.0, fz: 3.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let solver = SolverInput3D {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(), curved_beams: vec![],
        connectors: HashMap::new(),
    };
    WinklerInput3D {
        solver,
        foundation_springs: vec![FoundationSpring3D { element_id: 1, ky: Some(50.0), kz: Some(50.0) }],
    }
}

#[test]
fn winkler_path_inclined_reactions_global() {
    // NOTE: a full ΣReactions + ΣApplied = 0 check does NOT hold here — the
    // Winkler foundation springs act against an external ground (a
    // "beam on elastic foundation" reaction is absolute, not relative to
    // the beam's other end), so they silently absorb part of the applied
    // load at node 2, which is not a support and never appears in
    // `reactions`. That's expected Winkler-foundation behavior, not a bug.
    // Instead, check that the inclined support's OWN reaction is reported
    // in GLOBAL axes: normal = (s, s, 0) is a frictionless-roller
    // direction, so the reaction must lie along it (fx≈fy, fz≈0). Before
    // the fix, the plain (non-back-transformed) builder reported the raw
    // rotated-frame components directly as global fx/fy/fz, breaking this.
    let input = winkler_model_3d_inclined();
    let res = winkler::solve_winkler_3d(&input).expect("winkler solve");
    let r3 = res.reactions.iter().find(|r| r.node_id == 3).expect("inclined support reaction");
    assert!(r3.fz.abs() < 1e-6,
        "inclined roller in the XY plane should have fz≈0, got {:.6e}", r3.fz);
    assert!(r3.fx.abs() > 1e-9, "expected a nonzero reaction at the inclined support");
    let ratio = r3.fx / r3.fy;
    assert!((ratio - 1.0).abs() < 1e-6,
        "reaction should point along the 45° normal (fx≈fy), got fx={} fy={}", r3.fx, r3.fy);
}

#[test]
fn material_nonlinear_path_inclined_reactions_global() {
    let model = inclined_model_2d(false);
    let input = NonlinearMaterialInput {
        solver: model,
        material_models: HashMap::new(),
        // Empty ⇒ lookup_capacities falls back to (Np, Mp) = (∞, ∞) ⇒
        // bilinear hinges never activate ⇒ elastic range throughout.
        section_capacities: HashMap::new(),
        max_iter: 30,
        tolerance: 1e-8,
        n_increments: 4,
    };
    let result = material_nonlinear::solve_nonlinear_material_2d(&input)
        .expect("material_nonlinear solve");
    assert!(result.converged, "should converge in the elastic range");
    assert_global_equilibrium(&result.results, 5.0, -15.0, "material_nonlinear");

    // Elastic-range (never-yielding) result must match the plain linear solve.
    let lin = linear::solve_2d(&inclined_model_2d(false)).expect("linear solve");
    for node_id in [1usize, 2, 3] {
        let d_lin = lin.displacements.iter().find(|d| d.node_id == node_id).unwrap();
        let d_nl = result.results.displacements.iter().find(|d| d.node_id == node_id).unwrap();
        assert!((d_lin.ux - d_nl.ux).abs() < 1e-6,
            "node {node_id} ux mismatch: linear {} vs material_nonlinear {}", d_lin.ux, d_nl.ux);
        assert!((d_lin.uz - d_nl.uz).abs() < 1e-6,
            "node {node_id} uz mismatch: linear {} vs material_nonlinear {}", d_lin.uz, d_nl.uz);
    }
}

#[test]
fn reduction_path_inclined_reactions_global() {
    // Guyan reduction keeping the loaded node (3) as boundary/master; the
    // inclined-roller node's free (tangential) DOF is condensed out as
    // interior, exercising the same asm.k/asm.f (rotated-frame) reactions
    // path as the other specialized solvers.
    let model = inclined_model_2d(false);
    let input = GuyanInput { solver: model, boundary_nodes: vec![3] };
    let result = reduction::guyan_reduce_2d(&input).expect("guyan reduction solve");

    let sum_rx: f64 = result.reactions.iter().map(|r| r.rx).sum();
    let sum_rz: f64 = result.reactions.iter().map(|r| r.rz).sum();
    assert!((sum_rx + 5.0).abs() < 1e-6, "reduction: \u{3a3}Rx {} vs applied 5.0", sum_rx);
    assert!((sum_rz + (-15.0)).abs() < 1e-6, "reduction: \u{3a3}Rz {} vs applied -15.0", sum_rz);
}

/// Same triangle, but the base member (node 1 -- node 2, connecting the two
/// supports) becomes a tension-only cable; the two sloped members stay
/// "frame". Under the apex load at node 3, the base acts as a tie in
/// tension while the sloped rafters take compression (classic king-post
/// behavior) — so the cable stays taut rather than going slack.
fn inclined_model_2d_cable() -> SolverInput {
    // A triangular truss's diagonals aren't reliably in tension under an
    // apex load (whether a "strut" is in tension or compression flips with
    // small changes and can even oscillate under the cable solver's
    // tension-only iteration, since it's a strut/compression-friendly
    // shape) — so this uses a genuine V-hang instead: node 3 sags BELOW the
    // line joining the two supports. A downward load at the sag point
    // unambiguously puts both diagonals in tension (hammock/V-cable
    // statics), matching the task brief's "load it so the cable is taut."
    // Node 1 (pinned) and node 2 (45°-inclined roller) keep the same
    // support pattern as the other C4 gates; the top chord (node1-node2)
    // stays "frame" since it isn't one of the V-cable legs.
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 6.0, z: 0.0 });
    nodes.insert("3".to_string(), SolverNode { id: 3, x: 3.0, z: -3.0 });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });
    let mut elements = HashMap::new();
    for (id, t, ni, nj) in [(1usize, "frame", 1usize, 2usize), (2, "cable", 2, 3), (3, "cable", 3, 1)] {
        elements.insert(id.to_string(), SolverElement {
            id, elem_type: t.to_string(), node_i: ni, node_j: nj,
            material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
        });
    }
    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    supports.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 2, support_type: "inclinedRoller".to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: Some(45.0),
    });
    SolverInput {
        nodes, materials, sections, elements, supports,
        loads: vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 1.0, fz: -15.0, my: 0.0 })],
        constraints: vec![],
        connectors: HashMap::new(),
    }
}

#[test]
fn cable_path_inclined_reactions_global() {
    let model = inclined_model_2d_cable();
    let densities = HashMap::new();
    let result = cable::solve_cable_2d(&model, &densities, 50, 1e-8).expect("cable solve");
    assert!(result.converged, "cable iteration should converge");

    // Sanity check: both cable legs must actually be taut (in tension),
    // otherwise this test would exercise the "slack cable" path instead of
    // the intended one (per the task brief's note on cable-taut loading).
    for elem_id in [2usize, 3] {
        let cable_force = result.cable_forces.iter().find(|c| c.element_id == elem_id)
            .expect("cable element result");
        assert!(cable_force.tension > 0.0,
            "cable element {elem_id} should be taut, got tension={}", cable_force.tension);
    }

    assert_global_equilibrium(&result.results, 1.0, -15.0, "cable");
}

#[test]
fn staged_rejects_inclined_supports() {
    let base = inclined_model_2d(false);
    let staged_input = StagedInput {
        nodes: base.nodes,
        materials: base.materials,
        sections: base.sections,
        elements: base.elements,
        supports: base.supports,
        loads: base.loads,
        stages: vec![ConstructionStage {
            name: "Stage 1".to_string(),
            elements_added: vec![],
            elements_removed: vec![],
            load_indices: vec![],
            supports_added: vec![],
            supports_removed: vec![],
            prestress_loads: vec![],
        }],
        constraints: vec![],
    };
    let result = staged::solve_staged_2d(&staged_input);
    let err = result.expect_err("staged solve must reject inclined supports, not mis-report them");
    assert!(err.to_lowercase().contains("inclined"),
        "error should mention 'inclined': {err}");
}

#[test]
fn staged_rejects_inclined_supports_3d() {
    // 3D twin: solve_staged_3d's per-stage assembly DOES reuse assemble_3d
    // (correctly rotated), but its reaction/element-force reporting sums
    // per-element local-frame forces assuming TRUE global displacements —
    // see the rejection guard's comment in staged.rs for the full rationale.
    let s = 1.0 / (2.0f64).sqrt();
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 5.0, y: 0.0, z: 0.0 });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.01, iy: 1e-4, iz: 1e-4, j: 5e-5, cw: None, as_y: None, as_z: None,
    });
    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement3D {
        id: 1, elem_type: "frame".to_string(), node_i: 1, node_j: 2,
        material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false,
        release_mz_start: false, release_mz_end: false,
        release_t_start: false, release_t_end: false,
        local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    });
    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport3D {
        node_id: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
    });
    supports.insert("2".to_string(), SolverSupport3D {
        node_id: 2, rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: Some(s), normal_y: Some(s), normal_z: Some(0.0), is_inclined: Some(true),
        rw: None, kw: None,
    });
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: -10.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let staged_input = StagedInput3D {
        nodes, materials, sections, elements, supports, loads,
        stages: vec![ConstructionStage3D {
            name: "Stage 1".to_string(),
            elements_added: vec![],
            elements_removed: vec![],
            load_indices: vec![],
            supports_added: vec![],
            supports_removed: vec![],
            prestress_loads: vec![], ..Default::default()
        }],
        constraints: vec![],
        ..Default::default()
    };
    let result = staged::solve_staged_3d(&staged_input);
    let err = result.expect_err("staged 3D solve must reject inclined supports");
    assert!(err.to_lowercase().contains("inclined"),
        "error should mention 'inclined': {err}");
}

// ── C4 review Finding 1 regression guard ────────────────────────────────────
//
// `update_element_states[_3d]` must receive TRUE global displacements during
// the NR loop (see material_nonlinear.rs). Before the fix, it received the
// mixed-frame `u_full` directly, so yield-demand evaluation for elements
// adjacent to an inclined support was computed against the wrong-frame
// displacement of that node.
//
// Discriminator: at angle=0°, `inclinedRoller` restrains the exact same
// physical DOF as a plain `rollerX` (uz fixed, free in x) — but unlike
// rollerX it still creates a nontrivial inclined-transform entry (R =
// diag(-1, 1), an involution: apply-then-reverse round-trips to the same
// global values when done correctly). So inclinedRoller@0° exercises the
// mixed-frame reversal machinery on every NR iteration even though the
// restrained direction is identical to rollerX. If the reversal is applied
// correctly, solving the two models must produce IDENTICAL hinge activation
// (and displacements); before the fix, the un-reversed u_full corrupted the
// yield-demand calculation at node 2's adjacent elements (1 and 2) during
// the NR loop, breaking this equivalence.
#[test]
fn material_nonlinear_plastic_inclined_hinge_frame() {
    let mut section_capacities = HashMap::new();
    // Np effectively infinite (axial demand ~14-26 stays well under it) so
    // the interaction criterion is driven by bending; Mp=0.1 is well below
    // the elastic-range moments (~0.12-0.33 at every node of this triangle,
    // per the plain material_nonlinear gate test above), so a hinge reliably
    // activates at node 2 (and elsewhere) under the same load already used
    // by `material_nonlinear_path_inclined_reactions_global`.
    section_capacities.insert("1".to_string(), SectionCapacity { np: 1000.0, mp: 0.1, zp: None });

    let build = |support_type: &str, angle: Option<f64>| -> NonlinearMaterialInput {
        let mut model = inclined_model_2d(false);
        model.supports.insert("2".to_string(), SolverSupport {
            id: 2, node_id: 2, support_type: support_type.to_string(),
            kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle,
        });
        NonlinearMaterialInput {
            solver: model,
            material_models: HashMap::new(),
            section_capacities: section_capacities.clone(),
            max_iter: 30,
            tolerance: 1e-8,
            n_increments: 4,
        }
    };

    let res_inclined = material_nonlinear::solve_nonlinear_material_2d(&build("inclinedRoller", Some(0.0)))
        .expect("inclinedRoller@0 solve");
    let res_roller = material_nonlinear::solve_nonlinear_material_2d(&build("rollerX", None))
        .expect("rollerX solve");

    // Sanity: this load/capacity combination must actually activate a hinge
    // adjacent to node 2 (elements 1 and 2 both touch it), otherwise the
    // test below isn't discriminating anything.
    let touches_node2 = |st: &ElementPlasticStatus| st.element_id == 1 || st.element_id == 2;
    let any_yielded_near_node2 = res_roller.element_status.iter()
        .any(|s| touches_node2(s) && s.state != "elastic");
    assert!(any_yielded_near_node2,
        "test setup must actually activate a hinge adjacent to node 2 (got: {:?})",
        res_roller.element_status);

    assert_eq!(res_inclined.element_status.len(), res_roller.element_status.len());
    for (si, sr) in res_inclined.element_status.iter().zip(res_roller.element_status.iter()) {
        assert_eq!(si.element_id, sr.element_id);
        assert_eq!(si.state, sr.state,
            "element {}: inclinedRoller@0 state '{}' != rollerX state '{}'",
            si.element_id, si.state, sr.state);
        assert!((si.utilization - sr.utilization).abs() < 1e-9,
            "element {} utilization mismatch: inclinedRoller@0={} rollerX={}",
            si.element_id, si.utilization, sr.utilization);
    }

    for node_id in [1usize, 2, 3] {
        let d1 = res_inclined.results.displacements.iter().find(|d| d.node_id == node_id).unwrap();
        let d2 = res_roller.results.displacements.iter().find(|d| d.node_id == node_id).unwrap();
        assert!((d1.ux - d2.ux).abs() < 1e-9,
            "node {node_id} ux mismatch: inclinedRoller@0={} rollerX={}", d1.ux, d2.ux);
        assert!((d1.uz - d2.uz).abs() < 1e-9,
            "node {node_id} uz mismatch: inclinedRoller@0={} rollerX={}", d1.uz, d2.uz);
    }
}
