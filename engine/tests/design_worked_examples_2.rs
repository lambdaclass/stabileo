//! Design checks against PUBLISHED worked examples, part 2: cold-formed steel
//! (AISI S100), timber (NDS), masonry (TMS 402), spread footings (ACI 318 /
//! CIRSOC 201) and serviceability.
//!
//! Same rules as `design_worked_examples.rs`: inputs are the example's printed
//! inputs in its units, every check compared is unit-agnostic unless stated,
//! and the tolerance is the example's printed rounding (0.5 % for three
//! significant figures unless a test says otherwise). Coverage, discrepancies
//! and their resolution are in `docs/verification/DESIGN_EXAMPLES.md`.
//!
//! ── Sources ───────────────────────────────────────────────────────────────
//!
//! [AISI-M] AISI, *Cold-Formed Steel Design Manual*, 2008 edition (keyed to
//!         AISI S100-07). Scholars' Mine, Missouri S&T, ccfss-aisi-spec/159.
//!         Page numbers are the manual's (II-149, III-56 ...).
//! [WDF04] J. Showalter, "Structural Wood Design Using ASD and LRFD", *Wood
//!         Design Focus*, Winter 2004, pp. 11–19 (Problem 10 of Wheat &
//!         Cramer's AF&PA design aid). AWC web-media PDF WDF-2004-UsingASDandLRFD.
//! [AWC-E] AWC/ICC, *2015/2018 Structural Wood Design Examples* (sold, not
//!         free); examples E1.4 and E1.8 as reproduced, with the printed AWC
//!         values, in Tekla Tedds "Verification Example – Axial Compression of
//!         Wood Column (ASD)" (2026) and Dlubal Knowledge Base 001714 (2023).
//! [ENER]  ENERCALC, *SEL Verification Example Series – Wood Column Module*,
//!         2026 V1 (hand calculation pp. 1–5).

use dedaliano_engine::postprocess::cfs_check::*;

/// Relative comparison at the published rounding.
#[track_caller]
fn published(actual: f64, printed: f64, rel: f64, what: &str) {
    let err = (actual - printed).abs() / printed.abs();
    assert!(
        err <= rel,
        "{what}: stabileo {actual:.5}, published {printed} (off by {:.3} %, band {:.2} %)",
        err * 100.0,
        rel * 100.0
    );
}

const THREE_SF: f64 = 0.005;

// ════════════════════════════════════════════════════════════════════════
// AISI S100 (cfs_check) — units: kip, in, ksi. E = 29 500 ksi throughout.
//
// The manual uses G = 11 300 ksi; the checker takes G = E/2.6 = 11 346 ksi.
// G enters only through G·J, a few per cent of the torsional term in these
// sections, so the 0.4 % difference moves no printed digit.
// ════════════════════════════════════════════════════════════════════════

const E_CFS: f64 = 29_500.0;

/// Every property zero; each test sets what its clause reads.
fn cfs_blank(fy: f64) -> CfsMemberData {
    CfsMemberData {
        element_id: 1,
        fy,
        e: E_CFS,
        ag: 0.0,
        ae: 0.0,
        ix: 0.0,
        se_x: 0.0,
        sf_x: 0.0,
        iy: 0.0,
        se_y: 0.0,
        rx: 0.0,
        ry: 0.0,
        j: 0.0,
        cw: 0.0,
        lb: 0.0,
        lc: 0.0,
        k: Some(1.0),
        xo: Some(0.0),
        kx_lx: None,
        kt_lt: None,
        cb: Some(1.0),
        fcrd: None,
        fcrd_flex: None,
        aw: None,
        h: None,
        t: None,
    }
}

fn cfs_run(m: CfsMemberData, axial: f64, mx: f64, shear: f64) -> CfsCheckResult {
    let f = CfsDesignForces {
        element_id: 1,
        axial: Some(axial),
        mx: Some(mx),
        my: None,
        shear: if shear != 0.0 { Some(shear) } else { None },
    };
    check_cfs_members(&CfsCheckInput { members: vec![m], forces: vec![f] }).remove(0)
}

