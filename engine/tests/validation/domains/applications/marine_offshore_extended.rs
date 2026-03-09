/// Validation: Marine & Offshore Structural Engineering (Extended)
///
/// References:
///   - DNV-RP-C205: Environmental Conditions and Environmental Loads (2021)
///   - API RP 2A-WSD: Planning, Designing, and Constructing Fixed Offshore Platforms (2014)
///   - Morison et al.: "The Force Exerted by Surface Waves on Piles" (1950)
///   - Chakrabarti: "Hydrodynamics of Offshore Structures" (1987)
///   - DNV-OS-J101: Design of Offshore Wind Turbine Structures
///   - Sarpkaya & Isaacson: "Mechanics of Wave Forces on Offshore Structures" (1981)
///
/// Tests verify Morison equation forces, hydrostatic pressure on vertical
/// members, jacket structures, monopile foundations, wave-current interaction,
/// buoyancy effects, deck load paths, and environmental load combinations
/// using the 2D linear solver.

use dedaliano_engine::solver::linear::*;
use dedaliano_engine::types::*;
use crate::common::*;

// ================================================================
// 1. Morison Equation: Inline Wave Force on a Vertical Pile
// ================================================================
//
// Morison (1950): F = Cd * rho * D * |u| * u / 2  +  Cm * rho * pi * D^2 * a / 4
//
// For a pile in regular waves the drag and inertia maxima do not
// coincide (90 deg phase shift).  We compute the peak drag force
// per unit length, convert to an equivalent UDL on a cantilever
// pile, solve, and check that the base moment matches
// M_base = F_drag * L / 2  (uniform load on cantilever).
//
// Reference: DNV-RP-C205 Section 6.2

#[test]
fn marine_morison_inline_force() {
    // Wave & pile parameters
    let rho: f64 = 1025.0;        // kg/m^3, seawater density
    let d_pile: f64 = 1.2;        // m, pile outer diameter
    let cd: f64 = 1.05;           // drag coefficient (circular cylinder)
    let u_max: f64 = 2.5;         // m/s, maximum horizontal particle velocity

    // Peak drag force per unit length (at phase of max velocity)
    // f_d = 0.5 * rho * Cd * D * u^2   [N/m]
    let f_drag_per_m: f64 = 0.5 * rho * cd * d_pile * u_max * u_max;
    // Convert N/m -> kN/m
    let q_drag: f64 = f_drag_per_m / 1000.0;

    // Model: cantilever pile of length L fixed at mudline, uniform drag load
    let l: f64 = 12.0;            // m, pile length above mudline
    let n: usize = 6;
    let e: f64 = 200_000.0;       // MPa (steel)
    let a: f64 = 0.02;            // m^2, cross-section area
    let iz: f64 = 5.0e-4;         // m^4, second moment of area

    // Build cantilever with uniform lateral load (fy = -q_drag, acting downward in solver coords)
    // In the solver the beam lies along X, so transverse load is fy.
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q_drag,
            q_j: -q_drag,
            a: None,
            b: None,
        }));
    }
    let input = make_beam(n, l, e, a, iz, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical base moment for cantilever with UDL:
    // M_base = q * L^2 / 2
    let m_base_expected: f64 = q_drag * l * l / 2.0;

    // The fixed support reaction moment
    let reaction = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_base_actual: f64 = reaction.mz.abs();

    assert_close(m_base_actual, m_base_expected, 0.02, "Morison drag: base moment");

    // Also verify total shear at base = q * L
    let v_base_expected: f64 = q_drag * l;
    let v_base_actual: f64 = reaction.ry.abs();
    assert_close(v_base_actual, v_base_expected, 0.02, "Morison drag: base shear");
}

// ================================================================
// 2. Hydrostatic Pressure: Linearly Varying Load on Vertical Member
// ================================================================
//
// A submerged vertical column experiences hydrostatic pressure that
// varies linearly with depth: p(z) = rho * g * z.
// For a vertical member modeled horizontally (along X in the solver),
// we apply a trapezoidal distributed load that varies from
// q_top at the surface to q_bot at the seabed.
//
// Analytical base moment for a cantilever with linearly varying load
// from 0 at tip to q_max at root:
//   M_base = q_max * L^2 / 6
// For a load from q_top (tip) to q_bot (root):
//   M_base = q_top * L^2 / 2 + (q_bot - q_top) * L^2 / 6
// which for q_top = 0 gives M_base = q_bot * L^2 / 6.
//
// Reference: Chakrabarti, "Hydrodynamics of Offshore Structures", Ch. 3

