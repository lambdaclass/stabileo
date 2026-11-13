use super::assembly::InclinedTransformData;
use super::dof::DofNumbering;
use crate::types::*;

pub(crate) fn add_up(a: f64, b: f64) -> f64 {
    if a == 0.0 {
        return b;
    }
    if b == 0.0 {
        return a;
    }
    (a + b).next_up()
}

pub(crate) fn mul_up(a: f64, b: f64) -> f64 {
    if a == 0.0 || b == 0.0 {
        return 0.0;
    }
    if a == 1.0 {
        return b;
    }
    if b == 1.0 {
        return a;
    }
    (a * b).next_up()
}

pub(crate) fn gamma(n: usize) -> f64 {
    if n == 0 {
        return 0.0;
    }
    let nu = mul_up(n as f64, f64::EPSILON);
    if nu >= 1.0 {
        return f64::INFINITY;
    }
    (nu / (1.0 - nu).next_down()).next_up()
}

pub(crate) struct NodalMoments<const N: usize>(
    std::collections::BTreeMap<usize, [Option<num_rational::BigRational>; N]>,
);

impl<const N: usize> NodalMoments<N> {
    pub fn new(loads: impl Iterator<Item = (usize, [f64; N])>) -> Self {
        use num_rational::BigRational;
        use num_traits::Zero;
        let mut sums = std::collections::BTreeMap::<usize, [Option<BigRational>; N]>::new();
        for (node, values) in loads {
            let sum = sums.entry(node).or_insert_with(|| std::array::from_fn(|_| Some(BigRational::zero())));
            for i in 0..N {
                sum[i] = sum[i].take().and_then(|previous| BigRational::from_float(values[i]).map(|value| previous + value));
            }
        }
        Self(sums)
    }

    pub fn nonzero(self) -> Vec<(usize, [bool; N])> {
        use num_traits::Zero;
        self.0.into_iter().filter_map(|(node, sum)| {
            let nonzero = sum.map(|value| value.is_none_or(|v| !v.is_zero()));
            nonzero.iter().any(|v| *v).then_some((node, nonzero))
        }).collect()
    }

    pub fn assembled(self) -> Vec<(usize, [(f64, f64); N])> {
        use num_rational::BigRational;
        use num_traits::{Signed, ToPrimitive, Zero};
        self.0.into_iter().map(|(node, sum)| {
            let values = sum.map(|sum| {
                let Some(sum) = sum else { return (f64::NAN, f64::INFINITY); };
                let value = sum.to_f64().unwrap_or(f64::INFINITY);
                let Some(rounded) = BigRational::from_float(value) else { return (value, f64::INFINITY); };
                let difference = (sum - rounded).abs();
                if difference.is_zero() { return (value, 0.0); }
                let error = difference.to_f64().map_or(f64::INFINITY, f64::next_up);
                let certified = BigRational::from_float(error).is_some_and(|bound| bound >= difference);
                (value, if certified {error} else {f64::INFINITY})
            });
            (node, values)
        }).collect()
    }
}

pub(crate) fn nonzero_nodal_moments<const N: usize>(
    loads: impl Iterator<Item = (usize, [f64; N])>,
) -> Vec<(usize, [bool; N])> {
    NodalMoments::new(loads).nonzero()
}

#[derive(Default)]
pub(crate) struct Work {
    pub value: f64,
    pub uncertainty: f64,
    arithmetic: f64,
}

impl Work {
    pub fn product(&mut self, a: f64, da: f64, b: f64, db: f64) {
        let product = a * b;
        self.arithmetic = add_up(self.arithmetic, product_rounding(a, b, product));
        self.arithmetic = add_up(self.arithmetic, sum_rounding(self.value, product));
        self.value += product;
        self.uncertainty = add_up(
            self.uncertainty,
            add_up(mul_up(a.abs(), db), mul_up(da, add_up(b.abs(), db))),
        );
    }

    pub fn bound(&self) -> f64 {
        add_up(self.uncertainty, self.arithmetic)
    }

    pub fn contains_zero(&self) -> bool {
        let bound = self.bound();
        self.value.is_finite() && bound.is_finite() && self.value.abs() <= bound
    }
}