/// [AISI-M] Example III-3, 362S162-54 stud column, Fy = 50 ksi, pp. III-55 –
/// III-57: flexural-torsional buckling governs.
///
/// Printed: A = 0.422 in², rx = 1.44, ry = 0.605 in, J = 0.000451 in⁴,
/// Cw = 0.457 in⁶, xo = −1.28, ro = 2.02 in; KxLx = 120, KyLy = KtLt = 60 in.
/// KyLy/ry = 99.2 → Fe = 29.6 ksi (flexural, y); β = 0.598, σex = 42.0,
/// σt = 24.4 → Fe = 18.5 ksi (C4.1.2-1, governs); λc = 1.64, Fn = 16.3 ksi;
/// fully effective at Fn, Ae = Ag; Pn = 6.88 kips.
///
/// Regression (D18): the checker buckled the member about y only and gave
/// Fn = 24.7 ksi, Pn = 10.4 kips — 51 % above the example. Flexural-torsional
/// buckling (E2.2) is now evaluated from xo; without xo a compression demand
/// is reported unevaluated.
#[test]
fn cfs_aisi_iii3_flexural_torsional_buckling() {
    let m = CfsMemberData {
        ag: 0.422,
        ae: 0.422,
        rx: 1.44,
        ry: 0.605,
        j: 0.000451,
        cw: 0.457,
        lc: 60.0,
        kx_lx: Some(120.0),
        xo: Some(-1.28),
        ..cfs_blank(50.0)
    };
    let r = cfs_run(m.clone(), -1.0, 0.0, 0.0);
    assert!(r.unevaluated.is_empty(), "{:?}", r.unevaluated);
    published(r.fe, 18.5, THREE_SF, "Fe, flexural-torsional (C4.1.2-1)");
    published(r.pn, 6.88, THREE_SF, "Pn = Ae·Fn");
    published(r.pn / 0.422, 16.3, THREE_SF, "Fn (λc = 1.64 > 1.5)");

    // Flexural buckling about y alone: x-flexure and torsion braced (tiny
    // lengths make σex and σt, and so the coupled mode, very large).
    let y_only = CfsMemberData { kx_lx: Some(1e-3), kt_lt: Some(1e-3), ..m.clone() };
    published(cfs_run(y_only, -1.0, 0.0, 0.0).fe, 29.6, THREE_SF, "Fe about y (C4.1.1-1)");

    // Without xo the flexural-torsional mode is unknown: flagged, not passed.
    let r = cfs_run(CfsMemberData { xo: None, ..m }, -1.0, 0.0, 0.0);
    assert!(!r.pass && !r.unevaluated.is_empty());
}

/// [AISI-M] Example III-3 continued, distortional buckling (C4.2), p. III-59
/// and III-61: Py = Ag·Fy = 21.1 kips; Fd = 22.2 ksi → Pcrd = 9.37 kips,
/// λd = 1.50, Pn = 11.0 kips; with the sheathing restraint Fd = 66.5 ksi →
/// Pcrd = 28.1 kips, λd = 0.867, Pn = 17.6 kips. (The length is shortened so
/// that global buckling does not govern; Ae = Ag.)
#[test]
fn cfs_aisi_iii3_distortional_compression() {
    for (fd, pn) in [(22.2, 11.0), (66.5, 17.6)] {
        let m = CfsMemberData {
            ag: 0.422,
            ae: 0.422,
            rx: 1.44,
            ry: 0.605,
            j: 0.000451,
            cw: 0.457,
            lc: 1e-3,
            xo: Some(-1.28),
            fcrd: Some(fd),
            ..cfs_blank(50.0)
        };
        published(cfs_run(m, -1.0, 0.0, 0.0).pn, pn, THREE_SF, "Pnd (C4.2-1)");
    }
}

/// [AISI-M] Example II-3, 550T125-54 track as a beam, Fy = 33 ksi,
/// pp. II-148 – II-150: lateral-torsional buckling (C3.1.2.1) and shear.
///
/// Printed: t = 0.0566 in, A = 0.452 in², Sx = Sf = 0.668 in³, ry = 0.342,
/// ro = 2.15 in, J = 0.000483 in⁴, Cw = 0.315 in⁶, Ly = Lt = 36 in, Cb = 1.30;
/// σey = 26.28, σt = 36.48, Fe = 58.6 ksi (2.78Fy = 91.7 > Fe > 0.56Fy = 18.5);
/// Fc = 30.93 ksi; Sc = 0.606 in³ at f = Fc; Mn = 18.7 kip-in.
/// Shear: h = 5.415 in, h/t = 95.7, √(Ekv/Fy) = 69.1, 1.51× = 104.3,
/// Fv = 14.3 ksi (C3.2.1-3), Vn = 4.38 kips.
///
/// The manual's Fe = Cb·ro·A·√(σey·σt)/Sf is the checker's Me/Sf (ro cancels
/// with σt's 1/(A·ro²)); Iy = A·ry². Sc is the example's effective modulus at
/// Fc, passed as `se_x`.
#[test]
fn cfs_aisi_ii3_ltb_and_shear() {
    let a = 0.452;
    let m = CfsMemberData {
        ag: a,
        iy: a * 0.342 * 0.342,
        sf_x: 0.668,
        se_x: 0.606,
        j: 0.000483,
        cw: 0.315,
        lb: 36.0,
        cb: Some(1.30),
        h: Some(5.415),
        t: Some(0.0566),
        ..cfs_blank(33.0)
    };
    let r = cfs_run(m, 0.0, 1.0, 1.0);
    published(r.mn_x / 0.606, 30.93, THREE_SF, "Fc (C3.1.2.1-2)");
    published(r.mn_x, 18.7, THREE_SF, "Mn = Sc·Fc");
    // shear ratio = V/(φv·Vn) with V = 1
    published(1.0 / (0.95 * r.shear_ratio), 4.38, THREE_SF, "Vn = Aw·Fv (C3.2.1-3)");
}

