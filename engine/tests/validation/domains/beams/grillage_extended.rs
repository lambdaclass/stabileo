/// Validation: Extended Grillage Analysis
///
/// References:
///   - Hambly, "Bridge Deck Behaviour", 2nd Ed., E & FN Spon (1991), Ch. 3-7
///   - O'Brien & Keogh, "Bridge Deck Analysis", E & FN Spon (1999), Ch. 4-6
///   - Jaeger & Bakht, "Bridge Analysis by Microcomputer", McGraw-Hill (1989)
///   - Cusens & Pama, "Bridge Deck Analysis", Wiley (1975)
///   - Timoshenko & Woinowsky-Krieger, "Theory of Plates and Shells", 2nd Ed.
///
/// Extended grillage tests covering:
///   1. T-beam section effective width and load distribution factors
///   2. Multi-beam grillage: interior vs exterior beam distribution factors
///   3. Skew grillage: effect of skew angle on load distribution
///   4. Box girder grillage model: torsional stiffness contribution GJ
///   5. Composite grillage: transformed section properties for steel-concrete
///   6. Diaphragm effects: intermediate diaphragm stiffening on distribution
///   7. Influence surface: moving load position for maximum beam moment
///   8. Beam-slab grillage: comparison of grillage vs simplified distribution
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// ================================================================
// 1. Simply-Supported Grillage Beam -- T-Beam Section Effective Width
// ================================================================
//
// A T-beam grillage with two parallel main beams connected by cross-beams.
// The T-beam has increased moment of inertia due to the effective slab flange.
// With the T-beam section (larger Iz), the grillage carries load more efficiently
// and deflects less than with a rectangular section.
//
// Reference: Hambly, Ch. 3 -- effective width concept for T-beams in grillage.
// The load distribution factor (DF) for each beam is the fraction of total
// vertical reaction it receives. For symmetric equal loading: DF = 0.5 each.
// For eccentric load on beam 1: DF_beam1 > 0.5, DF_beam2 < 0.5.

#[test]
fn validation_grill_ext_tbeam_effective_width() {
    let lx: f64 = 10.0;       // main beam span
    let lz: f64 = 3.0;        // beam spacing
    let p: f64 = 30.0;        // total applied load

    // E = 30_000 MPa (concrete)
    let e_mpa: f64 = 30_000.0;
    let nu: f64 = 0.2;
    let a: f64 = 0.15;        // cross-section area (m^2)

    // Rectangular section: Iz = bh^3/12 for b=0.3, h=0.8
    let iz_rect: f64 = 0.3 * 0.8_f64.powi(3) / 12.0;   // ~0.01280
    // T-beam section: effective flange increases Iz by about 2x
    let iz_tbeam: f64 = iz_rect * 2.0;
    let iy: f64 = 0.002;
    let j: f64 = 0.005;

    let fix = vec![true, true, true, true, true, true];
    let roller_x = vec![false, true, true, true, true, true];

    // -- Rectangular section grillage --
    let nodes_r = vec![
        (1, 0.0, 0.0, 0.0), (2, lx / 2.0, 0.0, 0.0), (3, lx, 0.0, 0.0),
        (4, 0.0, 0.0, lz),  (5, lx / 2.0, 0.0, lz),  (6, lx, 0.0, lz),
    ];
    let elems_r = vec![
        (1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1),
        (3, "frame", 4, 5, 1, 1), (4, "frame", 5, 6, 1, 1),
        (5, "frame", 2, 5, 1, 1),
    ];
    let sups_r = vec![
        (1, fix.clone()), (4, fix.clone()),
        (3, roller_x.clone()), (6, roller_x.clone()),
    ];
    // Load on beam 1 midspan
    let loads_r = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_r = make_3d_input(
        nodes_r, vec![(1, e_mpa, nu)],
        vec![(1, a, iy, iz_rect, j)],
        elems_r, sups_r, loads_r,
    );
    let res_r = linear::solve_3d(&input_r).unwrap();
    let d_rect = res_r.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy.abs();

    // -- T-beam section grillage (same layout, larger Iz) --
    let nodes_t = vec![
        (1, 0.0, 0.0, 0.0), (2, lx / 2.0, 0.0, 0.0), (3, lx, 0.0, 0.0),
        (4, 0.0, 0.0, lz),  (5, lx / 2.0, 0.0, lz),  (6, lx, 0.0, lz),
    ];
    let elems_t = vec![
        (1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1),
        (3, "frame", 4, 5, 1, 1), (4, "frame", 5, 6, 1, 1),
        (5, "frame", 2, 5, 1, 1),
    ];
    let sups_t = vec![
        (1, fix.clone()), (4, fix.clone()),
        (3, roller_x.clone()), (6, roller_x.clone()),
    ];
    let loads_t = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_t = make_3d_input(
        nodes_t, vec![(1, e_mpa, nu)],
        vec![(1, a, iy, iz_tbeam, j)],
        elems_t, sups_t, loads_t,
    );
    let res_t = linear::solve_3d(&input_t).unwrap();
    let d_tbeam = res_t.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy.abs();

    // T-beam section should deflect less (stiffer)
    assert!(d_tbeam < d_rect,
        "T-beam deflection {:.6e} should be less than rect {:.6e}", d_tbeam, d_rect);

    // Distribution factor: fraction of total reaction at beam 1 supports
    let sum_ry_t: f64 = res_t.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_ry_t, p, 0.02, "T-beam equilibrium: sum Ry = P");

    let r1_t = res_t.reactions.iter().find(|r| r.node_id == 1).unwrap().fy;
    let r3_t = res_t.reactions.iter().find(|r| r.node_id == 3).unwrap().fy;
    let df_beam1: f64 = (r1_t + r3_t) / p;
    // With eccentric load on beam 1: DF_beam1 > 0.5
    assert!(df_beam1 > 0.5,
        "Distribution factor for loaded beam: {:.3} > 0.5", df_beam1);
    assert!(df_beam1 < 1.0,
        "Distribution factor for loaded beam: {:.3} < 1.0 (some load goes to beam 2)", df_beam1);
}

