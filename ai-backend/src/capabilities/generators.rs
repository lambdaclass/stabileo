use serde_json::{json, Value};

use super::actions::BuildAction;
use super::sections::{
    default_column_section, default_material, default_section, lookup_section, truss_section,
    SectionProps,
};
use crate::error::AppError;

// ---- Builder state (structural model builder for AI capabilities) ----

struct Builder {
    node_id: u32,
    elem_id: u32,
    support_id: u32,
    load_id: u32,
    nodes: Vec<Value>,
    elements: Vec<Value>,
    supports: Vec<Value>,
    loads: Vec<Value>,
    materials: Vec<Value>,
    sections: Vec<Value>,
    analysis_mode: &'static str,
}

impl Builder {
    fn new_2d(beam_section: &SectionProps) -> Self {
        Self {
            node_id: 1,
            elem_id: 1,
            support_id: 1,
            load_id: 1,
            nodes: Vec::new(),
            elements: Vec::new(),
            supports: Vec::new(),
            loads: Vec::new(),
            materials: vec![default_material()],
            sections: vec![section_to_json(1, beam_section)],
            analysis_mode: "2d",
        }
    }

    fn new_3d(beam_section: &SectionProps, col_section: &SectionProps) -> Self {
        Self {
            node_id: 1,
            elem_id: 1,
            support_id: 1,
            load_id: 1,
            nodes: Vec::new(),
            elements: Vec::new(),
            supports: Vec::new(),
            loads: Vec::new(),
            materials: vec![default_material()],
            sections: vec![
                section_to_json(1, col_section),
                section_to_json(2, beam_section),
            ],
            analysis_mode: "3d",
        }
    }

    fn add_node_2d(&mut self, x: f64, y: f64) -> u32 {
        let id = self.node_id;
        self.node_id += 1;
        self.nodes.push(json!([id, {"id": id, "x": x, "y": y}]));
        id
    }

    fn add_node_3d(&mut self, x: f64, y: f64, z: f64) -> u32 {
        let id = self.node_id;
        self.node_id += 1;
        self.nodes
            .push(json!([id, {"id": id, "x": x, "y": y, "z": z}]));
        id
    }

    fn add_element(
        &mut self,
        node_i: u32,
        node_j: u32,
        elem_type: &str,
        section_id: u32,
    ) -> u32 {
        let id = self.elem_id;
        self.elem_id += 1;
        self.elements.push(json!([id, {
            "id": id,
            "type": elem_type,
            "nodeI": node_i,
            "nodeJ": node_j,
            "materialId": 1,
            "sectionId": section_id,
            "hingeStart": false,
            "hingeEnd": false
        }]));
        id
    }

    fn add_frame(&mut self, node_i: u32, node_j: u32) -> u32 {
        self.add_element(node_i, node_j, "frame", 1)
    }

    fn add_frame_sec(&mut self, node_i: u32, node_j: u32, section_id: u32) -> u32 {
        self.add_element(node_i, node_j, "frame", section_id)
    }

    fn add_truss(&mut self, node_i: u32, node_j: u32, section_id: u32) -> u32 {
        self.add_element(node_i, node_j, "truss", section_id)
    }

    fn add_support(&mut self, node_id: u32, support_type: &str) {
        let id = self.support_id;
        self.support_id += 1;
        self.supports
            .push(json!([id, {"id": id, "nodeId": node_id, "type": support_type}]));
    }

    fn add_distributed_load(&mut self, element_id: u32, q: f64) {
        let id = self.load_id;
        self.load_id += 1;
        if self.analysis_mode == "3d" {
            self.loads.push(json!({
                "type": "distributed3d",
                "data": {"id": id, "elementId": element_id, "qYI": q, "qYJ": q, "qZI": 0, "qZJ": 0}
            }));
        } else {
            self.loads.push(json!({
                "type": "distributed",
                "data": {"id": id, "elementId": element_id, "qI": q, "qJ": q}
            }));
        }
    }

