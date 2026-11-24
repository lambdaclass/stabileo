struct Parameters { dimensions: vec4<u32>, coefficients: vec4<f32>, scales: vec4<f32> }
@group(0) @binding(0) var<storage, read> offsets: array<u32>;
@group(0) @binding(1) var<storage, read> columns: array<u32>;
@group(0) @binding(2) var<storage, read> values: array<f32>;
// x, r, z, p stay resident throughout the solve.
@group(0) @binding(3) var<storage, read_write> state: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> ap: array<f32>;
@group(0) @binding(5) var<storage, read> inverse_diagonal: array<f32>;
@group(0) @binding(6) var<storage, read_write> partials: array<vec4<f32>>;
@group(0) @binding(7) var<uniform> params: Parameters;
var<workgroup> sums: array<vec4<f32>, 256>;
var<workgroup> maxima: array<vec4<f32>, 256>;

fn finite(v: f32) -> bool { return (bitcast<u32>(v) & 0x7f800000u) != 0x7f800000u; }
fn normal_or_zero(v: f32) -> bool {
    let bits = bitcast<u32>(v) & 0x7fffffffu;
    return bits == 0u || (bits >= 0x00800000u && bits < 0x7f800000u);
}
fn reduce(lane: u32, group: u32, s: vec4<f32>, m: vec4<f32>) {
    sums[lane] = s; maxima[lane] = m;
    workgroupBarrier();
    for (var stride = 128u; stride > 0u; stride /= 2u) {
        if lane < stride {
            sums[lane] += sums[lane + stride];
            maxima[lane] = max(maxima[lane], maxima[lane + stride]);
        }
        workgroupBarrier();
    }
    if lane == 0u {
        partials[group * 2u] = sums[0];
        partials[group * 2u + 1u] = maxima[0];
    }
}

@compute @workgroup_size(256)
fn initialize(@builtin(global_invocation_id) id: vec3<u32>, @builtin(local_invocation_index) lane: u32, @builtin(workgroup_id) group: vec3<u32>) {
    var s = vec4<f32>(0.); var m = vec4<f32>(0.);
    if id.x < params.dimensions.x {
        let r = ap[id.x];
        let z = r * inverse_diagonal[id.x];
        state[id.x] = vec4<f32>(0., r, z, z);
        let rn = r / params.coefficients.z;
        let zn = z / params.coefficients.w;
        s = vec4<f32>(rn * rn, rn * zn, 0., 0.);
        m = vec4<f32>(abs(r), abs(z), 0., select(1., 0., finite(z)));
    }
    reduce(lane, group.x, s, m);
}

@compute @workgroup_size(256)
fn direction(@builtin(global_invocation_id) id: vec3<u32>) {
    if id.x < params.dimensions.x {
        state[id.x].w = state[id.x].z + params.coefficients.y * state[id.x].w;
    }
}

@compute @workgroup_size(256)
fn curvature(@builtin(global_invocation_id) id: vec3<u32>, @builtin(local_invocation_index) lane: u32, @builtin(workgroup_id) group: vec3<u32>) {
    var s = vec4<f32>(0.); var m = vec4<f32>(0.);
    if id.x < params.dimensions.x {
        var product = 0.; var bad = 0.;
        for (var k = offsets[id.x]; k < offsets[id.x + 1u]; k++) {
            let p = state[columns[k]].w;
            if normal_or_zero(p) { product += values[k] * p; }
            else { bad = 1.; }
        }
        let p = state[id.x].w;
        if !normal_or_zero(p) || !finite(product) { bad = 1.; }
        ap[id.x] = product;
        if bad == 0. {
            s.z = (p / params.scales.x) * (product / params.scales.y);
            m = vec4<f32>(abs(p), abs(product), 0., 0.);
        } else { m.w = 1.; }
    }
    reduce(lane, group.x, s, m);
}

@compute @workgroup_size(256)
fn update(@builtin(global_invocation_id) id: vec3<u32>, @builtin(local_invocation_index) lane: u32, @builtin(workgroup_id) group: vec3<u32>) {
    var s = vec4<f32>(0.); var m = vec4<f32>(0.);
    if id.x < params.dimensions.x {
        let x = state[id.x].x + params.coefficients.x * state[id.x].w;
        let r = state[id.x].y - params.coefficients.x * ap[id.x];
        let z = r * inverse_diagonal[id.x];
        state[id.x] = vec4<f32>(x, r, z, state[id.x].w);
        if finite(x) && finite(r) && finite(z) {
            let rn = r / params.coefficients.z;
            let zn = z / params.coefficients.w;
            s = vec4<f32>(rn * rn, rn * zn, 0., 0.);
            m = vec4<f32>(abs(r), abs(z), abs(x), 0.);
        } else { m.w = 1.; }
    }
    reduce(lane, group.x, s, m);
}

@compute @workgroup_size(256)
fn finish(@builtin(global_invocation_id) id: vec3<u32>) {
    if id.x < params.dimensions.x { ap[id.x] = state[id.x].x; }
}