fn frame_gram_bound(axes: &[[f64; 3]; 3]) -> [[f64; 3]; 3] {
    let mut bound = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in i..3 {
            let mut value = 0.0;
            let mut error = 0.0;
            for k in 0..3 {
                let product = axes[i][k] * axes[j][k];
                error = add_up(error, product_rounding(axes[i][k], axes[j][k], product));
                error = add_up(error, sum_rounding(value, product));
                value += product;
            }
            let identity = if i == j { 1.0 } else { 0.0 };
            let defect = add_up((value - identity).abs(), sum_rounding(value, -identity));
            bound[i][j] = add_up(defect, error);
            bound[j][i] = bound[i][j];
        }
    }
    bound
}

#[cfg(test)]
pub(crate) fn frame_defect(axes: &[[f64; 3]; 3]) -> f64 {
    let bound = frame_gram_bound(axes);
    if bound.iter().flatten().any(|x| !x.is_finite()) {
        return f64::INFINITY;
    }
    bound
        .iter()
        .map(|row| row.iter().copied().fold(0.0, add_up))
        .fold(0.0, f64::max)
}

pub(crate) fn frame_rounding(axes: &[[f64; 3]; 3]) -> [[f64; 3]; 3] {
    let gram = frame_gram_bound(axes);
    if gram.iter().flatten().any(|x| !x.is_finite()) {
        return [[f64::INFINITY; 3]; 3];
    }
    let row_sum = gram.map(|row| row.into_iter().fold(0.0, add_up));
    if row_sum.iter().any(|&x| x >= 1.0) {
        return [[f64::INFINITY; 3]; 3];
    }
    let mut first = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            for k in 0..3 {
                first[i][j] = add_up(first[i][j], mul_up(gram[i][k], axes[k][j].abs()));
            }
        }
    }
    let mut bound = [[0.0; 3]; 3];
    for i in 0..3 {
        let mut connected = [false; 3];
        connected[i] = true;
        for _ in 0..3 {
            for j in 0..3 {
                if connected[j] {
                    for k in 0..3 {
                        if gram[j][k] > 0.0 {
                            connected[k] = true;
                        }
                    }
                }
            }
        }
        let delta = (0..3)
            .filter(|&j| connected[j])
            .map(|j| row_sum[j])
            .fold(0.0, f64::max);
        let denominator = (1.0 - delta).next_down();
        for j in 0..3 {
            let maximum = (0..3)
                .filter(|&k| connected[k])
                .map(|k| first[k][j])
                .fold(0.0, f64::max);
            let numerator = mul_up(row_sum[i], maximum);
            let tail = if numerator == 0.0 {
                0.0
            } else {
                (numerator / denominator).next_up()
            };
            bound[i][j] = add_up(first[i][j], tail);
        }
    }
    bound
}

pub(crate) fn sum_rounding(a: f64, b: f64) -> f64 {
    let sum = a + b;
    let z = sum - a;
    ((a - (sum - z)) + (b - z)).abs()
}

pub(crate) fn product_rounding(a: f64, b: f64, product: f64) -> f64 {
    if a == 0.0 || b == 0.0 || a.abs() == 1.0 || b.abs() == 1.0 {
        return 0.0;
    }
    let residual = a.mul_add(b, -product).abs();
    if product.abs() < f64::MIN_POSITIVE / f64::EPSILON {
        add_up(residual, f64::from_bits(1))
    } else if residual == 0.0 {
        0.0
    } else {
        residual.next_up()
    }
}

pub(crate) struct AssemblyRoundoff {
    error: Vec<f64>,
}

impl AssemblyRoundoff {
    pub fn new(n: usize) -> Self {
        Self { error: vec![0.0; n] }
    }

    pub fn accumulate(&mut self, i: usize, value: f64, error: f64, previous: f64) {
        self.error[i] = add_up(self.error[i], add_up(error, sum_rounding(previous, value)));
    }

    pub fn get(&self, i: usize) -> f64 { self.error[i] }

    pub fn set(&mut self, i: usize, error: f64) { self.error[i] = error; }

    pub fn finish(self) -> Vec<f64> { self.error }
}

pub(crate) fn assembly_rounding_3d(
    input: &SolverInput3D,
    loads: &[SolverLoad3D],
    dof: &DofNumbering,
    inclined: &[InclinedTransformData],
) -> Vec<f64> {
    super::assembly::assemble_load_vector_3d_with_rounding(input, loads, dof, inclined, true).1
}

