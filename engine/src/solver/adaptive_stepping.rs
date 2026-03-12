/// Adaptive load stepping for nonlinear solvers.
///
/// Controls the load increment size based on convergence behavior:
/// - If convergence is easy (few iterations), increase step size
/// - If convergence is hard (many iterations), decrease step size
/// - If diverged, halve step and retry
///
/// Reference: Crisfield, "Non-linear Finite Element Analysis of Solids
///            and Structures" Vol. 1, Ch. 9
/// Adaptive load stepper that manages increment sizes.
pub struct AdaptiveStepper {
    /// Current load factor λ ∈ [0, 1]
    pub current_lambda: f64,
    /// Current step size Δλ
    pub delta_lambda: f64,
    /// Minimum allowed step size
    pub min_step: f64,
    /// Maximum allowed step size
    pub max_step: f64,
    /// Target number of N-R iterations per step
    pub target_iters: usize,
    /// Total number of completed steps
    pub n_steps: usize,
    /// Maximum load factor (typically 1.0)
    pub max_lambda: f64,
}

impl AdaptiveStepper {
    /// Create a new adaptive stepper.
    ///
    /// `initial_step`: starting Δλ (e.g. 0.1 for 10 load increments)
    /// `min_step`: minimum Δλ before aborting
    /// `max_step`: maximum Δλ cap
    /// `target_iters`: desired N-R iterations per step (e.g. 5)
    pub fn new(initial_step: f64, min_step: f64, max_step: f64, target_iters: usize) -> Self {
        AdaptiveStepper {
            current_lambda: 0.0,
            delta_lambda: initial_step,
            min_step,
            max_step,
            target_iters: target_iters.max(1),
            n_steps: 0,
            max_lambda: 1.0,
        }
    }

    /// Create from a fixed number of increments (backward compatible).
    pub fn from_n_increments(n_increments: usize) -> Self {
        let step = 1.0 / n_increments.max(1) as f64;
        Self::new(step, step * 0.01, step * 4.0, 5)
    }

    /// Get the next target load factor. Returns None if max_lambda is reached.
    pub fn next_increment(&self) -> Option<f64> {
        if self.current_lambda >= self.max_lambda - 1e-12 {
            return None;
        }

        let target = (self.current_lambda + self.delta_lambda).min(self.max_lambda);
        Some(target)
    }

    /// Report convergence result and adjust step size.
    ///
    /// `converged`: did the N-R loop converge?
    /// `n_iters`: number of N-R iterations used
    ///
    /// Returns `StepAction`:
    /// - `Accept`: step accepted, proceed to next
    /// - `Retry(new_lambda)`: step failed, retry with smaller step
    /// - `Abort`: step too small, analysis failed
    pub fn report_convergence(&mut self, converged: bool, n_iters: usize) -> StepAction {
        if converged {
            // Accept the step
            self.current_lambda = (self.current_lambda + self.delta_lambda).min(self.max_lambda);
            self.n_steps += 1;

            // Adjust step size based on iteration count
            if n_iters <= self.target_iters / 2 {
                // Easy convergence: double step
                self.delta_lambda = (self.delta_lambda * 2.0).min(self.max_step);
            } else if n_iters > self.target_iters * 2 {
                // Hard convergence: halve step
                self.delta_lambda = (self.delta_lambda * 0.5).max(self.min_step);
            }
            // Otherwise: keep current step size

            StepAction::Accept
        } else {
            // Diverged: halve step and retry
            self.delta_lambda *= 0.5;

            if self.delta_lambda < self.min_step {
                StepAction::Abort
            } else {
                let retry_lambda = (self.current_lambda + self.delta_lambda).min(self.max_lambda);
                StepAction::Retry(retry_lambda)
            }
        }
    }

    /// Check if the full load has been applied.
    pub fn is_complete(&self) -> bool {
        self.current_lambda >= self.max_lambda - 1e-12
    }
}

/// Action to take after a load step.
#[derive(Debug, Clone, PartialEq)]
pub enum StepAction {
    /// Step accepted, move to next increment
    Accept,
    /// Step failed, retry with given load factor
    Retry(f64),
    /// Cannot converge even with minimum step — abort
    Abort,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_n_increments() {
        let stepper = AdaptiveStepper::from_n_increments(10);
        assert!((stepper.delta_lambda - 0.1).abs() < 1e-10);
        assert!((stepper.current_lambda).abs() < 1e-10);
    }

    #[test]
    fn test_basic_stepping() {
        let mut stepper = AdaptiveStepper::from_n_increments(4);
        assert!(!stepper.is_complete());

        // Step 1: λ = 0.25
        let target = stepper.next_increment().unwrap();
        assert!((target - 0.25).abs() < 1e-10);
        let action = stepper.report_convergence(true, 5);
        assert_eq!(action, StepAction::Accept);
        assert!((stepper.current_lambda - 0.25).abs() < 1e-10);
    }

    #[test]
    fn test_step_doubling_on_easy_convergence() {
        let mut stepper = AdaptiveStepper::from_n_increments(10);
        let original_step = stepper.delta_lambda;

        // Easy convergence (1 iter, target is 5)
        let _ = stepper.next_increment();
        stepper.report_convergence(true, 1);

        // Step should have doubled
        assert!((stepper.delta_lambda - original_step * 2.0).abs() < 1e-10);
    }

    #[test]
    fn test_step_halving_on_divergence() {
        let mut stepper = AdaptiveStepper::from_n_increments(10);
        let original_step = stepper.delta_lambda;

        let _ = stepper.next_increment();
        let action = stepper.report_convergence(false, 50);

        // Should retry with half step
        match action {
            StepAction::Retry(lambda) => {
                assert!((lambda - original_step * 0.5).abs() < 1e-10);
            }
            _ => panic!("Expected Retry"),
        }
    }

    #[test]
    fn test_complete_after_full_load() {
        let mut stepper = AdaptiveStepper::from_n_increments(2);

        let _ = stepper.next_increment();
        stepper.report_convergence(true, 3);
        let _ = stepper.next_increment();
        stepper.report_convergence(true, 3);

        assert!(stepper.is_complete());
        assert!(stepper.next_increment().is_none());
    }
}