#[test]
fn marine_hydrostatic_pressure_vertical() {
    let rho: f64 = 1025.0;        // kg/m^3
    let g: f64 = 9.81;            // m/s^2
    let d_member: f64 = 0.8;      // m, member diameter
    let depth: f64 = 10.0;        // m, water depth (member length)

    // Pressure at seabed: p_bot = rho * g * depth [Pa]
    // Force per unit length at seabed: q_bot = p_bot * D [N/m] -> [kN/m]
    let q_bot: f64 = rho * g * depth * d_member / 1000.0;
    // At surface: q_top = 0

    let n: usize = 10;
    let e: f64 = 200_000.0;
    let a: f64 = 0.015;
    let iz: f64 = 3.0e-4;

    // The beam goes from node 1 (fixed, seabed) to node n+1 (free, surface).
    // Element i goes from node i to node i+1.
    // At node 1 (x=0, seabed): q = q_bot
    // At node n+1 (x=depth, surface): q = 0
    // For element i (node i to node i+1):
    //   x_i = (i-1)*elem_len, x_j = i*elem_len
    //   q_i = q_bot * (1 - x_i/depth), q_j = q_bot * (1 - x_j/depth)
    let elem_len: f64 = depth / n as f64;
    let mut loads = Vec::new();
    for i in 0..n {
        let x_start: f64 = i as f64 * elem_len;
        let x_end: f64 = (i + 1) as f64 * elem_len;
        let qi: f64 = q_bot * (1.0 - x_start / depth);
        let qj: f64 = q_bot * (1.0 - x_end / depth);
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -qi,
            q_j: -qj,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, depth, e, a, iz, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical: cantilever with triangular load from q_bot at root to 0 at tip.
    // Total load = q_bot * L / 2
    // Base shear = q_bot * L / 2
    let v_base_expected: f64 = q_bot * depth / 2.0;
    let reaction = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(reaction.ry.abs(), v_base_expected, 0.02, "Hydrostatic: base shear");

    // Base moment for triangular load (max at root, zero at tip):
    // M_base = q_bot * L^2 / 6
    let m_base_expected: f64 = q_bot * depth * depth / 6.0;
    assert_close(reaction.mz.abs(), m_base_expected, 0.02, "Hydrostatic: base moment");
}

// ================================================================
// 3. Jacket Structure: Simplified 2D Offshore Platform Leg
// ================================================================
//
// A simplified 2D jacket (braced frame) representing one panel of an
// offshore platform. Two vertical legs connected by a horizontal brace
// at the top, with a diagonal brace. A lateral wave load is applied
// at the top. We check global equilibrium and that the structure
// deflects in the direction of the applied load.
//
// Reference: API RP 2A-WSD, Section 2

#[test]
fn marine_jacket_structure() {
    let h: f64 = 20.0;            // m, jacket height (one bay)
    let w: f64 = 10.0;            // m, bay width
    let f_wave: f64 = 150.0;      // kN, lateral wave force at top

    let e: f64 = 200_000.0;       // MPa, steel
    let a_leg: f64 = 0.03;        // m^2, leg section area
    let iz_leg: f64 = 1.0e-3;     // m^4, leg second moment
    let a_brace: f64 = 0.01;      // m^2, brace section area
    let iz_brace: f64 = 2.0e-4;   // m^4, brace second moment

    // Nodes: 1=bottom-left, 2=top-left, 3=top-right, 4=bottom-right
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];

    // Materials and sections: legs = sec 1, braces = sec 2
    let mats = vec![(1, e, 0.3)];
    let secs = vec![
        (1, a_leg, iz_leg),
        (2, a_brace, iz_brace),
    ];

    // Elements: 2 legs, 1 top beam, 1 diagonal brace
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left leg
        (2, "frame", 4, 3, 1, 1, false, false), // right leg
        (3, "frame", 2, 3, 1, 2, false, false), // top beam
        (4, "frame", 1, 3, 1, 2, false, false), // diagonal brace
    ];

    let sups = vec![
        (1, 1, "fixed"),
        (2, 4, "fixed"),
    ];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: f_wave,
            fy: 0.0,
            mz: 0.0,
        }),
    ];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Global equilibrium: sum of horizontal reactions = applied load
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f_wave, 0.01, "Jacket: horizontal equilibrium");

    // Top-left node should deflect in +x direction
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(
        d2.ux > 0.0,
        "Jacket: top-left node moves in wave direction (ux={:.6})",
        d2.ux
    );

    // Overturning moment about base = F_wave * h
    // Resisted by vertical reactions: sum(Ry * x) = F_wave * h
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    // Vertical equilibrium (no gravity): sum Ry should be ~0
    assert_close(sum_ry, 0.0, 0.01, "Jacket: vertical equilibrium");
}