// ================================================================
// 2. Multi-Beam Grillage -- Interior vs Exterior Beam Distribution
// ================================================================
//
// Three parallel beams with cross-beams at midspan and quarter-spans.
// When a point load is at the center of the middle beam, the interior
// beam carries the largest share, while exterior beams carry less.
// This tests the well-known result that interior beams have a higher
// distribution factor under centered loading.
//
// Reference: Jaeger & Bakht, "Bridge Analysis by Microcomputer", Ch. 5.

#[test]
fn validation_grill_ext_multibeam_distribution() {
    let lx: f64 = 10.0;
    let lz: f64 = 2.5;
    let p: f64 = 40.0;

    let e_mpa: f64 = 30_000.0;
    let nu: f64 = 0.2;
    let a: f64 = 0.12;
    let iy: f64 = 0.002;
    let iz: f64 = 0.010;
    let j: f64 = 0.004;

    let fix = vec![true, true, true, true, true, true];
    let roller_x = vec![false, true, true, true, true, true];

    // Three beams: z=0, z=lz, z=2*lz
    // Nodes along each beam at x=0, x=L/2, x=L
    let nodes = vec![
        // beam 1 (z=0)
        (1, 0.0, 0.0, 0.0), (2, lx / 2.0, 0.0, 0.0), (3, lx, 0.0, 0.0),
        // beam 2 (z=lz) -- interior
        (4, 0.0, 0.0, lz), (5, lx / 2.0, 0.0, lz), (6, lx, 0.0, lz),
        // beam 3 (z=2*lz)
        (7, 0.0, 0.0, 2.0 * lz), (8, lx / 2.0, 0.0, 2.0 * lz), (9, lx, 0.0, 2.0 * lz),
    ];
    let elems = vec![
        // main beams
        (1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1),
        (3, "frame", 4, 5, 1, 1), (4, "frame", 5, 6, 1, 1),
        (5, "frame", 7, 8, 1, 1), (6, "frame", 8, 9, 1, 1),
        // cross-beams at midspan
        (7, "frame", 2, 5, 1, 1),
        (8, "frame", 5, 8, 1, 1),
    ];
    let sups = vec![
        (1, fix.clone()), (4, fix.clone()), (7, fix.clone()),
        (3, roller_x.clone()), (6, roller_x.clone()), (9, roller_x.clone()),
    ];

    // Load at interior beam midspan (node 5)
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 5, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, e_mpa, nu)], vec![(1, a, iy, iz, j)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_ry, p, 0.02, "Multi-beam equilibrium");

    // Interior beam (beam 2) reactions
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap().fy;
    let r6 = results.reactions.iter().find(|r| r.node_id == 6).unwrap().fy;
    let df_interior: f64 = (r4 + r6) / p;

    // Exterior beam 1 reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().fy;
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap().fy;
    let df_ext1: f64 = (r1 + r3) / p;

    // Exterior beam 3 reactions
    let r7 = results.reactions.iter().find(|r| r.node_id == 7).unwrap().fy;
    let r9 = results.reactions.iter().find(|r| r.node_id == 9).unwrap().fy;
    let df_ext3: f64 = (r7 + r9) / p;

    // Interior beam should carry the most load
    assert!(df_interior > df_ext1,
        "Interior DF {:.3} > exterior DF {:.3}", df_interior, df_ext1);
    assert!(df_interior > df_ext3,
        "Interior DF {:.3} > exterior DF {:.3}", df_interior, df_ext3);

    // By symmetry, exterior beams carry equal loads
    assert_close(df_ext1, df_ext3, 0.02, "Exterior beams: symmetric DF");

    // Sum of DFs = 1.0
    let df_sum: f64 = df_interior + df_ext1 + df_ext3;
    assert_close(df_sum, 1.0, 0.02, "Sum of distribution factors = 1.0");
}

