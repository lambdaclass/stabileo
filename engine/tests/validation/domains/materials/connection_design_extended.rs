/// Validation: Extended Steel Connection Design Analysis
///
/// References:
///   - AISC 360-22: Specification for Structural Steel Buildings, Ch. J
///   - AISC Steel Construction Manual, 15th Edition, Parts 7-10
///   - AISC Design Guide 1: "Base Plate and Anchor Rod Design" (2006)
///   - AISC Design Guide 4: "Extended End-Plate Moment Connections" (2003)
///   - AISC Design Guide 29: "Vertical Bracing Connections" (2014)
///   - EN 1993-1-8:2005 (Eurocode 3, Part 1-8): Design of joints
///   - Salmon, Johnson & Malhas, "Steel Structures", 5th Ed., Ch. 12-14
///   - Thornton, "Prying Action — A General Treatment", AISC Eng. J. (1985)
///   - Kulak, Fisher & Struik, "Guide to Design Criteria for Bolted
///     and Riveted Joints", 2nd Ed.
///
/// Tests combine connection design formula verification with solver-based
/// structural analysis to validate force demands at connection locations.

use dedaliano_engine::{types::*, solver::linear::solve_2d};
use crate::common::*;

use std::f64::consts::PI;

const E: f64 = 200_000.0;       // MPa (solver multiplies by 1000 -> kN/m^2)
const A: f64 = 0.01;            // m^2
const IZ: f64 = 1e-4;           // m^4
const _EI: f64 = 20_000.0;      // E * 1000 * IZ, in kN*m^2

// ================================================================
// 1. Bolt Group Elastic Analysis — Eccentric Shear on 2x3 Pattern
// ================================================================
//
// A simply-supported beam with a point load creates a known shear
// at the end connection. The elastic bolt group method distributes
// the shear and torsional moment to each bolt.
//
// Beam: L = 6 m, 6 elements, point load P = 120 kN at midspan.
// Connection at left support: 6-bolt group (2 cols x 3 rows).
//
// Solver gives: R_A = P/2 = 60 kN (vertical reaction at left).
//
// Bolt group geometry (relative to centroid):
//   Gauge g = 100 mm, pitch s = 75 mm
//   Bolt positions: (+-50, -75), (+-50, 0), (+-50, +75)
//
// Eccentricity of shear from bolt centroid: e = 150 mm
// Direct shear per bolt: Fv = V/n = 60/6 = 10 kN
//
// Ip = sum(xi^2 + yi^2) = 6*50^2 + 2*(2*75^2) = 15000 + 22500 = 37500 mm^2
//
// M = V * e = 60 * 150 = 9000 kN-mm
// Critical bolt at (+50, +75): r = sqrt(50^2+75^2) = 90.14 mm
//   Fm_x = M*y/Ip = 9000*75/37500 = 18.0 kN
//   Fm_y = M*x/Ip = 9000*50/37500 = 12.0 kN
//   R_bolt = sqrt((Fv+Fm_y)^2 + Fm_x^2) = sqrt(22^2+18^2) = sqrt(808) = 28.43 kN
//
// Reference: AISC Manual Part 7, Elastic Method

