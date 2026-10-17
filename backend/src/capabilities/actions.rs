use serde::Deserialize;
use serde_json::Value;

use crate::error::AppError;

#[derive(Debug, Deserialize)]
#[serde(tag = "action", content = "params", rename_all = "snake_case")]
pub enum BuildAction {
    // ── Create actions (generate fresh model) ──────────────────
    CreateBeam {
        span: f64,
        #[serde(default)]
        q: Option<f64>,
        #[serde(default)]
        support_left: Option<String>,
        #[serde(default)]
        support_right: Option<String>,
        #[serde(default)]
        section: Option<String>,
        #[serde(default)]
        p_tip: Option<f64>,
    },
    CreateCantilever {
        length: f64,
        #[serde(default)]
        p_tip: Option<f64>,
        #[serde(default)]
        q: Option<f64>,
        #[serde(default)]
        section: Option<String>,
    },
    CreateContinuousBeam {
        spans: Vec<f64>,
        #[serde(default)]
        q: Option<f64>,
        #[serde(default)]
        section: Option<String>,
    },
    CreatePortalFrame {
        width: f64,
        height: f64,
        #[serde(default)]
        q_beam: Option<f64>,
        #[serde(default)]
        h_lateral: Option<f64>,
        #[serde(default)]
        base_support: Option<String>,
        #[serde(default)]
        beam_section: Option<String>,
        #[serde(default)]
        column_section: Option<String>,
    },
    CreateTruss {
        span: f64,
        height: f64,
        #[serde(default)]
        n_panels: Option<u32>,
        #[serde(default)]
        pattern: Option<String>,
        #[serde(default)]
        top_load: Option<f64>,
    },
    CreateMultiStoryFrame {
        n_bays: u32,
        n_floors: u32,
        bay_width: f64,
        floor_height: f64,
        #[serde(default)]
        q_beam: Option<f64>,
        #[serde(default)]
        h_lateral: Option<f64>,
        #[serde(default)]
        beam_section: Option<String>,
        #[serde(default)]
        column_section: Option<String>,
    },
    #[serde(rename = "create_multi_story_frame_3d")]
    CreateMultiStoryFrame3d {
        n_bays_x: u32,
        n_bays_z: u32,
        n_floors: u32,
        bay_width: f64,
        floor_height: f64,
        #[serde(default)]
        q_beam: Option<f64>,
        #[serde(default)]
        h_lateral: Option<f64>,
        #[serde(default)]
        base_support: Option<String>,
        #[serde(default)]
        beam_section: Option<String>,
        #[serde(default)]
        column_section: Option<String>,
    },
    #[serde(rename = "create_portal_frame_3d")]
    CreatePortalFrame3d {
        width: f64,
        depth: f64,
        height: f64,
        #[serde(default)]
        q_beam: Option<f64>,
        #[serde(default)]
        base_support: Option<String>,
        #[serde(default)]
        beam_section: Option<String>,
        #[serde(default)]
        column_section: Option<String>,
    },

    // ── Edit actions (modify existing model) ───────────────────

    /// Add a bay to the right or left of an existing frame.
    AddBay {
        width: f64,
        #[serde(default)]
        side: Option<String>,
        #[serde(default)]
        beam_section: Option<String>,
        #[serde(default)]
        column_section: Option<String>,
    },
    /// Add a story on top of an existing frame.
    AddStory {
        height: f64,
        #[serde(default)]
        beam_section: Option<String>,
        #[serde(default)]
        column_section: Option<String>,
    },
    /// Change section on specific elements or all elements of a type.
    ChangeSection {
        section: String,
        #[serde(default)]
        element_ids: Option<Vec<u32>>,
        #[serde(default)]
        element_filter: Option<String>,
    },
    /// Set all base supports to a given type.
    SetAllSupports {
        support_type: String,
    },
    /// Add or change distributed load on all beams.
    SetAllBeamLoads {
        q: f64,
    },
    /// Add lateral loads (horizontal force per floor at left column).
    AddLateralLoads {
        h: f64,
    },
    /// Add a distributed load on a specific element.
    AddDistributedLoad {
        element_id: u32,
        q: f64,
    },
    /// Add a nodal load at a specific node.
    AddNodalLoad {
        node_id: u32,
        #[serde(default)]
        fx: Option<f64>,
        #[serde(default)]
        #[serde(alias = "fy")]
        fz: Option<f64>,
        #[serde(default)]
        #[serde(alias = "mz")]
        my: Option<f64>,
    },
    /// Delete an element by ID.
    DeleteElement {
        element_id: u32,
    },
    /// Delete a load by ID.
    DeleteLoad {
        load_id: u32,
    },