/// [AISI-M] Example II-1, 9CS2.5x059 / 9CS2.5x070 purlins, Fy = 55 ksi,
/// pp. II-129 – II-130: elastic web shear (C3.2.1-4a), 1.51√(Ekv/Fy) = 80.8.
/// h = 8.485, t = 0.070 in → Fv = 9.69 ksi, Vn = 5.76 kips;
/// h = 8.507, t = 0.059 in (h/t = 144) → Fv = 6.85 ksi, Vn = 3.44 kips.
#[test]
fn cfs_aisi_ii1_elastic_shear() {
    for (h, t, vn) in [(8.485, 0.070, 5.76), (8.507, 0.059, 3.44)] {
        let m = CfsMemberData { h: Some(h), t: Some(t), ..cfs_blank(55.0) };
        let r = cfs_run(m, 0.0, 0.0, 1.0);
        published(1.0 / (0.95 * r.shear_ratio), vn, THREE_SF, "Vn, elastic branch");
    }
}

/// [AISI-M] Example II-4, 800S200-54 joist, Fy = 50 ksi, distortional
/// buckling (C3.1.4), pp. II-152 – II-158.
///
/// Printed: Sf = 1.64 in³, Se = 1.50 in³. Fd = 26.1 ksi (C3.1.4-6): My = 82.0,
/// Mcrd = 42.8 kip-in, λd = 1.38, Mn = 49.8 kip-in. With the sheathing's
/// rotational restraint Fd = 56.4 ksi: Mcrd = 92.5, λd = 0.942,
/// Mn = 66.7 kip-in. (Lb is set short so that LTB does not govern.)
#[test]
fn cfs_aisi_ii4_distortional_flexure() {
    for (fd, mn) in [(26.1, 49.8), (56.4, 66.7)] {
        let m = CfsMemberData {
            sf_x: 1.64,
            se_x: 1.50,
            iy: 1.0,
            j: 1.0,
            lb: 1e-3,
            fcrd_flex: Some(fd),
            ..cfs_blank(50.0)
        };
        published(cfs_run(m, 0.0, 1.0, 0.0).mn_x, mn, THREE_SF, "Mnd (C3.1.4-2)");
    }
}

/// [AISI-M] Example III-9, back-to-back 9CS2.5x059 I-section, Fy = 55 ksi,
/// pp. III-81 – III-84: elastic lateral-torsional buckling.
///
/// Printed: A = 1.76 in², Iy = 2.12 in⁴ (ry = 1.10 in), J = 0.00204 in⁴,
/// Cw = 23.8 in⁶, ro = 3.59 in, Sf = 2 × 2.29 = 4.58 in³, KyLy = KtLt = 126 in,
/// Cb = 1.0; σey = 22.2, σt = 20.3 ksi → Fe = 29.3 ksi < 0.56Fy = 30.8 ksi,
/// Fc = Fe; fully effective, Sc = 4.58 in³; Mn = 134 kip-in.
#[test]
fn cfs_aisi_iii9_elastic_ltb() {
    let m = CfsMemberData {
        ag: 1.76,
        iy: 2.12,
        sf_x: 4.58,
        se_x: 4.58,
        j: 0.00204,
        cw: 23.8,
        lb: 126.0,
        ..cfs_blank(55.0)
    };
    let r = cfs_run(m, 0.0, 1.0, 0.0);
    published(r.mn_x / 4.58, 29.3, THREE_SF, "Fc = Fe (C3.1.2.1-3)");
    published(r.mn_x, 134.0, THREE_SF, "Mn = Sc·Fc");
}

// ════════════════════════════════════════════════════════════════════════
// NDS (timber_check), ASD — units: lbf, in, psi
// ════════════════════════════════════════════════════════════════════════

use dedaliano_engine::postprocess::timber_check::*;

/// Every adjustment factor 1.0; each test sets what its example uses.
fn nds_member(b: f64, d: f64, le: f64) -> TimberMemberData {
    TimberMemberData {
        element_id: 1,
        fb: 0.0,
        ft: 0.0,
        fc: 0.0,
        fv: 0.0,
        e: 0.0,
        e_min: None,
        b,
        d,
        le,
        le_b: None,
        lu: None,
        le_bending: None,
        cd: Some(1.0),
        cm: Some(1.0),
        ct: Some(1.0),
        cf_bending: Some(1.0),
        cf_tension: Some(1.0),
        cf_compression: Some(1.0),
        cfu: Some(1.0),
        ci: Some(1.0),
        cr: Some(1.0),
    }
}

fn nds_run(m: TimberMemberData, moment: f64, axial: f64, shear: f64) -> TimberCheckResult {
    let f = TimberDesignForces { element_id: 1, m: moment, n: Some(axial), v: Some(shear) };
    check_timber_members(&TimberCheckInput { members: vec![m], forces: vec![f] }).remove(0)
}

/// FcE = 0.822·Emin'/(le/d)² and the column curve, as the examples print
/// them, recomputed from the checker's CP: Fc' = Fc*·CP.
fn fce(e_min: f64, slenderness: f64) -> f64 {
    0.822 * e_min / (slenderness * slenderness)
}