// ================================================================
// 4. Pile Under Lateral Load: Cantilever Monopile Foundation
// ================================================================
//
// A monopile (used for offshore wind turbines) is modeled as a
// cantilever with a point load at the top. We verify the tip
// deflection and base reactions against classical formulas.
//
// Tip deflection: delta = P * L^3 / (3 * E * I)
// Base moment: M = P * L
// Base shear: V = P
//
// Reference: DNV-OS-J101, Section 10

#[test]
fn marine_monopile_lateral_load() {
    let l: f64 = 30.0;            // m, exposed pile length
    let p: f64 = 500.0;           // kN, lateral load at mudline top
    let e: f64 = 200_000.0;       // MPa, steel
    let d_pile: f64 = 5.0;        // m, pile diameter
    let t_wall: f64 = 0.060;      // m, wall thickness

    // Section properties for a hollow circular section
    let a: f64 = std::f64::consts::PI * d_pile * t_wall; // approximate thin-wall
    let iz: f64 = std::f64::consts::PI * d_pile.powi(3) * t_wall / 8.0;

    let n: usize = 10;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];

    let input = make_beam(n, l, e, a, iz, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Tip deflection: delta = P * L^3 / (3 * E * I)
    let e_eff: f64 = e * 1000.0; // solver multiplies by 1000 internally
    let delta_expected: f64 = p * l.powi(3) / (3.0 * e_eff * iz);
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.uy.abs(), delta_expected, 0.02, "Monopile: tip deflection");

    // Base moment: M = P * L
    let m_expected: f64 = p * l;
    let reaction = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(reaction.mz.abs(), m_expected, 0.01, "Monopile: base moment");

    // Base shear: V = P
    assert_close(reaction.ry.abs(), p, 0.01, "Monopile: base shear");
}

// ================================================================
// 5. Wave-Current Combination: Superimposed Velocity
// ================================================================
//
// When waves and currents coexist, the total particle velocity used
// in the Morison drag term is u_wave + u_current. This test applies
// wave-only and combined wave+current loads on a cantilever pile and
// verifies that the combined base moment exceeds wave-only.
//
// Reference: DNV-RP-C205, Section 6.6

#[test]
fn marine_wave_current_combination() {
    let rho: f64 = 1025.0;
    let d_pile: f64 = 1.0;
    let cd: f64 = 1.0;
    let u_wave: f64 = 2.0;        // m/s, peak wave velocity
    let u_current: f64 = 1.0;     // m/s, steady current velocity

    // Drag force per unit length -- wave only
    let q_wave: f64 = 0.5 * rho * cd * d_pile * u_wave * u_wave / 1000.0;
    // Drag force per unit length -- wave + current (superimposed)
    let u_total: f64 = u_wave + u_current;
    let q_combined: f64 = 0.5 * rho * cd * d_pile * u_total * u_total / 1000.0;

    let l: f64 = 15.0;
    let n: usize = 6;
    let e: f64 = 200_000.0;
    let a: f64 = 0.015;
    let iz: f64 = 3.0e-4;

    // Solve wave-only case
    let mut loads_wave = Vec::new();
    for i in 0..n {
        loads_wave.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q_wave,
            q_j: -q_wave,
            a: None,
            b: None,
        }));
    }
    let input_wave = make_beam(n, l, e, a, iz, "fixed", None, loads_wave);
    let results_wave = solve_2d(&input_wave).expect("solve wave");
    let r_wave = results_wave.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_wave: f64 = r_wave.mz.abs();

    // Solve combined case
    let mut loads_combined = Vec::new();
    for i in 0..n {
        loads_combined.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q_combined,
            q_j: -q_combined,
            a: None,
            b: None,
        }));
    }
    let input_combined = make_beam(n, l, e, a, iz, "fixed", None, loads_combined);
    let results_combined = solve_2d(&input_combined).expect("solve combined");
    let r_combined = results_combined.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_combined: f64 = r_combined.mz.abs();

    // Analytical moments: M = q * L^2 / 2
    let m_wave_expected: f64 = q_wave * l * l / 2.0;
    let m_combined_expected: f64 = q_combined * l * l / 2.0;

    assert_close(m_wave, m_wave_expected, 0.02, "Wave-current: wave-only moment");
    assert_close(m_combined, m_combined_expected, 0.02, "Wave-current: combined moment");

    // Combined must be larger (u_total > u_wave, force scales as u^2)
    let ratio_actual: f64 = m_combined / m_wave;
    let ratio_expected: f64 = (u_total * u_total) / (u_wave * u_wave);
    assert_close(ratio_actual, ratio_expected, 0.02, "Wave-current: force ratio u_total^2/u_wave^2");
}

