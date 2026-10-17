//! Design checks against PUBLISHED worked examples, clause by clause.
//!
//! The certified enclosures (`certify_design.rs`) prove the numerics of the
//! formulas as implemented. They say nothing about whether those formulas are
//! the code clauses. This file does: every test feeds a check the input data
//! of a worked example someone else published, and compares against the
//! numbers that example prints — intermediate values as well as the final
//! resistance, so a wrong clause cannot hide behind a right total.
//!
//! Coverage, discrepancies and their root causes are tabulated in
//! `docs/verification/DESIGN_EXAMPLES.md`.
//!
//! ── Sources ───────────────────────────────────────────────────────────────
//!
//! [AISC]  AISC, *Companion to the AISC Steel Construction Manual, Vol. 1:
//!         Design Examples*, v16.0, first-semester edition (2023), keyed to
//!         ANSI/AISC 360-22. Page numbers are the example's own (D-3, F-11 ...).
//! [INTI301] Troglia, Troglia & Angulo Bocco, *Ejemplos de Aplicación del
//!         Reglamento CIRSOC 301-2018*, INTI-CIRSOC (July 2018).
//! [INTI201] Hernández Balat, Bissio & Ortega, *Ejemplos de Aplicación del
//!         Reglamento CIRSOC 201-2005*, INTI-CIRSOC (August 2005).
//! [SBE]   SCI/CTICM, *Steel Buildings in Europe — Multi-Storey Steel
//!         Buildings, Part 4: Detailed Design* (2010), Appendix A.
//! [P364]  Brettle & Smith, *Steel Building Design: Worked Examples — Open
//!         Sections*, SCI P364 (2009), BS EN 1993-1-1 with UK NA.
//! [JRC-EC2] Biasioli, Mancini, Just, Curbach, Walraven et al., *Eurocode 2:
//!         Background & Applications — Design of Concrete Buildings, Worked
//!         examples*, JRC report EUR 26566 EN (2014), ch. 3 (Walraven &
//!         Gmainer).
//!
//! ── Tolerance ─────────────────────────────────────────────────────────────
//!
//! Published examples print three significant figures and round their
//! intermediate values before reusing them (an example's `Lr = 16.9 ft`
//! feeds the next line as 16.9, not 16.94). Unless a test says otherwise the
//! comparison is therefore relative, 0.5 % — half a unit in the third digit
//! for a leading 1, which also absorbs the cascade of rounded intermediates.
//! Where an example prints fewer figures (a χ of `0.65`) the test widens the
//! band to that printed resolution and says so.
//!
//! Inputs are the example's PRINTED inputs, in the example's units: every
//! check here is unit-agnostic except EC2/ACI/CIRSOC 201 concrete, whose shear
//! formulas are dimensional in MPa and mm and therefore run in SI. Where a
//! check wants a property the example does not print, it is derived from
//! printed ones and the derivation is shown, or the property does not enter
//! the quantity under test and is marked `unused`.

use dedaliano_engine::postprocess::cirsoc201_check::*;
use dedaliano_engine::postprocess::ec2_check::*;
use dedaliano_engine::postprocess::ec3_check::*;
use dedaliano_engine::postprocess::rc_check::*;
use dedaliano_engine::postprocess::steel_check::*;

/// Relative comparison at the published rounding (see module docs).
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
// AISC 360 (steel_check) — units: kip, in, ksi
// ════════════════════════════════════════════════════════════════════════

const E_KSI: f64 = 29_000.0;

/// A member with every property zero: each test sets the ones its clause
/// reads. A zero property makes the corresponding capacity zero, and a zero
/// demand on it is never evaluated, so nothing unused can leak into a result.
fn aisc_blank(fy: f64) -> SteelMemberData {
    SteelMemberData {
        element_id: 1,
        fy,
        fu: None,
        ag: 0.0,
        an: None,
        u_factor: None,
        aw: None,
        cv1: None,
        lby: 0.0,
        lbz: 0.0,
        ky: None,
        kz: None,
        iy: 0.0,
        iz: 0.0,
        ry: 0.0,
        rz: 0.0,
        zy: 0.0,
        zz: 0.0,
        sy: 0.0,
        sz: 0.0,
        j: 0.0,
        cw: None,
        lb: None,
        cb: None,
        e: E_KSI,
        g: None,
        depth: None,
        flange_slenderness: None,
    }
}

fn aisc_run(m: SteelMemberData, n: f64, my: f64, mz: f64, vy: f64) -> SteelCheckResult {
    check_steel_members(&SteelCheckInput {
        members: vec![m],
        forces: vec![ElementDesignForces { element_id: 1, n, my, mz: Some(mz), vy: Some(vy) }],
    })
    .remove(0)
}

/// [AISC] Example D.1, W8×21 tension member, pp. D-2 – D-4.
///
/// Printed: Fy = 50, Fu = 65 ksi; Ag = 6.16 in²; An = 4.76 in²; U = 0.908.
/// D2-1 yielding φtPn = 277 kips; D2-2 rupture Ae = 4.32 in², Pn = 281 kips,
/// φtPn = 211 kips (governs, "tensile rupture ... versus yielding").
#[test]
fn aisc_d1_w8x21_tension_yield_and_rupture() {
    let m = SteelMemberData {
        fu: Some(65.0),
        ag: 6.16,
        an: Some(4.76),
        u_factor: Some(0.908),
        ..aisc_blank(50.0)
    };
    let r = aisc_run(m.clone(), 180.0, 0.0, 0.0, 0.0);
    published(r.phi_pn_tension, 211.0, THREE_SF, "D2-2 φtPn (rupture governs)");
    published(r.phi_pn_tension / 0.75, 281.0, THREE_SF, "D2-2 Pn = Fu·Ae");
    published(r.tension_ratio, 180.0 / 211.0, THREE_SF, "Pu/φtPn");

    // Yielding alone (no Fu → no rupture check): D2-1.
    let r = aisc_run(SteelMemberData { fu: None, ..m }, 180.0, 0.0, 0.0, 0.0);
    published(r.phi_pn_tension, 277.0, THREE_SF, "D2-1 φtPn (yielding)");
}

/// [AISC] Example E.1C, W14×132 column, Lc = 30 ft both axes, pp. E-8 – E-9.
///
/// Printed: Ag = 38.8 in², rx = 6.28, ry = 3.76 in; Lc/ry = 95.7 (y governs);
/// φcFn = 23.0 ksi (Table 4-14); φcPn = 892 kips. Branch: E3-2 (inelastic).
#[test]
fn aisc_e1c_w14x132_inelastic_flexural_buckling() {
    let m = SteelMemberData {
        ag: 38.8,
        ry: 6.28, // stabileo's y is the MAJOR axis: AISC rx
        rz: 3.76, // AISC ry
        lby: 360.0,
        lbz: 360.0,
        ..aisc_blank(50.0)
    };
    let r = aisc_run(m, -840.0, 0.0, 0.0, 0.0);
    published(r.phi_pn_compression, 892.0, THREE_SF, "E3-1 φcPn");
    published(r.phi_pn_compression / 38.8, 23.0, THREE_SF, "φcFn");
}

