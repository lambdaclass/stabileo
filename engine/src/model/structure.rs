use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::{
    Element, ElementType, Frame2D, Truss2D,
    Load, Material, Node, Section, Support,
};

/// Element container that can hold different element types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ElementData {
    Frame(Frame2D),
    Truss(Truss2D),
}

impl ElementData {
    pub fn id(&self) -> usize {
        match self {
            ElementData::Frame(f) => f.id,
            ElementData::Truss(t) => t.id,
        }
    }

    pub fn node_ids(&self) -> (usize, usize) {
        match self {
            ElementData::Frame(f) => f.node_ids(),
            ElementData::Truss(t) => t.node_ids(),
        }
    }

    pub fn material_id(&self) -> usize {
        match self {
            ElementData::Frame(f) => f.material_id(),
            ElementData::Truss(t) => t.material_id(),
        }
    }

    pub fn section_id(&self) -> usize {
        match self {
            ElementData::Frame(f) => f.section_id(),
            ElementData::Truss(t) => t.section_id(),
        }
    }

    pub fn element_type(&self) -> ElementType {
        match self {
            ElementData::Frame(_) => ElementType::Frame2D,
            ElementData::Truss(_) => ElementType::Truss2D,
        }
    }

    pub fn dofs_per_node(&self) -> usize {
        match self {
            ElementData::Frame(_) => 3,
            ElementData::Truss(_) => 2,
        }
    }

    pub fn as_frame(&self) -> Option<&Frame2D> {
        match self {
            ElementData::Frame(f) => Some(f),
            _ => None,
        }
    }

    pub fn as_truss(&self) -> Option<&Truss2D> {
        match self {
            ElementData::Truss(t) => Some(t),
            _ => None,
        }
    }
}

/// Main structure container
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Structure {
    pub name: String,
    pub nodes: HashMap<usize, Node>,
    pub materials: HashMap<usize, Material>,
    pub sections: HashMap<usize, Section>,
    pub elements: HashMap<usize, ElementData>,
    pub supports: HashMap<usize, Support>,
    pub loads: Vec<Load>,

    // Counters for auto-incrementing IDs
    next_node_id: usize,
    next_material_id: usize,
    next_section_id: usize,
    next_element_id: usize,
    next_support_id: usize,
    next_load_id: usize,
}

impl Default for Structure {
    fn default() -> Self {
        Self::new("Untitled")
    }
}

