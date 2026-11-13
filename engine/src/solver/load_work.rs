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
    magnitude: Vec<f64>,
    terms: Vec<usize>,
}

impl AssemblyRoundoff {
    pub fn new(n: usize) -> Self {
        Self {
            error: vec![0.0; n],
            magnitude: vec![0.0; n],
            terms: vec![0; n],
        }
    }

    pub fn accumulate(&mut self, i: usize, value: f64, error: f64) {
        self.error[i] = add_up(self.error[i], error);
        self.magnitude[i] = add_up(self.magnitude[i], value.abs());
        if value != 0.0 {
            self.terms[i] += 1;
        }
    }

    pub fn finish(self) -> Vec<f64> {
        self.error
            .into_iter()
            .zip(self.magnitude)
            .zip(self.terms)
            .map(|((error, magnitude), terms)| {
                add_up(error, mul_up(gamma(terms.saturating_sub(1)), magnitude))
            })
            .collect()
    }
}

pub(crate) fn assembly_rounding_3d(
    input: &SolverInput3D,
    loads: &[SolverLoad3D],
    dof: &DofNumbering,
    _inclined: &[InclinedTransformData],
) -> Vec<f64> {
    super::assembly::frame_load_rounding_3d(input, loads, dof)
}

pub(crate) fn assembly_rounding_2d(
    input: &SolverInput,
    loads: &[SolverLoad],
    dof: &DofNumbering,
    inclined: &[super::assembly::InclinedTransformData2D],
) -> Vec<f64> {
    let mut magnitude = vec![0.0; dof.n_total];
    let mut counts = vec![0usize; dof.n_total];
    for load in loads {
        let values = super::assembly::assemble_load_vector_2d(
            input,
            std::slice::from_ref(load),
            dof,
            inclined,
        );
        for (i, x) in values.iter().enumerate() {
            magnitude[i] = add_up(magnitude[i], x.abs());
            if *x != 0.0 {
                counts[i] += 1;
            }
        }
    }
    magnitude
        .iter()
        .zip(counts)
        .map(|(&m, n)| if n > 1 { mul_up(gamma(n), m) } else { 0.0 })
        .collect()
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
                sum += values[i];
                rounding.accumulate(0, values[i], 0.0);
            }
            assert!((exact(sum) - &physical).abs() <= exact(rounding.finish()[0]));
        }
        let mut single = AssemblyRoundoff::new(1);
        single.accumulate(0, f64::from_bits(1), 0.0);
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