#[test]
fn validation_bolt_group_elastic_analysis_eccentric_shear() {
    let l: f64 = 6.0;
    let p: f64 = 120.0;
    let n = 6; // elements

    // -- Solver: SS beam with midspan point load --
    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).unwrap();

    // Verify reaction at left support
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.rz, p / 2.0, 0.02, "R_A = P/2");

    let v: f64 = r_a.rz; // connection shear demand from solver

    // -- Bolt group elastic analysis --
    let _g: f64 = 100.0;  // mm, gauge
    let _s: f64 = 75.0;   // mm, pitch
    let e_bolt: f64 = 150.0; // mm, eccentricity from bolt centroid

    let bolts: [(f64, f64); 6] = [
        (-50.0, -75.0), (50.0, -75.0),
        (-50.0,   0.0), (50.0,   0.0),
        (-50.0,  75.0), (50.0,  75.0),
    ];

    // Polar moment of inertia
    let ix: f64 = bolts.iter().map(|b| b.1 * b.1).sum::<f64>();
    let iy: f64 = bolts.iter().map(|b| b.0 * b.0).sum::<f64>();
    let ip: f64 = ix + iy;
    assert_close(ix, 22500.0, 0.02, "Ix = sum(yi^2)");
    assert_close(iy, 15000.0, 0.02, "Iy = sum(xi^2)");
    assert_close(ip, 37500.0, 0.02, "Ip = Ix + Iy");

    // Direct shear
    let fv: f64 = v / 6.0;
    assert_close(fv, 10.0, 0.02, "Direct shear per bolt");

    // Moment from eccentricity
    let m_bolt: f64 = v * e_bolt; // kN-mm
    assert_close(m_bolt, 9000.0, 0.02, "Torsional moment");

    // Critical bolt at (+50, +75)
    let x_crit: f64 = 50.0;
    let y_crit: f64 = 75.0;
    let r_crit: f64 = (x_crit * x_crit + y_crit * y_crit).sqrt();
    assert_close(r_crit, 90.14, 0.02, "Critical bolt distance");

    let fm_x: f64 = m_bolt * y_crit / ip;
    let fm_y: f64 = m_bolt * x_crit / ip;
    assert_close(fm_x, 18.0, 0.02, "Fm_x at critical bolt");
    assert_close(fm_y, 12.0, 0.02, "Fm_y at critical bolt");

    // Resultant on critical bolt (shear is vertical)
    let r_bolt: f64 = ((fv + fm_y).powi(2) + fm_x.powi(2)).sqrt();
    let r_expected: f64 = (22.0_f64.powi(2) + 18.0_f64.powi(2)).sqrt();
    assert_close(r_bolt, r_expected, 0.02, "Resultant bolt force");
    assert_close(r_bolt, 28.43, 0.03, "R_bolt = 28.43 kN");
}

// ================================================================
// 2. Fillet Weld Capacity — Welded Beam Connection with UDL
// ================================================================
//
// A cantilever beam with UDL creates known shear at the fixed support.
// The welded connection at the support must resist this shear.
//
// Beam: L = 4 m, cantilever, UDL q = 30 kN/m.
// Solver: V_base = q*L = 120 kN, M_base = q*L^2/2 = 240 kN-m.
//
// Fillet weld connection (two welds along beam depth):
//   Weld size: a = 8 mm, depth d = 400 mm
//   FEXX = 490 MPa (E70xx), effective throat: te = 0.707*8 = 5.656 mm
//   Total weld length: L_w = 2*400 = 800 mm
//
// Shear stress on weld: fv = V / (te * L_w) = 120000 / (5.656*800) = 26.52 MPa
// Bending stress on weld: fb = M / S_w
//   S_w = te * d^2/3 = 5.656 * 400^2/3 = 301,653 mm^3 (for two welds)
//   fb = 240e6 / 301653 = 795.6 MPa -- but we use section modulus of weld group
//   Actually: S_w for two parallel welds = 2 * te * d^2/6 = te*d^2/3
//   fb = M*1e6 / S_w
//
// Combined: fr = sqrt(fv^2 + fb^2)
// Allowable: phi*Fnw = 0.75 * 0.60 * 490 = 220.5 MPa
//
// Reference: AISC J2.4, Blodgett "Design of Welded Structures"

#[test]
fn validation_fillet_weld_capacity_cantilever() {
    let l: f64 = 4.0;
    let q: f64 = 30.0;
    let n = 8;
    // -- Solver: cantilever with UDL --
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = solve_2d(&input).unwrap();

    // Verify reaction at fixed support
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let v_base: f64 = r1.rz;
    let m_base: f64 = r1.my;
    assert_close(v_base, q * l, 0.02, "V_base = q*L");
    assert_close(m_base.abs(), q * l * l / 2.0, 0.02, "M_base = q*L^2/2");

    // -- Fillet weld capacity check --
    let a_leg: f64 = 8.0;         // mm, weld leg size
    let d_beam: f64 = 400.0;      // mm, beam depth
    let fexx: f64 = 490.0;        // MPa (E70xx)
    let phi_weld: f64 = 0.75;

    let te: f64 = 0.707 * a_leg;  // effective throat
    assert_close(te, 5.656, 0.02, "Effective throat");

    let l_w: f64 = 2.0 * d_beam;  // total weld length (two sides)
    assert_close(l_w, 800.0, 0.02, "Total weld length");

    // Shear stress on weld
    let fv_weld: f64 = v_base * 1000.0 / (te * l_w); // MPa
    assert_close(fv_weld, 120000.0 / (5.656 * 800.0), 0.02, "Shear stress on weld");

    // Section modulus of weld group (two parallel welds):
    // S_w = te * d^2 / 3
    let s_w: f64 = te * d_beam * d_beam / 3.0;
    assert_close(s_w, 5.656 * 160000.0 / 3.0, 0.02, "Weld section modulus");

    // Bending stress on weld
    let fb_weld: f64 = m_base.abs() * 1e6 / s_w; // MPa

    // Combined resultant stress
    let fr: f64 = (fv_weld * fv_weld + fb_weld * fb_weld).sqrt();
    assert!(fr > 0.0, "Resultant weld stress is positive: {:.2} MPa", fr);

    // Allowable weld stress
    let fnw_allow: f64 = phi_weld * 0.60 * fexx;
    assert_close(fnw_allow, 220.5, 0.02, "Allowable weld stress");

    // Weld utilization ratio
    let utilization: f64 = fr / fnw_allow;
    assert!(utilization > 0.0, "Weld utilization ratio: {:.4}", utilization);
}

