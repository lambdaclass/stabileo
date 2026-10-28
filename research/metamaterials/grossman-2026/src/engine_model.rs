//! The clamped strip as an ordinary Stabileo 2D model (truss members, pinned supports with
//! prescribed displacements), solved by the production engine's `solve_2d`. Used to cross-check
//! our own assembly and to describe what "Open in Stabileo" loads into the editor.
//!
//! Scaling: lengths in m; material E = 1 MPa (1000 kN/m^2); member area A_e = k_e L_e m^2, so a
//! member's axial stiffness E A / L is 1000 k_e kN/m and its axial force is 1000 times ours.

use std::collections::HashMap;

use dedaliano_engine::solver::linear::solve_2d;
use dedaliano_engine::types::SolverInput;
use serde_json::{json, Value};

use crate::experiment::StripResult;

pub const FORCE_SCALE: f64 = 1000.0;

/// SolverInput JSON for a strip without prestress (the engine's linear solve has no initial
/// tension; prestress is not exported).
pub fn strip_input(s: &StripResult) -> Value {
    let mut nodes = serde_json::Map::new();
    for (i, p) in s.nodes.iter().enumerate() {
        nodes.insert((i + 1).to_string(), json!({"id": i + 1, "x": p[0], "z": p[1]}));
    }
    let mut sections = serde_json::Map::new();
    let mut section_of: HashMap<u64, usize> = HashMap::new();
    let mut elements = serde_json::Map::new();
    for (e, b) in s.bonds.iter().enumerate() {
        let (pa, pb) = (s.nodes[b[0]], s.nodes[b[1]]);
        let l = (pb[0] - pa[0]).hypot(pb[1] - pa[1]);
        let area = s.stiffness[e] * l;
        let key = area.to_bits();
        let next = section_of.len() + 1;
        let sid = *section_of.entry(key).or_insert(next);
        if sid == next {
            sections.insert(sid.to_string(), json!({"id": sid, "a": area, "iz": 1e-12}));
        }
        elements.insert(
            (e + 1).to_string(),
            json!({"id": e + 1, "type": "truss", "nodeI": b[0] + 1, "nodeJ": b[1] + 1, "materialId": 1, "sectionId": sid,
                   "hingeStart": true, "hingeEnd": true}),
        );
    }
    let mut supports = serde_json::Map::new();
    let mut n = 0;
    for (i, &h) in s.held.iter().enumerate() {
        if h {
            n += 1;
            let d = s.prescribed[i];
            supports.insert(n.to_string(), json!({"id": n, "nodeId": i + 1, "type": "pinned", "dx": d[0], "dz": d[1]}));
        }
    }
    json!({
        "nodes": nodes,
        "materials": {"1": {"id": 1, "e": 1.0, "nu": 0.3}},
        "sections": sections,
        "elements": elements,
        "supports": supports,
        "loads": []
    })
}

/// Solve the strip with the production engine; node displacements (ux, uz) and member axial
/// forces divided by FORCE_SCALE.
pub fn solve_with_engine(s: &StripResult) -> Result<(Vec<[f64; 2]>, Vec<f64>), String> {
    let input: SolverInput = serde_json::from_value(strip_input(s)).map_err(|e| e.to_string())?;
    let r = solve_2d(&input)?;
    let mut u = vec![[0.0; 2]; s.nodes.len()];
    for d in &r.displacements {
        u[d.node_id - 1] = [d.ux, d.uz];
    }
    let mut f = vec![0.0; s.bonds.len()];
    for ef in &r.element_forces {
        f[ef.element_id - 1] = ef.n_start / FORCE_SCALE;
    }
    Ok((u, f))
}