// ================================================================
// 3. Skew Grillage -- Effect of Skew Angle on Load Distribution
// ================================================================
//
// A skew grillage has cross-beams oriented at an angle theta to the
// transverse direction. This introduces coupling between bending and
// torsion. For a skew grillage, the load distribution to the obtuse
// corner support increases compared to a right-angle grillage.
//
// Reference: Hambly, "Bridge Deck Behaviour", Ch. 5 -- skew effects.

#[test]
fn validation_grill_ext_skew_angle_effect() {
    let lx: f64 = 10.0;
    let lz: f64 = 4.0;
    let p: f64 = 20.0;
    let theta_deg: f64 = 30.0;
    let theta_rad: f64 = theta_deg * std::f64::consts::PI / 180.0;
    let skew_offset: f64 = lz * theta_rad.tan();

    let e_mpa: f64 = 30_000.0;
    let nu: f64 = 0.2;
    let a: f64 = 0.10;
    let iy: f64 = 0.002;
    let iz: f64 = 0.008;
    let j: f64 = 0.003;

    let fix = vec![true, true, true, true, true, true];
    let roller_x = vec![false, true, true, true, true, true];

    // -- Right-angle grillage (no skew) --
    let nodes_r = vec![
        (1, 0.0, 0.0, 0.0), (2, lx / 2.0, 0.0, 0.0), (3, lx, 0.0, 0.0),
        (4, 0.0, 0.0, lz),  (5, lx / 2.0, 0.0, lz),  (6, lx, 0.0, lz),
    ];
    let elems_r = vec![
        (1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1),
        (3, "frame", 4, 5, 1, 1), (4, "frame", 5, 6, 1, 1),
        (5, "frame", 1, 4, 1, 1), // cross-beam at x=0
        (6, "frame", 2, 5, 1, 1), // cross-beam at midspan
        (7, "frame", 3, 6, 1, 1), // cross-beam at x=L
    ];
    let sups_r = vec![
        (1, fix.clone()), (4, fix.clone()),
        (3, roller_x.clone()), (6, roller_x.clone()),
    ];
    let loads_r = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_r = make_3d_input(
        nodes_r, vec![(1, e_mpa, nu)], vec![(1, a, iy, iz, j)],
        elems_r, sups_r, loads_r,
    );
    let res_r = linear::solve_3d(&input_r).unwrap();
    let d_right = res_r.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy.abs();

    // -- Skew grillage: offset beam 2 by skew_offset in X --
    let nodes_s = vec![
        (1, 0.0, 0.0, 0.0),
        (2, lx / 2.0, 0.0, 0.0),
        (3, lx, 0.0, 0.0),
        (4, skew_offset, 0.0, lz),
        (5, lx / 2.0 + skew_offset, 0.0, lz),
        (6, lx + skew_offset, 0.0, lz),
    ];
    let elems_s = vec![
        (1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1),
        (3, "frame", 4, 5, 1, 1), (4, "frame", 5, 6, 1, 1),
        (5, "frame", 1, 4, 1, 1), // skewed cross-beam
        (6, "frame", 2, 5, 1, 1),
        (7, "frame", 3, 6, 1, 1),
    ];
    let sups_s = vec![
        (1, fix.clone()), (4, fix.clone()),
        (3, roller_x.clone()), (6, roller_x.clone()),
    ];
    let loads_s = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_s = make_3d_input(
        nodes_s, vec![(1, e_mpa, nu)], vec![(1, a, iy, iz, j)],
        elems_s, sups_s, loads_s,
    );
    let res_s = linear::solve_3d(&input_s).unwrap();
    let d_skew = res_s.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy.abs();

    // Both must satisfy equilibrium
    let sum_ry_r: f64 = res_r.reactions.iter().map(|r| r.fy).sum();
    let sum_ry_s: f64 = res_s.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_ry_r, p, 0.02, "Right grillage equilibrium");
    assert_close(sum_ry_s, p, 0.02, "Skew grillage equilibrium");

    // Skew changes the deflection (different from right-angle).
    // The key check: skew and right grillage produce different deflections.
    let ratio: f64 = d_skew / d_right;
    assert!(ratio > 0.5 && ratio < 2.0,
        "Skew/right deflection ratio {:.3} should differ but be reasonable", ratio);
    let diff: f64 = (d_skew - d_right).abs();
    assert!(diff > 1e-8,
        "Skew changes deflection: diff={:.6e}", diff);
}