// ================================================================
// 3. Moment End Plate — Bolt Tension from Portal Frame Moment
// ================================================================
//
// A portal frame with lateral load creates moments at beam-column joints.
// The moment end plate connection bolt forces are derived from the joint moment.
//
// Portal frame: h=4m, w=8m, lateral load H=50 kN at top.
// Solver gives joint moments at beam-column connection.
//
// End plate connection (extended, 4 bolt rows in tension):
//   Beam depth d = 500 mm, flange thickness tf = 16 mm
//   Row 1 (outside flange): d1 = d + 40 = 540 mm from comp. flange
//   Row 2 (inside flange, near): d2 = d - tf - 40 = 444 mm
//   Row 3 (inside, far): d3 = d - tf - 120 = 364 mm
//   Row 4 (web, mid): d4 = d/2 = 250 mm
//
//   sum(di^2) = 540^2 + 444^2 + 364^2 + 250^2
//             = 291600 + 197136 + 132496 + 62500 = 683732 mm^2
//
//   Bolt row tension: Ti = M * di / sum(di^2)
//   Per bolt (2 bolts per row): Bi = Ti / 2
//
// Equilibrium check: sum(Ti * di) = M
//
// Reference: AISC DG 4, Extended End-Plate Connections

#[test]
fn validation_moment_end_plate_portal_frame() {
    let h: f64 = 4.0;
    let w: f64 = 8.0;
    let h_load: f64 = 50.0;

    // -- Solver: portal frame with lateral load --
    let input = make_portal_frame(h, w, E, A, IZ, h_load, 0.0);
    let results = solve_2d(&input).unwrap();

    // Joint moment at node 2 (top of left column / left end of beam)
    // Element 2 is the beam (node 2 to node 3)
    let ef_beam = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap();
    let m_joint: f64 = ef_beam.m_start.abs(); // moment at beam start (joint)
    assert!(m_joint > 0.0, "Joint moment is positive: {:.2} kN-m", m_joint);

    // -- End plate bolt force calculation --
    let d_beam: f64 = 500.0;     // mm
    let tf: f64 = 16.0;          // mm

    let d1: f64 = d_beam + 40.0;           // 540 mm
    let d2: f64 = d_beam - tf - 40.0;      // 444 mm
    let d3: f64 = d_beam - tf - 120.0;     // 364 mm
    let d4: f64 = d_beam / 2.0;            // 250 mm

    assert_close(d1, 540.0, 0.02, "d1 = 540 mm");
    assert_close(d2, 444.0, 0.02, "d2 = 444 mm");
    assert_close(d3, 364.0, 0.02, "d3 = 364 mm");
    assert_close(d4, 250.0, 0.02, "d4 = 250 mm");

    let sum_d2: f64 = d1 * d1 + d2 * d2 + d3 * d3 + d4 * d4;
    assert_close(sum_d2, 683732.0, 0.02, "sum(di^2)");

    // Bolt row tensions from solver-derived moment
    let m_nmm: f64 = m_joint * 1e6; // N-mm
    let t1: f64 = m_nmm * d1 / sum_d2 / 1000.0; // kN per row
    let t2: f64 = m_nmm * d2 / sum_d2 / 1000.0;
    let t3: f64 = m_nmm * d3 / sum_d2 / 1000.0;
    let t4: f64 = m_nmm * d4 / sum_d2 / 1000.0;

    // Outer rows carry more tension
    assert!(t1 > t2 && t2 > t3 && t3 > t4,
        "Bolt tension decreases with distance from tension flange: T1={:.2} > T2={:.2} > T3={:.2} > T4={:.2}",
        t1, t2, t3, t4);

    // Per bolt (2 bolts per row)
    let b1: f64 = t1 / 2.0;
    assert!(b1 > 0.0, "Per-bolt tension: {:.2} kN", b1);

    // Equilibrium: sum(Ti * di) should equal M
    let m_check: f64 = (t1 * 1000.0 * d1 + t2 * 1000.0 * d2
                        + t3 * 1000.0 * d3 + t4 * 1000.0 * d4) / 1e6;
    assert_close(m_check, m_joint, 0.02, "Moment equilibrium of bolt group");
}

