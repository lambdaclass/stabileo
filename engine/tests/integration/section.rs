use dedaliano_engine::section::*;
use std::collections::HashMap;
use std::f64::consts::PI;

fn rect_vertices(b: f64, h: f64) -> Vec<[f64; 2]> {
    // Rectangle centered at origin, width b (Y-dir), height h (Z-dir)
    vec![
        [-b / 2.0, -h / 2.0],
        [b / 2.0, -h / 2.0],
        [b / 2.0, h / 2.0],
        [-b / 2.0, h / 2.0],
    ]
}

fn simple_input(vertices: Vec<[f64; 2]>) -> SectionInput {
    SectionInput {
        polygons: vec![SectionPolygon {
            vertices,
            material_id: 0,
            is_void: false,
        }],
        modular_ratios: HashMap::new(),
    }
}

/// Test 1: Rectangle section properties (exact analytical values).
#[test]
fn section_rectangle_properties() {
    let b = 0.3;  // 300 mm
    let h = 0.5;  // 500 mm
    let input = simple_input(rect_vertices(b, h));
    let props = analyze_section(&input).unwrap();

    let a_exact = b * h;
    let iy_exact = b * h.powi(3) / 12.0;  // About Y-axis (horizontal)
    let iz_exact = h * b.powi(3) / 12.0;  // About Z-axis (vertical)

    assert!((props.a - a_exact).abs() < 1e-10, "Area: {:.6} vs {:.6}", props.a, a_exact);
    assert!(props.yc.abs() < 1e-10, "Centroid Y should be 0: {:.6e}", props.yc);
    assert!(props.zc.abs() < 1e-10, "Centroid Z should be 0: {:.6e}", props.zc);
    assert!((props.iy - iy_exact).abs() / iy_exact < 1e-6,
        "Iy: {:.6e} vs {:.6e}", props.iy, iy_exact);
    assert!((props.iz - iz_exact).abs() / iz_exact < 1e-6,
        "Iz: {:.6e} vs {:.6e}", props.iz, iz_exact);
    assert!(props.iyz.abs() < 1e-10, "Product of inertia should be 0: {:.6e}", props.iyz);
}

/// Test 2: Rectangle elastic section moduli.
#[test]
fn section_rectangle_moduli() {
    let b = 0.2;
    let h = 0.4;
    let input = simple_input(rect_vertices(b, h));
    let props = analyze_section(&input).unwrap();

    let sy_exact = b * h * h / 6.0;
    let sz_exact = h * b * b / 6.0;

    assert!((props.sy_top - sy_exact).abs() / sy_exact < 1e-4,
        "Sy_top: {:.6e} vs {:.6e}", props.sy_top, sy_exact);
    assert!((props.sy_bot - sy_exact).abs() / sy_exact < 1e-4,
        "Sy_bot: {:.6e} vs {:.6e}", props.sy_bot, sy_exact);
    assert!((props.sz_left - sz_exact).abs() / sz_exact < 1e-4,
        "Sz_left: {:.6e} vs {:.6e}", props.sz_left, sz_exact);
}

/// Test 3: Rectangle plastic section modulus (Zy = b*h²/4 for rectangle).
#[test]
fn section_rectangle_plastic_modulus() {
    let b = 0.3;
    let h = 0.6;
    let input = simple_input(rect_vertices(b, h));
    let props = analyze_section(&input).unwrap();

    let zy_exact = b * h * h / 4.0;  // Plastic modulus about Y-axis
    let zz_exact = h * b * b / 4.0;  // Plastic modulus about Z-axis

    // Numerical approximation has ~1% tolerance from strip integration
    assert!((props.zy - zy_exact).abs() / zy_exact < 0.02,
        "Zy: {:.6e} vs {:.6e}", props.zy, zy_exact);
    assert!((props.zz - zz_exact).abs() / zz_exact < 0.02,
        "Zz: {:.6e} vs {:.6e}", props.zz, zz_exact);

    // Shape factor for rectangle = Z/S = 1.5
    let shape_factor = props.zy / props.sy_top;
    assert!((shape_factor - 1.5).abs() < 0.05,
        "Shape factor: {:.3} vs 1.5", shape_factor);
}