    /// Create an arbitrary model from raw arrays (nodes, elements, etc.).
    CreateModel {
        #[serde(alias = "analysisMode")]
        analysis_mode: String,
        nodes: Vec<Value>,
        elements: Vec<Value>,
        materials: Vec<Value>,
        sections: Vec<Value>,
        supports: Vec<Value>,
        #[serde(default)]
        loads: Option<Vec<Value>>,
    },

    Unsupported {},
}

impl BuildAction {
    /// Returns true if this is an edit action (requires existing snapshot).
    pub fn is_edit(&self) -> bool {
        matches!(
            self,
            BuildAction::AddBay { .. }
                | BuildAction::AddStory { .. }
                | BuildAction::ChangeSection { .. }
                | BuildAction::SetAllSupports { .. }
                | BuildAction::SetAllBeamLoads { .. }
                | BuildAction::AddLateralLoads { .. }
                | BuildAction::AddDistributedLoad { .. }
                | BuildAction::AddNodalLoad { .. }
                | BuildAction::DeleteElement { .. }
                | BuildAction::DeleteLoad { .. }
        )
    }
}

#[derive(Debug, Deserialize)]
pub struct ActionResponse {
    #[serde(flatten)]
    pub action: BuildAction,
    pub interpretation: String,
}

/// Upper bounds on generator sizes. Action parameters come from the LLM, and
/// the LLM's output can be steered by whatever text reaches the prompt, so an
/// unbounded count would let a request make the server allocate an arbitrarily
/// large model. The limits are far above any building the generators target.
pub const MAX_PANELS: u32 = 200;
pub const MAX_SPANS: usize = 100;
pub const MAX_BAYS: u32 = 100;
pub const MAX_FLOORS: u32 = 200;
/// Nodes a 3D multi-story generator may create: (bays_x+1)(bays_z+1)(floors+1).
pub const MAX_GENERATED_NODES: u64 = 50_000;
/// Entries per array accepted from `create_model`.
pub const MAX_CREATE_MODEL_ENTRIES: usize = 20_000;
/// IDs accepted in one `change_section` call.
pub const MAX_ELEMENT_IDS: usize = 20_000;

