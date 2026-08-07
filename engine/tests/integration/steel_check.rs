//! AISC 360 (LRFD) member checks, verified against hand-computed values.
//!
//! Every expected number below is derived from the governing equation in the
//! comment above it, using only the fixture properties and the code constants —
//! so a reader can re-derive it without running the implementation, and a
//! formula error moves the number rather than staying inside a tolerance band.
//!
//! These replace assertions of the form `assert!(ratio > 0.5 && ratio < 1.5)`,
//! which accepted a 3x range and so could not fail on any realistic error, and
//! `assert!((phi_pn - 0.90 * fy * ag).abs() < eps)`, which re-derived the
//! expected value from the same constants the implementation uses and therefore
//! could not fail at all.
//!
//! Fixture: W14x22, A992 (Fy = 50 ksi), AISC 14th ed. properties in SI.
//!   Ag = 4.19e-3 m²   Sx = 4.75e-4 m³   Zx = 5.44e-4 m³   rx = 0.1407 m
//!   Iy = 2.91e-6 m⁴   Sy = 4.59e-5 m³   Zy = 7.19e-5 m³   ry = 0.02642 m
//!   J  = 8.66e-8 m⁴   Cw = 8.43e-8 m⁶   d  = 0.348 m
//!
//! Derived once and reused below:
//!   Lp   = 1.76·ry·sqrt(E/Fy)  = 1.76·0.02642·24.0772       = 1.11963 m
//!   rts  = sqrt(sqrt(Iy·Cw)/Sx)
//!        = sqrt(sqrt(2.91e-6·8.43e-8)/4.75e-4)              = 0.0322911 m
//!   Jc/(Sx·ho) with ho = d       = 8.66e-8/(4.75e-4·0.348)  = 5.23896e-4
//!   Lr   = 1.95·rts·(E/0.7Fy)·sqrt(Jc/(Sx·ho) + sqrt((Jc/(Sx·ho))² + 6.76(0.7Fy/E)²))
//!        = 1.95·0.0322911·828.157·0.0608841                 = 3.17488 m
//!   Mp   = Fy·Zx = 345e6·5.44e-4                            = 187.68 kN·m
//!   4.71·sqrt(E/Fy) = 4.71·24.0772                          = 113.40

use dedaliano_engine::postprocess::steel_check::*;

fn w14x22_data(eid: usize, lby: f64, lbz: f64) -> SteelMemberData {
    SteelMemberData {
        element_id: eid,
        fy: 345e6,
        ag: 4.19e-3,
        an: None,
        u_factor: None,
        lby,
        lbz,
        ky: None,
        kz: None,
        iy: 8.28e-5,
        iz: 2.91e-6,
        ry: 0.1407,
        rz: 0.02642,
        zy: 5.44e-4,
        zz: 7.19e-5,
        sy: 4.75e-4,
        sz: 4.59e-5,
        j: 8.66e-8,
        cw: Some(8.43e-8),
        lb: Some(lbz),
        cb: Some(1.0),
        e: 200e9,
        g: Some(77e9),
        depth: Some(0.348),
    }
}

fn run(lb: f64, forces: ElementDesignForces) -> SteelCheckResult {
    check_steel_members(&SteelCheckInput {
        members: vec![w14x22_data(1, lb, lb)],
        forces: vec![forces],
    })
    .remove(0)
}

fn close(actual: f64, expected: f64, what: &str) {
    assert!(
        (actual - expected).abs() / expected.abs() < 1e-4,
        "{what}: got {actual:.4}, expected {expected:.4}"
    );
}

/// D2-1, tension yielding on the gross section:
///   phi·Pn = 0.90 · 345e6 · 4.19e-3 = 1_300_995 N
///   ratio  = 500 kN / 1300.995 kN   = 0.38432
#[test]
fn steel_tension_yielding_capacity_and_ratio() {
    let r = run(3.0, ElementDesignForces { element_id: 1, n: 500e3, my: 0.0, mz: None, vy: None });

    close(r.phi_pn_tension, 1_300_995.0, "phi·Pn tension");
    close(r.tension_ratio, 0.384324, "tension ratio");
    assert_eq!(r.compression_ratio, 0.0, "a tension member has no compression demand");
}

