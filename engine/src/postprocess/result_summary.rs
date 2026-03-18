use crate::types::*;

fn find_extreme(iter: impl Iterator<Item = (usize, f64)>) -> Option<ResultExtreme> {
    let mut max_val = f64::NEG_INFINITY;
    let mut max_id = 0;
    let mut min_val = f64::INFINITY;
    let mut min_id = 0;
    let mut has_data = false;
    for (id, v) in iter {
        has_data = true;
        if v > max_val {
            max_val = v;
            max_id = id;
        }
        if v < min_val {
            min_val = v;
            min_id = id;
        }
    }
    if has_data {
        Some(ResultExtreme {
            max_value: max_val,
            max_id,
            min_value: min_val,
            min_id,
        })
    } else {
        None
    }
}

pub fn compute_result_summary_2d(results: &AnalysisResults) -> ResultSummary {
    let dx = find_extreme(results.displacements.iter().map(|d| (d.node_id, d.ux)));
    let dz = find_extreme(results.displacements.iter().map(|d| (d.node_id, d.uy)));
    let ry = find_extreme(results.displacements.iter().map(|d| (d.node_id, d.rz)));
    let res = find_extreme(
        results
            .displacements
            .iter()
            .map(|d| (d.node_id, (d.ux * d.ux + d.uy * d.uy).sqrt())),
    );
    let rxn = find_extreme(
        results
            .reactions
            .iter()
            .map(|r| (r.node_id, (r.rx * r.rx + r.ry * r.ry).sqrt())),
    );
    ResultSummary {
        displacement_x: dx,
        displacement_y: None,
        displacement_z: dz,
        rotation: ry,
        displacement_resultant: res,
        reaction_resultant: rxn,
    }
}

pub fn compute_result_summary_3d(results: &AnalysisResults3D) -> ResultSummary {
    let dx = find_extreme(results.displacements.iter().map(|d| (d.node_id, d.ux)));
    let dy = find_extreme(results.displacements.iter().map(|d| (d.node_id, d.uy)));
    let dz = find_extreme(results.displacements.iter().map(|d| (d.node_id, d.uz)));
    let res = find_extreme(results.displacements.iter().map(|d| {
        (
            d.node_id,
            (d.ux * d.ux + d.uy * d.uy + d.uz * d.uz).sqrt(),
        )
    }));
    let rxn = find_extreme(results.reactions.iter().map(|r| {
        (
            r.node_id,
            (r.fx * r.fx + r.fy * r.fy + r.fz * r.fz).sqrt(),
        )
    }));
    ResultSummary {
        displacement_x: dx,
        displacement_y: dy,
        displacement_z: dz,
        rotation: None, // 3D rotation is complex (3 components), skip for now
        displacement_resultant: res,
        reaction_resultant: rxn,
    }
}