pub fn validate_action(action: &BuildAction) -> Result<(), AppError> {
    validate_load_values(action)?;
    match action {
        BuildAction::CreateBeam { span, .. } => {
            require_positive(*span, "span")?;
        }
        BuildAction::CreateCantilever { length, .. } => {
            require_positive(*length, "length")?;
        }
        BuildAction::CreateContinuousBeam { spans, .. } => {
            if spans.is_empty() {
                return Err(AppError::BadRequest("spans must not be empty".into()));
            }
            if spans.len() > MAX_SPANS {
                return Err(AppError::BadRequest(format!("at most {MAX_SPANS} spans")));
            }
            for (i, s) in spans.iter().enumerate() {
                require_positive(*s, &format!("spans[{i}]"))?;
            }
        }
        BuildAction::CreatePortalFrame { width, height, .. } => {
            require_positive(*width, "width")?;
            require_positive(*height, "height")?;
        }
        BuildAction::CreateTruss {
            span,
            height,
            n_panels,
            ..
        } => {
            require_positive(*span, "span")?;
            require_positive(*height, "height")?;
            if let Some(n) = n_panels {
                if *n < 2 {
                    return Err(AppError::BadRequest(
                        "n_panels must be >= 2".into(),
                    ));
                }
                require_at_most(*n, MAX_PANELS, "n_panels")?;
            }
        }
        BuildAction::CreateMultiStoryFrame {
            n_bays,
            n_floors,
            bay_width,
            floor_height,
            ..
        } => {
            if *n_bays < 1 {
                return Err(AppError::BadRequest("n_bays must be >= 1".into()));
            }
            if *n_floors < 1 {
                return Err(AppError::BadRequest("n_floors must be >= 1".into()));
            }
            require_at_most(*n_bays, MAX_BAYS, "n_bays")?;
            require_at_most(*n_floors, MAX_FLOORS, "n_floors")?;
            require_positive(*bay_width, "bay_width")?;
            require_positive(*floor_height, "floor_height")?;
        }
        BuildAction::CreateMultiStoryFrame3d {
            n_bays_x,
            n_bays_z,
            n_floors,
            bay_width,
            floor_height,
            ..
        } => {
            if *n_bays_x < 1 {
                return Err(AppError::BadRequest("n_bays_x must be >= 1".into()));
            }
            if *n_bays_z < 1 {
                return Err(AppError::BadRequest("n_bays_z must be >= 1".into()));
            }
            if *n_floors < 1 {
                return Err(AppError::BadRequest("n_floors must be >= 1".into()));
            }
            require_at_most(*n_bays_x, MAX_BAYS, "n_bays_x")?;
            require_at_most(*n_bays_z, MAX_BAYS, "n_bays_z")?;
            require_at_most(*n_floors, MAX_FLOORS, "n_floors")?;
            let nodes = (u64::from(*n_bays_x) + 1) * (u64::from(*n_bays_z) + 1) * (u64::from(*n_floors) + 1);
            if nodes > MAX_GENERATED_NODES {
                return Err(AppError::BadRequest(format!(
                    "frame would have {nodes} nodes (max {MAX_GENERATED_NODES})"
                )));
            }
            require_positive(*bay_width, "bay_width")?;
            require_positive(*floor_height, "floor_height")?;
        }
        BuildAction::CreatePortalFrame3d {
            width,
            depth,
            height,
            ..
        } => {
            require_positive(*width, "width")?;
            require_positive(*depth, "depth")?;
            require_positive(*height, "height")?;
        }
        // Edit action validation
        BuildAction::AddBay { width, .. } => {
            require_positive(*width, "width")?;
        }
        BuildAction::AddStory { height, .. } => {
            require_positive(*height, "height")?;
        }
        BuildAction::ChangeSection { section, element_ids, .. } => {
            if section.is_empty() {
                return Err(AppError::BadRequest("section must not be empty".into()));
            }
            if element_ids.as_ref().is_some_and(|ids| ids.len() > MAX_ELEMENT_IDS) {
                return Err(AppError::BadRequest(format!(
                    "at most {MAX_ELEMENT_IDS} element_ids"
                )));
            }
        }
        BuildAction::AddLateralLoads { h } => {
            if !h.is_finite() {
                return Err(AppError::BadRequest("h must be a finite number".into()));
            }
        }
        BuildAction::SetAllSupports { .. }
        | BuildAction::SetAllBeamLoads { .. }
        | BuildAction::AddDistributedLoad { .. }
        | BuildAction::AddNodalLoad { .. }
        | BuildAction::DeleteElement { .. }
        | BuildAction::DeleteLoad { .. } => {}
        BuildAction::CreateModel {
            nodes, elements, materials, sections, supports, ..
        } => {
            if nodes.is_empty() {
                return Err(AppError::BadRequest("create_model: at least 1 node required".into()));
            }
            if elements.is_empty() {
                return Err(AppError::BadRequest("create_model: at least 1 element required".into()));
            }
            if materials.is_empty() {
                return Err(AppError::BadRequest("create_model: at least 1 material required".into()));
            }
            if sections.is_empty() {
                return Err(AppError::BadRequest("create_model: at least 1 section required".into()));
            }
            if supports.is_empty() {
                return Err(AppError::BadRequest("create_model: at least 1 support required".into()));
            }
            let loads_len = match action {
                BuildAction::CreateModel { loads: Some(l), .. } => l.len(),
                _ => 0,
            };
            for (name, len) in [
                ("nodes", nodes.len()),
                ("elements", elements.len()),
                ("materials", materials.len()),
                ("sections", sections.len()),
                ("supports", supports.len()),
                ("loads", loads_len),
            ] {
                if len > MAX_CREATE_MODEL_ENTRIES {
                    return Err(AppError::BadRequest(format!(
                        "create_model: at most {MAX_CREATE_MODEL_ENTRIES} {name}"
                    )));
                }
            }
        }
        BuildAction::Unsupported { .. } => {}
    }
    Ok(())
}