pub(crate) fn assembly_rounding_2d(
    input: &SolverInput,
    loads: &[SolverLoad],
    dof: &DofNumbering,
    inclined: &[super::assembly::InclinedTransformData2D],
) -> Vec<f64> {
    super::assembly::assemble_load_vector_2d_with_rounding(input, loads, dof, inclined, true).1
}

#[cfg(test)]
mod tests {
    use super::*;
    use num_rational::BigRational;
    use num_traits::{Signed, Zero};

    fn exact(x: f64) -> BigRational {
        BigRational::from_float(x).unwrap()
    }

    #[test]
    fn nodal_moment_checks_share_exact_cancellation_in_both_dimensions() {
        for values in [vec![1.0,-1.0],vec![1e20,1.0,-1e20,-1.0]] {
            assert!(nonzero_nodal_moments(values.iter().map(|v| (1,[*v]))).is_empty());
            assert!(nonzero_nodal_moments(values.iter().map(|v| (1,[*v,-*v,0.0]))).is_empty());
        }
        for residual in [-f64::EPSILON,f64::EPSILON] {
            assert_eq!(nonzero_nodal_moments([1.0,-1.0+residual].into_iter().map(|v| (1,[v]))),vec![(1,[true])]);
        }
        assert_eq!(nonzero_nodal_moments([1e20,1.0,-1e20].into_iter().map(|v| (1,[v]))),vec![(1,[true])]);
        assert_eq!(nonzero_nodal_moments([(1,[1.0]),(2,[-1.0])].into_iter()),vec![(1,[true]),(2,[true])]);
        for value in [f64::INFINITY,f64::NAN,f64::from_bits(1)] {
            assert_eq!(nonzero_nodal_moments([(1,[value])].into_iter()),vec![(1,[true])]);
        }
        for values in [vec![0.3,0.7],vec![1e20,1.0,-1e20],vec![1e20,1.0,-1e20,-1.0+f64::EPSILON],vec![1e20,1.0,-1e20,-1.0]] {
            let expected = values.iter().fold(BigRational::zero(),|sum,v| sum+exact(*v));
            let assembled = NodalMoments::new(values.iter().map(|v| (1,[*v]))).assembled();
            let (value,error) = assembled[0].1[0];
            assert!((exact(value)-&expected).abs() <= exact(error));
            if expected.is_zero() { assert_eq!((value,error),(0.0,0.0)); }
            else { assert_ne!(value,0.0); }
        }
    }

