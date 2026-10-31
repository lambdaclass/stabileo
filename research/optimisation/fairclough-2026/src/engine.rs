use crate::Layout;
use serde_json::{json, Value};

pub fn model(layout: &Layout) -> Value {
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    let mut sections = serde_json::Map::new();
    let mut supports = serde_json::Map::new();
    let mut weights = vec![0.; 129];
    nodes.insert(
        "1".into(),
        json!({"id":1,"x":0.,"y":0.,"z":layout.nodes[4][2]}),
    );
    let mut node_id = 2;
    let mut element_id = 1;
    for (c, curve) in layout.curves.iter().enumerate() {
        let mut ids = Vec::new();
        for (k, p) in curve.iter().enumerate() {
            if k == 32 {
                ids.push(1);
                continue;
            }
            let id = node_id;
            node_id += 1;
            nodes.insert(id.to_string(), json!({"id":id,"x":p[0],"y":p[1],"z":p[2]}));
            ids.push(id);
            if k == 0 {
                supports.insert((c+1).to_string(), json!({"nodeId":id,"rx":true,"ry":true,"rz":true,"rrx":false,"rry":false,"rrz":false}));
            }
        }
        for k in 0..32 {
            let id = element_id;
            element_id += 1;
            let area = (curve[k][3] + curve[k + 1][3]) / 2.;
            let inertia = area * area / (4. * std::f64::consts::PI);
            sections.insert(
                id.to_string(),
                json!({"id":id,"a":area,"iy":inertia,"iz":inertia,"j":2.*inertia}),
            );
            elements.insert(id.to_string(), json!({"id":id,"type":"frame","nodeI":ids[k],"nodeJ":ids[k+1],"materialId":1,"sectionId":id}));
            let length = (0..3)
                .map(|d| (curve[k + 1][d] - curve[k][d]).powi(2))
                .sum::<f64>()
                .sqrt();
            let weight = 1.65 * area * length;
            weights[ids[k] - 1] += weight / 2.;
            weights[ids[k + 1] - 1] += weight / 2.;
        }
    }
    weights[0] += 1.;
    let loads: Vec<_> = weights.iter().enumerate().map(|(i, w)| json!({"type":"nodal","data":{"nodeId":i+1,"fx":0.,"fy":0.,"fz":-w,"mx":0.,"my":0.,"mz":0.}})).collect();
    json!({"nodes":nodes,"elements":elements,"sections":sections,"materials":{"1":{"id":1,"e":1000.,"nu":0.3}},"supports":supports,"loads":loads})
}

pub fn check(input: Value) -> Result<Value, String> {
    let typed = serde_json::from_value(input.clone()).map_err(|e| e.to_string())?;
    let result = dedaliano_engine::solver::linear::solve_3d(&typed)?;
    let total_load: f64 = input["loads"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["data"]["fz"].as_f64().unwrap())
        .sum();
    let reaction: f64 = result.reactions.iter().map(|r| r.fz).sum();
    let max_displacement = result
        .displacements
        .iter()
        .map(|d| d.ux.hypot(d.uy).hypot(d.uz))
        .fold(0., f64::max);
    Ok(
        json!({"vertical_load":total_load,"vertical_reaction":reaction,"relative_balance_error":(reaction+total_load).abs()/total_load.abs(),"max_displacement":max_displacement}),
    )
}
