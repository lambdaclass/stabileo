//! Invalid shell properties must be refused even when a surrounding frame
//! makes the assembled system invertible. Small valid properties stay valid.
#[path = "common/mod.rs"]
mod common;

use common::make_3d_input;
use dedaliano_engine::element::quad9::quad9_check_jacobian;
use dedaliano_engine::solver::kinematic::analyze_kinematics_3d;
use dedaliano_engine::solver::linear::solve_3d;
use dedaliano_engine::solver::pre_solve_gates::check_shell_distortion_3d;
use dedaliano_engine::types::*;

const SQUARE: [[f64; 3]; 9] = [
    [-1., -1., 0.],
    [1., -1., 0.],
    [1., 1., 0.],
    [-1., 1., 0.],
    [0., -1., 0.],
    [1., 0., 0.],
    [0., 1., 0.],
    [-1., 0., 0.],
    [0., 0., 0.],
];

fn supported_nodes(coords: &[[f64; 3]]) -> SolverInput3D {
    let mut nodes: Vec<_> = coords
        .iter()
        .enumerate()
        .map(|(i, p)| (i, p[0], p[1], p[2]))
        .collect();
    nodes.push((100, 0., 0., -1.));
    make_3d_input(
        nodes,
        vec![(1, 210_000., 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 1e-4)],
        (0..coords.len())
            .map(|i| (i, "frame", 100, i, 1, 1))
            .collect(),
        vec![(100, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 0,
            fx: 1.,
            fy: 0.,
            fz: -10.,
            mx: 0.,
            my: 0.,
            mz: 0.,
            bw: None,
        })],
    )
}

fn shell_model(family: &str, thickness: f64) -> SolverInput3D {
    let n = match family {
        "Plate" => 3,
        "Quad9" => 9,
        _ => 4,
    };
    let mut input = supported_nodes(&SQUARE[..n]);
    match family {
        "Plate" => {
            input.plates.insert(
                "20".into(),
                SolverPlateElement {
                    id: 20,
                    nodes: [0, 1, 2],
                    material_id: 1,
                    thickness,
                },
            );
        }
        "Quad" => {
            input.quads.insert(
                "20".into(),
                SolverQuadElement {
                    id: 20,
                    nodes: [0, 1, 2, 3],
                    material_id: 1,
                    thickness,
                },
            );
        }
        "Quad9" => {
            input.quad9s.insert(
                "20".into(),
                SolverQuad9Element {
                    id: 20,
                    nodes: [0, 1, 2, 3, 4, 5, 6, 7, 8],
                    material_id: 1,
                    thickness,
                },
            );
        }
        "Curved shell" => {
            input.curved_shells.insert(
                "20".into(),
                SolverCurvedShellElement {
                    id: 20,
                    nodes: [0, 1, 2, 3],
                    material_id: 1,
                    thickness,
                    normals: None,
                },
            );
        }
        _ => panic!("unknown shell family"),
    }
    input
}

fn assert_invalid_thickness(family: &str) {
    for thickness in [0., -0., -0.1, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        for constrained in [false, true] {
            let mut input = shell_model(family, thickness);
            if constrained {
                input
                    .constraints
                    .push(Constraint::EqualDOF(EqualDOFConstraint {
                        master_node: 0,
                        slave_node: 1,
                        dofs: vec![0],
                    }));
            }
            let err =
                solve_3d(&input).expect_err("invalid thickness must not silently remove a shell");
            assert!(
                err.contains(&format!("{family} 20")) && err.contains("thickness"),
                "{family}, {thickness}, constrained={constrained}: {err}"
            );
            // Kinematics must expose the same data error before assembly.
            let kin = analyze_kinematics_3d(&input);
            assert!(!kin.is_solvable);
            assert!(kin
                .invalid_input
                .as_deref()
                .is_some_and(|s| s.contains("thickness")));
        }
    }
}

#[test]
fn quad_invalid_thickness() {
    assert_invalid_thickness("Quad");
}
#[test]
fn plate_invalid_thickness() {
    assert_invalid_thickness("Plate");
}
#[test]
fn quad9_invalid_thickness() {
    assert_invalid_thickness("Quad9");
}
#[test]
fn curved_shell_invalid_thickness() {
    assert_invalid_thickness("Curved shell");
}

#[test]
fn positive_thin_shells_still_solve() {
    for family in ["Plate", "Quad", "Quad9", "Curved shell"] {
        for thickness in [0.1, 1e-9] {
            let r = solve_3d(&shell_model(family, thickness)).expect("positive finite thickness");
            assert!(r
                .displacements
                .iter()
                .all(|d| d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite()));
        }
    }
}

fn singular_quad9(reflected: bool) -> SolverInput3D {
    // The biquadratic map (xi² - eta², 2*xi*eta) has det(J) =
    // 4*(xi² + eta²): positive away from the center, exactly zero there.
    // Reflection changes its sign without removing the singular center.
    let mut coords = [
        [0., 2., 0.],
        [0., -2., 0.],
        [0., 2., 0.],
        [0., -2., 0.],
        [-1., 0., 0.],
        [1., 0., 0.],
        [-1., 0., 0.],
        [1., 0., 0.],
        [0., 0., 0.],
    ];
    if reflected {
        for p in &mut coords {
            p[0] = -p[0];
        }
    }
    let (min, max, _) = quad9_check_jacobian(&coords);
    if reflected {
        assert!(min < -4.7 && max == 0.);
    } else {
        assert!(min == 0. && max > 4.7);
    }
    let mut input = supported_nodes(&coords);
    input.quad9s.insert(
        "20".into(),
        SolverQuad9Element {
            id: 20,
            nodes: [0, 1, 2, 3, 4, 5, 6, 7, 8],
            material_id: 1,
            thickness: 0.1,
        },
    );
    input
}

#[test]
fn zero_jacobian_sample_is_an_error_in_either_orientation() {
    for reflected in [false, true] {
        let diags = check_shell_distortion_3d(&singular_quad9(reflected));
        assert!(
            diags
                .iter()
                .any(|d| d.code == DiagnosticCode::NegativeJacobian
                    && d.severity == Severity::Error
                    && d.element_ids == vec![20]),
            "{diags:?}"
        );
    }
}

#[test]
fn singular_sample_is_refused_even_with_frame_stiffness() {
    for reflected in [false, true] {
        for constrained in [false, true] {
            let mut input = singular_quad9(reflected);
            if constrained {
                input
                    .constraints
                    .push(Constraint::EqualDOF(EqualDOFConstraint {
                        master_node: 0,
                        slave_node: 1,
                        dofs: vec![0],
                    }));
            }
            let err = solve_3d(&input).expect_err("singular shell mapping");
            assert!(
                err.contains("Quad9 20") && err.contains("singular Jacobian"),
                "{err}"
            );
        }
    }
}

#[test]
fn small_valid_quad9_does_not_get_a_singularity_error() {
    let mut input = shell_model("Quad9", 0.1);
    for node in input.nodes.values_mut().filter(|n| n.id != 100) {
        node.x *= 1e-8;
        node.y *= 1e-8;
    }
    let diags = check_shell_distortion_3d(&input);
    assert!(
        diags.iter().all(|d| d.severity != Severity::Error),
        "{diags:?}"
    );
}