// ================================================================
// 4. Box Girder Grillage Model -- Torsional Stiffness GJ
// ================================================================
//
// A box girder has very high torsional stiffness (J) compared to an
// open section. In a grillage model, increasing J reduces differential
// deflection between beams because torsion couples their response.
//
// Reference: Hambly, Ch. 4 -- torsional stiffness of box sections.

#[test]
fn validation_grill_ext_box_girder_torsion() {
    let lx: f64 = 12.0;
    let lz: f64 = 3.5;
    let p: f64 = 25.0;

    let e_mpa: f64 = 30_000.0;
    let nu: f64 = 0.2;
    let a: f64 = 0.20;
    let iy: f64 = 0.004;
    let iz: f64 = 0.015;

    // Open section: low J
    let j_open: f64 = 0.001;
    // Box section: high J (Bredt formula gives much higher value)
    let j_box: f64 = 0.050;

    let fix = vec![true, true, true, true, true, true];
    let roller_x = vec![false, true, true, true, true, true];

    // Helper to build grillage with given J
    let build = |j_val: f64| {
        let nodes = vec![
            (1, 0.0, 0.0, 0.0), (2, lx / 2.0, 0.0, 0.0), (3, lx, 0.0, 0.0),
            (4, 0.0, 0.0, lz),  (5, lx / 2.0, 0.0, lz),  (6, lx, 0.0, lz),
        ];
        let elems = vec![
            (1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1),
            (3, "frame", 4, 5, 1, 1), (4, "frame", 5, 6, 1, 1),
            (5, "frame", 2, 5, 1, 1),
        ];
        let sups = vec![
            (1, fix.clone()), (4, fix.clone()),
            (3, roller_x.clone()), (6, roller_x.clone()),
        ];
        // Eccentric load only on beam 1
        let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })];
        make_3d_input(
            nodes, vec![(1, e_mpa, nu)],
            vec![(1, a, iy, iz, j_val)],
            elems, sups, loads,
        )
    };

    let res_open = linear::solve_3d(&build(j_open)).unwrap();
    let res_box = linear::solve_3d(&build(j_box)).unwrap();

    // Differential deflection: |d_beam1 - d_beam2|
    let d2_open = res_open.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;
    let d5_open = res_open.displacements.iter().find(|d| d.node_id == 5).unwrap().uy;
    let diff_open: f64 = (d2_open - d5_open).abs();

    let d2_box = res_box.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;
    let d5_box = res_box.displacements.iter().find(|d| d.node_id == 5).unwrap().uy;
    let diff_box: f64 = (d2_box - d5_box).abs();

    // Box girder (high J) should have smaller differential deflection
    assert!(diff_box < diff_open,
        "Box GJ reduces differential: box={:.6e}, open={:.6e}", diff_box, diff_open);

    // Equilibrium for both
    let sum_open: f64 = res_open.reactions.iter().map(|r| r.fy).sum();
    let sum_box: f64 = res_box.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_open, p, 0.02, "Open section equilibrium");
    assert_close(sum_box, p, 0.02, "Box section equilibrium");
}

