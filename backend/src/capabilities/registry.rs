//! Capability registry — self-describing what the system can build and solve.
//!
//! Split into two layers:
//! 1. **Solver primitives**: valid element types, support types, load types, constraints, etc.
//! 2. **Generator catalog**: available parametric builders with their schemas.
//!
//! The AI prompt is assembled from this registry so adding a new generator
//! or solver feature automatically updates the AI's knowledge.

use serde::Serialize;
use serde_json::{json, Value};

use super::sections::SECTIONS;

// ─── Solver-level primitives ────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverCapabilities {
    pub analysis_modes: Vec<&'static str>,
    pub element_types: Vec<ElementType>,
    pub support_types: SupportTypes,
    pub load_types: LoadTypes,
    pub constraint_types: Vec<&'static str>,
    pub materials: Vec<MaterialDef>,
    pub sections: Vec<SectionDef>,
    pub units: Units,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementType {
    pub name: &'static str,
    pub modes: Vec<&'static str>,
    pub description: &'static str,
}

#[derive(Serialize)]
pub struct SupportTypes {
    #[serde(rename = "2d")]
    pub two_d: Vec<&'static str>,
    #[serde(rename = "3d")]
    pub three_d: Vec<&'static str>,
}

#[derive(Serialize)]
pub struct LoadTypes {
    #[serde(rename = "2d")]
    pub two_d: Vec<LoadTypeDef>,
    #[serde(rename = "3d")]
    pub three_d: Vec<LoadTypeDef>,
}

#[derive(Serialize)]
pub struct LoadTypeDef {
    pub name: &'static str,
    pub fields: Vec<&'static str>,
    pub description: &'static str,
}

#[derive(Serialize)]
pub struct MaterialDef {
    pub name: &'static str,
    pub e: f64,
    pub nu: f64,
    pub rho: f64,
    pub fy: f64,
}

#[derive(Serialize)]
pub struct SectionDef {
    pub name: &'static str,
    pub shape: &'static str,
    pub h: f64,
}

#[derive(Serialize)]
pub struct Units {
    pub length: &'static str,
    pub force: &'static str,
    pub distributed: &'static str,
    pub moment: &'static str,
    pub stress: &'static str,
}

pub fn solver_capabilities() -> SolverCapabilities {
    SolverCapabilities {
        analysis_modes: vec!["2d", "3d"],
        element_types: vec![
            ElementType {
                name: "frame",
                modes: vec!["2d", "3d"],
                description: "Beam-column, transmits moment. 3 DOF/node (2D), 6 DOF/node (3D).",
            },
            ElementType {
                name: "truss",
                modes: vec!["2d", "3d"],
                description: "Axial-only member. 2 DOF/node (2D), 3 DOF/node (3D).",
            },
        ],
        support_types: SupportTypes {
            two_d: vec!["fixed", "pinned", "rollerX", "rollerZ", "spring"],
            three_d: vec!["fixed3d", "pinned3d", "rollerXZ", "rollerXY", "rollerYZ", "spring3d"],
        },
        load_types: LoadTypes {
            two_d: vec![
                LoadTypeDef {
                    name: "nodal",
                    fields: vec!["nodeId", "fx", "fz", "my"],
                    description: "Point forces and moment at a node (kN, kN, kN·m)",
                },
                LoadTypeDef {
                    name: "distributed",
                    fields: vec!["elementId", "qI", "qJ"],
                    description: "Linearly varying load along element (kN/m). Negative = downward.",
                },
            ],
            three_d: vec![
                LoadTypeDef {
                    name: "nodal3d",
                    fields: vec!["nodeId", "fx", "fy", "fz", "mx", "my", "mz"],
                    description: "Forces and moments at a node in 3D (kN, kN·m)",
                },
                LoadTypeDef {
                    name: "distributed3d",
                    fields: vec!["elementId", "qYI", "qYJ", "qZI", "qZJ"],
                    description: "Distributed load in local Y and Z along element (kN/m)",
                },
            ],
        },
        constraint_types: vec![
            "rigidLink",
            "diaphragm",
            "equalDOF",
            "linearMPC",
            "eccentricConnection",
        ],
        materials: vec![MaterialDef {
            name: "Steel A36",
            e: 200_000.0,
            nu: 0.3,
            rho: 78.5,
            fy: 250.0,
        }],
        sections: SECTIONS
            .iter()
            .map(|s| SectionDef {
                name: s.name,
                shape: s.shape,
                h: s.h,
            })
            .collect(),
        units: Units {
            length: "m",
            force: "kN",
            distributed: "kN/m",
            moment: "kN·m",
            stress: "MPa",
        },
    }
}