// ================================================================
// 4. Base Plate Design — Column Under Eccentric Loading
// ================================================================
//
// A cantilever column with axial + lateral loads creates combined
// axial force and moment at the base. The base plate bearing
// pressure and anchor bolt tension are checked.
//
// Column: L = 3 m, fixed at base, free at top.
// Axial: P = 1500 kN (compression downward), Lateral: H = 15 kN at top.
//
// Solver gives: base reaction Rx = P, Ry = H, Mz = H*L.
// M_base = 15*3 = 45 kN-m
//
// Base plate: B = 400 mm, N = 500 mm
// Eccentricity: e = M/P = 45e3/1500 = 30 mm
// Kern: N/6 = 500/6 = 83.33 mm
// e = 30 mm < N/6 = 83.33 mm => full bearing (within kern)
//
// f_avg = P/(B*N) = 1500e3/(400*500) = 7.50 MPa
// f_max = f_avg*(1+6e/N) = 7.50*(1+6*30/500) = 7.50*1.36 = 10.20 MPa
// f_min = f_avg*(1-6e/N) = 7.50*(1-0.36) = 7.50*0.64 = 4.80 MPa
//
// Allowable bearing: phi*0.85*f'c = 0.65*0.85*30 = 16.575 MPa
// f_max = 10.20 < 16.575 => OK
//
// Reference: AISC Design Guide 1

#[test]
fn validation_base_plate_design_cantilever_column() {
    let l: f64 = 3.0;
    let p_axial: f64 = 1500.0;
    let h_lateral: f64 = 15.0;
    let n = 6;

    // -- Solver: cantilever column (modeled along X) --
    // Fixed at base (node 1), free at top (node n+1)
    // Axial load (along element axis) and transverse load at tip
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: -p_axial, fz: h_lateral, my: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = solve_2d(&input).unwrap();

    // Base reaction
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rx, p_axial, 0.05, "Base Rx = P");
    assert_close(r1.rz.abs(), h_lateral, 0.05, "Base Ry = H");
    let m_base: f64 = r1.my.abs();
    assert_close(m_base, h_lateral * l, 0.05, "Base Mz = H*L");

    // -- Base plate bearing design --
    let b_plate: f64 = 400.0;     // mm
    let n_plate: f64 = 500.0;     // mm
    let fc: f64 = 30.0;           // MPa, concrete strength
    let phi_c: f64 = 0.65;

    // Eccentricity
    let e: f64 = m_base * 1000.0 / p_axial; // mm
    assert_close(e, 30.0, 0.05, "Eccentricity e = M/P");

    let kern: f64 = n_plate / 6.0;
    assert_close(kern, 83.333, 0.02, "Kern N/6");

    // Within kern: full bearing
    assert!(e < kern,
        "Within kern: e={:.2} mm < N/6={:.2} mm", e, kern);

    // Average bearing pressure
    let f_avg: f64 = p_axial * 1000.0 / (b_plate * n_plate);
    assert_close(f_avg, 7.50, 0.02, "f_avg = P/(B*N)");

    // Maximum and minimum bearing
    let f_max: f64 = f_avg * (1.0 + 6.0 * e / n_plate);
    let f_min: f64 = f_avg * (1.0 - 6.0 * e / n_plate);
    assert!(f_min > 0.0, "Full bearing: f_min={:.2} > 0", f_min);
    assert_close(f_max, 10.20, 0.05, "f_max bearing stress");
    assert_close(f_min, 4.80, 0.05, "f_min bearing stress");

    // Allowable bearing
    let f_allow: f64 = phi_c * 0.85 * fc;
    assert_close(f_allow, 16.575, 0.02, "Allowable bearing");

    // Check bearing adequacy
    assert!(f_max < f_allow,
        "Bearing OK: f_max={:.2} < f_allow={:.2} MPa",
        f_max, f_allow);

    // Required plate thickness (cantilever model)
    let d_col: f64 = 260.0;        // mm, column depth
    let bf_col: f64 = 260.0;       // mm, column flange width
    let fy_plate: f64 = 250.0;     // MPa
    let phi_b: f64 = 0.90;

    let m_proj: f64 = (n_plate - 0.95 * d_col) / 2.0;
    let n_proj: f64 = (b_plate - 0.80 * bf_col) / 2.0;
    let critical: f64 = m_proj.max(n_proj);

    let t_req: f64 = critical * (2.0 * f_max / (phi_b * fy_plate)).sqrt();
    assert!(t_req > 0.0 && t_req < 100.0,
        "Plate thickness reasonable: {:.2} mm", t_req);

    // Verify larger lateral load increases eccentricity
    let h_large: f64 = 30.0;
    let m_large: f64 = h_large * l;
    let e_large: f64 = m_large * 1000.0 / p_axial;
    assert!(e_large > e, "Larger lateral load increases eccentricity: {:.2} > {:.2}", e_large, e);
}