// ================================================================
// 6. Buoyancy: Net Weight of Submerged Tubular Member
// ================================================================
//
// A submerged tubular member experiences buoyancy = rho_w * g * V_displaced.
// Net submerged weight per unit length:
//   w_sub = w_steel - rho_w * g * A_outer
//
// This test models a simply supported horizontal tubular member under
// its net submerged weight and verifies the midspan deflection against
// the standard formula: delta = 5 * q * L^4 / (384 * E * I).
//
// Reference: Sarpkaya & Isaacson, "Mechanics of Wave Forces", Ch. 2

#[test]
fn marine_buoyancy_submerged_tubular() {
    let d_outer: f64 = 0.60;      // m, outer diameter
    let t_wall: f64 = 0.020;      // m, wall thickness
    let rho_steel: f64 = 7850.0;  // kg/m^3
    let rho_water: f64 = 1025.0;  // kg/m^3
    let g_acc: f64 = 9.81;        // m/s^2

    // Cross section properties (thin-wall approximation)
    let a_steel: f64 = std::f64::consts::PI * d_outer * t_wall;
    let a_outer: f64 = std::f64::consts::PI * d_outer * d_outer / 4.0;
    let iz: f64 = std::f64::consts::PI * d_outer.powi(3) * t_wall / 8.0;

    // Weight of steel per unit length [kN/m]
    let w_steel: f64 = rho_steel * a_steel * g_acc / 1000.0;
    // Buoyancy per unit length [kN/m]
    let w_buoyancy: f64 = rho_water * a_outer * g_acc / 1000.0;
    // Net submerged weight per unit length [kN/m]
    let w_sub: f64 = w_steel - w_buoyancy;

    // Buoyancy should reduce the effective weight
    assert!(
        w_sub < w_steel,
        "Submerged weight {:.3} < steel weight {:.3} kN/m",
        w_sub, w_steel
    );
    assert!(
        w_sub > 0.0,
        "Steel member sinks (net weight positive): {:.3} kN/m",
        w_sub
    );

    // Model: simply supported beam under net submerged self-weight
    let l: f64 = 8.0;
    let n: usize = 8;
    let e: f64 = 200_000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -w_sub,
            q_j: -w_sub,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, e, a_steel, iz, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Midspan deflection: delta = 5 * q * L^4 / (384 * E * I)
    let e_eff: f64 = e * 1000.0;
    let delta_expected: f64 = 5.0 * w_sub * l.powi(4) / (384.0 * e_eff * iz);
    let mid_node = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_d.uy.abs(), delta_expected, 0.05, "Buoyancy: midspan deflection");

    // Each support carries half the total load
    let r_expected: f64 = w_sub * l / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry.abs(), r_expected, 0.02, "Buoyancy: support reaction");
}

// ================================================================
// 7. Deck Load Path: Load Transfer from Topsides Through Legs
// ================================================================
//
// An offshore platform topside applies gravity loads that transfer
// through the legs to the foundation. We model a portal frame
// representing two legs and a deck beam, with vertical deck loads.
// By symmetry each leg carries half the total load.
//
// Reference: API RP 2A-WSD, Section 6