    fn add_nodal_load_2d(&mut self, node_id: u32, fx: f64, fz: f64) {
        let id = self.load_id;
        self.load_id += 1;
        self.loads.push(json!({
            "type": "nodal",
            "data": {"id": id, "nodeId": node_id, "fx": fx, "fz": fz, "my": 0}
        }));
    }

    fn add_nodal_load_3d(&mut self, node_id: u32, fx: f64, fy: f64, fz: f64) {
        let id = self.load_id;
        self.load_id += 1;
        self.loads.push(json!({
            "type": "nodal3d",
            "data": {"id": id, "nodeId": node_id, "fx": fx, "fy": fy, "fz": fz, "mx": 0, "my": 0, "mz": 0}
        }));
    }

    fn to_snapshot(self) -> Value {
        let n_sections = self.sections.len() as u32;
        json!({
            "analysisMode": self.analysis_mode,
            "nodes": self.nodes,
            "materials": [[1, self.materials[0].clone()]],
            "sections": self.sections,
            "elements": self.elements,
            "supports": self.supports,
            "loads": self.loads,
            "nextId": {
                "node": self.node_id,
                "material": 2,
                "section": n_sections + 1,
                "element": self.elem_id,
                "support": self.support_id,
                "load": self.load_id,
            }
        })
    }
}

fn section_to_json(id: u32, s: &SectionProps) -> Value {
    json!([id, {
        "id": id,
        "name": s.name,
        "a": s.a,
        "iz": s.iz,
        "iy": s.iy,
        "j": s.j,
        "h": s.h,
        "b": s.b,
        "tw": s.tw,
        "tf": s.tf,
        "shape": s.shape
    }])
}

fn resolve_section(name: &Option<String>) -> &'static SectionProps {
    name.as_deref()
        .and_then(lookup_section)
        .unwrap_or_else(default_section)
}

fn resolve_support(name: &Option<String>, fallback: &str) -> String {
    name.as_deref().unwrap_or(fallback).to_string()
}

// ---- Generators ----

fn generate_beam(
    span: f64,
    q: Option<f64>,
    support_left: &Option<String>,
    support_right: &Option<String>,
    section: &Option<String>,
    p_tip: Option<f64>,
) -> Value {
    let sec = resolve_section(section);
    let mut b = Builder::new_2d(sec);

    let n1 = b.add_node_2d(0.0, 0.0);
    let n2 = b.add_node_2d(span, 0.0);

    let eid = b.add_frame(n1, n2);

    b.add_support(n1, &resolve_support(support_left, "pinned"));
    b.add_support(n2, &resolve_support(support_right, "rollerX"));

    if let Some(q_val) = q {
        if q_val != 0.0 {
            b.add_distributed_load(eid, q_val);
        }
    }

    if let Some(p) = p_tip {
        if p != 0.0 {
            b.add_nodal_load_2d(n2, 0.0, p);
        }
    }

    b.to_snapshot()
}

fn generate_cantilever(
    length: f64,
    p_tip: Option<f64>,
    q: Option<f64>,
    section: &Option<String>,
) -> Value {
    let sec = resolve_section(section);
    let mut b = Builder::new_2d(sec);

    let n1 = b.add_node_2d(0.0, 0.0);
    let n2 = b.add_node_2d(length, 0.0);

    let eid = b.add_frame(n1, n2);
    b.add_support(n1, "fixed");

    if let Some(q_val) = q {
        if q_val != 0.0 {
            b.add_distributed_load(eid, q_val);
        }
    }

    if let Some(p) = p_tip {
        if p != 0.0 {
            b.add_nodal_load_2d(n2, 0.0, p);
        }
    }

    b.to_snapshot()
}

