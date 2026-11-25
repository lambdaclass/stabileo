//! Observational counters. Counts include work in increments subsequently rolled back;
//! they saturate at u64::MAX and never participate in a solver decision.
use serde::Serialize;

macro_rules! counters {
    ($name:ident { $($field:ident),* $(,)? }) => {
        #[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize)]
        #[serde(rename_all = "camelCase")]
        pub struct $name { $(pub $field: u64,)* }
        impl $name {
            pub(crate) fn add(&mut self, other: &Self) {
                $(self.$field = self.$field.saturating_add(other.$field);)*
            }
        }
    };
}

counters!(KrylovWork {
    attempts,
    iterations,
    tangent_products,
    preconditioner_solves,
    accepted_steps,
    forced_steps,
    no_factor,
    invalid_target,
    invalid_preconditioned_residual,
    invalid_curvature,
    nonfinite_residual,
    lost_preconditioner,
    iteration_limit,
});

/// Factorization requests count calls to the direct factor/solve routines, including a
/// second request after a failed cacheable factorization. Internal fallback algorithms
/// inside a diagnosed direct solve are not counted separately.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NonlinearWork {
    pub linearizations: u64,
    pub factorization_requests: u64,
    pub krylov: KrylovWork,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counters_saturate_instead_of_wrapping_or_affecting_a_solve() {
        let mut work = KrylovWork {
            iterations: u64::MAX,
            ..Default::default()
        };
        work.add(&KrylovWork {
            iterations: 1,
            no_factor: 2,
            ..Default::default()
        });
        assert_eq!(work.iterations, u64::MAX);
        assert_eq!(work.no_factor, 2);
    }
}