// ─── Generator catalog ──────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratorDef {
    pub action: &'static str,
    pub description: &'static str,
    pub params: Vec<ParamDef>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParamDef {
    pub name: &'static str,
    pub r#type: &'static str,
    pub required: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<Value>,
    pub description: &'static str,
}

pub fn generator_catalog() -> Vec<GeneratorDef> {
    vec![
        GeneratorDef {
            action: "create_beam",
            description: "Simply supported beam",
            params: vec![
                param_req("span", "f64", "Beam length (m)"),
                param_opt("q", "f64", "Distributed load (kN/m, negative = down)"),
                param_opt_def("support_left", "string", json!("pinned"), "Left support type"),
                param_opt_def("support_right", "string", json!("rollerX"), "Right support type"),
                param_opt("section", "string", "Section name (e.g. 'IPE 300')"),
                param_opt("p_tip", "f64", "Point load at right end (kN)"),
            ],
        },
        GeneratorDef {
            action: "create_cantilever",
            description: "Cantilever beam (fixed at left, free at right)",
            params: vec![
                param_req("length", "f64", "Cantilever length (m)"),
                param_opt("p_tip", "f64", "Point load at tip (kN, negative = down)"),
                param_opt("q", "f64", "Distributed load (kN/m)"),
                param_opt("section", "string", "Section name"),
            ],
        },
        GeneratorDef {
            action: "create_continuous_beam",
            description: "Multi-span continuous beam",
            params: vec![
                param_req("spans", "[f64]", "Array of span lengths (m)"),
                param_opt("q", "f64", "Uniform distributed load on all spans (kN/m)"),
                param_opt("section", "string", "Section name"),
            ],
        },
        GeneratorDef {
            action: "create_portal_frame",
            description: "Single-bay portal frame (2 columns + 1 beam)",
            params: vec![
                param_req("width", "f64", "Beam span (m)"),
                param_req("height", "f64", "Column height (m)"),
                param_opt("q_beam", "f64", "Distributed load on beam (kN/m)"),
                param_opt("h_lateral", "f64", "Horizontal load at top-left (kN)"),
                param_opt_def("base_support", "string", json!("fixed"), "Column base support"),
                param_opt("beam_section", "string", "Beam section name"),
                param_opt("column_section", "string", "Column section name"),
            ],
        },
        GeneratorDef {
            action: "create_truss",
            description: "Planar truss (Pratt, Warren, or Howe pattern)",
            params: vec![
                param_req("span", "f64", "Total span (m)"),
                param_req("height", "f64", "Truss height (m)"),
                param_opt_def("n_panels", "u32", json!(4), "Number of panels (>= 2)"),
                param_opt_def("pattern", "string", json!("pratt"), "pratt | warren | howe"),
                param_opt("top_load", "f64", "Point load at each top node (kN, negative = down)"),
            ],
        },
        GeneratorDef {
            action: "create_multi_story_frame",
            description: "Multi-bay, multi-story 2D frame",
            params: vec![
                param_req("n_bays", "u32", "Number of bays"),
                param_req("n_floors", "u32", "Number of floors"),
                param_req("bay_width", "f64", "Width of each bay (m)"),
                param_req("floor_height", "f64", "Height of each floor (m)"),
                param_opt("q_beam", "f64", "Distributed load on beams (kN/m)"),
                param_opt("h_lateral", "f64", "Lateral load per floor at left column (kN)"),
                param_opt("beam_section", "string", "Beam section name"),
                param_opt("column_section", "string", "Column section name"),
            ],
        },
        GeneratorDef {
            action: "create_multi_story_frame_3d",
            description: "Multi-story 3D space frame with X-bracing on perimeter",
            params: vec![
                param_req("n_bays_x", "u32", "Bays in X direction"),
                param_req("n_bays_z", "u32", "Bays in Z direction"),
                param_req("n_floors", "u32", "Number of floors"),
                param_req("bay_width", "f64", "Bay width (m)"),
                param_req("floor_height", "f64", "Floor height (m)"),
                param_opt("q_beam", "f64", "Distributed load on beams (kN/m)"),
                param_opt("h_lateral", "f64", "Lateral load per floor (kN)"),
                param_opt_def("base_support", "string", json!("fixed3d"), "Base support type"),
                param_opt("beam_section", "string", "Beam section name"),
                param_opt("column_section", "string", "Column section name"),
            ],
        },
        GeneratorDef {
            action: "create_portal_frame_3d",
            description: "Simple 3D portal frame (4 columns + 4 beams)",
            params: vec![
                param_req("width", "f64", "X span (m)"),
                param_req("depth", "f64", "Y plan depth (m)"),
                param_req("height", "f64", "Column height (m)"),
                param_opt("q_beam", "f64", "Distributed load on beams (kN/m)"),
                param_opt_def("base_support", "string", json!("fixed3d"), "Base support type"),
                param_opt("beam_section", "string", "Beam section name"),
                param_opt("column_section", "string", "Column section name"),
            ],
        },
    ]
}