fn generate_continuous_beam(spans: &[f64], q: Option<f64>, section: &Option<String>) -> Value {
    let sec = resolve_section(section);
    let mut b = Builder::new_2d(sec);

    // Create nodes at span boundaries
    let mut x = 0.0;
    let mut node_ids = vec![b.add_node_2d(x, 0.0)];
    for &span_len in spans {
        x += span_len;
        node_ids.push(b.add_node_2d(x, 0.0));
    }

    // One element per span
    for i in 0..spans.len() {
        let eid = b.add_frame(node_ids[i], node_ids[i + 1]);
        if let Some(q_val) = q {
            if q_val != 0.0 {
                b.add_distributed_load(eid, q_val);
            }
        }
    }

    // Supports: pinned at first, rollerX at all others
    b.add_support(node_ids[0], "pinned");
    for i in 1..node_ids.len() {
        b.add_support(node_ids[i], "rollerX");
    }

    b.to_snapshot()
}

fn generate_portal_frame(
    width: f64,
    height: f64,
    q_beam: Option<f64>,
    h_lateral: Option<f64>,
    base_support: &Option<String>,
    beam_section: &Option<String>,
    column_section: &Option<String>,
) -> Value {
    let b_sec = resolve_section(beam_section);
    let c_sec = column_section
        .as_deref()
        .and_then(lookup_section)
        .unwrap_or_else(default_column_section);
    let sup_type = resolve_support(base_support, "fixed");

    let mut b = Builder::new_2d(b_sec);
    // Add column section as section id 2 if different from beam
    if c_sec.name != b_sec.name {
        b.sections.push(section_to_json(2, c_sec));
    }
    let col_sec_id = if c_sec.name != b_sec.name { 2 } else { 1 };

    let n1 = b.add_node_2d(0.0, 0.0); // base left
    let n2 = b.add_node_2d(0.0, height); // top left
    let n3 = b.add_node_2d(width, height); // top right
    let n4 = b.add_node_2d(width, 0.0); // base right

    b.add_frame_sec(n1, n2, col_sec_id); // left column
    let beam_eid = b.add_frame(n2, n3); // beam
    b.add_frame_sec(n4, n3, col_sec_id); // right column

    b.add_support(n1, &sup_type);
    b.add_support(n4, &sup_type);

    if let Some(q) = q_beam {
        if q != 0.0 {
            b.add_distributed_load(beam_eid, q);
        }
    }

    if let Some(h) = h_lateral {
        if h != 0.0 {
            b.add_nodal_load_2d(n2, h, 0.0);
        }
    }

    b.to_snapshot()
}

