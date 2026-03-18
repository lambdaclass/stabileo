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
        #[serde(alias = "fz")]
        fy: Option<f64>,
        #[serde(default)]
        #[serde(alias = "my")]
        mz: Option<f64>,
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

pub fn validate_action(action: &BuildAction) -> Result<(), AppError> {
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
        BuildAction::ChangeSection { section, .. } => {
            if section.is_empty() {
                return Err(AppError::BadRequest("section must not be empty".into()));
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
        }
        BuildAction::Unsupported { .. } => {}
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