/// [AISC] Example E.1D, W14×90, Lcx = 30 ft, Lcy = 15 ft, pp. E-10 – E-12.
///
/// Printed: Ag = 26.5 in², rx = 6.14, ry = 3.70 in; Lcx/rx = 58.6 governs;
/// Fe = 83.3 ksi (E3-4); Fn = 38.9 ksi (E3-2); Pn = 1,030 kips; φcPn = 927 kips.
#[test]
fn aisc_e1d_w14x90_major_axis_governs() {
    let m = SteelMemberData {
        ag: 26.5,
        ry: 6.14,
        rz: 3.70,
        lby: 360.0,
        lbz: 180.0,
        ..aisc_blank(50.0)
    };
    let r = aisc_run(m, -840.0, 0.0, 0.0, 0.0);
    published(r.phi_pn_compression, 927.0, THREE_SF, "φcPn");
    published(r.phi_pn_compression / 0.90, 1030.0, THREE_SF, "Pn = Fn·Ag");
    published(r.phi_pn_compression / 0.90 / 26.5, 38.9, THREE_SF, "Fn (E3-2)");
}

/// [INTI301] Ejemplo 10(a), IPE 300 column, Ej. 10-2: the ELASTIC branch.
///
/// None of the AISC first-semester examples reaches E3-3, so it is taken from
/// the CIRSOC 301-2018 example, whose equation (E.3-3a) is the same
/// `Fcr = 0.877·Fe` as AISC E3-3 (only φc differs: 0.85 there, 0.90 here, so
/// the comparison is on the nominal Pn). Units N, mm.
///
/// Printed: Fy = 235 MPa, E = 200 000 MPa; Ag = 53.8 cm², rmin = 3.35 cm,
/// kL = 650 cm; kL/r = 194; λc = 2.117 > 1.5; Fcr = 46.0 MPa;
/// Rd = 0.85·46.0·53.8·0.1 = 210.3 kN → Pn = 247.4 kN.
#[test]
fn aisc_e3_3_elastic_branch_via_inti301_ej10a_ipe300() {
    let m = SteelMemberData {
        ag: 5380.0,
        ry: 33.5 * 3.0, // major axis: not printed, and not governing — any r > rmin
        rz: 33.5,
        lby: 6500.0,
        lbz: 6500.0,
        e: 200_000.0,
        ..aisc_blank(235.0)
    };
    let r = aisc_run(m, -200e3, 0.0, 0.0, 0.0);
    let pn = r.phi_pn_compression / 0.90;
    published(pn / 5380.0, 46.0, THREE_SF, "Fcr = 0.877·Fe (E3-3)");
    published(pn / 1e3, 210.3 / 0.85, THREE_SF, "Pn");
}

/// [AISC] Example F.1-1B, W18×50 continuously braced, p. F-8.
///
/// Printed: Zx = 101 in³; Mp = Fy·Zx = 5,050 kip-in; φbMn = 379 kip-ft.
#[test]
fn aisc_f1_1b_w18x50_yielding() {
    let m = SteelMemberData { zy: 101.0, lb: Some(0.0), ..aisc_blank(50.0) };
    let r = aisc_run(m, 0.0, 266.0 * 12.0, 0.0, 0.0);
    published(r.phi_mn_y / 12.0, 379.0, THREE_SF, "φbMn = φbMp");
    published(r.phi_mn_y / 0.90, 5050.0, THREE_SF, "Mp (F2-1)");
}

/// W18×50 as printed by [AISC] Example F.1-2B (p. F-10): ry, Sx, J, rts, ho,
/// plus Zx from F.1-1B and Ix from F.1-1A.
///
/// stabileo takes Iy (its `iz`) and Cw rather than rts and ho. For a doubly
/// symmetric I-shape Cw = Iy·ho²/4 and rts² = √(Iy·Cw)/Sx (AISC F2-7 user
/// note), so  Iy = 2·Sx·rts²/ho  and  Cw = Iy·ho²/4  reproduce the PRINTED rts
/// and ho exactly (they give Iy = 40.06 in⁴, Cw = 3,032 in⁶; Manual Table 1-1
/// lists 40.1 and 3,040 — the printed rts and ho are the authority here).
fn w18x50(lb_in: f64, cb: f64) -> SteelMemberData {
    let (sx, rts, ho) = (88.9, 1.98, 17.4);
    let iy_weak = 2.0 * sx * rts * rts / ho;
    let cw = iy_weak * ho * ho / 4.0;
    SteelMemberData {
        iy: 800.0, // Ix, F.1-1A — only a guard here
        iz: iy_weak,
        rz: 1.65,
        zy: 101.0,
        sy: sx,
        j: 1.24,
        cw: Some(cw),
        lb: Some(lb_in),
        cb: Some(cb),
        ..aisc_blank(50.0)
    }
}

/// [AISC] Example F.1-2B, W18×50 braced at third points, pp. F-10 – F-11.
///
/// Printed: Cb = 1.01 (centre segment); Lp = 69.9 in (F2-5); Lr = 203 in
/// (F2-6, c = 1); Lb = 11.7 ft; Mn = 4,060 kip-in (F2-2, inelastic LTB);
/// φbMn = 304 kip-ft.
#[test]
fn aisc_f1_2b_w18x50_inelastic_ltb() {
    let r = aisc_run(w18x50(11.7 * 12.0, 1.01), 0.0, 266.0 * 12.0, 0.0, 0.0);
    published(r.phi_mn_y / 0.90, 4060.0, THREE_SF, "Mn (F2-2)");
    published(r.phi_mn_y / 12.0, 304.0, THREE_SF, "φbMn");

    // Lp and Lr bracket the inelastic range; F2-2 is linear in Lb between
    // (Lp, Cb·Mp) and (Lr, Cb·0.7FySx), so probing at the printed Lp and Lr
    // checks both limits without exposing them as outputs.
    let at = |lb: f64| aisc_run(w18x50(lb, 1.0), 0.0, 1.0, 0.0, 0.0).phi_mn_y / 0.90;
    published(at(69.9), 5050.0, 0.002, "Mn at the printed Lp = Mp");
    published(at(203.0), 0.7 * 50.0 * 88.9, 0.002, "Mn at the printed Lr = 0.7·Fy·Sx");
}

/// [AISC] Example F.1-3B, W18×50 braced at midspan, pp. F-14 – F-15.
///
/// Printed: Cb = 1.30; Lb = 17.5 ft > Lr; Fcr = 43.2 ksi (F2-4);
/// Mn = Fcr·Sx = 3,840 kip-in (F2-3); φbMn = 288 kip-ft.
#[test]
fn aisc_f1_3b_w18x50_elastic_ltb() {
    let r = aisc_run(w18x50(17.5 * 12.0, 1.30), 0.0, 266.0 * 12.0, 0.0, 0.0);
    let mn = r.phi_mn_y / 0.90;
    published(mn, 3840.0, THREE_SF, "Mn (F2-3)");
    published(mn / 88.9, 43.2, THREE_SF, "Fcr (F2-4)");
    published(r.phi_mn_y / 12.0, 288.0, THREE_SF, "φbMn");
}

