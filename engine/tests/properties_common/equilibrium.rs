use std::collections::BTreeMap;

pub fn equilibrium_tolerance(local_scale: f64, model_scale: f64, terms: usize, previous_budget: f64) -> f64 {
    let neps = terms as f64 * f64::EPSILON;
    assert!(neps < 1.0);
    let roundoff = neps / (1.0 - neps) * local_scale.max(model_scale);
    previous_budget.max(roundoff)
}

pub struct MemberResultant<const N: usize> {
    values: [f64; N],
    absolute: [f64; N],
    terms: usize,
}

impl<const N: usize> Default for MemberResultant<N> {
    fn default() -> Self {
        Self { values: [0.0; N], absolute: [0.0; N], terms: 0 }
    }
}

impl<const N: usize> MemberResultant<N> {
    pub fn add(&mut self, component: usize, value: f64) {
        self.add_terms(component, &[value]);
    }

    pub fn add_terms(&mut self, component: usize, values: &[f64]) {
        self.values[component] += values.iter().copied().reduce(|a, b| a + b).unwrap_or(0.0);
        for value in values {
            self.absolute[component] += value.abs();
            self.terms += 1;
        }
    }

    pub fn values(&self) -> [f64; N] {
        self.values
    }

    fn magnitude(&self, force_components: usize, length: f64) -> f64 {
        self.absolute.iter().enumerate().map(|(k, value)| {
            if k < force_components { *value } else { *value / length }
        }).fold(0.0, f64::max)
    }
}

struct Balance<const N: usize> {
    member: [f64; N],
    external: [f64; N],
    magnitude: f64,
    previous_member_scale: f64,
}

pub struct NodalEquilibrium<const N: usize> {
    nodes: BTreeMap<usize, Balance<N>>,
    force_components: usize,
    length: f64,
    model_scale: f64,
    terms: usize,
}

impl<const N: usize> NodalEquilibrium<N> {
    pub fn new(force_components: usize, length: f64) -> Self {
        assert!(force_components < N && length.is_finite() && length > 0.0);
        Self { nodes: BTreeMap::new(), force_components, length, model_scale: 0.0, terms: 0 }
    }

    fn add(&mut self, node: usize, values: [f64; N], member_scale: Option<f64>) {
        let balance = self.nodes.entry(node).or_insert_with(|| Balance {
            member: [0.0; N], external: [0.0; N], magnitude: 0.0, previous_member_scale: 0.0,
        });
        let sum = if let Some(scale) = member_scale {
            balance.previous_member_scale += scale;
            self.terms += 3 * N;
            &mut balance.member
        } else {
            self.terms += N;
            &mut balance.external
        };
        for (k, value) in values.into_iter().enumerate() {
            sum[k] += value;
            let magnitude = if k < self.force_components { value.abs() } else { value.abs() / self.length };
            balance.magnitude += magnitude;
            self.model_scale = self.model_scale.max(magnitude);
        }
    }

    pub fn add_member(&mut self, node: usize, values: [f64; N], previous_scale: f64) {
        self.add(node, values, Some(previous_scale));
    }

    pub fn add_external(&mut self, node: usize, values: [f64; N]) {
        self.add(node, values, None);
    }

    pub fn add_model_resultant<const M: usize>(&mut self, resultant: &MemberResultant<M>, force_components: usize, length: f64) {
        assert!(force_components <= M && length.is_finite() && length > 0.0);
        self.terms += resultant.terms;
        self.model_scale = self.model_scale.max(resultant.magnitude(force_components, length));
    }

    pub fn tolerance(&self, local_scale: f64, previous_budget: f64) -> f64 {
        equilibrium_tolerance(local_scale, self.model_scale, self.terms, previous_budget)
    }

    pub fn check(&self, previous_model_scale: f64) -> Result<(), String> {
        for (node, balance) in &self.nodes {
            let previous_scale = balance.external[..self.force_components].iter()
                .fold(balance.previous_member_scale, |sum, value| sum + value.abs());
            let tolerance = self.tolerance(balance.magnitude, 1e-7 * previous_scale + 1e-9 * previous_model_scale);
            for k in 0..N {
                let t = if k < self.force_components { tolerance } else { tolerance * self.length };
                let (member, external) = (balance.member[k], balance.external[k]);
                if !member.is_finite() || !external.is_finite() || !t.is_finite() || (member - external).abs() > t {
                    return Err(format!("node {node} comp {k}: Σ member end = {member:e}, load+reaction = {external:e} (tol {t:e})"));
                }
            }
        }
        Ok(())
    }
}