/// [AWC-E] Example E1.4, Southern Pine No. 2 posts, 10 ft about both axes,
/// Ke = 1.0, all factors 1.0 (pp. 23–27 of the AWC book, as tabulated by
/// Tekla Tedds with the AWC values).
///
/// Printed (AWC column): 4x4, Fc = 1,450 psi, Emin' = 510,000 psi →
/// Fc* = 1,450, FcE = 357 psi, CP = 0.232, Fc' = 336 psi, P = 4,120 lbs;
/// 6x6, Fc = 525 psi, Emin' = 440,000 psi → Fc* = 525, FcE = 760 psi,
/// CP = 0.801, Fc' = 421 psi, P = 12,725 lbs.
///
/// The dressed sizes (3.5 and 5.5 in, NDS Supplement Table 1B) are not
/// printed; they reproduce the printed FcE. P is Fc'·A: 421 × 30.25 =
/// 12,735, so the printed 12,725 carries a rounding of its own (0.08 %).
#[test]
fn nds_awc_e14_column_stability() {
    for (side, fc, e_min, fce_p, cp, fc_p, p) in
        [(3.5, 1450.0, 510_000.0, 357.0, 0.232, 336.0, 4120.0), (5.5, 525.0, 440_000.0, 760.0, 0.801, 421.0, 12_725.0)]
    {
        published(fce(e_min, 120.0 / side), fce_p, THREE_SF, "FcE");
        let m = TimberMemberData { fc, e_min: Some(e_min), ..nds_member(side, side, 120.0) };
        let r = nds_run(m, 0.0, -1.0, 0.0);
        published(r.cp, cp, THREE_SF, "CP (3.7-1)");
        published(r.fc_prime, fc_p, THREE_SF, "Fc'");
        published(r.fc_prime * side * side, p, THREE_SF, "P = Fc'·A");
    }
}

/// [AWC-E] Example E1.8, No. 2 Southern Pine 2x4 truss member, 36 in between
/// pinned ends, CD = 1.6 (as reproduced in Dlubal KB 001714 with the AWC
/// values).
///
/// Printed: Fc = 1,450, Fb = 1,100 psi, Emin' = 510,000 psi, CF = 1.0;
/// FcE1 = 0.822·510,000/(36.0/3.5)² = 3,963 psi, FcE2 = 0.822·510,000/
/// (36.0/1.5)² = 728 psi; Fc' = 1,450·1.6·…·0.29 = 673 psi; RB = 9.65,
/// FbE = 1.20·510,000/9.65² = 6,577 psi; Fbx' = 1,100·1.6·0.982 = 1,729 psi.
///
/// The CL effective length is not printed; RB = 9.65 is le = 1.37·lu + 3d =
/// 59.82 in, the NDS Table 3.3.3 row for a concentrated load at midspan (the
/// example's loading), passed as `le_bending`. The default (the table's
/// envelope, 2.06·lu below lu/d = 7) would give le = 74.2 in, a lower CL.
/// The printed interaction (0.98) is biaxial; the checker's is strong-axis.
#[test]
fn nds_awc_e18_beam_column_factors() {
    let le: f64 = 1.37 * 36.0 + 3.0 * 3.5;
    published((le * 3.5 / (1.5 * 1.5)).sqrt(), 9.65, THREE_SF, "RB (3.3-5)");
    published(fce(510_000.0, 36.0 / 3.5), 3963.0, THREE_SF, "FcE1");
    published(fce(510_000.0, 36.0 / 1.5), 728.0, THREE_SF, "FcE2");
    let m = TimberMemberData {
        fc: 1450.0,
        fb: 1100.0,
        e_min: Some(510_000.0),
        cd: Some(1.6),
        lu: Some(36.0),
        le_bending: Some(le),
        ..nds_member(1.5, 3.5, 36.0)
    };
    let r = nds_run(m, 1.0, -1.0, 0.0);
    published(r.cp, 0.29, 0.02, "CP (printed to 2 s.f.)");
    published(r.fc_prime, 673.0, THREE_SF, "Fc'");
    published(r.cl, 0.982, THREE_SF, "CL (3.3-6)");
    published(r.fb_prime, 1729.0, THREE_SF, "Fbx'");
}

/// [WDF04] Problem 10 (ASD), 5 × 9-5/8 in Southern Pine 20F-V5 glulam on a
/// 24 ft span with an 8 ft overhang, dead + snow (CD = 1.15), pp. 14–18.
///
/// Printed: Fb = 2000, Fv = 300, Emin = 730,000 psi; lu = 288 in,
/// lu/d = 29.922, le = 1.63·lu + 3d = 498.3 in (Table 3.3.3, uniform load),
/// RB = 13.851, Fb* = 2,300 psi, FbE/Fb* = 1.985, CL = 0.956 (CV = 1.0 does
/// not govern); F'b = 2198 psi; Mpositive = 136,533 lbf·in, fb = 1769 psi;
/// F'v = 345 psi, VB,left = 2.667 × 10³ lbf, fv = 83.1 psi.
///
/// The example's le is the uniform-load row, passed as `le_bending`; without
/// it the checker takes the table's envelope, 1.84·lu = 529.9 in beyond
/// lu/d = 14.3, and CL = 0.951 (0.5 % lower, conservative).
#[test]
fn nds_wdf04_problem10_glulam_beam_stability() {
    let (b, d, lu) = (5.0, 9.625, 288.0);
    let m = TimberMemberData {
        fb: 2000.0,
        fv: 300.0,
        e_min: Some(730_000.0),
        cd: Some(1.15),
        lu: Some(lu),
        le_bending: Some(1.63 * lu + 3.0 * d),
        ..nds_member(b, d, lu)
    };
    published(1.63 * lu + 3.0 * d, 498.3, THREE_SF, "le");
    let r = nds_run(m.clone(), 136_533.0, 0.0, 2667.0);
    published(r.cl, 0.956, THREE_SF, "CL");
    published(r.fb_prime, 2198.0, THREE_SF, "F'b");
    published(r.bending_ratio * r.fb_prime, 1769.0, THREE_SF, "fb = M/S");
    published(r.fv_prime, 345.0, THREE_SF, "F'v");
    published(r.shear_ratio * r.fv_prime, 83.1, THREE_SF, "fv = 3V/(2A)");

    // Default le (the table's envelope) is the longer one: CL no higher.
    let r_env = nds_run(TimberMemberData { le_bending: None, ..m }, 136_533.0, 0.0, 2667.0);
    assert!(r_env.cl < r.cl);
}