    #[test]
    fn nonlinear_released_moments_reduce_only_free_constraint_rows() {
        use serde_json::json;
        for constrained in [false,true] {
            for unsupported in [false,true] {
                let mut v: serde_json::Value = serde_json::from_str(include_str!("../../tests/fixtures/nightly-2026-11-13.json")).unwrap();
                let v = &mut v["2023"];
                v["nodes"] = json!({"1":{"id":1,"x":0.0,"y":0.0,"z":0.0},"2":{"id":2,"x":3.0,"y":0.0,"z":0.0}});
                let mut e = v["elements"]["1"].clone();
                e["nodeI"] = json!(1); e["nodeJ"] = json!(2); e["releaseMzStart"] = json!(true);
                v["elements"] = json!({"1":e});
                v["supports"] = json!({"1":{"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":false,"rry":false,"rrz":false},"2":{"nodeId":2,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}});
                v["loads"] = json!([{"type":"nodal","data":{"nodeId":1,"fx":0.0,"fy":0.0,"fz":0.0,"mx":0.0,"my":1.0,"mz":if unsupported {1.0} else {0.0}}}]);
                let mut input: SolverInput3D = serde_json::from_value(v.clone()).unwrap();
                if constrained { input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {master_node:2,slave_node:1,dofs:vec![3]})); }
                let r = super::super::linear::refuse_initial_free_rotation_loads_3d(&input);
                assert_eq!(r.is_err(),unsupported,"{constrained}/{unsupported}: {r:?}");
            }
        }
    }

    #[test]
    fn inclined_3d_single_nodal_load_rounding_encloses_transformed_assembly() {
        use super::super::assembly::*;
        use serde_json::json;
        let mut v: serde_json::Value = serde_json::from_str(include_str!("../../tests/fixtures/nightly-2026-11-13.json")).unwrap();
        let v = &mut v["2023"];
        v["loads"] = json!([{"type":"nodal","data":{"nodeId":1,"fx":0.3,"fy":0.7,"fz":1.1,"mx":0.0,"my":0.0,"mz":0.0}}]);
        let input: SolverInput3D = serde_json::from_value(v.clone()).unwrap();
        let dof = DofNumbering::build_3d(&input);
        let iso = crate::metamorphic::transform::Iso3::from_euler(0.3, -0.7, 1.1);
        let r = iso.r;
        let it = InclinedTransformData { node_id:1, dofs:[0,1,2].map(|j| dof.global_dof(1,j).unwrap()), r };
        let values = assemble_load_vector_3d_dense(&input,&input.loads,&dof,std::slice::from_ref(&it));
        let bounds = assembly_rounding_3d(&input,&input.loads,&dof,std::slice::from_ref(&it));
        let mut nonzero = false;
        for i in 0..3 {
            let expected = (0..3).fold(BigRational::zero(), |sum,j| sum + exact(r[i][j])*exact([0.3,0.7,1.1][j]));
            let error = (exact(values[it.dofs[i]])-expected).abs();
            nonzero |= !error.is_zero();
            assert!(error <= exact(bounds[it.dofs[i]]), "component {i}: {error} > {}", bounds[it.dofs[i]]);
        }
        assert!(nonzero);
    }

    fn oblique_truss_transform_enclosure(point: bool) {
        use super::super::assembly::*;
        use serde_json::json;
        let fixture: serde_json::Value = serde_json::from_str(include_str!("../../tests/fixtures/nightly-2026-11-13.json")).unwrap();
        let mut model = fixture["2023"].clone();
        model["nodes"] = json!({"1":{"id":1,"x":0.0,"y":0.0,"z":0.0},"2":{"id":2,"x":3.0,"y":4.0,"z":2.0}});
        let mut element = model["elements"]["1"].clone();
        element["type"] = json!("truss");
        element["nodeI"] = json!(1);
        element["nodeJ"] = json!(2);
        model["elements"] = json!({"1":element});
        model["supports"] = json!({"1":{"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":false,"rry":false,"rrz":false},"2":{"nodeId":2,"rx":true,"ry":true,"rz":true,"rrx":false,"rry":false,"rrz":false}});
        model["loads"] = if point {
            json!([{"type":"pointOnElement","data":{"elementId":1,"a":0.7,"px":0.3,"py":0.7,"pz":1.1}}])
        } else {
            json!([{"type":"distributed","data":{"elementId":1,"qXI":0.0,"qXJ":0.0,"qYI":0.3,"qYJ":0.7,"qZI":1.1,"qZJ":-0.3}}])
        };
        let input: SolverInput3D = serde_json::from_value(model).unwrap();
        let dof = DofNumbering::build_3d(&input);
        let l = 29.0_f64.sqrt();
        let element = &input.elements["1"];
        let (ex,ey,ez) = crate::element::compute_local_axes_3d(0.0,0.0,0.0,3.0,4.0,2.0,element.local_yx,element.local_yy,element.local_yz,element.roll_angle,false);
        let actions = super::super::member_actions::TransverseMemberActions::from_3d(&input.loads[0],l).0;
        let values = assemble_load_vector_3d_dense(&input,&input.loads,&dof,&[]);
        let bounds = assembly_rounding_3d(&input,&input.loads,&dof,&[]);
        let mut nonzero = false;
        for end in 0..2 {
            for k in 0..3 {
                let axial = if point { exact(0.3)*exact(if end == 0 {1.0-0.7/l} else {0.7/l}) } else {BigRational::zero()};
                let expected = axial*exact(ex[k])+exact(actions[end][0])*exact(ey[k])+exact(actions[end][1])*exact(ez[k]);
                let d = dof.global_dof(end+1,k).unwrap();
                let error = (exact(values[d])-expected).abs();
                nonzero |= !error.is_zero();
                assert!(error <= exact(bounds[d]),"{point}/{end}/{k}: {error} > {}",bounds[d]);
            }
        }
        assert!(nonzero);
        let answer = super::super::linear::solve_3d(&input).unwrap();
        assert_eq!(answer.displacements.len(),2);
        let mut bad = input;
        bad.loads.push(serde_json::from_value(json!({"type":"nodal","data":{"nodeId":1,"fx":0.0,"fy":0.0,"fz":0.0,"mx":0.0,"my":0.0,"mz":1.0}})).unwrap());
        assert!(super::super::linear::solve_3d(&bad).is_err());
    }

    #[test]
    fn oblique_truss_transverse_load_encloses_transform_error() {
        oblique_truss_transform_enclosure(false);
    }

    #[test]
    fn oblique_truss_point_load_encloses_transform_error() {
        oblique_truss_transform_enclosure(true);
    }

    fn check_truss_component_boundary(value: f64, bound: f64, local: [f64; 3], local_error: [f64; 3], axes: [[f64; 3]; 3], k: usize) {
        use super::super::stability::*;
        let frame = frame_rounding(&axes);
        let mut expected = Work::default();
        let mut rational = BigRational::zero();
        for j in 0..3 {
            expected.product(local[j], local_error[j], axes[j][k], frame[j][k]);
            rational += exact(local[j])*exact(axes[j][k]);
        }
        let radius = expected.bound();
        assert!(radius.is_finite() && radius > 0.0);
        assert!((rational-exact(value)).abs() <= exact(bound));
        let mut stability = Stability::stable();
        stability.free.push(FreeDirection {
            node: 1, kind: DofKind::Rotation, moves_translation: false,
            dofs: vec![0], direction: vec![1.0], direction_rounding: vec![0.0],
            scale: 1.0, coupling: vec![],
        });
        for sign in [-1.0,1.0] {
            assert_eq!(stability.load_on_free_rotation_with_rounding(&[sign*radius.next_up()], &[bound]),Some(1),"above true bound: {bound} / {radius}");
            for residual in [0.0,radius.next_down(),radius] {
                assert_eq!(stability.load_on_free_rotation_with_rounding(&[sign*residual], &[bound]),None,"inside true bound: {bound} / {radius}");
            }
        }
        assert_eq!(bound,radius);
    }

    #[test]
    #[ignore = "known wrong result: #2074"]
    fn truss_2d_member_transforms_bound_directions_and_refuse_above_boundary() {
        use serde_json::json;
        for kind in ["distributed","pointOnElement","axialDistributed","thermal"] {
            for element_type in ["truss","cable"] {
                let load = match kind {
                    "distributed" => json!({"elementId":1,"qI":0.3,"qJ":0.7}),
                    "pointOnElement" => json!({"elementId":1,"a":0.7,"p":0.7,"px":0.3}),
                    "axialDistributed" => json!({"elementId":1,"qI":0.3,"qJ":0.7}),
                    _ => json!({"elementId":1,"dtUniform":0.7,"dtGradient":0.0,"alpha":0.3}),
                };
                let input: SolverInput = serde_json::from_value(json!({
                    "nodes":{"1":{"id":1,"x":0.0,"z":0.0},"2":{"id":2,"x":3.0,"z":2.0}},
                    "materials":{"1":{"id":1,"e":1.0,"nu":0.3}},
                    "sections":{"1":{"id":1,"a":0.01,"iz":0.0001}},
                    "elements":{"1":{"id":1,"type":element_type,"nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
                    "supports":{},"loads":[{"type":kind,"data":load}]
                })).unwrap();
                let dof = DofNumbering::build_2d(&input);
                let l = 13.0_f64.sqrt();
                let axes = [[3.0/l,2.0/l,0.0],[-2.0/l,3.0/l,0.0],[0.0,0.0,1.0]];
                let actions = super::super::member_actions::TransverseMemberActions::from_2d(&input.loads[0],l).0;
                let mut local = [[0.0;3];2];
                let mut errors = [[0.0;3];2];
                for end in 0..2 { local[end][1] = actions[end][0]; }
                match &input.loads[0] {
                    SolverLoad::PointOnElement(p) => {
                        for (end,factor) in [1.0-p.a/l,p.a/l].into_iter().enumerate() {
                            local[end][0] = p.px.unwrap()*factor;
                            errors[end][0] = product_rounding(p.px.unwrap(),factor,local[end][0]);
                        }
                    }
                    SolverLoad::AxialDistributed(a) => {
                        let f = crate::element::axial_distributed_fef(a.q_i,a.q_j,0.0,l,l);
                        for end in 0..2 { local[end][0] = f[end]; }
                    }
                    SolverLoad::Thermal(t) => {
                        let f = input.materials["1"].e*1000.0*input.sections["1"].a*t.alpha()*t.dt_uniform;
                        local[0][0] = -f; local[1][0] = f;
                    }
                    _ => {}
                }
                let (values,bounds) = super::super::assembly::assemble_load_vector_2d_with_rounding(&input,&input.loads,&dof,&[],true);
                for end in 0..2 { for k in 0..2 {
                    let d = dof.global_dof(end+1,k).unwrap();
                    check_truss_component_boundary(values[d],bounds[d],local[end],errors[end],axes,k);
                } }
            }
        }
    }

    #[test]
    #[ignore = "known wrong result: #2074"]
    fn truss_3d_axial_and_thermal_bound_directions_and_refuse_above_boundary() {
        use serde_json::json;
        for thermal in [false,true] {
            for element_type in ["truss","cable"] {
                let fixture: serde_json::Value = serde_json::from_str(include_str!("../../tests/fixtures/nightly-2026-11-13.json")).unwrap();
                let mut model = fixture["2023"].clone();
                model["nodes"] = json!({"1":{"id":1,"x":0.0,"y":0.0,"z":0.0},"2":{"id":2,"x":3.0,"y":4.0,"z":2.0}});
                let mut element = model["elements"]["1"].clone();
                element["type"] = json!(element_type); element["nodeI"] = json!(1); element["nodeJ"] = json!(2);
                model["elements"] = json!({"1":element});
                model["supports"] = json!({});
                model["loads"] = if thermal {
                    json!([{"type":"thermal","data":{"elementId":1,"dtUniform":0.7,"dtGradientY":0.0,"dtGradientZ":0.0,"alpha":0.3}}])
                } else {
                    json!([{"type":"distributed","data":{"elementId":1,"qXI":0.3,"qXJ":0.7,"qYI":0.0,"qYJ":0.0,"qZI":0.0,"qZJ":0.0}}])
                };
                let input: SolverInput3D = serde_json::from_value(model).unwrap();
                let dof = DofNumbering::build_3d(&input);
                let e = &input.elements["1"];
                let (ex,ey,ez) = crate::element::compute_local_axes_3d(0.0,0.0,0.0,3.0,4.0,2.0,e.local_yx,e.local_yy,e.local_yz,e.roll_angle,false);
                let axial = match &input.loads[0] {
                    SolverLoad3D::Distributed(d) => crate::element::axial_distributed_fef(d.q_xi,d.q_xj,0.0,29.0_f64.sqrt(),29.0_f64.sqrt()),
                    SolverLoad3D::Thermal(t) => {
                        let f = input.materials["1"].e*1000.0*input.sections["1"].a*t.alpha()*t.dt_uniform;
                        [-f,f]
                    }
                    _ => unreachable!(),
                };
                let (values,bounds) = super::super::assembly::assemble_load_vector_3d_with_rounding(&input,&input.loads,&dof,&[],true);
                for end in 0..2 { for k in 0..3 {
                    let d = dof.global_dof(end+1,k).unwrap();
                    check_truss_component_boundary(values[d],bounds[d],[axial[end],0.0,0.0],[0.0;3],[ex,ey,ez],k);
                } }
            }
        }
    }

    #[test]
    fn single_2d_fef_rounding_encloses_member_transform() {
        use super::super::assembly::*;
        use serde_json::json;
        let input: SolverInput = serde_json::from_value(json!({
            "nodes":{"1":{"id":1,"x":0.0,"z":0.0},"2":{"id":2,"x":3.0,"z":2.0}},
            "materials":{"1":{"id":1,"e":210000.0,"nu":0.3}},
            "sections":{"1":{"id":1,"a":0.01,"iz":0.0001}},
            "elements":{"1":{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"hingeStart":true,"hingeEnd":false}},
            "supports":{"1":{"id":1,"nodeId":1,"type":"pinned"},"2":{"id":2,"nodeId":2,"type":"fixed"}},
            "loads":[{"type":"pointOnElement","data":{"elementId":1,"a":0.5,"p":1.0}}]
        })).unwrap();
        let dof = DofNumbering::build_2d(&input);
        let l = 13.0_f64.sqrt();
        let t = crate::element::frame_transform_2d(3.0/l,2.0/l);
        let mut local = crate::element::fef_point_load_2d(1.0,0.0,0.0,0.5,l,0.0);
        crate::element::adjust_fef_for_hinges(&mut local,l,true,false,0.0);
        let values = assemble_load_vector_2d(&input,&input.loads,&dof,&[]);
        let bounds = assembly_rounding_2d(&input,&input.loads,&dof,&[]);
        let dofs = dof.element_dofs(1,2);
        let mut nonzero = false;
        for i in 0..6 {
            let expected = (0..6).fold(BigRational::zero(), |sum,j| sum + exact(t[j*6+i])*exact(local[j]));
            let error = (exact(values[dofs[i]])-expected).abs();
            nonzero |= !error.is_zero();
            assert!(error <= exact(bounds[dofs[i]]), "component {i}: {error} > {}", bounds[dofs[i]]);
        }
        assert!(nonzero);
    }

    #[test]
    fn released_work_rounding_encloses_exact_products_and_cancellation() {
        for (a, b) in [
            (1.0, f64::from_bits(1)),
            (0.3, 0.7),
            (f64::MIN_POSITIVE, 0.1),
            (1e100, 1e-100),
            (f64::MAX, 0.5),
        ] {
            let product = a * b;
            let error = (exact(a) * exact(b) - exact(product)).abs();
            assert!(error <= exact(product_rounding(a, b, product)), "{a}/{b}");
        }
        for terms in [
            vec![(1e20, 1.0), (1.0, 1.0), (-1e20, 1.0)],
            vec![(0.3, 0.7), (-0.7, 0.3)],
            vec![(1.0, f64::from_bits(1))],
        ] {
            let mut work = Work::default();
            let mut physical = BigRational::zero();
            for (a, b) in terms {
                physical += exact(a) * exact(b);
                work.product(a, 0.0, b, 0.0);
            }
            assert!((physical - exact(work.value)).abs() <= exact(work.bound()));
        }
    }

    #[test]
    fn released_work_refuses_the_next_float_above_the_assembly_bound_in_both_dimensions() {
        use super::super::stability::*;
        for dimension in [2, 3] {
            for units in [0.001, 1.0, 1000.0] {
                for index in 0..if dimension == 2 { 1 } else { 3 } {
                    let mut direction = vec![0.0; if dimension == 2 { 1 } else { 3 }];
                    direction[index] = 1.0;
                    let n = direction.len();
                    let stability = Stability {
                        verdict: Verdict::Stable,
                        reason: Reason::Resolved,
                        kappa: 1.0,
                        anisotropy: 1.0,
                        mode_nodes: vec![],
                        free: vec![FreeDirection {
                            node: 1,
                            kind: DofKind::Rotation,
                            moves_translation: false,
                            dofs: (0..n).collect(),
                            direction,
                            direction_rounding: vec![0.0; n],
                            scale: 1.0,
                            coupling: vec![],
                        }],
                    };
                    let radius: f64 = 0.25 * units;
                    let mut rounding = vec![0.0; n];
                    rounding[index] = radius;
                    for (value, expected) in [
                        (radius.next_down(), None),
                        (radius, None),
                        (radius.next_up(), Some(1)),
                    ] {
                        let mut f = vec![0.0; n];
                        f[index] = value;
                        assert_eq!(
                            stability.load_on_free_rotation_with_rounding(&f, &rounding),
                            expected,
                            "{dimension}/{units}/{index}/{value}"
                        );
                    }
                    let mut exact_load = vec![0.0; n];
                    exact_load[index] = f64::from_bits(1);
                    assert_eq!(stability.load_on_free_rotation(&exact_load), Some(1));
                }
            }
        }
    }

    #[test]
    fn released_work_nonfinite_uncertainty_is_refused() {
        for bad in [f64::INFINITY, f64::NAN] {
            let mut work = Work::default();
            work.product(1.0, bad, 0.0, 1.0);
            assert!(!work.contains_zero());
        }
        assert_eq!(
            frame_defect(&[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]),
            0.0
        );
    }
    #[test]
    fn released_work_assembly_bound_covers_every_accumulation_order() {
        let values = [1e20, 1.0, -1e20];
        let physical = values
            .iter()
            .fold(BigRational::zero(), |sum, x| sum + exact(*x));
        for order in [
            [0, 1, 2],
            [0, 2, 1],
            [1, 0, 2],
            [1, 2, 0],
            [2, 0, 1],
            [2, 1, 0],
        ] {
            let mut sum = 0.0;
            let mut rounding = AssemblyRoundoff::new(1);
            for i in order {
                rounding.accumulate(0, values[i], 0.0, sum);
                sum += values[i];
            }
            assert!((exact(sum) - &physical).abs() <= exact(rounding.finish()[0]));
        }
        let mut single = AssemblyRoundoff::new(1);
        single.accumulate(0, f64::from_bits(1), 0.0, 0.0);
        assert_eq!(single.finish(), vec![0.0]);
        assert_eq!(gamma(0), 0.0);
    }

    #[test]
    fn released_work_frame_defect_encloses_the_exact_gram_matrix() {
        let (s, c) = 0.3_f64.sin_cos();
        for axes in [
            [[c, s, 0.0], [-s, c, 0.0], [0.0, 0.0, 1.0]],
            [
                [1.0, f64::EPSILON, 0.0],
                [0.0, 1.0, f64::EPSILON],
                [f64::EPSILON, 0.0, 1.0],
            ],
        ] {
            let bound = exact(frame_defect(&axes));
            for i in 0..3 {
                let mut row = BigRational::zero();
                for j in 0..3 {
                    let value = (0..3).fold(BigRational::zero(), |sum, k| {
                        sum + exact(axes[i][k]) * exact(axes[j][k])
                    });
                    row += (value - exact(if i == j { 1.0 } else { 0.0 })).abs();
                }
                assert!(row <= bound);
            }
        }
    }
    #[test]
    fn released_frame_bounds_preserve_independent_global_components() {
        let axes = [
            [1.0 + f64::EPSILON, 0.0, 0.0],
            [0.0, 1.0 - f64::EPSILON, 0.0],
            [0.0, 0.0, 1.0],
        ];
        let bound = frame_rounding(&axes);
        for i in 0..3 {
            for j in 0..3 {
                let physical = if i == j { 1.0 } else { 0.0 };
                assert!((exact(axes[i][j]) - exact(physical)).abs() <= exact(bound[i][j]));
                if i != j {
                    assert_eq!(bound[i][j], 0.0);
                }
            }
        }
        for angle in [0.0_f64, 0.3, 1.2] {
            let (s, c) = angle.sin_cos();
            let bound = frame_rounding(&[[1.0, 0.0, 0.0], [0.0, c, s], [0.0, -s, c]]);
            for i in [1, 2] {
                assert_eq!(bound[0][i], 0.0);
                assert_eq!(bound[i][0], 0.0);
            }
        }
    }
    #[test]
    fn released_work_assembly_boundary_in_oblique_frames_and_units() {
        use super::super::stability::*;
        for units in [0.001, 1.0, 1000.0] {
            for index in 0..3 {
                let mut direction = vec![0.0; 3];
                direction[index] = 0.5;
                direction[(index + 1) % 3] = 0.75_f64.sqrt();
                let stability = Stability {
                    verdict: Verdict::Stable,
                    reason: Reason::Resolved,
                    kappa: 1.0,
                    anisotropy: 1.0,
                    mode_nodes: vec![],
                    free: vec![FreeDirection {
                        node: 1,
                        kind: DofKind::Rotation,
                        moves_translation: false,
                        dofs: (0..3).collect(),
                        direction,
                        direction_rounding: vec![0.0; 3],
                        scale: 1.0,
                        coupling: vec![],
                    }],
                };
                let radius = 0.25 * units;
                let threshold = (0.5_f64 * radius).next_up() * 2.0;
                let mut rounding = vec![0.0; 3];
                rounding[index] = radius;
                for (value, expected) in [
                    (threshold.next_down(), None),
                    (threshold, None),
                    (threshold.next_up(), Some(1)),
                ] {
                    let mut load = vec![0.0; 3];
                    load[index] = value;
                    assert_eq!(
                        stability.load_on_free_rotation_with_rounding(&load, &rounding),
                        expected,
                        "{units}/{index}/{value}"
                    );
                }
            }
        }
    }
    #[test]
    fn released_frame_series_refuses_at_its_certification_boundary() {
        let axes = |x| [[x, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
        let finite = |x| frame_rounding(&axes(x)).iter().flatten().all(|x| x.is_finite());
        let mut low = 1.0_f64.to_bits();
        let mut high = 2.0_f64.to_bits();
        assert!(finite(f64::from_bits(low)));
        assert!(!finite(f64::from_bits(high)));
        while high - low > 1 {
            let middle = low + (high - low) / 2;
            if finite(f64::from_bits(middle)) { low = middle; } else { high = middle; }
        }
        assert_eq!(f64::from_bits(low).next_up(), f64::from_bits(high));
        assert!(finite(f64::from_bits(low)));
        assert!(!finite(f64::from_bits(high)));
        assert_eq!(frame_defect(&axes(0.0)), 1.0);
        for value in [0.0, f64::INFINITY, f64::NAN] {
            assert!(!finite(value));
        }
    }

}
