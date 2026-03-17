use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct SectionProps {
    pub name: &'static str,
    pub a: f64,
    pub iz: f64,
    pub iy: f64,
    pub j: f64,
    pub h: f64,
    pub b: f64,
    pub tw: f64,
    pub tf: f64,
    pub shape: &'static str,
}

/// Lookup a steel section by name (case-insensitive, whitespace-normalized).
/// Returns `None` if the profile is not in our catalog.
pub fn lookup_section(name: &str) -> Option<&'static SectionProps> {
    let normalized = name
        .trim()
        .to_uppercase()
        .replace("  ", " ");
    SECTIONS.iter().find(|s| s.name.to_uppercase() == normalized)
}

pub fn default_section() -> &'static SectionProps {
    // IPE 300
    &SECTIONS[1]
}

pub fn default_column_section() -> &'static SectionProps {
    // HEB 300
    &SECTIONS[6]
}

pub fn truss_section() -> &'static SectionProps {
    // L 80x80x8
    &SECTIONS[11]
}

/// Default material: Steel A36
/// E = 200000 MPa, nu = 0.3, rho = 78.5 kN/m³, fy = 250 MPa
pub fn default_material() -> serde_json::Value {
    serde_json::json!({
        "id": 1,
        "name": "Steel A36",
        "e": 200000,
        "nu": 0.3,
        "rho": 78.5,
        "fy": 250
    })
}

// All values in SI: m², m⁴, m
// Converted from cm²→m² (/1e4), cm⁴→m⁴ (/1e8), mm→m (/1e3)
static SECTIONS: [SectionProps; 12] = [
    // IPE 200
    SectionProps {
        name: "IPE 200",
        a: 28.5e-4,
        iz: 1943e-8,
        iy: 142e-8,
        j: 7.0e-8,
        h: 0.200,
        b: 0.100,
        tw: 0.0056,
        tf: 0.0085,
        shape: "I",
    },
    // IPE 300
    SectionProps {
        name: "IPE 300",
        a: 53.8e-4,
        iz: 8356e-8,
        iy: 604e-8,
        j: 2.0e-7,
        h: 0.300,
        b: 0.150,
        tw: 0.0071,
        tf: 0.0107,
        shape: "I",
    },
    // IPE 400
    SectionProps {
        name: "IPE 400",
        a: 84.5e-4,
        iz: 23130e-8,
        iy: 1318e-8,
        j: 5.1e-7,
        h: 0.400,
        b: 0.180,
        tw: 0.0086,
        tf: 0.0135,
        shape: "I",
    },
    // IPE 500
    SectionProps {
        name: "IPE 500",
        a: 116e-4,
        iz: 48200e-8,
        iy: 2142e-8,
        j: 1.07e-6,
        h: 0.500,
        b: 0.200,
        tw: 0.0102,
        tf: 0.0160,
        shape: "I",
    },
    // IPE 600
    SectionProps {
        name: "IPE 600",
        a: 156e-4,
        iz: 92080e-8,
        iy: 3387e-8,
        j: 2.09e-6,
        h: 0.600,
        b: 0.220,
        tw: 0.0120,
        tf: 0.0190,
        shape: "I",
    },
    // HEB 200
    SectionProps {
        name: "HEB 200",
        a: 78.1e-4,
        iz: 5696e-8,
        iy: 2003e-8,
        j: 5.9e-7,
        h: 0.200,
        b: 0.200,
        tw: 0.009,
        tf: 0.015,
        shape: "H",
    },
    // HEB 300
    SectionProps {
        name: "HEB 300",
        a: 149e-4,
        iz: 25170e-8,
        iy: 8563e-8,
        j: 1.85e-6,
        h: 0.300,
        b: 0.300,
        tw: 0.011,
        tf: 0.019,
        shape: "H",
    },
    // HEB 400
    SectionProps {
        name: "HEB 400",
        a: 198e-4,
        iz: 57680e-8,
        iy: 10820e-8,
        j: 3.68e-6,
        h: 0.400,
        b: 0.300,
        tw: 0.0135,
        tf: 0.024,
        shape: "H",
    },
    // HEA 200
    SectionProps {
        name: "HEA 200",
        a: 53.8e-4,
        iz: 3692e-8,
        iy: 1336e-8,
        j: 2.1e-7,
        h: 0.190,
        b: 0.200,
        tw: 0.0065,
        tf: 0.010,
        shape: "I",
    },
    // HEA 300
    SectionProps {
        name: "HEA 300",
        a: 113e-4,
        iz: 18260e-8,
        iy: 6310e-8,
        j: 8.5e-7,
        h: 0.290,
        b: 0.300,
        tw: 0.0085,
        tf: 0.014,
        shape: "H",
    },
    // UPN 200
    SectionProps {
        name: "UPN 200",
        a: 32.2e-4,
        iz: 1910e-8,
        iy: 148e-8,
        j: 1.2e-7,
        h: 0.200,
        b: 0.075,
        tw: 0.0085,
        tf: 0.0115,
        shape: "U",
    },
    // L 80x80x8
    SectionProps {
        name: "L 80x80x8",
        a: 12.3e-4,
        iz: 80e-8,
        iy: 80e-8,
        j: 2.6e-8,
        h: 0.080,
        b: 0.080,
        tw: 0.008,
        tf: 0.008,
        shape: "L",
    },
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lookup_known_section() {
        let s = lookup_section("IPE 300").unwrap();
        assert_eq!(s.name, "IPE 300");
        assert!((s.a - 53.8e-4).abs() < 1e-10);
    }

    #[test]
    fn lookup_case_insensitive() {
        assert!(lookup_section("ipe 300").is_some());
        assert!(lookup_section("Heb 200").is_some());
    }

    #[test]
    fn lookup_unknown_returns_none() {
        assert!(lookup_section("W 12x26").is_none());
    }
}