// ================================================================
// 5. Gusset Plate Whitmore Section — Braced Frame Diagonal
// ================================================================
//
// A braced portal frame with lateral load creates axial force in
// the diagonal brace. The gusset plate at the connection is checked
// using the Whitmore effective width method.
//
// Truss-like structure: two-bay braced frame with diagonal.
// Nodes: 1(0,0), 2(0,3), 3(4,3), 4(4,0)
// Diagonal brace from node 4 to node 2 (or 1 to 3).
//
// For a simple braced frame, the horizontal load is resisted primarily
// by the diagonal brace in axial force.
//
// Whitmore width: L_w = 2*L_conn*tan(30) + g
// Whitmore yielding: Rn = Fy * L_w * t_gusset
// Gusset buckling: check KL/r against column curve
//
// Reference: AISC DG 29, Thornton method

#[test]
fn validation_gusset_plate_whitmore_section() {
    // -- Solver: simple braced frame --
    // 4 nodes: square frame 4m wide x 3m tall with diagonal brace
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, 3.0),
        (3, 4.0, 3.0),
        (4, 4.0, 0.0),
    ];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, A, IZ)]; // frame members
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
        (4, "frame", 1, 3, 1, 1, false, false), // diagonal brace
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "pinned")];
    let h_load: f64 = 100.0;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: h_load, fz: 0.0, my: 0.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = solve_2d(&input).unwrap();

    // Get axial force in diagonal brace (element 4)
    let ef_brace = results.element_forces.iter()
        .find(|e| e.element_id == 4).unwrap();
    let p_brace: f64 = ef_brace.n_start.abs();
    assert!(p_brace > 0.0, "Brace carries axial force: {:.2} kN", p_brace);

    // -- Gusset plate Whitmore section check --
    let t_gusset: f64 = 12.0;     // mm
    let fz: f64 = 345.0;          // MPa
    let _fu: f64 = 450.0;         // MPa
    let g_bolt: f64 = 80.0;       // mm, bolt gauge
    let s_bolt: f64 = 65.0;       // mm, bolt pitch
    let n_per_row: f64 = 3.0;     // bolts per row

    // Connection length
    let l_conn: f64 = (n_per_row - 1.0) * s_bolt;
    assert_close(l_conn, 130.0, 0.02, "Connection length");

    // Whitmore width (30-degree spread)
    let tan_30: f64 = (PI / 6.0).tan();
    let l_w: f64 = 2.0 * l_conn * tan_30 + g_bolt;
    assert!(l_w > g_bolt, "Whitmore width > gauge: {:.2} > {:.2}", l_w, g_bolt);

    // Whitmore section tensile yielding capacity
    let rn_whitmore: f64 = fz * l_w * t_gusset / 1000.0; // kN
    let phi_rn_whitmore: f64 = 0.90 * rn_whitmore;
    assert!(phi_rn_whitmore > 0.0, "Whitmore yielding capacity: {:.2} kN", phi_rn_whitmore);

    // Gusset buckling check (compression brace)
    let lb: f64 = 200.0;          // mm, unbraced length (Thornton average)
    let k: f64 = 0.65;            // compact gusset
    let r_gyration: f64 = t_gusset / (12.0_f64).sqrt();
    let kl_r: f64 = k * lb / r_gyration;
    assert!(kl_r > 0.0 && kl_r < 200.0, "KL/r = {:.1} reasonable", kl_r);

    // Euler buckling stress
    let fe: f64 = PI * PI * 200_000.0 / (kl_r * kl_r);
    assert!(fe > fz, "Fe > Fy: inelastic region");

    // AISC column curve (inelastic)
    let fcr: f64 = 0.658_f64.powf(fz / fe) * fz;
    let pn_buckling: f64 = fcr * l_w * t_gusset / 1000.0;
    let phi_pn_buckling: f64 = 0.90 * pn_buckling;

    // Demand/capacity ratio
    let dcr: f64 = p_brace / phi_rn_whitmore.min(phi_pn_buckling);
    assert!(dcr > 0.0, "Demand/capacity ratio: {:.4}", dcr);
}