/// [AISC] Example F.5, W12×58 bent about its minor axis, pp. F-28 – F-29.
///
/// Printed: Sy = 21.4 in³, Zy = 32.5 in³; Mn = min(FyZy, 1.6FySy) =
/// min(1,630; 1,710) = 1,630 kip-in (F6-1); φbMn = 122 kip-ft.
#[test]
fn aisc_f5_w12x58_minor_axis_yielding() {
    let m = SteelMemberData { zz: 32.5, sz: 21.4, ..aisc_blank(50.0) };
    let r = aisc_run(m, 0.0, 0.0, 113.0 * 12.0, 0.0);
    published(r.phi_mn_z / 0.90, 1630.0, THREE_SF, "Mn (F6-1)");
    published(r.phi_mn_z / 12.0, 122.0, THREE_SF, "φbMn");
}

/// [AISC] Example G.1B, W24×62 major-axis shear, p. G-4.
///
/// Printed: d = 23.7, tw = 0.430 in; Aw = 10.2 in²; Cv1 = 1.0;
/// Vn = 0.6·Fy·Aw·Cv1 = 306 kips (G2-1); φv = 1.00 (G2.1(a)); φvVn = 306 kips.
///
/// DISCREPANCY (documented, conservative): stabileo uses φv = 0.90 for every
/// section, because G2.1(a)'s φv = 1.00 needs h/tw ≤ 2.24√(E/Fy) for a ROLLED
/// I-shape and the input carries neither h/tw nor "rolled". So Vn matches the
/// example and φvVn is 0.90/1.00 of it.
#[test]
fn aisc_g1b_w24x62_shear() {
    let m = SteelMemberData { aw: Some(23.7 * 0.430), cv1: Some(1.0), ..aisc_blank(50.0) };
    let r = aisc_run(m, 0.0, 0.0, 0.0, 290.0);
    published(r.phi_vn / 0.90, 306.0, THREE_SF, "Vn (G2-1)");
    published(r.phi_vn, 0.90 * 306.0, THREE_SF, "φvVn with stabileo's φv = 0.90");
}

/// [AISC] Example H.3, W14×82 in axial tension and biaxial flexure, pp. H-8 – H-11.
///
/// Printed: Ag = 24.0 in², Sx = 123, Zx = 139, Sy = 29.3, Zy = 44.8 in³,
/// Iy = 148 in⁴, Lp = 8.76 ft, Lr = 33.2 ft; Lb = 30 ft; Cb = 1.41 (Table 3-1's
/// 1.14 times the H1.2 tension factor 1.24); Pu = 174 kips, Mux = 192,
/// Muy = 67.6 kip-ft.
/// Results: φtPn = 1,080 kips; Mnx = 6,560 kip-in (F2-2); φbMnx = 492 kip-ft;
/// Mny = 2,240 kip-in (F6-1); φbMny = 168 kip-ft; Pr/Pc = 0.161 < 0.2 →
/// H1-1b = 0.873.
///
/// The example prints Lp and Lr but not the ry, rts, ho, J they come from.
/// Those are taken from AISC Manual Table 1-1 (W14×82: ry = 2.48 in,
/// rts = 2.85 in, ho = 13.4 in, J = 5.07 in⁴) and are pinned to the example
/// by the first two assertions, which require them to reproduce the PRINTED
/// Lp and Lr. Cw follows from Iy·ho²/4 as for W18×50 above.
///
/// stabileo does not compute the H1.2 modification of Cb for axial tension;
/// the example's Cb = 1.41 is passed in.
#[test]
fn aisc_h3_w14x82_tension_and_biaxial_flexure() {
    let (sx, ho, iy_weak) = (123.0, 13.4, 148.0);
    let m = SteelMemberData {
        ag: 24.0,
        iy: 881.0, // Ix: a guard only
        iz: iy_weak,
        rz: 2.48,
        zy: 139.0,
        sy: sx,
        zz: 44.8,
        sz: 29.3,
        j: 5.07,
        cw: Some(iy_weak * ho * ho / 4.0),
        lb: Some(30.0 * 12.0),
        cb: Some(1.41),
        ..aisc_blank(50.0)
    };
    let at = |lb_ft: f64| {
        aisc_run(SteelMemberData { lb: Some(lb_ft * 12.0), cb: Some(1.0), ..m.clone() }, 0.0, 1.0, 0.0, 0.0)
            .phi_mn_y
            / 0.90
    };
    published(at(8.76), 50.0 * 139.0, 0.002, "Mn at the printed Lp = Mp");
    // stabileo derives rts and ho from (Iy, Cw), and the Manual's tabulated
    // rts, ho and Cw are not mutually exact (Iy·ho²/4 = 6,644 in⁶ against the
    // tabulated 6,710), which moves Lr by 0.4 %: hence the 1 % band here.
    published(at(33.2), 0.7 * 50.0 * sx, 0.01, "Mn at the printed Lr = 0.7·Fy·Sx");

    let r = aisc_run(m, 174.0, 192.0 * 12.0, 67.6 * 12.0, 0.0);
    published(r.phi_pn_tension, 1080.0, THREE_SF, "φtPn (D2-1)");
    published(r.phi_mn_y / 0.90, 6560.0, THREE_SF, "Mnx (F2-2)");
    published(r.phi_mn_y / 12.0, 492.0, THREE_SF, "φbMnx");
    published(r.phi_mn_z / 0.90, 2240.0, THREE_SF, "Mny (F6-1)");
    published(r.phi_mn_z / 12.0, 168.0, THREE_SF, "φbMny");
    published(r.tension_ratio, 0.161, THREE_SF, "Pr/Pc");
    published(r.interaction_ratio, 0.873, THREE_SF, "H1-1b");
}

/// [AISC] Example F.3B, W21×48 with NONCOMPACT flanges, continuously braced,
/// pp. F-24 – F-25.
///
/// Printed: Sx = 93.0, Zx = 107 in³, bf/2tf = 9.47; λpf = 9.15, λrf = 24.1;
/// Mp = 5,350 kip-in; Mn = 5,310 kip-in (F3-1, flange local buckling);
/// φbMn = 398 kip-ft.
///
/// Regression: stabileo had no flange-slenderness input and applied F2
/// (compact) to every section — φbMn = 0.9·Mp = 401 kip-ft, 0.8 % above the
/// example. Without `flange_slenderness` it still does (flanges taken as
/// compact); with it, F3.2 applies.
#[test]
fn aisc_f3b_w21x48_noncompact_flange() {
    let m = SteelMemberData {
        zy: 107.0,
        sy: 93.0,
        lb: Some(0.0),
        flange_slenderness: Some(9.47),
        ..aisc_blank(50.0)
    };
    let r = aisc_run(m.clone(), 0.0, 396.0 * 12.0, 0.0, 0.0);
    published(r.phi_mn_y / 0.90, 5310.0, THREE_SF, "Mn (F3-1)");
    published(r.phi_mn_y / 12.0, 398.0, THREE_SF, "φbMn");

    // A compact flange (bf/2tf below λpf = 9.15) leaves F2 untouched.
    let r = aisc_run(SteelMemberData { flange_slenderness: Some(9.0), ..m }, 0.0, 1.0, 0.0, 0.0);
    published(r.phi_mn_y / 0.90, 5350.0, 1e-12, "compact flange: Mn = Mp");
}