/// E3, elastic flexural buckling at Lb = 5 m.
///   KL/r = max(5/0.1407, 5/0.02642) = 189.251  >  113.40, so E3-3 applies
///   Fe   = pi²E/(KL/r)² = 1.97392e12/35_815.8  = 55.113 MPa
///   Fcr  = 0.877·Fe                            = 48.334 MPa
///   phi·Pn = 0.90·48.334e6·4.19e-3             = 182_268 N
#[test]
fn steel_elastic_buckling_capacity() {
    let r = run(5.0, ElementDesignForces { element_id: 1, n: -150e3, my: 0.0, mz: None, vy: None });

    close(r.phi_pn_compression, 182_268.4, "phi·Pn compression (elastic)");
    close(r.compression_ratio, 150e3 / 182_268.4, "compression ratio");
}

/// E3, inelastic flexural buckling at Lb = 1 m.
///   KL/r = max(1/0.1407, 1/0.02642) = 37.850  <  113.40, so E3-2 applies
///   Fe   = pi²E/(KL/r)² = 1.97392e12/1_432.62 = 1_377.84 MPa
///   Fcr  = 0.658^(Fy/Fe)·Fy = 0.658^0.250392·345e6
///        = 0.900468·345e6                     = 310.66 MPa
///   phi·Pn = 0.90·310.66e6·4.19e-3            = 1_171_504 N
#[test]
fn steel_inelastic_buckling_capacity() {
    let r = run(1.0, ElementDesignForces { element_id: 1, n: -800e3, my: 0.0, mz: None, vy: None });

    close(r.phi_pn_compression, 1_171_504.5, "phi·Pn compression (inelastic)");
    // Stocky: within 10 % of the squash load 0.9·Fy·Ag = 1_300_995 N.
    assert!(r.phi_pn_compression > 0.89 * 1_300_995.0);
}

/// F2-2, inelastic lateral-torsional buckling at Lb = 2 m (Lp < Lb < Lr).
///   Mn = Cb·[Mp - (Mp - 0.7·Fy·Sx)·(Lb - Lp)/(Lr - Lp)]
///      = 187_680 - (187_680 - 114_712.5)·(2.0 - 1.11963)/(3.17488 - 1.11963)
///      = 187_680 - 72_967.5·0.428364                = 156_423 N·m
///   phi·Mn = 0.90 · 156_423                         = 140_781 N·m
///   ratio  = 80 kN·m / 140.781 kN·m                 = 0.56825
#[test]
fn steel_inelastic_ltb_capacity() {
    let r = run(2.0, ElementDesignForces { element_id: 1, n: 0.0, my: 80e3, mz: None, vy: None });

    close(r.phi_mn_y, 140_780.8, "phi·Mn_y (inelastic LTB)");
    close(r.flexure_y_ratio, 0.568254, "flexure-y ratio");
    assert!(r.phi_mn_y < 0.9 * 187_680.0, "LTB must reduce below phi·Mp");
}

/// F2-3/F2-4, elastic lateral-torsional buckling at Lb = 4 m (Lb > Lr).
///   Lb/rts = 4.0/0.0322911 = 123.873
///   Fcr = Cb·pi²E/(Lb/rts)² · sqrt(1 + 0.078·Jc/(Sx·ho)·(Lb/rts)²)
///       = 128.638e6 · sqrt(1 + 0.627105) = 128.638e6 · 1.275580 = 164.088 MPa
///   Mn  = Fcr·Sx = 164.088e6 · 4.75e-4   = 77_942 N·m  (< Mp)
///   phi·Mn = 0.90 · 77_942                = 70_148 N·m
#[test]
fn steel_elastic_ltb_capacity() {
    let r = run(4.0, ElementDesignForces { element_id: 1, n: 0.0, my: 50e3, mz: None, vy: None });

    close(r.phi_mn_y, 70_147.6, "phi·Mn_y (elastic LTB)");
}

/// F6-1, minor-axis flexure: Mn = min(Mp, 1.6·Fy·Sy).
///   Mp,z    = 345e6 · 7.19e-5 = 24_805.5 N·m
///   1.6·My,z = 1.6·345e6·4.59e-5 = 25_336.8 N·m
///   Mn      = 24_805.5 N·m (the plastic moment governs)
///   phi·Mn  = 0.90 · 24_805.5 = 22_324.95 N·m
#[test]
fn steel_minor_axis_flexure_capacity() {
    let r = run(3.0, ElementDesignForces {
        element_id: 1, n: 0.0, my: 0.0, mz: Some(10e3), vy: None,
    });

    close(r.phi_mn_z, 22_324.95, "phi·Mn_z");
    close(r.flexure_z_ratio, 0.447929, "flexure-z ratio");
}