fn generate_truss(
    span: f64,
    height: f64,
    n_panels: u32,
    pattern: &Option<String>,
    top_load: Option<f64>,
) -> Value {
    let sec = default_section();
    let t_sec = truss_section();
    let mut b = Builder::new_2d(sec);
    b.sections.push(section_to_json(2, t_sec));

    let dx = span / n_panels as f64;
    let pat = pattern.as_deref().unwrap_or("pratt");

    // Bottom chord nodes
    let mut bottom = Vec::new();
    for i in 0..=n_panels {
        bottom.push(b.add_node_2d(i as f64 * dx, 0.0));
    }

    if pat == "warren" {
        // Warren: top nodes at midpoints
        let mut top = Vec::new();
        for i in 0..n_panels {
            top.push(b.add_node_2d((i as f64 + 0.5) * dx, height));
        }

        // Bottom chord
        for i in 0..n_panels as usize {
            b.add_truss(bottom[i], bottom[i + 1], 2);
        }
        // Top chord
        for i in 0..(n_panels as usize).saturating_sub(1) {
            b.add_truss(top[i], top[i + 1], 2);
        }
        // Diagonals
        for i in 0..n_panels as usize {
            b.add_truss(bottom[i], top[i], 2);
            b.add_truss(top[i], bottom[i + 1], 2);
        }

        b.add_support(bottom[0], "pinned");
        b.add_support(*bottom.last().unwrap(), "rollerX");

        let load = top_load.unwrap_or(-10.0);
        for &nid in &top {
            b.add_nodal_load_2d(nid, 0.0, load);
        }
    } else if pat == "howe" {
        // Howe: opposite diagonal direction from Pratt
        let mut top = Vec::new();
        for i in 0..=n_panels {
            top.push(b.add_node_2d(i as f64 * dx, height));
        }

        // Bottom chord
        for i in 0..n_panels as usize {
            b.add_truss(bottom[i], bottom[i + 1], 2);
        }
        // Top chord
        for i in 0..n_panels as usize {
            b.add_truss(top[i], top[i + 1], 2);
        }
        // Verticals
        for i in 0..=n_panels as usize {
            b.add_truss(bottom[i], top[i], 2);
        }
        // Diagonals (Howe: opposite of Pratt)
        let mid = (n_panels / 2) as usize;
        for i in 0..n_panels as usize {
            if i < mid {
                b.add_truss(bottom[i], top[i + 1], 2);
            } else {
                b.add_truss(top[i], bottom[i + 1], 2);
            }
        }

        b.add_support(bottom[0], "pinned");
        b.add_support(*bottom.last().unwrap(), "rollerX");

        let load = top_load.unwrap_or(-10.0);
        for &nid in &top {
            b.add_nodal_load_2d(nid, 0.0, load);
        }
    } else {
        // Pratt pattern (default)
        let mut top = Vec::new();
        for i in 0..=n_panels {
            top.push(b.add_node_2d(i as f64 * dx, height));
        }

        // Bottom chord
        for i in 0..n_panels as usize {
            b.add_truss(bottom[i], bottom[i + 1], 2);
        }
        // Top chord
        for i in 0..n_panels as usize {
            b.add_truss(top[i], top[i + 1], 2);
        }
        // Verticals
        for i in 0..=n_panels as usize {
            b.add_truss(bottom[i], top[i], 2);
        }
        // Diagonals
        let mid = (n_panels / 2) as usize;
        for i in 0..n_panels as usize {
            if i < mid {
                b.add_truss(top[i], bottom[i + 1], 2);
            } else {
                b.add_truss(bottom[i], top[i + 1], 2);
            }
        }

        b.add_support(bottom[0], "pinned");
        b.add_support(*bottom.last().unwrap(), "rollerX");

        let load = top_load.unwrap_or(-10.0);
        for &nid in &top {
            b.add_nodal_load_2d(nid, 0.0, load);
        }
    }

    b.to_snapshot()
}

fn generate_portal_frame_3d(
    width: f64,
    depth: f64,
    height: f64,
    q_beam: Option<f64>,
    base_support: &Option<String>,
    beam_section: &Option<String>,
    column_section: &Option<String>,
) -> Value {
    let b_sec = beam_section
        .as_deref()
        .and_then(lookup_section)
        .unwrap_or_else(default_section);
    let c_sec = column_section
        .as_deref()
        .and_then(lookup_section)
        .unwrap_or_else(default_column_section);
    let sup_type = resolve_support(base_support, "fixed3d");

    let mut b = Builder::new_3d(b_sec, c_sec);
    // section 1 = column, section 2 = beam

    // 4 base nodes (z=0)
    let n1 = b.add_node_3d(0.0, 0.0, 0.0);
    let n2 = b.add_node_3d(width, 0.0, 0.0);
    let n3 = b.add_node_3d(width, depth, 0.0);
    let n4 = b.add_node_3d(0.0, depth, 0.0);

    // 4 top nodes (z=height)
    let n5 = b.add_node_3d(0.0, 0.0, height);
    let n6 = b.add_node_3d(width, 0.0, height);
    let n7 = b.add_node_3d(width, depth, height);
    let n8 = b.add_node_3d(0.0, depth, height);

    // 4 columns (section 1)
    b.add_frame_sec(n1, n5, 1);
    b.add_frame_sec(n2, n6, 1);
    b.add_frame_sec(n3, n7, 1);
    b.add_frame_sec(n4, n8, 1);

    // 4 beams at top (section 2)
    let beam1 = b.add_frame_sec(n5, n6, 2);
    let beam2 = b.add_frame_sec(n7, n8, 2);
    b.add_frame_sec(n5, n8, 2);
    b.add_frame_sec(n6, n7, 2);

    // Supports
    b.add_support(n1, &sup_type);
    b.add_support(n2, &sup_type);
    b.add_support(n3, &sup_type);
    b.add_support(n4, &sup_type);

    // Distributed loads on beams
    if let Some(q) = q_beam {
        if q != 0.0 {
            b.add_distributed_load(beam1, q);
            b.add_distributed_load(beam2, q);
        }
    }

    b.to_snapshot()
}