/// Test 4: I-beam section (3 rectangles).
#[test]
fn section_i_beam() {
    // W-shape approximation: flanges 200x20, web 10x260
    let bf = 0.200;
    let tf = 0.020;
    let tw = 0.010;
    let hw = 0.260;
    let d = hw + 2.0 * tf; // Total depth = 0.300

    let input = SectionInput {
        polygons: vec![
            // Bottom flange
            SectionPolygon {
                vertices: vec![
                    [-bf / 2.0, -d / 2.0],
                    [bf / 2.0, -d / 2.0],
                    [bf / 2.0, -d / 2.0 + tf],
                    [-bf / 2.0, -d / 2.0 + tf],
                ],
                material_id: 0,
                is_void: false,
            },
            // Web
            SectionPolygon {
                vertices: vec![
                    [-tw / 2.0, -hw / 2.0],
                    [tw / 2.0, -hw / 2.0],
                    [tw / 2.0, hw / 2.0],
                    [-tw / 2.0, hw / 2.0],
                ],
                material_id: 0,
                is_void: false,
            },
            // Top flange
            SectionPolygon {
                vertices: vec![
                    [-bf / 2.0, d / 2.0 - tf],
                    [bf / 2.0, d / 2.0 - tf],
                    [bf / 2.0, d / 2.0],
                    [-bf / 2.0, d / 2.0],
                ],
                material_id: 0,
                is_void: false,
            },
        ],
        modular_ratios: HashMap::new(),
    };

    let props = analyze_section(&input).unwrap();

    // Expected area
    let a_exact = 2.0 * bf * tf + tw * hw;
    assert!((props.a - a_exact).abs() / a_exact < 1e-4,
        "Area: {:.6e} vs {:.6e}", props.a, a_exact);

    // Centroid should be at origin (symmetric section)
    assert!(props.yc.abs() < 1e-6, "Yc: {:.6e}", props.yc);
    assert!(props.zc.abs() < 1e-6, "Zc: {:.6e}", props.zc);

    // Iy by parallel axis theorem
    let iy_flange = bf * tf.powi(3) / 12.0 + bf * tf * (d / 2.0 - tf / 2.0).powi(2);
    let iy_web = tw * hw.powi(3) / 12.0;
    let iy_exact = 2.0 * iy_flange + iy_web;
    assert!((props.iy - iy_exact).abs() / iy_exact < 1e-3,
        "Iy: {:.6e} vs {:.6e}", props.iy, iy_exact);

    // Iy should be much larger than Iz for I-beam
    assert!(props.iy > 5.0 * props.iz, "I-beam Iy >> Iz");
}

/// Test 5: Hollow rectangular section (rectangle with void).
#[test]
fn section_hollow_rectangle() {
    let b_outer = 0.3;
    let h_outer = 0.4;
    let t = 0.02; // wall thickness

    let input = SectionInput {
        polygons: vec![
            SectionPolygon {
                vertices: rect_vertices(b_outer, h_outer),
                material_id: 0,
                is_void: false,
            },
            SectionPolygon {
                vertices: rect_vertices(b_outer - 2.0 * t, h_outer - 2.0 * t),
                material_id: 0,
                is_void: true,
            },
        ],
        modular_ratios: HashMap::new(),
    };

    let props = analyze_section(&input).unwrap();

    let bi = b_outer - 2.0 * t;
    let hi = h_outer - 2.0 * t;
    let a_exact = b_outer * h_outer - bi * hi;
    let iy_exact = b_outer * h_outer.powi(3) / 12.0 - bi * hi.powi(3) / 12.0;

    assert!((props.a - a_exact).abs() / a_exact < 1e-4,
        "Area: {:.6e} vs {:.6e}", props.a, a_exact);
    assert!((props.iy - iy_exact).abs() / iy_exact < 1e-3,
        "Iy: {:.6e} vs {:.6e}", props.iy, iy_exact);
}