// ================================================================
// 5. Composite Grillage -- Transformed Section Properties
// ================================================================
//
// Steel-concrete composite beam: the transformed section has higher
// stiffness than the bare steel beam. Using the modular ratio n = Es/Ec,
// the effective moment of inertia of the composite section is larger.
//
// Reference: O'Brien & Keogh, Ch. 4 -- composite section properties.

#[test]
fn validation_grill_ext_composite_section() {
    let lx: f64 = 12.0;
    let lz: f64 = 3.0;
    let p: f64 = 30.0;

    // Steel properties
    let e_steel: f64 = 200_000.0;
    let nu_steel: f64 = 0.3;
    let a_steel: f64 = 0.008;
    let iy_steel: f64 = 1e-4;
    let iz_steel: f64 = 3e-4;
    let j_steel: f64 = 1e-5;

    // Composite section: transformed Iz increases due to concrete slab
    // n = Es/Ec = 200000/30000 ~= 6.67; effective slab contribution
    // increases Iz by roughly factor 2.5-3x for typical bridge composite beam
    let iz_composite: f64 = iz_steel * 2.5;
    let a_composite: f64 = a_steel * 1.5; // larger area with slab
    let j_composite: f64 = j_steel * 3.0; // closed section effect

    let fix = vec![true, true, true, true, true, true];
    let roller_x = vec![false, true, true, true, true, true];

    // -- Bare steel grillage --
    let build_grid = |a_val: f64, iz_val: f64, j_val: f64, e_val: f64, nu_val: f64| {
        let nodes = vec![
            (1, 0.0, 0.0, 0.0), (2, lx / 2.0, 0.0, 0.0), (3, lx, 0.0, 0.0),
            (4, 0.0, 0.0, lz),  (5, lx / 2.0, 0.0, lz),  (6, lx, 0.0, lz),
        ];
        let elems = vec![
            (1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1),
            (3, "frame", 4, 5, 1, 1), (4, "frame", 5, 6, 1, 1),
            (5, "frame", 2, 5, 1, 1),
        ];
        let sups = vec![
            (1, fix.clone()), (4, fix.clone()),
            (3, roller_x.clone()), (6, roller_x.clone()),
        ];
        let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })];
        make_3d_input(
            nodes, vec![(1, e_val, nu_val)],
            vec![(1, a_val, iy_steel, iz_val, j_val)],
            elems, sups, loads,
        )
    };

    let res_steel = linear::solve_3d(
        &build_grid(a_steel, iz_steel, j_steel, e_steel, nu_steel)
    ).unwrap();
    let d_steel = res_steel.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy.abs();

    let res_comp = linear::solve_3d(
        &build_grid(a_composite, iz_composite, j_composite, e_steel, nu_steel)
    ).unwrap();
    let d_comp = res_comp.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy.abs();

    // Composite section should deflect less
    assert!(d_comp < d_steel,
        "Composite deflects less: {:.6e} < {:.6e}", d_comp, d_steel);

    // Approximate ratio: deflection inversely proportional to EI
    // With Iz_comp = 2.5 * Iz_steel and same load:
    // d_comp / d_steel ~ Iz_steel / Iz_composite ~ 1/2.5 = 0.4
    // (not exact because of cross-beam coupling)
    let ratio: f64 = d_comp / d_steel;
    assert!(ratio < 0.60,
        "Composite stiffness ratio: d_comp/d_steel = {:.3} < 0.60", ratio);

    // Equilibrium
    let sum_ry: f64 = res_comp.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_ry, p, 0.02, "Composite grillage equilibrium");
}

// ================================================================
// 6. Diaphragm Effects -- Intermediate Diaphragm Stiffening
// ================================================================
//
// Adding intermediate diaphragms (extra cross-beams) between main beams
// reduces differential deflection and improves load distribution.
// A grillage with more cross-beams distributes load more evenly.
//
// Reference: Hambly, Ch. 6 -- diaphragm effects.

