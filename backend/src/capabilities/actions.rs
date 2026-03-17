use serde::Deserialize;

use crate::error::AppError;

#[derive(Debug, Deserialize)]
#[serde(tag = "action", content = "params", rename_all = "snake_case")]
pub enum BuildAction {
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
    Unsupported {},
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