// ════════════════════════════════════════════════════════════════════════
// EN 1993-1-1 (ec3_check) — units: N, mm
// ════════════════════════════════════════════════════════════════════════

fn ec3_blank(fy: f64) -> Ec3MemberData {
    Ec3MemberData {
        element_id: 1,
        fy,
        e: Some(210_000.0),
        a: 0.0,
        a_eff: None,
        wpl_y: 0.0,
        wel_y: 0.0,
        weff_y: None,
        wpl_z: 0.0,
        wel_z: 0.0,
        weff_z: None,
        iy: 0.0,
        iz: 0.0,
        it: 0.0,
        iw: 0.0,
        lcr_y: 0.0,
        lcr_z: 0.0,
        lb: 0.0,
        section_class: SectionClass::Class1,
        buckling_curve_y: BucklingCurve::B,
        buckling_curve_z: BucklingCurve::B,
        buckling_curve_lt: BucklingCurve::B,
        gamma_m0: Some(1.0),
        gamma_m1: Some(1.0),
        c1: None,
        av: None,
        interaction: None,
    }
}

fn ec3_run(m: Ec3MemberData, n_ed: f64, my_ed: f64, v_ed: f64) -> Ec3CheckResult {
    check_ec3_members(&Ec3CheckInput {
        members: vec![m],
        forces: vec![Ec3DesignForces {
            element_id: 1,
            n_ed: Some(n_ed),
            my_ed: Some(my_ed),
            mz_ed: None,
            v_ed: Some(v_ed),
        }],
    })
    .remove(0)
}

/// [SBE] Worked Example A.1, IPE 330 S235, simply supported, pp. 4-57 – 4-62.
///
/// Printed: Wpl,y = 804.3 cm³, fy = 235 N/mm², γM0 = 1.0;
/// Mc,Rd = 189.01 kNm (6.2.5); MEd/Mc,Rd = 0.479.
/// Av = 3080 mm² (6.2.6(3)); Vpl,Rd = 417.9 kN (6.2.6(2)); VEd/Vpl,Rd = 0.152.
///
/// The LTB part of A.1 is NOT reproducible: it loads the top flange
/// (zg = +165 mm, C2 = 0.454) and uses the rolled-section curve of 6.3.2.3
/// with the f-modification. stabileo has neither load height (Mcr is the
/// zg = 0 expression) nor 6.3.2.3 — it implements the general case 6.3.2.2,
/// which is permitted and more conservative. Lb = 0 below isolates the
/// cross-section resistance (χLT = 1).
#[test]
fn ec3_sbe_a1_ipe330_bending_and_shear_resistance() {
    let m = Ec3MemberData { a: 6260.0, wpl_y: 804.3e3, av: Some(3080.0), ..ec3_blank(235.0) };
    let r = ec3_run(m, 0.0, 90.48e6, 63.50e3);
    published(r.mb_rd / 1e6, 189.01, THREE_SF, "Mc,Rd (6.2.5)");
    published(r.flexure_ratio_y, 0.479, THREE_SF, "MEd/Mc,Rd");
    published(63.50e3 / r.shear_ratio / 1e3, 417.9, THREE_SF, "Vpl,Rd (6.2.6)");
}

/// [SBE] Worked Example A.2, IPE 400 S235, pp. 4-64 – 4-69.
///
/// Printed: Wpl,y = 1307 cm³ → Mc,Rd = 307.15 kNm; MEd = 244.97 kNm, ratio 0.798.
/// Av = 4269 mm² → Vpl,Rd = 579.21 kN; VEd = 65.33 kN, ratio 0.113.
#[test]
fn ec3_sbe_a2_ipe400_bending_and_shear_resistance() {
    let m = Ec3MemberData { a: 8446.0, wpl_y: 1307e3, av: Some(4269.0), ..ec3_blank(235.0) };
    let r = ec3_run(m, 0.0, 244.97e6, 65.33e3);
    published(r.mb_rd / 1e6, 307.15, THREE_SF, "Mc,Rd");
    published(r.flexure_ratio_y, 0.798, THREE_SF, "MEd/Mc,Rd");
    published(65.33e3 / r.shear_ratio / 1e3, 579.21, THREE_SF, "Vpl,Rd");
}

/// [SBE] Worked Example A.5, HE 300 B S235 pinned column, pp. 4-94 – 4-97.
///
/// Printed: A = 149 cm², Iy = 25170 cm⁴, Iz = 8560 cm⁴; Lcr,y = 8.00 m,
/// Lcr,z = 5.60 m; Ncr,y = 8151.2 kN, Ncr,z = 5657.4 kN; λy = 0.655,
/// λz = 0.787; curve b (y), c (z); χy = 0.808, χz = 0.671;
/// Nb,Rd = 2349.5 kN (6.3.1.1); NEd/Nb,Rd = 0.85.
#[test]
fn ec3_sbe_a5_heb300_flexural_buckling() {
    let m = Ec3MemberData {
        a: 14_900.0,
        iy: 25_170e4,
        iz: 8_560e4,
        lcr_y: 8000.0,
        lcr_z: 5600.0,
        buckling_curve_y: BucklingCurve::B,
        buckling_curve_z: BucklingCurve::C,
        ..ec3_blank(235.0)
    };
    let r = ec3_run(m, -2000e3, 0.0, 0.0);
    published(r.chi_y, 0.808, THREE_SF, "χy");
    published(r.chi_z, 0.671, THREE_SF, "χz");
    published(r.nb_rd / 1e3, 2349.5, THREE_SF, "Nb,Rd");
    published(r.compression_ratio, 0.85, 0.01, "NEd/Nb,Rd (printed to 2 figures)");
}