// ---- Multi-story frame ----

fn generate_multi_story_frame(
    n_bays: u32,
    n_floors: u32,
    bay_width: f64,
    floor_height: f64,
    q_beam: Option<f64>,
    h_lateral: Option<f64>,
    beam_section: &Option<String>,
    column_section: &Option<String>,
) -> Value {
    let b_sec = resolve_section(beam_section);
    let c_sec = column_section
        .as_deref()
        .and_then(lookup_section)
        .unwrap_or_else(default_column_section);

    let mut b = Builder::new_2d(b_sec);
    // Add column section as section id 2 if different from beam
    if c_sec.name != b_sec.name {
        b.sections.push(section_to_json(2, c_sec));
    }
    let col_sec_id = if c_sec.name != b_sec.name { 2 } else { 1 };

    // Node grid: node_grid[floor][column]
    let mut node_grid: Vec<Vec<u32>> = Vec::new();
    for f in 0..=(n_floors as usize) {
        let mut row = Vec::new();
        for c in 0..=(n_bays as usize) {
            let x = c as f64 * bay_width;
            let y = f as f64 * floor_height;
            row.push(b.add_node_2d(x, y));
        }
        node_grid.push(row);
    }

    // Columns: vertical elements
    for f in 0..(n_floors as usize) {
        for c in 0..=(n_bays as usize) {
            b.add_frame_sec(node_grid[f][c], node_grid[f + 1][c], col_sec_id);
        }
    }

    // Beams: horizontal elements per floor (above base)
    for f in 1..=(n_floors as usize) {
        for c in 0..(n_bays as usize) {
            let eid = b.add_frame(node_grid[f][c], node_grid[f][c + 1]);
            if let Some(q) = q_beam {
                if q != 0.0 {
                    b.add_distributed_load(eid, q);
                }
            }
        }
    }

    // Fixed supports at base
    for c in 0..=(n_bays as usize) {
        b.add_support(node_grid[0][c], "fixed");
    }

    // Lateral loads at each floor (leftmost node)
    if let Some(h) = h_lateral {
        if h != 0.0 {
            for f in 1..=(n_floors as usize) {
                b.add_nodal_load_2d(node_grid[f][0], h, 0.0);
            }
        }
    }

    b.to_snapshot()
}

// ---- Multi-story 3D frame (port of generateSpaceFrame3D) ----

