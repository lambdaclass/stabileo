/// Validation: Soil Liquefaction Assessment
///
/// References:
///   - Seed & Idriss (1971): "Simplified procedure for evaluating soil liquefaction potential"
///   - Youd et al. (2001): "Liquefaction Resistance of Soils" (NCEER/NSF Workshop)
///   - Boulanger & Idriss (2014): "CPT and SPT based liquefaction triggering procedures"
///   - EN 1998-5 (EC8): Geotechnical aspects of seismic design
///   - ASCE 7-22: Chapter 20 & 21 (site classification)
///   - Ishihara (1993): "Liquefaction and flow failure during earthquakes"
///
/// Tests verify CSR/CRR computation, SPT/CPT correlations,
/// settlement estimation, and lateral spreading.

// ================================================================
// 1. Cyclic Stress Ratio (CSR) -- Seed & Idriss
// ================================================================
//
// CSR = 0.65 × (amax/g) × (σv/σ'v) × rd
// rd = depth reduction factor
// amax = peak ground acceleration
// σv, σ'v = total and effective vertical stress

#[test]
fn liquefaction_csr() {
    let amax: f64 = 0.25;       // g, PGA
    let depth: f64 = 8.0;       // m
    let gamma: f64 = 19.0;      // kN/m³, total unit weight
    let gwt: f64 = 2.0;         // m, groundwater table depth
    let gamma_w: f64 = 9.81;

    // Total and effective vertical stress
    let sigma_v: f64 = gamma * depth;
    // = 152 kPa
    let u: f64 = gamma_w * (depth - gwt);
    // = 9.81 * 6 = 58.9 kPa
    let sigma_v_eff: f64 = sigma_v - u;
    // = 93.1 kPa

    // Stress reduction factor (Idriss, 1999)
    let rd: f64 = if depth <= 9.15 {
        1.0 - 0.00765 * depth
    } else {
        1.174 - 0.0267 * depth
    };

    assert!(
        rd > 0.8 && rd < 1.0,
        "rd at {:.0}m: {:.3}", depth, rd
    );

    // CSR
    let csr: f64 = 0.65 * amax * (sigma_v / sigma_v_eff) * rd;

    assert!(
        csr > 0.10 && csr < 0.50,
        "CSR = {:.3}", csr
    );

    // Magnitude scaling factor (M = 7.5 reference)
    let mw: f64 = 6.5;          // design earthquake magnitude
    let msf: f64 = 10.0_f64.powf(2.24) / mw.powf(2.56);

    // Adjusted CSR
    let csr_adj: f64 = csr / msf;

    assert!(
        csr_adj < csr,
        "Adjusted CSR {:.3} < CSR {:.3} (M < 7.5)", csr_adj, csr
    );
}

// ================================================================
// 2. CRR from SPT -- Seed Curve
// ================================================================
//
// CRR7.5 = f((N1)60cs) from the Seed et al. clean-sand curve.
// (N1)60 = Nm × CN × CE × CB × CR × CS
// CN = overburden correction = (Pa/σ'v)^0.5

#[test]
fn liquefaction_crr_spt() {
    let n_measured: f64 = 15.0;  // blows/300mm, raw SPT N-value
    let sigma_v_eff: f64 = 80.0; // kPa, effective overburden
    let pa: f64 = 100.0;         // kPa, atmospheric pressure

    // Overburden correction
    let cn: f64 = (pa / sigma_v_eff).sqrt().min(1.7);
    // = (100/80)^0.5 = 1.118

    // Equipment corrections (typical)
    let ce: f64 = 1.0;   // energy ratio (60% standard)
    let cb: f64 = 1.0;   // borehole diameter
    let cr: f64 = 0.95;  // rod length (for ~8m depth)
    let cs: f64 = 1.0;   // sampler type

    let n1_60: f64 = n_measured * cn * ce * cb * cr * cs;

    assert!(
        n1_60 > 10.0 && n1_60 < 30.0,
        "(N1)60 = {:.1}", n1_60
    );

    // Fines content correction (Youd et al. 2001)
    let fc: f64 = 10.0;  // %, fines content
    let delta_n: f64 = (1.0 + 0.004 * fc).exp() - 1.0; // approximate
    let n1_60_cs: f64 = n1_60 + delta_n;

    // CRR from deterministic curve (simplified polynomial fit)
    // For (N1)60cs < 30:
    let a: f64 = n1_60_cs;
    let crr: f64 = 1.0 / (34.0 - a) + a / 135.0 + 50.0 / (10.0 * a + 45.0).powi(2) - 1.0 / 200.0;

    assert!(
        crr > 0.05 && crr < 0.50,
        "CRR7.5 = {:.3}", crr
    );

    // Factor of safety
    let csr: f64 = 0.20; // from previous calculation
    let fs_liq: f64 = crr / csr;

    // FS > 1.0 means no liquefaction
    assert!(
        fs_liq > 0.0,
        "FS_liq = {:.2}", fs_liq
    );
}