/// [ENER] 2x6 Douglas Fir-Larch No. 2 stud, 12 ft, braced across its width
/// by sheathing, axial + wind, pp. 1–5.
///
/// Printed: b = 1.5, d = 5.5 in, A = 8.25 in², Sx = 7.56 in³; Emin = 580 ksi,
/// Fc = 1350, Fbx = 900, Fv = 180 psi; Kx·Lx = 144 in, weak axis fully
/// braced; Lux = 12 ft.
///  · D + L (CD = 1.0, CF = 1.1): le/d = 26.182, F°c = 1485 psi,
///    FcE = 695.505 psi, CP = 0.411, F'c = 610.33 psi; fc = 96.97 psi,
///    DCR = 0.159.
///  · Bending (CD = 1.6, CF = 1.3, Cr = 1.15): le = 1.84·Lux = 264.96 in,
///    RB = 25.45, FbE = 1074.6 psi, F°bx = 2152.8 psi, CL = 0.477,
///    F'bx = 1027.67 psi; Mw = 0.432 ft·kip, fbx = 685.714 psi; V = 144 lbf,
///    fvx = 26.18 psi, F'vx = 288 psi.
///  · D + 0.6W (CD = 1.6, CF = 1.1): fc = 32.323 psi, F°c = 2376 psi,
///    Cp = 0.272, F'c = 647.07 psi; (3.9-3) = 0.702.
///
/// The weak-axis bracing is `le_b = 0`. The checker's S = bd²/6 = 7.5625 in³
/// against the printed 7.56; one CD per run, so the three duration cases are
/// three runs. The default CL length (lu/d > 14.3 → 1.84·lu) is the
/// example's.
#[test]
fn nds_enercalc_stud_column_beam_interaction() {
    let stud = |cd: f64| TimberMemberData {
        fc: 1350.0,
        fb: 900.0,
        fv: 180.0,
        e_min: Some(580_000.0),
        le_b: Some(0.0),
        lu: Some(144.0),
        cd: Some(cd),
        cf_compression: Some(1.1),
        cf_bending: Some(1.3),
        cr: Some(1.15),
        ..nds_member(1.5, 5.5, 144.0)
    };
    published(fce(580_000.0, 144.0 / 5.5), 695.505, 1e-4, "FcE");

    // D + L
    let r = nds_run(stud(1.0), 0.0, -800.0, 0.0);
    published(r.cp, 0.411, THREE_SF, "CP, CD = 1.0");
    published(r.fc_prime, 610.33, THREE_SF, "F'c, CD = 1.0");
    published(r.compression_ratio, 0.159, THREE_SF, "fc/F'c");

    // Wind alone: bending and shear at CD = 1.6
    let r = nds_run(stud(1.6), 0.432 * 12_000.0, 0.0, 144.0);
    published(r.cl, 0.477, THREE_SF, "CL");
    published(r.fb_prime, 1027.67, THREE_SF, "F'bx");
    published(r.bending_ratio, 0.667, THREE_SF, "fbx/F'bx");
    published(r.fv_prime, 288.0, 1e-9, "F'vx");
    published(r.shear_ratio * 288.0, 26.18, THREE_SF, "fvx");

    // D + 0.6W, equation 3.9-3
    let r = nds_run(stud(1.6), 0.432 * 12_000.0, -266.67, 0.0);
    published(r.cp, 0.272, THREE_SF, "Cp, CD = 1.6");
    published(r.fc_prime, 647.07, THREE_SF, "F'c, CD = 1.6");
    published(r.interaction_ratio, 0.702, THREE_SF, "NDS (3.9-3)");
}

// ════════════════════════════════════════════════════════════════════════
// US customary → SI, for the checks whose formulas are coded in MPa and mm
// ════════════════════════════════════════════════════════════════════════

const IN: f64 = 0.0254; // m
const FT: f64 = 0.3048; // m
const PSI: f64 = 6894.757_293; // Pa
const KIP: f64 = 4448.221_615; // N