/// H1-1a, combined compression and biaxial bending at Lb = 4 m.
///   Pr/Pc      = 200 kN / 284.799 kN   = 0.702250   (>= 0.2, so H1-1a)
///   Mry/Mcy    = 50 kN·m / 70.148 kN·m = 0.712788
///   Mrz/Mcz    = 10 kN·m / 22.325 kN·m = 0.447929
///   Pr/Pc + (8/9)(Mry/Mcy + Mrz/Mcz)
///     = 0.702250 + 0.888889·1.160717   = 1.733998   -> over unity
#[test]
fn steel_h1_interaction_ratio() {
    let r = run(4.0, ElementDesignForces {
        element_id: 1, n: -200e3, my: 50e3, mz: Some(10e3), vy: None,
    });

    close(r.compression_ratio, 0.702250, "compression ratio");
    close(r.flexure_y_ratio, 0.712788, "flexure-y ratio");
    close(r.flexure_z_ratio, 0.447929, "flexure-z ratio");
    close(r.interaction_ratio, 1.733998, "H1-1a interaction");

    assert_eq!(r.governing_check, "Interaction H1");
    close(r.unity_ratio, 1.733998, "unity ratio");
}

/// H1-1b applies below Pr/Pc = 0.2: Pr/(2Pc) + (Mry/Mcy + Mrz/Mcz).
///   At Lb = 5 m, phi·Pn = 182_268 N. Pr = 30 kN -> Pr/Pc = 0.164592 < 0.2
///   phi·Mn_y at Lb = 5 m (elastic LTB, Lb/rts = 154.841, squared 23_975.8):
///     0.078·Jc/(Sx·ho)·(Lb/rts)² = 0.078·5.23896e-4·23_975.8 = 0.979745
///     Fcr = 82.330e6·sqrt(1.979745) = 82.330e6·1.407034       = 115.841 MPa
///     phi·Mn_y = 0.90·115.841e6·4.75e-4                       = 49_521.9 N·m
///   0.164592/2 + 20_000/49_521.9 = 0.082296 + 0.403862        = 0.486158
#[test]
fn steel_h1b_interaction_below_the_transition() {
    let r = run(5.0, ElementDesignForces {
        element_id: 1, n: -30e3, my: 20e3, mz: None, vy: None,
    });

    assert!(r.compression_ratio < 0.2, "must be on the H1-1b branch: {:.4}", r.compression_ratio);
    close(r.phi_mn_y, 49_521.9, "phi·Mn_y at Lb = 5 m");
    close(r.interaction_ratio, 0.486158, "H1-1b interaction");
}

/// A short member develops the full plastic moment: Lb = 1 m < Lp = 1.11963 m,
/// so phi·Mn = 0.90·Mp = 168_912 N·m with no LTB reduction at all.
#[test]
fn steel_below_lp_develops_the_plastic_moment() {
    let r = run(1.0, ElementDesignForces { element_id: 1, n: 0.0, my: 100e3, mz: None, vy: None });

    close(r.phi_mn_y, 0.90 * 187_680.0, "phi·Mp");
    close(r.flexure_y_ratio, 100e3 / (0.90 * 187_680.0), "flexure-y ratio");
}

/// Results are keyed and ordered by element id, and each member is paired with
/// its own force record.
#[test]
fn steel_check_multiple_members() {
    let results = check_steel_members(&SteelCheckInput {
        members: vec![
            w14x22_data(3, 5.0, 5.0),
            w14x22_data(1, 1.0, 1.0),
            w14x22_data(2, 2.0, 2.0),
        ],
        forces: vec![
            ElementDesignForces { element_id: 1, n: 0.0, my: 100e3, mz: None, vy: None },
            ElementDesignForces { element_id: 2, n: 0.0, my: 80e3, mz: None, vy: None },
            ElementDesignForces { element_id: 3, n: 0.0, my: 50e3, mz: None, vy: None },
        ],
    });

    assert_eq!(results.len(), 3);
    assert_eq!(results[0].element_id, 1);
    assert_eq!(results[1].element_id, 2);
    assert_eq!(results[2].element_id, 3);

    // Element 1 is below Lp; 2 is in the inelastic band; 3 is elastic. Capacity
    // must fall monotonically with unbraced length.
    close(results[0].phi_mn_y, 0.90 * 187_680.0, "element 1 phi·Mn_y");
    close(results[1].phi_mn_y, 140_780.8, "element 2 phi·Mn_y");
    close(results[2].phi_mn_y, 49_521.9, "element 3 phi·Mn_y");
}
