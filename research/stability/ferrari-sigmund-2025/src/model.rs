use dedaliano_engine::types::SolverInput;
use serde_json::json;
pub fn roorda(n: usize, eccentricity: f64) -> SolverInput {
    assert!((2..=80).contains(&n));
    assert!(eccentricity.is_finite() && eccentricity.abs() <= 0.01);
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    for i in 0..=2 * n {
        let (x, z) = if i <= n {
            (0., i as f64 / n as f64)
        } else {
            ((i - n) as f64 / n as f64, 1.)
        };
        nodes.insert((i + 1).to_string(), json!({"id":i+1,"x":x,"z":z}));
    }
    for i in 0..2 * n {
        elements.insert((i+1).to_string(),json!({"id":i+1,"type":"frame","nodeI":i+1,"nodeJ":i+2,"materialId":1,"sectionId":1,"hingeStart":false,"hingeEnd":false}));
    }
    let input:SolverInput=serde_json::from_value(json!({"nodes":nodes,"elements":elements,"materials":{"1":{"id":1,"e":21.,"nu":0.3}},"sections":{"1":{"id":1,"a":0.01,"iz":1e-4/12.}},"supports":{"1":{"id":1,"nodeId":1,"type":"pinned"},"2":{"id":2,"nodeId":2*n+1,"type":"pinned"}},"loads":[{"type":"nodal","data":{"nodeId":n+1,"fx":0.,"fz":-1.,"my":eccentricity}}]})).unwrap();
    input
}
