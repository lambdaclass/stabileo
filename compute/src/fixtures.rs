use dedaliano_engine::{
    linalg::CscMatrix,
    solver::{dof::DofNumbering, sparse_assembly::assemble_stiffness_sparse_2d},
    types::SolverInput,
};

#[derive(serde::Serialize)]
pub struct ComparisonCase {
    pub name: String,
    pub n: usize,
    pub offsets: Vec<usize>,
    pub rows: Vec<usize>,
    pub values: Vec<f64>,
    pub rhs: Vec<f64>,
    pub expected: Vec<f64>,
}
impl ComparisonCase {
    pub fn matrix(&self) -> CscMatrix {
        CscMatrix {
            n: self.n,
            col_ptr: self.offsets.clone(),
            row_idx: self.rows.clone(),
            values: self.values.clone(),
        }
    }
    fn new(name: &str, a: CscMatrix) -> Self {
        let expected: Vec<_> = (0..a.n).map(|i| ((i % 13) as f64 - 6.) * 0.125).collect();
        let rhs = a.sym_mat_vec(&expected);
        Self {
            name: name.into(),
            n: a.n,
            offsets: a.col_ptr,
            rows: a.row_idx,
            values: a.values,
            rhs,
            expected,
        }
    }
}

pub fn comparison_cases() -> Vec<ComparisonCase> {
    let mut cases = vec![ComparisonCase::new("chain-256", grid(256, 1, 4.))];
    for side in [16, 32, 64] {
        cases.push(ComparisonCase::new(
            &format!("grid-{side}x{side}"),
            grid(side, side, 4.),
        ));
    }
    for (levels, bays) in [(2, 4), (6, 8)] {
        cases.push(ComparisonCase::new(
            &format!("frame-{levels}x{bays}"),
            frame(levels, bays),
        ));
    }
    cases
}

pub const LARGE_CASES: &[&str] = &[
    "grid-256x256",
    "grid-512x512",
    "grid-1024x1024",
    "plate-64x64",
    "plate-128x128",
    "plate-256x256",
];

// Construct one case at a time so the scaling experiment does not retain all meshes.
pub fn large_case(name: &str) -> Option<ComparisonCase> {
    let matrix = match name {
        "grid-256x256" => grid(256, 256, 4.),
        "grid-512x512" => grid(512, 512, 4.),
        "grid-1024x1024" => grid(1024, 1024, 4.),
        "plate-64x64" => plate(64),
        "plate-128x128" => plate(128),
        "plate-256x256" => plate(256),
        _ => return None,
    };
    Some(ComparisonCase::new(name, matrix))
}

pub fn plate(side: usize) -> CscMatrix {
    use dedaliano_engine::{solver::assembly::assemble_stiffness_sparse_3d, types::SolverInput3D};
    use serde_json::{json, Map};
    let mut nodes = Map::new();
    let mut quads = Map::new();
    let mut supports = Map::new();
    let id = |x, y| y * (side + 1) + x + 1;
    for y in 0..=side {
        for x in 0..=side {
            let n = id(x, y);
            nodes.insert(
                n.to_string(),
                json!({"id":n,"x":x as f64 * 10. / side as f64,
                "y":y as f64 * 10. / side as f64,"z":0.}),
            );
            if x == 0 || y == 0 || x == side || y == side {
                supports.insert(
                    n.to_string(),
                    json!({"nodeId":n,"rx":true,"ry":true,"rz":true,
                    "rrx":true,"rry":true,"rrz":true}),
                );
            }
            if x < side && y < side {
                let e = quads.len() + 1;
                quads.insert(
                    e.to_string(),
                    json!({"id":e,"nodes":[n,id(x+1,y),id(x+1,y+1),id(x,y+1)],
                    "materialId":1,"thickness":0.1}),
                );
            }
        }
    }
    let input: SolverInput3D = serde_json::from_value(json!({"nodes":nodes,"quads":quads,
        "supports":supports,"materials":{"1":{"id":1,"e":200000000.,"nu":0.3}},
        "sections":{},"elements":{},"loads":[]}))
    .expect("valid clamped MITC4 plate");
    let dofs = DofNumbering::build_3d(&input);
    let assembly = assemble_stiffness_sparse_3d(&input, &dofs, false);
    assert!(
        assembly.diagnostics.is_empty(),
        "benchmark assembly diagnostics: {:?}",
        assembly.diagnostics
    );
    assembly.k_ff
}

pub fn grid(nx: usize, ny: usize, diagonal: f64) -> CscMatrix {
    let mut rows = Vec::new();
    let mut cols = Vec::new();
    let mut values = Vec::new();
    for y in 0..ny {
        for x in 0..nx {
            let i = y * nx + x;
            rows.push(i);
            cols.push(i);
            values.push(diagonal);
            if x + 1 < nx {
                rows.push(i + 1);
                cols.push(i);
                values.push(-1.);
            }
            if y + 1 < ny {
                rows.push(i + nx);
                cols.push(i);
                values.push(-1.);
            }
        }
    }
    CscMatrix::from_triplets(nx * ny, &rows, &cols, &values)
}

fn frame(levels: usize, bays: usize) -> CscMatrix {
    use serde_json::{json, Map, Value};
    let mut nodes = Map::new();
    let mut elements = Map::new();
    let mut supports = Map::new();
    let id = |level, bay| level * (bays + 1) + bay;
    let mut add = |i, j| {
        let e = elements.len() + 1;
        elements.insert(
            e.to_string(),
            json!({"id":e,"type":"frame","nodeI":i,"nodeJ":j,
            "materialId":1,"sectionId":1,"hingeStart":false,"hingeEnd":false}),
        );
    };
    for level in 0..=levels {
        for bay in 0..=bays {
            let n = id(level, bay);
            nodes.insert(
                n.to_string(),
                json!({"id":n,"x":bay as f64 * 6.,"z":level as f64 * 3.}),
            );
            if level == 0 {
                supports.insert(n.to_string(), json!({"id":n,"nodeId":n,"type":"fixed"}));
            } else {
                add(id(level - 1, bay), n);
                if bay < bays {
                    add(n, id(level, bay + 1));
                }
            }
        }
    }
    let input: SolverInput = serde_json::from_value(
        json!({"nodes":Value::Object(nodes),"elements":Value::Object(elements),
        "supports":Value::Object(supports),"materials":{"1":{"id":1,"e":200000000.,"nu":0.3}},
        "sections":{"1":{"id":1,"a":0.02,"iz":0.00008}},"loads":[]}),
    )
    .expect("valid benchmark frame");
    let dofs = DofNumbering::build_2d(&input);
    assemble_stiffness_sparse_2d(&input, &dofs).k_ff
}