/// [P364] Example 9, 356×368×129 UKC S355, Class 3, pinned, L = 6 m,
/// calculation sheets 1 – 6.
///
/// Printed: A = 164 cm², iy = 15.6 cm, iz = 9.43 cm; fy = 345 N/mm²
/// (16 < t ≤ 40); Class 3 → A used; Nc,Rd = 5658 kN (6.2.4);
/// λz = 0.82, curve c, χz = 0.65 (printed to 2 dp), Nb,z,Rd = 3678 kN;
/// Blue Book values: Nb,y,Rd = 5010 kN, Nb,z,Rd = 3670 kN.
///
/// Iy, Iz are derived from the printed radii: I = A·i². Curve b about y-y is
/// Table 6.2's for h/b ≤ 1.2, tf ≤ 100 mm, which the example cites for z-z.
/// Torsional buckling (Nb,T,Rd = 4017 kN, 6.3.1.4) is not implemented in
/// stabileo; it does not govern this example.
#[test]
fn ec3_p364_ex9_class3_ukc_column() {
    let a = 16_400.0;
    let m = Ec3MemberData {
        a,
        iy: a * 156.0 * 156.0,
        iz: a * 94.3 * 94.3,
        lcr_y: 6000.0,
        lcr_z: 6000.0,
        section_class: SectionClass::Class3,
        buckling_curve_y: BucklingCurve::B,
        buckling_curve_z: BucklingCurve::C,
        ..ec3_blank(345.0)
    };
    let r = ec3_run(m.clone(), -3500e3, 0.0, 0.0);
    // χ is printed to two decimals and Nb,z,Rd = 3678 kN was computed from
    // the rounded 0.65, so the band is that printed resolution (±0.005/0.65).
    published(r.chi_z, 0.65, 0.008, "χz");
    published(r.nb_rd / 1e3, 3678.0, 0.008, "Nb,z,Rd");
    published(r.chi_y * a * 345.0 / 1e3, 5010.0, THREE_SF, "Nb,y,Rd (Blue Book)");
    // Nc,Rd through the tension path: (6.6) Npl,Rd = A·fy/γM0 is the same
    // expression as (6.10) Nc,Rd for Class 1-3.
    let r = ec3_run(m, 3500e3, 0.0, 0.0);
    published(3500e3 / r.tension_ratio / 1e3, 5658.0, THREE_SF, "A·fy/γM0 (6.6 ≡ 6.10)");
}

/// Annex B factors from the inputs an example prints.
fn annex_b(plastic: bool, torsional: bool, ly: f64, lz: f64, ny: f64, nz: f64, cmy: f64, cmlt: f64) -> [f64; 4] {
    annex_b_factors(&AnnexBInput {
        plastic,
        torsional,
        hollow: false,
        lambda_y: ly,
        lambda_z: lz,
        n_y: ny,
        n_z: nz,
        cmy,
        cmz: 1.0,
        cm_lt: cmlt,
    })
}

/// [SBE-MS8] SCI/CTICM, *Steel Buildings in Europe — Multi-Storey Steel
/// Buildings, Part 8: Design software — Section Capacity* (2010), Appendix A,
/// Worked Example 2 "Combined axial force and bending moment (N-M
/// Interaction)", sheets 1–5, pp. 8-18 – 8-22. IPE 450 S355, Class 1,
/// Ly = Lz = LLT = 1.7 m, NEd = 127 kN, My,Ed = 356 kNm (uniform), Mz,Ed = 0.
///
/// Printed: λ̄y = 0.12, χy = 1.0, Nb,y,Rd = 3507 kN; λ̄z = 0.540, χz = 0.865,
/// Nb,z,Rd = 3034 kN; Mb,Rd = 581 kNm (χLT = 0.961 by 6.3.2.3); Cmy = CmLT
/// = 1.0; Annex B Table B.2: kyy = min(0.997; 1.029) = 0.997, eq. (6.61) =
/// 0.647; kzy = max(0.997; 0.994) = 0.997, eq. (6.62) = 0.653.
///
/// The factors and both equations are compared through `annex_b_factors`
/// fed the printed χ, λ̄ and Mb,Rd; the member check is then run on the
/// printed section, where everything up to the interaction factors matches.
/// Its (6.61)/(6.62) values do not: stabileo's LTB is the general case
/// 6.3.2.2 (χLT = 0.86 here), the example's the rolled-section case 6.3.2.3
/// (0.961) — the documented D10, on the conservative side.
#[test]
fn ec3_sbe_ms8_ex2_annex_b_interaction() {
    let (n, my) = (127.0, 356.0);
    let [kyy, _, kzy, _] = annex_b(true, true, 0.12, 0.540, n / 3507.0, n / 3034.0, 1.0, 1.0);
    published(kyy, 0.997, THREE_SF, "kyy (Table B.2)");
    published(kzy, 0.997, THREE_SF, "kzy (Table B.2, λ̄z ≥ 0.4)");
    published(n / 3507.0 + kyy * my / 581.0, 0.647, THREE_SF, "eq. (6.61)");
    published(n / 3034.0 + kzy * my / 581.0, 0.653, THREE_SF, "eq. (6.62)");

    // The member: A, Wpl,y, iy, Iz, It, Iw as printed (Iy = A·iy²).
    let a = 9880.0;
    let m = Ec3MemberData {
        a,
        wpl_y: 1702e3,
        iy: a * 185.0 * 185.0,
        iz: 1676e4,
        it: 66.9e4,
        iw: 791e9,
        lcr_y: 1700.0,
        lcr_z: 1700.0,
        lb: 1700.0,
        buckling_curve_y: BucklingCurve::A,
        buckling_curve_z: BucklingCurve::B,
        buckling_curve_lt: BucklingCurve::C,
        ..ec3_blank(355.0)
    };
    let r = ec3_run(m, -n * 1e3, my * 1e6, 0.0);
    published(r.chi_y, 1.0, THREE_SF, "χy");
    published(r.chi_z, 0.865, THREE_SF, "χz");
    published(r.chi_y * a * 355.0 / 1e3, 3507.0, THREE_SF, "Nb,y,Rd");
    published(r.nb_rd / 1e3, 3034.0, THREE_SF, "Nb,z,Rd");
    published(r.k_yy, 0.997, THREE_SF, "kyy from the member check");
    published(r.k_zy, 0.997, THREE_SF, "kzy from the member check");
    // (6.61)/(6.62) with stabileo's own (6.3.2.2) Mb,Rd.
    let mb = r.mb_rd / 1e6;
    published(r.interaction_ratio_y, n / 3507.0 + 0.997 * my / mb, THREE_SF, "(6.61) on 6.3.2.2's Mb,Rd");
    published(r.interaction_ratio_z, n / 3034.0 + 0.997 * my / mb, THREE_SF, "(6.62) on 6.3.2.2's Mb,Rd");
    assert!(mb < 581.0, "6.3.2.2 is the conservative side of 6.3.2.3");
}

/// [SBE-SS4] SCI/CTICM, *Steel Buildings in Europe — Single-Storey Steel
/// Buildings, Part 4: Detailed Design of Portal Frames* (2010), Appendix D
/// "Design of portal frame using elastic analysis", column IPE 500 S355,
/// sheets 17–23 of 44 (pp. 4-97 – 4-103). NEd = 168 kN, Class 1, Table B.2.
///
/// Printed, upper segment (1475 mm): λ̄z = 0.448, Nb,z,Rd = 3731 kN,
/// ψ = 0.721 → CmLT = 0.888, kzy = max(0.996; 0.993) = 0.996,
/// (6.62) = 168/3731 + 0.996·616/779 = 0.832.
/// Lower segment (3800 mm): λ̄z = 1.15, Nb,z,Rd = 2092 kN, CmLT = 0.6,
/// kzy = max(0.974; 0.977) = 0.977, (6.62) = 168/2092 + 0.977·444/640 = 0.758.
/// In plane: λ̄y = 0.385, Nb,y,Rd = 3937 kN, Cmy = 0.6,
/// kyy = min(0.605; 0.620) = 0.605, (6.61) = 168/3937 + 0.605·616/640 = 0.625.
///
/// The LTB resistances (6.3.2.3) are taken as printed; the test is on the
/// interaction factors with Cm < 1 and on both branches of Table B.2's kzy.
#[test]
fn ec3_sbe_ss4_portal_column_annex_b_factors() {
    let n = 168.0;
    let up = annex_b(true, true, 0.0, 0.448, 0.0, n / 3731.0, 1.0, 0.888);
    published(up[2], 0.996, THREE_SF, "kzy, upper segment");
    published(n / 3731.0 + up[2] * 616.0 / 779.0, 0.832, THREE_SF, "(6.62), upper segment");
    let low = annex_b(true, true, 0.0, 1.15, 0.0, n / 2092.0, 1.0, 0.6);
    published(low[2], 0.977, THREE_SF, "kzy, lower segment (second term governs)");
    published(n / 2092.0 + low[2] * 444.0 / 640.0, 0.758, THREE_SF, "(6.62), lower segment");
    let inplane = annex_b(true, true, 0.385, 1.15, n / 3937.0, n / 2092.0, 0.6, 0.6);
    published(inplane[0], 0.605, THREE_SF, "kyy with Cmy = 0.6");
    published(n / 3937.0 + inplane[0] * 616.0 / 640.0, 0.625, THREE_SF, "(6.61)");
}