// ================================================================
// 3. CRR from CPT -- Robertson & Wride
// ================================================================
//
// qc1N = (qc/Pa) × (Pa/σ'v)^n (normalized cone resistance)
// CRR = f(qc1Ncs) from Robertson & Wride curves.

#[test]
fn liquefaction_crr_cpt() {
    let qc: f64 = 8.0;          // MPa, cone tip resistance
    let sigma_v_eff: f64 = 75.0; // kPa
    let pa: f64 = 100.0;         // kPa (= 0.1 MPa)

    // Normalize: qc1N = (qc/Pa) × CN
    let cn: f64 = (pa / sigma_v_eff).powf(0.5).min(1.7);
    let qc1n: f64 = (qc * 1000.0 / pa) * cn; // dimensionless

    assert!(
        qc1n > 50.0 && qc1n < 200.0,
        "qc1N = {:.1}", qc1n
    );

    // Clean sand equivalent (Ic < 2.6 for liquefiable soils)
    let ic: f64 = 1.8;          // soil behavior type index
    assert!(
        ic < 2.6,
        "Ic = {:.1} < 2.6 -- potentially liquefiable", ic
    );

    // CRR from Robertson (2009) simplified
    // CRR = 93 * (qc1Ncs / 1000)^3 + 0.08 (for qc1Ncs < 160)
    let qc1ncs: f64 = qc1n * 1.05; // small fines correction
    let crr: f64 = 93.0 * (qc1ncs / 1000.0).powi(3) + 0.08;

    assert!(
        crr > 0.05 && crr < 1.0,
        "CRR from CPT: {:.3}", crr
    );
}

// ================================================================
// 4. Post-Liquefaction Settlement -- Tokimatsu & Seed
// ================================================================
//
// Volumetric strain after liquefaction depends on FS_liq and relative density.
// εv = f(FS_liq, (N1)60) from Tokimatsu & Seed (1987) charts.
// Total settlement: S = Σ(εv_i × Δz_i) over liquefiable layers.

#[test]
fn liquefaction_settlement() {
    // Soil profile: 3 liquefiable layers
    let layers: [(f64, f64, f64); 3] = [
        // (thickness_m, N1_60, FS_liq)
        (2.0, 12.0, 0.85),
        (3.0, 18.0, 1.05),
        (2.5, 10.0, 0.70),
    ];

    let mut total_settlement: f64 = 0.0;

    for (dz, n1_60, fs) in &layers {
        // Volumetric strain estimate (simplified from charts)
        let eps_v: f64 = if *fs < 1.0 {
            // Liquefied: εv depends on N1_60
            (3.5 - n1_60 / 10.0).max(0.5) / 100.0
        } else {
            // Not liquefied but close: small settlement
            (1.0 - fs).max(0.0) * 2.0 / 100.0
        };

        total_settlement += eps_v * dz * 1000.0; // mm
    }

    assert!(
        total_settlement > 10.0 && total_settlement < 200.0,
        "Total settlement: {:.0} mm", total_settlement
    );

    // Differential settlement: typically 50-75% of total
    let diff_ratio: f64 = 0.67;
    let diff_settlement: f64 = total_settlement * diff_ratio;

    assert!(
        diff_settlement > 0.0,
        "Differential settlement: {:.0} mm", diff_settlement
    );
}