// ─── Edit tool catalog ──────────────────────────────────────────

pub fn edit_tool_catalog() -> Vec<GeneratorDef> {
    vec![
        GeneratorDef {
            action: "add_bay",
            description: "Add a bay to the right or left of an existing frame",
            params: vec![
                param_req("width", "f64", "Bay width (m)"),
                param_opt_def("side", "string", json!("right"), "left or right"),
                param_opt("beam_section", "string", "Beam section name"),
                param_opt("column_section", "string", "Column section name"),
            ],
        },
        GeneratorDef {
            action: "add_story",
            description: "Add a story on top of an existing frame",
            params: vec![
                param_req("height", "f64", "Story height (m)"),
                param_opt("beam_section", "string", "Beam section name"),
                param_opt("column_section", "string", "Column section name"),
            ],
        },
        GeneratorDef {
            action: "change_section",
            description: "Change section on elements (all, specific IDs, or by type: beam/column)",
            params: vec![
                param_req("section", "string", "New section name (e.g. 'HEB 400')"),
                param_opt("element_ids", "[u32]", "Specific element IDs to change"),
                param_opt("element_filter", "string", "Filter: 'beam' or 'column'"),
            ],
        },
        GeneratorDef {
            action: "set_all_supports",
            description: "Change all support types (e.g. fixed to pinned)",
            params: vec![
                param_req("support_type", "string", "New support type (fixed, pinned, rollerX, etc.)"),
            ],
        },
        GeneratorDef {
            action: "set_all_beam_loads",
            description: "Set uniform distributed load on all elements",
            params: vec![
                param_req("q", "f64", "Distributed load (kN/m, negative = downward)"),
            ],
        },
        GeneratorDef {
            action: "add_lateral_loads",
            description: "Add horizontal force at each floor level (left column)",
            params: vec![
                param_req("h", "f64", "Horizontal force per floor (kN)"),
            ],
        },
        GeneratorDef {
            action: "add_distributed_load",
            description: "Add distributed load on a specific element",
            params: vec![
                param_req("element_id", "u32", "Target element ID"),
                param_req("q", "f64", "Load intensity (kN/m, negative = downward)"),
            ],
        },
        GeneratorDef {
            action: "add_nodal_load",
            description: "Add point load at a specific node",
            params: vec![
                param_req("node_id", "u32", "Target node ID"),
                param_opt("fx", "f64", "Horizontal force (kN)"),
                param_opt("fz", "f64", "Vertical force (kN, negative = downward)"),
                param_opt("my", "f64", "Moment about Y (kN·m)"),
            ],
        },
        GeneratorDef {
            action: "delete_element",
            description: "Delete an element by ID",
            params: vec![
                param_req("element_id", "u32", "Element ID to delete"),
            ],
        },
        GeneratorDef {
            action: "delete_load",
            description: "Delete a load by ID",
            params: vec![
                param_req("load_id", "u32", "Load ID to delete"),
            ],
        },
    ]
}

// ─── Full registry as JSON (for prompt + API) ───────────────────

pub fn full_registry_json() -> Value {
    json!({
        "solver": solver_capabilities(),
        "generators": generator_catalog(),
    })
}