fn generate_multi_story_frame_3d(
    n_bays_x: u32,
    n_bays_z: u32,
    n_floors: u32,
    bay_width: f64,
    floor_height: f64,
    q_beam: Option<f64>,
    h_lateral: Option<f64>,
    base_support: &Option<String>,
    beam_section: &Option<String>,
    column_section: &Option<String>,
) -> Value {
    let b_sec = beam_section
        .as_deref()
        .and_then(lookup_section)
        .unwrap_or_else(default_section);
    let c_sec = column_section
        .as_deref()
        .and_then(lookup_section)
        .unwrap_or_else(default_column_section);
    let sup_type = resolve_support(base_support, "fixed3d");

    let mut b = Builder::new_3d(b_sec, c_sec);
    // section 1 = column, section 2 = beam

    // Node grid: node_grid[floor][iz][ix]
    let mut node_grid: Vec<Vec<Vec<u32>>> = Vec::new();
    for f in 0..=(n_floors as usize) {
        let mut floor_nodes: Vec<Vec<u32>> = Vec::new();
        let z = f as f64 * floor_height;
        for iz in 0..=(n_bays_z as usize) {
            let mut row = Vec::new();
            for ix in 0..=(n_bays_x as usize) {
                row.push(b.add_node_3d(ix as f64 * bay_width, iz as f64 * bay_width, z));
            }
            floor_nodes.push(row);
        }
        node_grid.push(floor_nodes);
    }

    // Columns
    for f in 0..(n_floors as usize) {
        for iz in 0..=(n_bays_z as usize) {
            for ix in 0..=(n_bays_x as usize) {
                b.add_frame_sec(node_grid[f][iz][ix], node_grid[f + 1][iz][ix], 1);
            }
        }
    }

    // Beams in X at every floor above base
    for f in 1..=(n_floors as usize) {
        for iz in 0..=(n_bays_z as usize) {
            for ix in 0..(n_bays_x as usize) {
                let eid = b.add_frame_sec(node_grid[f][iz][ix], node_grid[f][iz][ix + 1], 2);
                if let Some(q) = q_beam {
                    if q != 0.0 {
                        b.add_distributed_load(eid, q);
                    }
                }
            }
        }
    }

    // Beams in Z at every floor above base
    for f in 1..=(n_floors as usize) {
        for ix in 0..=(n_bays_x as usize) {
            for iz in 0..(n_bays_z as usize) {
                let eid = b.add_frame_sec(node_grid[f][iz][ix], node_grid[f][iz + 1][ix], 2);
                if let Some(q) = q_beam {
                    if q != 0.0 {
                        b.add_distributed_load(eid, q);
                    }
                }
            }
        }
    }

    // X-bracing on perimeter for lateral stiffness
    for f in 0..(n_floors as usize) {
        // Front face (iz=0) and back face (iz=n_bays_z)
        for &iz in &[0, n_bays_z as usize] {
            for ix in 0..(n_bays_x as usize) {
                b.add_truss(node_grid[f][iz][ix], node_grid[f + 1][iz][ix + 1], 2);
                b.add_truss(node_grid[f][iz][ix + 1], node_grid[f + 1][iz][ix], 2);
            }
        }
        // Left face (ix=0) and right face (ix=n_bays_x)
        for &ix in &[0, n_bays_x as usize] {
            for iz in 0..(n_bays_z as usize) {
                b.add_truss(node_grid[f][iz][ix], node_grid[f + 1][iz + 1][ix], 2);
                b.add_truss(node_grid[f][iz + 1][ix], node_grid[f + 1][iz][ix], 2);
            }
        }
    }

    // Supports at base
    for iz in 0..=(n_bays_z as usize) {
        for ix in 0..=(n_bays_x as usize) {
            b.add_support(node_grid[0][iz][ix], &sup_type);
        }
    }

    // Lateral loads at each floor (all nodes on ix=0 face)
    if let Some(h) = h_lateral {
        if h != 0.0 {
            for f in 1..=(n_floors as usize) {
                for iz in 0..=(n_bays_z as usize) {
                    b.add_nodal_load_3d(node_grid[f][iz][0], h, 0.0, 0.0);
                }
            }
        }
    }

    b.to_snapshot()
}

// ---- Dispatch ----

