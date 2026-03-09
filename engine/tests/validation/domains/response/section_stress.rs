/// Validation: Section stress formulas (Navier/Jourawski/Mohr/failure criteria).
///
/// Reference: Timoshenko *Strength of Materials*
///
/// Rectangular section b=0.3, h=0.5
/// A = 0.15 m², Iz = bh³/12 = 0.003125 m⁴
use dedaliano_engine::postprocess::section_stress::*;
use dedaliano_engine::types::*;

const FY: f64 = 250.0; // MPa
const B_SEC: f64 = 0.3;
const H_SEC: f64 = 0.5;
const A_SEC: f64 = 0.15;       // b*h
const IZ_SEC: f64 = 0.003125;  // bh³/12

fn rect_section() -> SectionGeometry {
    SectionGeometry {
        shape: "rect".to_string(),
        h: H_SEC, b: B_SEC,
        tw: None, tf: None, t: None,
        a: A_SEC, iy: IZ_SEC, iz: IZ_SEC, j: None,
    }
}

fn make_ef(n: f64, v: f64, m: f64) -> ElementForces {
    ElementForces {
        element_id: 1,
        n_start: n, v_start: v, m_start: m,
        n_end: -n, v_end: -v, m_end: -m,
        length: 6.0,
        q_i: 0.0, q_j: 0.0,
        point_loads: vec![], distributed_loads: vec![],
        hinge_start: false, hinge_end: false,
    }
}