fn require_at_most(val: u32, max: u32, name: &str) -> Result<(), AppError> {
    if val > max {
        return Err(AppError::BadRequest(format!("{name} must be <= {max}, got {val}")));
    }
    Ok(())
}

/// Load magnitudes must be finite: a NaN or infinite load reaches the solver
/// and produces results that look like numbers but mean nothing.
fn validate_load_values(action: &BuildAction) -> Result<(), AppError> {
    let values: Vec<(&str, Option<f64>)> = match action {
        BuildAction::CreateBeam { q, p_tip, .. } | BuildAction::CreateCantilever { q, p_tip, .. } => {
            vec![("q", *q), ("p_tip", *p_tip)]
        }
        BuildAction::CreateContinuousBeam { q, .. } => vec![("q", *q)],
        BuildAction::CreatePortalFrame { q_beam, h_lateral, .. }
        | BuildAction::CreateMultiStoryFrame { q_beam, h_lateral, .. }
        | BuildAction::CreateMultiStoryFrame3d { q_beam, h_lateral, .. } => {
            vec![("q_beam", *q_beam), ("h_lateral", *h_lateral)]
        }
        BuildAction::CreatePortalFrame3d { q_beam, .. } => vec![("q_beam", *q_beam)],
        BuildAction::CreateTruss { top_load, .. } => vec![("top_load", *top_load)],
        BuildAction::SetAllBeamLoads { q } | BuildAction::AddDistributedLoad { q, .. } => {
            vec![("q", Some(*q))]
        }
        BuildAction::AddNodalLoad { fx, fz, my, .. } => vec![("fx", *fx), ("fz", *fz), ("my", *my)],
        _ => vec![],
    };
    for (name, v) in values {
        if let Some(v) = v {
            if !v.is_finite() {
                return Err(AppError::BadRequest(format!("{name} must be a finite number")));
            }
        }
    }
    Ok(())
}