#[test]
fn validation_grill_ext_diaphragm_effect() {
    let lx: f64 = 12.0;
    let lz: f64 = 3.0;
    let p: f64 = 20.0;

    let e_mpa: f64 = 30_000.0;
    let nu: f64 = 0.2;
    let a: f64 = 0.12;
    let iy: f64 = 0.003;
    let iz: f64 = 0.010;
    let j: f64 = 0.004;

    let fix = vec![true, true, true, true, true, true];
    let roller_x = vec![false, true, true, true, true, true];

    // -- 1 cross-beam at midspan only --
    let nodes_1 = vec![
        (1, 0.0, 0.0, 0.0), (2, lx / 2.0, 0.0, 0.0), (3, lx, 0.0, 0.0),
        (4, 0.0, 0.0, lz),  (5, lx / 2.0, 0.0, lz),  (6, lx, 0.0, lz),
    ];
    let elems_1 = vec![
        (1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1),
        (3, "frame", 4, 5, 1, 1), (4, "frame", 5, 6, 1, 1),
        (5, "frame", 2, 5, 1, 1), // single cross-beam
    ];
    let sups_1 = vec![
        (1, fix.clone()), (4, fix.clone()),
        (3, roller_x.clone()), (6, roller_x.clone()),
    ];
    let loads_1 = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_1 = make_3d_input(
        nodes_1, vec![(1, e_mpa, nu)], vec![(1, a, iy, iz, j)],
        elems_1, sups_1, loads_1,
    );
    let res_1 = linear::solve_3d(&input_1).unwrap();

    // -- 3 cross-beams at quarter-span and midspan --
    let nodes_3 = vec![
        (1,  0.0,          0.0, 0.0),
        (2,  lx / 4.0,     0.0, 0.0),
        (3,  lx / 2.0,     0.0, 0.0),
        (4,  3.0 * lx / 4.0, 0.0, 0.0),
        (5,  lx,           0.0, 0.0),
        (6,  0.0,          0.0, lz),
        (7,  lx / 4.0,     0.0, lz),
        (8,  lx / 2.0,     0.0, lz),
        (9,  3.0 * lx / 4.0, 0.0, lz),
        (10, lx,           0.0, lz),
    ];
    let elems_3 = vec![
        // main beams
        (1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1),
        (3, "frame", 3, 4, 1, 1), (4, "frame", 4, 5, 1, 1),
        (5, "frame", 6, 7, 1, 1), (6, "frame", 7, 8, 1, 1),
        (7, "frame", 8, 9, 1, 1), (8, "frame", 9, 10, 1, 1),
        // 3 cross-beams
        (9,  "frame", 2, 7, 1, 1),  // quarter-span
        (10, "frame", 3, 8, 1, 1),  // midspan
        (11, "frame", 4, 9, 1, 1),  // three-quarter span
    ];
    let sups_3 = vec![
        (1, fix.clone()), (6, fix.clone()),
        (5, roller_x.clone()), (10, roller_x.clone()),
    ];
    let loads_3 = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_3 = make_3d_input(
        nodes_3, vec![(1, e_mpa, nu)], vec![(1, a, iy, iz, j)],
        elems_3, sups_3, loads_3,
    );
    let res_3 = linear::solve_3d(&input_3).unwrap();

    // Differential deflection: loaded beam vs unloaded beam
    let d2_1xb = res_1.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;
    let d5_1xb = res_1.displacements.iter().find(|d| d.node_id == 5).unwrap().uy;
    let diff_1: f64 = (d2_1xb - d5_1xb).abs();

    let d3_3xb = res_3.displacements.iter().find(|d| d.node_id == 3).unwrap().uy;
    let d8_3xb = res_3.displacements.iter().find(|d| d.node_id == 8).unwrap().uy;
    let diff_3: f64 = (d3_3xb - d8_3xb).abs();

    // More diaphragms should reduce differential deflection
    assert!(diff_3 < diff_1,
        "More diaphragms reduce differential: 3xb={:.6e}, 1xb={:.6e}", diff_3, diff_1);

    // Equilibrium for both
    let sum_1: f64 = res_1.reactions.iter().map(|r| r.fy).sum();
    let sum_3: f64 = res_3.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_1, p, 0.02, "1-diaphragm equilibrium");
    assert_close(sum_3, p, 0.02, "3-diaphragm equilibrium");
}

