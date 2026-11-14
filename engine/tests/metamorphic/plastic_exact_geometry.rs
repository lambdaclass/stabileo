use crate::case::Case3;
use crate::checks3::Ctx;
use crate::tally::Tally;
use dedaliano_engine::types::SolverInput3D;

pub fn preserves_affine_relations(source: &SolverInput3D, transformed: &SolverInput3D) -> Result<(), String> {
    use dedaliano_engine::certify::exact::{q, rref_solve, Q};
    let mut nodes: Vec<_> = source.nodes.values().collect();
    nodes.sort_by_key(|node| node.id);
    let Some(origin) = nodes.first() else { return Ok(()); };
    let position = |node: &dedaliano_engine::types::SolverNode3D| -> Result<[Q; 3], String> {
        Ok([q(node.x).ok_or("non-finite affine x")?, q(node.y).ok_or("non-finite affine y")?, q(node.z).ok_or("non-finite affine z")?])
    };
    let after = |id| transformed.nodes.values().find(|node| node.id == id).ok_or_else(|| format!("affine transform lost node {id}"));
    let before_origin = position(origin)?;
    let after_origin = position(after(origin.id)?)?;
    let mut rows = Vec::new();
    let mut rhs = [Vec::new(), Vec::new(), Vec::new()];
    for node in nodes {
        let before = position(node)?;
        let next = position(after(node.id)?)?;
        rows.push((0..3).map(|k| &before[k] - &before_origin[k]).collect());
        for k in 0..3 { rhs[k].push(&next[k] - &after_origin[k]); }
    }
    for values in &rhs {
        if rref_solve(&rows, Some(values), 3)?.particular.is_none() {
            return Err("rounded transform changes an exact affine relation of the rigid-plastic geometry".into());
        }
    }
    Ok(())
}

fn rotation(name: &str, text: &str) {
    let input: SolverInput3D = serde_json::from_str(text).unwrap();
    let case = Case3::new(name, input);
    let adapter = crate::ana3::rows().into_iter().find(|analysis| analysis.name == "plastic collapse").unwrap();
    assert!((adapter.run)(&case).is_ok());
    let tally = Tally::default();
    crate::checks3::check_case(&Ctx { tally: &tally, rng_seed: 20261018 }, &case, &[adapter], &["rotation"]);
    let cells = tally.cells.lock().unwrap();
    let cell = &cells[&("plastic collapse".to_string(), "rotation".to_string())];
    assert!(cell.fails.is_empty(), "{cell:?}");
    assert!(cell.pass > 0, "{cell:?}");
}

#[test]
fn issue_2084_grid_rotation_preserves_the_exact_plastic_geometry() {
    rotation("ex-3d-grid-slab-input", include_str!("../fixtures/ex-3d-grid-slab-input.json"));
}

#[test]
fn issue_2084_collinear_beam_rotation_preserves_the_exact_plastic_geometry() {
    rotation("ex-3d-torsion-beam-input", include_str!("../fixtures/ex-3d-torsion-beam-input.json"));
}

#[test]
fn exact_affine_relations_accept_axis_rotations_and_detect_one_ulp_warping() {
    use dedaliano_engine::metamorphic::transform::{transform_3d, Iso3};
    for text in [include_str!("../fixtures/ex-3d-grid-slab-input.json"), include_str!("../fixtures/ex-3d-torsion-beam-input.json")] {
        let input: SolverInput3D = serde_json::from_str(text).unwrap();
        assert!(preserves_affine_relations(&input, &input).is_ok());
        for k in 0..24 {
            let rotated = transform_3d(&input, &Iso3::axis_permutation(k)).unwrap();
            assert!(preserves_affine_relations(&input, &rotated).is_ok(), "axis permutation {k}");
        }
        let mut warped = input.clone();
        let node = warped.nodes.values_mut().find(|node| node.id == 2).unwrap();
        node.z = node.z.next_up();
        assert!(preserves_affine_relations(&input, &warped).is_err());
    }
}