/// Regression (D11): with the Table B.3 default Cm = 1 (no diagram given) a
/// slender column has kyy = Cmy·(1 + 0.8·ny) > 1, and the old linear sum
/// NEd/Nb,Rd + My/Mb,Rd + Mz/Mc,Rd (every k = 1) was below (6.61).
#[test]
fn ec3_interaction_k_above_one_is_applied() {
    let a = 9880.0;
    let m = Ec3MemberData {
        a,
        wpl_y: 1702e3,
        wpl_z: 276e3,
        iy: a * 185.0 * 185.0,
        iz: 1676e4,
        it: 66.9e4,
        iw: 791e9,
        lcr_y: 12_000.0,
        lcr_z: 1700.0,
        lb: 1700.0,
        buckling_curve_y: BucklingCurve::A,
        buckling_curve_z: BucklingCurve::B,
        buckling_curve_lt: BucklingCurve::C,
        ..ec3_blank(355.0)
    };
    let r = ec3_run(m.clone(), -1500e3, 150e6, 0.0);
    assert!(r.k_yy > 1.0, "kyy = {}", r.k_yy);
    let linear = r.compression_ratio + r.flexure_ratio_y;
    assert!(r.interaction_ratio > linear, "{} vs old {}", r.interaction_ratio, linear);
    // A Cm outside Table B.3's [0.4, 1] is refused, not evaluated.
    let bad = Ec3MemberData {
        interaction: Some(Ec3InteractionData { cmy: Some(0.2), ..Default::default() }),
        ..m
    };
    let r = ec3_run(bad, -1500e3, 150e6, 0.0);
    assert!(!r.pass);
    assert!(!r.unevaluated.is_empty());
}

// ════════════════════════════════════════════════════════════════════════
// EN 1992-1-1 (ec2_check) — SI units (Pa, m), as the check requires
// ════════════════════════════════════════════════════════════════════════

/// The [JRC-EC2] beam: C25/30, B500, γc = 1.5, γs = 1.15, αcc = 1.0
/// (fcd = 16.67 MPa, fyd = 435 MPa as printed), d = 372 mm.
fn jrc_beam(b: f64, d: f64, as_t: f64) -> Ec2MemberData {
    Ec2MemberData {
        element_id: 1,
        fck: 25e6,
        fyk: 500e6,
        b,
        h: d, // enters only σcp, which is zero (NEd = 0) in every test here
        d,
        as_tension: as_t,
        as_compression: None,
        d_prime: None,
        es: None,
        gamma_c: Some(1.5),
        gamma_s: Some(1.15),
        alpha_cc: Some(1.0),
        asw: None,
        s_stirrup: None,
        theta_shear: None,
        bw: None,
        z: None,
    }
}

fn ec2_run(m: Ec2MemberData, m_ed: f64, v_ed: f64) -> Ec2CheckResult {
    check_ec2_members(&Ec2CheckInput {
        members: vec![m],
        forces: vec![Ec2DesignForces { element_id: 1, m_ed: Some(m_ed), v_ed: Some(v_ed), n_ed: None }],
    })
    .remove(0)
}

/// [JRC-EC2] §3.2.1.3, T-beam bending reinforcement, pp. 57 – 58.
///
/// The example sizes steel for a moment; stabileo computes the resistance of
/// given steel. Both use the rectangular block of 3.1.7 (λ = 0.8, η = 1), so
/// the published (MEd, As) pair must satisfy MRd(As) = MEd:
///   mid-span: beff = 2611.2 mm, MEd = 89.3 kNm, z/d = 0.9925 → As = 556 mm²
///   support:  bw = 250 mm, MEd = 132.9 kNm, z/d = 0.867 → As = 947 mm²
#[test]
fn ec2_jrc_tbeam_flexure_rectangular_block() {
    let r = ec2_run(jrc_beam(2.6112, 0.372, 556e-6), 89.3e3, 0.0);
    published(r.m_rd / 1e3, 89.3, THREE_SF, "MRd(As = 556 mm²), mid-span");
    published(r.z / 0.372, 0.9925, 0.001, "z/d, mid-span");

    let r = ec2_run(jrc_beam(0.250, 0.372, 947e-6), 132.9e3, 0.0);
    published(r.m_rd / 1e3, 132.9, THREE_SF, "MRd(As = 947 mm²), support");
    published(r.z / 0.372, 0.867, THREE_SF, "z/d, support");
}

/// [JRC-EC2] §3.2.1.4, shear at support A, pp. 58 – 60.
///
/// Printed: bw = 250, d = 372 mm, Asl = 565 mm² → k = 1.73, ρl = 0.0061,
/// CRd,c = 0.12, VRd,c = 47.90 kN (6.2.2); ν = 0.54, z = 0.9d, cot θ = 2.5,
/// VRd,max = 259.8 kN (6.9); required asw = 317 mm²/m for VEd,red = 115.52 kN
/// (6.8 inverted).
#[test]
fn ec2_jrc_shear_vrdc_vrdmax_vrds() {
    let r = ec2_run(jrc_beam(0.250, 0.372, 565e-6), 0.0, 115.52e3);
    published(r.v_rdc / 1e3, 47.90, THREE_SF, "VRd,c (6.2a)");

    let m = Ec2MemberData { asw: Some(317e-6), s_stirrup: Some(1.0), ..jrc_beam(0.250, 0.372, 565e-6) };
    let r = ec2_run(m, 0.0, 115.52e3);
    published(r.v_rd_max / 1e3, 259.8, THREE_SF, "VRd,max (6.9), cot θ = 2.5");
    published(r.v_rds / 1e3, 115.52, THREE_SF, "VRd,s(asw = 317 mm²/m) = VEd,red (6.8)");
}

