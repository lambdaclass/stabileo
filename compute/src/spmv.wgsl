struct Parameters { n: u32, count: u32 }
@group(0) @binding(0) var<storage, read> offsets: array<u32>;
@group(0) @binding(1) var<storage, read> columns: array<u32>;
@group(0) @binding(2) var<storage, read> values: array<f32>;
@group(0) @binding(3) var<storage, read> vectors: array<f32>;
@group(0) @binding(4) var<storage, read_write> output: array<f32>;
@group(0) @binding(5) var<uniform> params: Parameters;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let row = id.x;
    let batch = id.y;
    if row >= params.n || batch >= params.count { return; }
    var sum = 0.0;
    for (var k = offsets[row]; k < offsets[row + 1]; k++) {
        sum += values[k] * vectors[batch * params.n + columns[k]];
    }
    output[batch * params.n + row] = sum;
}