// ════════════════════════════════════════════════════════════════════════
// TMS 402 (masonry_check), strength design
//
// [P751]  FEMA P-751, *2009 NEHRP Recommended Seismic Provisions: Design
//         Examples* (2012), ch. 10 Masonry (TMS 402-08).
// [P1051] FEMA P-1051, *2015 NEHRP Recommended Seismic Provisions: Design
//         Examples* (2016), ch. 13 Masonry (TMS 402-13).
// [MCG20] W. M. McGinley, "Design of Tall Masonry Walls – Session 2", Masonry
//         Institute of Hawaii (March 2020), TMS 402-13.
// ════════════════════════════════════════════════════════════════════════

use dedaliano_engine::postprocess::masonry_check::*;

fn masonry_member(fm: f64, fy: f64, b: f64, t: f64, d: f64, as_t: f64, h: f64) -> MasonryMemberData {
    MasonryMemberData {
        element_id: 1,
        fm,
        fy,
        em: None,
        b,
        t,
        d,
        as_tension: as_t,
        h,
        k: Some(1.0),
        an: None,
        av: None,
        s_stirrup: None,
        laterally_tied: None,
        gamma_g: None,
    }
}

fn masonry_run(m: MasonryMemberData, pu: f64, mu: f64, vu: f64) -> MasonryCheckResult {
    let f = MasonryDesignForces { element_id: 1, pu: Some(pu), mu: Some(mu), vu: Some(vu) };
    check_masonry_members(&MasonryCheckInput { members: vec![m], forces: vec![f] }).remove(0)
}

/// [MCG20] slide 38, 21 ft solid-grouted 8 in CMU wall, #5 @ 16 in at
/// mid-depth, per 12 in width (psi, in, lb).
///
/// Printed: t = 7.625 in, h = 21.0 ft, r = 2.20 in, h/r = 114.5, R = 0.373,
/// f'm = 2,000 psi, fy = 60,000 psi, An = 91.5 in², As = 0.2325 in², φ = 0.9;
/// "Peak Axial Compr, Pa = 39,265" lb (Eq. 9-20), with the note "because
/// compression reinforcement is not laterally supported, it is not counted":
/// φ·0.80·0.80·f'm·(An − As)·(70r/h)².
///
/// Regression (D21): the checker always added fy·As to Pn; for this wall
/// that is +14.3 % on φPn. The steel term now needs `laterally_tied`.
/// The checker's r = t/√12 = 2.2011 in against the printed 2.20 (0.1 %).
#[test]
fn masonry_mcginley_slender_wall_axial() {
    let m = masonry_member(2000.0, 60_000.0, 12.0, 7.625, 3.81, 0.2325, 252.0);
    published(252.0 / (7.625 / 12f64.sqrt()), 114.5, THREE_SF, "h/r");
    let r = masonry_run(m.clone(), 1.0, 0.0, 0.0);
    published(0.9 * r.pn, 39_265.0, THREE_SF, "φPn, Eq. 9-20, untied bars");
    let tied = masonry_run(MasonryMemberData { laterally_tied: Some(true), ..m }, 1.0, 0.0, 0.0);
    let r_gyr = 7.625 / 12f64.sqrt();
    let reduction = (70.0 * r_gyr / 252.0).powi(2);
    published(reduction, 0.373, THREE_SF, "R = (70r/h)²");
    published(tied.pn - r.pn, 0.8 * 60_000.0 * 0.2325 * reduction, 1e-9, "fy·As term when tied");
}

/// [P751] §10.1, Table 10.1-2 (p. 10-19): out-of-plane flexure of the 8 in
/// wall, #7 @ 24 in, per foot (kip, in, ksi): As = 0.30 in²/ft, d = 3.81 in,
/// b = 12 in, f'm = 2.0 ksi, fy = 60 ksi; T = As·fy = 18.0 klf.
/// 0.614D + E: Pu = 0.761 klf, C = 18.76, a = 0.978 in, Mn = 62.3 in-kip/ft;
/// 1.486D + E: Pu = 1.843 klf, C = 19.84, a = 1.03 in, Mn = 65.35 in-kip/ft.
///
/// The example adds Pu to the steel force (C = As·fy + Pu); the checker's
/// flexure is the Pu = 0 section with the axial load taken by its linear
/// interaction (conservative below the balance point). Passing the example's
/// C as an equivalent As = C/fy reproduces the clause: a = C/(0.80·f'm·b),
/// Mn = C·(d − a/2).
#[test]
fn masonry_p751_out_of_plane_flexure() {
    for (pu, mn) in [(0.761, 62.3), (1.843, 65.35)] {
        let m = masonry_member(2.0, 60.0, 12.0, 7.625, 3.81, 0.30 + pu / 60.0, 100.0);
        published(masonry_run(m, 0.0, 1.0, 0.0).mn, mn, THREE_SF, "Mn = C·(d − a/2)");
    }
}