/// [JRC-EC2] §3.2.3.3, bearing beam in axis B, p. 90.
///
/// Printed: d = 360 mm, bw = 250 mm, Asl = 2010 mm² → k = 1.74,
/// ρl = 0.022 → capped at 0.02; VRd,c = 69 kN.
///
/// The printed expression reads `(100·0,02·16,7)^(1/3)` — fcd where 6.2.a
/// has fck. That is a typo in the example: with 16.7 the line evaluates to
/// 61 kN, with fck = 25 MPa to 69.4 kN, and 69 kN is what it prints.
#[test]
fn ec2_jrc_vrdc_reinforcement_ratio_cap() {
    let r = ec2_run(jrc_beam(0.250, 0.360, 2010e-6), 0.0, 240e3);
    published(r.v_rdc / 1e3, 69.0, 0.01, "VRd,c with ρl capped at 0.02 (printed to 2 figures)");
}

// ════════════════════════════════════════════════════════════════════════
// ACI 318-19 (rc_check) and CIRSOC 201 (cirsoc201_check) — SI units
// ════════════════════════════════════════════════════════════════════════
//
// [INTI201] is written for CIRSOC 201-2005, which is ACI 318-05 in SI. Its
// flexure (Whitney block, β1 = 0.85 at 25 MPa, φ = 0.90 for εt ≥ 0.005) is the
// same in ACI 318-19 for these sections, so the flexural examples apply to
// both checks. Its shear (Vc = √f'c·bw·d/6) does NOT carry to ACI 318-19, so
// the shear example is used for CIRSOC 201 only.

/// [INTI201] Ejemplo 2.I.6 / 2.I.7 section: H-25 (f'c = 25 MPa), ADN 420,
/// bw = 0.12 m, h = 0.40 m, d = 0.366 m, As = 2 db16 = 402 mm².
fn inti_rc(as_comp: Option<f64>) -> RCMemberData {
    RCMemberData {
        element_id: 1,
        fc: 25e6,
        fy: 420e6,
        es: None,
        b: 0.12,
        h: 0.40,
        d: 0.366,
        d_prime: as_comp.map(|_| 0.034),
        as_tension: 402e-6,
        as_compression: as_comp,
        section_type: RCSectionType::Rectangular,
        bf: None,
        hf: None,
        av: None,
        s_stirrup: None,
        lambda: None,
    }
}

fn inti_cirsoc(as_comp: Option<f64>) -> Cirsoc201MemberData {
    Cirsoc201MemberData {
        element_id: 1,
        fc: 25e6,
        fy: 420e6,
        es: None,
        b: 0.12,
        h: 0.40,
        d: 0.366,
        as_tension: 402e-6,
        as_compression: as_comp,
        d_prime: as_comp.map(|_| 0.034),
        av: None,
        s_stirrup: None,
        lambda: None,
    }
}

fn rc_run(m: RCMemberData, mu: f64) -> RCCheckResult {
    check_rc_members(&RCCheckInput {
        members: vec![m],
        forces: vec![RCDesignForces { element_id: 1, mu, vu: None, nu: None }],
    })
    .remove(0)
}

fn cirsoc_run(m: Cirsoc201MemberData, mu: f64, vu: f64) -> Cirsoc201CheckResult {
    check_cirsoc201_members(&Cirsoc201CheckInput {
        members: vec![m],
        forces: vec![Cirsoc201DesignForces { element_id: 1, mu: Some(mu), vu: Some(vu) }],
    })
    .remove(0)
}

/// [INTI201] Ejemplo 2.I.6, singly reinforced, p. 25 of the examples.
///
/// Printed: a = 0.06621 m; ka = 0.18091; kc = 0.213 < 0.375 → εs > 0.005,
/// φ = 0.90; Mn = 56.20 kNm (analytic).
#[test]
fn aci318_and_cirsoc201_inti_2i6_singly_reinforced() {
    let r = rc_run(inti_rc(None), 50e3);
    published(r.a, 0.06621, THREE_SF, "ACI: a = As·fy/(0.85·f'c·b)");
    published(r.c / 0.366, 0.213, THREE_SF, "ACI: kc = c/d");
    assert_eq!(r.phi_flexure, 0.90, "ACI: tension-controlled φ");
    published(r.phi_mn / 0.90 / 1e3, 56.20, THREE_SF, "ACI: Mn");

    let r = cirsoc_run(inti_cirsoc(None), 50e3, 0.0);
    published(r.a, 0.06621, THREE_SF, "CIRSOC: a");
    assert_eq!(r.phi, 0.90, "CIRSOC: φ");
    published(r.phi_mn / 0.90 / 1e3, 56.20, THREE_SF, "CIRSOC: Mn");
}

/// [INTI201] Ejemplo 2.I.7, As = A's = 2 db16, d' = 0.034 m, p. 27.
///
/// Printed: A's cannot yield, so the neutral axis is found by successive
/// approximation (c = 0.100 … 0.048 m, ε's = 0.00088 at the last trial);
/// Mn = C·(d − a/2) + C's·(d − d') = 57.40 kNm; Mu = φMn = 51.66 kNm.
/// (The example takes C = 0.85·f'c·a·bw and C's = f's·A's — no deduction of
/// the concrete the bars displace.)
///
/// Regression: both checks took the neutral axis from the "A's yields" trial
/// and never iterated; with As = A's that trial is c = 0, so they reported
/// the singly reinforced 56.2 kNm (−2.1 %).
#[test]
fn aci318_and_cirsoc201_inti_2i7_doubly_reinforced() {
    let r = rc_run(inti_rc(Some(402e-6)), 50e3);
    published(r.phi_mn / 0.90 / 1e3, 57.40, THREE_SF, "ACI: Mn");
    let r = cirsoc_run(inti_cirsoc(Some(402e-6)), 50e3, 0.0);
    published(r.phi_mn / 0.90 / 1e3, 57.40, THREE_SF, "CIRSOC: Mn");
}

/// [INTI201] Ejemplo 3.I, case a), uniform stirrups, pp. 52 – 53.
///
/// Printed: H-20, ADN 420, bw = 0.20 m, h = 0.60 m, d = 0.575 m;
/// √f'c·bw·d = 514.3 kN; Vc = (1/6)·514.3 = 85.8 kN (CIRSOC 201-2005
/// §11.3.1.1); Vu = 174.6 kN, φ = 0.75 → Vn = 232.8 kN; Vs = 147 kN;
/// Av/s = 609 mm²/m; limit (2/3)·514.3 = 342.9 kN (§11.5.7.9).
///
/// Regression: the check used ACI 318M's 0.17 for 1/6 (Vc 87.4 kN, +1.9 %).
#[test]
fn cirsoc201_inti_3i_shear() {
    let m = Cirsoc201MemberData {
        fc: 20e6,
        b: 0.20,
        h: 0.60,
        d: 0.575,
        as_tension: 0.0, // unused by the shear check
        av: Some(609e-6),
        s_stirrup: Some(1.0),
        ..inti_cirsoc(None)
    };
    let r = cirsoc_run(m, 0.0, 174.6e3);
    published(r.vc / 1e3, 85.8, THREE_SF, "Vc = √f'c·bw·d/6");
    published(r.vs / 1e3, 147.0, THREE_SF, "Vs(Av/s = 609 mm²/m)");
    published(r.phi_vn / 1e3, 174.6, THREE_SF, "φVn = Vu");

    // §11.5.7.9 cap, (2/3)·√f'c·bw·d = 342.9 kN, binds on a heavy cage.
    let m = Cirsoc201MemberData {
        fc: 20e6,
        b: 0.20,
        h: 0.60,
        d: 0.575,
        as_tension: 0.0,
        av: Some(5000e-6),
        s_stirrup: Some(1.0),
        ..inti_cirsoc(None)
    };
    let r = cirsoc_run(m, 0.0, 174.6e3);
    published(r.vs / 1e3, 342.9, THREE_SF, "Vs capped at (2/3)·√f'c·bw·d");
}