// ================================================================
// 5. Lateral Spreading -- Youd et al. (2002)
// ================================================================
//
// Empirical: log(DH) = b0 + b1*M + b2*log(R) + b3*R + b4*log(W)
//            + b5*log(T15) + b6*log(100-F15) + b7*log(D50_15+0.1)
// DH = horizontal displacement (m)
// Simplified for gently sloping ground or free-face conditions.

#[test]
fn liquefaction_lateral_spreading() {
    let mw: f64 = 7.0;          // moment magnitude
    let r: f64 = 20.0;          // km, distance to source
    let slope: f64 = 2.0;       // %, ground slope
    let t15: f64 = 5.0;         // m, thickness with (N1)60 < 15
    let f15: f64 = 15.0;        // %, average fines in T15 layer
    let d50: f64 = 0.3;         // mm, D50 in T15 layer

    // Youd et al. (2002) coefficients (ground slope case)
    let b0: f64 = -16.213;
    let b1: f64 = 1.532;
    let b2: f64 = -1.406;
    let b3: f64 = -0.012;
    let b4: f64 = 0.338;
    let b5: f64 = 0.540;
    let b6: f64 = 3.413;
    let b7: f64 = -0.795;

    let r_star: f64 = r + 10.0_f64.powf(0.89 * mw - 5.64);

    let log_dh: f64 = b0 + b1 * mw + b2 * r_star.log10() + b3 * r
                     + b4 * slope.log10() + b5 * t15.log10()
                     + b6 * (100.0 - f15).log10() + b7 * (d50 + 0.1).log10();

    let dh: f64 = 10.0_f64.powf(log_dh);

    assert!(
        dh > 0.01 && dh < 10.0,
        "Lateral spreading: {:.2} m", dh
    );

    // Closer source = more displacement
    let r_close: f64 = 10.0;
    let r_star_close: f64 = r_close + 10.0_f64.powf(0.89 * mw - 5.64);
    let log_dh_close: f64 = b0 + b1 * mw + b2 * r_star_close.log10() + b3 * r_close
                           + b4 * slope.log10() + b5 * t15.log10()
                           + b6 * (100.0 - f15).log10() + b7 * (d50 + 0.1).log10();
    let dh_close: f64 = 10.0_f64.powf(log_dh_close);

    assert!(
        dh_close > dh,
        "Closer source: {:.2}m > {:.2}m displacement", dh_close, dh
    );
}

// ================================================================
// 6. Liquefaction Potential Index (LPI) -- Iwasaki
// ================================================================
//
// LPI = ∫₀²⁰ F(z) × w(z) dz
// F(z) = 1 - FS_liq for FS < 1.0, else 0
// w(z) = 10 - 0.5z (depth weighting)
// LPI > 15: high liquefaction risk

#[test]
fn liquefaction_potential_index() {
    // Discretized soil profile (1m layers to 20m)
    let fs_profile: [f64; 20] = [
        1.5, 1.2, 0.9, 0.7, 0.6, 0.65, 0.8, 0.95, 1.1, 1.3,
        1.5, 1.8, 2.0, 2.5, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0,
    ];

    let dz: f64 = 1.0;          // m
    let mut lpi: f64 = 0.0;

    for (i, &fs) in fs_profile.iter().enumerate() {
        let z: f64 = (i as f64 + 0.5) * dz; // mid-depth of layer
        let f: f64 = if fs < 1.0 { 1.0 - fs } else { 0.0 };
        let w: f64 = 10.0 - 0.5 * z;
        if w > 0.0 {
            lpi += f * w * dz;
        }
    }

    assert!(
        lpi > 0.0,
        "LPI = {:.1}", lpi
    );

    // Severity classification (Iwasaki et al., 1982)
    let severity = if lpi == 0.0 {
        "none"
    } else if lpi <= 5.0 {
        "low"
    } else if lpi <= 15.0 {
        "high"
    } else {
        "very high"
    };

    assert!(
        !severity.is_empty(),
        "Liquefaction severity: {} (LPI = {:.1})", severity, lpi
    );
}