/// Test 6: Circular section approximated by polygon (n-gon convergence).
#[test]
fn section_circular_convergence() {
    let r = 0.15; // 150 mm radius
    let a_exact = PI * r * r;
    let i_exact = PI * r.powi(4) / 4.0; // Ix = Iy for circle

    // 128-gon gives good approximation
    let n_sides = 128;
    let vertices: Vec<[f64; 2]> = (0..n_sides)
        .map(|i| {
            let theta = 2.0 * PI * i as f64 / n_sides as f64;
            [r * theta.cos(), r * theta.sin()]
        })
        .collect();

    let input = simple_input(vertices);
    let props = analyze_section(&input).unwrap();

    assert!((props.a - a_exact).abs() / a_exact < 0.001,
        "Area: {:.6e} vs {:.6e}", props.a, a_exact);
    assert!((props.iy - i_exact).abs() / i_exact < 0.005,
        "Iy: {:.6e} vs {:.6e}", props.iy, i_exact);
    assert!((props.iz - i_exact).abs() / i_exact < 0.005,
        "Iz: {:.6e} vs {:.6e}", props.iz, i_exact);

    // For circle: Iy = Iz, Iyz = 0, principal angle undefined
    assert!((props.iy - props.iz).abs() / props.iy < 0.001,
        "Circle should have Iy ≈ Iz");
}

/// Test 7: L-shaped section (non-symmetric) has non-zero product of inertia.
#[test]
fn section_l_shape_asymmetric() {
    // L-shape: 200x20 horizontal leg + 180x20 vertical leg
    let input = SectionInput {
        polygons: vec![
            // Horizontal leg
            SectionPolygon {
                vertices: vec![
                    [0.0, 0.0],
                    [0.2, 0.0],
                    [0.2, 0.02],
                    [0.0, 0.02],
                ],
                material_id: 0,
                is_void: false,
            },
            // Vertical leg
            SectionPolygon {
                vertices: vec![
                    [0.0, 0.02],
                    [0.02, 0.02],
                    [0.02, 0.2],
                    [0.0, 0.2],
                ],
                material_id: 0,
                is_void: false,
            },
        ],
        modular_ratios: HashMap::new(),
    };

    let props = analyze_section(&input).unwrap();

    // Centroid should not be at the corner
    assert!(props.yc > 0.01 && props.yc < 0.1, "Yc={:.4}", props.yc);
    assert!(props.zc > 0.02 && props.zc < 0.1, "Zc={:.4}", props.zc);

    // Product of inertia should be non-zero for L-shape
    assert!(props.iyz.abs() > 1e-8, "L-shape should have non-zero Iyz: {:.6e}", props.iyz);

    // Principal axes should be rotated
    assert!(props.theta_p.abs() > 0.01, "Principal angle: {:.4} rad", props.theta_p);

    // I1 > I2
    assert!(props.i1 > props.i2, "I1={:.6e} should be > I2={:.6e}", props.i1, props.i2);
}

/// Test 8: Compound section with modular ratios (steel-concrete composite).
#[test]
fn section_composite_modular_ratio() {
    // Concrete slab on steel beam
    // Steel beam: 200x20 rectangle (material 1, n=7)
    // Concrete slab: 1000x150 on top (material 0, n=1)
    let n_ratio = 7.0; // Es/Ec

    let input = SectionInput {
        polygons: vec![
            // Concrete slab (material 0)
            SectionPolygon {
                vertices: vec![
                    [-0.5, 0.0],
                    [0.5, 0.0],
                    [0.5, 0.15],
                    [-0.5, 0.15],
                ],
                material_id: 0,
                is_void: false,
            },
            // Steel beam (material 1)
            SectionPolygon {
                vertices: vec![
                    [-0.1, -0.2],
                    [0.1, -0.2],
                    [0.1, 0.0],
                    [-0.1, 0.0],
                ],
                material_id: 1,
                is_void: false,
            },
        ],
        modular_ratios: {
            let mut m = HashMap::new();
            m.insert(1, n_ratio);
            m
        },
    };

    let props = analyze_section(&input).unwrap();

    // Transformed area = A_concrete + n * A_steel
    let a_concrete = 1.0 * 0.15;
    let a_steel = 0.2 * 0.2;
    let a_transformed = a_concrete + n_ratio * a_steel;
    assert!((props.a - a_transformed).abs() / a_transformed < 1e-4,
        "Transformed area: {:.6} vs {:.6}", props.a, a_transformed);

    // Centroid should be below the slab (pulled down by heavier steel)
    assert!(props.zc < 0.075, "Centroid should be below slab mid: zc={:.4}", props.zc);
    assert!(props.zc > -0.1, "Centroid should be above steel bottom: zc={:.4}", props.zc);
}