// ================================================================
// 6. Prying Action — T-Stub Flange Under Beam Tension
// ================================================================
//
// A propped cantilever beam with UDL has a known reaction at the
// prop (simple support). When the beam lifts off, the prop must
// resist uplift tension, transferred through a T-stub connection.
//
// Beam: L = 8 m, fixed at left, roller at right.
// UDL q = 10 kN/m upward creates uplift at the roller.
//
// Propped cantilever with upward UDL:
//   R_roller = 3*q*L/8 downward (opposing upward load)
//   R_fixed  = 5*q*L/8 downward
//   For upward load (+q): roller reaction is negative (downward)
//   R_B = -3*q*L/8 = -3*10*8/8 = -30 kN
//
// The roller pulls down => beam wants to lift at that end.
// A T-stub connection at the roller resists tension T = |R_B| = 30 kN.
//
// Prying action parameters:
//   b' = 40 mm, a' = 35 mm, p = 90 mm, t_f = 14 mm, Fy = 345 MPa
//   t_req = sqrt(4*T*b' / (phi*p*Fy))
//   Q/T = (a'/b') * [1 - (t_f/t_req)^2] if t_f < t_req
//
// Reference: Thornton (1985), AISC DG 1

#[test]
fn validation_prying_action_propped_cantilever() {
    let l: f64 = 8.0;
    let q: f64 = 10.0;
    let n = 8;

    // -- Solver: propped cantilever with upward UDL --
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = solve_2d(&input).unwrap();

    // Reaction at roller (node n+1)
    let r_prop = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let v_prop: f64 = r_prop.rz; // negative => downward reaction for upward load

    // For propped cantilever (fixed-roller) with uniform upward load:
    // R_roller = 3*q*L/8, R_fixed = 5*q*L/8
    // Since load is upward (+), reaction at roller is downward (-)
    let r_b_expected: f64 = -3.0 * q * l / 8.0;
    assert_close(v_prop, r_b_expected, 0.05, "Roller reaction R_B = 3qL/8");

    // The prop pulls down, meaning the beam wants to lift.
    // A T-stub connection at the prop resists tension T = |R_B|.
    let t_bolt: f64 = v_prop.abs(); // kN, tension demand per bolt pair

    // -- Prying action calculation --
    let b_prime: f64 = 40.0;       // mm
    let a_prime: f64 = 35.0;       // mm
    let p_trib: f64 = 90.0;        // mm
    let t_f: f64 = 14.0;           // mm, flange thickness
    let fz: f64 = 345.0;           // MPa
    let phi_b: f64 = 0.90;

    // Required flange thickness for no prying
    let t_req: f64 = (4.0 * t_bolt * 1000.0 * b_prime / (phi_b * p_trib * fz)).sqrt();
    assert!(t_req > 0.0, "Required thickness: {:.2} mm", t_req);

    if t_f < t_req {
        // Prying exists
        let ratio_qt: f64 = (a_prime / b_prime) * (1.0 - (t_f / t_req).powi(2));
        assert!(ratio_qt > 0.0, "Prying ratio Q/T: {:.4}", ratio_qt);

        let q_prying: f64 = ratio_qt * t_bolt;
        let b_total: f64 = t_bolt + q_prying;
        assert!(b_total > t_bolt,
            "Total bolt force ({:.2} kN) > applied ({:.2} kN)",
            b_total, t_bolt);

        // Thicker flange reduces prying
        let t_f_thick: f64 = t_req + 5.0;
        let ratio_thick: f64 = (a_prime / b_prime) * (1.0 - (t_f_thick / t_req).powi(2));
        assert!(ratio_thick < 0.0,
            "Thick flange eliminates prying: ratio = {:.4}", ratio_thick);
    } else {
        // No prying (thick flange)
        assert!(t_f >= t_req, "No prying needed");
    }
}