fn require_positive(val: f64, name: &str) -> Result<(), AppError> {
    if val <= 0.0 || !val.is_finite() {
        return Err(AppError::BadRequest(format!(
            "{name} must be a positive number, got {val}"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn validate_json(json: &str) -> Result<(), AppError> {
        let resp: ActionResponse = serde_json::from_str(json).unwrap();
        validate_action(&resp.action)
    }

    #[test]
    fn oversized_generators_are_rejected() {
        assert!(validate_json(r#"{"action":"create_multi_story_frame_3d","params":{"n_bays_x":10,"n_bays_z":10,"n_floors":20,"bay_width":6,"floor_height":3},"interpretation":""}"#).is_ok());
        assert!(validate_json(r#"{"action":"create_multi_story_frame_3d","params":{"n_bays_x":100,"n_bays_z":100,"n_floors":200,"bay_width":6,"floor_height":3},"interpretation":""}"#).is_err());
        assert!(validate_json(r#"{"action":"create_multi_story_frame","params":{"n_bays":4000000000,"n_floors":3,"bay_width":6,"floor_height":3},"interpretation":""}"#).is_err());
        assert!(validate_json(r#"{"action":"create_truss","params":{"span":10,"height":2,"n_panels":4000000000},"interpretation":""}"#).is_err());
        let spans = vec!["1"; MAX_SPANS + 1].join(",");
        assert!(validate_json(&format!(r#"{{"action":"create_continuous_beam","params":{{"spans":[{spans}]}},"interpretation":""}}"#)).is_err());
    }

    #[test]
    fn non_finite_loads_are_rejected() {
        let a = BuildAction::SetAllBeamLoads { q: f64::NAN };
        assert!(validate_action(&a).is_err());
        let a = BuildAction::AddNodalLoad { node_id: 1, fx: Some(f64::INFINITY), fz: None, my: None };
        assert!(validate_action(&a).is_err());
        let a = BuildAction::AddNodalLoad { node_id: 1, fx: Some(1.0), fz: Some(-2.0), my: None };
        assert!(validate_action(&a).is_ok());
    }

    #[test]
    fn parse_create_beam_action() {
        let json = r#"{"action":"create_beam","params":{"span":6,"q":-10},"interpretation":"test"}"#;
        let resp: ActionResponse = serde_json::from_str(json).unwrap();
        assert!(matches!(resp.action, BuildAction::CreateBeam { span, .. } if (span - 6.0).abs() < 1e-9));
    }

    #[test]
    fn parse_create_portal_frame() {
        let json = r#"{"action":"create_portal_frame","params":{"width":8,"height":5,"q_beam":-15},"interpretation":"test"}"#;
        let resp: ActionResponse = serde_json::from_str(json).unwrap();
        assert!(matches!(resp.action, BuildAction::CreatePortalFrame { .. }));
    }

    #[test]
    fn parse_unsupported_action() {
        let json = r#"{"action":"unsupported","params":{},"interpretation":"I can build beams..."}"#;
        let resp: ActionResponse = serde_json::from_str(json).unwrap();
        assert!(matches!(resp.action, BuildAction::Unsupported { .. }));
    }

    #[test]
    fn parse_add_bay_action() {
        let json = r#"{"action":"add_bay","params":{"width":6},"interpretation":"Adding bay"}"#;
        let resp: ActionResponse = serde_json::from_str(json).unwrap();
        assert!(matches!(resp.action, BuildAction::AddBay { width, .. } if (width - 6.0).abs() < 1e-9));
        assert!(resp.action.is_edit());
    }

    #[test]
    fn parse_add_story_action() {
        let json = r#"{"action":"add_story","params":{"height":3.5},"interpretation":"Adding floor"}"#;
        let resp: ActionResponse = serde_json::from_str(json).unwrap();
        assert!(matches!(resp.action, BuildAction::AddStory { .. }));
        assert!(resp.action.is_edit());
    }

    #[test]
    fn parse_change_section_action() {
        let json = r#"{"action":"change_section","params":{"section":"HEB 400","element_filter":"column"},"interpretation":"Changing columns"}"#;
        let resp: ActionResponse = serde_json::from_str(json).unwrap();
        assert!(matches!(resp.action, BuildAction::ChangeSection { .. }));
    }

    #[test]
    fn create_actions_are_not_edit() {
        let action = BuildAction::CreateBeam {
            span: 6.0,
            q: None,
            support_left: None,
            support_right: None,
            section: None,
            p_tip: None,
        };
        assert!(!action.is_edit());
    }

    #[test]
    fn validate_negative_span_fails() {
        let action = BuildAction::CreateBeam {
            span: -5.0,
            q: None,
            support_left: None,
            support_right: None,
            section: None,
            p_tip: None,
        };
        assert!(validate_action(&action).is_err());
    }

    #[test]
    fn validate_empty_spans_fails() {
        let action = BuildAction::CreateContinuousBeam {
            spans: vec![],
            q: None,
            section: None,
        };
        assert!(validate_action(&action).is_err());
    }

    #[test]
    fn validate_truss_one_panel_fails() {
        let action = BuildAction::CreateTruss {
            span: 12.0,
            height: 2.0,
            n_panels: Some(1),
            pattern: None,
            top_load: None,
        };
        assert!(validate_action(&action).is_err());
    }
}
