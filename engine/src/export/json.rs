use serde::{Deserialize, Serialize};
use crate::model::Structure;
use crate::results::AnalysisResults;

/// Export structure to JSON string
pub fn export_structure(structure: &Structure) -> Result<String, String> {
    serde_json::to_string_pretty(structure)
        .map_err(|e| format!("Failed to serialize structure: {}", e))
}

/// Import structure from JSON string
pub fn import_structure(json: &str) -> Result<Structure, String> {
    serde_json::from_str(json)
        .map_err(|e| format!("Failed to parse structure JSON: {}", e))
}

/// Export results to JSON string
pub fn export_results(results: &AnalysisResults) -> Result<String, String> {
    serde_json::to_string_pretty(results)
        .map_err(|e| format!("Failed to serialize results: {}", e))
}

/// Complete project (structure + results)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub structure: Structure,
    pub results: Option<AnalysisResults>,
}

impl Project {
    pub fn new(structure: Structure) -> Self {
        Self {
            structure,
            results: None,
        }
    }

    pub fn with_results(structure: Structure, results: AnalysisResults) -> Self {
        Self {
            structure,
            results: Some(results),
        }
    }

    pub fn to_json(&self) -> Result<String, String> {
        serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize project: {}", e))
    }

    pub fn from_json(json: &str) -> Result<Self, String> {
        serde_json::from_str(json)
            .map_err(|e| format!("Failed to parse project JSON: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_roundtrip() {
        let mut s = Structure::new("Test");
        s.add_node(0.0, 0.0);
        s.add_node(6.0, 0.0);
        s.add_steel();
        s.add_rectangular_section("Beam", 0.3, 0.5);

        let json = export_structure(&s).unwrap();
        let s2 = import_structure(&json).unwrap();

        assert_eq!(s.node_count(), s2.node_count());
    }
}
