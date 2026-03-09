use dedaliano_engine::postprocess::serviceability::*;

/// Test 1: L/360 live load deflection — passes.
#[test]
fn serviceability_l360_pass() {
    let input = ServiceabilityInput {
        members: vec![ServiceabilityMember {
            element_id: 1,
            span: 6.0,
            max_deflection: 0.012, // 12mm
            criterion: DeflectionCriterion::SpanRatio(360.0),
            natural_frequency: None,
            min_frequency: None,
            description: Some("Floor beam L/360".to_string()),
        }],
    };

    let results = check_serviceability(&input);
    assert_eq!(results.len(), 1);
    let r = &results[0];

    // Allowable = 6.0/360 = 0.01667 m = 16.67 mm
    let allowable = 6.0 / 360.0;
    assert!((r.allowable_deflection - allowable).abs() < 1e-6);

    // 12mm / 16.67mm = 0.72 — passes
    assert!(r.deflection_ok);
    assert!(r.deflection_ratio < 1.0);
    assert!(r.pass);
}

/// Test 2: L/360 deflection — fails.
#[test]
fn serviceability_l360_fail() {
    let input = ServiceabilityInput {
        members: vec![ServiceabilityMember {
            element_id: 1,
            span: 6.0,
            max_deflection: 0.020, // 20mm > 16.67mm
            criterion: DeflectionCriterion::SpanRatio(360.0),
            natural_frequency: None,
            min_frequency: None,
            description: None,
        }],
    };

    let results = check_serviceability(&input);
    let r = &results[0];

    assert!(!r.deflection_ok);
    assert!(r.deflection_ratio > 1.0);
    assert!(!r.pass);
}

/// Test 3: L/240 total load deflection.
#[test]
fn serviceability_l240_total() {
    let input = ServiceabilityInput {
        members: vec![ServiceabilityMember {
            element_id: 1,
            span: 8.0,
            max_deflection: 0.030, // 30mm
            criterion: DeflectionCriterion::SpanRatio(240.0),
            natural_frequency: None,
            min_frequency: None,
            description: None,
        }],
    };

    let results = check_serviceability(&input);
    let r = &results[0];

    // Allowable = 8.0/240 = 0.03333 m
    assert!((r.allowable_deflection - 8.0 / 240.0).abs() < 1e-6);
    assert!(r.deflection_ok);
    assert!(
        r.deflection_ratio > 0.8 && r.deflection_ratio < 1.0,
        "ratio: {:.3}",
        r.deflection_ratio
    );
}

/// Test 4: Absolute deflection limit.
#[test]
fn serviceability_absolute_limit() {
    let input = ServiceabilityInput {
        members: vec![ServiceabilityMember {
            element_id: 1,
            span: 10.0,
            max_deflection: 0.025,
            criterion: DeflectionCriterion::Absolute(0.020), // 20mm limit
            natural_frequency: None,
            min_frequency: None,
            description: None,
        }],
    };

    let results = check_serviceability(&input);
    let r = &results[0];

    assert_eq!(r.allowable_deflection, 0.020);
    assert!(!r.deflection_ok);
    assert!(r.deflection_ratio > 1.0);
}

/// Test 5: Vibration check — floor frequency criterion.
#[test]
fn serviceability_vibration_check() {
    let input = ServiceabilityInput {
        members: vec![ServiceabilityMember {
            element_id: 1,
            span: 8.0,
            max_deflection: 0.010,
            criterion: DeflectionCriterion::SpanRatio(360.0),
            natural_frequency: Some(5.0), // 5 Hz — above 3 Hz minimum
            min_frequency: None,          // defaults to 3.0 Hz
            description: None,
        }],
    };

    let results = check_serviceability(&input);
    let r = &results[0];

    assert!(r.deflection_ok);
    assert_eq!(r.vibration_ok, Some(true));
    assert!(r.vibration_ratio.unwrap() < 1.0);
    assert!(r.pass);
}

/// Test 6: Vibration fails — floor too flexible.
#[test]
fn serviceability_vibration_fail() {
    let input = ServiceabilityInput {
        members: vec![ServiceabilityMember {
            element_id: 1,
            span: 12.0,
            max_deflection: 0.010,
            criterion: DeflectionCriterion::SpanRatio(360.0),
            natural_frequency: Some(2.5), // 2.5 Hz — below 3 Hz minimum
            min_frequency: None,
            description: None,
        }],
    };

    let results = check_serviceability(&input);
    let r = &results[0];

    assert!(r.deflection_ok); // deflection passes
    assert_eq!(r.vibration_ok, Some(false)); // vibration fails
    assert!(!r.pass); // overall fails
}

/// Test 7: Custom vibration limit (e.g., 8 Hz for sensitive equipment).
#[test]
fn serviceability_custom_frequency_limit() {
    let input = ServiceabilityInput {
        members: vec![ServiceabilityMember {
            element_id: 1,
            span: 6.0,
            max_deflection: 0.005,
            criterion: DeflectionCriterion::SpanRatio(480.0),
            natural_frequency: Some(10.0),
            min_frequency: Some(8.0), // sensitive equipment
            description: None,
        }],
    };

    let results = check_serviceability(&input);
    let r = &results[0];

    // 8/10 = 0.8 — passes
    assert!(r.vibration_ok.unwrap());
    assert!((r.vibration_ratio.unwrap() - 0.8).abs() < 1e-6);
    assert!(r.pass);
}

/// Test 8: Multiple members — sorted results.
#[test]
fn serviceability_multiple_members() {
    let input = ServiceabilityInput {
        members: vec![
            ServiceabilityMember {
                element_id: 3,
                span: 8.0,
                max_deflection: 0.015,
                criterion: DeflectionCriterion::SpanRatio(360.0),
                natural_frequency: None,
                min_frequency: None,
                description: None,
            },
            ServiceabilityMember {
                element_id: 1,
                span: 6.0,
                max_deflection: 0.020,
                criterion: DeflectionCriterion::SpanRatio(360.0),
                natural_frequency: None,
                min_frequency: None,
                description: None,
            },
            ServiceabilityMember {
                element_id: 2,
                span: 10.0,
                max_deflection: 0.040,
                criterion: DeflectionCriterion::SpanRatio(240.0),
                natural_frequency: Some(4.0),
                min_frequency: None,
                description: None,
            },
        ],
    };

    let results = check_serviceability(&input);
    assert_eq!(results.len(), 3);

    // Sorted by element_id
    assert_eq!(results[0].element_id, 1);
    assert_eq!(results[1].element_id, 2);
    assert_eq!(results[2].element_id, 3);

    // Element 1: 20mm vs 16.67mm — fails
    assert!(!results[0].deflection_ok);
    // Element 2: 40mm vs 41.67mm — passes (deflection), 3/4=0.75 — passes (vibration)
    assert!(results[1].deflection_ok);
    assert!(results[1].vibration_ok.unwrap());
    // Element 3: 15mm vs 22.2mm — passes
    assert!(results[2].deflection_ok);
}