/// Render a concise text description for the AI prompt.
/// This is what gets injected into the system prompt.
pub fn prompt_text(analysis_mode: &str) -> String {
    let caps = solver_capabilities();
    let gens = generator_catalog();

    let mut out = String::new();

    // Units
    out.push_str(&format!(
        "Units: {} (length), {} (force), {} (distributed), {} (moment), {} (stress)\n\n",
        caps.units.length, caps.units.force, caps.units.distributed,
        caps.units.moment, caps.units.stress,
    ));

    // Sections
    let sec_names: Vec<&str> = caps.sections.iter().map(|s| s.name).collect();
    out.push_str(&format!("Available sections: {}\n", sec_names.join(", ")));
    out.push_str("Material: Steel A36 (E=200000 MPa, fy=250 MPa). Always used.\n\n");

    // Element types for current mode
    out.push_str("Element types: ");
    let mode_elems: Vec<String> = caps.element_types.iter()
        .filter(|e| e.modes.contains(&analysis_mode))
        .map(|e| format!("{} ({})", e.name, e.description))
        .collect();
    out.push_str(&mode_elems.join("; "));
    out.push('\n');

    // Support types for current mode
    let supports = if analysis_mode == "3d" { &caps.support_types.three_d } else { &caps.support_types.two_d };
    out.push_str(&format!("Support types: {}\n", supports.join(", ")));

    // Load types for current mode
    let loads = if analysis_mode == "3d" { &caps.load_types.three_d } else { &caps.load_types.two_d };
    for lt in loads {
        out.push_str(&format!("  {} — {} [{}]\n", lt.name, lt.description, lt.fields.join(", ")));
    }
    out.push('\n');

    // Generators
    out.push_str("Available generators (output as JSON action):\n");
    for gen in &gens {
        // Skip 3D generators in 2D mode and vice versa
        if analysis_mode != "3d" && gen.action.ends_with("_3d") {
            continue;
        }

        let params: Vec<String> = gen.params.iter().map(|p| {
            if p.required {
                format!("{}: {} (required)", p.name, p.r#type)
            } else if let Some(def) = &p.default {
                format!("{}: {} (default: {})", p.name, p.r#type, def)
            } else {
                format!("{}: {} (optional)", p.name, p.r#type)
            }
        }).collect();

        out.push_str(&format!(
            "\n  {} — {}\n    {}\n",
            gen.action, gen.description, params.join(", ")
        ));
    }

    out
}

// ─── Tool definitions for function calling ──────────────────────

use crate::providers::traits::ToolDef;

/// Convert the generator catalog into provider-agnostic tool definitions.
/// Filters by analysis mode. When `has_model` is true, also includes edit tools.
pub fn tool_definitions(analysis_mode: &str, has_model: bool) -> Vec<ToolDef> {
    let mut all_gens = generator_catalog();
    if has_model {
        all_gens.extend(edit_tool_catalog());
    }
    let mut tools = Vec::new();

    for gen in &all_gens {
        // Skip 3D generators in 2D mode
        if analysis_mode != "3d" && gen.action.ends_with("_3d") {
            continue;
        }

        let mut properties = serde_json::Map::new();
        let mut required = Vec::new();

        for p in &gen.params {
            let json_type = match p.r#type {
                "f64" => "number",
                "u32" => "integer",
                "string" => "string",
                "[f64]" => "array",
                _ => "string",
            };

            let mut prop = serde_json::Map::new();
            if json_type == "array" {
                prop.insert("type".into(), json!("array"));
                prop.insert("items".into(), json!({"type": "number"}));
            } else {
                prop.insert("type".into(), json!(json_type));
            }
            prop.insert("description".into(), json!(p.description));
            if let Some(def) = &p.default {
                prop.insert("default".into(), def.clone());
            }

            properties.insert(p.name.to_string(), Value::Object(prop));

            if p.required {
                required.push(json!(p.name));
            }
        }

        // Add interpretation as a required parameter
        let mut interp_prop = serde_json::Map::new();
        interp_prop.insert("type".into(), json!("string"));
        interp_prop.insert("description".into(), json!("Brief description of what you're building, in the user's locale"));
        properties.insert("interpretation".into(), Value::Object(interp_prop));
        required.push(json!("interpretation"));

        tools.push(ToolDef {
            name: gen.action.to_string(),
            description: gen.description.to_string(),
            parameters: json!({
                "type": "object",
                "properties": properties,
                "required": required,
            }),
        });
    }

    // Always add create_model (works in both create and edit contexts)
    tools.push(ToolDef {
        name: "create_model".to_string(),
        description: "Create an arbitrary structural model by specifying nodes, elements, supports, and loads directly. Use this when no predefined generator matches the user's request.".to_string(),
        parameters: json!({
            "type": "object",
            "properties": {
                "analysisMode": { "type": "string", "enum": ["2d", "3d"], "description": "Analysis mode" },
                "nodes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "integer" },
                            "x": { "type": "number" },
                            "y": { "type": "number", "description": "Plan depth in 3D, elevation in legacy 2D snapshots" },
                            "z": { "type": "number", "description": "Elevation in 3D and canonical 2D/XZ snapshots" }
                        },
                        "required": ["id", "x", "y"]
                    }
                },
                "elements": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "integer" },
                            "type": { "type": "string", "enum": ["frame", "truss"] },
                            "nodeI": { "type": "integer" },
                            "nodeJ": { "type": "integer" },
                            "sectionId": { "type": "integer" },
                            "materialId": { "type": "integer" }
                        },
                        "required": ["id", "type", "nodeI", "nodeJ", "sectionId", "materialId"]
                    }
                },
                "materials": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "integer" },
                            "name": { "type": "string" },
                            "e": { "type": "number", "description": "Elastic modulus (MPa)" },
                            "nu": { "type": "number" },
                            "rho": { "type": "number" },
                            "fy": { "type": "number" }
                        },
                        "required": ["id", "name", "e"]
                    }
                },
                "sections": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "integer" },
                            "name": { "type": "string" },
                            "a": { "type": "number", "description": "Cross-section area (m²)" },
                            "iz": { "type": "number", "description": "Moment of inertia about Z (m⁴)" },
                            "iy": { "type": "number", "description": "Moment of inertia about Y, only for 3D (m⁴)" },
                            "j": { "type": "number", "description": "Torsional constant, only for 3D (m⁴)" }
                        },
                        "required": ["id", "name", "a", "iz"]
                    }
                },
                "supports": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "integer" },
                            "nodeId": { "type": "integer" },
                            "type": { "type": "string" }
                        },
                        "required": ["id", "nodeId", "type"]
                    }
                },
                "loads": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": { "type": "string" },
                            "data": { "type": "object" }
                        },
                        "required": ["type", "data"]
                    }
                },
                "interpretation": { "type": "string", "description": "Brief description of what you're building, in the user's locale" }
            },
            "required": ["analysisMode", "nodes", "elements", "materials", "sections", "supports", "interpretation"]
        }),
    });

    tools
}