pub fn execute_action(action: &BuildAction) -> Result<Value, AppError> {
    let snapshot = match action {
        BuildAction::CreateBeam {
            span,
            q,
            support_left,
            support_right,
            section,
            p_tip,
        } => generate_beam(*span, *q, support_left, support_right, section, *p_tip),

        BuildAction::CreateCantilever {
            length,
            p_tip,
            q,
            section,
        } => generate_cantilever(*length, *p_tip, *q, section),

        BuildAction::CreateContinuousBeam { spans, q, section } => {
            generate_continuous_beam(spans, *q, section)
        }

        BuildAction::CreatePortalFrame {
            width,
            height,
            q_beam,
            h_lateral,
            base_support,
            beam_section,
            column_section,
        } => generate_portal_frame(
            *width,
            *height,
            *q_beam,
            *h_lateral,
            base_support,
            beam_section,
            column_section,
        ),

        BuildAction::CreateTruss {
            span,
            height,
            n_panels,
            pattern,
            top_load,
        } => generate_truss(*span, *height, n_panels.unwrap_or(4), pattern, *top_load),

        BuildAction::CreateMultiStoryFrame {
            n_bays,
            n_floors,
            bay_width,
            floor_height,
            q_beam,
            h_lateral,
            beam_section,
            column_section,
        } => generate_multi_story_frame(
            *n_bays,
            *n_floors,
            *bay_width,
            *floor_height,
            *q_beam,
            *h_lateral,
            beam_section,
            column_section,
        ),

        BuildAction::CreateMultiStoryFrame3d {
            n_bays_x,
            n_bays_z,
            n_floors,
            bay_width,
            floor_height,
            q_beam,
            h_lateral,
            base_support,
            beam_section,
            column_section,
        } => generate_multi_story_frame_3d(
            *n_bays_x,
            *n_bays_z,
            *n_floors,
            *bay_width,
            *floor_height,
            *q_beam,
            *h_lateral,
            base_support,
            beam_section,
            column_section,
        ),

        BuildAction::CreatePortalFrame3d {
            width,
            depth,
            height,
            q_beam,
            base_support,
            beam_section,
            column_section,
        } => generate_portal_frame_3d(
            *width,
            *depth,
            *height,
            *q_beam,
            base_support,
            beam_section,
            column_section,
        ),

        BuildAction::Unsupported { .. } => {
            return Err(AppError::BadRequest(
                "I can build: beams, cantilevers, continuous beams, portal frames, trusses, and simple 3D frames. Please describe one of these structures.".into(),
            ));
        }

        // Edit actions are handled by edit_executor, not generators
        _ => {
            return Err(AppError::BadRequest(
                "Edit actions require an existing model snapshot".into(),
            ));
        }
    };

    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::coordinate_system::assert_z_up_snapshot;

    fn has_keys(v: &Value, keys: &[&str]) -> bool {
        keys.iter().all(|k| v.get(k).is_some())
    }

    fn assert_vertical_columns_vary_in_z_only(snap: &Value) {
        let nodes = snap["nodes"].as_array().unwrap();
        for elem in snap["elements"].as_array().unwrap() {
            let ni = elem[1]["nodeI"].as_u64().unwrap() as u32;
            let nj = elem[1]["nodeJ"].as_u64().unwrap() as u32;
            let node_i = nodes.iter().find(|n| n[0].as_u64() == Some(ni as u64)).unwrap();
            let node_j = nodes.iter().find(|n| n[0].as_u64() == Some(nj as u64)).unwrap();
            let xi = node_i[1]["x"].as_f64().unwrap();
            let yi = node_i[1]["y"].as_f64().unwrap();
            let zi = node_i[1]["z"].as_f64().unwrap();
            let xj = node_j[1]["x"].as_f64().unwrap();
            let yj = node_j[1]["y"].as_f64().unwrap();
            let zj = node_j[1]["z"].as_f64().unwrap();

            if (xi - xj).abs() < 1e-6 && (yi - yj).abs() < 1e-6 {
                assert!((zi - zj).abs() > 1e-6, "vertical element must vary in z");
            }
        }
    }

    #[test]
    fn beam_snapshot_has_required_fields() {
        let snap = generate_beam(6.0, Some(-10.0), &None, &None, &None, None);
        assert!(has_keys(&snap, &["nodes", "elements", "supports", "loads", "materials", "sections", "nextId"]));
        assert_eq!(snap["nodes"].as_array().unwrap().len(), 2);
        assert_eq!(snap["elements"].as_array().unwrap().len(), 1);
        assert_eq!(snap["supports"].as_array().unwrap().len(), 2);
        assert_eq!(snap["loads"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn cantilever_fixed_support() {
        let snap = generate_cantilever(3.0, Some(-15.0), None, &None);
        let supports = snap["supports"].as_array().unwrap();
        assert_eq!(supports.len(), 1);
        let sup_type = supports[0][1]["type"].as_str().unwrap();
        assert_eq!(sup_type, "fixed");
    }

    #[test]
    fn continuous_beam_support_count() {
        let snap = generate_continuous_beam(&[4.0, 6.0, 4.0], Some(-10.0), &None);
        // 4 supports: pinned + 3 rollerX
        assert_eq!(snap["supports"].as_array().unwrap().len(), 4);
        assert_eq!(snap["elements"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn portal_frame_geometry() {
        let snap = generate_portal_frame(8.0, 5.0, Some(-15.0), Some(10.0), &None, &None, &None);
        assert_eq!(snap["nodes"].as_array().unwrap().len(), 4);
        assert_eq!(snap["elements"].as_array().unwrap().len(), 3);
        assert_eq!(snap["supports"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn pratt_truss_geometry() {
        let snap = generate_truss(12.0, 2.0, 4, &None, Some(-10.0));
        let nodes = snap["nodes"].as_array().unwrap();
        // 5 bottom + 5 top = 10 nodes
        assert_eq!(nodes.len(), 10);
    }

    #[test]
    fn warren_truss_geometry() {
        let snap = generate_truss(12.0, 2.0, 4, &Some("warren".into()), Some(-10.0));
        let nodes = snap["nodes"].as_array().unwrap();
        // 5 bottom + 4 top = 9 nodes
        assert_eq!(nodes.len(), 9);
    }

    #[test]
    fn portal_frame_3d_geometry() {
        let snap = generate_portal_frame_3d(6.0, 4.0, 4.0, Some(-10.0), &None, &None, &None);
        assert_eq!(snap["analysisMode"].as_str().unwrap(), "3d");
        assert_eq!(snap["nodes"].as_array().unwrap().len(), 8);
        assert_eq!(snap["elements"].as_array().unwrap().len(), 8);
        assert_eq!(snap["supports"].as_array().unwrap().len(), 4);
        assert_z_up_snapshot(&snap);
        assert_vertical_columns_vary_in_z_only(&snap);
    }

    #[test]
    fn multi_story_frame_3d_uses_z_for_floors() {
        let snap = generate_multi_story_frame_3d(2, 2, 3, 6.0, 3.0, None, None, &None, &None, &None);
        assert_z_up_snapshot(&snap);
        assert_vertical_columns_vary_in_z_only(&snap);

        let mut z_levels: Vec<f64> = snap["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|n| n[1]["z"].as_f64())
            .collect();
        z_levels.sort_by(|a, b| a.partial_cmp(b).unwrap());
        z_levels.dedup_by(|a, b| (*a - *b).abs() < 1e-6);
        assert_eq!(z_levels, vec![0.0, 3.0, 6.0, 9.0]);
    }

    #[test]
    fn custom_section_used() {
        let snap = generate_beam(6.0, None, &None, &None, &Some("IPE 400".into()), None);
        let sec_name = snap["sections"].as_array().unwrap()[0][1]["name"]
            .as_str()
            .unwrap();
        assert_eq!(sec_name, "IPE 400");
    }

    #[test]
    fn execute_unsupported_returns_error() {
        let action = BuildAction::Unsupported {};
        assert!(execute_action(&action).is_err());
    }
}
