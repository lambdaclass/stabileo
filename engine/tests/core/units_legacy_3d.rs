use dedaliano_engine::types::*;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverInput3D {
    nodes: HashMap<String, SolverNode3D>,
    materials: HashMap<String, SolverMaterial>,
    sections: HashMap<String, SolverSection3D>,
    elements: HashMap<String, SolverElement3D>,
    supports: HashMap<String, SolverSupport3D>,
    loads: Vec<SolverLoad3D>,
    #[serde(default)]
    constraints: Vec<Constraint>,
    #[serde(default)]
    left_hand: Option<bool>,
    #[serde(default)]
    plates: HashMap<String, SolverPlateElement>,
    #[serde(default)]
    quads: HashMap<String, SolverQuadElement>,
    #[serde(default)]
    quad9s: HashMap<String, SolverQuad9Element>,
    #[serde(default)]
    solid_shells: HashMap<String, SolverSolidShellElement>,
    #[serde(default)]
    curved_shells: HashMap<String, SolverCurvedShellElement>,
    #[serde(default)]
    curved_beams: Vec<CurvedBeamInput>,
    #[serde(default)]
    connectors: HashMap<String, ConnectorElement>,
    #[serde(default)]
    solver_options: Option<SolverOptions>,
    #[serde(default)]
    masses: MassInput3D,
}

pub fn parse(text: &str) -> Result<dedaliano_engine::types::SolverInput3D, String> {
    let l: SolverInput3D = serde_json::from_str(text).map_err(|e| e.to_string())?;
    Ok(dedaliano_engine::types::SolverInput3D {
        nodes: l.nodes,
        materials: l.materials,
        sections: l.sections,
        elements: l.elements,
        supports: l.supports,
        loads: l.loads,
        constraints: l.constraints,
        left_hand: l.left_hand,
        plates: l.plates,
        quads: l.quads,
        quad9s: l.quad9s,
        solid_shells: l.solid_shells,
        curved_shells: l.curved_shells,
        curved_beams: l.curved_beams,
        connectors: l.connectors,
        solver_options: l.solver_options,
        masses: l.masses,
    })
}