/// [P751] Table 10.2-3 (p. 10-56, TMS 402-08) and [P1051] Table 13.2-3
/// (p. 13-60, TMS 402-13, γg = 0.75): in-plane shear of Birmingham 1 Wall D,
/// partially grouted, by story.
///
/// Printed: An = 1,185 in², f'm = 2,000 psi, fy = 60 ksi, Av/s = 0.07 in²/ft,
/// dv = 32.67 ft, Vns = 68.3 kips (the product is 68.6; the table carries 68);
/// cap Vn(max) = (6.67 − 2.67·M/(V·dv))·An·√f'm; per story
/// (M/(V·dv), Pu kips) → (Vnm, Vn, Vn(max)) kips, P-751:
/// 5 (0.266, 35.3) → 196, 264, 316;   4 (0.405, 76.5) → 193, 261, 296;
/// 3 (0.564, 118) → 189, 257, 274;    2 (0.746, 158) → 182, 250, 248;
/// 1 (0.960, 200) → 173, 241, 218 — the cap governs in stories 2 and 1.
/// P-1051, Vn = (Vnm + Vns)·γg and cap·γg: 198/237, 196/222, 193/206,
/// 188/186, 181/164.
///
/// The checker's SI cap coefficients 0.50 and 0.33 are 6 and 4 √psi rounded
/// (exactly 0.4982 and 0.3321): where the cap governs the checker is up to
/// 0.6 % lower, and those rows are compared at 1.2 %.
///
/// Regression (D22): there was no γg; P-1051's walls were credited 33 % more
/// shear. `gamma_g` now applies, and defaults to 0.70 when `an` < b·t.
#[test]
fn masonry_fema_wall_d_in_plane_shear() {
    let rows = [
        (0.266, 35.3, 264.0, 198.0, false),
        (0.405, 76.5, 261.0, 196.0, false),
        (0.564, 118.0, 257.0, 193.0, false),
        (0.746, 158.0, 248.0, 186.0, true),
        (0.960, 200.0, 218.0, 164.0, true),
    ];
    let dv = 32.67 * FT;
    let an = 1185.0 * IN * IN;
    let wall = |gamma_g| MasonryMemberData {
        an: Some(an),
        av: Some(0.07 * IN * IN),
        s_stirrup: Some(FT),
        gamma_g,
        // b·t = An: a solid section of the same net area
        ..masonry_member(2000.0 * PSI, 60_000.0 * PSI, dv, an / dv, dv, 0.0, 10.0 * FT)
    };
    let vu = 100.0 * KIP;
    for (mvd, pu, vn_08, vn_13, capped) in rows {
        // capped rows: the 0.6 % coefficient plus the tables' integer rounding
        // (P-1051's 164 is 0.75 × 218.x rounded up)
        let band = if capped { 0.012 } else { THREE_SF };
        let r08 = masonry_run(wall(Some(1.0)), pu * KIP, mvd * vu * dv, vu);
        published(r08.vn / KIP, vn_08, band, "Vn, TMS 402-08 (P-751)");
        let r13 = masonry_run(wall(Some(0.75)), pu * KIP, mvd * vu * dv, vu);
        published(r13.vn / KIP, vn_13, band, "Vn = (Vnm + Vns)·γg, TMS 402-13 (P-1051)");
    }
    // Default γg for a partially grouted section (An < b·t): 0.70, the least
    // of the editions — below both examples.
    let partial = MasonryMemberData { t: 2.0 * an / dv, gamma_g: None, ..wall(None) };
    let r = masonry_run(partial, 35.3 * KIP, 0.266 * vu * dv, vu);
    published(r.vn / KIP, 264.0 * 0.70, THREE_SF, "Vn with the default γg = 0.70");
}

// ════════════════════════════════════════════════════════════════════════
// Spread footings (foundation_check), ACI 318 — SI
//
// [SP-WIGHT] StructurePoint, "Reinforced Concrete Spread Footing (Isolated
//         Footing) Analysis and Design", ACI 318-14 (Sep. 2018), after Wight,
//         *Reinforced Concrete Mechanics and Design* 7th ed., Ex. 15-2.
// [ACI-F1] ACI, "Footings Example 1 — Design of a square spread footing of a
//         seven-story building" (ACI 318-14), concrete.org 318-example-1.
// [INTI-B] INTI-CIRSOC, *Ejemplos de Aplicación del Reglamento CIRSOC
//         201-2005*, "Bases de Hormigón Armado", Ejemplo 7.I (pp. 122–124).
//
// The examples are ACI 318-14 / CIRSOC 201-2005, before the size factor λs;
// ACI 318-19 §13.2.6.2 permits λs = 1 for isolated footings, which the
// tests ask for with `neglect_size_effect`. Two-way shear is then the same
// clause; the SI coefficient 0.33 is 4 √psi (0.3321) and CIRSOC's 1/3
// rounded down, so the checker is 0.6 % / 1.0 % below the US/CIRSOC
// printed capacity, and the comparison carries that factor explicitly.
// One-way shear changed in 318-19 (Table 22.5.5.1 (c) with ρw^(1/3) for a
// member without stirrups) and is not comparable; its demand Vu is.
// ════════════════════════════════════════════════════════════════════════

use dedaliano_engine::postprocess::foundation_check::*;

#[allow(clippy::too_many_arguments)]
fn footing(l: f64, b: f64, c1: f64, c2: f64, d: f64, fc: f64, rho_w: Option<f64>) -> SpreadFootingData {
    SpreadFootingData {
        footing_id: 1,
        length: l,
        width: b,
        thickness: d + 0.1,
        depth: 1.0,
        q_allowable: 1e9,
        gamma_soil: 18e3,
        fc,
        col_length: c1,
        col_width: c2,
        d: Some(d),
        mu_sliding: None,
        rho_w,
        neglect_size_effect: Some(true),
    }
}