// ─── Helpers ────────────────────────────────────────────────────

fn param_req(name: &'static str, ty: &'static str, desc: &'static str) -> ParamDef {
    ParamDef { name, r#type: ty, required: true, default: None, description: desc }
}

fn param_opt(name: &'static str, ty: &'static str, desc: &'static str) -> ParamDef {
    ParamDef { name, r#type: ty, required: false, default: None, description: desc }
}

fn param_opt_def(name: &'static str, ty: &'static str, default: Value, desc: &'static str) -> ParamDef {
    ParamDef { name, r#type: ty, required: false, default: Some(default), description: desc }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_json_has_both_layers() {
        let reg = full_registry_json();
        assert!(reg.get("solver").is_some());
        assert!(reg.get("generators").is_some());
    }

    #[test]
    fn generator_count_matches_actions() {
        let gens = generator_catalog();
        assert_eq!(gens.len(), 8);
    }

    #[test]
    fn prompt_text_contains_generators() {
        let text = prompt_text("2d");
        assert!(text.contains("create_beam"));
        assert!(text.contains("create_multi_story_frame"));
        // 3D generators should be excluded in 2D mode
        assert!(!text.contains("create_portal_frame_3d"));
    }

    #[test]
    fn prompt_text_3d_includes_3d_generators() {
        let text = prompt_text("3d");
        assert!(text.contains("create_portal_frame_3d"));
        assert!(text.contains("create_multi_story_frame_3d"));
    }

    #[test]
    fn prompt_text_includes_sections() {
        let text = prompt_text("2d");
        assert!(text.contains("IPE 300"));
        assert!(text.contains("HEB 300"));
    }
}