// ================================================================
// 7. Beam Splice — Moment and Shear at Splice Location
// ================================================================
//
// A continuous beam with two spans has a splice at midspan of the
// first span. The solver provides moment and shear at the splice
// location, which must be resisted by the bolted splice connection.
//
// Two-span continuous beam: spans L1 = L2 = 6 m, UDL q = 20 kN/m.
// Splice at midspan of span 1 (x = 3 m).
//
// For two equal spans with UDL:
//   M_interior_support = -q*L^2/8 (over interior support)
//   At midspan of span 1: M = 9*q*L^2/128 ≈ 0.0703*q*L^2
//
// Splice bolt group must carry M_splice and V_splice.
// Flange bolts carry moment, web bolts carry shear.
//
// Reference: AISC Manual Part 10, Beam Splices

#[test]
fn validation_beam_splice_continuous_beam() {
    let l: f64 = 6.0;
    let q: f64 = 20.0;
    let n_per_span = 6;
    let total_elems = 2 * n_per_span;

    // -- Solver: 2-span continuous beam with UDL --
    let elem_len: f64 = l / n_per_span as f64;
    let total_nodes = total_elems + 1;
    let nodes: Vec<_> = (0..total_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..total_elems)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let interior_node = n_per_span + 1; // node at interior support
    let sups = vec![
        (1, 1, "pinned"),
        (2, interior_node, "rollerX"),
        (3, total_nodes, "rollerX"),
    ];
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
                           elems, sups, loads);
    let results = solve_2d(&input).unwrap();

    // Splice is at midspan of span 1 (node = n_per_span/2 + 1 = 4)
    let splice_node = n_per_span / 2 + 1;

    // Get element forces at splice location
    // Element splice_node-1 ends at splice, element splice_node starts at splice
    let ef_left = results.element_forces.iter()
        .find(|e| e.element_id == splice_node - 1).unwrap();
    let ef_right = results.element_forces.iter()
        .find(|e| e.element_id == splice_node).unwrap();

    let m_splice: f64 = ef_left.m_end.abs();
    let v_splice: f64 = ef_right.v_start.abs();

    assert!(m_splice > 0.0, "Splice moment: {:.2} kN-m", m_splice);
    assert!(v_splice > 0.0, "Splice shear: {:.2} kN", v_splice);

    // Equilibrium across splice: moment and shear should be continuous
    assert_close(ef_left.m_end.abs(), ef_right.m_start.abs(), 0.05,
        "Moment continuity at splice");
    assert_close(ef_left.v_end.abs(), ef_right.v_start.abs(), 0.05,
        "Shear continuity at splice");

    // -- Splice bolt group design --
    // Flange bolts carry moment as force couple
    let d_beam: f64 = 400.0;       // mm, beam depth
    let t_flange: f64 = 16.0;      // mm
    let lever_arm: f64 = d_beam - t_flange; // mm, center-to-center of flanges

    // Flange bolt force from moment
    let f_flange: f64 = m_splice * 1e6 / lever_arm / 1000.0; // kN total in flange
    assert!(f_flange > 0.0, "Flange bolt force: {:.2} kN", f_flange);

    // Web bolts carry shear
    let n_web_bolts: f64 = 4.0;
    let f_web_bolt: f64 = v_splice / n_web_bolts;
    assert!(f_web_bolt > 0.0, "Web bolt shear: {:.2} kN per bolt", f_web_bolt);

    // Bolt shear capacity check (M20 A325-N)
    let d_bolt: f64 = 20.0;        // mm
    let fnv: f64 = 457.0;          // MPa, A325-N
    let ab: f64 = PI / 4.0 * d_bolt * d_bolt;
    let phi_rn_bolt: f64 = 0.75 * fnv * ab / 1000.0;
    assert!(phi_rn_bolt > f_web_bolt,
        "Web bolt adequate: phi*Rn={:.2} > demand={:.2} kN",
        phi_rn_bolt, f_web_bolt);
}