// ================================================================
// 7. EC8 Simplified Check -- Depth-Weighted Severity
// ================================================================
//
// EN 1998-5 §4.1.4: Liquefaction assessment required when:
// - Ground acceleration ag*S ≥ 0.15g
// - Saturated sand with normalized blow count (N1)60 < 30
// Simplified approach based on CSR/CRR comparison at each depth.

#[test]
fn liquefaction_ec8_check() {
    let ag: f64 = 0.25;         // g, design ground acceleration
    let s: f64 = 1.15;          // soil amplification factor (ground type C)

    // Effective surface acceleration
    let ag_s: f64 = ag * s;

    // EC8 threshold
    let threshold: f64 = 0.15;
    let assessment_required: bool = ag_s > threshold;

    assert!(
        assessment_required,
        "ag*S = {:.2}g > {:.2}g -- assessment required", ag_s, threshold
    );

    // Simplified CSR (EC8 approach similar to Seed & Idriss)
    let depth: f64 = 6.0;
    let sigma_v: f64 = 18.0 * depth;     // kPa
    let gwt: f64 = 1.5;
    let u: f64 = 9.81 * (depth - gwt);
    let sigma_v_eff: f64 = sigma_v - u;

    let rd: f64 = 1.0 - 0.015 * depth; // simplified
    let csr: f64 = 0.65 * ag_s * (sigma_v / sigma_v_eff) * rd;

    assert!(
        csr > 0.10,
        "CSR at {}m: {:.3}", depth, csr
    );

    // EC8: if CSR > CRR → ground improvement needed
    let n1_60: f64 = 12.0;      // relatively loose
    let crr: f64 = n1_60 / 150.0 + 0.05; // very simplified

    let fs: f64 = crr / csr;
    assert!(
        fs > 0.0,
        "FS_liq = {:.2} -- {} needed",
        fs,
        if fs < 1.0 { "improvement" } else { "adequate" }
    );
}

// ================================================================
// 8. Ground Improvement -- Stone Column Design
// ================================================================
//
// Stone columns increase CRR by densification and drainage.
// Area replacement ratio: ar = Ac / A (column area / total area)
// Improved CRR: CRR_improved = CRR_native / (1 - ar) + Δ(drainage)

#[test]
fn liquefaction_ground_improvement() {
    let d_col: f64 = 0.8;       // m, stone column diameter
    let spacing: f64 = 2.0;     // m, triangular grid spacing

    // Area replacement ratio (triangular grid)
    let a_col: f64 = std::f64::consts::PI * d_col * d_col / 4.0;
    let a_trib: f64 = spacing * spacing * 3.0_f64.sqrt() / 2.0; // triangular
    let ar: f64 = a_col / a_trib;

    assert!(
        ar > 0.05 && ar < 0.40,
        "Area replacement ratio: {:.2}", ar
    );

    // Stress concentration ratio
    let n_stress: f64 = 3.0;    // typical for stone columns
    let sigma_col_ratio: f64 = n_stress / (1.0 + (n_stress - 1.0) * ar);

    assert!(
        sigma_col_ratio > 1.0,
        "Stress concentration: {:.2}", sigma_col_ratio
    );

    // CSR reduction in native soil between columns
    let csr_reduction: f64 = 1.0 / (1.0 + (n_stress - 1.0) * ar);

    assert!(
        csr_reduction < 1.0,
        "CSR reduction factor: {:.3}", csr_reduction
    );

    // Improvement factor
    let crr_native: f64 = 0.12;
    let csr_native: f64 = 0.20;
    let fs_before: f64 = crr_native / csr_native;

    // After improvement: reduced CSR + increased CRR (densification)
    let crr_improved: f64 = crr_native * 1.30; // 30% increase from densification
    let csr_improved: f64 = csr_native * csr_reduction;
    let fs_after: f64 = crr_improved / csr_improved;

    assert!(
        fs_after > fs_before,
        "FS improved: {:.2} → {:.2}", fs_before, fs_after
    );
}