// ================================================================
// 7. Influence Surface -- Moving Load for Maximum Beam Moment
// ================================================================
//
// Place a unit load at different positions along a beam and find the
// position that maximizes the midspan bending moment. For a simply-
// supported beam, maximum midspan moment occurs when the load is at
// midspan: M_max = PL/4.
//
// In a two-beam grillage, the critical load position for maximum moment
// in beam 1 is directly on beam 1 midspan (not on the cross-beam).
//
// Reference: Cusens & Pama, "Bridge Deck Analysis", Ch. 3 -- influence surfaces.

#[test]
fn validation_grill_ext_influence_surface() {
    let lx: f64 = 10.0;
    let lz: f64 = 3.0;
    let p: f64 = 1.0;  // unit load for influence

    let e_mpa: f64 = 30_000.0;
    let nu: f64 = 0.2;
    let e_eff: f64 = e_mpa * 1000.0;
    let a: f64 = 0.12;
    let iy: f64 = 0.002;
    let iz: f64 = 0.010;
    let j: f64 = 0.004;

    let fix = vec![true, true, true, true, true, true];
    let roller_x = vec![false, true, true, true, true, true];

    // Single simply-supported beam: PL/4 midspan moment
    let input_single = make_3d_beam(
        4, lx, e_mpa, nu, a, iy, iz, j,
        fix.clone(), Some(roller_x.clone()),
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: -p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_single = linear::solve_3d(&input_single).unwrap();
    let d_single_mid = res_single.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().uy.abs();

    // Analytical: delta = PL^3/(48EI_z) for midspan point load
    let d_exact: f64 = p * lx.powi(3) / (48.0 * e_eff * iz);
    assert_close(d_single_mid, d_exact, 0.03, "SS beam midspan deflection");

    // Grillage: load at midspan of beam 1 vs load at quarter-span
    // Midspan load → larger moment on beam 1
    let build_grill_loaded = |load_node: usize| {
        let nodes = vec![
            (1, 0.0, 0.0, 0.0), (2, lx / 4.0, 0.0, 0.0),
            (3, lx / 2.0, 0.0, 0.0), (4, 3.0 * lx / 4.0, 0.0, 0.0),
            (5, lx, 0.0, 0.0),
            (6, 0.0, 0.0, lz), (7, lx / 4.0, 0.0, lz),
            (8, lx / 2.0, 0.0, lz), (9, 3.0 * lx / 4.0, 0.0, lz),
            (10, lx, 0.0, lz),
        ];
        let elems = vec![
            (1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1),
            (3, "frame", 3, 4, 1, 1), (4, "frame", 4, 5, 1, 1),
            (5, "frame", 6, 7, 1, 1), (6, "frame", 7, 8, 1, 1),
            (7, "frame", 8, 9, 1, 1), (8, "frame", 9, 10, 1, 1),
            (9, "frame", 3, 8, 1, 1),  // cross-beam at midspan
        ];
        let sups = vec![
            (1, fix.clone()), (6, fix.clone()),
            (5, roller_x.clone()), (10, roller_x.clone()),
        ];
        let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: load_node, fx: 0.0, fy: -p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })];
        make_3d_input(
            nodes, vec![(1, e_mpa, nu)], vec![(1, a, iy, iz, j)],
            elems, sups, loads,
        )
    };

    // Load at midspan of beam 1 (node 3)
    let res_mid = linear::solve_3d(&build_grill_loaded(3)).unwrap();
    let d_mid = res_mid.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().uy.abs();

    // Load at quarter-span of beam 1 (node 2)
    let res_qtr = linear::solve_3d(&build_grill_loaded(2)).unwrap();
    let d_qtr_at_mid = res_qtr.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().uy.abs();

    // Midspan deflection is larger when load is at midspan
    assert!(d_mid > d_qtr_at_mid,
        "Midspan load gives larger midspan deflection: {:.6e} > {:.6e}",
        d_mid, d_qtr_at_mid);

    // Equilibrium
    let sum_ry: f64 = res_mid.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_ry, p, 0.02, "Influence surface equilibrium");
}