// ================================================================
// 8. Column Splice — Combined Axial and Bending at Splice
// ================================================================
//
// A two-story portal frame has a column splice at mid-height of
// the lower story. The solver provides axial force and moment
// demands at the splice location.
//
// Frame: 2 columns (each 6m tall, split into 6 elements), beam at top.
// Gravity load + lateral load.
//
// Column splice at mid-height (x=0, y=3m) must transfer:
//   - Axial compression from gravity
//   - Bending moment from lateral load
//   - Shear from lateral load
//
// Splice connection: bearing type (compression) with flange
// splice plates and web splice plates for moment/shear.
//
// Reference: AISC Manual Part 14, Column Splices

#[test]
fn validation_column_splice_portal_frame() {
    let h: f64 = 6.0;
    let w: f64 = 8.0;
    let p_gravity: f64 = -200.0;   // kN, downward at each beam-column joint
    let h_lateral: f64 = 30.0;     // kN, lateral at top

    // -- Solver: portal frame --
    let input = make_portal_frame(h, w, E, A, IZ, h_lateral, p_gravity);
    let results = solve_2d(&input).unwrap();

    // Column splice at mid-height of left column (element 1)
    // Element 1 goes from node 1 (base) to node 2 (top of column)
    let ef_col = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();

    // Axial force in column (should be compressive from gravity)
    let n_col: f64 = ef_col.n_start;
    // Shear in column (from lateral load)
    let v_col: f64 = ef_col.v_start;
    // Moment at base of column
    let m_col_base: f64 = ef_col.m_start;
    // Moment at top of column
    let m_col_top: f64 = ef_col.m_end;

    // At mid-height (splice), moment is linear interpolation:
    // M_splice = (M_base + M_top) / 2 for uniform shear
    let m_splice: f64 = (m_col_base + m_col_top) / 2.0;

    // Verify equilibrium: sum of vertical reactions = total gravity
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum::<f64>();
    assert_close(sum_ry, -2.0 * p_gravity, 0.05, "Vertical equilibrium");

    // Verify horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>();
    assert_close(sum_rx, -h_lateral, 0.05, "Horizontal equilibrium");

    // -- Column splice connection design --
    // Bearing splice: compression transferred by bearing, moment by flange plates
    let d_col: f64 = 300.0;        // mm, column depth
    let bf_col: f64 = 300.0;       // mm, column flange width
    let tf_col: f64 = 15.0;        // mm, column flange thickness

    // Flange force from moment at splice
    let lever_arm: f64 = d_col - tf_col; // mm
    let f_flange_moment: f64 = m_splice.abs() * 1e6 / lever_arm / 1000.0; // kN

    // Flange force from axial (distributed equally to flanges and web)
    // Simplified: axial goes mainly through flanges
    let a_flange: f64 = bf_col * tf_col; // mm^2, one flange
    let a_total: f64 = 2.0 * a_flange + (d_col - 2.0 * tf_col) * 10.0; // approximate
    let f_flange_axial: f64 = n_col.abs() * (a_flange / a_total);

    // Total flange force (compression flange gets more)
    let f_flange_total: f64 = f_flange_axial + f_flange_moment;
    assert!(f_flange_total > 0.0,
        "Total flange demand: {:.2} kN", f_flange_total);

    // Web splice: carries shear
    let v_splice: f64 = v_col.abs();
    let n_web_bolts: f64 = 4.0;
    let f_web_per_bolt: f64 = v_splice / n_web_bolts;
    assert!(f_web_per_bolt >= 0.0,
        "Web bolt shear demand: {:.2} kN per bolt", f_web_per_bolt);

    // Bearing capacity check: compression transferred by direct bearing
    // Bearing stress at erection seat: P / A_bearing
    let a_bearing: f64 = bf_col * d_col; // mm^2, full column footprint
    let f_bearing: f64 = n_col.abs() * 1000.0 / a_bearing; // MPa
    assert!(f_bearing < 345.0,
        "Bearing stress OK: {:.2} MPa < Fy=345 MPa", f_bearing);

    // Splice plate bolt capacity (M22 A325-N, 4 bolts per flange)
    let d_bolt: f64 = 22.0;
    let fnv: f64 = 457.0;
    let ab: f64 = PI / 4.0 * d_bolt * d_bolt;
    let phi_rn_per_bolt: f64 = 0.75 * fnv * ab / 1000.0;
    let n_flange_bolts: f64 = 4.0;
    let phi_rn_flange_group: f64 = n_flange_bolts * phi_rn_per_bolt;

    assert!(phi_rn_flange_group > f_flange_moment,
        "Flange bolts adequate for moment: capacity={:.2} > demand={:.2} kN",
        phi_rn_flange_group, f_flange_moment);
}