impl Structure {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            nodes: HashMap::new(),
            materials: HashMap::new(),
            sections: HashMap::new(),
            elements: HashMap::new(),
            supports: HashMap::new(),
            loads: Vec::new(),
            next_node_id: 1,
            next_material_id: 1,
            next_section_id: 1,
            next_element_id: 1,
            next_support_id: 1,
            next_load_id: 1,
        }
    }

    // =========== Nodes ===========

    pub fn add_node(&mut self, x: f64, y: f64) -> usize {
        let id = self.next_node_id;
        self.nodes.insert(id, Node::new(id, x, y));
        self.next_node_id += 1;
        id
    }

    pub fn add_node_with_id(&mut self, id: usize, x: f64, y: f64) {
        self.nodes.insert(id, Node::new(id, x, y));
        if id >= self.next_node_id {
            self.next_node_id = id + 1;
        }
    }

    pub fn get_node(&self, id: usize) -> Option<&Node> {
        self.nodes.get(&id)
    }

    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    // =========== Materials ===========

    pub fn add_material(&mut self, name: &str, e: f64, nu: f64, rho: f64) -> usize {
        let id = self.next_material_id;
        self.materials.insert(id, Material::new(id, name, e, nu, rho));
        self.next_material_id += 1;
        id
    }

    pub fn add_steel(&mut self) -> usize {
        let id = self.next_material_id;
        self.materials.insert(id, Material::steel(id));
        self.next_material_id += 1;
        id
    }

    pub fn add_concrete(&mut self) -> usize {
        let id = self.next_material_id;
        self.materials.insert(id, Material::concrete(id));
        self.next_material_id += 1;
        id
    }

    pub fn get_material(&self, id: usize) -> Option<&Material> {
        self.materials.get(&id)
    }

    // =========== Sections ===========

    pub fn add_section(&mut self, name: &str, a: f64, iz: f64) -> usize {
        let id = self.next_section_id;
        self.sections.insert(id, Section::new(id, name, a, iz));
        self.next_section_id += 1;
        id
    }

    pub fn add_rectangular_section(&mut self, name: &str, b: f64, h: f64) -> usize {
        let id = self.next_section_id;
        self.sections.insert(id, Section::rectangular(id, name, b, h));
        self.next_section_id += 1;
        id
    }

    pub fn get_section(&self, id: usize) -> Option<&Section> {
        self.sections.get(&id)
    }

    // =========== Elements ===========

    pub fn add_frame(&mut self, node_i: usize, node_j: usize, mat_id: usize, sec_id: usize) -> usize {
        let id = self.next_element_id;
        let frame = Frame2D::new(id, node_i, node_j, mat_id, sec_id);
        self.elements.insert(id, ElementData::Frame(frame));
        self.next_element_id += 1;
        id
    }

    pub fn add_frame_with_hinge(
        &mut self,
        node_i: usize,
        node_j: usize,
        mat_id: usize,
        sec_id: usize,
        hinge_start: bool,
        hinge_end: bool,
    ) -> usize {
        let id = self.next_element_id;
        let mut frame = Frame2D::new(id, node_i, node_j, mat_id, sec_id);
        frame.hinges = (hinge_start, hinge_end);
        self.elements.insert(id, ElementData::Frame(frame));
        self.next_element_id += 1;
        id
    }

    pub fn add_truss(&mut self, node_i: usize, node_j: usize, mat_id: usize, sec_id: usize) -> usize {
        let id = self.next_element_id;
        let truss = Truss2D::new(id, node_i, node_j, mat_id, sec_id);
        self.elements.insert(id, ElementData::Truss(truss));
        self.next_element_id += 1;
        id
    }

    pub fn get_element(&self, id: usize) -> Option<&ElementData> {
        self.elements.get(&id)
    }

    pub fn element_count(&self) -> usize {
        self.elements.len()
    }

    /// Get element length
    pub fn element_length(&self, elem_id: usize) -> Option<f64> {
        let elem = self.elements.get(&elem_id)?;
        let (ni, nj) = elem.node_ids();
        let node_i = self.nodes.get(&ni)?;
        let node_j = self.nodes.get(&nj)?;
        Some(node_i.distance_to(node_j))
    }

    /// Get element angle (radians)
    pub fn element_angle(&self, elem_id: usize) -> Option<f64> {
        let elem = self.elements.get(&elem_id)?;
        let (ni, nj) = elem.node_ids();
        let node_i = self.nodes.get(&ni)?;
        let node_j = self.nodes.get(&nj)?;
        Some(node_i.angle_to(node_j))
    }

    // =========== Supports ===========

    pub fn add_fixed_support(&mut self, node_id: usize) -> usize {
        let id = self.next_support_id;
        self.supports.insert(id, Support::fixed(id, node_id));
        self.next_support_id += 1;
        id
    }

    pub fn add_pinned_support(&mut self, node_id: usize) -> usize {
        let id = self.next_support_id;
        self.supports.insert(id, Support::pinned(id, node_id));
        self.next_support_id += 1;
        id
    }

    pub fn add_roller_x(&mut self, node_id: usize) -> usize {
        let id = self.next_support_id;
        self.supports.insert(id, Support::roller_x(id, node_id));
        self.next_support_id += 1;
        id
    }

    pub fn add_roller_y(&mut self, node_id: usize) -> usize {
        let id = self.next_support_id;
        self.supports.insert(id, Support::roller_y(id, node_id));
        self.next_support_id += 1;
        id
    }

    pub fn get_support_at_node(&self, node_id: usize) -> Option<&Support> {
        self.supports.values().find(|s| s.node_id == node_id)
    }

    // =========== Loads ===========

    pub fn add_nodal_load(&mut self, node_id: usize, fx: f64, fy: f64, mz: f64) -> usize {
        use super::NodalLoad;
        let id = self.next_load_id;
        self.loads.push(Load::Nodal(NodalLoad::new(id, node_id, fx, fy, mz)));
        self.next_load_id += 1;
        id
    }

    pub fn add_distributed_load(&mut self, element_id: usize, q: f64) -> usize {
        use super::DistributedLoad;
        let id = self.next_load_id;
        self.loads.push(Load::Distributed(DistributedLoad::uniform(id, element_id, q)));
        self.next_load_id += 1;
        id
    }

    pub fn add_point_load(&mut self, element_id: usize, a: f64, p: f64) -> usize {
        use super::PointLoad;
        let id = self.next_load_id;
        self.loads.push(Load::Point(PointLoad::new(id, element_id, a, p)));
        self.next_load_id += 1;
        id
    }

    // =========== Validation ===========

    /// Check if structure is valid for analysis
    pub fn validate(&self) -> Result<(), String> {
        // Check we have nodes
        if self.nodes.is_empty() {
            return Err("No nodes defined".to_string());
        }

        // Check we have elements
        if self.elements.is_empty() {
            return Err("No elements defined".to_string());
        }

        // Check all elements reference valid nodes
        for (id, elem) in &self.elements {
            let (ni, nj) = elem.node_ids();
            if !self.nodes.contains_key(&ni) {
                return Err(format!("Element {} references invalid node {}", id, ni));
            }
            if !self.nodes.contains_key(&nj) {
                return Err(format!("Element {} references invalid node {}", id, nj));
            }
        }

        // Check all elements have valid materials and sections
        for (id, elem) in &self.elements {
            if !self.materials.contains_key(&elem.material_id()) {
                return Err(format!("Element {} references invalid material {}", id, elem.material_id()));
            }
            if !self.sections.contains_key(&elem.section_id()) {
                return Err(format!("Element {} references invalid section {}", id, elem.section_id()));
            }
        }

        // Check we have at least some supports
        if self.supports.is_empty() {
            return Err("No supports defined - structure is unstable".to_string());
        }

        Ok(())
    }

    /// Count total DOFs (for frames: 3 per node, for pure truss: 2 per node)
    pub fn total_dofs(&self) -> usize {
        // If any frame element exists, use 3 DOFs per node
        let has_frames = self.elements.values().any(|e| matches!(e, ElementData::Frame(_)));
        let dofs_per_node = if has_frames { 3 } else { 2 };
        self.nodes.len() * dofs_per_node
    }

    /// Count restrained DOFs
    pub fn restrained_dofs(&self) -> usize {
        self.supports.values().map(|s| s.restrained_count()).sum()
    }

    /// Check static determinacy (simplified)
    pub fn is_statically_determinate(&self) -> Option<bool> {
        let has_frames = self.elements.values().any(|e| matches!(e, ElementData::Frame(_)));

        if has_frames {
            // For frames: 3n = 3m + r (approximately)
            let n = self.nodes.len();
            let m = self.elements.len();
            let r = self.restrained_dofs();
            Some(3 * n == 3 * m + r)
        } else {
            // For trusses: 2n = m + r
            let n = self.nodes.len();
            let m = self.elements.len();
            let r = self.restrained_dofs();
            Some(2 * n == m + r)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_beam() {
        let mut s = Structure::new("Simple Beam");

        // Add nodes
        let n1 = s.add_node(0.0, 0.0);
        let n2 = s.add_node(6.0, 0.0);

        // Add material and section
        let mat = s.add_steel();
        let sec = s.add_rectangular_section("Beam", 0.3, 0.5);

        // Add element
        let _e1 = s.add_frame(n1, n2, mat, sec);

        // Add supports
        s.add_pinned_support(n1);
        s.add_roller_x(n2);

        assert!(s.validate().is_ok());
        assert_eq!(s.node_count(), 2);
        assert_eq!(s.element_count(), 1);
    }

    #[test]
    fn test_element_geometry() {
        let mut s = Structure::new("Test");
        let n1 = s.add_node(0.0, 0.0);
        let n2 = s.add_node(3.0, 4.0);
        let mat = s.add_steel();
        let sec = s.add_section("Test", 0.01, 0.0001);
        let e1 = s.add_frame(n1, n2, mat, sec);

        assert!((s.element_length(e1).unwrap() - 5.0).abs() < 1e-10);
    }
}