// ================================================================
// 8. Beam-Slab Grillage -- Comparison with Simplified Distribution
// ================================================================
//
// Compare a grillage model with a simplified beam analysis where each
// beam carries load based on tributary width. For a grillage of n
// identical beams at spacing s under uniform load q per unit area,
// each beam should carry approximately q*s*L in total (tributary).
//
// The grillage model should give similar results to the simplified
// approach for interior beams under uniform loading.
//
// Reference: O'Brien & Keogh, Ch. 5 -- beam-slab equivalence.

#[test]
fn validation_grill_ext_beam_slab_comparison() {
    let lx: f64 = 10.0;
    let s: f64 = 2.5;          // beam spacing
    let p_per_beam: f64 = 15.0; // equivalent load on each beam (q*s*L/2 distributed)

    let e_mpa: f64 = 30_000.0;
    let nu: f64 = 0.2;
    let e_eff: f64 = e_mpa * 1000.0;
    let a: f64 = 0.12;
    let iy: f64 = 0.002;
    let iz: f64 = 0.010;
    let j: f64 = 0.004;

    let fix = vec![true, true, true, true, true, true];
    let roller_x = vec![false, true, true, true, true, true];

    // -- Simplified: single beam with tributary load P at midspan --
    let input_simple = make_3d_beam(
        4, lx, e_mpa, nu, a, iy, iz, j,
        fix.clone(), Some(roller_x.clone()),
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: -p_per_beam, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_simple = linear::solve_3d(&input_simple).unwrap();
    let d_simple = res_simple.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().uy.abs();

    // Analytical check: PL^3/(48EI)
    let d_analytical: f64 = p_per_beam * lx.powi(3) / (48.0 * e_eff * iz);
    assert_close(d_simple, d_analytical, 0.03, "Simplified beam deflection = PL^3/(48EI)");

    // -- Grillage: 3 beams, uniform load P on each at midspan --
    let nodes = vec![
        (1,  0.0,      0.0, 0.0),
        (2,  lx / 2.0, 0.0, 0.0),
        (3,  lx,       0.0, 0.0),
        (4,  0.0,      0.0, s),
        (5,  lx / 2.0, 0.0, s),
        (6,  lx,       0.0, s),
        (7,  0.0,      0.0, 2.0 * s),
        (8,  lx / 2.0, 0.0, 2.0 * s),
        (9,  lx,       0.0, 2.0 * s),
    ];
    let elems = vec![
        // main beams
        (1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1),
        (3, "frame", 4, 5, 1, 1), (4, "frame", 5, 6, 1, 1),
        (5, "frame", 7, 8, 1, 1), (6, "frame", 8, 9, 1, 1),
        // cross-beams at midspan
        (7, "frame", 2, 5, 1, 1),
        (8, "frame", 5, 8, 1, 1),
    ];
    let sups = vec![
        (1, fix.clone()), (4, fix.clone()), (7, fix.clone()),
        (3, roller_x.clone()), (6, roller_x.clone()), (9, roller_x.clone()),
    ];
    // Equal load on each beam midspan
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -p_per_beam, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 5, fx: 0.0, fy: -p_per_beam, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 8, fx: 0.0, fy: -p_per_beam, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];
    let input_grill = make_3d_input(
        nodes, vec![(1, e_mpa, nu)], vec![(1, a, iy, iz, j)],
        elems, sups, loads,
    );
    let res_grill = linear::solve_3d(&input_grill).unwrap();

    // Interior beam midspan deflection (node 5)
    let d_interior = res_grill.displacements.iter()
        .find(|d| d.node_id == 5).unwrap().uy.abs();

    // Under uniform loading, interior beam deflection should be close
    // to simplified single beam deflection (within ~5% due to cross-beam coupling)
    let ratio: f64 = d_interior / d_simple;
    assert_close(ratio, 1.0, 0.05,
        "Interior beam deflection close to simplified");

    // Equilibrium
    let total_load: f64 = 3.0 * p_per_beam;
    let sum_ry: f64 = res_grill.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_ry, total_load, 0.02, "Beam-slab equilibrium");

    // Exterior beams should have similar deflection (symmetric loading)
    let d_ext1 = res_grill.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy.abs();
    let d_ext3 = res_grill.displacements.iter()
        .find(|d| d.node_id == 8).unwrap().uy.abs();
    assert_close(d_ext1, d_ext3, 0.02, "Exterior beams symmetric deflection");
}