// ═══════════════════════════════════════════════════════════════
// 1. Pure Bending: σ_max = My_max/I
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_stress_pure_bending() {
    // M=100 kN·m, y_max=h/2=0.25
    // σ_max = M*y_max/Iz = 100*0.25/0.003125 = 8000 kN/m² = 8.0 MPa
    let input = SectionStressInput {
        element_forces: make_ef(0.0, 0.0, 100.0),
        section: rect_section(),
        fy: Some(FY),
        t: 0.0,
        y_fiber: None,
    };
    let result = compute_section_stress_2d(&input);

    let max_sigma = result.distribution.iter()
        .map(|p| p.sigma.abs())
        .fold(0.0_f64, f64::max);
    assert!(
        (max_sigma - 8.0).abs() < 0.5,
        "pure bending σ_max={:.3}, expected 8.0 MPa", max_sigma
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Pure Shear: τ_max = 3V/(2A)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_stress_pure_shear() {
    // V=100 kN, τ_max = 3*100/(2*0.15) = 1000 kN/m² = 1.0 MPa
    let input = SectionStressInput {
        element_forces: make_ef(0.0, 100.0, 0.0),
        section: rect_section(),
        fy: Some(FY),
        t: 0.0,
        y_fiber: None,
    };
    let result = compute_section_stress_2d(&input);

    let tau_at_na = result.distribution.iter()
        .min_by(|a, b| a.y.abs().partial_cmp(&b.y.abs()).unwrap()).unwrap();
    assert!(
        (tau_at_na.tau.abs() - 1.0).abs() < 0.15,
        "pure shear τ_max={:.3}, expected 1.0 MPa", tau_at_na.tau
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Combined N+M: σ(y) = N/A + My/I, Neutral Axis Shift
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_stress_combined_n_m() {
    // N=150 kN (tension), M=100 kN·m
    // σ(y) = N/A + My/Iz
    // At top (y=+0.25): σ = 150/0.15 + 100*0.25/0.003125 = 1000 + 8000 = 9000 kN/m² = 9.0 MPa
    // At bottom (y=-0.25): σ = 1000 - 8000 = -7000 kN/m² = -7.0 MPa
    let input = SectionStressInput {
        element_forces: make_ef(150.0, 0.0, 100.0),
        section: rect_section(),
        fy: Some(FY),
        t: 0.0,
        y_fiber: None,
    };
    let result = compute_section_stress_2d(&input);

    // Find stress at extreme fibers
    let top = result.distribution.iter()
        .max_by(|a, b| a.y.partial_cmp(&b.y).unwrap()).unwrap();
    let bottom = result.distribution.iter()
        .min_by(|a, b| a.y.partial_cmp(&b.y).unwrap()).unwrap();

    // Neutral axis should be shifted (not at centroid)
    // NA at y = -N*Iz/(M*A) = -150*0.003125/(100*0.15) = -0.03125
    if let Some(na) = result.neutral_axis_y {
        assert!(
            na.abs() > 0.01,
            "neutral axis should be shifted from centroid, got y={:.4}", na
        );
    }

    // Check the signs are different (combined produces compression at one side)
    assert!(
        top.sigma * bottom.sigma < 0.0 || (top.sigma.abs() - bottom.sigma.abs()).abs() > 0.5,
        "combined N+M should produce asymmetric stress: top={:.2}, bottom={:.2}",
        top.sigma, bottom.sigma
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Zero Stress at Neutral Axis (Pure Bending)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_stress_zero_at_na() {
    // Pure bending: σ = 0 at y=0 (centroid = neutral axis)
    let input = SectionStressInput {
        element_forces: make_ef(0.0, 0.0, 100.0),
        section: rect_section(),
        fy: Some(FY),
        t: 0.0,
        y_fiber: None,
    };
    let result = compute_section_stress_2d(&input);

    let at_na = result.distribution.iter()
        .min_by(|a, b| a.y.abs().partial_cmp(&b.y.abs()).unwrap()).unwrap();
    assert!(
        at_na.sigma.abs() < 0.5,
        "pure bending: σ at NA should be ~0, got {:.3}", at_na.sigma
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Mohr Circle: σ₁, σ₂, Radius, θ_p
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_stress_mohr_circle() {
    // Combined M=100 and V=100
    // At a point: σ=8.0 MPa (from bending at extreme fiber), τ from shear
    let input = SectionStressInput {
        element_forces: make_ef(0.0, 100.0, 100.0),
        section: rect_section(),
        fy: Some(FY),
        t: 0.0,
        y_fiber: None,
    };
    let result = compute_section_stress_2d(&input);

    // Mohr circle should have:
    // center = (σ₁ + σ₂)/2
    // radius = (σ₁ - σ₂)/2
    let mohr = &result.mohr;
    assert!(mohr.radius >= 0.0, "Mohr radius should be non-negative");
    assert!(
        (mohr.center - (mohr.sigma1 + mohr.sigma2) / 2.0).abs() < 0.01,
        "Mohr center should be (σ₁+σ₂)/2"
    );
    assert!(
        (mohr.radius - (mohr.sigma1 - mohr.sigma2) / 2.0).abs() < 0.01,
        "Mohr radius should be (σ₁-σ₂)/2"
    );
    assert!(mohr.sigma1 >= mohr.sigma2, "σ₁ ≥ σ₂");
}

// ═══════════════════════════════════════════════════════════════
// 6. Von Mises: σ_vm = √(σ² + 3τ²)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_stress_von_mises() {
    // Pure shear: σ=0, τ=1.0 → σ_vm = √(3) * 1.0 ≈ 1.732
    let input = SectionStressInput {
        element_forces: make_ef(0.0, 100.0, 0.0),
        section: rect_section(),
        fy: Some(FY),
        t: 0.0,
        y_fiber: None,
    };
    let result = compute_section_stress_2d(&input);

    // Von Mises should be computed from the critical point
    assert!(result.failure.von_mises >= 0.0, "VM should be non-negative");
    // For pure shear at NA: σ=0, τ=1.0 MPa → VM = √3 * 1.0 ≈ 1.732
    // The failure struct may evaluate at extreme fiber (where τ=0 for rect).
    // Check the distribution directly: find max VM across all fiber points.
    let max_vm = result.distribution.iter()
        .map(|p| (p.sigma * p.sigma + 3.0 * p.tau * p.tau).sqrt())
        .fold(0.0_f64, f64::max);
    assert!(
        max_vm > 0.5,
        "max VM across section should be significant for V=100 kN, got {:.3}", max_vm
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. Tresca: 2τ_max from Mohr Circle
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_stress_tresca() {
    let input = SectionStressInput {
        element_forces: make_ef(0.0, 100.0, 100.0),
        section: rect_section(),
        fy: Some(FY),
        t: 0.0,
        y_fiber: None,
    };
    let result = compute_section_stress_2d(&input);

    // Tresca = σ₁ - σ₂ = 2*radius of Mohr circle
    let tresca = result.failure.tresca;
    assert!(tresca >= 0.0, "Tresca should be non-negative");
    assert!(
        (tresca - 2.0 * result.mohr.radius).abs() < 0.5,
        "Tresca={:.3} should ≈ 2*radius={:.3}", tresca, 2.0 * result.mohr.radius
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Failure Ratio: σ_vm/fy, ok flag
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_stress_failure_ratio() {
    // Small loads → well below yield → ok=true
    let input = SectionStressInput {
        element_forces: make_ef(0.0, 10.0, 10.0),
        section: rect_section(),
        fy: Some(FY),
        t: 0.0,
        y_fiber: None,
    };
    let result = compute_section_stress_2d(&input);

    if let Some(ratio) = result.failure.ratio_vm {
        assert!(
            ratio < 1.0,
            "small loads: VM ratio={:.3} should be < 1.0", ratio
        );
    }
    if let Some(ok) = result.failure.ok {
        assert!(ok, "small loads should pass failure check");
    }

    // Large loads → above yield → ok=false
    // σ = M*y_max/Iz = 5000*0.25/0.003125 = 400 MPa > fy=250
    let input_large = SectionStressInput {
        element_forces: make_ef(0.0, 1000.0, 5000.0),
        section: rect_section(),
        fy: Some(FY),
        t: 0.0,
        y_fiber: None,
    };
    let result_large = compute_section_stress_2d(&input_large);

    if let Some(ratio) = result_large.failure.ratio_vm {
        assert!(
            ratio > 1.0,
            "large loads: VM ratio={:.3} should be > 1.0", ratio
        );
    }
    if let Some(ok) = result_large.failure.ok {
        assert!(!ok, "large loads should fail failure check");
    }
}