#[test]
fn marine_deck_load_path() {
    let h: f64 = 15.0;            // m, leg height
    let w: f64 = 12.0;            // m, deck span
    let e: f64 = 200_000.0;       // MPa
    let a: f64 = 0.04;            // m^2
    let iz: f64 = 2.0e-3;         // m^4

    // Deck equipment load distributed along the beam
    let q_deck: f64 = -50.0;      // kN/m (downward)

    // Use portal frame with zero lateral load and zero nodal gravity,
    // then add distributed load on the deck beam (element 2: nodes 2->3)
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let mats = vec![(1, e, 0.3)];
    let secs = vec![(1, a, iz)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left leg
        (2, "frame", 2, 3, 1, 1, false, false), // deck beam
        (3, "frame", 3, 4, 1, 1, false, false), // right leg
    ];
    let sups = vec![
        (1, 1, "fixed"),
        (2, 4, "fixed"),
    ];
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2,
            q_i: q_deck,
            q_j: q_deck,
            a: None,
            b: None,
        }),
    ];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Total applied load = |q_deck| * w
    let total_load: f64 = q_deck.abs() * w;

    // By symmetry, each support vertical reaction = total_load / 2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    let ry_sum: f64 = r1.ry + r4.ry;
    assert_close(ry_sum, total_load, 0.01, "Deck load: vertical equilibrium");

    // Symmetry: each leg carries approximately half
    assert_close(r1.ry, r4.ry, 0.01, "Deck load: symmetric leg reactions");

    // No net horizontal load: sum of horizontal reactions = 0
    let rx_sum: f64 = r1.rx + r4.rx;
    assert_close(rx_sum, 0.0, 0.01, "Deck load: horizontal equilibrium");
}

// ================================================================
// 8. Environmental Load Combination: 100% Wave + 100% Current on Frame
// ================================================================
//
// Per API RP 2A and DNV rules, environmental loads (wave + current)
// are combined at 100% for the operating condition. This test builds
// a portal frame representing a jacket panel, applies both wave and
// current forces on the windward leg, and checks that the combined
// response equals the superposition of individual cases (linear
// solver → principle of superposition holds exactly).
//
// Reference: API RP 2A-WSD, Section 2.3.4

#[test]
fn marine_environmental_load_combination() {
    let h: f64 = 18.0;            // m, frame height
    let w: f64 = 10.0;            // m, frame width
    let e: f64 = 200_000.0;
    let a: f64 = 0.025;
    let iz: f64 = 8.0e-4;

    // Wave force on windward leg (distributed along left column, elem 1)
    let q_wave: f64 = 5.0;        // kN/m
    // Current force on windward leg
    let q_current: f64 = 2.0;     // kN/m

    let make_frame = |q_left: f64| -> SolverInput {
        let nodes = vec![
            (1, 0.0, 0.0),
            (2, 0.0, h),
            (3, w, h),
            (4, w, 0.0),
        ];
        let mats = vec![(1, e, 0.3)];
        let secs = vec![(1, a, iz)];
        let elems = vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ];
        let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
        // Distributed load on left leg (element 1 goes from node 1 to node 2)
        // In local coords, transverse load on a vertical member:
        // Element 1 goes bottom to top (1->2), so local x is along the column.
        // Transverse load (perpendicular) acts as q_i/q_j distributed load.
        let loads = vec![
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 1,
                q_i: q_left,
                q_j: q_left,
                a: None,
                b: None,
            }),
        ];
        make_input(nodes, mats, secs, elems, sups, loads)
    };

    // Solve wave only
    let results_wave = solve_2d(&make_frame(q_wave)).expect("solve wave");
    let d2_wave = results_wave.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // Solve current only
    let results_current = solve_2d(&make_frame(q_current)).expect("solve current");
    let d2_current = results_current.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // Solve combined (100% wave + 100% current)
    let results_combined = solve_2d(&make_frame(q_wave + q_current)).expect("solve combined");
    let d2_combined = results_combined.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // Superposition: combined displacement = wave + current displacement
    let ux_super: f64 = d2_wave.ux + d2_current.ux;
    let uy_super: f64 = d2_wave.uy + d2_current.uy;

    assert_close(d2_combined.ux, ux_super, 0.01, "Env combo: superposition ux");
    assert_close(d2_combined.uy, uy_super, 0.01, "Env combo: superposition uy");

    // Combined reactions should also superpose
    let r1_wave = results_wave.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_current = results_current.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_combined = results_combined.reactions.iter().find(|r| r.node_id == 1).unwrap();

    let rx_super: f64 = r1_wave.rx + r1_current.rx;
    assert_close(r1_combined.rx, rx_super, 0.01, "Env combo: superposition rx");

    let mz_super: f64 = r1_wave.mz + r1_current.mz;
    assert_close(r1_combined.mz, mz_super, 0.01, "Env combo: superposition mz");
}