// ════════════════════════════════════════════════════════════════════════
// Weld groups, elastic method (connection_check)
// ════════════════════════════════════════════════════════════════════════

use dedaliano_engine::postprocess::connection_check::*;

fn weld_run(segments: Vec<WeldSegment>, fexx: f64, phi: f64, vx: f64, vy: f64, m: f64) -> WeldGroupResult {
    check_weld_groups(&WeldGroupInput {
        groups: vec![WeldGroupData { connection_id: 1, segments, fexx, phi: Some(phi) }],
        forces: vec![WeldGroupForces { connection_id: 1, vx, vy, m: Some(m) }],
    })
    .remove(0)
}

/// [INTI301] Ejemplo 3, bracket welded on three sides, shear + in-plane
/// moment, elastic analysis (§J.1.1), Ej. 3-1 – 3-2. Units kN, cm.
///
/// Printed: horizontal runs 25 cm at y = ±10.5 (from x = 1 to 26 cm),
/// vertical run 20 cm at x = 0.5 cm, unit leg dw = 1 cm; Aw = 70 cm²;
/// xg = 9.78 cm; Ip = Ix + Iy = 6179 + 5018 = 11197 cm⁴; Mug = 7309 kN·cm,
/// Vug = 130 kN; at A (x = 16.22, y = 11): fxM = 71.8, fyM = 105.88,
/// fyV = 18.57, f = 143.68 MPa per unit leg; φ = 0.60, Fnw = 288 MPa,
/// Rd = 12.22 kN/cm for dw = 1 cm; required dw = 143.68/122.2 = 1.18 cm.
///
/// stabileo works on the throat (0.707·leg) and evaluates the weld LINE,
/// y = 10.5 cm at A, where the example takes the outer edge of its 1 cm
/// strip, y = 11 cm. With the example's own Ip, Mug and Vug the stress at
/// the line is √((105.88 + 18.57)² + (7309·10.5/11197·10)²) = 142.08 MPa,
/// and that is compared at 3 s.f.; the printed 143.68 is 1.1 % higher only
/// because of the 0.5 cm lever arm.
#[test]
fn weld_group_inti301_ej3_bracket_elastic_method() {
    let seg = |x1, y1, x2, y2| WeldSegment { x1, y1, x2, y2, size: 1.0, end_loaded: None };
    let segments = vec![seg(1.0, 10.5, 26.0, 10.5), seg(0.5, -10.0, 0.5, 10.0), seg(1.0, -10.5, 26.0, -10.5)];
    let r = weld_run(segments, 48.0, 0.60, 0.0, 130.0, 7309.0);
    published(r.total_length, 70.0, 1e-12, "weld length");
    published(r.phi_fnw * 10.0, 0.60 * 288.0, 1e-12, "φ·Fnw (MPa)");
    // stress per unit LEG (the example's convention) = stress on the throat × 0.707
    let per_leg_mpa = r.max_weld_stress * 0.707 * 10.0;
    let at_line = ((105.88f64 + 18.57).powi(2) + (7309.0f64 * 10.5 / 11197.0 * 10.0).powi(2)).sqrt();
    published(per_leg_mpa, at_line, THREE_SF, "stress at A on the weld line");
    published(per_leg_mpa, 143.68, 0.012, "printed stress at the strip edge (y = 11 cm)");
    // Unity at dw = 1 cm is the required leg in cm: the example's f/Rd with
    // the line stress, and the printed 1.18 (= 143.68/122.2 = 1.176, rounded up).
    published(r.unity_ratio, at_line / 122.2, THREE_SF, "required dw at the weld line");
    published(r.unity_ratio, 1.18, 0.02, "printed required dw");
}

/// [AISC] Example J.1, fillet weld in longitudinal shear, pp. J-2 – J-4.
///
/// Printed: two 27 in. runs of a 3/16 in. E70 fillet, end-loaded;
/// Rn = 0.60·70·(0.707·3/16)·kds = 5.57 kip/in (kds = 1.0); l/w = 144 > 100 →
/// β = 1.2 − 0.002·144 = 0.912 (J2-1); Rn = 0.912·5.57·2·27 = 274 kips;
/// φRn = 206 kips against Pu = 200 kips.
///
/// Regression (D5): the weld-group check had no end-loaded length reduction
/// (J2.2b(d), β) and gave φRn = 225 kips, 9.5 % above the example. A segment
/// is now treated as end-loaded unless the caller says otherwise.
#[test]
fn weld_group_aisc_j1_end_loaded() {
    let size = 3.0 / 16.0;
    let run = |end_loaded| {
        let segments = vec![
            WeldSegment { x1: 0.0, y1: -4.5, x2: 27.0, y2: -4.5, size, end_loaded },
            WeldSegment { x1: 0.0, y1: 4.5, x2: 27.0, y2: 4.5, size, end_loaded },
        ];
        weld_run(segments, 70.0, 0.75, 200.0, 0.0, 0.0)
    };
    for r in [run(None), run(Some(true))] {
        published(r.phi_fnw * 0.707 * size, 0.75 * 5.57, THREE_SF, "φ·Rn per inch, kds = 1");
        published(r.min_beta, 0.912, 1e-12, "β = 1.2 − 0.002·144 (J2-1)");
        published(200.0 / r.unity_ratio, 206.0, THREE_SF, "φRn with β = 0.912");
    }
    // Declared not end-loaded: β does not apply and the full length counts.
    let r = run(Some(false));
    assert_eq!(r.min_beta, 1.0);
    published(200.0 / r.unity_ratio, 0.75 * 5.57 * 54.0, THREE_SF, "φRn without β");
}

/// J2.2b(d) branches with no example of their own: l ≤ 100 w keeps β = 1,
/// and l > 300 w caps the effective length at 180 w.
#[test]
fn weld_end_loaded_beta_branches() {
    assert_eq!(end_loaded_beta(100.0, 1.0, true), 1.0);
    published(end_loaded_beta(200.0, 1.0, true), 0.8, 1e-12, "β at l/w = 200");
    published(end_loaded_beta(300.0, 1.0, true), 0.6, 1e-12, "β at l/w = 300");
    published(end_loaded_beta(400.0, 1.0, true) * 400.0, 180.0, 1e-12, "Le = 180 w beyond 300 w");
    assert_eq!(end_loaded_beta(400.0, 1.0, false), 1.0);
}