fn footing_run(f: SpreadFootingData, p: f64) -> SpreadFootingResult {
    let forces = SpreadFootingForces { footing_id: 1, p, mx: None, my: None, h: None };
    check_spread_footings(&SpreadFootingInput { footings: vec![f], forces: vec![forces] }).remove(0)
}

/// φVc of ACI 318-19 Table 22.5.5.1 (c) with λs = 1, for reconstructing the
/// one-way demand from the checker's ratio. N, mm, MPa.
fn phi_vc_oneway_19(fc_mpa: f64, rho_w: f64, bw_mm: f64, d_mm: f64) -> f64 {
    0.75 * 0.66 * rho_w.cbrt() * fc_mpa.sqrt() * bw_mm * d_mm
}

/// 4 √psi in MPa units: the exact US coefficient the SI 0.33 rounds.
const FOUR_ROOT_PSI_SI: f64 = 4.0 / 12.043_6;

/// [SP-WIGHT] 18 in square column on an 11.17 ft square footing, f'c =
/// 3,000 psi, Pu = 912 kips (pp. 4–7).
///
/// Printed: qn,u = 912/11.17² = 7310 psf (net, factored); davg = 28 in;
/// two-way: critical square 46 in, Vu = 805 kips, vu = 156 psi, φvc = least
/// of 164 / 246 / 332 psi = 164 psi (β = 1, αs = 40); one-way: Vu =
/// 7310/1000·11.17·30/12 = 204 kips, φVc (318-14) = 308 kips;
/// As = 11 #8 = 8.69 in².
#[test]
fn footing_structurepoint_wight_15_2() {
    let (bl, c, d) = (11.17 * FT, 18.0 * IN, 28.0 * IN);
    let fc = 3000.0 * PSI / 1e6; // MPa
    let rho = 8.69 / (11.17 * 12.0 * 28.0);
    let r = footing_run(footing(bl, bl, c, c, d, fc * 1e6, Some(rho)), 912.0 * KIP);
    // two-way: Vu/φVc at the printed values, φVc scaled by 0.33/(4 √psi)
    let b0d = 4.0 * 46.0 * 28.0; // in²
    let printed = 805.0 / (164.0 * b0d / 1000.0);
    published(r.punching_shear_ratio, printed * FOUR_ROOT_PSI_SI / 0.33, THREE_SF, "Vu/φVc, two-way");
    // one-way: the demand
    let vu = r.oneway_shear_ratio * phi_vc_oneway_19(fc, rho, 11.17 * FT * 1e3, 28.0 * IN * 1e3);
    published(vu / KIP, 204.0, THREE_SF, "Vu, one-way at d from the face");
}

/// [ACI-F1] 24 in square column on a 12 × 12 ft footing, f'c = 4 ksi,
/// Pu = 960 kips (1.2D + 1.6L), pp. 3–6.
///
/// Printed: qu = 960/144 = 6.7 ksf (rounded, and carried rounded);
/// d = 25.5 in (upper layer); one-way Vu = 231 kips; two-way b0 = 4(24 +
/// 25.5) = 198 in, vc = min(253, 379.5, 452) = 253 psi, φVc = 958 kips,
/// Vu = qu·[12² − (49.5/12)²] = 851 kips.
///
/// The checker takes q = Pu/A = 6.667 ksf; the printed demands carry 6.7,
/// so they are 0.5 % above the checker's, and are compared at 1 %.
#[test]
fn footing_aci_example_1() {
    let (bl, c, d) = (12.0 * FT, 24.0 * IN, 25.5 * IN);
    let fc = 4000.0 * PSI / 1e6;
    let r = footing_run(footing(bl, bl, c, c, d, fc * 1e6, None), 960.0 * KIP);
    let printed = 851.0 / 958.0;
    published(r.punching_shear_ratio, printed * FOUR_ROOT_PSI_SI / 0.33, 0.01, "Vu/φVc, two-way");
    let vu = r.oneway_shear_ratio * phi_vc_oneway_19(fc, 0.0018, 12.0 * FT * 1e3, 25.5 * IN * 1e3);
    published(vu / KIP, 231.0, 0.01, "Vu, one-way");
}

/// [INTI-B] Ejemplo 7.I, centred footing, H-25, Pu = 1400 kN, column
/// 0,30 × 0,25 m, 2,25 × 2,25 m base (kN, m).
///
/// Printed: qu = 276,54 kN/m²; punching d = 0,52 m, b0 = 3,18 m,
/// A0 = 0,631 m², β = 1,20, F = min(4; 8,54) = 4; Vu = Pu − qu·A0 = 1225 kN;
/// φVc = 0,75·4·b0·d·√f'c/12 = 2067 kN. (One-way shear uses the tapered
/// footing's own bw and two depths, not this checker's geometry.)
#[test]
fn footing_inti_7i_punching() {
    let r = footing_run(footing(2.25, 2.25, 0.30, 0.25, 0.52, 25e6, None), 1400e3);
    published(r.punching_shear_ratio, 1225.0 / 2067.0 * (1.0 / 3.0) / 0.33, THREE_SF, "Vu/φVc, two-way");
}
